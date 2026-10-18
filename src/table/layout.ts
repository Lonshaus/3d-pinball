import type { DeckDef, LevelDef, RampDef, SaucerDef, SpinnerDef } from '../levels/levels';
import { capsule, circle, Flipper, World, type Ball, type Collider, type Vec2 } from '../physics/world';

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
/** Ramps lower than this can't be passed underneath, so they get walls on the playfield too. */
export const RAMP_CLEARANCE = 1.15;

export interface BumperEl {
  collider: Collider;
  pos: Vec2;
  r: number;
  layer: number;
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
  layer: number;
  resetTimer: number;
}

export interface SaucerEl {
  def: SaucerDef;
  holdTimer: number;
  cooldown: number;
  flash: number;
  ball?: Ball;
  /** Balls parked in a lock. */
  locked: Ball[];
  /** Time until the next bonus tick while holding. */
  bonusTick: number;
}

export interface LaneEl {
  x: number;
  lit: boolean;
  inside: boolean;
}

export interface RampEl {
  def: RampDef;
  /** Cumulative length at each point. */
  cum: number[];
  length: number;
  /** Rail centre lines on each side (for rendering). */
  rails: [Vec2[], Vec2[]];
  /** Starts on a deck rather than at a playfield entrance. */
  fromDeck: boolean;
  /** Ends on a deck rather than dropping the ball. */
  toDeck: boolean;
  flash: number;
}

export interface DeckEl {
  def: DeckDef;
  walls: Collider[];
  flipper: Flipper;
}

export interface SpinnerEl {
  def: SpinnerDef;
  angle: number;
  spin: number;
  /** Which side of the spinner each ball was on last substep. */
  side: Map<Ball, number>;
}

export interface KickbackEl {
  lit: boolean;
  /** Sensor box in the left outlane. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  fire: number;
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
  ramps: RampEl[];
  decks: DeckEl[];
  spinners: SpinnerEl[];
  kickback?: KickbackEl;
  plunger: Collider;
  gate: Collider;
}

const v = (x: number, y: number): Vec2 => ({ x, y });

function polyline(world: World, walls: Collider[], pts: Vec2[], r = WALL_R, e = 0.45, layer = 0) {
  for (let i = 0; i < pts.length - 1; i++) walls.push(world.add(capsule('wall', pts[i], pts[i + 1], r, e, { layer })));
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
export function guideLine(mirror: boolean, outlane = 0): [Vec2, Vec2] {
  const s = mirror ? -1 : 1;
  const end = v(-FLIPPER_PIVOT.x, FLIPPER_PIVOT.y);
  const from = v(FIELD_LEFT, 10);
  const len = Math.hypot(end.x - from.x, end.y - from.y);
  const dx = (end.x - from.x) / len;
  const dy = (end.y - from.y) / len;
  const lift = FLIPPER_BASE_R - WALL_R;
  const b = v(end.x - dy * lift, end.y + dx * lift);
  // Extend back to the side wall, or to the outlane divider.
  const startX = FIELD_LEFT + outlane;
  const t = (startX - b.x) / dx;
  const a = v(startX, b.y + dy * t);
  return [v(a.x * s, a.y), v(b.x * s, b.y)];
}

/** Height of the (left) guide line at x. */
function guideY(x: number) {
  const [a, b] = guideLine(false);
  return a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);
}

/**
 * Slingshot triangle for the left side; mirrored for the right. Its lower
 * edge runs parallel to the guide so the inlane underneath keeps its width.
 * With outlanes the sling gets narrower to make room for the divider.
 */
function slingTriangle(mirror: boolean, outlane: number): Vec2[] {
  const s = mirror ? -1 : 1;
  const [a, b] = guideLine(false);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const cos = (b.x - a.x) / len;
  const gap = 1.4;
  const lineY = (x: number) => guideY(x) + gap / cos;
  const sx = outlane > 0 ? FIELD_LEFT + outlane + 1.45 : -6.96;
  const ex = -4.76;
  return [v(sx, lineY(sx) + 2.35), v(sx, lineY(sx)), v(ex, lineY(ex))].map((p) => v(p.x * s, p.y));
}

function pointInPolygon(p: Vec2, poly: Vec2[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function insideDeck(deck: DeckDef, x: number, y: number) {
  return pointInPolygon(v(x, y), deck.polygon);
}

/** Offsets a polyline sideways (positive = left of travel direction). */
function offsetLine(points: Vec2[], d: number): Vec2[] {
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(points.length - 1, i + 1)];
    const n1 = normalOf(i > 0 ? a : p, i > 0 ? p : b);
    const n2 = normalOf(i < points.length - 1 ? p : a, i < points.length - 1 ? b : p);
    let nx = n1.x + n2.x;
    let ny = n1.y + n2.y;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    // Miter so the rails stay parallel through bends.
    const scale = 1 / Math.max(0.5, nx * n1.x + ny * n1.y);
    return v(p.x + nx * d * scale, p.y + ny * d * scale);
  });
}

function normalOf(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  return v(-dy / l, dx / l);
}

