// Central state: a flat list of widgets. Everything persists through here.
// Shape: { widgets: [ { id, type, x, y, w, h, data } ] }

const DEFAULT_STATE = { widgets: [] };

// In Electron, window.api (preload) reads/writes the local data.json.
// Outside Electron (plain browser preview), fall back to localStorage so the
// UI still works for inspection.
const LS_KEY = 'dashboard-data';
const storage = window.api || {
  load: async () => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
  },
  save: async (data) => { localStorage.setItem(LS_KEY, JSON.stringify(data)); }
};

let state = structuredClone(DEFAULT_STATE);
let saveTimer = null;

export function getState() {
  return state;
}

export async function loadState() {
  const loaded = await storage.load();
  state = loaded && Array.isArray(loaded.widgets) ? loaded : structuredClone(DEFAULT_STATE);
  return state;
}

// Debounced persist — every mutation calls this; writes settle 500ms after the last change.
export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    storage.save(state);
    saveTimer = null;
  }, 500);
}

export function addWidget(widget) {
  state.widgets.push(widget);
  scheduleSave();
}

export function removeWidget(id) {
  state.widgets = state.widgets.filter((w) => w.id !== id);
  scheduleSave();
}

export function getWidget(id) {
  return state.widgets.find((w) => w.id === id);
}

// Mutate a widget's frame (position/size) and persist.
export function updateFrame(id, frame) {
  const w = getWidget(id);
  if (!w) return;
  Object.assign(w, frame);
  scheduleSave();
}

let idCounter = 0;
export function newId() {
  idCounter += 1;
  return 'w' + Date.now().toString(36) + (idCounter).toString(36);
}
