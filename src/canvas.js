// Silky drag + resize engine. No external libraries.
// Drag uses GPU `transform: translate()` (no per-frame layout reflow) and
// batches pointer moves through requestAnimationFrame, then commits to
// left/top on release. Resize batches width/height the same way.
import { updateFrame } from './store.js';

const MIN_W = 220;
const MIN_H = 150;

export function makeInteractive(el, id, frame) {
  el.style.left = frame.x + 'px';
  el.style.top = frame.y + 'px';
  el.style.width = frame.w + 'px';
  el.style.height = frame.h + 'px';

  const head = el.querySelector('.card-head');
  const handle = el.querySelector('.resize-handle');
  const canvas = el.parentElement;

  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.close')) return;
    // Clicking the name input edits it; the rest of the header drags the card.
    if (e.target.closest('.title-input')) return;
    startDrag(e);
  });
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    startResize(e);
  });

  function startDrag(e) {
    e.preventDefault();
    el.classList.add('dragging');
    el.style.willChange = 'transform';
    bringToFront(el);
    head.setPointerCapture(e.pointerId);

    const startX = e.clientX, startY = e.clientY;
    const baseX = el.offsetLeft, baseY = el.offsetTop;

    let curX = baseX, curY = baseY;
    let raf = null;

    const apply = () => {
      raf = null;
      el.style.transform = `translate(${curX - baseX}px, ${curY - baseY}px)`;
    };
    // Only clamp against the origin; the canvas scrolls, so there's no far edge.
    const move = (ev) => {
      curX = Math.max(0, baseX + (ev.clientX - startX));
      curY = Math.max(0, baseY + (ev.clientY - startY));
      if (raf == null) raf = requestAnimationFrame(apply);
    };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      if (raf != null) cancelAnimationFrame(raf);
      el.classList.remove('dragging');
      el.style.willChange = '';
      el.style.transform = '';
      el.style.left = curX + 'px';
      el.style.top = curY + 'px';
      updateFrame(id, { x: curX, y: curY });
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
  }

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('resizing');
    bringToFront(el);
    handle.setPointerCapture(e.pointerId);

    const startX = e.clientX, startY = e.clientY;
    const baseW = el.offsetWidth, baseH = el.offsetHeight;

    let curW = baseW, curH = baseH;
    let raf = null;

    const apply = () => {
      raf = null;
      el.style.width = curW + 'px';
      el.style.height = curH + 'px';
    };
    // Only enforce a minimum size; cards may grow past the viewport (scrollable).
    const move = (ev) => {
      curW = Math.max(MIN_W, baseW + (ev.clientX - startX));
      curH = Math.max(MIN_H, baseH + (ev.clientY - startY));
      if (raf == null) raf = requestAnimationFrame(apply);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      if (raf != null) cancelAnimationFrame(raf);
      el.classList.remove('resizing');
      updateFrame(id, { w: curW, h: curH });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  }
}

let z = 1;
export function bringToFront(el) {
  z += 1;
  el.style.zIndex = z;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
