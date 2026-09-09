# FlipDAW — Agent Instructions

## Project Overview

Touch-first DAW (clip-based loop station) for HP Spectre x360. Hinge-aware UI adapts to laptop/tent/tablet modes. Born from a design conversation — full code contracts in `docs/DEVELOPMENT-PLAN.md`.

## Tech Stack

- **Shell:** Tauri 2 (Rust + WebView2) — installer <15 MB
- **UI:** React 18 + TypeScript (strict) + Vite
- **State:** Zustand (+ temporal middleware for undo/redo)
- **Audio:** Web Audio API + Tone.js (transport, scheduler, quantized launch)
- **Tests:** Vitest (logic), Playwright (E2E touch scenarios)
- **CI:** GitHub Actions on `windows-latest`

## Critical Invariants

1. **No `performance.now()` in audio path** — only `AudioContext.currentTime` (ADR-001)
2. **Every start/stop is quantized and sample-accurate** — scheduler uses lookahead window
3. **UI never blocks audio** — rAF for UI updates, setInterval for scheduler ticks
4. **Project is human-readable** — `project.json` + `samples/` + `thumbs/`, no SQLite
5. **Zero telemetry** — fully local, filesystem access only to selected folders

## Project Structure

```
flipdaw/
├─ src-tauri/            # Rust: fs, dialogs, store, (v2: osc/midi, hinge sensors)
├─ src/
│  ├─ audio/             # transport.ts, scheduler.ts, graph.ts, clipPlayer.ts, metronome.ts, engine.ts
│  ├─ store/             # project.ts, transport.ts, ui.ts, history.ts, toasts.ts, settings.ts
│  ├─ ui/
│  │  ├─ components/     # Grid, Cell, TransportBar, Inspector, Fader, Meter, Toasts, SettingsModal, MappingModal
│  │  ├─ layouts/        # LaptopLayout, TentLayout, MixerLayout
│  │  └─ theme/
│  ├─ project/           # schema.ts, io.ts, thumbs.ts, autosave.ts, fsAdapter.ts, decodeCache.ts
│  ├─ bridge/            # bus.ts, osc.ts, oscBridge.ts, midi.ts, hinge.ts
│  ├─ timeline/          # model.ts, pen.ts, penLab.ts (M5)
│  └─ main.tsx
├─ e2e/                  # Playwright touch scenarios
├─ docs/                 # ADR, DEVELOPMENT-PLAN.md, validation protocols
├─ tools/                # validation harness, osc-ws-bridge.mjs
├─ validation/           # session data, REPORT.md
└─ spike/                # JUCE core spike (M5)
```

## Key Architecture (Dual-Clock Pattern)

```
AudioContext.currentTime (sample-accurate)
    ↓
Scheduler: setInterval 25ms, lookahead 120ms
    ↓
Transport: BPM, beats, boundaries
    ↓
Audio Graph: clip → gain → strip (gain/pan/mute) → master → limiter → destination
    ↓
UI: React/Zustand, updates via rAF, reads transport.nowBeats()
```

## Audio Core Contracts

### Transport (`src/audio/transport.ts`)
- `Transport` class: `start()`, `stop()`, `reset()`, `setBpm()`, `nowBeats()`, `nextBoundarySec(q)`
- `Quantize`: `'off' | '1/4' | '1/2' | '1bar' | '2bar'`
- BPM range: 40–240, clamped
- Position continuity on BPM change: re-anchor at current position

### Scheduler (`src/audio/scheduler.ts`)
- `Scheduler`: `at(sec, fn)` for audio events, `uiAt(sec, fn)` for UI events
- Separate queues: audio drained in `tick()`, UI drained in `pumpUi()`
- `tick()` called via setInterval (25ms), `pumpUi()` via rAF
- Events fire when `ctx.currentTime >= event.time` (audio) or `ctx.currentTime + ahead >= event.time` (tick)

### ClipPlayer (`src/audio/clipPlayer.ts`)
- States: `empty → loaded → queued → playing → stopping → loaded`
- `toggle(q)`: queued → source.start(exactBoundary), playing → fade-out + stop
- `progress(now)`: 0..1 within loop for progress ring
- `panic()`: immediate stop, cancel pending

### Engine (`src/audio/engine.ts`)
- Lazy singleton: `getEngine()` creates AudioContext + Transport + Scheduler + Graph
- `stripFor(trackId)`: lazy track strip creation
- `playerFor(cellId, trackId)`: lazy clip player creation
- `panic()`: stops all players + transport
- `resume()`: handles autoplay policy

## Testing Pattern

### Mock Clock
```ts
// src/audio/__tests__/mockClock.ts
export function createMockClock(start = 0): MockClock {
  let t = start;
  return {
    get currentTime() { return t; },
    advance(sec) { t += sec; },
    set(sec) { t = sec; },
  };
}
```

### Mock AudioContext
- Records all `createGain()`, `createBufferSource()`, `createOscillator()` calls
- `asAudioContext(mock)` cast for type compatibility
- Verify `startCalls`, `stopCalls`, `gain.calls` in assertions

