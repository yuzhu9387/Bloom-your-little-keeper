// Synthesised "ring" via Web Audio — avoids shipping a binary audio asset.
let ctx = null;

function ensureCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Three short rising beeps.
export function ring() {
  const ac = ensureCtx();
  const now = ac.currentTime;
  const freqs = [660, 880, 1046];
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const t = now + i * 0.22;
    osc.frequency.value = f;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.21);
  });
}
