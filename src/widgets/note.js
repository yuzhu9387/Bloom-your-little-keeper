// Note card: a customizable rich-text notebook with a formatting toolbar.
// Bold / italic / underline / strike, headings, lists, theme-colored text and
// highlight, clear formatting, and Sublime-style block indent on Tab.
import { scheduleSave } from '../store.js';

export const noteDefaults = () => ({
  title: 'Note',
  html: ''
});

// Palettes drawn from the app's theme.
const TEXT_COLORS = ['#5b5666', '#3c9b76', '#d9744f', '#8158c4', '#d56497', '#2f7fb8'];
const HILITE_COLORS = ['#e7f6ef', '#fdeee6', '#efe8fb', '#fdeaf2', '#fff1c2', '#d9f0fb'];

// Remember the last text/highlight colour across cards and restarts, so a single
// click on the colour button re-applies it (the dropdown is still there to change).
const LS_TEXT = 'bloom.note.textColor';
const LS_HILITE = 'bloom.note.hiliteColor';
let lastTextColor = localStorage.getItem(LS_TEXT) || TEXT_COLORS[4];   // theme pink
let lastHiliteColor = localStorage.getItem(LS_HILITE) || HILITE_COLORS[4]; // soft yellow

let savedRange = null;
function saveSelection() {
  const s = window.getSelection();
  savedRange = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
}
function restoreSelection() {
  if (!savedRange) return;
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(savedRange);
}

function escapeHtml(t) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function textToHtml(text) {
  return text.split('\n').map((l) => `<div>${escapeHtml(l) || '<br>'}</div>`).join('');
}

// The nearest block element holding the caret (or the editor itself).
function currentBlock(node, editor) {
  let el = node.nodeType === 3 ? node.parentElement : node;
  const blocks = { DIV: 1, P: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, BLOCKQUOTE: 1 };
  while (el && el !== editor) {
    if (blocks[el.tagName]) return el;
    el = el.parentElement;
  }
  return editor;
}

// Markdown shortcut on space: "- "/"* " -> bullet list, "1. " -> numbered list.
// Returns true if it transformed (caller then prevents the space).
function autoList(editor) {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return false;
  const block = currentBlock(range.startContainer, editor);
  if (block.tagName === 'LI' || (block.closest && block.closest('li'))) return false;

  const pre = document.createRange();
  pre.setStart(block, 0);
  pre.setEnd(range.startContainer, range.startOffset);
  const before = pre.toString();

  let cmd = null;
  if (before === '-' || before === '*') cmd = 'insertUnorderedList';
  else if (/^\d+\.$/.test(before)) cmd = 'insertOrderedList';
  if (!cmd) return false;

  pre.deleteContents();           // remove the typed marker
  pre.collapse(true);
  sel.removeAllRanges();
  sel.addRange(pre);
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd);
  return true;
}

export function renderNote(body, widget, onTitle) {
  const d = widget.data;
  onTitle(d.title);
  body.innerHTML = '';
  body.classList.add('note-body');

  const editor = document.createElement('div');
  editor.className = 'note-rich';
  editor.contentEditable = 'true';
  editor.spellcheck = true;
  editor.dataset.placeholder = 'Write freely…';
  if (d.html) editor.innerHTML = d.html;
  else if (d.text) editor.innerHTML = textToHtml(d.text);

  const save = () => { d.html = editor.innerHTML; scheduleSave(); };

  // Normalize execCommand indent blockquotes to a clean ~4-char step, no border.
  const normalizeIndent = () => {
    editor.querySelectorAll('blockquote').forEach((b) => {
      b.style.margin = '0 0 0 28px';
      b.style.border = 'none';
      b.style.padding = '0';
    });
  };

  // Format the LIVE selection/caret. Toolbar buttons preventDefault on mousedown,
  // so the editor keeps its selection while the button is clicked — no restore.
  const exec = (cmd, value = null) => {
    editor.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, value);
    normalizeIndent();
    save();
  };

  // Swatch popups can steal the selection (focus moves to the popup), so the
  // colour/highlight pickers save the range on open and restore it before applying.
  const execOnSaved = (cmd, value = null) => {
    editor.focus();
    restoreSelection();
    exec(cmd, value);
  };

  // Headings toggle: apply the level, or fall back to a plain paragraph when the
  // line is already that heading — so H1…H4 can always turn back into normal text.
  // queryCommandValue('formatBlock') reports the current block tag (lowercased)
  // reliably, even when the selection has collapsed onto the editor root.
  const toggleHeading = (tag) => {
    editor.focus();
    const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase();
    exec('formatBlock', cur === tag.toLowerCase() ? 'P' : tag);
  };

  editor.addEventListener('input', () => { normalizeIndent(); save(); });

  // Opt+Cmd+1..4 -> toggle H1..H4. We read e.code because macOS rewrites e.key
  // when Option is held ("¡", "™", …) but the physical key stays 'Digit1'..'Digit4'.
  editor.addEventListener('keydown', (e) => {
    if (e.metaKey && e.altKey && /^Digit[1-4]$/.test(e.code)) {
      e.preventDefault();
      toggleHeading('H' + e.code.slice(-1));
    }
  });
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand(e.shiftKey ? 'outdent' : 'indent');
      normalizeIndent();
      save();
      return;
    }
    // "- "/"* " -> bullet list, "1. " -> numbered list (markdown shortcuts)
    if (e.key === ' ' && autoList(editor)) {
      e.preventDefault();
      normalizeIndent();
      save();
    }
  });

  // Cmd/Ctrl+Shift+V: paste the text value only, stripping all formatting.
  // We read the clipboard directly (the native "Paste and Match Style" menu item
  // is removed in main.js so this shortcut reaches us) and insert plain text.
  editor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      const text = window.api && window.api.readClipboardText ? window.api.readClipboardText() : '';
      if (text) {
        editor.focus();
        document.execCommand('insertText', false, text);
        save();
      }
    }
  });

  // Embed images (e.g. a pasted screenshot) inline — contentEditable ignores
  // raw image clipboard data by default, so we read it and insert an <img>.
  editor.addEventListener('paste', (e) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const imageItem = Array.from(dt.items).find((it) => it.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      editor.focus();
      document.execCommand('insertHTML', false,
        `<img src="${reader.result}" style="max-width:100%;height:auto;">`);
      save();
    };
    reader.readAsDataURL(file);
  });

  const toolbar = buildToolbar(exec, execOnSaved, toggleHeading);
  body.append(toolbar, editor);
}

