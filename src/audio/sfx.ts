// Tiny synthesized sound effects (no audio files needed).

export class Sfx {
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  pitch = 1;
  muted = false;

  /** Must be called from a user gesture (browsers block audio otherwise). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq * this.pitch, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * this.pitch * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, freq: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise || this.muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  bumper() {
    this.tone(620 + Math.random() * 80, 0.16, 'square', 0.18, 0.45);
    this.tone(1240, 0.08, 'sine', 0.12, 0.8);
  }
  sling() {
    this.hiss(0.08, 0.5, 2400);
    this.tone(320, 0.08, 'triangle', 0.2, 0.6);
  }
  flipper(up: boolean) {
    if (up) {
      this.hiss(0.05, 0.35, 900);
      this.tone(110, 0.08, 'sine', 0.35, 0.7);
    } else this.tone(80, 0.05, 'sine', 0.15, 0.8);
  }
  target() {
    this.tone(880, 0.12, 'triangle', 0.22, 1.5);
  }
  bank() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, 1, i * 0.07));
  }
  lane() {
    this.tone(1320, 0.1, 'sine', 0.18, 1.3);
  }
  lanes() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.16, 1, i * 0.06));
  }
  saucer(eject: boolean) {
    if (eject) {
      this.hiss(0.12, 0.5, 1200);
      this.tone(200, 0.15, 'sawtooth', 0.15, 2.5);
    } else this.tone(400, 0.5, 'sine', 0.2, 0.25);
  }
  launch(power: number) {
    this.hiss(0.25, 0.3 + power * 0.3, 700);
    this.tone(160, 0.3, 'sawtooth', 0.12, 3);
  }
  wall(impact: number) {
    this.tone(180, 0.05, 'sine', Math.min(0.25, impact / 200), 0.6);
  }
  drain() {
    [440, 349, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.18, 0.9, i * 0.14));
  }
  saved() {
    [523, 784].forEach((f, i) => this.tone(f, 0.15, 'sine', 0.2, 1, i * 0.1));
  }
  nudge() {
    this.hiss(0.15, 0.5, 300);
  }
  tilt() {
    this.tone(110, 0.8, 'sawtooth', 0.25, 0.5);
  }
  ramp() {
    [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.12, 'sawtooth', 0.1, 1.05, i * 0.05));
  }
  spinner() {
    this.tone(1800 + Math.random() * 300, 0.03, 'square', 0.05, 0.9);
  }
  kickback() {
    this.hiss(0.18, 0.6, 600);
    this.tone(120, 0.25, 'square', 0.2, 3);
  }
  multiball() {
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.tone(f, 0.18, 'square', 0.13, 1, i * 0.07));
  }
  mission() {
    [659, 880, 1175, 1760].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.18, 1, i * 0.08));
  }
  over() {
    [392, 330, 262, 196, 131].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.18, 0.95, i * 0.2));
  }
}
