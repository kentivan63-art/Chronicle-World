import React from 'react';
import {
  DraftingCompass,
  Lock,
  MousePointer,
  Sparkles,
  UserPlus,
  Waves,
} from 'lucide-react';
import {
  BUILDING_DEFS,
  NUDGE_DEFS,
  TALENT_DEFS,
} from '../game/constants';
import { isBuildingUnlocked } from '../game/simulation';
import {
  BuildingKind,
  NudgeType,
  TalentId,
  ToolCategory,
  WorldState,
} from '../game/types';

interface BottomDockProps {
  world: WorldState;
  toolCategory: ToolCategory;
  onSelectCategory: (cat: ToolCategory) => void;
  selectedBlueprint: BuildingKind;
  onSelectBlueprint: (kind: BuildingKind) => void;
  selectedTalent: TalentId;
  onSelectTalent: (talent: TalentId) => void;
  selectedNudge: NudgeType;
  onSelectNudge: (nudge: NudgeType) => void;
}

const CATEGORIES: { id: ToolCategory; label: string; icon: React.ReactNode; keyHint: string }[] = [
  { id: 'INSPECT', label: 'Inspect', icon: <MousePointer className="w-3.5 h-3.5" />, keyHint: 'Esc' },
  { id: 'SPAWN', label: 'Spawn Human', icon: <UserPlus className="w-3.5 h-3.5" />, keyHint: 'Q' },
  { id: 'BLUEPRINT', label: 'Blueprints', icon: <DraftingCompass className="w-3.5 h-3.5" />, keyHint: 'B' },
  { id: 'TALENT', label: 'Talents', icon: <Sparkles className="w-3.5 h-3.5" />, keyHint: 'T' },
  { id: 'NUDGE', label: 'Behavior Nudges', icon: <Waves className="w-3.5 h-3.5" />, keyHint: 'N' },
];

const BUILDING_LIST = Object.values(BUILDING_DEFS);
const TALENT_LIST = Object.values(TALENT_DEFS);
const NUDGE_LIST = Object.values(NUDGE_DEFS);

export const BottomDock: React.FC<BottomDockProps> = ({
  world,
  toolCategory,
  onSelectCategory,
  selectedBlueprint,
  onSelectBlueprint,
  selectedTalent,
  onSelectTalent,
  selectedNudge,
  onSelectNudge,
}) => {
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 max-w-[95vw]">
      {/* Contextual Sub-Tray */}
      {toolCategory === 'BLUEPRINT' && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[#11161d]/94 border border-white/12 rounded-xl shadow-xl backdrop-blur-md overflow-x-auto max-w-[92vw]">
          {BUILDING_LIST.map((def) => {
            const unlocked = isBuildingUnlocked(world, def.kind);
            const active = selectedBlueprint === def.kind;
            return (
              <button
                key={def.kind}
                type="button"
                onClick={() => unlocked && onSelectBlueprint(def.kind)}
                disabled={!unlocked}
                title={
                  unlocked
                    ? `${def.name} (${def.cost.wood}W · ${def.cost.stone}S${def.cost.ore ? ` · ${def.cost.ore}O` : ''}${def.cost.coal ? ` · ${def.cost.coal}C` : ''}) — ${def.benefitSummary}`
                    : `Requires Era ${def.era} technology`
                }
                className={`flex flex-col items-start px-3 py-1.5 rounded-lg border text-left transition-colors whitespace-nowrap shrink-0 ${
                  !unlocked
                    ? 'bg-[#161c24]/60 border-white/5 text-slate-500 cursor-not-allowed'
                    : active
                      ? 'bg-amber-500/18 border-amber-400 text-slate-50 cursor-pointer'
                      : 'bg-[#18202b] border-white/8 text-slate-200 hover:border-white/20 cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  {!unlocked && <Lock className="w-3 h-3 text-slate-500" />}
                  <span>{def.name}</span>
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-400 mt-0.5">
                  {def.cost.wood}W · {def.cost.stone}S{def.cost.ore > 0 ? ` · ${def.cost.ore}O` : ''}{def.cost.coal > 0 ? ` · ${def.cost.coal}C` : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {toolCategory === 'TALENT' && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[#11161d]/94 border border-white/12 rounded-xl shadow-xl backdrop-blur-md overflow-x-auto max-w-[92vw]">
          {TALENT_LIST.map((t) => {
            const active = selectedTalent === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTalent(t.id)}
                title={t.description}
                className={`flex flex-col items-start px-3 py-1.5 rounded-lg border text-left transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-slate-800 border-amber-400 text-slate-50'
                    : 'bg-[#18202b] border-white/8 text-slate-300 hover:border-white/20'
                }`}
              >
                <div className="text-xs font-semibold" style={{ color: t.color }}>
                  {t.shortTag}
                </div>
                <div className="text-[11px] text-slate-400 max-w-[160px] truncate">{t.description}</div>
              </button>
            );
          })}
        </div>
      )}

      {toolCategory === 'NUDGE' && (
        <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[#11161d]/94 border border-white/12 rounded-xl shadow-xl backdrop-blur-md overflow-x-auto max-w-[92vw]">
          {NUDGE_LIST.map((n) => {
            const active = selectedNudge === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelectNudge(n.id)}
                title={n.description}
                className={`flex flex-col items-start px-3 py-1.5 rounded-lg border text-left transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-slate-800 border-sky-400 text-slate-50'
                    : 'bg-[#18202b] border-white/8 text-slate-300 hover:border-white/20'
                }`}
              >
                <div className="text-xs font-semibold" style={{ color: n.color }}>
                  {n.name}
                </div>
                <div className="text-[11px] text-slate-400 max-w-[180px] truncate">{n.description}</div>
              </button>
            );
          })}
        </div>
      )}

      {toolCategory === 'SPAWN' && (
        <div className="px-3.5 py-1.5 bg-[#11161d]/94 border border-white/12 rounded-lg text-xs text-slate-300 whitespace-nowrap">
          Click any land tile to spawn a new autonomous human settler.
        </div>
      )}

      {/* Main Category Switcher */}
      <div className="flex items-center gap-1 p-1.5 bg-[#11161d]/94 border border-white/12 rounded-xl shadow-2xl backdrop-blur-md overflow-x-auto max-w-[92vw]">
        {CATEGORIES.map((cat) => {
          const active = toolCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:bg-white/8 hover:text-white'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
              <span
                className={`text-[10px] font-mono-tabular ${
                  active ? 'text-slate-900/80' : 'text-slate-500'
                }`}
              >
                {cat.keyHint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
