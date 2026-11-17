/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { ChronicleLog } from './components/ChronicleLog';
import { DiscoveriesModal } from './components/DiscoveriesModal';
import { EntityInspector } from './components/EntityInspector';
import { TechTreeModal } from './components/TechTreeModal';
import { TitleOverlay } from './components/TitleOverlay';
import { TopHud } from './components/TopHud';
import { TradeRoutesModal } from './components/TradeRoutesModal';
import { VictoryModal } from './components/VictoryModal';
import { WorldMenuModal } from './components/WorldMenuModal';
import { soundEngine } from './game/audio';
import { BASE_TILE_PX, MAX_ZOOM, MIN_ZOOM, TECH_TREE } from './game/constants';
import {
  exportWorldSnapshot,
  hasSavedWorld,
  loadWorldFromLocalStorage,
  parseWorldSnapshot,
  saveWorldToLocalStorage,
} from './game/persistence';
import { WorldRenderer } from './game/renderer';
import {
  applyNudgeBrush,
  awakenHumanTalent,
  bestowTalentBrush,
  cancelBlueprint,
  cancelCraftOrder,
  canPlaceBlueprint,
  canUnlockTech,
  createCraftOrder,
  createTradeRoute,
  deleteTradeRoute,
  getCommunityBonuses,
  getWeatherAt,
  nudgeSingleHuman,
  placeBlueprint,
  spawnHumanAt,
  stepSimulation,
  toggleTradeRoute,
  unlockTechnology,
} from './game/simulation';
import {
  BuildingKind,
  CameraState,
  GameScreen,
  MapPreset,
  NudgeType,
  TalentId,
  TechId,
  TileType,
  ToolCategory,
  WorldState,
} from './game/types';
import { generateWorld } from './game/worldGen';

function computeInitialCamera(world: WorldState): CameraState {
  const anchor = world.buildings[0];
  const ax = anchor ? anchor.tileX + 0.5 : world.width / 2;
  const ay = anchor ? anchor.tileY + 0.5 : world.height / 2;
  return {
    x: ax,
    y: ay,
    zoom: 1.7,
    followHumanId: null,
  };
}

