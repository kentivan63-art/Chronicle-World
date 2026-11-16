import { soundEngine } from './audio';
import {
  BUILDING_DEFS,
  CRAFTED_ITEM_DEFS,
  NUDGE_DEFS,
  TALENT_DEFS,
  TECH_TREE,
} from './constants';
import {
  BuildingKind,
  BuildingSite,
  ClockworkAutomaton,
  CraftedItemKind,
  CraftOrder,
  DiscoveryAssetId,
  DiscoveryCategory,
  EraId,
  HumanAgent,
  MapCurio,
  NudgeType,
  ResourceType,
  Settlement,
  SettlementBiomeSpecialty,
  TalentId,
  TechId,
  TileType,
  TradeRoute,
  VillagerDiscovery,
  WeatherType,
  WorldState,
} from './types';
import { createBuildingSite, createHuman } from './worldGen';

export interface CommunityBonuses {
  housingCap: number;
  gatherMult: number;
  buildMult: number;
  researchMult: number;
  moveMult: number;
  hasIllumination: boolean;
}

export interface LocalWeatherInfo {
  type: WeatherType;
  intensity: number;
  moveMult: number;
  fertilityTarget: number;
}

export function getWeatherAt(world: WorldState, x: number, y: number): LocalWeatherInfo {
  let chosen: WeatherType = 'CLEAR';
  let bestStrength = 0;

  for (const z of world.weatherZones) {
    const d = Math.hypot(x - z.x, y - z.y);
    if (d < z.radius) {
      const falloff = (1 - d / z.radius) * z.intensity;
      if (falloff > bestStrength) {
        bestStrength = falloff;
        chosen = z.type;
      }
    }
  }

  // High mountain peaks naturally chill rain into snow during cooler seasons
  const tx = Math.max(0, Math.min(world.width - 1, Math.floor(x)));
  const ty = Math.max(0, Math.min(world.height - 1, Math.floor(y)));
  const tile = world.tiles[ty * world.width + tx];
  if (chosen === 'RAIN' && tile && tile.elevation > 0.72 && world.seasonProgress > 0.55) {
    chosen = 'SNOW';
  }

  if (chosen === 'STORM') {
    return { type: 'STORM', intensity: Math.min(1, bestStrength + 0.25), moveMult: 0.6, fertilityTarget: 1.28 };
  }
  if (chosen === 'SNOW') {
    return { type: 'SNOW', intensity: Math.min(1, bestStrength + 0.2), moveMult: 0.72, fertilityTarget: 0.58 };
  }
  if (chosen === 'RAIN') {
    return { type: 'RAIN', intensity: Math.min(1, bestStrength + 0.2), moveMult: 0.85, fertilityTarget: 1.44 };
  }
  return { type: 'CLEAR', intensity: 0, moveMult: 1.0, fertilityTarget: 1.0 };
}

export function isWaterTile(type: TileType): boolean {
  return type === TileType.DEEP_WATER || type === TileType.SHALLOW_WATER;
}

export function isBuildingUnlocked(world: WorldState, kind: BuildingKind): boolean {
  const def = BUILDING_DEFS[kind];
  if (def.unlockedByDefault) return true;
  if (def.unlockedByTech && world.unlockedTechs.includes(def.unlockedByTech)) return true;
  return false;
}

export function canUnlockTech(world: WorldState, techId: TechId): boolean {
  if (world.unlockedTechs.includes(techId)) return false;
  const tech = TECH_TREE.find((t) => t.id === techId);
  if (!tech) return false;
  if (tech.requires && !world.unlockedTechs.includes(tech.requires)) return false;
  return world.stockpile.researchPoints >= tech.cost;
}

export function getCommunityBonuses(world: WorldState): CommunityBonuses {
  let housingCap = 8;
  let gatherMult = 1;
  let buildMult = 1;
  let researchMult = 1;
  let moveMult = 1;

  for (const techId of world.unlockedTechs) {
    if (techId === 'FIRE_MASTERY') researchMult += 0.25;
    if (techId === 'FLINT_TOOLS') gatherMult += 0.3;
    if (techId === 'TIMBER_JOINERY') buildMult += 0.2;
    if (techId === 'ARTISAN_SMITHING') buildMult += 0.15;
    if (techId === 'SMELTING_CRAFT') {
      gatherMult += 0.25;
      buildMult += 0.2;
    }
    if (techId === 'WEAPON_FORGING') moveMult += 0.08;
    if (techId === 'CHRONOMETRY') {
      researchMult += 0.25;
      moveMult += 0.12;
    }
    if (techId === 'GRAND_ILLUMINATION') {
      moveMult += 0.35;
      researchMult += 0.25;
    }
  }

  for (const b of world.buildings) {
    if (b.status !== 'COMPLETE') continue;
    const def = BUILDING_DEFS[b.kind];
    housingCap += def.housingBonus;
    if (b.kind === 'TOTEM_SHRINE') researchMult += 0.15;
    if (b.kind === 'WOODCUTTER') gatherMult += 0.2;
    if (b.kind === 'BLACKSMITH') buildMult += 0.18;
    if (b.kind === 'QUARRY') gatherMult += 0.25;
    if (b.kind === 'WORKSHOP') {
      buildMult += 0.25;
      researchMult += 0.25;
    }
    if (b.kind === 'ARMORY_FORGE') {
      buildMult += 0.15;
      moveMult += 0.08;
    }
    if (b.kind === 'CIVIC_HALL') {
      buildMult += 0.2;
      moveMult += 0.15;
    }
    if (b.kind === 'OBSERVATORY') researchMult += 0.5;
    if (b.kind === 'CHRONOMETER_TOWER') {
      researchMult += 0.35;
      moveMult += 0.18;
    }
  }

  return {
    housingCap,
    gatherMult,
    buildMult,
    researchMult,
    moveMult,
    hasIllumination: world.unlockedTechs.includes('GRAND_ILLUMINATION'),
  };
}

export function canPlaceBlueprint(
  world: WorldState,
  kind: BuildingKind,
  tileX: number,
  tileY: number
): { valid: boolean; reason?: string } {
  if (!isBuildingUnlocked(world, kind)) {
    return { valid: false, reason: 'Technology not unlocked yet' };
  }
  const def = BUILDING_DEFS[kind];
  const size = def.footprint;

  if (tileX < 1 || tileY < 1 || tileX + size > world.width - 1 || tileY + size > world.height - 1) {
    return { valid: false, reason: 'Out of map bounds' };
  }

  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const tile = world.tiles[(tileY + dy) * world.width + (tileX + dx)];
      if (!tile || isWaterTile(tile.type)) {
        return { valid: false, reason: 'Cannot stake blueprint on water' };
      }
      if (tile.type === TileType.FOREST || tile.type === TileType.BERRY_GROVE) {
        return {
          valid: false,
          reason: 'Cannot place buildings on trees or berry bushes',
        };
      }
      const isClearGround =
        (tile.type === TileType.MEADOW || tile.type === TileType.SAND) && tile.resourceAmount === 0;
      const isQuarryGround =
        kind === 'QUARRY' &&
        (tile.type === TileType.STONE || tile.type === TileType.ORE || tile.type === TileType.COAL);
      if (!isClearGround && !isQuarryGround) {
        return {
          valid: false,
          reason: 'Needs empty open space (clear of trees, bushes, or rocks)',
        };
      }
    }
  }

  for (const existing of world.buildings) {
    const overlapX = tileX < existing.tileX + existing.size && tileX + size > existing.tileX;
    const overlapY = tileY < existing.tileY + existing.size && tileY + size > existing.tileY;
    if (overlapX && overlapY) {
      return { valid: false, reason: 'Overlaps existing structure' };
    }
  }

  return { valid: true };
}

export function addChronicle(
  world: WorldState,
  text: string,
  category: 'ERA' | 'TECH' | 'BUILDING' | 'TALENT' | 'COMMUNITY'
): void {
  world.chronicle.unshift({
    id: `c_${world.nextIdCounter++}`,
    year: world.year,
    text,
    category,
  });
  if (world.chronicle.length > 30) {
    world.chronicle.length = 30;
  }
}

export function spawnParticle(
  world: WorldState,
  x: number,
  y: number,
  color: string,
  text?: string,
  vy = -0.7
): void {
  if (world.particles.length > 180) return;
  world.particles.push({
    id: world.nextIdCounter++,
    x,
    y,
    vx: (Math.random() - 0.5) * 0.45,
    vy,
    life: 0,
    maxLife: text ? 1.45 : 0.75,
    color,
    size: text ? 1 : 2,
    text,
  });
}

function findNearestSettlement(world: WorldState, x: number, y: number, maxDist = Infinity): Settlement | null {
  let best: Settlement | null = null;
  let bestDist = maxDist;
  for (const s of world.settlements) {
    const d = Math.hypot(s.centerX - x, s.centerY - y);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

export function placeBlueprint(
  world: WorldState,
  kind: BuildingKind,
  tileX: number,
  tileY: number
): BuildingSite | null {
  const check = canPlaceBlueprint(world, kind, tileX, tileY);
  if (!check.valid) return null;

  const def = BUILDING_DEFS[kind];
  const nearSettlement = findNearestSettlement(
    world,
    tileX + def.footprint / 2,
    tileY + def.footprint / 2,
    24
  );
  const site = createBuildingSite(
    world.nextIdCounter++,
    kind,
    tileX,
    tileY,
    false,
    nearSettlement?.id ?? null
  );
  // Remove any map curios overlapping the staked building
  world.mapCurios = world.mapCurios.filter(
    (c) =>
      c.x < tileX - 1 ||
      c.x > tileX + def.footprint + 1 ||
      c.y < tileY - 1 ||
      c.y > tileY + def.footprint + 1
  );
  world.buildings.push(site);
  soundEngine.playBlueprintPlace();
  addChronicle(world, `Blueprint staked for ${def.name}.`, 'BUILDING');
  spawnParticle(world, tileX + def.footprint / 2, tileY, '#e5a93c', `${def.name} Planned`, -0.5);
  return site;
}

export function cancelBlueprint(world: WorldState, buildingId: string): boolean {
  const idx = world.buildings.findIndex((b) => b.id === buildingId);
  if (idx === -1) return false;
  const b = world.buildings[idx];
  if (b.status === 'COMPLETE') return false;
  // Refund delivered materials to stockpile
  world.stockpile.wood += b.delivered.wood;
  world.stockpile.stone += b.delivered.stone;
  world.stockpile.ore += b.delivered.ore;
  world.stockpile.coal += b.delivered.coal;
  world.buildings.splice(idx, 1);
  return true;
}

export function spawnHumanAt(world: WorldState, x: number, y: number): HumanAgent | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 1 || ty < 1 || tx >= world.width - 1 || ty >= world.height - 1) return null;
  const tile = world.tiles[ty * world.width + tx];
  if (!tile || isWaterTile(tile.type)) return null;
  if (world.humans.length >= 120) return null;

  const nearest = findNearestSettlement(world, x, y);
  const h = createHuman(
    world.nextIdCounter++,
    x,
    y,
    world.seed + world.nextIdCounter * 13,
    undefined,
    nearest?.id ?? null
  );
  world.humans.push(h);
  soundEngine.playSpawnHuman();
  spawnParticle(world, x, y - 0.4, '#34d399', h.name);
  return h;
}

export function awakenHumanTalent(
  world: WorldState,
  humanId: string,
  talent: TalentId,
  quiet = false
): boolean {
  const h = world.humans.find((u) => u.id === humanId);
  if (!h) return false;
  if (h.talents.includes(talent)) return false;

  if (h.talents.length >= 3) {
    h.talents.shift();
  }
  h.talents.push(talent);
  h.curiosity = Math.min(100, h.curiosity + 25);
  const def = TALENT_DEFS[talent];
  h.thoughtText = `Awakened ${def.shortTag}!`;
  h.thoughtTimer = 4;
  h.actionTimer = 0; // re-evaluate task immediately

  spawnParticle(world, h.x, h.y - 0.6, def.color, `+${def.shortTag}`);
  if (!quiet) {
    soundEngine.playTalentBlessing();
    addChronicle(world, `${h.name} awakened innate ${def.name} talent.`, 'TALENT');
  }
  return true;
}

export function bestowTalentBrush(
  world: WorldState,
  wx: number,
  wy: number,
  radius: number,
  talent: TalentId
): number {
  const def = TALENT_DEFS[talent];
  world.nudgeRings.push({
    x: wx,
    y: wy,
    radius: 0.4,
    maxRadius: radius,
    color: def.color,
    life: 0,
    maxLife: 0.55,
  });

  let count = 0;
  for (const h of world.humans) {
    if (Math.hypot(h.x - wx, h.y - wy) <= radius) {
      if (awakenHumanTalent(world, h.id, talent, count > 0)) {
        count++;
      }
    }
  }
  if (count > 0) {
    soundEngine.playTalentBlessing();
  }
  return count;
}

export function nudgeSingleHuman(world: WorldState, humanId: string, nudge: NudgeType): boolean {
  const h = world.humans.find((u) => u.id === humanId);
  if (!h) return false;
  const def = NUDGE_DEFS[nudge];
  h.activeNudge = {
    type: nudge,
    remainingSec: def.durationSec,
  };
  h.actionTimer = 0;
  h.targetTile = null;
  h.targetResourceTile = null;
  if (nudge === 'CURIOSITY_SPARK') {
    h.curiosity = Math.min(100, h.curiosity + 30);
    h.isCuriousExplorer = true;
    h.thoughtText = 'What lies out yonder?';
  } else if (nudge === 'COMMUNITY_RALLY') {
    h.thoughtText = 'Time to build together!';
  } else if (nudge === 'HARVEST_DRIVE') {
    h.thoughtText = 'Stockpiling for all!';
  } else {
    h.thoughtText = 'Resting by the hearth';
  }
  h.thoughtTimer = 3.5;
  spawnParticle(world, h.x, h.y - 0.5, def.color, def.name);
  soundEngine.playNudgePulse();
  return true;
}

export function applyNudgeBrush(
  world: WorldState,
  wx: number,
  wy: number,
  radius: number,
  nudge: NudgeType
): number {
  const def = NUDGE_DEFS[nudge];
  world.nudgeRings.push({
    x: wx,
    y: wy,
    radius: 0.5,
    maxRadius: radius,
    color: def.color,
    life: 0,
    maxLife: 0.65,
  });

  let affected = 0;
  for (const h of world.humans) {
    if (Math.hypot(h.x - wx, h.y - wy) <= radius) {
      h.activeNudge = { type: nudge, remainingSec: def.durationSec };
      h.actionTimer = 0;
      h.targetTile = null;
      h.targetResourceTile = null;
      if (nudge === 'CURIOSITY_SPARK') {
        h.curiosity = Math.min(100, h.curiosity + 25);
        if (affected === 0) {
          h.isCuriousExplorer = true;
          h.thoughtText = 'Time to explore!';
        } else {
          h.thoughtText = 'Sudden inspiration!';
        }
      } else if (nudge === 'COMMUNITY_RALLY') {
        h.thoughtText = 'Let us build!';
      } else if (nudge === 'HARVEST_DRIVE') {
        h.thoughtText = 'Gathering supplies!';
      } else {
        h.thoughtText = 'Taking a breather';
      }
      h.thoughtTimer = 3.5;
      spawnParticle(world, h.x, h.y - 0.5, def.color);
      affected++;
    }
  }
  soundEngine.playNudgePulse();
  return affected;
}

export function unlockTechnology(world: WorldState, techId: TechId): boolean {
  if (!canUnlockTech(world, techId)) return false;
  const tech = TECH_TREE.find((t) => t.id === techId);
  if (!tech) return false;

  world.stockpile.researchPoints = Math.max(0, world.stockpile.researchPoints - tech.cost);
  world.unlockedTechs.push(tech.id);

  if (tech.advancesToEra && tech.advancesToEra > world.currentEra) {
    world.currentEra = tech.advancesToEra as EraId;
    addChronicle(
      world,
      `Settlement advanced to Era ${tech.advancesToEra}: ${tech.name}!`,
      'ERA'
    );
  } else {
    addChronicle(world, `Villagers mastered ${tech.name}.`, 'TECH');
  }

  if (tech.id === 'GRAND_ILLUMINATION') {
    world.clockworkVictoryReached = true;
    addChronicle(world, 'Clockwork Era mastered! Streetlamps illuminate the realm.', 'ERA');
  }

  const anchor = world.buildings.find((b) => b.status === 'COMPLETE') || world.humans[0];
  if (anchor) {
    const ax = 'tileX' in anchor ? anchor.tileX + anchor.size / 2 : anchor.x;
    const ay = 'tileY' in anchor ? anchor.tileY : anchor.y;
    spawnParticle(world, ax, ay - 0.5, '#38bdf8', `Discovered: ${tech.name}`, -0.6);
    triggerVillageCelebration(world, ax, ay, `Celebrating ${tech.name}!`, 0.7);
  }

  soundEngine.playTechUnlock();
  return true;
}

