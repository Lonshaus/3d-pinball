// 2D pinball physics on the playfield plane.
// x: across the table (left -> right), y: up the table (player -> back).
// Gravity pulls toward -y. Everything is a (possibly tapered) capsule,
// which keeps collision code tiny and robust.

export interface Vec2 {
  x: number;
  y: number;
}

export const BALL_RADIUS = 0.45;

export type ColliderKind = 'wall' | 'post' | 'bumper' | 'sling' | 'target' | 'flipper' | 'gate' | 'plunger';

export interface HitInfo {
  collider: Collider;
  /** Speed of the ball into the surface just before the response. */
  impact: number;
  normal: Vec2;
}

export interface Collider {
  kind: ColliderKind;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Radius at a / at b (tapered capsule). */
  ra: number;
  rb: number;
  restitution: number;
  enabled: boolean;
  /** Bumpers / slingshots: minimum outgoing normal speed after a hit. */
  kick?: number;
  /** One-way gates: only blocks balls on the side of this normal. */
  oneWayNormal?: Vec2;
  /** Surface velocity at the contact point (flippers). */
  surfaceVel?: (px: number, py: number) => Vec2;
  onHit?: (hit: HitInfo) => void;
  /** Free-form tag for game logic. */
  tag?: string;
  /** 0 = playfield, 1+ = ramps / upper decks. Balls only hit colliders on their own layer. */
  layer?: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  /** Ball is held (e.g. in a saucer) and ignores physics. */
  held: boolean;
  /** Which layer the ball rolls on (0 = playfield). */
  layer: number;
  /** Visual height above the playfield and its vertical speed (for drops). */
  z: number;
  zv: number;
  /** Hidden while travelling through a tunnel. */
  hidden: boolean;
}

export function newBall(x: number, y: number): Ball {
  return { x, y, vx: 0, vy: 0, active: true, held: false, layer: 0, z: 0, zv: 0, hidden: false };
}

export const MAX_SPEED = 95;
export const SUBSTEP = 1 / 600;

export function capsule(
  kind: ColliderKind,
  a: Vec2,
  b: Vec2,
  r: number,
  restitution = 0.45,
  extra: Partial<Collider> = {},
): Collider {
  return {
    kind,
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    ra: r,
    rb: r,
    restitution,
    enabled: true,
    ...extra,
  };
}

export function circle(kind: ColliderKind, c: Vec2, r: number, restitution = 0.45, extra: Partial<Collider> = {}) {
  return capsule(kind, c, c, r, restitution, extra);
}

export class Flipper {
  angle: number;
  angularVel = 0;
  pressed = false;
  readonly collider: Collider;

  constructor(
    public readonly pivot: Vec2,
    public readonly length: number,
    public readonly restAngle: number,
    public readonly upAngle: number,
    public readonly baseRadius = 0.5,
    public readonly tipRadius = 0.24,
    public readonly layer = 0,
    /** Upswing speed in rad/s. */
    public readonly power = 26,
  ) {
    this.angle = restAngle;
    this.collider = {
      kind: 'flipper',
      ax: pivot.x,
      ay: pivot.y,
      bx: pivot.x,
      by: pivot.y,
      ra: baseRadius,
      rb: tipRadius,
      restitution: 0.25,
      enabled: true,
      layer,
      surfaceVel: (px, py) => ({
        x: -(py - this.pivot.y) * this.angularVel,
        y: (px - this.pivot.x) * this.angularVel,
      }),
    };
    this.syncCollider();
  }

  get isLeft() {
    return this.upAngle > this.restAngle;
  }

  step(dt: number) {
    const target = this.pressed ? this.upAngle : this.restAngle;
    const speed = this.pressed ? this.power : 15;
    const diff = target - this.angle;
    const maxStep = speed * dt;
    const delta = Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
    this.angle += delta;
    this.angularVel = delta / dt;
    this.syncCollider();
  }

  private syncCollider() {
    this.collider.bx = this.pivot.x + Math.cos(this.angle) * this.length;
    this.collider.by = this.pivot.y + Math.sin(this.angle) * this.length;
  }
}

export class World {
  colliders: Collider[] = [];
  flippers: Flipper[] = [];
  balls: Ball[] = [];
  private accumulator = 0;
  /** Called once per substep, before collisions (for sensors etc.). */
  onSubstep?: (dt: number) => void;
  /** Extra acceleration applied to all balls (nudging). */
  nudge = { x: 0, y: 0 };
  /** Playfield gravity along -y (steeper table = bigger). */
  gravity = 52;

  add(c: Collider) {
    this.colliders.push(c);
    return c;
  }

  addFlipper(f: Flipper) {
    this.flippers.push(f);
    this.colliders.push(f.collider);
    return f;
  }

