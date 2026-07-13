// Todo card: a single ordered list of nodes — folders and loose tasks mixed
// together and sorted as one. Folders nest their own tasks. Drag tasks to
// reorder, drop them into a folder, or pull them back out; drag folders to
// reorder among the loose tasks; move either onto another card.
import { scheduleSave, getWidget } from '../store.js';
import { renderTaskRow } from './task-row.js';

export const todoDefaults = () => ({
  title: 'Todo',
  tab: 'active',
  // node: { id, type:'todo', text, done }
  //   or  { id, type:'folder', name, collapsed, items:[{id,text,done}] }
  nodes: []
});

function uid(p) {
  return p + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
}

// Upgrade older shapes (flat items, or folders+items) to the unified nodes list.
function migrate(d) {
  if (Array.isArray(d.nodes)) return;
  const items = Array.isArray(d.items) ? d.items : [];
  const folders = Array.isArray(d.folders) ? d.folders : [];
  const nodes = [];
  items.filter((it) => !it.folderId).forEach((it) =>
    nodes.push({ id: it.id, type: 'todo', text: it.text, done: !!it.done }));
  folders.forEach((f) => nodes.push({
    id: f.id, type: 'folder', name: f.name, collapsed: !!f.collapsed,
    items: items.filter((it) => it.folderId === f.id).map((it) => ({ id: it.id, text: it.text, done: !!it.done }))
  }));
  d.nodes = nodes;
  delete d.items;
  delete d.folders;
}

let dragging = null;

function rerenderCard(id) {
  document.querySelector(`.card[data-id="${id}"]`)?.__rerender?.();
}

// Task row to insert before within a folder's list (null = append).
function insertRef(list, y) {
  for (const r of list.querySelectorAll('.todo-item:not(.dragging-item)')) {
    const b = r.getBoundingClientRect();
    if (y < b.top + b.height / 2) return r;
  }
  return null;
}

// Top-level node (loose task or folder) to insert before (null = append).
function topRef(scroll, y, exceptId) {
  const nodes = [...scroll.children].filter((el) =>
    el.classList.contains('top-node') && el.dataset.nodeId !== exceptId);
  for (const el of nodes) {
    const b = el.getBoundingClientRect();
    if (y < b.top + b.height / 2) return el;
  }
  return null;
}

function clearIndicators(body) {
  body.querySelectorAll('.drop-before, .drop-end, .top-drop-before, .folder-hot')
    .forEach((e) => e.classList.remove('drop-before', 'drop-end', 'top-drop-before', 'folder-hot'));
  body.querySelector('.todo-scroll')?.classList.remove('top-drop-end');
}

// Pull a task out of wherever it lives in a card (loose node or a folder item).
function extractTask(d, id) {
  const ti = d.nodes.findIndex((n) => n.type === 'todo' && n.id === id);
  if (ti >= 0) { const [n] = d.nodes.splice(ti, 1); return { id: n.id, text: n.text, done: n.done }; }
  for (const n of d.nodes) {
    if (n.type === 'folder') {
      const ii = n.items.findIndex((it) => it.id === id);
      if (ii >= 0) return n.items.splice(ii, 1)[0];
    }
  }
  return null;
}

function moveTask(fromId, toId, taskId, target) {
  const from = getWidget(fromId), to = getWidget(toId);
  if (!from || !to || to.type !== 'todo') return;
  migrate(from.data); migrate(to.data);
  const task = extractTask(from.data, taskId);
  if (!task) return;
  if (target.folderId) {
    const folder = to.data.nodes.find((n) => n.type === 'folder' && n.id === target.folderId);
    if (folder) {
      folder.collapsed = false; // expand so the dropped task is visible
      let at = folder.items.length;
      if (target.beforeItemId) { const i = folder.items.findIndex((x) => x.id === target.beforeItemId); if (i >= 0) at = i; }
      folder.items.splice(at, 0, { id: task.id, text: task.text, done: task.done });
    } else {
      to.data.nodes.push({ id: task.id, type: 'todo', text: task.text, done: task.done });
    }
  } else {
    const node = { id: task.id, type: 'todo', text: task.text, done: task.done };
    let at = to.data.nodes.length;
    if (target.beforeNodeId) { const i = to.data.nodes.findIndex((n) => n.id === target.beforeNodeId); if (i >= 0) at = i; }
    to.data.nodes.splice(at, 0, node);
  }
  if (fromId !== toId) to.data.tab = task.done ? 'done' : 'active';
  scheduleSave();
  rerenderCard(fromId);
  if (toId !== fromId) rerenderCard(toId);
}

