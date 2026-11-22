"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "../lib/api";
import { CONFIG } from "../lib/config";
import { logoOf } from "../lib/logos";
import { ago } from "../lib/fmt";
import { css } from "../lib/tpl";
import { useWallet } from "../lib/wallet";
import { suggestions, TABS, type AskBoardRow, type AskMode, type AskTab } from "../screens/ask.vm";
import { useDailySuggestions } from "../screens/ask";
import { AgentError, applyEvent, askStream, type AgentCard } from "../screens/chat.sse";
import { anonSession, filterConvs, historyOf, newId, ownerOf, saveConvs, titleOf, type Conversation, type KV, type Turn } from "../screens/chat.store";
import { draftHref, type AssetCardData, type DraftCardData, type IndexCardData } from "../screens/chat.vm";
import { askBlocks, spans, type Ticker } from "./ask-text";

/** Robot mark of the Ask button (reference/index-layer/AskWidget). */
function Robot({ size, eyes }: { size: number; eyes: string }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="-10 -70 354 330" aria-hidden="true">
      <path d="M165 16V-34" stroke="#F4F2FA" strokeWidth="16" strokeLinecap="round" />
      <circle cx="165" cy="-42" r="20" fill="#9052F9" />
      <path d="M94 16H238C291 16 331 60 331 113C331 166 291 206 240 206H213L219 200C247 195 267 176 267 153C267 126 247 104 221 104H94Z" fill="#F4F2FA" />
      <path d="M137 146V252H12V214C12 176 42 146 80 146Z" fill="#9052F9" />
      <circle cx="150" cy="60" r="18" fill={eyes} />
      <circle cx="232" cy="60" r="18" fill={eyes} />
    </svg>
  );
}

const kv = (): KV | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

type View = "home" | "chats" | "convo";

/** Links an answer's cards lead to: open the asset or index, or Create pre-filled with a draft. */
function cardLinks(cards: AgentCard[]): { label: string; href: string; primary?: boolean }[] {
  const out: { label: string; href: string; primary?: boolean }[] = [];
  for (const c of cards) {
    if (c.kind === "asset") {
      const a = c.data as AssetCardData;
      out.push({ label: `Open ${a.displaySymbol ?? a.symbol}`, href: `/asset/${a.id}` });
    } else if (c.kind === "index") {
      const x = c.data as IndexCardData;
      out.push({ label: `Open ${x.detail.name}`, href: `/index/${x.detail.id}` });
    } else if (c.kind === "draft") {
      out.push({ label: "Create from this", href: draftHref(c.data as DraftCardData), primary: true });
    }
  }
  return out;
}

/** A ticker in an answer: logo + symbol in an accent chip that opens its page. */
function TickerChip({ t }: { t: Ticker }): ReactNode {
  return (
    <a className="ask-chip" href={t.href} title={`Open ${t.symbol}`} style={css("display: inline-flex; align-items: center; gap: 5px; margin: 0 1px; padding: 1px 7px 1px 3px; border-radius: 7px; background: #221637; border: 1px solid #3A2763; color: #E4D8FF; font-weight: 700; font-size: 13px; line-height: 1.5; vertical-align: baseline; white-space: nowrap")}>
      {t.logo ? (
        <img src={t.logo} alt="" style={css("width: 14px; height: 14px; border-radius: 50%; background: #F2F2F3")} />
      ) : (
        <span aria-hidden="true" style={css(`width: 14px; height: 14px; border-radius: ${t.kind === "index" ? "4px" : "50%"}; background: #9052F9`)} />
      )}
      {t.symbol}
    </a>
  );
}

function Rich({ text, tickers }: { text: string; tickers: Map<string, Ticker> }): ReactNode {
  return (
    <>
      {spans(text, tickers).map((r, i) =>
        r.t === "ticker" ? <TickerChip key={i} t={r.ticker} /> : r.bold ? <strong key={i} style={css("color: #F2F2F3; font-weight: 700")}>{r.text}</strong> : <span key={i}>{r.text}</span>,
      )}
    </>
  );
}

const ASK_CSS = `
.ask-chip:hover{background:#2E1D4A !important;border-color:#9052F9 !important}
.ask-act:hover{border-color:#B18CFB !important;background:#241838 !important}
.ask-act-primary:hover{background:#A06BFF !important}
.ask-next:hover{border-color:#3A3A42 !important;background:#17171B !important}
.ask-next:hover .ask-next-arrow{color:#B18CFB !important}
`;

