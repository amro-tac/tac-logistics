"""
ZIM scraper — navigates zim.com/tools/track-a-shipment and extracts tracking data.
ZIM is relatively scraper-friendly (no heavy bot protection).
"""
import logging
from .base import (
    ScrapeResult, extract_eta, extract_vessel_name,
    extract_status, BROWSER_ARGS, USER_AGENT,
)

log = logging.getLogger(__name__)

TRACKING_URL = "https://www.zim.com/tools/track-a-shipment"

# Selectors in priority order (site may change, so we try each in sequence)
_INPUT_SELS = [
    'input[data-cy="tracking-search-input"]',
    'input[placeholder*="B/L"]',
    'input[placeholder*="tracking"]',
    'input[placeholder*="number"]',
    '.tracking-form input[type="text"]',
    'input[type="search"]',
    'form input[type="text"]:visible',
]
_SUBMIT_SELS = [
    'button[data-cy="tracking-search-btn"]',
    'button[type="submit"]',
    'button:has-text("Track")',
    'button:has-text("Search")',
    '.search-btn',
    'form button:visible',
]


async def scrape(bl_number: str) -> ScrapeResult:
    result = ScrapeResult(carrier="ZIM", bl_number=bl_number)
    try:
        from playwright.async_api import async_playwright, TimeoutError as PWTimeout

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=BROWSER_ARGS)
            ctx = await browser.new_context(
                user_agent=USER_AGENT,
                viewport={"width": 1280, "height": 800},
                locale="en-US",
            )
            # Intercept API responses that carry tracking JSON
            api_data: list[dict] = []

            async def _on_response(resp):
                url = resp.url
                if "track" in url.lower() and resp.status == 200:
                    try:
                        j = await resp.json()
                        if isinstance(j, dict) and ("eta" in str(j).lower() or "vessel" in str(j).lower()):
                            api_data.append(j)
                    except Exception:
                        pass

            page = await ctx.new_page()
            page.on("response", _on_response)

            try:
                await page.goto(TRACKING_URL, timeout=25000, wait_until="domcontentloaded")

                # Fill search input
                filled = False
                for sel in _INPUT_SELS:
                    try:
                        loc = page.locator(sel).first
                        await loc.wait_for(state="visible", timeout=3000)
                        await loc.fill(bl_number)
                        filled = True
                        break
                    except Exception:
                        continue

                if not filled:
                    result.error = "Could not find ZIM search input — site may have changed"
                    return result

                # Submit
                for sel in _SUBMIT_SELS:
                    try:
                        await page.locator(sel).first.click(timeout=3000)
                        break
                    except Exception:
                        continue

                # Wait for results to render
                await page.wait_for_timeout(9000)

                # ── Try intercepted API JSON first ────────────────────────────
                if api_data:
                    _parse_api_json(result, api_data[-1])

                # ── Fall back to page text extraction ─────────────────────────
                if not result.success:
                    text = await page.inner_text("body")
                    result.eta = result.eta or extract_eta(text)
                    result.vessel_name = result.vessel_name or extract_vessel_name(text)
                    result.mapped_status = result.mapped_status or extract_status(text)
                    if "not found" in text.lower() or "no result" in text.lower():
                        result.error = f"ZIM: no tracking data found for {bl_number}"

            finally:
                await browser.close()

    except ImportError:
        result.error = (
            "playwright not installed. Run:\n"
            "  pip install playwright\n"
            "  playwright install chromium"
        )
    except Exception as exc:
        result.error = f"ZIM scraper error: {exc}"
        log.warning("ZIM scrape failed for %s: %s", bl_number, exc)

    return result


def _parse_api_json(result: ScrapeResult, data: dict) -> None:
    """Best-effort extraction from ZIM's internal API JSON shape."""
    import json
    text = json.dumps(data)
    result.eta = result.eta or extract_eta(text)
    result.vessel_name = result.vessel_name or extract_vessel_name(text)
    result.mapped_status = result.mapped_status or extract_status(text)

    # Try common field names
    for key in ("vesselName", "vessel_name", "vessel"):
        if data.get(key):
            result.vessel_name = str(data[key]).strip()
            break
    for key in ("eta", "estimatedArrival", "estimated_arrival", "arrivalDate"):
        if data.get(key):
            from .base import parse_date
            d = parse_date(str(data[key])[:10])
            if d:
                result.eta = d
            break
    for key in ("status", "shipmentStatus", "trackingStatus"):
        if data.get(key):
            result.raw_status = str(data[key])
            result.mapped_status = result.mapped_status or extract_status(result.raw_status)
            break
