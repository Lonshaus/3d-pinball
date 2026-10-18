import type { Vec2 } from '../physics/world';

export type FloorStyle = 'neon' | 'ocean' | 'lava';
export type AmbientFx = 'stars' | 'bubbles' | 'embers';

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
];
