import type { Vec2 } from '../physics/world';

export type FloorStyle = 'neon' | 'ocean' | 'lava' | 'nightmarket' | 'candy' | 'space';
export type AmbientFx = 'stars' | 'bubbles' | 'embers' | 'lanterns' | 'sprinkles';

export interface Theme {
  background: number;
  fog: number;
  floorStyle: FloorStyle;
  floorBase: string;
  floorAccent: string;
  floorAccent2: string;
  wall: number;
  wallEmissive: number;
  rail: number;
  bumperBody: number;
  bumperCap: number;
  sling: number;
  target: number;
  accent: number;
  accent2: number;
  keyLight: number;
  fillLight: number;
  ambient: number;
  ambientFx: AmbientFx;
  /** Particle colour(s) for the ambient effect; several = random per particle. */
  ambientColors: number[];
  /** Menu card gradient. */
  card: [string, string];
  /** How much the floor art glows by itself (bright floors need less). */
  floorGlow?: number;
  /** Bloom luminance threshold (bright themes need a higher one). */
  bloomThreshold?: number;
  /** Tone-mapping exposure (default 1.05). */
  exposure?: number;
  /** Multiplier for all scene lights (default 1). */
  lightScale?: number;
  /** Base pitch for synthesized SFX, so each level sounds a little different. */
  pitch: number;
  bloom: number;
}

export interface Difficulty {
  /** 1-5, shown in the menu. */
  stars: number;
  /** Playfield gravity: a steeper table makes the ball faster. */
  gravity: number;
  /** Shorter flippers leave a wider gap between them. */
  flipperLength: number;
  /** Outlane width (0 = no outlanes). Balls that go down an outlane are lost. */
  outlane: number;
  /** Whether the left outlane has a kickback that can be lit. */
  kickback: boolean;
  /** Seconds of ball save after each launch. */
  ballSave: number;
  bumperKick: number;
}

export interface BumperDef {
  pos: Vec2;
  r: number;
  layer?: number;
}

export interface TargetBank {
  /** Start point of the bank line and direction it runs along. */
  start: Vec2;
  dir: Vec2;
  count: number;
  spacing: number;
  layer?: number;
}

export interface SaucerExit {
  pos: Vec2;
  angle: number;
}

/**
 * A hole the ball drops into and is later spat back out of.
 * - plain kickout: spits the ball back out where it went in
 * - `exit`: tunnel, the ball travels underground and pops out elsewhere
 * - `exits`: teleporter, pops out of a random one of several exits
 * - `lock`: holds the first ball (a new one is served); the next ball releases both = multiball
 * - `hold`: keeps the ball for this many seconds, racking up a bonus the whole time
 */
export interface SaucerDef {
  pos: Vec2;
  /** Direction (radians) the ball is ejected in. */
  ejectAngle: number;
  exit?: SaucerExit;
  exits?: SaucerExit[];
  lock?: boolean;
  hold?: number;
  name: string;
}

export interface RampDef {
  id: string;
  name: string;
  /** Centre line from the entrance to the end. */
  points: Vec2[];
  /** Height above the playfield at each point. */
  heights: number[];
  width: number;
  layer: number;
  /** The ramp ends in this saucer/tunnel instead of dropping the ball. */
  endSaucer?: number;
}

export interface DeckDef {
  name: string;
  layer: number;
  height: number;
  /** Floor outline of the raised platform. */
  polygon: Vec2[];
  walls: Vec2[][];
  flipper: { pivot: Vec2; length: number; rest: number; up: number; left: boolean };
}

export interface SpinnerDef {
  pos: Vec2;
  /** Direction balls travel through it (radians). */
  angle: number;
  width: number;
}

export type MissionKind = 'bumper' | 'ramp' | 'bank' | 'lanes' | 'saucer' | 'spinner' | 'deck';

