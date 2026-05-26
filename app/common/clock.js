// Pure clock state machine. No DOM, no browser APIs (Clock interface abstracts time).

export const FULL_MS = 12000;
export const EXPIRY_HOLD_MS = 1200;
// Fire the horn this many ms BEFORE the clock visually hits 0.0, so the audio
// (which has some unavoidable output-buffer + travel delay) lands at the right
// perceptual moment. Visual countdown still continues all the way to 0.0.
export const BUZZER_LEAD_MS = 100;

export class SystemClock {
  now() { return performance.now(); }
}

export function newClockState() {
  return {
    running: false,
    baselineAt: null,
    baselineRemainingMs: FULL_MS,
    expiredAt: null,
    buzzerFired: false,
  };
}

export function secondsToMs(s) {
  const clamped = Math.max(0, Math.min(12, s));
  return Math.round(clamped * 10) * 100;
}

export function currentRemainingMs(state, clock) {
  if (state.running) {
    const elapsed = clock.now() - state.baselineAt;
    return Math.max(0, state.baselineRemainingMs - Math.floor(elapsed));
  }
  return state.baselineRemainingMs;
}

export function applyCommand(state, clock, cmd) {
  switch (cmd.kind) {
    case 'Start': {
      const rem = currentRemainingMs(state, clock);
      if (state.expiredAt !== null || rem === 0) {
        state.baselineRemainingMs = FULL_MS;
        state.expiredAt = null;
        state.baselineAt = clock.now();
        state.running = true;
        state.buzzerFired = false;
      } else if (!state.running) {
        state.baselineAt = clock.now();
        state.running = true;
        // Do NOT clear buzzerFired here: if Stop happened after the buzzer
        // already fired (e.g., between rem=500 and rem=0), restarting should
        // not re-arm a second horn.
      }
      return;
    }
    case 'Stop': {
      if (state.running) {
        const rem = currentRemainingMs(state, clock);
        state.baselineRemainingMs = rem;
        state.baselineAt = null;
        state.running = false;
      }
      return;
    }
    case 'Reset': {
      // Reset = new possession with the clock already running.
      // (Auto-reset after expiry, in tick(), stays stopped — different path.)
      state.baselineRemainingMs = FULL_MS;
      state.baselineAt = clock.now();
      state.running = true;
      state.expiredAt = null;
      state.buzzerFired = false;
      return;
    }
    case 'SetSeconds': {
      const ms = Math.min(FULL_MS, Math.max(0, cmd.ms));
      state.baselineRemainingMs = ms;
      state.baselineAt = null;
      state.running = false;
      state.expiredAt = null;
      state.buzzerFired = false;
      return;
    }
  }
}

export function tick(state, clock) {
  let emit = 'none';

  if (state.running) {
    const rem = currentRemainingMs(state, clock);

    // Pre-trigger the horn while the clock keeps counting visually.
    if (rem <= BUZZER_LEAD_MS && !state.buzzerFired) {
      state.buzzerFired = true;
      emit = 'buzzer';
    }

    // Expiry: stop the clock and begin the visual hold.
    if (rem === 0 && state.expiredAt === null) {
      state.running = false;
      state.baselineRemainingMs = 0;
      state.baselineAt = null;
      state.expiredAt = clock.now();
    }
  }

  // Auto-reset after the 1.2 s "0.0" hold.
  if (state.expiredAt !== null) {
    if (clock.now() - state.expiredAt >= EXPIRY_HOLD_MS) {
      state.baselineRemainingMs = FULL_MS;
      state.expiredAt = null;
      state.buzzerFired = false;
    }
  }

  return emit;
}
