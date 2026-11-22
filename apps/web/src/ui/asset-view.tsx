"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "../lib/api";
import { useCandleHistory } from "../lib/candles";
import { CONFIG } from "../lib/config";
import { INTERVALS, intervalSpec, PAGE, DEFAULT_INTERVAL, type IntervalLabel } from "../lib/intervals";
import { css } from "../lib/tpl";
import type { AssetDetail, BoardRowView, CandlesView, IndexView, PoolView } from "../screens/asset.api";
import { buildChart, type ChartModel } from "../screens/asset.chart";
import type { NetworkView } from "../screens/network.vm";
import { Page } from "./page";
import { SymbolSearch } from "./symbol-search";
import { useWatchlist } from "./watchlist";
import { assetViewVM, variantOf, type DataTab, type ListTab } from "./asset-view.vm";

const CARD = "border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20";
const TILE = "border-radius: 14px; background: #0E0E10; border: 1px solid #1C1C20; text-align: center";

/** Candles of the picked interval, drawn like the reference: grid, wicks and bodies, right price axis, dates. */
function Chart({ m }: { m: ChartModel }): ReactNode {
  if (m.empty)
    return <div style={css("height: 380px; display: grid; place-items: center; color: #8E8E96; font-size: 14px")}>No price history yet.</div>;
  return (
    <>
      <div style={css("display: flex; padding: 8px 0 0 8px")}>
        <div style={css("flex: 1; min-width: 0; position: relative; height: 380px")}>
          <svg viewBox="0 0 1000 520" preserveAspectRatio="none" style={css("width: 100%; height: 100%; display: block")} aria-hidden="true">
            {m.gridY.map((y) => (
              <line key={`y${y}`} x1="0" x2="1000" y1={y} y2={y} stroke="#141417" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {m.last ? <line x1="0" x2="1000" y1={(m.last.pct / 100) * 520} y2={(m.last.pct / 100) * 520} stroke={m.last.col} strokeDasharray="2 3" opacity="0.7" vectorEffect="non-scaling-stroke" /> : null}
            {m.bars.map((b, k) => (
              <g key={k}>
                <rect x={b.wickX} y={b.wickY} width="1" height={b.wickH} fill={b.col} />
                <rect x={b.x} y={b.bodyY} width={b.w} height={b.bodyH} fill={b.col} rx="1" />
                {m.hasVolume ? <rect x={b.x} y={b.volY} width={b.w} height={b.volH} fill={b.col} opacity="0.3" /> : null}
              </g>
            ))}
          </svg>
        </div>
        <div style={css("width: 72px; flex: none; position: relative; height: 380px; border-left: 1px solid #17171A; font-size: 11px; color: #8E8E96")}>
          {m.yTicks.map((t) => (
            <span key={t.label} style={css(`position: absolute; left: 8px; top: calc(${t.pct}% - 7px)`)}>
              {t.label}
            </span>
          ))}
          {m.last ? (
            <span style={css(`position: absolute; left: 0; top: calc(${m.last.pct}% - 9px); padding: 2px 6px; background: ${m.last.col}; color: #0B0B0D; font-weight: 700`)}>{m.last.label}</span>
          ) : null}
        </div>
      </div>
      <div style={css("position: relative; height: 30px; margin: 0 80px 0 8px; font-size: 11px; color: #8E8E96")}>
        {m.xTicks.map((t, k) => (
          <span key={k} style={css(`position: absolute; top: 8px; left: ${t.pct}%; transform: translateX(-50%); white-space: nowrap`)}>
            {t.label}
          </span>
        ))}
      </div>
    </>
  );
}

/** `/asset/[id]`: chart page of a token, a stock or a Vietnamese stock (reference/index-layer). */
export default function AssetView({ id }: { id: string }): ReactNode {
  const enc = encodeURIComponent(id);
  const asset = useApi<AssetDetail>(`/assets/${enc}`, 15_000);
  const v = variantOf(asset.data);
  const kind = asset.data?.kind;
  const board = useApi<BoardRowView[]>(kind === "stock" || kind === "token" ? `/board?kind=${kind}s` : null, 30_000);
  const daily = useApi<CandlesView>(`/assets/${enc}/candles?interval=1d&limit=120`, 60_000);
  const pools = useApi<PoolView[]>(v === "vn" ? null : `/assets/${enc}/pools`);
  const indexes = useApi<IndexView[]>("/indexes", 60_000);
  const network = useApi<NetworkView>(v === "vn" ? "/network" : null, 10_000);
  const fx = useApi<{ vndPerUsd: number | null }>(v === "vn" ? "/fx" : null, 60_000);
  const [tf, setTf] = useState<IntervalLabel>(DEFAULT_INTERVAL);
  const spec = intervalSpec(tf);
  const hist = useCandleHistory(`/assets/${enc}/candles?interval=${spec.api}&limit=${spec.fetch}`, PAGE, 60_000);
  const [tab, setTab] = useState<ListTab>("Sources");
  const [dtab, setDtab] = useState<DataTab>("API");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const watch = useWatchlist();

  const vm = assetViewVM({
    asset: asset.data,
    board: (board.data ?? []).find((r) => r.id === id) ?? null,
    daily: daily.data,
    pools: pools.data ?? [],
    indexes: indexes.data ?? [],
    network: network.data,
    nowSec: now,
    watched: watch.ids.has(id.toLowerCase()),
    dtab,
    tab,
    apiUrl: CONFIG.apiUrl,
    vndPerUsd: fx.data?.vndPerUsd ?? null,
  });
  const candles = hist.data?.candles ?? [];
  // VN stock in ₫: the USD candles times the rate
  const k = vm.fx ?? 1;
  const chart = useMemo(
    () => buildChart(candles.slice(-spec.show).map((c) => (k === 1 ? c : { ...c, o: c.o * k, h: c.h * k, l: c.l * k, c: c.c * k }))),
    [candles, spec.show, k],
  );

  const copy = (): void => {
    void navigator.clipboard?.writeText(vm.data.copy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Page title={vm.loaded ? `${vm.sym} · ${vm.type.label}` : "Asset"} active="market">
      <div style={css("padding: 16px; display: flex; flex-direction: column; gap: 14px")}>
        {asset.error ? <div style={css(`${CARD}; padding: 20px; color: #FF6B6B`)}>{asset.error.message}</div> : null}
        <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 12px")}>
          <a href="/" aria-label="Back to Market" style={css("width: 44px; height: 44px; border-radius: 12px; background: #131316; display: grid; place-items: center")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F2F2F3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <SymbolSearch label={vm.sym}>
            {vm.logo ? <img src={vm.logo} alt="" style={css("width: 32px; height: 32px; border-radius: 50%")} /> : <span aria-hidden="true" style={css(`width: 32px; height: 32px; border-radius: 50%; background: ${vm.color}`)} />}
            <h1 style={css("margin: 0; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 28px; letter-spacing: -0.04em")}>{vm.sym}</h1>
          </SymbolSearch>
          <span style={css("color: #8E8E96; font-size: 15px")}>{vm.name}</span>
          <span style={css(`padding: 4px 8px; border-radius: 7px; background: ${vm.type.bg}; font-weight: 700; font-size: 13px; color: ${vm.type.fg}`)}>{vm.type.label}</span>
          {vm.source.label ? (
            <span style={css("display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; background: #131316; font-size: 13px; font-weight: 500; color: #B4B4BB")}>
              <span style={css(`width: 6px; height: 6px; border-radius: 50%; background: ${vm.source.dot}`)} />
              {vm.source.label}
            </span>
          ) : null}
          {vm.session ? (
            <span style={css(`display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; background: ${vm.session.bg}; font-size: 13px; font-weight: 600; color: ${vm.session.fg}`)}>{vm.session.label}</span>
          ) : null}
          <button
            type="button"
            onClick={() => watch.toggle(id)}
            aria-pressed={vm.star.on}
            style={css("margin-left: auto; display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border: 1px solid #26262B; border-radius: 12px; background: #131316; color: #F2F2F3; font-weight: 700; font-size: 14px")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill={vm.star.on ? "#F5B14C" : "none"} stroke={vm.star.on ? "#F5B14C" : "#8E8E96"} strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
            {vm.star.label}
          </button>
        </div>

        <div style={css("display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start")}>
          <div style={css("flex: 999 1 640px; min-width: 0; display: flex; flex-direction: column; gap: 14px")}>
            <div style={css(`${CARD}; overflow: hidden`)}>
              <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 12px 16px; border-bottom: 1px solid #17171A; font-size: 14px")}>
                {INTERVALS.map((x) => (
                  <button key={x.label} type="button" aria-pressed={x.label === tf} onClick={() => setTf(x.label)} style={css(`border: 0; background: transparent; padding: 6px 8px; font-weight: 600; color: ${x.label === tf ? "#F2F2F3" : "#8E8E96"}`)}>
                    {x.label}
                  </button>
                ))}
                {v === "vn" ? (
                  <span style={css("margin-left: auto")}>
                    <span style={css("font-weight: 700")}>{vm.fx ? "VND" : "USD"}</span>
                    <span style={css("color: #46464D; margin: 0 6px")}>/</span>
                    <span style={css("color: #8E8E96; font-weight: 500")}>{vm.fx ? "USD" : "VND"}</span>
                  </span>
                ) : (
                  <span style={css("margin-left: auto; color: #8E8E96; font-weight: 500")}>{vm.pair}</span>
                )}
              </div>
              <div style={css("padding: 12px 16px 0; font-size: 13px; display: flex; gap: 12px; flex-wrap: wrap")}>
                <b>{`${vm.pair} · ${tf}`}</b>
                {chart.ohlc ? (
                  <>
                    <span style={css("color: #8E8E96")}>
                      O <span style={css(`color: ${chart.ohlc.col}`)}>{chart.ohlc.o}</span>
                    </span>
                    <span style={css("color: #8E8E96")}>
                      H <span style={css(`color: ${chart.ohlc.col}`)}>{chart.ohlc.h}</span>
                    </span>
                    <span style={css("color: #8E8E96")}>
                      L <span style={css(`color: ${chart.ohlc.col}`)}>{chart.ohlc.l}</span>
                    </span>
                    <span style={css("color: #8E8E96")}>
                      C <span style={css(`color: ${chart.ohlc.col}`)}>{chart.ohlc.c}</span>
                    </span>
                    <span style={css(`color: ${chart.ohlc.col}`)}>{chart.ohlc.chg}</span>
                  </>
                ) : null}
              </div>
              <Chart m={chart} />
            </div>

            <div style={css(`${CARD}; overflow: hidden`)}>
              <div role="tablist" style={css("display: flex; gap: 4px; padding: 0 12px; border-bottom: 1px solid #17171A")}>
                {vm.tabs.map((x) => (
                  <button
                    key={x}
                    type="button"
                    role="tab"
                    aria-selected={x === tab}
                    onClick={() => setTab(x)}
                    style={css(`border: 0; background: transparent; padding: 14px 12px; font-weight: 600; font-size: 14px; color: ${x === tab ? "#F2F2F3" : "#8E8E96"}; box-shadow: inset 0 -2px 0 ${x === tab ? "#9052F9" : "transparent"}`)}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <div style={css("overflow-x: auto")}>
                <table style={css("width: 100%; min-width: 720px; border-collapse: collapse; font-size: 14px")}>
                  <thead>
                    <tr style={css("color: #8E8E96; font-size: 11px; letter-spacing: .08em")}>
                      {vm.cols.map((h) => (
                        <th key={h.t} scope="col" style={css(`padding: 12px 20px; font-weight: 500; text-align: ${h.al}`)}>
                          {h.t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vm.rows.length ? (
                      vm.rows.map((r, k) => (
                        <tr key={k} style={css("border-top: 1px solid #17171A")}>
                          <td style={css("padding: 12px 20px")}>
                            <div style={css("font-weight: 600")}>{r.a}</div>
                            <div style={css("font-size: 12px; color: #8E8E96")}>{r.a2}</div>
                          </td>
                          <td style={css("padding: 12px 20px; text-align: right")}>{r.b}</td>
                          <td style={css("padding: 12px 20px; text-align: right")}>{r.c}</td>
                          <td style={css("padding: 12px 20px; text-align: right")}>{r.d}</td>
                          <td style={css(`padding: 12px 20px; text-align: right; color: ${r.ec}`)}>{r.e}</td>
                        </tr>
                      ))
                    ) : (
                      <tr style={css("border-top: 1px solid #17171A")}>
                        <td colSpan={5} style={css("padding: 16px 20px; color: #8E8E96")}>
                          {vm.emptyRows}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside style={css("flex: 1 1 320px; min-width: 0; max-width: 100%; display: flex; flex-direction: column; gap: 10px")}>
            <div style={css("display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px")}>
              <div style={css(`padding: 14px; ${TILE}`)}>
                <div style={css("font-size: 11px; letter-spacing: .08em; color: #8E8E96")}>PRICE</div>
                <div style={css("font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 26px; margin-top: 4px")}>{vm.price}</div>
                {vm.priceSub ? <div style={css("font-size: 12px; color: #8E8E96")}>{vm.priceSub}</div> : null}
              </div>
              <div style={css(`padding: 14px; ${TILE}`)}>
                <div style={css("font-size: 11px; letter-spacing: .08em; color: #8E8E96")}>24H</div>
                <div style={css(`font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 26px; margin-top: 4px; color: ${vm.d24c}`)}>{vm.d24}</div>
                {vm.d24Sub ? <div style={css("font-size: 12px; color: #8E8E96")}>{vm.d24Sub}</div> : null}
              </div>
            </div>
            <div style={css(`display: grid; grid-template-columns: repeat(${vm.tiles.length}, minmax(0, 1fr)); gap: 8px`)}>
              {vm.tiles.map((t) => (
                <div key={t.k} style={css(`padding: 12px; ${TILE}`)}>
                  <div style={css("font-size: 11px; letter-spacing: .08em; color: #8E8E96")}>{t.k}</div>
                  <div style={css("font-weight: 700; font-size: 16px; margin-top: 4px")}>{t.v}</div>
                </div>
              ))}
            </div>
            <div style={css("display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-radius: 14px; background: #0E0E10; border: 1px solid #1C1C20; overflow: hidden")}>
              {vm.perf.map((p, k) => (
                <div key={p.k} style={css(`padding: 10px 4px; text-align: center${k ? "; border-left: 1px solid #17171A" : ""}`)}>
                  <div style={css("font-size: 11px; color: #8E8E96")}>{p.k}</div>
                  <div style={css(`font-weight: 600; color: ${p.c}`)}>{p.v}</div>
                </div>
              ))}
            </div>

            <div style={css(`padding: 16px; ${CARD}; display: flex; flex-direction: column; gap: 10px`)}>
              <h2 style={css("margin: 0; font-size: 15px; font-weight: 700")}>Price data</h2>
              <div style={css("padding: 14px 16px; border-radius: 14px; background: #131316; display: flex; align-items: center; justify-content: space-between; gap: 10px")}>
                <div>
                  <div style={css("font-size: 13px; color: #B4B4BB")}>{vm.priceCard.title}</div>
                  <div style={css("font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 22px; margin-top: 2px")}>{vm.priceCard.value}</div>
                </div>
                <span style={css(`padding: 6px 10px; border-radius: 20px; background: ${vm.priceCard.pill.bg}; color: ${vm.priceCard.pill.fg}; font-size: 13px; font-weight: 700; white-space: nowrap`)}>{vm.priceCard.pill.label}</span>
              </div>
              {vm.priceCard.rows.map((r) => (
                <div key={r.k} style={css("display: flex; justify-content: space-between; gap: 12px; font-size: 14px")}>
                  <span style={css("color: #B4B4BB")}>{r.k}</span>
                  <span style={css(r.mono ? "font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px" : "text-align: right")}>{r.v}</span>
                </div>
              ))}
              {vm.priceCard.networkLink ? (
                <a href="/network" style={css("height: 44px; border-radius: 12px; background: #131316; display: grid; place-items: center; font-weight: 700; font-size: 14px")}>
                  See it on Network
                </a>
              ) : null}
            </div>

            <div style={css(`padding: 16px; ${CARD}; display: flex; flex-direction: column; gap: 12px`)}>
              <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 8px")}>
                <h2 style={css("margin: 0; font-size: 15px; font-weight: 700")}>Use this data</h2>
                <span style={css("display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #3DD68C")}>
                  <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #3DD68C")} />
                  Live
                </span>
              </div>
              <div role="group" aria-label="Access" style={css("display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; padding: 4px; border-radius: 12px; background: #131316")}>
                {vm.data.tabs.map((x) => (
                  <button key={x} type="button" aria-pressed={x === dtab} onClick={() => setDtab(x)} style={css(`border: 0; height: 36px; border-radius: 9px; font-weight: 700; font-size: 13px; white-space: nowrap; background: ${x === dtab ? "#2A2A2F" : "transparent"}; color: ${x === dtab ? "#F2F2F3" : "#8E8E96"}`)}>
                    {x}
                  </button>
                ))}
              </div>
              <div style={css("border-radius: 12px; background: #060607; border: 1px solid #1F1F23; overflow: hidden")}>
                <div style={css("padding: 8px 14px; border-bottom: 1px solid #17171A; font-size: 11px; font-weight: 700; letter-spacing: .08em; color: #8E8E96")}>{vm.data.kind}</div>
                <pre style={css("margin: 0; padding: 12px 14px; white-space: pre-wrap; overflow-wrap: anywhere; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12.5px; line-height: 1.6; color: #D6D6DA")}>{vm.data.code}</pre>
              </div>
              <div style={css("display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px")}>
                <div style={css("padding: 12px 14px; border-radius: 12px; background: #131316")}>
                  <div style={css("font-size: 12px; color: #8E8E96")}>{vm.data.v1l}</div>
                  <div style={css("margin-top: 2px; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 20px; white-space: nowrap")}>{vm.data.v1}</div>
                </div>
                <div style={css("padding: 12px 14px; border-radius: 12px; background: #131316")}>
                  <div style={css("font-size: 12px; color: #8E8E96")}>{vm.data.v2l}</div>
                  <div style={css("margin-top: 2px; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 20px; white-space: nowrap")}>{vm.data.v2}</div>
                </div>
              </div>
              <p style={css("margin: 0; font-size: 13px; color: #8E8E96; line-height: 1.5")}>{vm.data.note}</p>
              <button type="button" onClick={copy} style={css("border: 0; height: 48px; border-radius: 12px; background: #F2F2F3; color: #0B0B0D; font-weight: 700; font-size: 15px")}>
                {copied ? "Copied" : vm.data.cta}
              </button>
            </div>

            <div style={css(`padding: 16px; ${CARD}`)}>
              <h2 style={css("margin: 0 0 6px; font-size: 15px; font-weight: 700")}>{`In ${vm.inIdx.length} ${vm.inIdx.length === 1 ? "index" : "indexes"}`}</h2>
              {vm.inIdx.length ? (
                vm.inIdx.map((x) => (
                  <a key={x.href} href={x.href} style={css("display: flex; justify-content: space-between; padding: 12px 2px; border-top: 1px solid #17171A; font-weight: 600")}>
                    <span>{x.n}</span>
                    <span style={css("color: #B4B4BB")}>{x.w}</span>
                  </a>
                ))
              ) : (
                <div style={css("padding: 12px 2px; border-top: 1px solid #17171A; font-size: 14px; color: #8E8E96")}>No public index holds it yet.</div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
