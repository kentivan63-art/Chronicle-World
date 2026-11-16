import React from 'react';
import { Compass, FolderOpen, Play, Sparkles } from 'lucide-react';
import { MapPreset } from '../game/types';

interface TitleOverlayProps {
  preset: MapPreset;
  onSelectPreset: (preset: MapPreset) => void;
  hasLocalSave: boolean;
  onStartNew: () => void;
  onContinueSave: () => void;
  onImportJson: (content: string) => void;
}

const PRESETS: { id: MapPreset; label: string; detail: string }[] = [
  {
    id: 'ARCHIPELAGO',
    label: 'Archipelago',
    detail: 'Balanced central isle with rich coastal meadows and timber groves.',
  },
  {
    id: 'RIVER_VALLEY',
    label: 'River Valley',
    detail: 'Fertile twin banks divided by a winding central waterway.',
  },
  {
    id: 'TWIN_PEAKS',
    label: 'Twin Peaks',
    detail: 'Highland ore ridges flanking a sheltered settlement basin.',
  },
];

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  preset,
  onSelectPreset,
  hasLocalSave,
  onStartNew,
  onContinueSave,
  onImportJson,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0c1118]/78 backdrop-blur-sm p-6">
      <div className="w-full max-w-2xl bg-[#131922]/95 border border-white/12 rounded-xl shadow-2xl p-8">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-amber-400/90 font-medium">
              <Compass className="w-3.5 h-3.5" />
              <span>2D Living Civilization Sandbox</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="text-slate-400">Stone Age to Clockwork Era</span>
            </div>
            <h1 className="font-display text-4xl font-bold text-slate-50 tracking-tight text-balance">
              Chronicle World
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
              Shape a living human community indirectly. Stake building blueprints, awaken innate talents,
              and spark curiosity—then zoom from bird&apos;s-eye panorama down to up-close thoughts as
              villagers invent and build everything themselves.
            </p>
          </div>

          {/* Core Mechanics Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-white/10 py-5">
            <div>
              <div className="text-xs font-semibold text-amber-400 mb-1">01. Stake Blueprints</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Plan Hearths, Granaries, and Workshops. Humans haul timber, stone, and ore to raise them.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-sky-400 mb-1">02. Awaken Talents</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Bless villagers as Architects, Scholars, or Clockmakers and nudge community priorities.
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold text-emerald-400 mb-1">03. Zoom Two POVs</div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Scroll smoothly between bird&apos;s-eye world maps and up-close villager actions.
              </p>
            </div>
          </div>

          {/* Terrain Preset Selector */}
          <div className="space-y-2.5">
            <div className="text-xs font-medium text-slate-300">Select World Terrain</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {PRESETS.map((p) => {
                const active = preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSelectPreset(p.id)}
                    className={`text-left p-3.5 rounded-lg border transition-colors ${
                      active
                        ? 'bg-amber-500/12 border-amber-400/70 text-slate-50'
                        : 'bg-[#19212c] border-white/8 text-slate-300 hover:border-white/20'
                    }`}
                  >
                    <div className="text-sm font-semibold whitespace-nowrap">{p.label}</div>
                    <div className="text-xs text-slate-400 mt-1 leading-snug">{p.detail}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onStartNew}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start New World</span>
            </button>

            {hasLocalSave && (
              <button
                type="button"
                onClick={onContinueSave}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1d2633] hover:bg-[#253040] border border-white/12 text-slate-100 font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Continue Saved World</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-transparent hover:bg-white/6 border border-white/12 text-slate-300 font-medium text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>Import .json</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
