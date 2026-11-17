import React, { useState } from 'react';
import { ArrowLeftRight, Compass, Crown, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { evaluateChiefCandidate } from '../game/simulation';
import { ResourceType, SettlementBiomeSpecialty, WorldState } from '../game/types';

interface TradeRoutesModalProps {
  world: WorldState;
  onFocusSettlement: (x: number, y: number) => void;
  onFocusHuman?: (humanId: string) => void;
  onToggleRoute: (routeId: string) => void;
  onCreateRoute: (
    fromSettlementId: string,
    toSettlementId: string,
    exportRes: ResourceType,
    importRes: ResourceType
  ) => void;
  onDeleteRoute: (routeId: string) => void;
  onClose: () => void;
}

const BIOME_LABELS: Record<SettlementBiomeSpecialty, string> = {
  HEARTLAND: 'Heartland Plains',
  WOODLAND: 'Deep Woodland',
  HIGHLAND: 'Highland Peaks',
  COASTAL: 'Coastal Cove',
};

const RESOURCE_OPTIONS: { value: ResourceType; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'wood', label: 'Wood' },
  { value: 'stone', label: 'Stone' },
  { value: 'ore', label: 'Ore' },
  { value: 'coal', label: 'Coal' },
];

export const TradeRoutesModal: React.FC<TradeRoutesModalProps> = ({
  world,
  onFocusSettlement,
  onFocusHuman,
  onToggleRoute,
  onCreateRoute,
  onDeleteRoute,
  onClose,
}) => {
  const [fromId, setFromId] = useState<string>(world.settlements[0]?.id ?? '');
  const [toId, setToId] = useState<string>(
    world.settlements[1]?.id ?? world.settlements[0]?.id ?? ''
  );
  const [exportRes, setExportRes] = useState<ResourceType>('wood');
  const [importRes, setImportRes] = useState<ResourceType>('ore');

  const settlementById = new Map(world.settlements.map((s) => [s.id, s]));

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[84vh] flex flex-col bg-[#11161d] border border-white/12 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-50 flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-amber-400" />
              <span>Regional Settlements & Trade Routes</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {world.settlements.length} settlements ·{' '}
              {world.tradeRoutes.filter((r) => r.active).length} active caravans · Biome goods earn
              surplus yield &amp; research
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trade routes"
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Settlements Overview */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Regional Communities
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {world.settlements.map((s) => {
                const pop = world.humans.filter((h) => h.settlementId === s.id).length;
                const chief = s.chiefHumanId
                  ? world.humans.find((h) => h.id === s.chiefHumanId) ?? null
                  : null;
                const chiefRank = chief ? evaluateChiefCandidate(chief).total : 0;
                return (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl bg-[#161e29] border border-white/10 flex flex-col justify-between gap-2.5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-100 truncate">
                          {s.name}
                        </span>
                        <span className="text-[11px] font-mono-tabular text-slate-400 shrink-0">
                          {pop} pop
                        </span>
                      </div>
                      <div className="text-[11px] text-amber-300/90 mt-0.5">
                        {BIOME_LABELS[s.biomeSpecialty]}
                      </div>
                      {chief && (
                        <button
                          type="button"
                          onClick={() => onFocusHuman?.(chief.id)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-amber-200 hover:text-amber-100 cursor-pointer"
                        >
                          <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                          <span>
                            Chief <span className="font-semibold">{chief.name}</span>
                          </span>
                          <span className="text-slate-400 font-mono-tabular">
                            (IQ {chief.iq} · {chiefRank})
                          </span>
                        </button>
                      )}
                      <div className="text-[11px] text-slate-400 mt-1">
                        Surplus: <span className="text-emerald-300 capitalize">{s.primaryExport}</span> · Need:{' '}
                        <span className="text-sky-300 capitalize">{s.primaryImport}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFocusSettlement(s.centerX, s.centerY)}
                      className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1d2736] hover:bg-[#253245] border border-white/10 text-xs font-medium text-slate-200 cursor-pointer"
                    >
                      <Compass className="w-3.5 h-3.5 text-amber-400" />
                      <span>Center Camera</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Active & Paused Trade Routes */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Caravan Routes
            </h3>
            {world.tradeRoutes.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#161e29] border border-white/8 text-xs text-slate-400 text-center">
                No caravan routes configured yet. Open a route below to exchange regional goods.
              </div>
            ) : (
              <div className="space-y-2">
                {world.tradeRoutes.map((route) => {
                  const fromS = settlementById.get(route.fromSettlementId);
                  const toS = settlementById.get(route.toSettlementId);
                  const activeTraders = world.humans.filter(
                    (h) => h.state === 'TRADE' && h.tradeState?.routeId === route.id
                  ).length;

                  return (
                    <div
                      key={route.id}
                      className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                        route.active
                          ? 'bg-[#161e29] border-amber-400/25'
                          : 'bg-[#131922] border-white/8 opacity-75'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                          <span>{fromS?.name ?? 'Origin'}</span>
                          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>{toS?.name ?? 'Destination'}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1 font-mono-tabular">
                          <span className="text-emerald-300 capitalize">{route.exportResource}</span>{' '}
                          ↔ <span className="text-sky-300 capitalize">{route.importResource}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{route.completedTrips} trips</span>
                          <span aria-hidden="true"> · </span>
                          <span>{activeTraders} active</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onToggleRoute(route.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                            route.active
                              ? 'bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25'
                              : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25'
                          }`}
                        >
                          {route.active ? (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>Resume</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRoute(route.id)}
                          aria-label="Remove trade route"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Create New Trade Route */}
          {world.settlements.length >= 2 && (
            <section className="space-y-2.5 border-t border-white/10 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Establish Caravan Route
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-end">
                <label className="text-xs text-slate-300 space-y-1">
                  <span className="block text-[11px] text-slate-400">Origin</span>
                  <select
                    value={fromId}
                    onChange={(e) => setFromId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#18202b] border border-white/10 text-xs text-slate-100"
                  >
                    {world.settlements.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-slate-300 space-y-1">
                  <span className="block text-[11px] text-slate-400">Destination</span>
                  <select
                    value={toId}
                    onChange={(e) => setToId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#18202b] border border-white/10 text-xs text-slate-100"
                  >
                    {world.settlements.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-slate-300 space-y-1">
                  <span className="block text-[11px] text-slate-400">Export</span>
                  <select
                    value={exportRes}
                    onChange={(e) => setExportRes(e.target.value as ResourceType)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#18202b] border border-white/10 text-xs text-slate-100"
                  >
                    {RESOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-slate-300 space-y-1">
                  <span className="block text-[11px] text-slate-400">Import</span>
                  <select
                    value={importRes}
                    onChange={(e) => setImportRes(e.target.value as ResourceType)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#18202b] border border-white/10 text-xs text-slate-100"
                  >
                    {RESOURCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  disabled={!fromId || !toId || fromId === toId}
                  onClick={() => onCreateRoute(fromId, toId, exportRes, importRes)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Open Route</span>
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