  update(dt: number) {
    this.accumulator += Math.min(dt, 1 / 20);
    while (this.accumulator >= SUBSTEP) {
      this.substep(SUBSTEP);
      this.accumulator -= SUBSTEP;
    }
  }

  private substep(dt: number) {
    for (const f of this.flippers) f.step(dt);
    this.onSubstep?.(dt);
    const damping = 1 - 0.12 * dt;
    for (const ball of this.balls) {
      if (!ball.active || ball.held) continue;
      ball.vx += this.nudge.x * dt;
      ball.vy += (this.nudge.y - this.gravity) * dt;
      ball.vx *= damping;
      ball.vy *= damping;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > MAX_SPEED) {
        ball.vx *= MAX_SPEED / sp;
        ball.vy *= MAX_SPEED / sp;
      }
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      // Two passes resolve corners where the ball touches several colliders.
      for (let pass = 0; pass < 2; pass++) {
        for (const c of this.colliders) {
          if (c.enabled) this.collide(ball, c, pass === 0);
        }
      }
    }
    this.collideBalls();
  }

  private collide(ball: Ball, c: Collider, fireEvents: boolean) {
    if ((c.layer ?? 0) !== ball.layer) return;
    const abx = c.bx - c.ax;
    const aby = c.by - c.ay;
    const len2 = abx * abx + aby * aby;
    let t = 0;
    if (len2 > 1e-9) {
      t = ((ball.x - c.ax) * abx + (ball.y - c.ay) * aby) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
    }
    const cx = c.ax + abx * t;
    const cy = c.ay + aby * t;
    let dx = ball.x - cx;
    let dy = ball.y - cy;
    const r = c.ra + (c.rb - c.ra) * t;
    const minDist = r + BALL_RADIUS;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist) return;

    if (c.oneWayNormal) {
      const side = (ball.x - c.ax) * c.oneWayNormal.x + (ball.y - c.ay) * c.oneWayNormal.y;
      if (side < 0) return;
    }

    let d = Math.sqrt(d2);
    if (d < 1e-6) {
      // Degenerate: push along segment normal.
      dx = -aby;
      dy = abx;
      d = Math.hypot(dx, dy) || 1;
    }
    const nx = dx / d;
    const ny = dy / d;
    // Positional correction.
    const pen = minDist - Math.sqrt(d2);
    ball.x += nx * pen;
    ball.y += ny * pen;

    let svx = 0;
    let svy = 0;
    if (c.surfaceVel) {
      const sv = c.surfaceVel(cx + nx * r, cy + ny * r);
      svx = sv.x;
      svy = sv.y;
    }
    const rvx = ball.vx - svx;
    const rvy = ball.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = c.restitution;
      // Small impacts don't bounce (lets balls settle on flippers and walls).
      const bounce = -vn < 2 ? 0 : e;
      ball.vx -= (1 + bounce) * vn * nx;
      ball.vy -= (1 + bounce) * vn * ny;
      // A little tangential friction on real impacts. Resting contact (a ball
      // rolling along a wall) gets none, otherwise it would be applied every
      // substep and act like a brake.
      if (-vn > 2) {
        const tvx = rvx - vn * nx;
        const tvy = rvy - vn * ny;
        const fr = c.kind === 'flipper' ? 0.03 : 0.01;
        ball.vx -= tvx * fr;
        ball.vy -= tvy * fr;
      }
    }
    if (c.kick !== undefined && -vn > 1.2) {
      // Real kickers are never perfectly consistent; the jitter also breaks
      // perfectly periodic sling-to-sling loops.
      const kick = c.kick * (0.85 + Math.random() * 0.3);
      const out = ball.vx * nx + ball.vy * ny;
      if (out < kick) {
        ball.vx += nx * (kick - out);
        ball.vy += ny * (kick - out);
      }
      const jitter = (Math.random() - 0.5) * kick * 0.25;
      ball.vx += -ny * jitter;
      ball.vy += nx * jitter;
    }
    if (fireEvents && vn < 0 && c.onHit) c.onHit({ collider: c, impact: -vn, normal: { x: nx, y: ny } });
  }

  private collideBalls() {
    const bs = this.balls;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      if (!a.active || a.held) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        if (!b.active || b.held || b.layer !== a.layer) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = BALL_RADIUS * 2;
        if (d >= min || d < 1e-6) continue;
        const nx = dx / d;
        const ny = dy / d;
        const pen = (min - d) / 2;
        a.x -= nx * pen;
        a.y -= ny * pen;
        b.x += nx * pen;
        b.y += ny * pen;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const j2 = -rv * 0.95;
          a.vx -= nx * j2;
          a.vy -= ny * j2;
          b.vx += nx * j2;
          b.vy += ny * j2;
        }
      }
    }
  }
}
