# FIBA 3x3 Shot Clock — Design Spec

**Date:** 2026-05-26
**Source brief:** `build-shotclock-app.txt`
**Revision:** 2026-05-26-r2 — switched implementation from Tauri/Rust to a pure-web app. The user has no Rust/Node/MSVC installed; the web approach is zero-install and meets every functional requirement in the brief.

## 1. Purpose and scope

Build an application that drives two windows on a single Windows machine with extended displays:

- A **scoreboard** window shown fullscreen on a second monitor for an audience.
- An **operator** window on the primary monitor with controls.

**In scope (v1):** a 12-second FIBA 3x3 shot clock with start/stop/reset/manual-set, a one-shot horn at expiry, automatic reset to 12.0 (stopped) after expiry, and keyboard shortcuts for the operator.

**Out of scope (v1, explicitly):** game clock, team scores, periods, fouls, network play, multi-machine sync, persisted history.

## 2. Tech stack

- **Pure HTML/CSS/vanilla JavaScript.** No framework, no build step, no install.
- Runs in any modern browser (Edge, Chrome, Firefox). Tested target: latest Edge on Windows 11 (default Windows browser).
- **Web Audio API** for the horn (synthesized in code — no asset file to ship).
- **`window.open()` + `postMessage`** to launch the second window and keep it in sync. Same-origin parent/child communication works under the `file://` protocol.
- **`performance.now()`** for monotonic time — the browser equivalent of `Instant::now()`, also strictly monotonic and sub-millisecond resolution.
- **`requestAnimationFrame`** for the tick loop — natively syncs to the display's vsync (~60 Hz on most monitors).

Rationale: every functional requirement (monotonic timing, two synchronized windows, sub-50 ms sync, horn at expiry, F11 fullscreen, keyboard shortcuts) is delivered natively by the browser without external tooling. No Rust, no Node, no installers, no packaging.

## 3. Architecture

```
                          (same origin: file://...)
   +----------------------+   window.open()    +----------------------+
   |  operator.html       | ─────────────────> |  scoreboard.html     |
   |                      |                    |                      |
   |  - owns ClockState   | ──postMessage────> |  - read-only view    |
   |  - 60 Hz tick loop   |  frame: 60 Hz      |  - plays horn        |
   |  - keyboard input    |  buzzer: one-shot  |  - F11 fullscreen    |
   |  - mini live clock   |                    |                      |
   +----------------------+                    +----------------------+
```

The operator window is the source of truth: it owns the `ClockState`, runs the tick loop using `performance.now()`, and on every frame sends a `{remaining_ms, running, expired}` payload to the scoreboard via `postMessage`. The scoreboard is purely a view — same display formula, same colors, same horn. The operator window also renders the live state inline (the mini clock) by reading its own state directly, so even if the scoreboard window is closed the operator can still drive the clock.

Why "operator owns state" rather than "shared state in localStorage": `postMessage` between parent and `window.open`'d child is sub-millisecond on localhost and works on `file://`. Direct in-process JS calls and message-passing are faster and simpler than `localStorage`/`BroadcastChannel`, which have origin/permission quirks under `file://`.

## 4. Project layout

```
shot-clock-app/
├── build-shotclock-app.txt           # original brief
├── docs/superpowers/...              # this spec, the plan
└── app/
    ├── operator.html                 # ENTRY POINT — double-click to open
    ├── scoreboard.html               # opened by operator.html on load
    ├── common/
    │   ├── format.js                 # shared display formula
    │   ├── clock.js                  # ClockState + tick + commands (pure)
    │   └── horn.js                   # Web Audio horn synthesis
    ├── operator/
    │   ├── operator.css
    │   └── operator.js               # owns state, drives tick + postMessage
    ├── scoreboard/
    │   ├── scoreboard.css
    │   └── scoreboard.js             # listens for postMessage, renders
    └── tests/
        ├── tests.html                # in-browser test runner
        └── clock.test.js             # assertions on the clock state machine
```

The user runs the app by double-clicking `app/operator.html`. No installer, no command line.

## 5. Clock state machine (`app/common/clock.js`)

Pure JS module, no DOM, no browser-specific APIs. Same shape as the original Rust design — a Clock interface so tests can advance time without sleeping.

```js
// clock.js (pseudocode shape; full impl in plan)
export const FULL_MS = 12_000;
export const EXPIRY_HOLD_MS = 1200;

export class SystemClock { now() { return performance.now(); } }

export function newClockState() {
  return {
    running: false,
    baselineAt: null,            // performance.now() value when started
    baselineRemainingMs: FULL_MS,
    expiredAt: null,
  };
}

export function currentRemainingMs(state, clock) { /* same math as spec rev 1 */ }
export function applyCommand(state, clock, cmd) { /* Start/Stop/Reset/SetSeconds */ }
export function tick(state, clock) { /* returns 'none' | 'buzzer' */ }
export function secondsToMs(s) { /* clamp [0,12], round to 0.1 */ }
```

State, commands, tick effects, and the expiry/hold semantics are unchanged from spec rev 1:

- **Start** when at 0 or in expiry-hold → reset-then-start (Space → Space begins a fresh possession).
- **Start** when stopped with time remaining → captures `baselineAt = clock.now()`, runs.
- **Start** when already running → no-op.
- **Stop** when running → freezes the current remaining value.
- **Reset** → 12.0, stopped, clears `expiredAt` (the "new possession" mid-run action).
- **SetSeconds(s)** → clamp to `[0, 12]`, round to 0.1, stopped, clears `expiredAt`.
- **tick** → if running and remaining hit 0: emit `'buzzer'` once, stop, set `expiredAt`. If `expiredAt` is set and `clock.now() - expiredAt >= 1200`: auto-reset to 12.0 (stays stopped).

