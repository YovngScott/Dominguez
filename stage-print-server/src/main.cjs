"use strict";

const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { createPrintServer } = require("./server.cjs");
const { listPrinters, printRawZpl } = require("./windows-print.cjs");

const PORT = Number(process.env.STAGE_PRINT_PORT || 9100);
const TOKEN = process.env.STAGE_PRINT_TOKEN || "dps-7f3a9c2e1b4d6f8a0e5c3b7d9a1f4e2c";

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
    "^XA^PW812^LL406^FO35,35^A0N,45,45^FDSTAGE AI LABS^FS" +
    "^FO35,100^A0N,30,30^FDPrint Server conectado^FS" +
    "^FO35,155^GB742,2,2^FS^FO35,185^A0N,28,28^FDPrueba de impresion ZPL^FS" +
    `^FO35,235^A0N,24,24^FD${new Date().toLocaleString("es-DO")}^FS^XZ`;
  const chosen = printerName || loadSettings().printerName;
  await printRawZpl(chosen, zpl);
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
