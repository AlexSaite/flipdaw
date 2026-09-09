# FlipDAW — Comprehensive Development Plan

## Executive Summary

FlipDAW is a touch-first DAW (clip-based loop station) designed for HP Spectre x360 13 convertible laptops. The project evolves from a simple clip grid (M0) to a full-featured production environment with recording, OSC/MIDI bridges, and potential JUCE migration (M5).

**Key Innovation:** Hinge-aware UI that adapts to laptop/tent/tablet modes, leveraging the x360's 360° hinge and Windows Sensors API.

**Target:** Windows 10/11, 4-core U-series CPU, 60 fps UI, ≤30 ms end-to-end latency.

---

## Architecture Overview

### Core Principle: Dual-Clock Pattern

```
Audio Clock: AudioContext.currentTime (sample-accurate)
    ↓
Scheduler: setInterval 25ms, lookahead 120ms
    ↓
Transport: BPM, time signature, position in beats
    ↓
Audio Graph: clip source → clip gain → track strip → master → limiter → destination
                                ↓
UI: React/Zustand, updates via rAF, never blocks audio
```

**Invariant:** `performance.now()` and `Date.now()` are NEVER used in the audio path. All timing derives from `AudioContext.currentTime`.

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Shell | Tauri 2 (Rust + WebView2) | Installer <15 MB, native FS/dialogs, future OSC/MIDI/hinge |
| UI | React 18 + TypeScript (strict) + Vite | Component grid, fast HMR |
| State | Zustand (+ temporal middleware) | Minimal boilerplate, slices by domain |
| Audio | Web Audio API + Tone.js | Transport, scheduler, players out of box |
| Testing | Vitest (logic), Playwright (E2E touch) | Timing tests with mock clocks |
| Packaging | .msi via Tauri + portable mode | Distribution for Windows |

### Project Structure

```
flipdaw/
├─ src-tauri/            # Rust: fs, dialogs, store, (v2: osc/midi, hinge sensors)
├─ src/
│  ├─ audio/             # transport.ts, scheduler.ts, graph.ts, clipPlayer.ts, metronome.ts
│  ├─ store/             # project.ts, transport.ts, ui.ts, history.ts, toasts.ts, settings.ts
│  ├─ ui/
│  │  ├─ components/     # Grid, Cell, TransportBar, MixerStrip, Inspector, ModeSwitch, Fader, Meter, Toasts, SettingsModal, MappingModal
│  │  ├─ layouts/        # LaptopLayout, TentLayout, MixerLayout
│  │  └─ theme/
│  ├─ project/           # schema.ts, io.ts, thumbs.ts, autosave.ts, fsAdapter.ts, decodeCache.ts
│  ├─ bridge/            # bus.ts, osc.ts, oscBridge.ts, midi.ts, hinge.ts
│  ├─ timeline/          # model.ts, pen.ts, penLab.ts
│  └─ main.tsx
├─ e2e/                  # Playwright touch scenarios
├─ docs/                 # ADR, specs, validation protocols
├─ tools/                # validation harness, gif recorder, osc-ws-bridge
├─ validation/           # session data, REPORT.md
└─ spike/                # JUCE core spike (M5)
```

---

## Milestone Breakdown

### M0: Grid + Transport + Quantized Launch (Foundation)

**Goal:** 4×4 grid, demo loops, transport, quantized launch/stop.

#### Files to Create

