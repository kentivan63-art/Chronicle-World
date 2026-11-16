import React from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  CloudLightning,
  CloudRain,
  Compass,
  Eye,
  FastForward,
  Menu,
  Moon,
  Pause,
  Play,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ERA_NAMES } from '../game/constants';
import { getDayPhase } from '../game/simulation';
import { EraId, WeatherType, WorldState } from '../game/types';

interface TopHudProps {
  world: WorldState;
  cameraWeather: WeatherType;
  housingCap: number;
  speed: number;
  onSetSpeed: (s: number) => void;
  zoom: number;
  onZoomPreset: (targetZoom: number) => void;
  muted: boolean;
  onToggleMute: () => void;
  availableTechCount: number;
  onOpenTechTree: () => void;
  onOpenDiscoveries: () => void;
  onOpenTradeRoutes: () => void;
  onOpenWorldMenu: () => void;
}

const WEATHER_LABELS: Record<WeatherType, string> = {
  CLEAR: 'Clear',
  RAIN: 'Rain',
  SNOW: 'Snow',
  STORM: 'Storm',
};

export const TopHud: React.FC<TopHudProps> = ({
  world,
  cameraWeather,
  housingCap,
  speed,
  onSetSpeed,
  zoom,
  onZoomPreset,
  muted,
  onToggleMute,
  availableTechCount,
  onOpenTechTree,
  onOpenDiscoveries,
  onOpenTradeRoutes,
  onOpenWorldMenu,
}) => {
  const povLabel = zoom < 1.15 ? "Bird's-Eye" : zoom < 2.6 ? 'Settlement' : 'Close-Up';
  const dayPhase = getDayPhase(world.timeOfDay);
  const activeRouteCount = world.tradeRoutes.filter((r) => r.active).length;

  return (
    <header className="fixed top-3 left-3 right-3 z-20 flex flex-col gap-1.5 px-3.5 py-2 bg-[#11161d]/92 border border-white/12 rounded-xl shadow-lg backdrop-blur-md">
      {/* Row 1: World Identity + Time/Weather + Controls & Modal Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-display text-sm sm:text-base font-bold text-slate-50 whitespace-nowrap truncate">
            {world.worldName}
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-xs text-amber-400 font-medium whitespace-nowrap">
            Era {world.currentEra}: {ERA_NAMES[world.currentEra as EraId]}
          </span>
          <span aria-hidden="true" className="text-slate-600 hidden sm:inline">·</span>
          <span className="text-xs text-slate-400 font-mono-tabular whitespace-nowrap hidden sm:inline">
            Year {world.year}
          </span>
          <span aria-hidden="true" className="text-slate-600 hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-300 whitespace-nowrap hidden sm:inline-flex">
            {dayPhase === 'Night' ? (
              <Moon className="w-3 h-3 text-sky-300" />
            ) : dayPhase === 'Dawn' ? (
              <Sunrise className="w-3 h-3 text-amber-300" />
            ) : dayPhase === 'Dusk' ? (
              <Sunset className="w-3 h-3 text-orange-400" />
            ) : (
              <Sun className="w-3 h-3 text-amber-400" />
            )}
            <span>{dayPhase}</span>
          </span>
          <span aria-hidden="true" className="text-slate-600 hidden md:inline">·</span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-300 whitespace-nowrap hidden md:inline-flex">
            {cameraWeather === 'RAIN' ? (
              <CloudRain className="w-3 h-3 text-sky-400" />
            ) : cameraWeather === 'SNOW' ? (
              <Snowflake className="w-3 h-3 text-slate-100" />
            ) : cameraWeather === 'STORM' ? (
              <CloudLightning className="w-3 h-3 text-amber-300" />
            ) : (
              <Sun className="w-3 h-3 text-amber-300/80" />
            )}
            <span>{WEATHER_LABELS[cameraWeather]}</span>
          </span>
        </div>

        {/* Navigation Actions (Never Overflow) */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* POV Quick Toggle */}
          <div className="hidden lg:flex items-center gap-0.5 bg-[#18202b] p-0.5 rounded-lg border border-white/8">
            <button
              type="button"
              onClick={() => onZoomPreset(0.65)}
              title="Bird's-Eye View"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                zoom < 1.15 ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ZoomOut className="w-3 h-3" />
              <span>Map</span>
            </button>
            <button
              type="button"
              onClick={() => onZoomPreset(3.4)}
              title="Close-Up POV"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                zoom >= 2.6 ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ZoomIn className="w-3 h-3" />
              <span>POV</span>
            </button>
          </div>

          <span className="hidden sm:inline lg:hidden text-xs text-slate-400 font-mono-tabular whitespace-nowrap">
            <Eye className="w-3 h-3 inline mr-1" />
            {povLabel}
          </span>

          {/* Speed Controls */}
          <div className="flex items-center gap-0.5 bg-[#18202b] p-0.5 rounded-lg border border-white/8">
            <button
              type="button"
              onClick={() => onSetSpeed(0)}
              aria-label="Pause simulation"
              className={`px-1.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                speed === 0 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onSetSpeed(1)}
              className={`px-1.5 py-1 rounded text-[11px] font-mono-tabular font-medium transition-colors cursor-pointer ${
                speed === 1 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <Play className="w-3 h-3 inline mr-0.5" />1x
            </button>
            <button
              type="button"
              onClick={() => onSetSpeed(2)}
              className={`px-1.5 py-1 rounded text-[11px] font-mono-tabular font-medium transition-colors cursor-pointer ${
                speed === 2 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              2x
            </button>
            <button
              type="button"
              onClick={() => onSetSpeed(4)}
              className={`px-1.5 py-1 rounded text-[11px] font-mono-tabular font-medium transition-colors cursor-pointer ${
                speed === 4 ? 'bg-amber-500 text-slate-950' : 'text-slate-300 hover:text-white'
              }`}
            >
              <FastForward className="w-3 h-3 inline mr-0.5" />4x
            </button>
          </div>

          {/* Tech Tree CTA */}
          <button
            type="button"
            onClick={onOpenTechTree}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border ${
              availableTechCount > 0
                ? 'bg-sky-500/20 border-sky-400 text-sky-200 hover:bg-sky-500/30'
                : 'bg-[#18202b] border-white/10 text-slate-200 hover:bg-[#202a38]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-sky-400" />
            <span>Tech</span>
            {availableTechCount > 0 && (
              <span className="font-mono-tabular text-sky-300">({availableTechCount})</span>
            )}
          </button>

          {/* Trade Routes CTA */}
          <button
            type="button"
            onClick={onOpenTradeRoutes}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border bg-[#18202b] border-white/10 text-slate-200 hover:bg-[#202a38]"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-400" />
            <span>Trade</span>
            <span className="font-mono-tabular text-emerald-300">({activeRouteCount})</span>
          </button>

          {/* Villager Discoveries CTA */}
          <button
            type="button"
            onClick={onOpenDiscoveries}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer border bg-[#18202b] border-white/10 text-slate-200 hover:bg-[#202a38]"
          >
            <Compass className="w-3.5 h-3.5 text-amber-400" />
            <span>Discoveries</span>
            <span className="font-mono-tabular text-amber-300">({world.discoveries.length})</span>
          </button>

          {/* Mute Toggle */}
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="p-1.5 rounded-lg bg-[#18202b] border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* World / Save Menu */}
          <button
            type="button"
            onClick={onOpenWorldMenu}
            aria-label="Open world menu"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18202b] border border-white/10 text-slate-200 hover:bg-[#202a38] text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Menu className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Menu</span>
          </button>
        </div>
      </div>

      {/* Row 2: Community Stockpiles & Population Readout */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1 border-t border-white/8 text-xs font-mono-tabular">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-slate-400">Pop</span>
            <span className="text-slate-100 font-semibold">
              {world.humans.length}/{housingCap}
            </span>
          </div>
          <span aria-hidden="true" className="text-slate-700">·</span>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-lime-400">Food</span>
            <span className="text-slate-100 font-semibold">{Math.floor(world.stockpile.food)}</span>
          </div>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-amber-500">Wood</span>
            <span className="text-slate-100 font-semibold">{Math.floor(world.stockpile.wood)}</span>
          </div>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-slate-300">Stone</span>
            <span className="text-slate-100 font-semibold">{Math.floor(world.stockpile.stone)}</span>
          </div>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-orange-400">Ore</span>
            <span className="text-slate-100 font-semibold">{Math.floor(world.stockpile.ore)}</span>
          </div>
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-slate-400">Coal</span>
            <span className="text-slate-100 font-semibold">{Math.floor(world.stockpile.coal)}</span>
          </div>
          <span aria-hidden="true" className="text-slate-700">·</span>
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-sky-400">RP</span>
            <span className="text-sky-300 font-semibold">{Math.floor(world.stockpile.researchPoints)}</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 text-[11px] font-sans text-slate-400 whitespace-nowrap">
          <span>{world.settlements.length} Settlements</span>
          <span aria-hidden="true">·</span>
          <span>{world.mapCurios.length} Wild Curios</span>
        </div>
      </div>
    </header>
  );
};
