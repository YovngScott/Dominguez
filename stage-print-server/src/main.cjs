"use strict";

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { createPrintServer } = require("./server.cjs");
const { listPrinters, printRawZpl } = require("./windows-print.cjs");

const PORT = Number(process.env.STAGE_PRINT_PORT || 9100);
const TOKEN = process.env.STAGE_PRINT_TOKEN || "dps-7f3a9c2e1b4d6f8a0e5c3b7d9a1f4e2c";
const VERSION = "1.1.0";

let mainWindow = null;
let tray = null;
let httpServer = null;
let status = { running: false, port: PORT, lastError: "", lastPrint: null };

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
  } catch {
    return { printerName: "4BARCODE 4B-2074B" };
  }
}

function saveSettings(next) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), "utf8");
}

function iconPath() {
  return path.join(__dirname, "..", "assets", "icon.png");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 650,
    minWidth: 620,
    minHeight: 560,
    show: false,
    title: "STAGE AI LABS Print Server",
    icon: iconPath(),
    backgroundColor: "#090b10",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function showWindow() {
  if (!mainWindow) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 20, height: 20 });
  tray = new Tray(image);
  tray.setToolTip("STAGE AI LABS Print Server");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir panel", click: showWindow },
      { label: `Servidor: localhost:${PORT}`, enabled: false },
      { type: "separator" },
      {
        label: "Abrir estado en navegador",
        click: () => shell.openExternal(`http://127.0.0.1:${PORT}/health`)
      },
      { type: "separator" },
      {
        label: "Salir",
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on("double-click", showWindow);
}

async function startServer() {
  try {
    const settings = loadSettings();
    httpServer = await createPrintServer({
      port: PORT,
      token: TOKEN,
      version: VERSION,
      getDefaultPrinter: () => loadSettings().printerName,
      listPrinters,
      printRawZpl: async ({ zpl, printerName }) => {
        const chosen = printerName || loadSettings().printerName;
        if (!chosen) throw new Error("No hay una impresora configurada.");
        await printRawZpl(chosen, zpl);
        status.lastPrint = {
          printerName: chosen,
          labels: (String(zpl).match(/\^XA/g) || []).length,
          at: new Date().toISOString()
        };
        return status.lastPrint;
      }
    });
    status = { ...status, running: true, lastError: "", printerName: settings.printerName };
  } catch (error) {
    status = { ...status, running: false, lastError: error.message };
  }
}

ipcMain.handle("stage:get-state", async () => ({
  status,
  settings: loadSettings(),
  printers: await listPrinters().catch(() => [])
}));

ipcMain.handle("stage:refresh-printers", async () => listPrinters());

ipcMain.handle("stage:save-printer", async (_event, printerName) => {
  const settings = { ...loadSettings(), printerName: String(printerName || "") };
  saveSettings(settings);
  status.printerName = settings.printerName;
  return settings;
});

ipcMain.handle("stage:test-print", async (_event, printerName) => {
  const zpl =
    // 2C-LP427B: 4 x 2 pulgadas (812 x 406 dots a 203 dpi). ^MNY hace que
    // el sensor use el espacio del rollo; sin esto el trabajo RAW se trata
    // como continuo y puede correr el contenido a la etiqueta siguiente.
    "^XA^PW812^LL406^LH0,0^MNY^MTD^MD15^PR3" +
    "^FO35,45^A0N,52,52^FDSTAGE AI LABS^FS" +
    "^FO35,120^A0N,34,34^FDPrint Server conectado^FS" +
    "^FO35,190^GB742,3,3^FS^FO35,225^A0N,32,32^FDPRUEBA TERMICA ZPL^FS" +
    `^FO35,285^A0N,26,26^FD${new Date().toLocaleString("es-DO")}^FS^XZ`;
  const chosen = printerName || loadSettings().printerName;
  await printRawZpl(chosen, zpl);
  return { success: true, printerName: chosen };
});

ipcMain.handle("stage:calibrate-media", async (_event, printerName) => {
  const chosen = printerName || loadSettings().printerName;
  if (!chosen) throw new Error("Selecciona una impresora.");
  // Guarda el tipo de material con separación y luego mide un ciclo completo
  // del rollo. ~JC avanza hasta el siguiente espacio sin imprimir contenido.
  await printRawZpl(chosen, "^XA^MNY^JUS^XZ~JC");
  return { success: true, printerName: chosen };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  app.whenReady().then(async () => {
    app.setAppUserModelId("com.stageailabs.printserver");
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: process.execPath
    });
    await startServer();
    createTray();
    createWindow();
  });
}

app.on("before-quit", () => {
  app.isQuitting = true;
  if (httpServer) httpServer.close();
});

app.on("window-all-closed", () => {
  // El servidor sigue activo en la bandeja.
});