| File | Purpose | Key Contracts |
|------|---------|---------------|
| `src/audio/transport.ts` | Musical time source | `Transport` class: `start()`, `stop()`, `setBpm()`, `nowBeats()`, `nextBoundarySec(q)` |
| `src/audio/scheduler.ts` | Lookahead scheduler | `Scheduler` class: `at(sec, fn)`, `uiAt(sec, fn)`, `tick()`, `pumpUi()` |
| `src/audio/graph.ts` | Audio buses | `createAudioGraph(ctx)`: track strips, master bus, limiter, meters |
| `src/audio/clipPlayer.ts` | Clip state machine | `ClipPlayer`: `attach(buf)`, `toggle(q)`, `panic()`, `progress(now)` |
| `src/audio/engine.ts` | Composition root | `getEngine()`: lazy singleton, ctx + transport + scheduler + graph + players |
| `src/audio/demoLoops.ts` | Demo pack synthesis | `renderDemoLoops()`: 4 tracks × 4 scenes, synthesized via OfflineAudioContext |
| `src/store/project.ts` | Grid store | `useGrid`: tracks, scenes, cells, players, `tap(id)`, `init()` |
| `src/store/transport.ts` | Transport store | `useTransport`: playing, bpm, `togglePlay()`, `setBpm()` |
| `src/ui/components/Cell.tsx` | Touch cell | Pointer capture, long-press, progress ring via rAF |
| `src/ui/components/Grid.tsx` | Grid layout | Renders tracks × scenes grid |
| `src/ui/components/TransportBar.tsx` | Transport UI | Play/stop, BPM slider, quantize selector |
| `src/ui/layouts/LaptopLayout.tsx` | Laptop layout | Transport + grid |
| `src/App.tsx` | App root | Subscribes transport, inits grid, handles autoplay policy |
| `src/main.tsx` | Entry point | React root render |
| `src/styles.css` | Dark theme | CSS variables, grid styles, cell states, animations |

#### Test Files

| File | Tests |
|------|-------|
| `src/audio/__tests__/mockClock.ts` | Mock clock with manual advance |
| `src/audio/__tests__/transport.test.ts` | Position calculation, stop/start continuity, BPM changes, boundary calculation |
| `src/audio/__tests__/scheduler.test.ts` | Lookahead window, event ordering, cancellation, UI queue separation |
| `src/audio/__tests__/quantized-launch.test.ts` | Integration: transport + scheduler quantized start |

#### Acceptance Criteria

- [ ] Tap → start exactly on beat boundary (test-verified)
- [ ] Repeated tap → stop without click (fade-out)
- [ ] Queued cell pulses, playing cell shows progress ring
- [ ] 16 clips (4×4) simultaneously without dropouts
- [ ] BPM slider changes tempo without desynchronizing playing loops
- [ ] Works with mouse and 10-point touch

---

### M1: WAV Import, Mixing, Projects

**Goal:** Import WAV, track mixing, project save/load, thumbnails.

#### Files to Create

| File | Purpose | Key Contracts |
|------|---------|---------------|
| `src/project/schema.ts` | Project format + validation | `ProjectSchema`, `validateProject()`, `SCHEMA_VERSION = 1` |
| `src/project/fsAdapter.ts` | FS abstraction | `DirHandle`: readText/writeText/readBinary/writeBinary, `FsAdapter`: pickDirectory, recent |
| `src/project/decodeCache.ts` | Decode dedup | `DecodeCache`: sha256 hash → AudioBuffer, LRU(32) |
| `src/project/thumbs.ts` | Waveform thumbnails | `computePeaks()`, `peaksToJson()`, `peaksFromJson()`, `drawPeaks()` |
| `src/project/io.ts` | Serialization | `serializeProject()`, `parseProject()` |
| `src/store/project.ts` v2 | Enhanced grid store | Import, mixing, solo, save/load, dirty flag |
| `src/store/toasts.ts` | Toast notifications | `useToasts`: push with auto-dismiss |
| `src/ui/components/Inspector.tsx` | Right panel | Gain/Pan/Mute/Solo, clip length, import button |
| `src/ui/components/Meter.tsx` | Peak meters | `PeakMeter`: rAF-driven, stereo support |
| `src/ui/components/WaveThumb.tsx` | Waveform display | Canvas-based peak rendering |

#### Test Files

