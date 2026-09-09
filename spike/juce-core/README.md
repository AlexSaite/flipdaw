# JUCE Core Spike (M5)

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