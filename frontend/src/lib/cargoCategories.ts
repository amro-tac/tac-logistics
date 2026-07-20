// Cargo categories shared by the shipments filter, carrier preferences, and
// the booking form's carrier suggestion. Keep keywords lowercase.

export interface CargoCategoryDef {
  id: string;
  icon: string;
  keywords: string[];
}

export const CARGO_CATEGORY_DEFS: CargoCategoryDef[] = [
  { id: "frozen_fish",   icon: "🐟", keywords: ["fish", "frozen fish", "seafood", "salmon", "tuna", "tilapia", "shrimp", "prawn", "cod", "okf", "pelagic"] },
  { id: "meat",          icon: "🥩", keywords: ["meat", "beef", "chicken", "poultry", "lamb", "veal", "mutton", "turkey", "pork", "offal"] },
  { id: "furniture",     icon: "🪑", keywords: ["furniture", "sofa", "chair", "table", "bed", "wardrobe", "mattress", "desk", "cabinet", "shelf"] },
  { id: "home_products", icon: "🏠", keywords: ["home", "household", "appliance", "electronics", "kitchen", "consumer", "device", "utensil"] },
  { id: "textiles",      icon: "👕", keywords: ["textile", "fabric", "clothing", "garment", "apparel", "cotton", "wool", "fashion", "wear"] },
  { id: "produce",       icon: "🥦", keywords: ["produce", "vegetable", "fruit", "fresh", "organic", "agricultural"] },
];

/** Match a free-text commodity description to a category id, or null. */
export function matchCategory(commodity: string): string | null {
  const c = commodity.trim().toLowerCase();
  if (!c) return null;
  for (const def of CARGO_CATEGORY_DEFS) {
    if (def.keywords.some(kw => c.includes(kw))) return def.id;
  }
  return null;
}

export const CATEGORY_LABEL: Record<string, string> = {
  frozen_fish: "Frozen fish & seafood",
  meat: "Meat & poultry",
  furniture: "Furniture",
  home_products: "Home products",
  textiles: "Textiles & clothing",
  produce: "Fresh produce",
  other: "Everything else",
};