| File | Tests |
|------|-------|
| `src/project/__tests__/memoryDir.ts` | In-memory FS for testing |
| `src/project/__tests__/schema.test.ts` | Validation: good/bad projects |
| `src/project/__tests__/thumbs.test.ts` | Peak computation, JSON round-trip |
| `src/project/__tests__/decodeCache.test.ts` | LRU eviction, decode errors |
| `src/project/__tests__/io.test.ts` | Serialize/parse round-trip |

#### Acceptance Criteria

- [ ] Import 24-bit/48kHz WAV plays correctly
- [ ] Double import of same file = one copy in samples/
- [ ] Save → restart → open = identical state (gains, mutes)
- [ ] Inspector matches mockup #1 layout
- [ ] Bad WAV → toast + skip, no crash

---

### M2: Layouts, Tap Tempo, Metronome, Undo, Autosave

**Goal:** Tent/Mixer layouts, tap tempo, metronome, undo/redo, autosave.

#### Files to Create

| File | Purpose | Key Contracts |
|------|---------|---------------|
| `src/audio/metronome.ts` | Click track | `Metronome`: `setEnabled()`, `setGain()`, accent on beat 1 |
| `src/audio/tapTempo.ts` | Tap tempo | `TapTempo`: `tap(nowMs)`, median of 4 intervals, reset on pause >2s |
| `src/project/autosave.ts` | Backup rotation | `rotateAndSave()`, `newestBackup()`: 3 generations |
| `src/store/settings.ts` | Persisted settings | `useSettings`: theme, latency, metroGain, autosave, density |
| `src/store/ui.ts` | Layout state | `useUi`: mode (laptop/tent/mixer), settingsOpen |
| `src/ui/components/Fader.tsx` | Multi-touch fader | Pointer capture per finger, 10 independent faders |
| `src/ui/layouts/TentLayout.tsx` | Tent layout | 3×3 big pads ≥96px, kiosk fullscreen |
| `src/ui/layouts/MixerLayout.tsx` | Mixer layout | Horizontal faders, M/S buttons, meters |
| `src/ui/components/SettingsModal.tsx` | Settings UI | Theme, latency, metro gain, density, autosave |
| `src/ui/components/MappingModal.tsx` | OSC/MIDI mapping | Profile selector, template editor, MIDI learn |

#### Test Files

| File | Tests |
|------|-------|
| `src/audio/__tests__/tapTempo.test.ts` | Median calculation, reset, clamping |
| `src/audio/__tests__/metronome.test.ts` | Click timing, accent, gain |
| `src/store/__tests__/history.test.ts` | Undo/redo, 50-step limit |
| `src/project/__tests__/autosave.test.ts` | 3-generation rotation |

#### Acceptance Criteria

- [ ] Tent mode: 5-minute jam with both hands, no misses
- [ ] 10 simultaneous faders don't conflict
- [ ] Kill process → restart → offer to restore
- [ ] Undo reverts cells and mixer
- [ ] Metronome clicks exactly on beat boundaries

---

### M3: Recording, Follow-Actions, Reverb

**Goal:** Loop recording with count-in, follow-actions, reverb send.

#### Files to Create

| File | Purpose | Key Contracts |
|------|---------|---------------|
| `src/audio/buffers.ts` | Buffer merging | `mergeBuffers()`, `snapToBars()` |
| `src/audio/wavEncoder.ts` | PCM16 WAV encoder | `encodeWav(buf)` → ArrayBuffer |
| `src/audio/reverb.ts` | Send reverb | `createReverbBus()`: ConvolverNode with synthesized impulse |
| `src/audio/recorder.ts` | Loop recorder | `Recorder`: `arm()`, `requestStop()`, count-in + quantized start/stop |
| `src/audio/workletCapture.ts` | Audio worklet capture | `WorkletCapture`: blob-URL worklet, mic input |
| `src/audio/follow.ts` | Scene follow-actions | `FollowRunner`: next/stop/N bars, scheduled on beat boundaries |

#### Test Files

