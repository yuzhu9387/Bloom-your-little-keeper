// Central state: widgets on the canvas + a "closed" history of removed cards.
// Shape: { widgets: [ {id,type,x,y,w,h,data} ], closed: [ {...widget, closedAt} ] }

const DEFAULT_STATE = { widgets: [], closed: [] };

// In Electron, window.api (preload) reads/writes the local data.json (with a
// synchronous save for flush-on-quit). Outside Electron, fall back to localStorage.
const LS_KEY = 'dashboard-data';
const storage = window.api || {
  load: async () => { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; } },
  save: async (data) => { localStorage.setItem(LS_KEY, JSON.stringify(data)); },
  saveSync: (data) => { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
};

let state = structuredClone(DEFAULT_STATE);
let saveTimer = null;

// Whole-state undo/redo history.
const MAX_HISTORY = 60;
let history = [];
let pointer = -1;
let restoring = false;

const clone = (s) => structuredClone(s);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function getState() { return state; }

export async function loadState() {
  const loaded = await storage.load();
  state = loaded && Array.isArray(loaded.widgets) ? loaded : structuredClone(DEFAULT_STATE);
  if (!Array.isArray(state.closed)) state.closed = [];
  history = [clone(state)];
  pointer = 0;
  return state;
}

// Append the current state to the undo history (after a committed change).
function recordHistory() {
  if (restoring) return;
  if (pointer >= 0 && eq(state, history[pointer])) return;
  history = history.slice(0, pointer + 1);
  history.push(clone(state));
  if (history.length > MAX_HISTORY) history.shift();
  pointer = history.length - 1;
}

// Debounced persist — writes settle 500ms after the last change.
export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    storage.save(state);
    recordHistory();
  }, 500);
}

// Flush any pending write immediately and synchronously (call before quit/reload
// so nothing is lost when the app closes within the debounce window).
export function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (storage.saveSync) storage.saveSync(state); else storage.save(state);
  recordHistory();
}

export function addWidget(widget) {
  recordHistory(); // checkpoint the pre-add state so the add is its own undo step
  state.widgets.push(widget);
  scheduleSave();
}

// Close a card -> move it to the recoverable history instead of destroying it.
export function closeWidget(id) {
  const i = state.widgets.findIndex((w) => w.id === id);
  if (i < 0) return;
  recordHistory(); // checkpoint the pre-close state for a clean undo
  const [w] = state.widgets.splice(i, 1);
  w.closedAt = Date.now();
  state.closed.unshift(w);
  if (state.closed.length > 40) state.closed.length = 40;
  scheduleSave();
}

export function getClosed() { return state.closed || []; }

// Restore a closed card back onto the canvas; returns the widget (or null).
export function restoreClosed(id) {
  const i = (state.closed || []).findIndex((w) => w.id === id);
  if (i < 0) return null;
  recordHistory(); // checkpoint so reopening is its own undo step
  const [w] = state.closed.splice(i, 1);
  delete w.closedAt;
  state.widgets.push(w);
  scheduleSave();
  return w;
}

export function clearClosed() { state.closed = []; scheduleSave(); }

export function getWidget(id) { return state.widgets.find((w) => w.id === id); }

export function updateFrame(id, frame) {
  const w = getWidget(id);
  if (!w) return;
  Object.assign(w, frame);
  scheduleSave();
}

// Undo / redo whole-state. Return true if the UI should be rebuilt.
export function canUndo() { return pointer > 0 || (saveTimer != null); }
export function canRedo() { return pointer < history.length - 1; }

export function undo() {
  flushSave(); // make sure the latest change is recorded before stepping back
  if (pointer <= 0) return false;
  pointer -= 1;
  applyRestore(history[pointer]);
  return true;
}

export function redo() {
  if (pointer >= history.length - 1) return false;
  pointer += 1;
  applyRestore(history[pointer]);
  return true;
}

function applyRestore(snap) {
  restoring = true;
  state = clone(snap);
  if (storage.saveSync) storage.saveSync(state); else storage.save(state);
  restoring = false;
}

let idCounter = 0;
export function newId() {
  idCounter += 1;
  return 'w' + Date.now().toString(36) + (idCounter).toString(36);
}
