// Minute timer: set minutes, Start counts down, rings + blinks at zero.
import { scheduleSave } from '../store.js';
import { ring } from '../sound.js';

export const timerDefaults = () => ({
  title: 'Timer',
  minutes: 5,
  remaining: 5 * 60, // seconds
  running: false
});

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function renderTimer(body, widget, onTitle) {
  const d = widget.data;
  d.running = false; // never auto-resume across reloads; user restarts intentionally
  onTitle(d.title);
  body.innerHTML = '';

  let interval = null;
  let ringing = false;

  const wrap = document.createElement('div');
  wrap.className = 'timer';

  const setRow = document.createElement('div');
  setRow.className = 'timer-set';
  const minInput = document.createElement('input');
  minInput.type = 'number';
  minInput.min = '1';
  minInput.value = d.minutes;
  const minLabel = document.createElement('span');
  minLabel.textContent = 'min';
  setRow.append(minInput, minLabel);

  const clock = document.createElement('div');
  clock.className = 'clock';
  clock.textContent = fmt(d.remaining);

  const ctrl = document.createElement('div');
  ctrl.className = 'timer-ctrl';
  const startBtn = document.createElement('button');
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset';
  ctrl.append(startBtn, resetBtn);

  wrap.append(setRow, clock, ctrl);
  body.appendChild(wrap);

  function stopRinging() {
    ringing = false;
    wrap.classList.remove('ringing');
  }

  function tick() {
    d.remaining -= 1;
    if (d.remaining <= 0) {
      d.remaining = 0;
      clearInterval(interval);
      interval = null;
      d.running = false;
      ringing = true;
      wrap.classList.add('ringing');
      ring();
      startBtn.textContent = 'Start';
    }
    clock.textContent = fmt(d.remaining);
    scheduleSave();
  }

  function start() {
    if (interval) return;
    if (d.remaining <= 0) d.remaining = d.minutes * 60;
    stopRinging();
    d.running = true;
    startBtn.textContent = 'Pause';
    interval = setInterval(tick, 1000);
    scheduleSave();
  }

  function pause() {
    clearInterval(interval);
    interval = null;
    d.running = false;
    startBtn.textContent = 'Start';
    scheduleSave();
  }

  startBtn.textContent = 'Start';
  startBtn.addEventListener('click', () => (interval ? pause() : start()));

  resetBtn.addEventListener('click', () => {
    clearInterval(interval);
    interval = null;
    stopRinging();
    d.running = false;
    d.remaining = d.minutes * 60;
    startBtn.textContent = 'Start';
    clock.textContent = fmt(d.remaining);
    scheduleSave();
  });

  minInput.addEventListener('change', () => {
    let v = parseInt(minInput.value, 10);
    if (isNaN(v) || v < 1) v = 1;
    minInput.value = v;
    d.minutes = v;
    if (!interval) { d.remaining = v * 60; clock.textContent = fmt(d.remaining); }
    scheduleSave();
  });

  // Stop the interval if the card is removed from the DOM.
  const observer = new MutationObserver(() => {
    if (!document.body.contains(wrap)) {
      clearInterval(interval);
      observer.disconnect();
    }
  });
  observer.observe(document.getElementById('canvas'), { childList: true, subtree: true });
}
