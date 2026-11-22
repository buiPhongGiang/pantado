"use client";
/**
 * New version container (app/version/[id]): the creator of a Manual index sets new target weights and a reason,
 * then signs Rebalancer.publishVersion. The notice period, daily cap, loss budget and max duration are enforced
 * by the contract for every plan.
 */
import { useCallback, useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import { tx } from "@pantado/sdk";
import { useApi } from "../lib/api";
import { useChrome } from "../lib/chrome";
import { CONFIG } from "../lib/config";
import { nav } from "../lib/nav";
import { Shell } from "../lib/shell";
import { css } from "../lib/tpl";
import { useTx, useWallet } from "../lib/wallet";
import { VersionScreen, title } from "./gen/Version.gen";
import type { AssetInfo, Composition, Holder, IndexDetail, Levels } from "./index.data";
import { Alert, TxStatus, WrongNetwork } from "./index.parts";
import { versionVM, WHEN_SEC, type When } from "./version.vm";

export default function VersionPage({ id }: { id: string }) {
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
    if (isData) setWhen((w) => (w === "48h" ? "Now" : w));
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
      // data index (B101): new weights take effect at once on the IndexRegistry, the level carries over
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
  // not signed in: the button signs in first
  const v = w.address ? vm : { ...vm, schedule: () => void w.connect() };

  const error = !valid ? "This is not an index address." : detail.error?.message ?? (!contracts ? "Pantado contracts are not deployed on this network yet." : null);
  const slots = {
    reason: () => (
      <>
        <textarea
          id="reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={css("width: 100%; box-sizing: border-box; padding: 12px 14px; resize: none; background: #131316; border: 1px solid #26262B; border-radius: 12px; color: #F2F2F3; font-family: inherit; font-size: 15px; line-height: 1.5")}
        />
        {isData ? (
          <span style={css("font-size: 13px; color: #8E8E96")}>
            {"Nothing is traded: the level carries over and follows the new weights. "}
            <a href={`/create?edit=${id}`} style={css("color: #B18CFB; font-weight: 600")}>
              {"Add or remove assets"}
            </a>
          </span>
        ) : null}
        {error ? <Alert tone="error" title={error} /> : null}
        {w.address && !w.chainOk ? <WrongNetwork onSwitch={() => void w.switchChain()} /> : null}
        {publish.state.status !== "confirmed" ? (
          <TxStatus state={publish.state} pending={`One signature publishes ${vm.nextName.toLowerCase()}`} confirmed="" failed="Publishing failed" />
        ) : null}
      </>
    ),
  };

  return (
    <Shell title={title}>
      <VersionScreen v={v} nav={nav} slots={slots} />
    </Shell>
  );
}
