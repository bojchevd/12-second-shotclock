import {
  newClockState, currentRemainingMs, applyCommand, tick, secondsToMs,
  FULL_MS, EXPIRY_HOLD_MS, BUZZER_LEAD_MS,
} from '../common/clock.js';

class TestClock {
  constructor() { this.t = 0; }
  now() { return this.t; }
  advance(ms) { this.t += ms; }
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

test('secondsToMs_clamps_and_rounds', () => {
  assertEq(secondsToMs(-3), 0);
  assertEq(secondsToMs(99), 12000);
  assertEq(secondsToMs(5.5), 5500);
  assertEq(secondsToMs(0), 0);
  assertEq(secondsToMs(12), 12000);
});

test('newState_isStoppedAt12', () => {
  const s = newClockState();
  assertEq(s.running, false);
  assertEq(s.baselineRemainingMs, 12000);
  assertEq(s.expiredAt, null);
});

test('stoppedState_returnsBaseline', () => {
  const c = new TestClock();
  const s = newClockState();
  assertEq(currentRemainingMs(s, c), 12000);
});

test('runningState_subtractsElapsed', () => {
  const c = new TestClock();
  const s = newClockState();
  s.running = true;
  s.baselineAt = c.now();
  s.baselineRemainingMs = 12000;
  c.advance(500);
  assertEq(currentRemainingMs(s, c), 11500);
});

test('runningState_saturatesAtZero', () => {
  const c = new TestClock();
  const s = newClockState();
  s.running = true;
  s.baselineAt = c.now();
  s.baselineRemainingMs = 1000;
  c.advance(5000);
  assertEq(currentRemainingMs(s, c), 0);
});

test('startFromStopped_capturesBaselineAndRuns', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });
  assertTrue(s.running);
  assertTrue(s.baselineAt !== null);
  assertEq(s.baselineRemainingMs, 12000);
  c.advance(300);
  assertEq(currentRemainingMs(s, c), 11700);
});

test('startWhenAlreadyRunning_isNoop', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });
  const baselineBefore = s.baselineAt;
  c.advance(200);
  applyCommand(s, c, { kind: 'Start' });
  assertEq(s.baselineAt, baselineBefore, 'Start mid-run must not re-baseline');
});

test('stopFreezesValue', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });
  c.advance(300);
  applyCommand(s, c, { kind: 'Stop' });
  assertEq(s.running, false);
  assertEq(s.baselineAt, null);
  assertEq(s.baselineRemainingMs, 11700);
  c.advance(500);
  assertEq(currentRemainingMs(s, c), 11700);
});

test('stopWhenAlreadyStopped_isNoop', () => {
  const c = new TestClock();
  const s = newClockState();
  s.baselineRemainingMs = 7500;
  applyCommand(s, c, { kind: 'Stop' });
  assertEq(s.running, false);
  assertEq(s.baselineRemainingMs, 7500);
});

test('resetReturnsTo12AndStarts', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });
  c.advance(5000);
  applyCommand(s, c, { kind: 'Reset' });
  assertTrue(s.running, 'Reset should auto-start the countdown');
  assertEq(s.baselineRemainingMs, 12000);
  assertTrue(s.baselineAt !== null);
  assertEq(s.expiredAt, null);
  c.advance(300);
  assertEq(currentRemainingMs(s, c), 11700, 'countdown runs from 12');
});

test('setSecondsClampsAndStops', () => {
  const c = new TestClock();
  const s = newClockState();
  s.running = true;
  s.baselineAt = c.now();
  applyCommand(s, c, { kind: 'SetSeconds', ms: 99000 });
  assertEq(s.baselineRemainingMs, 12000);
  assertEq(s.running, false);
  applyCommand(s, c, { kind: 'SetSeconds', ms: 5500 });
  assertEq(s.baselineRemainingMs, 5500);
  applyCommand(s, c, { kind: 'SetSeconds', ms: 0 });
  assertEq(s.baselineRemainingMs, 0);
});

test('setSeconds_clearsExpiredState', () => {
  const c = new TestClock();
  const s = newClockState();
  s.expiredAt = c.now();
  applyCommand(s, c, { kind: 'SetSeconds', ms: 7000 });
  assertEq(s.expiredAt, null);
});

test('startAtZero_resetsThenStarts', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'SetSeconds', ms: 0 });
  applyCommand(s, c, { kind: 'Start' });
  assertTrue(s.running);
  assertEq(currentRemainingMs(s, c), 12000);
});