## 6. Operator window (`app/operator/`)

- On load: opens the scoreboard window via `window.open('../scoreboard.html', 'scoreboard', 'popup,width=1280,height=720')`. If the popup is blocked (browser default in some cases), shows a "Click to open scoreboard" button as a fallback (popups opened from a user click are not blocked).
- Owns the `ClockState` (using `newClockState()` from `clock.js`).
- Drives a `requestAnimationFrame` loop: each frame calls `tick(state, clock)`, sends `{remaining_ms, running, expired}` to the scoreboard via `postMessage`, and renders the operator's mini clock from the same data. If `tick` returns `'buzzer'`, also sends a `{type: 'buzzer'}` message.
- UI: mini live clock at top (same yellow/red rules), three large buttons (Start/Stop/Reset), numeric input + Set button.
- Keyboard shortcuts (unchanged from spec rev 1): Space toggles, R resets, 0–9 buffer into manual-set with 400 ms auto-commit, Enter commits, Esc clears.

## 7. Scoreboard window (`app/scoreboard/`)

- Pure black background. Single huge digit string, centered, sized via `vw`/`vh`.
- Mono digit font with `font-variant-numeric: tabular-nums`.
- Colors: `#FFD400` (FIBA yellow) when running; `#E63946` (red) otherwise.
- Listens for `message` events from `window.opener` (the operator). Renders incoming frames; plays the horn on `{type: 'buzzer'}`.
- F11 keydown → toggles fullscreen via the standard `document.documentElement.requestFullscreen()` / `document.exitFullscreen()` API.
- **Audio unlock:** browser autoplay policies require a user gesture before playing audio. On first load, the scoreboard shows a one-time overlay: "Click anywhere to enable audio." Clicking unlocks the `AudioContext` (creates and resumes it under the user gesture) and dismisses the overlay. Pressing F11 also counts as a user gesture and unlocks audio.

## 8. Horn synthesis (`app/common/horn.js`)

Web Audio API. No external asset. Plays a ~1.2 s buzzer-like tone built from two slightly detuned square-wave oscillators (440 Hz and 445 Hz) summed through a gain envelope (20 ms attack, 80 ms release) to avoid clicks. Function exposed as `playHorn(audioCtx)`; called from the scoreboard's message handler.

The 1.2 s duration matches the EXPIRY_HOLD_MS so the audio and the "0.0" displayed frame end together.

## 9. Sync latency

`postMessage` between parent and `window.open`'d child runs in-process and is sub-millisecond. Both the operator's mini clock and the scoreboard render from the same payload computed in the same tick. Worst-case visible delta is one animation frame (~16 ms). Well inside the 50 ms budget in the brief.

## 10. Error handling

- Command handlers cannot fail — they take simple values, clamp where needed, and mutate state directly.
- If the scoreboard window is closed, the operator detects it (the saved reference becomes `null`/`closed`) and shows a "Reopen scoreboard" button. The operator keeps running locally.
- If the AudioContext fails to initialize (very old browser), the horn is silent but the clock still works. Log to console, don't crash.

## 11. Testing

### 11.1 In-browser unit tests on `clock.js`

A small `app/tests/tests.html` page loads `clock.test.js` as a module and runs all test functions, printing PASS/FAIL for each into the page. A `TestClock` helper holds an advancable virtual time value so tests don't have to sleep.

Tests mirror the Rust ones from spec rev 1:
- `secondsToMs_clamps_and_rounds`
- `newState_isStoppedAt12`
- `stoppedState_returnsBaseline`
- `runningState_subtractsElapsed`
- `runningState_saturatesAtZero`
- `startFromStopped_capturesBaselineAndRuns`
- `startWhenAlreadyRunning_isNoop`
- `stopFreezesValue`
- `stopWhenAlreadyStopped_isNoop`
- `resetReturnsTo12AndStops`
- `setSecondsClampsAndStops`
- `setSeconds_clearsExpiredState`
- `startAtZero_resetsThenStarts`
- `startDuringExpiredHold_resetsThenStarts`
- `tickBeforeExpiry_returnsNone`
- `tickAtExpiry_emitsBuzzerOnceAndStops`
- `tickHoldsZeroFor1200ms_thenAutoResetsStopped`
- `tickDoesNothingWhenStoppedAndNotExpired`

### 11.2 Manual smoke test (browser)

1. Double-click `app/operator.html` → opens in default browser. After ~1 s the scoreboard popup opens; both visible on the primary monitor.
2. Drag the scoreboard window to the second monitor, focus it, press F11 → fullscreen, no cursor.
3. Click the audio-unlock overlay on the scoreboard once.
4. Scoreboard shows "12" in red (stopped) initially.
5. Click Start in the operator → both windows show 12 → 11 → … → at 5.0 the display switches to one decimal. Both windows turn yellow during the count and red when stopped/expired.
6. At 0.0 the horn plays once on the scoreboard. Display holds "0.0" for ~1.2 s, then snaps to red "12", remains stopped.
7. Operator window focused: Space toggles run/stop; R resets; typing `7` commits to 7.0 after 400 ms; typing `1` then `2` quickly commits to 12.0.
8. Close the scoreboard window → operator shows "Reopen scoreboard" button. Click it → scoreboard reopens, clock continues.
9. Run a 60-second test (start, let it run all the way down five times) — cumulative drift against a wall stopwatch should be under 100 ms (`performance.now()` is monotonic and we read it on every tick).