| File | Tests |
|------|-------|
| `src/audio/__tests__/recorder.test.ts` | Count-in → capture → quantized stop → onBuffer |
| `src/audio/__tests__/follow.test.ts` | Next/stop/N bars transitions |
| `src/audio/__tests__/buffers.test.ts` | mergeBuffers offset, snapToBars |
| `src/audio/__tests__/wavEncoder.test.ts` | PCM16 header, sample values |

#### Acceptance Criteria

- [ ] Record with count-in, stop on beat boundary
- [ ] Overdab merges correctly
- [ ] Follow-actions trigger scene changes automatically
- [ ] Reverb send adds "space" without muddying mix

---

### M4: OSC/MIDI Bridge, Hinge Sensor

**Goal:** External DAW control, MIDI sync, hinge-aware layout switching.

#### Files to Create

| File | Purpose | Key Contracts |
|------|---------|---------------|
| `src/bridge/bus.ts` | Event bus | `bridgeBus`: unified events for OSC/MIDI |
| `src/bridge/osc.ts` | OSC 1.0 codec | `encodeOscMessage()`, `decodeOscMessage()` |
| `src/bridge/oscBridge.ts` | OSC bridge | Profiles (native/Reaper), template editor, symmetric input |
| `src/bridge/midi.ts` | MIDI layer | Grid notes, CC faders, Clock in/out (24 ppq) |
| `src/bridge/hinge.ts` | Hinge sensor | `angleToMode()`: angle → layout mode with thresholds |
| `src-tauri/src/bridge.rs` | Rust UDP + sensor | `osc_open`, `osc_send`, `get_lid_angle` |
| `tools/osc-ws-bridge.mjs` | Dev bridge | WebSocket ↔ UDP for browser testing |

#### Test Files

| File | Tests |
|------|-------|
| `src/bridge/__tests__/osc.test.ts` | Round-trip codec, padding |
| `src/bridge/__tests__/midi.test.ts` | Grid notes, CC mapping, clock timing |
| `src/bridge/__tests__/hinge.test.ts` | Angle → mode mapping |

#### Acceptance Criteria

- [ ] OSC messages reach Reaper/Ableton
- [ ] MIDI clock drift ≤1ms over 10 minutes
- [ ] Hinge sensor switches layouts reliably
- [ ] Dev bridge works in browser without Tauri

---

### M5: Timeline, B&O Calibration, JUCE Spike

**Goal:** Stylus timeline, speaker calibration, potential JUCE migration.

#### Files to Create

| File | Purpose | Key Contracts |
|------|---------|---------------|
| `src/timeline/model.ts` | Arrangement model | `ArrItem`, `AutoPoint`, `AutoLane`, `Arrangement` |
| `src/audio/arrangement.ts` | Arrangement playback | `ArrangementPlayer`: sample-accurate clip scheduling |
| `src/timeline/pen.ts` | Stylus input | `simplifyRDP()`, `rmsError()` |
| `src/timeline/penLab.ts` | Pen validation | `penVerdict()`: compare pen vs mouse |
| `src/audio/calibration.ts` | EQ calibration | `parseRewTxt()`, `fitEq()`, `applyEq()` |
| `src/audio/bfoFlatten.ts` | B&O preset | Community-measured EQ for Spectre x360 |
| `spike/juce-core/` | JUCE spike | VST3 hosting via IPC (JSON-lines over TCP) |
| `src/audio/coreClient.ts` | JUCE client | `CoreClientEngine`: implements Engine interface over IPC |

#### Test Files

| File | Tests |
|------|-------|
| `src/audio/__tests__/arrangement.test.ts` | Sample-accurate start, length trimming |
| `src/timeline/__tests__/pen.test.ts` | RDP simplification, RMS error |
| `src/audio/__tests__/calibration.test.ts` | EQ fitting, REW parsing |

#### Acceptance Criteria

