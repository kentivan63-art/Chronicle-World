import {
  BASE_TILE_PX,
  BUILDING_DEFS,
  NUDGE_DEFS,
  TALENT_DEFS,
} from './constants';
import {
  getAutomatonSprite,
  getBerryBushSprite,
  getBuildingSprite,
  getCoalSprite,
  getCraftedItemSprite,
  getDiscoverySprite,
  getHumanSprite,
  getOreSprite,
  getStoneSprite,
  getStumpSprite,
  getTreeSprite,
  getWoodPileSprite,
  HumanPose,
} from './pixelSprites';
import { canPlaceBlueprint, getWeatherAt } from './simulation';
import {
  BuildingKind,
  BuildingSite,
  CameraState,
  EraId,
  HumanAgent,
  NudgeType,
  TalentId,
  TileType,
  ToolCategory,
  WorldState,
} from './types';

export interface RenderHoverContext {
  toolCategory: ToolCategory;
  selectedBlueprint: BuildingKind;
  selectedTalent: TalentId;
  selectedNudge: NudgeType;
  hoverTileX: number | null;
  hoverTileY: number | null;
  selectedHumanId: string | null;
  selectedBuildingId: string | null;
  selectedTileCoords?: { tx: number; ty: number } | null;
}

const TEXEL_SCALE = 2; // 8x8 crisp pixel texels per 16x16 tile -> matches human/tree pixel density
const TEXELS_PER_TILE = BASE_TILE_PX / TEXEL_SCALE; // 8

function isWater(type?: TileType): boolean {
  return type === TileType.DEEP_WATER || type === TileType.SHALLOW_WATER;
}

function isHighland(type?: TileType): boolean {
  return type === TileType.STONE || type === TileType.ORE || type === TileType.COAL;
}

// Fast deterministic integer hash -> 0..1
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function computeLightFactors(timeOfDay: number): {
  nightDim: number;
  warmDusk: number;
} {
  let nightDim = 0;
  let warmDusk = 0;

  if (timeOfDay < 0.14) {
    const t = timeOfDay / 0.14;
    nightDim = 0.56 * (1 - t);
    warmDusk = Math.sin(t * Math.PI) * 0.22;
  } else if (timeOfDay < 0.62) {
    nightDim = 0;
    warmDusk = 0;
  } else if (timeOfDay < 0.74) {
    const t = (timeOfDay - 0.62) / 0.12;
    nightDim = t * 0.58;
    warmDusk = Math.sin(t * Math.PI) * 0.26;
  } else if (timeOfDay < 0.96) {
    nightDim = 0.58;
    warmDusk = 0;
  } else {
    const t = (timeOfDay - 0.96) / 0.04;
    nightDim = 0.58 - t * 0.02;
    warmDusk = t * 0.08;
  }

  return { nightDim, warmDusk };
}

export class WorldRenderer {
  private terrainCanvas: HTMLCanvasElement;
  private terrainCtx: CanvasRenderingContext2D;
  private terrainImg: ImageData | null = null;
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;
  private cachedSeed = -1;

  constructor() {
    this.terrainCanvas = document.createElement('canvas');
    const ctx = this.terrainCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create offscreen 2D context');
    ctx.imageSmoothingEnabled = false;
    this.terrainCtx = ctx;

    this.lightCanvas = document.createElement('canvas');
    const lctx = this.lightCanvas.getContext('2d');
    if (!lctx) throw new Error('Could not create offscreen light context');
    this.lightCtx = lctx;
  }

  private sampleTile(world: WorldState, tx: number, ty: number): TileType {
    const cx = Math.max(0, Math.min(world.width - 1, tx));
    const cy = Math.max(0, Math.min(world.height - 1, ty));
    return world.tiles[cy * world.width + cx].type;
  }

  // Sample 2-octave domain-warped continuous biome so organic curves replace square tile corners
  private sampleWarpedBiome(world: WorldState, gx: number, gy: number): TileType {
    const wx =
      (smoothNoise(gx * 0.34, gy * 0.34, world.seed + 19) - 0.5) * 1.18 +
      (smoothNoise(gx * 1.15, gy * 1.15, world.seed + 47) - 0.5) * 0.48;
    const wy =
      (smoothNoise(gx * 0.34, gy * 0.34, world.seed + 73) - 0.5) * 1.18 +
      (smoothNoise(gx * 1.15, gy * 1.15, world.seed + 109) - 0.5) * 0.48;
    const sx = Math.floor(gx + wx);
    const sy = Math.floor(gy + wy);
    return this.sampleTile(world, sx, sy);
  }

