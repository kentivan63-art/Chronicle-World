export enum TileType {
  DEEP_WATER = 0,
  SHALLOW_WATER = 1,
  SAND = 2,
  MEADOW = 3,
  FOREST = 4,
  STONE = 5,
  ORE = 6,
  FARMLAND = 7,
  BERRY_GROVE = 8,
  COAL = 9,
}

export type MapPreset = 'ARCHIPELAGO' | 'RIVER_VALLEY' | 'TWIN_PEAKS';

export type GameScreen = 'TITLE_MENU' | 'PLAYING';

export type ResourceType = 'food' | 'wood' | 'stone' | 'ore' | 'coal';

export type WeatherType = 'CLEAR' | 'RAIN' | 'SNOW' | 'STORM';

export interface WeatherZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  type: 'RAIN' | 'SNOW' | 'STORM';
  intensity: number; // 0.5..1.0
}

export type TalentId =
  | 'ARCHITECT'
  | 'SCHOLAR'
  | 'FORAGER'
  | 'METALLURGIST'
  | 'CLOCKMAKER'
  | 'CIVIC_LEADER';

export type NudgeType =
  | 'CURIOSITY_SPARK'
  | 'COMMUNITY_RALLY'
  | 'HARVEST_DRIVE'
  | 'REST_AND_FEAST';

export type BuildingKind =
  | 'CAMPFIRE'
  | 'REED_HUT'
  | 'FORAGER_CAMP'
  | 'TOTEM_SHRINE'
  | 'WOODCUTTER'
  | 'WELL'
  | 'GRANARY'
  | 'TIMBER_LODGE'
  | 'QUARRY'
  | 'BLACKSMITH'
  | 'WORKSHOP'
  | 'ARMORY_FORGE'
  | 'CIVIC_HALL'
  | 'OBSERVATORY'
  | 'WINDMILL'
  | 'CHRONOMETER_TOWER'
  | 'CLOCKWORK_FOUNDRY';

export type TechId =
  | 'FIRE_MASTERY'
  | 'FLINT_TOOLS'
  | 'STONE_HEARTHS'
  | 'CROP_CULTIVATION'
  | 'TIMBER_JOINERY'
  | 'ARTISAN_SMITHING'
  | 'MASONRY_BASICS'
  | 'SMELTING_CRAFT'
  | 'WEAPON_FORGING'
  | 'CIVIC_CHARTER'
  | 'OPTICS_SURVEY'
  | 'WIND_MECHANICS'
  | 'CHRONOMETRY'
  | 'GEARWORKS_AUTOMATA'
  | 'GRAND_ILLUMINATION';

export type EraId = 1 | 2 | 3 | 4;

export type HumanTaskState =
  | 'IDLE'
  | 'FORAGE'
  | 'CHOP'
  | 'MINE'
  | 'HAUL_TO_SITE'
  | 'BUILD'
  | 'CRAFT'
  | 'PATROL'
  | 'TRADE'
  | 'RESEARCH'
  | 'REST'
  | 'SLEEPING'
  | 'CELEBRATE'
  | 'EXPLORE'
  | 'SOCIALIZE';

export type DiscoveryCategory = 'NATURAL' | 'RELIC' | 'CRAFT' | 'MINERAL' | 'BOTANICAL';

export type DiscoveryAssetId =
  | 'CEDAR_SAP'
  | 'WOOD_TOTEM'
  | 'BARK_HERB'
  | 'FLAX_FIBER'
  | 'OWL_SANCTUARY'
  | 'OBSIDIAN_VEIN'
  | 'AMMONITE_FOSSIL'
  | 'COPPER_SEAM'
  | 'LODESTONE'
  | 'QUARTZ_GEODE'
  | 'SEA_SALT'
  | 'GRIND_COBBLE'
  | 'PEARL_SHELL'
  | 'DRIFTWOOD'
  | 'BERRY_THICKET'
  | 'CLAY_POT'
  | 'SWEET_TUBER'
  | 'STANDING_STONE'
  | 'WILD_HONEY'
  | 'COAL_NODULE'
  | 'STORM_FULGURITE'
  | 'FROST_AMBER';

