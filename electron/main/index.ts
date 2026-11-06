import { app, BrowserWindow, session, shell } from 'electron'
import { join } from 'node:path'
import { registerPreferencesIpc } from './preferences'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'ELECTRIBE MINI',
    backgroundColor: '#16161a',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Open external links in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Allow Web MIDI for our own pages only.
 *
 * Chromium routes every requestMIDIAccess() call through the 'midiSysex'
 * permission, even when the page asks for { sysex: false }, so both names must
 * be granted. The renderer only ever requests sysex: false, and the app opens
 * no MIDI outputs, so it cannot send SysEx to the hardware.
 */
function configurePermissions(): void {
  const isOwnOrigin = (origin: string) =>
    origin.startsWith('file://') ||
    origin.startsWith('http://localhost:') ||
    origin.startsWith('http://127.0.0.1:')
  const isMidi = (permission: string) => permission === 'midi' || permission === 'midiSysex'

  session.defaultSession.setPermissionCheckHandler(
    (_wc, permission, origin) => isMidi(permission) && isOwnOrigin(origin),
  )
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(isMidi(permission) && isOwnOrigin(wc.getURL()))
  })
}

void app.whenReady().then(() => {
  configurePermissions()
  registerPreferencesIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