function moveFolder(fromId, toId, folderId, beforeNodeId) {
  const from = getWidget(fromId), to = getWidget(toId);
  if (!from || !to || to.type !== 'todo') return;
  migrate(from.data); migrate(to.data);
  const i = from.data.nodes.findIndex((n) => n.type === 'folder' && n.id === folderId);
  if (i < 0) return;
  const [folder] = from.data.nodes.splice(i, 1);
  let at = to.data.nodes.length;
  if (beforeNodeId) { const j = to.data.nodes.findIndex((n) => n.id === beforeNodeId); if (j >= 0) at = j; }
  to.data.nodes.splice(at, 0, folder);
  to.data.tab = 'active'; // folders only render on the Active tab — make sure it shows
  scheduleSave();
  rerenderCard(fromId);
  if (toId !== fromId) rerenderCard(toId);
}

export function renderTodo(body, widget, onTitle) {
  const d = widget.data;
  migrate(d);
  onTitle(d.title);
  body.innerHTML = '';

  if (!body.dataset.dropWired) {
    body.dataset.dropWired = '1';
    body.addEventListener('dragover', (e) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearIndicators(body);
      const scroll = body.querySelector('.todo-scroll');
      const folderList = dragging.kind === 'todo' ? e.target.closest('.folder-items') : null;
      if (folderList) {
        const ref = insertRef(folderList, e.clientY);
        if (ref) ref.classList.add('drop-before'); else folderList.classList.add('drop-end');
        folderList.closest('.todo-folder')?.classList.add('folder-hot');
      } else {
        const ref = topRef(scroll, e.clientY, dragging.id);
        if (ref) ref.classList.add('top-drop-before'); else scroll?.classList.add('top-drop-end');
      }
    });
    body.addEventListener('dragleave', (e) => { if (!body.contains(e.relatedTarget)) clearIndicators(body); });
    body.addEventListener('drop', (e) => {
      if (!dragging) return;
      e.preventDefault();
      const drag = dragging;
      clearIndicators(body);
      const scroll = body.querySelector('.todo-scroll');
      if (drag.kind === 'folder') {
        const ref = topRef(scroll, e.clientY, drag.id);
        moveFolder(drag.fromWidget, widget.id, drag.id, ref ? ref.dataset.nodeId : null);
      } else {
        const folderList = e.target.closest('.folder-items');
        if (folderList) {
          const ref = insertRef(folderList, e.clientY);
          moveTask(drag.fromWidget, widget.id, drag.id, { folderId: folderList.dataset.folder, beforeItemId: ref ? ref.dataset.itemId : null });
        } else {
          const ref = topRef(scroll, e.clientY, drag.id);
          moveTask(drag.fromWidget, widget.id, drag.id, { beforeNodeId: ref ? ref.dataset.nodeId : null });
        }
      }
      dragging = null; // re-render can destroy the source grip before its dragend fires
    });
  }

  const tabs = document.createElement('div');
  tabs.className = 'todo-tabs';
  tabs.append(tabBtn('Active'), tabBtn('Done'));
  body.appendChild(tabs);

  const scroll = document.createElement('div');
  scroll.className = 'todo-scroll';
  body.appendChild(scroll);

  let shown = 0;
  if (d.tab === 'done') {
    // Done is a flat list of individual completed tasks — no folders.
    d.nodes.forEach((node) => {
      if (node.type === 'folder') node.items.forEach((it) => { if (it.done) { scroll.appendChild(renderTask(it, false)); shown++; } });
      else if (node.done) { scroll.appendChild(renderTask(node, false)); shown++; }
    });
  } else {
    // Active shows folders (with their open tasks) interleaved with loose tasks.
    d.nodes.forEach((node) => {
      if (node.type === 'folder') { scroll.appendChild(renderFolder(node)); shown++; }
      else if (!node.done) { scroll.appendChild(renderTask(node, true)); shown++; }
    });
  }
  if (shown === 0) {
    const empty = document.createElement('div');
    empty.className = 'todo-empty';
    empty.textContent = d.tab === 'active' ? 'No tasks yet. Add one or make a project below.' : 'Nothing done yet.';
    scroll.appendChild(empty);
  }

  if (d.tab === 'active') {
    const foot = document.createElement('div');
    foot.className = 'todo-foot';
    foot.appendChild(addRow('New todo…', (text) => {
      d.nodes.push({ id: uid('t'), type: 'todo', text, done: false });
      scheduleSave(); rerender();
    }));
    const newFolder = document.createElement('button');
    newFolder.className = 'new-folder-btn';
    newFolder.innerHTML = '<span>＋</span> Project';
    newFolder.title = 'New project folder';
    newFolder.addEventListener('click', () => {
      d.nodes.push({ id: uid('f'), type: 'folder', name: 'Project', collapsed: false, items: [] });
      scheduleSave(); rerender();
      const inputs = body.querySelectorAll('.folder-name');
      inputs[inputs.length - 1]?.focus();
    });
    foot.appendChild(newFolder);
    body.appendChild(foot);
  }

  function rerender() { renderTodo(body, widget, onTitle); }
  function matchesTab(t) { return d.tab === 'active' ? !t.done : t.done; }

  function deleteTask(id) {
    const ti = d.nodes.findIndex((n) => n.type === 'todo' && n.id === id);
    if (ti >= 0) d.nodes.splice(ti, 1);
    else for (const n of d.nodes) {
      if (n.type === 'folder') { const ii = n.items.findIndex((x) => x.id === id); if (ii >= 0) { n.items.splice(ii, 1); break; } }
    }
    scheduleSave(); rerender();
  }

  function tabBtn(label) {
    const key = label.toLowerCase();
    const b = document.createElement('button');
    b.textContent = label;
    if (d.tab === key) b.classList.add('active');
    b.addEventListener('click', () => { d.tab = key; scheduleSave(); rerender(); });
    return b;
  }

  function addRow(placeholder, onAdd) {
    const add = document.createElement('div');
    add.className = 'todo-add';
    const input = document.createElement('input');
    input.placeholder = placeholder;
    input.spellcheck = true;
    const fire = () => { const t = input.value.trim(); if (!t) return; input.value = ''; onAdd(t); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });
    const btn = document.createElement('button');
    btn.textContent = 'Add';
    btn.className = 'add-btn';
    btn.addEventListener('click', fire);
    add.append(input, btn);
    return add;
  }

  function renderFolder(folder) {
    const el = document.createElement('div');
    el.className = 'todo-folder top-node' + (folder.collapsed ? ' collapsed' : '');
    el.dataset.nodeId = folder.id;

    const head = document.createElement('div');
    head.className = 'folder-head';

    const caret = document.createElement('span');
    caret.className = 'folder-caret';
    caret.textContent = folder.collapsed ? '▸' : '▾';
    caret.addEventListener('click', () => { folder.collapsed = !folder.collapsed; scheduleSave(); rerender(); });

    const grip = document.createElement('span');
    grip.className = 'folder-grip';
    grip.textContent = '⠿';
    grip.title = 'Drag project';
    grip.draggable = true;
    grip.addEventListener('dragstart', (e) => {
      dragging = { kind: 'folder', fromWidget: widget.id, id: folder.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', folder.name);
      e.dataTransfer.setDragImage(head, 12, 14);
      el.classList.add('dragging-folder');
    });
    grip.addEventListener('dragend', () => { dragging = null; el.classList.remove('dragging-folder'); });

    const name = document.createElement('input');
    name.className = 'folder-name';
    name.value = folder.name;
    name.spellcheck = true;
    name.size = Math.max(folder.name.length, 4);
    name.addEventListener('input', () => {
      name.size = Math.max(name.value.length, 4);
      folder.name = name.value.trim() || 'Project';
      scheduleSave();
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });

    const count = document.createElement('span');
    count.className = 'folder-count';
    const remaining = folder.items.filter((it) => !it.done).length;
    count.textContent = remaining ? String(remaining) : '';

    const del = document.createElement('button');
    del.className = 'folder-del';
    del.textContent = '✕';
    del.title = 'Delete project (tasks move out)';
    del.addEventListener('click', () => {
      const idx = d.nodes.indexOf(folder);
      const loose = folder.items.map((it) => ({ id: it.id, type: 'todo', text: it.text, done: it.done }));
      d.nodes.splice(idx, 1, ...loose);
      scheduleSave(); rerender();
    });

    head.append(caret, grip, name, count, del);
    el.appendChild(head);

    const items = document.createElement('div');
    items.className = 'folder-items droplist';
    items.dataset.folder = folder.id;
    if (folder.collapsed) items.style.display = 'none';
    folder.items.filter(matchesTab).forEach((it) => items.appendChild(renderTask(it, false)));
    if (d.tab === 'active' && !folder.collapsed) {
      items.appendChild(addRow('Add to ' + folder.name + '…', (text) => {
        folder.items.push({ id: uid('t'), text, done: false });
        scheduleSave(); rerender();
      }));
    }
    el.appendChild(items);
    return el;
  }

  function renderTask(task, isTop) {
    const { row } = renderTaskRow(task, {
      onToggle: (done) => { task.done = done; scheduleSave(); rerender(); },
      onEdit: (v) => { task.text = v; scheduleSave(); },
      onDelete: () => deleteTask(task.id),
      extraClass: isTop ? 'top-node' : ''
    });
    row.dataset.itemId = task.id;
    if (isTop) row.dataset.nodeId = task.id;

    // No dragging in the Done tab — it's a flat, fixed list.
    if (d.tab === 'active') {
      const grip = document.createElement('span');
      grip.className = 'grip';
      grip.textContent = '⠿';
      grip.title = 'Drag to reorder, into a project, or to another card';
      grip.draggable = true;
      grip.addEventListener('dragstart', (e) => {
        dragging = { kind: 'todo', fromWidget: widget.id, id: task.id };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.text);
        e.dataTransfer.setDragImage(row, 12, 16);
        row.classList.add('dragging-item');
      });
      grip.addEventListener('dragend', () => { dragging = null; row.classList.remove('dragging-item'); });
      row.prepend(grip);
    }
    return row;
  }
}
