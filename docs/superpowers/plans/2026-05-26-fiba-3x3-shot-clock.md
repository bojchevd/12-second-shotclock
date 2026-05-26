# FIBA 3x3 Shot Clock Implementation Plan (web-app, zero-install)

> Supersedes the Tauri-based plan from the same date. The user has no Rust/MSVC/Node installed; this plan uses only browser-native APIs. Reference spec: [`docs/superpowers/specs/2026-05-26-fiba-3x3-shot-clock-design.md`](../specs/2026-05-26-fiba-3x3-shot-clock-design.md) rev 2.

**Goal:** Deliver a working FIBA 3x3 shot clock the user can run by double-clicking `app/operator.html` in any modern browser.

**Architecture:** Operator window owns `ClockState`, drives a `requestAnimationFrame` 60 Hz tick loop using `performance.now()`, and `postMessage`s `{remaining_ms, running, expired}` frames + one-shot `buzzer` events to a `window.open`'d scoreboard popup.

**Tech stack:** HTML, CSS, vanilla JS modules. Web Audio for the horn. No build, no install.

---

## File map (all paths relative to `D:\misc\shot-clock-app\`)

```
.gitignore
app/
  operator.html
  scoreboard.html
  common/
    clock.js
    format.js
    horn.js
  operator/
    operator.css
    operator.js
  scoreboard/
    scoreboard.css
    scoreboard.js
  tests/
    tests.html
    clock.test.js
```

---

## Task 1: Scaffold

Initialize git, write `.gitignore`, create empty directory tree, create stub `operator.html` and `scoreboard.html` that just display "Operator stub" / "Scoreboard stub" so the popup wiring can be verified end-to-end before any clock logic exists.

Verification: open `operator.html` in a browser; on load it calls `window.open('scoreboard.html')` and the second window pops up.

Commit: `chore: scaffold web-app shot clock`

## Task 2: Clock state machine + in-browser test runner (TDD)

Write `app/tests/tests.html` (a tiny runner that imports `clock.test.js` and prints PASS/FAIL into the DOM), then `app/tests/clock.test.js` (all 18 tests from spec §11.1, using a `TestClock` with a mutable virtual time), then `app/common/clock.js` (implementation: `newClockState`, `currentRemainingMs`, `applyCommand`, `tick`, `secondsToMs`, `SystemClock`, `FULL_MS = 12000`, `EXPIRY_HOLD_MS = 1200`).

Logic must match spec §5 exactly:
- baseline-and-delta math (don't decrement per tick)
- Start at 0 / during expiry-hold → reset-then-start
- Stop freezes value
- Reset → 12, stopped, clear expired
- SetSeconds → clamp [0,12], round to 0.1, stopped, clear expired
- tick: emit 'buzzer' once at expiry, set expiredAt, stop; 1200ms later auto-reset to 12 stopped

Verification: open `app/tests/tests.html` in a browser, all 18 tests show PASS.

Commit: `feat(clock): pure state machine + 18 unit tests passing`

## Task 3: Shared display formula

Write `app/common/format.js` exporting `formatRemaining(ms)` — exact formula from the brief:

```js
export function formatRemaining(ms) {
  const s = ms / 1000;
  return s > 5.0 ? Math.ceil(s).toString() : s.toFixed(1);
}
```

No separate test file; covered indirectly by the manual smoke test and by inline asserts at module top during tests.html.

Commit: `feat(ui): shared formatRemaining display formula`

## Task 4: Web Audio horn

Write `app/common/horn.js` exporting `playHorn(audioCtx)` — two square-wave oscillators (440 Hz + 445 Hz) summed through a gain node with a 20 ms attack and 80 ms release, total duration 1.2 s. The oscillators are stopped after the envelope completes.

Commit: `feat(audio): web-audio horn synthesizer`

## Task 5: Scoreboard window

Write `app/scoreboard.html`, `app/scoreboard/scoreboard.css`, `app/scoreboard/scoreboard.js`:

- HTML: black body, one `#clock` div, an `#audio-unlock` overlay div with text "Click anywhere to enable audio".
- CSS: full-screen layout, `#clock` sized via `vh`, yellow `#FFD400` when `.running`, red `#E63946` when `.stopped`; cursor hidden when `body.fs`.
- JS:
  - Single `AudioContext`, created/resumed on the first user gesture (click or keydown anywhere).
  - Listen for `window.message` events. Expected payloads:
    - `{type: 'frame', remaining_ms, running}` → render via `formatRemaining`, update class.
    - `{type: 'buzzer'}` → `playHorn(audioCtx)`.
  - F11 → toggle `document.documentElement.requestFullscreen()`/`exitFullscreen()` and `body.fs` class.
  - Initial display: render "12" stopped immediately so the window doesn't flash blank before the first frame.

Verification: from operator.html in a browser console, do `popup = window.open('scoreboard.html', 'scoreboard', 'popup,width=1280,height=720')` then `popup.postMessage({type: 'frame', remaining_ms: 7500, running: true}, '*')` — scoreboard shows "8" in yellow. Send `{type: 'buzzer'}` after unlocking audio — horn plays.

Commit: `feat(ui): scoreboard window with rendering, fullscreen, audio unlock`

## Task 6: Operator window (state owner)

Write `app/operator.html`, `app/operator/operator.css`, `app/operator/operator.js`:

- HTML: mini `#mini` clock, three buttons (Start/Stop/Reset), numeric input + Set button, keyboard hint footer, `#reopen` hidden button.
- CSS: dark theme, large readable buttons, same yellow/red rules for the mini clock.
- JS:
  - On load: `popup = window.open('scoreboard.html', 'scoreboard', 'popup,width=1280,height=720')`. If `popup` is null (blocker), show `#reopen` button; clicking it calls the same `window.open` (popup blockers always allow click-triggered opens).
  - Maintain `state = newClockState()`. Each `requestAnimationFrame`:
    1. `effect = tick(state, sysClock)`
    2. compute `frame = {type: 'frame', remaining_ms: currentRemainingMs(state, sysClock), running: state.running}`
    3. render mini clock from `frame`
    4. if popup alive: `popup.postMessage(frame, '*')`
    5. if `effect === 'buzzer'` and popup alive: `popup.postMessage({type: 'buzzer'}, '*')`
  - Button click handlers → `applyCommand(state, sysClock, {kind: 'Start'|'Stop'|'Reset'|'SetSeconds', value?: ms})`.
  - Keyboard (document-level):
    - `Space` (when not typing in input) → toggle Start/Stop based on `state.running`.
    - `r` / `R` (when not typing) → Reset.
    - `0`–`9` and `.` → buffer into the manual-set input (auto-focus it), commit on 400 ms idle or Enter.
    - `Enter` (in input) → commit buffer.
    - `Esc` → clear buffer, blur input.
  - Watch `popup.closed` in a `setInterval(..., 500)`; when true, show `#reopen`.

Verification: open `operator.html`, walk through the manual smoke test in spec §11.2.

Commit: `feat(ui): operator window — state machine driver, RAF tick, postMessage to scoreboard, keyboard shortcuts`

## Task 7: Manual smoke test pass

Run through every step in spec §11.2. Note any defects. Fix and commit.

Final commit: `chore: tag v0.1.0`
