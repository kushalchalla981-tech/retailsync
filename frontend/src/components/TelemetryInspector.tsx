import React, { useState, useEffect } from 'react';
import { X, Database, Layers, Search, Terminal, ChevronDown, ChevronRight, Activity, Clock, Cpu, Maximize2, Minimize2 } from 'lucide-react';
import { telemetryStore } from '../services/telemetryStore';
import { PostgresTxLog, KafkaMessageLog, OpenSearchSyncLog, TelemetryStats } from '../types';

interface TelemetryInspectorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TelemetryInspector: React.FC<TelemetryInspectorProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'postgres' | 'kafka' | 'opensearch'>('postgres');
  const [isMinimized, setIsMinimized] = useState<boolean>(true); // Start minimized so storefront & hero are unobstructed!
  const [postgresLogs, setPostgresLogs] = useState<PostgresTxLog[]>([]);
  const [kafkaLogs, setKafkaLogs] = useState<KafkaMessageLog[]>([]);
  const [openSearchLogs, setOpenSearchLogs] = useState<OpenSearchSyncLog[]>([]);
  const [stats, setStats] = useState<TelemetryStats>(telemetryStore.getStats());
  const [expandedKafkaId, setExpandedKafkaId] = useState<string | null>(null);

  useEffect(() => {
    const updateLogs = () => {
      setPostgresLogs([...telemetryStore.getPostgresLogs()]);
      setKafkaLogs([...telemetryStore.getKafkaLogs()]);
      setOpenSearchLogs([...telemetryStore.getOpenSearchLogs()]);
      setStats(telemetryStore.getStats());
    };

    updateLogs();
    const unsubscribe = telemetryStore.subscribe(updateLogs);
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  // Minimized Sleek Floating Bar
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-4xl w-[94%] sm:w-auto">
        <div className="bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl px-4 py-2.5 flex items-center justify-between gap-4 text-xs font-mono backdrop-blur-md">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 text-slate-200">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="font-sans font-bold text-white hidden sm:inline">Aiven 3-Service Live Telemetry:</span>
            <span className="font-sans font-bold text-white sm:hidden">Telemetry:</span>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 sm:gap-4 text-slate-300">
            <div className="flex items-center gap-1.5" title="PostgreSQL Row Locks">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400 hidden md:inline">Postgres:</span>
              <span className="text-emerald-400 font-bold tabular-nums">0% Oversell</span>
            </div>

            <div className="flex items-center gap-1.5" title="Kafka Events Streamed">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-slate-400 hidden md:inline">Kafka:</span>
              <span className="text-white font-bold tabular-nums">#{stats.kafkaMessagesTotal}</span>
            </div>

            <div className="flex items-center gap-1.5" title="OpenSearch Sync Latency">
              <Search className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-slate-400 hidden md:inline">OpenSearch:</span>
              <span className="text-emerald-400 font-bold tabular-nums">{stats.openSearchAvgQueryMs}ms</span>
            </div>
          </div>

          {/* Expand and Close Buttons */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-700">
            <button
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-sans font-semibold text-[11px] transition shadow-sm"
              title="Expand full telemetry inspector"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Expand Console</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Hide bar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded Full Inspector Drawer
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 h-[440px] bg-slate-950 border-t border-slate-700 shadow-2xl flex flex-col font-mono text-xs">
      {/* Top Header Bar */}
      <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-100 font-sans font-bold text-sm">
            <Terminal className="w-4 h-4 text-brand-400" />
            <span>Aiven Cloud Real-Time Telemetry Console</span>
          </div>

          {/* Service tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveTab('postgres')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                activeTab === 'postgres'
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>PostgreSQL ({postgresLogs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('kafka')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                activeTab === 'kafka'
                  ? 'bg-indigo-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Apache Kafka ({kafkaLogs.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('opensearch')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                activeTab === 'opensearch'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>OpenSearch ({openSearchLogs.length})</span>
            </button>
          </div>
        </div>

        {/* Live Metrics Quick Bar */}
        <div className="flex items-center gap-4 text-slate-400 font-sans text-xs">
          <div className="hidden md:flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Postgres Locks:</span>
            <strong className="text-white tabular-nums">{stats.postgresActiveLocks}</strong>
          </div>

          <div className="hidden md:flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Kafka Events:</span>
            <strong className="text-white tabular-nums">{stats.kafkaMessagesTotal}</strong>
          </div>

          <div className="hidden lg:flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            <span>Avg Search:</span>
            <strong className="text-emerald-400 tabular-nums">{stats.openSearchAvgQueryMs}ms</strong>
          </div>

          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Minimize to floating bar"
          >
            <Minimize2 className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close console"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Tab View Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* TAB 1: PostgreSQL Transactions & Locks */}
        {activeTab === 'postgres' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
              <span>TIME / TX ID</span>
              <span>SQL QUERY STATEMENT</span>
              <span>LOCK STATUS</span>
              <span>LATENCY</span>
            </div>

            {postgresLogs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-500 tabular-nums">{log.timestamp}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 font-bold text-[11px]">
                    {log.txId}
                  </span>
                </div>

                <div className="flex-1 font-mono text-slate-200 truncate" title={log.query}>
                  {log.query}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {log.lockAcquired ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                      ROW LOCKED (FOR UPDATE)
                    </span>
                  ) : log.status === 'ROLLEDBACK' ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-600">
                      ROLLED BACK (OVERSELL PREVENTED)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-600">
                      COMMITTED
                    </span>
                  )}

                  <span className="text-slate-400 tabular-nums w-12 text-right">{log.latencyMs}ms</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: Apache Kafka Event Stream */}
        {activeTab === 'kafka' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
              <span>TIME / TOPIC</span>
              <span>PARTITION & OFFSET</span>
              <span>MESSAGE KEY</span>
              <span>PAYLOAD INSPECTION</span>
            </div>

            {kafkaLogs.map((log) => {
              const isExpanded = expandedKafkaId === log.id;
              return (
                <div
                  key={log.id}
                  className="rounded-lg bg-slate-900 border border-slate-800 overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedKafkaId(isExpanded ? null : log.id)}
                    className="p-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-850 transition"
                  >
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-slate-500 tabular-nums">{log.timestamp}</span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                          log.topic === 'orders.placed'
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                        }`}
                      >
                        {log.topic}
                      </span>
                    </div>

                    <div className="text-slate-400 text-xs">
                      part: <span className="text-slate-200 font-semibold">{log.partition}</span> • offset: <span className="text-white font-bold tabular-nums">#{log.offset}</span>
                    </div>

                    <div className="text-slate-300 font-semibold text-xs truncate max-w-xs">
                      key: {log.key}
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                      <span>JSON payload</span>
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-indigo-300 overflow-x-auto">
                      <pre>{JSON.stringify(log.payload, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: OpenSearch Sync & Queries */}
        {activeTab === 'opensearch' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
              <span>TIME / ACTION</span>
              <span>INDEX & DOC ID</span>
              <span>QUERY DSL / DETAILS</span>
              <span>SEARCH LATENCY</span>
            </div>

            {openSearchLogs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-slate-500 tabular-nums">{log.timestamp}</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                      log.action === 'QUERY'
                        ? 'bg-blue-950 text-blue-300 border border-blue-700'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    }`}
                  >
                    {log.action}
                  </span>
                </div>

                <div className="text-slate-300 font-mono text-xs truncate">
                  {log.index} / {log.docId}
                </div>

                <div className="flex-1 text-slate-400 font-mono text-xs truncate">
                  {log.queryDSL ? JSON.stringify(log.queryDSL) : `Document sync verified (score: ${log.score || 1.0})`}
                </div>

                <div className="shrink-0 text-emerald-400 font-mono font-bold tabular-nums">
                  {log.latencyMs}ms
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
