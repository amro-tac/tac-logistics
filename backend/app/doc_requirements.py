"""
Which documents a shipment needs, from its cargo + clearance path.

Shared by the document checklist endpoint and the alert computation.
Requirement rules (destination is always Haifa → PA/Israel):
  - Bill of Lading, Commercial Invoice + Packing List, Certificate of Origin
    are required for every shipment.
  - PA Import Permit is required on the direct-PA clearance path.
  - Vet/Halal Certificate is required for meat & fish.
  - Lab Results are required for food (meat/fish/produce) on direct-PA.
"""

# All categories that can be *required* (the freeform "other" never is).
DOC_CATEGORIES = ["bl", "invoice_packing", "cert_origin", "vet_halal", "lab_results", "pa_permit"]

# Minimal cargo keyword → category matcher (mirrors frontend lib/cargoCategories.ts).
_CATEGORY_KEYWORDS = {
    "frozen_fish": ["fish", "seafood", "salmon", "tuna", "tilapia", "shrimp", "prawn", "cod", "pelagic", "okf"],
    "meat": ["meat", "beef", "chicken", "poultry", "lamb", "veal", "mutton", "turkey", "offal", "pork"],
    "produce": ["produce", "vegetable", "fruit", "fresh", "organic", "agricultural"],
}


def categories_for(commodities: list[str | None]) -> set[str]:
    cats: set[str] = set()
    for c in commodities:
        cl = (c or "").lower()
        for cat, kws in _CATEGORY_KEYWORDS.items():
            if any(kw in cl for kw in kws):
                cats.add(cat)
    return cats


def required_categories(clearance_path: str, commodity_categories: set[str]) -> list[str]:
    req = ["bl", "invoice_packing", "cert_origin"]
    if clearance_path == "direct_pa":
        req.append("pa_permit")
    if commodity_categories & {"frozen_fish", "meat"}:
        req.append("vet_halal")
    if commodity_categories & {"frozen_fish", "meat", "produce"} and clearance_path == "direct_pa":
        req.append("lab_results")
    # Keep canonical order
    return [c for c in DOC_CATEGORIES if c in req]
