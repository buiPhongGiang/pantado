"use client";
/**
 * New version (app/version/[id]) in the reference/index-layer design: the creator sets new weights per asset, a
 * reason and when it applies, then signs `IndexRegistry.rebalance` (data index: now or after a notice; the level
 * carries over) or `Rebalancer.publishVersion` (legacy vault index). Assets are added or removed in Create's edit mode.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isAddress, type Address } from "viem";
import { tx } from "@pantado/sdk";
import { useApi } from "../lib/api";
import { useChrome } from "../lib/chrome";
import { CONFIG } from "../lib/config";
import { css } from "../lib/tpl";
import { useTx, useWallet } from "../lib/wallet";
import type { AssetInfo, Composition, Holder, IndexDetail, Levels } from "../screens/index.data";
import { Alert, TxStatus, WrongNetwork } from "../screens/index.parts";
import { versionVM, WHEN_SEC, type When } from "../screens/version.vm";
import { Page } from "./page";

const CARD = "border-radius: 16px; background: #0E0E10; border: 1px solid #1C1C20";
const LABEL = "font-size: 11px; letter-spacing: .08em; color: #8E8E96";

export default function VersionView({ id }: { id: string }): ReactNode {
  const valid = isAddress(id);
  const base = valid ? `/indexes/${id}` : null;
  const detail = useApi<IndexDetail>(base, 15_000);
  const comp = useApi<Composition>(base && `${base}/composition`, 30_000);
  const holders = useApi<Holder[]>(base && `${base}/holders`, 60_000);
  const levels = useApi<Levels>(base && `${base}/levels?limit=1000`, 60_000);
  const assets = useApi<AssetInfo[]>("/assets");
  const { me } = useChrome();
  const w = useWallet();
  const publish = useTx();

  const [weights, setWeights] = useState<Record<string, number>>({});
  const [when, setWhen] = useState<When>("48h");
  const isData = detail.data?.model === "data";
  // a data index defaults to "Now" (nobody holds it); a vault index keeps its notice choices
  useEffect(() => {
    if (isData) setWhen((x) => (x === "48h" ? "Now" : x));
  }, [isData]);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  const contracts = CONFIG.deployment?.contracts ?? null;
  const schedule = useCallback(
    (weightsBps: number[], basket: string[]) => {
      if (!contracts || !valid || publish.state.status === "pending") return;
      const req =
        detail.data?.model === "data" && contracts.indexRegistry
          ? tx.rebalanceIndex(contracts.indexRegistry, id as Address, basket as Address[], weightsBps, reason.trim(), BigInt(WHEN_SEC[when]))
          : tx.publishVersion(contracts.rebalancer, id as Address, weightsBps, reason.trim());
      void publish.run([req]).then((h) => {
        if (h) {
          setDone(true);
          detail.reload();
        }
      });
    },
    [contracts, valid, publish, id, reason, detail, detail.data, when],
  );

  const vm = versionVM(
    { detail: detail.data, comp: comp.data, holders: holders.data, levels: levels.data, assets: assets.data, me, now },
    { w: weights, when, reason, done, pending: publish.state.status === "pending" },
    {
      setWeight: (a, p) => {
        setWeights((x) => ({ ...x, [a]: p }));
        setDone(false);
      },
      setWhen: (x) => {
        setWhen(x);
        setDone(false);
      },
      schedule,
    },
  );
  const onCta = (): void => {
    if (!w.address) void w.connect();
    else vm.schedule();
  };
  const error = !valid ? "This is not an index address." : (detail.error?.message ?? (!contracts ? "Pantado contracts are not deployed on this network yet." : null));

  return (
    <Page title={vm.heading} active="market">
      <div style={css("padding: 16px; display: flex; flex-direction: column; gap: 14px")}>
        <div style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 14px")}>
          <a href={`/index/${id}`} aria-label="Back to the index" style={css("width: 44px; height: 44px; border-radius: 12px; background: #131316; display: grid; place-items: center")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F2F2F3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </a>
          <h1 style={css("margin: 0; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 28px; letter-spacing: -0.04em")}>{vm.heading}</h1>
          <span style={css("color: #8E8E96; font-size: 15px")}>{vm.name}</span>
        </div>

        {error ? <Alert tone="error" title={error} /> : null}
        {w.address && !w.chainOk ? <WrongNetwork onSwitch={() => void w.switchChain()} /> : null}

        <div style={css("display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-start")}>
          <section aria-label="Weights" style={css(`flex: 999 1 560px; min-width: 0; ${CARD}; overflow: hidden`)}>
            <div style={css("display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 20px; border-bottom: 1px solid #17171A")}>
              <h2 style={css("margin: 0; font-size: 16px; font-weight: 700")}>{vm.nextName} weights</h2>
              <span style={css(`font-weight: 600; font-size: 14px; color: ${vm.totalCol}`)}>Total {vm.total}%</span>
            </div>
            <div style={css("overflow-x: auto")}>
              <table style={css("width: 100%; min-width: 560px; border-collapse: collapse; font-size: 14px")}>
                <thead>
                  <tr style={css(LABEL)}>
                    <th style={css("text-align: left; padding: 12px 20px; font-weight: 500")}>ASSET</th>
                    <th style={css("text-align: right; padding: 12px 8px; font-weight: 500")}>NOW</th>
                    <th style={css("text-align: left; padding: 12px 8px 12px 24px; font-weight: 500")}>NEW</th>
                    <th style={css("text-align: right; padding: 12px 20px; font-weight: 500")}>CHANGE</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.rows.map((r) => (
                    <tr key={r.t} style={css("border-top: 1px solid #17171A")}>
                      <td style={css("padding: 12px 20px")}>
                        <span style={css("display: flex; align-items: center; gap: 10px")}>
                          <span aria-hidden="true" style={css(`width: 24px; height: 24px; border-radius: 50%; background: ${r.avBg ?? r.c}; display: grid; place-items: center; font-size: 10px; font-weight: 700`)}>
                            {r.ini2}
                          </span>
                          <b>{r.t}</b>
                        </span>
                      </td>
                      <td style={css("padding: 12px 8px; text-align: right; color: #B4B4BB")}>{r.old}%</td>
                      <td style={css("padding: 12px 8px 12px 24px")}>
                        <span style={css("display: flex; align-items: center; gap: 12px")}>
                          <input type="range" min={0} max={100} step={1} value={r.w} onChange={r.set} aria-label={r.label} style={css("flex: 1; min-width: 120px")} />
                          <span style={css("width: 44px; text-align: right; font-weight: 700")}>{r.w}%</span>
                        </span>
                      </td>
                      <td style={css(`padding: 12px 20px; text-align: right; font-weight: 600; color: ${r.dCol}`)}>{r.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isData ? (
              <div style={css("padding: 12px 20px 16px; border-top: 1px solid #17171A; font-size: 13px; color: #8E8E96")}>
                {"Nothing is traded: the level carries over and follows the new weights. "}
                <a href={`/create?edit=${id}`} style={css("color: #B18CFB; font-weight: 600")}>
                  Add or remove assets
                </a>
              </div>
            ) : null}
          </section>

          <aside style={css("flex: 1 1 320px; min-width: 0; max-width: 100%; display: flex; flex-direction: column; gap: 10px")}>
            <div style={css(`padding: 16px; ${CARD}; display: flex; flex-direction: column; gap: 12px`)}>
              <h2 style={css("margin: 0; font-size: 15px; font-weight: 700")}>When it applies</h2>
              <div role="group" aria-label="When" style={css(`display: grid; grid-template-columns: repeat(${vm.whens.length}, minmax(0, 1fr)); gap: 2px; padding: 4px; border-radius: 12px; background: #131316`)}>
                {vm.whens.map((x) => (
                  <button key={x.label} type="button" aria-pressed={x.on === "true"} onClick={x.pick} style={css(`border: 0; height: 36px; border-radius: 9px; font-weight: 700; font-size: 13px; white-space: nowrap; background: ${x.bg}; color: ${x.fg}`)}>
                    {x.label}
                  </button>
                ))}
              </div>
              <label htmlFor="reason" style={css(LABEL)}>
                REASON
              </label>
              <textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 280))}
                placeholder="Why the basket changes, in one sentence"
                style={css("width: 100%; box-sizing: border-box; padding: 12px 14px; resize: vertical; background: #131316; border: 1px solid #26262B; border-radius: 12px; color: #F2F2F3; font-family: inherit; font-size: 15px; line-height: 1.5")}
              />
            </div>

            <div style={css(`padding: 16px; ${CARD}; display: flex; flex-direction: column; gap: 10px`)}>
              <h2 style={css("margin: 0; font-size: 15px; font-weight: 700")}>Summary</h2>
              <div style={css("font-size: 14px; line-height: 1.5")}>{vm.summary}</div>
              <div style={css("display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px")}>
                <div style={css("padding: 12px 14px; border-radius: 12px; background: #131316")}>
                  <div style={css("font-size: 12px; color: #8E8E96")}>Turnover</div>
                  <div style={css("margin-top: 2px; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 20px")}>{vm.turn}</div>
                </div>
                <div style={css("padding: 12px 14px; border-radius: 12px; background: #131316")}>
                  <div style={css("font-size: 12px; color: #8E8E96")}>Applies</div>
                  <div style={css("margin-top: 2px; font-family: 'Inter Tight', sans-serif; font-weight: 700; font-size: 20px")}>{vm.whenText}</div>
                </div>
              </div>
              {publish.state.status !== "confirmed" ? <TxStatus state={publish.state} pending={`One signature publishes ${vm.nextName.toLowerCase()}`} confirmed="" failed="Publishing failed" /> : null}
              {vm.done ? <div style={css("font-size: 14px; font-weight: 600; color: #3DD68C")}>{when === "Now" ? `${vm.nextName} is live.` : `${vm.nextName} is scheduled: it applies ${vm.whenText}.`}</div> : null}
              <button type="button" onClick={onCta} aria-disabled={vm.disabled === "true" && !!w.address} style={css(`border: 0; height: 48px; border-radius: 12px; font-weight: 700; font-size: 15px; background: ${w.address ? vm.cta.bg : "#9052F9"}; color: ${w.address ? vm.cta.fg : "#FFFFFF"}`)}>
                {w.address ? vm.cta.label : "Connect to publish"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </Page>
  );
}
