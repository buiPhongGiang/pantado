import type { ReactNode } from "react";
import type { Scope } from "./tpl";
import { NavNetwork } from "./rail-items";

/**
 * Slots every generated screen renders unless the screen passes its own (scripts/bindings/_common.ts):
 * the rail's Network entry sits where the reference's Swap entry was (no trading in the app).
 */
export const commonSlots: Record<string, (scope: Scope) => ReactNode> = {
  navNetwork: () => <NavNetwork active={false} />,
};