const SHELTER_CAPACITY: Partial<Record<BuildingKind, number>> = {
  REED_HUT: 3,
  TIMBER_LODGE: 4,
  FORAGER_CAMP: 3,
  CIVIC_HALL: 6,
  WORKSHOP: 3,
  OBSERVATORY: 2,
  GRANARY: 2,
  BLACKSMITH: 2,
  ARMORY_FORGE: 2,
};

function getHumanSlotNumber(id: string): number {
  const num = parseInt(id.replace(/\D+/g, ''), 10);
  return Number.isFinite(num) && num > 0 ? num : 1;
}

function getHumanSlotAngle(id: string): number {
  return (getHumanSlotNumber(id) * 2.39996323) % (Math.PI * 2);
}

function isTileInsideAnyBuilding(world: WorldState, tx: number, ty: number): boolean {
  for (const b of world.buildings) {
    if (tx >= b.tileX && tx < b.tileX + b.size && ty >= b.tileY && ty < b.tileY + b.size) {
      return true;
    }
  }
  return false;
}

function isNearAnyBuilding(world: WorldState, tx: number, ty: number, margin = 1): boolean {
  for (const b of world.buildings) {
    if (
      tx >= b.tileX - margin &&
      tx < b.tileX + b.size + margin &&
      ty >= b.tileY - margin &&
      ty < b.tileY + b.size + margin
    ) {
      return true;
    }
  }
  return false;
}

function isWalkableOpenTile(world: WorldState, tx: number, ty: number): boolean {
  if (tx < 1 || ty < 1 || tx >= world.width - 1 || ty >= world.height - 1) return false;
  const tile = world.tiles[ty * world.width + tx];
  if (!tile || isWaterTile(tile.type)) return false;
  return !isTileInsideAnyBuilding(world, tx, ty);
}

// Dynamically find an unoccupied walkable tile around a target (home, resource, hearth, or plaza)
// so villagers never gather or stack inside a single grid cell.
function findOpenTileAround(
  world: WorldState,
  centerX: number,
  centerY: number,
  minRadius: number,
  maxRadius: number,
  occupiedTiles: Set<string>,
  humanId: string,
  preferClearGround = true
): { x: number; y: number } {
  const slotNum = getHumanSlotNumber(humanId);
  const prefAngle = getHumanSlotAngle(humanId);

  const search = (allowOccupied: boolean, searchMaxR: number): { x: number; y: number } | null => {
    const cx = Math.floor(centerX);
    const cy = Math.floor(centerY);
    const rCeil = Math.ceil(searchMaxR);
    const minX = Math.max(1, cx - rCeil);
    const maxX = Math.min(world.width - 2, cx + rCeil);
    const minY = Math.max(1, cy - rCeil);
    const maxY = Math.min(world.height - 2, cy + rCeil);

    let bestScore = Infinity;
    let bestTx = -1;
    let bestTy = -1;

    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!isWalkableOpenTile(world, tx, ty)) continue;
        const d = Math.hypot(tx + 0.5 - centerX, ty + 0.5 - centerY);
        if (d < minRadius || d > searchMaxR) continue;

        const key = `${tx},${ty}`;
        const isTaken = occupiedTiles.has(key);
        if (!allowOccupied && isTaken) continue;

        const tile = world.tiles[ty * world.width + tx];
        const isOpenGround =
          tile.type === TileType.MEADOW ||
          tile.type === TileType.SAND ||
          tile.type === TileType.FARMLAND;
        const terrainPenalty = preferClearGround && !isOpenGround ? 2.6 : 0;
        const angle = Math.atan2(ty + 0.5 - centerY, tx + 0.5 - centerX);
        const angleDiff = Math.abs(Math.atan2(Math.sin(angle - prefAngle), Math.cos(angle - prefAngle)));
        const deterministicJitter = ((tx * 17 + ty * 31 + slotNum * 11) % 13) * 0.14;
        const score =
          d * 1.15 +
          terrainPenalty +
          angleDiff * 0.9 +
          deterministicJitter +
          (isTaken ? 20 : 0);

        if (score < bestScore) {
          bestScore = score;
          bestTx = tx;
          bestTy = ty;
        }
      }
    }

    if (bestTx < 0) return null;
    occupiedTiles.add(`${bestTx},${bestTy}`);

    const jx = 0.28 + (((bestTx * 7 + slotNum * 13) % 11) / 10) * 0.44;
    const jy = 0.28 + (((bestTy * 11 + slotNum * 7) % 11) / 10) * 0.44;
    return { x: bestTx + jx, y: bestTy + jy };
  };

  return (
    search(false, maxRadius) ||
    search(false, maxRadius + 2) ||
    search(true, maxRadius + 2) || {
      x: Math.max(1.5, Math.min(world.width - 2.5, centerX)),
      y: Math.max(1.5, Math.min(world.height - 2.5, centerY)),
    }
  );
}

function findResourceAndOpenSpot(
  world: WorldState,
  x: number,
  y: number,
  types: TileType[],
  maxRadius: number,
  humanId: string,
  claimedResourceTiles: Set<string>,
  occupiedTiles: Set<string>
): { spot: { x: number; y: number }; resourceTile: { x: number; y: number } } | null {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  let bestScore = Infinity;
  let bestTileX = -1;
  let bestTileY = -1;

  const minX = Math.max(1, sx - maxRadius);
  const maxX = Math.min(world.width - 2, sx + maxRadius);
  const minY = Math.max(1, sy - maxRadius);
  const maxY = Math.min(world.height - 2, sy + maxRadius);
  const slotNum = getHumanSlotNumber(humanId);

  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const tile = world.tiles[ty * world.width + tx];
      if (!types.includes(tile.type)) continue;
      if (tile.type !== TileType.FARMLAND && tile.resourceAmount <= 0) continue;

      const distSq = (tx + 0.5 - x) ** 2 + (ty + 0.5 - y) ** 2;
      const key = `${tx},${ty}`;
      const crowdPenalty = claimedResourceTiles.has(key) ? 18 : 0;
      const personalBias = ((tx * 13 + ty * 7 + slotNum * 5) % 9) * 0.4;
      const score = distSq + crowdPenalty + personalBias;
      if (score < bestScore) {
        bestScore = score;
        bestTileX = tx;
        bestTileY = ty;
      }
    }
  }

  if (bestTileX < 0) return null;
  claimedResourceTiles.add(`${bestTileX},${bestTileY}`);

  // Stand on an open unoccupied tile surrounding the resource rather than stacking on the resource grid
  const openSpot = findOpenTileAround(
    world,
    bestTileX + 0.5,
    bestTileY + 0.5,
    0.85,
    2.1,
    occupiedTiles,
    humanId,
    true
  );

  return {
    spot: openSpot,
    resourceTile: { x: bestTileX, y: bestTileY },
  };
}

function findIncompleteBuilding(world: WorldState, x: number, y: number): BuildingSite | null {
  let best: BuildingSite | null = null;
  let bestScore = Infinity;
  for (const b of world.buildings) {
    if (b.status === 'COMPLETE') continue;
    const cx = b.tileX + b.size / 2;
    const cy = b.tileY + b.size / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d < bestScore) {
      bestScore = d;
      best = b;
    }
  }
  return best;
}

function findCompletedBuilding(
  world: WorldState,
  x: number,
  y: number,
  kinds: BuildingKind[]
): BuildingSite | null {
  let best: BuildingSite | null = null;
  let bestDist = Infinity;
  for (const b of world.buildings) {
    if (b.status !== 'COMPLETE' || !kinds.includes(b.kind)) continue;
    const d = Math.hypot(b.tileX + b.size / 2 - x, b.tileY + b.size / 2 - y);
    if (d < bestDist) {
      bestDist = d;
      best = b;
    }
  }
  return best;
}

function findAvailableShelter(
  world: WorldState,
  x: number,
  y: number,
  shelterClaims: Map<string, number>,
  preferredId: string | null = null
): BuildingSite | null {
  if (preferredId) {
    const home = world.buildings.find((b) => b.id === preferredId && b.status === 'COMPLETE');
    const cap = home ? SHELTER_CAPACITY[home.kind] ?? 0 : 0;
    if (home && cap > 0 && (shelterClaims.get(home.id) ?? 0) < cap + 1) {
      return home;
    }
  }

  let best: BuildingSite | null = null;
  let bestScore = Infinity;
  for (const b of world.buildings) {
    if (b.status !== 'COMPLETE') continue;
    const cap = SHELTER_CAPACITY[b.kind] ?? 0;
    if (cap <= 0) continue;
    const used = shelterClaims.get(b.id) ?? 0;
    if (used >= cap) continue;
    const d = Math.hypot(b.tileX + b.size / 2 - x, b.tileY + b.size / 2 - y);
    const score = d + used * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

function ensureHumanHome(world: WorldState, h: HumanAgent): BuildingSite | null {
  if (h.homeBuildingId) {
    const existing = world.buildings.find((b) => b.id === h.homeBuildingId && b.status === 'COMPLETE');
    if (existing) return existing;
    h.homeBuildingId = null;
  }

  const homes = world.buildings.filter(
    (b) => b.status === 'COMPLETE' && (SHELTER_CAPACITY[b.kind] ?? 0) > 0
  );
  if (homes.length > 0) {
    const homeCounts = new Map<string, number>();
    for (const u of world.humans) {
      if (u.homeBuildingId) homeCounts.set(u.homeBuildingId, (homeCounts.get(u.homeBuildingId) ?? 0) + 1);
    }
    let bestHome = homes[0];
    let bestScore = Infinity;
    for (const home of homes) {
      const cap = SHELTER_CAPACITY[home.kind] ?? 2;
      const residents = homeCounts.get(home.id) ?? 0;
      const dist = Math.hypot(home.tileX + home.size / 2 - h.x, home.tileY + home.size / 2 - h.y);
      const settlementMatchBonus =
        h.settlementId && home.settlementId === h.settlementId ? -8 : 0;
      const score = residents * 6 - cap * 1.5 + dist * 0.25 + settlementMatchBonus;
      if (score < bestScore) {
        bestScore = score;
        bestHome = home;
      }
    }
    h.homeBuildingId = bestHome.id;
    return bestHome;
  }

  return findCompletedBuilding(world, h.x, h.y, ['CAMPFIRE', 'WELL']);
}

// ============================================================================
// CELEBRATIONS & CURIOSITY DISCOVERIES (WITH PIXEL ASSETS)
// ============================================================================
interface DiscoveryTemplate {
  title: string;
  description: string;
  category: DiscoveryCategory;
  assetId: DiscoveryAssetId;
  reward: (world: WorldState, x: number, y: number) => string;
}

const BIOME_DISCOVERIES: Record<
  'FOREST' | 'ROCKY' | 'SHORE' | 'MEADOW' | 'COAL' | 'STORM' | 'SNOW',
  DiscoveryTemplate[]
> = {
  FOREST: [
    {
      title: 'Resinous Cedar Sap',
      description: 'Harvested aromatic amber pine resin suitable for sealing timber and torches.',
      category: 'BOTANICAL',
      assetId: 'CEDAR_SAP',
      reward: (w) => { w.stockpile.wood += 6; w.stockpile.researchPoints += 5; return '+6 Wood · +5 RP'; },
    },
    {
      title: 'Carved Woodland Totem',
      description: 'Uncovered weathered ancestor carvings beneath an ancient oak root.',
      category: 'RELIC',
      assetId: 'WOOD_TOTEM',
      reward: (w) => { w.stockpile.researchPoints += 9; return '+9 RP'; },
    },
    {
      title: 'Medicinal Bark Herb',
      description: 'Identified fever-easing willow bark growing in shaded forest clearings.',
      category: 'BOTANICAL',
      assetId: 'BARK_HERB',
      reward: (w) => { w.stockpile.food += 5; w.stockpile.researchPoints += 6; return '+5 Food · +6 RP'; },
    },
    {
      title: 'Wild Flax Fibers',
      description: 'Found tough wild plant stalks ideal for weaving sturdy rope and thatch.',
      category: 'CRAFT',
      assetId: 'FLAX_FIBER',
      reward: (w) => { w.stockpile.wood += 5; w.stockpile.researchPoints += 6; return '+5 Wood · +6 RP'; },
    },
    {
      title: 'Hollow Owl Sanctuary',
      description: 'Mapped quiet canopy trails where woodland songbirds and owls nest.',
      category: 'NATURAL',
      assetId: 'OWL_SANCTUARY',
      reward: (w) => { w.stockpile.researchPoints += 8; return '+8 RP'; },
    },
  ],
  ROCKY: [
    {
      title: 'Obsidian Flake Vein',
      description: 'Located a razor-sharp volcanic glass seam for superior cutting edges.',
      category: 'MINERAL',
      assetId: 'OBSIDIAN_VEIN',
      reward: (w) => { w.stockpile.stone += 7; w.stockpile.researchPoints += 6; return '+7 Stone · +6 RP'; },
    },
    {
      title: 'Fossilized Ammonite',
      description: 'Prized an ancient spiral shell impression out of weathered limestone.',
      category: 'RELIC',
      assetId: 'AMMONITE_FOSSIL',
      reward: (w) => { w.stockpile.researchPoints += 10; return '+10 RP'; },
    },
    {
      title: 'Glittering Copper Seam',
      description: 'Traced green-tinted mineral streaks indicating workable metal ore.',
      category: 'MINERAL',
      assetId: 'COPPER_SEAM',
      reward: (w) => { w.stockpile.ore += 6; w.stockpile.researchPoints += 6; return '+6 Ore · +6 RP'; },
    },
    {
      title: 'Magnetic Lodestone',
      description: 'Discovered a naturally magnetized stone fragment that points steady north.',
      category: 'CRAFT',
      assetId: 'LODESTONE',
      reward: (w) => { w.stockpile.ore += 4; w.stockpile.researchPoints += 8; return '+4 Ore · +8 RP'; },
    },
    {
      title: 'Quartz Crystal Geode',
      description: 'Cracked open a hollow highland boulder lined with clear prism crystals.',
      category: 'NATURAL',
      assetId: 'QUARTZ_GEODE',
      reward: (w) => { w.stockpile.stone += 5; w.stockpile.researchPoints += 8; return '+5 Stone · +8 RP'; },
    },
  ],
  COAL: [
    {
      title: 'Dense Anthracite Nodule',
      description: 'Uncovered pure black coal nodules that burn hotter for metal smithing.',
      category: 'MINERAL',
      assetId: 'COAL_NODULE',
      reward: (w) => { w.stockpile.coal += 8; w.stockpile.researchPoints += 7; return '+8 Coal · +7 RP'; },
    },
  ],
  STORM: [
    {
      title: 'Lightning Fulgurite',
      description: 'Collected glassy sand fused by a storm lightning strike during the squall.',
      category: 'NATURAL',
      assetId: 'STORM_FULGURITE',
      reward: (w) => { w.stockpile.ore += 4; w.stockpile.researchPoints += 11; return '+4 Ore · +11 RP'; },
    },
  ],
  SNOW: [
    {
      title: 'Glacial Frost Amber',
      description: 'Extracted preserved golden resin encased inside windswept winter frost.',
      category: 'RELIC',
      assetId: 'FROST_AMBER',
      reward: (w) => { w.stockpile.coal += 4; w.stockpile.researchPoints += 10; return '+4 Coal · +10 RP'; },
    },
  ],
  SHORE: [
    {
      title: 'Tidal Salt Crust',
      description: 'Found sun-evaporated sea salt crystals useful for preserving village food.',
      category: 'NATURAL',
      assetId: 'SEA_SALT',
      reward: (w) => { w.stockpile.food += 7; w.stockpile.researchPoints += 5; return '+7 Food · +5 RP'; },
    },
    {
      title: 'Smooth Grinding Cobbles',
      description: 'Collected wave-polished basalt stones perfect for milling grain and sharpening.',
      category: 'CRAFT',
      assetId: 'GRIND_COBBLE',
      reward: (w) => { w.stockpile.stone += 6; w.stockpile.researchPoints += 5; return '+6 Stone · +5 RP'; },
    },
    {
      title: 'Mother-of-Pearl Bed',
      description: 'Uncovered iridescent shells washed into a sheltered shallow cove.',
      category: 'RELIC',
      assetId: 'PEARL_SHELL',
      reward: (w) => { w.stockpile.researchPoints += 9; return '+9 RP'; },
    },
    {
      title: 'Sun-Bleached Driftwood',
      description: 'Salvaged seasoned sea-cured logs along the high-tide mark.',
      category: 'NATURAL',
      assetId: 'DRIFTWOOD',
      reward: (w) => { w.stockpile.wood += 6; w.stockpile.researchPoints += 4; return '+6 Wood · +4 RP'; },
    },
  ],
  MEADOW: [
    {
      title: 'Wild Berry Thicket',
      description: 'Charted a sunny grove bursting with sweet, transplantable berry shrubs.',
      category: 'BOTANICAL',
      assetId: 'BERRY_THICKET',
      reward: (w, rx, ry) => {
        const tx = Math.max(1, Math.min(w.width - 2, Math.floor(rx)));
        const ty = Math.max(1, Math.min(w.height - 2, Math.floor(ry)));
        const idx = ty * w.width + tx;
        const tile = w.tiles[idx];
        if (tile && tile.type === TileType.MEADOW && !isNearAnyBuilding(w, tx, ty, 1)) {
          tile.type = TileType.BERRY_GROVE;
          tile.resourceAmount = 18;
          w.dirtyTiles.push(idx);
        }
        w.stockpile.food += 6;
        w.stockpile.researchPoints += 5;
        return 'New Berry Grove · +6 Food · +5 RP';
      },
    },
    {
      title: 'Pottery Clay Pocket',
      description: 'Uncovered smooth river-deposited clay suitable for hearth bowls and kilns.',
      category: 'CRAFT',
      assetId: 'CLAY_POT',
      reward: (w) => { w.stockpile.stone += 5; w.stockpile.researchPoints += 7; return '+5 Stone · +7 RP'; },
    },
    {
      title: 'Sweet Root Tubers',
      description: 'Dug up hardy wild tubers thriving beneath tall golden meadow grass.',
      category: 'BOTANICAL',
      assetId: 'SWEET_TUBER',
      reward: (w) => { w.stockpile.food += 8; w.stockpile.researchPoints += 4; return '+8 Food · +4 RP'; },
    },
    {
      title: 'Ancient Standing Stone',
      description: 'Found a moss-grown waymarker aligned with the midday solstice shadow.',
      category: 'RELIC',
      assetId: 'STANDING_STONE',
      reward: (w) => { w.stockpile.researchPoints += 10; return '+10 RP'; },
    },
    {
      title: 'Golden Wildflower Honey',
      description: 'Tracked meadow bees to a sun-warmed hollow brimming with wild honeycomb.',
      category: 'NATURAL',
      assetId: 'WILD_HONEY',
      reward: (w) => { w.stockpile.food += 7; w.stockpile.researchPoints += 6; return '+7 Food · +6 RP'; },
    },
  ],
};

function isTileClearForCurio(world: WorldState, tx: number, ty: number): boolean {
  if (tx < 3 || ty < 3 || tx >= world.width - 3 || ty >= world.height - 3) return false;
  const tile = world.tiles[ty * world.width + tx];
  if (!tile) return false;
  if (tile.type !== TileType.MEADOW && tile.type !== TileType.SAND) return false;
  if (tile.resourceAmount > 0) return false;
  if (isNearAnyBuilding(world, tx, ty, 2)) return false;

  // Never overlap existing map curios
  for (const c of world.mapCurios) {
    if (Math.hypot(c.x - (tx + 0.5), c.y - (ty + 0.5)) < 5.5) return false;
  }
  return true;
}

function stepMapCurios(world: WorldState, dt: number): void {
  // Remove expired curios or any whose tile ceased to be clear open ground
  for (let i = world.mapCurios.length - 1; i >= 0; i--) {
    const c = world.mapCurios[i];
    c.remainingSec -= dt;
    const tx = Math.floor(c.x);
    const ty = Math.floor(c.y);
    const tile = world.tiles[ty * world.width + tx];
    const invalidTile =
      !tile ||
      (tile.type !== TileType.MEADOW && tile.type !== TileType.SAND) ||
      isNearAnyBuilding(world, tx, ty, 1);
    if (c.remainingSec <= 0 || invalidTile) {
      world.mapCurios.splice(i, 1);
    }
  }

  // Keep 3..5 non-overlapping wild curios scattered across unexplored open spots
  if (world.mapCurios.length < 4 && Math.random() < dt * 0.45) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const tx = 4 + Math.floor(Math.random() * (world.width - 8));
      const ty = 4 + Math.floor(Math.random() * (world.height - 8));
      if (!isTileClearForCurio(world, tx, ty)) continue;

      // Sample adjacent 3x3 biome to pick a contextual discovery asset sprite
      let nearForest = 0;
      let nearRock = 0;
      let nearCoal = 0;
      let nearShore = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nt = world.tiles[(ty + dy) * world.width + (tx + dx)];
          if (!nt) continue;
          if (nt.type === TileType.FOREST) nearForest++;
          else if (nt.type === TileType.STONE || nt.type === TileType.ORE) nearRock++;
          else if (nt.type === TileType.COAL) nearCoal++;
          else if (nt.type === TileType.SAND || nt.type === TileType.SHALLOW_WATER) nearShore++;
        }
      }

      let biomeHint: MapCurio['biomeHint'] = 'MEADOW';
      if (nearCoal >= 2) biomeHint = 'COAL';
      else if (nearRock >= 3) biomeHint = 'ROCKY';
      else if (nearForest >= 3) biomeHint = 'FOREST';
      else if (nearShore >= 3) biomeHint = 'SHORE';

      const pool = BIOME_DISCOVERIES[biomeHint];
      const pick = pool[Math.floor(Math.random() * pool.length)];

      world.mapCurios.push({
        id: `curio_${world.nextIdCounter++}`,
        x: tx + 0.5,
        y: ty + 0.5,
        assetId: pick.assetId,
        biomeHint,
        remainingSec: 120 + Math.random() * 60,
      });
      break;
    }
  }
}

