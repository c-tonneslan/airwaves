import type { Station } from "./types";

// Radio Browser is run by volunteers and individual mirrors go up and down.
// We try them in order on failure rather than picking one at random.
const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
];

const CACHE_KEY = "airwaves.stations.v2";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

interface CachedPayload {
  fetched: number;
  data: Station[];
}

export async function fetchTopStations(limit = 5000): Promise<Station[]> {
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

  const params = new URLSearchParams({
    // Don't require geo info up front. Lots of well-known stations (NTS,
    // KEXP, BBC, etc.) are in the directory without coordinates, and we
    // fall back to country centroids in the page so they still appear
    // on the globe.
    hidebroken: "true",
    order: "clickcount",
    reverse: "true",
    limit: String(limit),
  });

  let lastErr: unknown = null;
  for (const base of MIRRORS) {
    try {
      const resp = await fetch(`${base}/json/stations/search?${params.toString()}`, {
        // No custom headers: browsers strip User-Agent and adding anything
        // turns this into a CORS-preflighted request, which is slower and
        // an extra failure mode. Radio Browser returns a permissive CORS
        // header (`access-control-allow-origin: *`) on plain GET.
      });
      if (!resp.ok) {
        lastErr = new Error(`${resp.status} ${resp.statusText}`);
        continue;
      }
      const data = (await resp.json()) as Station[];
      cacheStations(data);
      return data;
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  throw new Error(
    lastErr instanceof Error ? lastErr.message : "all Radio Browser mirrors unreachable",
  );
}

function cacheStations(data: Station[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedPayload = { fetched: Date.now(), data };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be full; not fatal
  }
}

/**
 * Tell Radio Browser we played a station. They use this to rank stations.
 * Fires and forgets; errors are swallowed so the player UI doesn't get stuck.
 */
export function reportPlay(uuid: string): void {
  if (!uuid) return;
  // Use the same primary mirror; one failed click count won't ruin anyone's day.
  fetch(`${MIRRORS[0]}/json/url/${uuid}`).catch(() => {});
}