- [ ] Stylus draws automation curves
- [ ] B&O Flatten EQ compensates measured response
- [ ] JUCE spike: VST3 loads, IPC jitter ≤1ms
- [ ] UI doesn't notice engine swap (ADR-010)

---

### M5.5: Step Sequencer

**Goal:** 16-step drum sequencer on the beat grid, with per-step velocity/
flam/ratchet/probability and pattern-level swing/humanize + pattern chains.
Features distilled from drumhaus / Drum Loop Studio (concepts only).

#### Files to Create

| File | Purpose | Key Contracts |
|------|---------|---------------|
| `src/sequencer/model.ts` | Pattern model | `StepCell`, `SeqPattern`, `MAX_STEPS`, mutating ops |
| `src/sequencer/stepSequencer.ts` | 16th-grid engine | `StepSequencer`, `mulberry32`, `swingDelay`, `Hit`, `StepVoiceBus` |
| `src/sequencer/chain.ts` | Pattern chaining | `ChainRunner`, `ChainStep` |
| `src/audio/stepVoice.ts` | Voice bus | `createStepVoiceBus(ctx, dest)`: synth kick/snare/hat |
| `src/store/sequencer.ts` | Sequencer store | `useSequencer`: patterns, arm, chain |
| `src/ui/components/StepSequencer.tsx` | Pad UI | 48px pads, velocity cycle, playhead (rAF), chain chips |

#### Test Files

| File | Tests |
|------|-------|
| `src/sequencer/__tests__/model.test.ts` | Toggle/velocity cycle, clamping, resize |
| `src/sequencer/__tests__/stepSequencer.test.ts` | Grid schedules, swing, probability, ratchet, flam |
| `src/sequencer/__tests__/chain.test.ts` | Bar switches on the grid, wrap, jumpTo |

#### Acceptance Criteria

- [ ] Step hits fire sample-accurately on the 16th grid
- [ ] Swing shifts odd steps up to 1/3 step; humanize adds seeded jitter
- [ ] Chain switches patterns exactly on bar boundaries
- [ ] Pads ≥48px (touch), playhead updates off the React rendering path

---

## Key Architecture Decisions (ADRs)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | No `performance.now()` in audio path | Sample-accurate timing via `AudioContext.currentTime` |
| ADR-002 | BPM constant between now and boundary | Simplifies MVP, sufficient for launch quantization |
| ADR-003 | FS through FsAdapter abstraction | Browser (File System Access) + Tauri (plugin-fs) |
| ADR-004 | Context menu replaced by Inspector | Simpler, more accessible for touch |
| ADR-005 | Project = human-readable JSON | Git-friendly, debuggable, no SQLite |
| ADR-006 | Undo = serialized snapshots | Audio buffers not undone, only metadata |
| ADR-007 | Hinge auto-switch deferred to M4 | Needs Tauri sensor, manual fallback in M0-M3 |
| ADR-008 | Worklet loaded via blob-URL | No separate chunks in build, works in WebView2 |
| ADR-009 | Ableton Link deferred | Needs native lib, comes with JUCE migration |
| ADR-010 | Engine interface is swappable | UI depends on interface, not implementation |
| ADR-011 | B&O preset is placeholder | Must be replaced with own REW measurement |

---

## Development Order

### Phase 1: Foundation (M0)
1. Scaffold Tauri 2 + React + Vite project
2. Implement `transport.ts` + `scheduler.ts` with tests
3. Implement `graph.ts` + `clipPlayer.ts` with tests
4. Implement `engine.ts` + `demoLoops.ts`
5. Build Grid + Cell + TransportBar UI
6. **M0 Complete** → commit + tag

### Phase 2: Files + Mixing (M1)
1. Implement project schema + validation
2. Build FsAdapter (browser first)
3. Implement decodeCache + thumbs
4. Build Inspector + Meters + WaveThumb
5. Implement save/load + toasts
6. **M1 Complete** → commit + tag

