// Shared task row used by the todo and planner cards: round checkbox with the
// strike-through completion animation, contenteditable text, and a delete
// button. Callers own the data — mutations are reported through callbacks.
export function renderTaskRow(task, { onToggle, onEdit, onDelete, extraClass = '' }) {
  const row = document.createElement('div');
  row.className = 'todo-item' + (task.done ? ' done' : '') + (extraClass ? ' ' + extraClass : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = task.done;
  cb.addEventListener('change', () => {
    if (cb.checked && !task.done) {
      row.classList.add('striking');
      let fired = false;
      const finish = () => { if (!fired) { fired = true; onToggle(true); } };
      text.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 700); // fallback if the animation never fires
    } else onToggle(cb.checked);
  });

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = task.text;
  text.contentEditable = 'plaintext-only';
  text.spellcheck = true;
  text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); text.blur(); } });
  text.addEventListener('blur', () => {
    const v = text.textContent.trim();
    if (!v) onDelete();
    else if (v !== task.text) onEdit(v);
  });

  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = '✕';
  del.title = 'Delete';
  del.addEventListener('click', () => onDelete());

  row.append(cb, text, del);
  return { row, text };
}