export interface VillagerDiscovery {
  id: string;
  humanId: string;
  humanName: string;
  title: string;
  description: string;
  category: DiscoveryCategory;
  assetId: DiscoveryAssetId;
  year: number;
  x: number;
  y: number;
  rewardSummary: string;
}

export interface MapCurio {
  id: string;
  x: number;
  y: number;
  assetId: DiscoveryAssetId;
  biomeHint: 'FOREST' | 'ROCKY' | 'SHORE' | 'MEADOW' | 'COAL';
  remainingSec: number;
}

export type SettlementBiomeSpecialty = 'HEARTLAND' | 'WOODLAND' | 'HIGHLAND' | 'COASTAL';

export interface Settlement {
  id: string;
  name: string;
  biomeSpecialty: SettlementBiomeSpecialty;
  centerX: number;
  centerY: number;
  hubBuildingId: string;
  chiefHumanId?: string | null;
  primaryExport: ResourceType;
  primaryImport: ResourceType;
}

export interface TradeRoute {
  id: string;
  fromSettlementId: string;
  toSettlementId: string;
  exportResource: ResourceType;
  importResource: ResourceType;
  active: boolean;
  completedTrips: number;
}

export type CraftedItemKind =
  | 'FLINT_SPEAR'
  | 'STONE_AXE'
  | 'WOVEN_BASKET'
  | 'TIMBER_BOW'
  | 'COPPER_PICKAXE'
  | 'BRONZE_SWORD'
  | 'BRONZE_SHIELD'
  | 'ARTISAN_HAMMER'
  | 'CLOCKWORK_HALBERD'
  | 'PRECISION_WRENCH'
  | 'BRASS_ASTROLABE';

export type CraftedItemRole = 'WEAPON' | 'TOOL' | 'UTILITY';

export interface CraftedItemDef {
  kind: CraftedItemKind;
  name: string;
  era: EraId;
  role: CraftedItemRole;
  craftedAt: BuildingKind[];
  unitCost: ResourceCost;
  workRequired: number;
  bonusSummary: string;
}

export interface CraftOrder {
  id: string;
  itemKind: CraftedItemKind;
  targetQty: number;
  completedQty: number;
  buildingId: string;
  requiredTotal: ResourceCost;
  delivered: ResourceCost;
  progress: number; // 0..100 for current unit
}

export type ToolCategory = 'INSPECT' | 'SPAWN' | 'BLUEPRINT' | 'TALENT' | 'NUDGE';

export interface ResourceCost {
  wood: number;
  stone: number;
  ore: number;
  coal: number;
}

export interface BuildingDefinition {
  kind: BuildingKind;
  name: string;
  era: EraId;
  unlockedByDefault?: boolean;
  unlockedByTech?: TechId;
  footprint: number; // width & height in tiles (e.g. 2 = 2x2)
  cost: ResourceCost;
  workRequired: number;
  housingBonus: number;
  benefitSummary: string;
  accentColor: string;
}

export interface TechDefinition {
  id: TechId;
  name: string;
  era: EraId;
  cost: number;
  requires?: TechId;
  unlocksBuilding?: BuildingKind;
  advancesToEra?: EraId;
  summary: string;
}

export interface TalentDefinition {
  id: TalentId;
  name: string;
  shortTag: string;
  description: string;
  color: string;
}

export interface NudgeDefinition {
  id: NudgeType;
  name: string;
  description: string;
  durationSec: number;
  color: string;
}

