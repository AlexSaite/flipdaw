import { describe, expect, it } from 'vitest';
import {
  angleToMode, angleToModeHysteresis, HingeSensor,
  HINGE_TENT_MIN, HINGE_TABLET_MIN, HINGE_HYSTERESIS,
} from '../hinge';

describe('hinge (angle → layout)', () => {
  it('maps laptop/tent/mixer bands', () => {
    expect(angleToMode(45)).toBe('laptop');
    expect(angleToMode(130)).toBe('laptop');
    expect(angleToMode(HINGE_TENT_MIN)).toBe('tent');
    expect(angleToMode(250)).toBe('tent');
    expect(angleToMode(HINGE_TABLET_MIN)).toBe('mixer');
    expect(angleToMode(359)).toBe('mixer');
    expect(angleToMode(0)).toBe('laptop');
  });

  it('hysteresis holds the previous mode near boundaries', () => {
    const nearTent = HINGE_TENT_MIN - HINGE_HYSTERESIS + 1;
    expect(angleToModeHysteresis(nearTent, 'tent')).toBe('tent');
    expect(angleToModeHysteresis(nearTent, 'laptop')).toBe('laptop');

    const nearTablet = HINGE_TABLET_MIN - HINGE_HYSTERESIS + 1;
    expect(angleToModeHysteresis(nearTablet, 'mixer')).toBe('mixer');
    expect(angleToModeHysteresis(nearTablet, 'tent')).toBe('tent');
  });

  it('switches decisively past the hysteresis window', () => {
    expect(angleToModeHysteresis(HINGE_TENT_MIN + 20, 'laptop')).toBe('tent');
    expect(angleToModeHysteresis(HINGE_TABLET_MIN + 15, 'laptop')).toBe('mixer');
  });

  it('emits only on meaningful angle change', () => {
    const seen: number[] = [];
    const sensor = new HingeSensor(
      () => () => {},
      (a) => seen.push(a),
    );
    sensor.simulate(45);
    sensor.simulate(50);   // < minDelta → suppressed
    sensor.simulate(100);  // jump → emitted
    sensor.simulate(103);  // suppressed again
    sensor.simulate(220);  // tent → emitted
    expect(seen).toEqual([45, 100, 220]);
  });
});