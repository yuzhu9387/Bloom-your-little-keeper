# Weekly Planner Widget — Design

Date: 2026-07-13
Status: Approved

## Goal

A new "Week" card: a Monday–Sunday timetable with 1-hour intervals where the user
plans what to do in each slot. Entries typed with a `/t ` prefix become checkable
tasks, reusing the todo card's task row component.

## Decisions (from brainstorming)

- **Layout**: 7-column week grid (Mon–Sun header, sticky), left time axis with one
  row per hour (sticky), body scrolls both ways. Full 24 hours (0:00–23:00),
  default scroll position at 7:00.
- **`/t` semantics**: per-entry, not per-widget. An entry committed starting with
  `/t ` has the prefix stripped and becomes a task (checkbox row). Other entries
  are plain text. Editing an existing plain entry to start with `/t ` converts it.
- **Week data**: fixed Mon–Sun template, not bound to real dates. Content persists
  until the user changes it. Today's column and the current hour row are
  highlighted (recomputed every minute).
- **Entries per cell**: multiple entries allowed per hour cell; cell height grows.

## Architecture

### New shared component: `src/widgets/task-row.js` (Approach A)

Extract the reusable core of todo's `renderTask` (todo.js:334): checkbox +
strike-through completion animation + contenteditable text + delete button.
Parameterized with callbacks:

```js
renderTaskRow(task, { onToggle, onEdit, onDelete, extraClass })
// task: { text, done }
```

`todo.js` is refactored to build its rows from this factory; the drag grip and
drag wiring stay inside todo.js (planner does not need drag). Visual classes
(`.todo-item`, `.text`, `.striking`, `.del`) are unchanged so existing CSS and
the strike animation apply to both widgets.

### New widget: `src/widgets/planner.js`

- `plannerDefaults()`:

```js
{ title: 'Weekly Plan',
  entries: {} }
// entries key: "day-hour" (day 0=Mon … 6=Sun, hour 0–23)
// value: array of { id, text, task: bool, done: bool }
```

- `renderPlanner(body, widget, onTitle)` renders the grid:
  - CSS grid: corner cell + 7 day headers (sticky top), 24 time-axis cells
    (sticky left), 7×24 slot cells.
  - Each slot lists its entries; a faint `+` (visible on hover) opens an inline
    input; Enter commits, Esc/blur-empty cancels.
  - Commit parsing: `/t <text>` → task entry rendered via `renderTaskRow`;
    otherwise plain text entry (click to edit, empty text deletes it).
  - Plain-entry edit that results in a `/t ` prefix converts it to a task.
  - Today column + current hour row get highlight classes; a 60s interval
    refreshes them (cleared when the card element is removed).
  - All mutations go through `scheduleSave()` like other widgets.

### Registration & chrome

- `app.js`: add `planner` to `REGISTRY` (default ~640×480), import render/defaults.
- `index.html`: toolbar button `+ Week`.
- `app.js describe()`: planner case, e.g. `"12 plans · 3 tasks"`.
- `styles.css`: `.planner-*` grid styles, `card--planner` accent color, following
  existing card theming conventions.

## Error handling

- Missing/legacy data: `entries` defaults to `{}`; non-array cell values ignored.
- Empty commits are discarded; deleting the last entry removes the cell key.

## Testing / verification

Repo has no test framework. Verify by running the app:
new Week card renders grid; add plain + `/t` entries; toggle/strike a task;
edit and delete entries; data survives reload; todo card regression (add,
complete, drag, folders) still works.
