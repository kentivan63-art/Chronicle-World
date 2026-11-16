import React from 'react';
import { Award, Play, RotateCcw } from 'lucide-react';
import { WorldState } from '../game/types';

interface VictoryModalProps {
  world: WorldState;
  onContinueSandbox: () => void;
  onStartNewWorld: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  world,
  onContinueSandbox,
  onStartNewWorld,
}) => {
  const completedCount = world.buildings.filter((b) => b.status === 'COMPLETE').length;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#11161d] border border-amber-400/40 rounded-xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-500/15 text-amber-400">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-medium text-amber-400">Era 4 Milestone Reached</div>
            <h2 className="font-display text-xl font-bold text-slate-50">
              Clockwork Mastery
            </h2>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">
          Through your blueprints, awakened talents, and behavioral nudges, the people of{' '}
          <span className="font-semibold text-slate-100">{world.worldName}</span> progressed from
          campfires to illuminated clockwork workshops.
        </p>

        <div className="grid grid-cols-3 gap-3 py-3 border-y border-white/10 text-center font-mono-tabular">
          <div>
            <div className="text-lg font-bold text-slate-50">{world.year}</div>
            <div className="text-[11px] text-slate-400 font-sans">Years</div>
          </div>
          <div>
            <div className="text-lg font-bold text-emerald-400">{world.humans.length}</div>
            <div className="text-[11px] text-slate-400 font-sans">Humans</div>
          </div>
          <div>
            <div className="text-lg font-bold text-amber-400">{completedCount}</div>
            <div className="text-[11px] text-slate-400 font-sans">Buildings</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onContinueSandbox}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Continue Sandbox</span>
          </button>
          <button
            type="button"
            onClick={onStartNewWorld}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#18202b] hover:bg-[#222c3a] border border-white/10 text-slate-200 text-xs font-medium cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New World</span>
          </button>
        </div>
      </div>
    </div>
  );
};
