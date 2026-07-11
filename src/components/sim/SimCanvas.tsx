"use client";

import { useEffect, useRef } from "react";
import { vec, type Vec2 } from "@/engine";
import { useSimStore, type JointId, type SelectableId } from "@/store/simStore";
import { readPalette, type Palette } from "./palette";
import { hitTest, render, type Scene } from "./renderer";
import { panBy, screenToWorld, zoomAt, type ScreenSize } from "./view";

const DRAGGABLE: ReadonlyArray<SelectableId> = ["O2", "O4", "A", "B", "P", "ground"];

/**
 * The simulation surface. One canvas, one rAF loop: advance the motor,
 * snapshot the store, draw. Pointer events handle drag-a-joint, pan, wheel
 * zoom and two-finger pinch; all gestures work in CSS-pixel screen space.
 */
export function SimCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const store = useSimStore;
    if (process.env.NODE_ENV !== "production") {
      // Dev-only handle for integration tests and console debugging.
      (window as unknown as Record<string, unknown>).__simStore = store;
    }
    let palette: Palette = readPalette();
    let size: ScreenSize = { w: 1, h: 1 };
    let raf = 0;
    let last = performance.now();
    let disposed = false;

    // --- sizing -----------------------------------------------------------
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size = { w: rect.width, h: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      useSimStore.getState().setCanvasSize(size);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Frame the default mechanism once we know our size.
    store.getState().fitView(size);

    // Respect prefers-reduced-motion: start paused, curve still shown.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      store.getState().setPlaying(false);
    }

    // --- theme ------------------------------------------------------------
    const mo = new MutationObserver(() => {
      palette = readPalette();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // --- render loop --------------------------------------------------------
    const scene = (): Scene => {
      const st = store.getState();
      return {
        view: st.view,
        size,
        palette,
        def: st.def,
        pose: st.pose,
        trace: st.trace,
        range: st.range,
        grashof: st.grashof,
        theta2: st.theta2,
        hovered: st.hovered,
        selected: st.selected,
      };
    };

    const frame = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      store.getState().tick(dt);
      render(ctx, scene());
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // --- pointers -----------------------------------------------------------
    interface PointerInfo {
      id: number;
      pos: Vec2;
    }
    const pointers = new Map<number, PointerInfo>();
    let mode: "idle" | "drag" | "pan" | "pinch" = "idle";
    let dragId: JointId | "ground" | null = null;
    let resumeAfterDrag = false;
    let lastPan: Vec2 | null = null;
    let lastGroundWorld: Vec2 | null = null;
    let pinchStartDist = 0;
    let pinchStartScale = 1;

    const toLocal = (e: PointerEvent): Vec2 => {
      const rect = canvas.getBoundingClientRect();
      return vec(e.clientX - rect.left, e.clientY - rect.top);
    };

    const setCursor = (id: SelectableId | null, draggingNow: boolean) => {
      if (draggingNow) canvas.style.cursor = "grabbing";
      else if (id && DRAGGABLE.includes(id)) canvas.style.cursor = "grab";
      else if (id) canvas.style.cursor = "pointer";
      else canvas.style.cursor = "default";
    };

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = toLocal(e);
      pointers.set(e.pointerId, { id: e.pointerId, pos: p });

      if (pointers.size === 2) {
        // Second finger: switch to pinch regardless of what we were doing.
        const [a, b] = [...pointers.values()];
        pinchStartDist = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        pinchStartScale = store.getState().view.scale;
        if (mode === "drag") endDrag();
        mode = "pinch";
        return;
      }

      const st = store.getState();
      const hit = hitTest(sceneForHit(), p);
      st.setSelected(hit);

      if (hit && DRAGGABLE.includes(hit)) {
        mode = "drag";
        dragId = hit as JointId | "ground";
        st.setDragging(dragId);
        // Motor fights a θ₂-changing drag; pause and resume after.
        resumeAfterDrag = st.playing;
        if (st.playing) st.setPlaying(false);
        if (dragId === "ground") {
          lastGroundWorld = screenToWorld(st.view, size, p);
        } else {
          st.dragTo(dragId as JointId, screenToWorld(st.view, size, p));
        }
        setCursor(hit, true);
      } else {
        mode = "pan";
        lastPan = p;
        setCursor(null, false);
      }
    };

    const sceneForHit = (): Scene => scene();

    const onPointerMove = (e: PointerEvent) => {
      const p = toLocal(e);
      const info = pointers.get(e.pointerId);
      if (info) info.pos = p;

      const st = store.getState();

      if (mode === "pinch" && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
        const mid = vec((a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2);
        if (pinchStartDist > 0) {
          const target = pinchStartScale * (d / pinchStartDist);
          const factor = target / st.view.scale;
          st.setView(zoomAt(st.view, size, mid, factor));
        }
        return;
      }

      if (mode === "drag" && dragId) {
        const w = screenToWorld(st.view, size, p);
        if (dragId === "ground") {
          if (lastGroundWorld) {
            st.translateBy(vec(w.x - lastGroundWorld.x, w.y - lastGroundWorld.y));
            lastGroundWorld = w;
          }
        } else {
          st.dragTo(dragId, w);
        }
        return;
      }

      if (mode === "pan" && lastPan) {
        st.setView(panBy(st.view, p.x - lastPan.x, p.y - lastPan.y));
        lastPan = p;
        return;
      }

      // idle: hover feedback
      const hit = hitTest(sceneForHit(), p);
      st.setHovered(hit);
      setCursor(hit, false);
    };

    const endDrag = () => {
      const st = store.getState();
      st.setDragging(null);
      if (resumeAfterDrag) st.setPlaying(true);
      resumeAfterDrag = false;
      dragId = null;
      lastGroundWorld = null;
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (mode === "drag") endDrag();
      if (mode === "pinch" && pointers.size < 2) {
        // fall back to pan with the remaining finger
        const rest = [...pointers.values()];
        lastPan = rest.length === 1 ? rest[0].pos : null;
        mode = rest.length === 1 ? "pan" : "idle";
        return;
      }
      if (pointers.size === 0) mode = "idle";
    };

    const onPointerLeave = () => {
      if (mode === "idle") {
        useSimStore.getState().setHovered(null);
        setCursor(null, false);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = store.getState();
      const rect = canvas.getBoundingClientRect();
      const p = vec(e.clientX - rect.left, e.clientY - rect.top);
      const factor = Math.exp(-e.deltaY * 0.0015);
      st.setView(zoomAt(st.view, size, p, factor));
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none select-none"
      aria-label="Mechanism simulation canvas. Drag joints to reshape the linkage; drag the background to pan; scroll or pinch to zoom."
    />
  );
}