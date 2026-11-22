"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { parseEventLogs, type Address } from "viem";
import { indexRegistryAbi, RebalanceMode, tx as txb, type TxRequest } from "@pantado/sdk";
import { apiGet, ApiRequestError, useApi } from "../lib/api";
import { useChrome } from "../lib/chrome";
import { CONFIG } from "../lib/config";
import { nav } from "../lib/nav";
import { Shell } from "../lib/shell";
import { css, lookup, type Scope } from "../lib/tpl";
import { useTx, useWallet } from "../lib/wallet";
import type { AssetView, CandlesView, IndexView, PresetView } from "./asset.api";
import { Notices, TxStatusLine } from "./asset.parts";
import type { Notice, TxLine } from "./asset.states";
import { forkPrefill, parseDraft, type PresetKey, type Prefill } from "./create.draft";
import { backtest, type DailyClose } from "./create.metrics";
import { AUTO_INTERVAL_DAYS, createVM, MAX_ASSETS, validate, type CreateState } from "./create.vm";
import { CreateScreen, title } from "./gen/Create.gen";

const INITIAL: CreateState = {
  picked: [],
  w: {},
  f: "All",
  search: "",
  name: "My basket",
  ticker: "",
  description: "",
  vis: "Private",
  mode: "Manual",
  drift: 50,
  step: "edit",
};

/** Created banner (reference markup) with the live notices and tx line above it. */
const slots = {
  status: (s: Scope) => {
    const l = lookup("status", s) as TxLine | null;
    const done = lookup("isDone", s) === true;
    return (
      <div data-create-status="" style={css("display: flex; flex-direction: column; gap: 8px")}>
        <Notices list={(lookup("notices", s) as Notice[]) ?? []} />
        {l ? <TxStatusLine s={l} /> : null}
        {done ? (
          <div role="status" style={css("display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 16px; background: #11261B; border: 1px solid #1D4A33; border-radius: 14px; font-size: 14px")}>
            <span style={css("display: flex; flex-direction: column; gap: 2px")}>
              <span style={css("color: #3DD68C; font-weight: 600")}>{String(lookup("createdText", s) ?? "")}</span>
              <span style={css("font-size: 13px; color: #B4B4BB")}>{String(lookup("createdSub", s) ?? "")}</span>
            </span>
            <span style={css("margin-left: auto; display: flex; gap: 8px")}>
              <a style={css("display: flex; align-items: center; min-height: 40px; padding: 0 14px; background: #1A1A1D; border-radius: 10px; font-size: 13px; font-weight: 600")} href={nav("Portfolio", s)}>
                {"Your indexes"}
              </a>
              <a style={css("display: flex; align-items: center; min-height: 40px; padding: 0 14px; background: #F2F2F3; color: #0B0B0D; border-radius: 10px; font-size: 13px; font-weight: 700")} href={nav("IndexDetail", s)}>
                {"Open index"}
              </a>
            </span>
          </div>
        ) : null}
      </div>
    );
  },
};

const addrOf = (a: AssetView): Address | null => (CONFIG.deployment?.assets[a.id] as Address | undefined) ?? (a.execution.address as Address | null);

