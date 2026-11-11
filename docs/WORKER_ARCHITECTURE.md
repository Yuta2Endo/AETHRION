# AETHRION — Worker Architecture

**Project:** AETHRION  
**Stage:** 07 — Performance & Web Workers

This document describes how the simulation executes off the main thread, the contract between the main thread and the Worker, the guarantees the architecture provides and the measurements that were taken.

The implementation is an extension of the existing Game Core — the domain engines, the tick order and the game rules are unchanged.

## 1. Overview

The simulation can run in two execution modes:

| Mode | Where the work runs | When it is used |
|------|---------------------|-----------------|
| **Inline** | Main thread — the twelve systems are registered on the Game Core | The default; also the fallback |
| **Worker** | A Web Worker runs the whole tick and returns a delta | When a Worker is available and healthy |

In both modes the **same simulation kernel** (`src/game/simulation/kernel.ts`) executes the same twelve domain systems in the same order. The Worker is an execution place, not a second implementation.

The UI, React, Zustand, the rendering, the command layer, the clock, the scheduler and the Game Core lifecycle always stay on the main thread.

## 2. Responsibilities

### Main thread

- Owns the Game Core lifecycle: start, stop, pause, resume, reset, speed changes and manual stepping.
- Owns the authoritative clock and the tick counter.
- Owns the canonical Zustand game state and every store subscription.
- Spawns, handshakes with and terminates the Worker.
- Sends a serialisable snapshot of the simulation state and the tick context to the Worker.
- Validates every response (protocol, sequence, success) and applies **only** the confirmed delta.
- Activates the main-thread fallback when the Worker is unavailable or fails.
- Renders the UI and records the bounded performance metrics.

### Worker

- Executes the pure simulation kernel for one tick over the provided snapshot.
- Runs the twelve domain systems in their documented order and isolates a failing system exactly like the Game Core does.
- Returns the **delta** of the slices that changed and the duration of the simulation work.
- Performs no rendering, no state application, no scheduling and no lifecycle decisions.

The Worker imports no React, DOM, Zustand, browser-only application interface or rendering code. Its only domain dependency is the pure simulation kernel and the domain modules it calls — all of which are free of browser APIs.

## 3. The simulation kernel

`src/game/simulation/kernel.ts` contains the twelve systems bound to an **injected store** (`SimulationStore`):

- On the main thread the store is a thin adapter over the live Zustand store, so the systems read and write the canonical state exactly as before.
- Inside the Worker the store is a plain `LocalSimulationStore` that holds a clone of the snapshot and records which slices changed.

This is what makes the same code run in both places without duplicating rules. The tick order is fixed and identical:

| Order | System | Order | System |
|------:|--------|------:|--------|
| 10 | world | 60 | resources |
| 11 | events | 70 | production |
| 15 | city | 80 | market |
| 20 | economy | 85 | competitors |
| 30 | employees | 90 | corporation |
| 40 | technology |  |  |
| 50 | products |  |  |

In worker mode the Game Core registers a single system (`simulation`, order 5) that delegates the tick to the Worker; the kernel enforces the twelve-step order inside the Worker.

## 4. Message protocol

The contract lives in `src/game/simulation/protocol.ts`. Every message is plain, structured-clone-safe data; errors are returned as a discriminated result rather than thrown across the boundary.

### Version and handshake

```ts
WORKER_PROTOCOL_VERSION = 1

hello({ protocolVersion }) -> { protocolVersion, workerId, supportsDelta }
```

The main thread refuses a Worker that speaks a different protocol version. The handshake is performed once; concurrent callers share the same initialisation.

### Tick request / result

```ts
tick({
  sequence,   // monotonic request number
  snapshot,   // the complete simulation state
  context,    // { tick, simTimeMs, deltaMs, realDeltaMs, elapsedSimMs }
}) -> { ok: true,  sequence, delta, changedSlices, durationMs }
    | { ok: false, sequence, code, message }
```

- `sequence` is monotonic and owned by the main thread.
- `delta` contains only the slices whose reference changed during the tick.
- `code` is one of `WORKER_PROTOCOL_MISMATCH`, `WORKER_INVALID_REQUEST`, `WORKER_TICK_FAILED`.

The transport is Comlink over a module Worker (`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`), which Vite detects and emits as a separate asset in the production build. The pure Worker API (`workerApi.ts`) is independent of the transport and is unit-tested directly.

## 5. State transfer strategy

The simulation state is transferred as a **full, structured-clone-safe snapshot** on every tick and the Worker returns a **delta** of the changed slices.

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| Payload shape | Full snapshot in, delta out | The domain systems read across slices (e.g. economy reads world, city and events in the same tick), so a per-slice input would require dependency tracking; the snapshot keeps the contract simple and correct. |
| Transfer mechanism | Structured clone (postMessage / Comlink) | The state is plain data with no transferable binary buffers that are still needed by the main thread, so a zero-copy transfer would detach nothing useful. |
| Cloning cost | ~0.08 ms for a ~16.2 KB snapshot (measured) | Small enough that the clone is not the bottleneck at the current scale. |
| Delta application | Only changed slices are written | An unchanged slice keeps its reference, so the store does not trigger a re-render for it. |

**Measured baseline (initial HEAD, 1 city / 1 corporation / 1 employee, 300 ticks, warmed):**

