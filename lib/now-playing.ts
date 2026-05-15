"use client";

import { useEffect, useRef, useState } from "react";

interface NowPlaying {
  title: string | null;
  loading: boolean;
}

/**
 * Polls the server-side ICY proxy for the current track title.
 * Refreshes every 30 seconds while a station is playing.
 */
export function useNowPlaying(streamUrl: string | null, enabled: boolean): NowPlaying {
  const [state, setState] = useState<NowPlaying>({ title: null, loading: false });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!streamUrl || !enabled) {
      // Reset the title when the station goes away or is paused. This is
      // a legitimate "synchronize with external state" case — the lint
      // rule errs on the side of warning here, but the alternative
      // (deriving via useMemo) doesn't fit because we also fetch async.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ title: null, loading: false });
      return;
    }

    let cancelled = false;

    async function fetchOnce() {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setState((s) => ({ title: s.title, loading: true }));
      try {
        const resp = await fetch(
          `/api/now-playing?url=${encodeURIComponent(streamUrl!)}`,
          { signal: ac.signal, cache: "no-store" },
        );
        const data = (await resp.json()) as { title: string | null };
        if (!cancelled) {
          setState({ title: data.title, loading: false });
        }
      } catch {
        if (!cancelled) setState((s) => ({ title: s.title, loading: false }));
      }
    }

    fetchOnce();
    const id = window.setInterval(fetchOnce, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [streamUrl, enabled]);

  return state;
}
