"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseEventLogs, type Address } from "viem";
import { indexRegistryAbi, RebalanceMode, tx as txb, type TxRequest } from "@pantado/sdk";
import { apiGet, ApiRequestError, useApi } from "../lib/api";
import { CONFIG } from "../lib/config";
import { useTx, useWallet } from "../lib/wallet";
import type { AssetView, CandlesView, IndexView, PresetView } from "../screens/asset.api";
import { forkPrefill, parseDraft, type PresetKey, type Prefill } from "../screens/create.draft";
import { backtest, type DailyClose } from "../screens/create.metrics";
import { AUTO_INTERVAL_DAYS, MAX_ASSETS, validate, type CreateState } from "../screens/create.vm";

const INITIAL: CreateState = {
  picked: [],
  w: {},
  f: "All",
  search: "",
  name: "My basket",
  ticker: "",
  description: "",
  vis: "Public",
  mode: "Auto",
  drift: 50,
  step: "edit",
};

/** AVAX is the benchmark of the "vs AVAX 90D" metric. */
const BENCH = "wavax";

export const addrOf = (a: AssetView): Address | null => (CONFIG.deployment?.assets[a.id] as Address | undefined) ?? (a.execution.address as Address | null);

/**
 * Create / edit an index on the IndexRegistry (B101): form state, pre-fill from an agent draft, a fork or your own
 * index (edit), ticker check, presets, 90-day backtest, and the one-signature define / rebalance.
 */