export interface RampSample {
  /** Distance along the ramp. */
  s: number;
  height: number;
  /** Rise per unit of travel. */
  slope: number;
  /** Unit direction of travel (towards the end). */
  tx: number;
  ty: number;
  /** Distance from the centre line. */
  lateral: number;
}

/** Projects a point onto a ramp's centre line. */
export function sampleRamp(r: RampEl, x: number, y: number): RampSample {
  const pts = r.def.points;
  let best: RampSample | null = null;
  let bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const tx = dx / len;
    const ty = dy / len;
    let t = (x - a.x) * tx + (y - a.y) * ty;
    // Only the first/last segment extends past the ends.
    const tc = Math.max(i === 0 ? -Infinity : 0, Math.min(i === pts.length - 2 ? Infinity : len, t));
    const cx = a.x + tx * tc;
    const cy = a.y + ty * tc;
    const d = Math.hypot(x - cx, y - cy);
    if (d < bestD) {
      bestD = d;
      t = tc;
      const h0 = r.def.heights[i];
      const h1 = r.def.heights[i + 1];
      const u = Math.max(0, Math.min(1, t / len));
      best = {
        s: r.cum[i] + t,
        height: h0 + (h1 - h0) * u,
        slope: (h1 - h0) / len,
        tx,
        ty,
        lateral: d,
      };
    }
  }
  return best!;
}

