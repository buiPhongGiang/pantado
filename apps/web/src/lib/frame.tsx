import type { ReactNode } from "react";
import { css } from "./tpl";
import type { Me } from "./chrome";
import { NavNetwork } from "./rail-items";

/**
 * Page frame for screens that are not in the reference (the Network page): the reference's outer layout, left rail
 * and top bar, copied from the generated screens so the page looks like every other one. `active` marks the rail
 * entry of the page.
 */
const ON = "position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #F2F2F3";
const OFF = "position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 12px; font-weight: 400; color: #B4B4BB";
const TILE_ON = "display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; background: #221637; color: #B18CFB";
const TILE_OFF = "display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; background: transparent; color: #B4B4BB";

type Key = "ask" | "network" | "marketplace" | "create" | "portfolio";

function Item({ href, label, on, icon }: { href: string; label: string; on: boolean; icon: ReactNode }): ReactNode {
  return (
    <a style={css(on ? ON : OFF)} href={href} {...(on ? { "aria-current": "page" as const } : {})}>
      <span style={css(on ? TILE_ON : TILE_OFF)}>{icon}</span>
      {label}
    </a>
  );
}

export function Rail({ active }: { active: Key }): ReactNode {
  return (
    <nav aria-label="Main" className="rail" style={css("flex: 0 0 76px; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 8px 0")}>
      <a aria-label="Pantado home" style={css("display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; background: #121214; border: 1px solid #1C1C20; margin-bottom: 10px")} href="/">
        <svg width="27" height="20" viewBox="10 14 324 241" aria-hidden="true">
          <path d="M94 16H238C291 16 331 60 331 113C331 166 291 206 240 206H213L219 200C247 195 267 176 267 153C267 126 247 104 221 104H94Z" fill="#F4F2FA" />
          <path d="M137 146V252H12V214C12 176 42 146 80 146Z" fill="#9052F9" />
        </svg>
      </a>
      <Item href="/" label="Ask" on={active === "ask"} icon={<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M4 5h14v10H10l-4 3v-3H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>} />
      <NavNetwork active={active === "network"} />
      <Item href="/marketplace" label="Marketplace" on={active === "marketplace"} icon={<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M5 18V11M11 18V4M17 18v-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>} />
      <Item
        href="/create"
        label="Create"
        on={active === "create"}
        icon={
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <rect x="4" y="4" width="14" height="14" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        }
      />
      <Item href="/portfolio" label="Portfolio" on={active === "portfolio"} icon={<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 6h14a2 2 0 012 2v8a2 2 0 01-2 2H3zM3 6V5a1 1 0 011-1h11M15 12h1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg>} />
    </nav>
  );
}

export function TopBar({ title, me, left }: { title: string; me: Me; left?: ReactNode }): ReactNode {
  return (
    <div style={css("display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px")}>
      <span style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-width: 0")}>
        <h1 style={css("margin: 0; padding-left: 6px; font-family: 'Inter Tight', sans-serif; font-size: 24px; font-weight: 600; letter-spacing: -0.02em")}>{title}</h1>
        {left}
      </span>
      <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 8px")}>
        <span style={css("display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; background: #1A1A1D; border-radius: 12px; font-size: 14px; font-weight: 500")}>
          <span style={css("width: 8px; height: 8px; border-radius: 50%; background: #E84142; display: inline-block")} aria-hidden="true"></span>
          <span className="hide-sm">{"Avalanche"}</span>
          <span className="hide-sm" style={css("padding: 2px 8px; border-radius: 999px; background: #2E2311; color: #F5B14C; font-size: 12px; font-weight: 600")}>{me.netBadge}</span>
        </span>
        <span data-when="out" style={css("display: contents")}>
          <a style={css("display: flex; align-items: center; min-height: 44px; padding: 0 20px; background: #9052F9; color: #FFFFFF; border-radius: 12px; font-size: 14px; font-weight: 700")} href="/connect">
            {"Connect"}
          </a>
        </span>
        <span data-when="in" style={css("display: contents")}>
          <details className="acct" style={css("position: relative")}>
            <summary aria-label="Account menu" style={css("list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px 0 8px; background: #1A1A1D; border-radius: 12px; font-size: 14px; font-weight: 600")}>
              <span style={css("width: 28px; height: 28px; border-radius: 50%; background: #221637; color: #B18CFB; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700")} aria-hidden="true">
                {"G"}
              </span>
              {me.short}
              <span style={css("font-weight: 400; color: #8E8E96")}>{me.balanceS}</span>
            </summary>
            <div role="menu" style={css("position: absolute; right: 0; top: 52px; z-index: 30; min-width: 220px; padding: 6px; background: #0B0B0D; border: 1px solid #26262B; border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column")}>
              <a role="menuitem" style={css("display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #F2F2F3")} href="/profile">
                {"Profile"}
              </a>
              <a role="menuitem" style={css("display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #F2F2F3")} href="/portfolio">
                {"Portfolio"}
              </a>
              <button type="button" role="menuitem" data-logout="1" style={css("display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; font-size: 14px; font-weight: 500; background: transparent; border: 0; border-top: 1px solid #1C1C20; border-radius: 0 0 10px 10px; color: #FF6B6B; text-align: left")}>
                {"Log out"}
              </button>
            </div>
          </details>
        </span>
      </div>
    </div>
  );
}

/** Outer layout + rail + main card, as in the reference. */
export function Frame({ active, children }: { active: Key; children: ReactNode }): ReactNode {
  return (
    <div style={css("min-height: 100%; box-sizing: border-box; padding: 10px; background: #060607; color: #F2F2F3; font-family: 'Inter', system-ui, sans-serif; font-variant-numeric: tabular-nums; display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch")}>
      <Rail active={active} />
      <main style={css("flex: 999 1 560px; min-width: 0; box-sizing: border-box; padding: 14px 16px 28px; background: #121214; border: 1px solid #1C1C20; border-radius: 20px; display: flex; flex-direction: column; gap: 16px")}>{children}</main>
    </div>
  );
}
