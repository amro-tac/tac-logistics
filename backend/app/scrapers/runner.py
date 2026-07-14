"""
Dispatch a scrape to the right carrier module based on B/L prefix or carrier name.
"""
import logging
from .base import ScrapeResult

log = logging.getLogger(__name__)

# B/L prefix → carrier key
_PREFIX_MAP: dict[str, str] = {
    "ZIMU": "zim",  "ZIML": "zim",
    "MAEU": "maersk", "MSKU": "maersk", "MRKU": "maersk", "MAEI": "maersk",
    "MSCU": "msc",  "MEDU": "msc",  "MSMU": "msc",
    "HLCU": "hapag", "HLBU": "hapag",
    "CMAU": "cma",  "CGMU": "cma",  "APLU": "cma",
    "ONEY": "one",  "ONEU": "one",
    "COSU": "cosco", "CXDU": "cosco",
    "OOLU": "oocl",
    "EASU": "evergreen", "EMCU": "evergreen",
    "HDMU": "hmm",
    "YMLU": "yangming",
    "PILR": "pil",
}

# Carrier name → carrier key (for when we know the carrier name from DB)
_NAME_MAP: dict[str, str] = {
    "zim": "zim",
    "maersk": "maersk",
    "msc": "msc",
    "hapag": "hapag",
    "hapag-lloyd": "hapag",
    "cma": "cma",
    "cma cgm": "cma",
    "one": "one",
    "cosco": "cosco",
    "oocl": "oocl",
    "evergreen": "evergreen",
    "hmm": "hmm",
    "yang ming": "yangming",
    "pil": "pil",
}


def detect_carrier_key(bl_number: str, carrier_name: str = "") -> str:
    """Determine which scraper to use from B/L prefix or carrier name."""
    prefix = bl_number[:4].upper()
    if prefix in _PREFIX_MAP:
        return _PREFIX_MAP[prefix]
    if carrier_name:
        for k, v in _NAME_MAP.items():
            if k in carrier_name.lower():
                return v
    return "unknown"


async def run_scrape(bl_number: str, carrier_name: str = "") -> ScrapeResult:
    """
    Detect carrier and run the appropriate scraper.
    Returns ScrapeResult — check .success and .error.
    """
    key = detect_carrier_key(bl_number, carrier_name)
    log.info("Scraping %s for B/L %s (carrier key: %s)", carrier_name or "unknown", bl_number, key)

    if key == "zim":
        from . import zim
        return await zim.scrape(bl_number)

    elif key == "hapag":
        from . import hapag
        return await hapag.scrape(bl_number)

    elif key == "maersk":
        from . import maersk
        return await maersk.scrape(bl_number)

    elif key == "msc":
        from . import msc
        return await msc.scrape(bl_number)

    else:
        # For unsupported carriers, try ZIM-style scraper as a generic attempt
        # (most carriers have similar form-based tracking pages)
        result = ScrapeResult(carrier=carrier_name or key, bl_number=bl_number)
        result.error = (
            f"No dedicated scraper for carrier '{carrier_name or key}'. "
            "Supported: ZIM, Maersk, MSC, Hapag-Lloyd. "
            "The B/L prefix didn't match a known carrier."
        )
        return result
