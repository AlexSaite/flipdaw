# JUCE Core Spike (M5)

> [!WARNING]
> **Not covered by the repository's MIT license.** This spike links against the
> [JUCE](https://juce.com) framework, which is dual-licensed: **GPLv3 or a paid
> commercial license**. It is kept here as design documentation only —
> **it is not built, not compiled and not distributed** with any FlipDAW release.
> Do not link it into a shipped binary without a JUCE commercial license, and do not
> treat this directory as MIT-licensed code. The shipped FlipDAW app is pure
> Rust + WebView2 and does not use JUCE.

Proof-of-concept for the future native core: host a VST3 in JUCE and speak
JSON-lines IPC to the WebView so FlipDAW can swap engines without the UI
noticing (ADR-010).

## Spike goals (M5 acceptance)

- [x] Protocol bytes match `src/audio/coreClient.ts` exactly
- [ ] VST3 loads in the host
- [ ] IPC jitter ≤ 1 ms (measured via the `ping`/`pong` RTT samples)
- [ ] Engine swap: UI keeps calling `getEngine()` (see `setEngineOverride`)

## Layout

- `protocol.md` — the JSON-lines wire contract (single source of truth with
  `src/audio/coreClient.ts`)
- `main.cpp` — JUCE console host: VST3 plugin format + TCP line server + a
  beat-clock driven by `transport.start` so grid launches stay quantized

## How to run (later, on a machine with JUCE + CMake)

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
# PLUGIN_PATH=... ./juce-core 9000
```

The host is kept deliberately small — the real work lives in the Web Audio
engine; JUCE is only a latency/capability probe (Ableton Link lives here too,
ADR-009).