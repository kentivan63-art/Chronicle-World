import React, { useMemo, useState } from 'react';
import { MapPin, User, X } from 'lucide-react';
import { TALENT_DEFS } from '../game/constants';
import { getDiscoverySprite } from '../game/pixelSprites';
import { DiscoveryCategory, HumanAgent, VillagerDiscovery, WorldState } from '../game/types';
import { PixelSpriteIcon } from './PixelSpriteIcon';

interface DiscoveriesModalProps {
  world: WorldState;
  onFocusDiscovery: (discovery: VillagerDiscovery) => void;
  onFocusHuman: (humanId: string) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<DiscoveryCategory, string> = {
  NATURAL: 'Natural Wonder',
  RELIC: 'Ancient Relic',
  CRAFT: 'Material Craft',
  MINERAL: 'Mineral Seam',
  BOTANICAL: 'Botanical Find',
};

const CATEGORY_COLORS: Record<DiscoveryCategory, string> = {
  NATURAL: 'text-sky-300',
  RELIC: 'text-amber-300',
  CRAFT: 'text-orange-300',
  MINERAL: 'text-slate-200',
  BOTANICAL: 'text-emerald-300',
};

export const DiscoveriesModal: React.FC<DiscoveriesModalProps> = ({
  world,
  onFocusDiscovery,
  onFocusHuman,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'BY_VILLAGER' | 'TIMELINE'>('BY_VILLAGER');
  const [onlyDiscoverers, setOnlyDiscoverers] = useState(false);

  const sortedVillagers = useMemo(() => {
    const list: HumanAgent[] = onlyDiscoverers
      ? world.humans.filter((h) => h.discoveries.length > 0 || h.isCuriousExplorer)
      : [...world.humans];

    return list.sort((a, b) => {
      if (b.discoveries.length !== a.discoveries.length) {
        return b.discoveries.length - a.discoveries.length;
      }
      if (a.isCuriousExplorer !== b.isCuriousExplorer) {
        return a.isCuriousExplorer ? -1 : 1;
      }
      return b.curiosity - a.curiosity;
    });
  }, [world.humans, onlyDiscoverers]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl max-h-[86vh] flex flex-col bg-[#11161d] border border-white/12 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-50">
              Villager Discoveries
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Curious villagers venture beyond the settlement to uncover wild herbs, mineral seams, and relics.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right mr-1">
              <div className="text-[11px] text-slate-400">Total Recorded</div>
              <div className="text-sm font-mono-tabular font-semibold text-amber-300">
                {world.discoveries.length}
              </div>
            </div>

            <div className="flex items-center gap-1 bg-[#18202b] p-1 rounded-lg border border-white/8">
              <button
                type="button"
                onClick={() => setViewMode('BY_VILLAGER')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === 'BY_VILLAGER'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                By Villager
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TIMELINE')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  viewMode === 'TIMELINE'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Timeline
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close discoveries"
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-bar filter when in By Villager mode */}
        {viewMode === 'BY_VILLAGER' && (
          <div className="flex items-center justify-between px-6 py-2.5 bg-[#151b24] border-b border-white/8 text-xs text-slate-400">
            <span>
              Showing <span className="font-mono-tabular text-slate-200">{sortedVillagers.length}</span> villagers
            </span>
            <button
              type="button"
              onClick={() => setOnlyDiscoverers((v) => !v)}
              className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                onlyDiscoverers
                  ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                  : 'bg-[#18202b] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              {onlyDiscoverers ? 'Showing Discoverers Only' : 'Filter: Discoverers Only'}
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {viewMode === 'BY_VILLAGER' ? (
            sortedVillagers.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">
                No villagers have completed an expedition yet. Curious settlers will head out soon, or cast a Curiosity Spark nudge.
              </div>
            ) : (
              sortedVillagers.map((villager) => {
                const talentList =
                  villager.talents.length > 0
                    ? villager.talents.map((tid) => TALENT_DEFS[tid].shortTag).join(' · ')
                    : 'Settler';
                return (
                  <div
                    key={villager.id}
                    className="pb-5 border-b border-white/8 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-base font-bold text-slate-100">
                            {villager.name}
                          </span>
                          {villager.isCuriousExplorer && (
                            <span className="text-xs font-medium text-sky-300">
                              · Exploring now
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          <span>{talentList}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono-tabular">
                            Curiosity {Math.round(villager.curiosity)}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span className="font-mono-tabular text-amber-300">
                            {villager.discoveries.length}{' '}
                            {villager.discoveries.length === 1 ? 'discovery' : 'discoveries'}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onFocusHuman(villager.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18202b] hover:bg-[#222d3b] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <User className="w-3.5 h-3.5 text-amber-400" />
                        <span>Follow Villager</span>
                      </button>
                    </div>

                    {villager.discoveries.length === 0 ? (
                      <div className="mt-2.5 text-xs text-slate-500">
                        {villager.isCuriousExplorer
                          ? 'Currently venturing outward in search of something new.'
                          : 'No discoveries recorded yet.'}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2.5 pl-3 border-l border-white/10">
                        {villager.discoveries.map((d) => (
                          <div
                            key={d.id}
                            className="flex flex-wrap items-start justify-between gap-3 py-1"
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="mt-0.5 p-1 rounded bg-[#18202b] border border-white/10 shrink-0">
                                <PixelSpriteIcon
                                  sprite={getDiscoverySprite(d.assetId)}
                                  size={28}
                                  title={d.title}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="text-sm font-semibold text-slate-100">
                                    {d.title}
                                  </span>
                                  <span className={`text-xs font-medium ${CATEGORY_COLORS[d.category]}`}>
                                    {CATEGORY_LABELS[d.category]}
                                  </span>
                                  <span aria-hidden="true" className="text-slate-600">·</span>
                                  <span className="text-xs font-mono-tabular text-slate-400">
                                    Year {d.year}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                  {d.description}
                                </p>
                                <div className="text-[11px] font-mono-tabular text-emerald-300/90 mt-1">
                                  Reward: {d.rewardSummary}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => onFocusDiscovery(d)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#18202b] hover:bg-[#222d3b] border border-white/10 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <MapPin className="w-3 h-3 text-sky-400" />
                              <span>Locate</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : world.discoveries.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">
              No discoveries made yet. Watch for a villager with a curious spark heading into the wilds.
            </div>
          ) : (
            <div className="space-y-3">
              {world.discoveries.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-white/8 last:border-b-0"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="mt-0.5 p-1 rounded bg-[#18202b] border border-white/10 shrink-0">
                      <PixelSpriteIcon
                        sprite={getDiscoverySprite(d.assetId)}
                        size={28}
                        title={d.title}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-semibold text-slate-100">{d.title}</span>
                        <span className={`text-xs font-medium ${CATEGORY_COLORS[d.category]}`}>
                          {CATEGORY_LABELS[d.category]}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Discovered by <span className="text-slate-200 font-medium">{d.humanName}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular">Year {d.year}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular text-emerald-300/90">{d.rewardSummary}</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{d.description}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onFocusDiscovery(d)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#18202b] hover:bg-[#222d3b] border border-white/10 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <MapPin className="w-3 h-3 text-sky-400" />
                    <span>Locate</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
