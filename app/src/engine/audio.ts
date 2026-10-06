// Music analysis (run/audio.json, written by analysis/analyze.py) sampled at arbitrary song time.

export interface Section {
  name: string; start: number; end: number;
  /** from analysis/analyze.py: repetition label (A, B…), mean loudness 0..1, lead-vocal share 0..1 */
  label?: string; energy?: number; vocal?: number;
  kind?: 'intro' | 'verse' | 'chorus' | 'instrumental' | 'outro';
}

export interface AudioJSON {
  duration: number;
  bpm: number;
  fps: number;
  beats: number[];
  downbeats: number[];
  sections: Section[];
  features: Record<string, number[]>;
  onsets: Record<string, [number, number][]>;
  /** lead-vocal pitch (MIDI) at `fps`, null when unvoiced */
  f0?: (number | null)[];
  /** spans without lead vocal for >= 8 s */
  instrumental?: [number, number][];
  /** last moment the mix is above -50 dBFS (the film still runs to `duration`) */
  tail_end?: number;
}

export interface AudioSample {
  rms: number; low: number; mid: number; high: number;
  vocal: number; drums: number; bass: number; other: number;
  /** Decaying pulses (1 at the hit, half-life ~90-140 ms), scaled by hit strength. */
  kick: number; snare: number; hat: number; vonset: number;
}

const FEATURES = ['rms', 'low', 'mid', 'high', 'vocal', 'drums', 'bass', 'other'] as const;

export class AudioData {
  duration: number;
  bpm: number;
  beats: number[];
  downbeats: number[];
  sections: Section[];
  instrumental: [number, number][];
  tailEnd: number;
  private f0: (number | null)[];
  private cum: Record<string, Float64Array> = {};
  private fps: number;
  private feat: Record<string, Float32Array> = {};
  onsets: Record<string, [number, number][]>;

  constructor(j: AudioJSON) {
    this.duration = j.duration;
    this.bpm = j.bpm;
    this.beats = j.beats;
    this.downbeats = j.downbeats;
    this.sections = j.sections;
    this.fps = j.fps || 100;
    // envelopes may be nested under `features` or top-level arrays
    for (const k of FEATURES) this.feat[k] = Float32Array.from(j.features?.[k] ?? ((j as any)[k] as number[] | undefined) ?? []);
    this.onsets = j.onsets ?? {};
    this.f0 = j.f0 ?? [];
    this.instrumental = j.instrumental ?? [];
    this.tailEnd = j.tail_end ?? j.duration;
  }

  /**
   * ∫₀ᵗ env(name) dt — the stateless form of an integrator `x += dt * env(t)` (phase-viz style
   * rotations, energy-driven speeds): same value whatever order or rate frames are rendered in.
   */
  integral(name: string, t: number): number {
    const a = this.feat[name];
    if (!a || a.length === 0) return 0;
    let c = this.cum[name];
    if (!c) {
      c = new Float64Array(a.length + 1);
      for (let i = 0; i < a.length; i++) c[i + 1] = c[i]! + a[i]! / this.fps;
      this.cum[name] = c;
    }
    const x = Math.max(0, t * this.fps), i = Math.min(a.length - 1, Math.floor(x));
    return c[i]! + (x - i) * a[i]! / this.fps + Math.max(0, x - a.length) * a[a.length - 1]! / this.fps;
  }

  /** Lead-vocal pitch (MIDI, fractional) at t, or null when unvoiced. */
  pitch(t: number): number | null {
    const x = t * this.fps, i = Math.floor(x);
    const a = this.f0[i], b = this.f0[i + 1];
    if (a == null) return null;
    return b == null ? a : a + (b - a) * (x - i);
  }

