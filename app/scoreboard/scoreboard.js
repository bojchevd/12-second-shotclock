import { formatRemaining } from '../common/format.js';
import { playHorn } from '../common/horn.js';

const clockEl = document.getElementById('clock');
const unlockEl = document.getElementById('audio-unlock');

let audioCtx = null;

function unlockAudio() {
  if (audioCtx) return;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch((e) => console.error('AudioContext resume failed:', e));
    }
    document.body.classList.add('audio-ready');
  } catch (e) {
    console.error('AudioContext init failed:', e);
  }
  unlockEl.classList.add('hidden');
}

unlockEl.addEventListener('click', unlockAudio);

document.addEventListener('keydown', async (e) => {
  // F11 → toggle fullscreen (popups don't always honor the browser's native F11).
  // Any keydown also counts as a user gesture, so unlock audio here too.
  if (e.key === 'F11') {
    e.preventDefault();
    unlockAudio();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }
});

function render(frame) {
  clockEl.textContent = formatRemaining(frame.remaining_ms);
  const cls = frame.running ? 'running' : 'stopped';
  if (clockEl.className !== cls) clockEl.className = cls;
}

// Initial paint so the window doesn't flash blank before the first frame arrives.
render({ remaining_ms: 12000, running: false });

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'frame') {
    render(msg);
  } else if (msg.type === 'buzzer') {
    if (audioCtx) {
      try { playHorn(audioCtx); }
      catch (err) { console.error('horn failed:', err); }
    }
  }
});
