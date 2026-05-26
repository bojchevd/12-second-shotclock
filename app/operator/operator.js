import {
  newClockState, currentRemainingMs, applyCommand, tick, secondsToMs, SystemClock,
} from '../common/clock.js';
import { formatRemaining } from '../common/format.js';

const POPUP_URL = './scoreboard.html';
const POPUP_NAME = 'scoreboard';
const POPUP_OPTS = 'popup,width=1280,height=720';
const DIGIT_COMMIT_MS = 400;

const sysClock = new SystemClock();
const state = newClockState();

const miniEl   = document.getElementById('mini');
const startBtn = document.getElementById('start');
const stopBtn  = document.getElementById('stop');
const resetBtn = document.getElementById('reset');
const setInput = document.getElementById('set-input');
const setBtn   = document.getElementById('set');
const reopenBtn = document.getElementById('reopen');

let popup = null;

function openPopup() {
  popup = window.open(POPUP_URL, POPUP_NAME, POPUP_OPTS);
  if (popup) reopenBtn.classList.add('hidden');
  else reopenBtn.classList.remove('hidden');
}
openPopup();
reopenBtn.addEventListener('click', openPopup);

startBtn.addEventListener('click', () => applyCommand(state, sysClock, { kind: 'Start' }));
stopBtn .addEventListener('click', () => applyCommand(state, sysClock, { kind: 'Stop'  }));
resetBtn.addEventListener('click', () => applyCommand(state, sysClock, { kind: 'Reset' }));

let digitTimer = null;
function commitInput() {
  clearTimeout(digitTimer);
  digitTimer = null;
  const raw = setInput.value.trim();
  setInput.value = '';
  setInput.blur();
  if (raw === '') return;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return;
  applyCommand(state, sysClock, { kind: 'SetSeconds', ms: secondsToMs(n) });
}
function scheduleCommit() {
  clearTimeout(digitTimer);
  digitTimer = setTimeout(commitInput, DIGIT_COMMIT_MS);
}
setBtn.addEventListener('click', commitInput);
setInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); commitInput(); }
});

document.addEventListener('keydown', (e) => {
  const inInput = document.activeElement === setInput;

  // Digits and dot → buffer into the manual-set input.
  if (/^[0-9.]$/.test(e.key)) {
    if (!inInput) {
      e.preventDefault();
      setInput.focus();
      setInput.value += e.key;
    }
    scheduleCommit();
    return;
  }

  if (e.key === 'Backspace' && inInput) {
    scheduleCommit();
    return;
  }

  if (e.key === 'Escape') {
    clearTimeout(digitTimer);
    digitTimer = null;
    setInput.value = '';
    setInput.blur();
    return;
  }

  if (e.key === ' ' && !inInput) {
    e.preventDefault();
    applyCommand(state, sysClock,
      { kind: state.running ? 'Stop' : 'Start' });
    return;
  }

  if ((e.key === 'r' || e.key === 'R') && !inInput) {
    e.preventDefault();
    applyCommand(state, sysClock, { kind: 'Reset' });
    return;
  }
});

function loop() {
  const effect = tick(state, sysClock);
  const frame = {
    type: 'frame',
    remaining_ms: currentRemainingMs(state, sysClock),
    running: state.running,
    expired: state.expiredAt !== null,
  };

  // Render mini clock
  miniEl.textContent = formatRemaining(frame.remaining_ms);
  const cls = frame.running ? 'running' : 'stopped';
  if (miniEl.className !== cls) miniEl.className = cls;

  startBtn.classList.toggle('dim',  state.running);
  stopBtn .classList.toggle('dim', !state.running);

  // Popup lifecycle + sync
  if (popup && !popup.closed) {
    try {
      popup.postMessage(frame, '*');
      if (effect === 'buzzer') popup.postMessage({ type: 'buzzer' }, '*');
    } catch (e) {
      // Popup may be cross-origin briefly during navigation; ignore.
    }
    reopenBtn.classList.add('hidden');
  } else {
    popup = null;
    reopenBtn.classList.remove('hidden');
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
