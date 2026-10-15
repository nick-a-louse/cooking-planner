// The ringing alarm's timing (agreed with Nick): rings until silenced, loudly for 2 minutes,
// then a short beep every 30 seconds.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tones = 0;
/** Just enough of the Web Audio API to count the tones played. */
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume() {}
  createOscillator() {
    tones++;
    return { type: "", frequency: { value: 0 }, connect: (n: unknown) => n, start() {}, stop() {} };
  }
  createGain() {
    const g = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
    return g;
  }
  createBiquadFilter() {
    return { type: "", frequency: { value: 0 }, connect: (n: unknown) => n };
  }
  createDynamicsCompressor() {
    const p = () => ({ value: 0 });
    return { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), connect() {} };
  }
}

describe("ringing alarm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    tones = 0;
  });
  afterEach(async () => {
    (await import("../chime")).stopRinging();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps ringing until stopped", async () => {
    const { startRinging, stopRinging, isRinging } = await import("../chime");
    startRinging("up");
    expect(isRinging()).toBe(true);
    vi.advanceTimersByTime(10_000);
    const after10s = tones;
    expect(after10s).toBeGreaterThan(20); // a 4-tone burst about every 1.4 s
    stopRinging();
    vi.advanceTimersByTime(60_000);
    expect(tones).toBe(after10s);
    expect(isRinging()).toBe(false);
  });

  it("rings loudly for 2 minutes, then only a short beep every 30 seconds", async () => {
    const { startRinging } = await import("../chime");
    startRinging("down");
    vi.advanceTimersByTime(120_000);
    const loud = tones;
    vi.advanceTimersByTime(120_000); // the next 2 minutes: 4 single beeps
    expect(tones - loud).toBe(4);
  });

  it("starts the 2 loud minutes again when something new needs attention", async () => {
    const { startRinging } = await import("../chime");
    startRinging("up");
    vi.advanceTimersByTime(150_000); // into the quiet reminders
    const before = tones;
    startRinging("up"); // a new task is due
    vi.advanceTimersByTime(10_000);
    expect(tones - before).toBeGreaterThan(20);
  });
});
