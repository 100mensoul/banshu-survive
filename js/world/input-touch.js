/**
 * 世界地図キャンバス — Pointer Events 統一入力（iPad・Apple Pencil・マウス）
 * 1本指/ペン = 描く、2本指 = パン/回転/ピンチ
 */

const STROKE_GRACE_MS = 80;
const TAP_MAX_MS = 280;
const TAP_MAX_MOVE_PX = 24;
const LONG_PRESS_MS = 520;
const LONG_PRESS_MOVE_PX = 12;

/**
 * @param {HTMLElement} dom
 * @param {object} handlers
 * @param {() => 'plan'|'3d'} handlers.getViewMode
 * @param {(e: PointerEvent) => void} handlers.onStrokeDown
 * @param {(e: PointerEvent) => void} handlers.onStrokeMove
 * @param {(e: PointerEvent) => void} handlers.onStrokeUp
 * @param {(e: PointerEvent) => void} [handlers.onStrokeCancel]
 * @param {(dx: number, dy: number, e: PointerEvent) => void} handlers.onPanDelta
 * @param {(dx: number, dy: number, e: PointerEvent) => void} handlers.onOrbitDelta
 * @param {(ratio: number, e: PointerEvent) => void} handlers.onPinchZoom
 * @param {(e: PointerEvent) => void} [handlers.onTwoFingerTap]
 * @param {(e: PointerEvent) => void} [handlers.onThreeFingerTap]
 * @param {(e: PointerEvent) => void} [handlers.onHoverMove]
 * @returns {() => void} detach
 */
