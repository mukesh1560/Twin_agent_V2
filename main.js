const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = process.env.PORT || '5000';
const URL = `http://127.0.0.1:${PORT}`;

let win = null;
let py = null;
let tail = '';
let failed = '';
let quitting = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ping() {
  return new Promise((resolve) => {
    const req = http.get(URL, (res) => { res.resume(); resolve(res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

function showMsg(text) {
  if (!win || win.isDestroyed()) return;
  win.webContents
    .executeJavaScript(`document.getElementById('msg').textContent = ${JSON.stringify(text)}`)
    .catch(() => {});
}

function startServer() {
  const cmd = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  py = spawn(cmd, ['app.py'], {
    cwd: __dirname, // app.py reads .env and data/ from here
    env: { ...process.env, PORT, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  const keep = (d) => { tail = (tail + d.toString()).slice(-1500); };
  py.stdout.on('data', keep);
  py.stderr.on('data', keep);
  py.on('error', (e) => { failed = `Could not start Python (${cmd}): ${e.message}`; });
  py.on('exit', () => { if (!quitting && !failed) failed = tail || 'The server stopped unexpectedly.'; });
}

async function waitForServer() {
  const deadline = Date.now() + 5 * 60 * 1000; // first run downloads the embedding model
  while (Date.now() < deadline && !quitting) {
    if (failed) return false;
    if (await ping()) return true;
    await sleep(700);
  }
  failed = failed || 'Timed out waiting for the server to start.';
  return false;
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 820,
    title: 'TWIN AI M1',
    backgroundColor: '#e0e7ff',
  });
  win.setMenuBarVisibility(false);
  await win.loadFile('loading.html');

  startServer();
  if (await waitForServer()) win.loadURL(URL);
  else showMsg(failed);
}

app.whenReady().then(createWindow);
app.on('before-quit', () => { quitting = true; if (py) py.kill(); });
app.on('window-all-closed', () => app.quit());
