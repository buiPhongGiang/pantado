"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, useApi } from "../lib/api";
import { css } from "../lib/tpl";
import { Page } from "./page";
import { useWatchlist } from "./watchlist";
import { marketItems, marketVM, topMovers, type AssetLite, type BoardRow, type Filter, type IndexLite } from "./market.vm";

const GRID = "display: grid; grid-template-columns: 56px minmax(0, 2.6fr) 120px minmax(0, 1fr) 96px 96px 96px minmax(0, 1.1fr); align-items: center";

/** Market (reference/index-layer/Main.dc.html): the home page. Rows open the chart page; the star keeps a watchlist. */
export default function Market(): ReactNode {
  const board = useApi<BoardRow[]>("/board", 30_000);
  const assets = useApi<AssetLite[]>("/assets", 60_000);
  const indexes = useApi<IndexLite[]>("/indexes", 30_000);
  const fx = useApi<{ vndPerUsd: number | null }>("/fx", 60_000);
  const { ids: watch, toggle } = useWatchlist();
  const [filter, setFilter] = useState<Filter>("All");
  const [q, setQ] = useState("");
  const [sparks, setSparks] = useState<Record<string, number[]>>({});

  const items = useMemo(() => marketItems(board.data ?? [], assets.data ?? [], indexes.data ?? [], fx.data?.vndPerUsd ?? null), [board.data, assets.data, indexes.data, fx.data]);

  // sparklines only for the four movers: 30 daily closes (assets) or the indexed levels (index)
  const moverKeys = topMovers(items)
    .map((m) => `${m.type}|${m.key}`)
    .join(",");
  useEffect(() => {
    if (!moverKeys) return;
    let live = true;
    void Promise.all(
      moverKeys.split(",").map(async (mk) => {
        const [type, key] = mk.split("|") as [string, string];
        try {
          if (type === "Index") {
            const l = await apiGet<{ levels: { level: string }[] }>(`/indexes/${key}/levels?limit=200`);
            return [key, l.levels.map((x) => Number(x.level) / 1e18)] as const;
          }
          const c = await apiGet<{ candles: { c: number }[] }>(`/assets/${encodeURIComponent(key)}/candles?interval=1d&limit=30`);
          return [key, c.candles.map((x) => x.c)] as const;
        } catch {
          return [key, [] as number[]] as const;
        }
      }),
    ).then((rows) => live && setSparks(Object.fromEntries(rows)));
    return () => {
      live = false;
    };
  }, [moverKeys]);

  const v = marketVM({ items, filter, q, watch, sparks });
  const loading = !board.data && !board.error;

  return (
    <Page title="Market" active="market">
      <style>{".mrow:hover{background:#141417}"}</style>
      <section style={css("padding: 28px 24px 40px; display: flex; flex-direction: column; gap: 16px")}>
        <div style={css("display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap")}>
          <h1 style={css("margin: 0; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 40px; letter-spacing: -0.05em")}>Market</h1>
        </div>

        {v.movers.length ? (
          <div style={css("display: flex; flex-direction: column; gap: 10px; margin-top: 8px")}>
            <div style={css("display: flex; align-items: baseline; gap: 8px")}>
              <h2 style={css("margin: 0; font-size: 15px; font-weight: 700")}>Top movers</h2>
              <span style={css("font-size: 13px; color: #8E8E96")}>24H</span>
            </div>
            <div className="movers" style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px")}>
              {v.movers.map((m) => (
                <a key={m.key} href={m.href} style={css("padding: 16px 18px; border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20; display: flex; flex-direction: column; gap: 14px")}>
                  <span style={css("display: flex; align-items: center; gap: 10px")}>
                    {m.img ? <img src={m.img} alt="" style={css("width: 30px; height: 30px; border-radius: 50%; flex: none")} /> : null}
                    {m.icon ? <span aria-hidden="true" style={css(`width: 30px; height: 30px; border-radius: 8px; flex: none; background: ${m.icon}`)} /> : null}
                    {m.ini ? <span aria-hidden="true" style={css("width: 30px; height: 30px; border-radius: 50%; flex: none; background: #26262B; display: grid; place-items: center; font-size: 11px; font-weight: 700")}>{m.ini}</span> : null}
                    <span style={css("min-width: 0; flex: 1")}>
                      <span style={css("display: block; font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>{m.n}</span>
                      <span style={css("display: block; font-size: 12px; color: #8E8E96")}>{m.kind}</span>
                    </span>
                    <span style={css(`padding: 4px 8px; border-radius: 8px; background: ${m.dbg}; color: ${m.dfg}; font-size: 13px; font-weight: 700`)}>{m.d}</span>
                  </span>
                  <span style={css("display: flex; align-items: flex-end; justify-content: space-between; gap: 12px")}>
                    <span style={css("font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 24px; letter-spacing: -0.02em; white-space: nowrap")}>{m.px}</span>
                    <svg width="110" height="36" viewBox="0 0 110 36" aria-hidden="true" style={css("flex: none")}>
                      {m.pts ? <polyline points={m.pts} fill="none" stroke={m.dfg} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /> : null}
                    </svg>
                  </span>
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div style={css("display: flex; gap: 8px; flex-wrap: wrap; align-items: center")}>
          <div role="group" aria-label="Filter" style={css("display: flex; gap: 8px; flex-wrap: wrap")}>
            {v.chips.map((c) => (
              <button key={c.f} type="button" aria-pressed={c.on} onClick={() => setFilter(c.f)} style={css(`border: 0; height: 44px; padding: 0 16px; border-radius: 12px; font-weight: 600; font-size: 15px; background: ${c.bg}; color: ${c.fg}`)}>
                {c.label} <span style={css(`margin-left: 6px; font-size: 13px; color: ${c.cnt}`)}>{c.n}</span>
              </button>
            ))}
          </div>
          <div style={css("margin-left: auto; display: flex; align-items: center; gap: 10px; height: 44px; width: 320px; max-width: 100%; box-sizing: border-box; padding: 0 14px; border-radius: 12px; background: #131316")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E8E96" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <label htmlFor="q" style={css("position: absolute; left: -9999px")}>
              Search the market
            </label>
            <input id="q" type="text" value={q} onChange={(e) => setQ(e.target.value.slice(0, 64))} placeholder="Search ticker, name or contract address" style={css("flex: 1; min-width: 0; border: 0; background: transparent; color: #F2F2F3; font: 400 15px 'Inter', sans-serif; outline: none")} />
          </div>
        </div>

        <div style={css("overflow-x: auto; border-radius: 14px; border: 1px solid #1C1C20; background: #0E0E10")}>
          <div style={css("min-width: 960px")}>
            <div style={css("display: flex; align-items: center; border-bottom: 1px solid #17171A; color: #8E8E96; font-size: 11px; letter-spacing: .08em")}>
              <div style={css(`flex: 1; ${GRID}; padding: 14px 0 14px 20px`)}>
                <span>#</span>
                <span>NAME</span>
                <span>TYPE</span>
                <span style={css("text-align: right")}>PRICE</span>
                <span style={css("text-align: right")}>24H</span>
                <span style={css("text-align: right")}>7D</span>
                <span style={css("text-align: right")}>30D</span>
                <span style={css("text-align: right; padding-right: 8px")}>VOLUME 24H</span>
              </div>
              <span style={css("width: 68px; text-align: center")}>WATCH</span>
            </div>
            {v.rows.map((r) => (
              <div key={r.key} className="mrow" style={css("display: flex; align-items: center; border-top: 1px solid #17171A")}>
                <a href={r.href} aria-label={r.aria} style={css(`flex: 1; ${GRID}; padding: 12px 0 12px 20px; font-size: 14px`)}>
                  <span style={css("color: #8E8E96")}>{r.i}</span>
                  <span style={css("display: flex; align-items: center; gap: 12px; min-width: 0")}>
                    {r.icon ? <span aria-hidden="true" style={css(`width: 30px; height: 30px; border-radius: 8px; flex: none; background: ${r.icon}`)} /> : null}
                    {r.img ? <img src={r.img} alt="" style={css("width: 30px; height: 30px; border-radius: 50%; flex: none; background: #1C1C20")} /> : null}
                    {r.ini ? <span aria-hidden="true" style={css("width: 30px; height: 30px; border-radius: 50%; flex: none; background: #26262B; display: grid; place-items: center; font-size: 11px; font-weight: 700")}>{r.ini}</span> : null}
                    <span style={css("min-width: 0")}>
                      <span style={css("display: block; font-weight: 700; font-size: 15px")}>{r.n}</span>
                      <span style={css("display: block; font-size: 12px; color: #8E8E96; white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>{r.sub}</span>
                    </span>
                  </span>
                  <span>
                    <span style={css(`padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; background: ${r.tbg}; color: ${r.tfg}`)}>{r.type}</span>
                  </span>
                  <span style={css("text-align: right; font-weight: 700")}>{r.px}</span>
                  <span style={css(`text-align: right; color: ${r.c1}`)}>{r.d1s}</span>
                  <span style={css(`text-align: right; color: ${r.c7}`)}>{r.d7s}</span>
                  <span style={css(`text-align: right; color: ${r.c30}`)}>{r.d30s}</span>
                  <span style={css("text-align: right; padding-right: 8px; color: #B4B4BB")}>{r.volS}</span>
                </a>
                <span style={css("width: 68px; display: grid; place-items: center")}>
                  <button type="button" onClick={() => toggle(r.key)} aria-pressed={r.on} aria-label={r.starLabel} style={css("width: 40px; height: 40px; border: 0; border-radius: 10px; background: transparent; display: grid; place-items: center")}>
                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill={r.sfill} stroke={r.sline} strokeWidth="1.7" strokeLinejoin="round" />
                    </svg>
                  </button>
                </span>
              </div>
            ))}
            {!v.rows.length ? (
              <div style={css("padding: 28px 20px; border-top: 1px solid #17171A; color: #8E8E96; font-size: 14px")}>
                {loading ? "Loading the market…" : board.error ? `Cannot reach the Pantado API: ${board.error.message}` : filter === "Watchlist" && !q ? "Star a row to add it to your watchlist." : "Nothing matches this search."}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </Page>
  );
}
