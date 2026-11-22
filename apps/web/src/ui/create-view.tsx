"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CONFIG, networkNames } from "../lib/config";
import { css } from "../lib/tpl";
import { Notices, TxStatusLine } from "../screens/asset.parts";
import { errorNotice, txLine, type Notice } from "../screens/asset.states";
import { cleanTicker, type Mode, type PresetKey } from "../screens/create.draft";
import { basketRows, driftBand, KIND_TABS, MODES, REB_NOTE, rules, splitText, summary, universe, VIS, type KindTab } from "./create-view.vm";

/** One colour per asset type, as on the Market type badges (index purple, VN teal); All stays neutral. */
const KIND_COLOR: Record<KindTab, { fg: string; bg: string; line: string }> = {
  All: { fg: "#F2F2F3", bg: "#17171A", line: "#26262B" },
  Stocks: { fg: "#6FA8FF", bg: "#101A2B", line: "#1E3354" },
  "VN Stocks": { fg: "#2FC7C0", bg: "#10262A", line: "#1A4245" },
  Tokens: { fg: "#F5B14C", bg: "#2A1F0F", line: "#4A3616" },
};
import { Page } from "./page";
import { useCreate } from "./use-create";

const CARD = "padding: 20px; border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20";
const INPUT = "height: 52px; box-sizing: border-box; padding: 0 16px; border-radius: 12px; border: 1px solid #1F1F23; background: #131316; color: #F2F2F3; font: 700 17px 'Inter', sans-serif";
const LABEL = "font-size: 12px; letter-spacing: .06em; color: #8E8E96";
const seg = (on: boolean): string => `border: 0; padding: 9px 14px; border-radius: 9px; font-weight: 600; font-size: 14px; background: ${on ? "#2A2A2F" : "transparent"}; color: ${on ? "#F2F2F3" : "#B4B4BB"}`;
const PRESETS: { label: string; key: PresetKey }[] = [
  { label: "Equal", key: "equal" },
  { label: "Market cap", key: "marketcap" },
  { label: "Low volatility", key: "lowvol" },
];

function Avatar({ img, ini, size }: { img: string | null; ini: string; size: number }): ReactNode {
  return img ? (
    <img src={img} alt="" style={css(`width: ${size}px; height: ${size}px; border-radius: 50%; flex: none`)} />
  ) : (
    <span aria-hidden="true" style={css(`width: ${size}px; height: ${size}px; border-radius: 50%; flex: none; background: #26262B; display: grid; place-items: center; font-size: 10px; font-weight: 700`)}>
      {ini}
    </span>
  );
}

