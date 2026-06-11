# Dashboard

A personal desktop dashboard for macOS: a free canvas where you drag and resize
cards for **todos**, **countdown days**, a **minute timer**, and **notes**.
State is saved to a local JSON file automatically.

## Run (development)

```bash
npm install      # one-time, downloads Electron
npm start        # opens the app window
```

## Build a double-clickable Mac app

```bash
npm run dist     # produces a .dmg / .app under dist/
```

Then drag `Dashboard.app` to Applications and launch it like any Mac app.

## Cards

- **Todo** — `Active` / `Done` tabs. Checking an item plays a strike-through
  animation, then moves it to `Done`. Add items at the bottom, `Enter` to add.
- **Countdown** — enter a title and a target date; shows days left (or days ago
  if past). Recalculated against today.
- **Timer** — set minutes, `Start` counts down `mm:ss`, rings a tone and blinks
  when it hits zero. `Pause` / `Reset` available.
- **Note** — a free-form auto-saving text area.

## Storage

Everything (card positions, sizes, content) is one JSON file at:

```
~/Library/Application Support/architect-desktop-app/data.json
```

Writes are debounced 500ms after the last change, so nothing is lost on quit.

## Layout

- `main.js` — Electron main process; window + atomic local-file read/write.
- `preload.js` — safe `load`/`save` bridge to the renderer.
- `src/store.js` — in-memory state + debounced persistence.
- `src/canvas.js` — drag + resize engine (no libraries).
- `src/widgets/*.js` — one file per card type.
- `src/app.js` — wires toolbar, card chrome, and widget dispatch.
