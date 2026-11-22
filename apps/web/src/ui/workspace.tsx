"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, useApi } from "../lib/api";
import { css } from "../lib/tpl";
import { useWallet } from "../lib/wallet";
import type { CandlesView, IndexView } from "../screens/asset.api";
import type { Composition, IndexDetail, Levels } from "../screens/index.data";
import { Page } from "./page";
import { useWatchlist } from "./watchlist";
import { inScope, PERIODS, SCOPES, workspaceVM, type Period, type Point, type Scope } from "./workspace.vm";

const CARD = "padding: 18px; border-radius: 14px; background: #0E0E10; border: 1px solid #1C1C20";
const LABEL = "font-size: 12px; letter-spacing: .06em; color: #8E8E96";
const BENCH_ID = "wavax";

/** Days of pre-launch history replayed from daily closes, so a new index can be compared over 90D. */
const BACKFILL_DAYS = 90;

interface PerIndex {
  levels: Point[];
  /** points before launch replayed from daily closes (API `?backfill=`), labelled on the chart */
  replayed: number;
  detail: IndexDetail | null;
  drift: number | null;
}

/** Workspace (reference/index-layer/Workspace.dc.html): how your, your watched or all public indexes perform. */
export default function Workspace(): ReactNode {
  const w = useWallet();
  const { ids: watch } = useWatchlist();
  const [scope, setScope] = useState<Scope>("Your indexes");
  const [period, setPeriod] = useState<Period>(90);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const all = useApi<IndexView[]>("/indexes", 30_000);
  const bench = useApi<CandlesView>(`/assets/${BENCH_ID}/candles?interval=1d&limit=100`, 300_000);
  const [per, setPer] = useState<Record<string, PerIndex>>({});

  const list = useMemo(() => inScope(all.data ?? [], scope, w.address, watch), [all.data, scope, w.address, watch]);
  const key = list.map((x) => x.id.toLowerCase()).join(",");

  // only the indexes in scope: level history, and for data indexes their rebalance state and drift
  useEffect(() => {
    let live = true;
    const load = (): void => {
      setNow(Math.floor(Date.now() / 1000));
      void Promise.all(
        list.map(async (ix): Promise<[string, PerIndex]> => {
          const id = ix.id.toLowerCase();
          const [lv, detail, comp] = await Promise.all([
            apiGet<Levels & { backfill?: { points: { ts: number; level: number }[] } }>(`/indexes/${id}/levels?limit=1000&backfill=${BACKFILL_DAYS}`).catch(() => null),
            ix.model === "data" ? apiGet<IndexDetail>(`/indexes/${id}`).catch(() => null) : Promise.resolve(null),
            ix.model === "data" ? apiGet<Composition>(`/indexes/${id}/composition`).catch(() => null) : Promise.resolve(null),
          ]);
          const real = (lv?.levels ?? []).map((l) => ({ ts: Number(l.ts), v: Number(l.level) / 1e18 }));
          const before = (lv?.backfill?.points ?? []).filter((p) => !real.length || p.ts < (real[0]?.ts ?? 0)).map((p) => ({ ts: p.ts, v: p.level }));
          return [id, { levels: [...before, ...real], replayed: before.length, detail, drift: comp ? Number(comp.maxDriftBps) : null }];
        }),
      ).then((rows) => live && setPer(Object.fromEntries(rows)));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      live = false;
      clearInterval(t);
    };
    // the scope's ids are the dependency (list identity changes on every poll)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const v = useMemo(
    () =>
      workspaceVM({
        indexes: list,
        levels: Object.fromEntries(Object.entries(per).map(([k, p]) => [k, p.levels])),
        details: Object.fromEntries(Object.entries(per).map(([k, p]) => [k, p.detail])),
        drift: Object.fromEntries(Object.entries(per).map(([k, p]) => [k, p.drift])),
        avax: (bench.data?.candles ?? []).map((c) => ({ ts: c.t + 86_400, v: c.c })),
        period,
        hidden,
        now,
      }),
    [list, per, bench.data, period, hidden, now],
  );

  const segBtn = (on: boolean, light: boolean): string =>
    light
      ? `border: 0; height: 44px; padding: 0 16px; border-radius: 12px; font-weight: 600; font-size: 15px; background: ${on ? "#F2F2F3" : "#17171A"}; color: ${on ? "#0B0B0D" : "#B4B4BB"}`
      : `border: 0; padding: 9px 14px; border-radius: 9px; font-weight: 600; font-size: 14px; background: ${on ? "#2A2A2F" : "transparent"}; color: ${on ? "#F2F2F3" : "#B4B4BB"}`;

  const empty: ReactNode =
    scope === "Your indexes" && !w.address ? (
      <span>
        <a href="/connect" style={css("color: #B18CFB; font-weight: 600")}>
          Connect
        </a>{" "}
        to see the indexes you created.
      </span>
    ) : scope === "Your indexes" ? (
      <span>
        You have not created an index yet.{" "}
        <a href="/create" style={css("color: #B18CFB; font-weight: 600")}>
          Create one
        </a>
        : it costs only gas.
      </span>
    ) : scope === "Watchlist" ? (
      <span>
        No watched index yet. Star one in the{" "}
        <a href="/" style={css("color: #B18CFB; font-weight: 600")}>
          Market
        </a>
        .
      </span>
    ) : (
      <span>No public index yet.</span>
    );

  return (
    <Page title="Workspace" active="workspace">
      <div style={css("padding: 28px 24px 32px; display: flex; flex-direction: column; gap: 16px")}>
        <div style={css("display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px")}>
          <h1 style={css("margin: 0; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 40px; letter-spacing: -0.05em")}>Workspace</h1>
          <div style={css("display: flex; flex-wrap: wrap; gap: 10px")}>
            <div role="group" aria-label="Indexes" style={css("display: flex; gap: 6px; flex-wrap: wrap")}>
              {SCOPES.map((s) => (
                <button key={s} type="button" aria-pressed={s === scope} onClick={() => setScope(s)} style={css(segBtn(s === scope, true))}>
                  {s}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Period" style={css("display: flex; gap: 2px; padding: 4px; border-radius: 12px; background: #17171A")}>
              {PERIODS.map((p) => (
                <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)} style={css(segBtn(p === period, false))}>
                  {`${p}D`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={css("border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20; padding: 18px 20px 14px; display: flex; flex-direction: column; gap: 14px")}>
          <div style={css("display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px")}>
            <span style={css("display: flex; flex-direction: column; gap: 2px")}>
              <h2 style={css("margin: 0; font-size: 17px; font-weight: 700")}>Level, rebased to 100 at period start</h2>
              {Object.values(per).some((p) => p.replayed > 0) ? (
                <span style={css("font-size: 12px; color: #8E8E96")}>Before an index was created, its line is replayed from real daily closes of its basket (a backtest).</span>
              ) : null}
            </span>
            <div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
              {v.legend.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={l.on}
                  onClick={() =>
                    setHidden((h) => {
                      const n = new Set(h);
                      if (n.has(l.id)) n.delete(l.id);
                      else n.add(l.id);
                      return n;
                    })
                  }
                  style={css(`display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid #26262B; font-weight: 600; font-size: 13px; background: ${l.bg}; color: ${l.fg}`)}
                >
                  <span style={css(`width: 10px; height: 3px; border-radius: 2px; background: ${l.col}`)} />
                  {l.t}
                </button>
              ))}
              <span style={css("display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; font-size: 13px; color: #8E8E96")}>
                <span style={css("width: 12px; border-top: 2px dashed #8E8E96")} />
                AVAX
              </span>
            </div>
          </div>
          {v.count === 0 ? (
            <div style={css("padding: 40px 0; text-align: center; font-size: 15px; color: #B4B4BB")}>{empty}</div>
          ) : (
            <>
              <div style={css("display: flex")}>
                <div style={css("flex: 1; min-width: 0; position: relative; height: 320px")}>
                  {v.ticks.map((g) => (
                    <div key={g.v} style={css(`position: absolute; left: 0; right: 0; top: ${g.top}; border-top: 1px solid ${g.line}`)} />
                  ))}
                  {v.lines.map((s) => (
                    <div key={s.key} style={css("position: absolute; inset: 0")}>
                      <svg viewBox="0 0 1000 300" preserveAspectRatio="none" style={css("width: 100%; height: 100%; display: block")} aria-hidden="true">
                        <polyline points={s.pts} fill="none" stroke={s.col} strokeWidth={s.sw} strokeDasharray={s.dash || undefined} vectorEffect="non-scaling-stroke" />
                      </svg>
                    </div>
                  ))}
                </div>
                <div style={css("width: 64px; flex: none; position: relative; height: 320px; font-size: 11px; color: #8E8E96")}>
                  {v.ticks.map((g) => (
                    <span key={g.v} style={css(`position: absolute; left: 10px; top: ${g.ltop}`)}>
                      {g.v}
                    </span>
                  ))}
                </div>
              </div>
              <div style={css("display: flex; justify-content: space-between; padding-right: 64px; font-size: 11px; color: #8E8E96")}>
                <span>{v.from}</span>
                <span>{v.to}</span>
              </div>
            </>
          )}
        </div>

        {v.count > 0 ? (
          <div style={css("overflow-x: auto; border-radius: 16px; border: 1px solid #1C1C20; background: #0E0E10")}>
            <table style={css("width: 100%; min-width: 1100px; border-collapse: collapse; font-size: 14px")}>
              <thead>
                <tr style={css("color: #8E8E96; font-size: 11px; letter-spacing: .08em; text-align: right")}>
                  <th scope="col" style={css("text-align: left; padding: 14px 20px; font-weight: 500")}>INDEX</th>
                  <th scope="col" style={css("padding: 14px 8px; font-weight: 500")}>LEVEL</th>
                  <th scope="col" style={css("padding: 14px 8px; font-weight: 500")}>RETURN · {v.rl}</th>
                  <th scope="col" style={css("padding: 14px 8px; font-weight: 500")}>VS AVAX</th>
                  <th scope="col" style={css("padding: 14px 8px; font-weight: 500")}>VOLATILITY</th>
                  <th scope="col" style={css("padding: 14px 8px; font-weight: 500")}>MAX DRAWDOWN</th>
                  <th scope="col" style={css("padding: 14px 8px; font-weight: 500")}>SINCE LAUNCH</th>
                  <th scope="col" style={css("text-align: left; padding: 14px 8px 14px 28px; font-weight: 500")}>REBALANCE</th>
                  <th scope="col" style={css("padding: 14px 20px")}>
                    <span style={css("position: absolute; left: -9999px")}>Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {v.rows.map((r) => (
                  <tr key={r.id} style={css("border-top: 1px solid #17171A; text-align: right")}>
                    <td style={css("text-align: left; padding: 14px 20px")}>
                      <div style={css("display: flex; align-items: center; gap: 12px")}>
                        <span style={css(`width: 4px; height: 30px; border-radius: 2px; background: ${r.col}`)} />
                        <div>
                          <div style={css("font-weight: 700; font-size: 15px")}>{r.n}</div>
                          <div style={css("font-size: 12px; color: #8E8E96")}>
                            {r.t} · {r.mode}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={css("padding: 14px 8px; font-weight: 700")}>{r.lv}</td>
                    <td style={css(`padding: 14px 8px; font-weight: 600; color: ${r.rc}`)}>{r.ret}</td>
                    <td style={css(`padding: 14px 8px; color: ${r.xc}`)}>{r.vs}</td>
                    <td style={css("padding: 14px 8px")}>{r.vol}</td>
                    <td style={css("padding: 14px 8px; color: #FF6B6B")}>{r.dd}</td>
                    <td style={css(`padding: 14px 8px; color: ${r.sc}`)}>{r.since}</td>
                    <td style={css("text-align: left; padding: 14px 8px 14px 28px")}>
                      <span style={css(`padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; background: ${r.sbg}; color: ${r.sfg}`)}>{r.st}</span>
                    </td>
                    <td style={css("padding: 10px 20px")}>
                      <a href={r.href} aria-label={`Open ${r.n}`} style={css("display: inline-block; padding: 10px 14px; border-radius: 10px; background: #1C1C20; font-weight: 700; font-size: 14px")}>
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {all.error ? <span style={css("font-size: 13px; color: #FF6B6B")}>{all.error.message}</span> : null}
      </div>
    </Page>
  );
}