function completeExplorerDiscovery(world: WorldState, h: HumanAgent): void {
  const tx = Math.max(1, Math.min(world.width - 2, Math.floor(h.x)));
  const ty = Math.max(1, Math.min(world.height - 2, Math.floor(h.y)));
  const tile = world.tiles[ty * world.width + tx];
  const localWeather = getWeatherAt(world, h.x, h.y);

  // Check if explorer reached an active MapCurio — remove it from map upon discovery!
  const curioIdx = world.mapCurios.findIndex((c) => Math.hypot(c.x - h.x, c.y - h.y) <= 2.6);
  const collectedCurio = curioIdx !== -1 ? world.mapCurios.splice(curioIdx, 1)[0] : null;

  let template: DiscoveryTemplate | undefined;
  if (collectedCurio) {
    const curioPool = BIOME_DISCOVERIES[collectedCurio.biomeHint];
    template = curioPool.find((item) => item.assetId === collectedCurio.assetId);
  }

  if (!template) {
    let pool: DiscoveryTemplate[];
    if (localWeather.type === 'STORM' && Math.random() < 0.45) {
      pool = BIOME_DISCOVERIES.STORM;
    } else if (localWeather.type === 'SNOW' && Math.random() < 0.45) {
      pool = BIOME_DISCOVERIES.SNOW;
    } else if (tile?.type === TileType.COAL) {
      pool = BIOME_DISCOVERIES.COAL;
    } else if (tile?.type === TileType.FOREST) {
      pool = BIOME_DISCOVERIES.FOREST;
    } else if (tile?.type === TileType.STONE || tile?.type === TileType.ORE) {
      pool = BIOME_DISCOVERIES.ROCKY;
    } else if (tile?.type === TileType.SAND) {
      pool = BIOME_DISCOVERIES.SHORE;
    } else {
      pool = BIOME_DISCOVERIES.MEADOW;
    }

    const existingTitles = new Set(h.discoveries.map((d) => d.title));
    const freshPool = pool.filter((item) => !existingTitles.has(item.title));
    const candidates = freshPool.length > 0 ? freshPool : pool;
    template = candidates[Math.floor(Math.random() * candidates.length)];
  }

  const rewardSummary = template.reward(world, h.x, h.y);
  const discovery: VillagerDiscovery = {
    id: `d_${world.nextIdCounter++}`,
    humanId: h.id,
    humanName: h.name,
    title: template.title,
    description: template.description,
    category: template.category,
    assetId: template.assetId,
    year: world.year,
    x: Number(h.x.toFixed(1)),
    y: Number(h.y.toFixed(1)),
    rewardSummary,
  };

  h.discoveries.unshift(discovery);
  world.discoveries.unshift(discovery);
  if (world.discoveries.length > 120) world.discoveries.length = 120;

  h.isCuriousExplorer = false;
  h.curiosity = Math.min(100, h.curiosity + 12);
  h.researchContributed += 5;
  h.thoughtText = `Found ${discovery.title}!`;
  h.thoughtTimer = 4.2;

  spawnParticle(world, h.x, h.y - 0.8, '#fde047', `Found: ${discovery.title}!`, -0.65);
  addChronicle(
    world,
    `${h.name} explored afar and discovered ${discovery.title} (${rewardSummary}).`,
    'COMMUNITY'
  );
  soundEngine.playDiscoveryChime();
}

export function triggerVillageCelebration(
  world: WorldState,
  centerX: number,
  centerY: number,
  reasonText: string,
  share = 0.6,
  occupiedTilesInput?: Set<string>
): void {
  if (isNightTime(world.timeOfDay) || world.humans.length === 0) return;

  const occupiedTiles = occupiedTilesInput ?? new Set<string>();
  const celebrateLines = [
    'Cheers to the village!',
    'Festival dance!',
    'Joyful gathering!',
    'Song & celebration!',
    'Proud of our home!',
  ];

  let joined = 0;
  for (const h of world.humans) {
    if (h.state === 'SLEEPING' || h.isCuriousExplorer || h.carrying) continue;
    if (h.hunger > 78 || h.energy < 18) continue;
    if (joined > 0 && Math.random() > share) continue;

    const spot = findOpenTileAround(world, centerX, centerY, 1.1, 4.4, occupiedTiles, h.id, true);
    h.state = 'CELEBRATE';
    h.targetTile = spot;
    h.targetResourceTile = null;
    h.targetBuildingId = null;
    h.actionTimer = 5.2 + Math.random() * 2.5;
    h.energy = Math.min(100, h.energy + 10);
    h.thoughtText = celebrateLines[(joined + getHumanSlotNumber(h.id)) % celebrateLines.length];
    h.thoughtTimer = 3.8;
    joined++;
  }

  if (joined > 0) {
    spawnParticle(world, centerX, centerY - 0.7, '#fde047', reasonText, -0.5);
    soundEngine.playCelebrationFanfare();
  }
}

function launchCuriousExplorer(
  world: WorldState,
  occupiedTiles: Set<string>,
  preferredHuman?: HumanAgent
): boolean {
  const candidates = preferredHuman
    ? [preferredHuman]
    : world.humans.filter(
        (h) =>
          h.state !== 'SLEEPING' &&
          h.state !== 'CELEBRATE' &&
          !h.carrying &&
          !h.isCuriousExplorer &&
          h.hunger < 75 &&
          h.energy > 30
      );

  if (candidates.length === 0) return false;

  // Pick a random villager (weighted modestly by curiosity + Scholar trait so anyone can become curious)
  let chosen = candidates[0];
  if (candidates.length > 1) {
    let totalWeight = 0;
    const weights = candidates.map((c) => {
      const w = 15 + c.curiosity * 0.65 + (c.talents.includes('SCHOLAR') ? 22 : 0);
      totalWeight += w;
      return w;
    });
    let roll = Math.random() * totalWeight;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = candidates[i];
        break;
      }
    }
  }

  // Prefer heading toward an active wild MapCurio if within reasonable exploration distance
  let bestSpot: { x: number; y: number } | null = null;
  const nearbyCurio = world.mapCurios.find((c) => {
    const d = Math.hypot(c.x - chosen.x, c.y - chosen.y);
    return d >= 4 && d <= 44;
  });
  if (nearbyCurio) {
    bestSpot = { x: nearbyCurio.x, y: nearbyCurio.y };
  }

  if (!bestSpot) {
    let bestInterest = -Infinity;
    for (let attempt = 0; attempt < 18; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 16;
      const candX = Math.max(2, Math.min(world.width - 3, Math.floor(chosen.x + Math.cos(angle) * dist)));
      const candY = Math.max(2, Math.min(world.height - 3, Math.floor(chosen.y + Math.sin(angle) * dist)));
      if (!isWalkableOpenTile(world, candX, candY)) continue;
      if (isNearAnyBuilding(world, candX, candY, 2)) continue;

      const key = `${candX},${candY}`;
      if (occupiedTiles.has(key)) continue;

      const tile = world.tiles[candY * world.width + candX];
      let score = dist * 0.4 + Math.random() * 5;
      if (tile.type === TileType.FOREST || tile.type === TileType.STONE || tile.type === TileType.ORE) {
        score += 6;
      } else if (tile.type === TileType.SAND || tile.type === TileType.BERRY_GROVE) {
        score += 4.5;
      }
      // Prefer spots not already recently discovered
      const alreadyExplored = world.discoveries.some((d) => Math.hypot(d.x - candX, d.y - candY) < 5);
      if (alreadyExplored) score -= 8;

      if (score > bestInterest) {
        bestInterest = score;
        bestSpot = { x: candX + 0.5, y: candY + 0.5 };
      }
    }
  }

  if (!bestSpot) {
    bestSpot = findOpenTileAround(world, chosen.x, chosen.y, 5, 14, occupiedTiles, chosen.id, false);
  } else {
    occupiedTiles.add(`${Math.floor(bestSpot.x)},${Math.floor(bestSpot.y)}`);
  }

  chosen.isCuriousExplorer = true;
  chosen.curiosity = Math.min(100, chosen.curiosity + 18);
  chosen.state = 'EXPLORE';
  chosen.targetTile = bestSpot;
  chosen.targetResourceTile = null;
  chosen.targetBuildingId = null;
  chosen.actionTimer = 18;
  chosen.thoughtText = 'Curious! Exploring yonder...';
  chosen.thoughtTimer = 4;
  spawnParticle(world, chosen.x, chosen.y - 0.5, '#38bdf8', 'Curious Expedition!', -0.45);
  return true;
}

function getMissingMaterial(site: {
  required: { wood: number; stone: number; ore: number; coal: number };
  delivered: { wood: number; stone: number; ore: number; coal: number };
}): 'wood' | 'stone' | 'ore' | 'coal' | null {
  if (site.delivered.wood < site.required.wood) return 'wood';
  if (site.delivered.stone < site.required.stone) return 'stone';
  if (site.delivered.ore < site.required.ore) return 'ore';
  if (site.delivered.coal < site.required.coal) return 'coal';
  return null;
}

function getDeliveredRatio(site: {
  required: { wood: number; stone: number; ore: number; coal: number };
  delivered: { wood: number; stone: number; ore: number; coal: number };
}): number {
  const totalReq = site.required.wood + site.required.stone + site.required.ore + site.required.coal;
  if (totalReq <= 0) return 1;
  const totalDel = site.delivered.wood + site.delivered.stone + site.delivered.ore + site.delivered.coal;
  return Math.min(1, totalDel / totalReq);
}