  private paintTerrainRegion(
    world: WorldState,
    minPx: number,
    minPy: number,
    maxPx: number,
    maxPy: number
  ): void {
    const w = this.terrainCanvas.width;
    const h = this.terrainCanvas.height;
    if (!this.terrainImg) {
      this.terrainImg = this.terrainCtx.createImageData(w, h);
    }
    const data = this.terrainImg.data;
    const seed = world.seed;

    const x0 = Math.max(0, minPx);
    const y0 = Math.max(0, minPy);
    const x1 = Math.min(w - 1, maxPx);
    const y1 = Math.min(h - 1, maxPy);

    for (let py = y0; py <= y1; py++) {
      const gy = (py + 0.5) / TEXELS_PER_TILE;
      for (let px = x0; px <= x1; px++) {
        const gx = (px + 0.5) / TEXELS_PER_TILE;

        // Exact tile for strict farmland, warped tile for organic natural biomes
        const exactType = this.sampleTile(world, Math.floor(gx), Math.floor(gy));
        const type =
          exactType === TileType.FARMLAND
            ? TileType.FARMLAND
            : this.sampleWarpedBiome(world, gx, gy);

        // Multi-scale continuous noise (zero repeating Bayer checkerboard blocks!)
        const patch = smoothNoise(gx * 0.28, gy * 0.28, seed + 211);
        const detail = smoothNoise(gx * 1.45, gy * 1.45, seed + 331);
        const micro = hash2(px, py, seed + 503);
        const orgBlend = patch * 0.62 + detail * 0.26 + (micro - 0.5) * 0.14;

        let r = 80;
        let g = 130;
        let b = 60;

        if (type === TileType.DEEP_WATER) {
          if (orgBlend < 0.34) {
            r = 18; g = 50; b = 88;
          } else if (orgBlend < 0.7) {
            r = 22; g = 61; b = 104;
          } else {
            r = 27; g = 73; b = 122;
          }
          if (micro > 0.962) {
            r = 38; g = 92; b = 144;
          }
        } else if (type === TileType.SHALLOW_WATER) {
          const nLand =
            !isWater(this.sampleWarpedBiome(world, gx, gy - 0.26)) ||
            !isWater(this.sampleWarpedBiome(world, gx, gy + 0.26)) ||
            !isWater(this.sampleWarpedBiome(world, gx - 0.26, gy)) ||
            !isWater(this.sampleWarpedBiome(world, gx + 0.26, gy));
          if (nLand) {
            if (detail > 0.52 || micro > 0.58) {
              r = 176; g = 232; b = 250;
            } else {
              r = 76; g = 169; b = 204;
            }
          } else {
            if (orgBlend < 0.38) {
              r = 35; g = 99; b = 138;
            } else if (orgBlend < 0.74) {
              r = 45; g = 119; b = 161;
            } else {
              r = 56; g = 138; b = 181;
            }
          }
        } else if (type === TileType.SAND) {
          const nearMeadow =
            this.sampleWarpedBiome(world, gx, gy - 0.34) === TileType.MEADOW ||
            this.sampleWarpedBiome(world, gx - 0.34, gy) === TileType.MEADOW;
          if (nearMeadow && detail + (micro - 0.5) * 0.25 > 0.58) {
            r = 96; g = 148; b = 66;
          } else {
            if (orgBlend < 0.34) {
              r = 210; g = 174; b = 108;
            } else if (orgBlend < 0.72) {
              r = 228; g = 195; b = 130;
            } else {
              r = 240; g = 212; b = 152;
            }
            if (micro > 0.965) {
              r = 176; g = 138; b = 82;
            }
          }
        } else if (type === TileType.MEADOW || type === TileType.BERRY_GROVE) {
          if (orgBlend < 0.25) {
            r = 68; g = 115; b = 52;
          } else if (orgBlend < 0.55) {
            r = 86; g = 138; b = 63;
          } else if (orgBlend < 0.8) {
            r = 104; g = 156; b = 72;
          } else {
            r = 142; g = 170; b = 76;
          }
          if (micro > 0.98 && type === TileType.MEADOW) {
            r = 245; g = 224; b = 118;
          } else if (micro < 0.04) {
            r = 52; g = 92; b = 42;
          }
        } else if (type === TileType.FOREST) {
          if (orgBlend < 0.45) {
            r = 42; g = 84; b = 45;
          } else if (orgBlend < 0.8) {
            r = 56; g = 105; b = 54;
          } else {
            r = 72; g = 122; b = 61;
          }
          if (micro > 0.945) {
            r = 105; g = 74; b = 48;
          }
        } else if (type === TileType.FARMLAND) {
          const furrow = py % 3 === 0;
          if (furrow) {
            r = 96; g = 64; b = 34;
          } else if ((px + py) % 3 === 0 && micro > 0.3) {
            r = 228; g = 178; b = 44;
          } else {
            r = 138; g = 97; b = 52;
          }
        } else {
          // STONE & ORE: Natural weathered slate-grey highlands, mossy gravel edge & craggy ledges
          const southType = this.sampleWarpedBiome(world, gx, gy + 0.46);
          const northType = this.sampleWarpedBiome(world, gx, gy - 0.34);
          const westType = this.sampleWarpedBiome(world, gx - 0.34, gy);
          const eastType = this.sampleWarpedBiome(world, gx + 0.34, gy);
          const isSouthCliff = !isHighland(southType);
          const isNorthRim = !isHighland(northType);
          const isSideTransition = !isHighland(westType) || !isHighland(eastType);

          if (isSouthCliff) {
            // Stratified dark granite cliff face with craggy pixel fissures
            const strata = (px + Math.floor(detail * 4)) % 3 === 0;
            const seam = smoothNoise(gx * 2.1, gy * 1.4, seed + 619);
            if (seam < 0.32 || strata) {
              r = 48; g = 50; b = 56;
            } else if (seam < 0.72) {
              r = 72; g = 74; b = 80;
            } else {
              r = 92; g = 92; b = 96;
            }
          } else if (isNorthRim) {
            // Sunlit weathered limestone rim with patchy grass lichen
            if (detail > 0.68 && northType === TileType.MEADOW) {
              r = 104; g = 128; b = 78;
            } else {
              r = 158; g = 158; b = 152;
            }
          } else if (isSideTransition && detail > 0.56) {
            // Mossy gravel blend where highland stone meets grass
            r = 96; g = 114; b = 76;
          } else {
            // Natural rocky earth & slate gravel surface (no flat brown checkerboard!)
            const strataNoise = smoothNoise(gx * 2.2, gy * 2.2, seed + 733);
            const rocky = orgBlend * 0.65 + strataNoise * 0.35;
            if (rocky < 0.28) {
              r = 84; g = 86; b = 88;
            } else if (rocky < 0.55) {
              r = 106; g = 108; b = 106;
            } else if (rocky < 0.8) {
              r = 126; g = 127; b = 122;
            } else {
              // Subtle warm mossy-slate earth accent
              r = 114; g = 118; b = 98;
            }
            if (micro < 0.055) {
              // Tiny dark rock crack
              r = 62; g = 64; b = 68;
            } else if (micro > 0.965) {
              // Light quartz pebble speck
              r = 156; g = 160; b = 162;
            }
            if (type === TileType.ORE) {
              const seam = smoothNoise(gx * 1.5, gy * 1.5, seed + 887);
              if (seam > 0.71) {
                r = micro > 0.48 ? 235 : 196;
                g = micro > 0.48 ? 182 : 122;
                b = micro > 0.48 ? 64 : 44;
              }
            } else if (type === TileType.COAL) {
              const seam = smoothNoise(gx * 1.6, gy * 1.6, seed + 953);
              if (seam > 0.46) {
                r = micro > 0.65 ? 62 : 34;
                g = micro > 0.65 ? 68 : 37;
                b = micro > 0.65 ? 82 : 44;
              } else {
                r = Math.max(44, r - 38);
                g = Math.max(46, g - 38);
                b = Math.max(52, b - 34);
              }
            }
          }
        }

        const idx = (py * w + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    this.terrainCtx.putImageData(this.terrainImg, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  private syncTerrainCache(world: WorldState): void {
    const targetW = world.width * TEXELS_PER_TILE;
    const targetH = world.height * TEXELS_PER_TILE;

    if (
      this.cachedSeed !== world.seed ||
      this.terrainCanvas.width !== targetW ||
      this.terrainCanvas.height !== targetH
    ) {
      this.terrainCanvas.width = targetW;
      this.terrainCanvas.height = targetH;
      this.terrainImg = null;
      this.cachedSeed = world.seed;
      this.paintTerrainRegion(world, 0, 0, targetW - 1, targetH - 1);
      world.dirtyTiles.length = 0;
    } else if (world.dirtyTiles.length > 0) {
      while (world.dirtyTiles.length > 0) {
        const idx = world.dirtyTiles.pop()!;
        const tx = idx % world.width;
        const ty = Math.floor(idx / world.width);
        const pad = TEXELS_PER_TILE;
        this.paintTerrainRegion(
          world,
          tx * TEXELS_PER_TILE - pad,
          ty * TEXELS_PER_TILE - pad,
          (tx + 1) * TEXELS_PER_TILE + pad,
          (ty + 1) * TEXELS_PER_TILE + pad
        );
      }
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    viewportW: number,
    viewportH: number,
    world: WorldState,
    camera: CameraState,
    hover: RenderHoverContext,
    animTimeSec: number
  ): void {
    this.syncTerrainCache(world);

    const { nightDim, warmDusk } = computeLightFactors(world.timeOfDay);
    const hasIllumination = world.unlockedTechs.includes('GRAND_ILLUMINATION');

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Deep ocean backdrop
    ctx.fillStyle = '#0f2744';
    ctx.fillRect(0, 0, viewportW, viewportH);

    const tileScreenPx = BASE_TILE_PX * camera.zoom;
    const offsetX = viewportW / 2 - camera.x * tileScreenPx;
    const offsetY = viewportH / 2 - camera.y * tileScreenPx;

    ctx.translate(offsetX, offsetY);
    ctx.scale(camera.zoom, camera.zoom);

    // 1. Draw seamless domain-warped pixel-art ground (scaled 2x cleanly with pixelated filtering)
    ctx.drawImage(
      this.terrainCanvas,
      0,
      0,
      world.width * BASE_TILE_PX,
      world.height * BASE_TILE_PX
    );

    const minTileX = Math.max(0, Math.floor(-offsetX / tileScreenPx) - 1);
    const maxTileX = Math.min(world.width - 1, Math.ceil((viewportW - offsetX) / tileScreenPx) + 1);
    const minTileY = Math.max(0, Math.floor(-offsetY / tileScreenPx) - 1);
    const maxTileY = Math.min(world.height - 1, Math.ceil((viewportH - offsetY) / tileScreenPx) + 1);

    // 2. Animated Water Ripples & Regional Weather Ground Shading (Frost / Rain Sheen)
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        const tile = world.tiles[ty * world.width + tx];
        const px = tx * BASE_TILE_PX;
        const py = ty * BASE_TILE_PX;
        if (tile.type === TileType.SHALLOW_WATER || tile.type === TileType.DEEP_WATER) {
          const wave = Math.sin(animTimeSec * 2.0 + tx * 0.65 + ty * 0.45);
          if (wave > 0.74) {
            ctx.fillStyle =
              tile.type === TileType.SHALLOW_WATER
                ? 'rgba(214, 244, 255, 0.34)'
                : 'rgba(125, 211, 252, 0.14)';
            ctx.fillRect(px + 3, py + 7, 7, 1);
            ctx.fillRect(px + 5, py + 8, 3, 1);
          }
        } else {
          const wInfo = getWeatherAt(world, tx + 0.5, ty + 0.5);
          if (wInfo.type === 'SNOW') {
            ctx.fillStyle = `rgba(226, 242, 255, ${(0.18 + wInfo.intensity * 0.16).toFixed(2)})`;
            ctx.fillRect(px, py, BASE_TILE_PX, BASE_TILE_PX);
          } else if (wInfo.type === 'RAIN' || wInfo.type === 'STORM') {
            ctx.fillStyle = `rgba(14, 34, 60, ${(wInfo.type === 'STORM' ? 0.2 : 0.11).toFixed(2)})`;
            ctx.fillRect(px, py, BASE_TILE_PX, BASE_TILE_PX);
          }
          if (tile.fertility > 1.18 && tile.type === TileType.MEADOW) {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.08)';
            ctx.fillRect(px, py, BASE_TILE_PX, BASE_TILE_PX);
          }
        }
      }
    }

    // 3. Bird's-eye territory aura & Nudge shockwave rings (ground overlays)
    if (camera.zoom < 1.55) {
      for (const b of world.buildings) {
        if (b.status !== 'COMPLETE') continue;
        const cx = (b.tileX + b.size / 2) * BASE_TILE_PX;
        const cy = (b.tileY + b.size / 2) * BASE_TILE_PX;
        ctx.fillStyle = 'rgba(234, 179, 8, 0.08)';
        ctx.beginPath();
        ctx.arc(cx, cy, BASE_TILE_PX * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const ring of world.nudgeRings) {
      const alpha = Math.max(0, 1 - ring.life / ring.maxLife);
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = 2 / Math.max(0.6, camera.zoom);
      ctx.beginPath();
      ctx.arc(ring.x * BASE_TILE_PX, ring.y * BASE_TILE_PX, ring.radius * BASE_TILE_PX, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 4. Unified Y-Sorted World Drawables (Trees, Stumps, Berry Bushes, Boulders, Buildings, Automatons, Humans)
    const buildingTileKeys = new Set<number>();
    for (const b of world.buildings) {
      for (let dy = 0; dy < b.size; dy++) {
        for (let dx = 0; dx < b.size; dx++) {
          buildingTileKeys.add((b.tileY + dy) * world.width + (b.tileX + dx));
        }
      }
    }

    // Subtle Caravan Trade Route lines under entities
    for (const route of world.tradeRoutes) {
      if (!route.active) continue;
      const fromS = world.settlements.find((s) => s.id === route.fromSettlementId);
      const toS = world.settlements.find((s) => s.id === route.toSettlementId);
      if (!fromS || !toS) continue;
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.34)';
      ctx.lineWidth = Math.max(0.8, 1.35 / Math.max(0.5, camera.zoom));
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -animTimeSec * 8;
      ctx.beginPath();
      ctx.moveTo(fromS.centerX * BASE_TILE_PX, fromS.centerY * BASE_TILE_PX);
      ctx.lineTo(toS.centerX * BASE_TILE_PX, toS.centerY * BASE_TILE_PX);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    const drawables: { footY: number; draw: () => void }[] = [];
    const padMinX = Math.max(0, minTileX - 2);
    const padMaxX = Math.min(world.width - 1, maxTileX + 2);
    const padMinY = Math.max(0, minTileY - 2);
    const padMaxY = Math.min(world.height - 1, maxTileY + 2);
    const stumpSprite = getStumpSprite();

    for (let ty = padMinY; ty <= padMaxY; ty++) {
      for (let tx = padMinX; tx <= padMaxX; tx++) {
        const tileIdx = ty * world.width + tx;
        if (buildingTileKeys.has(tileIdx)) continue;
        const tile = world.tiles[tileIdx];
        const baseX = tx * BASE_TILE_PX + BASE_TILE_PX * 0.5;
        const baseY = ty * BASE_TILE_PX + BASE_TILE_PX * 0.5;

        if (tile.type === TileType.FOREST && tile.resourceAmount > 0) {
          // Break grid alignment: keep offsets clear of adjacent water
          const leftWater = isWater(this.sampleTile(world, tx - 1, ty));
          const rightWater = isWater(this.sampleTile(world, tx + 1, ty));
          const topWater = isWater(this.sampleTile(world, tx, ty - 1));
          const bottomWater = isWater(this.sampleTile(world, tx, ty + 1));

          const clampJitterX = (jx: number) => {
            if (leftWater && jx < -2) return -2;
            if (rightWater && jx > 2) return 2;
            return jx;
          };
          const clampJitterY = (jy: number) => {
            if (topWater && jy < -2) return -2;
            if (bottomWater && jy > 2) return 2;
            return jy;
          };

          const h1 = hash2(tx, ty, world.seed + 101);
          const h2 = hash2(tx, ty, world.seed + 223);
          const h3 = hash2(tx, ty, world.seed + 349);
          const h4 = hash2(tx, ty, world.seed + 467);
          const biomeSpecies = smoothNoise(tx * 0.22, ty * 0.22, world.seed + 613);

          const jx1 = clampJitterX((h1 - 0.5) * 13);
          const jy1 = clampJitterY((h2 - 0.5) * 11);
          const rootX1 = baseX + jx1;
          const rootY1 = baseY + jy1 + 3;

          if (tile.resourceAmount >= 7) {
            // Natural species clustering: highland pine near ridges/cool patches, oak & birch in groves
            const species1 =
              biomeSpecies > 0.64
                ? 1
                : biomeSpecies < 0.28
                  ? 2
                  : Math.floor(h3 * 3) % 3;
            const scale1 = 0.88 + h4 * 0.34;
            const flip1 = h3 > 0.5;
            const treeSprite1 = getTreeSprite(species1, flip1);
            const drawW1 = treeSprite1.width * 0.72 * scale1;
            const drawH1 = treeSprite1.height * 0.76 * scale1;
            const sway1 =
              camera.zoom >= 1.2
                ? Math.sin(animTimeSec * 1.55 + tx * 0.9 + ty * 0.7) * 0.45
                : 0;

            drawables.push({
              footY: rootY1,
              draw: () => {
                ctx.fillStyle = 'rgba(12, 20, 14, 0.28)';
                ctx.fillRect(
                  Math.round(rootX1 - drawW1 * 0.34),
                  Math.round(rootY1 - 1.5),
                  Math.round(drawW1 * 0.68),
                  3
                );
                ctx.drawImage(
                  treeSprite1,
                  Math.round(rootX1 - drawW1 / 2 + sway1),
                  Math.round(rootY1 - drawH1 + 1),
                  Math.round(drawW1),
                  Math.round(drawH1)
                );
              },
            });

            // Second element in the tile: dense forest has a companion sapling/tree; logged forest shows a fresh cut stump
            const jx2 = clampJitterX((jx1 >= 0 ? -1 : 1) * (3 + h4 * 4));
            const jy2 = clampJitterY((jy1 >= 0 ? -1 : 1) * (2.5 + h3 * 3.5));
            const rootX2 = baseX + jx2;
            const rootY2 = baseY + jy2 + 3;

            if (tile.resourceAmount >= 15) {
              const species2 = h4 > 0.42 ? 3 : (species1 + 1) % 3;
              const scale2 = 0.68 + h1 * 0.24;
              const treeSprite2 = getTreeSprite(species2, !flip1);
              const drawW2 = treeSprite2.width * 0.7 * scale2;
              const drawH2 = treeSprite2.height * 0.74 * scale2;
              const sway2 =
                camera.zoom >= 1.2
                  ? Math.sin(animTimeSec * 1.7 + tx * 1.3 + ty * 0.5) * 0.35
                  : 0;

              drawables.push({
                footY: rootY2,
                draw: () => {
                  ctx.fillStyle = 'rgba(12, 20, 14, 0.24)';
                  ctx.fillRect(
                    Math.round(rootX2 - drawW2 * 0.32),
                    Math.round(rootY2 - 1),
                    Math.round(drawW2 * 0.64),
                    2.5
                  );
                  ctx.drawImage(
                    treeSprite2,
                    Math.round(rootX2 - drawW2 / 2 + sway2),
                    Math.round(rootY2 - drawH2 + 1),
                    Math.round(drawW2),
                    Math.round(drawH2)
                  );
                },
              });
            } else {
              // Harvested stump beside remaining tree
              drawables.push({
                footY: rootY2,
                draw: () => {
                  ctx.fillStyle = 'rgba(12, 20, 14, 0.22)';
                  ctx.fillRect(Math.round(rootX2 - 4), Math.round(rootY2 - 1), 8, 2);
                  ctx.drawImage(stumpSprite, Math.round(rootX2 - 5), Math.round(rootY2 - 5), 10, 6);
                },
              });
            }
          } else {
            // Nearly depleted timber patch (< 7 wood): cut stumps & stacked logs
            const jx2 = clampJitterX((jx1 >= 0 ? -1 : 1) * (3 + h4 * 3.5));
            const jy2 = clampJitterY((jy1 >= 0 ? -1 : 1) * (2.5 + h3 * 3));
            drawables.push({
              footY: rootY1,
              draw: () => {
                ctx.fillStyle = 'rgba(12, 20, 14, 0.24)';
                ctx.fillRect(Math.round(rootX1 - 4.5), Math.round(rootY1 - 1), 9, 2);
                ctx.drawImage(stumpSprite, Math.round(rootX1 - 5), Math.round(rootY1 - 5.5), 11, 6);
              },
            });
            if (tile.resourceAmount >= 3) {
              const rx2 = baseX + jx2;
              const ry2 = baseY + jy2 + 3;
              const woodPile = getWoodPileSprite();
              drawables.push({
                footY: ry2,
                draw: () => {
                  ctx.fillStyle = 'rgba(12, 20, 14, 0.2)';
                  ctx.fillRect(Math.round(rx2 - 4), Math.round(ry2 - 1), 8, 2);
                  ctx.drawImage(woodPile, Math.round(rx2 - 6), Math.round(ry2 - 5), 11, 5);
                },
              });
            }
          }
        } else if (tile.type === TileType.BERRY_GROVE && tile.resourceAmount > 0) {
          // Organic scattered berry thicket (1-3 shrubs, ripe vs picked based on resourceAmount)
          const shrubCount = tile.resourceAmount >= 12 ? 3 : tile.resourceAmount >= 5 ? 2 : 1;
          for (let i = 0; i < shrubCount; i++) {
            const hA = hash2(tx * 3 + i, ty * 5 + i, world.seed + 701);
            const hB = hash2(tx * 7 + i, ty * 2 + i, world.seed + 811);
            const angle = i * 2.1 + hA * 1.4;
            const radius = shrubCount === 1 ? hB * 2.5 : 2.5 + hB * 4.5;
            const sx = baseX + Math.cos(angle) * radius;
            const sy = baseY + Math.sin(angle) * radius * 0.8 + 2;
            const ripe = tile.resourceAmount >= 8 || (tile.resourceAmount >= 4 && i === 0);
            const sprite = getBerryBushSprite(Math.floor(hA * 10) + i, ripe);
            const scale = 0.72 + hB * 0.25;
            const sw = Math.round(sprite.width * scale);
            const sh = Math.round(sprite.height * scale);

            drawables.push({
              footY: sy,
              draw: () => {
                ctx.fillStyle = 'rgba(12, 20, 14, 0.2)';
                ctx.fillRect(Math.round(sx - sw * 0.36), Math.round(sy - 1), Math.round(sw * 0.72), 2);
                ctx.drawImage(sprite, Math.round(sx - sw / 2), Math.round(sy - sh + 1), sw, sh);
              },
            });
          }
        } else if (
          (tile.type === TileType.STONE || tile.type === TileType.ORE || tile.type === TileType.COAL) &&
          tile.resourceAmount > 0
        ) {
          // Realistic craggy stone boulders, mineral-vein ore & anthracite coal outcrops
          const isOre = tile.type === TileType.ORE;
          const isCoal = tile.type === TileType.COAL;
          const rich = tile.resourceAmount >= 15;
          const rockCount = tile.resourceAmount >= 24 ? 2 : 1;
          for (let i = 0; i < rockCount; i++) {
            const hA = hash2(tx * 5 + i, ty * 3 + i, world.seed + 919);
            const hB = hash2(tx * 2 + i, ty * 7 + i, world.seed + 977);
            if (i === 1 && hA < 0.35) continue;
            const angle = i * 2.6 + hA * 1.6;
            const radius = rockCount === 1 ? hB * 3.5 : 2.2 + hB * 4.2;
            const rx = baseX + Math.cos(angle) * radius;
            const ry = baseY + Math.sin(angle) * radius * 0.8 + 2;
            const sprite = isCoal
              ? getCoalSprite(Math.floor(hA * 10) + i, rich)
              : isOre
                ? getOreSprite(Math.floor(hA * 10) + i, rich)
                : getStoneSprite(Math.floor(hA * 10) + i, rich);
            const scale = i === 0 ? 0.74 + hB * 0.24 : 0.54 + hB * 0.18;
            const rw = Math.round(sprite.width * scale);
            const rh = Math.round(sprite.height * scale);

            drawables.push({
              footY: ry,
              draw: () => {
                ctx.fillStyle = 'rgba(18, 12, 14, 0.26)';
                ctx.fillRect(Math.round(rx - rw * 0.36), Math.round(ry - 1), Math.round(rw * 0.72), 2);
                ctx.drawImage(sprite, Math.round(rx - rw / 2), Math.round(ry - rh + 1), rw, rh);
              },
            });
          }
        }
      }
    }

    for (const b of world.buildings) {
      drawables.push({
        footY: (b.tileY + b.size) * BASE_TILE_PX - 1,
        draw: () => {
          this.drawBuilding(
            ctx,
            b,
            camera.zoom,
            animTimeSec,
            b.id === hover.selectedBuildingId,
            nightDim
          );
        },
      });
    }

    for (const auto of world.automatons) {
      drawables.push({
        footY: auto.y * BASE_TILE_PX,
        draw: () => {
          const ax = auto.x * BASE_TILE_PX;
          const ay = auto.y * BASE_TILE_PX;
          ctx.fillStyle = 'rgba(0,0,0,0.32)';
          ctx.fillRect(ax - 5, ay + 2, 10, 2);
          const frame = Math.sin(auto.gearPhase) > 0 ? 0 : 1;
          const sprite = getAutomatonSprite(frame);
          ctx.drawImage(sprite, Math.round(ax - 7), Math.round(ay - 7), 14, 9);
          if (auto.carrying) {
            ctx.fillStyle = auto.carrying.resource === 'wood' ? '#92400e' : '#cbd5e1';
            ctx.fillRect(Math.round(ax - 3), Math.round(ay - 10), 6, 3);
          }
        },
      });
    }

    const chiefIds = new Set(
      world.settlements.map((s) => s.chiefHumanId).filter(Boolean) as string[]
    );
    const sortedHumans = [...world.humans].sort((a, b) => a.y - b.y);
    for (const h of sortedHumans) {
      if (h.state === 'SLEEPING' && h.sleepingInBuildingId) {
        const b = world.buildings.find((site) => site.id === h.sleepingInBuildingId);
        if (b && b.kind !== 'CAMPFIRE') continue;
      }
      const isChief = chiefIds.has(h.id);
      drawables.push({
        footY: h.y * BASE_TILE_PX,
        draw: () => {
          this.drawHuman(
            ctx,
            h,
            world.currentEra,
            camera.zoom,
            h.id === hover.selectedHumanId,
            isChief,
            animTimeSec
          );
        },
      });
    }

    drawables.sort((a, b) => a.footY - b.footY);
    for (const d of drawables) {
      d.draw();
    }

    // 7.5 Wild Uncollected Map Curio Sprites (non-overlapping; vanish once discovered or expired!)
    if (camera.zoom >= 1.15) {
      for (const curio of world.mapCurios) {
        if (
          curio.x < minTileX - 1 ||
          curio.x > maxTileX + 1 ||
          curio.y < minTileY - 1 ||
          curio.y > maxTileY + 1
        ) {
          continue;
        }
        const dSprite = getDiscoverySprite(curio.assetId);
        const bob = Math.sin(animTimeSec * 2.4 + curio.x) * 1.25;
        const dx = Math.round(curio.x * BASE_TILE_PX - 5);
        const dy = Math.round(curio.y * BASE_TILE_PX - 9 + bob);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
        ctx.fillRect(dx - 1, dy + 8, 12, 3);
        ctx.drawImage(dSprite, dx, dy, 10, 10);
      }
    }

    // 8. Regional Weather Clouds, Pixel Rain, Snowflakes & Storm Lightning
    for (const wz of world.weatherZones) {
      const zCx = wz.x * BASE_TILE_PX;
      const zCy = wz.y * BASE_TILE_PX;
      const zR = wz.radius * BASE_TILE_PX;
      if (
        wz.x + wz.radius < minTileX ||
        wz.x - wz.radius > maxTileX ||
        wz.y + wz.radius < minTileY ||
        wz.y - wz.radius > maxTileY
      ) {
        continue;
      }

      // Soft drifting cloud shadow canopy over the weather region
      ctx.fillStyle =
        wz.type === 'STORM'
          ? 'rgba(15, 23, 42, 0.26)'
          : wz.type === 'SNOW'
            ? 'rgba(226, 232, 240, 0.14)'
            : 'rgba(30, 58, 95, 0.18)';
      ctx.beginPath();
      ctx.arc(zCx, zCy, zR * 0.92, 0, Math.PI * 2);
      ctx.fill();

      // Pixel precipitation drops/flakes inside zone
      const dropCount = wz.type === 'STORM' ? 42 : wz.type === 'RAIN' ? 28 : 26;
      for (let i = 0; i < dropCount; i++) {
        const seedAng = hash2(i, Math.floor(wz.radius), world.seed + 41) * Math.PI * 2;
        const seedDist = Math.sqrt(hash2(i * 3, 7, world.seed + 83)) * zR * 0.9;
        const baseDx = zCx + Math.cos(seedAng) * seedDist;
        const baseDy = zCy + Math.sin(seedAng) * seedDist;
        const fallSpeed = wz.type === 'STORM' ? 58 : wz.type === 'RAIN' ? 42 : 14;
        const phase = (animTimeSec * fallSpeed + i * 19) % 24;

        if (wz.type === 'SNOW') {
          const drift = Math.sin(animTimeSec * 2 + i) * 3;
          ctx.fillStyle = 'rgba(241, 245, 249, 0.86)';
          ctx.fillRect(Math.round(baseDx + drift), Math.round(baseDy - 12 + phase), 2, 2);
        } else if (wz.type === 'RAIN') {
          ctx.fillStyle = 'rgba(125, 211, 252, 0.72)';
          ctx.fillRect(Math.round(baseDx - phase * 0.18), Math.round(baseDy - 14 + phase), 1, 4);
        } else {
          ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
          ctx.fillRect(Math.round(baseDx - phase * 0.42), Math.round(baseDy - 14 + phase), 1.5, 5);
        }
      }
    }

    // Soft Atmospheric Valley Mist
    if (camera.zoom < 2.2) {
      ctx.fillStyle = 'rgba(255, 248, 235, 0.05)';
      for (let i = 0; i < 6; i++) {
        const mx = ((animTimeSec * 4.5 + i * 290) % (world.width * BASE_TILE_PX + 220)) - 110;
        const my = ((i * 185 + 60) % (world.height * BASE_TILE_PX - 120)) + 40;
        ctx.fillRect(Math.round(mx), Math.round(my), 100, 16);
        ctx.fillRect(Math.round(mx + 18), Math.round(my - 7), 64, 9);
      }
    }

    ctx.restore();

    if (world.stormFlash > 0.02) {
      ctx.fillStyle = `rgba(224, 242, 254, ${(world.stormFlash * 0.34).toFixed(3)})`;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    // 9. Dynamic Day/Night Lighting Pass
    if (warmDusk > 0.01) {
      ctx.fillStyle = `rgba(235, 130, 62, ${warmDusk.toFixed(3)})`;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    if (nightDim > 0.015) {
      if (this.lightCanvas.width !== viewportW || this.lightCanvas.height !== viewportH) {
        this.lightCanvas.width = viewportW;
        this.lightCanvas.height = viewportH;
      }
      const lctx = this.lightCtx;
      lctx.clearRect(0, 0, viewportW, viewportH);
      lctx.globalCompositeOperation = 'source-over';
      lctx.fillStyle = `rgba(8, 13, 30, ${nightDim.toFixed(3)})`;
      lctx.fillRect(0, 0, viewportW, viewportH);

      lctx.globalCompositeOperation = 'destination-out';
      for (const b of world.buildings) {
        if (b.status !== 'COMPLETE') continue;
        const emitsLight =
          hasIllumination ||
          b.kind === 'CAMPFIRE' ||
          b.kind === 'TOTEM_SHRINE' ||
          b.kind === 'BLACKSMITH' ||
          b.kind === 'WORKSHOP' ||
          b.kind === 'ARMORY_FORGE' ||
          b.kind === 'CHRONOMETER_TOWER' ||
          b.kind === 'CLOCKWORK_FOUNDRY' ||
          b.occupantsSleeping > 0;
        if (!emitsLight) continue;

        const worldCx = (b.tileX + b.size / 2) * tileScreenPx + offsetX;
        const worldCy = (b.tileY + b.size / 2) * tileScreenPx + offsetY;
        const baseR =
          b.kind === 'CAMPFIRE'
            ? 4.2
            : hasIllumination
              ? 6.2
              : b.occupantsSleeping > 0
                ? 3.8
                : 4.5;
        const r = baseR * tileScreenPx;
        if (worldCx + r < 0 || worldCx - r > viewportW || worldCy + r < 0 || worldCy - r > viewportH) {
          continue;
        }
        const grad = lctx.createRadialGradient(worldCx, worldCy, r * 0.12, worldCx, worldCy, r);
        grad.addColorStop(0, 'rgba(0,0,0,0.95)');
        grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = grad;
        lctx.beginPath();
        lctx.arc(worldCx, worldCy, r, 0, Math.PI * 2);
        lctx.fill();
      }
      lctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.lightCanvas, 0, 0);

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(camera.zoom, camera.zoom);
      for (const b of world.buildings) {
        if (b.status !== 'COMPLETE') continue;
        const emitsLight =
          hasIllumination ||
          b.kind === 'CAMPFIRE' ||
          b.kind === 'TOTEM_SHRINE' ||
          b.kind === 'BLACKSMITH' ||
          b.kind === 'WORKSHOP' ||
          b.kind === 'ARMORY_FORGE' ||
          b.kind === 'CHRONOMETER_TOWER' ||
          b.kind === 'CLOCKWORK_FOUNDRY' ||
          b.occupantsSleeping > 0;
        if (!emitsLight) continue;
        const px = (b.tileX + b.size / 2) * BASE_TILE_PX;
        const py = (b.tileY + b.size / 2) * BASE_TILE_PX;
        const r = b.size * BASE_TILE_PX * 1.9;
        const grad = ctx.createRadialGradient(px, py, 2, px, py, r);
        grad.addColorStop(0, `rgba(251, 191, 36, ${(nightDim * 0.42).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 10. Foreground Overlay: Particles, Thought Bubbles & Hover Previews
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(offsetX, offsetY);
    ctx.scale(camera.zoom, camera.zoom);

    for (const p of world.particles) {
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      const px = p.x * BASE_TILE_PX;
      const py = p.y * BASE_TILE_PX;
      if (p.text && camera.zoom >= 1.0) {
        ctx.font = '600 5.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(14, 19, 26, 0.85)';
        ctx.fillText(p.text, px + 0.6, py + 0.6);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, px, py);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(px - p.size / 2), Math.round(py - p.size / 2), p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    // Regional Settlement banners when zoomed out to medium overview
    if (camera.zoom >= 0.4 && camera.zoom <= 1.7) {
      for (const s of world.settlements) {
        const sx = s.centerX * BASE_TILE_PX;
        const sy = (s.centerY - 2.6) * BASE_TILE_PX;
        ctx.font = '600 5.5px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        const tw = Math.min(82, ctx.measureText(s.name).width + 8);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
        ctx.fillRect(sx - tw / 2, sy - 6.5, tw, 8.5);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx - tw / 2, sy - 6.5, tw, 8.5);
        ctx.fillStyle = '#fde68a';
        ctx.fillText(s.name, sx, sy, tw - 4);
      }
    }

    for (const h of sortedHumans) {
      if (h.state === 'SLEEPING' && h.sleepingInBuildingId) continue;
      if ((camera.zoom >= 2.1 || h.id === hover.selectedHumanId) && h.thoughtTimer > 0 && h.thoughtText) {
        const hx = h.x * BASE_TILE_PX;
        const drawY = Math.round(h.y * BASE_TILE_PX - 19);
        const label = h.thoughtText;
        ctx.font = '500 4.3px "Plus Jakarta Sans", sans-serif';
        const textW = Math.min(62, ctx.measureText(label).width + 7);
        const bx = hx - textW / 2;
        const by = drawY - 8;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(bx, by, textW, 7);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 0.45;
        ctx.strokeRect(bx, by, textW, 7);

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText(label, hx, by + 5, textW - 3);
      }
    }

    if (hover.hoverTileX !== null && hover.hoverTileY !== null) {
      const hx = hover.hoverTileX;
      const hy = hover.hoverTileY;
      if (hover.toolCategory === 'BLUEPRINT') {
        const def = BUILDING_DEFS[hover.selectedBlueprint];
        const check = canPlaceBlueprint(world, hover.selectedBlueprint, hx, hy);
        const bx = hx * BASE_TILE_PX;
        const by = hy * BASE_TILE_PX;
        const bw = def.footprint * BASE_TILE_PX;
        ctx.fillStyle = check.valid ? 'rgba(52, 211, 153, 0.25)' : 'rgba(239, 68, 68, 0.28)';
        ctx.fillRect(bx, by, bw, bw);
        ctx.strokeStyle = check.valid ? '#34d399' : '#ef4444';
        ctx.lineWidth = 1.5 / Math.max(0.6, camera.zoom);
        ctx.strokeRect(bx, by, bw, bw);
      } else if (hover.toolCategory === 'TALENT' || hover.toolCategory === 'NUDGE') {
        const radius = hover.toolCategory === 'TALENT' ? 3.5 : 5.5;
        const color =
          hover.toolCategory === 'TALENT'
            ? TALENT_DEFS[hover.selectedTalent].color
            : NUDGE_DEFS[hover.selectedNudge].color;
        ctx.strokeStyle = color;
        ctx.fillStyle = `${color}22`;
        ctx.lineWidth = 1.5 / Math.max(0.6, camera.zoom);
        ctx.beginPath();
        ctx.arc((hx + 0.5) * BASE_TILE_PX, (hy + 0.5) * BASE_TILE_PX, radius * BASE_TILE_PX, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (hover.toolCategory === 'SPAWN') {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.2 / Math.max(0.6, camera.zoom);
        ctx.strokeRect(hx * BASE_TILE_PX, hy * BASE_TILE_PX, BASE_TILE_PX, BASE_TILE_PX);
      }
    }

    if (hover.selectedTileCoords) {
      const stx = hover.selectedTileCoords.tx * BASE_TILE_PX;
      const sty = hover.selectedTileCoords.ty * BASE_TILE_PX;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.1 / Math.max(0.6, camera.zoom);
      ctx.setLineDash([2.5, 2]);
      ctx.strokeRect(stx, sty, BASE_TILE_PX, BASE_TILE_PX);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  private drawBuilding(
    ctx: CanvasRenderingContext2D,
    b: BuildingSite,
    zoom: number,
    animTimeSec: number,
    isSelected: boolean,
    nightDim: number
  ): void {
    const px = b.tileX * BASE_TILE_PX;
    const py = b.tileY * BASE_TILE_PX;
    const sizePx = b.size * BASE_TILE_PX;
    const def = BUILDING_DEFS[b.kind];
    const variant =
      (b.tileX * 7 + b.tileY * 13 + b.id.charCodeAt(b.id.length - 1)) % 3;
    const sprite = getBuildingSprite(b.kind, variant);

    if (b.status !== 'COMPLETE') {
      const prog = b.buildProgress;
      // 4 distinct physical construction phases:
      // Phase 1 (<25%): Cleared plot + corner survey stakes + stone foundation blocks + supply stack
      // Phase 2 (25-49%): Stone base + upright timber corner/door framing & cross beams
      // Phase 3 (50-74%): Rising solid walls (~55%) + pitched roof rafters + scaffolding & ladder
      // Phase 4 (75-99%): Almost complete solid structure (~84%) + roof ridge work + side scaffold

      // Ground plot & foundation shadow
      ctx.fillStyle = 'rgba(92, 68, 42, 0.45)';
      ctx.fillRect(px + 1, py + 2, sizePx - 2, sizePx - 2);
      ctx.fillStyle = 'rgba(14, 18, 22, 0.25)';
      ctx.fillRect(px + 2, py + sizePx - 3, sizePx - 2, 3);

      // Phase 1+: Survey stakes & cobble stone foundation course
      const stakeCol = '#784824';
      ctx.fillStyle = stakeCol;
      ctx.fillRect(px + 1, py + 2, 2, 4);
      ctx.fillRect(px + sizePx - 3, py + 2, 2, 4);
      ctx.fillRect(px + 1, py + sizePx - 5, 2, 4);
      ctx.fillRect(px + sizePx - 3, py + sizePx - 5, 2, 4);

      if (prog < 25) {
        // Survey string perimeter
        ctx.strokeStyle =
          b.status === 'BLUEPRINT' ? 'rgba(56, 189, 248, 0.72)' : 'rgba(226, 232, 240, 0.55)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(px + 2, py + 3, sizePx - 4, sizePx - 5);
        ctx.setLineDash([]);

        // Laid stone foundation sill blocks & stacked supply bundle
        const baseY = py + sizePx - 5;
        for (let sx = px + 3; sx < px + sizePx - 4; sx += 4) {
          ctx.fillStyle = (sx / 4) % 2 === 0 ? '#94a3b8' : '#64748b';
          ctx.fillRect(sx, baseY, 3, 2);
        }
        // Corner supply stack (timber logs / stone)
        ctx.fillStyle = '#8c5832';
        ctx.fillRect(px + 3, py + sizePx - 9, 6, 3);
        ctx.fillStyle = '#b87a46';
        ctx.fillRect(px + 4, py + sizePx - 10, 4, 2);
      } else if (prog < 50) {
        // Phase 2: Stone plinth + upright wooden structural framing posts & lintel beams
        const revealFrac = 0.22;
        const clipTop = Math.round(py - 2 + sizePx * (1 - revealFrac));
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, clipTop, sizePx, sizePx - (clipTop - (py - 2)));
        ctx.clip();
        ctx.drawImage(sprite, px, py - 2, sizePx, sizePx);
        ctx.restore();

        // Vertical corner & center posts + horizontal tie beam
        ctx.fillStyle = '#5c371d';
        ctx.fillRect(px + 3, py + Math.round(sizePx * 0.34), 2, Math.round(sizePx * 0.58));
        ctx.fillRect(px + sizePx - 5, py + Math.round(sizePx * 0.34), 2, Math.round(sizePx * 0.58));
        ctx.fillRect(px + Math.round(sizePx * 0.48), py + Math.round(sizePx * 0.25), 2, Math.round(sizePx * 0.65));
        ctx.fillStyle = '#b87a46';
        ctx.fillRect(px + 3, py + Math.round(sizePx * 0.34), sizePx - 6, 2);
        ctx.fillRect(px + 3, py + Math.round(sizePx * 0.58), sizePx - 6, 1.5);
      } else if (prog < 75) {
        // Phase 3: Lower ~56% solid walls + pitched roof rafters + scaffolding plank & ladder
        const revealFrac = 0.56;
        const clipTop = Math.round(py - 2 + sizePx * (1 - revealFrac));
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, clipTop, sizePx, sizePx - (clipTop - (py - 2)));
        ctx.clip();
        ctx.drawImage(sprite, px, py - 2, sizePx, sizePx);
        ctx.restore();

        // Exposed roof rafters above rising wall
        ctx.strokeStyle = '#8c5832';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(px + 3, clipTop + 1);
        ctx.lineTo(px + sizePx / 2, py + 2);
        ctx.lineTo(px + sizePx - 3, clipTop + 1);
        ctx.stroke();

        // Scaffolding poles & catwalk plank + ladder
        ctx.fillStyle = '#704726';
        ctx.fillRect(px + 1, py + 5, 1.5, sizePx - 5);
        ctx.fillRect(px + sizePx - 2.5, py + 5, 1.5, sizePx - 5);
        ctx.fillStyle = '#b87a46';
        ctx.fillRect(px + 1, clipTop, sizePx - 2, 2);
        // Ladder rungs on right
        ctx.fillStyle = '#c29b68';
        for (let ly = clipTop + 3; ly < py + sizePx - 2; ly += 3) {
          ctx.fillRect(px + sizePx - 5, ly, 3, 1);
        }
      } else {
        // Phase 4: ~84% complete solid structure + roofing ridge finish + side scaffold pole
        const revealFrac = 0.84;
        const clipTop = Math.round(py - 2 + sizePx * (1 - revealFrac));
        ctx.save();
        ctx.beginPath();
        ctx.rect(px, clipTop, sizePx, sizePx - (clipTop - (py - 2)));
        ctx.clip();
        ctx.drawImage(sprite, px, py - 2, sizePx, sizePx);
        ctx.restore();

        // Remaining exposed top ridge timber & batten
        ctx.fillStyle = '#8c5832';
        ctx.fillRect(px + Math.round(sizePx * 0.25), clipTop - 1, Math.round(sizePx * 0.5), 2);
        // Side finishing ladder
        ctx.fillStyle = '#b87a46';
        ctx.fillRect(px + sizePx - 3, py + 5, 1.5, sizePx - 6);
        for (let ly = py + 7; ly < py + sizePx - 2; ly += 3) {
          ctx.fillRect(px + sizePx - 5, ly, 3, 1);
        }
      }

      if (zoom >= 0.72) {
        const barW = sizePx;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(px, py - 6, barW, 2.5);
        ctx.fillStyle = b.status === 'BLUEPRINT' ? '#38bdf8' : '#e5a93c';
        ctx.fillRect(px, py - 6, (barW * Math.max(6, prog)) / 100, 2.5);
      }
    } else {
      ctx.fillStyle = 'rgba(14, 18, 22, 0.34)';
      ctx.fillRect(px + 2, py + sizePx - 3, sizePx - 2, 4);

      ctx.drawImage(sprite, px, py - 2, sizePx, sizePx);

      if (b.occupantsSleeping > 0 && nightDim > 0.12 && b.kind !== 'CAMPFIRE') {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(px + Math.round(sizePx * 0.28), py + Math.round(sizePx * 0.45), 3, 3);
        ctx.fillRect(px + Math.round(sizePx * 0.62), py + Math.round(sizePx * 0.45), 3, 3);
      }

      if (b.kind === 'CAMPFIRE') {
        const f = Math.floor(animTimeSec * 8) % 2;
        ctx.fillStyle = '#f97316';
        ctx.fillRect(px + 6 + f, py + 2, 3, 3);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(px + 7, py + 3 - f, 2, 2);
      } else if (b.kind === 'TOTEM_SHRINE') {
        const pulse = Math.sin(animTimeSec * 3.5 + b.tileX) > 0;
        ctx.fillStyle = pulse ? '#fde047' : '#f59e0b';
        ctx.fillRect(px + Math.round(sizePx * 0.44), py + 3, 4, 2);
      } else if (b.kind === 'BLACKSMITH' || b.kind === 'ARMORY_FORGE') {
        const ember = Math.sin(animTimeSec * 7 + b.tileY) > 0;
        ctx.fillStyle = ember ? '#fb923c' : '#f97316';
        ctx.fillRect(px + Math.round(sizePx * 0.25), py + Math.round(sizePx * 0.62), 4, 3);
      } else if (b.kind === 'CHRONOMETER_TOWER') {
        ctx.save();
        ctx.translate(px + sizePx / 2, py + Math.round(sizePx * 0.42));
        ctx.rotate(animTimeSec * 0.9);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(-0.8, -5, 1.6, 5);
        ctx.restore();
      } else if (b.kind === 'WINDMILL') {
        ctx.save();
        ctx.translate(px + sizePx / 2, py + 11);
        ctx.rotate(animTimeSec * 1.5);
        ctx.fillStyle = '#1a1416';
        ctx.fillRect(-1.5, -13, 3, 26);
        ctx.fillRect(-13, -1.5, 26, 3);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(-1, -12, 2, 24);
        ctx.fillRect(-12, -1, 24, 2);
        ctx.restore();
      } else if (b.kind === 'CLOCKWORK_FOUNDRY') {
        ctx.save();
        ctx.translate(px + sizePx / 2, py + 22);
        ctx.rotate(animTimeSec * 2.2);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-6, -1.5, 12, 3);
        ctx.fillRect(-1.5, -6, 3, 12);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      }

      if (
        b.kind === 'CAMPFIRE' ||
        b.kind === 'REED_HUT' ||
        b.kind === 'TIMBER_LODGE' ||
        b.kind === 'BLACKSMITH' ||
        b.kind === 'WORKSHOP' ||
        b.kind === 'ARMORY_FORGE' ||
        b.kind === 'CLOCKWORK_FOUNDRY'
      ) {
        const smokeCycle = (animTimeSec * 1.4 + b.tileX * 0.3) % 1;
        const sx = px + sizePx * 0.7 + Math.sin(smokeCycle * 6) * 2;
        const sy = py - 2 - smokeCycle * 10;
        ctx.fillStyle = `rgba(226, 232, 240, ${(0.42 * (1 - smokeCycle)).toFixed(2)})`;
        ctx.fillRect(Math.round(sx), Math.round(sy), 3, 2);
      }
    }

    if (isSelected) {
      ctx.strokeStyle = def.accentColor;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(px - 1, py - 3, sizePx + 2, sizePx + 3);
    }
  }

  private drawHuman(
    ctx: CanvasRenderingContext2D,
    h: HumanAgent,
    era: EraId,
    zoom: number,
    isSelected: boolean,
    isChief: boolean,
    animTimeSec: number
  ): void {
    const hx = h.x * BASE_TILE_PX;
    const hy = h.y * BASE_TILE_PX;

    if (zoom < 0.82) {
      ctx.fillStyle = era === 1 ? '#8c5b3c' : h.tunicColor;
      ctx.fillRect(Math.round(hx - 2), Math.round(hy - 4), 4, 5);
      ctx.fillStyle = h.skinTone;
      ctx.fillRect(Math.round(hx - 1.5), Math.round(hy - 6.5), 3, 2.5);
      if (isChief) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(Math.round(hx - 2), Math.round(hy - 8), 4, 1.5);
      }
      if (isSelected) {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1;
        ctx.strokeRect(hx - 4.5, hy - 8.5, 9, 11);
      }
      return;
    }

    if (h.activeNudge) {
      ctx.strokeStyle = NUDGE_DEFS[h.activeNudge.type].color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(hx, hy + 1, 5.5, 2.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isChief) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.ellipse(hx, hy + 1, 5.6, 2.1, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (h.isCuriousExplorer) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.ellipse(hx, hy + 1, 5.2, 2.0, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(16, 14, 16, 0.34)';
    ctx.fillRect(Math.round(hx - 4), Math.round(hy - 0.5), 8, 2.5);

    let pose: HumanPose = 'idle';
    let hopY = 0;
    const isMoving = Math.hypot(h.vx, h.vy) > 0.12;
    const isWorkingInPlace =
      !isMoving && (h.state === 'BUILD' || h.state === 'CRAFT' || h.state === 'CHOP' || h.state === 'MINE');

    if (isMoving) {
      const f = Math.floor(h.walkPhase * 0.85) % 4;
      pose = f === 0 ? 'walk0' : f === 1 ? 'walk1' : f === 2 ? 'walk2' : 'walk3';
    } else if (h.state === 'CELEBRATE') {
      hopY = Math.round(Math.abs(Math.sin(animTimeSec * 8.5 + h.x)) * 2.5);
      pose = Math.sin(animTimeSec * 5.2 + h.y) > 0 ? 'point' : 'idle';
    } else if (h.state === 'REST' || (h.state === 'SLEEPING' && !h.sleepingInBuildingId)) {
      pose = 'sit';
    } else if (h.state === 'RESEARCH' || h.state === 'EXPLORE') {
      pose = Math.sin(animTimeSec * 2.4 + h.x) > 0.15 ? 'point' : 'idle';
    } else if (h.state === 'SOCIALIZE') {
      pose = Math.sin(animTimeSec * 2.0 + h.y) > 0.45 ? 'point' : 'idle';
    } else if (isWorkingInPlace) {
      const wf = Math.floor(h.walkPhase * 1.1) % 3;
      pose = wf === 0 ? 'work0' : wf === 1 ? 'work1' : 'work2';
    } else if (h.state === 'FORAGE') {
      pose = Math.sin(h.walkPhase * 1.4) > 0 ? 'work2' : 'idle';
    }

    const sprite = getHumanSprite({
      era,
      skinTone: h.skinTone,
      tunicColor: h.tunicColor,
      primaryTalent: h.talents[0] ?? null,
      pose,
      facing: h.facing,
    });

    const drawW = 14;
    const drawH = 21;
    const drawX = Math.round(hx - drawW / 2);
    // Align foot soles directly onto the ground contact shadow (row 18 of 24 = 15.75px scaled)
    const baseDrawY = pose === 'sit' ? Math.round(hy - 17) : Math.round(hy - 15.5);
    const drawY = baseDrawY - hopY;
    ctx.drawImage(sprite, drawX, drawY, drawW, drawH);

    if (isChief) {
      const crownY = pose === 'sit' ? drawY + 2 : drawY;
      ctx.fillStyle = '#d97706';
      ctx.fillRect(Math.round(hx - 3), crownY + 1, 6, 2);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(Math.round(hx - 3), crownY, 1.5, 1.5);
      ctx.fillRect(Math.round(hx - 0.75), crownY - 1, 1.5, 2.5);
      ctx.fillRect(Math.round(hx + 1.5), crownY, 1.5, 1.5);
    }

    if (h.carrying) {
      const carrySprite =
        h.carrying.resource === 'wood'
          ? getWoodPileSprite()
          : h.carrying.resource === 'coal'
            ? getCoalSprite(0, true)
            : h.carrying.resource === 'ore'
              ? getOreSprite(0, true)
              : getStoneSprite(0, false);
      if (h.state === 'TRADE') {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(Math.round(hx - 4.5), Math.round(drawY - 3.5), 9, 5.5);
      }
      ctx.drawImage(carrySprite, Math.round(hx - 4), Math.round(drawY - 3), 8, 5);
    } else if (h.state === 'PATROL' && h.equippedWeapon) {
      const wSprite = getCraftedItemSprite(h.equippedWeapon);
      ctx.drawImage(wSprite, Math.round(hx + (h.facing > 0 ? 3 : -11)), Math.round(hy - 14), 8, 8);
    } else if (pose === 'work0' || pose === 'work1' || pose === 'work2') {
      if (h.equippedTool) {
        const tSprite = getCraftedItemSprite(h.equippedTool);
        const handOffsetX =
          pose === 'work0' ? h.facing * 2 : pose === 'work1' ? h.facing * 5 : h.facing * 4;
        const handOffsetY = pose === 'work0' ? -17 : pose === 'work1' ? -11 : -8;
        ctx.drawImage(tSprite, Math.round(hx + handOffsetX - 3), Math.round(hy + handOffsetY), 7, 7);
      } else {
        const toolColor =
          era === 1
            ? '#94a3b8'
            : era === 2
              ? '#d97706'
              : era === 3
                ? '#f59e0b'
                : '#fde047';
        const handleColor = '#78350f';
        const handOffsetX =
          pose === 'work0' ? h.facing * 4 : pose === 'work1' ? h.facing * 7 : h.facing * 6;
        const handOffsetY = pose === 'work0' ? -15 : pose === 'work1' ? -8 : -5;
        const tx = Math.round(hx + handOffsetX);
        const ty = Math.round(hy + handOffsetY);
        ctx.fillStyle = handleColor;
        ctx.fillRect(tx, ty, 2, 3);
        ctx.fillStyle = toolColor;
        ctx.fillRect(tx + (h.facing > 0 ? 1 : -1), ty - 1, 3, 2);
      }
    } else if (h.equippedWeapon && zoom >= 1.6) {
      const wSprite = getCraftedItemSprite(h.equippedWeapon);
      ctx.drawImage(wSprite, Math.round(hx + (h.facing > 0 ? -7 : 1)), Math.round(hy - 13), 6, 6);
    }

    if (isSelected) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 0.9;
      ctx.strokeRect(drawX - 1, drawY - 1, drawW + 2, drawH + 2);
    }
  }
}
