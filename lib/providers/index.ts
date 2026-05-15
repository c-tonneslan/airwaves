import type { Station } from "../types";
import type { Provider, ProviderMatch } from "./types";
import { ntsProvider } from "./nts";
import { kexpProvider } from "./kexp";

const PROVIDERS: Provider[] = [ntsProvider, kexpProvider];

/**
 * Returns the first provider that recognizes this station, or null.
 * Used by the player to decide whether to render the show-info panel.
 */
export function matchProvider(
  station: Station,
): { provider: Provider; match: ProviderMatch } | null {
  for (const p of PROVIDERS) {
    const m = p.match(station);
    if (m) return { provider: p, match: m };
  }
  return null;
}

export type { Provider, ProviderMatch, ShowInfo, Track } from "./types";
