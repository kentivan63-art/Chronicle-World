import React, { useState } from 'react';
import { Crosshair, Hammer, Trash2, X } from 'lucide-react';
import {
  BUILDING_DEFS,
  CRAFTED_ITEM_DEFS,
  NUDGE_DEFS,
  TALENT_DEFS,
} from '../game/constants';
import { getCraftedItemSprite, getDiscoverySprite } from '../game/pixelSprites';
import {
  BuildingSite,
  CraftedItemKind,
  CraftOrder,
  HumanAgent,
  NudgeType,
  Settlement,
  TalentId,
  TileType,
  WeatherType,
  WorldTile,
} from '../game/types';
import { PixelSpriteIcon } from './PixelSpriteIcon';

export interface SelectedTileInfo {
  tx: number;
  ty: number;
  tile: WorldTile;
}

interface EntityInspectorProps {
  human: HumanAgent | null;
  building: BuildingSite | null;
  selectedTile: SelectedTileInfo | null;
  selectedTileWeather?: WeatherType;
  settlements: Settlement[];
  craftOrders: CraftOrder[];
  isFollowing: boolean;
  onToggleFollow: (humanId: string) => void;
  onAwakenTalent: (humanId: string, talent: TalentId) => void;
  onNudgeHuman: (humanId: string, nudge: NudgeType) => void;
  onCancelBlueprint: (buildingId: string) => void;
  onCommissionCraft: (buildingId: string, itemKind: CraftedItemKind, qty: number) => void;
  onCancelCraftOrder: (orderId: string) => void;
  onClose: () => void;
}

const TALENT_LIST = Object.values(TALENT_DEFS);
const NUDGE_LIST = Object.values(NUDGE_DEFS);
const CRAFTABLE_LIST = Object.values(CRAFTED_ITEM_DEFS);

const TASK_LABELS: Record<HumanAgent['state'], string> = {
  IDLE: 'Observing',
  FORAGE: 'Foraging food',
  CHOP: 'Chopping timber',
  MINE: 'Mining stone, ore & coal',
  HAUL_TO_SITE: 'Hauling supplies',
  BUILD: 'Constructing',
  CRAFT: 'Forging tools & weapons',
  PATROL: 'Patrolling perimeter',
  TRADE: 'Caravan trading',
  RESEARCH: 'Researching',
  REST: 'Resting',
  SLEEPING: 'Sheltering / Sleeping',
  CELEBRATE: 'Celebrating',
  EXPLORE: 'Exploring wilds',
  SOCIALIZE: 'Socializing',
};

const WEATHER_LABELS: Record<WeatherType, string> = {
  CLEAR: 'Clear Skies',
  RAIN: 'Steady Rain (+Fertility)',
  SNOW: 'Frost & Snow (-Speed, -Fertility)',
  STORM: 'Thunderstorm (-40% Speed)',
};

function describeResourceTile(tile: WorldTile): {
  title: string;
  stage: string;
  yieldLabel: string;
  maxYield: number;
  barColor: string;
  summary: string;
} {
  if (tile.type === TileType.FOREST) {
    const stage =
      tile.resourceAmount >= 15
        ? 'Dense Woodland Canopy'
        : tile.resourceAmount >= 7
          ? 'Partially Logged Stand'
          : 'Timber Stumps & Logs';
    return {
      title: 'Woodland Forest',
      stage,
      yieldLabel: 'Timber Yield',
      maxYield: 24,
      barColor: 'bg-emerald-400',
      summary:
        'Provides wood for blueprints, tools, and lodges. Regrows faster in rain-soaked fertile soil.',
    };
  }
  if (tile.type === TileType.BERRY_GROVE) {
    const stage = tile.resourceAmount >= 8 ? 'Ripe Berry Thicket' : 'Picked Shrubs';
    return {
      title: 'Wild Berry Grove',
      stage,
      yieldLabel: 'Berry Food',
      maxYield: 20,
      barColor: 'bg-rose-400',
      summary:
        'Foraged by settlers and foragers for food. Fertile weather speeds berry ripening.',
    };
  }
  if (tile.type === TileType.COAL) {
    const stage = tile.resourceAmount >= 15 ? 'Rich Anthracite Seam' : 'Surface Coal Outcrop';
    return {
      title: 'Anthracite Coal Vein',
      stage,
      yieldLabel: 'Coal Reserve',
      maxYield: 36,
      barColor: 'bg-slate-400',
      summary:
        'Essential high-heat fuel mined to forge tools, bronze blades, armories, and chronometers.',
    };
  }
  if (tile.type === TileType.ORE) {
    const stage = tile.resourceAmount >= 15 ? 'Rich Mineral Vein' : 'Weathered Ore Seam';
    return {
      title: 'Highland Ore Vein',
      stage,
      yieldLabel: 'Ore Reserve',
      maxYield: 35,
      barColor: 'bg-amber-400',
      summary:
        'Smelted into bronze weapons, tools, and clockwork components. Metallurgists extract double ore.',
    };
  }
  if (tile.type === TileType.STONE) {
    const stage = tile.resourceAmount >= 20 ? 'Solid Stone Ridge' : 'Quarried Outcrop';
    return {
      title: 'Stone Quarry Deposit',
      stage,
      yieldLabel: 'Stone Reserve',
      maxYield: 40,
      barColor: 'bg-slate-300',
      summary:
        'Essential masonry stone for workshops, wells, civic halls, and stone foundations.',
    };
  }
  return {
    title: 'Irrigated Farmland',
    stage: 'Golden Crop Furrows',
    yieldLabel: 'Crop Fertility',
    maxYield: 50,
    barColor: 'bg-lime-400',
    summary:
      'Cultivated around completed Granaries for steady, renewable community food harvests.',
  };
}

