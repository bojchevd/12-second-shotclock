// Web Audio horn synthesizer. ~1.2s of two slightly detuned square oscillators
// summed through a short attack/release envelope. Caller is responsible for
// creating/resuming the AudioContext under a user gesture before calling.

const DURATION_S = 1.2;
const ATTACK_S = 0.02;
const RELEASE_S = 0.08;
const PEAK_GAIN = 0.5;
const F1 = 440;
const F2 = 445;

export function playHorn(audioCtx) {
  const t0 = audioCtx.currentTime;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(PEAK_GAIN, t0 + ATTACK_S);
  gain.gain.setValueAtTime(PEAK_GAIN, t0 + DURATION_S - RELEASE_S);
  gain.gain.linearRampToValueAtTime(0, t0 + DURATION_S);
  gain.connect(audioCtx.destination);

  for (const freq of [F1, F2]) {
    const osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(t0);
    osc.stop(t0 + DURATION_S);
  }
}
