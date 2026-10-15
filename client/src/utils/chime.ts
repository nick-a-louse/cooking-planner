let ctx: AudioContext | null = null;

/** Browsers only allow sound after a tap; unlock it on the first one (starting a run counts). */
if (typeof document !== "undefined") {
  const unlock = () => {
    try {
      ctx ??= new AudioContext();
      if (ctx.state === "suspended") void ctx.resume();
    } catch {
      // No audio on this device.
    }
  };
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("keydown", unlock);
}

/**
 * Two short sine beeps. "up" (rising) for something to start, "down" (falling) for
 * something to finish, so the two can be told apart without looking.
 */
export function chime(direction: "up" | "down" = "up"): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const beep = (at: number, freq: number) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    };
    const t = ctx.currentTime;
    const [a, b] = direction === "up" ? [880, 1174.66] : [1174.66, 784];
    beep(t, a);
    beep(t + 0.45, b);
  } catch {
    // Audio unavailable — reminders stay visual only.
  }
}
