import { bridgeBus } from './bus';
import type { LayoutMode } from './bus';

/**
 * Hinge-aware layout switching for 2-in-1 laptops (e.g. Spectre x360).
 * Angle is measured between the two display halves, 0°=closed, 180°=flat,
 * 360°=tablet (display folded back). Thresholds + hysteresis avoid flapping
 * around the boundaries. `deviceorientation` gives a workable tilt signal on
 * tablets; the Tauri `get_lid_angle` command supplies the real hinge value.
 */

export const HINGE_LAPTOP_OPEN = 80;
export const HINGE_FLAT = 180;
export const HINGE_TENT_MIN = 195;
export const HINGE_TABLET_MIN = 300;
export const HINGE_HYSTERESIS = 12;

/** Map a raw hinge angle to a layout mode. Below the laptop threshold keeps the last mode. */
export function angleToMode(angleDeg: number): LayoutMode {
  if (angleDeg >= HINGE_TABLET_MIN) return 'mixer';
  if (angleDeg >= HINGE_TENT_MIN) return 'tent';
  return 'laptop';
}

/** Apply hysteresis to a fresh angle based on the previous mode. */
export function angleToModeHysteresis(angleDeg: number, previous: LayoutMode): LayoutMode {
  const raw = angleToMode(angleDeg);
  if (raw === previous) return raw;
  const low = angleDeg < HINGE_TENT_MIN + HINGE_HYSTERESIS;
  const below = angleDeg < HINGE_TABLET_MIN + HINGE_HYSTERESIS;
  if (previous === 'tent' && low) return 'tent';
  if (previous === 'mixer' && below) return 'mixer';
  return raw;
}

export type HingeProvider = (cb: (angle: number) => void) => () => void;

function deviceOrientationProvider(cb: (angle: number) => void): () => void {
  const BASE = 90; // laptop rest tilt
  const on = (e: DeviceOrientationEvent): void => {
    const beta = e.beta ?? null;
    if (beta === null) return;
    cb(beta >= 0 ? beta : BASE);
  };
  window.addEventListener('deviceorientation', on);
  return () => window.removeEventListener('deviceorientation', on);
}

/**
 * Polls a hinge provider and emits `bridgeBus` 'hinge' events on change.
 * `angleToMode` result is available for UI subscribers via the bus.
 */
export class HingeSensor {
  private unsubscribe: (() => void) | null = null;
  private lastEmitted: number | null = null;
  private readonly provider: HingeProvider;
  private readonly emit: (angle: number) => void;
  private readonly minDelta: number;

  constructor(
    provider: HingeProvider = deviceOrientationProvider,
    emit: (angle: number) => void = (a) =>
      bridgeBus.emit({ kind: 'hinge', angle: a }),
    minDelta = HINGE_HYSTERESIS * 2,
  ) {
    this.provider = provider;
    this.emit = emit;
    this.minDelta = minDelta;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.provider((angle) => this.report(angle));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Simulate a concrete angle (used by the settings panel + tests). */
  simulate(angle: number): void {
    this.report(angle);
  }

  private report(angle: number): void {
    if (this.lastEmitted !== null && Math.abs(angle - this.lastEmitted) < this.minDelta) return;
    this.lastEmitted = angle;
    this.emit(angle);
  }
}

export const hingeModeOf = angleToModeHysteresis;