| Metric | Value |
|--------|------:|
| Snapshot JSON size | 16,199 bytes |
| `structuredClone` average | 0.0799 ms |
| Inline tick average | 0.2047 ms (p50 0.1823, p95 0.3229, max 2.0231) |

The architecture is designed to keep the simulation responsive as the state grows; at the current state size the Worker transport overhead makes the worker path slower than the inline path, which is the honest, measured result (see §9).

## 6. Determinism guarantees

The same initial state, commands, simulated time and tick sequence produce the same result in inline and worker mode.

- The kernel is identical in both places — there is no second implementation.
- The clock, the tick counter, `deltaMs`, `simTimeMs` and `elapsedSimMs` are computed on the main thread and passed into the tick; the Worker never reads the wall clock to advance the simulation.
- The seeded xorshift RNG state lives inside the events slice of the snapshot, so the event and competitor sequences are part of the transferred state and remain reproducible.
- The domain engines do not use `Math.random()` or `Date.now()` for simulation decisions (the only `Date.now()` uses in the simulation layer are `AppError.timestamp` annotations, which are not part of the simulation state).
- The tick order is fixed and the per-system error isolation is identical.
- Equivalence is verified by integration tests that compare the full simulation state produced by inline and worker runs over the same inputs.

## 7. Ordering, integrity and backpressure

- **One request in flight.** The Game Core already blocks overlapping ticks with an in-flight guard; the worker path reuses it, so the client never has more than one outstanding request.
- **Monotonic sequences.** Every request carries a sequence number. A result is applied only when its sequence equals the current one.
- **Stale responses are ignored.** A response whose sequence is lower than the current one belongs to an abandoned request and never overwrites newer state.
- **Unexpected responses are rejected.** A sequence mismatch or a malformed result is treated as a failure.
- **No duplicate execution.** A tick that fails or times out is **not** retried — the client falls back to the main thread for subsequent ticks, but the uncertain tick is never executed a second time. The state stays at the last confirmed value.
- **Confirmed-state recovery.** The Worker computes a delta against the snapshot it received; the main thread applies the delta only on a valid, matching, successful response. A failed request therefore cannot corrupt or discard the confirmed state.

## 8. Error recovery and fallback

| Situation | Behaviour |
|-----------|-----------|
| Workers unsupported / creation fails | The handshake returns false, the fallback activates once, the game runs inline. |
| Handshake timeout or protocol mismatch | The transport is terminated, the fallback activates, the game runs inline. |
| Tick timeout, transport error or `ok: false` result | The Worker is disabled and terminated, the fallback activates, the current tick is completed inline without retrying the uncertain request. |
| Invalid / stale / unexpected response | The response is rejected and the tick is completed inline; the Worker is not trusted for that response. |
| Disposal | The Worker is terminated and further ticks are refused. |

The fallback is **explicit and observable**: the execution mode, the fallback activation count and the error count are exposed through the status and the diagnostics view. The application never silently loses simulation state.

## 9. Performance

### Instrumentation

`src/game/simulation/metrics.ts` collects bounded aggregates (constant memory): tick count, average and maximum tick duration, slow-tick count, average and maximum round-trip time, average worker execution time, fallback activations and worker errors. A tick above 50 ms is counted as slow. Snapshot size is sampled periodically, not on every tick.

The figures are exposed in a compact developer diagnostics section on the dashboard (execution mode, worker status, average/max tick, slow ticks, fallback activations). Internal errors and stack traces are never shown.

### Benchmark (Stage 07 implementation, local, `vitest run`, 60 measured ticks after 10 warm-up ticks, injected in-process transport)

| Mode | Average | Max |
|------|--------:|----:|
| Inline | 0.1473 ms | 0.2803 ms |
| Worker-path (in-process transport) | 0.2616 ms | 0.5978 ms |

These are **actual measurements, not targets**. At the current simulation scale (~0.2 ms per tick, ~16 KB snapshot) the transport and structured-clone overhead dominate, so the worker path is slower than the inline path. The value of the architecture is that the expensive work is isolated and ready to move off the main thread as the simulation grows, while the behaviour and determinism are already guaranteed and the inline fallback keeps the game correct today.

## 10. Build and compatibility

- The Worker is a Vite module Worker and is emitted as its own asset in the production build (`dist/assets/worker-*.js`, verified).
- Comlink (`4.4.x`, already in the dependency set) provides the RPC transport; no additional RPC library was introduced.
- The implementation is compatible with the existing React application, Zustand stores, TypeScript, Vite and the Game Core lifecycle.
- Android compatibility has **not** been verified by an Android build or a device test in this stage.

## 11. Known limitations

- The worker path adds overhead at the current state size and is not a measured speed-up today.
- The benchmark above uses an in-process transport under Vitest; a real browser Worker adds thread scheduling and postMessage overhead that is not captured by that number.
- The full snapshot is cloned each tick. It is cheap now (~0.08 ms) but will need revisiting if the state grows substantially (incremental/diffed transfer or transferable buffers for large binary data).
- There is no persistence, save/load or IndexedDB integration (Stage 08) and no rendering changes (Stage 09).
- Android/device verification was not performed.

## 12. Out of scope

The following are explicitly out of scope for this stage and unchanged: IndexedDB persistence, save/load, Three.js and 3D rendering, multiplayer, cloud sync, online AI services, billing/ads, new gameplay, economy, event or competitor systems, major UI redesign and Stage 08 functionality.