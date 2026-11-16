import {
  BUILDING_DEFS,
  createEmptyArmory,
  HUMAN_NAMES,
  SKIN_TONES,
  TUNIC_COLORS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './constants';
import {
  BuildingKind,
  BuildingSite,
  HumanAgent,
  MapPreset,
  Settlement,
  SettlementBiomeSpecialty,
  TalentId,
  TileType,
  TradeRoute,
  WeatherZone,
  WorldState,
  WorldTile,
} from './types';

function hash2D(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);

  const a = hash2D(ix, iy, seed);
  const b = hash2D(ix + 1, iy, seed);
  const c = hash2D(ix, iy + 1, seed);
  const d = hash2D(ix + 1, iy + 1, seed);

  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    val += valueNoise(x * freq, y * freq, seed + i * 97) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return val / norm;
}

const WORLD_PREFIXES = ['Aethel', 'Bramble', 'Cinder', 'Oakhaven', 'Solstice', 'Tidewatch', 'Alder', 'Vesper'];
const WORLD_SUFFIXES = ['Reach', 'Vale', 'Hollow', 'Isle', 'Basin', 'Crossing', 'Crown'];

export function generateWorldName(seed: number): string {
  const p = WORLD_PREFIXES[Math.abs(seed) % WORLD_PREFIXES.length];
  const s = WORLD_SUFFIXES[Math.abs(seed * 7 + 3) % WORLD_SUFFIXES.length];
  return `${p} ${s}`;
}

export function createHuman(
  idNum: number,
  x: number,
  y: number,
  seed: number,
  initialTalents?: TalentId[],
  settlementId: string | null = null
): HumanAgent {
  const r1 = hash2D(idNum, 1, seed);
  const r2 = hash2D(idNum, 2, seed);
  const r3 = hash2D(idNum, 3, seed);

  const name = HUMAN_NAMES[(idNum + Math.floor(r1 * 17)) % HUMAN_NAMES.length];
  const skinTone = SKIN_TONES[Math.floor(r2 * SKIN_TONES.length) % SKIN_TONES.length];
  const tunicColor = TUNIC_COLORS[Math.floor(r3 * TUNIC_COLORS.length) % TUNIC_COLORS.length];

  const talents: TalentId[] = initialTalents ? [...initialTalents] : [];
  if (!initialTalents && r1 > 0.65) {
    const pool: TalentId[] = ['FORAGER', 'ARCHITECT', 'SCHOLAR', 'METALLURGIST'];
    talents.push(pool[Math.floor(r2 * pool.length) % pool.length]);
  }

  return {
    id: `h_${idNum}`,
    name,
    age: 16 + Math.floor(r2 * 14),
    x,
    y,
    vx: 0,
    vy: 0,
    facing: r1 > 0.5 ? 1 : -1,
    walkPhase: r2 * Math.PI * 2,
    hp: 100,
    hunger: 15 + Math.floor(r1 * 20),
    energy: 80 + Math.floor(r3 * 20),
    curiosity: 35 + Math.floor(r2 * 45),
    skinTone,
    tunicColor,
    talents,
    activeNudge: null,
    state: 'IDLE',
    carrying: null,
    equippedWeapon: null,
    equippedTool: null,
    craftedCount: 0,
    settlementId,
    tradeState: null,
    homeBuildingId: null,
    targetBuildingId: null,
    sleepingInBuildingId: null,
    targetTile: null,
    targetResourceTile: null,
    isCuriousExplorer: false,
    discoveries: [],
    thoughtText: 'Exploring new land',
    thoughtTimer: 3,
    actionTimer: 0,
    researchContributed: 0,
    buildingsAssisted: 0,
  };
}

export function createBuildingSite(
  idNum: number,
  kind: BuildingKind,
  tileX: number,
  tileY: number,
  completeImmediately = false,
  settlementId: string | null = null
): BuildingSite {
  const def = BUILDING_DEFS[kind];
  return {
    id: `b_${idNum}`,
    kind,
    settlementId,
    tileX,
    tileY,
    size: def.footprint,
    status: completeImmediately ? 'COMPLETE' : 'BLUEPRINT',
    required: { ...def.cost },
    delivered: completeImmediately ? { ...def.cost } : { wood: 0, stone: 0, ore: 0, coal: 0 },
    buildProgress: completeImmediately ? 100 : 0,
    pulseTimer: 0,
    assignedWorkers: 0,
    occupantsSleeping: 0,
  };
}

