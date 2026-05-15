import type { Station } from "../types";
import type { Provider, ProviderMatch, ShowInfo, Track } from "./types";

// KEXP (Seattle) publishes their entire play history via a public,
// CORS-friendly REST API. We match any directory entry whose name or
// stream URL contains "kexp" — there are several duplicates in Radio
// Browser, all the same broadcast.

const PLAYS_URL = "https://api.kexp.org/v2/plays/?limit=10";
const SHOWS_URL = "https://api.kexp.org/v2/shows/?limit=1";

function matchesKEXP(station: Station): boolean {
  const name = (station.name || "").toLowerCase();
  const url = ((station.url_resolved || station.url) || "").toLowerCase();
  return name.includes("kexp") || url.includes("kexp");
}

interface PlayRaw {
  song?: string | null;
  artist?: string | null;
  album?: string | null;
  airdate?: string;
  play_type?: string; // 'trackplay' | 'airbreak' | etc
}

interface PlaysBody {
  results: PlayRaw[];
}

interface ShowRaw {
  program_name?: string;
  host_names?: string[];
  start_time?: string;
  end_time?: string;
  tagline?: string;
  image_uri?: string;
}

interface ShowsBody {
  results: ShowRaw[];
}

export const kexpProvider: Provider = {
  id: "kexp",

  match(station): ProviderMatch | null {
    return matchesKEXP(station) ? { providerId: "kexp", key: "kexp" } : null;
  },

  async fetchShow(_m, signal: AbortSignal | undefined): Promise<ShowInfo | null> {
    const resp = await fetch(SHOWS_URL, { signal });
    if (!resp.ok) return null;
    const body = (await resp.json()) as ShowsBody;
    const row = body.results[0];
    if (!row) return null;
    const hosts = row.host_names && row.host_names.length > 0 ? ` w/ ${row.host_names.join(", ")}` : "";
    return {
      title: `${row.program_name || "KEXP"}${hosts}`,
      description: row.tagline,
      startedAt: row.start_time,
      endsAt: row.end_time,
      imageUrl: row.image_uri,
      showUrl: "https://kexp.org/",
    };
  },

  async fetchTracklist(_m, signal): Promise<Track[]> {
    const resp = await fetch(PLAYS_URL, { signal });
    if (!resp.ok) return [];
    const body = (await resp.json()) as PlaysBody;
    return body.results
      .filter((p) => p.play_type === "trackplay" && p.song && p.artist)
      .slice(0, 6)
      .map((p) => ({
        artist: p.artist || "",
        title: p.song || "",
        album: p.album || undefined,
        playedAt: p.airdate,
      }));
  },
};