/** Create index (reference/index-layer/Create): define an index on the IndexRegistry, or a new basket for yours. */
export default function CreateView({ draft, fork, edit }: { draft?: string; fork?: string; edit?: string }): ReactNode {
  const c = useCreate({ draft, fork, edit });
  const { s, set, actions } = c;
  const [tab, setTab] = useState<KindTab>("All");
  const [preset, setPreset] = useState<string | null>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (s.step !== "edit") reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [s.step]);

  const uni = useMemo(() => universe(c.assets, tab, s.search, s.picked), [c.assets, tab, s.search, s.picked]);
  const rows = basketRows(c.assets, s);
  const total = rows.reduce((x, r) => x + r.w, 0);
  const sum = summary(s, { tickerTaken: c.tickerTaken, editing: c.editing, bt: c.bt, avax: c.avax });
  const band = driftBand(s.drift);
  const ticker = c.editing ? c.editing.ticker : s.ticker;
  const wrongNet = c.wallet.connected && !c.wallet.chainOk;

  const notices: Notice[] = [];
  if (!c.deployed) notices.push(errorNotice("Creating is not available: Pantado is not deployed on this network yet."));
  if (wrongNet) notices.push({ tone: "amber", title: "Your wallet is on another network.", body: `Switch to ${networkNames(CONFIG.network).label} to sign.` });
  if (c.presetError) notices.push({ tone: "amber", title: c.presetError, body: "Your weights were kept." });
  if (c.tickerTaken && s.step === "edit") notices.push(errorNotice("This ticker is already taken."));
  if (c.sourceError) notices.push(errorNotice(c.sourceError.message));
  const stale = rows.map((r) => c.assets.find((a) => a.id === r.id)).find((a) => a?.price?.fresh === false);
  if (s.step === "review" && stale) notices.push({ tone: "amber", title: `${stale.displaySymbol} price is out of date.`, body: "The starting units need a fresh price for every asset. Try again when it updates." });
  const line =
    s.step === "done"
      ? null
      : txLine(
          c.tx,
          c.editing
            ? { pendingSub: `One signature publishes the new basket of ${ticker}.`, confirmed: `Updated ${ticker}`, failed: "Update failed" }
            : { pendingSub: `One signature defines ${ticker}. Nothing is deposited.`, confirmed: `Created ${ticker}`, failed: "Create failed" },
          CONFIG.network,
          CONFIG.explorer,
        );
  const onConfirm = (): void => {
    if (wrongNet) return c.wallet.switchChain();
    if (!c.wallet.connected) return c.wallet.connect();
    if (notices.length > 0) return;
    actions.confirm();
  };

  return (
    <Page title="Create index" active="create">
      <div style={css("padding: 20px 16px 16px; display: flex; flex-direction: column; gap: 14px")}>
        <h1 style={css("margin: 0 0 2px 4px; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 28px; letter-spacing: -0.04em")}>{c.editing ? `New basket for ${c.editing.name}` : "Create index"}</h1>

        <div style={css("display: flex; flex-wrap: wrap; gap: 14px; align-items: stretch")}>
          <aside style={css("flex: 1 1 340px; max-width: 100%; min-width: 0; box-sizing: border-box; padding: 14px; border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20; display: flex; flex-direction: column; gap: 10px")}>
            <div style={css("display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px; border-radius: 12px; background: #131316")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E8E96" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <label htmlFor="srch" style={css("position: absolute; left: -9999px")}>
                Search stocks and tokens
              </label>
              <input id="srch" type="text" value={s.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search stocks and tokens" style={css("flex: 1; min-width: 0; border: 0; background: transparent; color: #F2F2F3; font: 400 15px 'Inter', sans-serif; outline: none")} />
            </div>
            <div role="group" aria-label="Asset type" style={css("display: flex; gap: 6px")}>
              {KIND_TABS.map((k) => {
                const on = k === tab;
                const c = KIND_COLOR[k];
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTab(k)}
                    style={css(`flex: 1 1 auto; height: 40px; padding: 0 10px; border-radius: 10px; font-weight: 700; font-size: 13px; white-space: nowrap; border: 1px solid ${on ? c.fg : c.line}; background: ${on ? c.fg : c.bg}; color: ${on ? "#0B0B0D" : c.fg}`)}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
            <div style={css("display: flex; flex-direction: column; max-height: 860px; overflow-y: auto")}>
              {uni.map((u) => (
                <div key={u.id} style={css("display: flex; align-items: center; gap: 10px; padding: 8px 2px; border-top: 1px solid #17171A")}>
                  <Avatar img={u.img} ini={u.ini} size={24} />
                  <b style={css("font-size: 15px")}>{u.t}</b>
                  <span style={css("flex: 1; font-size: 13px; color: #8E8E96; white-space: nowrap; overflow: hidden; text-overflow: ellipsis")}>{u.name}</span>
                  <button type="button" onClick={() => actions.toggle(u.id)} aria-label={u.aria} aria-pressed={u.added} style={css(`border: 0; width: 72px; height: 38px; border-radius: 10px; font-weight: 700; font-size: 13px; background: ${u.bg}; color: ${u.fg}`)}>
                    {u.btn}
                  </button>
                </div>
              ))}
              {uni.length === 0 ? <span style={css("padding: 12px 2px; font-size: 13px; color: #8E8E96")}>No listed asset matches.</span> : null}
            </div>
          </aside>

          <div style={css("flex: 999 1 640px; min-width: 0; display: flex; flex-direction: column; gap: 14px")}>
            <div style={css(`${CARD}; display: flex; flex-direction: column; gap: 12px`)}>
              <h2 style={css("margin: 0; font-size: 17px; font-weight: 700")}>Details</h2>
              <div style={css("display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 1fr); gap: 12px")}>
                <div style={css("display: flex; flex-direction: column; gap: 8px; min-width: 0")}>
                  <label htmlFor="nm" style={css(LABEL)}>
                    NAME
                  </label>
                  <input id="nm" type="text" value={c.editing ? c.editing.name : s.name} disabled={!!c.editing} onChange={(e) => set({ name: e.target.value.slice(0, 64) })} style={css(INPUT)} />
                </div>
                <div style={css("display: flex; flex-direction: column; gap: 8px; min-width: 0")}>
                  <label htmlFor="tk" style={css(LABEL)}>
                    TICKER
                  </label>
                  <input id="tk" type="text" value={ticker} disabled={!!c.editing} placeholder="TICKER" maxLength={6} onChange={(e) => set({ ticker: cleanTicker(e.target.value) })} style={css(`${INPUT}; text-transform: uppercase; letter-spacing: 0.04em; width: 100%`)} />
                </div>
              </div>
              <label htmlFor="ds" style={css(LABEL)}>
                {c.editing ? "WHAT CHANGED" : "DESCRIPTION"}
              </label>
              <textarea id="ds" rows={3} value={s.description} onChange={(e) => set({ description: e.target.value.slice(0, 280) })} placeholder={c.editing ? "Why the basket changes, in one sentence" : "What this index is for, in one or two sentences"} style={css("box-sizing: border-box; padding: 14px 16px; border-radius: 12px; border: 1px solid #1F1F23; background: #131316; color: #F2F2F3; font: 400 15px 'Inter', sans-serif; resize: vertical")} />
            </div>

            <div style={css(`${CARD}; display: flex; flex-direction: column; gap: 6px`)}>
              <div style={css("display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 8px")}>
                <h2 style={css("margin: 0; font-size: 17px; font-weight: 700")}>Basket</h2>
                <div role="group" aria-label="Weighting" style={css("display: flex; gap: 2px; padding: 4px; border-radius: 12px; background: #17171A")}>
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      aria-pressed={preset === p.key}
                      onClick={() => {
                        setPreset(p.key);
                        actions.preset(p.key);
                      }}
                      style={css(seg(preset === p.key))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {rows.length === 0 ? <span style={css("padding: 12px 0; font-size: 14px; color: #8E8E96; border-top: 1px solid #17171A")}>Add at least 2 assets from the list.</span> : null}
              {rows.map((r) => (
                <div key={r.id} style={css("display: grid; grid-template-columns: 160px minmax(0, 1fr) 64px 32px; align-items: center; gap: 16px; padding: 12px 0; border-top: 1px solid #17171A")}>
                  <div style={css("display: flex; align-items: center; gap: 10px; min-width: 0")}>
                    <Avatar img={r.img} ini={r.ini} size={24} />
                    <b style={css("font-size: 16px")}>{r.t}</b>
                    <span style={css("font-size: 13px; color: #8E8E96; white-space: nowrap")}>{r.k}</span>
                  </div>
                  <input type="range" min="0" max="100" step="1" value={r.w} onChange={(e) => actions.setW(r.id, Number(e.target.value))} aria-label={`Weight of ${r.t}`} style={css("width: 100%")} />
                  <b style={css("font-size: 16px; text-align: right")}>{r.wl}</b>
                  <button type="button" onClick={() => actions.toggle(r.id)} aria-label={`Remove ${r.t}`} style={css("border: 0; background: transparent; color: #8E8E96; font-size: 18px; width: 32px; height: 32px")}>
                    ×
                  </button>
                </div>
              ))}
              <div aria-hidden="true" style={css("display: flex; gap: 3px; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 10px; background: #17171A")}>
                {rows.map((r) => (
                  <span key={r.id} style={css(`flex: ${r.w}; background: ${r.c}`)} />
                ))}
              </div>
              <div style={css("display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding-top: 4px")}>
                <span style={css("color: #B4B4BB")}>{splitText(rows)}</span>
                <span style={css(`color: ${total === 100 ? "#3DD68C" : "#F5B14C"}; font-weight: 600`)}>Total {total}%</span>
              </div>
            </div>

            <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px")}>
              {[
                { k: "90D BACKTEST", v: sum.ret, c: sum.retC },
                { k: "VOLATILITY", v: sum.vol, c: "#F2F2F3" },
                { k: "MAX DRAWDOWN", v: sum.dd, c: sum.dd === "—" ? "#8E8E96" : "#FF6B6B" },
                { k: "VS AVAX 90D", v: sum.vsAvax, c: sum.vsC },
              ].map((m) => (
                <div key={m.k} style={css("padding: 16px; border-radius: 14px; background: #0E0E10; border: 1px solid #1C1C20")}>
                  <div style={css("font-size: 11px; letter-spacing: .08em; color: #8E8E96")}>{m.k}</div>
                  <div style={css(`margin-top: 6px; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 22px; color: ${m.c}`)}>{m.v}</div>
                </div>
              ))}
            </div>

            <div style={css(`${CARD}; display: flex; flex-direction: column; gap: 14px`)}>
              <div style={css("display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px")}>
                <div>
                  <h2 style={css("margin: 0; font-size: 17px; font-weight: 700")}>Rebalancing</h2>
                  <p style={css("margin: 4px 0 0; font-size: 14px; color: #B4B4BB")}>{REB_NOTE[s.mode]}</p>
                </div>
                <div role="group" aria-label="Rebalancing" style={css("display: flex; gap: 2px; padding: 4px; border-radius: 12px; background: #17171A")}>
                  {MODES.map((m: Mode) => (
                    <button key={m} type="button" aria-pressed={m === s.mode} onClick={() => set({ mode: m })} style={css(seg(m === s.mode))}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {s.mode === "Auto" ? (
                <div style={css("padding: 16px; border-radius: 14px; background: #131316; display: flex; flex-direction: column; gap: 14px")}>
                  <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 12px")}>
                    <label htmlFor="trg" style={css("font-size: 15px; font-weight: 600")}>
                      Drift trigger
                    </label>
                    <span style={css("padding: 4px 10px; border-radius: 8px; background: #221637; color: #C9B3FD; font-weight: 700; font-size: 14px")}>±{s.drift}% of target</span>
                  </div>
                  <input id="trg" type="range" min="10" max="200" step="5" value={s.drift} onChange={(e) => set({ drift: Number(e.target.value) })} style={css("width: 100%")} />
                  <div style={css("display: flex; flex-direction: column; gap: 8px")}>
                    <div aria-hidden="true" style={css("position: relative; height: 10px; border-radius: 5px; background: #1F1F23")}>
                      <div style={css(`position: absolute; top: 0; bottom: 0; left: ${band.bandL}; width: ${band.bandW}; border-radius: 5px; background: #2E2147`)} />
                      <div style={css(`position: absolute; top: -4px; bottom: -4px; left: ${band.tgtL}; width: 2px; background: #B18CFB`)} />
                    </div>
                    <div style={css("font-size: 13px; color: #B4B4BB")}>
                      An asset at a 20% target rebalances below <b style={css("color: #F2F2F3")}>{band.lo}%</b> or above <b style={css("color: #F2F2F3")}>{band.hi}%</b>.
                    </div>
                  </div>
                </div>
              ) : null}
              {rules(s.mode, s.drift).length ? (
                <div style={css("display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px")}>
                  {rules(s.mode, s.drift).map((g) => (
                    <div key={g.k} style={css("padding: 10px 12px; border-radius: 10px; border: 1px solid #1F1F23")}>
                      <div style={css("font-size: 12px; color: #8E8E96")}>{g.k}</div>
                      <div style={css("font-weight: 700; font-size: 15px; margin-top: 2px")}>{g.v}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div style={css(`${CARD}; display: flex; flex-wrap: wrap; gap: 24px`)}>
              <div style={css("flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 10px")}>
                <h2 style={css("margin: 0; font-size: 17px; font-weight: 700")}>Visibility</h2>
                <div role="radiogroup" aria-label="Visibility" style={css("display: flex; flex-direction: column; gap: 10px")}>
                  {VIS.map((v) => {
                    const on = v.label === s.vis;
                    return (
                      <button key={v.label} type="button" role="radio" aria-checked={on} disabled={!!c.editing} onClick={() => set({ vis: v.label })} style={css(`text-align: left; padding: 14px; border-radius: 14px; border: 1px solid ${on ? "#9052F9" : "#1F1F23"}; background: ${on ? "#17131F" : "#131316"}; color: #F2F2F3; display: flex; flex-direction: column; gap: 6px; opacity: ${c.editing ? 0.6 : 1}`)}>
                        <span style={css("display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px")}>
                          <span aria-hidden="true" style={css(`width: 14px; height: 14px; border-radius: 50%; box-sizing: border-box; border: 2px solid ${on ? "#9052F9" : "#46464D"}; background: ${on ? "#9052F9" : "transparent"}`)} />
                          {v.label}
                        </span>
                        <span style={css("font-size: 13px; line-height: 1.45; color: #B4B4BB")}>{v.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={css("flex: 2 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 10px")}>
                <h2 style={css("margin: 0; font-size: 17px; font-weight: 700")}>Summary</h2>
                <div style={css("display: flex; flex-direction: column; gap: 6px; font-size: 14px")}>
                  {sum.rows.map((r) => (
                    <div key={r.k} style={css("display: flex; justify-content: space-between; gap: 12px")}>
                      <span style={css("color: #B4B4BB")}>{r.k}</span>
                      <span style={css("text-align: right")}>{r.v}</span>
                    </div>
                  ))}
                </div>
                <span style={css("font-size: 12px; color: #8E8E96")}>Nothing is deposited, bought or held. The level follows the published price of each asset.</span>
                <button type="button" aria-disabled={!sum.cta.enabled} onClick={() => sum.cta.enabled && actions.review()} style={css(`border: 0; height: 52px; border-radius: 14px; font-weight: 700; font-size: 16px; background: ${sum.cta.enabled ? "#F2F2F3" : "#1F1F23"}; color: ${sum.cta.enabled ? "#0B0B0D" : "#8E8E96"}`)}>
                  {sum.cta.label}
                </button>
              </div>
            </div>

            <div ref={reviewRef} style={css("display: flex; flex-direction: column; gap: 10px")}>
              {s.step === "review" ? (
                <div role="dialog" aria-labelledby="cr-title" style={css("display: flex; flex-direction: column; gap: 14px; padding: 18px; background: #0B0B0D; border: 1px solid #9052F9; border-radius: 16px")}>
                  <div style={css("display: flex; justify-content: space-between; align-items: center; gap: 10px")}>
                    <h2 id="cr-title" style={css("margin: 0; font-size: 18px; font-weight: 600")}>
                      {sum.reviewTitle}
                    </h2>
                    <span style={css("padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #1F1F23; color: #B4B4BB")}>{c.editing ? "Update" : s.vis}</span>
                  </div>
                  <div style={css("display: flex; flex-wrap: wrap; gap: 6px")}>
                    {rows.map((r) => (
                      <span key={r.id} style={css("display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; background: #131316; border-radius: 999px; font-size: 13px")}>
                        <Avatar img={r.img} ini={r.ini} size={20} />
                        {r.t} {r.w}%
                      </span>
                    ))}
                  </div>
                  <dl style={css("margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 14px")}>
                    {sum.rows.map((r) => (
                      <div key={r.k} style={css("display: flex; justify-content: space-between; gap: 12px")}>
                        <dt style={css("color: #8E8E96")}>{r.k}</dt>
                        <dd style={css("margin: 0; color: #F2F2F3; text-align: right")}>{r.v}</dd>
                      </div>
                    ))}
                  </dl>
                  <span style={css("font-size: 13px; line-height: 1.5; color: #8E8E96")}>{sum.reviewNote}</span>
                  <div style={css("display: grid; grid-template-columns: 1fr 2fr; gap: 8px")}>
                    <button type="button" onClick={actions.back} style={css("min-height: 52px; background: #1A1A1D; color: #F2F2F3; border: 0; border-radius: 12px; font-size: 15px; font-weight: 600")}>
                      Back
                    </button>
                    <button type="button" onClick={onConfirm} style={css("min-height: 52px; background: #F2F2F3; color: #0B0B0D; border: 0; border-radius: 12px; font-size: 15px; font-weight: 700")}>
                      {wrongNet ? "Switch network" : c.wallet.connected ? "Confirm in wallet" : "Connect to sign"}
                    </button>
                  </div>
                </div>
              ) : null}
              <Notices list={notices} />
              {line ? <TxStatusLine s={line} /> : null}
              {s.step === "done" ? (
                <div role="status" style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 16px; background: #11261B; border: 1px solid #1D4A33; border-radius: 14px; font-size: 14px")}>
                  <span style={css("display: flex; flex-direction: column; gap: 2px")}>
                    <span style={css("color: #3DD68C; font-weight: 600")}>{c.editing ? `Updated ${ticker}. The level carried over.` : `${s.vis === "Public" ? "Published" : "Created"} ${ticker} at level 100.`}</span>
                    <span style={css("font-size: 13px; color: #B4B4BB")}>
                      {c.editing ? "The new basket is live." : s.vis === "Public" ? "It is listed in the Market for everyone to follow." : "Private: only you see it, in Workspace. You can make it public later."}
                    </span>
                  </span>
                  <span style={css("margin-left: auto; display: flex; gap: 8px")}>
                    <a href="/workspace" style={css("display: flex; align-items: center; min-height: 40px; padding: 0 14px; background: #1A1A1D; border-radius: 10px; font-size: 13px; font-weight: 600")}>
                      Workspace
                    </a>
                    {c.created?.index ? (
                      <a href={`/index/${c.created.index}`} style={css("display: flex; align-items: center; min-height: 40px; padding: 0 14px; background: #F2F2F3; color: #0B0B0D; border-radius: 10px; font-size: 13px; font-weight: 700")}>
                        Open index
                      </a>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

