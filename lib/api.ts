import type { Station } from "./types";

// Radio Browser is run by volunteers and individual mirrors go up and
// down. The project asks clients not to pin one server, so we shuffle
// the list per call and fall through to the next on failure.
const MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://de2.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
];

// A fresh randomized copy of MIRRORS. Spreading the starting point keeps
// one volunteer server from absorbing every airwaves visitor's first hit.
function shuffledMirrors(): string[] {
  const out = [...MIRRORS];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const CACHE_KEY = "airwaves.stations.v2";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

interface CachedPayload {
  fetched: number;
  data: Station[];
}

// Per-mirror request budget. Without this, a hung mirror would block the
// page indefinitely on first load instead of moving on to the next one.
const MIRROR_TIMEOUT_MS = 8_000;

export async function fetchTopStations(limit = 5000): Promise<Station[]> {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached: CachedPayload = JSON.parse(raw);
        // A version-skewed cache (or a half-written entry from a previous
        // tab crash) can still parse as JSON but lack the data array. Bare
        // .data lookup would return undefined and break the page; refetch
        // instead.
        if (
          Array.isArray(cached?.data) &&
          typeof cached.fetched === "number" &&
          Date.now() - cached.fetched < CACHE_TTL_MS
        ) {
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
  for (const base of shuffledMirrors()) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), MIRROR_TIMEOUT_MS);
    try {
      const resp = await fetch(`${base}/json/stations/search?${params.toString()}`, {
        // No custom headers: browsers strip User-Agent and adding anything
        // turns this into a CORS-preflighted request, which is slower and
        // an extra failure mode. Radio Browser returns a permissive CORS
        // header (`access-control-allow-origin: *`) on plain GET.
        signal: ac.signal,
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
    } finally {
      clearTimeout(timer);
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
  // Any mirror will do; one failed click count won't ruin anyone's day.
  fetch(`${shuffledMirrors()[0]}/json/url/${uuid}`).catch(() => {});
}
