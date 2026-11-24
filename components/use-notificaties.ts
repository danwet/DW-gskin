"use client";

import { useCallback, useEffect, useState } from "react";
import type { MailAssessment } from "@/lib/agent/types";

const SLEUTEL = "dw-notifications-v1";

type Stand = { since: string | null; read: string[] };

function leesStand(): Stand {
  if (typeof window === "undefined") return { since: null, read: [] };
  try {
    const raw = window.localStorage.getItem(SLEUTEL);
    if (!raw) return { since: null, read: [] };
    const data = JSON.parse(raw) as { since?: string | null; read?: string[] };
    return { since: data.since ?? null, read: Array.isArray(data.read) ? data.read : [] };
  } catch {
    return { since: null, read: [] };
  }
}

function schrijfStand(next: Stand) {
  try {
    window.localStorage.setItem(SLEUTEL, JSON.stringify(next));
  } catch {
    // Zonder opslag werkt de server nog.
  }
}

/**
 * Val terug op eigen data als het scherm geen inbox publiceert (zoals Uploaden):
 * de bel moet daar ook werken en dezelfde berichten tonen.
 */
export function useNotificaties(actief: boolean) {
  const [items, setItems] = useState<MailAssessment[]>([]);
  const [stand, setStand] = useState<Stand>({ since: null, read: [] });

  const laad = useCallback(async () => {
    try {
      const response = await fetch("/api/inbox", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { items?: MailAssessment[] };
      setItems(data.items ?? []);
      setStand(leesStand());
    } catch {
      // Laat de bel leeg; het scherm zelf blijft werken.
    }
  }, []);

  useEffect(() => {
    if (!actief) return;
    void laad();
    const timer = window.setInterval(() => void laad(), 60_000);
    return () => window.clearInterval(timer);
  }, [actief, laad]);

  const gemist = items.filter((item) => item.classification === "unclassified");
  const nieuw = stand.since
    ? items
        .filter((item) => !item.archivedAt && !item.savedAt)
        .filter((item) => item.receivedAt > stand.since!)
        .filter((item) => !stand.read.includes(item.conversationId))
    : [];

  const markeerAllesGelezen = useCallback(() => {
    const next = { since: new Date().toISOString(), read: [] };
    setStand(next);
    schrijfStand(next);
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    }).catch(() => undefined);
  }, []);

  const markeerGelezen = useCallback((conversationId: string) => {
    setStand((current) => {
      if (current.read.includes(conversationId)) return current;
      const next = { ...current, read: [...current.read, conversationId] };
      schrijfStand(next);
      return next;
    });
  }, []);

  return { gemist, nieuw, laad, markeerAllesGelezen, markeerGelezen };
}
