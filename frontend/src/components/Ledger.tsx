import { useMemo, useState } from 'react';
import { ChevronUp, Eraser } from 'lucide-react';
import { clearLedger, useFeedStatus, useLedger, type LedgerEntry, type Service } from '../services/ledger';

export const SERVICE: Record<Service, { code: string; name: string; color: string }> = {
  pg: { code: 'PG', name: 'PostgreSQL', color: 'var(--pg)' },
  kafka: { code: 'KF', name: 'Kafka', color: 'var(--kafka)' },
  os: { code: 'OS', name: 'OpenSearch', color: 'var(--os)' },
  api: { code: 'API', name: 'API', color: 'var(--ink-2)' },
};

const STAMP = {
  ok: { label: 'Committed', color: 'var(--ok)' },
  wait: { label: 'Waiting', color: 'var(--wait)' },
  fail: { label: 'Rejected', color: 'var(--fail)' },
  info: { label: '', color: 'var(--ink-2)' },
} as const;

const clock = (t: number) => {
  const d = new Date(t);
  return `${d.toLocaleTimeString('en-GB', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

function Line({ e }: { e: LedgerEntry }) {
  const s = SERVICE[e.service];
  const st = STAMP[e.stamp];
  return (
    <li className="print-in px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="figures w-8 shrink-0 text-[0.625rem] font-bold" style={{ color: s.color }}>
          {s.code}
        </span>
        <span className="min-w-0 flex-1 text-[0.8125rem] font-semibold leading-snug text-ink">{e.title}</span>
        {st.label && (
          <span className="stamp" style={{ color: st.color }}>
            {st.label}
          </span>
        )}
      </div>
      <dl className="figures mt-1.5 space-y-0.5 pl-10 text-[0.6875rem] text-ink-2">
        {e.fields.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0">{k}</dt>
            <span aria-hidden="true" className="mb-1 flex-1 border-b border-dotted border-rule" />
            <dd className="max-w-[60%] truncate text-right text-ink" title={v}>
              {v}
            </dd>
          </div>
        ))}
        <div className="flex justify-between pt-0.5 text-[0.625rem]">
          <span>{clock(e.at)}</span>
          <span>{e.source === 'server' ? 'server-reported' : 'browser-timed'}</span>
        </div>
      </dl>
    </li>
  );
}

function FeedRow({ service, state, note }: { service: Service; state: 'live' | 'wait' | 'off'; note: string }) {
  const s = SERVICE[service];
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="h-2 w-2 shrink-0" style={{ background: state === 'off' ? 'transparent' : s.color, outline: `1.5px solid ${s.color}` }} aria-hidden="true" />
      <span className="w-24 shrink-0 text-[0.8125rem] font-semibold text-desk-ink">{s.name}</span>
      <span className="figures truncate text-[0.6875rem] text-desk-ink-2">{note}</span>
    </div>
  );
}

interface Props {
  /** Mobile bottom-sheet state; ignored at lg and up. */
  expanded: boolean;
  onToggle: () => void;
}

export function Ledger({ expanded, onToggle }: Props) {
  const entries = useLedger();
  const feed = useFeedStatus();
  const [filter, setFilter] = useState<Service | 'all'>('all');
  const shown = useMemo(() => (filter === 'all' ? entries : entries.filter((e) => e.service === filter)), [entries, filter]);
  const commits = entries.filter((e) => e.service === 'pg' && e.stamp === 'ok').length;
  const rejects = entries.filter((e) => e.service === 'pg' && e.stamp === 'fail').length;

  const telemetryNote =
    feed.telemetry === 'live' ? 'telemetry feed live' : feed.telemetry === 'connecting' ? 'connecting to feed' : 'feed endpoint not available yet';

  return (
    <section aria-labelledby="ledger-title" className="on-desk flex h-full min-h-0 flex-col bg-desk text-desk-ink">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="ledger-body"
        className="flex items-center justify-between gap-3 px-4 py-3 text-left lg:pointer-events-none lg:cursor-default"
      >
        <span>
          <h2 id="ledger-title" className="text-base font-bold tracking-tight">
            Live ledger
          </h2>
          <span className="figures block text-[0.6875rem] text-desk-ink-2">
            {entries.length} lines · {commits} committed · {rejects} rejected
          </span>
        </span>
        <ChevronUp className={`h-5 w-5 shrink-0 transition-transform lg:hidden ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      <div id="ledger-body" className={`${expanded ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
        <div className="px-4 pb-3">
          <FeedRow
            service="pg"
            state={feed.api === 'live' ? 'live' : feed.api === 'down' ? 'off' : 'wait'}
            note={feed.api === 'live' ? `API reachable · checkout ${feed.checkout === 'unavailable' ? 'not deployed yet' : feed.checkout === 'live' ? 'live' : 'untested'}` : feed.api === 'down' ? 'API unreachable' : 'waiting for first request'}
          />
          <FeedRow service="kafka" state={feed.telemetry === 'live' ? 'live' : 'off'} note={telemetryNote} />
          <FeedRow
            service="os"
            state={feed.search === 'live' ? 'live' : 'off'}
            note={feed.search === 'live' ? 'search endpoint live' : feed.search === 'unavailable' ? 'search endpoint not available yet' : 'search not called yet'}
          />
        </div>

        <div className="flex items-center gap-1 border-t border-[#3a3833] px-3 py-2" role="group" aria-label="Filter ledger by service">
          {(['all', 'pg', 'kafka', 'os'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`figures px-2 py-1 text-[0.6875rem] font-semibold ${filter === k ? 'bg-desk-ink text-desk' : 'text-desk-ink-2 hover:text-desk-ink'}`}
            >
              {k === 'all' ? 'All' : SERVICE[k].code}
            </button>
          ))}
          <button type="button" onClick={clearLedger} className="ml-auto flex items-center gap-1 px-2 py-1 text-[0.75rem] text-desk-ink-2 hover:text-desk-ink">
            <Eraser className="h-3.5 w-3.5" aria-hidden="true" /> Clear
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <div className="torn bg-sheet py-2">
            {shown.length === 0 ? (
              <p className="px-4 py-8 text-center text-[0.8125rem] text-ink-2">
                Nothing printed yet. Every API call, commit and rejection lands here as it happens.
              </p>
            ) : (
              <ol aria-live="polite" aria-relevant="additions" className="divide-y divide-dashed divide-rule">
                {shown.map((e) => (
                  <Line key={e.seq} e={e} />
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
