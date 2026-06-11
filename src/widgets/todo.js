// Todo card: Active / Done tabs, checkbox with a strike animation that moves
// the item to Done when it completes.
import { scheduleSave } from '../store.js';

export const todoDefaults = () => ({
  title: 'Todo',
  tab: 'active',
  items: [] // { id, text, done }
});

function uid() {
  return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

export function renderTodo(body, widget, onTitle) {
  const d = widget.data;
  onTitle(d.title);
  body.innerHTML = '';

  const tabs = document.createElement('div');
  tabs.className = 'todo-tabs';
  const activeBtn = tabBtn('Active', d.tab === 'active');
  const doneBtn = tabBtn('Done', d.tab === 'done');
  tabs.append(activeBtn, doneBtn);
  body.appendChild(tabs);

  const list = document.createElement('div');
  list.className = 'todo-list';
  body.appendChild(list);

  const visible = d.items.filter((it) => (d.tab === 'active' ? !it.done : it.done));
  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'todo-empty';
    empty.textContent = d.tab === 'active' ? 'No active todos. Add one below.' : 'Nothing done yet.';
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

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = it.done;
    cb.addEventListener('change', () => {
      if (cb.checked && !it.done) {
        // play strike animation, then flip to done and move to Done tab
        row.classList.add('striking');
        const txt = row.querySelector('.text');
        const finish = () => { it.done = true; scheduleSave(); rerender(); };
        txt.addEventListener('animationend', finish, { once: true });
        setTimeout(finish, 700); // fallback if animationend never fires
      } else {
        it.done = cb.checked;
        scheduleSave();
        rerender();
      }
    });

    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = it.text;

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', () => {
      d.items = d.items.filter((x) => x.id !== it.id);
      widget.data = d;
      scheduleSave();
      rerender();
    });

    row.append(cb, text, del);
    return row;
  }
}
