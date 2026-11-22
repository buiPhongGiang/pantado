import type { ReactNode } from "react";
import { css } from "./tpl";

/** Rail entry styles, the same as the reference rail (apps/web/reference/pantado-app.html). */
const ITEM_ON = "position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; color: #F2F2F3";
const ITEM_OFF = "position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 12px; font-weight: 400; color: #B4B4BB";
const TILE_ON = "display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; background: #221637; color: #B18CFB";
const TILE_OFF = "display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; background: transparent; color: #B4B4BB";

/** Network: the Pantado Price Chain (reporters, rounds, ICM delivery). Three linked nodes in the rail's line style. */
export function NavNetwork({ active }: { active: boolean }): ReactNode {
  return (
    <a style={css(active ? ITEM_ON : ITEM_OFF)} href="/network" {...(active ? { "aria-current": "page" as const } : {})}>
      <span style={css(active ? TILE_ON : TILE_OFF)}>
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="4.5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="4.5" cy="16.5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="17.5" cy="16.5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9.8 6.6 5.7 14.4M12.2 6.6l4.1 7.8M6.8 16.5h8.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </span>
      {"Network"}
    </a>
  );
}
