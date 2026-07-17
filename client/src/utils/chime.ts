let ctx: AudioContext | null = null;

/** Two short sine beeps. Requires a prior user gesture (starting the run counts). */
export function chime(): void {
  try {
    ctx ??= new AudioContext();
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
    beep(t, 880);
    beep(t + 0.45, 1174.66);
  } catch {
    // Audio unavailable — reminders stay visual only.
  }
}