/**
 * Ask PantadoAI: the robot button at the bottom right of every page opens a panel with the day's questions, the
 * wallet's saved chats and the conversation. The agent streams answers (spec §10.1); history is kept per wallet only.
 */
export function AskWidget(): ReactNode {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<AskMode>("Auto");
  const [tab, setTab] = useState<AskTab>("Today");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [cur, setCur] = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const board = useApi<AskBoardRow[]>(open ? "/board" : null, 60_000);
  const daily = useDailySuggestions();

  // history belongs to a wallet (B89); without one the open chat lives in this panel only
  useEffect(() => {
    const s = kv();
    if (!s) return;
    const now = Date.now();
    setConvs(historyOf(s, w.address, now));
    setSession(ownerOf(w.address) ?? `anon:${anonSession(s, now)}`);
  }, [w.address]);
  useEffect(() => {
    const s = kv();
    const o = ownerOf(w.address);
    if (!s || !o || convs.some((c) => c.turns.some((t) => t.status === "streaming"))) return;
    saveConvs(s, o, convs);
  }, [convs, w.address]);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [convs, cur, view]);

  const update = useCallback((id: string, f: (t: Turn) => Turn) => {
    setConvs((xs) =>
      xs.map((c) => {
        if (c.id !== id || !c.turns.length) return c;
        const turns = [...c.turns];
        turns[turns.length - 1] = f(turns[turns.length - 1] as Turn);
        return { ...c, turns, updated: Date.now() };
      }),
    );
  }, []);

  const send = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q || !session) return;
      const m = mode === "Deep" ? "deep" : "auto";
      const id = view === "convo" && cur ? cur : newId();
      const now = Date.now();
      const turn: Turn = { q, mode: m, text: "", cards: [], meta: null, status: "streaming" };
      setConvs((xs) => {
        const hit = xs.find((c) => c.id === id);
        if (hit) return [{ ...hit, turns: [...hit.turns, turn], updated: now }, ...xs.filter((c) => c.id !== id)];
        return [{ id, title: titleOf(q), created: now, updated: now, turns: [turn] }, ...xs];
      });
      setCur(id);
      setView("convo");
      setDraft("");
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      askStream(CONFIG.agentUrl, { message: q, mode: m, sessionId: `${session}:${id}` }, (e) => update(id, (t) => applyEvent(t, e)), ctrl.signal)
        .then(() => update(id, (t) => (t.status === "streaming" ? { ...t, status: "done" } : t)))
        .catch((e: unknown) => update(id, (t) => ({ ...t, status: "error", error: e instanceof AgentError ? e.message : "The agent could not answer." })));
    },
    [session, mode, view, cur, update],
  );

  const prompts = useMemo(() => {
    const rows = board.data ?? [];
    const bySym = new Map(rows.map((r) => [(r as { symbol?: string }).symbol ?? "", r]));
    return suggestions(tab, mode, rows, daily)
      .slice(0, 5)
      .map((p) => ({ text: p.text, tick: p.chip ? (p.sym ?? null) : null, logo: p.sym ? logoOf((bySym.get(p.sym) as { id?: string } | undefined)?.id ?? p.sym.toLowerCase()) : null }));
  }, [board.data, tab, mode, daily]);

  // every listed asset and index ticker, so answers can show them as chips
  const tickers = useMemo(() => {
    const m = new Map<string, Ticker>();
    for (const r of board.data ?? []) {
      m.set(r.symbol, { symbol: r.symbol, kind: r.kind, logo: r.kind === "index" ? null : logoOf(r.id), href: r.kind === "index" ? `/index/${r.id}` : `/asset/${r.id}` });
    }
    return m;
  }, [board.data]);

  const conv = convs.find((c) => c.id === cur) ?? null;
  const list = filterConvs(convs, search);
  const seg = (on: boolean): string => `border: 0; padding: 6px 10px; border-radius: 7px; font: 600 12px 'Inter', sans-serif; background: ${on ? "#2A2A2F" : "transparent"}; color: ${on ? "#F2F2F3" : "#8E8E96"}`;

  return (
    <div style={css("position: fixed; right: max(28px, env(safe-area-inset-right, 0px)); bottom: max(20px, env(safe-area-inset-bottom, 0px)); z-index: 60; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; font-family: 'Inter', system-ui, sans-serif; color: #F2F2F3; font-variant-numeric: tabular-nums")}>
      <style>{ASK_CSS}</style>
      {open ? (
        <section role="dialog" aria-label="Ask PantadoAI" style={css("width: 420px; max-width: calc(100vw - 48px); height: 660px; max-height: calc(100vh - 48px); box-sizing: border-box; display: flex; flex-direction: column; background: #0B0B0D; border: 1px solid #26262B; border-radius: 20px; box-shadow: 0 24px 72px rgba(0,0,0,.6); overflow: hidden")}>
          <div style={css("display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; border-bottom: 1px solid #17171A")}>
            <button type="button" aria-label="Ask home" onClick={() => setView("home")} style={css("width: 34px; height: 34px; border-radius: 10px; background: #17171A; border: 1px solid #2A2A2F; display: grid; place-items: center; flex: none; padding: 0")}>
              <Robot size={24} eyes="#0B0B0D" />
            </button>
            <div style={css("flex: 1; min-width: 0; font-weight: 700; font-size: 15px")}>Ask PantadoAI</div>
            <div role="group" aria-label="Mode" style={css("display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: #17171A")}>
              {(["Auto", "Deep"] as AskMode[]).map((m) => (
                <button key={m} type="button" aria-pressed={m === mode} onClick={() => setMode(m)} style={css(seg(m === mode))}>
                  {m}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setView(view === "chats" ? (conv ? "convo" : "home") : "chats")} aria-label="Chats" aria-pressed={view === "chats"} style={css(`width: 36px; height: 36px; border: 0; border-radius: 10px; display: grid; place-items: center; background: ${view === "chats" ? "#2A2A2F" : "#17171A"}`)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F2F2F3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              </svg>
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Collapse Ask" style={css("width: 36px; height: 36px; border: 0; border-radius: 10px; display: grid; place-items: center; background: #17171A")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F2F2F3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          <div style={css("flex: 1; min-height: 0; overflow-y: auto; padding: 16px")}>
            {view === "home" ? (
              <div style={css("display: flex; flex-direction: column; gap: 14px")}>
                <h2 style={css("margin: 4px 0 0; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 28px; line-height: 1.05; letter-spacing: -0.045em")}>What should we index today?</h2>
                <div role="group" aria-label="Topics" style={css("display: flex; gap: 6px; flex-wrap: wrap")}>
                  {TABS.map((t) => (
                    <button key={t} type="button" aria-pressed={t === tab} onClick={() => setTab(t)} style={css(`border: 0; height: 34px; padding: 0 12px; border-radius: 10px; font: 600 13px 'Inter', sans-serif; background: ${t === tab ? "#F2F2F3" : "#17171A"}; color: ${t === tab ? "#0B0B0D" : "#B4B4BB"}`)}>
                      {t}
                    </button>
                  ))}
                </div>
                <div style={css("display: flex; flex-direction: column; gap: 8px")}>
                  {prompts.map((p) => (
                    <button key={p.text} type="button" className="ask-next" onClick={() => send(p.text)} style={css("display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 10px 12px; border-radius: 12px; border: 1px solid #26262B; background: #111114; color: #F2F2F3; text-align: left; font: 500 14px/1.4 'Inter', sans-serif")}>
                      {p.tick ? (
                        <span style={css("display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px 3px 3px; border-radius: 8px; background: #221637; border: 1px solid #3A2763; color: #E4D8FF; font-weight: 700; white-space: nowrap")}>
                          {p.logo ? <img src={p.logo} alt="" style={css("width: 18px; height: 18px; border-radius: 50%")} /> : null}
                          {p.tick}
                        </span>
                      ) : null}
                      <span style={css("flex: 1")}>{p.text}</span>
                      <span className="ask-next-arrow" aria-hidden="true" style={css("color: #8E8E96")}>
                        ↗
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {view === "chats" ? (
              <div style={css("display: flex; flex-direction: column; gap: 10px")}>
                <button
                  type="button"
                  onClick={() => {
                    setCur(null);
                    setView("home");
                  }}
                  style={css("height: 48px; border: 0; border-radius: 14px; background: #F2F2F3; color: #0B0B0D; font: 700 15px 'Inter', sans-serif")}
                >
                  + New chat
                </button>
                <div style={css("display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px; border-radius: 12px; background: #131316")}>
                  <label htmlFor="schats" style={css("position: absolute; left: -9999px")}>
                    Search chats
                  </label>
                  <input id="schats" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" style={css("flex: 1; min-width: 0; border: 0; background: transparent; color: #F2F2F3; font: 400 14px 'Inter', sans-serif; outline: none")} />
                </div>
                <div style={css("font-size: 11px; letter-spacing: .08em; color: #8E8E96; padding-top: 6px")}>RECENT</div>
                {!w.address ? <span style={css("font-size: 13px; color: #8E8E96")}>Connect to keep your chats.</span> : null}
                {list.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCur(c.id);
                      setView("convo");
                    }}
                    style={css(`display: flex; flex-direction: column; gap: 3px; padding: 10px 12px; border: 0; border-radius: 12px; background: ${c.id === cur ? "#17171A" : "transparent"}; color: #F2F2F3; text-align: left`)}
                  >
                    <span style={css("font: 600 14px 'Inter', sans-serif")}>{c.title}</span>
                    <span style={css("font-size: 12px; color: #8E8E96")}>
                      {ago(c.updated / 1000)} · {c.turns[c.turns.length - 1]?.mode === "deep" ? "Deep" : "Auto"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {view === "convo" && conv ? (
              <div style={css("display: flex; flex-direction: column; gap: 14px")}>
                {conv.turns.map((t, i) => (
                  <div key={i} style={css("display: flex; flex-direction: column; gap: 14px")}>
                    <div style={css("align-self: flex-end; max-width: 85%; padding: 10px 14px; border-radius: 14px 14px 4px 14px; background: #1C1C20; font-size: 14px; line-height: 1.45")}>{t.q}</div>
                    <div style={css("display: flex; gap: 10px")}>
                      <span style={css("width: 26px; height: 26px; border-radius: 8px; background: #17171A; display: grid; place-items: center; flex: none")}>
                        <svg width="16" height="12" viewBox="10 14 324 241" aria-hidden="true">
                          <path d="M94 16H238C291 16 331 60 331 113C331 166 291 206 240 206H213L219 200C247 195 267 176 267 153C267 126 247 104 221 104H94Z" fill="#F4F2FA" />
                          <path d="M137 146V252H12V214C12 176 42 146 80 146Z" fill="#9052F9" />
                        </svg>
                      </span>
                      <div style={css("flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px")}>
                        {t.meta ? <div style={css("font-size: 12px; color: #8E8E96; border-left: 2px solid #26262B; padding-left: 10px")}>{`${t.meta.tools} data reads · ${(t.meta.ms / 1000).toFixed(1)}s`}</div> : null}
                        {t.status === "streaming" && !t.text ? <span style={css("font-size: 14px; color: #8E8E96")}>Reading the data…</span> : null}
                        {askBlocks(t.text).map((b, k) =>
                          b.kind === "p" ? (
                            <p key={k} style={css("margin: 0; font-size: 14px; line-height: 1.65; color: #D6D6DA")}>
                              <Rich text={b.text} tickers={tickers} />
                            </p>
                          ) : b.kind === "ul" ? (
                            <ul key={k} style={css("margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.65; color: #D6D6DA")}>
                              {b.items.map((x, j) => (
                                <li key={j}>
                                  <Rich text={x} tickers={tickers} />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div key={k} style={css("overflow-x: auto; border-radius: 12px; border: 1px solid #1C1C20")}>
                              <table style={css("width: 100%; border-collapse: collapse; font-size: 12.5px")}>
                                <thead>
                                  <tr>
                                    {b.head.map((h, j) => (
                                      <th key={j} scope="col" style={css(`padding: 8px 10px; background: #131316; color: #8E8E96; font-weight: 600; white-space: nowrap; text-align: ${j ? "right" : "left"}`)}>
                                        <Rich text={h} tickers={tickers} />
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {b.rows.map((r, j) => (
                                    <tr key={j}>
                                      {r.map((c, m) => (
                                        <td key={m} style={css(`padding: 8px 10px; border-top: 1px solid #17171A; white-space: nowrap; text-align: ${m ? "right" : "left"}; color: ${m ? "#F2F2F3" : "#B4B4BB"}; ${/^[-−]\d/.test(c) ? "color: #FF6B6B;" : /^\+\d/.test(c) ? "color: #3DD68C;" : ""}`)}>
                                          <Rich text={c} tickers={tickers} />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ),
                        )}
                        {t.status === "error" ? <span style={css("font-size: 13px; color: #FF6B6B")}>{t.error}</span> : null}
                        {t.status === "done" ? <span style={css("font-size: 11px; color: #8E8E96")}>Research, not investment advice.</span> : null}
                        {cardLinks(t.cards).length ? (
                          <div role="group" aria-label="Actions" style={css("display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding-top: 12px; border-top: 1px solid #1C1C20")}>
                            <span style={css("font-size: 11px; font-weight: 600; letter-spacing: .08em; color: #8E8E96")}>ACTIONS</span>
                            <div style={css("display: flex; gap: 8px; flex-wrap: wrap")}>
                              {cardLinks(t.cards).map((l) => (
                                <a
                                  key={l.href}
                                  href={l.href}
                                  className={l.primary ? "ask-act-primary" : "ask-act"}
                                  style={css(
                                    l.primary
                                      ? "display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border-radius: 11px; background: #9052F9; color: #FFFFFF; font-size: 13px; font-weight: 700"
                                      : "display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; border-radius: 11px; background: #1A1230; border: 1px solid #3A2763; color: #F2F2F3; font-size: 13px; font-weight: 700",
                                  )}
                                >
                                  {l.label}
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M7 17L17 7M9 7h8v8" />
                                  </svg>
                                </a>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {t.status === "done" && i === conv.turns.length - 1 && t.related?.length ? (
                          <div role="group" aria-label="Ask next" style={css("display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding-top: 12px; border-top: 1px solid #1C1C20")}>
                            <span style={css("font-size: 11px; font-weight: 600; letter-spacing: .08em; color: #8E8E96")}>ASK NEXT</span>
                            {t.related.slice(0, 3).map((r) => (
                              <button key={r} type="button" className="ask-next" onClick={() => send(r)} style={css("display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 8px 12px; border-radius: 12px; border: 1px solid #26262B; background: #111114; color: #F2F2F3; text-align: left; font: 500 13px/1.4 'Inter', sans-serif")}>
                                <span aria-hidden="true" style={css("flex: none; width: 22px; height: 22px; border-radius: 7px; background: #221637; color: #B18CFB; display: grid; place-items: center; font-size: 12px; font-weight: 700")}>
                                  ?
                                </span>
                                <span style={css("flex: 1")}>
                                  <Rich text={r} tickers={tickers} />
                                </span>
                                <span className="ask-next-arrow" aria-hidden="true" style={css("flex: none; color: #8E8E96")}>
                                  ↗
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div ref={bottom} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            style={css("padding: 12px; border-top: 1px solid #17171A")}
          >
            <div style={css("display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 14px; border-radius: 16px; border: 1px solid #26262B; background: #0B0B0D")}>
              <label htmlFor="askin" style={css("position: absolute; left: -9999px")}>
                Ask PantadoAI
              </label>
              <input id="askin" type="text" value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 2000))} placeholder="Ask PantadoAI about a token, a stock or an index" style={css("flex: 1; min-width: 0; border: 0; background: transparent; color: #F2F2F3; font: 400 14px 'Inter', sans-serif; outline: none")} />
              <button type="submit" aria-label="Send" style={css("width: 36px; height: 36px; flex: none; border: 0; border-radius: 10px; background: #9052F9; display: grid; place-items: center")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="Open Ask PantadoAI" style={css("position: relative; width: 64px; height: 64px; border: 2px solid #9052F9; border-radius: 50%; background: #131316; display: grid; place-items: center; box-shadow: 0 12px 32px rgba(144,82,249,.45), 0 4px 12px rgba(0,0,0,.5)")}>
          <Robot size={40} eyes="#131316" />
          <span style={css("position: absolute; top: 3px; right: 3px; width: 12px; height: 12px; border-radius: 50%; background: #3DD68C; border: 2px solid #0B0B0D")} />
        </button>
      )}
    </div>
  );
}
