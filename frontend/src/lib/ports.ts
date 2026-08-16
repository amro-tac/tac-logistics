export type LatLng = [number, number];

// ── Port coordinate database ─────────────────────────────────────────────────

const PORTS: Record<string, LatLng> = {
  // Australia / Oceania (from the Amigo fork — a Brisbane B/L was rendering at Haifa)
  "brisbane":     [-27.380, 153.170],
  "sydney":       [-33.970, 151.200],
  "melbourne":    [-37.830, 144.920],
  "adelaide":     [-34.780, 138.480],
  "fremantle":    [-32.050, 115.740],
  "auckland":     [-36.840, 174.780],
  "qinzhou":      [ 21.650, 108.617],

  // Middle East / Eastern Mediterranean
  "haifa":        [32.819,  35.000],
  "ashdod":       [31.817,  34.650],
  "beirut":       [33.900,  35.483],
  "port said":    [31.257,  32.566],
  "alexandria":   [31.200,  29.919],
  "suez":         [29.967,  32.550],
  "aqaba":        [29.517,  35.000],
  "jeddah":       [21.486,  39.193],
  "dammam":       [26.433,  50.100],
  "dubai":        [25.270,  55.310],
  "istanbul":     [41.017,  28.960],
  "izmir":        [38.417,  27.133],
  "piraeus":      [37.950,  23.633],
  "limassol":     [34.668,  33.050],

  // Europe
  "algeciras":    [36.141, -5.452],
  "valencia":     [39.456, -0.328],
  "barcelona":    [41.383,  2.183],
  "genoa":        [44.406,  8.946],
  "la spezia":    [44.103,  9.821],
  "naples":       [40.840,  14.265],
  "gioia tauro":  [38.432,  15.892],
  "marseille":    [43.297,  5.381],
  "antwerp":      [51.230,  4.415],
  "rotterdam":    [51.923,  4.481],
  "hamburg":      [53.500, 10.000],
  "felixstowe":   [51.961,  1.351],
  "le havre":     [49.489,  0.100],

  // South / North Americas (Atlantic)
  "santos":          [-23.961, -46.333],
  "rio de janeiro":  [-22.907, -43.173],
  "salvador":        [-12.978, -38.512],
  "fortaleza":       [ -3.701, -38.490],
  "buenaventura":    [  3.883, -77.067],
  "cartagena":       [ 10.391, -75.479],
  "new york":        [ 40.684, -74.045],
  "savannah":        [ 32.150, -81.150],
  "miami":           [ 25.762, -80.192],
  "houston":         [ 29.730, -95.283],

  // Americas (Pacific)
  "manzanillo":   [ 19.050,-104.317],
  "los angeles":  [ 33.727,-118.270],
  "long beach":   [ 33.750,-118.194],
  "seattle":      [ 47.562,-122.348],
  "callao":       [-12.067, -77.150],
  "valparaiso":   [-33.017, -71.633],

  // Asia
  "shanghai":         [31.230, 121.474],
  "shenzhen":         [22.543, 114.058],
  "guangzhou":        [23.129, 113.264],
  "hong kong":        [22.319, 114.169],
  "singapore":        [ 1.352, 103.820],
  "tanjung pelepas":  [ 1.367, 103.550],
  "busan":            [35.103, 129.040],
  "tokyo":            [35.676, 139.650],
  "yokohama":         [35.444, 139.638],
  "port klang":       [ 3.000, 101.383],
  "taipei":           [25.033, 121.565],
  "kaohsiung":        [22.627, 120.301],
  "colombo":          [ 6.917,  79.833],
  "nhava sheva":      [18.950,  72.950],
  "mundra":           [22.767,  69.717],

  // Africa
  "durban":         [-29.858,  31.029],
  "cape town":      [-33.925,  18.424],
  "mombasa":        [ -4.044,  39.668],
  "dar es salaam":  [ -6.792,  39.208],
  "casablanca":     [ 33.573,  -7.590],
  "tanger med":     [ 35.883,  -5.500],
};

export function lookupPort(name: string | null | undefined): LatLng | null {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  if (PORTS[key]) return PORTS[key];
  for (const [k, v] of Object.entries(PORTS)) {
    const city = key.split(",")[0].trim();
    if (key.includes(k) || k === city || k.startsWith(city)) return v;
  }
  return null;
}

// ── Maritime passage waypoints ───────────────────────────────────────────────

