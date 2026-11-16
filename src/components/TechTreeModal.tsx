import React from 'react';
import { Check, Lock, Sparkles, X } from 'lucide-react';
import { BUILDING_DEFS, ERA_DESCRIPTIONS, ERA_NAMES, TECH_TREE } from '../game/constants';
import { canUnlockTech } from '../game/simulation';
import { EraId, TechId, WorldState } from '../game/types';

interface TechTreeModalProps {
  world: WorldState;
  onUnlockTech: (techId: TechId) => void;
  onToggleAutoUnlock: () => void;
  onClose: () => void;
}

const ERAS: EraId[] = [1, 2, 3, 4];

export const TechTreeModal: React.FC<TechTreeModalProps> = ({
  world,
  onUnlockTech,
  onToggleAutoUnlock,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[88vh] flex flex-col bg-[#11161d] border border-white/12 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-50">
              Civilization Tech Tree
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Humans generate Research Points when curious or studying at Hearths, Workshops, and Observatories.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Available Research</div>
              <div className="text-sm font-mono-tabular font-semibold text-sky-300">
                {Math.floor(world.stockpile.researchPoints)} RP
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleAutoUnlock}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                world.autoUnlockTech
                  ? 'bg-emerald-500/18 border-emerald-400/60 text-emerald-200'
                  : 'bg-[#18202b] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              Auto-Unlock: {world.autoUnlockTech ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close tech tree"
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 4-Era Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 overflow-y-auto">
          {ERAS.map((era) => {
            const techs = TECH_TREE.filter((t) => t.era === era);
            const eraReached = world.currentEra >= era;

            return (
              <div key={era} className="flex flex-col gap-3">
                <div className="pb-2 border-b border-white/10">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className={eraReached ? 'text-amber-400' : 'text-slate-500'}>
                      Era {era}
                    </span>
                    <span className="text-slate-400 font-normal">
                      {eraReached ? 'Active' : 'Locked'}
                    </span>
                  </div>
                  <div className="font-display text-base font-bold text-slate-100 mt-0.5">
                    {ERA_NAMES[era]}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-snug">
                    {ERA_DESCRIPTIONS[era]}
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  {techs.map((tech) => {
                    const unlocked = world.unlockedTechs.includes(tech.id);
                    const available = canUnlockTech(world, tech.id);
                    const prereqMet = !tech.requires || world.unlockedTechs.includes(tech.requires);
                    const prereqName = tech.requires
                      ? TECH_TREE.find((x) => x.id === tech.requires)?.name
                      : null;

                    return (
                      <div
                        key={tech.id}
                        className={`p-3.5 rounded-lg border transition-colors ${
                          unlocked
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : available
                              ? 'bg-sky-500/12 border-sky-400/60'
                              : 'bg-[#171e28] border-white/8'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-100 leading-snug">
                            {tech.name}
                          </div>
                          <span className="text-xs font-mono-tabular text-sky-300 shrink-0">
                            {tech.cost} RP
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                          {tech.summary}
                        </p>

                        {tech.unlocksBuilding && (
                          <div className="text-[11px] text-amber-300/90 mt-2">
                            Blueprint: {BUILDING_DEFS[tech.unlocksBuilding].name}
                          </div>
                        )}

                        {prereqName && !unlocked && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            Requires: {prereqName}
                          </div>
                        )}

                        <div className="mt-3">
                          {unlocked ? (
                            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                              <Check className="w-3.5 h-3.5" />
                              <span>Discovered</span>
                            </div>
                          ) : available ? (
                            <button
                              type="button"
                              onClick={() => onUnlockTech(tech.id)}
                              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Unlock Technology</span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                              <Lock className="w-3 h-3" />
                              <span>
                                {!prereqMet
                                  ? 'Prerequisite needed'
                                  : `Need ${Math.max(0, Math.ceil(tech.cost - world.stockpile.researchPoints))} more RP`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
