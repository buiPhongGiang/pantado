/**
 * Ask answers: split text into plain runs and known tickers, so a ticker shows as a chip that opens its page.
 * A ticker matches only as a whole word (letters, digits, "."), with its exact case: "AVAX", "BTC.b", "FPT".
 */
export interface Ticker {
  symbol: string;
  href: string;
  logo: string | null;
  kind: "stock" | "token" | "index";
}

export type Run = { t: "text"; text: string } | { t: "ticker"; text: string; ticker: Ticker };

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function tickerRuns(text: string, tickers: Map<string, Ticker>): Run[] {
  // short words that are also tickers would light up ordinary prose; 2-letter symbols need to be in capitals already
  const syms = [...tickers.keys()].filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);
  if (!syms.length || !text) return text ? [{ t: "text", text }] : [];
  const re = new RegExp(`(?<![A-Za-z0-9.$])(${syms.map(esc).join("|")})(?![A-Za-z0-9])`, "g");
  const out: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    const sym = m[1] ?? "";
    const tk = tickers.get(sym);
    if (!tk) continue;
    if (i > at) out.push({ t: "text", text: text.slice(at, i) });
    out.push({ t: "ticker", text: sym, ticker: tk });
    at = i + sym.length;
  }
  if (at < text.length) out.push({ t: "text", text: text.slice(at) });
  return out;
}

/** Words that are also tickers but mean a currency in prose ("VND converted to USD"): never chips. */
export const NOT_TICKERS = new Set(["VND", "USD"]);

/** Plain runs, **bold** runs and tickers, in order. Bold may contain tickers. */
export type Span = { t: "text"; text: string; bold: boolean } | { t: "ticker"; text: string; ticker: Ticker; bold: boolean };

export function spans(text: string, tickers: Map<string, Ticker>): Span[] {
  const usable = new Map([...tickers].filter(([k]) => !NOT_TICKERS.has(k)));
  const out: Span[] = [];
  text.split(/\*\*/).forEach((part, i) => {
    const bold = i % 2 === 1;
    for (const r of tickerRuns(part, usable)) out.push(r.t === "ticker" ? { ...r, bold } : { t: "text", text: r.text, bold });
  });
  return out.filter((s) => s.text);
}

/** Answer blocks for the Ask panel: paragraphs, bullet lists and tables; `**bold**` is kept for `spans`. */
export type AskBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] } | { kind: "table"; head: string[]; rows: string[][] };

const cells = (l: string): string[] => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isRule = (l: string): boolean => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

export function askBlocks(text: string): AskBlock[] {
  const out: AskBlock[] = [];
  const clean = (s: string): string => s.replace(/^#+\s*/, "").trim();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let para: string[] = [];
  let items: string[] = [];
  const flush = (): void => {
    if (para.length) out.push({ kind: "p", text: clean(para.join(" ")) });
    if (items.length) out.push({ kind: "ul", items });
    para = [];
    items = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (!l.trim()) {
      flush();
      continue;
    }
    // a table: a header row, a |---| rule, then rows that start with "|"
    if (l.trim().startsWith("|") && isRule(lines[i + 1] ?? "")) {
      flush();
      const head = cells(l);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) rows.push(cells(lines[i++] ?? ""));
      i -= 1;
      out.push({ kind: "table", head, rows });
      continue;
    }
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
    if (m) {
      if (para.length) {
        out.push({ kind: "p", text: clean(para.join(" ")) });
        para = [];
      }
      items.push(clean(m[1] ?? ""));
    } else {
      if (items.length) {
        out.push({ kind: "ul", items });
        items = [];
      }
      para.push(l.trim());
    }
  }
  flush();
  return out.filter((b) => (b.kind === "p" ? b.text : b.kind === "ul" ? b.items.length : b.head.length));
}
