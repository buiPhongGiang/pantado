"use client";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../lib/wallet";

/**
 * Watchlist (Market star, Workspace scope): ids of indexes (address, lower case) and assets (registry id), kept in
 * this browser per wallet (or "anon" before connect). A convenience, not shared state.
 */
const key = (owner: string | null): string => `pantado-watch:${owner ? owner.toLowerCase() : "anon"}`;

function read(owner: string | null): string[] {
  try {
    const raw = window.localStorage.getItem(key(owner));
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useWatchlist(): { ids: Set<string>; toggle: (id: string) => void } {
  const w = useWallet();
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    setIds(new Set(read(w.address)));
  }, [w.address]);
  const toggle = useCallback(
    (id: string) => {
      setIds((cur) => {
        const next = new Set(cur);
        const k = id.toLowerCase();
        if (next.has(k)) next.delete(k);
        else next.add(k);
        try {
          window.localStorage.setItem(key(w.address), JSON.stringify([...next]));
        } catch {
          /* private mode: the star still works for this visit */
        }
        return next;
      });
    },
    [w.address],
  );
  return { ids, toggle };
}
