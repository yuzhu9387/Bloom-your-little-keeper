import { getState, loadState, addWidget, removeWidget, newId, scheduleSave } from './store.js';
import { makeInteractive, bringToFront } from './canvas.js';
import { renderTodo, todoDefaults } from './widgets/todo.js';
import { renderCountdown, countdownDefaults } from './widgets/countdown-date.js';
import { renderTimer, timerDefaults } from './widgets/timer.js';
import { renderNote, noteDefaults } from './widgets/note.js';

const canvas = document.getElementById('canvas');

const REGISTRY = {
  todo: { render: renderTodo, defaults: todoDefaults, w: 280, h: 340 },
  countdown: { render: renderCountdown, defaults: countdownDefaults, w: 260, h: 230 },
  timer: { render: renderTimer, defaults: timerDefaults, w: 240, h: 220 },
  note: { render: renderNote, defaults: noteDefaults, w: 280, h: 240 }
};

// Build the card chrome (header + body + resize handle) and mount its widget.
function mountCard(widget) {
  const spec = REGISTRY[widget.type];
  if (!spec) return;

  const card = document.createElement('div');
  card.className = 'card card--' + widget.type;
  card.dataset.id = widget.id;

  const head = document.createElement('div');
  head.className = 'card-head';

  // Editable name — a compact input that auto-sizes to its text. Click to edit.
  const defaultName = spec.defaults().title;
  const title = document.createElement('input');
  title.className = 'title-input';
  title.spellcheck = true;
  title.setAttribute('aria-label', 'Card name');
  title.value = widget.data.title || defaultName;
  title.size = Math.max(title.value.length, 4); // fallback sizing when field-sizing is unsupported
  title.addEventListener('input', () => {
    title.size = Math.max(title.value.length, 4);
    widget.data.title = title.value.trim() || defaultName;
    scheduleSave();
  });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') title.blur();
  });
  title.addEventListener('blur', () => {
    if (!title.value.trim()) { title.value = defaultName; title.size = defaultName.length; }
  });

  // Spacer fills the rest of the header so the card still drags from there.
  const fill = document.createElement('div');
  fill.className = 'title-fill';

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '✕';
  close.title = 'Remove card';
  close.addEventListener('click', () => {
    card.remove();
    removeWidget(widget.id);
  });
  head.append(title, fill, close);

  const body = document.createElement('div');
  body.className = 'card-body';

  const handle = document.createElement('div');
  handle.className = 'resize-handle';

  card.append(head, body, handle);
  canvas.appendChild(card);

  card.addEventListener('mousedown', () => bringToFront(card));
  makeInteractive(card, widget.id, widget);

  // Widgets call this to set their name; skip while the user is editing it.
  const onTitle = (t) => {
    if (document.activeElement !== title) { title.value = t; title.size = Math.max(t.length, 4); }
  };
  // Expose a re-render hook so other cards can refresh this one (e.g. a todo
  // task dragged from another list).
  card.__rerender = () => spec.render(body, widget, onTitle);
  card.__rerender();
}

// Place a new card near the top-left with a slight cascade so they don't stack.
let spawnOffset = 0;
function spawn(type) {
  const spec = REGISTRY[type];
  spawnOffset = (spawnOffset + 28) % 200;
  const widget = {
    id: newId(),
    type,
    x: 40 + spawnOffset,
    y: 40 + spawnOffset,
    w: spec.w,
    h: spec.h,
    data: spec.defaults()
  };
  addWidget(widget);
  mountCard(widget);
}

document.querySelectorAll('#toolbar button[data-add]').forEach((btn) => {
  btn.addEventListener('click', () => spawn(btn.dataset.add));
});

// Boot: restore saved widgets.
loadState().then(() => {
  getState().widgets.forEach(mountCard);
});
