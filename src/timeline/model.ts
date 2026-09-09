/**
 * FlipDAW — arrangement model (M5).
 * Linear clip timeline + automation lanes, both in beat-time so the
 * transport stays the single source of musical time (no wall-clock).
 *
 *   ArrItem  = a clip placed at startBeats for lengthBeats beats
 *   AutoLane = automation (gain/pan/filter) keyframed in beats
 */

/** Automation keyframe. Interpolation between points is linear. */
export interface AutoPoint {
  tBeats: number;
  value: number; // normalized 0..1
}

/** One automation strip for a (track,param) pair. */
export interface AutoLane {
  id: string;
  trackId: string;
  param: 'gain' | 'pan' | 'filter';
  points: AutoPoint[];
}

/** A placed clip on the timeline. `sourceId` points at project media. */
export interface ArrItem {
  id: string;
  trackId: string;
  sourceId: string;
  /** Start position, in beats from transport zero. */
  startBeats: number;
  /** Rhythmic length, beats. Also the tempo-follow lock target. */
  lengthBeats: number;
}

/** Beat-above-which a position counts as "next" (avoids fp jitter). */
export const EPS_BEAT = 1e-6;

/** Linear interpolation between two points. Returns NaN when empty. */
export function evaluateLane(lane: AutoLane, atBeats: number): number {
  const pts = lane.points;
  if (pts.length === 0) return NaN;
  if (pts.length === 1) return pts[0].value;
  if (atBeats <= pts[0].tBeats) return pts[0].value;
  const last = pts[pts.length - 1];
  if (atBeats >= last.tBeats) return last.value;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (atBeats <= b.tBeats) {
      const span = b.tBeats - a.tBeats;
      if (span <= 0) return b.value;
      const f = (atBeats - a.tBeats) / span;
      return a.value + (b.value - a.value) * f;
    }
  }
  return last.value;
}

/** Set a keyframe, merging with an existing one at the same beat. */
export function upsertPoint(lane: AutoLane, tBeats: number, value: number): void {
  const idx = lane.points.findIndex((p) => Math.abs(p.tBeats - tBeats) < EPS_BEAT);
  if (idx >= 0) lane.points[idx] = { tBeats, value };
  else {
    lane.points.push({ tBeats, value });
    lane.points.sort((a, b) => a.tBeats - b.tBeats);
  }
}

/** Remove the keyframe closest to tBeats. Returns true when removed. */
export function removePoint(lane: AutoLane, tBeats: number): boolean {
  const before = lane.points.length;
  lane.points = lane.points.filter((p) => Math.abs(p.tBeats - tBeats) >= EPS_BEAT);
  return lane.points.length !== before;
}

let itemSeq = 0;

export class Arrangement {
  private items = new Map<string, ArrItem>();
  private lanes = new Map<string, AutoLane>();

  /** Clips sorted by start position (reading order for the timeline UI). */
  get clips(): ArrItem[] {
    return [...this.items.values()].sort((a, b) => a.startBeats - b.startBeats);
  }

  get lengthBeats(): number {
    let end = 0;
    for (const it of this.items.values()) {
      end = Math.max(end, it.startBeats + it.lengthBeats);
    }
    return end;
  }

  addItem(partial: Omit<ArrItem, 'id'>, id?: string): ArrItem {
    const item: ArrItem = { ...partial, id: id ?? `arr-${++itemSeq}` };
    this.items.set(item.id, item);
    return item;
  }

  removeItem(id: string): boolean {
    return this.items.delete(id);
  }

  /** Jazz-clone semantics: remove a clip and optionally re-add a modified one. */
  moveItem(id: string, startBeats: number, lengthBeats: number): void {
    const it = this.items.get(id);
    if (it) { it.startBeats = startBeats; it.lengthBeats = lengthBeats; }
  }

  clipsOnTrack(trackId: string): ArrItem[] {
    return this.clips.filter((it) => it.trackId === trackId);
  }

  /** Split a clip at beat — returns the new (second) half. */
  splitItem(id: string, atBeats: number): ArrItem | null {
    const it = this.items.get(id);
    if (!it || atBeats <= it.startBeats + EPS_BEAT || atBeats >= it.startBeats + it.lengthBeats - EPS_BEAT) {
      return null;
    }
    const len1 = atBeats - it.startBeats;
    const len2 = it.startBeats + it.lengthBeats - atBeats;
    it.lengthBeats = len1;
    return this.addItem({ trackId: it.trackId, sourceId: it.sourceId, startBeats: atBeats, lengthBeats: len2 });
  }

  /** Accumulate a lane (get-or-create). */
  lane(trackId: string, param: AutoLane['param']): AutoLane {
    const id = `${trackId}:${param}`;
    let l = this.lanes.get(id);
    if (!l) { l = { id, trackId, param, points: [] }; this.lanes.set(id, l); }
    return l;
  }

  getLanes(): AutoLane[] {
    return [...this.lanes.values()];
  }

  /** Value of a lane at beat time (NaN when no keyframes). */
  valueAt(trackId: string, param: AutoLane['param'], atBeats: number): number {
    const l = this.lanes.get(`${trackId}:${param}`);
    return l ? evaluateLane(l, atBeats) : NaN;
  }

  serialize() {
    return {
      items: this.clips,
      lanes: this.getLanes().map((l) => ({ trackId: l.trackId, param: l.param, points: l.points })),
    };
  }
}