export interface HumanAgent {
  id: string;
  name: string;
  age: number;
  x: number; // world tile coordinates (float)
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  walkPhase: number;
  hp: number;
  hunger: number; // 0 = full, 100 = starving
  energy: number; // 0 = exhausted, 100 = rested
  curiosity: number; // 0-100
  iq: number; // 85..155 innate & grown intellect
  leadershipPoints: number; // accumulated civic & caravan leadership
  skinTone: string;
  tunicColor: string;
  talents: TalentId[];
  activeNudge: {
    type: NudgeType;
    remainingSec: number;
  } | null;
  state: HumanTaskState;
  carrying: {
    resource: ResourceType;
    amount: number;
  } | null;
  equippedWeapon: CraftedItemKind | null;
  equippedTool: CraftedItemKind | null;
  craftedCount: number;
  settlementId: string | null;
  tradeState: {
    routeId: string;
    phase: 'TO_DEST' | 'RETURN_HOME';
  } | null;
  homeBuildingId: string | null;
  targetBuildingId: string | null;
  sleepingInBuildingId: string | null;
  targetTile: { x: number; y: number } | null;
  targetResourceTile: { x: number; y: number } | null;
  isCuriousExplorer: boolean;
  discoveries: VillagerDiscovery[];
  thoughtText: string;
  thoughtTimer: number;
  actionTimer: number;
  researchContributed: number;
  buildingsAssisted: number;
}

export interface ClockworkAutomaton {
  id: string;
  x: number;
  y: number;
  facing: 1 | -1;
  gearPhase: number;
  carrying: {
    resource: ResourceType;
    amount: number;
  } | null;
  targetBuildingId: string | null;
  state: 'PATROL' | 'HAUL_TO_SITE' | 'ASSIST_BUILD';
  homeBuildingId: string;
}

export type BuildingStatus = 'BLUEPRINT' | 'UNDER_CONSTRUCTION' | 'COMPLETE';

export interface BuildingSite {
  id: string;
  kind: BuildingKind;
  settlementId?: string | null;
  tileX: number;
  tileY: number;
  size: number;
  status: BuildingStatus;
  required: ResourceCost;
  delivered: ResourceCost;
  buildProgress: number; // 0 to 100
  pulseTimer: number;
  assignedWorkers: number;
  occupantsSleeping: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  text?: string;
}

export interface NudgeRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
}

export interface ChronicleEvent {
  id: string;
  year: number;
  text: string;
  category: 'ERA' | 'TECH' | 'BUILDING' | 'TALENT' | 'COMMUNITY';
}

export interface WorldTile {
  type: TileType;
  elevation: number;
  resourceAmount: number;
  fertility: number; // 0.45..1.55 modulated dynamically by regional weather
  variant: number; // 0-3 deterministic pixel variation
}

export interface CommunityStockpile {
  food: number;
  wood: number;
  stone: number;
  ore: number;
  coal: number;
  researchPoints: number;
}

export interface WorldState {
  seed: number;
  preset: MapPreset;
  worldName: string;
  width: number;
  height: number;
  tiles: WorldTile[];
  dirtyTiles: number[];
  tick: number;
  year: number;
  timeOfDay: number; // 0..1 cycle
  seasonProgress: number; // 0..1 seasonal temperature drift
  weatherZones: WeatherZone[];
  stormFlash: number;
  currentEra: EraId;
  unlockedTechs: TechId[];
  autoUnlockTech: boolean;
  clockworkVictoryReached: boolean;
  stockpile: CommunityStockpile;
  armory: Record<CraftedItemKind, number>;
  craftOrders: CraftOrder[];
  settlements: Settlement[];
  tradeRoutes: TradeRoute[];
  mapCurios: MapCurio[];
  humans: HumanAgent[];
  automatons: ClockworkAutomaton[];
  buildings: BuildingSite[];
  particles: Particle[];
  nudgeRings: NudgeRing[];
  chronicle: ChronicleEvent[];
  discoveries: VillagerDiscovery[];
  lastFestivalYear: number;
  lastRespawnHalfYear: number;
  nextIdCounter: number;
}

export interface CameraState {
  x: number; // world tile center X
  y: number; // world tile center Y
  zoom: number; // 0.4 (bird's-eye) to 5.5 (up-close POV)
  followHumanId: string | null;
}