export function attachPointerInput(dom, handlers) {
  /** @type {Map<number, { x: number, y: number, type: string, t: number }>} */
  const pointers = new Map();

  let mode = 'idle'; // idle | stroke-pending | stroke | gesture
  let strokeGraceTimer = null;
  let strokePointerId = null;
  let gestureStartDist = 0;
  let gestureLastDist = 0;
  let gestureLastCx = 0;
  let gestureLastCy = 0;
  let gestureStartT = 0;
  let gestureMaxMove = 0;
  let tapFingerCount = 0;
  let longPressTimer = null;
  let longPressOrigin = null;
  let lastPrimaryEvent = null;

  function pointerCount() {
    return pointers.size;
  }

  function centroid() {
    let sx = 0;
    let sy = 0;
    for (const p of pointers.values()) {
      sx += p.x;
      sy += p.y;
    }
    const n = pointers.size || 1;
    return { x: sx / n, y: sy / n };
  }

  function pointerDistance() {
    const ids = [...pointers.keys()];
    if (ids.length < 2) return 0;
    const a = pointers.get(ids[0]);
    const b = pointers.get(ids[1]);
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function clearStrokeGrace() {
    if (strokeGraceTimer) {
      clearTimeout(strokeGraceTimer);
      strokeGraceTimer = null;
    }
  }

  function clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressOrigin = null;
  }

  function releaseCapture(id) {
    try {
      if (dom.hasPointerCapture(id)) dom.releasePointerCapture(id);
    } catch {
      /* ignore */
    }
  }

  function beginStroke(e) {
    mode = 'stroke';
    strokePointerId = e.pointerId;
    clearStrokeGrace();
    clearLongPress();
    try {
      dom.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    handlers.onStrokeDown(e);
  }

  function endStroke(e) {
    if (mode !== 'stroke') return;
    mode = 'idle';
    strokePointerId = null;
    handlers.onStrokeUp(e);
    releaseCapture(e.pointerId);
  }

  function cancelStroke(e) {
    if (mode === 'stroke-pending') {
      mode = 'idle';
      clearStrokeGrace();
      handlers.onStrokeCancel?.(e);
      return;
    }
    if (mode === 'stroke') {
      endStroke(e);
    }
  }

  function beginGesture(e) {
    clearStrokeGrace();
    clearLongPress();
    if (mode === 'stroke-pending') {
      mode = 'idle';
      handlers.onStrokeCancel?.(e);
    } else if (mode === 'stroke') {
      endStroke(e);
    }
    mode = 'gesture';
    tapFingerCount = Math.max(tapFingerCount, pointerCount());
    gestureStartDist = pointerDistance();
    gestureLastDist = gestureStartDist;
    const c = centroid();
    gestureLastCx = c.x;
    gestureLastCy = c.y;
    if (tapFingerCount <= pointerCount()) {
      gestureStartT = performance.now();
      gestureMaxMove = 0;
    }
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button > 0) {
      /* 右・中ボタンは stroke ではなく pan 扱い — editor 側で処理 */
    }
    dom.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, t: performance.now() });
    lastPrimaryEvent = e;

    const n = pointerCount();
    if (n === 1) {
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') {
        beginStroke(e);
      } else {
        mode = 'stroke-pending';
        clearStrokeGrace();
        strokeGraceTimer = setTimeout(() => {
          strokeGraceTimer = null;
          if (pointerCount() === 1 && mode === 'stroke-pending') {
            beginStroke(lastPrimaryEvent || e);
          }
        }, STROKE_GRACE_MS);
        longPressOrigin = { x: e.clientX, y: e.clientY };
        clearLongPress();
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (mode === 'stroke-pending' && pointerCount() === 1) {
            /* 長押しは将来用 — 今は stroke に昇格させない */
          }
        }, LONG_PRESS_MS);
      }
    } else if (n === 2) {
      beginGesture(e);
    } else if (n >= 3) {
      if (mode !== 'gesture') beginGesture(e);
      else tapFingerCount = Math.max(tapFingerCount, n);
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (p) {
      const move = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      gestureMaxMove = Math.max(gestureMaxMove, move);
      p.x = e.clientX;
      p.y = e.clientY;
    }

    if (longPressOrigin) {
      const d = Math.hypot(e.clientX - longPressOrigin.x, e.clientY - longPressOrigin.y);
      if (d > LONG_PRESS_MOVE_PX) clearLongPress();
    }

    if (mode === 'stroke' && e.pointerId === strokePointerId) {
      handlers.onStrokeMove(e);
      e.preventDefault();
      return;
    }

    if (mode === 'gesture' && pointerCount() >= 2) {
      const c = centroid();
      const dx = c.x - gestureLastCx;
      const dy = c.y - gestureLastCy;
      gestureLastCx = c.x;
      gestureLastCy = c.y;

      const dist = pointerDistance();
      if (gestureLastDist > 0 && dist > 0) {
        const ratio = dist / gestureLastDist;
        if (Math.abs(ratio - 1) > 0.004) {
          handlers.onPinchZoom(ratio, e);
        }
      }
      gestureLastDist = dist;

      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        if (handlers.getViewMode() === 'plan') {
          handlers.onPanDelta(dx, dy, e);
        } else {
          handlers.onOrbitDelta(dx, dy, e);
        }
      }
      e.preventDefault();
      return;
    }

    if (mode === 'idle' || mode === 'stroke-pending') {
      handlers.onHoverMove?.(e);
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    releaseCapture(e.pointerId);
    clearLongPress();

    const remaining = pointerCount();

    if (mode === 'stroke' && e.pointerId === strokePointerId) {
      endStroke(e);
      e.preventDefault();
      return;
    }

    if (mode === 'stroke-pending' && remaining === 0) {
      clearStrokeGrace();
      mode = 'idle';
      e.preventDefault();
      return;
    }

    if (mode === 'gesture' && remaining === 0) {
      const elapsed = performance.now() - gestureStartT;
      mode = 'idle';
      if (tapFingerCount === 2 && elapsed < TAP_MAX_MS && gestureMaxMove < TAP_MAX_MOVE_PX) {
        handlers.onTwoFingerTap?.(e);
      } else if (tapFingerCount >= 3 && elapsed < TAP_MAX_MS && gestureMaxMove < TAP_MAX_MOVE_PX) {
        handlers.onThreeFingerTap?.(e);
      }
      tapFingerCount = 0;
      e.preventDefault();
      return;
    }

    if (mode === 'gesture' && remaining >= 1) {
      e.preventDefault();
      return;
    }

    if (remaining === 0) mode = 'idle';
  }

  function onPointerCancel(e) {
    pointers.delete(e.pointerId);
    releaseCapture(e.pointerId);
    clearStrokeGrace();
    clearLongPress();
    if (mode === 'stroke' && e.pointerId === strokePointerId) {
      mode = 'idle';
      strokePointerId = null;
      handlers.onStrokeCancel?.(e);
    }
    if (pointerCount() === 0) mode = 'idle';
  }

  dom.style.touchAction = 'none';

  dom.addEventListener('pointerdown', onPointerDown, { passive: false });
  dom.addEventListener('pointermove', onPointerMove, { passive: false });
  dom.addEventListener('pointerup', onPointerUp, { passive: false });
  dom.addEventListener('pointercancel', onPointerCancel, { passive: false });

  return () => {
    clearStrokeGrace();
    clearLongPress();
    dom.removeEventListener('pointerdown', onPointerDown);
    dom.removeEventListener('pointermove', onPointerMove);
    dom.removeEventListener('pointerup', onPointerUp);
    dom.removeEventListener('pointercancel', onPointerCancel);
  };
}