function moveToward(
  world: WorldState,
  entity: { x: number; y: number; facing: 1 | -1; vx?: number; vy?: number },
  tx: number,
  ty: number,
  speed: number,
  dt: number
): boolean {
  const dx = tx - entity.x;
  const dy = ty - entity.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.16) {
    entity.vx = 0;
    entity.vy = 0;
    return true;
  }

  const prevX = entity.x;
  const prevY = entity.y;
  const step = Math.min(dist, speed * dt);
  const nx = entity.x + (dx / dist) * step;
  const ny = entity.y + (dy / dist) * step;
  if (Math.abs(dx) > 0.02) entity.facing = dx >= 0 ? 1 : -1;

  const tileIdx = Math.floor(ny) * world.width + Math.floor(nx);
  const nextTile = world.tiles[tileIdx];

  if (nextTile && !isWaterTile(nextTile.type)) {
    entity.x = Math.max(1, Math.min(world.width - 2, nx));
    entity.y = Math.max(1, Math.min(world.height - 2, ny));
  } else {
    // Try sliding horizontally or vertically around coastline
    const tryX = world.tiles[Math.floor(entity.y) * world.width + Math.floor(nx)];
    const tryY = world.tiles[Math.floor(ny) * world.width + Math.floor(entity.x)];
    if (tryX && !isWaterTile(tryX.type)) {
      entity.x = nx;
    } else if (tryY && !isWaterTile(tryY.type)) {
      entity.y = ny;
    } else {
      // Nudge away from water toward center
      entity.x += (world.width / 2 - entity.x > 0 ? 1 : -1) * step * 0.6;
      entity.y += (world.height / 2 - entity.y > 0 ? 1 : -1) * step * 0.6;
    }
  }

  const invDt = dt > 0.0001 ? 1 / dt : 0;
  entity.vx = (entity.x - prevX) * invDt;
  entity.vy = (entity.y - prevY) * invDt;
  return false;
}

function inferSettlementFromLocation(
  world: WorldState,
  cx: number,
  cy: number
): { specialty: SettlementBiomeSpecialty; exportRes: ResourceType; importRes: ResourceType } {
  let stoneCount = 0;
  let forestCount = 0;
  let shoreCount = 0;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      const tx = Math.floor(cx) + dx;
      const ty = Math.floor(cy) + dy;
      if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) continue;
      const t = world.tiles[ty * world.width + tx];
      if (!t) continue;
      if (t.type === TileType.STONE || t.type === TileType.ORE || t.type === TileType.COAL) stoneCount++;
      else if (t.type === TileType.FOREST) forestCount++;
      else if (t.type === TileType.SAND || t.type === TileType.SHALLOW_WATER) shoreCount++;
    }
  }
  if (stoneCount >= forestCount && stoneCount >= shoreCount && stoneCount >= 6) {
    return { specialty: 'HIGHLAND', exportRes: 'ore', importRes: 'food' };
  }
  if (shoreCount >= forestCount && shoreCount >= 6) {
    return { specialty: 'COASTAL', exportRes: 'food', importRes: 'stone' };
  }
  if (forestCount >= 6) {
    return { specialty: 'WOODLAND', exportRes: 'wood', importRes: 'ore' };
  }
  return { specialty: 'HEARTLAND', exportRes: 'food', importRes: 'coal' };
}

function completeBuilding(world: WorldState, b: BuildingSite): void {
  b.status = 'COMPLETE';
  b.buildProgress = 100;
  const def = BUILDING_DEFS[b.kind];
  soundEngine.playBuildingComplete();
  addChronicle(world, `${def.name} completed by the community!`, 'BUILDING');
  spawnParticle(world, b.tileX + b.size / 2, b.tileY, '#34d399', `${def.name} Built!`, -0.55);

  // Founding a distant Campfire establishes a new regional Settlement
  if (b.kind === 'CAMPFIRE' && !findNearestSettlement(world, b.tileX + 1, b.tileY + 1, 24)) {
    const cx = b.tileX + b.size / 2;
    const cy = b.tileY + b.size / 2;
    const inferred = inferSettlementFromLocation(world, cx, cy);
    const outPostNames = [
      'Timberfall Hold',
      'Amberridge Camp',
      'Mistbrook Haven',
      'Ironford Outpost',
      'Sunvale Crossing',
    ];
    const newId = `s_${world.nextIdCounter++}`;
    const newName = outPostNames[world.settlements.length % outPostNames.length];
    b.settlementId = newId;
    world.settlements.push({
      id: newId,
      name: newName,
      biomeSpecialty: inferred.specialty,
      centerX: cx,
      centerY: cy,
      hubBuildingId: b.id,
      primaryExport: inferred.exportRes,
      primaryImport: inferred.importRes,
    });
    if (world.settlements.length >= 2) {
      const mainS = world.settlements[0];
      world.tradeRoutes.push({
        id: `tr_${world.nextIdCounter++}`,
        fromSettlementId: mainS.id,
        toSettlementId: newId,
        exportResource: mainS.primaryExport,
        importResource: inferred.exportRes === mainS.primaryExport ? mainS.primaryImport : inferred.exportRes,
        active: true,
        completedTrips: 0,
      });
    }
    addChronicle(world, `Founded new settlement: ${newName} (${inferred.specialty})!`, 'COMMUNITY');
  }

  if (
    b.kind === 'TOTEM_SHRINE' ||
    b.kind === 'TIMBER_LODGE' ||
    b.kind === 'BLACKSMITH' ||
    b.kind === 'GRANARY' ||
    b.kind === 'WORKSHOP' ||
    b.kind === 'ARMORY_FORGE' ||
    b.kind === 'CIVIC_HALL' ||
    b.kind === 'OBSERVATORY' ||
    b.kind === 'WINDMILL' ||
    b.kind === 'CHRONOMETER_TOWER' ||
    b.kind === 'CLOCKWORK_FOUNDRY'
  ) {
    triggerVillageCelebration(
      world,
      b.tileX + b.size / 2,
      b.tileY + b.size / 2,
      `${def.name} Celebration!`,
      0.55
    );
  }

  // Terrain transformation perks
  if (b.kind === 'GRANARY') {
    for (let dy = -2; dy <= b.size + 1; dy++) {
      for (let dx = -2; dx <= b.size + 1; dx++) {
        const tx = b.tileX + dx;
        const ty = b.tileY + dy;
        if (dx >= 0 && dx < b.size && dy >= 0 && dy < b.size) continue;
        if (isNearAnyBuilding(world, tx, ty, 0)) continue;
        const idx = ty * world.width + tx;
        const tile = world.tiles[idx];
        if (tile && tile.type === TileType.MEADOW && Math.random() < 0.65) {
          tile.type = TileType.FARMLAND;
          tile.resourceAmount = 50;
          tile.fertility = Math.min(1.55, tile.fertility + 0.2);
          world.dirtyTiles.push(idx);
        }
      }
    }
  } else if (b.kind === 'WELL') {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const tx = b.tileX + dx;
        const ty = b.tileY + dy;
        const idx = ty * world.width + tx;
        const tile = world.tiles[idx];
        if (!tile) continue;
        const dist = Math.hypot(dx, dy);
        if (dist <= 3.2 && tile.type === TileType.SAND && !isNearAnyBuilding(world, tx, ty, 0)) {
          tile.type = TileType.MEADOW;
          world.dirtyTiles.push(idx);
        }
        if (dist <= 4.2) {
          tile.fertility = Math.min(1.55, tile.fertility + 0.28);
        }
      }
    }
  } else if (b.kind === 'CLOCKWORK_FOUNDRY') {
    for (let i = 0; i < 2; i++) {
      const auto: ClockworkAutomaton = {
        id: `a_${world.nextIdCounter++}`,
        x: b.tileX + b.size / 2 + (i === 0 ? -0.8 : 0.8),
        y: b.tileY + b.size + 0.5,
        facing: 1,
        gearPhase: i * 1.5,
        carrying: null,
        targetBuildingId: null,
        state: 'PATROL',
        homeBuildingId: b.id,
      };
      world.automatons.push(auto);
    }
    addChronicle(world, 'Two Clockwork Helpers rolled out of the Foundry.', 'COMMUNITY');
  }
}

export function createCraftOrder(
  world: WorldState,
  buildingId: string,
  itemKind: CraftedItemKind,
  targetQty: number
): CraftOrder | null {
  const building = world.buildings.find((b) => b.id === buildingId && b.status === 'COMPLETE');
  if (!building) return null;
  const def = CRAFTED_ITEM_DEFS[itemKind];
  if (!def.craftedAt.includes(building.kind)) return null;
  const qty = Math.max(1, Math.min(10, Math.floor(targetQty)));
  const order: CraftOrder = {
    id: `ord_${world.nextIdCounter++}`,
    itemKind,
    targetQty: qty,
    completedQty: 0,
    buildingId,
    requiredTotal: {
      wood: def.unitCost.wood * qty,
      stone: def.unitCost.stone * qty,
      ore: def.unitCost.ore * qty,
      coal: def.unitCost.coal * qty,
    },
    delivered: { wood: 0, stone: 0, ore: 0, coal: 0 },
    progress: 0,
  };
  world.craftOrders.push(order);
  addChronicle(
    world,
    `Commissioned ${qty}× ${def.name} at ${BUILDING_DEFS[building.kind].name}.`,
    'COMMUNITY'
  );
  return order;
}

export function cancelCraftOrder(world: WorldState, orderId: string): boolean {
  const idx = world.craftOrders.findIndex((o) => o.id === orderId);
  if (idx === -1) return false;
  const [order] = world.craftOrders.splice(idx, 1);
  const def = CRAFTED_ITEM_DEFS[order.itemKind];
  // Refund unused delivered supplies beyond already completed items
  world.stockpile.wood += Math.max(0, order.delivered.wood - order.completedQty * def.unitCost.wood);
  world.stockpile.stone += Math.max(0, order.delivered.stone - order.completedQty * def.unitCost.stone);
  world.stockpile.ore += Math.max(0, order.delivered.ore - order.completedQty * def.unitCost.ore);
  world.stockpile.coal += Math.max(0, order.delivered.coal - order.completedQty * def.unitCost.coal);
  return true;
}

function getCraftOrderMissingForNextUnit(order: CraftOrder): 'wood' | 'stone' | 'ore' | 'coal' | null {
  const def = CRAFTED_ITEM_DEFS[order.itemKind];
  const nextUnits = Math.min(order.targetQty, order.completedQty + 1);
  if (order.delivered.wood < def.unitCost.wood * nextUnits) return 'wood';
  if (order.delivered.stone < def.unitCost.stone * nextUnits) return 'stone';
  if (order.delivered.ore < def.unitCost.ore * nextUnits) return 'ore';
  if (order.delivered.coal < def.unitCost.coal * nextUnits) return 'coal';
  return null;
}

function equipCraftedItemToVillage(
  world: WorldState,
  crafter: HumanAgent,
  itemKind: CraftedItemKind
): string {
  const def = CRAFTED_ITEM_DEFS[itemKind];
  if (def.role === 'WEAPON') {
    const recipient =
      (!crafter.equippedWeapon ? crafter : null) ??
      world.humans.find((h) => !h.equippedWeapon) ??
      world.humans.find((h) => h.equippedWeapon && CRAFTED_ITEM_DEFS[h.equippedWeapon].era < def.era);
    if (recipient) {
      recipient.equippedWeapon = itemKind;
      recipient.thoughtText = `Equipped ${def.name}!`;
      recipient.thoughtTimer = 3.5;
      return `${recipient.name} armed with ${def.name}`;
    }
  } else {
    const recipient =
      (!crafter.equippedTool ? crafter : null) ??
      world.humans.find((h) => !h.equippedTool) ??
      world.humans.find((h) => h.equippedTool && CRAFTED_ITEM_DEFS[h.equippedTool].era < def.era);
    if (recipient) {
      recipient.equippedTool = itemKind;
      recipient.thoughtText = `Using ${def.name}!`;
      recipient.thoughtTimer = 3.5;
      return `${recipient.name} equipped ${def.name}`;
    }
  }
  world.armory[itemKind] = (world.armory[itemKind] ?? 0) + 1;
  return `${def.name} stored in Armory`;
}

export type DayPhase = 'Dawn' | 'Day' | 'Dusk' | 'Night';

export function getDayPhase(timeOfDay: number): DayPhase {
  if (timeOfDay < 0.14) return 'Dawn';
  if (timeOfDay < 0.62) return 'Day';
  if (timeOfDay < 0.74) return 'Dusk';
  return 'Night';
}

export function isNightTime(timeOfDay: number): boolean {
  return timeOfDay >= 0.72 && timeOfDay < 0.97;
}

function considerAutonomousVillageBuilding(world: WorldState): void {
  if (world.humans.length === 0) return;
  const hasIncomplete = world.buildings.some((b) => b.status !== 'COMPLETE');
  if (hasIncomplete) return;

  const anchor = world.buildings.find((b) => b.status === 'COMPLETE');
  if (!anchor) return;

  let totalBeds = 0;
  for (const b of world.buildings) {
    totalBeds += SHELTER_CAPACITY[b.kind] ?? 0;
  }

  const hasKind = (k: BuildingKind) => world.buildings.some((b) => b.kind === k);
  const countKind = (k: BuildingKind) => world.buildings.filter((b) => b.kind === k).length;
  const canAffordStarter = (k: BuildingKind) => {
    const c = BUILDING_DEFS[k].cost;
    return (
      world.stockpile.wood >= Math.floor(c.wood * 0.45) &&
      world.stockpile.stone >= Math.floor(c.stone * 0.4)
    );
  };

  let targetKind: BuildingKind | null = null;

  // 1. Ensure enough shelter beds
  if (totalBeds < world.humans.length) {
    if (isBuildingUnlocked(world, 'TIMBER_LODGE') && world.stockpile.wood >= 15) {
      targetKind = 'TIMBER_LODGE';
    } else if (world.stockpile.wood >= 5) {
      targetKind = 'REED_HUT';
    }
  }

  // 2. Era-specific autonomous civic, forge & production buildings (non-house architecture!)
  if (!targetKind) {
    const candidates: BuildingKind[] = [];
    if (world.currentEra >= 4) {
      if (isBuildingUnlocked(world, 'CLOCKWORK_FOUNDRY') && !hasKind('CLOCKWORK_FOUNDRY')) {
        candidates.push('CLOCKWORK_FOUNDRY');
      }
      if (isBuildingUnlocked(world, 'CHRONOMETER_TOWER') && !hasKind('CHRONOMETER_TOWER')) {
        candidates.push('CHRONOMETER_TOWER');
      }
      if (isBuildingUnlocked(world, 'WINDMILL') && countKind('WINDMILL') < 2) {
        candidates.push('WINDMILL');
      }
    }
    if (world.currentEra >= 3) {
      if (isBuildingUnlocked(world, 'ARMORY_FORGE') && !hasKind('ARMORY_FORGE')) {
        candidates.push('ARMORY_FORGE');
      }
      if (isBuildingUnlocked(world, 'WORKSHOP') && !hasKind('WORKSHOP')) {
        candidates.push('WORKSHOP');
      }
      if (isBuildingUnlocked(world, 'OBSERVATORY') && !hasKind('OBSERVATORY')) {
        candidates.push('OBSERVATORY');
      }
      if (isBuildingUnlocked(world, 'CIVIC_HALL') && !hasKind('CIVIC_HALL')) {
        candidates.push('CIVIC_HALL');
      }
    }
    if (world.currentEra >= 2) {
      if (isBuildingUnlocked(world, 'BLACKSMITH') && !hasKind('BLACKSMITH')) {
        candidates.push('BLACKSMITH');
      }
      if (isBuildingUnlocked(world, 'GRANARY') && !hasKind('GRANARY')) {
        candidates.push('GRANARY');
      }
      if (isBuildingUnlocked(world, 'QUARRY') && !hasKind('QUARRY')) {
        candidates.push('QUARRY');
      }
    }
    // Era 1 milestones & foundations
    if (!hasKind('TOTEM_SHRINE')) candidates.push('TOTEM_SHRINE');
    if (!hasKind('FORAGER_CAMP')) candidates.push('FORAGER_CAMP');
    if (isBuildingUnlocked(world, 'WOODCUTTER') && !hasKind('WOODCUTTER')) {
      candidates.push('WOODCUTTER');
    }
    if (isBuildingUnlocked(world, 'WELL') && !hasKind('WELL')) {
      candidates.push('WELL');
    }

    for (const cand of candidates) {
      if (isBuildingUnlocked(world, cand) && canAffordStarter(cand)) {
        targetKind = cand;
        break;
      }
    }
  }

  if (!targetKind) return;

  const cx = anchor.tileX;
  const cy = anchor.tileY;
  const footprint = BUILDING_DEFS[targetKind].footprint;
  const maxAttempts = targetKind === 'QUARRY' ? 42 : 30;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const angle = (world.buildings.length * 1.9 + attempt * 0.65) % (Math.PI * 2);
    const radius = 3.2 + Math.floor(attempt / 5) * 1.75;
    const tx = Math.round(cx + Math.cos(angle) * radius);
    const ty = Math.round(cy + Math.sin(angle) * radius);

    const check = canPlaceBlueprint(world, targetKind, tx, ty);
    if (!check.valid) continue;

    const tooClose = world.buildings.some(
      (b) =>
        tx < b.tileX + b.size + 1 &&
        tx + footprint + 1 > b.tileX &&
        ty < b.tileY + b.size + 1 &&
        ty + footprint + 1 > b.tileY
    );
    if (tooClose) continue;

    const planner =
      world.humans.find((h) => h.talents.includes('ARCHITECT')) ?? world.humans[0];
    const nearSettlement = findNearestSettlement(
      world,
      tx + footprint / 2,
      ty + footprint / 2,
      24
    );
    const site = createBuildingSite(
      world.nextIdCounter++,
      targetKind,
      tx,
      ty,
      false,
      nearSettlement?.id ?? anchor.settlementId ?? null
    );
    world.buildings.push(site);
    if (planner) {
      planner.thoughtText = `Planning ${BUILDING_DEFS[targetKind].name}!`;
      planner.thoughtTimer = 3.6;
    }
    spawnParticle(
      world,
      tx + footprint / 2,
      ty,
      '#e5a93c',
      `Planned: ${BUILDING_DEFS[targetKind].name}`,
      -0.5
    );
    addChronicle(
      world,
      `${planner ? planner.name : 'Villagers'} staked an Era ${BUILDING_DEFS[targetKind].era} ${BUILDING_DEFS[targetKind].name}.`,
      'COMMUNITY'
    );
    return;
  }
}

