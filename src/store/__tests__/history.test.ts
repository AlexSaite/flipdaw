import { describe, expect, it } from 'vitest';
import { useHistory } from '../history';

describe('history (undo/redo)', () => {
  it('applies snapshots in order on undo/redo', () => {
    const applied: string[] = [];
    const s = useHistory.getState();
    s.setApplier((e) => applied.push(String((e as { v: number }).v)));
    s.clear();
    s.push({ v: 1 });
    s.push({ v: 2 });
    expect(applied).toEqual([]);

    s.undo();
    expect(applied).toEqual(['1']);
    expect(useHistory.getState().canUndo).toBe(false); // index 0 = oldest snapshot
    expect(useHistory.getState().canRedo).toBe(true);

    s.undo();
    expect(applied).toEqual(['1']); // already at the oldest snapshot
    expect(useHistory.getState().canUndo).toBe(false);

    s.redo();
    expect(applied).toEqual(['1', '2']);
    expect(useHistory.getState().canRedo).toBe(false);
  });

  it('truncates the redo tail on new push', () => {
    const applied: string[] = [];
    const s = useHistory.getState();
    s.setApplier((e) => applied.push(String((e as { v: number }).v)));
    s.clear();
    s.push({ v: 1 });
    s.push({ v: 2 });
    s.undo(); // at 1
    s.push({ v: 3 }); // drops the {v:2} tail
    s.redo();
    expect(applied).toEqual(['1']); // redo after a fresh push = no-op
    expect(useHistory.getState().canRedo).toBe(false);
  });

  it('respects the 50-step limit', () => {
    const s = useHistory.getState();
    s.clear();
    s.setApplier(() => {});
    for (let i = 0; i < 70; i++) s.push({ v: i });
    expect(useHistory.getState().canUndo).toBe(true);
    // 49 undo steps max (stack holds 50 snapshots)
    let undone = 0;
    while (useHistory.getState().canUndo) { s.undo(); undone++; }
    expect(undone).toBe(49);
  });

  it('no-op without an applier', () => {
    const s = useHistory.getState();
    s.clear();
    s.setApplier(() => {});
    s.push({ v: 1 });
    s.push({ v: 2 });
    // detach applier
    s.setApplier(null as never);
    expect(() => s.undo()).not.toThrow();
    expect(() => s.redo()).not.toThrow();
  });

  it('clear resets state and flags', () => {
    const s = useHistory.getState();
    s.clear();
    s.setApplier(() => {});
    s.push({ v: 1 });
    s.push({ v: 2 });
    s.clear();
    expect(useHistory.getState().canUndo).toBe(false);
    expect(useHistory.getState().canRedo).toBe(false);
  });
});