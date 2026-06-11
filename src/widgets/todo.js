// Todo card: Active / Done tabs, editable task text, a strike animation that
// moves a task to Done, and a grip handle to drag a task onto another Todo card.
import { scheduleSave, getWidget } from '../store.js';

export const todoDefaults = () => ({
  title: 'Todo',
  tab: 'active',
  items: [] // { id, text, done }
});

function uid() {
  return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

// Tracks the task currently being dragged (so drop targets only accept ours).
let dragging = null;

// The visible task to insert before, given a pointer Y (null = append at end).
function insertRef(list, y) {
  const rows = [...list.querySelectorAll('.todo-item:not(.dragging-item)')];
  for (const r of rows) {
    const box = r.getBoundingClientRect();
    if (y < box.top + box.height / 2) return r;
  }
  return null;
}

function clearIndicators(body) {
  body.querySelectorAll('.todo-item.drop-before').forEach((r) => r.classList.remove('drop-before'));
  body.querySelector('.todo-list')?.classList.remove('drop-end');
}

// Move/reorder a task: pull it from its source list and insert it into the
// target list before `beforeId` (or at the end). Handles same-card reordering
// and cross-card moves with one path, then re-renders both cards.
function moveItem(fromId, toId, itemId, beforeId) {
  const from = getWidget(fromId);
  const to = getWidget(toId);
  if (!from || !to || to.type !== 'todo' || !Array.isArray(from.data.items)) return;
  const idx = from.data.items.findIndex((i) => i.id === itemId);
  if (idx === -1) return;
  const [item] = from.data.items.splice(idx, 1);
  if (!Array.isArray(to.data.items)) to.data.items = [];
  let at = to.data.items.length;
  if (beforeId) {
    const bi = to.data.items.findIndex((i) => i.id === beforeId);
    if (bi !== -1) at = bi;
  }
  to.data.items.splice(at, 0, item);
  if (fromId !== toId) to.data.tab = item.done ? 'done' : 'active'; // show where it landed
  scheduleSave();
  document.querySelector(`.card[data-id="${fromId}"]`)?.__rerender?.();
  if (toId !== fromId) document.querySelector(`.card[data-id="${toId}"]`)?.__rerender?.();
}

export function renderTodo(body, widget, onTitle) {
  const d = widget.data;
  onTitle(d.title);
  body.innerHTML = '';

  // Accept dropped tasks anywhere in the card body — reorder within this list
  // or move in from another. Wired once per card.
  if (!body.dataset.dropWired) {
    body.dataset.dropWired = '1';
    body.addEventListener('dragover', (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragging.fromWidget !== widget.id) body.classList.add('drop-target');
      const list = body.querySelector('.todo-list');
      if (!list) return;
      clearIndicators(body);
      const ref = insertRef(list, e.clientY);
      if (ref) ref.classList.add('drop-before');
      else list.classList.add('drop-end');
    });
    body.addEventListener('dragleave', (e) => {
      if (!body.contains(e.relatedTarget)) { body.classList.remove('drop-target'); clearIndicators(body); }
    });
    body.addEventListener('drop', (e) => {
      if (!dragging) return;
      e.preventDefault();
      const list = body.querySelector('.todo-list');
      const ref = list ? insertRef(list, e.clientY) : null;
      const beforeId = ref ? ref.dataset.itemId : null;
      const { fromWidget, itemId } = dragging;
      body.classList.remove('drop-target');
      clearIndicators(body);
      moveItem(fromWidget, widget.id, itemId, beforeId);
    });
  }

  const tabs = document.createElement('div');
  tabs.className = 'todo-tabs';
  tabs.append(tabBtn('Active', d.tab === 'active'), tabBtn('Done', d.tab === 'done'));
  body.appendChild(tabs);

  const list = document.createElement('div');
  list.className = 'todo-list';
  body.appendChild(list);

  const visible = d.items.filter((it) => (d.tab === 'active' ? !it.done : it.done));
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'todo-empty';
    empty.textContent = d.tab === 'active'
      ? 'No active todos. Add one below.'
      : 'Nothing done yet.';
    list.appendChild(empty);
  }
  visible.forEach((it) => list.appendChild(renderItem(it)));

  if (d.tab === 'active') {
    const add = document.createElement('div');
    add.className = 'todo-add';
    const input = document.createElement('input');
    input.placeholder = 'New todo…';
    input.spellcheck = true;
    const addItem = () => {
      const text = input.value.trim();
      if (!text) return;
      d.items.push({ id: uid(), text, done: false });
      input.value = '';
      scheduleSave();
      rerender();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });
    const btn = document.createElement('button');
    btn.textContent = 'Add';
    btn.className = 'add-btn';
    btn.addEventListener('click', addItem);
    add.append(input, btn);
    body.appendChild(add);
  }

  function rerender() { renderTodo(body, widget, onTitle); }

  function tabBtn(label, active) {
    const b = document.createElement('button');
    b.textContent = label;
    if (active) b.classList.add('active');
    b.addEventListener('click', () => { d.tab = label.toLowerCase(); scheduleSave(); rerender(); });
    return b;
  }

  function renderItem(it) {
    const row = document.createElement('div');
    row.className = 'todo-item' + (it.done ? ' done' : '');
    row.dataset.itemId = it.id;

    // Grip — the only draggable part, so the text stays freely editable.
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⠿';
    grip.title = 'Drag to another list';
    grip.draggable = true;
    grip.addEventListener('dragstart', (e) => {
      dragging = { fromWidget: widget.id, itemId: it.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', it.text);
      e.dataTransfer.setDragImage(row, 12, 16);
      row.classList.add('dragging-item');
    });
    grip.addEventListener('dragend', () => {
      dragging = null;
      row.classList.remove('dragging-item');
    });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = it.done;
    cb.addEventListener('change', () => {
      if (cb.checked && !it.done) {
        row.classList.add('striking');
        const txt = row.querySelector('.text');
        const finish = () => { it.done = true; scheduleSave(); rerender(); };
        txt.addEventListener('animationend', finish, { once: true });
        setTimeout(finish, 700);
      } else {
        it.done = cb.checked;
        scheduleSave();
        rerender();
      }
    });

    // Editable task text — click to edit, Enter or blur to save, empty deletes.
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = it.text;
    text.contentEditable = 'plaintext-only';
    text.spellcheck = true;
    text.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); text.blur(); }
    });
    text.addEventListener('blur', () => {
      const v = text.textContent.trim();
      if (!v) {
        d.items = d.items.filter((x) => x.id !== it.id);
        scheduleSave();
        rerender();
      } else if (v !== it.text) {
        it.text = v;
        scheduleSave();
      }
    });

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', () => {
      d.items = d.items.filter((x) => x.id !== it.id);
      scheduleSave();
      rerender();
    });

    row.append(grip, cb, text, del);
    return row;
  }
}