function considerAutonomousCrafting(world: WorldState): void {
  if (world.craftOrders.length >= 2 || world.humans.length === 0) return;

  const completedStations = world.buildings.filter((b) => b.status === 'COMPLETE');
  if (completedStations.length === 0) return;

  const unarmedCount = world.humans.filter((h) => !h.equippedWeapon).length;
  const untooledCount = world.humans.filter((h) => !h.equippedTool).length;

  // Pick era-matched crafted items whose crafting building is built
  const itemPriority: CraftedItemKind[] = [
    'CLOCKWORK_HALBERD',
    'PRECISION_WRENCH',
    'BRASS_ASTROLABE',
    'BRONZE_SWORD',
    'ARTISAN_HAMMER',
    'BRONZE_SHIELD',
    'COPPER_PICKAXE',
    'TIMBER_BOW',
    'STONE_AXE',
    'FLINT_SPEAR',
    'WOVEN_BASKET',
  ];

  for (const kind of itemPriority) {
    const def = CRAFTED_ITEM_DEFS[kind];
    if (def.era > world.currentEra) continue;
    if (def.role === 'WEAPON' && unarmedCount === 0 && world.armory[kind] >= 2) continue;
    if (def.role !== 'WEAPON' && untooledCount === 0 && world.armory[kind] >= 2) continue;

    const station = completedStations.find((b) => def.craftedAt.includes(b.kind));
    if (!station) continue;

    // Scale desired production batch (1..3) by settlement need & stockpiles
    const needed = def.role === 'WEAPON' ? Math.max(1, unarmedCount) : Math.max(1, untooledCount);
    const maxAffordable = Math.max(
      1,
      Math.min(
        3,
        needed,
        def.unitCost.ore > 0 ? Math.floor((world.stockpile.ore + 8) / def.unitCost.ore) : 3,
        def.unitCost.coal > 0 ? Math.floor((world.stockpile.coal + 6) / def.unitCost.coal) : 3
      )
    );

    const hasStarter =
      world.stockpile.wood >= Math.floor(def.unitCost.wood * 0.5) &&
      world.stockpile.stone >= Math.floor(def.unitCost.stone * 0.4);
    if (!hasStarter) continue;

    createCraftOrder(world, station.id, kind, maxAffordable);
    return;
  }
}

function stepWeather(world: WorldState, dt: number): void {
  world.seasonProgress = (world.seasonProgress + dt * 0.0022) % 1;
  world.stormFlash = Math.max(0, world.stormFlash - dt * 2.5);

  const types: ('RAIN' | 'SNOW' | 'STORM')[] =
    world.seasonProgress > 0.6
      ? ['SNOW', 'RAIN', 'STORM', 'SNOW']
      : ['RAIN', 'STORM', 'RAIN', 'SNOW'];

  while (world.weatherZones.length < 3) {
    const wType = types[Math.floor(Math.random() * types.length)];
    const radius = 14 + Math.random() * 11;
    world.weatherZones.push({
      id: `wz_${world.nextIdCounter++}`,
      x: Math.random() * world.width,
      y: Math.random() * world.height,
      radius,
      vx: 0.45 + Math.random() * 0.65,
      vy: (Math.random() - 0.5) * 0.4,
      type: wType,
      intensity: 0.65 + Math.random() * 0.35,
    });
  }

  for (const z of world.weatherZones) {
    z.x += z.vx * dt;
    z.y += z.vy * dt;

    if (
      z.x - z.radius > world.width + 6 ||
      z.x + z.radius < -6 ||
      z.y - z.radius > world.height + 6 ||
      z.y + z.radius < -6
    ) {
      z.type = types[Math.floor(Math.random() * types.length)];
      z.radius = 14 + Math.random() * 11;
      z.x = -z.radius + 2;
      z.y = 8 + Math.random() * (world.height - 16);
      z.vx = 0.42 + Math.random() * 0.7;
      z.vy = (Math.random() - 0.5) * 0.38;
      z.intensity = 0.65 + Math.random() * 0.35;
    }

    if (z.type === 'STORM' && world.stormFlash <= 0.02 && Math.random() < dt * 0.22) {
      world.stormFlash = 0.9;
    }
  }

  // Smoothly update tile fertility across regions based on local weather & nearby irrigation wells
  const wells = world.buildings.filter((b) => b.status === 'COMPLETE' && (b.kind === 'WELL' || b.kind === 'GRANARY'));
  const totalTiles = world.tiles.length;
  const sampleBatch = Math.min(200, totalTiles);
  const offset = Math.floor(world.tick * 73) % totalTiles;

  for (let i = 0; i < sampleBatch; i++) {
    const idx = (offset + i) % totalTiles;
    const tile = world.tiles[idx];
    if (!tile || isWaterTile(tile.type)) continue;

    const tx = idx % world.width;
    const ty = Math.floor(idx / world.width);
    const w = getWeatherAt(world, tx + 0.5, ty + 0.5);
    let targetFert = w.fertilityTarget;
    for (const well of wells) {
      if (Math.hypot(tx - well.tileX, ty - well.tileY) <= 5.5) {
        targetFert = Math.min(1.55, targetFert + 0.22);
        break;
      }
    }
    tile.fertility = Math.max(0.45, Math.min(1.55, tile.fertility + (targetFert - tile.fertility) * 0.16));
  }
}

function stepSeasonalResourceRespawn(world: WorldState): void {
  const halfYearNow = Math.floor(world.tick / 180);
  if (halfYearNow <= world.lastRespawnHalfYear) return;
  world.lastRespawnHalfYear = halfYearNow;

  // Spawn 3 organic resource clusters in DIFFERENT open locations away from buildings
  const pool: Array<{ type: TileType; amount: number; count: number }> = [
    { type: TileType.FOREST, amount: 22, count: 3 },
    { type: TileType.BERRY_GROVE, amount: 18, count: 3 },
    { type: TileType.STONE, amount: 34, count: 2 },
    { type: TileType.ORE, amount: 30, count: 2 },
    { type: TileType.COAL, amount: 30, count: 2 },
  ];

  let spawnedClusters = 0;
  for (let c = 0; c < 3; c++) {
    const spec = pool[(halfYearNow + c * 2 + Math.floor(Math.random() * 2)) % pool.length];

    let seedX = -1;
    let seedY = -1;
    for (let attempt = 0; attempt < 28; attempt++) {
      const rx = 5 + Math.floor(Math.random() * (world.width - 10));
      const ry = 5 + Math.floor(Math.random() * (world.height - 10));
      const t = world.tiles[ry * world.width + rx];
      if (!t || t.type !== TileType.MEADOW) continue;
      if (isNearAnyBuilding(world, rx, ry, 5)) continue;
      // Prefer rocky types on higher elevation, groves/trees on fertile plains
      if (
        (spec.type === TileType.STONE || spec.type === TileType.ORE || spec.type === TileType.COAL) &&
        t.elevation < 0.44
      ) {
        continue;
      }
      seedX = rx;
      seedY = ry;
      break;
    }

    if (seedX < 0) continue;
    for (let k = 0; k < spec.count; k++) {
      const ox = k === 0 ? 0 : Math.floor(Math.random() * 3) - 1;
      const oy = k === 0 ? 0 : Math.floor(Math.random() * 3) - 1;
      const tx = Math.max(2, Math.min(world.width - 3, seedX + ox));
      const ty = Math.max(2, Math.min(world.height - 3, seedY + oy));
      if (isNearAnyBuilding(world, tx, ty, 3)) continue;
      const idx = ty * world.width + tx;
      const tile = world.tiles[idx];
      if (!tile || (tile.type !== TileType.MEADOW && tile.type !== TileType.SAND)) continue;
      tile.type = spec.type;
      tile.resourceAmount = spec.amount;
      world.dirtyTiles.push(idx);
      // Clear any curio on that tile
      world.mapCurios = world.mapCurios.filter((mc) => Math.floor(mc.x) !== tx || Math.floor(mc.y) !== ty);
    }
    spawnedClusters++;
  }

  if (spawnedClusters > 0 && halfYearNow % 2 === 0) {
    addChronicle(
      world,
      `Seasonal renewal: new forests, groves, and mineral seams emerged in the wilds.`,
      'COMMUNITY'
    );
  }
}

