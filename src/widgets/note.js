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
  const blocks = { DIV: 1, P: 1, LI: 1, H1: 1, H2: 1, BLOCKQUOTE: 1 };
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

  const exec = (cmd, value = null) => {
    editor.focus();
    restoreSelection();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, value);
    normalizeIndent();
    save();
  };

  editor.addEventListener('input', () => { normalizeIndent(); save(); });
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

  const toolbar = buildToolbar(exec);
  body.append(toolbar, editor);
}

function buildToolbar(exec) {
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

  bar.append(
    btn('<b>B</b>', 'Bold', () => exec('bold')),
    btn('<i>I</i>', 'Italic', () => exec('italic')),
    btn('<u>U</u>', 'Underline', () => exec('underline')),
    btn('<s>S</s>', 'Strikethrough', () => exec('strikeThrough')),
    sep(),
    btn('H<sub>1</sub>', 'Heading 1', () => exec('formatBlock', 'H1')),
    btn('H<sub>2</sub>', 'Heading 2', () => exec('formatBlock', 'H2')),
    btn('¶', 'Normal text', () => exec('formatBlock', 'P')),
    sep(),
    btn('•', 'Bulleted list', () => exec('insertUnorderedList')),
    btn('1.', 'Numbered list', () => exec('insertOrderedList')),
    sep()
  );

  const colorBtn = btn('<span class="ink-a">A</span>', 'Text color',
    () => { saveSelection(); openSwatches(colorBtn, TEXT_COLORS, false, (c) => exec('foreColor', c)); });
  const hiliteBtn = btn('<span class="hi-a">A</span>', 'Highlight',
    () => { saveSelection(); openSwatches(hiliteBtn, HILITE_COLORS, true, (c) => exec('hiliteColor', c)); });

  bar.append(colorBtn, hiliteBtn, sep(),
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
