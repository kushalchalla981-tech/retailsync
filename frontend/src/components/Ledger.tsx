import { useMemo, useState } from 'react';
import { ChevronUp, Eraser } from 'lucide-react';
import { clearLedger, useFeedStatus, useLedger, type LedgerEntry, type Service } from '../services/ledger';

export const SERVICE: Record<Service, { code: string; name: string }> = {
  pg: { code: 'PG', name: 'PostgreSQL' },
  kafka: { code: 'KF', name: 'Kafka' },
  os: { code: 'OS', name: 'OpenSearch' },
  api: { code: 'API', name: 'API' },
};

const STAMP = {
  ok: 'Committed',
  wait: 'Waiting',
  fail: 'Rejected',
  info: '',
} as const;

const clock = (t: number) => {
  const d = new Date(t);
  return `${d.toLocaleTimeString('en-GB', { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

function Line({ e }: { e: LedgerEntry }) {
  const label = STAMP[e.stamp];
  return (
    <li className="line-in border-t border-band-rule px-5 py-3">
      <div className="flex items-baseline gap-3">
        <span className="figures w-8 shrink-0 text-xs font-semibold text-band-muted">{SERVICE[e.service].code}</span>
        <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug">{e.title}</span>
        {label && <span className={`verdict ${e.stamp === 'fail' ? 'border-accent bg-accent text-band-ink' : ''}`}>{label}</span>}
      </div>
      <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 pl-11 text-[0.8125rem] text-band-muted">
        {e.fields.map(([k, v]) => (
          <div key={k} className="contents">
            <dt>{k}</dt>
            <dd className="figures truncate text-right text-band-ink" title={v}>
              {v}
            </dd>
          </div>
        ))}
        <dt>{e.source === 'server' ? 'Server' : 'Browser'}</dt>
        <dd className="figures text-right">{clock(e.at)}</dd>
      </dl>
    </li>
  );
}

function FeedRow({ service, state, note }: { service: Service; state: 'live' | 'wait' | 'off'; note: string }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-3 py-1.5">
      <span className="font-semibold">{SERVICE[service].name}</span>
      <span className="truncate text-[0.8125rem] text-band-muted">{note}</span>
      <span className={`text-xs font-semibold ${state === 'off' ? 'text-band-muted' : ''}`}>{state === 'live' ? 'Live' : state === 'wait' ? 'Waiting' : 'Off'}</span>
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
    feed.telemetry === 'live' ? 'Streaming events' : feed.telemetry === 'connecting' ? 'Connecting' : 'Event feed unreachable';

  return (
    <section aria-labelledby="ledger-title" className="on-band flex h-full min-h-0 flex-col bg-band text-band-ink">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls="ledger-body"
        className="flex items-end justify-between gap-3 px-5 pb-3 pt-4 text-left lg:pointer-events-none lg:cursor-default"
      >
        <span className="min-w-0">
          <h2 id="ledger-title" className="max-w-none text-[1.75rem]">
            Live ledger
          </h2>
          <span className="mt-1 flex gap-4 whitespace-nowrap text-[0.8125rem] text-band-muted">
            <span>
              <b className="figures font-semibold text-band-ink">{commits}</b> committed
            </span>
            <span>
              <b className="figures font-semibold text-band-ink">{rejects}</b> rejected
            </span>
            <span>
              <b className="figures font-semibold text-band-ink">{entries.length}</b> lines
            </span>
          </span>
        </span>
        <ChevronUp className={`h-5 w-5 shrink-0 transition-transform lg:hidden ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      <div id="ledger-body" className={`${expanded ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:flex`}>
        <div className="border-t-[5px] border-band-ink px-5 py-2">
          <FeedRow
            service="pg"
            state={feed.api === 'live' ? 'live' : feed.api === 'down' ? 'off' : 'wait'}
            note={feed.api === 'live' ? (feed.checkout === 'live' ? 'Orders committing' : feed.checkout === 'unavailable' ? 'Checkout unreachable' : 'Catalog served') : feed.api === 'down' ? 'API unreachable' : 'Waiting for a request'}
          />
          <FeedRow service="kafka" state={feed.telemetry === 'live' ? 'live' : feed.telemetry === 'connecting' ? 'wait' : 'off'} note={telemetryNote} />
          <FeedRow
            service="os"
            state={feed.search === 'live' ? 'live' : 'off'}
            note={feed.search === 'live' ? 'Answering searches' : feed.search === 'unavailable' ? 'Search unreachable' : 'Not searched yet'}
          />
        </div>

        <div className="flex items-center gap-1 border-t border-band-rule px-4 py-2" role="group" aria-label="Filter ledger by service">
          {(['all', 'pg', 'kafka', 'os'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`min-h-[36px] px-3 text-sm font-semibold ${filter === k ? 'bg-band-ink text-band' : 'text-band-muted hover:text-band-ink active:text-band-ink'}`}
            >
              {k === 'all' ? 'All' : SERVICE[k].name}
            </button>
          ))}
          <button type="button" onClick={clearLedger} className="ml-auto flex min-h-[36px] items-center gap-1 px-2 text-sm text-band-muted hover:text-band-ink active:text-band-ink">
            <Eraser className="h-3.5 w-3.5" aria-hidden="true" /> Clear
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {shown.length === 0 ? (
            <p className="border-t border-band-rule px-5 py-8 text-[0.9375rem] text-band-muted">Nothing printed yet. Every request, commit and rejection prints here as it happens.</p>
          ) : (
            <ol aria-live="polite" aria-relevant="additions">
              {shown.map((e) => (
                <Line key={e.seq} e={e} />
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
