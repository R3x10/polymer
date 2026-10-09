// Proceso principal de la app de escritorio: levanta PostgreSQL y la API y abre la interfaz en una ventana.
// Con --sin-ventana solo levanta los servicios (lo usa la prueba de CI); --detener cierra la instancia abierta.
const { app, BrowserWindow, dialog, Menu, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Servicios } = require('./servicios');

const sinVentana = process.argv.includes('--sin-ventana');
const detener = process.argv.includes('--detener');

if (!app.requestSingleInstanceLock()) {
  // Ya hay una instancia: ella recibe los argumentos en "second-instance".
  app.exit(0);
  return;
}
if (detener) {
  // No había instancia que detener.
  app.exit(0);
  return;
}

const datos = app.getPath('userData');
const estado = path.join(datos, 'estado.json');
const recursos = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'recursos');
let ventana = null;
let url = null;
let saliendo = false;

const servicios = new Servicios({
  recursos,
  datos,
  node: process.execPath,
  aviso: (msg) => ventana?.webContents.executeJavaScript(`window.aviso && window.aviso(${JSON.stringify(msg)})`).catch(() => {}),
});

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'PuSelfhost',
    autoHideMenuBar: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  ventana.webContents.setWindowOpenHandler(({ url: destino }) => {
    void shell.openExternal(destino);
    return { action: 'deny' };
  });
  ventana.on('closed', () => (ventana = null));
  return ventana.loadFile(path.join(__dirname, 'cargando.html'));
}

function menu() {
  return Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        { label: 'Abrir en el navegador', click: () => url && shell.openExternal(url) },
        { label: 'Abrir carpeta de datos', click: () => shell.openPath(datos) },
        { type: 'separator' },
        { label: 'Salir', role: 'quit' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', role: 'reload' },
        { label: 'Acercar', role: 'zoomIn' },
        { label: 'Alejar', role: 'zoomOut' },
        { label: 'Tamaño normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
        { label: 'Herramientas de desarrollo', role: 'toggleDevTools' },
      ],
    },
  ]);
}

app.on('second-instance', (_evento, argv) => {
  if (argv.includes('--detener')) return app.quit();
  if (ventana) {
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  } else if (!sinVentana && url) {
    void crearVentana().then(() => ventana.loadURL(url));
  }
});

app.on('before-quit', (evento) => {
  if (saliendo) return;
  evento.preventDefault();
  saliendo = true;
  fs.rmSync(estado, { force: true });
  servicios.detener().finally(() => app.exit(0));
});

app.on('window-all-closed', () => {
  if (!sinVentana) app.quit();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(menu());
  if (!sinVentana) await crearVentana();
  try {
    ({ url } = await servicios.iniciar());
    fs.writeFileSync(estado, JSON.stringify({ url, pid: process.pid }));
    if (ventana) await ventana.loadURL(url);
  } catch (error) {
    fs.writeFileSync(estado, JSON.stringify({ error: String(error?.message ?? error) }));
    if (!sinVentana) dialog.showErrorBox('PuSelfhost no pudo arrancar', String(error?.message ?? error));
    saliendo = true;
    await servicios.detener().catch(() => {});
    app.exit(1);
  }
});
