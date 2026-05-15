import type { Station } from "../types";

/**
 * A Provider knows how to fetch live "now playing" show info and a
 * recent tracklist for some subset of stations. We use it for stations
 * with first-party schedule/play-history APIs (NTS, KEXP, ...). It's
 * different from the ICY metadata proxy, which is generic but only
 * gives us the bare track title.
 */
export interface Provider {
  id: string;
  /** Returns an opaque match handle if this provider handles the station. */
  match(station: Station): ProviderMatch | null;
  /** Returns the currently airing show, or null. */
  fetchShow(match: ProviderMatch, signal?: AbortSignal): Promise<ShowInfo | null>;
  /** Returns recent plays, ordered newest first. May return an empty array. */
  fetchTracklist(match: ProviderMatch, signal?: AbortSignal): Promise<Track[]>;
}

export interface ProviderMatch {
  providerId: string;
  /** Provider-specific routing key, e.g. channel number or station slug. */
  key: string;
}

export interface ShowInfo {
  title: string;
  description?: string;
  location?: string;
  startedAt?: string;
  endsAt?: string;
  imageUrl?: string;
  showUrl?: string;
}

export interface Track {
  artist: string;
  title: string;
  playedAt?: string;
  album?: string;
}
