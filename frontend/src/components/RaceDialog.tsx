import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Dialog } from './Dialog';
import { api, ApiError, short } from '../services/api';
import { useLedger } from '../services/ledger';
import type { Product, StoreLocation } from '../types';

const TARGET_SKU = 'ELEC-009';
const TARGET_STORE = 'Bangalore Central';
const LANES = 'ABCDEFGHIJ';

type LaneState = 'preparing' | 'inflight' | 'committed' | 'rejected' | 'error';
interface Lane {
  id: string;
  state: LaneState;
  start: number;
  end?: number;
  status?: number;
  code?: string;
  orderId?: string;
  lockWaitMs?: number;
}

type Phase = 'resolving' | 'ready' | 'running' | 'done' | 'unavailable' | 'error';

interface Props {
  open: boolean;
  onClose: () => void;
  locations: StoreLocation[];
  onFinished: () => void;
}

async function findTarget(): Promise<Product | undefined> {
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await api.products({ limit: 100, offset });
    const hit = page.items.find((p) => p.sku === TARGET_SKU);
    if (hit) return hit;
    if (offset + page.items.length >= page.total) return undefined;
  }
  return undefined;
}

export function RaceDialog({ open, onClose, locations, onFinished }: Props) {
  const [phase, setPhase] = useState<Phase>('resolving');
  const [message, setMessage] = useState('');
  const [buyers, setBuyers] = useState(5);
  const [product, setProduct] = useState<Product>();
  const [stockBefore, setStockBefore] = useState<number>();
  const [stockAfter, setStockAfter] = useState<number>();
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [now, setNow] = useState(0);
  const runStart = useRef(0);
  const runWall = useRef(0);
  const autoRan = useRef(false);
  const ledger = useLedger();

  const store = locations.find((l) => l.name === TARGET_STORE) ?? locations.find((l) => /bangalore|bengaluru/i.test(l.city));

  const readStock = useCallback(async (p: Product) => {
    if (!store) return undefined;
    const rows = await api.inventory(p.id, store.id, true);
    return rows[0]?.stockQuantity ?? 0;
  }, [store]);

  const run = useCallback(
    async (p: Product, n: number) => {
      if (!store) return;
      setPhase('running');
      setStockAfter(undefined);
      setMessage('');
      const before = await readStock(p);
      setStockBefore(before);
      const prepared: Lane[] = Array.from({ length: n }, (_, i) => ({ id: LANES[i], state: 'preparing', start: 0 }));
      setLanes(prepared);
      let carts: string[];
      try {
        carts = await Promise.all(
          prepared.map(async () => {
            const cart = await api.createCart(store.id, true);
            await api.addItem(cart.id, p.id, 1, true);
            return cart.id;
          }),
        );
      } catch (err) {
        setPhase('error');
        setMessage(err instanceof Error ? err.message : 'Could not prepare the buyer carts.');
        return;
      }
      const runId = Date.now().toString(36);
      runWall.current = Date.now();
      runStart.current = performance.now();
      setNow(0);
      setLanes(prepared.map((l) => ({ ...l, state: 'inflight', start: 0 })));
      let unavailable = false;
      // Build every request first, then fire them in one synchronous map.
      const thunks = carts.map((cartId, i) => async () => {
        const start = performance.now() - runStart.current;
        try {
          const r = await api.checkout(cartId, { name: `Race buyer ${LANES[i]}`, email: `race-${runId}-${i}@example.com` }, `Lane ${LANES[i]}`);
          const end = performance.now() - runStart.current;
          setLanes((ls) => ls.map((l, j) => (j === i ? { ...l, state: 'committed', start, end, status: r.status, orderId: r.data.order.id, lockWaitMs: r.data.order.lockWaitMs } : l)));
        } catch (err) {
          const end = performance.now() - runStart.current;
          const e = err instanceof ApiError ? err : undefined;
          if (e?.notDeployed) unavailable = true;
          setLanes((ls) =>
            ls.map((l, j) => (j === i ? { ...l, state: e?.code === 'OUT_OF_STOCK' ? 'rejected' : 'error', start, end, status: e?.status, code: e?.code ?? 'ERROR' } : l)),
          );
        }
      });
      await Promise.all(thunks.map((t) => t()));
      setNow(performance.now() - runStart.current);
      if (unavailable) {
        setPhase('unavailable');
        return;
      }
      setStockAfter(await readStock(p));
      setPhase('done');
      onFinished();
    },
    [store, readStock, onFinished],
  );

  // Resolve the target and auto-run once per open.
  useEffect(() => {
    if (!open) {
      autoRan.current = false;
      return;
    }
    let live = true;
    setPhase('resolving');
    setLanes([]);
    (async () => {
      try {
        if (!store) throw new Error(`Store "${TARGET_STORE}" was not returned by /api/locations.`);
        const p = product ?? (await findTarget());
        if (!p) throw new Error(`Product ${TARGET_SKU} was not found in /api/products.`);
        if (!live) return;
        setProduct(p);
        const s = await readStock(p);
        if (!live) return;
        setStockBefore(s);
        setPhase('ready');
        if (!autoRan.current && (s ?? 0) > 0) {
          autoRan.current = true;
          void run(p, buyers);
        }
      } catch (err) {
        if (!live) return;
        setPhase('error');
        setMessage(err instanceof Error ? err.message : 'Could not reach the API.');
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, store?.id]);

  // Tick the clock while requests are in flight.
  useEffect(() => {
    if (phase !== 'running') return;
    let raf = 0;
    const tick = () => {
      setNow(performance.now() - runStart.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const span = Math.max(now, ...lanes.map((l) => l.end ?? 0), 1);
  const committed = lanes.filter((l) => l.state === 'committed').length;
  const rejected = lanes.filter((l) => l.state === 'rejected').length;
  const downstream = ledger.filter((e) => e.source === 'server' && (e.service === 'kafka' || e.service === 'os') && e.at >= runWall.current);
  const oversold = stockBefore === undefined ? undefined : stockBefore - buyers;

  return (
    <Dialog open={open} onClose={onClose} labelledBy="race-title" placement="center" className="max-w-4xl">
      <header className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div>
          <h2 id="race-title" className="text-2xl font-extrabold tracking-tight">
            The last-unit race
          </h2>
          <p className="mt-1 max-w-[62ch] text-sm text-ink-2">
            {buyers} real carts check out {product ? product.name : TARGET_SKU} at {TARGET_STORE} at the same instant. PostgreSQL locks the inventory row, so
            one buyer commits and the rest are turned away.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close race" className="-mr-2 p-2 text-ink-2 hover:text-ink">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      <div className="perf mx-6" />

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="figures mb-5 grid grid-cols-2 gap-x-6 gap-y-2 text-[0.75rem] sm:grid-cols-4">
          <Fact k="sku" v={product?.sku ?? TARGET_SKU} />
          <Fact k="stock before" v={stockBefore === undefined ? '…' : String(stockBefore)} />
          <Fact k="stock after" v={stockAfter === undefined ? '…' : String(stockAfter)} />
          <Fact k="elapsed" v={lanes.length && phase !== 'resolving' ? `${span.toFixed(0)} ms` : '…'} />
        </div>

        {phase === 'resolving' && <p className="text-sm text-ink-2">Looking up {TARGET_SKU} and its stock…</p>}
        {phase === 'error' && (
          <p role="alert" className="border border-fail px-4 py-3 text-sm text-fail">
            {message}
          </p>
        )}
        {phase === 'unavailable' && (
          <p role="status" className="border border-wait px-4 py-3 text-sm text-ink">
            Checkout is not available yet: the server answered 404 for <span className="figures">POST /api/carts/:id/checkout</span>. The race runs as soon as
            plan 02-02 ships.
          </p>
        )}
        {phase === 'ready' && stockBefore === 0 && (
          <p role="status" className="border border-wait px-4 py-3 text-sm text-ink">
            Stock is already 0 at {TARGET_STORE}, so every lane will be rejected. Reseed the catalog to restore the last unit, or run it anyway to watch the
            lock turn everyone away.
          </p>
        )}

        {lanes.length > 0 && (
          <ol className="mt-2 space-y-2" aria-label="Buyer lanes">
            {lanes.map((l) => (
              <LaneRow key={l.id} lane={l} span={span} now={now} />
            ))}
          </ol>
        )}

        {lanes.length > 0 && (
          <div className="figures mt-2 flex justify-between pl-14 text-[0.625rem] text-ink-2" aria-hidden="true">
            <span>0 ms</span>
            <span>{(span / 2).toFixed(0)} ms</span>
            <span>{span.toFixed(0)} ms</span>
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section aria-labelledby="race-verdict">
              <h3 id="race-verdict" className="text-base font-bold">
                {committed <= Math.max(stockBefore ?? 0, 0) && (stockAfter ?? 0) >= 0 ? 'No oversell' : 'Integrity check failed'}
              </h3>
              <p className="figures mt-2 text-[0.75rem] leading-relaxed text-ink-2">
                {committed} committed · {rejected} rejected 409 · stock {stockBefore} → {stockAfter}
              </p>
              <h4 className="mt-4 text-sm font-semibold">Downstream</h4>
              {downstream.length === 0 ? (
                <p className="mt-1 text-sm text-ink-2">
                  No Kafka offset or OpenSearch sync reported for this run yet. Those lines print here once the phase 3 telemetry feed is live.
                </p>
              ) : (
                <ul className="figures mt-1 space-y-1 text-[0.75rem]">
                  {downstream.slice(0, 6).map((e) => (
                    <li key={e.seq} style={{ color: e.service === 'kafka' ? 'var(--kafka)' : 'var(--os)' }}>
                      {e.title} {e.fields.map(([k, v]) => `${k} ${v}`).join(' · ')}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="race-counterfactual" className="border border-dashed border-ink-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id="race-counterfactual" className="text-base font-bold">
                  Without a lock
                </h3>
                <span className="stamp" style={{ color: 'var(--ink-2)' }}>
                  Simulated
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-2">
                Arithmetic, not a request: if all {buyers} buyers read stock {stockBefore} before anyone wrote, each would decrement it.
              </p>
              <p className="figures mt-3 text-2xl font-bold" style={{ color: 'var(--fail)' }}>
                {oversold === undefined ? '…' : `${stockBefore} → ${oversold}`}
              </p>
              {oversold !== undefined && oversold < 0 && <p className="text-sm text-ink-2">Oversold by {-oversold} units.</p>}
            </section>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-rule px-6 py-4">
        <label className="flex items-center gap-2 text-sm">
          Buyers
          <select
            value={buyers}
            onChange={(e) => setBuyers(Number(e.target.value))}
            disabled={phase === 'running'}
            className="figures border border-ink bg-sheet px-2 py-1 text-[0.75rem]"
          >
            {[3, 5, 8, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[0.75rem] text-ink-2">Bars are browser-timed round trips. The server does not report per-request lock wait yet.</p>
        <button
          type="button"
          data-autofocus
          disabled={!product || phase === 'running' || phase === 'resolving'}
          onClick={() => product && run(product, buyers)}
          className="ml-auto flex items-center gap-2 bg-ink px-4 py-2 text-sm font-semibold text-sheet hover:bg-[#33312c] disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {phase === 'running' ? 'Racing…' : lanes.length ? 'Replay race' : 'Run race'}
        </button>
      </footer>
    </Dialog>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-ink-2">{k}</div>
      <div className="text-base font-semibold text-ink">{v}</div>
    </div>
  );
}

function LaneRow({ lane, span, now }: { lane: Lane; span: number; now: number }) {
  const end = lane.end ?? (lane.state === 'inflight' ? now : 0);
  const width = Math.max(((end - lane.start) / span) * 100, lane.state === 'preparing' ? 0 : 1.5);
  const left = (lane.start / span) * 100;
  const color =
    lane.state === 'committed' ? 'var(--ok)' : lane.state === 'rejected' || lane.state === 'error' ? 'var(--fail)' : lane.state === 'inflight' ? 'var(--wait)' : 'var(--rule)';
  const label =
    lane.state === 'preparing'
      ? 'Preparing cart'
      : lane.state === 'inflight'
        ? 'Waiting on lock'
        : lane.state === 'committed'
          ? `Committed ${lane.status} · order ${short(lane.orderId ?? '')}`
          : lane.state === 'rejected'
            ? `Rejected ${lane.status} ${lane.code}`
            : `Error ${lane.status ?? ''} ${lane.code ?? ''}`;
  return (
    <li className="flex items-center gap-3">
      <span className="figures w-11 shrink-0 text-[0.75rem] font-bold">Lane {lane.id}</span>
      <div className="relative h-8 flex-1 border-y border-rule bg-paper">
        <div
          className={`absolute inset-y-1 ${lane.state === 'inflight' ? 'lock-pulse' : ''}`}
          style={{ left: `${left}%`, width: `${width}%`, background: color }}
        />
        <span className="figures absolute inset-y-0 right-2 flex items-center text-[0.625rem] font-semibold" style={{ color: lane.state === 'preparing' ? 'var(--ink-2)' : color }}>
          <span className="bg-paper px-1">
            {label}
            {lane.end !== undefined && ` · ${(lane.end - lane.start).toFixed(0)} ms`}
            {lane.lockWaitMs !== undefined && ` · lock ${lane.lockWaitMs} ms`}
          </span>
        </span>
      </div>
    </li>
  );
}
