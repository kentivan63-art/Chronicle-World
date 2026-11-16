import { CameraState, TileType, WeatherType, WorldState } from './types';

function sampleRegionalWeatherType(world: WorldState, x: number, y: number): WeatherType {
  let chosen: WeatherType = 'CLEAR';
  let bestScore = 0;
  for (const z of world.weatherZones) {
    const d = Math.hypot(x - z.x, y - z.y);
    if (d < z.radius) {
      const falloff = (1 - d / z.radius) * z.intensity;
      if (falloff > bestScore) {
        bestScore = falloff;
        chosen = z.type;
      }
    }
  }
  return chosen;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private birdCooldown = 1.6;
  private cricketCooldown = 2.0;
  private forgeCooldown = 1.8;
  private waveCooldown = 3.2;
  private hearthCooldown = 1.2;
  private rainCooldown = 1.4;
  private thunderCooldown = 5.5;
  private snowWindCooldown = 2.6;
  public muted = false;

  private ensureContext(allowCreate = true): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx && allowCreate) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (!this.ctx) return null;
    if (this.ctx.state === 'suspended' && allowCreate) {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock(): void {
    this.ensureContext(true);
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 2.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.06,
    delay = 0,
    slideTo?: number
  ): void {
    const ctx = this.ensureContext(true);
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.015, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playFilteredNoise(
    filterType: BiquadFilterType,
    freq: number,
    duration: number,
    volume: number,
    q = 0.9
  ): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, now);
    filter.Q.setValueAtTime(q, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.05);
  }

  private playBirdChirp(volume: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const notes = 2 + (Math.random() > 0.55 ? 1 : 0);
    const base = 1950 + Math.random() * 1100;
    for (let i = 0; i < notes; i++) {
      const f1 = base + (Math.random() - 0.3) * 420;
      const f2 = f1 * (0.82 + Math.random() * 0.45);
      this.playTone(f1, 0.08 + Math.random() * 0.05, 'sine', volume, i * 0.11, f2);
    }
  }

  private playCricketChirp(volume: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const freq = 4050 + Math.random() * 350;
    for (let i = 0; i < 3; i++) {
      this.playTone(freq, 0.032, 'sine', volume, i * 0.052, freq * 0.96);
    }
  }

  private playDistantForge(volume: number, hasFoundry: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const base = 540 + Math.random() * 180;
    this.playTone(base, 0.16, 'triangle', volume, 0, base * 0.94);
    this.playTone(base * 1.52, 0.12, 'sine', volume * 0.65, 0.004, base * 1.48);
    if (hasFoundry) {
      this.playTone(1280, 0.025, 'square', volume * 0.35, 0.22, 820);
    }
  }

  private playHearthCrackle(volume: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const freq = 150 + Math.random() * 190;
    this.playTone(freq, 0.028, 'triangle', volume, 0, 75);
  }

  private playOceanWave(volume: number): void {
    this.playFilteredNoise('lowpass', 340, 2.45, volume, 0.7);
  }

  public updateAmbience(world: WorldState, camera: CameraState, dt: number): void {
    if (this.muted) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;

    this.birdCooldown -= dt;
    this.cricketCooldown -= dt;
    this.forgeCooldown -= dt;
    this.waveCooldown -= dt;
    this.hearthCooldown -= dt;
    this.rainCooldown -= dt;
    this.thunderCooldown -= dt;
    this.snowWindCooldown -= dt;

    const cx = Math.floor(camera.x);
    const cy = Math.floor(camera.y);
    const radius = Math.max(4, Math.min(11, Math.round(9 / Math.max(0.6, camera.zoom * 0.8))));

    let forestCount = 0;
    let meadowCount = 0;
    let waterCount = 0;

    const minX = Math.max(0, cx - radius);
    const maxX = Math.min(world.width - 1, cx + radius);
    const minY = Math.max(0, cy - radius);
    const maxY = Math.min(world.height - 1, cy + radius);

    for (let ty = minY; ty <= maxY; ty += 2) {
      for (let tx = minX; tx <= maxX; tx += 2) {
        const type = world.tiles[ty * world.width + tx].type;
        if (type === TileType.FOREST) forestCount++;
        else if (type === TileType.MEADOW || type === TileType.BERRY_GROVE) meadowCount++;
        else if (type === TileType.DEEP_WATER || type === TileType.SHALLOW_WATER) waterCount++;
      }
    }

    let minForgeDist = Infinity;
    let hasFoundryNear = false;
    let minCampfireDist = Infinity;

    for (const b of world.buildings) {
      if (b.status !== 'COMPLETE') continue;
      const bx = b.tileX + b.size / 2;
      const by = b.tileY + b.size / 2;
      const d = Math.hypot(bx - camera.x, by - camera.y);
      if (
        b.kind === 'WORKSHOP' ||
        b.kind === 'CLOCKWORK_FOUNDRY' ||
        b.kind === 'CHRONOMETER_TOWER' ||
        b.kind === 'QUARRY' ||
        b.kind === 'BLACKSMITH' ||
        b.kind === 'ARMORY_FORGE'
      ) {
        if (d < minForgeDist) {
          minForgeDist = d;
          hasFoundryNear = b.kind === 'CLOCKWORK_FOUNDRY' || b.kind === 'CHRONOMETER_TOWER';
        }
      } else if (b.kind === 'CAMPFIRE') {
        if (d < minCampfireDist) minCampfireDist = d;
      }
    }

    const zoomPresence = Math.min(1, Math.max(0.25, camera.zoom / 2.2));
    const isNight = world.timeOfDay >= 0.72 && world.timeOfDay < 0.97;
    const localWeather = sampleRegionalWeatherType(world, camera.x, camera.y);

    // 1. Daytime Forest Birdsong (suppressed during heavy storm)
    if (!isNight && localWeather !== 'STORM' && forestCount >= 3 && this.birdCooldown <= 0) {
      const intensity = Math.min(1, forestCount / 14);
      this.playBirdChirp((0.008 + intensity * 0.012 * zoomPresence) * (localWeather === 'CLEAR' ? 1 : 0.45));
      this.birdCooldown = 2.4 + Math.random() * 3.0;
    }

    // 2. Nighttime Crickets
    if (isNight && localWeather === 'CLEAR' && forestCount + meadowCount >= 4 && this.cricketCooldown <= 0) {
      this.playCricketChirp(0.007 + 0.007 * zoomPresence);
      this.cricketCooldown = 1.9 + Math.random() * 2.5;
    }

    // 3. Distant Forging / Smithy / Quarry Clanks
    if (minForgeDist < 15 && this.forgeCooldown <= 0) {
      const distFactor = Math.max(0.15, 1 - minForgeDist / 15);
      this.playDistantForge(0.007 + distFactor * 0.014 * zoomPresence, hasFoundryNear);
      this.forgeCooldown = 1.5 + Math.random() * 2.2;
    }

    // 4. Campfire Hearth Crackle
    if (minCampfireDist < 8 && camera.zoom >= 1.3 && this.hearthCooldown <= 0) {
      const distFactor = 1 - minCampfireDist / 8;
      this.playHearthCrackle(0.006 + distFactor * 0.009);
      this.hearthCooldown = 0.7 + Math.random() * 1.4;
    }

    // 5. Coastal Ocean Surf Swells
    if (waterCount >= 6 && this.waveCooldown <= 0) {
      const surfStrength = Math.min(1, waterCount / 22);
      this.playOceanWave(0.006 + surfStrength * 0.01);
      this.waveCooldown = 5.5 + Math.random() * 3.5;
    }

    // 6. Regional Weather Ambience (Rain, Storm, Snow)
    if ((localWeather === 'RAIN' || localWeather === 'STORM') && this.rainCooldown <= 0) {
      const rainVol = localWeather === 'STORM' ? 0.016 : 0.009;
      this.playFilteredNoise('bandpass', localWeather === 'STORM' ? 1650 : 2100, 1.8, rainVol, 0.55);
      this.rainCooldown = 1.5 + Math.random() * 0.6;
    }

    if (localWeather === 'STORM' && this.thunderCooldown <= 0) {
      this.playFilteredNoise('lowpass', 145, 2.2, 0.022, 1.1);
      this.thunderCooldown = 5.5 + Math.random() * 6.0;
    }

    if (localWeather === 'SNOW' && this.snowWindCooldown <= 0) {
      this.playFilteredNoise('bandpass', 620 + Math.random() * 240, 2.2, 0.008, 2.8);
      this.snowWindCooldown = 3.0 + Math.random() * 2.5;
    }
  }

  playBlueprintPlace(): void {
    this.playTone(330, 0.08, 'triangle', 0.06, 0, 440);
    this.playTone(520, 0.12, 'sine', 0.05, 0.05);
  }

  playSpawnHuman(): void {
    this.playTone(440, 0.1, 'sine', 0.05, 0, 587);
  }

  playTalentBlessing(): void {
    this.playTone(523.25, 0.15, 'triangle', 0.06, 0);
    this.playTone(659.25, 0.18, 'sine', 0.06, 0.07);
    this.playTone(783.99, 0.24, 'sine', 0.05, 0.14);
  }

  playNudgePulse(): void {
    this.playTone(293.66, 0.18, 'sine', 0.06, 0, 440);
    this.playTone(587.33, 0.22, 'triangle', 0.04, 0.06);
  }

  playBuildingComplete(): void {
    this.playTone(392.0, 0.14, 'triangle', 0.07, 0);
    this.playTone(493.88, 0.14, 'triangle', 0.07, 0.09);
    this.playTone(587.33, 0.24, 'sine', 0.07, 0.18);
  }

  playForgeCraft(): void {
    this.playTone(620, 0.12, 'triangle', 0.055, 0, 580);
    this.playTone(930, 0.16, 'sine', 0.045, 0.07);
  }

  playTechUnlock(): void {
    this.playTone(523.25, 0.14, 'sine', 0.07, 0);
    this.playTone(659.25, 0.14, 'sine', 0.07, 0.08);
    this.playTone(783.99, 0.18, 'triangle', 0.07, 0.16);
    this.playTone(1046.5, 0.32, 'sine', 0.07, 0.24);
  }

  playHammerTap(): void {
    this.playTone(180 + Math.random() * 40, 0.045, 'square', 0.018, 0, 90);
  }

  playDiscoveryChime(): void {
    this.playTone(587.33, 0.14, 'sine', 0.055, 0);
    this.playTone(739.99, 0.16, 'triangle', 0.05, 0.07);
    this.playTone(880.0, 0.24, 'sine', 0.055, 0.14);
  }

  playCelebrationFanfare(): void {
    this.playTone(440.0, 0.11, 'triangle', 0.05, 0);
    this.playTone(554.37, 0.11, 'triangle', 0.05, 0.08);
    this.playTone(659.25, 0.14, 'sine', 0.055, 0.16);
    this.playTone(880.0, 0.22, 'sine', 0.05, 0.25);
  }
}

export const soundEngine = new SoundEngine();