function buildToolbar(exec, execOnSaved, toggleHeading) {
  const bar = document.createElement('div');
  bar.className = 'note-toolbar';

  const btn = (label, title, onClick, cls = '') => {
    const b = document.createElement('button');
    b.className = 'fmt' + (cls ? ' ' + cls : '');
    b.innerHTML = label;
    b.title = title;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor selection
    b.addEventListener('click', onClick);
    return b;
  };

  const sep = () => { const s = document.createElement('span'); s.className = 'fmt-sep'; return s; };

  // Split colour control: the main half applies the remembered colour in one
  // click; the ▾ half opens the palette (and remembers the new pick).
  const colorControl = (kind) => {
    const isText = kind === 'text';
    const palette = isText ? TEXT_COLORS : HILITE_COLORS;
    const cmd = isText ? 'foreColor' : 'hiliteColor';

    const ink = document.createElement('span');
    ink.className = isText ? 'ink-a' : 'hi-a';
    ink.textContent = 'A';
    const paint = () => {
      const c = isText ? lastTextColor : lastHiliteColor;
      if (isText) { ink.style.color = c; ink.style.borderBottomColor = c; }
      else { ink.style.background = c === 'transparent' ? 'transparent' : c; }
    };
    paint();

    const main = btn('', isText ? 'Text colour (last used)' : 'Highlight (last used)',
      () => exec(cmd, isText ? lastTextColor : lastHiliteColor), 'fmt-split-main');
    main.appendChild(ink);

    const caret = btn('▾', 'Choose colour', () => {
      saveSelection();
      openSwatches(caret, palette, !isText, (c) => {
        if (isText) { lastTextColor = c; localStorage.setItem(LS_TEXT, c); }
        else { lastHiliteColor = c; localStorage.setItem(LS_HILITE, c); }
        paint();
        execOnSaved(cmd, c);
      });
    }, 'fmt-split-caret');

    const wrap = document.createElement('span');
    wrap.className = 'fmt-split';
    wrap.append(main, caret);
    return wrap;
  };

  bar.append(
    btn('<b>B</b>', 'Bold', () => exec('bold')),
    btn('<i>I</i>', 'Italic', () => exec('italic')),
    btn('<u>U</u>', 'Underline', () => exec('underline')),
    btn('<s>S</s>', 'Strikethrough', () => exec('strikeThrough')),
    sep(),
    btn('H<sub>1</sub>', 'Heading 1  (⌥⌘1) — click again for normal text', () => toggleHeading('H1')),
    btn('H<sub>2</sub>', 'Heading 2  (⌥⌘2) — click again for normal text', () => toggleHeading('H2')),
    btn('H<sub>3</sub>', 'Heading 3  (⌥⌘3) — click again for normal text', () => toggleHeading('H3')),
    btn('H<sub>4</sub>', 'Heading 4  (⌥⌘4) — click again for normal text', () => toggleHeading('H4')),
    sep(),
    btn('•', 'Bulleted list', () => exec('insertUnorderedList')),
    btn('1.', 'Numbered list', () => exec('insertOrderedList')),
    sep(),
    colorControl('text'),
    colorControl('hilite'),
    sep(),
    btn('⌫', 'Clear formatting', () => { exec('removeFormat'); exec('formatBlock', 'P'); })
  );

  return bar;
}

let openPop = null;
function openSwatches(anchor, colors, withNone, onPick) {
  if (openPop) { openPop.remove(); openPop = null; }
  const pop = document.createElement('div');
  pop.className = 'swatch-pop';
  pop.addEventListener('mousedown', (e) => e.preventDefault());

  colors.forEach((c) => {
    const s = document.createElement('button');
    s.className = 'swatch';
    s.style.background = c;
    s.addEventListener('click', () => { onPick(c); close(); });
    pop.appendChild(s);
  });
  if (withNone) {
    const none = document.createElement('button');
    none.className = 'swatch swatch-none';
    none.textContent = '✕';
    none.title = 'No highlight';
    none.addEventListener('click', () => { onPick('transparent'); close(); });
    pop.appendChild(none);
  }

  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(r.left, window.innerWidth - 170) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  openPop = pop;

  const outside = (ev) => { if (!pop.contains(ev.target) && ev.target !== anchor) close(); };
  function close() {
    pop.remove();
    openPop = null;
    document.removeEventListener('mousedown', outside, true);
  }
  setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
}
