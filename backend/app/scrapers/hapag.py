"""
Hapag-Lloyd scraper.
Hapag supports a query-param URL that pre-fills the search, making scraping easier.
URL: https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?query={BL}
"""
import logging
from .base import (
    ScrapeResult, extract_eta, extract_vessel_name,
    extract_status, BROWSER_ARGS, USER_AGENT,
)

log = logging.getLogger(__name__)

TRACKING_URL = "https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html"

_INPUT_SELS = [
    'input[placeholder*="booking"]',
    'input[placeholder*="B/L"]',
    'input[placeholder*="container"]',
    'input[type="search"]',
    '.search-field input',
    'input[type="text"]:visible',
]
_SUBMIT_SELS = [
    'button[type="submit"]',
    'button:has-text("Track")',
    'button:has-text("Search")',
    '.btn-search',
]


async def scrape(bl_number: str) -> ScrapeResult:
    result = ScrapeResult(carrier="Hapag-Lloyd", bl_number=bl_number)
    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=BROWSER_ARGS)
            ctx = await browser.new_context(
                user_agent=USER_AGENT,
                viewport={"width": 1280, "height": 800},
                locale="en-US",
            )

            api_data: list[dict] = []

            async def _on_response(resp):
                url = resp.url
                if resp.status == 200 and any(k in url for k in ["track", "booking", "shipment"]):
                    try:
                        j = await resp.json()
                        payload = str(j)
                        if "eta" in payload.lower() or "vessel" in payload.lower():
                            api_data.append(j)
                    except Exception:
                        pass

            page = await ctx.new_page()
            page.on("response", _on_response)

            try:
                # Hapag supports ?query= parameter — page auto-searches
                url_with_query = f"{TRACKING_URL}?query={bl_number}"
                await page.goto(url_with_query, timeout=30000, wait_until="domcontentloaded")

                # Give the page time to auto-search
                await page.wait_for_timeout(5000)

                # If no auto-search, try to fill the input manually
                text = await page.inner_text("body")
                if bl_number.lower() not in text.lower() and "eta" not in text.lower():
                    for sel in _INPUT_SELS:
                        try:
                            loc = page.locator(sel).first
                            await loc.wait_for(state="visible", timeout=3000)
                            await loc.fill(bl_number)
                            for sub_sel in _SUBMIT_SELS:
                                try:
                                    await page.locator(sub_sel).first.click(timeout=2000)
                                    break
                                except Exception:
                                    continue
                            await page.wait_for_timeout(8000)
                            break
                        except Exception:
                            continue
                    text = await page.inner_text("body")

                # ── Try intercepted API JSON ──────────────────────────────────
                if api_data:
                    _parse_api_json(result, api_data[-1])

                # ── Fall back to page text ────────────────────────────────────
                if not result.success:
                    result.eta = result.eta or extract_eta(text)
                    result.vessel_name = result.vessel_name or extract_vessel_name(text)
                    result.mapped_status = result.mapped_status or extract_status(text)

                    if not result.success:
                        if "not found" in text.lower() or "no result" in text.lower():
                            result.error = f"Hapag-Lloyd: no tracking data for {bl_number}"
                        elif len(text) < 500:
                            result.error = "Hapag-Lloyd: page didn't load properly (possible bot block)"

            finally:
                await browser.close()

    except ImportError:
        result.error = (
            "playwright not installed. Run:\n"
            "  pip install playwright\n"
            "  playwright install chromium"
        )
    except Exception as exc:
        result.error = f"Hapag-Lloyd scraper error: {exc}"
        log.warning("Hapag scrape failed for %s: %s", bl_number, exc)

    return result


def _parse_api_json(result: ScrapeResult, data: dict) -> None:
    import json
    from .base import parse_date
    text = json.dumps(data)
    result.eta = result.eta or extract_eta(text)
    result.vessel_name = result.vessel_name or extract_vessel_name(text)

    # Hapag API common field names
    for key in ("vesselName", "vessel", "oceanVesselName"):
        val = _deep_get(data, key)
        if val:
            result.vessel_name = str(val).strip().upper()
            break
    for key in ("estimatedTimeOfArrival", "eta", "arrivalDate", "estimatedArrival"):
        val = _deep_get(data, key)
        if val:
            d = parse_date(str(val)[:10])
            if d:
                result.eta = d
            break
    for key in ("transportStatus", "status", "shipmentStatus"):
        val = _deep_get(data, key)
        if val:
            result.raw_status = str(val)
            result.mapped_status = result.mapped_status or extract_status(result.raw_status)
            break


def _deep_get(d: dict, key: str):
    """Recursively search for a key in a nested dict."""
    if isinstance(d, dict):
        if key in d:
            return d[key]
        for v in d.values():
            found = _deep_get(v, key)
            if found is not None:
                return found
    elif isinstance(d, list):
        for item in d:
            found = _deep_get(item, key)
            if found is not None:
                return found
    return None
