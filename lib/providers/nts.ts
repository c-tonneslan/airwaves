import type { Station } from "../types";
import type { Provider, ProviderMatch, ShowInfo, Track } from "./types";

// NTS Radio (London) exposes a public, CORS-friendly API for its two
// channels' live broadcasts and historical tracklists. The directory
// has several station entries for NTS (the main streams plus the
// "NTS Infinite Mixtapes" branches); the live-show overlay only makes
// sense for the two main channels, identified here by their stream URL.

const LIVE_URL = "https://www.nts.live/api/v2/live";

function matchChannel(station: Station): "1" | "2" | null {
  const url = (station.url_resolved || station.url || "").toLowerCase();
  if (url.includes("stream-relay-geo.ntslive.net/stream2")) return "2";
  if (url.includes("stream-relay-geo.ntslive.net/stream")) return "1";
  // Fall back to name detection only for things obviously labelled as NTS
  // channel 1 or 2; the Infinite Mixtapes have their own naming and
  // don't share the live tracklist, so we skip them.
  const name = station.name.trim().toLowerCase();
  if (name === "nts radio 1") return "1";
  if (name === "nts radio 2") return "2";
  return null;
}

interface LiveResultRaw {
  channel_name: string;
  now: {
    broadcast_title: string;
    start_timestamp: string;
    end_timestamp: string;
    embeds?: {
      details?: {
        name?: string;
        description?: string;
        location_long?: string;
        location_short?: string;
        media?: {
          background_medium?: string;
          background_small?: string;
        };
        external_links?: string[];
      };
    };
  };
}

interface LiveBody {
  results: LiveResultRaw[];
}

// HTML entities show up raw in broadcast titles — decode the common ones
// without dragging in a library.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

export const ntsProvider: Provider = {
  id: "nts",

  match(station): ProviderMatch | null {
    const ch = matchChannel(station);
    return ch ? { providerId: "nts", key: ch } : null;
  },

  async fetchShow(m, signal): Promise<ShowInfo | null> {
    const resp = await fetch(LIVE_URL, { signal });
    if (!resp.ok) return null;
    const body = (await resp.json()) as LiveBody;
    const idx = m.key === "2" ? 1 : 0;
    const row = body.results[idx];
    if (!row) return null;
    const details = row.now.embeds?.details;
    return {
      title: decodeEntities(row.now.broadcast_title),
      description: details?.description,
      location: details?.location_long || details?.location_short,
      startedAt: row.now.start_timestamp,
      endsAt: row.now.end_timestamp,
      imageUrl: details?.media?.background_small || details?.media?.background_medium,
      showUrl: `https://www.nts.live/live`,
    };
  },

  async fetchTracklist(): Promise<Track[]> {
    // NTS tracklists are published per-show after the broadcast ends,
    // not during the live one. We surface the show description in the
    // panel instead; full historical tracklists need to look up the
    // specific show slug, which is a much heavier scrape than this
    // feature deserves right now.
    return [];
  },
};