export default function App() {
  const [screen, setScreen] = useState<GameScreen>('TITLE_MENU');
  const [preset, setPreset] = useState<MapPreset>('ARCHIPELAGO');

  // Mutable simulation refs for 60fps loop
  const worldRef = useRef<WorldState>(generateWorld('ARCHIPELAGO'));
  const cameraRef = useRef<CameraState>(computeInitialCamera(worldRef.current));
  const rendererRef = useRef<WorldRenderer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // React UI state synced cleanly
  const [, setHudTick] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const speedRef = useRef<number>(1);
  speedRef.current = speed;

  const [muted, setMuted] = useState<boolean>(false);
  const [toolCategory, setToolCategory] = useState<ToolCategory>('INSPECT');
  const [selectedBlueprint, setSelectedBlueprint] = useState<BuildingKind>('FORAGER_CAMP');
  const [selectedTalent, setSelectedTalent] = useState<TalentId>('ARCHITECT');
  const [selectedNudge, setSelectedNudge] = useState<NudgeType>('CURIOSITY_SPARK');

  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedTileCoords, setSelectedTileCoords] = useState<{ tx: number; ty: number } | null>(null);
  const [showTechTree, setShowTechTree] = useState(false);
  const [showDiscoveries, setShowDiscoveries] = useState(false);
  const [showTradeRoutes, setShowTradeRoutes] = useState(false);
  const [showWorldMenu, setShowWorldMenu] = useState(false);
  const [victoryDismissed, setVictoryDismissed] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [localSaveAvailable, setLocalSaveAvailable] = useState(() => hasSavedWorld());

  const hoverTileRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  const keysPressedRef = useRef<Set<string>>(new Set());
  const dragStateRef = useRef<{
    active: boolean;
    button: number;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  }>({
    active: false,
    button: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
  });

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = window.setTimeout(() => setToastMsg(null), 2400);
    return () => window.clearTimeout(t);
  }, [toastMsg]);

  const forceHudRefresh = useCallback(() => {
    setHudTick((v) => v + 1);
  }, []);

  // World lifecycle handlers
  const startNewWorld = useCallback((targetPreset: MapPreset) => {
    soundEngine.unlock();
    const fresh = generateWorld(targetPreset);
    worldRef.current = fresh;
    cameraRef.current = computeInitialCamera(fresh);
    setSelectedHumanId(null);
    setSelectedBuildingId(null);
    setSelectedTileCoords(null);
    setVictoryDismissed(false);
    setSpeed(1);
    setScreen('PLAYING');
    forceHudRefresh();
  }, [forceHudRefresh]);

  const continueSavedWorld = useCallback(() => {
    const saved = loadWorldFromLocalStorage();
    if (!saved) {
      showToast('No saved world found.');
      return;
    }
    worldRef.current = saved;
    cameraRef.current = computeInitialCamera(saved);
    setSelectedHumanId(null);
    setSelectedBuildingId(null);
    setSelectedTileCoords(null);
    setVictoryDismissed(saved.clockworkVictoryReached);
    setSpeed(1);
    setScreen('PLAYING');
    forceHudRefresh();
  }, [forceHudRefresh, showToast]);

  const handleImportJson = useCallback(
    (content: string) => {
      const parsed = parseWorldSnapshot(content);
      if (!parsed) {
        showToast('Invalid Chronicle World JSON file.');
        return;
      }
      worldRef.current = parsed;
      cameraRef.current = computeInitialCamera(parsed);
      setSelectedHumanId(null);
      setSelectedBuildingId(null);
      setSelectedTileCoords(null);
      setVictoryDismissed(parsed.clockworkVictoryReached);
      setSpeed(1);
      setScreen('PLAYING');
      forceHudRefresh();
      showToast(`Loaded ${parsed.worldName}.`);
    },
    [forceHudRefresh, showToast]
  );

  // Keyboard shortcuts & camera WASD pan
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'PLAYING') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const k = e.key.toLowerCase();
      keysPressedRef.current.add(k);

      if (k === ' ') {
        e.preventDefault();
        setSpeed((s) => (s === 0 ? 1 : 0));
      } else if (k === '1') {
        setSpeed(1);
      } else if (k === '2') {
        setSpeed(2);
      } else if (k === '3') {
        setSpeed(4);
      } else if (k === 'escape') {
        setToolCategory('INSPECT');
        setShowTechTree(false);
        setShowDiscoveries(false);
        setShowTradeRoutes(false);
        setShowWorldMenu(false);
      } else if (k === 'b') {
        setToolCategory('BLUEPRINT');
      } else if (k === 't') {
        setToolCategory('TALENT');
      } else if (k === 'n') {
        setToolCategory('NUDGE');
      } else if (k === 'q') {
        setToolCategory('SPAWN');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.key.toLowerCase());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [screen]);

  // Main 60fps simulation + canvas render loop
  useEffect(() => {
    if (!rendererRef.current) {
      rendererRef.current = new WorldRenderer();
    }

    let rafId = 0;
    let lastTime = performance.now();
    let hudAccum = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const world = worldRef.current;
      const cam = cameraRef.current;

      // Keyboard WASD/Arrow smooth pan
      const keys = keysPressedRef.current;
      const panSpeed = (22 / Math.max(0.5, cam.zoom)) * dt;
      let panned = false;
      if (keys.has('w') || keys.has('arrowup')) {
        cam.y -= panSpeed;
        panned = true;
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        cam.y += panSpeed;
        panned = true;
      }
      if (keys.has('a') || keys.has('arrowleft')) {
        cam.x -= panSpeed;
        panned = true;
      }
      if (keys.has('d') || keys.has('arrowright')) {
        cam.x += panSpeed;
        panned = true;
      }
      if (panned) cam.followHumanId = null;

      // Camera Follow Human Up-Close
      if (cam.followHumanId) {
        const target = world.humans.find((h) => h.id === cam.followHumanId);
        if (target) {
          cam.x += (target.x - cam.x) * Math.min(1, dt * 8);
          cam.y += (target.y - cam.y) * Math.min(1, dt * 8);
        } else {
          cam.followHumanId = null;
        }
      }

      // Clamp camera within world bounds
      cam.x = Math.max(0, Math.min(world.width, cam.x));
      cam.y = Math.max(0, Math.min(world.height, cam.y));

      // Step simulation (runs gently at 0.6x on title menu backdrop too)
      const simSpeed = screen === 'TITLE_MENU' ? 0.6 : speedRef.current;
      stepSimulation(world, dt, simSpeed);
      if (screen === 'PLAYING') {
        soundEngine.updateAmbience(world, cam, dt);
      }

      // Render Canvas
      const canvas = canvasRef.current;
      if (canvas && rendererRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          rendererRef.current.render(
            ctx,
            w,
            h,
            world,
            cam,
            {
              toolCategory: screen === 'PLAYING' ? toolCategory : 'INSPECT',
              selectedBlueprint,
              selectedTalent,
              selectedNudge,
              hoverTileX: hoverTileRef.current.x,
              hoverTileY: hoverTileRef.current.y,
              selectedHumanId,
              selectedBuildingId,
              selectedTileCoords,
            },
            now / 1000
          );
        }
      }

      hudAccum += dt;
      if (hudAccum >= 0.16) {
        hudAccum = 0;
        setHudTick((v) => (v + 1) % 1000000);
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [
    screen,
    toolCategory,
    selectedBlueprint,
    selectedTalent,
    selectedNudge,
    selectedHumanId,
    selectedBuildingId,
    selectedTileCoords,
  ]);

  // Coordinate conversions
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const cam = cameraRef.current;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tilePx = BASE_TILE_PX * cam.zoom;
    const wx = cam.x + (clientX - w / 2) / tilePx;
    const wy = cam.y + (clientY - h / 2) / tilePx;
    return { wx, wy, tx: Math.floor(wx), ty: Math.floor(wy) };
  }, []);

  // Mouse handlers on canvas
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    const cam = cameraRef.current;
    const before = screenToWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.16 : 0.86;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
    cam.zoom = nextZoom;

    if (!cam.followHumanId) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const tilePx = BASE_TILE_PX * nextZoom;
      cam.x = before.wx - (e.clientX - w / 2) / tilePx;
      cam.y = before.wy - (e.clientY - h / 2) / tilePx;
    }
    forceHudRefresh();
  }, [forceHudRefresh, screenToWorld]);

  const applyPrimaryClick = useCallback(
    (clientX: number, clientY: number) => {
      if (screen !== 'PLAYING') return;
      const world = worldRef.current;
      const { wx, wy, tx, ty } = screenToWorld(clientX, clientY);

      if (toolCategory === 'INSPECT') {
        // Pick nearest human within click radius
        let closestH = null;
        let closestDist = 1.15;
        for (const h of world.humans) {
          const d = Math.hypot(h.x - wx, h.y - wy);
          if (d < closestDist) {
            closestDist = d;
            closestH = h;
          }
        }
        if (closestH) {
          setSelectedHumanId(closestH.id);
          setSelectedBuildingId(null);
          setSelectedTileCoords(null);
          return;
        }
        // Or pick building under cursor
        const b = world.buildings.find(
          (site) =>
            wx >= site.tileX &&
            wx <= site.tileX + site.size &&
            wy >= site.tileY &&
            wy <= site.tileY + site.size
        );
        if (b) {
          setSelectedBuildingId(b.id);
          setSelectedHumanId(null);
          setSelectedTileCoords(null);
          cameraRef.current.followHumanId = null;
          return;
        }
        // Or pick natural resource patch (Forest, Berry Grove, Stone, Ore, Farmland)
        const clickedTile =
          tx >= 0 && tx < world.width && ty >= 0 && ty < world.height
            ? world.tiles[ty * world.width + tx]
            : null;
        if (
          clickedTile &&
          (clickedTile.type === TileType.FOREST ||
            clickedTile.type === TileType.BERRY_GROVE ||
            clickedTile.type === TileType.STONE ||
            clickedTile.type === TileType.ORE ||
            clickedTile.type === TileType.COAL ||
            clickedTile.type === TileType.FARMLAND)
        ) {
          setSelectedTileCoords({ tx, ty });
          setSelectedHumanId(null);
          setSelectedBuildingId(null);
          cameraRef.current.followHumanId = null;
          return;
        }
        setSelectedHumanId(null);
        setSelectedBuildingId(null);
        setSelectedTileCoords(null);
        cameraRef.current.followHumanId = null;
      } else if (toolCategory === 'SPAWN') {
        const spawned = spawnHumanAt(world, wx, wy);
        if (!spawned) showToast('Cannot spawn human on water.');
        forceHudRefresh();
      } else if (toolCategory === 'BLUEPRINT') {
        const check = canPlaceBlueprint(world, selectedBlueprint, tx, ty);
        if (!check.valid) {
          showToast(check.reason || 'Cannot place blueprint here.');
          return;
        }
        const site = placeBlueprint(world, selectedBlueprint, tx, ty);
        if (site) {
          setSelectedBuildingId(site.id);
          setSelectedHumanId(null);
          setSelectedTileCoords(null);
          forceHudRefresh();
        }
      } else if (toolCategory === 'TALENT') {
        const count = bestowTalentBrush(world, wx, wy, 3.5, selectedTalent);
        if (count === 0) showToast('Click near villagers to awaken this talent.');
        forceHudRefresh();
      } else if (toolCategory === 'NUDGE') {
        const count = applyNudgeBrush(world, wx, wy, 5.5, selectedNudge);
        showToast(count > 0 ? `Nudged ${count} nearby humans.` : 'Behavior pulse cast.');
        forceHudRefresh();
      }
    },
    [
      forceHudRefresh,
      screen,
      screenToWorld,
      selectedBlueprint,
      selectedNudge,
      selectedTalent,
      showToast,
      toolCategory,
    ]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    soundEngine.unlock();
    dragStateRef.current = {
      active: true,
      button: e.button,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { tx, ty } = screenToWorld(e.clientX, e.clientY);
    hoverTileRef.current = { x: tx, y: ty };

    const drag = dragStateRef.current;
    if (!drag.active) return;

    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5) {
      drag.moved = true;
    }

    // Pan with right/middle button, or left-drag when Inspecting
    const shouldPan = drag.button === 1 || drag.button === 2 || (drag.button === 0 && toolCategory === 'INSPECT');
    if (shouldPan && drag.moved) {
      const cam = cameraRef.current;
      const tilePx = BASE_TILE_PX * cam.zoom;
      cam.x -= dx / tilePx;
      cam.y -= dy / tilePx;
      cam.followHumanId = null;
    }

    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = dragStateRef.current;
    drag.active = false;
    if (e.button === 0 && !drag.moved) {
      applyPrimaryClick(e.clientX, e.clientY);
    }
  };

  const handleZoomPreset = useCallback(
    (targetZoom: number) => {
      cameraRef.current.zoom = targetZoom;
      forceHudRefresh();
    },
    [forceHudRefresh]
  );

  const handleToggleMute = useCallback(() => {
    soundEngine.muted = !soundEngine.muted;
    setMuted(soundEngine.muted);
  }, []);

  const world = worldRef.current;
  const bonuses = getCommunityBonuses(world);
  const availableTechCount = useMemo(
    () => TECH_TREE.filter((t) => canUnlockTech(world, t.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [world.stockpile.researchPoints, world.unlockedTechs.length]
  );

  const selectedHuman = selectedHumanId
    ? world.humans.find((h) => h.id === selectedHumanId) ?? null
    : null;
  const selectedBuilding = selectedBuildingId
    ? world.buildings.find((b) => b.id === selectedBuildingId) ?? null
    : null;
  const selectedTileObj = selectedTileCoords
    ? world.tiles[selectedTileCoords.ty * world.width + selectedTileCoords.tx] ?? null
    : null;
  const selectedTile =
    selectedTileCoords &&
    selectedTileObj &&
    (selectedTileObj.type === TileType.FOREST ||
      selectedTileObj.type === TileType.BERRY_GROVE ||
      selectedTileObj.type === TileType.STONE ||
      selectedTileObj.type === TileType.ORE ||
      selectedTileObj.type === TileType.COAL ||
      selectedTileObj.type === TileType.FARMLAND)
      ? { tx: selectedTileCoords.tx, ty: selectedTileCoords.ty, tile: selectedTileObj }
      : null;

  const cameraWeather = getWeatherAt(world, cameraRef.current.x, cameraRef.current.y).type;
  const selectedTileWeather = selectedTile
    ? getWeatherAt(world, selectedTile.tx + 0.5, selectedTile.ty + 0.5).type
    : undefined;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0e131a]">
      <canvas
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          dragStateRef.current.active = false;
          hoverTileRef.current = { x: null, y: null };
        }}
        onContextMenu={(e) => e.preventDefault()}
        className={`block w-full h-full pixel-canvas ${
          toolCategory === 'INSPECT' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
        }`}
      />

      {screen === 'TITLE_MENU' && (
        <TitleOverlay
          preset={preset}
          onSelectPreset={(p) => {
            setPreset(p);
            const preview = generateWorld(p);
            worldRef.current = preview;
            cameraRef.current = computeInitialCamera(preview);
          }}
          hasLocalSave={localSaveAvailable}
          onStartNew={() => startNewWorld(preset)}
          onContinueSave={continueSavedWorld}
          onImportJson={handleImportJson}
        />
      )}

      {screen === 'PLAYING' && (
        <>
          <TopHud
            world={world}
            cameraWeather={cameraWeather}
            housingCap={bonuses.housingCap}
            speed={speed}
            onSetSpeed={setSpeed}
            zoom={cameraRef.current.zoom}
            onZoomPreset={handleZoomPreset}
            muted={muted}
            onToggleMute={handleToggleMute}
            availableTechCount={availableTechCount}
            onOpenTechTree={() => setShowTechTree(true)}
            onOpenDiscoveries={() => setShowDiscoveries(true)}
            onOpenTradeRoutes={() => setShowTradeRoutes(true)}
            onOpenWorldMenu={() => setShowWorldMenu(true)}
          />

          <ChronicleLog events={world.chronicle} />

          <EntityInspector
            human={selectedHuman}
            building={selectedBuilding}
            selectedTile={selectedTile}
            selectedTileWeather={selectedTileWeather}
            settlements={world.settlements}
            craftOrders={world.craftOrders}
            isFollowing={Boolean(selectedHuman && cameraRef.current.followHumanId === selectedHuman.id)}
            onToggleFollow={(hid) => {
              const cam = cameraRef.current;
              if (cam.followHumanId === hid) {
                cam.followHumanId = null;
              } else {
                cam.followHumanId = hid;
                if (cam.zoom < 3.0) cam.zoom = 3.6;
              }
              forceHudRefresh();
            }}
            onAwakenTalent={(hid, talent) => {
              if (awakenHumanTalent(world, hid, talent)) {
                forceHudRefresh();
              }
            }}
            onNudgeHuman={(hid, nudge) => {
              if (nudgeSingleHuman(world, hid, nudge)) {
                forceHudRefresh();
              }
            }}
            onCancelBlueprint={(bid) => {
              if (cancelBlueprint(world, bid)) {
                setSelectedBuildingId(null);
                showToast('Blueprint cancelled and supplies returned.');
                forceHudRefresh();
              }
            }}
            onCommissionCraft={(bid, itemKind, qty) => {
              if (createCraftOrder(world, bid, itemKind, qty)) {
                showToast(`Commissioned ${qty}× gear order.`);
                forceHudRefresh();
              }
            }}
            onCancelCraftOrder={(oid) => {
              if (cancelCraftOrder(world, oid)) {
                showToast('Craft order cancelled and unused supplies returned.');
                forceHudRefresh();
              }
            }}
            onClose={() => {
              setSelectedHumanId(null);
              setSelectedBuildingId(null);
              setSelectedTileCoords(null);
              cameraRef.current.followHumanId = null;
            }}
          />

          <BottomDock
            world={world}
            toolCategory={toolCategory}
            onSelectCategory={setToolCategory}
            selectedBlueprint={selectedBlueprint}
            onSelectBlueprint={setSelectedBlueprint}
            selectedTalent={selectedTalent}
            onSelectTalent={setSelectedTalent}
            selectedNudge={selectedNudge}
            onSelectNudge={setSelectedNudge}
          />

          {showTechTree && (
            <TechTreeModal
              world={world}
              onUnlockTech={(tid: TechId) => {
                if (unlockTechnology(world, tid)) {
                  forceHudRefresh();
                }
              }}
              onToggleAutoUnlock={() => {
                world.autoUnlockTech = !world.autoUnlockTech;
                forceHudRefresh();
              }}
              onClose={() => setShowTechTree(false)}
            />
          )}

          {showDiscoveries && (
            <DiscoveriesModal
              world={world}
              onFocusDiscovery={(d) => {
                cameraRef.current.followHumanId = null;
                cameraRef.current.x = d.x;
                cameraRef.current.y = d.y;
                if (cameraRef.current.zoom < 2.8) cameraRef.current.zoom = 3.0;
                setShowDiscoveries(false);
                forceHudRefresh();
              }}
              onFocusHuman={(hid) => {
                cameraRef.current.followHumanId = hid;
                if (cameraRef.current.zoom < 3.0) cameraRef.current.zoom = 3.4;
                setSelectedHumanId(hid);
                setSelectedBuildingId(null);
                setSelectedTileCoords(null);
                setShowDiscoveries(false);
                forceHudRefresh();
              }}
              onClose={() => setShowDiscoveries(false)}
            />
          )}

          {showTradeRoutes && (
            <TradeRoutesModal
              world={world}
              onFocusSettlement={(x, y) => {
                cameraRef.current.followHumanId = null;
                cameraRef.current.x = x;
                cameraRef.current.y = y;
                if (cameraRef.current.zoom < 1.5) cameraRef.current.zoom = 1.8;
                setShowTradeRoutes(false);
                forceHudRefresh();
              }}
              onFocusHuman={(hid) => {
                cameraRef.current.followHumanId = hid;
                if (cameraRef.current.zoom < 3.0) cameraRef.current.zoom = 3.4;
                setSelectedHumanId(hid);
                setSelectedBuildingId(null);
                setSelectedTileCoords(null);
                setShowTradeRoutes(false);
                forceHudRefresh();
              }}
              onToggleRoute={(rid) => {
                if (toggleTradeRoute(world, rid)) forceHudRefresh();
              }}
              onCreateRoute={(fromId, toId, exp, imp) => {
                if (createTradeRoute(world, fromId, toId, exp, imp)) {
                  showToast('New caravan route opened.');
                  forceHudRefresh();
                }
              }}
              onDeleteRoute={(rid) => {
                if (deleteTradeRoute(world, rid)) {
                  showToast('Trade route closed.');
                  forceHudRefresh();
                }
              }}
              onClose={() => setShowTradeRoutes(false)}
            />
          )}

          {showWorldMenu && (
            <WorldMenuModal
              world={world}
              onSaveLocal={() => {
                saveWorldToLocalStorage(world);
                setLocalSaveAvailable(true);
              }}
              onExportJson={async () => {
                const ok = await exportWorldSnapshot(world);
                if (ok) showToast('Exported world snapshot.');
              }}
              onImportJson={handleImportJson}
              onNewWorld={(p) => startNewWorld(p)}
              onClose={() => setShowWorldMenu(false)}
            />
          )}

          {world.clockworkVictoryReached && !victoryDismissed && (
            <VictoryModal
              world={world}
              onContinueSandbox={() => setVictoryDismissed(true)}
              onStartNewWorld={() => {
                setVictoryDismissed(false);
                startNewWorld(preset);
              }}
            />
          )}

          {toastMsg && (
            <div className="fixed top-28 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-[#11161d]/95 border border-amber-400/40 text-xs font-medium text-slate-100 shadow-lg pointer-events-none whitespace-nowrap">
              {toastMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
}
