// Compute the day/night terminator and the subsolar point for a given
// Date. The terminator is the great circle separating the lit and unlit
// hemispheres; the subsolar point is where the Sun is directly overhead.
//
// References:
// - "Astronomical Algorithms" (Meeus) for the solar position
// - https://gml.noaa.gov/grad/solcalc/calcdetails.html

const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = date.getTime() - start;
  return diff / 86_400_000;
}

/** Latitude where the Sun is directly overhead. Range ±23.5°. */
export function solarDeclination(date: Date): number {
  const n = dayOfYear(date);
  return 23.44 * Math.sin(((360 / 365) * (n - 81)) * RAD_PER_DEG);
}

/** Longitude where it's solar noon right now (subsolar longitude). */
export function subsolarLongitude(date: Date): number {
  const hours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  return 180 - 15 * hours;
}

export interface SubsolarPoint {
  lat: number;
  lng: number;
}

export function subsolarPoint(date: Date = new Date()): SubsolarPoint {
  return { lat: solarDeclination(date), lng: subsolarLongitude(date) };
}

/**
 * Sample the terminator as a polyline. We rotate a unit vector around
 * the antisolar direction and convert each rotation step back to lat/lng.
 * 240 points is plenty for a smooth curve at any zoom.
 */
export function terminatorPath(date: Date = new Date(), samples = 240): Array<[number, number]> {
  const sub = subsolarPoint(date);
  // Build an orthonormal basis where +z points at the subsolar point.
  const sLat = sub.lat * RAD_PER_DEG;
  const sLng = sub.lng * RAD_PER_DEG;
  const sx = Math.cos(sLat) * Math.cos(sLng);
  const sy = Math.cos(sLat) * Math.sin(sLng);
  const sz = Math.sin(sLat);

  // (-sin λ, cos λ, 0) is the local "east" vector at the subsolar point
  // and is always perpendicular to s (its z component is zero while s's
  // z component carries the latitude), so it's a safe first basis vector
  // even at the poles. It's already unit length: sin² + cos² = 1.
  const ax = -Math.sin(sLng);
  const ay = Math.cos(sLng);
  const az = 0;

  // b = s × a, giving the third basis vector.
  const bx = sy * az - sz * ay;
  const by = sz * ax - sx * az;
  const bz = sx * ay - sy * ax;

  const out: Array<[number, number]> = [];
  for (let i = 0; i < samples; i++) {
    const theta = (2 * Math.PI * i) / samples;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // Point on the terminator: cos*a + sin*b (perpendicular to s).
    const x = cos * ax + sin * bx;
    const y = cos * ay + sin * by;
    const z = cos * az + sin * bz;
    const lat = Math.asin(z) * DEG_PER_RAD;
    const lng = Math.atan2(y, x) * DEG_PER_RAD;
    out.push([lat, lng]);
  }
  return out;
}