const P = {
  // ── Brazil coastal hugging (avoids overland cuts) ─────────────────────────
  // Ships leaving Santos head SE into open Atlantic before turning north
  brazilSE:        [-25.0, -42.0] as LatLng,   // open Atlantic S of Santos
  brazilNE:        [ -6.0, -33.0] as LatLng,   // off NE Brazil coast, clear of land
  capeSaoRoque:    [ -5.5, -35.2] as LatLng,   // NE tip of Brazil
  eqAtlantic:      [  3.0, -25.0] as LatLng,   // equatorial Atlantic
  nAtlantic:       [ 24.0, -22.0] as LatLng,   // central N Atlantic

  // ── Atlantic → Gibraltar approach (avoids Morocco/W Sahara coast) ─────────
  canaries:        [ 28.0, -16.0] as LatLng,   // Canary Islands area
  wMorocco:        [ 34.0, -14.0] as LatLng,   // open Atlantic W of Morocco
  gibraltar:       [ 36.0,  -5.3] as LatLng,   // Strait of Gibraltar

  // ── Western / Central Mediterranean ──────────────────────────────────────
  wMedCenter:      [ 38.0,   4.5] as LatLng,   // central W Med (S of Majorca)
  straitSicily:    [ 36.8,  11.5] as LatLng,   // Strait of Sicily (south of Sicily)
  sicilyS:         [ 36.4,  15.2] as LatLng,   // south of Sicily's eastern tip
  ionianSea:       [ 35.5,  19.0] as LatLng,   // Ionian Sea (south of Greece)
  creteS:          [ 34.0,  25.5] as LatLng,   // south of Crete
  eMed:            [ 33.5,  31.5] as LatLng,   // eastern Med

  // ── Bosphorus / Dardanelles / Aegean ─────────────────────────────────────
  bosphorus:       [ 40.8,  28.8] as LatLng,   // Bosphorus southern exit (Marmara)
  dardanelles:     [ 40.0,  26.2] as LatLng,   // Dardanelles exit into Aegean
  aegean:          [ 37.8,  25.5] as LatLng,   // central Aegean
  rhodesS:         [ 35.5,  28.5] as LatLng,   // south of Rhodes

  // ── Suez Canal ────────────────────────────────────────────────────────────
  portSaid:        [ 31.3,  32.4] as LatLng,   // N entrance (Mediterranean side)
  suezCity:        [ 29.9,  32.6] as LatLng,   // S entrance (Red Sea side)

  // ── Red Sea / Gulf of Aden ────────────────────────────────────────────────
  babElMandeb:     [ 11.6,  43.4] as LatLng,   // Red Sea southern narrows
  gulfAden:        [ 12.5,  50.2] as LatLng,

  // ── Indian Ocean ──────────────────────────────────────────────────────────
  wIndianOcean:    [  5.0,  61.0] as LatLng,
  nIndianOcean:    [  7.0,  72.0] as LatLng,

  // ── SE Asia ───────────────────────────────────────────────────────────────
  malacca:         [  1.0, 103.8] as LatLng,   // Strait of Malacca
  schinaSeaS:      [  5.0, 108.0] as LatLng,
  schinaSeaN:      [ 16.0, 115.0] as LatLng,

  // ── S Africa bypass ───────────────────────────────────────────────────────
  capeGoodHope:    [-34.5,  19.5] as LatLng,
  sAtlanticMid:    [-10.0, -15.0] as LatLng,

  // ── N America ─────────────────────────────────────────────────────────────
  floridaStr:      [ 25.0, -79.5] as LatLng,
  bermuda:         [ 32.3, -64.8] as LatLng,
};

// ── Region classification ─────────────────────────────────────────────────────

type Region =
  | "s_america_atlantic" | "n_america_atlantic"
  | "s_america_pacific"  | "n_america_pacific"
  | "w_atlantic"
  | "nw_africa" | "w_africa"
  | "w_europe"
  | "w_med" | "c_med" | "e_med"
  | "black_sea_turkey"
  | "red_sea" | "persian_gulf" | "arabian_sea"
  | "e_africa" | "s_africa"
  | "indian_ocean"
  | "s_asia"
  | "se_asia" | "e_asia";

function region([lat, lng]: LatLng): Region {
  // Americas
  if (lng < -70 && lat > 5)   return "n_america_pacific";
  if (lng < -70 && lat <= 5)  return "s_america_pacific";
  if (lng < -30 && lat > 10)  return "n_america_atlantic";
  if (lng < -30)              return "s_america_atlantic";
  // Atlantic / European coast
  if (lng < -6  && lat > 35)  return "w_europe";
  if (lng < -5  && lat > 20)  return "nw_africa";
  if (lng < 5   && lat <= 20) return "w_atlantic";
  // Mediterranean
  if (lng < 10  && lat > 30)  return "w_med";
  if (lng < 22  && lat > 30)  return "c_med";
  if (lat > 40  && lng > 22 && lng < 45) return "black_sea_turkey";
  if (lng < 37  && lat > 28)  return "e_med";
  // Red Sea / Gulf (narrow band: 32–60°E, 10–30°N)
  if (lng >= 32 && lng < 60 && lat > 10 && lat < 30) return "red_sea";
  if (lng >= 60 && lng < 78 && lat > 20)              return "persian_gulf";
  // Africa
  if (lng < 55  && lat < 10 && lat > -20)  return "e_africa";
  if (lat < -20 && lng > 15 && lng < 55)   return "s_africa";
  // Asia (ordered large→small longitude so e_asia doesn't get swallowed)
  if (lng >= 110) return "e_asia";
  if (lng >= 95)  return "se_asia";
  if (lng >= 78)  return "s_asia";
  return "indian_ocean";
}

