import { useEffect, useRef } from "react";

export const ZOOM_LEVELS = [2, 4, 8] as const;
export const RAIL_W = 160;

/**
 * Ctrl+wheel and two-finger-pinch zoom stepping, keeping the time under
 * the viewport centre stable across zoom changes.
 */
export function useZoomPan(
  scrollRef: React.RefObject<HTMLElement | null>,
  zoomIdx: number,
  setZoomIdx: (idx: number) => void,
) {
  const stateRef = useRef({ zoomIdx, pinchDist: 0, pinchBaseIdx: 0 });
  stateRef.current.zoomIdx = zoomIdx;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const stepZoom = (dir: 1 | -1) => {
      const cur = stateRef.current.zoomIdx;
      const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, cur + dir));
      if (next === cur) return;
      const oldPpm = ZOOM_LEVELS[cur];
      const newPpm = ZOOM_LEVELS[next];
      const centerTime = (el.scrollLeft + el.clientWidth / 2 - RAIL_W) / oldPpm;
      setZoomIdx(next);
      requestAnimationFrame(() => {
        el.scrollLeft = centerTime * newPpm + RAIL_W - el.clientWidth / 2;
      });
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      stepZoom(e.deltaY < 0 ? 1 : -1);
    };

    const pointers = new Map<number, { x: number; y: number }>();
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        stateRef.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        stateRef.current.pinchBaseIdx = stateRef.current.zoomIdx;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && stateRef.current.pinchDist > 0) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = dist / stateRef.current.pinchDist;
        if (ratio > 1.35) {
          stateRef.current.pinchDist = dist;
          stepZoom(1);
        } else if (ratio < 0.74) {
          stateRef.current.pinchDist = dist;
          stepZoom(-1);
        }
      }
    };
    const onPointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) stateRef.current.pinchDist = 0;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerEnd);
    el.addEventListener("pointercancel", onPointerEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerEnd);
      el.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [scrollRef, setZoomIdx]);
}