### Phase 3: Layouts + Polish (M2)
1. Implement metronome + tapTempo
2. Build TentLayout + MixerLayout + Fader
3. Implement undo/redo + autosave
4. Build SettingsModal
5. **M2 Complete** → commit + tag

### Phase 4: Recording + Effects (M3)
1. Implement recorder + workletCapture
2. Build follow runner
3. Implement reverb send
4. Add recording UI
5. **M3 Complete** → commit + tag

### Phase 5: Bridges (M4)
1. Implement OSC codec + bridge
2. Build MIDI layer
3. Implement hinge sensor (Tauri)
4. Build dev bridge tool
5. **M4 Complete** → commit + tag

### Phase 6: Advanced (M5)
1. Build timeline + pen input
2. Implement calibration
3. Build JUCE spike
4. Validation sessions
5. **M5 Complete** → commit + tag

### Phase 7: Step Sequencer (M5.5)
1. Write sequencer model: StepCell (velocity/flam/ratchet/probability) + ops
2. Write StepSequencer engine: 16th grid, swing, humanize, seeded PRNG
3. Write ChainRunner: pattern chaining on the bar grid
4. Build seq store + Web Audio voice bus (synthesized kick/snare/hat)
5. Build StepSequencer pads UI + playhead + chain chips
6. Verify: vitest, typecheck, lint, build
7. **M5.5 Complete** → commit + tag

---

## Testing Strategy

### Unit Tests (Vitest)
- **Mock Clock:** `createMockClock()` for deterministic timing
- **Mock AudioContext:** `createMockAudioContext()` with recorded calls
- **Memory Dir:** `createMemoryDir()` for FS operations
- **Coverage target:** ≥80% for audio core

### E2E Tests (Playwright)
- **Touch scenarios:** Tap, multi-touch faders, long-press
- **CDP touch simulation:** `Input.dispatchTouchEvent` for multi-finger
- **Layout switching:** Keyboard shortcuts 1/2/3
- **Undo/redo:** Control+Z/Y

### Validation Protocol (Human)
- **H1:** 5 testers, record loop first take (≥4/5 success)
- **H2:** 20-min jam, scene switches (−70% manual)
- **H3:** Blind A/B reverb (≥60% votes)
- **H4:** OSC template adoption (≥50 downloads)
- **H5:** MIDI clock drift (≤1ms/10min)
- **H6:** Hinge auto-switch (≥95% correct)

---

## Git Workflow

Local repository only. Commit frequently, ready to push when needed.

```bash
git init
git add -A
git commit -m "M0: scaffold, transport, scheduler, graph, clipPlayer, demo loops"
```

Tag milestones locally:
```bash
git tag -a v0.1.0 -m "M0 complete"
git tag -a v0.2.0 -m "M1 complete"
# etc.
```

Push when ready:
```bash
git remote add origin <url>
git push -u origin main --tags
```

CI/CD and release pipelines added only when pushing to GitHub.

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Web Audio latency too high | ADR-010: Engine interface swappable to JUCE |
| B&O calibration inaccurate | Community preset + REW measurement + A/B testing |
| Hinge sensor unreliable | Manual fallback, auto-switch deferred to M4 |
| Touch performance on U-series CPU | Profile early, target 16 clips without dropouts |
| Tauri bundle size >15MB | Monitor dependencies, exclude unused Tauri plugins |

---

## Next Steps (Immediate)

1. **Scaffold project:** `npm create vite@latest flipdaw -- --template react-ts`
2. **Install dependencies:** `npm i zustand && npm i -D vitest`
3. **Run security scan:** `npm run security:scan` (after setting up package.json)
4. **Create M0 files:** transport.ts, scheduler.ts, graph.ts, clipPlayer.ts, engine.ts, demoLoops.ts
5. **Write tests:** mockClock, transport.test, scheduler.test
6. **Build UI:** Cell, Grid, TransportBar, LaptopLayout
7. **Run tests:** `npm test`
8. **Dev server:** `npm run dev`
