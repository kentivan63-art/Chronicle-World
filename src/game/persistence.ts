import { createEmptyArmory } from './constants';
import { WorldState } from './types';

const STORAGE_KEY = 'chronicle_world_save_v1';

interface ElectronBridge {
  isElectron?: boolean;
  platform?: string;
  saveWorldDialog?: (jsonString: string, defaultName: string) => Promise<{ saved: boolean; filePath?: string }>;
  openWorldDialog?: () => Promise<{ opened: boolean; content?: string; filePath?: string }>;
}

export function getDesktopBridge(): ElectronBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { chronicleDesktop?: ElectronBridge };
  return w.chronicleDesktop ?? null;
}

export function serializeWorld(world: WorldState): string {
  // Omit transient particles/dirtyTiles to keep snapshots clean
  const clean: WorldState = {
    ...world,
    dirtyTiles: [],
    particles: [],
    nudgeRings: [],
  };
  return JSON.stringify(clean);
}

export function parseWorldSnapshot(raw: string): WorldState | null {
  try {
    const parsed = JSON.parse(raw) as WorldState;
    if (!parsed || !Array.isArray(parsed.tiles) || !Array.isArray(parsed.humans)) {
      return null;
    }
    parsed.dirtyTiles = [];
    parsed.particles = [];
    parsed.nudgeRings = [];
    if (!Array.isArray(parsed.discoveries)) parsed.discoveries = [];
    for (const d of parsed.discoveries) {
      if (!d.assetId) d.assetId = 'AMMONITE_FOSSIL';
    }
    if (typeof parsed.lastFestivalYear !== 'number') parsed.lastFestivalYear = 0;
    if (typeof parsed.lastRespawnHalfYear !== 'number') {
      parsed.lastRespawnHalfYear = Math.floor((parsed.tick ?? 0) / 180);
    }
    if (typeof parsed.seasonProgress !== 'number') parsed.seasonProgress = 0.2;
    if (!Array.isArray(parsed.weatherZones)) parsed.weatherZones = [];
    if (typeof parsed.stormFlash !== 'number') parsed.stormFlash = 0;
    if (typeof parsed.stockpile.coal !== 'number') parsed.stockpile.coal = 4;
    if (!parsed.armory) parsed.armory = createEmptyArmory();
    if (!Array.isArray(parsed.craftOrders)) parsed.craftOrders = [];
    if (!Array.isArray(parsed.mapCurios)) parsed.mapCurios = [];
    if (!Array.isArray(parsed.tradeRoutes)) parsed.tradeRoutes = [];
    if (!Array.isArray(parsed.settlements)) {
      const firstB = Array.isArray(parsed.buildings) ? parsed.buildings[0] : undefined;
      parsed.settlements = firstB
        ? [
            {
              id: 's_1',
              name: 'Oakhaven Hearth',
              biomeSpecialty: 'HEARTLAND',
              centerX: firstB.tileX + 1,
              centerY: firstB.tileY + 1,
              hubBuildingId: firstB.id,
              primaryExport: 'wood',
              primaryImport: 'ore',
            },
          ]
        : [];
    }
    for (const t of parsed.tiles) {
      if (typeof t.fertility !== 'number') t.fertility = 1.0;
    }
    for (const s of parsed.settlements) {
      if (s.chiefHumanId === undefined) s.chiefHumanId = null;
    }
    const defaultSettlementId = parsed.settlements[0]?.id ?? null;
    for (const h of parsed.humans) {
      if (h.sleepingInBuildingId === undefined) h.sleepingInBuildingId = null;
      if (h.homeBuildingId === undefined) h.homeBuildingId = null;
      if (h.targetResourceTile === undefined) h.targetResourceTile = null;
      if (h.isCuriousExplorer === undefined) h.isCuriousExplorer = false;
      if (h.equippedWeapon === undefined) h.equippedWeapon = null;
      if (h.equippedTool === undefined) h.equippedTool = null;
      if (typeof h.craftedCount !== 'number') h.craftedCount = 0;
      if (typeof h.iq !== 'number') {
        h.iq = 95 + (h.talents?.length ?? 0) * 10;
      }
      if (typeof h.leadershipPoints !== 'number') {
        h.leadershipPoints = h.talents?.includes('CIVIC_LEADER') ? 12 : 2;
      }
      if (h.settlementId === undefined) h.settlementId = defaultSettlementId;
      if (h.tradeState === undefined) h.tradeState = null;
      if (!Array.isArray(h.discoveries)) {
        h.discoveries = [];
      } else {
        for (const d of h.discoveries) {
          if (!d.assetId) d.assetId = 'AMMONITE_FOSSIL';
        }
      }
    }
    if (Array.isArray(parsed.buildings)) {
      for (const b of parsed.buildings) {
        if (b.occupantsSleeping === undefined) b.occupantsSleeping = 0;
        if (b.settlementId === undefined) b.settlementId = defaultSettlementId;
        if (typeof b.required.coal !== 'number') b.required.coal = 0;
        if (typeof b.delivered.coal !== 'number') b.delivered.coal = 0;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveWorldToLocalStorage(world: WorldState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, serializeWorld(world));
    return true;
  } catch {
    return false;
  }
}

export function loadWorldFromLocalStorage(): WorldState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseWorldSnapshot(raw);
  } catch {
    return null;
  }
}

export function hasSavedWorld(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export async function exportWorldSnapshot(world: WorldState): Promise<boolean> {
  const json = serializeWorld(world);
  const filename = `${world.worldName.toLowerCase().replace(/\s+/g, '-')}-yr${world.year}.json`;
  const bridge = getDesktopBridge();

  if (bridge?.isElectron && bridge.saveWorldDialog) {
    const res = await bridge.saveWorldDialog(json, filename);
    return res.saved;
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
