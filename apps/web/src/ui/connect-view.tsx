"use client";
import type { ReactNode } from "react";
import { BRAND_LOGOS } from "../lib/logos";
import { css } from "../lib/tpl";
import { useWallet } from "../lib/wallet";
import { Page } from "./page";
import { Mark } from "./topnav";

const mark = (src: string, size: number, radius = 0): ReactNode => (
  <img src={src} alt="" aria-hidden="true" width={size} height={size} style={{ width: size, height: size, borderRadius: radius, flex: "none", display: "block" }} />
);
const WALLET_BTN = "display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 0 14px; background: #131316; color: #F2F2F3; border: 1px solid #1F1F23; border-radius: 12px; font-size: 15px; font-weight: 500; text-align: left";

/**
 * Connect (new design language): one centred card. The `[data-connect]` buttons and the email "Send code" button are
 * wired by the Shell (src/lib/shell.tsx): with Privy, Google / X / email sign in through it; wallet rows (and every
 * row without Privy) connect the browser wallet, then return to the previous page.
 */
export default function ConnectView(): ReactNode {
  const w = useWallet();
  return (
    <Page title="Connect" active={null}>
      <div style={css("padding: 48px 16px 64px; display: flex; justify-content: center")}>
        <div role="dialog" aria-labelledby="connect-title" style={css("width: 100%; max-width: 420px; box-sizing: border-box; background: #0E0E10; border: 1px solid #1C1C20; border-radius: 20px; padding: 24px; display: flex; flex-direction: column; gap: 14px")}>
          <div style={css("display: flex; justify-content: space-between; align-items: center")}>
            <span style={css("display: flex; align-items: center; gap: 10px")}>
              <Mark size={27} />
              <h1 id="connect-title" style={css("margin: 0; font-family: 'Inter Tight', sans-serif; font-size: 22px; font-weight: 700; letter-spacing: -0.03em")}>
                Connect to Pantado
              </h1>
            </span>
            <a href="/" aria-label="Close" style={css("width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; color: #8E8E96")}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </a>
          </div>
          <p style={css("margin: 0; font-size: 14px; line-height: 1.5; color: #B4B4BB")}>Create indexes, keep a watchlist and your Ask chats.</p>
          <button type="button" data-connect="1" style={css("display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 52px; background: #F2F2F3; color: #0B0B0D; border: 0; border-radius: 12px; font-size: 15px; font-weight: 600")}>
            {mark(BRAND_LOGOS.google, 18)}
            Continue with Google
          </button>
          <button type="button" data-connect="1" style={css("display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 52px; background: #1A1A1D; color: #F2F2F3; border: 0; border-radius: 12px; font-size: 15px; font-weight: 600")}>
            {mark(BRAND_LOGOS.x, 16)}
            Continue with X
          </button>
          <form onSubmit={(e) => e.preventDefault()} style={css("display: flex; gap: 8px")}>
            <label htmlFor="email" style={css("position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)")}>
              Email
            </label>
            <input id="email" type="email" placeholder="you@email.com" style={css("flex: 1 1 auto; min-width: 0; min-height: 52px; padding: 0 14px; background: #131316; border: 1px solid #26262B; border-radius: 12px; color: #F2F2F3; font-family: inherit; font-size: 15px")} />
            <button type="button" style={css("min-height: 52px; padding: 0 16px; background: #1A1A1D; color: #F2F2F3; border: 0; border-radius: 12px; font-size: 14px; font-weight: 600")}>
              Send code
            </button>
          </form>
          <div style={css("display: flex; align-items: center; gap: 12px; color: #8E8E96; font-size: 13px")}>
            <span style={css("flex: 1; height: 1px; background: #1F1F23")} />
            or use a wallet
            <span style={css("flex: 1; height: 1px; background: #1F1F23")} />
          </div>
          <button type="button" data-connect="1" style={css(WALLET_BTN)}>
            {mark(BRAND_LOGOS.core, 26, 8)}
            Core
          </button>
          <button type="button" data-connect="1" style={css(WALLET_BTN)}>
            {mark(BRAND_LOGOS.metamask, 26, 8)}
            MetaMask
          </button>
          <button type="button" data-connect="1" style={css(WALLET_BTN)}>
            {mark(BRAND_LOGOS.walletconnect, 26, 8)}
            WalletConnect
          </button>
          <p style={css("margin: 0; font-size: 13px; line-height: 1.5; color: #8E8E96; text-align: center")}>
            {w.socialEnabled ? "No wallet? One is created for you, and only you hold the keys." : "Every option connects the wallet in your browser."}
          </p>
        </div>
      </div>
    </Page>
  );
}