export function stepSimulation(world: WorldState, rawDt: number, speed: number): void {
  if (speed <= 0) return;
  const dt = Math.min(0.05, rawDt) * speed;
  const bonuses = getCommunityBonuses(world);

  // Comfortable pacing: 1 year = 90s at 1x speed, 1 full day/night cycle ~3.7 min at 1x speed
  world.tick += dt * 4;
  world.timeOfDay = (world.timeOfDay + dt * 0.0045) % 1;
  const nightNow = isNightTime(world.timeOfDay);

  stepWeather(world, dt);
  stepMapCurios(world, dt);
  stepSeasonalResourceRespawn(world);

  const nextYear = 1 + Math.floor(world.tick / 360);
  if (nextYear > world.year) {
    world.year = nextYear;
    if (world.humans.length < bonuses.housingCap && world.stockpile.food >= 18) {
      const home =
        world.buildings.find((b) => b.status === 'COMPLETE' && BUILDING_DEFS[b.kind].housingBonus > 0) ||
        world.humans[0];
      if (home) {
        const sx = 'tileX' in home ? home.tileX + 0.5 : home.x;
        const sy = 'tileY' in home ? home.tileY + 1.5 : home.y;
        const nearSettlement = findNearestSettlement(world, sx, sy);
        const newborn = createHuman(
          world.nextIdCounter++,
          sx,
          sy,
          world.seed + world.year * 31,
          undefined,
          nearSettlement?.id ?? null
        );
        world.humans.push(newborn);
        world.stockpile.food = Math.max(0, world.stockpile.food - 8);
        addChronicle(world, `${newborn.name} joined the growing community.`, 'COMMUNITY');
      }
    }
  }

  // Humans autonomously plan houses AND era-specific workshops, smithies, totems & monuments
  if (!nightNow && Math.random() < dt * 0.35) {
    considerAutonomousVillageBuilding(world);
  }
  if (!nightNow && Math.random() < dt * 0.22) {
    considerAutonomousCrafting(world);
  }

  // Ecological regrowth scaled by regional tile fertility (rain nurtures, snow slows)
  if (Math.random() < dt * 0.75) {
    for (let s = 0; s < 5; s++) {
      const idx = Math.floor(Math.random() * world.tiles.length);
      const t = world.tiles[idx];
      if (!t || t.resourceAmount <= 0) continue;
      if (Math.random() > t.fertility * 0.72) continue;
      if (t.type === TileType.BERRY_GROVE && t.resourceAmount < 18) {
        t.resourceAmount += 1;
      } else if (t.type === TileType.FOREST && t.resourceAmount < 22) {
        t.resourceAmount += 1;
      }
    }
  }

  // Passive building effects (Windmill food scaled by local fertility & wind, Civic Hall morale)
  for (const b of world.buildings) {
    if (b.status !== 'COMPLETE') continue;
    b.pulseTimer += dt;
    if (b.kind === 'WINDMILL' && b.pulseTimer >= 3.5) {
      b.pulseTimer = 0;
      const bTile = world.tiles[b.tileY * world.width + b.tileX];
      const fertBonus = bTile ? bTile.fertility : 1;
      const localW = getWeatherAt(world, b.tileX + 1, b.tileY + 1);
      const foodGain = Math.max(1, Math.round(2 * fertBonus * (localW.type === 'STORM' ? 1.35 : 1)));
      world.stockpile.food += foodGain;
      spawnParticle(world, b.tileX + b.size / 2, b.tileY, '#fde047', `+${foodGain} Food`, -0.4);
    }
    if (b.kind === 'CIVIC_HALL' && b.pulseTimer >= 6.0) {
      b.pulseTimer = 0;
      for (const h of world.humans) {
        if (Math.hypot(h.x - (b.tileX + 1.5), h.y - (b.tileY + 1.5)) < 8) {
          h.energy = Math.min(100, h.energy + 6);
          h.curiosity = Math.min(100, h.curiosity + 4);
        }
      }
    }
  }

  // Spread forests/berries into fertile meadows — strictly NEVER onto or bordering any building!
  if (Math.random() < dt * 0.5) {
    const rx = 2 + Math.floor(Math.random() * (world.width - 4));
    const ry = 2 + Math.floor(Math.random() * (world.height - 4));
    const idx = ry * world.width + rx;
    const t = world.tiles[idx];
    if (
      t &&
      t.type === TileType.MEADOW &&
      !isNearAnyBuilding(world, rx, ry, 1) &&
      Math.random() < t.fertility * 0.78
    ) {
      const neighbors = [
        world.tiles[(ry - 1) * world.width + rx],
        world.tiles[(ry + 1) * world.width + rx],
        world.tiles[ry * world.width + (rx - 1)],
        world.tiles[ry * world.width + (rx + 1)],
      ];
      if (neighbors.some((n) => n && n.type === TileType.FOREST)) {
        t.type = TileType.FOREST;
        t.resourceAmount = 20;
        world.dirtyTiles.push(idx);
      } else if (neighbors.some((n) => n && n.type === TileType.BERRY_GROVE)) {
        t.type = TileType.BERRY_GROVE;
        t.resourceAmount = 18;
        world.dirtyTiles.push(idx);
      }
    }
  }

  for (const b of world.buildings) {
    b.assignedWorkers = 0;
    b.occupantsSleeping = 0;
  }

  const claimedResourceTiles = new Set<string>();
  const occupiedTiles = new Set<string>();
  const shelterClaims = new Map<string, number>();

  for (const h of world.humans) {
    if (!h.sleepingInBuildingId) {
      occupiedTiles.add(`${Math.floor(h.x)},${Math.floor(h.y)}`);
    }
    if (h.state === 'SLEEPING' && h.targetBuildingId) {
      shelterClaims.set(h.targetBuildingId, (shelterClaims.get(h.targetBuildingId) ?? 0) + 1);
    } else if ((h.state === 'FORAGE' || h.state === 'CHOP' || h.state === 'MINE') && h.targetResourceTile) {
      claimedResourceTiles.add(`${h.targetResourceTile.x},${h.targetResourceTile.y}`);
    }
    if (h.state !== 'SLEEPING' && h.targetTile) {
      occupiedTiles.add(`${Math.floor(h.targetTile.x)},${Math.floor(h.targetTile.y)}`);
    }
  }

  // Periodic Village Festival / Harvest Celebration during clear/rain daytime
  if (
    !nightNow &&
    world.timeOfDay > 0.24 &&
    world.timeOfDay < 0.56 &&
    world.year >= world.lastFestivalYear + 2 &&
    world.humans.length >= 4 &&
    Math.random() < dt * 0.14
  ) {
    const plaza =
      world.buildings.find(
        (b) =>
          b.status === 'COMPLETE' &&
          (b.kind === 'TOTEM_SHRINE' || b.kind === 'CIVIC_HALL' || b.kind === 'CAMPFIRE')
      ) ?? world.buildings.find((b) => b.status === 'COMPLETE');
    if (plaza) {
      world.lastFestivalYear = world.year;
      const festNames = ['Harvest Festival', 'Solstice Feast', 'Founder’s Gathering', 'Hearth Jubilee'];
      const festTitle = festNames[world.year % festNames.length];
      addChronicle(world, `Villagers gathered around ${BUILDING_DEFS[plaza.kind].name} for the ${festTitle}!`, 'COMMUNITY');
      triggerVillageCelebration(
        world,
        plaza.tileX + plaza.size / 2,
        plaza.tileY + plaza.size / 2,
        festTitle,
        0.72,
        occupiedTiles
      );
    }
  }

  const hasActiveExplorer = world.humans.some((u) => u.isCuriousExplorer || u.state === 'EXPLORE');
  if (!nightNow && !hasActiveExplorer && world.humans.length >= 2 && Math.random() < dt * 0.12) {
    launchCuriousExplorer(world, occupiedTiles);
  }

  const civicLeaders = world.humans.filter((h) => h.talents.includes('CIVIC_LEADER'));
  const activeCraftOrder = world.craftOrders.find((o) =>
    world.buildings.some((b) => b.id === o.buildingId && b.status === 'COMPLETE')
  );

  for (const h of world.humans) {
    h.vx = 0;
    h.vy = 0;

    h.hunger = Math.min(100, h.hunger + dt * 0.75);
    h.energy = Math.max(0, h.energy - dt * (h.state === 'REST' ? -9.5 : 0.65));
    h.thoughtTimer = Math.max(0, h.thoughtTimer - dt);
    h.actionTimer = Math.max(0, h.actionTimer - dt);

    if (h.activeNudge) {
      h.activeNudge.remainingSec -= dt;
      if (h.activeNudge.remainingSec <= 0) {
        h.activeNudge = null;
      }
    }

    if (h.hunger > 65 && world.stockpile.food > 0) {
      world.stockpile.food -= 1;
      h.hunger = Math.max(0, h.hunger - 40);
      h.hp = Math.min(100, h.hp + 10);
      if (h.thoughtTimer <= 0) {
        h.thoughtText = 'Sharing a meal';
        h.thoughtTimer = 2.5;
      }
    }

    let leaderBoost = 1;
    for (const leader of civicLeaders) {
      if (leader.id !== h.id && Math.hypot(leader.x - h.x, leader.y - h.y) < 5) {
        leaderBoost = 1.25;
        break;
      }
    }

    const nudgeType = h.activeNudge?.type;
    const isArchitect = h.talents.includes('ARCHITECT');
    const isScholar = h.talents.includes('SCHOLAR');
    const isForager = h.talents.includes('FORAGER');
    const isMetallurgist = h.talents.includes('METALLURGIST');
    const isClockmaker = h.talents.includes('CLOCKMAKER');

    // Dynamic regional weather impact on villager movement speed
    const localWeather = getWeatherAt(world, h.x, h.y);
    const stormProtection =
      h.equippedWeapon === 'BRONZE_SHIELD' || h.equippedWeapon === 'CLOCKWORK_HALBERD' ? 0.5 : 1;
    const weatherSpeedMult = 1 - (1 - localWeather.moveMult) * stormProtection;
    const weaponSpeedMult = h.equippedWeapon === 'CLOCKWORK_HALBERD' ? 1.18 : 1;

    const moveSpeed =
      (2.15 + (isClockmaker ? 0.35 : 0)) *
      bonuses.moveMult *
      leaderBoost *
      weatherSpeedMult *
      weaponSpeedMult;

    const toolWoodMult = h.equippedTool === 'STONE_AXE' ? 1.25 : 1;
    const toolMineMult =
      h.equippedTool === 'COPPER_PICKAXE'
        ? 1.45
        : h.equippedTool === 'PRECISION_WRENCH'
          ? 1.3
          : 1;
    const toolForageMult =
      h.equippedTool === 'WOVEN_BASKET'
        ? 1.25
        : h.equippedWeapon === 'TIMBER_BOW'
          ? 1.2
          : h.equippedWeapon === 'FLINT_SPEAR'
            ? 1.15
            : 1;
    const toolBuildMult =
      h.equippedTool === 'PRECISION_WRENCH'
        ? 1.6
        : h.equippedTool === 'ARTISAN_HAMMER'
          ? 1.45
          : h.equippedTool === 'STONE_AXE'
            ? 1.15
            : 1;
    const toolResearchMult = h.equippedTool === 'BRASS_ASTROLABE' ? 1.5 : 1;

    const hasWorkNudge =
      nudgeType === 'CURIOSITY_SPARK' ||
      nudgeType === 'COMMUNITY_RALLY' ||
      nudgeType === 'HARVEST_DRIVE';

    const homeBuilding = ensureHumanHome(world, h);

    // Villagers feel weather changes (storms, rain, snow) and shelter inside their respective homes
    const needsWeatherShelter =
      !nightNow &&
      !hasWorkNudge &&
      h.state !== 'TRADE' &&
      (localWeather.type === 'STORM' ||
        ((localWeather.type === 'RAIN' || localWeather.type === 'SNOW') &&
          (h.energy < 74 || h.state === 'IDLE' || h.state === 'REST' || h.state === 'SOCIALIZE')));

    const shouldSeekShelter = (nightNow || needsWeatherShelter) && !hasWorkNudge;

    if (h.state === 'SLEEPING' && !shouldSeekShelter) {
      if (h.sleepingInBuildingId) {
        const wakeSpot = findOpenTileAround(
          world,
          h.x,
          h.y + 0.5,
          0.6,
          2.2,
          occupiedTiles,
          h.id,
          true
        );
        h.x = wakeSpot.x;
        h.y = wakeSpot.y;
      }
      h.state = 'IDLE';
      h.sleepingInBuildingId = null;
      h.targetBuildingId = null;
      h.targetTile = null;
      h.targetResourceTile = null;
      h.actionTimer = 0;
      h.thoughtText = hasWorkNudge
        ? 'Woken by inspiration!'
        : !nightNow
          ? 'Sky cleared — stepping out'
          : 'Morning has arrived';
      h.thoughtTimer = 2.8;
    }

    if (shouldSeekShelter && h.state !== 'SLEEPING') {
      if (h.carrying) {
        world.stockpile[h.carrying.resource] += h.carrying.amount;
        h.carrying = null;
      }
      h.tradeState = null;
      h.isCuriousExplorer = false;
      h.targetResourceTile = null;
      const shelter = findAvailableShelter(world, h.x, h.y, shelterClaims, h.homeBuildingId);
      h.state = 'SLEEPING';
      h.sleepingInBuildingId = null;
      if (shelter) {
        shelterClaims.set(shelter.id, (shelterClaims.get(shelter.id) ?? 0) + 1);
        h.targetBuildingId = shelter.id;
        h.targetTile = {
          x: shelter.tileX + shelter.size / 2,
          y: shelter.tileY + shelter.size * 0.72,
        };
        const weatherReason =
          localWeather.type !== 'CLEAR' ? localWeather.type.toLowerCase() : 'night';
        h.thoughtText = `Sheltering from ${weatherReason} at ${BUILDING_DEFS[shelter.kind].name}`;
      } else {
        h.targetBuildingId = null;
        const campfire = findCompletedBuilding(world, h.x, h.y, ['CAMPFIRE', 'WELL']) ?? homeBuilding;
        if (campfire) {
          h.targetTile = findOpenTileAround(
            world,
            campfire.tileX + campfire.size / 2,
            campfire.tileY + campfire.size / 2,
            campfire.size * 0.55 + 0.4,
            campfire.size * 0.8 + 2.0,
            occupiedTiles,
            h.id,
            true
          );
          h.thoughtText = 'Huddling near hearth';
        } else {
          h.targetTile = findOpenTileAround(world, h.x, h.y, 1.0, 2.8, occupiedTiles, h.id, true);
          h.thoughtText = nightNow ? 'Settling down for night' : 'Waiting out the weather';
        }
      }
      h.thoughtTimer = 3.2;
    }

    if (
      h.state !== 'SLEEPING' &&
      (h.state === 'IDLE' || (h.actionTimer <= 0 && !h.carrying && !h.tradeState))
    ) {
      if (h.state === 'EXPLORE' && h.isCuriousExplorer) {
        h.isCuriousExplorer = false;
      }

      if (h.isCuriousExplorer) {
        launchCuriousExplorer(world, occupiedTiles, h);
      } else {
        const incompleteSite = findIncompleteBuilding(world, h.x, h.y);
        const missingBuildRes = incompleteSite ? getMissingMaterial(incompleteSite) : null;
        const missingCraftRes = activeCraftOrder ? getCraftOrderMissingForNextUnit(activeCraftOrder) : null;
        const urgentMissing = missingBuildRes ?? missingCraftRes;

        const connectedRoute =
          localWeather.type !== 'STORM' && h.energy > 38 && world.settlements.length >= 2
            ? world.tradeRoutes.find((r) => {
                if (!r.active) return false;
                if (h.settlementId && r.fromSettlementId !== h.settlementId && r.toSettlementId !== h.settlementId) {
                  return false;
                }
                const activeOnRoute = world.humans.filter((u) => u.tradeState?.routeId === r.id).length;
                return activeOnRoute < 2;
              })
            : undefined;

        const scoreTrade = connectedRoute
          ? 27 + (isForager || h.talents.includes('CIVIC_LEADER') || isClockmaker ? 16 : 0)
          : 0;
        const scoreRest = h.energy < 22 ? 95 : nudgeType === 'REST_AND_FEAST' ? 90 : 8;
        const scoreSocialize =
          h.energy > 45 && h.hunger < 60 && !incompleteSite ? 24 + (homeBuilding ? 8 : 0) : 10;
        let scoreForage =
          world.stockpile.food < 14
            ? 78
            : nudgeType === 'HARVEST_DRIVE'
              ? 65
              : isForager
                ? 48
                : 19;
        let scoreBuild =
          incompleteSite
            ? 44 +
              (isArchitect ? 45 : 0) +
              (isClockmaker ? 25 : 0) +
              (nudgeType === 'COMMUNITY_RALLY' ? 60 : 0)
            : 0;
        let scoreCraft =
          activeCraftOrder
            ? 42 +
              (isMetallurgist ? 34 : 0) +
              (isClockmaker ? 28 : 0) +
              (nudgeType === 'COMMUNITY_RALLY' ? 40 : 0)
            : 0;
        const scorePatrol =
          h.equippedWeapon && !incompleteSite && !activeCraftOrder && h.energy > 40 ? 28 : 0;
        let scoreResearch =
          23 +
          (isScholar ? 52 : 0) +
          (isClockmaker ? 30 : 0) +
          (h.curiosity > 75 ? 18 : 0) +
          (nudgeType === 'CURIOSITY_SPARK' ? 75 : 0);

        let scoreChop =
          (urgentMissing === 'wood' && world.stockpile.wood < 4 ? 76 : 22) +
          (nudgeType === 'HARVEST_DRIVE' ? 45 : 0) +
          (isForager ? 18 : 0);
        let scoreMine =
          (urgentMissing === 'stone' || urgentMissing === 'ore' || urgentMissing === 'coal' ? 78 : 20) +
          (isMetallurgist ? 45 : 0) +
          (nudgeType === 'HARVEST_DRIVE' ? 40 : 0);

        scoreForage += Math.random() * 14;
        scoreBuild += Math.random() * 14;
        scoreCraft += Math.random() * 14;
        scoreResearch += Math.random() * 14;
        scoreChop += Math.random() * 14;
        scoreMine += Math.random() * 14;
        const jitterSocial = scoreSocialize + Math.random() * 14;
        const jitterPatrol = scorePatrol + Math.random() * 12;
        const jitterTrade = scoreTrade > 0 ? scoreTrade + Math.random() * 14 : 0;

        const best = Math.max(
          scoreRest,
          jitterSocial,
          scoreForage,
          scoreBuild,
          scoreCraft,
          jitterPatrol,
          jitterTrade,
          scoreResearch,
          scoreChop,
          scoreMine
        );

        h.targetResourceTile = null;

        if (best === scoreRest) {
          h.state = 'REST';
          const hearth =
            homeBuilding ??
            findCompletedBuilding(world, h.x, h.y, ['CAMPFIRE', 'TIMBER_LODGE', 'FORAGER_CAMP', 'WELL']);
          if (hearth) {
            h.targetTile = findOpenTileAround(
              world,
              hearth.tileX + hearth.size / 2,
              hearth.tileY + hearth.size / 2,
              hearth.size * 0.6 + 0.4,
              hearth.size * 0.9 + 2.2,
              occupiedTiles,
              h.id,
              true
            );
          } else {
            h.targetTile = findOpenTileAround(world, h.x, h.y, 1.2, 3.8, occupiedTiles, h.id, true);
          }
          h.actionTimer = 4.5;
          h.thoughtText = localWeather.type === 'STORM' || localWeather.type === 'SNOW'
            ? 'Warming up out of weather'
            : homeBuilding
              ? 'Relaxing near home'
              : 'Resting & warming up';
          h.thoughtTimer = 3;
        } else if (best === jitterSocial) {
          h.state = 'SOCIALIZE';
          const hub =
            Math.random() < 0.5 && homeBuilding
              ? homeBuilding
              : findCompletedBuilding(world, h.x, h.y, ['TOTEM_SHRINE', 'CAMPFIRE', 'WELL', 'CIVIC_HALL']) ??
                homeBuilding;
          if (hub) {
            h.targetTile = findOpenTileAround(
              world,
              hub.tileX + hub.size / 2,
              hub.tileY + hub.size / 2,
              hub.size * 0.65 + 0.4,
              hub.size + 2.6,
              occupiedTiles,
              h.id,
              true
            );
          } else {
            h.targetTile = findOpenTileAround(world, h.x, h.y, 1.5, 4.0, occupiedTiles, h.id, true);
          }
          h.actionTimer = 5.0;
          const activities = [
            'Chatting with neighbors',
            'Tending the home yard',
            'Humming a folk tune',
            'Trading craft tips',
            localWeather.type === 'RAIN' ? 'Listening to the rain' : 'Watching the sky',
          ];
          h.thoughtText = activities[Math.floor(Math.random() * activities.length)];
          h.thoughtTimer = 3.2;
        } else if (best === jitterTrade && connectedRoute) {
          const isFromHome = !h.settlementId || connectedRoute.fromSettlementId === h.settlementId;
          const destId = isFromHome ? connectedRoute.toSettlementId : connectedRoute.fromSettlementId;
          const destSettlement = world.settlements.find((s) => s.id === destId);
          if (destSettlement) {
            const exportRes = isFromHome
              ? connectedRoute.exportResource
              : connectedRoute.importResource;
            h.state = 'TRADE';
            h.tradeState = { routeId: connectedRoute.id, phase: 'TO_DEST' };
            h.carrying = { resource: exportRes, amount: 4 };
            h.targetBuildingId = destSettlement.hubBuildingId || null;
            h.targetTile = findOpenTileAround(
              world,
              destSettlement.centerX,
              destSettlement.centerY,
              1.1,
              3.2,
              occupiedTiles,
              h.id,
              true
            );
            h.actionTimer = 32;
            h.thoughtText = `Caravan to ${destSettlement.name} (${exportRes})`;
            h.thoughtTimer = 4;
          } else {
            h.state = 'IDLE';
          }
        } else if (best === jitterPatrol && h.equippedWeapon) {
          h.state = 'PATROL';
          const post =
            findCompletedBuilding(world, h.x, h.y, [
              'ARMORY_FORGE',
              'CHRONOMETER_TOWER',
              'CIVIC_HALL',
              'TOTEM_SHRINE',
              'CAMPFIRE',
            ]) ?? homeBuilding;
          if (post) {
            h.targetTile = findOpenTileAround(
              world,
              post.tileX + post.size / 2,
              post.tileY + post.size / 2,
              post.size + 1.8,
              post.size + 4.8,
              occupiedTiles,
              h.id,
              true
            );
          } else {
            h.targetTile = findOpenTileAround(world, h.x, h.y, 2.5, 6.0, occupiedTiles, h.id, true);
          }
          h.actionTimer = 5.5;
          h.thoughtText = `Patrolling (${CRAFTED_ITEM_DEFS[h.equippedWeapon].name})`;
          h.thoughtTimer = 3.2;
        } else if (best === scoreCraft && activeCraftOrder) {
          const forge = world.buildings.find((b) => b.id === activeCraftOrder.buildingId && b.status === 'COMPLETE');
          const cDef = CRAFTED_ITEM_DEFS[activeCraftOrder.itemKind];
          const neededNext = getCraftOrderMissingForNextUnit(activeCraftOrder);
          const neededAny = getMissingMaterial({
            required: activeCraftOrder.requiredTotal,
            delivered: activeCraftOrder.delivered,
          });
          const resToHaul = neededNext ?? neededAny;

          if (forge && resToHaul && world.stockpile[resToHaul] > 0) {
            const take = Math.min(
              4,
              activeCraftOrder.requiredTotal[resToHaul] - activeCraftOrder.delivered[resToHaul],
              world.stockpile[resToHaul]
            );
            if (take > 0) {
              world.stockpile[resToHaul] -= take;
              h.carrying = { resource: resToHaul, amount: take };
            }
            h.state = 'CRAFT';
            h.targetBuildingId = forge.id;
            h.targetTile = findOpenTileAround(
              world,
              forge.tileX + forge.size / 2,
              forge.tileY + forge.size / 2,
              forge.size * 0.55 + 0.25,
              forge.size * 0.9 + 1.5,
              occupiedTiles,
              h.id,
              true
            );
            h.actionTimer = 9;
            h.thoughtText = `Hauling ${resToHaul} for ${cDef.name}`;
            h.thoughtTimer = 3;
          } else if (forge && !neededNext) {
            h.state = 'CRAFT';
            h.targetBuildingId = forge.id;
            h.targetTile = findOpenTileAround(
              world,
              forge.tileX + forge.size / 2,
              forge.tileY + forge.size / 2,
              forge.size * 0.55 + 0.25,
              forge.size * 0.9 + 1.5,
              occupiedTiles,
              h.id,
              true
            );
            h.actionTimer = 7;
            h.thoughtText = `Forging ${cDef.name}`;
            h.thoughtTimer = 3;
          } else if (resToHaul === 'wood') {
            h.state = 'CHOP';
            const pick = findResourceAndOpenSpot(
              world,
              h.x,
              h.y,
              [TileType.FOREST],
              28,
              h.id,
              claimedResourceTiles,
              occupiedTiles
            );
            h.targetTile = pick?.spot ?? null;
            h.targetResourceTile = pick?.resourceTile ?? null;
            h.actionTimer = 7;
            h.thoughtText = `Chopping wood for ${cDef.name}`;
            h.thoughtTimer = 3;
          } else {
            const desiredType =
              resToHaul === 'coal'
                ? [TileType.COAL, TileType.ORE, TileType.STONE]
                : resToHaul === 'ore'
                  ? [TileType.ORE, TileType.COAL, TileType.STONE]
                  : [TileType.STONE, TileType.ORE, TileType.COAL];
            h.state = 'MINE';
            const pick = findResourceAndOpenSpot(
              world,
              h.x,
              h.y,
              desiredType,
              30,
              h.id,
              claimedResourceTiles,
              occupiedTiles
            );
            h.targetTile = pick?.spot ?? null;
            h.targetResourceTile = pick?.resourceTile ?? null;
            h.actionTimer = 7;
            h.thoughtText = `Mining ${resToHaul ?? 'ore & coal'} for gear`;
            h.thoughtTimer = 3;
          }
        } else if (best === scoreBuild && incompleteSite) {
          const missing = getMissingMaterial(incompleteSite);
          if (missing && world.stockpile[missing] > 0) {
            const take = Math.min(
              4,
              incompleteSite.required[missing] - incompleteSite.delivered[missing],
              world.stockpile[missing]
            );
            world.stockpile[missing] -= take;
            h.carrying = { resource: missing, amount: take };
            h.state = 'HAUL_TO_SITE';
            h.targetBuildingId = incompleteSite.id;
            h.targetTile = findOpenTileAround(
              world,
              incompleteSite.tileX + incompleteSite.size / 2,
              incompleteSite.tileY + incompleteSite.size / 2,
              incompleteSite.size * 0.52 + 0.2,
              incompleteSite.size * 0.9 + 1.4,
              occupiedTiles,
              h.id,
              true
            );
            h.actionTimer = 10;
            h.thoughtText = `Hauling ${missing} to build`;
            h.thoughtTimer = 3;
          } else if (!missing || getDeliveredRatio(incompleteSite) > incompleteSite.buildProgress / 100) {
            h.state = 'BUILD';
            h.targetBuildingId = incompleteSite.id;
            h.targetTile = findOpenTileAround(
              world,
              incompleteSite.tileX + incompleteSite.size / 2,
              incompleteSite.tileY + incompleteSite.size / 2,
              incompleteSite.size * 0.52 + 0.25,
              incompleteSite.size * 0.95 + 1.5,
              occupiedTiles,
              h.id,
              true
            );
            h.actionTimer = 7;
            h.thoughtText = `Building ${BUILDING_DEFS[incompleteSite.kind].name}`;
            h.thoughtTimer = 3;
          } else if (missing === 'wood') {
            h.state = 'CHOP';
            const pick = findResourceAndOpenSpot(
              world,
              h.x,
              h.y,
              [TileType.FOREST],
              26,
              h.id,
              claimedResourceTiles,
              occupiedTiles
            );
            h.targetTile = pick?.spot ?? null;
            h.targetResourceTile = pick?.resourceTile ?? null;
            h.actionTimer = 7;
            h.thoughtText = 'Need timber for blueprint';
            h.thoughtTimer = 3;
          } else {
            h.state = 'MINE';
            const orderTypes =
              missing === 'coal'
                ? [TileType.COAL, TileType.ORE, TileType.STONE]
                : missing === 'ore'
                  ? [TileType.ORE, TileType.COAL, TileType.STONE]
                  : [TileType.STONE, TileType.ORE, TileType.COAL];
            const pick = findResourceAndOpenSpot(
              world,
              h.x,
              h.y,
              orderTypes,
              28,
              h.id,
              claimedResourceTiles,
              occupiedTiles
            );
            h.targetTile = pick?.spot ?? null;
            h.targetResourceTile = pick?.resourceTile ?? null;
            h.actionTimer = 7;
            h.thoughtText = `Quarrying ${missing}`;
            h.thoughtTimer = 3;
          }
        } else if (best === scoreResearch) {
          h.state = 'RESEARCH';
          const lab = findCompletedBuilding(world, h.x, h.y, [
            'OBSERVATORY',
            'CHRONOMETER_TOWER',
            'WORKSHOP',
            'TOTEM_SHRINE',
            'CIVIC_HALL',
            'CAMPFIRE',
          ]);
          h.targetBuildingId = lab ? lab.id : null;
          if (lab) {
            h.targetTile = findOpenTileAround(
              world,
              lab.tileX + lab.size / 2,
              lab.tileY + lab.size / 2,
              lab.size * 0.55 + 0.35,
              lab.size * 0.9 + 2.1,
              occupiedTiles,
              h.id,
              true
            );
          } else {
            h.targetTile = findOpenTileAround(world, h.x, h.y, 1.5, 4.5, occupiedTiles, h.id, true);
          }
          h.actionTimer = 6.0;
          h.thoughtText = lab ? 'Studying breakthroughs' : 'Sketching ideas...';
          h.thoughtTimer = 3.5;
        } else if (best === scoreForage) {
          h.state = 'FORAGE';
          const pick = findResourceAndOpenSpot(
            world,
            h.x,
            h.y,
            [TileType.FARMLAND, TileType.BERRY_GROVE],
            26,
            h.id,
            claimedResourceTiles,
            occupiedTiles
          );
          h.targetTile = pick?.spot ?? null;
          h.targetResourceTile = pick?.resourceTile ?? null;
          h.actionTimer = 7;
          h.thoughtText = 'Foraging food';
          h.thoughtTimer = 2.5;
        } else if (best === scoreChop) {
          h.state = 'CHOP';
          const pick = findResourceAndOpenSpot(
            world,
            h.x,
            h.y,
            [TileType.FOREST],
            26,
            h.id,
            claimedResourceTiles,
            occupiedTiles
          );
          h.targetTile = pick?.spot ?? null;
          h.targetResourceTile = pick?.resourceTile ?? null;
          h.actionTimer = 7;
          h.thoughtText = 'Chopping timber';
          h.thoughtTimer = 2.5;
        } else {
          h.state = 'MINE';
          const desired =
            urgentMissing === 'coal'
              ? [TileType.COAL, TileType.ORE, TileType.STONE]
              : urgentMissing === 'ore'
                ? [TileType.ORE, TileType.COAL, TileType.STONE]
                : Math.random() < 0.35
                  ? [TileType.COAL, TileType.ORE, TileType.STONE]
                  : [TileType.ORE, TileType.STONE, TileType.COAL];
          const pick = findResourceAndOpenSpot(
            world,
            h.x,
            h.y,
            desired,
            28,
            h.id,
            claimedResourceTiles,
            occupiedTiles
          );
          h.targetTile = pick?.spot ?? null;
          h.targetResourceTile = pick?.resourceTile ?? null;
          h.actionTimer = 7;
          h.thoughtText = 'Mining stone, ore & coal';
          h.thoughtTimer = 2.5;
        }
      }
    }

    // Execute active human task
    if (h.state === 'SLEEPING') {
      const shelter = h.targetBuildingId
        ? world.buildings.find((b) => b.id === h.targetBuildingId && b.status === 'COMPLETE')
        : null;
      if (shelter) {
        const doorX = shelter.tileX + shelter.size / 2;
        const doorY = shelter.tileY + shelter.size * 0.72;
        const dist = Math.hypot(doorX - h.x, doorY - h.y);
        if (dist > 0.45 && !h.sleepingInBuildingId) {
          moveToward(world, h, doorX, doorY, moveSpeed * 1.15, dt);
          h.walkPhase += dt * 11;
        } else {
          h.x = doorX;
          h.y = doorY;
          h.vx = 0;
          h.vy = 0;
          h.sleepingInBuildingId = shelter.id;
          shelter.occupantsSleeping++;
          h.energy = Math.min(100, h.energy + dt * 14);
          h.hp = Math.min(100, h.hp + dt * 2.5);
          h.thoughtText = !nightNow && localWeather.type !== 'CLEAR'
            ? `Sheltering inside ${BUILDING_DEFS[shelter.kind].name}`
            : `Sleeping in ${BUILDING_DEFS[shelter.kind].name}`;
          if (Math.random() < dt * 0.45) {
            spawnParticle(
              world,
              shelter.tileX + shelter.size / 2 + (Math.random() - 0.5) * 0.5,
              shelter.tileY - 0.1,
              !nightNow ? '#bae6fd' : '#93c5fd',
              !nightNow ? 'Warm' : 'Zzz',
              -0.35
            );
          }
        }
      } else {
        h.sleepingInBuildingId = null;
        const campfire = findCompletedBuilding(world, h.x, h.y, ['CAMPFIRE', 'WELL']) ?? homeBuilding;
        if (h.targetTile) {
          const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed * 1.05, dt);
          if (!arrived) {
            h.walkPhase += dt * 10;
          } else if (campfire) {
            h.facing = campfire.tileX + campfire.size / 2 >= h.x ? 1 : -1;
          }
        }
        h.energy = Math.min(100, h.energy + dt * 9);
        h.thoughtText = campfire ? 'Huddling near hearth' : 'Resting outdoors';
        if (Math.random() < dt * 0.32) {
          spawnParticle(world, h.x, h.y - 0.8, '#93c5fd', 'Zzz', -0.35);
        }
      }
    } else if (h.state === 'TRADE') {
      const route = h.tradeState
        ? world.tradeRoutes.find((r) => r.id === h.tradeState!.routeId && r.active)
        : null;
      if (!route || !h.tradeState || !h.targetTile) {
        if (h.carrying) {
          world.stockpile[h.carrying.resource] += h.carrying.amount;
          h.carrying = null;
        }
        h.tradeState = null;
        h.state = 'IDLE';
      } else {
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed * 1.12, dt);
        if (!arrived) {
          h.walkPhase += dt * 11;
        } else if (h.tradeState.phase === 'TO_DEST') {
          const isFromHome = !h.settlementId || route.fromSettlementId === h.settlementId;
          const homeId = isFromHome ? route.fromSettlementId : route.toSettlementId;
          const homeSettlement = world.settlements.find((s) => s.id === homeId) ?? world.settlements[0];
          const importRes = isFromHome ? route.importResource : route.exportResource;
          if (h.carrying) {
            world.stockpile[h.carrying.resource] += h.carrying.amount + 2;
          }
          world.stockpile.researchPoints += 3;
          h.carrying = { resource: importRes, amount: 5 };
          h.tradeState.phase = 'RETURN_HOME';
          h.actionTimer = 32;
          if (homeSettlement) {
            h.targetTile = findOpenTileAround(
              world,
              homeSettlement.centerX,
              homeSettlement.centerY,
              1.1,
              3.2,
              occupiedTiles,
              h.id,
              true
            );
            h.thoughtText = `Returning to ${homeSettlement.name} with ${importRes}`;
          } else {
            h.targetTile = { x: world.width / 2, y: world.height / 2 };
          }
          spawnParticle(world, h.x, h.y - 0.6, '#fbbf24', `Traded → ${importRes}`, -0.5);
        } else {
          if (h.carrying) {
            const gain = h.carrying.amount + 3;
            world.stockpile[h.carrying.resource] += gain;
            spawnParticle(world, h.x, h.y - 0.6, '#34d399', `+${gain} ${h.carrying.resource}`, -0.55);
          }
          world.stockpile.researchPoints += 2;
          route.completedTrips++;
          h.carrying = null;
          h.tradeState = null;
          h.state = 'IDLE';
          h.actionTimer = 0;
          h.thoughtText = 'Caravan returned safely!';
          h.thoughtTimer = 3.2;
          if (route.completedTrips % 3 === 1) {
            const fromS = world.settlements.find((s) => s.id === route.fromSettlementId);
            const toS = world.settlements.find((s) => s.id === route.toSettlementId);
            addChronicle(
              world,
              `${h.name} completed a trade caravan between ${fromS?.name ?? 'Hearth'} and ${toS?.name ?? 'Outpost'}.`,
              'COMMUNITY'
            );
          }
        }
      }
    } else if (h.state === 'CELEBRATE') {
      if (h.targetTile) {
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed * 1.05, dt);
        if (!arrived) {
          h.walkPhase += dt * 11;
        } else {
          h.energy = Math.min(100, h.energy + dt * 4);
          if (Math.random() < dt * 1.6) {
            const colors = ['#fde047', '#34d399', '#38bdf8', '#f97316'];
            spawnParticle(
              world,
              h.x + (Math.random() - 0.5) * 0.4,
              h.y - 0.8,
              colors[Math.floor(Math.random() * colors.length)]
            );
          }
        }
      }
    } else if (h.state === 'EXPLORE') {
      if (!h.targetTile) {
        h.isCuriousExplorer = false;
        h.state = 'IDLE';
      } else {
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed * 1.08, dt);
        if (!arrived) {
          h.walkPhase += dt * 11;
        } else {
          if (h.actionTimer > 1.5) {
            h.actionTimer = 1.4;
            h.thoughtText = 'Examining surroundings...';
            h.thoughtTimer = 2;
          } else if (h.actionTimer <= 0.15) {
            completeExplorerDiscovery(world, h);
            h.state = 'IDLE';
            h.targetTile = null;
            h.actionTimer = 0;
          }
        }
      }
    } else if (h.state === 'PATROL') {
      if (h.targetTile) {
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed * 1.05, dt);
        if (!arrived) {
          h.walkPhase += dt * 10.5;
        } else {
          h.facing = (Math.sin(world.tick * 0.5 + h.x) >= 0 ? 1 : -1) as 1 | -1;
        }
      }
    } else if (h.state === 'SOCIALIZE') {
      if (h.targetTile) {
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed * 0.85, dt);
        if (!arrived) {
          h.walkPhase += dt * 8.5;
        } else {
          const neighbor = world.humans.find(
            (other) => other.id !== h.id && Math.hypot(other.x - h.x, other.y - h.y) < 3.5
          );
          if (neighbor) {
            h.facing = neighbor.x >= h.x ? 1 : -1;
          }
          h.energy = Math.min(100, h.energy + dt * 5);
          h.curiosity = Math.min(100, h.curiosity + dt * 1.2);
        }
      }
    } else if (h.state === 'REST') {
      if (h.targetTile) {
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed * 0.85, dt);
        if (!arrived) h.walkPhase += dt * 8.5;
      }
      h.energy = Math.min(100, h.energy + dt * 6);
    } else if (h.state === 'CRAFT') {
      const order = activeCraftOrder;
      const forge = order
        ? world.buildings.find((b) => b.id === order.buildingId && b.status === 'COMPLETE')
        : null;
      if (!order || !forge) {
        if (h.carrying) {
          world.stockpile[h.carrying.resource] += h.carrying.amount;
          h.carrying = null;
        }
        h.state = 'IDLE';
      } else {
        forge.assignedWorkers++;
        if (!h.targetTile) {
          h.targetTile = findOpenTileAround(
            world,
            forge.tileX + forge.size / 2,
            forge.tileY + forge.size / 2,
            forge.size * 0.55 + 0.25,
            forge.size * 0.9 + 1.5,
            occupiedTiles,
            h.id,
            true
          );
        }
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed, dt);
        if (!arrived) {
          h.walkPhase += dt * 10.5;
        } else {
          h.facing = forge.tileX + forge.size / 2 >= h.x ? 1 : -1;
          if (h.carrying) {
            const res = h.carrying.resource;
            if (res !== 'food') {
              order.delivered[res] = Math.min(
                order.requiredTotal[res],
                order.delivered[res] + h.carrying.amount
              );
            }
            spawnParticle(
              world,
              forge.tileX + forge.size / 2,
              forge.tileY + forge.size / 2 - 0.3,
              '#fb923c',
              `+${h.carrying.amount} ${res}`
            );
            h.carrying = null;
            h.actionTimer = 7;
          } else {
            const missingNext = getCraftOrderMissingForNextUnit(order);
            if (missingNext) {
              h.state = 'IDLE';
            } else {
              const cDef = CRAFTED_ITEM_DEFS[order.itemKind];
              const craftRate =
                (100 / cDef.workRequired) *
                12 *
                bonuses.buildMult *
                toolBuildMult *
                (isMetallurgist ? 1.55 : 1) *
                (isClockmaker ? 1.35 : 1) *
                leaderBoost;
              order.progress = Math.min(100, order.progress + craftRate * dt);
              h.walkPhase += dt * 13;
              if (Math.random() < dt * 2.2) {
                spawnParticle(world, forge.tileX + forge.size / 2, forge.tileY + forge.size / 2, '#f97316');
                soundEngine.playHammerTap();
              }
              if (order.progress >= 99.8) {
                order.completedQty++;
                order.progress = 0;
                h.craftedCount++;
                soundEngine.playForgeCraft();
                const msg = equipCraftedItemToVillage(world, h, order.itemKind);
                spawnParticle(world, forge.tileX + forge.size / 2, forge.tileY, '#fde047', `${cDef.name}!`, -0.6);
                if (order.completedQty >= order.targetQty) {
                  const ordIdx = world.craftOrders.findIndex((o) => o.id === order.id);
                  if (ordIdx !== -1) world.craftOrders.splice(ordIdx, 1);
                  addChronicle(
                    world,
                    `Completed batch of ${order.targetQty}× ${cDef.name} (${msg}).`,
                    'COMMUNITY'
                  );
                } else {
                  addChronicle(world, `${msg} (${order.completedQty}/${order.targetQty}).`, 'COMMUNITY');
                }
                h.state = 'IDLE';
              }
            }
          }
        }
      }
    } else if (h.state === 'HAUL_TO_SITE') {
      const site = world.buildings.find((b) => b.id === h.targetBuildingId);
      if (!site || site.status === 'COMPLETE') {
        if (h.carrying) {
          world.stockpile[h.carrying.resource] += h.carrying.amount;
          h.carrying = null;
        }
        h.state = 'IDLE';
      } else {
        site.assignedWorkers++;
        if (!h.targetTile) {
          h.targetTile = findOpenTileAround(
            world,
            site.tileX + site.size / 2,
            site.tileY + site.size / 2,
            site.size * 0.52 + 0.2,
            site.size * 0.9 + 1.4,
            occupiedTiles,
            h.id,
            true
          );
        }
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed, dt);
        if (!arrived) {
          h.walkPhase += dt * 10.5;
        } else if (h.carrying) {
          const res = h.carrying.resource;
          if (res !== 'food') {
            site.delivered[res] = Math.min(site.required[res], site.delivered[res] + h.carrying.amount);
          }
          if (site.status === 'BLUEPRINT') site.status = 'UNDER_CONSTRUCTION';
          spawnParticle(
            world,
            site.tileX + site.size / 2,
            site.tileY + site.size / 2 - 0.3,
            '#e5a93c',
            `+${h.carrying.amount} ${res}`
          );
          h.carrying = null;
          h.state = 'BUILD';
          h.actionTimer = 6;
          h.thoughtText = `Hammering ${BUILDING_DEFS[site.kind].name}`;
        }
      }
    } else if (h.state === 'BUILD') {
      const site = world.buildings.find((b) => b.id === h.targetBuildingId);
      if (!site || site.status === 'COMPLETE') {
        h.state = 'IDLE';
      } else {
        site.assignedWorkers++;
        if (!h.targetTile) {
          h.targetTile = findOpenTileAround(
            world,
            site.tileX + site.size / 2,
            site.tileY + site.size / 2,
            site.size * 0.52 + 0.25,
            site.size * 0.95 + 1.5,
            occupiedTiles,
            h.id,
            true
          );
        }
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed, dt);
        if (!arrived) {
          h.walkPhase += dt * 10.5;
        } else {
          h.facing = site.tileX + site.size / 2 >= h.x ? 1 : -1;
          const allowedProgress = Math.max(12, getDeliveredRatio(site) * 100);
          if (site.buildProgress < allowedProgress) {
            if (site.status === 'BLUEPRINT') site.status = 'UNDER_CONSTRUCTION';
            const workRate =
              (100 / BUILDING_DEFS[site.kind].workRequired) *
              14 *
              bonuses.buildMult *
              toolBuildMult *
              (isArchitect ? 2.2 : 1) *
              (isClockmaker ? 1.4 : 1) *
              (nudgeType === 'COMMUNITY_RALLY' ? 1.65 : 1) *
              leaderBoost;
            site.buildProgress = Math.min(allowedProgress, site.buildProgress + workRate * dt);
            h.walkPhase += dt * 13;
            if (Math.random() < dt * 2.4) {
              spawnParticle(world, site.tileX + site.size / 2, site.tileY + site.size / 2, '#fbbf24');
              soundEngine.playHammerTap();
            }
            if (site.buildProgress >= 99.8 && getDeliveredRatio(site) >= 1) {
              h.buildingsAssisted++;
              completeBuilding(world, site);
              h.state = 'IDLE';
            }
          } else {
            h.state = 'IDLE';
          }
        }
      }
    } else if (h.state === 'RESEARCH') {
      if (h.targetTile) {
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed * 0.9, dt);
        if (!arrived) {
          h.walkPhase += dt * 9.5;
        } else {
          const lab = world.buildings.find((b) => b.id === h.targetBuildingId && b.status === 'COMPLETE');
          const labBonus =
            lab?.kind === 'OBSERVATORY'
              ? 2.4
              : lab?.kind === 'CHRONOMETER_TOWER'
                ? 2.2
                : lab?.kind === 'WORKSHOP'
                  ? 1.75
                  : lab?.kind === 'TOTEM_SHRINE'
                    ? 1.45
                    : lab?.kind === 'CAMPFIRE'
                      ? 1.25
                      : 1;
          const rpRate =
            0.58 *
            bonuses.researchMult *
            toolResearchMult *
            labBonus *
            (isScholar ? 2.4 : 1) *
            (isClockmaker ? 1.45 : 1) *
            (nudgeType === 'CURIOSITY_SPARK' ? 2.1 : 1) *
            leaderBoost;
          const gained = rpRate * dt;
          world.stockpile.researchPoints += gained;
          h.researchContributed += gained;

          if (Math.random() < dt * 1.1) {
            spawnParticle(world, h.x, h.y - 0.6, '#38bdf8', '+RP', -0.55);
            const ideas = ['Idea: Lever?', 'Testing bronze', 'Sketching gears', 'Star charts'];
            h.thoughtText = ideas[Math.floor(Math.random() * ideas.length)];
            h.thoughtTimer = 3;
          }
        }
      }
    } else if (h.state === 'FORAGE' || h.state === 'CHOP' || h.state === 'MINE') {
      if (!h.targetTile || !h.targetResourceTile) {
        h.state = 'IDLE';
      } else {
        const arrived = moveToward(world, h, h.targetTile.x, h.targetTile.y, moveSpeed, dt);
        if (!arrived) {
          h.walkPhase += dt * 10.5;
        } else {
          const tx = h.targetResourceTile.x;
          const ty = h.targetResourceTile.y;
          h.facing = tx + 0.5 >= h.x ? 1 : -1;
          const idx = ty * world.width + tx;
          const tile = world.tiles[idx];
          h.walkPhase += dt * 12;

          if (Math.random() < dt * 1.5) {
            if (h.state === 'FORAGE') {
              const fertFactor = tile ? Math.max(0.75, Math.min(1.4, tile.fertility)) : 1;
              const gain = Math.max(
                1,
                Math.round(2 * bonuses.gatherMult * toolForageMult * fertFactor * (isForager ? 1.8 : 1))
              );
              world.stockpile.food += gain;
              spawnParticle(world, h.x, h.y - 0.4, '#84cc16', `+${gain} Food`);
              if (tile && tile.type === TileType.BERRY_GROVE) {
                tile.resourceAmount -= 1;
                if (tile.resourceAmount <= 0) {
                  tile.type = TileType.MEADOW;
                  world.dirtyTiles.push(idx);
                  h.state = 'IDLE';
                }
              }
            } else if (h.state === 'CHOP') {
              const gain = Math.round(2 * bonuses.gatherMult * toolWoodMult * (isForager ? 1.4 : 1));
              world.stockpile.wood += gain;
              spawnParticle(world, h.x, h.y - 0.4, '#d97706', `+${gain} Wood`);
              if (tile && tile.type === TileType.FOREST) {
                tile.resourceAmount -= 1;
                if (tile.resourceAmount <= 0) {
                  tile.type = TileType.MEADOW;
                  world.dirtyTiles.push(idx);
                  h.state = 'IDLE';
                }
              }
            } else if (h.state === 'MINE') {
              const isOre = tile?.type === TileType.ORE;
              const isCoal = tile?.type === TileType.COAL;
              const gain = Math.round(2 * bonuses.gatherMult * toolMineMult * (isMetallurgist ? 2 : 1));
              if (isCoal) {
                world.stockpile.coal += gain;
                spawnParticle(world, h.x, h.y - 0.4, '#94a3b8', `+${gain} Coal`);
              } else if (isOre) {
                world.stockpile.ore += gain;
                spawnParticle(world, h.x, h.y - 0.4, '#fb923c', `+${gain} Ore`);
              } else {
                world.stockpile.stone += gain;
                spawnParticle(world, h.x, h.y - 0.4, '#cbd5e1', `+${gain} Stone`);
              }
              if (tile && tile.resourceAmount > 0) {
                tile.resourceAmount -= 1;
                if (tile.resourceAmount <= 0) {
                  tile.type = TileType.MEADOW;
                  world.dirtyTiles.push(idx);
                  h.state = 'IDLE';
                }
              }
            }
          }
        }
      }
    }
  }

  // Soft personal-space separation so outdoor humans never stack onto the exact same grid cell
  for (let i = 0; i < world.humans.length; i++) {
    const a = world.humans[i];
    if (a.sleepingInBuildingId) continue;
    for (let j = i + 1; j < world.humans.length; j++) {
      const b = world.humans[j];
      if (b.sleepingInBuildingId) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001 && dist < 0.62) {
        const push = ((0.62 - dist) / 0.62) * Math.min(0.14, dt * 1.8);
        const nx = (dx / dist) * push;
        const ny = (dy / dist) * push;
        const ax = Math.max(1.2, Math.min(world.width - 2.2, a.x - nx));
        const ay = Math.max(1.2, Math.min(world.height - 2.2, a.y - ny));
        const bx = Math.max(1.2, Math.min(world.width - 2.2, b.x + nx));
        const by = Math.max(1.2, Math.min(world.height - 2.2, b.y + ny));
        if (isWalkableOpenTile(world, Math.floor(ax), Math.floor(ay))) {
          a.x = ax;
          a.y = ay;
        }
        if (isWalkableOpenTile(world, Math.floor(bx), Math.floor(by))) {
          b.x = bx;
          b.y = by;
        }
      }
    }
  }

  // Step Clockwork Automatons
  for (const auto of world.automatons) {
    auto.gearPhase += dt * 8;
    const site = findIncompleteBuilding(world, auto.x, auto.y);
    if (site) {
      const missing = getMissingMaterial(site);
      if (!auto.carrying && missing && world.stockpile[missing] > 0) {
        const take = Math.min(5, site.required[missing] - site.delivered[missing], world.stockpile[missing]);
        world.stockpile[missing] -= take;
        auto.carrying = { resource: missing, amount: take };
        auto.targetBuildingId = site.id;
        auto.state = 'HAUL_TO_SITE';
      } else {
        auto.targetBuildingId = site.id;
        auto.state = 'ASSIST_BUILD';
      }

      const tx = site.tileX + site.size / 2;
      const ty = site.tileY + site.size / 2;
      const arrived = moveToward(world, auto, tx, ty, 3.2, dt);
      if (arrived) {
        if (auto.carrying) {
          const res = auto.carrying.resource;
          if (res !== 'food') {
            site.delivered[res] = Math.min(site.required[res], site.delivered[res] + auto.carrying.amount);
          }
          if (site.status === 'BLUEPRINT') site.status = 'UNDER_CONSTRUCTION';
          spawnParticle(world, tx, ty - 0.3, '#e5a93c', `+${auto.carrying.amount} ${res}`);
          auto.carrying = null;
        } else {
          const allowed = Math.max(12, getDeliveredRatio(site) * 100);
          if (site.buildProgress < allowed) {
            site.buildProgress = Math.min(allowed, site.buildProgress + 16 * dt);
            if (site.buildProgress >= 99.8 && getDeliveredRatio(site) >= 1) {
              completeBuilding(world, site);
            }
          }
        }
      }
    } else {
      auto.state = 'PATROL';
      const home = world.buildings.find((b) => b.id === auto.homeBuildingId);
      if (home) {
        const angle = world.tick * 0.12;
        moveToward(
          world,
          auto,
          home.tileX + home.size / 2 + Math.cos(angle) * 2.5,
          home.tileY + home.size / 2 + Math.sin(angle) * 2.5,
          1.8,
          dt
        );
      }
    }
  }

  // Auto-unlock tech if player enabled it
  if (world.autoUnlockTech) {
    for (const tech of TECH_TREE) {
      if (canUnlockTech(world, tech.id)) {
        unlockTechnology(world, tech.id);
        break;
      }
    }
  }

  // Update floating particles
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const p = world.particles[i];
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life >= p.maxLife) {
      world.particles.splice(i, 1);
    }
  }

  // Update nudge shockwave rings
  for (let i = world.nudgeRings.length - 1; i >= 0; i--) {
    const r = world.nudgeRings[i];
    r.life += dt;
    r.radius = (r.life / r.maxLife) * r.maxRadius;
    if (r.life >= r.maxLife) {
      world.nudgeRings.splice(i, 1);
    }
  }
}

