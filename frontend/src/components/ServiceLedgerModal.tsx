import React, { useEffect, useMemo, useState } from 'react';
import { X, Database, Zap, Search, Pause, Play, Download, Copy, Check } from 'lucide-react';
import { onLinkStatus, onTelemetry, recentTelemetry, type LinkStatus, type Service, type TelemetryEvent } from '../utils/telemetry';

const META: Record<Service, { title: string; color: string; icon: React.ReactNode; empty: string }> = {
  postgres: {
    title: 'PostgreSQL ledger',
    color: '#ff5c35',
    icon: <Database className="w-5 h-5" />,
    empty: 'Row locks, stock decrements and commits appear here when a payment is verified or a merchant changes stock.',
  },
  kafka: {
    title: 'Apache Kafka ledger',
    color: '#ffd600',
    icon: <Zap className="w-5 h-5" />,
    empty: 'Messages produced to and consumed from retailsync-orders and retailsync-inventory appear here.',
  },
  opensearch: {
    title: 'OpenSearch ledger',
    color: '#00e5ff',
    icon: <Search className="w-5 h-5" />,
    empty: 'Search queries (from Universal Search) and index updates appear here with their latency.',
  },
};

const STATUS_LABEL: Record<LinkStatus, string> = {
  live: 'Connected · live stream',
  polling: 'Connected · polling',
  connecting: 'Connecting…',
  offline: 'Offline · retrying',
};

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Live, filterable event ledger for one Aiven service (About → service card). */
export const ServiceLedgerModal: React.FC<{ service: Service | null; onClose: () => void }> = ({ service, onClose }) => {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [status, setStatus] = useState<LinkStatus>('connecting');
  const [paused, setPaused] = useState(false);
  const [type, setType] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!service) return;
    setEvents(recentTelemetry().filter((e) => e.service === service).reverse());
    setType('all');
    setQuery('');
    setOpenId(null);
  }, [service]);

  useEffect(() => {
    if (!service || paused) return;
    // Resuming picks up anything that arrived while paused.
    setEvents(recentTelemetry().filter((e) => e.service === service).reverse());
    return onTelemetry((e) => { if (e.service === service) setEvents((prev) => [e, ...prev].slice(0, 300)); });
  }, [service, paused]);

  useEffect(() => (service ? onLinkStatus(setStatus) : undefined), [service]);

  useEffect(() => {
    if (!service) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [service, onClose]);

  const types = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => (type === 'all' || e.type === type) && (!q || JSON.stringify(e).toLowerCase().includes(q)));
  }, [events, type, query]);

  if (!service) return null;
  const meta = META[service];
  const latency = median(events.flatMap((e) => (typeof e.latencyMs === 'number' ? [e.latencyMs] : [])));
  const topics = [...new Set(events.flatMap((e) => (e.topic ? [e.topic] : [])))];
  const connected = status === 'live' || status === 'polling';

  const copy = async (e: TelemetryEvent) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(e, null, 2));
      setCopied(e.id);
      window.setTimeout(() => setCopied(null), 1200);
    } catch { /* clipboard blocked */ }
  };

  const exportLedger = () => {
    const blob = new Blob([JSON.stringify(shown, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retailsync-${service}-ledger-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="absolute inset-0 bg-[#1a1918]/70 backdrop-blur-sm" onClick={onClose} />
      <section role="dialog" aria-label={meta.title} className="relative w-full max-w-4xl h-[min(760px,92dvh)] bg-[#141312] text-[#f5ebe0] border-4 border-[#1a1918] rounded-3xl shadow-pop-lg flex flex-col overflow-hidden">
        <header className="shrink-0 px-5 py-4 border-b-2 border-white/10 flex flex-wrap items-center justify-between gap-3" style={{ boxShadow: `inset 0 -3px 0 ${meta.color}` }}>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl border-2 border-[#1a1918] text-[#1a1918]" style={{ background: meta.color }}>{meta.icon}</span>
            <div>
              <h3 className="font-black uppercase tracking-tight text-lg">{meta.title}</h3>
              <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[#a7f432] animate-pulse' : 'bg-[#ff5c35]'}`} aria-hidden />
                <span className={connected ? 'text-[#a7f432]' : 'text-[#ff9b80]'}>{STATUS_LABEL[status]}</span>
                {paused && <span className="text-[#ffd600]">· paused</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close ledger" className="p-1.5 rounded-full bg-white/10 hover:bg-[#ff5c35] transition-colors"><X className="w-4 h-4" /></button>
        </header>

        <div className="shrink-0 grid grid-cols-3 gap-2 px-5 py-3 border-b border-white/10 font-mono text-xs">
          <div><span className="block text-white/50 uppercase text-[10px]">Events</span><b className="text-base">{events.length}</b></div>
          <div><span className="block text-white/50 uppercase text-[10px]">Median latency</span><b className="text-base">{latency === null ? '—' : `${latency} ms`}</b></div>
          <div className="min-w-0"><span className="block text-white/50 uppercase text-[10px]">{service === 'kafka' ? 'Topics' : 'Last event'}</span><b className="block truncate">{service === 'kafka' ? (topics.join(', ') || '—') : events[0] ? time(events[0].at) : '—'}</b></div>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2 px-5 py-3 border-b border-white/10">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by event type" className="bg-[#1f1d1b] border border-white/20 rounded-lg px-2 py-1.5 font-mono text-xs">
            <option value="all">All event types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events…" aria-label="Search events" className="flex-1 min-w-[140px] bg-[#1f1d1b] border border-white/20 rounded-lg px-3 py-1.5 font-mono text-xs placeholder:text-white/40 focus:outline-none focus:border-white/50" />
          <button onClick={() => setPaused((p) => !p)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 font-mono text-xs uppercase font-black hover:bg-white/10">
            {paused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
          </button>
          <button onClick={exportLedger} disabled={!shown.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 font-mono text-xs uppercase font-black hover:bg-white/10 disabled:opacity-30">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>

        <ol className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-white/5 font-mono text-xs" aria-live="polite">
          {!shown.length && (
            <li className="p-8 text-center text-white/60 leading-relaxed">{events.length ? 'No events match this filter.' : meta.empty}</li>
          )}
          {shown.map((e) => (
            <li key={e.id} className="px-5 py-2.5 hover:bg-white/[0.03]">
              <button onClick={() => setOpenId(open === e.id ? null : e.id)} aria-expanded={open === e.id} className="w-full text-left flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-white/50 tabular-nums">{time(e.at)}</span>
                <span className="px-1.5 rounded border font-black uppercase text-[10px]" style={{ color: meta.color, borderColor: `${meta.color}66` }}>{e.type}</span>
                <span className="flex-1 min-w-[12rem] text-[#f5ebe0]">{e.message}</span>
                {e.topic && <span className="text-white/60">{e.topic}{e.partition !== undefined ? ` · p${e.partition}` : ''}{e.offset !== undefined ? ` · @${e.offset}` : ''}</span>}
                {typeof e.latencyMs === 'number' && <span className="text-[#a7f432] tabular-nums">{e.latencyMs} ms</span>}
              </button>
              {open === e.id && (
                <div className="relative mt-2">
                  <pre className="bg-black/40 border border-white/10 rounded-lg p-3 overflow-x-auto text-[11px] text-white/80">{JSON.stringify(e, null, 2)}</pre>
                  <button onClick={() => copy(e)} aria-label="Copy event JSON" className="absolute top-2 right-2 p-1.5 rounded-md bg-white/10 hover:bg-white/20">
                    {copied === e.id ? <Check className="w-3.5 h-3.5 text-[#a7f432]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
};
