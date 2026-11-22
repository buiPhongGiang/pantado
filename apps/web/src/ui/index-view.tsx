"use client";
/**
 * Index chart page (app/index/[id]) of reference/index-layer/Index.dc.html: header, rebalance banner, level chart,
 * Composition / Rebalances / Verification tabs, and the aside with the level, returns and "Use this data". The
 * creator of a data index gets New version, Edit basket and Make public. Nothing is bought or sold.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isAddress, type Address } from "viem";
import { tx } from "@pantado/sdk";
import { useApi } from "../lib/api";
import { CONFIG, networkNames } from "../lib/config";
import { css } from "../lib/tpl";
import { useTx, useWallet } from "../lib/wallet";
import type { AssetView } from "../screens/asset.api";
import type { Composition, IndexDetail, IndexEvent, Levels, Rebalances } from "../screens/index.data";
import { Page } from "./page";
import { SymbolSearch } from "./symbol-search";
import { indexViewVM, type Access, type BoardRow, type Tf, type ViewTab } from "./index-view.vm";

const CARD = "border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20";
const TAG = "display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 10px; background: #131316; font-size: 13px; font-weight: 500; color: #B4B4BB";
const ACT = "display: inline-flex; align-items: center; height: 36px; padding: 0 12px; border-radius: 10px; background: #1C1C20; font-weight: 700; font-size: 13px; border: 0; color: #F2F2F3";

export default function IndexView({ id }: { id: string }): ReactNode {
  const valid = isAddress(id);
  const base = valid ? `/indexes/${id}` : null;
  const detail = useApi<IndexDetail>(base, 15_000);
  const comp = useApi<Composition>(base && `${base}/composition`, 10_000);
  const levels = useApi<Levels>(base && `${base}/levels?limit=1000`, 30_000);
  const reb = useApi<Rebalances>(base && `${base}/rebalances`, 30_000);
  const txs = useApi<IndexEvent[]>(base && `${base}/transactions`, 30_000);
  const assets = useApi<AssetView[]>("/assets", 60_000);
  const board = useApi<BoardRow[]>("/board", 60_000);
  const w = useWallet();
  const pubTx = useTx();
  const [tf, setTf] = useState<Tf>("1D");
  const [tab, setTab] = useState<ViewTab>("Composition");
  const [access, setAccess] = useState<Access>("API");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const v = useMemo(
    () =>
      indexViewVM({
        detail: detail.data,
        comp: comp.data,
        levels: levels.data,
        reb: reb.data,
        txs: txs.data,
        assets: assets.data ?? [],
        board: board.data ?? [],
        now,
        me: w.address,
        tf,
        tab,
        access,
        env: { apiUrl: CONFIG.apiUrl, registry: CONFIG.deployment?.contracts.indexRegistry ?? null, netTag: networkNames(CONFIG.network).badge },
      }),
    [detail.data, comp.data, levels.data, reb.data, txs.data, assets.data, board.data, now, w.address, tf, tab, access],
  );

  const registry = CONFIG.deployment?.contracts.indexRegistry ?? null;
  const makePublic = (): void => {
    if (!registry || pubTx.state.status === "pending") return;
    void pubTx.run([tx.makeIndexPublic(registry, id as Address)]).then((h) => {
      if (h) detail.reload();
    });
  };
  const copy = (): void => {
    void navigator.clipboard?.writeText(v.dcode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const error = !valid ? "This is not an index address." : (detail.error?.message ?? null);
  const c = v.chart;

  return (
    <Page title={v.ready ? v.name : "Index"} active="market">
      <div style={css("padding: 16px; display: flex; flex-direction: column; gap: 14px")}>
        <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 14px")}>
          <a href="/" aria-label="Back to Market" style={css("width: 44px; height: 44px; border-radius: 12px; background: #131316; display: grid; place-items: center")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F2F2F3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <SymbolSearch label={v.name}>
            <h1 style={css("margin: 0; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 28px; letter-spacing: -0.04em")}>{v.name}</h1>
          </SymbolSearch>
          {v.ticker ? <span style={css("padding: 4px 8px; border-radius: 7px; background: #1C1C20; font-weight: 700; font-size: 13px; color: #B4B4BB")}>{v.ticker}</span> : null}
          {v.by ? <span style={css("color: #8E8E96; font-size: 15px")}>by {v.by}</span> : null}
          <span style={css(TAG)}>
            <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #F5B14C")} />
            {v.netTag}
          </span>
          {v.modeTag ? (
            <span style={css(TAG)}>
              <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #9052F9")} />
              {v.modeTag}
            </span>
          ) : null}
          {v.isPrivate ? <span style={css("padding: 6px 10px; border-radius: 10px; background: #1F1F23; font-size: 13px; font-weight: 600; color: #B4B4BB")}>Private</span> : null}
          {v.canEdit ? (
            <span style={css("margin-left: auto; display: flex; flex-wrap: wrap; gap: 8px")}>
              <a href={`/version/${id}`} style={css(ACT)}>
                New version
              </a>
              <a href={`/create?edit=${id}`} style={css(ACT)}>
                Edit basket
              </a>
              {v.isPrivate ? (
                <button type="button" onClick={makePublic} style={css("display: inline-flex; align-items: center; height: 36px; padding: 0 12px; border-radius: 10px; background: #F2F2F3; color: #0B0B0D; font-weight: 700; font-size: 13px; border: 0")}>
                  {pubTx.state.status === "pending" ? "Confirm in wallet…" : "Make public"}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
        {pubTx.state.status === "failed" ? <div style={css("font-size: 13px; color: #FF6B6B")}>{pubTx.state.error.message}</div> : null}
        {error ? <div style={css(`${CARD}; padding: 18px 20px; color: #FF6B6B; font-size: 14px`)}>{error}</div> : null}

        {v.banner ? (
          <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 14px; background: #17130C; border: 1px solid #3A2C12")}>
            <span style={css("padding: 4px 10px; border-radius: 8px; background: #2E2311; color: #F5B14C; font-weight: 600; font-size: 13px")}>{v.banner.pill}</span>
            <span style={css("font-weight: 600; font-size: 15px; flex: 1")}>{v.banner.text}</span>
            <button type="button" onClick={() => setTab("Rebalances")} style={css("border: 0; background: transparent; color: #F5B14C; font-weight: 600; font-size: 15px")}>
              View changes
            </button>
          </div>
        ) : null}

        <div style={css("display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start")}>
          <div style={css("flex: 999 1 640px; min-width: 0; display: flex; flex-direction: column; gap: 14px")}>
            <div style={css(`${CARD}; overflow: hidden`)}>
              <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 12px 16px; border-bottom: 1px solid #17171A; font-size: 14px")}>
                {v.tfs.map((t) => (
                  <button key={t.label} type="button" aria-pressed={t.on} onClick={() => setTf(t.label)} style={css(`border: 0; background: transparent; padding: 6px 8px; font-weight: 600; color: ${t.on ? "#F2F2F3" : "#8E8E96"}`)}>
                    {t.label}
                  </button>
                ))}
                <span style={css("margin-left: auto; font-weight: 700")}>Level</span>
                <span style={css("color: #46464D; margin: 0 6px")}>/</span>
                <span style={css("color: #8E8E96; font-weight: 500")}>USD</span>
              </div>
              {c.ohlc ? (
                <div style={css("padding: 12px 16px 0; font-size: 13px; display: flex; gap: 12px; flex-wrap: wrap")}>
                  <b>
                    {v.name} · {tf}
                  </b>
                  <span style={css("color: #8E8E96")}>
                    O <span style={css(`color: ${c.ohlc.col}`)}>{c.ohlc.o}</span>
                  </span>
                  <span style={css("color: #8E8E96")}>
                    H <span style={css(`color: ${c.ohlc.col}`)}>{c.ohlc.h}</span>
                  </span>
                  <span style={css("color: #8E8E96")}>
                    L <span style={css(`color: ${c.ohlc.col}`)}>{c.ohlc.l}</span>
                  </span>
                  <span style={css("color: #8E8E96")}>
                    C <span style={css(`color: ${c.ohlc.col}`)}>{c.ohlc.c}</span>
                  </span>
                  <span style={css(`color: ${c.ohlc.col}`)}>{c.ohlc.chg}</span>
                </div>
              ) : null}
              <div style={css("display: flex; padding: 8px 0 0 8px")}>
                <div style={css("flex: 1; min-width: 0; position: relative; height: 380px")}>
                  {c.grid.map((g) => (
                    <div key={g.top} style={css(`position: absolute; left: 0; right: 0; top: ${g.top}; border-top: 1px solid #141417`)} />
                  ))}
                  {c.last ? <div style={css(`position: absolute; left: 0; right: 0; top: ${c.last.top}; border-top: 1px dotted ${c.last.col}; opacity: .7`)} /> : null}
                  {c.empty ? (
                    <div style={css("position: absolute; inset: 0; display: grid; place-items: center; color: #8E8E96; font-size: 14px")}>{levels.data ? "No level history yet." : "Reading the level history…"}</div>
                  ) : (
                    <svg viewBox={c.viewBox} preserveAspectRatio="none" style={css("position: absolute; inset: 0; width: 100%; height: 100%; display: block")} aria-label={`${v.name} level, ${tf} candles`} role="img">
                      {c.candles.map((k, n) => (
                        <g key={n}>
                          <rect x={k.wick.x} y={k.wick.y} width={1} height={k.wick.h} fill={k.col} />
                          <rect x={k.body.x} y={k.body.y} width={k.body.w} height={k.body.h} fill={k.col} rx={1} />
                        </g>
                      ))}
                    </svg>
                  )}
                </div>
                <div style={css("width: 64px; flex: none; position: relative; height: 380px; border-left: 1px solid #17171A; font-size: 11px; color: #8E8E96")}>
                  {c.grid.map((g) => (
                    <span key={g.top} style={css(`position: absolute; left: 8px; top: calc(${g.top} - 7px)`)}>
                      {g.label}
                    </span>
                  ))}
                  {c.last ? <span style={css(`position: absolute; left: 0; top: calc(${c.last.top} - 9px); padding: 2px 6px; background: ${c.last.col}; color: #0B0B0D; font-weight: 700`)}>{c.last.text}</span> : null}
                </div>
              </div>
              <div style={css("position: relative; height: 28px; margin: 0 72px 4px 8px; font-size: 11px; color: #8E8E96")}>
                {c.xLabels.map((x) => (
                  <span key={x.left + x.text} style={css(`position: absolute; top: 8px; left: ${x.left}; transform: translateX(-50%); white-space: nowrap`)}>
                    {x.text}
                  </span>
                ))}
              </div>
            </div>

            <div style={css(`${CARD}; overflow: hidden`)}>
              <div role="tablist" style={css("display: flex; gap: 4px; padding: 0 12px; border-bottom: 1px solid #17171A; overflow-x: auto")}>
                {v.tabs.map((t) => (
                  <button key={t.label} type="button" role="tab" aria-selected={t.on} onClick={() => setTab(t.label)} style={css(`border: 0; background: transparent; padding: 14px 12px; font-weight: 600; font-size: 14px; white-space: nowrap; color: ${t.on ? "#F2F2F3" : "#8E8E96"}; box-shadow: inset 0 -2px 0 ${t.on ? "#9052F9" : "transparent"}`)}>
                    {t.label}
                  </button>
                ))}
              </div>
              {v.showComp ? (
                <div style={css("overflow-x: auto")}>
                  <table style={css("width: 100%; min-width: 760px; border-collapse: collapse; font-size: 14px")}>
                    <thead>
                      <tr style={css("color: #8E8E96; font-size: 11px; letter-spacing: .08em")}>
                        <th style={css("text-align: left; padding: 12px 20px; font-weight: 500")}>ASSET</th>
                        <th style={css("text-align: right; padding: 12px 8px; font-weight: 500")}>WEIGHT</th>
                        <th style={css("text-align: right; padding: 12px 8px; font-weight: 500")}>PRICE</th>
                        <th style={css("text-align: right; padding: 12px 8px; font-weight: 500")}>24H</th>
                        <th style={css("text-align: right; padding: 12px 8px; font-weight: 500")}>30D</th>
                        <th style={css("text-align: left; padding: 12px 20px 12px 32px; font-weight: 500")}>PRICE SOURCE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.compRows.map((a) => (
                        <tr key={a.t} style={css("border-top: 1px solid #17171A")}>
                          <td style={css("padding: 12px 20px")}>
                            <a href={a.href ?? "#"} style={css("display: flex; align-items: center; gap: 10px")}>
                              {a.img ? <img src={a.img} alt="" style={css("width: 24px; height: 24px; border-radius: 50%")} /> : <span aria-hidden="true" style={css(`width: 24px; height: 24px; border-radius: 50%; background: ${a.color}`)} />}
                              <b>{a.t}</b>
                              <span style={css("color: #8E8E96")}>{a.k}</span>
                            </a>
                          </td>
                          <td style={css("padding: 12px 8px; text-align: right; font-weight: 600")}>{a.w}</td>
                          <td style={css(`padding: 12px 8px; text-align: right; ${a.fresh ? "" : "color: #F5B14C"}`)} title={a.fresh ? undefined : "Price out of date"}>
                            {a.px}
                          </td>
                          <td style={css(`padding: 12px 8px; text-align: right; color: ${a.c1}`)}>{a.d}</td>
                          <td style={css(`padding: 12px 8px; text-align: right; color: ${a.c30}`)}>{a.m}</td>
                          <td style={css("padding: 12px 20px 12px 32px; font-size: 13px; color: #B4B4BB")}>
                            <span style={css(`display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 6px; background: ${a.dot}`)} />
                            {a.src}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={css("padding: 8px 20px 16px")}>
                  {v.events.length === 0 ? <div style={css("padding: 12px 0; color: #8E8E96; font-size: 14px")}>Nothing yet.</div> : null}
                  {v.events.map((e, k) => (
                    <div key={k} style={css("display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 16px; padding: 12px 0; border-top: 1px solid #17171A; font-size: 14px")}>
                      <span style={css("color: #8E8E96")}>{e.when}</span>
                      <span>{e.what}</span>
                      <span style={css("font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: #8E8E96")}>{e.ref}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside style={css("flex: 1 1 320px; min-width: 0; max-width: 100%; display: flex; flex-direction: column; gap: 10px")}>
            <div style={css("display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px")}>
              <div style={css(`padding: 14px; ${CARD}; border-radius: 14px; text-align: center`)}>
                <div style={css("font-size: 11px; letter-spacing: .08em; color: #8E8E96")}>LEVEL</div>
                <div style={css("font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 26px; margin-top: 4px")}>{v.levelS}</div>
              </div>
              <div style={css(`padding: 14px; ${CARD}; border-radius: 14px; text-align: center`)}>
                <div style={css("font-size: 11px; letter-spacing: .08em; color: #8E8E96")}>SINCE LAUNCH</div>
                <div style={css(`font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 26px; margin-top: 4px; color: ${v.sinceCol}`)}>{v.sinceS}</div>
              </div>
            </div>
            <div style={css("display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px")}>
              {v.stats.map((s) => (
                <div key={s.label} style={css(`padding: 12px; ${CARD}; border-radius: 14px; text-align: center`)}>
                  <div style={css("font-size: 11px; letter-spacing: .08em; color: #8E8E96")}>{s.label}</div>
                  <div style={css("font-weight: 700; font-size: 16px; margin-top: 4px")}>{s.val}</div>
                </div>
              ))}
            </div>
            <div style={css(`display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); ${CARD}; border-radius: 14px; overflow: hidden`)}>
              {v.strip.map((s, k) => (
                <div key={s.label} style={css(`padding: 10px 4px; text-align: center; ${k ? "border-left: 1px solid #17171A" : ""}`)}>
                  <div style={css("font-size: 11px; color: #8E8E96")}>{s.label}</div>
                  <div style={css(`font-weight: 600; color: ${s.col}`)}>{s.val}</div>
                </div>
              ))}
            </div>
            {v.share ? (
              <div style={css("padding: 2px 2px 6px")}>
                <div style={css("display: flex; justify-content: space-between; font-size: 13px; color: #B4B4BB")}>
                  <span>Stocks {v.share.stocks}%</span>
                  <span>Tokens {v.share.tokens}%</span>
                </div>
                <div style={css("display: flex; gap: 3px; margin-top: 6px")}>
                  {v.share.stocks > 0 ? <span style={css(`flex: ${v.share.stocks}; height: 4px; border-radius: 2px; background: #F2F2F3`)} /> : null}
                  {v.share.tokens > 0 ? <span style={css(`flex: ${v.share.tokens}; height: 4px; border-radius: 2px; background: #9052F9`)} /> : null}
                </div>
              </div>
            ) : null}

            <div style={css(`padding: 16px; ${CARD}; display: flex; flex-direction: column; gap: 12px`)}>
              <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 8px")}>
                <h2 style={css("margin: 0; font-size: 15px; font-weight: 700")}>Use this data</h2>
                <span style={css("display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #3DD68C")}>
                  <span style={css("width: 6px; height: 6px; border-radius: 50%; background: #3DD68C")} />
                  Live
                </span>
              </div>
              <div role="group" aria-label="Access" style={css("display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2px; padding: 4px; border-radius: 12px; background: #131316")}>
                {v.access.map((a) => (
                  <button key={a.label} type="button" aria-pressed={a.on} onClick={() => setAccess(a.label)} style={css(`border: 0; height: 36px; border-radius: 9px; font-weight: 700; font-size: 13px; white-space: nowrap; background: ${a.on ? "#2A2A2F" : "transparent"}; color: ${a.on ? "#F2F2F3" : "#8E8E96"}`)}>
                    {a.label}
                  </button>
                ))}
              </div>
              <div style={css("border-radius: 12px; background: #060607; border: 1px solid #1F1F23; overflow: hidden")}>
                <div style={css("padding: 8px 14px; border-bottom: 1px solid #17171A; font-size: 11px; font-weight: 700; letter-spacing: .08em; color: #8E8E96")}>{v.dkind}</div>
                <pre style={css("margin: 0; padding: 12px 14px; white-space: pre-wrap; overflow-wrap: anywhere; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12.5px; line-height: 1.6; color: #D6D6DA")}>{v.dcode}</pre>
              </div>
              <div style={css("display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px")}>
                <div style={css("padding: 12px 14px; border-radius: 12px; background: #131316")}>
                  <div style={css("font-size: 12px; color: #8E8E96")}>Level</div>
                  <div style={css("margin-top: 2px; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 20px; white-space: nowrap")}>{v.dv1}</div>
                </div>
                <div style={css("padding: 12px 14px; border-radius: 12px; background: #131316")}>
                  <div style={css("font-size: 12px; color: #8E8E96")}>Block</div>
                  <div style={css("margin-top: 2px; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 20px; white-space: nowrap")}>{v.dv2}</div>
                </div>
              </div>
              <div style={css(`display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: ${v.dfresh ? "#3DD68C" : "#F5B14C"}`)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12l5 5 9-10" />
                </svg>
                {v.dcheck}
              </div>
              <p style={css("margin: 0; font-size: 13px; color: #8E8E96; line-height: 1.5")}>{v.dnote}</p>
              <button type="button" onClick={copy} style={css("border: 0; height: 48px; border-radius: 12px; background: #F2F2F3; color: #0B0B0D; font-weight: 700; font-size: 15px")}>
                {copied ? "Copied" : v.dcta}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
