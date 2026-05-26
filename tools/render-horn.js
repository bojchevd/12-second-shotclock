// Renders the same horn that the live app plays into a stand-alone .wav file
// you can open in Windows Media Player, browser, or any audio editor.
//
// Run: node tools/render-horn.js
// Writes: horn-preview.wav at the repo root.

const fs = require('fs');
const path = require('path');

// Must mirror app/common/horn.js
const SAMPLE_RATE = 44100;
const DURATION_S = 1.2;
const ATTACK_S = 0.02;
const RELEASE_S = 0.08;
const PEAK_GAIN = 0.5;
const F1 = 440;
const F2 = 445;

const totalSamples = Math.floor(SAMPLE_RATE * DURATION_S);
const samples = new Int16Array(totalSamples);

const sq = (freq, t) => (Math.sin(2 * Math.PI * freq * t) >= 0 ? 1 : -1);

for (let i = 0; i < totalSamples; i++) {
  const t = i / SAMPLE_RATE;

  let env;
  if (t < ATTACK_S) env = t / ATTACK_S;
  else if (t > DURATION_S - RELEASE_S) env = Math.max(0, (DURATION_S - t) / RELEASE_S);
  else env = 1;

  const mixed = sq(F1, t) + sq(F2, t); // ±2 peak
  const sample = mixed * PEAK_GAIN * env; // PEAK_GAIN matches Web Audio gain node
  // Map mixed*PEAK_GAIN (max ±1.0) -> int16
  const clamped = Math.max(-1, Math.min(1, sample));
  samples[i] = Math.round(clamped * 32767);
}

// Build a minimal RIFF/WAVE PCM file
const bytesPerSample = 2;
const numChannels = 1;
const byteRate = SAMPLE_RATE * numChannels * bytesPerSample;
const blockAlign = numChannels * bytesPerSample;
const dataSize = samples.length * bytesPerSample;

const buf = Buffer.alloc(44 + dataSize);
let p = 0;
buf.write('RIFF', p); p += 4;
buf.writeUInt32LE(36 + dataSize, p); p += 4;
buf.write('WAVE', p); p += 4;
buf.write('fmt ', p); p += 4;
buf.writeUInt32LE(16, p); p += 4;            // fmt chunk size
buf.writeUInt16LE(1, p); p += 2;             // PCM
buf.writeUInt16LE(numChannels, p); p += 2;
buf.writeUInt32LE(SAMPLE_RATE, p); p += 4;
buf.writeUInt32LE(byteRate, p); p += 4;
buf.writeUInt16LE(blockAlign, p); p += 2;
buf.writeUInt16LE(bytesPerSample * 8, p); p += 2;
buf.write('data', p); p += 4;
buf.writeUInt32LE(dataSize, p); p += 4;

for (let i = 0; i < samples.length; i++) {
  buf.writeInt16LE(samples[i], 44 + i * 2);
}

const outPath = path.resolve(__dirname, '..', 'horn-preview.wav');
fs.writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
