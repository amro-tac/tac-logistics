"""
Maersk scraper.
Maersk has Cloudflare protection but their tracking URL is clean:
  https://www.maersk.com/tracking/{BL}
We try with a realistic browser profile and hope Cloudflare lets us through.
If blocked, the result.error will say so clearly.
"""
import logging
from .base import (
    ScrapeResult, extract_eta, extract_vessel_name,
    extract_status, BROWSER_ARGS, USER_AGENT,
)

log = logging.getLogger(__name__)


async def scrape(bl_number: str) -> ScrapeResult:
    result = ScrapeResult(carrier="Maersk", bl_number=bl_number)
    try:
        from playwright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=BROWSER_ARGS)
            ctx = await browser.new_context(
                user_agent=USER_AGENT,
                viewport={"width": 1280, "height": 800},
                locale="en-US",
                extra_http_headers={
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
            )

            api_data: list[dict] = []

            async def _on_response(resp):
                url = resp.url
                if resp.status == 200 and "maersk" in url and any(
                    k in url for k in ["track", "shipment", "cargo"]
                ):
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
                url = f"https://www.maersk.com/tracking/{bl_number}"
                await page.goto(url, timeout=30000, wait_until="domcontentloaded")
                await page.wait_for_timeout(10000)

                text = await page.inner_text("body")

                # Detect Cloudflare block
                if any(phrase in text.lower() for phrase in [
                    "checking your browser", "cf-browser-verification",
                    "just a moment", "enable javascript and cookies",
                ]):
                    result.error = (
                        "Maersk: blocked by Cloudflare bot protection. "
                        "Try again later or use ZIM/Hapag for scraping."
                    )
                    return result

                # Try intercepted API data
                if api_data:
                    _parse_maersk_json(result, api_data[-1])

                # Fallback to text
                if not result.success:
                    result.eta = result.eta or extract_eta(text)
                    result.vessel_name = result.vessel_name or extract_vessel_name(text)
                    result.mapped_status = result.mapped_status or extract_status(text)

                if not result.success:
                    result.error = f"Maersk: could not extract tracking data for {bl_number}"

            finally:
                await browser.close()

    except ImportError:
        result.error = (
            "playwright not installed. Run:\n"
            "  pip install playwright\n"
            "  playwright install chromium"
        )
    except Exception as exc:
        result.error = f"Maersk scraper error: {exc}"
        log.warning("Maersk scrape failed for %s: %s", bl_number, exc)

    return result


def _parse_maersk_json(result: ScrapeResult, data: dict) -> None:
    from .base import parse_date
    import json

    def _deep_get(d, key):
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

    text = json.dumps(data)
    result.eta = result.eta or extract_eta(text)
    result.vessel_name = result.vessel_name or extract_vessel_name(text)

    for key in ("vesselName", "vessel", "transportName"):
        val = _deep_get(data, key)
        if val:
            result.vessel_name = str(val).strip().upper()
            break
    for key in ("estimatedTimeOfArrival", "eta", "arrival"):
        val = _deep_get(data, key)
        if val:
            d = parse_date(str(val)[:10])
            if d:
                result.eta = d
            break
    for key in ("shipmentStatus", "status", "transportStatus"):
        val = _deep_get(data, key)
        if val:
            result.raw_status = str(val)
            result.mapped_status = result.mapped_status or extract_status(result.raw_status)
            break