  /** The last onset [time, strength] of a kind at or before t (null if none). */
  lastOnset(kind: string, t: number): [number, number] | null {
    const list = this.onsets[kind];
    if (!list || list.length === 0) return null;
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m]![0] <= t) lo = m + 1; else hi = m; }
    return lo > 0 ? list[lo - 1]! : null;
  }

  /** Index of the last onset of a kind at or before t (-1 if none): a stable id for per-hit seeds. */
  onsetIndex(kind: string, t: number): number {
    const list = this.onsets[kind] ?? [];
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m]![0] <= t) lo = m + 1; else hi = m; }
    return lo - 1;
  }

  /** The last downbeat at or before t (or the first one / 0). */
  lastDownbeat(t: number): number {
    const d = this.downbeats;
    let lo = 0, hi = d.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (d[m]! <= t) lo = m + 1; else hi = m; }
    return lo > 0 ? d[lo - 1]! : (d[0] ?? 0);
  }

  static async load(): Promise<AudioData> {
    const r = await fetch('run/audio.json');
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return new AudioData(await r.json());
    throw new Error(`run/audio.json not found (HTTP ${r.status}); is ATF_RUN set for the Vite server?`);
  }

  /** Linear-interpolated envelope value at time t. */
  env(name: string, t: number): number {
    const a = this.feat[name];
    if (!a || a.length === 0) return 0;
    const x = t * this.fps;
    const i = Math.floor(x);
    if (i < 0) return a[0]!;
    if (i >= a.length - 1) return a[a.length - 1]!;
    const f = x - i;
    return a[i]! * (1 - f) + a[i + 1]! * f;
  }

  /** Max over [t - w, t]: a peak-hold for punchy reactions. */
  envPeak(name: string, t: number, w = 0.08): number {
    let m = 0;
    for (let s = t - w; s <= t; s += 1 / this.fps) m = Math.max(m, this.env(name, s));
    return m;
  }

  /** Sum of decaying pulses from onsets of a kind (kick/snare/hat/vocal) before t. */
  hit(kind: string, t: number, halfLife = 0.11): number {
    const list = this.onsets[kind];
    if (!list || list.length === 0) return 0;
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m]![0] <= t) lo = m + 1; else hi = m; }
    let v = 0;
    for (let i = lo - 1; i >= 0 && i >= lo - 6; i--) {
      const [ot, s] = list[i]!;
      const dt = t - ot;
      if (dt > halfLife * 8) break;
      v = Math.max(v, s * Math.pow(0.5, dt / halfLife));
    }
    return v;
  }

  /** Onset events of a kind in [t0, t1). */
  events(kind: string, t0: number, t1: number): [number, number][] {
    return (this.onsets[kind] ?? []).filter(([t]) => t >= t0 && t < t1);
  }

  sample(t: number): AudioSample {
    return {
      rms: this.env('rms', t), low: this.env('low', t), mid: this.env('mid', t), high: this.env('high', t),
      vocal: this.env('vocal', t), drums: this.env('drums', t), bass: this.env('bass', t), other: this.env('other', t),
      kick: this.hit('kick', t, 0.12), snare: this.hit('snare', t, 0.14), hat: this.hit('hat', t, 0.06),
      vonset: this.hit('vocal', t, 0.15),
    };
  }

  /** Continuous beat index: 0 at first beat, fractional in between (extrapolated outside). */
  beatAt(t: number): number {
    const b = this.beats;
    if (b.length < 2) return t * (this.bpm / 60);
    if (t <= b[0]!) return (t - b[0]!) / (b[1]! - b[0]!);
    if (t >= b[b.length - 1]!) {
      const p = b[b.length - 1]! - b[b.length - 2]!;
      return b.length - 1 + (t - b[b.length - 1]!) / p;
    }
    let lo = 0, hi = b.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m]! <= t) lo = m; else hi = m; }
    return lo + (t - b[lo]!) / (b[hi]! - b[lo]!);
  }

  /** Time of (fractional) beat index. */
  timeOfBeat(i: number): number {
    const b = this.beats;
    const n = b.length;
    const period = n > 1 ? (b[n - 1]! - b[0]!) / (n - 1) : 60 / this.bpm;
    if (i <= 0) return (b[0] ?? 0) + i * period;
    if (i >= n - 1) return b[n - 1]! + (i - (n - 1)) * period;
    const k = Math.floor(i);
    return b[k]! + (b[k + 1]! - b[k]!) * (i - k);
  }

  /** Continuous bar index from downbeats (0 at first downbeat). */
  barAt(t: number): number {
    const d = this.downbeats;
    if (d.length < 2) return this.beatAt(t) / 4;
    if (t <= d[0]!) return (t - d[0]!) / (d[1]! - d[0]!);
    if (t >= d[d.length - 1]!) {
      const p = d[d.length - 1]! - d[d.length - 2]!;
      return d.length - 1 + (t - d[d.length - 1]!) / p;
    }
    let lo = 0, hi = d.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (d[m]! <= t) lo = m; else hi = m; }
    return lo + (t - d[lo]!) / (d[hi]! - d[lo]!);
  }

  /** Nearest beat time to t. */
  nearestBeat(t: number): number {
    return this.timeOfBeat(Math.round(this.beatAt(t)));
  }

  section(t: number) {
    return this.sections.find((s) => t >= s.start && t < s.end) ?? this.sections[this.sections.length - 1];
  }
}