export interface MissionDef {
  kind: MissionKind;
  count: number;
  label: string;
  /** Restrict to one ramp id / bank index / saucer index. */
  target?: string | number;
}

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  /** One line shown in the menu. */
  blurb: string;
  theme: Theme;
  difficulty: Difficulty;
  bumpers: BumperDef[];
  posts: { pos: Vec2; r: number }[];
  targetBanks: TargetBank[];
  saucers: SaucerDef[];
  /** Extra static walls as polylines. */
  walls: Vec2[][];
  ramps: RampDef[];
  decks: DeckDef[];
  spinners: SpinnerDef[];
  /** Pool that missions are drawn from at random; each one completed pays a bonus. */
  missions: MissionDef[];
  /** Multiball starts every time this many missions have been completed. */
  multiballAfter?: number;
}

const v = (x: number, y: number): Vec2 => ({ x, y });
const pts = (a: number[][], mirror = false) => a.map(([x, y]) => v(mirror ? -x : x, y));

/**
 * Big U-ramp: the mouth is right of centre (a left-flipper shot), it climbs the
 * right side, crosses the top of the table and drops the ball into the left inlane.
 */
function uRampHigh(id: string, name: string, endX: number, layer: number): RampDef {
  return {
    id,
    name,
    points: pts([
      [3.2, 17.5], [3.9, 20.5], [4.9, 24.5], [5.8, 28.5], [5.6, 31.0], [4.2, 32.6], [2.0, 33.2],
      [-1.0, 33.2], [-4.0, 32.4], [-6.4, 30.2], [-7.5, 27.0], [-7.7, 23.0], [-7.6, 19.0], [endX, 16.0],
    ]),
    // Peaks on the right and keeps falling gently after that, so a slow ball never stalls on top.
    heights: [0, 1.2, 2.6, 3.2, 3.45, 3.35, 3.2, 3.0, 2.8, 2.6, 2.3, 2.0, 1.6, 1.25],
    width: 1.5,
    layer,
  };
}

/** Lower, tighter U-ramp: mouth left of centre, drops the ball into the right inlane. */
function uRampLow(id: string, name: string, endX: number, layer: number): RampDef {
  return {
    id,
    name,
    points: pts([
      [-3.2, 17.5], [-3.9, 20.5], [-4.6, 24.0], [-4.0, 27.4], [-2.2, 29.4], [0.6, 29.9], [3.2, 29.2],
      [5.0, 27.4], [6.4, 24.4], [7.3, 20.5], [endX, 16.0],
    ]),
    heights: [0, 1.2, 1.8, 2.05, 2.1, 2.0, 1.85, 1.6, 1.5, 1.4, 1.25],
    width: 1.5,
    layer,
  };
}

/** Raised platform in the top-left corner (mirrored = top-right) with its own flipper and ramps. */
function deckSet(name: string, mirror: boolean): { deck: DeckDef; entry: RampDef; exit: RampDef } {
  const s = mirror ? -1 : 1;
  const deck: DeckDef = {
    name,
    layer: 1,
    height: 2.4,
    polygon: pts([[-8.6, 25.0], [-3.6, 25.0], [-3.6, 33.0], [-8.6, 33.0]], mirror),
    walls: [
      pts([[-8.6, 27.6], [-8.6, 33.0], [-3.6, 33.0], [-3.6, 32.4]], mirror),
      pts([[-3.6, 30.6], [-3.6, 25.0]], mirror),
      pts([[-8.6, 27.6], [-7.9, 26.7]], mirror),
      // Sloped floor right under the resting flipper: nothing can get trapped beneath it.
      pts([[-7.9, 26.7], [-5.9, 25.35]], mirror),
    ],
    flipper: {
      pivot: v(-7.9 * s, 26.7),
      length: 2.2,
      rest: mirror ? Math.PI + 0.45 : -0.45,
      up: mirror ? Math.PI - 0.45 : 0.45,
      left: !mirror,
    },
  };
  const entry: RampDef = {
    id: 'deck-in',
    name: `${name}坡道`,
    // Ends just inside the deck edge so the rails don't stick out into the deck.
    points: pts([[3.4, 18], [4.0, 21], [4.6, 25], [4.6, 28.4], [3.4, 30.8], [0.6, 31.5], [-2.4, 31.5], [-3.8, 31.5]], mirror),
    heights: [0, 1.2, 2.4, 3.0, 3.1, 2.8, 2.6, 2.4],
    width: 1.5,
    layer: 1,
  };
  const exit: RampDef = {
    id: 'deck-out',
    name: `${name}出口`,
    points: pts([[-4.7, 25.4], [-4.7, 23.0], [-4.2, 20.6], [-3.6, 18.6]], mirror),
    heights: [2.4, 2.0, 1.6, 1.25],
    width: 2.0,
    layer: 1,
  };
  return { deck, entry, exit };
}