export default function Create({ draft, fork, edit }: { draft?: string; fork?: string; edit?: string }) {
  const [s, setS] = useState<CreateState>(INITIAL);
  // the review opens under the "Review" button at the bottom (globals.css, B94): bring it into view
  useEffect(() => {
    if (s.step !== "review" && s.step !== "done") return;
    const id = window.setTimeout(() => {
      document.querySelector(s.step === "review" ? "main > [aria-labelledby='cr-title']" : "main > [data-create-status]")?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [s.step]);
  const set = useCallback((p: Partial<CreateState>) => setS((x) => ({ ...x, ...p })), []);
  const [formKey, setFormKey] = useState(0);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [tickerTaken, setTickerTaken] = useState<boolean | null>(null);
  const [closes, setCloses] = useState<Record<string, DailyClose[]>>({});
  const [created, setCreated] = useState<{ index: string | null } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const w = useWallet();
  const t = useTx();
  const { me } = useChrome();
  const assets = useApi<AssetView[]>("/assets", 30_000);
  // fork copies another index's basket; edit loads your own data index to publish a new basket for it
  const source = edit ?? fork;
  const forkIx = useApi<IndexView>(source ? `/indexes/${encodeURIComponent(source)}` : null);
  const editing = edit && forkIx.data && forkIx.data.model === "data" ? { ticker: forkIx.data.ticker, name: forkIx.data.name } : null;
  const byId = useMemo(() => new Map((assets.data ?? []).filter((a) => a.kind !== "quote").map((a) => [a.id, a])), [assets.data]);
  // indexes are defined on the IndexRegistry (B101): no deposit, the level follows published prices
  const registryAddr = CONFIG.deployment?.contracts.indexRegistry ?? null;

  // ---- pre-fill (agent draft or fork), once the registry is loaded
  const prefilled = useRef(false);
  const apply = useCallback(
    (p: Prefill) => {
      prefilled.current = true;
      setS((x) => ({
        ...x,
        picked: p.picked,
        w: p.w,
        name: p.name ?? x.name,
        ticker: p.ticker ?? x.ticker,
        description: p.description ?? x.description,
        mode: p.mode ?? x.mode,
      }));
      setFormKey((k) => k + 1);
    },
    [],
  );
  useEffect(() => {
    if (prefilled.current || byId.size === 0) return;
    if (draft) {
      const p = parseDraft(draft, new Set(byId.keys()));
      if (p) apply(p);
      else prefilled.current = true;
    } else if (source && forkIx.data) {
      const idByAddr = new Map<string, string>();
      for (const a of byId.values()) {
        const x = addrOf(a);
        if (x) idByAddr.set(x.toLowerCase(), a.id);
      }
      const p = forkPrefill(forkIx.data.assets, forkIx.data.targetBps, idByAddr);
      const ix = forkIx.data;
      if (edit) {
        apply({ ...p, name: ix.name, ticker: ix.ticker, mode: ix.mode === 2 ? "Auto" : ix.mode === 1 ? "Manual" : "Off" });
        if (ix.mode === 2 && ix.driftBps) set({ drift: Math.round(ix.driftBps / 100) });
      } else apply(p);
    }
  }, [draft, source, edit, forkIx.data, byId, apply, set]);

  // ---- uncontrolled reference inputs (name, description, asset search): read through a delegated listener
  useEffect(() => {
    const ta = wrap.current?.querySelector<HTMLTextAreaElement>('section[aria-label="Your index"] textarea');
    if (ta && ta.value !== s.description) ta.value = s.description;
    // only on (re)mount of the form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);
  const onFormChange = (e: ChangeEvent<HTMLDivElement>): void => {
    const el = e.target as unknown as HTMLInputElement | HTMLTextAreaElement;
    if (el.id === "ix-name") set({ name: el.value.slice(0, 64) });
    else if (el.id === "asset-search") set({ search: el.value });
    else if (el.tagName === "TEXTAREA") set({ description: el.value.slice(0, 280) });
  };

  // ---- ticker uniqueness (registry read)
  useEffect(() => {
    if (!registryAddr || !/^[A-Z0-9]{2,6}$/.test(s.ticker)) {
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
  }, [s.ticker, registryAddr, w.pub]);

  // ---- metrics: daily closes per picked asset → backtest
  const pickedKey = s.picked.join(",");
  useEffect(() => {
    const missing = s.picked.filter((id) => !(id in closes));
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
    () => (s.picked.every((id) => id in closes) ? backtest(s.picked.map((id) => closes[id] ?? []), s.picked.map((id) => s.w[id] ?? 0)) : null),
    [s.picked, s.w, closes],
  );

  const sel = s.picked.map((id) => byId.get(id)).filter((a): a is AssetView => !!a);
  const addrs = sel.map(addrOf);
  const weightsBps = s.picked.map((id) => (s.w[id] ?? 0) * 100);
  const basketOk = sel.length >= 2 && addrs.every((a) => a !== null) && weightsBps.reduce((x, y) => x + y, 0) === 10_000 && weightsBps.every((x) => x >= 100);

  // ---- actions
  const toggle = (id: string): void =>
    setS((x) => {
      if (x.picked.includes(id)) return { ...x, picked: x.picked.filter((p) => p !== id) };
      if (x.picked.length >= MAX_ASSETS) return x;
      return { ...x, picked: [...x.picked, id], w: { ...x.w, [id]: x.w[id] ?? 0 } };
    });
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
  const driftBps = Math.min(20_000, Math.max(1_000, s.drift * 100));
  const modeArgs = (): { mode: (typeof RebalanceMode)[keyof typeof RebalanceMode]; driftBps: number; intervalSec: bigint } =>
    s.mode === "Auto" ? { mode: RebalanceMode.Auto, driftBps, intervalSec: BigInt(AUTO_INTERVAL_DAYS * 86_400) } : { mode: RebalanceMode[s.mode], driftBps: 0, intervalSec: 0n };
  const confirm = (): void => {
    if (!registryAddr || !w.address || !basketOk) return;
    const basket = addrs.filter((a): a is Address => a !== null);
    const m = modeArgs();
    if (editing && edit) {
      // a new basket now (the level carries over); a changed rebalance mode in the same signature batch
      const reqs: TxRequest[] = [txb.rebalanceIndex(registryAddr, edit as Address, basket, weightsBps, s.description.trim() || "New basket", 0n)];
      const ix = forkIx.data;
      if (ix && (ix.mode !== m.mode || (m.mode === RebalanceMode.Auto && ix.driftBps !== m.driftBps))) reqs.push(txb.setIndexMode(registryAddr, edit as Address, m.mode, m.driftBps, m.intervalSec));
      void t.run(reqs).then((hash) => {
        if (!hash) return;
        setCreated({ index: edit });
        set({ step: "done" });
      });
      return;
    }
    void t
      .run([
        txb.defineIndex(registryAddr, {
          name: s.name.trim(),
          ticker: s.ticker,
          description: s.description.trim(),
          assets: basket,
          weightsBps,
          isPublic: s.vis === "Public",
          ...m,
        }),
      ])
      .then(async (hash) => {
        if (!hash) return;
        let index: string | null = null;
        try {
          const rc = await w.pub.getTransactionReceipt({ hash });
          const ev = parseEventLogs({ abi: indexRegistryAbi, eventName: "IndexCreated", logs: rc.logs })[0];
          index = ev ? ev.args.index : null;
        } catch {
          /* the banner still links to Portfolio */
        }
        setCreated({ index });
        set({ step: "done" });
      });
  };

  const v = createVM({
    s,
    assets: assets.data ?? [],
    tickerTaken: editing ? false : tickerTaken,
    editing,
    presetError: presetError ?? (assets.error ? assets.error.message : forkIx.error ? forkIx.error.message : null),
    backtest: bt,
    tx: t.state,
    created,
    wallet: { connected: w.address !== null, chainOk: w.chainOk },
    env: { network: CONFIG.network, explorer: CONFIG.explorer, nowSec: Math.floor(Date.now() / 1000), deployed: !!registryAddr },
    actions: {
      set: (p) => {
        if (p.step === "edit") t.reset();
        set(p);
      },
      toggle,
      setW: (id, val) => setS((x) => ({ ...x, w: { ...x.w, [id]: Math.max(0, Math.min(100, Math.round(val))) } })),
      preset,
      review: () => {
        if (validate(s, editing ? false : tickerTaken)) return;
        t.reset();
        set({ step: "review" });
        try {
          window.scrollTo(0, 0);
        } catch {
          /* no window */
        }
      },
      confirm,
      connect: () => void w.connect().catch(() => undefined),
      switchChain: () => void w.switchChain(),
    },
    me,
  });
  return (
    <Shell title={title}>
      <div ref={wrap} style={css("display: contents")} onChange={onFormChange}>
        <CreateScreen key={formKey} v={v} nav={nav} slots={slots} />
      </div>
    </Shell>
  );
}
