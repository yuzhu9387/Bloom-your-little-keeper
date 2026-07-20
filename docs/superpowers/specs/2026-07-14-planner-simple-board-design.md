# Weekly Planner → Simple Task Board

Date: 2026-07-14
Status: Approved

## Goal

Turn the Week widget from an hourly timetable into a simple Mon–Sun task board:
seven day columns, each a plain vertical task list. No hours, no view toggle, no
now-line. Done tasks keep their data but leave the board. Tasks can be freely
reordered within a column and dragged to another day.

## Decisions (from brainstorming)

- **7-column kanban** (Mon–Sun). Each column is a vertical list of tasks; today's
  column is highlighted. Columns scroll vertically when full; the card scrolls
  horizontally when narrow.
- **Drop the hourly grid** entirely, plus the Week/Day toggle, Day fullscreen,
  day nav, time axis, and the current-time line.
- **Done tasks**: checking a task strikes it, sets `done:true`, and removes it
  from the board — but it stays in the data file (history retained).
- **`✕`** permanently deletes a task from the data file.
- **Truncated single-line text**; click opens a floating popup with the full,
  editable text (unchanged from today).
- **Free reordering**: drag a task to reorder within its column, or drop it into
  another day's column at a chosen position (insertion indicator).

## Data model

```js
widget.data = {
  title: 'Weekly Plan',
  // entries: day-index -> ordered tasks. Keys are "0".."6" (0=Mon … 6=Sun).
  entries: { "0": [ { id, text, done } ], ... }
}
```

### Migration

Older data was keyed `"day-hour"`. On load:

- For each key `"d-h"`, bucket its tasks under day `d`, ordering buckets by hour
  ascending so a day's tasks keep their chronological order, then concatenating
  each cell's own order.
- Drop the `task` field (already all tasks) and the `view` / `selectedDay`
  fields. Coerce missing `done` to `false`.
- A key is treated as legacy iff it contains a `-`; new day keys are plain
  integers `"0".."6"`.

## Components (`src/widgets/planner.js`)

- `plannerDefaults()` → `{ title: 'Weekly Plan', entries: {} }`.
- `renderPlanner(body, widget, onTitle)`:
  - `body` is a horizontal flex row of 7 `.board-col` columns (no grid).
  - Each column: a header (weekday name, `today` class on the current day), a
    scrollable `.board-list` of that day's **non-done** tasks, and an add input
    at the bottom (Enter commits a new `{id,text,done:false}`).
  - **Task row** (`renderTaskRow`): reuses `.todo-item` look. `draggable`.
    checkbox → strike → `done=true` → save + rerender; text → popup; `✕` →
    delete. Same as today minus the day/hour params (now day only).
  - **Detail popup** (`openDetail`): unchanged behavior.
  - **Drag & drop**:
    - `dragstart` sets `dragging = { id, day }`.
    - Column `dragover` computes the insert-before task (by cursor Y among rows)
      and shows an insertion line; `dragleave`/`drop`/`dragend` clear it.
    - `drop` moves the task: splice it out of its source day list, then insert
      into the target day list before the computed task id (or append). Empty
      source day keys are deleted. Save + rerender.
  - No now-line, no timers, no fullscreen.

## app.js / styles.css / README

- `app.js describe()` for planner: unchanged (counts non-done tasks across all
  day lists) — update it to read the new day-keyed shape.
- `styles.css`: remove `.planner-grid`, `.planner-hour`, `.planner-corner`,
  `.planner-day-head` grid rules, `.planner-now-line`, `.planner-toolbar` /
  `.planner-seg` / `.planner-daynav`, and the `.card.fullscreen` rules (already
  gone). Add `.planner-board` (flex row), `.board-col`, `.board-col-head`,
  `.board-list`, and the insertion-line indicator. Keep `.planner-task`,
  `.planner-add`, `.planner-input`, `.planner-popup`, and the drag classes.
- README: update the Week card row to describe the board.

## Error handling

- Legacy/missing data coerced by migration; non-array day lists ignored.
- Empty new-task input or emptied popup discards/deletes; empty day lists drop
  their key.
- Drag with no valid target is a no-op (dragging cleared on dragend).

## Testing / verification

No test framework. Verify in-browser:
- Old hourly data migrates into per-day columns, order preserved.
- Add tasks per day; long text truncates; click opens popup; edit persists.
- Check a task → leaves board, stays in data with `done:true`; `✕` purges it.
- Drag to reorder within a column and across to another day, with insertion line.
- Today's column highlighted. Reload persists. Todo card regression intact.
