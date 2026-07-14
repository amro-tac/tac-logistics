"""
MSC scraper — msc.com is heavily protected, but we try.
URL: https://www.msc.com/en/search-a-schedule/track-a-shipment?trackingNumber={BL}
"""
import logging
from .base import (
    ScrapeResult, extract_eta, extract_vessel_name,
    extract_status, BROWSER_ARGS, USER_AGENT,
)

log = logging.getLogger(__name__)


async def scrape(bl_number: str) -> ScrapeResult:
    result = ScrapeResult(carrier="MSC", bl_number=bl_number)
    try:
        from playwright.async_api import async_playwright

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
                if resp.status == 200 and any(
                    k in url for k in ["track", "shipment", "cargo", "container"]
                ):
                    try:
                        j = await resp.json()
                        payload = str(j)
                        if len(payload) > 100 and (
                            "eta" in payload.lower() or "vessel" in payload.lower()
                        ):
                            api_data.append(j)
                    except Exception:
                        pass

            page = await ctx.new_page()
            page.on("response", _on_response)

            try:
                url = f"https://www.msc.com/en/search-a-schedule/track-a-shipment?trackingNumber={bl_number}"
                await page.goto(url, timeout=30000, wait_until="domcontentloaded")
                await page.wait_for_timeout(10000)

                text = await page.inner_text("body")

                if any(phrase in text.lower() for phrase in [
                    "checking your browser", "just a moment",
                    "enable javascript and cookies", "access denied",
                ]):
                    result.error = (
                        "MSC: blocked by bot protection. "
                        "MSC is difficult to scrape — use ZIM or Hapag-Lloyd."
                    )
                    return result

                if api_data:
                    _parse_json(result, api_data[-1])

                if not result.success:
                    result.eta = result.eta or extract_eta(text)
                    result.vessel_name = result.vessel_name or extract_vessel_name(text)
                    result.mapped_status = result.mapped_status or extract_status(text)

                if not result.success:
                    result.error = f"MSC: could not extract tracking data for {bl_number}"

            finally:
                await browser.close()

    except ImportError:
        result.error = (
            "playwright not installed. Run:\n"
            "  pip install playwright\n"
            "  playwright install chromium"
        )
    except Exception as exc:
        result.error = f"MSC scraper error: {exc}"
        log.warning("MSC scrape failed for %s: %s", bl_number, exc)

    return result


def _parse_json(result: ScrapeResult, data: dict) -> None:
    import json
    from .base import parse_date

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

    for key in ("vesselName", "vessel", "motherVessel"):
        val = _deep_get(data, key)
        if val:
            result.vessel_name = str(val).strip().upper()
            break
    for key in ("estimatedTimeOfArrival", "eta", "arrivalDate"):
        val = _deep_get(data, key)
        if val:
            d = parse_date(str(val)[:10])
            if d:
                result.eta = d
            break
    for key in ("status", "shipmentStatus", "trackingStatus"):
        val = _deep_get(data, key)
        if val:
            result.raw_status = str(val)
            result.mapped_status = result.mapped_status or extract_status(result.raw_status)
            break
