import type { Station } from "./types";

// Radio Browser is run by volunteers and has a DNS round-robin of mirrors.
// We pick one at random per session so a single mirror isn't doing all the
// work, but cache the result for the rest of the page lifetime.
const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
];

let chosenMirror: string | null = null;

function mirror(): string {
  if (!chosenMirror) {
    chosenMirror = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];
  }
  return chosenMirror;
}

const USER_AGENT = "airwaves/0.1 (https://github.com/c-tonneslan/airwaves)";

const CACHE_KEY = "airwaves.stations.v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // one day

interface CachedPayload {
  fetched: number;
  data: Station[];
}

export async function fetchTopStations(limit = 5000): Promise<Station[]> {
  // Try the local cache first; the API is unauthenticated and the volunteer
  // network appreciates not getting hit every page load.
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached: CachedPayload = JSON.parse(raw);
        if (Date.now() - cached.fetched < CACHE_TTL_MS) {
          return cached.data;
        }
      }
    } catch {
      // ignore, refetch
    }
  }

  const url = new URL(`${mirror()}/json/stations/search`);
  url.searchParams.set("has_geo_info", "true");
  url.searchParams.set("hidebroken", "true");
  url.searchParams.set("order", "clickcount");
  url.searchParams.set("reverse", "true");
  url.searchParams.set("limit", String(limit));

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!resp.ok) {
    throw new Error(`fetch stations: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as Station[];

  if (typeof window !== "undefined") {
    try {
      const payload: CachedPayload = { fetched: Date.now(), data };
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // localStorage may be full; not fatal
    }
  }

  return data;
}

/**
 * Tell Radio Browser we played a station. They use this to rank stations.
 * Fires and forgets, errors are ignored so the player UI doesn't get stuck.
 */
export function reportPlay(uuid: string): void {
  if (!uuid) return;
  fetch(`${mirror()}/json/url/${uuid}`, {
    headers: { "User-Agent": USER_AGENT },
  }).catch(() => {});
}
