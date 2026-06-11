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

  // Editable title — double-click to rename (single-click/drag moves the card).
  const title = document.createElement('span');
  title.className = 'title';
  title.spellcheck = true;
  title.title = 'Double-click to rename';
  title.addEventListener('dblclick', () => {
    title.contentEditable = 'true';
    title.classList.add('editing');
    title.focus();
    const range = document.createRange();
    range.selectNodeContents(title);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
  });
  const commitTitle = () => {
    const t = title.textContent.trim() || 'Untitled';
    title.textContent = t;
    title.contentEditable = 'false';
    title.classList.remove('editing');
    widget.data.title = t;
    scheduleSave();
  };
  title.addEventListener('blur', commitTitle);

  const close = document.createElement('button');
  close.className = 'close';
  close.textContent = '✕';
  close.title = 'Remove card';
  close.addEventListener('click', () => {
    card.remove();
    removeWidget(widget.id);
  });
  head.append(title, close);

  const body = document.createElement('div');
  body.className = 'card-body';

  const handle = document.createElement('div');
  handle.className = 'resize-handle';

  card.append(head, body, handle);
  canvas.appendChild(card);

  card.addEventListener('mousedown', () => bringToFront(card));
  makeInteractive(card, widget.id, widget);

  // Widgets call this to set their title; skip while the user is editing it.
  const onTitle = (t) => { if (document.activeElement !== title) title.textContent = t; };
  spec.render(body, widget, onTitle);
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
