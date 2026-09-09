import { describe, expect, it } from 'vitest';
import {
  Arrangement,
  evaluateLane,
  removePoint,
  upsertPoint,
  type AutoLane,
} from '../model';

describe('Arrangement model', () => {
  it('sorts clips by start and computes total length', () => {
    const arr = new Arrangement();
    arr.addItem({ trackId: 'a', sourceId: 'x', startBeats: 8, lengthBeats: 4 });
    arr.addItem({ trackId: 'b', sourceId: 'y', startBeats: 0, lengthBeats: 2 });
    expect(arr.clips.map((c) => c.startBeats)).toEqual([0, 8]);
    expect(arr.lengthBeats).toBe(12);
    expect(arr.clipsOnTrack('a')).toHaveLength(1);
  });

  it('splits a clip into two halves', () => {
    const arr = new Arrangement();
    const a = arr.addItem({ trackId: 't', sourceId: 'x', startBeats: 0, lengthBeats: 8 });
    const b = arr.splitItem(a.id, 5);
    expect(b).not.toBeNull();
    expect(a.lengthBeats).toBe(5);
    expect(b!.startBeats).toBe(5);
    expect(b!.lengthBeats).toBe(3);
    expect(arr.splitItem(a.id, 0)).toBeNull();
    expect(arr.splitItem(a.id, 8)).toBeNull();
  });

  it('evaluates automation linearly and clamps at the edges', () => {
    const lane: AutoLane = { id: 'g', trackId: 't', param: 'gain', points: [
      { tBeats: 0, value: 0 },
      { tBeats: 4, value: 1 },
    ] };
    expect(evaluateLane(lane, -10)).toBe(0);
    expect(evaluateLane(lane, 2)).toBeCloseTo(0.5, 9);
    expect(evaluateLane(lane, 10)).toBe(1);
    expect(evaluateLane({ ...lane, points: [] }, 2)).toBeNaN();
  });

  it('upserts and removes keyframes', () => {
    const arr = new Arrangement();
    const lane = arr.lane('t', 'gain');
    upsertPoint(lane, 2, 0.5);
    upsertPoint(lane, 2, 0.9); // merge at same beat
    upsertPoint(lane, 6, 0.25);
    expect(lane.points).toHaveLength(2);
    expect(arr.valueAt('t', 'gain', 2)).toBe(0.9);
    expect(removePoint(lane, 2)).toBe(true);
    expect(arr.valueAt('t', 'gain', 2)).toBe(0.25);
    expect(removePoint(lane, 99)).toBe(false);
  });

  it('serializes and lane get-or-create is idempotent', () => {
    const arr = new Arrangement();
    const l1 = arr.lane('d', 'filter');
    const l2 = arr.lane('d', 'filter');
    expect(l1).toBe(l2);
    const snap = arr.serialize();
    expect(snap.lanes).toEqual([{ trackId: 'd', param: 'filter', points: [] }]);
  });
});