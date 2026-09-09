/**
 * FlipDAW — undo/redo history (ADR-006: snapshots of metadata, never audio buffers).
 * Opaque payload, applied by the project store via setApplier — keeps this store
 * dependency-free (no circular import).
 */

import { create } from 'zustand';

/** Opaque editable-state snapshot (project-level metadata only). */
export type HistoryEntry = unknown;

const LIMIT = 50;

export interface HistoryStore {
  canUndo: boolean;
  canRedo: boolean;
  setApplier(fn: (e: HistoryEntry) => void): void;
  push(entry: HistoryEntry): void;
  undo(): void;
  redo(): void;
  clear(): void;
}

export const useHistory = create<HistoryStore>((set) => {
  let applier: ((e: HistoryEntry) => void) | null = null;
  const stack: HistoryEntry[] = [];
  let index = -1;

  function flags(): Pick<HistoryStore, 'canUndo' | 'canRedo'> {
    return { canUndo: index > 0, canRedo: index < stack.length - 1 };
  }

  return {
    canUndo: false,
    canRedo: false,

    setApplier(fn) { applier = fn; },

    push(entry) {
      stack.splice(index + 1);       // drop redo tail
      stack.push(entry);
      if (stack.length > LIMIT) stack.shift();
      index = stack.length - 1;
      set(flags());
    },

    undo() {
      if (index <= 0 || !applier) return;
      index -= 1;
      applier(stack[index]);
      set(flags());
    },

    redo() {
      if (index >= stack.length - 1 || !applier) return;
      index += 1;
      applier(stack[index]);
      set(flags());
    },

    clear() {
      stack.length = 0;
      index = -1;
      set({ canUndo: false, canRedo: false });
    },
  };
});