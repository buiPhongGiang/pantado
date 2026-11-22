import type { Binding } from "../bindings.js";

/** Asset page (reference route `asset`): mock NVDA literals → view model; chart, pools, perf and states → slots. */
export const binding: Binding = {
  text: {
    NV: "a.ini2",
    NVDA: "a.sym",
    pNVDA: "a.execSym",
    NVIDIA: "a.name",
    Stock: "a.kindS",
    "Reference market: Robinhood Chain (on-chain)": "a.badge",
    "$169.95": "pxS",
    "$12.9M": "vol24S",
    "$4.1M": "liqS",
    "$25,000": "capS",
    "Max trade": "capLabel",
    "Pantado stock venue": "routeName",
    "0.15%": "spreadS",
  },
  slots: [
    // no trading (owner): the buy / sell card (with its notices, status, route row and note) is an empty slot
    { tag: "div", attrs: { style: "background: #0B0B0D; border: 1px solid #1C1C20; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px" }, name: "tradeCard" },
    // chart header: the 15m · 1h · 4h · 1D · 1W group drives the chart
    { tag: "div", attrs: { role: "group", "aria-label": "Interval" }, name: "interval" },
    { tag: "div", attrs: { "aria-label~": "candlestick chart" }, name: "chart" },
    { tag: "sc-if", attrs: { value: "{{tabPools}}" }, name: "pools" },
    { tag: "div", attrs: { style: "margin-top: 4px; font-family: 'Inter Tight', sans-serif; font-size: 24px; font-weight: 600; color: #3DD68C" }, name: "chg24" },
    { tag: "div", attrs: { "style~": "grid-template-columns: repeat(4, minmax(0, 1fr)); background: #0B0B0D" }, name: "perf" },
    { tag: "div", attrs: { "style~": "padding: 14px 16px 6px" }, name: "inIndexes" },
  ],
};
