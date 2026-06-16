// Countdown-date ("days until") card. Two things matter and both are editable
// right here: the title (an obvious input, kept in sync with the card header)
// and the time (the date -> a big day count).
import { scheduleSave } from '../store.js';

export const countdownDefaults = () => ({
  title: 'Countdown',
  date: '' // 'YYYY-MM-DD'
});

// Whole-day difference between today (local midnight) and the target date.
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  if (isNaN(target)) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

// ---- Shared daily refresh ----
// One timer drives every countdown card. It fires just after the next local
// midnight (recompute once per day — no frequent polling) and reschedules.
// We also refresh when the window regains focus/visibility, which is cheap and
// catches the day rolling over while the laptop slept (timers can stall then).
const liveCards = new Set(); // each entry: { el, refresh }
let schedulerStarted = false;

function msUntilAfterMidnight() {
  const now = new Date();
  // 00:00:05 tomorrow — the small cushion avoids firing a hair before midnight.
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  return next - now;
}

function refreshAll() {
  for (const card of liveCards) {
    if (!document.contains(card.el)) { liveCards.delete(card); continue; } // closed / re-mounted
    card.refresh();
  }
}

function startScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const tick = () => { refreshAll(); setTimeout(tick, msUntilAfterMidnight()); };
  setTimeout(tick, msUntilAfterMidnight());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(); });
  window.addEventListener('focus', refreshAll);
}

export function renderCountdown(body, widget, onTitle) {
  const d = widget.data;
  onTitle(d.title);
  body.innerHTML = '';

  const display = document.createElement('div');
  display.className = 'cd-display';
  const num = document.createElement('div');
  num.className = 'num';
  const label = document.createElement('div');
  label.className = 'label';
  display.append(num, label);

  const dateRow = document.createElement('div');
  dateRow.className = 'cd-daterow';
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.value = d.date || '';
  dateRow.appendChild(dateInput);

  body.append(display, dateRow);

  const renderDisplay = () => {
    const n = daysUntil(d.date);
    num.className = 'num';
    if (n === null) {
      num.textContent = '—';
      label.textContent = 'Pick a date below';
    } else if (n > 0) {
      num.textContent = n;
      label.textContent = n === 1 ? 'day left' : 'days left';
    } else if (n === 0) {
      num.textContent = '0';
      num.classList.add('today');
      label.textContent = 'is today!';
    } else {
      num.textContent = Math.abs(n);
      num.classList.add('past');
      label.textContent = Math.abs(n) === 1 ? 'day ago' : 'days ago';
    }
  };

  dateInput.addEventListener('change', () => {
    d.date = dateInput.value;
    scheduleSave();
    renderDisplay();
  });

  renderDisplay();

  // Keep this card's day count fresh across midnight (see startScheduler).
  // Pruning detached cards first keeps the set from growing on re-mounts.
  for (const card of liveCards) if (!document.contains(card.el)) liveCards.delete(card);
  liveCards.add({ el: display, refresh: renderDisplay });
  startScheduler();
}