/**
 * A full plunger shot rides the top arc and comes down the left wall, straight
 * into the left outlane. This fin knocks it back toward the middle.
 */
const LEFT_FIN = [v(-8.85, 24.6), v(-7.5, 23.3)];
/** Deflectors under the orbit lanes, so a ball coming down a lane is sent toward the flippers. */
const ORBIT_DEFLECT_R = [v(8.85, 18.8), v(7.1, 16.8)];
const ORBIT_DEFLECT_L = [v(-8.85, 18.8), v(-7.1, 16.8)];

const nightDeck = deckSet('夾娃娃機', false);
const spaceDeck = deckSet('太空站', true);

const THEME0: Theme = {
  background: 0x07021a,
  fog: 0x0b0326,
  floorStyle: 'neon',
  floorBase: '#120634',
  floorAccent: '#ff2bd6',
  floorAccent2: '#19f0ff',
  wall: 0x1c1440,
  wallEmissive: 0x19f0ff,
  rail: 0x2a1d5c,
  bumperBody: 0x2b0b4d,
  bumperCap: 0xff2bd6,
  sling: 0x19f0ff,
  target: 0xffe14d,
  accent: 0xff2bd6,
  accent2: 0x19f0ff,
  keyLight: 0xb7a8ff,
  fillLight: 0xff2bd6,
  ambient: 0x3a2a7a,
  ambientFx: 'stars',
  ambientColors: [0xffffff],
  card: ['#1a0638', '#5b0d8a'],
  pitch: 1,
  bloom: 0.55,
};

const THEME1: Theme = {
  background: 0x01121f,
  fog: 0x02283d,
  floorStyle: 'ocean',
  floorBase: '#063a52',
  floorAccent: '#5ff2e0',
  floorAccent2: '#f2d39b',
  wall: 0x0b3a4f,
  wallEmissive: 0x2fe0c8,
  rail: 0x0e4d63,
  bumperBody: 0x0d5872,
  bumperCap: 0x7cf9ff,
  sling: 0xffa36b,
  target: 0xff6fa8,
  accent: 0x5ff2e0,
  accent2: 0xff8fb8,
  keyLight: 0xbff6ff,
  fillLight: 0x2fe0c8,
  ambient: 0x1a5a70,
  ambientFx: 'bubbles',
  ambientColors: [0xbff9ff],
  card: ['#032a3f', '#0b6a73'],
  pitch: 0.8,
  bloom: 0.45,
};

const THEME2: Theme = {
  background: 0x120403,
  fog: 0x2a0905,
  floorStyle: 'lava',
  floorBase: '#1d0b07',
  floorAccent: '#ff5a1f',
  floorAccent2: '#ffd23f',
  wall: 0x2a1410,
  wallEmissive: 0xff5a1f,
  rail: 0x3a1a12,
  bumperBody: 0x3a120a,
  bumperCap: 0xffb02e,
  sling: 0xff3d1f,
  target: 0xffd23f,
  accent: 0xff5a1f,
  accent2: 0xffd23f,
  keyLight: 0xffc9a0,
  fillLight: 0xff4a12,
  ambient: 0x5a2010,
  ambientFx: 'embers',
  ambientColors: [0xff7a2a, 0xffc53a],
  card: ['#2a0905', '#8a2a0a'],
  pitch: 0.65,
  bloom: 0.6,
};