export const EntityInspector: React.FC<EntityInspectorProps> = ({
  human,
  building,
  selectedTile,
  selectedTileWeather = 'CLEAR',
  settlements,
  craftOrders,
  isFollowing,
  onToggleFollow,
  onAwakenTalent,
  onNudgeHuman,
  onCancelBlueprint,
  onCommissionCraft,
  onCancelCraftOrder,
  onClose,
}) => {
  const [craftQty, setCraftQty] = useState<number>(3);

  if (!human && !building && !selectedTile) return null;

  const tileInfo = selectedTile ? describeResourceTile(selectedTile.tile) : null;
  const buildingCraftables =
    building && building.status === 'COMPLETE'
      ? CRAFTABLE_LIST.filter((c) => c.craftedAt.includes(building.kind))
      : [];
  const buildingOrders = building
    ? craftOrders.filter((o) => o.buildingId === building.id)
    : [];
  const humanSettlement = human?.settlementId
    ? settlements.find((s) => s.id === human.settlementId)
    : null;

  return (
    <aside className="fixed top-28 right-3 z-20 w-80 max-h-[calc(100vh-180px)] overflow-y-auto bg-[#11161d]/95 border border-white/12 rounded-xl shadow-2xl backdrop-blur-md p-4 text-slate-200">
      {human && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-50 leading-tight">
                {human.name}
              </h2>
              <div className="text-xs text-slate-400 mt-0.5">
                Age {human.age} <span aria-hidden="true">·</span> {TASK_LABELS[human.state]}
                {humanSettlement && (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span className="text-amber-300/90">{humanSettlement.name}</span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Follow Up Close POV Toggle */}
          <button
            type="button"
            onClick={() => onToggleFollow(human.id)}
            className={`w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
              isFollowing
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-[#18202b] border-white/10 text-slate-100 hover:border-amber-400/50'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{isFollowing ? 'Following Up Close' : 'Follow Up Close'}</span>
          </button>

          {/* Current Thought & Stats */}
          <div className="space-y-2 border-t border-white/8 pt-3">
            <div className="text-xs text-slate-400">
              Thought: <span className="text-slate-100 italic">&ldquo;{human.thoughtText}&rdquo;</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono-tabular pt-1">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Health</span>
                  <span className="text-slate-200">{Math.round(human.hp)}/100</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${human.hp}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Energy</span>
                  <span className="text-slate-200">{Math.round(human.energy)}/100</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${human.energy}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Curiosity</span>
                  <span className="text-slate-200">{Math.round(human.curiosity)}/100</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-sky-400" style={{ width: `${human.curiosity}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>Satiety</span>
                  <span className="text-slate-200">{Math.round(100 - human.hunger)}/100</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-lime-400" style={{ width: `${100 - human.hunger}%` }} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono-tabular text-slate-400 pt-1">
              <span>RP: {human.researchContributed.toFixed(1)}</span>
              <span aria-hidden="true">·</span>
              <span>Built: {human.buildingsAssisted}</span>
              <span aria-hidden="true">·</span>
              <span>Forged: {human.craftedCount}</span>
            </div>
          </div>

          {/* Equipped Gear */}
          <div className="space-y-2 border-t border-white/8 pt-3">
            <div className="text-xs font-semibold text-slate-200">Equipped Gear</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                {human.equippedWeapon ? (
                  <>
                    <PixelSpriteIcon sprite={getCraftedItemSprite(human.equippedWeapon)} size={20} />
                    <span className="text-slate-100 font-medium">
                      {CRAFTED_ITEM_DEFS[human.equippedWeapon].name}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">Weapon: None</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {human.equippedTool ? (
                  <>
                    <PixelSpriteIcon sprite={getCraftedItemSprite(human.equippedTool)} size={20} />
                    <span className="text-slate-100 font-medium">
                      {CRAFTED_ITEM_DEFS[human.equippedTool].name}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500">Tool: Standard hands</span>
                )}
              </div>
            </div>
          </div>

          {/* Innate Talents */}
          <div className="space-y-2 border-t border-white/8 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Innate Talents</span>
              <span className="text-slate-500 font-mono-tabular">{human.talents.length}/3</span>
            </div>
            <div className="text-xs text-slate-300">
              {human.talents.length === 0
                ? 'No awakened talents yet.'
                : human.talents.map((tid) => TALENT_DEFS[tid].shortTag).join(' · ')}
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {TALENT_LIST.map((t) => {
                const has = human.talents.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={has}
                    onClick={() => onAwakenTalent(human.id, t.id)}
                    className={`px-2 py-1.5 rounded text-xs font-medium border text-left transition-colors whitespace-nowrap truncate ${
                      has
                        ? 'bg-slate-800/80 border-amber-400/40 text-amber-300 cursor-default'
                        : 'bg-[#18202b] border-white/8 text-slate-300 hover:border-white/25 cursor-pointer'
                    }`}
                  >
                    {has ? `✓ ${t.shortTag}` : `+ ${t.shortTag}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Behavior Nudge */}
          <div className="space-y-2 border-t border-white/8 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Nudge Behavior</span>
              {human.activeNudge && (
                <span className="text-sky-400 font-mono-tabular">
                  {Math.ceil(human.activeNudge.remainingSec)}s
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {NUDGE_LIST.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onNudgeHuman(human.id, n.id)}
                  className="px-2 py-1.5 rounded bg-[#18202b] hover:bg-[#212c3a] border border-white/10 text-xs font-medium text-slate-200 text-left transition-colors whitespace-nowrap truncate cursor-pointer"
                >
                  {n.name}
                </button>
              ))}
            </div>
          </div>

          {/* Personal Discoveries */}
          <div className="space-y-2 border-t border-white/8 pt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Discoveries Made</span>
              <span className="text-amber-300 font-mono-tabular">{human.discoveries.length}</span>
            </div>
            {human.isCuriousExplorer && (
              <div className="text-[11px] text-sky-300">
                Venturing out on a curious expedition...
              </div>
            )}
            {human.discoveries.length === 0 ? (
              <div className="text-xs text-slate-500">
                No discoveries made yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {human.discoveries.map((d) => (
                  <div key={d.id} className="flex items-start gap-2 text-xs pb-1.5 border-b border-white/6 last:border-b-0">
                    <PixelSpriteIcon sprite={getDiscoverySprite(d.assetId)} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-100 truncate">{d.title}</span>
                        <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                          Yr {d.year}
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-300/90 font-mono-tabular">
                        {d.rewardSummary}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {building && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-50 leading-tight">
                {BUILDING_DEFS[building.kind].name}
              </h2>
              <div className="text-xs text-slate-400 mt-0.5">
                Era {BUILDING_DEFS[building.kind].era}
                <span aria-hidden="true"> · </span>
                <span>
                  {building.status === 'COMPLETE'
                    ? 'Operational'
                    : building.status === 'UNDER_CONSTRUCTION'
                      ? 'Under Construction'
                      : 'Blueprint Staked'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {BUILDING_DEFS[building.kind].benefitSummary}
          </p>

          {building.status === 'COMPLETE' && building.occupantsSleeping > 0 && (
            <div className="text-xs text-sky-300 border-t border-white/8 pt-2.5">
              Humans Sleeping Inside:{' '}
              <span className="font-mono-tabular font-semibold">{building.occupantsSleeping}</span>
            </div>
          )}

          {building.status !== 'COMPLETE' && (
            <div className="space-y-3 border-t border-white/8 pt-3">
              <div>
                <div className="flex justify-between text-xs font-mono-tabular mb-1">
                  <span className="text-slate-400">Build Progress</span>
                  <span className="text-amber-300">{Math.floor(building.buildProgress)}%</span>
                </div>
                <div className="h-2 bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all"
                    style={{ width: `${building.buildProgress}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1 text-xs font-mono-tabular">
                <div className="text-slate-400 font-sans font-medium">Delivered Supplies</div>
                <div className="flex justify-between">
                  <span className="text-amber-500">Wood</span>
                  <span>
                    {building.delivered.wood} / {building.required.wood}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">Stone</span>
                  <span>
                    {building.delivered.stone} / {building.required.stone}
                  </span>
                </div>
                {building.required.ore > 0 && (
                  <div className="flex justify-between">
                    <span className="text-orange-400">Ore</span>
                    <span>
                      {building.delivered.ore} / {building.required.ore}
                    </span>
                  </div>
                )}
                {building.required.coal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Coal</span>
                    <span>
                      {building.delivered.coal} / {building.required.coal}
                    </span>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400">
                Active Workers: <span className="font-mono-tabular text-slate-200">{building.assignedWorkers}</span>
              </div>

              <button
                type="button"
                onClick={() => onCancelBlueprint(building.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/12 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Cancel Blueprint</span>
              </button>
            </div>
          )}

          {/* Tool & Weapon Crafting Station */}
          {building.status === 'COMPLETE' && buildingCraftables.length > 0 && (
            <div className="space-y-3 border-t border-white/8 pt-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <Hammer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Craft Tools & Weapons</span>
                </div>
                <div className="flex items-center gap-1 bg-[#18202b] p-0.5 rounded border border-white/10">
                  {[1, 3, 5].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setCraftQty(q)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono-tabular cursor-pointer ${
                        craftQty === q
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {q}×
                    </button>
                  ))}
                </div>
              </div>

              {buildingOrders.length > 0 && (
                <div className="space-y-2">
                  {buildingOrders.map((order) => {
                    const def = CRAFTED_ITEM_DEFS[order.itemKind];
                    return (
                      <div key={order.id} className="p-2.5 rounded-lg bg-[#18202b] border border-amber-400/30 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <PixelSpriteIcon sprite={getCraftedItemSprite(order.itemKind)} size={20} />
                            <span className="text-xs font-semibold text-slate-100 truncate">
                              {def.name} ({order.completedQty}/{order.targetQty})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onCancelCraftOrder(order.id)}
                            className="text-[11px] text-rose-300 hover:text-rose-200 cursor-pointer shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-orange-400 transition-all"
                            style={{ width: `${order.progress}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-mono-tabular text-slate-400">
                          {order.delivered.wood}/{order.requiredTotal.wood}W ·{' '}
                          {order.delivered.stone}/{order.requiredTotal.stone}S ·{' '}
                          {order.delivered.ore}/{order.requiredTotal.ore}O ·{' '}
                          {order.delivered.coal}/{order.requiredTotal.coal}C
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-2">
                {buildingCraftables.map((item) => {
                  const totalW = item.unitCost.wood * craftQty;
                  const totalS = item.unitCost.stone * craftQty;
                  const totalO = item.unitCost.ore * craftQty;
                  const totalC = item.unitCost.coal * craftQty;
                  return (
                    <div
                      key={item.kind}
                      className="flex items-start justify-between gap-2 pb-2 border-b border-white/6 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <PixelSpriteIcon sprite={getCraftedItemSprite(item.kind)} size={22} />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100 truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-400 leading-snug">
                            {item.bonusSummary}
                          </div>
                          <div className="text-[11px] font-mono-tabular text-amber-300/90 mt-0.5">
                            {totalW}W · {totalS}S{totalO > 0 ? ` · ${totalO}O` : ''}{totalC > 0 ? ` · ${totalC}C` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCommissionCraft(building.id, item.kind, craftQty)}
                        className="px-2.5 py-1 rounded bg-[#18202b] hover:bg-amber-500 hover:text-slate-950 border border-white/15 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Craft {craftQty}×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!human && !building && selectedTile && tileInfo && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-50 leading-tight">
                {tileInfo.title}
              </h2>
              <div className="text-xs text-slate-400 mt-0.5">
                {tileInfo.stage} <span aria-hidden="true">·</span> ({selectedTile.tx}, {selectedTile.ty})
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {tileInfo.summary}
          </p>

          <div className="space-y-2.5 border-t border-white/8 pt-3">
            <div>
              <div className="flex justify-between text-xs font-mono-tabular mb-1">
                <span className="text-slate-400">{tileInfo.yieldLabel}</span>
                <span className="text-slate-100">
                  {selectedTile.tile.resourceAmount} / {tileInfo.maxYield}
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded overflow-hidden">
                <div
                  className={`h-full ${tileInfo.barColor} transition-all`}
                  style={{
                    width: `${Math.min(100, Math.round((selectedTile.tile.resourceAmount / tileInfo.maxYield) * 100))}%`,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-mono-tabular pt-1">
              <span className="text-slate-400">Soil Fertility</span>
              <span className="text-emerald-300">
                {Math.round(selectedTile.tile.fertility * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Local Weather</span>
              <span className="text-sky-300">{WEATHER_LABELS[selectedTileWeather]}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
