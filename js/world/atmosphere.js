/**
 * 立体ビュー用 — 霧・空グラデ・時刻（P1）
 */
import * as THREE from 'three';

const DEFAULT_PALETTE = {
  dawn: { fog: '#b8c8d8', skyTop: '#8aafd0', skyBottom: '#c8d8e4' },
  day: { fog: '#d0dce8', skyTop: '#72b8e8', skyBottom: '#dce8f0' },
  dusk: { fog: '#d8b890', skyTop: '#e88848', skyBottom: '#ecd8b8' },
  night: { fog: '#3a4558', skyTop: '#182030', skyBottom: '#485868' },
};

const PLAN_BG = 0xe9e1d2;

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function lerpHex(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

function lerpKey(keyA, keyB, t) {
  return {
    fog: lerpHex(keyA.fog, keyB.fog, t),
    skyTop: lerpHex(keyA.skyTop, keyB.skyTop, t),
    skyBottom: lerpHex(keyA.skyBottom, keyB.skyBottom, t),
  };
}

/** timeOfDay 0–1 → 朝・昼・夕・夜の4キー間補間 */
export function colorsAtTime(palette, timeOfDay) {
  const p = palette || DEFAULT_PALETTE;
  const keys = [p.dawn, p.day, p.dusk, p.night];
  const t = ((timeOfDay % 1) + 1) % 1;
  const n = keys.length;
  const x = t * n;
  const i = Math.floor(x) % n;
  const f = x - Math.floor(x);
  return lerpKey(keys[i], keys[(i + 1) % n], f);
}

function drawSkyGradient(ctx, w, h, skyTop, skyBottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, skyTop);
  g.addColorStop(1, skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * @param {THREE.Scene} scene
 */
export function initAtmosphere(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;

  return {
    scene,
    canvas,
    ctx,
    tex,
    fog: null,
    planBg: new THREE.Color(PLAN_BG),
  };
}

/**
 * @param {ReturnType<typeof initAtmosphere>} state
 * @param {{ enabled?: boolean, worldSize?: number, altUnits?: number, timeOfDay?: number, palette?: object }} opts
 */
export function updateAtmosphere(state, opts = {}) {
  if (!state?.scene) return;

  const enabled = opts.enabled !== false;
  const worldSize = Math.max(1, opts.worldSize ?? 500);
  const altUnits = Math.max(0, opts.altUnits ?? worldSize * 0.04);
  const timeOfDay = opts.timeOfDay ?? 0.35;
  const palette = opts.palette || DEFAULT_PALETTE;

  if (!enabled) {
    state.scene.fog = null;
    state.scene.background = state.planBg;
    return;
  }

  const colors = colorsAtTime(palette, timeOfDay);
  const near = worldSize * 0.15;
  const farBase = worldSize * 1.1;
  const farMax = worldSize * 2.0;
  const altRatio = Math.min(1, altUnits / (worldSize * 0.45));
  const far = farBase + (farMax - farBase) * altRatio;

  if (!state.fog) {
    state.fog = new THREE.Fog(colors.fog, near, far);
    state.scene.fog = state.fog;
  } else {
    state.fog.color.set(colors.fog);
    state.fog.near = near;
    state.fog.far = far;
  }

  drawSkyGradient(state.ctx, state.canvas.width, state.canvas.height, colors.skyTop, colors.skyBottom);
  state.tex.needsUpdate = true;
  state.scene.background = state.tex;
}

export function timeOfDayLabel(timeOfDay) {
  const t = ((timeOfDay % 1) + 1) % 1;
  if (t < 0.2) return '朝';
  if (t < 0.45) return '昼';
  if (t < 0.7) return '夕';
  return '夜';
}

export { DEFAULT_PALETTE };
