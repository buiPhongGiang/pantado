"use client";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "../lib/api";
import { css } from "../lib/tpl";
import { Page } from "../ui/page";
import type { AssetView, IndexView } from "./asset.api";
import { networkVM, TONE, type NetworkView, type Tone } from "./network.vm";

export const title = "Network";

/** reference/index-layer Network: dots and notes per tone (idle = grey). */
const DOT: Record<Tone, string> = { good: "#3DD68C", warn: "#F5B14C", bad: "#FF6B6B", idle: "#8E8E96" };
const CARD = "border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20";
const MONO = "font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; font-size: 13px";
const FLOW_CSS =
  "@keyframes flow{from{transform:translateX(-8px);opacity:0}50%{opacity:1}to{transform:translateX(8px);opacity:0}}@media (prefers-reduced-motion: reduce){.flowdot{animation:none !important}}" +
  "@media (max-width: 900px){.netflow{grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;gap:10px}.netflow .flowarrow{display:none !important}}" +
  "@media (max-width: 560px){.netprices{grid-template-columns:repeat(2,minmax(0,1fr)) !important}}";

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }): ReactNode {
  return (
    <section style={css("display: flex; flex-direction: column; gap: 12px")}>
      <div style={css("display: flex; align-items: baseline; justify-content: space-between; gap: 12px")}>
        <h2 style={css("margin: 0; font-size: 17px; font-weight: 700")}>{title}</h2>
        {sub ? <span style={css("font-size: 13px; color: #8E8E96")}>{sub}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Network page (reference/index-layer/Network): the Pantado Price Chain read live from the L1 and the C-Chain —
 * the flow strip (reporters → final on L1 → ICM → C-Chain), prices, rounds and reporters, as in the canvas.
 * Nothing here is bought or sold.
 */
export default function Network(): ReactNode {
  const net = useApi<NetworkView>("/network", 5_000);
  const assets = useApi<AssetView[]>("/assets", 60_000);
  const indexes = useApi<IndexView[]>("/indexes", 30_000);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const v = useMemo(() => (net.data ? networkVM(net.data, assets.data ?? [], indexes.data ?? [], now) : null), [net.data, assets.data, indexes.data, now]);
  const live = v ? v.stages.every((s) => s.tone === "good") : false;

  return (
    <Page title={title} active="network">
      <style>{FLOW_CSS}</style>
      <div style={css("padding: 32px 24px 32px; display: flex; flex-direction: column; gap: 24px")}>
        <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 12px")}>
          <h1 style={css("margin: 0; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 40px; letter-spacing: -0.05em")}>Network</h1>
          <span style={css("padding: 4px 10px; border-radius: 999px; background: #221637; color: #C9B3FD; font-size: 12px; font-weight: 600")}>Pantado Price Chain · Avalanche L1</span>
          {v ? (
            <span style={css(`margin-left: auto; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: ${live ? "#3DD68C" : "#F5B14C"}`)}>
              <span style={css(`width: 8px; height: 8px; border-radius: 50%; background: ${live ? "#3DD68C" : "#F5B14C"}`)} />
              {live ? "Live" : "Degraded"}
            </span>
          ) : null}
        </div>

        {!v ? (
          <div style={css(`${CARD}; padding: 28px 20px; color: #B4B4BB; font-size: 14px`)}>
            {net.error ? (net.error.code === "NotConfigured" ? "The Pantado Price Chain is not configured on this server." : `Cannot read the price chain: ${net.error.message}`) : "Reading the price chain…"}
          </div>
        ) : (
          <>
            <div className="netflow" style={css("display: grid; grid-template-columns: minmax(0, 1fr) 36px minmax(0, 1fr) 36px minmax(0, 1fr) 36px minmax(0, 1fr)")}>
              {v.stages.map((s, i) => (
                <Fragment key={s.label}>
                  {i ? (
                    <div aria-hidden="true" className="flowarrow" style={css("display: grid; place-items: center; position: relative")}>
                      <div style={css("position: absolute; left: 0; right: 0; top: 50%; border-top: 1px dashed #2A2A2F")} />
                      <span className="flowdot" style={css("position: relative; width: 8px; height: 8px; border-radius: 50%; background: #9052F9; animation: flow 1.6s ease-in-out infinite")} />
                    </div>
                  ) : null}
                  <div style={css(`padding: 18px 20px; border-radius: 16px; background: #0E0E10; border: 1px solid ${s.tone === "good" || s.tone === "idle" ? "#1C1C20" : "#3A2C12"}; display: flex; flex-direction: column; gap: 6px; min-width: 0`)}>
                    <span style={css("display: flex; align-items: center; gap: 8px; font-size: 13px; color: #8E8E96")}>
                      <span style={css(`width: 7px; height: 7px; border-radius: 50%; background: ${DOT[s.tone]}`)} />
                      {s.label}
                    </span>
                    <span style={css("font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 30px; letter-spacing: -0.03em; overflow-wrap: anywhere")}>{s.value}</span>
                    <span style={css(`font-size: 13px; color: ${s.tone === "good" || s.tone === "idle" ? "#8E8E96" : TONE[s.tone].fg}`)}>{s.note}</span>
                  </div>
                </Fragment>
              ))}
            </div>

            <div style={css("display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start")}>
              <div style={css("flex: 2 1 620px; min-width: 0")}>
                <Section title="Prices" sub="USD · from HOSE">
                  <div className="netprices" style={css("display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px")}>
                    {v.prices.map((p) => {
                      const late = p.tone === "warn" || p.tone === "bad";
                      return (
                        <a
                          key={p.id}
                          href={`/asset/${p.id}`}
                          title={`${p.name} · L1 ${p.l1} · C-Chain ${p.cchain} · round ${p.round}`}
                          style={css(`padding: 14px; border-radius: 14px; background: ${late ? "#17130C" : "#0E0E10"}; border: 1px solid ${late ? "#3A2C12" : "#1C1C20"}; display: flex; flex-direction: column; gap: 10px`)}
                        >
                          <span style={css("display: flex; align-items: center; gap: 8px")}>
                            {p.img ? (
                              <img src={p.img} alt="" style={css("width: 22px; height: 22px; border-radius: 50%")} />
                            ) : (
                              <span style={css("width: 22px; height: 22px; border-radius: 50%; background: #26262B; display: grid; place-items: center; font-size: 9px; font-weight: 700")}>{p.sym.slice(0, 2)}</span>
                            )}
                            <b style={css("font-size: 14px")}>{p.sym}</b>
                            <span title={p.status} style={css(`margin-left: auto; width: 7px; height: 7px; border-radius: 50%; background: ${DOT[p.tone]}`)} />
                          </span>
                          <span style={css("font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 20px")}>{p.px}</span>
                          <span style={css(`font-size: 12px; color: ${late ? "#F5B14C" : "#8E8E96"}`)}>{p.note}</span>
                        </a>
                      );
                    })}
                  </div>
                </Section>
              </div>

              <div style={css("flex: 1 1 340px; min-width: 0; display: flex; flex-direction: column; gap: 24px")}>
                <Section title="Rounds">
                  <div style={css(`${CARD}; padding: 4px 16px`)}>
                    {v.rounds.length ? (
                      v.rounds.slice(0, 5).map((r, i) => (
                        <div key={r.round} title={`L1 ${r.l1} · C-Chain ${r.cchain} · ${r.assets} prices · ${r.reporters.join(", ")}`} style={css(`display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid ${i ? "#17171A" : "transparent"}`)}>
                          <span style={css(`width: 8px; height: 8px; border-radius: 50%; background: ${DOT[r.tone]}`)} />
                          <b style={css("font-size: 14px")}>{r.round}</b>
                          <span style={css("font-size: 13px; color: #8E8E96")}>{r.hm}</span>
                          <span style={css(`margin-left: auto; font-size: 13px; font-weight: 600; color: ${DOT[r.tone]}`)}>{r.line}</span>
                        </div>
                      ))
                    ) : (
                      <div style={css("padding: 12px 0; font-size: 13px; color: #8E8E96")}>No round yet.</div>
                    )}
                  </div>
                </Section>

                <Section title="Reporters" sub="gap from median">
                  <div style={css(`${CARD}; padding: 4px 16px`)}>
                    {v.reporters.map((r, i) => (
                      <div key={r.address} title={`${r.address} · ${r.status} · last round ${r.lastRound}`} style={css(`display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid ${i ? "#17171A" : "transparent"}`)}>
                        <span style={css(`width: 8px; height: 8px; border-radius: 50%; background: ${DOT[r.tone]}`)} />
                        <span style={css(MONO)}>{r.addr}</span>
                        <span style={css("font-size: 13px; color: #8E8E96")}>{r.seen}</span>
                        <b style={css(`margin-left: auto; font-size: 13px; color: ${r.gapTone === "good" || r.gapTone === "idle" ? "#B4B4BB" : TONE[r.gapTone].fg}`)}>{r.gap}</b>
                      </div>
                    ))}
                  </div>
                </Section>

              </div>
            </div>


            <p style={css("margin: 0; padding-top: 16px; border-top: 1px solid #17171A; font-size: 13px; color: #8E8E96")}>{v.footer}</p>
          </>
        )}
      </div>
    </Page>
  );
}
