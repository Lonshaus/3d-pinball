export interface InputHandlers {
  flipper(left: boolean, down: boolean): void;
  plunger(down: boolean): void;
  nudge(dir: number): void;
  pause(): void;
  /** Any first interaction (used to unlock audio). */
  interact(): void;
}

const LEFT_KEYS = new Set(['KeyZ', 'ShiftLeft', 'ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['Slash', 'ShiftRight', 'ArrowRight', 'KeyM', 'KeyL']);
const PLUNGER_KEYS = new Set(['Space', 'Enter', 'ArrowDown', 'KeyS']);

type Zone = 'L' | 'R' | 'P';

export class Input {
  enabled = false;
  private held = { L: 0, R: 0, P: 0 };
  private pointers = new Map<number, Zone>();
  private keys = new Set<string>();
  private lastShake = 0;

  constructor(
    private readonly h: InputHandlers,
    touchLayer: HTMLElement,
    launchButton: HTMLElement,
    nudgeButton: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());

    const down = (zone: Zone | null) => (e: PointerEvent) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.h.interact();
      const z = zone ?? (e.clientX < window.innerWidth / 2 ? 'L' : 'R');
      this.pointers.set(e.pointerId, z);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      this.press(z, true);
    };
    const up = (e: PointerEvent) => {
      const z = this.pointers.get(e.pointerId);
      if (!z) return;
      this.pointers.delete(e.pointerId);
      this.press(z, false);
    };
    touchLayer.addEventListener('pointerdown', down(null));
    launchButton.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      down('P')(e);
    });
    nudgeButton.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!this.enabled) return;
      this.h.interact();
      this.h.nudge(0);
    });
    window.addEventListener('devicemotion', (e) => this.onMotion(e));
    for (const el of [touchLayer, launchButton]) {
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  private onKey(e: KeyboardEvent, isDown: boolean) {
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (isDown && !e.repeat) this.h.pause();
      return;
    }
    if (!this.enabled) return;
    let zone: Zone | null = null;
    if (LEFT_KEYS.has(e.code)) zone = 'L';
    else if (RIGHT_KEYS.has(e.code)) zone = 'R';
    else if (PLUNGER_KEYS.has(e.code)) zone = 'P';
    if (zone) {
      e.preventDefault();
      if (isDown === this.keys.has(e.code)) return; // ignore auto-repeat
      if (isDown) this.keys.add(e.code);
      else this.keys.delete(e.code);
      this.h.interact();
      this.press(zone, isDown);
      return;
    }
    if (isDown && !e.repeat) {
      if (e.code === 'KeyX' || e.code === 'KeyB') this.h.nudge(-1);
      else if (e.code === 'KeyN' || e.code === 'Period') this.h.nudge(1);
      else if (e.code === 'KeyC') this.h.nudge(0);
    }
  }

  /** Shaking the phone nudges the table toward the side it was jerked. */
  private onMotion(e: DeviceMotionEvent) {
    if (!this.enabled) return;
    const a = e.acceleration;
    if (!a || a.x === null || a.y === null) return;
    const mag = Math.hypot(a.x, a.y, a.z ?? 0);
    const now = performance.now();
    if (mag < 15 || now - this.lastShake < 600) return;
    this.lastShake = now;
    this.h.nudge(Math.abs(a.x) > 6 ? Math.sign(a.x) : 0);
  }

  /** iOS only delivers motion events after the page asks, from a tap. */
  static requestMotionPermission() {
    const DME = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    if (DME?.requestPermission) DME.requestPermission().catch(() => undefined);
  }

  private press(z: Zone, isDown: boolean) {
    const before = this.held[z] > 0;
    this.held[z] = Math.max(0, this.held[z] + (isDown ? 1 : -1));
    const after = this.held[z] > 0;
    if (before === after) return;
    if (z === 'P') this.h.plunger(after);
    else this.h.flipper(z === 'L', after);
  }

  releaseAll() {
    for (const z of ['L', 'R', 'P'] as Zone[]) {
      if (this.held[z] > 0) {
        this.held[z] = 0;
        if (z === 'P') this.h.plunger(false);
        else this.h.flipper(z === 'L', false);
      }
    }
    this.pointers.clear();
    this.keys.clear();
  }
}
