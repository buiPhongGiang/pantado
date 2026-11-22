"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "../lib/api";
import { css } from "../lib/tpl";
import { filterItems, marketItems, type AssetLite, type BoardRow, type IndexLite } from "./market.vm";

const MAX = 50;

/**
 * Title of a chart page that opens a market search: click the name (or press "/") to jump to another index or
 * asset. Data loads only while the search is open.
 */
export function SymbolSearch({ children, label }: { children: ReactNode; label: string }): ReactNode {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${label}. Search the market`} title="Search the market ( / )" style={css("display: inline-flex; align-items: center; gap: 10px; border: 0; padding: 4px 8px; margin: -4px -8px; border-radius: 10px; background: transparent; color: inherit; cursor: pointer")} className="symsearch">
        {children}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E8E96" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <style>{".symsearch:hover{background:#141417}"}</style>
      {open ? <SearchDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }): ReactNode {
  const board = useApi<BoardRow[]>("/board");
  const assets = useApi<AssetLite[]>("/assets");
  const indexes = useApi<IndexLite[]>("/indexes");
  const fx = useApi<{ vndPerUsd: number | null }>("/fx");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const items = useMemo(() => marketItems(board.data ?? [], assets.data ?? [], indexes.data ?? [], fx.data?.vndPerUsd ?? null), [board.data, assets.data, indexes.data, fx.data]);
  const rows = useMemo(() => filterItems(items, "All", new Set(), q).slice(0, MAX), [items, q]);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && rows[sel]) window.location.href = rows[sel].href;
  };

  const loading = !board.data && !board.error;

  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={css("position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,.6); display: flex; justify-content: center; align-items: flex-start; padding: 10vh 16px 16px")}>
      <div role="dialog" aria-modal="true" aria-label="Search the market" onKeyDown={onKey} style={css("width: 560px; max-width: 100%; max-height: 70vh; display: flex; flex-direction: column; border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20; overflow: hidden")}>
        <div style={css("display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 16px; border-bottom: 1px solid #17171A")}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E8E96" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input ref={input} type="text" value={q} onChange={(e) => setQ(e.target.value.slice(0, 64))} placeholder="Search ticker, name or contract address" aria-label="Search the market" style={css("flex: 1; min-width: 0; border: 0; background: transparent; color: #F2F2F3; font: 400 15px 'Inter', sans-serif; outline: none")} />
          <button type="button" onClick={onClose} style={css("border: 0; padding: 4px 8px; border-radius: 6px; background: #1C1C20; color: #8E8E96; font-size: 12px; cursor: pointer")}>
            Esc
          </button>
        </div>
        <div ref={list} role="listbox" style={css("overflow-y: auto")}>
          {rows.map((r, i) => (
            <a key={`${r.type}|${r.key}`} data-i={i} role="option" aria-selected={i === sel} href={r.href} onMouseEnter={() => setSel(i)} style={css(`display: flex; align-items: center; gap: 12px; padding: 10px 16px; font-size: 14px; background: ${i === sel ? "#141417" : "transparent"}`)}>
              {r.icon ? <span aria-hidden="true" style={css(`width: 28px; height: 28px; border-radius: 8px; flex: none; background: ${r.icon}`)} /> : null}
              {r.img ? <img src={r.img} alt="" style={css("width: 28px; height: 28px; border-radius: 50%; flex: none; background: #1C1C20")} /> : null}
              {r.ini ? <span aria-hidden="true" style={css("width: 28px; height: 28px; border-radius: 50%; flex: none; background: #26262B; display: grid; place-items: center; font-size: 11px; font-weight: 700")}>{r.ini}</span> : null}
              <span style={css("min-width: 0; flex: 1")}>
                <span style={css("display: block; font-weight: 700; font-size: 15px")}>{r.n}</span>
                <span style={css("display: block; font-size: 12px; color: #8E8E96; white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>{r.sub}</span>
              </span>
              <span style={css("font-size: 12px; color: #8E8E96")}>{r.type}</span>
              <span style={css("min-width: 90px; text-align: right; font-weight: 700")}>{r.px}</span>
            </a>
          ))}
          {!rows.length ? (
            <div style={css("padding: 20px 16px; color: #8E8E96; font-size: 14px")}>{loading ? "Loading the market…" : board.error ? `Cannot reach the Pantado API: ${board.error.message}` : "Nothing matches this search."}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
