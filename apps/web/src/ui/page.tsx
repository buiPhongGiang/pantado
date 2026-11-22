"use client";
import type { ReactNode } from "react";
import { useChrome } from "../lib/chrome";
import { Shell } from "../lib/shell";
import { css } from "../lib/tpl";
import { AskWidget } from "./ask-widget";
import { TopNav, type NavKey } from "./topnav";

/**
 * Page frame of reference/index-layer: one rounded card (max 1420 px) with the top bar, the page body, and the Ask
 * robot button fixed at the bottom right. `pad` false lets a page lay out its own padding.
 */
export function Page({ title, active, children }: { title: string; active: NavKey; children: ReactNode }): ReactNode {
  const { me } = useChrome();
  return (
    <Shell title={title}>
      <div style={css("min-height: 100vh; box-sizing: border-box; padding: 10px; background: #060607; color: #F2F2F3; font-family: 'Inter', system-ui, sans-serif; font-variant-numeric: tabular-nums")}>
        <div style={css("max-width: 1420px; margin: 0 auto; background: #0B0B0D; border: 1px solid #1A1A1D; border-radius: 18px; position: relative")}>
          <TopNav active={active} me={me} />
          {children}
        </div>
        <div aria-hidden="true" style={css("height: 92px")} />
        <AskWidget />
      </div>
    </Shell>
  );
}

/** Shared card and type styles of the reference. */
export const UI = {
  card: "border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20",
  h1: "margin: 0; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 40px; letter-spacing: -0.05em",
  th: "color: #8E8E96; font-size: 11px; letter-spacing: .08em; font-weight: 500",
  chip: (on: boolean): string => `border: 0; height: 44px; padding: 0 16px; border-radius: 12px; font-weight: 600; font-size: 15px; background: ${on ? "#F2F2F3" : "#17171A"}; color: ${on ? "#0B0B0D" : "#B4B4BB"}`,
  seg: (on: boolean): string => `border: 0; padding: 9px 14px; border-radius: 9px; font-weight: 600; font-size: 14px; background: ${on ? "#2A2A2F" : "transparent"}; color: ${on ? "#F2F2F3" : "#B4B4BB"}`,
};

export { pctS, roundPct, up } from "./num";