export function buildLayout(level: LevelDef): TableLayout {
  const world = new World();
  const diff = level.difficulty;
  world.gravity = diff.gravity;
  const walls: Collider[] = [];
  const posts: Collider[] = [];
  const outlane = diff.outlane;

  // Outer shell: left wall, top arc, right cabinet wall, plunger lane.
  polyline(world, walls, [v(FIELD_LEFT, 0), v(FIELD_LEFT, ARC_CENTER.y)]);
  polyline(world, walls, arcPoints(ARC_CENTER, ARC_RADIUS, Math.PI, 0, 40));
  polyline(world, walls, [v(LANE_RIGHT, ARC_CENTER.y), v(LANE_RIGHT, 0.3), v(FIELD_RIGHT, 0.3)]);
  polyline(world, walls, [v(FIELD_RIGHT, 0.3), v(FIELD_RIGHT, 32.2)]);

  // Inlane guides that feed the flippers, plus outlane dividers when the level has outlanes.
  for (const mirror of [false, true]) {
    const g = guideLine(mirror, outlane);
    polyline(world, walls, g);
    if (outlane > 0) {
      const top = v(g[0].x, g[0].y + 2.6);
      polyline(world, walls, [g[0], top]);
      posts.push(world.add(circle('post', top, 0.25, 0.6)));
    }
  }
  // Drain funnel under the flippers so a ball past them can only go down.
  polyline(world, walls, [v(-FLIPPER_PIVOT.x, FLIPPER_PIVOT.y), v(-FLIPPER_PIVOT.x, -1)]);
  polyline(world, walls, [v(FLIPPER_PIVOT.x, FLIPPER_PIVOT.y), v(FLIPPER_PIVOT.x, -1)]);

  let kickback: KickbackEl | undefined;
  if (outlane > 0 && diff.kickback) {
    const [ga] = guideLine(false, outlane);
    kickback = { lit: true, x0: FIELD_LEFT, x1: ga.x, y0: 2.2, y1: ga.y - 0.4, fire: 0 };
  }

  // Top rollover lane posts.
  for (const x of LANE_POSTS) posts.push(world.add(capsule('post', v(x, LANE_Y0), v(x, LANE_Y1), 0.22, 0.5)));

  // Level specific walls & posts.
  for (const pl of level.walls) polyline(world, walls, pl);
  for (const p of level.posts) posts.push(world.add(circle('post', p.pos, p.r, 0.6)));

  const fl = diff.flipperLength;
  const left = world.addFlipper(new Flipper(v(-FLIPPER_PIVOT.x, FLIPPER_PIVOT.y), fl, -0.52, 0.5, FLIPPER_BASE_R));
  const right = world.addFlipper(new Flipper(v(FLIPPER_PIVOT.x, FLIPPER_PIVOT.y), fl, Math.PI + 0.52, Math.PI - 0.5, FLIPPER_BASE_R));

  const slings: SlingEl[] = [false, true].map((mirror) => {
    const tri = slingTriangle(mirror, outlane);
    const kicker = world.add(capsule('sling', tri[0], tri[2], WALL_R, 0.5, { kick: 24 }));
    walls.push(world.add(capsule('wall', tri[0], tri[1], WALL_R)));
    walls.push(world.add(capsule('wall', tri[1], tri[2], WALL_R)));
    return { kicker, tri, flash: 0 };
  });

  const bumpers: BumperEl[] = level.bumpers.map((b) => ({
    collider: world.add(circle('bumper', b.pos, b.r, 0.6, { kick: diff.bumperKick, layer: b.layer ?? 0 })),
    pos: b.pos,
    r: b.r,
    layer: b.layer ?? 0,
    flash: 0,
  }));

  const banks: BankEl[] = level.targetBanks.map((bank) => {
    const layer = bank.layer ?? 0;
    const targets: TargetEl[] = [];
    for (let i = 0; i < bank.count; i++) {
      const c = v(bank.start.x + bank.dir.x * bank.spacing * i, bank.start.y + bank.dir.y * bank.spacing * i);
      const h = 0.5;
      const collider = world.add(
        capsule('target', v(c.x - bank.dir.x * h, c.y - bank.dir.y * h), v(c.x + bank.dir.x * h, c.y + bank.dir.y * h), 0.18, 0.35, { layer }),
      );
      targets.push({ collider, center: c, dir: bank.dir, dropped: false, drop: 0 });
    }
    return { targets, layer, resetTimer: 0 };
  });

  const saucers: SaucerEl[] = level.saucers.map((def) => ({ def, holdTimer: 0, cooldown: 0, flash: 0, locked: [], bonusTick: 0 }));

  const lanes: LaneEl[] = [];
  for (let i = 0; i < LANE_POSTS.length - 1; i++) {
    lanes.push({ x: (LANE_POSTS[i] + LANE_POSTS[i + 1]) / 2, lit: false, inside: false });
  }

  // Raised decks: walls and a mini flipper on the deck's layer.
  const decks: DeckEl[] = level.decks.map((def) => {
    const deckWalls: Collider[] = [];
    for (const pl of def.walls) polyline(world, deckWalls, pl, WALL_R, 0.45, def.layer);
    const f = def.flipper;
    const flipper = world.addFlipper(new Flipper(f.pivot, f.length, f.rest, f.up, 0.4, 0.2, def.layer, 22));
    return { def, walls: deckWalls, flipper };
  });

  // Ramps: rails on the ramp's layer; the low entrance section also blocks playfield balls.
  const ramps: RampEl[] = level.ramps.map((def) => {
    const cum = [0];
    for (let i = 1; i < def.points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(def.points[i].x - def.points[i - 1].x, def.points[i].y - def.points[i - 1].y));
    }
    const off = def.width / 2 + WALL_R;
    const rails: [Vec2[], Vec2[]] = [offsetLine(def.points, off), offsetLine(def.points, -off)];
    const fromDeck = level.decks.some((d) => d.layer === def.layer && insideDeck(d, def.points[0].x, def.points[0].y));
    const last = def.points[def.points.length - 1];
    const toDeck = level.decks.some((d) => d.layer === def.layer && insideDeck(d, last.x, last.y));
    const firstWall = walls.length;
    for (const rail of rails) {
      polyline(world, walls, rail, WALL_R, 0.3, def.layer);
      if (!fromDeck) {
        // Walls on the playfield along the part that is too low to roll under.
        const low: Vec2[] = [rail[0]];
        for (let i = 1; i < rail.length && def.heights[i - 1] < RAMP_CLEARANCE; i++) low.push(rail[i]);
        if (low.length > 1) polyline(world, walls, low);
      }
    }
    if (!fromDeck) {
      // Back wall under the point where the ramp gets high enough to pass beneath.
      // It is a chevron pointing up the ramp so a ball rolling down from above slides off it.
      const k = def.heights.findIndex((h) => h >= RAMP_CLEARANCE);
      if (k > 0) {
        const p = def.points[k];
        const q = def.points[k - 1];
        const l = Math.hypot(p.x - q.x, p.y - q.y);
        const apex = v(p.x + ((p.x - q.x) / l) * 0.9, p.y + ((p.y - q.y) / l) * 0.9);
        walls.push(world.add(capsule('wall', rails[0][k], apex, WALL_R)));
        walls.push(world.add(capsule('wall', apex, rails[1][k], WALL_R)));
      }
    }
    // The ramp model draws its own rails and skirts.
    for (let i = firstWall; i < walls.length; i++) walls[i].tag = 'ramp';
    return { def, cum, length: cum[cum.length - 1], rails, fromDeck, toDeck, flash: 0 };
  });

  const spinners: SpinnerEl[] = level.spinners.map((def) => ({ def, angle: 0, spin: 0, side: new Map() }));

  const plunger = world.add(capsule('plunger', v(FIELD_RIGHT, PLUNGER_REST_Y), v(LANE_RIGHT, PLUNGER_REST_Y), WALL_R, 0.1));
  // One-way gate at the top of the shooter lane: balls leave the lane but can't fall back in.
  // It slopes down toward the playfield so a ball resting on it rolls back into play.
  const ga = v(FIELD_RIGHT, 32.2);
  const gb = v(10.3, 33.6);
  const gn = { x: -(gb.y - ga.y), y: gb.x - ga.x };
  const gl = Math.hypot(gn.x, gn.y);
  const gate = world.add(capsule('gate', ga, gb, 0.1, 0.3, { oneWayNormal: { x: gn.x / gl, y: gn.y / gl } }));

  return { world, walls, posts, left, right, bumpers, slings, banks, saucers, lanes, ramps, decks, spinners, kickback, plunger, gate };
}
