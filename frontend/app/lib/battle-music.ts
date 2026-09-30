// An original 8-bit style battle loop, synthesized with the Web Audio API so
// no audio file ships with the app. Four bars in E minor at a brisk tempo.

const tempo = 168;
const stepSeconds = 60 / tempo / 4; // sixteenth notes
const lookaheadSeconds = 0.12;
const schedulerIntervalMs = 25;

// MIDI note numbers; null is a rest. 16 steps per bar.
const _ = null;
const lead: (number | null)[] = [
  // bar 1
  76, _, 79, _, 83, _, 81, 79, 78, _, 76, _, 74, _, 76, _,
  // bar 2
  72, _, 76, _, 79, _, 77, 76, 74, _, 72, _, 71, _, 72, 74,
  // bar 3
  74, _, 78, _, 81, _, 79, 78, 76, _, 74, _, 78, _, 81, _,
  // bar 4
  83, _, 81, 79, 78, 79, 81, _, 83, _, 86, _, 83, _, _, _,
];
const bassRoots = [40, 36, 38, 35]; // E2, C2, D2, B1

function midiToHz(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

export class BattleMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private nextStepAt = 0;

  get isPlaying() {
    return this.timer !== null;
  }

  /** Must be called from a user gesture at least once so audio can start. */
  unlock() {
    const context = this.ensureContext();
    if (context?.state === "suspended") {
      void context.resume();
    }
  }

  start() {
    const context = this.ensureContext();
    if (!context || !this.master || this.timer) {
      return;
    }

    if (context.state === "suspended") {
      void context.resume();
    }

    const now = context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.22, now + 0.25);

    this.step = 0;
    this.nextStepAt = now + 0.05;
    this.timer = setInterval(() => this.schedule(), schedulerIntervalMs);
  }

  stop() {
    if (!this.timer || !this.context || !this.master) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  }

  dispose() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  private ensureContext() {
    if (this.context) {
      return this.context;
    }

    if (typeof window === "undefined" || !window.AudioContext) {
      return null;
    }

    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0.0001;
    master.connect(context.destination);

    const noise = context.createBuffer(1, context.sampleRate * 0.05, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.context = context;
    this.master = master;
    this.noise = noise;
    return context;
  }

  private schedule() {
    const context = this.context;
    if (!context) {
      return;
    }

    while (this.nextStepAt < context.currentTime + lookaheadSeconds) {
      this.playStep(this.step, this.nextStepAt);
      this.nextStepAt += stepSeconds;
      this.step = (this.step + 1) % lead.length;
    }
  }

  private playStep(step: number, at: number) {
    const bar = Math.floor(step / 16);
    const beat = step % 16;

    const note = lead[step];
    if (note !== null) {
      this.tone("square", midiToHz(note), at, stepSeconds * 1.6, 0.16);
    }

    // Driving octave bass on every eighth note.
    if (beat % 2 === 0) {
      const root = bassRoots[bar] + (beat % 4 === 2 ? 12 : 0);
      this.tone("triangle", midiToHz(root), at, stepSeconds * 1.8, 0.5);
    }

    // Hi-hat on the offbeats, a heavier hit on each downbeat.
    if (beat % 4 === 2) {
      this.hat(at, 0.08);
    } else if (beat % 4 === 0) {
      this.hat(at, 0.14);
    }
  }

  private tone(
    type: OscillatorType,
    frequency: number,
    at: number,
    duration: number,
    volume: number,
  ) {
    const context = this.context;
    if (!context || !this.master) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private hat(at: number, volume: number) {
    const context = this.context;
    if (!context || !this.master || !this.noise) {
      return;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise;
    filter.type = "highpass";
    filter.frequency.value = 6000;
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(at);
  }
}
