import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Theme } from '../levels/levels';
import { makeGlowTexture } from './textures';
import { FLOOR_BOUNDS } from './textures';
import type { TableView } from './tableView';

const isTouch = typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

/** A pool of additive particles used for hit bursts. */
class Sparks {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private base: Float32Array;
  private next = 0;

  constructor(
    private readonly count: number,
    tex: THREE.Texture,
  ) {
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        size: 0.5,
        map: tex,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  burst(at: THREE.Vector3, color: THREE.Color, n: number, speed = 8) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const s = speed * (0.4 + Math.random() * 0.8);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([Math.cos(a) * s, up * s * 0.9 + 2, Math.sin(a) * s], i * 3);
      this.base.set([color.r, color.g, color.b], i * 3);
      this.life[i] = 0.5 + Math.random() * 0.5;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.life[i] -= dt;
      const f = Math.max(0, this.life[i]);
      this.vel[i * 3 + 1] -= 18 * dt;
      for (let c = 0; c < 3; c++) {
        this.pos[i * 3 + c] += this.vel[i * 3 + c] * dt;
        this.col[i * 3 + c] = this.base[i * 3 + c] * f * 1.6;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

/** Slow, theme specific background particles (stars, bubbles, embers, lanterns, sprinkles). */
class Ambient {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private speed: Float32Array;
  private phase: Float32Array;
  /** +1 rises, -1 falls, 0 static. */
  private readonly dir: number;

  constructor(
    private readonly kind: Theme['ambientFx'],
    colors: number[],
    tex: THREE.Texture,
  ) {
    const n = { stars: 700, bubbles: 260, embers: 260, lanterns: 70, sprinkles: 320 }[kind];
    this.dir = kind === 'stars' ? 0 : kind === 'sprinkles' ? -1 : 1;
    this.pos = new Float32Array(n * 3);
    this.speed = new Float32Array(n);
    this.phase = new Float32Array(n);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.respawn(i, true);
      c.set(colors[Math.floor(Math.random() * colors.length)]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        vertexColors: true,
        size: { stars: 1.1, bubbles: 0.45, embers: 0.3, lanterns: 1.1, sprinkles: 0.4 }[kind],
        fog: kind !== 'stars',
        map: tex,
        transparent: true,
        opacity: kind === 'bubbles' ? 0.55 : 0.9,
        depthWrite: false,
        // Additive glow disappears on bright backgrounds, so sprinkles blend normally.
        blending: kind === 'sprinkles' ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    );
    this.points.frustumCulled = false;
  }

  private respawn(i: number, initial: boolean) {
    const p = this.pos;
    if (this.dir === 0) {
      // Far shell around the table.
      const a = Math.random() * Math.PI * 2;
      const r = 150 + Math.random() * 80;
      p[i * 3] = Math.cos(a) * r;
      p[i * 3 + 1] = -60 + Math.random() * 200;
      p[i * 3 + 2] = Math.sin(a) * r - 20;
    } else {
      p[i * 3] = (Math.random() - 0.5) * 50;
      p[i * 3 + 1] = initial ? Math.random() * 32 - 8 : this.dir > 0 ? -8 : 24;
      p[i * 3 + 2] = (Math.random() - 0.5) * 60 - 5;
    }
    this.speed[i] = (0.6 + Math.random() * 1.6) * { stars: 0, bubbles: 1, embers: 1.6, lanterns: 0.5, sprinkles: 2.2 }[this.kind];
    this.phase[i] = Math.random() * 10;
  }

  update(dt: number, time: number) {
    if (this.dir === 0) {
      this.points.rotation.y = time * 0.005;
      return;
    }
    const n = this.speed.length;
    for (let i = 0; i < n; i++) {
      this.pos[i * 3 + 1] += this.speed[i] * dt * this.dir;
      this.pos[i * 3] += Math.sin(time * 1.3 + this.phase[i]) * dt * 0.6;
      const y = this.pos[i * 3 + 1];
      if (y > 24 || y < -8) this.respawn(i, false);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.7);
  private key = new THREE.DirectionalLight(0xffffff, 1.8);
  private fillA = new THREE.PointLight(0xffffff, 60, 40, 1.6);
  private fillB = new THREE.PointLight(0xffffff, 60, 40, 1.6);
  private glowTex = makeGlowTexture();
  private sparks = new Sparks(400, this.glowTex);
  private ambient?: Ambient;
  private view?: TableView;
  private shake = 0;
  private camBase = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  /** 2 = full, 1 = no bloom + lower resolution, 0 = also no shadows. */
  private quality = 2;
  private perfTime = 0;
  private perfFrames = 0;
  private perfGrace = 2;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.75 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.key.position.set(-8, 40, 26);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
    const sc = this.key.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 28;
    sc.bottom = -28;
    sc.near = 5;
    sc.far = 120;
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.02;
    this.fillA.position.set(-10, 8, -16);
    this.fillB.position.set(12, 8, 6);
    this.scene.add(this.hemi, this.key, this.key.target, this.fillA, this.fillB, this.sparks.points);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  get maxAnisotropy() {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  setTable(view: TableView, theme: Theme) {
    this.view?.dispose();
    this.view = view;
    this.scene.add(view.root);
    // The ball gets the full-strength environment so it reads as polished chrome.
    const ballMat = view.ball.material as THREE.MeshStandardMaterial;
    ballMat.envMap = this.scene.environment;
    ballMat.envMapIntensity = 1.6;
    this.scene.background = new THREE.Color(theme.background);
    this.scene.fog = new THREE.Fog(theme.fog, 70, 160);
    this.hemi.color.set(theme.keyLight);
    this.hemi.groundColor.set(theme.ambient);
    this.key.color.set(theme.keyLight);
    this.fillA.color.set(theme.fillLight);
    this.fillB.color.set(theme.accent2);
    this.bloom.strength = theme.bloom;
    this.bloom.threshold = theme.bloomThreshold ?? 0.85;
    this.renderer.toneMappingExposure = theme.exposure ?? 1.05;
    const ls = theme.lightScale ?? 1;
    this.hemi.intensity = 0.7 * ls;
    this.key.intensity = 1.8 * ls;
    this.fillA.intensity = this.fillB.intensity = 60 * ls;
    if (this.ambient) {
      this.scene.remove(this.ambient.points);
      this.ambient.dispose();
    }
    this.ambient = new Ambient(theme.ambientFx, theme.ambientColors, this.glowTex);
    this.scene.add(this.ambient.points);
    this.fitCamera();
  }

  burst(x: number, y: number, color: number, n = 16, speed = 8) {
    if (!this.view) return;
    this.sparks.burst(this.view.toWorld(x, y, 0.8), new THREE.Color(color), n, speed);
  }

  addShake(amount: number) {
    this.shake = Math.min(1, this.shake + amount);
  }

  /** Projects a table point to CSS pixels (for floating score text). */
  project(x: number, y: number, h = 1): { x: number; y: number } {
    if (!this.view) return { x: 0, y: 0 };
    const v = this.view.toWorld(x, y, h).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
  }

  /**
   * Places the camera so the whole table fits. Wide screens get a lower,
   * more dramatic angle; tall phone screens look down more steeply.
   */
  fitCamera() {
    if (!this.view) return;
    const aspect = this.camera.aspect;
    const tall = THREE.MathUtils.clamp((1.3 - aspect) / 0.75, 0, 1);
    const elev = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(44, 66, tall));
    const { x0, x1, y0, y1 } = FLOOR_BOUNDS;
    const pts: THREE.Vector3[] = [];
    for (const x of [x0 - 1, x1 + 1]) for (const y of [y0 - 0.6, y1 + 0.6]) for (const h of [0, 1.7]) pts.push(this.view.toWorld(x, y, h));
    const center = this.view.toWorld((x0 + x1) / 2, (y0 + y1) / 2 - 1.5, 0);
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
    // HUD lives at the top of the screen; leave space for it.
    const topMargin = aspect < 1 ? 0.8 : 0.86;
    // On touch screens in portrait, keep the bottom clear for the launch button.
    const h = this.container.clientHeight || 1;
    const bottomMargin = isTouch && aspect < 1 ? -1 + (2 * 100) / h : -0.97;
    const fits = (d: number) => {
      this.camera.position.copy(center).addScaledVector(dir, d);
      this.camera.lookAt(center);
      this.camera.updateMatrixWorld();
      return pts.every((p) => {
        const v = p.clone().project(this.camera);
        return v.z < 1 && Math.abs(v.x) < 0.97 && v.y > bottomMargin && v.y < topMargin;
      });
    };
    // Shift the look-at point so the table sits between HUD and bottom edge.
    let lo = 10;
    let hi = 200;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
    this.camBase.copy(this.camera.position);
    this.camTarget.copy(center);
  }

  /** Steps quality down when the device can't keep up. */
  private adaptQuality(dt: number) {
    if (this.quality === 0) return;
    if (this.perfGrace > 0) {
      this.perfGrace -= dt;
      return;
    }
    this.perfTime += dt;
    this.perfFrames++;
    if (this.perfTime < 2) return;
    const fps = this.perfFrames / this.perfTime;
    this.perfTime = 0;
    this.perfFrames = 0;
    if (fps >= 45) return;
    this.quality--;
    this.perfGrace = 1;
    if (this.quality === 1) {
      this.bloom.enabled = false;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
      this.resize();
    } else {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
      this.resize();
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m) m.needsUpdate = true;
      });
    }
  }

  render(dt: number, time: number) {
    this.adaptQuality(dt);
    this.sparks.update(dt);
    this.ambient?.update(dt, time);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 0.35;
      this.camera.position.set(
        this.camBase.x + (Math.random() - 0.5) * s,
        this.camBase.y + (Math.random() - 0.5) * s,
        this.camBase.z + (Math.random() - 0.5) * s,
      );
      this.camera.lookAt(this.camTarget);
    } else {
      this.camera.position.copy(this.camBase);
      this.camera.lookAt(this.camTarget);
    }
    this.composer.render(dt);
  }
}
