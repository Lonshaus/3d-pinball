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

export interface TargetBank {
  /** Start point of the bank line and direction it runs along. */
  start: Vec2;
  dir: Vec2;
  count: number;
  spacing: number;
}

export interface SaucerDef {
  pos: Vec2;
  /** Direction (radians) the ball is ejected in. */
  ejectAngle: number;
}

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  goal: number;
  theme: Theme;
  bumpers: { pos: Vec2; r: number }[];
  posts: { pos: Vec2; r: number }[];
  targetBanks: TargetBank[];
  saucers: SaucerDef[];
  /** Extra static walls as polylines. */
  walls: Vec2[][];
}

const v = (x: number, y: number): Vec2 => ({ x, y });

export const LEVELS: LevelDef[] = [
  {
    id: 0,
    name: '霓虹都市',
    subtitle: 'NEON CITY',
    goal: 20000,
    theme: {
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
    },
    bumpers: [
      { pos: v(-2.7, 29.5), r: 1.05 },
      { pos: v(2.7, 29.5), r: 1.05 },
      { pos: v(0, 25.8), r: 1.05 },
    ],
    posts: [{ pos: v(-5.6, 20.5), r: 0.3 }],
    targetBanks: [{ start: v(-8.35, 15.2), dir: v(0, 1), count: 3, spacing: 1.45 }],
    saucers: [],
    walls: [
      // Right side guide that feeds an orbit back to the flippers.
      [v(7.4, 21.5), v(6.4, 25.5), v(6.4, 29.5)],
    ],
  },
  {
    id: 1,
    name: '深海秘境',
    subtitle: 'DEEP SEA',
    goal: 30000,
    theme: {
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
    },
    bumpers: [
      { pos: v(-3.6, 28.6), r: 0.95 },
      { pos: v(3.6, 28.6), r: 0.95 },
      { pos: v(-1.6, 24.4), r: 0.95 },
      { pos: v(1.9, 24.0), r: 0.95 },
    ],
    posts: [
      { pos: v(0, 18.8), r: 0.35 },
      { pos: v(-6.4, 25.5), r: 0.3 },
    ],
    targetBanks: [
      { start: v(-8.35, 14.6), dir: v(0, 1), count: 3, spacing: 1.45 },
      { start: v(8.35, 18.6), dir: v(0, -1), count: 3, spacing: 1.45 },
    ],
    saucers: [{ pos: v(0, 32.2), ejectAngle: -Math.PI / 2 - 0.35 }],
    walls: [],
  },
  {
    id: 2,
    name: '熔岩火山',
    subtitle: 'VOLCANO',
    goal: 45000,
    theme: {
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
    },
    bumpers: [
      { pos: v(-3.4, 30.2), r: 1.0 },
      { pos: v(3.0, 30.6), r: 1.0 },
      { pos: v(-0.2, 27.0), r: 1.0 },
      { pos: v(4.6, 22.6), r: 0.85 },
    ],
    posts: [
      { pos: v(-4.2, 21.5), r: 0.3 },
      { pos: v(-2.6, 19.8), r: 0.3 },
    ],
    targetBanks: [
      { start: v(-8.35, 14.6), dir: v(0, 1), count: 4, spacing: 1.35 },
      { start: v(-1.9, 17.4), dir: v(1, 0), count: 3, spacing: 1.4 },
    ],
    saucers: [
      { pos: v(-6.4, 31.0), ejectAngle: -0.75 },
      { pos: v(7.2, 26.0), ejectAngle: Math.PI + 0.85 },
    ],
    walls: [[v(-7.4, 26.0), v(-5.4, 24.3)]],
  },
  {
    id: 3,
    name: '台灣夜市',
    subtitle: 'NIGHT MARKET',
    goal: 35000,
    theme: {
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
    },
    // Lantern cluster up top, a row of "balloon" targets and a claw-machine saucer.
    bumpers: [
      { pos: v(-2.4, 29.2), r: 1.0 },
      { pos: v(2.4, 29.2), r: 1.0 },
      { pos: v(0, 32.4), r: 0.9 },
    ],
    posts: [
      { pos: v(-6.0, 22.0), r: 0.3 },
      { pos: v(5.2, 21.0), r: 0.3 },
    ],
    targetBanks: [{ start: v(-1.4, 20.6), dir: v(1, 0), count: 3, spacing: 1.4 }],
    saucers: [{ pos: v(6.9, 25.6), ejectAngle: Math.PI + 0.9 }],
    walls: [],
  },
  {
    id: 4,
    name: '糖果樂園',
    subtitle: 'CANDY LAND',
    goal: 40000,
    theme: {
      background: 0xffd6ec,
      fog: 0xffe4f2,
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
      exposure: 0.78,
      lightScale: 0.55,
      pitch: 1.25,
      bloom: 0.25,
    },
    // Five gumdrop bumpers and targets on both sides.
    bumpers: [
      { pos: v(-3.0, 30.4), r: 0.85 },
      { pos: v(3.0, 30.4), r: 0.85 },
      { pos: v(0, 28.0), r: 0.85 },
      { pos: v(-4.4, 25.6), r: 0.8 },
      { pos: v(4.4, 25.6), r: 0.8 },
    ],
    posts: [{ pos: v(0, 21.5), r: 0.4 }],
    targetBanks: [
      { start: v(-8.35, 14.6), dir: v(0, 1), count: 3, spacing: 1.45 },
      { start: v(8.35, 18.6), dir: v(0, -1), count: 3, spacing: 1.45 },
    ],
    saucers: [],
    walls: [],
  },
  {
    id: 5,
    name: '星際太空',
    subtitle: 'DEEP SPACE',
    goal: 50000,
    theme: {
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
    },
    // Planets of different sizes, two black-hole saucers and an orbit lane.
    bumpers: [
      { pos: v(-2.4, 30.2), r: 1.15 },
      { pos: v(3.0, 28.4), r: 0.9 },
      { pos: v(-0.6, 25.2), r: 0.8 },
    ],
    posts: [{ pos: v(5.8, 21.0), r: 0.3 }],
    targetBanks: [{ start: v(-2.0, 19.2), dir: v(1, 0), count: 4, spacing: 1.35 }],
    saucers: [
      { pos: v(0.9, 33.0), ejectAngle: -Math.PI / 2 + 0.25 },
      { pos: v(-6.7, 26.5), ejectAngle: -0.6 },
    ],
    walls: [[v(7.4, 21.5), v(6.4, 25.5), v(6.4, 29.5)]],
  },
];