export function toggleTradeRoute(world: WorldState, routeId: string): boolean {
  const route = world.tradeRoutes.find((r) => r.id === routeId);
  if (!route) return false;
  route.active = !route.active;
  return true;
}

export function createTradeRoute(
  world: WorldState,
  fromSettlementId: string,
  toSettlementId: string,
  exportResource: ResourceType,
  importResource: ResourceType
): TradeRoute | null {
  if (fromSettlementId === toSettlementId) return null;
  const fromS = world.settlements.find((s) => s.id === fromSettlementId);
  const toS = world.settlements.find((s) => s.id === toSettlementId);
  if (!fromS || !toS) return null;

  const route: TradeRoute = {
    id: `tr_${world.nextIdCounter++}`,
    fromSettlementId,
    toSettlementId,
    exportResource,
    importResource,
    active: true,
    completedTrips: 0,
  };
  world.tradeRoutes.push(route);
  addChronicle(
    world,
    `Opened trade route: ${fromS.name} (${exportResource}) ↔ ${toS.name} (${importResource}).`,
    'COMMUNITY'
  );
  return route;
}

export function deleteTradeRoute(world: WorldState, routeId: string): boolean {
  const idx = world.tradeRoutes.findIndex((r) => r.id === routeId);
  if (idx === -1) return false;
  world.tradeRoutes.splice(idx, 1);
  return true;
}