test('startDuringExpiredHold_resetsThenStarts', () => {
  const c = new TestClock();
  const s = newClockState();
  s.expiredAt = c.now();
  s.baselineRemainingMs = 0;
  applyCommand(s, c, { kind: 'Start' });
  assertTrue(s.running);
  assertEq(s.expiredAt, null);
  assertEq(currentRemainingMs(s, c), 12000);
});

test('tickBeforeExpiry_returnsNone', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });
  c.advance(500);
  assertEq(tick(s, c), 'none');
  assertTrue(s.running);
  assertEq(s.expiredAt, null);
});

test('tickFiresBuzzerAtLeadThreshold_clockKeepsCounting', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });

  // Just before lead threshold: no buzzer.
  c.advance(FULL_MS - BUZZER_LEAD_MS - 1);
  assertEq(tick(s, c), 'none');
  assertTrue(s.running);
  assertEq(s.buzzerFired, false);

  // Cross threshold: buzzer fires; clock keeps running.
  c.advance(1);
  assertEq(tick(s, c), 'buzzer');
  assertTrue(s.running, 'clock keeps counting after buzzer');
  assertEq(s.buzzerFired, true);
  assertEq(s.expiredAt, null);
  assertEq(currentRemainingMs(s, c), BUZZER_LEAD_MS);

  // More ticks within the lead window: no re-fire.
  c.advance(100);
  assertEq(tick(s, c), 'none');
});

test('tickStopsAtZeroWithoutSecondBuzzer', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });
  c.advance(FULL_MS - BUZZER_LEAD_MS); // hits the lead threshold
  assertEq(tick(s, c), 'buzzer');
  c.advance(BUZZER_LEAD_MS); // now exactly at expiry
  assertEq(tick(s, c), 'none', 'no second buzzer at zero');
  assertEq(s.running, false);
  assertTrue(s.expiredAt !== null);
  assertEq(currentRemainingMs(s, c), 0);
});

test('setSecondsBelowLead_firesBuzzerOnFirstTick', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'SetSeconds', ms: Math.floor(BUZZER_LEAD_MS / 2) });
  applyCommand(s, c, { kind: 'Start' });
  assertEq(tick(s, c), 'buzzer', 'time already inside lead window must fire on first tick');
});

test('resetClearsBuzzerFired_andRefiresOnNextCycle', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });
  c.advance(FULL_MS - BUZZER_LEAD_MS);
  assertEq(tick(s, c), 'buzzer');
  assertEq(s.buzzerFired, true);
  applyCommand(s, c, { kind: 'Reset' });
  assertEq(s.buzzerFired, false);
  assertTrue(s.running);
  c.advance(FULL_MS - BUZZER_LEAD_MS);
  assertEq(tick(s, c), 'buzzer', 'next cycle must be able to fire again');
});

test('tickHoldsZeroFor1200ms_thenAutoResetsStopped', () => {
  const c = new TestClock();
  const s = newClockState();
  applyCommand(s, c, { kind: 'Start' });

  // Advance through lead-threshold (buzzer) and continue to expiry.
  c.advance(FULL_MS - BUZZER_LEAD_MS);
  assertEq(tick(s, c), 'buzzer');
  c.advance(BUZZER_LEAD_MS); // rem hits 0
  assertEq(tick(s, c), 'none');
  assertEq(currentRemainingMs(s, c), 0);
  assertTrue(s.expiredAt !== null);

  // 1199 ms into hold: still holding
  c.advance(1199);
  assertEq(tick(s, c), 'none');
  assertEq(currentRemainingMs(s, c), 0);

  // 1 ms more: auto-reset fires
  c.advance(1);
  assertEq(tick(s, c), 'none');
  assertEq(currentRemainingMs(s, c), 12000);
  assertEq(s.expiredAt, null);
  assertEq(s.running, false, 'auto-reset must leave the clock stopped');
  assertEq(s.buzzerFired, false, 'auto-reset must clear buzzerFired for next cycle');
});

test('tickDoesNothingWhenStoppedAndNotExpired', () => {
  const c = new TestClock();
  const s = newClockState();
  for (let i = 0; i < 5; i++) {
    assertEq(tick(s, c), 'none');
  }
  assertEq(s.baselineRemainingMs, 12000);
});

export { tests };
