let ctx: AudioContext | null = null;
let out: AudioNode | null = null;

/** Browsers only allow sound after a tap; unlock it on the first one (starting a run counts). */
if (typeof document !== "undefined") {
  const unlock = () => {
    try {
      audio();
    } catch {
      // No audio on this device.
    }
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}

/** The shared audio context, with a limiter so loud tones stay loud without distorting. */
function audio(): { ctx: AudioContext; out: AudioNode } {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  if (!out) {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);
    out = limiter;
  }
  return { ctx, out };
}

/** One tone: a square wave (bright, cuts through kitchen noise) softened slightly by a low-pass filter. */
function tone(at: number, freq: number, length: number, level = 0.9): void {
  const { ctx, out } = audio();
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  filter.type = "lowpass";
  filter.frequency.value = 3500;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.01);
  gain.gain.setValueAtTime(level, at + length - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(filter).connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/**
 * One burst of the alarm: four quick alternating high tones, like a kitchen timer.
 * Rising (low-high) for something to start, falling (high-low) for something to finish.
 */
export function alarmBurst(direction: "up" | "down" = "up"): void {
  try {
    const { ctx } = audio();
    const [a, b] = direction === "up" ? [1046.5, 1568] : [1568, 1046.5];
    const t = ctx.currentTime + 0.02;
    for (let i = 0; i < 4; i++) tone(t + i * 0.16, i % 2 === 0 ? a : b, 0.12);
  } catch {
    // Audio unavailable: alerts stay visual only.
  }
}

/** A single short beep (the reminder after an alarm has rung for a while). */
export function shortBeep(): void {
  try {
    const { ctx } = audio();
    tone(ctx.currentTime + 0.02, 1568, 0.15, 0.6);
  } catch {
    // Audio unavailable.
  }
}

/** The old name, used when a run starts (one burst also unlocks sound on phones). */
export function chime(direction: "up" | "down" = "up"): void {
  alarmBurst(direction);
}

/** How the ringing alarm behaves (agreed): rings for 2 minutes, then a short beep every 30 s until silenced. */
export const RING_FOR_MS = 2 * 60_000;
const RING_EVERY_MS = 1_400;
const REMIND_EVERY_MS = 30_000;

let ringTimer: ReturnType<typeof setInterval> | null = null;
let ringStartedAt = 0;
let lastReminder = 0;
let ringDirection: "up" | "down" = "up";

/**
 * Start (or restart) the ringing alarm. Calling it again while ringing restarts the
 * 2-minute loud period, since something new needs attention.
 */
export function startRinging(direction: "up" | "down"): void {
  ringDirection = direction;
  ringStartedAt = Date.now();
  lastReminder = ringStartedAt;
  alarmBurst(direction);
  if (ringTimer) return;
  ringTimer = setInterval(() => {
    const now = Date.now();
    if (now - ringStartedAt < RING_FOR_MS) {
      alarmBurst(ringDirection);
    } else if (now - lastReminder >= REMIND_EVERY_MS) {
      lastReminder = now;
      shortBeep();
    }
  }, RING_EVERY_MS);
}

export function stopRinging(): void {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
}

export function isRinging(): boolean {
  return ringTimer !== null;
}
