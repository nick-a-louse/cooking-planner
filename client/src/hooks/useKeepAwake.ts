import { useEffect } from "react";

/**
 * Keep the screen on while `active` (a live run), so a phone in the kitchen doesn't lock.
 *
 * Over HTTPS (or on localhost) this uses the Screen Wake Lock API. Served over plain HTTP,
 * as on a home network, browsers don't offer that API, so it falls back to a playing video.
 * Chromium-based browsers (Chrome, Brave, Edge, Android) keep the screen on for a video only
 * if it is audible or covers more than 20% of the window with over 75% of it on screen, so the
 * video fills the whole window, fully transparent and behind everything (it can't be seen or
 * clicked, but counts as on screen). A hidden 16 px video, as before, did nothing.
 * iPhones don't hold the screen for video this way; there only HTTPS helps.
 * Playing media may need a tap first; starting the run counts, and after a reload the first
 * tap on the page starts it.
 */
export function useKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const native = "wakeLock" in navigator && window.isSecureContext;
    let lock: WakeLockSentinel | null = null;
    let video: HTMLVideoElement | null = null;
    let stopped = false;

    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (native) {
        if (lock && !lock.released) return;
        try {
          lock = await navigator.wakeLock.request("screen");
        } catch {
          // Refused (e.g. battery saver). Nothing else to do; alerts still work.
        }
        return;
      }
      video ??= makeVideo();
      if (video.paused) video.play().catch(() => {}); // blocked until the next tap
    };

    // The lock is dropped whenever the tab is hidden, so take it again on return,
    // and retry on taps in case the first attempt needed one.
    const onVisible = () => void acquire();
    const onTap = () => void acquire();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", onTap);
    void acquire();

    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", onTap);
      void lock?.release().catch(() => {});
      if (video) {
        video.pause();
        video.remove();
      }
    };
  }, [active]);
}

function makeVideo(): HTMLVideoElement {
  const v = document.createElement("video");
  v.setAttribute("playsinline", "");
  v.setAttribute("muted", "");
  v.muted = true;
  v.loop = true;
  v.setAttribute("aria-hidden", "true");
  v.setAttribute("tabindex", "-1");
  v.className = "keep-awake-video";
  for (const [src, type] of [
    ["/static/keep-awake.webm", "video/webm"],
    ["/static/keep-awake.mp4", "video/mp4"],
  ]) {
    const s = document.createElement("source");
    s.src = src;
    s.type = type;
    v.appendChild(s);
  }
  document.body.appendChild(v);
  return v;
}
