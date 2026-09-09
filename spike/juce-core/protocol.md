# JSON-lines IPC protocol (JUCE core ↔ FlipDAW)

One JSON object per line, UTF-8, `\n`-terminated. Every request carries a
monotonic `seq`. The core never blocks: it replies asynchronously.

Transport: TCP line socket (or WebSocket in the browser dev bridge) to the
daemon local port. Both sides on the same host → `AudioContext.currentTime`
and the core's sample clock share the host monotonic clock (ADR-001).

## Handshake

```
→ {"t":"hello","v":1,"seq":0}
← {"t":"hello","v":1,"seq":0}          # version match else core closes
```

## Control (fire-and-forget with ack)

```
→ {"t":"transport.start","seq":1}
→ {"t":"transport.stop","seq":2}
→ {"t":"transport.panic","seq":3}
→ {"t":"transport.bpm","bpm":155,"seq":4}
→ {"t":"cell.launch","cellId":"drums-0","quantize":"1bar","atBeat":4,"seq":5}
→ {"t":"arrangement.load","version":12,"seq":6}
← {"t":"ack","seq":5}
← {"t":"error","seq":5,"message":"no such cell"}
```

## Latency probe (jitter ≤ 1 ms target)

```
→ {"t":"ping","sentAt":123.4567,"seq":7}
← {"t":"pong","seq":7}
```

`rtt = now - sentAt` computed by the client on the local clock. The UI shows a
"link health" badge from `CoreClientEngine.latencyStats`.

## Errors

- Malformed JSON → the core logs and skips the line (never crashes the host).
- Unhandled `t` → `{"t":"error","seq":N,"message":"unknown"}`.
- Timeout: client drops a `seq` after 1 s and reports a dropped sample.