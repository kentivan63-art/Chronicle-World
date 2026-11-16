import React from 'react';
import { ChevronDown, ChevronUp, ScrollText } from 'lucide-react';
import { ChronicleEvent } from '../game/types';

interface ChronicleLogProps {
  events: ChronicleEvent[];
}

export const ChronicleLog: React.FC<ChronicleLogProps> = ({ events }) => {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="fixed bottom-24 left-3 z-10 w-72 hidden md:block">
      <div className="bg-[#11161d]/88 border border-white/10 rounded-xl shadow-lg backdrop-blur-md overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 cursor-pointer"
        >
          <span className="inline-flex items-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5 text-amber-400" />
            <span>Community Chronicle</span>
          </span>
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {!collapsed && (
          <div className="px-3 pb-2.5 space-y-1.5 max-h-36 overflow-y-auto border-t border-white/8 pt-2">
            {events.slice(0, 6).map((ev) => (
              <div key={ev.id} className="text-[11px] leading-snug text-slate-300">
                <span className="font-mono-tabular text-amber-400/90 mr-1.5">Yr {ev.year}</span>
                <span>{ev.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