const THEME3: Theme = {
  background: 0x1a0606,
  fog: 0x2a0a08,
  floorStyle: 'nightmarket',
  floorBase: '#2a0d0a',
  floorAccent: '#ff3b30',
  floorAccent2: '#ffcc33',
  wall: 0x3a1410,
  wallEmissive: 0xffb347,
  rail: 0x4a1a12,
  bumperBody: 0x8a0f0f,
  bumperCap: 0xff4433,
  sling: 0xffcc33,
  target: 0x4dd2ff,
  accent: 0xff3b30,
  accent2: 0xffcc33,
  keyLight: 0xffd8a8,
  fillLight: 0xff5533,
  ambient: 0x5a2010,
  ambientFx: 'lanterns',
  ambientColors: [0xffb347, 0xff5533, 0xffd966],
  card: ['#3a0a08', '#a3150f'],
  pitch: 1.1,
  bloom: 0.6,
};

const THEME4: Theme = {
  background: 0xc98fb0,
  fog: 0xd9a3c1,
  floorStyle: 'candy',
  floorBase: '#ffa8d0',
  floorAccent: '#ff5fa2',
  floorAccent2: '#5fd6c8',
  wall: 0xff9ccc,
  wallEmissive: 0xff5fa2,
  rail: 0xff7ab8,
  bumperBody: 0xff7ab8,
  bumperCap: 0xfff27a,
  sling: 0x6fe3d0,
  target: 0xa77bff,
  accent: 0xff5fa2,
  accent2: 0x5fd6c8,
  keyLight: 0xffffff,
  fillLight: 0xffb3d9,
  ambient: 0xffd6ec,
  ambientFx: 'sprinkles',
  ambientColors: [0xff5fa2, 0x5fd6c8, 0xfff27a, 0xa77bff, 0xffffff],
  card: ['#ff5fa2', '#a77bff'],
  floorGlow: 0.04,
  bloomThreshold: 1.2,
  exposure: 0.6,
  lightScale: 0.45,
  pitch: 1.25,
  bloom: 0.25,
};

const THEME5: Theme = {
  background: 0x02010a,
  fog: 0x050318,
  floorStyle: 'space',
  floorBase: '#07051a',
  floorAccent: '#8a5cff',
  floorAccent2: '#3de8ff',
  wall: 0x161433,
  wallEmissive: 0x8a5cff,
  rail: 0x1c1840,
  bumperBody: 0x241a5c,
  bumperCap: 0x3de8ff,
  sling: 0xff5cc8,
  target: 0x7dff9a,
  accent: 0x8a5cff,
  accent2: 0x3de8ff,
  keyLight: 0xc8c0ff,
  fillLight: 0x8a5cff,
  ambient: 0x2a2060,
  ambientFx: 'stars',
  ambientColors: [0xffffff, 0xbcd8ff, 0xffd6f5],
  card: ['#07051a', '#3a1d8a'],
  pitch: 0.9,
  bloom: 0.6,
};

