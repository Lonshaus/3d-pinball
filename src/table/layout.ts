import type { LevelDef, SaucerDef } from '../levels/levels';
import { capsule, circle, Flipper, World, type Collider, type Vec2 } from '../physics/world';

// Shared cabinet geometry (table units, 1 unit ≈ 2.6 cm).
export const FIELD_LEFT = -9;
export const FIELD_RIGHT = 9;
export const LANE_RIGHT = 10.6;
export const ARC_CENTER: Vec2 = { x: (FIELD_LEFT + LANE_RIGHT) / 2, y: 32 };
export const ARC_RADIUS = (LANE_RIGHT - FIELD_LEFT) / 2;
export const TABLE_TOP = ARC_CENTER.y + ARC_RADIUS;
export const WALL_R = 0.15;
export const PLUNGER_REST_Y = 2;
export const PLUNGER_TRAVEL = 1.4;
export const BALL_START: Vec2 = { x: (FIELD_RIGHT + LANE_RIGHT) / 2, y: PLUNGER_REST_Y + WALL_R + 0.46 };
export const DRAIN_Y = 1.4;
export const LANE_Y0 = 35.6;
export const LANE_Y1 = 37.4;
export const LANE_POSTS = [-3, -1, 1, 3];

export interface BumperEl {
  collider: Collider;
  pos: Vec2;
  r: number;
  flash: number;
}

export interface SlingEl {
  kicker: Collider;
  tri: Vec2[];
  flash: number;
}

export interface TargetEl {
  collider: Collider;
  center: Vec2;
  dir: Vec2;
  dropped: boolean;
  /** 0 = up, 1 = fully dropped (animated). */
  drop: number;
}

export interface BankEl {
  targets: TargetEl[];
  resetTimer: number;
}

export interface SaucerEl {
  def: SaucerDef;
  holdTimer: number;
  cooldown: number;
  flash: number;
}

export interface LaneEl {
  x: number;
  lit: boolean;
  inside: boolean;
}

export interface TableLayout {
  world: World;
  /** Static wall capsules, used for rendering. */
  walls: Collider[];
  posts: Collider[];
  left: Flipper;
  right: Flipper;
  bumpers: BumperEl[];
  slings: SlingEl[];
  banks: BankEl[];
  saucers: SaucerEl[];
  lanes: LaneEl[];
  plunger: Collider;
  gate: Collider;
}

const v = (x: number, y: number): Vec2 => ({ x, y });

function polyline(world: World, walls: Collider[], pts: Vec2[], r = WALL_R, e = 0.45) {
  for (let i = 0; i < pts.length - 1; i++) walls.push(world.add(capsule('wall', pts[i], pts[i + 1], r, e)));
}

function arcPoints(c: Vec2, r: number, a0: number, a1: number, n: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(v(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r));
  }
  return pts;
}

export const FLIPPER_PIVOT: Vec2 = { x: 3.9, y: 5.2 };
export const FLIPPER_BASE_R = 0.5;

/**
 * Inlane guide wall for the left side (mirrored for the right). It is raised
 * off the flipper pivot so its surface is tangent to the flipper's base
 * circle; otherwise the base pokes out above the guide and a rolling ball
 * bumps into it at the joint.
 */
export function guideLine(mirror: boolean): [Vec2, Vec2] {
  const s = mirror ? -1 : 1;
  const end = v(-FLIPPER_PIVOT.x, FLIPPER_PIVOT.y);
  const from = v(FIELD_LEFT, 10);
  const len = Math.hypot(end.x - from.x, end.y - from.y);
  const dx = (end.x - from.x) / len;
  const dy = (end.y - from.y) / len;
  const lift = FLIPPER_BASE_R - WALL_R;
  const b = v(end.x - dy * lift, end.y + dx * lift);
  // Extend back to the side wall.
  const t = (FIELD_LEFT - b.x) / dx;
  const a = v(FIELD_LEFT, b.y + dy * t);
  return [v(a.x * s, a.y), v(b.x * s, b.y)];
}

/** Slingshot triangle for the left side; mirrored for the right. */
function slingTriangle(mirror: boolean): Vec2[] {
  const s = mirror ? -1 : 1;
  // Moved along with the guide so the inlane keeps its width.
  const [, gb] = guideLine(false);
  const ox = gb.x + FLIPPER_PIVOT.x;
  const oy = gb.y - FLIPPER_PIVOT.y;
  return [v(-7.2 + ox, 12.6 + oy), v(-7.2 + ox, 10.25 + oy), v(-5.0 + ox, 8.15 + oy)].map((p) => v(p.x * s, p.y));
}

