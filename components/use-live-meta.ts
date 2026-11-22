"use client";

import { useEffect, useState } from "react";
import type { AgentMeta } from "@/lib/agent/types";

/**
 * Keeps the agent's meta current while a page is open. The dashboard already
 * publishes the run time, but a page that reads its own snapshot would still
 * show yesterday's run until the browser reloads.
 */
export function useLiveMeta(initial: AgentMeta | null): AgentMeta | null {
  const [meta, setMeta] = useState<AgentMeta | null>(initial);

  useEffect(() => {
    if (initial) setMeta(initial);
  }, [initial]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/gmail/import", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { lastRunAt?: string | null };
        if (!alive || !data.lastRunAt) return;
        setMeta((current) => {
          const stamp = data.lastRunAt ?? null;
          const next = stamp ? Date.parse(stamp) : Number.NaN;
          const now = current?.lastRunAt ? Date.parse(current.lastRunAt) : 0;
          if (!Number.isFinite(next) || next <= now) return current;
          if (!current) return current;
          return { ...current, lastRunAt: stamp };
        });
      } catch {
        // Best effort.
      }
    };
    void tick();
    const timer = window.setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return meta;
}