/**
 * Return a sequence of LatLng waypoints forming a realistic sea route.
 * The route threads through real maritime passages (Gibraltar, Suez, Malacca, etc.)
 * so it never cuts across land.
 */
export function getSeaRoute(from: LatLng, to: LatLng): LatLng[] {
  const fromR = region(from);
  const toR   = region(to);

  // Build a list of intermediate waypoints
  const mid: LatLng[] = [];

  const needsGibraltar =
    (["s_america_atlantic","n_america_atlantic","w_europe","nw_africa","w_atlantic"].includes(fromR) &&
     ["w_med","c_med","e_med","red_sea","persian_gulf"].includes(toR)) ||
    (["w_med","c_med","e_med"].includes(toR) && fromR === "w_europe");

  const needsWMedToEMed =
    ["w_med","c_med"].includes(fromR) &&
    ["e_med","red_sea"].includes(toR);

  const fromMed = ["w_med","c_med","e_med"].includes(fromR);
  const toMed   = ["w_med","c_med","e_med"].includes(toR);
  const fromAsia = ["se_asia","e_asia","s_asia","indian_ocean"].includes(fromR);
  const toEMedOrRed = ["e_med","red_sea","persian_gulf"].includes(toR);
  const fromRed = ["red_sea","persian_gulf","arabian_sea"].includes(fromR);

  // Helper: Atlantic approach to Gibraltar via Canaries + W Morocco waypoints
  // (avoids straight line that clips the Moroccan/W-Saharan coastline)
  function addGibraltarApproach() {
    mid.push(P.canaries, P.wMorocco, P.gibraltar);
  }

  // Helper: Mediterranean passage W → E (avoids Sicily overland)
  function addWMedToEMed() {
    mid.push(P.wMedCenter, P.straitSicily, P.sicilyS, P.ionianSea, P.creteS, P.eMed);
  }

  // ── S America Atlantic → Med / Middle East ────────────────────────────────
  // Route: hug Brazil coast offshore → NE → cross equatorial Atlantic → Gibraltar
  if (fromR === "s_america_atlantic") {
    mid.push(P.brazilSE, P.brazilNE, P.capeSaoRoque, P.eqAtlantic, P.nAtlantic);
    addGibraltarApproach();
    if (toEMedOrRed) {
      addWMedToEMed();
      if (["red_sea","persian_gulf"].includes(toR)) {
        mid.push(P.portSaid, P.suezCity, P.babElMandeb, P.gulfAden);
      }
    }

  // ── N America Atlantic → Med ──────────────────────────────────────────────
  } else if (fromR === "n_america_atlantic") {
    mid.push(P.bermuda);
    addGibraltarApproach();
    if (toEMedOrRed) addWMedToEMed();

  // ── W Europe Atlantic coast → Med ─────────────────────────────────────────
  } else if (fromR === "w_europe") {
    mid.push(P.gibraltar);
    if (toEMedOrRed) addWMedToEMed();

  // ── NW Africa / Canaries → Med ────────────────────────────────────────────
  } else if (["nw_africa","w_atlantic"].includes(fromR)) {
    addGibraltarApproach();
    if (toEMedOrRed) addWMedToEMed();

  // ── W Mediterranean → E Mediterranean ────────────────────────────────────
  } else if (fromR === "w_med") {
    if (["c_med","e_med","red_sea"].includes(toR)) {
      mid.push(P.straitSicily, P.sicilyS, P.ionianSea, P.creteS, P.eMed);
    }

  // ── Central Med → E Med ──────────────────────────────────────────────────
  } else if (fromR === "c_med") {
    if (["e_med","red_sea"].includes(toR)) {
      mid.push(P.sicilyS, P.ionianSea, P.creteS, P.eMed);
    }

  // ── Black Sea / Turkey → Aegean → Med ────────────────────────────────────
  } else if (fromR === "black_sea_turkey") {
    mid.push(P.bosphorus, P.dardanelles, P.aegean, P.rhodesS);
    if (toEMedOrRed) mid.push(P.eMed);

  // ── Red Sea / Persian Gulf → Med (via Suez) ───────────────────────────────
  } else if (fromRed && toMed) {
    if (fromR === "persian_gulf") mid.push(P.babElMandeb);
    mid.push(P.suezCity, P.portSaid, P.creteS, P.eMed);
    if (toR === "w_med") mid.push(P.straitSicily, P.wMedCenter);

  // ── E Africa → Med (via Red Sea & Suez) ───────────────────────────────────
  } else if (fromR === "e_africa" && toMed) {
    mid.push(P.babElMandeb, P.suezCity, P.portSaid, P.creteS, P.eMed);

  // ── S Africa → Med (via Cape of Good Hope → Gibraltar) ───────────────────
  } else if (fromR === "s_africa" && toMed) {
    mid.push(P.capeGoodHope, P.sAtlanticMid);
    addGibraltarApproach();
    if (toEMedOrRed) addWMedToEMed();

  // ── Asia → Med (Malacca → Indian Ocean → Red Sea → Suez) ─────────────────
  } else if (fromAsia) {
    if (fromR === "e_asia") mid.push(P.schinaSeaN, P.schinaSeaS);
    if (["e_asia","se_asia"].includes(fromR)) mid.push(P.malacca);
    mid.push(P.wIndianOcean);
    if (fromR === "s_asia") mid.push(P.nIndianOcean);
    mid.push(P.gulfAden, P.babElMandeb, P.suezCity, P.portSaid);
    if (toMed) {
      mid.push(P.creteS, P.eMed);
      if (toR === "w_med") mid.push(P.straitSicily, P.wMedCenter);
    }

  // ── N/S America Pacific → Med (simplified via Panama) ────────────────────
  } else if (["n_america_pacific","s_america_pacific"].includes(fromR)) {
    mid.push([9.3, -79.7] as LatLng, P.floridaStr, P.bermuda);
    addGibraltarApproach();
    if (toEMedOrRed) addWMedToEMed();
  }

  // Filter out waypoints that would visibly backtrack (crude optimization)
  return [from, ...mid, to];
}

