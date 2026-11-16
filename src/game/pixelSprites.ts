import { BuildingKind, CraftedItemKind, DiscoveryAssetId, EraId, TalentId } from './types';

function createPixelCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function compileMatrix(
  rows: string[],
  palette: Record<string, string>
): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const [c, ctx] = createPixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = palette[ch];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return c;
}

const spriteCache = new Map<string, HTMLCanvasElement>();

function shadeHex(hex: string, factor: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, Math.round(((num >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((num & 255) * factor)));
  return `rgb(${r},${g},${b})`;
}

export type HumanPose =
  | 'idle'
  | 'walk0'
  | 'walk1'
  | 'walk2'
  | 'walk3'
  | 'work0'
  | 'work1'
  | 'work2'
  | 'sit'
  | 'point';

// ============================================================================
// ERA-ACCURATE HUMAN PIXEL SPRITES (16x24 painterly proportions)
// Era 1: Stone Age fur hides, rawhide wraps, reed baskets, shaggy hair
// Era 2: Agrarian woven linen tunics, rope belts, straw/hood headwear
// Era 3: Bronze & Masonry craftsman aprons, bronze clasps, guild hoods/berets
// Era 4: Clockwork Era brass-buttoned artisan coats, goggles, gear packs
// ============================================================================
export function getHumanSprite(opts: {
  era: EraId;
  skinTone: string;
  tunicColor: string;
  primaryTalent: TalentId | null;
  pose: HumanPose;
  facing: 1 | -1;
}): HTMLCanvasElement {
  const key = `hum4_e${opts.era}_${opts.skinTone}_${opts.tunicColor}_${opts.primaryTalent ?? 'none'}_${opts.pose}_${opts.facing}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const S = opts.skinTone;
  const Sd = shadeHex(opts.skinTone, 0.76);
  const Hair = '#3b241d';
  const HairL = '#5c3b2f';

  // Era-specific garment & pack palettes
  let J = '#8c5c3a'; // torso garment
  let Jd = '#5c3a23';
  let Jl = '#b07950';
  let U = '#b88b5a'; // inner wrap / belt / apron
  let P = S; // legs / hose
  let Pd = Sd;
  let F = '#6b452b'; // footwear
  let Fd = '#422818';
  let K = '#9c7d4b'; // carried satchel / pack (Era 3-4 only)
  let Kd = '#6b532e';
  let Kl = '#bfa065';

  // Headwear defaults by Era (wild hair in early eras; NEVER baseball caps!)
  let Hat = Hair;
  let HatL = HairL;
  let Brim = Hair;

  if (opts.era === 1) {
    // Stone & Hearth: Animal pelt hide wrap, bare shoulders & calves, rawhide waist tie, barefoot, wild hair
    const furColors = ['#8c5b3c', '#735139', '#a16f49', '#614636'];
    const idx = opts.tunicColor.charCodeAt(1) % furColors.length;
    J = furColors[idx];
    Jd = shadeHex(J, 0.68);
    Jl = shadeHex(J, 1.22);
    U = '#c29b68'; // rawhide bone/cord sash
    P = S; // bare legs!
    Pd = Sd;
    F = Sd; // barefoot!
    Fd = '#4a3222';

    Hat = Hair;
    HatL = HairL;
    Brim = Hair;
    if (opts.primaryTalent === 'SCHOLAR') {
      HatL = '#93c5fd'; // painted woad hair tuft / feather
      Brim = '#cbd5e1';
    } else if (opts.primaryTalent === 'FORAGER') {
      Hat = '#366634';
      HatL = '#65a347'; // woven leaf headband
      Brim = '#4d7c3f';
    } else if (opts.primaryTalent === 'ARCHITECT') {
      Brim = '#d4a359'; // simple rawhide headband
    }
  } else if (opts.era === 2) {
    // Agrarian & Timber: Knee-length woven wool/linen peasant tunic, rope sash, wrapped leg-bindings, straw/linen coif
    J = opts.tunicColor;
    Jd = shadeHex(opts.tunicColor, 0.72);
    Jl = shadeHex(opts.tunicColor, 1.2);
    U = '#dfd3b6'; // woven rope belt / undyed linen collar
    P = '#786650'; // simple wrapped leg cloth
    Pd = '#524433';
    F = '#5c3c24'; // simple soft leather turnshoes
    Fd = '#3b2414';

    if (opts.primaryTalent === 'FORAGER') {
      Hat = '#c9a659'; // woven straw hat
      HatL = '#e6c97a';
      Brim = '#a6833c';
    } else if (opts.primaryTalent === 'SCHOLAR') {
      Hat = '#3b5998'; // linen scribe hood
      HatL = '#6488cc';
      Brim = '#273c6b';
    } else {
      Hat = Hair;
      HatL = HairL;
      Brim = '#b89b6a'; // simple cloth headband
    }
  } else if (opts.era === 3) {
    // Bronze & Masonry: Tunic + leather craftsman apron, bronze belt clasp, leather satchel, cloth beret/circlet
    J = opts.tunicColor;
    Jd = shadeHex(opts.tunicColor, 0.7);
    Jl = shadeHex(opts.tunicColor, 1.22);
    U = '#c27a38'; // bronze-trimmed leather apron
    P = '#4a414f'; // tailored hose
    Pd = '#2e2833';
    F = '#472c1b'; // sturdy cuffed leather boots
    Fd = '#29170d';
    K = '#78482a'; // leather artisan satchel
    Kd = '#4d2c18';
    Kl = '#d98a3c'; // bronze buckle

    Hat = '#6b4735';
    HatL = '#96654c';
    Brim = '#d98a3c'; // bronze headband
    if (opts.primaryTalent === 'ARCHITECT') {
      Hat = '#b45309';
      HatL = '#f59e0b';
      Brim = '#78350f';
    } else if (opts.primaryTalent === 'SCHOLAR') {
      Hat = '#1e40af';
      HatL = '#60a5fa';
      Brim = '#1e3a8a';
    } else if (opts.primaryTalent === 'CIVIC_LEADER') {
      Hat = '#047857';
      HatL = '#34d399';
      Brim = '#f59e0b';
    }
  } else {
    // Era 4: Clockwork & Guild: Tailored brass-buttoned guild coat, brass goggles, clockwork pack, dark leather boots
    J = opts.tunicColor;
    Jd = shadeHex(opts.tunicColor, 0.68);
    Jl = shadeHex(opts.tunicColor, 1.24);
    U = '#eab308'; // brass buttons & waistcoat piping
    P = '#2c3442'; // crisp guild trousers
    Pd = '#1a202b';
    F = '#2e1d16'; // polished dark boots
    Fd = '#170e0b';
    K = '#b45309'; // brass clockwork pack
    Kd = '#78350f';
    Kl = '#fde047';

    Hat = '#47362b';
    HatL = '#eab308'; // brass goggles / gear crest
    Brim = '#291f19';
    if (opts.primaryTalent === 'CLOCKMAKER' || opts.primaryTalent === 'SCHOLAR') {
      Hat = '#1e293b';
      HatL = '#38bdf8'; // glowing optical lens
      Brim = '#d97706';
    }
  }

  let rows: string[];

  if (opts.pose === 'sit') {
    rows = [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJ......',
      '...kKJJUJJ......',
      '...kDJJdJJ......',
      '...kDJJJJS......',
      '....PPPPPPPPP...',
      '...dPPPPdPPPPd..',
      '..dPPPP..dPPPFF.',
      '..FF........FFd.',
      '................',
      '................',
      '................',
      '................',
    ];
  } else if (opts.pose === 'point') {
    rows = [
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUUJJJJJJ.',
      '...kDJJUUJd...S.',
      '...kDJJdUd......',
      '....DJJUUd......',
      '.....JPPPP......',
      '.....PPdPP......',
      '.....PP.PP......',
      '....dPP.PPd.....',
      '....PP...PP.....',
      '....PP...PP.....',
      '....FF...FF.....',
      '....dF...dF.....',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  } else if (opts.pose === 'work0') {
    rows = [
      '............SS..',
      '......HHHH..JJ..',
      '.....HllllHJJ...',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUUJd.....',
      '...kDJJUUJd.....',
      '...kDJJdUd......',
      '....DJJUUd......',
      '.....PPPPP......',
      '.....PPdPP......',
      '....PPd.PPd.....',
      '....PP...PP.....',
      '....PP...PP.....',
      '....FF...FF.....',
      '....dF...dF.....',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  } else if (opts.pose === 'work1') {
    rows = [
      '................',
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUJJJJ....',
      '...kDJJUJJdJSS..',
      '...kDJJdUd......',
      '....DJJUUd......',
      '.....PPPPP......',
      '....dPPdPP......',
      '...PPd...PPd....',
      '...PP.....PP....',
      '...FF.....FF....',
      '...dF.....dF....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  } else if (opts.pose === 'work2') {
    rows = [
      '................',
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUUJJ.....',
      '...kDJJUUJJ.....',
      '...kDJJdUdJJ....',
      '....DJJUUd.SS...',
      '.....PPPPP......',
      '.....PPdPP......',
      '....PPd.PPd.....',
      '....PP...PP.....',
      '....FF...FF.....',
      '....dF...dF.....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  } else if (opts.pose === 'walk0') {
    // Contact stride A: front leg forward, back leg trailing, back arm forward
    rows = [
      '................',
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUUJJJS...',
      '...kDJJUJJd.....',
      '...kDJJdUd......',
      '....DJJUUd......',
      '.....PPPPP......',
      '....dPP.PPd.....',
      '...dPP...PPd....',
      '...dP.....PP....',
      '...dF.....FF....',
      '..........dF....',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  } else if (opts.pose === 'walk1') {
    // Passing frame A: slight upward bob, legs crossing, arms at sides
    rows = [
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUUJJ.....',
      '...kDJJUUJJ.....',
      '...kDJJdUdS.....',
      '....DJJUUd......',
      '.....PPPPP......',
      '.....PPdPP......',
      '....dPP.PP......',
      '....dP..PP......',
      '....dF..FF......',
      '........dF......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  } else if (opts.pose === 'walk2') {
    // Contact stride B: opposite leg forward, front arm swinging forward
    rows = [
      '................',
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUJJJ.....',
      '..JkDJJUUJJS....',
      '..SkDJJdUd......',
      '....DJJUUd......',
      '.....PPPPP......',
      '....PPd.dPP.....',
      '...PPd...dPP....',
      '...PP.....dP....',
      '...FF.....dF....',
      '...dF...........',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  } else if (opts.pose === 'walk3') {
    // Passing frame B: slight upward bob, opposite leg tucked passing
    rows = [
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUUJJ.....',
      '...kDJJUUJJ.....',
      '...kDJJdUd......',
      '....DJJUUdS.....',
      '.....PPPPP......',
      '.....PPdPP......',
      '.....PP.dPP.....',
      '.....PP..dP.....',
      '.....FF..dF.....',
      '.....dF.........',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  } else {
    rows = [
      '......HHHH......',
      '.....HllllH.....',
      '.....BbbbbB.....',
      '.....hSSSSS.....',
      '.....hSSdSS.....',
      '......hSSd......',
      '....kJJUUJJ.....',
      '...kKJJUUJJ.....',
      '...kDJJUUJJ.....',
      '...kDJJdUdS.....',
      '....DJJUUd......',
      '.....PPPPP......',
      '.....PPdPP......',
      '.....PP.PP......',
      '.....PP.PP......',
      '.....PP.PP......',
      '.....FF.FF......',
      '.....dF.dF......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  }

  // Render pixel rows with authentic Era 1-4 garment silhouettes
  const [c, ctx] = createPixelCanvas(16, 24);
  const sitOffset = opts.pose === 'sit' ? 6 : 0;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    const bodyY = y - sitOffset;
    for (let rx = 0; rx < 16; rx++) {
      const ch = row[rx];
      if (ch === '.') continue;

      // Era 1 & 2 villagers do NOT carry modern hiking backpacks!
      if (opts.era <= 2 && (ch === 'k' || ch === 'K')) continue;

      // Remove modern cap brim overhang in Era 1-3 so heads look natural/period-accurate
      if (opts.era <= 3 && (ch === 'B' || ch === 'b') && (rx === 10 || rx === 5) && !opts.primaryTalent) {
        continue;
      }

      const x = opts.facing === 1 ? rx : 15 - rx;
      let col = S;
      if (ch === 'H') col = Hat;
      else if (ch === 'l') col = HatL;
      else if (ch === 'B' || ch === 'b') col = Brim;
      else if (ch === 'h') col = Hair;
      else if (ch === 'S') col = S;
      else if (ch === 'd') {
        if (bodyY <= 6) col = Sd;
        else if (bodyY <= 15) col = Pd;
        else col = Fd;
      } else if (ch === 'J') col = J;
      else if (ch === 'D') col = Jd;
      else if (ch === 'U') col = U;
      else if (ch === 'P') col = P;
      else if (ch === 'F') col = F;
      else if (ch === 'k') col = Kd;
      else if (ch === 'K') col = Kl;
      else if (ch === 'j') col = Jl;

      // Era 1 (Stone Age): bare arms/shoulder, diagonal animal pelt, ragged hide kilt skirt over bare legs
      if (opts.era === 1) {
        if ((ch === 'J' || ch === 'D') && bodyY >= 6 && bodyY <= 9 && rx >= 9) {
          col = S; // bare shoulder & arms
        } else if (ch === 'J' && bodyY === 8 && rx % 3 === 0) {
          col = Jd; // fur hide spots
        } else if (bodyY === 12 && (ch === 'P' || ch === 'd')) {
          col = rx % 2 === 0 ? J : Jd; // ragged animal-hide skirt
        } else if (bodyY === 13 && (ch === 'P' || ch === 'd') && rx >= 5 && rx <= 9) {
          col = Jd; // fur loincloth hem
        }
      } else if (opts.era === 2) {
        // Era 2 (Agrarian): rolled linen sleeves on forearms + knee-length tunic skirt over wrapped legs
        if (ch === 'J' && (bodyY === 8 || bodyY === 9) && rx >= 10) {
          col = S;
        } else if (bodyY === 12 && (ch === 'P' || ch === 'd')) {
          col = J; // woven tunic hem
        } else if (bodyY === 13 && ch === 'P') {
          col = Jd; // shaded tunic skirt
        }
      } else if (opts.era === 3) {
        // Era 3 (Bronze & Masonry): bronze-belted tunic + craftsman apron skirt
        if (bodyY === 12 && (ch === 'P' || ch === 'd')) {
          col = U; // apron lower trim
        }
      }

      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Crisp subtle eye pixel
  if (opts.pose === 'sit') {
    const ex = opts.facing === 1 ? 10 : 5;
    ctx.fillStyle = '#1b1416';
    ctx.fillRect(ex, 9, 1, 1);
  } else if (opts.pose === 'work1' || opts.pose === 'walk1' || opts.pose === 'walk3') {
    const ex = opts.facing === 1 ? 10 : 5;
    ctx.fillStyle = '#1b1416';
    ctx.fillRect(ex, 4, 1, 1);
  } else {
    const ex = opts.facing === 1 ? 10 : 5;
    ctx.fillStyle = '#1b1416';
    ctx.fillRect(ex, 3, 1, 1);
  }

  spriteCache.set(key, c);
  return c;
}

// ============================================================================
// REALISTIC LAYERED PIXEL TREES, STUMPS & BERRY SHRUBS
// ============================================================================
export function getTreeSprite(variant: number, flip = false): HTMLCanvasElement {
  const v = Math.abs(variant) % 4;
  const key = `tree3_${v}_${flip ? 1 : 0}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const oakPalette: Record<string, string> = {
    Y: '#d4b24e', // sunlit leaf crown rim
    L: '#78ab43', // sunlit sage-green leaves
    M: '#3b663e', // mid woodland green
    D: '#1d3629', // deep shaded foliage pocket
    T: '#734f39', // sunlit bark
    t: '#472e21', // shaded bark
    b: '#2b1b14', // deep root shadow
  };

  const birchPalette: Record<string, string> = {
    Y: '#eab354',
    L: '#b8b842',
    M: '#66873d',
    D: '#334d2c',
    T: '#dfd6c5', // pale birch bark
    t: '#9e9484',
    b: '#3d342d', // birch knots
  };

  const variants: { rows: string[]; palette: Record<string, string> }[] = [
    // 0: Ancient Broadleaf Oak (24x28)
    {
      palette: oakPalette,
      rows: [
        '.......YYYYYLLL.........',
        '.....YYLLLLLLLLMM.......',
        '....YLLLLLMMMMMMMDD.....',
        '...YLLLMLLLMMMMMMMDD....',
        '..YYLLMMMMMMMDMMMMDDD...',
        '..YLLMMMMDDDDDMMMMDDD...',
        '.YYLLMMLLMMDDDDMMMMDDD..',
        '.YLLLLLMMMMMDDDMMMMDDD..',
        '.LLMMMMMMMDDDDDDDDDDDD..',
        '..DDMMMMMDDDDtDDDDDDD...',
        '...DDDDDDDDTTtTDDDDD....',
        '.....DDDD..TTt..DDD.....',
        '..........tTTt..........',
        '..........TTtT..........',
        '.........tTTtT..........',
        '.........TTt.t..........',
        '.........TTt............',
        '........tTTtt...........',
        '.......bbTTtbb..........',
      ],
    },
    // 1: Tall Highland Pine (24x28)
    {
      palette: oakPalette,
      rows: [
        '..........YY............',
        '.........YLLM...........',
        '........YLLMMD..........',
        '.......YYLLMMMD.........',
        '.......LMMMMDDD.........',
        '......YYLLLMMMMD........',
        '.....YLLLLMMMMDDD.......',
        '.....LMMMMDDDDDDD.......',
        '....YYLLLLMMMMMMDD......',
        '...YYLLLMMMMMDDDDDD.....',
        '...LMMMMMDDDDDDDDD......',
        '..YYLLLLMMMMMMDDDDD.....',
        '..LLLLMMMMMDDDDDDDDD....',
        '...DDDDDDDDtDDDDDDD.....',
        '..........TTt...........',
        '..........TTt...........',
        '.........tTTt...........',
        '........bTTTtb..........',
      ],
    },
    // 2: Slender Branching Birch (24x28)
    {
      palette: birchPalette,
      rows: [
        '......YYYYLLL...........',
        '....YYLLLLMMMM..........',
        '...YLLLMMMMDDDD..YYLL...',
        '...LLMMMMDDDDD..YLLMMD..',
        '....DDDDDDDD....LMMMDD..',
        '.......TTb.......DDD....',
        '.......tTT......tT......',
        '..YYLL..TTt....bT.......',
        '.YLLMMM..TTb..TT........',
        '.LMMMDDD..TTtTT.........',
        '..DDDDD....TTt..........',
        '...........bTt..........',
        '...........TTt..........',
        '...........TTb..........',
        '..........tTTt..........',
        '.........bbTTbb.........',
      ],
    },
    // 3: Young Woodland Sapling (24x28)
    {
      palette: oakPalette,
      rows: [
        '........................',
        '........................',
        '........................',
        '.........YYYYLL.........',
        '.......YYLLLLMMMD.......',
        '......YLLMMMMMDDDD......',
        '......LLLMMMDDDDDD......',
        '.......DDMMMDDDDD.......',
        '........DDDDDDDD........',
        '..........TTt...........',
        '..........TTt...........',
        '.........tTTt...........',
        '........bTTTtb..........',
      ],
    },
  ];

  const chosen = variants[v];
  const raw = compileMatrix(chosen.rows, chosen.palette);
  if (!flip) {
    spriteCache.set(key, raw);
    return raw;
  }

  const [flipped, fctx] = createPixelCanvas(raw.width, raw.height);
  fctx.translate(raw.width, 0);
  fctx.scale(-1, 1);
  fctx.drawImage(raw, 0, 0);
  spriteCache.set(key, flipped);
  return flipped;
}

export function getStumpSprite(): HTMLCanvasElement {
  const key = 'stump_1';
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = {
    R: '#e3c086', // pale cut wood ring
    r: '#b88b52',
    T: '#734f39',
    t: '#472e21',
    b: '#261812',
  };

  const rows = [
    '..RRRRRR....',
    '.RrRRRRrR...',
    '.TTTTTTTT...',
    '.TTTTttTT...',
    '.TTtTttTt...',
    'bTTttttTtb..',
    '.bbbbbbbb...',
  ];

  const sprite = compileMatrix(rows, palette);
  spriteCache.set(key, sprite);
  return sprite;
}

export function getBerryBushSprite(variant = 0, ripe = true): HTMLCanvasElement {
  const v = Math.abs(variant) % 2;
  const key = `berry_bush3_${v}_${ripe ? 1 : 0}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = {
    Y: '#b8b049',
    L: '#5d9942',
    M: '#315c3d',
    D: '#1a2e26',
    R: ripe ? '#dc2626' : '#315c3d',
    r: ripe ? '#fca5a5' : '#5d9942',
  };

  const rows =
    v === 0
      ? [
          '....YYLLLL......',
          '..YYLLrRMMMM....',
          '.YLLLRRMMMMMD...',
          '.LMMLDDDDMRRMD..',
          '.MMrRDDDDMRRMD..',
          '..DDRRDDDDDDD...',
          '...DDDDDDDDD....',
        ]
      : [
          '......YYYLL.....',
          '...YYLLMMrRMD...',
          '..YLLMMMDRRMD...',
          '..LMrRDDDMMMDD..',
          '..MMRDDDDDrRMD..',
          '...DDDDDDDDDD...',
        ];

  const sprite = compileMatrix(rows, palette);
  spriteCache.set(key, sprite);
  return sprite;
}

export function getWoodPileSprite(): HTMLCanvasElement {
  const key = 'wood_pile_1';
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = {
    O: '#24191a',
    B: '#734f39',
    b: '#472e21',
    E: '#e3c086',
    e: '#b88b52',
  };

  const rows = [
    '....OOOO........',
    '...OEBbBO.......',
    '..OOBBbBBOO.....',
    '.OEBbBOEBbBO....',
    '.OeBbBOebBbO....',
    '.OOOOOOOOOO.....',
  ];

  const sprite = compileMatrix(rows, palette);
  spriteCache.set(key, sprite);
  return sprite;
}

export function getStoneSprite(variant = 0, rich = true): HTMLCanvasElement {
  const v = Math.abs(variant) % 3;
  const key = `stone_rock_${v}_${rich ? 1 : 0}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = {
    O: '#231e24', // dark rock crevice / outline
    H: '#cbd5e1', // crisp sunlit stone ridge
    L: '#94a3b8', // light granite face
    M: '#64748b', // mid slate body
    D: '#475569', // shaded rock base
    W: '#7c6252', // warm earthy stone blend
    G: '#4d7c3f', // subtle moss fleck
  };

  const variants: string[][] = [
    // 0: Craggy granite boulder + side pebble
    rich
      ? [
          '.....OOOOO......',
          '...OOHHHHLOO....',
          '..OHHLLLLMMMO...',
          '.OLLLLMMMMMDMO..',
          '.OLMMMDMMDDDDMO.',
          '.OMMDDDDWDDDDMO.',
          '.OGDDDDWWDDDMO..',
          '..OOOOOOOOOOO...',
        ]
      : [
          '................',
          '.....OOOO.......',
          '...OOHLLMO......',
          '..OHLMMMDMO.....',
          '..OMDDDDDMO.....',
          '...OOOOOOO......',
        ],
    // 1: Layered quarry slate rocks
    rich
      ? [
          '......OOOO......',
          '....OOHHHLOO....',
          '...OHLLMMMMMO...',
          '..OLLMMDOMMMDO..',
          '.OOHLMDMMDDDMO..',
          '.OHLMMDDDDDDO...',
          '..OOOOOOOOOO....',
        ]
      : [
          '................',
          '.....OOOOO......',
          '....OHLMMMO.....',
          '...OLMDDMMO.....',
          '....OOOOOO......',
        ],
    // 2: Rounded river stone cluster
    rich
      ? [
          '....OOOO........',
          '..OOHHHLO..OOO..',
          '.OHLLMMMDOLHLMO.',
          '.OLMMDDDOMMMMDMO',
          '.OMDDDDDWDDDDDMO',
          '..OOOOOOOOOOOOO.',
        ]
      : [
          '................',
          '...OOO....OOO...',
          '..OHLMO..OLMMO..',
          '..OMDDO..OMDDO..',
          '...OOO....OOO...',
        ],
  ];

  const sprite = compileMatrix(variants[v], palette);
  spriteCache.set(key, sprite);
  return sprite;
}

export function getOreSprite(variant = 0, rich = true): HTMLCanvasElement {
  const v = Math.abs(variant) % 2;
  const key = `ore_rock_${v}_${rich ? 1 : 0}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = {
    O: '#1e1920',
    H: '#9ca3af', // mineral rock edge
    M: '#57534e', // dark basalt/ironstone
    D: '#3b3532', // deep shadow rock
    Y: rich ? '#fde047' : '#d97706', // gleaming gold/copper crystal tip
    G: rich ? '#f59e0b' : '#b45309', // amber ore seam
    g: '#b45309',
  };

  const variants: string[][] = [
    // 0: Jagged basalt outcrop with protruding ore crystals
    [
      '......OO........',
      '....OOYYO.OO....',
      '...OHGYGOOGYO...',
      '..OHMGGGMMGGMO..',
      '.OMMMgMMDDDDMMO.',
      '.OMDDMMDDDDDDMO.',
      '.ODDDDDDDDDDDMO.',
      '..OOOOOOOOOOOO..',
    ],
    // 1: Wide mineral-vein boulder
    [
      '.......OOOO.....',
      '....OOOHGYGO....',
      '..OOGYOMGGMMO...',
      '.OHGGMMMMgMMMO..',
      '.OMMMDDDDGGDMO..',
      '.ODDDDDDDggDDO..',
      '..OOOOOOOOOOO...',
    ],
  ];

  const sprite = compileMatrix(variants[v], palette);
  spriteCache.set(key, sprite);
  return sprite;
}

export function getCoalSprite(variant = 0, rich = true): HTMLCanvasElement {
  const v = Math.abs(variant) % 2;
  const key = `coal_rock_${v}_${rich ? 1 : 0}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = {
    O: '#0f1218', // deep anthracite outline
    H: '#94a3b8', // glassy coal cleavage glint
    L: '#475569', // slate-blue mineral shine
    M: '#262b36', // dark coal seam
    D: '#171a22', // deep carbon shadow
    R: '#64748b', // pale rock matrix
  };

  const variants: string[][] = [
    rich
      ? [
          '.....OOOOO......',
          '...OOHLLLLOO....',
          '..OHMMMLMMMMO...',
          '.ORMMHMMMMDDMO..',
          '.ORMMLMMDDDDMMO.',
          '.ODDDDDMMDDDDMO.',
          '.ORDDDDDDDDDMO..',
          '..OOOOOOOOOOO...',
        ]
      : [
          '................',
          '....OOOOOO......',
          '...OHLMMMMO.....',
          '..ORMMDDDMO.....',
          '..ODDDDDDMO.....',
          '...OOOOOOO......',
        ],
    rich
      ? [
          '......OOOO......',
          '....OOHLLLOO....',
          '...OHMMMDMMMO...',
          '..ORMMHMMMMDMO..',
          '.OOHMMDDDMMMDO..',
          '.OLMMDDDRDDDDO..',
          '..OOOOOOOOOOO...',
        ]
      : [
          '................',
          '....OOOOO.......',
          '...OHMMMDMO.....',
          '..ORDDDDDMO.....',
          '...OOOOOOO......',
        ],
  ];

  const sprite = compileMatrix(variants[v], palette);
  spriteCache.set(key, sprite);
  return sprite;
}

// ============================================================================
// BUILDING PIXEL SPRITES
// ============================================================================
const BUILDING_PALETTE: Record<string, string> = {
  O: '#24191a',
  W: '#8c5832',
  w: '#5c371d',
  L: '#b87a46',
  R: '#b8462c',
  r: '#7d2b1b',
  T: '#e0683c',
  S: '#8b95a3',
  s: '#5c6470',
  H: '#cbd5e1',
  P: '#e8dec8',
  p: '#c2b59b',
  G: '#eab308',
  g: '#a16207',
  Y: '#fde047',
  F: '#f97316',
  B: '#38bdf8',
  b: '#1d4ed8',
  E: '#10b981',
  e: '#047857',
  M: '#688f46',
  m: '#44632b',
  C: '#a87042',
  c: '#704726',
  Q: '#64748b',
  q: '#475569',
};

export function getBuildingSprite(kind: BuildingKind, variant = 0): HTMLCanvasElement {
  const v = Math.abs(variant);
  const vKey =
    kind === 'REED_HUT' || kind === 'TIMBER_LODGE'
      ? v % 3
      : kind === 'FORAGER_CAMP'
        ? v % 2
        : 0;
  const key = `bld3_${kind}_${vKey}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  let rows: string[] = [];

  if (kind === 'CAMPFIRE') {
    rows = [
      '................',
      '................',
      '................',
      '.......O........',
      '......OFO.......',
      '.....OFYFO......',
      '.....OFYFO......',
      '....OWFYFWO.....',
      '...OWWWFWWWO....',
      '..OSSSSWSSSSO...',
      '..OSsSHHHHsSO...',
      '...OOOOOOOOO....',
      '................',
      '................',
    ];
  } else if (kind === 'REED_HUT') {
    if (vKey === 0) {
      // Variant 0: Woven rounded reed dome hut
      rows = [
        '..........OOOOOO..........',
        '........OOPPPPPPPO........',
        '.......OPPPYYYYPPPO.......',
        '......OPPPpPPPPpPPPO......',
        '.....OPpPPpPPPPpPPpPO.....',
        '....OPPPpWWPPPPWWpPPPO....',
        '...OWpPPPWWWWWWWWPPpPWO...',
        '..OOWWPPPPPOOOOPPPPPWWOO..',
        '..OWWWWWWWPOwwOPWWWWWWWO..',
        '..OWwWWWWwPOwwOPwWWWWwWO..',
        '..OSSwWWwSSOwwOSSwWWwSSO..',
        '..OssssssssOwwOssssssssO..',
        '...OOOOOOOOOOOOOOOOOOOO...',
      ];
    } else if (vKey === 1) {
      // Variant 1: Peaked A-frame timber & hide shelter with crossed ridge poles
      rows = [
        '..........OO..OO..........',
        '...........OWWO...........',
        '.........OOWWWWOO.........',
        '........OWWCCCCWWO........',
        '.......OWCCCCCCcWWO.......',
        '......OWCCcCCCCcCCWO......',
        '.....OWCCcCCCCCCcCCWO.....',
        '....OWWcCCCOOOOCCcCWWO....',
        '...OWWCCCCCOwwOCCCCcWWO...',
        '..OOWCCCCCCOWwOCCCCCCWOO..',
        '..OSSwCCCCCOwwOCCCCwSSSO..',
        '..OssssssssOwwOssssssssO..',
        '...OOOOOOOOOOOOOOOOOOOO...',
      ];
    } else {
      // Variant 2: Moss-thatched wattle-and-clay round yurt
      rows = [
        '.........OOOOOOOO.........',
        '.......OOMMMMMMMMOO.......',
        '......OMMmPPPPPPmMMO......',
        '.....OMMPpPPPPPPpPMMO.....',
        '....OmmPpPPGGGGPPpPmmO....',
        '...OOWWWPPPPPPPPPPWWWOO...',
        '...OWWPPPPPOOOOPPPPPWWO...',
        '..OPPPPYPPPOWwOPPPPYPPPO..',
        '..OPPPpPPPPOWwOPPPPpPPPO..',
        '..OpPPpPPPPOWwOPPPPpPPpO..',
        '..OSSSSppSSOwwOSSppSSSSO..',
        '..OssssssssOwwOssssssssO..',
        '...OOOOOOOOOOOOOOOOOOOO...',
      ];
    }
  } else if (kind === 'WELL') {
    rows = [
      '.....OOOOOO.....',
      '....OTTTTTTO....',
      '...ORRRRRRRRO...',
      '...OrrrrrrrrO...',
      '....OWO..OWO....',
      '....OWO..OWO....',
      '...OOSOOOOSSO...',
      '..OSHBBBBBBHSO..',
      '..OSSBBBBBBSSO..',
      '..OSsSSSSSSsSO..',
      '..OssssssssssO..',
      '...OOOOOOOOOO...',
    ];
  } else if (kind === 'FORAGER_CAMP') {
    if (vKey === 0) {
      rows = [
        '..........OOOOOO..........',
        '........OOGGGGGGOO........',
        '......OOGGGYYYYGGGOO......',
        '.....OGGGGGGGGGGGGGGO.....',
        '....OGGggggGGGGggggGGO....',
        '...OGggWWWWWWWWWWWWggGO...',
        '..OOOWWWLWWWWWWWWLWWWOOO..',
        '..OWWWWWPPPPPPPPPPWWWWWO..',
        '..OWWWWPPpOOOOOOpPPWWWWO..',
        '..OWWWWPPpOwwwwOpPPWWWWO..',
        '..OwwwwWWpOwwwwOpWWwwwwO..',
        '..OwwwwWWpOwwwwOpWWwwwwO..',
        '...OOOOOOOOOOOOOOOOOOOO...',
      ];
    } else {
      // Variant 1: Mossy lean-to drying pavilion
      rows = [
        '.......OOOOOOOOOOOO.......',
        '.....OOMMMMMMMMMMMMOO.....',
        '....OMMmMMGGGGGGMMmMMO....',
        '...OMmMMMggggggggMMMmMO...',
        '..OmmWWWWWWWWWWWWWWWWmmO..',
        '..OWWLWWWRRRRRRRRWWWLWWO..',
        '..OWWWWWPPPPPPPPPPWWWWWO..',
        '..OWWWWPOOOOPPPPPPPWWWWO..',
        '..OwwwwPOwwOPPPGGPPwwwwO..',
        '..OwwwwPOwwOPPPgGPPwwwwO..',
        '..OSSSSPOwwOPPPSSPPSSSSO..',
        '..OssssOOOOOsssssssSSSSO..',
        '...OOOOOOOOOOOOOOOOOOOO...',
      ];
    }
  } else if (kind === 'WOODCUTTER') {
    rows = [
      '.......OOOOOOOOOOOO.......',
      '.....OOTTTTTTTTTTTTOO.....',
      '....OTTRRRRRRRRRRRRTOO....',
      '...ORRRRRRRRRRRRRRRRRRO...',
      '..OrrrrrrrrrrrrrrrrrrrrO..',
      '..OWWWWWWWWWWWWWWWWWWWWO..',
      '..OWLLWWWWPPPPPPPPWWWWWO..',
      '..OWWWLLWWPPYOOYPPWWLLWO..',
      '..OWWWWWWWPPPOOPPPWWLLWO..',
      '..OwwwwWWWPPPOOPPPWWwwWO..',
      '..OwwwwLLLPPwOOwPPWWWWWO..',
      '..OLLLLLLLOOOOOOOOWLLLLOO.',
      '..OwwwwwwO........OwwwwwwO',
      '...OOOOOO..........OOOOOO.',
    ];
  } else if (kind === 'GRANARY') {
    rows = [
      '........OOOOOOOOOO........',
      '......OOYYYYYYYYYYOO......',
      '.....OGGGGGGGGGGGGGGO.....',
      '....OGGGGGggggggGGGGGO....',
      '...OggggggggggggggggggO...',
      '...OWWWWWWWWWWWWWWWWWWO...',
      '..OWWPPPPPPPPPPPPPPPPWWO..',
      '..OWWPPGGGGGGGGGGGGPPWWO..',
      '..OWWPPgGGgPPPPgGGgPPWWO..',
      '..OWWPPPppPOOOOppPPPPWWO..',
      '..OSSSSSSSsOwwOsSSSSSSSO..',
      '..OssssssSsOwwOsSssssssO..',
      '...OOOOOOOOOOOOOOOOOOOO...',
    ];
  } else if (kind === 'TIMBER_LODGE') {
    if (vKey === 0) {
      // Variant 0: Steep terracotta-roofed cottage with right chimney
      rows = [
        '..............OOOO........',
        '......OOOOOOOOOSSO........',
        '....OOTTTTTTTTTSSO........',
        '...OTTRRRRRRRRRSSO........',
        '..ORRRRRRRRRRRRRRROO......',
        '.OrrrrrrrrrrrrrrrrrrO.....',
        '.OWWWWWWWWWWWWWWWWWWO.....',
        '.OWWPPPWwPPPPPWwPPPWWO....',
        '.OWWPYPWwPPYPPWwPYPWWO....',
        '.OWWPPPWwPPrPPWwPPPWWO....',
        '.OwwPPPPwPPOOOpPPPPwwO....',
        '.OSSSSSSSSOwwOSSSSSSSO....',
        '.OssssssssOwwOsssssssO....',
        '..OOOOOOOOOOOOOOOOOOO.....',
      ];
    } else if (vKey === 1) {
      // Variant 1: Golden-ochre shingled gable house with porch lantern
      rows = [
        '........OOOOOOOOOO........',
        '......OOYYYYYYYYYYOO......',
        '.....OGGGGGGGGGGGGGGO.....',
        '....OGGGgGGGGGGgGGGGGO....',
        '...OGGgGGGGGGGGGGgGGGGO...',
        '..OggggggggggggggggggggO..',
        '..OWWWWWWWWWWWWWWWWWWWWO..',
        '..OWWPPPWwPPWWPPwPPPWwWO..',
        '..OWWPYPWwPYWWYPwPPPYwWO..',
        '..OWWPPPWwPPWWPPwPPPWWwO..',
        '..OwwPPPPOOOOWWWwPPPPwwO..',
        '..OSSSSSSOwwOSSSSSSSsSSO..',
        '..OssssssOwwOssssssssssO..',
        '...OOOOOOOOOOOOOOOOOOOO...',
      ];
    } else {
      // Variant 2: Cool slate-roofed half-timbered lodge with left chimney
      rows = [
        '....OOOO..................',
        '....OSSOOOOOOOOOOO........',
        '....OSSHQQQQQQQQQQOO......',
        '....OSSQQQQQQQQQQQQQO.....',
        '...OQQQQQQQQQQQQQQQQQO....',
        '..OqqqqqqqqqqqqqqqqqqqO...',
        '..OWWWWWWWWWWWWWWWWWWWWO..',
        '..OWPPPWwPPPPPPwPPPWwPPO..',
        '..OWPYPWwPPYYPPwPYPWwPPO..',
        '..OWPPPWwPPPPPPwPPPWwPPO..',
        '..OwwPPwPPOOOOPwPPPPwppO..',
        '..OSSSSSSSOwwOSSSSSSSSSO..',
        '..OsssssssOwwOsssssssssO..',
        '...OOOOOOOOOOOOOOOOOOOO...',
      ];
    }
  } else if (kind === 'QUARRY') {
    rows = [
      '..........OOOOO...........',
      '.........OWWWWWO..........',
      '........OWWOOOWWOO........',
      '.......OWWO..OWWWWO.......',
      '......OWWO....OWWWWO......',
      '....OOWWOO....OSSSSOO.....',
      '...OSHHSSO....OHHHHSSO....',
      '..OSHSSSSO...OSHSSSSSSO...',
      '..OSSssSSO..OSSHSSSSsSO...',
      '..OssssssO..OSSssssssSO...',
      '..OSSSSSSO..OOOOOOOOOOO...',
      '..OssssssO................',
      '...OOOOOO.................',
    ];
  } else if (kind === 'WORKSHOP') {
    rows = [
      '.................OOOO.....',
      '.....OOOOOOOOOOOOOSSO.....',
      '....OTTTTTTTTTTTTSSSO.....',
      '...ORRRRRRRRRRRRRSSSO.....',
      '..OrrrrrrrrrrrrrrrrrrO....',
      '..OSSSSSSSSSSSSSSSSSSO....',
      '..OSHSHSHSHSHSHSHSHSSO....',
      '..OSSSWWPPPPPPPPWWSSSO....',
      '..OSSSWWPPFFYYFFWWSSSO....',
      '..OSSSWWPPFFYYFFWWSSSO....',
      '..OsssWWPPFOOOOFWWsssO....',
      '..OsssSSSSSOsssOsssssO....',
      '...OOOOOOOOOOOOOOOOOO.....',
    ];
  } else if (kind === 'OBSERVATORY') {
    rows = [
      '.......OOOOOOOOOO.........',
      '.....OOBBBBBBBBBBOO.......',
      '....OBBBBBbbGGGGGGGGGO....',
      '...OBBBBBBbbGYYYYGGGGO....',
      '...ObbbbbbbbGGGGGGGOO.....',
      '...OSSSSSSSSSSSSSSO.......',
      '..OSHHHHHHHHHHHHHHSO......',
      '..OSSSSBBOOOOBBSSSSO......',
      '..OSSSSBBOOOOBBSSSSO......',
      '..OSSssSSOOOOSSssSSO......',
      '..OssssssOOOOssssssO......',
      '...OOOOOOOOOOOOOOOO.......',
    ];
  } else if (kind === 'WINDMILL') {
    rows = [
      '........OOOOOOOO..........',
      '.......ORRRRRRRRO.........',
      '......ORrrrrrrrrRO........',
      '......OPPPPPPPPPPO........',
      '.....OPPPPGGGGPPPPO.......',
      '.....OPPPPGYYGPPPPO.......',
      '.....OPPPpGGGGpPPPO.......',
      '....OPPPPPPPPPPPPPPO......',
      '....OPPPPpOOOOpPPPPO......',
      '....OSSSSSOwwOSSSSSO......',
      '....OsssssOwwOsssssO......',
      '.....OOOOOOOOOOOOOO.......',
    ];
  } else if (kind === 'CIVIC_HALL') {
    rows = [
      '..........OOOOOOOOOOOOOO..........',
      '........OOEEEEEEEEEEEEEEOO........',
      '......OOEEEEGGGGGGGGGGEEEEOO......',
      '.....OEEEEEGGGGYYYYGGGGEEEEEO.....',
      '....OeeeeeeeeeeeeeeeeeeeeeeeeO....',
      '...OSSSSSSSSSSSSSSSSSSSSSSSSSSO...',
      '...OHHHOHHHOHHHOHHHOHHHOHHHOHHO...',
      '...OHHHOpPPOHHHOpPPOHHHOpPPOHHO...',
      '...OHHHOpPPOHHHOpPPOHHHOpPPOHHO...',
      '...OHHHOpPPOHHHOpPPOHHHOpPPOHHO...',
      '...OSSSOpPPOSSSOOOOSSSOpPPOSSSO...',
      '...OsssOOOOOsssOOOOsssOOOOOsssO...',
      '..OSSSSSSSSSSSSSSSSSSSSSSSSSSSSO..',
      '...OOOOOOOOOOOOOOOOOOOOOOOOOOOO...',
    ];
  } else if (kind === 'TOTEM_SHRINE') {
    rows = [
      '..........OOOOOO..........',
      '.........OHHHHHHO.........',
      '........OHBBBBBBHO........',
      '........OHHSSSSSHO........',
      '.........OSYssYSO.........',
      '.........OSSWWSSO.........',
      '........OOWWFFWWOO........',
      '.......OWWSSYYSSWWO.......',
      '......OSSSSOOOOSSSSO......',
      '.....OSssSsOYYOsSssSO.....',
      '....OSSsSSsSSSSsSSsSSO....',
      '....OssssssssssssssssO....',
      '.....OOOOOOOOOOOOOOOO.....',
    ];
  } else if (kind === 'BLACKSMITH') {
    rows = [
      '..............OOOO........',
      '......OOOOOOOOOSSO........',
      '....OOTTTTTTTTTSSO........',
      '...OTTRRRRRRRRRSSO........',
      '..ORRRRRRRRRRRRRRROO......',
      '.OrrrrrrrrrrrrrrrrrrO.....',
      '.OWWWWWWWWWWWWWWWWWWO.....',
      '.OWWSSSSSSWWPPPPPPWWO.....',
      '.OWWSFFFFSWWPOOOOPWWO.....',
      '.OWWSFYYFSWWPOWwOPWWO.....',
      '.OwwSSFFSSWWPOwwOPwwO.....',
      '.OSSSSSSSSOOOwOOwOSSO.....',
      '.OssssssssssOOOOOsssO.....',
      '..OOOOOOOOOOOOOOOOOO......',
    ];
  } else if (kind === 'ARMORY_FORGE') {
    rows = [
      '..........OOOO....OOOO....',
      '.....OOOOOSSSSOOOOSSSSO...',
      '....ORRRRRSSSSRRRRSSSSO...',
      '...ORrrrrrrrrrrrrrSSSSO...',
      '..OSSSSSSSSSSSSSSSSSSSO...',
      '..OSHSHSHSHSHSHSHSHSHSO...',
      '..OSSGGGGGSSFFYYFFSSGSO...',
      '..OSSGYYYGSSFFYYFFSSGSO...',
      '..OSSGGGGGSSFOOOOFSSGSO...',
      '..OSSssSsSSSsOwwOsSSsSO...',
      '..OSSSSSSSSSSOwwOSSSSSO...',
      '..OssssssssssOwwOsssssO...',
      '...OOOOOOOOOOOOOOOOOOO....',
    ];
  } else if (kind === 'CHRONOMETER_TOWER') {
    rows = [
      '...........OOOO...........',
      '..........OGYYGO..........',
      '.........OGGGGGGO.........',
      '........OOBBBBBBOO........',
      '.......OBBBYYYYBBBO.......',
      '.......OBBYPPPPYBBO.......',
      '.......OBBPPGGPPBBO.......',
      '........OSSSSSSSSO........',
      '.......OSHSSSSSSHSO.......',
      '.......OSSSSOOSSSSO.......',
      '.......OSSSSwwSSSSO.......',
      '.......OSsSSwwSSsSO.......',
      '......OSSSSSSSSSSSSO......',
      '.......OOOOOOOOOOOO.......',
    ];
  } else {
    rows = [
      '......OOOOO..........OOOOO........',
      '......OsssO..........OsssO........',
      '....OOWWWWOOOOOOOOOOOOWWWWOO......',
      '...ORRRRRRRRRRRRRRRRRRRRRRRRO.....',
      '..OrrrrrrrrrrrrrrrrrrrrrrrrrrO....',
      '..OSSSSSSSSSSSSSSSSSSSSSSSSSSO....',
      '..OSHSHSHGGGGGGGGGGGGGGSHSHSHO....',
      '..OSSSSSSGYYYYGGGGYYYYGSSSSSSO....',
      '..OSSFFSSGGGGGGGGGGGGGGSSFFSSO....',
      '..OSSFFSSGGGgOOOOOOgGGGSSFFSSO....',
      '..OssssssSSSsOwwwwOsSSSssssssO....',
      '..OSSSSSSSSSSOwwwwOSSSSSSSSSSO....',
      '...OOOOOOOOOOOOOOOOOOOOOOOOOO.....',
    ];
  }

  const sprite = compileMatrix(rows, BUILDING_PALETTE);
  spriteCache.set(key, sprite);
  return sprite;
}

export function getAutomatonSprite(frame: 0 | 1): HTMLCanvasElement {
  const key = `auto2_${frame}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const palette: Record<string, string> = {
    O: '#24191a',
    G: '#f59e0b',
    g: '#b45309',
    Y: '#fde047',
    C: '#38bdf8',
    S: '#64748b',
  };

  const rows =
    frame === 0
      ? [
          '.....OOOO.....',
          '....OYYYYO....',
          '.....OGGO.....',
          '...OOGGGGOO...',
          '..OGGGCCGGGO..',
          '..OGGGGGGGGO..',
          '..OggGGGGggO..',
          '..OSSO..OSSO..',
          '..OOO....OOO..',
        ]
      : [
          '.....OOOO.....',
          '....OGYYGO....',
          '.....OGGO.....',
          '...OOGGGGOO...',
          '..OGGGCCGGGO..',
          '..OGGGGGGGGO..',
          '..OggGGGGggO..',
          '...OSSO.OSSO..',
          '...OOO...OOO..',
        ];

  const sprite = compileMatrix(rows, palette);
  spriteCache.set(key, sprite);
  return sprite;
}

// ============================================================================
// CRAFTED TOOLS, WEAPONS & UTILITY SPRITES (12x12)
// ============================================================================
const ITEM_PALETTE: Record<string, string> = {
  O: '#16141a',
  W: '#8c5832',
  w: '#5c371d',
  L: '#c29b68',
  S: '#cbd5e1',
  s: '#64748b',
  C: '#ea580c',
  c: '#9a3412',
  B: '#f59e0b',
  b: '#b45309',
  Y: '#fde047',
  A: '#38bdf8',
  a: '#0284c7',
  R: '#ef4444',
  G: '#34d399',
};

export function getCraftedItemSprite(kind: CraftedItemKind): HTMLCanvasElement {
  const key = `craft_item_${kind}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  let rows: string[];
  switch (kind) {
    case 'FLINT_SPEAR':
      rows = [
        '.........OOO',
        '........OSSO',
        '.......OSSS.',
        '......OsSO..',
        '.....OWWO...',
        '....OWwO....',
        '...OWwO.....',
        '..OWwO......',
        '.OWwO.......',
        'OWwO........',
        'wWO.........',
        'OO..........',
      ];
      break;
    case 'STONE_AXE':
      rows = [
        '....OOOOO...',
        '...OSSSSSO..',
        '..OSSssSSWO.',
        '..OSssOWwO..',
        '...OOOWwO...',
        '.....OWwO...',
        '....OWwO....',
        '...OWwO.....',
        '..OWwO......',
        '.OWwO.......',
        '.wWO........',
        '.OO.........',
      ];
      break;
    case 'WOVEN_BASKET':
      rows = [
        '....OOOO....',
        '...OLLLLO...',
        '..OLOOOOLL..',
        '.OLOO..OOLO.',
        '.OLLLLLLLLO.',
        'OWwLwLwLwLwO',
        'OLwWwLwWwLwO',
        'OWwLwLwLwLwO',
        '.OLwWwLwWwO.',
        '.OWwLwLwLwO.',
        '..OOOOOOOO..',
        '............',
      ];
      break;
    case 'TIMBER_BOW':
      rows = [
        '....OOO.....',
        '..OOWWLO....',
        '.OWWO.SLO...',
        'OWwO..S.O...',
        'OWO...S.....',
        'OWO...S.....',
        'OWO...S.....',
        'OWwO..S.O...',
        '.OWWO.SLO...',
        '..OOWWLO....',
        '....OOO.....',
        '............',
      ];
      break;
    case 'COPPER_PICKAXE':
      rows = [
        '..OOOOOOOO..',
        '.OCCcCCcCCO.',
        'OCcOOWwOOcCO',
        '.OO.OWwO.OO.',
        '....OWwO....',
        '....OWwO....',
        '....OWwO....',
        '....OWwO....',
        '....OWwO....',
        '....OWwO....',
        '....OWWO....',
        '.....OO.....',
      ];
      break;
    case 'BRONZE_SWORD':
      rows = [
        '..........OO',
        '.........OYO',
        '........OBYO',
        '.......OBBO.',
        '......OBbO..',
        '....OOBbO...',
        '...OYYBO....',
        '..OBYYO.....',
        '.OWwOYO.....',
        'OWwO........',
        'BYO.........',
        'OO..........',
      ];
      break;
    case 'BRONZE_SHIELD':
      rows = [
        '..OOOOOOOO..',
        '.OBYYYYYYBO.',
        'OBYBBBBBBYBO',
        'OBBBOYYOBBBO',
        'OBBBYGGYBBBO',
        'OBBBYGGYBBBO',
        'OBBBbYYbBBBO',
        '.OBbBBBBbBO.',
        '.OBbbBBbbBO.',
        '..OBbbbbBO..',
        '...OBbbBO...',
        '....OOOO....',
      ];
      break;
    case 'ARTISAN_HAMMER':
      rows = [
        '..OOOOOOOO..',
        '.OBYYYYYYBO.',
        '.OBBBBBBBBO.',
        '..OOOWwOOO..',
        '....OWwO....',
        '....OWwO....',
        '....OWwO....',
        '....OWwO....',
        '....OWwO....',
        '....OWwO....',
        '....OWWO....',
        '.....OO.....',
      ];
      break;
    case 'CLOCKWORK_HALBERD':
      rows = [
        '.......OOOO.',
        '......OYYYO.',
        '.....OYBYYYO',
        '....OYBAABYO',
        '....OOBBBBO.',
        '....OOWwOO..',
        '....OWwO....',
        '...OWwO.....',
        '..OWwO......',
        '.OWwO.......',
        'OWwO........',
        'OO..........',
      ];
      break;
    case 'PRECISION_WRENCH':
      rows = [
        '....OO..OO..',
        '...OYYOOYYO.',
        '...OYY..YYO.',
        '....OYYYYO..',
        '.....OBBO...',
        '....OBABO...',
        '...OBbAO....',
        '..OBbO......',
        '.OBbO.......',
        'OBbO........',
        'BYO.........',
        'OO..........',
      ];
      break;
    case 'BRASS_ASTROLABE':
    default:
      rows = [
        '.....OO.....',
        '....OYYO....',
        '..OOBYYBOO..',
        '.OBYAAAAYBO.',
        '.OBAAYYAABO.',
        'OBYAYBBYAYBO',
        'OBAAYBBYAABO',
        '.OBAAYYAABO.',
        '.OBYAAAAYBO.',
        '..OOBBBBOO..',
        '....OOOO....',
        '............',
      ];
      break;
  }

  const sprite = compileMatrix(rows, ITEM_PALETTE);
  spriteCache.set(key, sprite);
  return sprite;
}

// ============================================================================
// VILLAGER DISCOVERY PIXEL ART ASSETS (12x12)
// ============================================================================
const DISCOVERY_PALETTE: Record<string, string> = {
  O: '#18141a',
  Y: '#fde047',
  B: '#f59e0b',
  b: '#b45309',
  W: '#92400e',
  w: '#5c2d12',
  L: '#d6b482',
  G: '#4ade80',
  g: '#15803d',
  R: '#ef4444',
  r: '#fca5a5',
  C: '#38bdf8',
  c: '#0369a1',
  P: '#c084fc',
  p: '#7e22ce',
  S: '#e2e8f0',
  s: '#64748b',
  K: '#262b36',
  k: '#94a3b8',
  F: '#ea580c',
  H: '#f8fafc',
};

export function getDiscoverySprite(assetId: DiscoveryAssetId): HTMLCanvasElement {
  const key = `disc_asset_${assetId}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  let rows: string[];
  switch (assetId) {
    case 'CEDAR_SAP':
      rows = [
        '.....OO.....',
        '....OYYO....',
        '....OBYO....',
        '...OBYYBO...',
        '..OBYYYYBO..',
        '..OBYBBYBO..',
        '..OBBBBBBO..',
        '..OBbBBbBO..',
        '...ObbbbO...',
        '....OOOO....',
        '............',
        '............',
      ];
      break;
    case 'WOOD_TOTEM':
      rows = [
        '...OOOOOO...',
        '..OWWWWWWO..',
        '.OWCCWWCCWO.',
        '.OWWWYYWWWO.',
        '..OWWWWWWO..',
        '..OWwLLwWO..',
        '..OWwCCwWO..',
        '..OWWWWWWO..',
        '..OWwBBwWO..',
        '..OwwwwwwO..',
        '...OOOOOO...',
        '............',
      ];
      break;
    case 'BARK_HERB':
      rows = [
        '......OOO...',
        '.....OGGGO..',
        '...OOGgGGO..',
        '..OGGGOgO...',
        '..OGgGOO....',
        '...OOGWWO...',
        '....OWWWO...',
        '...OWwWwO...',
        '..OWWwwWO...',
        '..OwwwwwO...',
        '...OOOOO....',
        '............',
      ];
      break;
    case 'FLAX_FIBER':
      rows = [
        '...OO..OO...',
        '..OCOOOCO...',
        '..OC.C.CO...',
        '...OGGGO....',
        '..OGLYLGO...',
        '..OLLBLLO...',
        '...OBBBO....',
        '..OLLLLO....',
        '..OLwLwO....',
        '..OLLLLLO...',
        '...OOOOO....',
        '............',
      ];
      break;
    case 'OWL_SANCTUARY':
      rows = [
        '..OO....OO..',
        '.OLLOOOOLLO.',
        '.OLSSSSSSLO.',
        '.OLSYOOYSLO.',
        '..OSBOOBSO..',
        '..OLLLLLLO..',
        '.OLLLLLLLLO.',
        '.OLsLLLLsLO.',
        '..OLLssLLO..',
        '...OB..BO...',
        '...OO..OO...',
        '............',
      ];
      break;
    case 'OBSIDIAN_VEIN':
      rows = [
        '.....OO.....',
        '....OKkO....',
        '...OKkkKO...',
        '..OKkPPkKO..',
        '..OKkPKkKO..',
        '.OKkkkkkkKO.',
        '.OKKKKKKKKO.',
        '..OKKKKKKO..',
        '..OKkKKkKO..',
        '...OOKKOO...',
        '.....OO.....',
        '............',
      ];
      break;
    case 'AMMONITE_FOSSIL':
      rows = [
        '...OOOOOO...',
        '..OSSSSSSO..',
        '.OSLLOOLLSO.',
        '.OSLOYYOLSO.',
        '.OSLOYBOLSO.',
        '.OSLOOOBLSO.',
        '.OSLLLLLSSO.',
        '..OSSSSSSO..',
        '...OssssO...',
        '....OOOO....',
        '............',
        '............',
      ];
      break;
    case 'COPPER_SEAM':
      rows = [
        '....OOOO....',
        '..OOGCCGOO..',
        '.OFGGGGGGFO.',
        '.OFFGOOGFFO.',
        '.OFFFFBFFFO.',
        '..OFFBFFFO..',
        '..OssssssO..',
        '.OssssssssO.',
        '..OOOOOOOO..',
        '............',
        '............',
        '............',
      ];
      break;
    case 'LODESTONE':
      rows = [
        '..OO....OO..',
        '.ORRO..OCCO.',
        '.ORRO..OCCO.',
        '.ORRO..OCCO.',
        '.OSSOOOOSSO.',
        '.OSSSSSSSSO.',
        '..OSSSSSSO..',
        '...OOOOOO...',
        '.....YY.....',
        '....YYYY....',
        '............',
        '............',
      ];
      break;
    case 'QUARTZ_GEODE':
      rows = [
        '....OOOO....',
        '...OSSSSO...',
        '..OSPPPPSO..',
        '.OSPPHHPPSO.',
        '.OSPPCCPPPO.',
        '.OsSPPPPPsO.',
        '.OsssPPsssO.',
        '..OssssssO..',
        '...OOOOOO...',
        '............',
        '............',
        '............',
      ];
      break;
    case 'SEA_SALT':
      rows = [
        '.....OO.....',
        '....OHHO....',
        '...OHHCHO...',
        '..OHHHHHO...',
        '.OOHHCCCHOO.',
        'OHHHCHHHHHHO',
        'OHCHHHHHHHHO',
        '.OSSSSSSSSO.',
        '..OOOOOOOO..',
        '............',
        '............',
        '............',
      ];
      break;
    case 'GRIND_COBBLE':
      rows = [
        '...OOOOOO...',
        '..OSSSSSSO..',
        '.OSHSSSHSSO.',
        '.OSSsOOsSSO.',
        '.OSSsOOsSSO.',
        '.OSSSSSSSSO.',
        '..OssssssO..',
        '...OOOOOO...',
        '............',
        '............',
        '............',
        '............',
      ];
      break;
    case 'PEARL_SHELL':
      rows = [
        '...OOOOOO...',
        '..OPPCCPPO..',
        '.OPHHHHHHPO.',
        '.OPHHSSHHPO.',
        '.OPCHHHHCPO.',
        '..OPPPPPPO..',
        '..OssssssO..',
        '...OOOOOO...',
        '............',
        '............',
        '............',
        '............',
      ];
      break;
    case 'DRIFTWOOD':
      rows = [
        '........OOO.',
        '.......OLLLO',
        '.....OOLLLWO',
        '...OOLLLLWO.',
        '.OOLLLLWWO..',
        'OLLLLWWOO...',
        'OLLWWOO.....',
        '.OOOO.......',
        '............',
        '............',
        '............',
        '............',
      ];
      break;
    case 'BERRY_THICKET':
      rows = [
        '....OOOO....',
        '..OOGGGGOO..',
        '.OGGRrGGrrO.',
        '.OGGRRGGRRO.',
        '.OGgGGGGgGO.',
        '..OGGrrGGO..',
        '...OgRROO...',
        '....OWWO....',
        '.....OO.....',
        '............',
        '............',
        '............',
      ];
      break;
    case 'CLAY_POT':
      rows = [
        '...OOOOOO...',
        '..OFFLLFFO..',
        '...OFFFFO...',
        '..OFFFFFFO..',
        '.OFYYYYYYFO.',
        '.OFFFFFFFFO.',
        '.OFwFFFFwFO.',
        '.OFFFFFFFFO.',
        '..OFFFFFFO..',
        '...OOOOOO...',
        '............',
        '............',
      ];
      break;
    case 'SWEET_TUBER':
      rows = [
        '....OOOO....',
        '...OGGGGO...',
        '....OGGO....',
        '...OBBBBO...',
        '..OBLLLLBO..',
        '.OBLLBBLLBO.',
        '.OBBBBBBBBO.',
        '..OBBBBBBO..',
        '...ObbbbO...',
        '....OOOO....',
        '............',
        '............',
      ];
      break;
    case 'STANDING_STONE':
      rows = [
        '....OOOO....',
        '...OSSSSO...',
        '...OSSCCO...',
        '..OSSCCSSO..',
        '..OSSOSSSO..',
        '..OSSCCSSO..',
        '..OSSSSSSO..',
        '..OGGssGGO..',
        '.OOGssssGOO.',
        '.OOOOOOOOOO.',
        '............',
        '............',
      ];
      break;
    case 'WILD_HONEY':
      rows = [
        '...OOOOOO...',
        '..OYYYYYYO..',
        '.OYBYYBYYYO.',
        '.OYYYYBYYYO.',
        '.OYBYYBYYBO.',
        '..OYYYYYYO..',
        '..OBBYYBBO..',
        '...OBYYBO...',
        '....OYYO....',
        '.....OO.....',
        '............',
        '............',
      ];
      break;
    case 'COAL_NODULE':
      rows = [
        '...OOOOOO...',
        '..OKkKKkKO..',
        '.OKkKKKKkKO.',
        '.OKKKKKKKKO.',
        '.OKkCKKCKKO.',
        '..OKKKKKKO..',
        '..OKkkkkKO..',
        '...OOOOOO...',
        '............',
        '............',
        '............',
        '............',
      ];
      break;
    case 'STORM_FULGURITE':
      rows = [
        '......OOO...',
        '.....OYYO...',
        '....OYCCO...',
        '...OYYCO....',
        '..OYYCCOO...',
        '...OOYYCCO..',
        '....OYCCO...',
        '...OYYCO....',
        '..OHHHO.....',
        '..OOOO......',
        '............',
        '............',
      ];
      break;
    case 'FROST_AMBER':
    default:
      rows = [
        '....OOOO....',
        '...OHCCCHO..',
        '..OHCCYYCCO.',
        '.OHCCYBBYCCO',
        '.OHCCYBBYCCO',
        '..OCCYBBYCO.',
        '..OHCCCCCCCO',
        '...OHCCCCHO.',
        '....OOOOOO..',
        '............',
        '............',
        '............',
      ];
      break;
  }

  const sprite = compileMatrix(rows, DISCOVERY_PALETTE);
  spriteCache.set(key, sprite);
  return sprite;
}
