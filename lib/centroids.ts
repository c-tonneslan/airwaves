// Lat/lng centroids for ISO-3166-1 alpha-2 country codes, used as a fallback
// position when Radio Browser doesn't have explicit coordinates for a station.
// Hand-picked geographic centers; not perfectly accurate but close enough to
// drop a dot on the right country.
export const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [39.8283, -98.5795],
  GB: [54.0, -2.5],
  DE: [51.1657, 10.4515],
  FR: [46.6034, 1.8883],
  IT: [42.6, 12.5],
  ES: [40.0, -4.0],
  NL: [52.1326, 5.2913],
  BE: [50.5039, 4.4699],
  CH: [46.8182, 8.2275],
  AT: [47.5162, 14.5501],
  SE: [60.1282, 18.6435],
  NO: [60.472, 8.4689],
  DK: [56.2639, 9.5018],
  FI: [61.9241, 25.7482],
  IS: [64.9631, -19.0208],
  IE: [53.4129, -8.2439],
  PT: [39.3999, -8.2245],
  PL: [51.9194, 19.1451],
  CZ: [49.8175, 15.473],
  SK: [48.669, 19.699],
  HU: [47.1625, 19.5033],
  RO: [45.9432, 24.9668],
  BG: [42.7339, 25.4858],
  GR: [39.0742, 21.8243],
  TR: [38.9637, 35.2433],
  RU: [61.524, 105.3188],
  UA: [48.3794, 31.1656],
  BY: [53.7098, 27.9534],
  EE: [58.5953, 25.0136],
  LV: [56.8796, 24.6032],
  LT: [55.1694, 23.8813],
  HR: [45.1, 15.2],
  RS: [44.0165, 21.0059],
  SI: [46.1512, 14.9955],
  BA: [43.9159, 17.6791],
  ME: [42.7087, 19.3744],
  MK: [41.6086, 21.7453],
  AL: [41.1533, 20.1683],
  XK: [42.6026, 20.903],
  MD: [47.4116, 28.3699],
  LU: [49.8153, 6.1296],
  MT: [35.9375, 14.3754],
  CY: [35.1264, 33.4299],
  // Americas
  CA: [56.1304, -106.3468],
  MX: [23.6345, -102.5528],
  BR: [-14.235, -51.9253],
  AR: [-38.4161, -63.6167],
  CL: [-35.6751, -71.543],
  CO: [4.5709, -74.2973],
  PE: [-9.19, -75.0152],
  VE: [6.4238, -66.5897],
  EC: [-1.8312, -78.1834],
  BO: [-16.2902, -63.5887],
  UY: [-32.5228, -55.7658],
  PY: [-23.4425, -58.4438],
  CU: [21.5218, -77.7812],
  DO: [18.7357, -70.1627],
  CR: [9.7489, -83.7534],
  PA: [8.538, -80.7821],
  GT: [15.7835, -90.2308],
  HN: [15.2, -86.2419],
  SV: [13.7942, -88.8965],
  NI: [12.8654, -85.2072],
  JM: [18.1096, -77.2975],
  HT: [18.9712, -72.2852],
  PR: [18.2208, -66.5901],
  TT: [10.6918, -61.2225],
  // Africa
  EG: [26.8206, 30.8025],
  ZA: [-30.5595, 22.9375],
  NG: [9.082, 8.6753],
  KE: [-0.0236, 37.9062],
  GH: [7.9465, -1.0232],
  ET: [9.145, 40.4897],
  TZ: [-6.369, 34.8888],
  UG: [1.3733, 32.2903],
  MA: [31.7917, -7.0926],
  DZ: [28.0339, 1.6596],
  TN: [33.8869, 9.5375],
  LY: [26.3351, 17.2283],
  SD: [12.8628, 30.2176],
  AO: [-11.2027, 17.8739],
  CI: [7.54, -5.5471],
  SN: [14.4974, -14.4524],
  CM: [7.3697, 12.3547],
  ZW: [-19.0154, 29.1549],
  ZM: [-13.1339, 27.8493],
  RW: [-1.9403, 29.8739],
  MZ: [-18.6657, 35.5296],
  MG: [-18.7669, 46.8691],
  MU: [-20.3484, 57.5522],
  // Middle East & Central Asia
  IL: [31.0461, 34.8516],
  SA: [23.8859, 45.0792],
  AE: [23.4241, 53.8478],
  IR: [32.4279, 53.688],
  IQ: [33.2232, 43.6793],
  JO: [30.5852, 36.2384],
  LB: [33.8547, 35.8623],
  SY: [34.8021, 38.9968],
  YE: [15.5527, 48.5164],
  OM: [21.4735, 55.9754],
  QA: [25.3548, 51.1839],
  BH: [25.9304, 50.6378],
  KW: [29.3117, 47.4818],
  AF: [33.9391, 67.71],
  PK: [30.3753, 69.3451],
  KZ: [48.0196, 66.9237],
  UZ: [41.3775, 64.5853],
  TM: [38.9697, 59.5563],
  TJ: [38.861, 71.2761],
  KG: [41.2044, 74.7661],
  // Asia
  IN: [20.5937, 78.9629],
  CN: [35.8617, 104.1954],
  JP: [36.2048, 138.2529],
  KR: [35.9078, 127.7669],
  KP: [40.3399, 127.5101],
  TW: [23.6978, 120.9605],
  HK: [22.3193, 114.1694],
  TH: [15.87, 100.9925],
  VN: [14.0583, 108.2772],
  MY: [4.2105, 101.9758],
  ID: [-0.7893, 113.9213],
  PH: [12.8797, 121.774],
  SG: [1.3521, 103.8198],
  MM: [21.9162, 95.956],
  KH: [12.5657, 104.991],
  LA: [19.8563, 102.4955],
  BD: [23.685, 90.3563],
  LK: [7.8731, 80.7718],
  NP: [28.3949, 84.124],
  MN: [46.8625, 103.8467],
  // Oceania
  AU: [-25.2744, 133.7751],
  NZ: [-40.9006, 174.886],
  PG: [-6.315, 143.9555],
  FJ: [-16.5782, 179.4144],
};

/**
 * Returns a lat/lng centroid for the given country code. If we don't know
 * the country, returns null so the caller can drop the station.
 */
export function centroidFor(code: string): [number, number] | null {
  if (!code) return null;
  return COUNTRY_CENTROIDS[code.toUpperCase()] ?? null;
}

/**
 * Jitter the given coordinates by up to roughly the given radius in degrees,
 * deterministically based on a seed string (the station's UUID). This spreads
 * multiple stations sharing a country centroid into a small cluster.
 */
export function jitter(
  base: [number, number],
  seed: string,
  radius = 1.5,
): [number, number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const a = (h & 0xffff) / 0xffff;
  const b = ((h >>> 16) & 0xffff) / 0xffff;
  // Polar offset so jitter is uniform inside a circle, not a square.
  const theta = a * Math.PI * 2;
  const r = Math.sqrt(b) * radius;
  return [base[0] + Math.sin(theta) * r, base[1] + Math.cos(theta) * r];
}