// ── Path interpolation ────────────────────────────────────────────────────────

function segLen([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  return Math.hypot(lat2 - lat1, lng2 - lng1);
}

/**
 * Interpolate a position along a multi-segment path.
 * t = 0 → start, t = 1 → end.
 */
function interpolateOnPath(path: LatLng[], t: number): LatLng {
  if (path.length === 0) return [0, 0];
  if (t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];

  const lengths = path.slice(0, -1).map((p, i) => segLen(p, path[i + 1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const target = t * total;

  let cum = 0;
  for (let i = 0; i < lengths.length; i++) {
    if (cum + lengths[i] >= target) {
      const segT = lengths[i] === 0 ? 0 : (target - cum) / lengths[i];
      const a = path[i], b = path[i + 1];
      return [a[0] + (b[0] - a[0]) * segT, a[1] + (b[1] - a[1]) * segT];
    }
    cum += lengths[i];
  }
  return path[path.length - 1];
}

/**
 * Get current ship position and local bearing along a sea route.
 * Returns { pos, bearing, routeUpTo: waypoints up to current pos }
 */
export function shipProgress(
  from: LatLng,
  to: LatLng,
  etd: string | null,
  eta: string | null
): { pos: LatLng; bearing: number; progress: number; route: LatLng[] } {
  const route = getSeaRoute(from, to);

  const now = Date.now();
  const start = etd ? new Date(etd).getTime() : now;
  const end   = eta ? new Date(eta).getTime() : now + 1;
  const t = Math.max(0, Math.min(1, (now - start) / (end - start)));

  const pos = interpolateOnPath(route, t);

  // Find bearing using the two waypoints that bracket the current position
  const lengths = route.slice(0, -1).map((p, i) => segLen(p, route[i + 1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  let cum = 0, bearing = 0;
  const target = t * total;
  for (let i = 0; i < lengths.length; i++) {
    if (cum + lengths[i] >= target) {
      bearing = getBearing(route[i], route[i + 1]);
      break;
    }
    cum += lengths[i];
  }

  // Slice the route up to the current position for the "progress trail" line
  const routeUpToIdx = route.findIndex((_, i) => {
    if (i === 0) return false;
    let c = 0;
    for (let j = 0; j < i; j++) c += lengths[j];
    return c >= target;
  });
  const routeUpTo = routeUpToIdx === -1
    ? route
    : [...route.slice(0, routeUpToIdx), pos];

  return { pos, bearing, progress: t, route };
}

export function getBearing([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const dLon = (lng2 - lng1) * (Math.PI / 180);
  const φ1 = lat1 * (Math.PI / 180);
  const φ2 = lat2 * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Simple straight-line interpolation (kept for backwards compat) */
export function interpolatePosition(
  from: LatLng, to: LatLng,
  etd: string | null, eta: string | null
): LatLng {
  if (!etd || !eta) return from;
  const t = Math.max(0, Math.min(1,
    (Date.now() - new Date(etd).getTime()) /
    (new Date(eta).getTime() - new Date(etd).getTime())
  ));
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}
