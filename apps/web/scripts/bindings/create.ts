import type { Binding } from "../bindings.js";

const ROW = "display: flex; justify-content: space-between; gap: 12px";
const METRIC = "background: #0B0B0D; border: 1px solid #1C1C20; border-radius: 14px; padding: 14px";

/**
 * Create (reference route `create`): name and copy literals → view model; created banner → live status slot.
 * No trading (owner, B101): an index is defined on the IndexRegistry with no deposit, so the first-buy input, the
 * fee / pay rows of the review and the $1k slippage metric are removed (empty slots).
 */
export const binding: Binding = {
  text: {
    "You earn 0.20% of every buy and sell": "earnNote",
    "My basket": "name",
    "Creation fee 5 USDC · trade fee 0.50%": "feeLine",
    "Review: create and buy": "reviewTitle",
    "You receive": "receiveLabel",
    "One signature creates the index and buys every asset. Starting level 100. If any purchase fails or a price is out of date, nothing is created and you keep your USDC.":
      "reviewNote",
  },
  slots: [
    { tag: "div", attrs: { role: "status" }, name: "status" },
    { tag: "div", attrs: { style: ROW }, childText: "First buy", name: "rowFirstBuy" },
    { tag: "div", attrs: { style: ROW }, childText: "Creation fee", name: "rowCreationFee" },
    { tag: "div", attrs: { style: ROW }, childText: "Trade fee 0.50%", name: "rowTradeFee" },
    { tag: "div", attrs: { style: ROW }, childText: "You pay", name: "rowPay" },
    { tag: "div", attrs: { style: METRIC }, childText: "Slippage $1k", name: "slipCard" },
    { tag: "div", attrs: { "style~": "min-height: 44px; background: #131316" }, childText: "First buy", name: "firstBuy" },
  ],
};