export function buildLayout(level: LevelDef): TableLayout {
  const world = new World();
  const walls: Collider[] = [];
  const posts: Collider[] = [];

  // Outer shell: left wall, top arc, right cabinet wall, plunger lane.
  polyline(world, walls, [v(FIELD_LEFT, 10), v(FIELD_LEFT, ARC_CENTER.y)]);
  polyline(world, walls, arcPoints(ARC_CENTER, ARC_RADIUS, Math.PI, 0, 40));
  polyline(world, walls, [v(LANE_RIGHT, ARC_CENTER.y), v(LANE_RIGHT, 0.3), v(FIELD_RIGHT, 0.3)]);
  polyline(world, walls, [v(FIELD_RIGHT, 0.3), v(FIELD_RIGHT, 32.2)]);

  // Inlane guides that feed the flippers.
  polyline(world, walls, guideLine(false));
  polyline(world, walls, guideLine(true));
  // Drain funnel under the flippers so a ball past them can only go down.
  polyline(world, walls, [v(-FLIPPER_PIVOT.x, FLIPPER_PIVOT.y), v(-FLIPPER_PIVOT.x, -1)]);
  polyline(world, walls, [v(FLIPPER_PIVOT.x, FLIPPER_PIVOT.y), v(FLIPPER_PIVOT.x, -1)]);

  // Top rollover lane posts.
  for (const x of LANE_POSTS) posts.push(world.add(capsule('post', v(x, LANE_Y0), v(x, LANE_Y1), 0.22, 0.5)));

  // Level specific walls & posts.
  for (const pl of level.walls) polyline(world, walls, pl);
  for (const p of level.posts) posts.push(world.add(circle('post', p.pos, p.r, 0.6)));

  const left = world.addFlipper(new Flipper(v(-FLIPPER_PIVOT.x, FLIPPER_PIVOT.y), 3.3, -0.52, 0.5, FLIPPER_BASE_R));
  const right = world.addFlipper(new Flipper(v(FLIPPER_PIVOT.x, FLIPPER_PIVOT.y), 3.3, Math.PI + 0.52, Math.PI - 0.5, FLIPPER_BASE_R));

  const slings: SlingEl[] = [false, true].map((mirror) => {
    const tri = slingTriangle(mirror);
    const kicker = world.add(capsule('sling', tri[0], tri[2], WALL_R, 0.5, { kick: 24 }));
    walls.push(world.add(capsule('wall', tri[0], tri[1], WALL_R)));
    walls.push(world.add(capsule('wall', tri[1], tri[2], WALL_R)));
    return { kicker, tri, flash: 0 };
  });

  const bumpers: BumperEl[] = level.bumpers.map((b) => ({
    collider: world.add(circle('bumper', b.pos, b.r, 0.6, { kick: 34 })),
    pos: b.pos,
    r: b.r,
    flash: 0,
  }));

  const banks: BankEl[] = level.targetBanks.map((bank) => {
    const targets: TargetEl[] = [];
    for (let i = 0; i < bank.count; i++) {
      const c = v(bank.start.x + bank.dir.x * bank.spacing * i, bank.start.y + bank.dir.y * bank.spacing * i);
      const h = 0.5;
      const collider = world.add(
        capsule('target', v(c.x - bank.dir.x * h, c.y - bank.dir.y * h), v(c.x + bank.dir.x * h, c.y + bank.dir.y * h), 0.18, 0.35),
      );
      targets.push({ collider, center: c, dir: bank.dir, dropped: false, drop: 0 });
    }
    return { targets, resetTimer: 0 };
  });

  const saucers: SaucerEl[] = level.saucers.map((def) => ({ def, holdTimer: 0, cooldown: 0, flash: 0 }));

  const lanes: LaneEl[] = [];
  for (let i = 0; i < LANE_POSTS.length - 1; i++) {
    lanes.push({ x: (LANE_POSTS[i] + LANE_POSTS[i + 1]) / 2, lit: false, inside: false });
  }

  const plunger = world.add(capsule('plunger', v(FIELD_RIGHT, PLUNGER_REST_Y), v(LANE_RIGHT, PLUNGER_REST_Y), WALL_R, 0.1));
  // One-way gate at the top of the shooter lane: balls leave the lane but can't fall back in.
  // It slopes down toward the playfield so a ball resting on it rolls back into play.
  const ga = v(FIELD_RIGHT, 32.2);
  const gb = v(10.3, 33.6);
  const gn = { x: -(gb.y - ga.y), y: gb.x - ga.x };
  const gl = Math.hypot(gn.x, gn.y);
  const gate = world.add(capsule('gate', ga, gb, 0.1, 0.3, { oneWayNormal: { x: gn.x / gl, y: gn.y / gl } }));

  return { world, walls, posts, left, right, bumpers, slings, banks, saucers, lanes, plunger, gate };
}
