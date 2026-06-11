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

export function renderCountdown(body, widget, onTitle) {
  const d = widget.data;
  onTitle(d.title);
  body.innerHTML = '';

  // Title — prominent and editable here; mirrors the card header.
  const titleInput = document.createElement('input');
  titleInput.className = 'cd-title';
  titleInput.placeholder = 'Event name…';
  titleInput.spellcheck = true;
  titleInput.value = d.title === 'Countdown' ? '' : d.title;
  titleInput.addEventListener('input', () => {
    d.title = titleInput.value.trim() || 'Countdown';
    onTitle(d.title);
    scheduleSave();
  });

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

  body.append(titleInput, display, dateRow);

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
}
