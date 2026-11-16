const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Chronicle World',
    backgroundColor: '#0e131a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.handle('chronicle:save-file', async (_event, jsonString, defaultName) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save Chronicle World Snapshot',
    defaultPath: defaultName || 'chronicle-world.json',
    filters: [{ name: 'Chronicle World Save', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { saved: false };
  fs.writeFileSync(filePath, jsonString, 'utf-8');
  return { saved: true, filePath };
});

ipcMain.handle('chronicle:open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open Chronicle World Snapshot',
    filters: [{ name: 'Chronicle World Save', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths || filePaths.length === 0) return { opened: false };
  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return { opened: true, content, filePath: filePaths[0] };
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
