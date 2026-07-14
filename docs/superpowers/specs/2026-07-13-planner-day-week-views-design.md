# Weekly Planner — Day/Week Views Redesign

Date: 2026-07-13
Status: Approved

## Goal

Rework the Week planner card into a task board with two views (Week and Day),
fixed-size hour cells that scroll internally, all entries as tasks, and a
click-to-expand detail popup for long task text.

## Decisions (from brainstorming)

- **All entries are tasks.** Drop the `/t` prefix and the `task` boolean.
  Existing plain entries are treated as tasks on load.
- **Two views**, toggled by a segmented `Week | Day` control in a fixed toolbar
  at the top of the card body:
  - **Week**: the 7-column Mon–Sun grid; card stays a normal draggable/resizable
    card. Clicking a day header jumps to that day's Day view.
  - **Day**: one selected day (single wide column). The card goes **fullscreen**
    (`position:fixed; inset:0`, above everything); switching back to Week restores
    the prior size/position. Day toolbar adds `‹ <weekday> ›` prev/next nav.
    Default `selectedDay` is today.
- **Fixed hour cells**: each hour cell has a fixed height (56px) and does not grow;
  when it holds more tasks than fit, the cell scrolls vertically inside. Columns
  keep a min-width; in Week view the card scrolls horizontally when narrow.
- **Checking a task** plays the strike animation, sets `done:true`, and removes it
  from the board — but the task **stays in the data file** (history retained).
- **The per-row `✕`** permanently deletes the task from the data file.
- **Task text does not wrap**: a too-long task shows only its start with an
  ellipsis. **Clicking the text opens a lightweight floating popup** showing the
  full text (editable); clicking elsewhere or Esc closes it; emptying it deletes
  the task.
- **Keep** the current-time red line (both views) and the History summary (now
  counts only active tasks).

## Data model

```js
widget.data = {
  title: 'Weekly Plan',
  view: 'week',        // 'week' | 'day'
  selectedDay: 0,      // 0=Mon … 6=Sun, used by Day view
  entries: {}          // "day-hour" -> [ { id, text, done } ]
}
```

Migration on load: if any entry has a `task` field, drop it (all are tasks now);
coerce missing `done` to `false`. `view`/`selectedDay` default when absent.

## Components (`src/widgets/planner.js`)

- `plannerDefaults()` returns the shape above.
- `renderPlanner(body, widget, onTitle)`:
  - Builds `body` as a flex column: a non-scrolling **toolbar** + a
    `.planner-scroll` container holding the grid.
  - **Toolbar**: `Week | Day` segmented buttons; in Day view also the
    `‹ weekday ›` nav. Toggling sets `d.view` (and `applyFullscreen`), saves,
    rerenders.
  - **Grid**:
    - Week: columns `54px repeat(7, minmax(120px,1fr))`, day headers + 24 hours.
    - Day: columns `54px minmax(120px,1fr)`, single day header + 24 hours.
    - `grid-auto-rows: 56px` (fixed). Each cell `overflow-y:auto`.
  - **Cell**: lists non-done tasks via `renderTaskRow` (local), plus a `＋` that
    opens an inline input; Enter commits a new `{id,text,done:false}` task.
  - **Task row** (reuses `.todo-item`/`.striking` CSS for look + strike animation):
    - checkbox → strike animation → `done=true` → save + rerender (row disappears).
    - text span: truncated (`nowrap`+ellipsis), `click` opens the detail popup.
    - `✕` → splice the task out of its cell array (delete key if empty) → save.
  - **Detail popup** (`openDetail(anchorEl, task, day, hour)`): a floating
    `.planner-popup` positioned near the row, containing an editable multi-line
    field seeded with `task.text`. Input updates `task.text` (save, refresh the
    row's truncated text). Empty on close deletes the task. Closes on outside
    click / Esc. Only one popup at a time.
  - **Now-line**: unchanged logic; in Day view only shown when `selectedDay` is
    today. Positioned from live layout, refreshed every 60s.
  - **Fullscreen**: `applyFullscreen()` toggles a `fullscreen` class on the card
    element (`body.closest('.card')`) for Day view; Week view removes it.

The planner no longer imports `task-row.js`; `todo.js` keeps using it.

## app.js / index.html / styles.css

- `app.js describe()` for planner: count active (non-done) tasks, e.g.
  `"7 tasks"`.
- `styles.css`: `.planner-toolbar`, `.planner-scroll`, fixed `grid-auto-rows`,
  per-cell `overflow-y:auto`, task-text ellipsis, `.planner-popup`, and
  `.card.fullscreen { position:fixed; inset:0; width:100vw; height:100vh;
  z-index:9999; border-radius:0 }`.
- No index.html change (the `+ Week` button stays).

## Error handling

- Legacy/missing data coerced by migration; non-array cell values ignored.
- Empty task text (new input or emptied popup) discards/deletes the task; empty
  cell arrays drop their key.
- Now-line hidden when the current day isn't visible (Day view on another day).

## Testing / verification

No test framework. Verify in-browser:
- Add tasks; long text truncates; click opens popup with full text; edit persists.
- Check a task → disappears from board; data file still holds it with `done:true`.
- `✕` removes it from the data file entirely.
- Week↔Day toggle; Day goes fullscreen and back; day nav; header click jumps.
- Fixed cell height with internal scroll when a cell is overfull.
- Now-line correct in Week and in Day (only on today).
- Reload persists view, selectedDay, and entries. Todo card regression intact.
