import { useRef, useState } from "react";

export type DragKind = "move" | "resize-l" | "resize-r";

export interface LiveDrag {
  startMin: number;
  durationMin: number;
  kind: DragKind;
}

interface Gesture {
  kind: DragKind;
  pointerId: number;
  x0: number;
  y0: number;
  lastX: number;
  lastY: number;
  startMin0: number;
  dur0: number;
  armed: boolean;
  scrolling: boolean;
  moved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  scrollEl: HTMLElement | null;
  maxDx?: number;
  maxDy?: number;
}

const LONG_PRESS_MS = 250;
const SCROLL_SLOP_PX = 10;
export const DRAG_SNAP_MIN = 5;

function snapTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}

/**
 * Pointer-event drag for a task bar: body move + end-handle resize.
 * Mouse drags immediately; touch requires a ~250ms hold to arm, and
 * unarmed touch movement is passed through as manual timeline scrolling.
 */
/** How far a bar must be dragged up or down before the "drag the name instead" hint shows. */
const VERTICAL_HINT_PX = 24;

export function useBarDrag(opts: {
  startMin: number;
  durationMin: number;
  pxPerMin: number;
  onCommit: (startMin: number, durationMin: number) => void;
  /** The bar was dragged mostly up or down: bars only move in time, so the app can point to the row grip. */
  onVerticalDrag?: () => void;
}) {
  const { startMin, durationMin, pxPerMin, onCommit, onVerticalDrag } = opts;
  const [live, setLiveState] = useState<LiveDrag | null>(null);
  const liveRef = useRef<LiveDrag | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const suppressClickRef = useRef(false);

  const setLive = (v: LiveDrag | null) => {
    liveRef.current = v;
    setLiveState(v);
  };

  const onPointerDown = (e: React.PointerEvent, kind: DragKind) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Pointer may already be gone (fast tap) — the drag still works uncaptured.
    }
    const isMouse = e.pointerType === "mouse";
    const g: Gesture = {
      kind,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      startMin0: startMin,
      dur0: durationMin,
      armed: isMouse,
      scrolling: false,
      moved: false,
      timer: null,
      scrollEl: target.closest(".timeline-scroll"),
    };
    if (!isMouse) {
      g.timer = setTimeout(() => {
        const cur = gestureRef.current;
        if (cur === g && !g.scrolling) {
          g.armed = true;
          setLive({ startMin: g.startMin0, durationMin: g.dur0, kind });
          navigator.vibrate?.(10);
        }
      }, LONG_PRESS_MS);
    }
    gestureRef.current = g;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;

    if (!g.armed) {
      if (g.scrolling || Math.hypot(dx, dy) > SCROLL_SLOP_PX) {
        if (!g.scrolling) {
          g.scrolling = true;
          if (g.timer) clearTimeout(g.timer);
        }
        if (g.scrollEl) {
          g.scrollEl.scrollLeft -= e.clientX - g.lastX;
          g.scrollEl.scrollTop -= e.clientY - g.lastY;
        }
      }
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      return;
    }

    if (Math.abs(dx) > 3) g.moved = true;
    g.maxDx = Math.max(g.maxDx ?? 0, Math.abs(dx));
    g.maxDy = Math.max(g.maxDy ?? 0, Math.abs(dy));
    const dMin = dx / pxPerMin;
    if (g.kind === "move") {
      const s = Math.max(0, snapTo(g.startMin0 + dMin, DRAG_SNAP_MIN));
      setLive({ startMin: s, durationMin: g.dur0, kind: g.kind });
    } else if (g.kind === "resize-r") {
      const d = Math.max(DRAG_SNAP_MIN, snapTo(g.dur0 + dMin, DRAG_SNAP_MIN));
      setLive({ startMin: g.startMin0, durationMin: d, kind: g.kind });
    } else {
      const end0 = g.startMin0 + g.dur0;
      const s = Math.min(end0 - DRAG_SNAP_MIN, Math.max(0, snapTo(g.startMin0 + dMin, DRAG_SNAP_MIN)));
      setLive({ startMin: s, durationMin: end0 - s, kind: g.kind });
    }
  };

  const endGesture = (commit: boolean) => {
    const g = gestureRef.current;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    gestureRef.current = null;
    // Mostly up/down (more than half a row, and more than sideways): they meant to move the row.
    if (commit && g.armed && g.kind === "move" && (g.maxDy ?? 0) > VERTICAL_HINT_PX && (g.maxDy ?? 0) > (g.maxDx ?? 0)) {
      onVerticalDrag?.();
    }
    // Any real movement is a drag, not a click (else letting go opens the task editor).
    if (g.armed && (g.moved || (g.maxDy ?? 0) > 3)) {
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 0);
    }
    if (g.armed && g.moved) {
      const l = liveRef.current;
      if (commit && l) onCommit(l.startMin, l.durationMin);
    }
    setLive(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (gestureRef.current?.pointerId === e.pointerId) endGesture(true);
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    if (gestureRef.current?.pointerId === e.pointerId) endGesture(false);
  };

  /** True when a click should be ignored because it is the tail of a drag. */
  const shouldSuppressClick = () => suppressClickRef.current;

  return { live, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, shouldSuppressClick };
}
