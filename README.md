# 12-Second Shot Clock

A FIBA 3x3 basketball shot clock for a two-monitor setup. Pure HTML / CSS / vanilla JS — no framework, no build step, no native install. The whole app is two browser windows talking to each other.

- **Operator window** — buttons + keyboard controls. Owns the clock state.
- **Scoreboard window** — fullscreen audience display on a second monitor. Drag, F11, done.

## Features

- 12-second countdown with tenths of a second shown in the final 5 s.
- Synthesized horn (Web Audio, no asset file) that pre-fires by 100 ms so the audio lands on 0.0.
- **Auto-reset** to 12.0 (stopped) after a 1.2 s hold at 0.0 — operator hits Start when the next possession actually begins.
- **Reset** = new-possession shortcut: snaps to 12 AND starts the countdown in one tap.
- Manual override: set any value 0–12 s, with one decimal.
- Keyboard-first operator UI (Space / R / 0–9).
- Operator and scoreboard stay in sync via `postMessage` (sub-millisecond on localhost; both render off the same frame).
- 21 unit tests on the clock state machine.

## Run it

Prerequisite: [Node.js](https://nodejs.org/) (any recent version — tested on 22). That's the only install.

```
git clone https://github.com/bojchevd/12-second-shotclock.git
cd 12-second-shotclock
```

Then double-click **`start-shot-clock.bat`** (Windows). A small console window starts the local server and opens your browser to the operator page.

On other OSes:

```
node serve.js
```

Then open <http://localhost:8765/operator.html>.

## Using it

When the operator page loads it tries to pop the scoreboard automatically. Browsers usually block the first script-triggered popup, so you may need to click the red **Reopen scoreboard window** button once. Drag the scoreboard popup to your second monitor, click anywhere inside it to enable audio, then press **F11** for fullscreen.

### Operator controls

| Key       | Action                                                |
|-----------|-------------------------------------------------------|
| **Space** | Start / Stop (toggle)                                 |
| **R**     | Reset to 12 AND auto-start (new possession)           |
| **0**–**9** / `.` | Type seconds → auto-commits after 400 ms idle |
| **Enter** | Commit current input                                  |
| **Esc**   | Clear input / drop focus                              |

Click the **START / STOP / RESET** buttons or use the **Set** input field as alternatives.

## Tuning

All knobs live at the top of `app/common/clock.js`:

```js
export const FULL_MS = 12000;        // shot clock duration
export const EXPIRY_HOLD_MS = 1200;  // how long "0.0" is held before auto-reset
export const BUZZER_LEAD_MS = 100;   // fire horn this many ms before 0.0
```

Horn timbre lives in `app/common/horn.js` (two square oscillators at 440 + 445 Hz, 1.2 s with attack/release envelope). To preview the horn outside the app:

```
node tools/render-horn.js
```

This writes a stand-alone `horn-preview.wav` at the repo root that you can play in any media player or scrub through in an audio editor.

Clock color is set in `app/scoreboard/scoreboard.css` and `app/operator/operator.css` (defaults to red always; FIBA's yellow-when-running / red-when-stopped split is easy to re-introduce — just split the two combined CSS rules at `#clock.running` / `#mini.running`).

## Tests

Run the state-machine tests in a browser:

> http://localhost:8765/tests/tests.html

Or headlessly with Node:

```
node --input-type=module -e "import('./app/tests/clock.test.js').then(({tests}) => { let p=0,f=0; for (const {name,fn} of tests) { try { fn(); console.log('PASS', name); p++; } catch (e) { console.log('FAIL', name, '-', e.message); f++; } } console.log(`${p}/${p+f}`); process.exit(f?1:0); })"
```

## File layout

```
app/
  operator.html              entry point
  scoreboard.html            popup opened by operator
  common/
    clock.js                 state machine (pure, no DOM)
    format.js                display formula (>5s = integer, ≤5s = one decimal)
    horn.js                  Web Audio horn synthesis
  operator/                  operator window CSS + JS
  scoreboard/                scoreboard window CSS + JS
  tests/
    clock.test.js            21 unit tests
    tests.html               in-browser runner
serve.js                     ~25-line Node static file server
start-shot-clock.bat         Windows launcher (runs serve.js)
tools/
  render-horn.js             writes horn-preview.wav from the same DSP
docs/superpowers/
  specs/                     design spec
  plans/                     implementation plan
```

## How sync works

The operator window is the only owner of state. Every animation frame it computes `{remaining_ms, running, expired}` from a `performance.now()`-baselined `ClockState` and sends it to the scoreboard popup via `postMessage`. The scoreboard is purely a view — same display formula, same colors, plays the horn when it receives a `buzzer` message. Closing the scoreboard never breaks the operator; reopening it picks up the next frame.

If you ever want a third display, point another browser window at `scoreboard.html` and wire it up the same way — the operator's broadcast is already idempotent.
