// Note card: an auto-saving textarea with light markdown-style editing aids —
// Tab to indent, Shift+Tab to outdent, "- "/"* " becomes a "• " bullet, and
// Enter continues the bullet list (empty bullet clears the line).
import { scheduleSave } from '../store.js';

export const noteDefaults = () => ({
  title: 'Note',
  text: ''
});

const INDENT = '  '; // two spaces per level

export function renderNote(body, widget, onTitle) {
  const d = widget.data;
  onTitle(d.title);
  body.innerHTML = '';

  const area = document.createElement('textarea');
  area.className = 'note-area';
  area.placeholder = 'Jot anything…\nTab to indent · "- " makes a • bullet';
  area.spellcheck = true;
  area.value = d.text || '';

  const save = () => { d.text = area.value; scheduleSave(); };
  area.addEventListener('input', save);
  area.addEventListener('keydown', (e) => onKey(e, area, save));

  body.appendChild(area);
}

// Replace the textarea content and restore the caret, then persist.
function apply(area, value, caret, save) {
  area.value = value;
  area.selectionStart = area.selectionEnd = caret;
  save();
}

function lineBounds(val, pos) {
  const start = val.lastIndexOf('\n', pos - 1) + 1;
  let end = val.indexOf('\n', pos);
  if (end === -1) end = val.length;
  return { start, end };
}

function onKey(e, area, save) {
  const val = area.value;
  const pos = area.selectionStart;
  const { start, end } = lineBounds(val, pos);
  const beforeCaret = val.slice(start, pos);
  const fullLine = val.slice(start, end);

  // Tab / Shift+Tab — indent or outdent the current line.
  if (e.key === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) {
      const removed = fullLine.match(/^ {1,2}/);
      if (removed) {
        const cut = removed[0].length;
        apply(area, val.slice(0, start) + fullLine.slice(cut) + val.slice(end),
          Math.max(start, pos - cut), save);
      }
    } else {
      apply(area, val.slice(0, pos) + INDENT + val.slice(pos), pos + INDENT.length, save);
    }
    return;
  }

  // "- " or "* " at the start of a line -> "• "
  if (e.key === ' ' && /^(\s*)[-*]$/.test(beforeCaret)) {
    e.preventDefault();
    const indent = beforeCaret.match(/^(\s*)/)[1];
    const newLine = indent + '• ';
    apply(area, val.slice(0, start) + newLine + val.slice(pos), start + newLine.length, save);
    return;
  }

  // Enter on a bullet line -> continue it; empty bullet -> clear the line.
  if (e.key === 'Enter' && !e.shiftKey) {
    const m = fullLine.match(/^(\s*)• (.*)$/);
    if (m) {
      e.preventDefault();
      if (m[2].trim() === '') {
        apply(area, val.slice(0, start) + val.slice(end), start, save);
      } else {
        const ins = '\n' + m[1] + '• ';
        apply(area, val.slice(0, pos) + ins + val.slice(pos), pos + ins.length, save);
      }
    }
  }
}