export const LEVELS: LevelDef[] = [
  {
    id: 0,
    name: '霓虹都市',
    subtitle: 'NEON CITY',
    blurb: '新手關：環繞坡道、旋轉閘、累積獎勵洞；擋板最長、救球最久',
    theme: THEME0,
    difficulty: { stars: 1, gravity: 44, flipperLength: 3.4, outlane: 0, kickback: false, ballSave: 10, bumperKick: 30 },
    bumpers: [
      { pos: v(-1.6, 27.0), r: 1.0 },
      { pos: v(1.6, 27.0), r: 1.0 },
      { pos: v(0, 23.8), r: 1.0 },
    ],
    posts: [{ pos: v(-4.6, 21.0), r: 0.3 }],
    targetBanks: [{ start: v(-1.4, 19.4), dir: v(1, 0), count: 3, spacing: 1.4 }],
    saucers: [{ pos: v(0, 30.3), ejectAngle: -Math.PI / 2 + 0.3, hold: 2.5, name: '能量核心' }],
    walls: [[v(6.5, 19.5), v(6.5, 27.0)], ORBIT_DEFLECT_R],
    ramps: [uRampHigh('neon', '霓虹坡道', -7.3, 1)],
    decks: [],
    spinners: [{ pos: v(7.7, 22.0), angle: Math.PI / 2, width: 2.0 }],
    missions: [
      { kind: 'bumper', count: 10, label: '彈射柱 10 次' },
      { kind: 'ramp', count: 1, label: '衝上霓虹坡道' },
      { kind: 'bank', count: 1, label: '打倒整排落靶' },
      { kind: 'spinner', count: 20, label: '旋轉閘轉 20 圈' },
      { kind: 'saucer', count: 1, label: '打進能量核心' },
      { kind: 'ramp', count: 2, label: '再上坡道 2 次' },
    ],
  },
  {
    id: 1,
    name: '深海秘境',
    subtitle: 'DEEP SEA',
    blurb: '坡道直通海底洞穴從另一頭吐出；珍珠蚌殼鎖球開多球',
    theme: THEME1,
    difficulty: { stars: 2, gravity: 48, flipperLength: 3.3, outlane: 0, kickback: false, ballSave: 8, bumperKick: 32 },
    bumpers: [
      { pos: v(1.0, 29.0), r: 0.95 },
      { pos: v(3.6, 27.0), r: 0.95 },
      { pos: v(1.2, 24.4), r: 0.95 },
      { pos: v(-1.4, 26.8), r: 0.9 },
    ],
    posts: [{ pos: v(0, 19.6), r: 0.35 }],
    targetBanks: [
      { start: v(-8.35, 14.6), dir: v(0, 1), count: 3, spacing: 1.45 },
      { start: v(8.35, 18.6), dir: v(0, -1), count: 3, spacing: 1.45 },
    ],
    saucers: [
      { pos: v(-6.9, 31.4), ejectAngle: -0.8, exit: { pos: v(7.4, 23.0), angle: Math.PI + 0.75 }, name: '海底洞穴' },
      { pos: v(-3.8, 31.2), ejectAngle: -Math.PI / 2 + 0.2, lock: true, name: '珍珠蚌殼' },
    ],
    walls: [LEFT_FIN],
    ramps: [
      {
        id: 'coral',
        name: '珊瑚坡道',
        points: pts([[-2.8, 18.2], [-3.5, 21.2], [-4.6, 25.0], [-5.6, 28.2], [-6.3, 30.2]]),
        heights: [0, 1.2, 2.0, 2.2, 2.0],
        width: 1.5,
        layer: 1,
        endSaucer: 0,
      },
    ],
    decks: [],
    spinners: [],
    missions: [
      { kind: 'saucer', count: 1, label: '進入海底洞穴', target: 0 },
      { kind: 'ramp', count: 2, label: '珊瑚坡道 2 次' },
      { kind: 'saucer', count: 2, label: '珍珠蚌殼鎖 2 顆球', target: 1 },
      { kind: 'bank', count: 2, label: '落靶全倒 2 組' },
      { kind: 'bumper', count: 20, label: '彈射柱 20 次' },
      { kind: 'saucer', count: 2, label: '再進洞穴 2 次', target: 0 },
    ],
  },
  {
    id: 2,
    name: '熔岩火山',
    subtitle: 'VOLCANO',
    blurb: '兩條立體交叉坡道、出球道與救球彈簧、多球',
    theme: THEME2,
    difficulty: { stars: 3, gravity: 52, flipperLength: 3.2, outlane: 1.35, kickback: true, ballSave: 6, bumperKick: 34 },
    bumpers: [
      { pos: v(0, 25.6), r: 0.95 },
      { pos: v(-1.9, 22.7), r: 0.9 },
      { pos: v(1.9, 22.7), r: 0.9 },
    ],
    posts: [],
    // Low enough that the gaps between it and the ramp entrances stay open.
    targetBanks: [{ start: v(-1.1, 14.0), dir: v(1, 0), count: 3, spacing: 1.1 }],
    saucers: [
      { pos: v(-7.7, 32.2), ejectAngle: -0.9, name: '火山口' },
      { pos: v(7.6, 30.6), ejectAngle: Math.PI + 0.9, name: '岩漿池' },
    ],
    walls: [LEFT_FIN],
    ramps: [uRampHigh('crater', '火山口坡道', -6.95, 2), uRampLow('lava', '熔岩流坡道', 6.95, 1)],
    decks: [],
    spinners: [],
    missions: [
      { kind: 'ramp', count: 2, label: '熔岩流坡道 2 次', target: 'lava' },
      { kind: 'ramp', count: 2, label: '火山口坡道 2 次', target: 'crater' },
      { kind: 'saucer', count: 2, label: '進入火山口 2 次' },
      { kind: 'bank', count: 2, label: '落靶全倒 2 組' },
      { kind: 'bumper', count: 30, label: '彈射柱 30 次' },
    ],
    multiballAfter: 3,
  },
  {
    id: 3,
    name: '台灣夜市',
    subtitle: 'NIGHT MARKET',
    blurb: '坡道通往二樓夾娃娃機平台（有自己的小擋板）；抽獎機隨機出口',
    theme: THEME3,
    difficulty: { stars: 3, gravity: 52, flipperLength: 3.2, outlane: 1.35, kickback: true, ballSave: 6, bumperKick: 34 },
    bumpers: [
      { pos: v(-0.6, 27.6), r: 0.95 },
      { pos: v(1.6, 25.0), r: 0.95 },
      { pos: v(-1.4, 23.4), r: 0.9 },
      { pos: v(-5.6, 29.2), r: 0.6, layer: 1 },
    ],
    posts: [],
    targetBanks: [
      { start: v(-1.2, 19.8), dir: v(1, 0), count: 3, spacing: 1.2 },
      { start: v(-7.2, 32.3), dir: v(1, 0), count: 3, spacing: 1.2, layer: 1 },
    ],
    saucers: [
      {
        pos: v(2.7, 28.3),
        ejectAngle: -Math.PI / 2,
        exits: [
          { pos: v(7.7, 25.8), angle: -Math.PI / 2 },
          { pos: v(-5.4, 20.6), angle: -0.9 },
          { pos: v(0, 22.0), angle: -Math.PI / 2 },
        ],
        name: '抽獎機',
      },
    ],
    walls: [[v(6.5, 19.5), v(6.5, 27.0)], ORBIT_DEFLECT_R, LEFT_FIN],
    ramps: [nightDeck.entry, nightDeck.exit],
    decks: [nightDeck.deck],
    spinners: [{ pos: v(7.7, 23.0), angle: Math.PI / 2, width: 2.0 }],
    missions: [
      { kind: 'deck', count: 1, label: '登上夾娃娃機平台' },
      { kind: 'bank', count: 1, label: '夾光平台上的娃娃', target: 1 },
      { kind: 'spinner', count: 25, label: '旋轉閘轉 25 圈' },
      { kind: 'saucer', count: 2, label: '抽獎機抽 2 次' },
      { kind: 'bumper', count: 25, label: '燈籠彈射柱 25 次' },
      { kind: 'deck', count: 2, label: '再上平台 2 次' },
    ],
    multiballAfter: 3,
  },
  {
    id: 4,
    name: '糖果樂園',
    subtitle: 'CANDY LAND',
    blurb: '彩虹坡道、巧克力隧道、棉花糖獎勵洞、兩個旋轉閘；出球道更寬',
    theme: THEME4,
    difficulty: { stars: 4, gravity: 56, flipperLength: 3.1, outlane: 1.4, kickback: true, ballSave: 4, bumperKick: 36 },
    bumpers: [
      { pos: v(0, 26.6), r: 0.8 },
      { pos: v(-1.9, 24.3), r: 0.8 },
      { pos: v(1.9, 24.3), r: 0.8 },
      { pos: v(0, 22.0), r: 0.8 },
    ],
    posts: [],
    targetBanks: [
      { start: v(-1.1, 18.0), dir: v(1, 0), count: 3, spacing: 1.1 },
      { start: v(-8.35, 14.6), dir: v(0, 1), count: 3, spacing: 1.45 },
    ],
    saucers: [
      { pos: v(6.9, 30.8), ejectAngle: Math.PI + 0.8, exit: { pos: v(-6.6, 26.2), angle: -0.75 }, name: '巧克力隧道' },
      { pos: v(3.6, 20.4), ejectAngle: Math.PI / 2 + 0.25, hold: 3, name: '棉花糖機' },
    ],
    walls: [LEFT_FIN],
    ramps: [uRampLow('rainbow', '彩虹糖坡道', 6.95, 1)],
    decks: [],
    spinners: [
      { pos: v(-7.6, 27.8), angle: Math.PI / 2, width: 1.8 },
      { pos: v(0.6, 32.6), angle: Math.PI / 2, width: 1.8 },
    ],
    missions: [
      { kind: 'ramp', count: 2, label: '彩虹糖坡道 2 次' },
      { kind: 'saucer', count: 1, label: '鑽進巧克力隧道', target: 0 },
      { kind: 'saucer', count: 1, label: '棉花糖機累積獎勵', target: 1 },
      { kind: 'spinner', count: 30, label: '旋轉閘轉 30 圈' },
      { kind: 'bank', count: 2, label: '落靶全倒 2 組' },
      { kind: 'bumper', count: 30, label: '軟糖彈射柱 30 次' },
      { kind: 'saucer', count: 2, label: '再鑽隧道 2 次', target: 0 },
    ],
    multiballAfter: 3,
  },
  {
    id: 5,
    name: '星際太空',
    subtitle: 'DEEP SPACE',
    blurb: '最難關：太空站平台、隨機蟲洞、黑洞鎖球；出球道最寬、沒有救球',
    theme: THEME5,
    difficulty: { stars: 5, gravity: 60, flipperLength: 3.0, outlane: 1.5, kickback: false, ballSave: 0, bumperKick: 38 },
    bumpers: [
      { pos: v(0.6, 27.6), r: 0.95 },
      { pos: v(-1.6, 25.0), r: 0.95 },
      { pos: v(1.4, 23.4), r: 0.9 },
      { pos: v(5.6, 29.2), r: 0.6, layer: 1 },
    ],
    posts: [],
    targetBanks: [
      { start: v(-1.2, 19.8), dir: v(1, 0), count: 3, spacing: 1.2 },
      { start: v(4.8, 32.3), dir: v(1, 0), count: 3, spacing: 1.2, layer: 1 },
    ],
    saucers: [
      {
        pos: v(0, 33.7),
        ejectAngle: -Math.PI / 2,
        exits: [
          { pos: v(-7.6, 26.6), angle: -Math.PI / 2 - 0.1 },
          { pos: v(6.8, 21.0), angle: Math.PI + 1.0 },
          { pos: v(0, 21.6), angle: -Math.PI / 2 },
        ],
        name: '蟲洞',
      },
      { pos: v(2.6, 27.0), ejectAngle: -Math.PI / 2 - 0.3, lock: true, name: '黑洞' },
    ],
    walls: [[v(-6.5, 19.5), v(-6.5, 27.0)], ORBIT_DEFLECT_L],
    ramps: [spaceDeck.entry, spaceDeck.exit],
    decks: [spaceDeck.deck],
    spinners: [{ pos: v(-7.7, 21.5), angle: Math.PI / 2, width: 2.0 }],
    missions: [
      { kind: 'deck', count: 1, label: '登上太空站' },
      { kind: 'bank', count: 1, label: '打倒太空站上的靶', target: 1 },
      { kind: 'saucer', count: 1, label: '穿越蟲洞', target: 0 },
      { kind: 'saucer', count: 2, label: '黑洞鎖 2 顆球', target: 1 },
      { kind: 'spinner', count: 30, label: '旋轉閘轉 30 圈' },
      { kind: 'deck', count: 2, label: '再上太空站 2 次' },
      { kind: 'bumper', count: 40, label: '行星彈射柱 40 次' },
    ],
    multiballAfter: 3,
  },
];
