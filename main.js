const { app, BrowserWindow, ipcMain, nativeImage, Menu, MenuItem, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

const DATA_FILE = path.join(app.getPath('userData'), 'data.json');

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null; // first launch or unreadable -> renderer starts empty
  }
}

function saveData(data) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE); // atomic write, never leaves a half-written file
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: 'Bloom',
    backgroundColor: '#fbf8fc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  });
  win.loadFile('index.html');

  // Right-click on text: offer spelling fixes + standard edit actions.
  win.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu();
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => win.webContents.replaceMisspelling(suggestion)
      }));
    }
    if (params.dictionarySuggestions.length > 0) {
      menu.append(new MenuItem({ type: 'separator' }));
    }
    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'cut', enabled: params.editFlags.canCut }));
      menu.append(new MenuItem({ role: 'copy', enabled: params.editFlags.canCopy }));
      menu.append(new MenuItem({ role: 'paste', enabled: params.editFlags.canPaste }));
    } else if (params.editFlags.canCopy) {
      menu.append(new MenuItem({ role: 'copy' }));
    }
    if (menu.items.length > 0) menu.popup();
  });
}

ipcMain.handle('store:load', () => loadData());
ipcMain.handle('store:save', (_e, data) => {
  saveData(data);
  return true;
});
// Synchronous save (flush before quit/reload) — blocks the renderer until written.
ipcMain.on('store:save-sync', (e, data) => {
  try { saveData(data); e.returnValue = true; } catch { e.returnValue = false; }
});
// Plain clipboard text for the note editor's "paste without formatting" (Cmd+Shift+V).
ipcMain.on('clipboard:read-text', (e) => { e.returnValue = clipboard.readText(); });

// Custom menu so the app keeps its standard shortcuts, but WITHOUT the native
// "Paste and Match Style" item — that frees Cmd/Ctrl+Shift+V for the note editor
// to handle plain-text paste itself (renderer reads the clipboard directly).
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  // Show the Bloom flower in the Dock during development (packaged builds use icon.icns).
  if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON_PATH)) {
    app.dock.setIcon(nativeImage.createFromPath(ICON_PATH));
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
