"use client";
import type { ReactNode } from "react";
import type { Me } from "../lib/chrome";
import { css } from "../lib/tpl";

/** Top-level destinations (reference/index-layer: the rail is gone, navigation is this bar). */
export type NavKey = "market" | "create" | "workspace" | "network" | null;

const ITEMS: { key: Exclude<NavKey, null>; label: string; href: string }[] = [
  { key: "market", label: "Market", href: "/" },
  { key: "create", label: "Create", href: "/create" },
  { key: "workspace", label: "Workspace", href: "/workspace" },
  { key: "network", label: "Network", href: "/network" },
];

export function Mark({ size = 24 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={(size * 18) / 24} viewBox="10 14 324 241" aria-hidden="true">
      <path d="M94 16H238C291 16 331 60 331 113C331 166 291 206 240 206H213L219 200C247 195 267 176 267 153C267 126 247 104 221 104H94Z" fill="#F4F2FA" />
      <path d="M137 146V252H12V214C12 176 42 146 80 146Z" fill="#9052F9" />
    </svg>
  );
}

export function TopNav({ active, me }: { active: NavKey; me: Me }): ReactNode {
  return (
    <header style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 24px; padding: 14px 16px; border-bottom: 1px solid #17171A")}>
      <a href="/" aria-label="Pantado home" style={css("display: flex; align-items: center; gap: 12px")}>
        <span style={css("width: 44px; height: 44px; border-radius: 12px; background: #17171A; border: 1px solid #1F1F23; display: grid; place-items: center")}>
          <Mark />
        </span>
        <img src="/wordmark.png" alt="pantado" style={css("height: 22px; width: auto")} />
      </a>
      <nav aria-label="Main" style={css("display: flex; gap: 4px; flex-wrap: wrap")}>
        {ITEMS.map((it) => {
          const on = it.key === active;
          return (
            <a
              key={it.key}
              href={it.href}
              {...(on ? { "aria-current": "page" as const } : {})}
              style={css(`padding: 10px 16px; border-radius: 12px; font-weight: 600; font-size: 15px; ${on ? "background: #1C1C20; color: #F2F2F3" : "color: #8E8E96"}`)}
            >
              {it.label}
            </a>
          );
        })}
      </nav>
      <div style={css("margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap")}>
        <span style={css("display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px; border-radius: 12px; background: #131316; font-weight: 600; font-size: 14px")}>
          <span style={css("width: 7px; height: 7px; border-radius: 50%; background: #E84142")} aria-hidden="true" />
          <span className="hide-sm">Avalanche</span>
          {me.netBadge ? <span style={css("padding: 3px 8px; border-radius: 6px; background: #2E2311; color: #F5B14C; font-size: 12px; font-weight: 600")}>{me.netBadge}</span> : null}
        </span>
        {me.address ? (
          <details className="acct" style={css("position: relative")}>
            <summary aria-label="Account menu" style={css("list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px 0 8px; border-radius: 12px; background: #131316; font-weight: 600; font-size: 14px")}>
              <span aria-hidden="true" style={css("width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(90deg, #F2F2F3 50%, #9052F9 50%)")} />
              {me.short}
            </summary>
            <div role="menu" style={css("position: absolute; right: 0; top: 52px; z-index: 30; min-width: 200px; padding: 6px; background: #0B0B0D; border: 1px solid #26262B; border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.5); display: flex; flex-direction: column")}>
              <a role="menuitem" href="/workspace" style={css("display: flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 10px; font-size: 14px; font-weight: 500")}>
                Workspace
              </a>
              <button type="button" role="menuitem" data-logout="1" style={css("display: flex; align-items: center; min-height: 44px; padding: 0 12px; font-size: 14px; font-weight: 500; background: transparent; border: 0; border-top: 1px solid #1C1C20; color: #FF6B6B; text-align: left")}>
                Log out
              </button>
            </div>
          </details>
        ) : (
          <a href="/connect" style={css("display: flex; align-items: center; height: 44px; padding: 0 20px; border-radius: 12px; background: #9052F9; color: #FFFFFF; font-weight: 700; font-size: 15px")}>
            Connect
          </a>
        )}
      </div>
    </header>
  );
}