export function useCreate({ draft, fork, edit }: { draft?: string; fork?: string; edit?: string }) {
  const [s, setS] = useState<CreateState>(INITIAL);
  const set = useCallback((p: Partial<CreateState>) => setS((x) => ({ ...x, ...p })), []);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [tickerTaken, setTickerTaken] = useState<boolean | null>(null);
  const [closes, setCloses] = useState<Record<string, DailyClose[]>>({});
  const [created, setCreated] = useState<{ index: string | null } | null>(null);
  const w = useWallet();
  const t = useTx();
  const assets = useApi<AssetView[]>("/assets", 30_000);
  const source = edit ?? fork;
  const srcIx = useApi<IndexView>(source ? `/indexes/${encodeURIComponent(source)}` : null);
  const editing = edit && srcIx.data && srcIx.data.model === "data" ? { ticker: srcIx.data.ticker, name: srcIx.data.name } : null;
  const byId = useMemo(() => new Map((assets.data ?? []).filter((a) => a.kind !== "quote").map((a) => [a.id, a])), [assets.data]);
  const registryAddr = CONFIG.deployment?.contracts.indexRegistry ?? null;

  // ---- pre-fill, once the asset list is loaded
  const prefilled = useRef(false);
  const apply = useCallback((p: Prefill) => {
    prefilled.current = true;
    setS((x) => ({ ...x, picked: p.picked, w: p.w, name: p.name ?? x.name, ticker: p.ticker ?? x.ticker, description: p.description ?? x.description, mode: p.mode ?? x.mode }));
  }, []);
  useEffect(() => {
    if (prefilled.current || byId.size === 0) return;
    if (draft) {
      const p = parseDraft(draft, new Set(byId.keys()));
      if (p) apply(p);
      else prefilled.current = true;
    } else if (source && srcIx.data) {
      const idByAddr = new Map<string, string>();
      for (const a of byId.values()) {
        const x = addrOf(a);
        if (x) idByAddr.set(x.toLowerCase(), a.id);
      }
      const ix = srcIx.data;
      const p = forkPrefill(ix.assets, ix.targetBps, idByAddr);
      if (edit) {
        apply({ ...p, name: ix.name, ticker: ix.ticker, mode: ix.mode === 2 ? "Auto" : ix.mode === 1 ? "Manual" : "Off" });
        if (ix.mode === 2 && ix.driftBps) set({ drift: Math.round(ix.driftBps / 100) });
      } else apply(p);
    }
  }, [draft, source, edit, srcIx.data, byId, apply, set]);

  // ---- ticker uniqueness (registry read)
  useEffect(() => {
    if (editing || !registryAddr || !/^[A-Z0-9]{2,6}$/.test(s.ticker)) {
      setTickerTaken(null);
      return;
    }
    let live = true;
    const h = setTimeout(() => {
      w.pub
        .readContract({ address: registryAddr, abi: indexRegistryAbi, functionName: "isTickerTaken", args: [s.ticker] })
        .then((x) => live && setTickerTaken(Boolean(x)))
        .catch(() => live && setTickerTaken(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [s.ticker, registryAddr, w.pub, editing]);

  // ---- metrics: daily closes per picked asset (and the AVAX benchmark) → 90-day backtest
  const pickedKey = s.picked.join(",");
  useEffect(() => {
    const missing = [...s.picked, BENCH].filter((id) => !(id in closes));
    if (missing.length === 0) return;
    let live = true;
    void Promise.all(
      missing.map((id) =>
        apiGet<CandlesView>(`/assets/${encodeURIComponent(id)}/candles?interval=1d&limit=120`)
          .then((c) => [id, c.candles.map((k) => ({ t: k.t, c: k.c }))] as const)
          .catch(() => [id, [] as DailyClose[]] as const),
      ),
    ).then((rows) => live && setCloses((x) => ({ ...x, ...Object.fromEntries(rows) })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedKey]);
  const bt = useMemo(
    () => (s.picked.length && s.picked.every((id) => id in closes) ? backtest(s.picked.map((id) => closes[id] ?? []), s.picked.map((id) => s.w[id] ?? 0)) : null),
    [s.picked, s.w, closes],
  );
  const avax = useMemo(() => (closes[BENCH]?.length ? backtest([closes[BENCH] ?? []], [100]) : null), [closes]);

  const sel = s.picked.map((id) => byId.get(id)).filter((a): a is AssetView => !!a);
  const addrs = sel.map(addrOf);
  const weightsBps = s.picked.map((id) => (s.w[id] ?? 0) * 100);
  const basketOk = sel.length >= 2 && addrs.every((a) => a !== null) && weightsBps.reduce((x, y) => x + y, 0) === 10_000 && weightsBps.every((x) => x >= 100);

  // ---- actions
  const toggle = useCallback(
    (id: string): void =>
      setS((x) => {
        if (x.picked.includes(id)) return { ...x, picked: x.picked.filter((p) => p !== id) };
        if (x.picked.length >= MAX_ASSETS) return x;
        return { ...x, picked: [...x.picked, id], w: { ...x.w, [id]: x.w[id] ?? 0 } };
      }),
    [],
  );
  const setW = useCallback((id: string, v: number) => setS((x) => ({ ...x, w: { ...x.w, [id]: Math.max(0, Math.min(100, Math.round(v))) } })), []);
  const preset = (p: PresetKey): void => {
    if (s.picked.length < 2) return;
    setPresetError(null);
    apiGet<PresetView>(`/presets?assets=${s.picked.map(encodeURIComponent).join(",")}&preset=${p}`)
      .then((r) => {
        const ids = s.picked;
        setS((x) => ({ ...x, w: { ...x.w, ...Object.fromEntries(ids.map((id, k) => [id, r.weights[k] ?? 0])) } }));
      })
      .catch((e: unknown) => setPresetError(e instanceof ApiRequestError ? e.message : "Cannot reach the Pantado API."));
  };
  const review = (): void => {
    if (validate(s, editing ? false : tickerTaken)) return;
    t.reset();
    set({ step: "review" });
  };
  const back = (): void => {
    t.reset();
    set({ step: "edit" });
  };

  const driftBps = Math.min(20_000, Math.max(1_000, s.drift * 100));
  const modeArgs = (): { mode: (typeof RebalanceMode)[keyof typeof RebalanceMode]; driftBps: number; intervalSec: bigint } =>
    s.mode === "Auto" ? { mode: RebalanceMode.Auto, driftBps, intervalSec: BigInt(AUTO_INTERVAL_DAYS * 86_400) } : { mode: RebalanceMode[s.mode], driftBps: 0, intervalSec: 0n };
  const confirm = (): void => {
    if (!registryAddr || !w.address || !basketOk || t.state.status === "pending") return;
    const basket = addrs.filter((a): a is Address => a !== null);
    const m = modeArgs();
    if (editing && edit) {
      // a new basket now (the level carries over); a changed rebalance mode in the same signature batch
      const reqs: TxRequest[] = [txb.rebalanceIndex(registryAddr, edit as Address, basket, weightsBps, s.description.trim() || "New basket", 0n)];
      const ix = srcIx.data;
      if (ix && (ix.mode !== m.mode || (m.mode === RebalanceMode.Auto && ix.driftBps !== m.driftBps))) reqs.push(txb.setIndexMode(registryAddr, edit as Address, m.mode, m.driftBps, m.intervalSec));
      void t.run(reqs).then((hash) => {
        if (!hash) return;
        setCreated({ index: edit });
        set({ step: "done" });
      });
      return;
    }
    void t
      .run([txb.defineIndex(registryAddr, { name: s.name.trim(), ticker: s.ticker, description: s.description.trim(), assets: basket, weightsBps, isPublic: s.vis === "Public", ...m })])
      .then(async (hash) => {
        if (!hash) return;
        let index: string | null = null;
        try {
          const rc = await w.pub.getTransactionReceipt({ hash });
          const ev = parseEventLogs({ abi: indexRegistryAbi, eventName: "IndexCreated", logs: rc.logs })[0];
          index = ev ? ev.args.index : null;
        } catch {
          /* the banner still links to Workspace */
        }
        setCreated({ index });
        set({ step: "done" });
      });
  };

  return {
    s,
    set,
    assets: assets.data ?? [],
    assetsError: assets.error,
    sourceError: srcIx.error,
    editing,
    tickerTaken: editing ? false : tickerTaken,
    presetError,
    bt,
    avax,
    created,
    tx: t.state,
    wallet: { connected: w.address !== null, chainOk: w.chainOk, connect: () => void w.connect().catch(() => undefined), switchChain: () => void w.switchChain() },
    deployed: registryAddr !== null,
    actions: { toggle, setW, preset, review, back, confirm },
  };
}