function clearPlazaForBuildings(
  tiles: WorldTile[],
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius = 3
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (tx < 2 || ty < 2 || tx >= width - 2 || ty >= height - 2) continue;
      const t = tiles[ty * width + tx];
      if (t.type !== TileType.DEEP_WATER && t.type !== TileType.SHALLOW_WATER) {
        t.type = TileType.MEADOW;
        t.resourceAmount = 0;
      }
    }
  }
}

function clearFootprintMargin(
  tiles: WorldTile[],
  width: number,
  height: number,
  tileX: number,
  tileY: number,
  size: number
): void {
  for (let dy = -1; dy <= size; dy++) {
    for (let dx = -1; dx <= size; dx++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      if (tx < 1 || ty < 1 || tx >= width - 1 || ty >= height - 1) continue;
      const t = tiles[ty * width + tx];
      if (t.type !== TileType.DEEP_WATER && t.type !== TileType.SHALLOW_WATER) {
        t.type = TileType.MEADOW;
        t.resourceAmount = 0;
      }
    }
  }
}

export function generateWorld(preset: MapPreset, seedInput?: number): WorldState {
  const seed = seedInput ?? Math.floor(Math.random() * 999999) + 1;
  const width = WORLD_WIDTH;
  const height = WORLD_HEIGHT;
  const tiles: WorldTile[] = new Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width - 0.5;
      const ny = y / height - 0.5;
      const dist = Math.sqrt(nx * nx * 2.1 + ny * ny * 2.1);

      const baseNoise = fbm(x * 0.055, y * 0.055, seed, 4);
      const detailNoise = fbm(x * 0.14, y * 0.14, seed + 511, 3);
      const moisture = fbm(x * 0.07, y * 0.07, seed + 1203, 3);

      let elevation = baseNoise;

      if (preset === 'ARCHIPELAGO') {
        const islandMask = Math.max(0, 1 - dist * 1.15);
        elevation = baseNoise * 0.72 + islandMask * 0.45 - 0.22;
      } else if (preset === 'RIVER_VALLEY') {
        const riverCenter = Math.sin(x * 0.08 + seed * 0.01) * 0.14;
        const riverDist = Math.abs(ny - riverCenter);
        const riverCarve = Math.max(0, 0.24 - riverDist * 1.6);
        const edgeFade = Math.max(0, 1 - dist * 0.85);
        elevation = baseNoise * 0.65 + edgeFade * 0.45 - riverCarve * 1.15 - 0.14;
      } else {
        // TWIN_PEAKS
        const p1 = Math.hypot(nx + 0.2, ny);
        const p2 = Math.hypot(nx - 0.22, ny + 0.04);
        const peakLift = Math.max(0, 0.52 - p1) * 0.9 + Math.max(0, 0.52 - p2) * 0.9;
        elevation = baseNoise * 0.58 + peakLift - dist * 0.42;
      }

      let type = TileType.DEEP_WATER;
      let resourceAmount = 0;

      if (elevation < 0.26) {
        type = TileType.DEEP_WATER;
      } else if (elevation < 0.34) {
        type = TileType.SHALLOW_WATER;
      } else if (elevation < 0.39) {
        type = TileType.SAND;
      } else if (elevation > 0.73) {
        if (detailNoise > 0.62) {
          type = TileType.ORE;
          resourceAmount = 35;
        } else if (detailNoise < 0.34) {
          type = TileType.COAL;
          resourceAmount = 32;
        } else {
          type = TileType.STONE;
          resourceAmount = 40;
        }
      } else if (elevation > 0.65 && detailNoise < 0.34) {
        type = TileType.COAL;
        resourceAmount = 30;
      } else if (elevation > 0.66 && detailNoise > 0.58) {
        type = TileType.STONE;
        resourceAmount = 30;
      } else if (moisture > 0.54 && detailNoise > 0.46) {
        type = TileType.FOREST;
        resourceAmount = 22;
      } else if (moisture > 0.47 && detailNoise < 0.34) {
        type = TileType.BERRY_GROVE;
        resourceAmount = 18;
      } else {
        type = TileType.MEADOW;
      }

      const variant = Math.floor(hash2D(x, y, seed + 77) * 4) % 4;
      tiles[y * width + x] = {
        type,
        elevation,
        resourceAmount,
        fertility: 1.0,
        variant,
      };
    }
  }

  const hasFlat2x2 = (tx: number, ty: number) => {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const t = tiles[(ty + dy) * width + (tx + dx)];
        if (!t || t.type === TileType.DEEP_WATER || t.type === TileType.SHALLOW_WATER) return false;
      }
    }
    return true;
  };

  // 1. Find primary Heartland/Woodland settlement center near middle of map
  let spawnX = Math.floor(width / 2);
  let spawnY = Math.floor(height / 2);
  let bestScore = -999;

  for (let y = 16; y < height - 16; y++) {
    for (let x = 20; x < width - 20; x++) {
      const t = tiles[y * width + x];
      if ((t.type !== TileType.MEADOW && t.type !== TileType.BERRY_GROVE) || !hasFlat2x2(x, y)) continue;

      let meadowCount = 0;
      let forestCount = 0;
      let stoneCount = 0;
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const nt = tiles[(y + dy) * width + (x + dx)];
          if (nt.type === TileType.MEADOW || nt.type === TileType.BERRY_GROVE) meadowCount++;
          if (nt.type === TileType.FOREST) forestCount++;
          if (nt.type === TileType.STONE || nt.type === TileType.ORE || nt.type === TileType.COAL) stoneCount++;
        }
      }
      const centerBias = 32 - Math.hypot(x - width / 2, y - height / 2) * 0.55;
      const score = meadowCount + Math.min(forestCount, 24) * 1.4 + Math.min(stoneCount, 12) * 1.2 + centerBias;
      if (score > bestScore) {
        bestScore = score;
        spawnX = x;
        spawnY = y;
      }
    }
  }

  // 2. Find Highland Outpost near rocky peaks at >= 36 tiles from primary
  let highX = Math.max(18, Math.min(width - 22, spawnX - 38));
  let highY = Math.max(16, Math.min(height - 20, spawnY - 18));
  let bestHighScore = -999;
  for (let y = 12; y < height - 14; y += 2) {
    for (let x = 14; x < width - 16; x += 2) {
      const distMain = Math.hypot(x - spawnX, y - spawnY);
      if (distMain < 36 || distMain > 78) continue;
      const t = tiles[y * width + x];
      if ((t.type !== TileType.MEADOW && t.type !== TileType.SAND) || !hasFlat2x2(x, y)) continue;
      let rocks = 0;
      let meadows = 0;
      for (let dy = -7; dy <= 7; dy++) {
        for (let dx = -7; dx <= 7; dx++) {
          const nt = tiles[(y + dy) * width + (x + dx)];
          if (nt.type === TileType.STONE || nt.type === TileType.ORE || nt.type === TileType.COAL) rocks++;
          if (nt.type === TileType.MEADOW) meadows++;
        }
      }
      const score = rocks * 3.1 + Math.min(meadows, 28) * 0.9 - Math.abs(distMain - 48) * 0.4;
      if (score > bestHighScore) {
        bestHighScore = score;
        highX = x;
        highY = y;
      }
    }
  }

  // 3. Find Coastal / Woodland Outpost near shores & groves >= 36 tiles from both
  let coastX = Math.max(18, Math.min(width - 22, spawnX + 38));
  let coastY = Math.max(16, Math.min(height - 20, spawnY + 18));
  let bestCoastScore = -999;
  for (let y = 12; y < height - 14; y += 2) {
    for (let x = 14; x < width - 16; x += 2) {
      const distMain = Math.hypot(x - spawnX, y - spawnY);
      const distHigh = Math.hypot(x - highX, y - highY);
      if (distMain < 36 || distHigh < 36 || distMain > 78) continue;
      const t = tiles[y * width + x];
      if ((t.type !== TileType.MEADOW && t.type !== TileType.SAND) || !hasFlat2x2(x, y)) continue;
      let shore = 0;
      let groves = 0;
      for (let dy = -7; dy <= 7; dy++) {
        for (let dx = -7; dx <= 7; dx++) {
          const nt = tiles[(y + dy) * width + (x + dx)];
          if (nt.type === TileType.SAND || nt.type === TileType.SHALLOW_WATER) shore++;
          if (nt.type === TileType.BERRY_GROVE || nt.type === TileType.FOREST) groves++;
        }
      }
      const score = shore * 1.9 + groves * 1.8 - Math.abs(distMain - 48) * 0.35;
      if (score > bestCoastScore) {
        bestCoastScore = score;
        coastX = x;
        coastY = y;
      }
    }
  }

  // Helper to place resource patch safely OUTSIDE building plazas
  const ensureResourcePatch = (cx: number, cy: number, ox: number, oy: number, rType: TileType, amount: number) => {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const tx = Math.max(2, Math.min(width - 3, cx + ox + dx));
        const ty = Math.max(2, Math.min(height - 3, cy + oy + dy));
        const tile = tiles[ty * width + tx];
        if (tile.type !== TileType.DEEP_WATER && tile.type !== TileType.SHALLOW_WATER) {
          tile.type = rType;
          tile.resourceAmount = amount;
        }
      }
    }
  };

  // Guarantee resources outside each settlement's plaza first, THEN clear plazas & footprints
  ensureResourcePatch(spawnX, spawnY, -7, -4, TileType.FOREST, 24);
  ensureResourcePatch(spawnX, spawnY, 5, -5, TileType.BERRY_GROVE, 20);
  ensureResourcePatch(spawnX, spawnY, 6, 4, TileType.STONE, 35);
  ensureResourcePatch(spawnX, spawnY, -7, 5, TileType.ORE, 30);
  ensureResourcePatch(spawnX, spawnY, -6, 2, TileType.COAL, 32);

  ensureResourcePatch(highX, highY, -6, -5, TileType.STONE, 40);
  ensureResourcePatch(highX, highY, 5, -4, TileType.ORE, 36);
  ensureResourcePatch(highX, highY, 5, 4, TileType.COAL, 36);
  ensureResourcePatch(highX, highY, -6, 4, TileType.FOREST, 20);

  ensureResourcePatch(coastX, coastY, -6, -5, TileType.BERRY_GROVE, 24);
  ensureResourcePatch(coastX, coastY, 5, -5, TileType.BERRY_GROVE, 22);
  ensureResourcePatch(coastX, coastY, 5, 4, TileType.FOREST, 24);
  ensureResourcePatch(coastX, coastY, -6, 4, TileType.STONE, 26);

  clearPlazaForBuildings(tiles, width, height, spawnX, spawnY, 4);
  clearPlazaForBuildings(tiles, width, height, highX, highY, 3);
  clearPlazaForBuildings(tiles, width, height, coastX, coastY, 3);

  let nextIdCounter = 1;

  // Build 3 regional settlements
  const mainSpecialty: SettlementBiomeSpecialty = 'HEARTLAND';
  const settlements: Settlement[] = [
    {
      id: 's_1',
      name: 'Oakhaven Hearth',
      biomeSpecialty: mainSpecialty,
      centerX: spawnX + 1,
      centerY: spawnY + 1,
      hubBuildingId: '',
      primaryExport: 'wood',
      primaryImport: 'ore',
    },
    {
      id: 's_2',
      name: 'Cinderpeak Reach',
      biomeSpecialty: 'HIGHLAND',
      centerX: highX + 1,
      centerY: highY + 1,
      hubBuildingId: '',
      primaryExport: 'ore',
      primaryImport: 'food',
    },
    {
      id: 's_3',
      name: 'Tidewatch Haven',
      biomeSpecialty: 'COASTAL',
      centerX: coastX + 1,
      centerY: coastY + 1,
      hubBuildingId: '',
      primaryExport: 'food',
      primaryImport: 'stone',
    },
  ];

  // Main settlement starts with a completed Campfire hub + a Reed Hut blueprint (immediate hauling & building)
  const mainHub = createBuildingSite(nextIdCounter++, 'CAMPFIRE', spawnX, spawnY, true, 's_1');
  const mainHutBlueprint = createBuildingSite(nextIdCounter++, 'REED_HUT', spawnX - 3, spawnY, false, 's_1');
  settlements[0].hubBuildingId = mainHub.id;

  // Highland Outpost starts with completed Campfire + Reed Hut
  const highHub = createBuildingSite(nextIdCounter++, 'CAMPFIRE', highX, highY, true, 's_2');
  const highHut = createBuildingSite(nextIdCounter++, 'REED_HUT', highX + 3, highY, true, 's_2');
  settlements[1].hubBuildingId = highHub.id;

  // Coastal Outpost starts with completed Campfire + Reed Hut
  const coastHub = createBuildingSite(nextIdCounter++, 'CAMPFIRE', coastX, coastY, true, 's_3');
  const coastHut = createBuildingSite(nextIdCounter++, 'REED_HUT', coastX - 3, coastY, true, 's_3');
  settlements[2].hubBuildingId = coastHub.id;

  const buildings: BuildingSite[] = [mainHub, mainHutBlueprint, highHub, highHut, coastHub, coastHut];
  for (const b of buildings) {
    clearFootprintMargin(tiles, width, height, b.tileX, b.tileY, b.size);
  }

  const humans: HumanAgent[] = [];
  const mainTalents: (TalentId[] | undefined)[] = [
    ['ARCHITECT'],
    ['SCHOLAR'],
    ['FORAGER'],
    undefined,
    ['ARCHITECT'],
    undefined,
  ];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const dist = 1.8 + (i % 2) * 0.8;
    const h = createHuman(
      nextIdCounter++,
      spawnX + 0.8 + Math.cos(angle) * dist,
      spawnY + 0.8 + Math.sin(angle) * dist,
      seed,
      mainTalents[i],
      's_1'
    );
    humans.push(h);
  }

  const highTalents: (TalentId[] | undefined)[] = [['METALLURGIST'], ['ARCHITECT'], undefined];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const h = createHuman(
      nextIdCounter++,
      highX + 1 + Math.cos(angle) * 2.0,
      highY + 1 + Math.sin(angle) * 2.0,
      seed + 19,
      highTalents[i],
      's_2'
    );
    h.homeBuildingId = highHut.id;
    humans.push(h);
  }

  const coastTalents: (TalentId[] | undefined)[] = [['FORAGER'], ['SCHOLAR'], undefined];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const h = createHuman(
      nextIdCounter++,
      coastX + 1 + Math.cos(angle) * 2.0,
      coastY + 1 + Math.sin(angle) * 2.0,
      seed + 43,
      coastTalents[i],
      's_3'
    );
    h.homeBuildingId = coastHut.id;
    humans.push(h);
  }

  const tradeRoutes: TradeRoute[] = [
    {
      id: 'tr_1',
      fromSettlementId: 's_1',
      toSettlementId: 's_2',
      exportResource: 'wood',
      importResource: 'ore',
      active: true,
      completedTrips: 0,
    },
    {
      id: 'tr_2',
      fromSettlementId: 's_1',
      toSettlementId: 's_3',
      exportResource: 'stone',
      importResource: 'food',
      active: true,
      completedTrips: 0,
    },
  ];

  // Initial regional weather fronts across distinct parts of the world
  const weatherZones: WeatherZone[] = [
    {
      id: `w_${nextIdCounter++}`,
      x: Math.max(16, spawnX - 28),
      y: Math.max(14, spawnY - 16),
      radius: 19,
      vx: 0.42,
      vy: 0.14,
      type: 'RAIN',
      intensity: 0.85,
    },
    {
      id: `w_${nextIdCounter++}`,
      x: Math.min(width - 16, spawnX + 30),
      y: 18,
      radius: 17,
      vx: -0.32,
      vy: 0.12,
      type: 'SNOW',
      intensity: 0.8,
    },
    {
      id: `w_${nextIdCounter++}`,
      x: Math.min(width - 18, spawnX + 26),
      y: Math.min(height - 16, spawnY + 22),
      radius: 15,
      vx: -0.48,
      vy: -0.18,
      type: 'STORM',
      intensity: 0.9,
    },
  ];

  return {
    seed,
    preset,
    worldName: generateWorldName(seed),
    width,
    height,
    tiles,
    dirtyTiles: [],
    tick: 0,
    year: 1,
    timeOfDay: 0.25,
    seasonProgress: 0.2,
    weatherZones,
    stormFlash: 0,
    currentEra: 1,
    unlockedTechs: [],
    autoUnlockTech: false,
    clockworkVictoryReached: false,
    stockpile: {
      food: 26,
      wood: 14,
      stone: 8,
      ore: 3,
      coal: 4,
      researchPoints: 0,
    },
    armory: createEmptyArmory(),
    craftOrders: [],
    settlements,
    tradeRoutes,
    mapCurios: [],
    humans,
    automatons: [],
    buildings,
    particles: [],
    nudgeRings: [],
    chronicle: [
      {
        id: 'c_init',
        year: 1,
        text: 'Three regional hamlets light their hearths and establish caravan trails across the realm.',
        category: 'COMMUNITY',
      },
    ],
    discoveries: [],
    lastFestivalYear: 0,
    lastRespawnHalfYear: 0,
    nextIdCounter,
  };
}
