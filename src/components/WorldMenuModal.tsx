import React from 'react';
import {
  Download,
  FolderOpen,
  Monitor,
  RotateCcw,
  Save,
  X,
} from 'lucide-react';
import { getDesktopBridge } from '../game/persistence';
import { MapPreset, WorldState } from '../game/types';

interface WorldMenuModalProps {
  world: WorldState;
  onSaveLocal: () => void;
  onExportJson: () => void;
  onImportJson: (content: string) => void;
  onNewWorld: (preset: MapPreset) => void;
  onClose: () => void;
}

export const WorldMenuModal: React.FC<WorldMenuModalProps> = ({
  world,
  onSaveLocal,
  onExportJson,
  onImportJson,
  onNewWorld,
  onClose,
}) => {
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const bridge = getDesktopBridge();

  const handleSave = () => {
    onSaveLocal();
    setFeedback('Saved to local browser storage.');
  };

  const handleImport = async () => {
    if (bridge?.isElectron && bridge.openWorldDialog) {
      const res = await bridge.openWorldDialog();
      if (res.opened && res.content) {
        onImportJson(res.content);
        onClose();
      }
      return;
    }
    fileRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportJson(reader.result);
        onClose();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#11161d] border border-white/12 rounded-xl shadow-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-50">World & Desktop Menu</h2>
            <div className="text-xs text-slate-400 mt-0.5">
              {world.worldName} · Seed {world.seed}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Save & Snapshot Actions */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-slate-300">World Persistence</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
            <button
              type="button"
              onClick={onExportJson}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#18202b] hover:bg-[#202a38] border border-white/10 text-slate-100 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .json</span>
            </button>
            <button
              type="button"
              onClick={handleImport}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#18202b] hover:bg-[#202a38] border border-white/10 text-slate-100 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Import .json</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          {feedback && <div className="text-xs text-emerald-400">{feedback}</div>}
        </div>

        {/* Generate New World */}
        <div className="space-y-2.5 border-t border-white/10 pt-4">
          <div className="text-xs font-semibold text-slate-300">Generate Fresh World</div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'ARCHIPELAGO', label: 'Archipelago' },
                { id: 'RIVER_VALLEY', label: 'River Valley' },
                { id: 'TWIN_PEAKS', label: 'Twin Peaks' },
              ] as { id: MapPreset; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onNewWorld(p.id);
                  onClose();
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#18202b] hover:bg-[#222c3a] border border-white/10 text-xs font-medium text-slate-200 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Windows & Cross-Platform Electron Info */}
        <div className="space-y-2 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Monitor className="w-3.5 h-3.5 text-amber-400" />
            <span>Windows & Cross-Platform Desktop Packaging</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {bridge?.isElectron
              ? `Running natively inside Electron (${bridge.platform}). Native file dialogs enabled.`
              : 'This project includes pre-configured Electron desktop wrappers and electron-builder settings for Windows (.exe NSIS/Portable), macOS (.dmg), and Linux (.AppImage).'}
          </p>
          {!bridge?.isElectron && (
            <pre className="p-2.5 rounded-lg bg-[#0b0f14] border border-white/8 text-[11px] font-mono-tabular text-sky-300 overflow-x-auto">
              npm run build &amp;&amp; npx electron-builder --win
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