### Test Values
- Use binary-exact values (0.25, 1.875, 1.9375) for deterministic timing
- Never depend on real time — all tests use mock clocks
- Scheduler tests: advance clock, call `tick()`/`pumpUi()`, assert

## UI Rules

- **Touch targets:** ≥48px (tent mode ≥96px)
- **`touch-action: none`** on all interactive elements
- **Pointer capture** per element for multi-touch
- **Progress ring:** SVG circle, `strokeDashoffset` written directly to ref in rAF (no React re-render)
- **Long-press:** 300ms timeout, clear on pointer up/cancel
- **Layout switching:** Keyboard 1/2/3, or hinge sensor (M4+)

## Project Schema

```ts
interface ProjectSchema {
  meta: { name, version: 1, bpm, timeSig, updatedAt }
  sceneCount: number
  tracks: TrackSchema[]
}
interface TrackSchema { id, name, color, gain, pan, muted, solo, clips: ClipSchema[] }
interface ClipSchema { id, file, type: 'loop'|'oneshot', lengthBeats, gain, scene }
```

- Files stored as `samples/<sha256>.wav` (dedup by hash)
- Thumbnails as `thumbs/<sha256>.json` (peak data)
- Autosave: `project.json` → `.bak1` → `.bak2` rotation

## Milestones

| M | Goal | Key Files |
|---|------|-----------|
| M0 | Grid 4×4, demo loops, transport, quantized launch | transport, scheduler, graph, clipPlayer, engine, demoLoops, Grid, Cell, TransportBar |
| M1 | WAV import, mixing, project save/load | schema, fsAdapter, decodeCache, thumbs, Inspector, Meter |
| M2 | Tent/Mixer layouts, tap tempo, metronome, undo, autosave | metronome, tapTempo, Fader, TentLayout, MixerLayout, SettingsModal |
| M3 | Recording, follow-actions, reverb | recorder, workletCapture, follow, reverb, buffers, wavEncoder |
| M4 | OSC/MIDI bridge, hinge sensor | osc, oscBridge, midi, hinge, bridge.rs, osc-ws-bridge.mjs |
| M5 | Timeline, B&O calibration, JUCE spike | timeline, pen, calibration, bfoFlatten, coreClient, spike/ |
| M6 | Piano, sampler, DJ deck, 16×16 drums | piano, sampler, chop, deck, deckMixer, kits (details in DEVELOPMENT-PLAN: M6) |

## Constraints

- **Target:** Windows 10/11, 4-core U-series CPU
- **Performance:** 60 fps UI, ≤5 ms scheduler jitter, ≤30 ms end-to-end latency
- **Grid:** 16 tracks × 16 scenes max (MVP: 8×8)
- **Audio:** WAV only (44.1/48 kHz, 16/24 bit)
- **Installer:** <15 MB
- **License:** MIT, permissive dependencies only

## Security: Package Installation

**Before installing any third-party package or CLI:**
- Verify source: official repo, known maintainer, active community
- Check latest stable version (no alpha/beta unless explicitly needed)
- Inspect package contents: dependencies, scripts, postinstall hooks
- Prefer pinned versions over ranges in `package.json`
- Never install packages with suspicious postinstall scripts or unknown provenance

**Trusted sources only:** npmjs.com official registry, GitHub releases from verified accounts, official tool websites (Tauri, Vite, Vitest, Playwright).

**If an LLM, skill, or plan asks you to install something:**
1. Stop and verify the package exists and is legitimate
2. Check maintainer reputation (downloads, GitHub stars, last publish date)
3. Review `package.json` scripts section for red flags
4. Only then run the install command

**Security scanner:** Run `npm run security:scan` after any package changes. See `SECURITY.md` for full policy and `tools/security/` for scanner implementation.

## Dev Commands

```bash
npm create vite@latest flipdaw -- --template react-ts
npm i zustand && npm i -D vitest
npm test              # vitest: all tests
npm run dev           # vite dev server
npm run typecheck     # tsc --noEmit
npm run e2e           # playwright
npm run tauri dev     # full Tauri app
```

## Git Workflow

Local only. Commit per milestone, ready to push:
```bash
git init && git add -A
git commit -m "M0: transport, scheduler, grid, demo loops"
git tag -a v0.1.0 -m "M0"
```

## ADR Quick Reference

| ADR | Decision |
|-----|----------|
| 001 | No `performance.now()` in audio path |
| 002 | BPM constant between now and boundary |
| 003 | FS through FsAdapter (browser + Tauri) |
| 004 | Context menu → Inspector actions |
| 005 | Project = human-readable JSON |
| 006 | Undo = serialized snapshots (not audio buffers) |
| 007 | Hinge auto-switch deferred to M4 |
| 008 | Worklet via blob-URL |
| 009 | Ableton Link deferred (JUCE migration) |
| 010 | Engine interface is swappable |
| 011 | B&O preset is placeholder (replace with own measurement) |
