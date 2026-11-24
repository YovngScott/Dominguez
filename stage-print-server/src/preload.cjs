"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stagePrint", {
  getState: (options) => ipcRenderer.invoke("stage:get-state", options),
  refreshPrinters: () => ipcRenderer.invoke("stage:refresh-printers"),
  savePrinter: (printerName) => ipcRenderer.invoke("stage:save-printer", printerName),
  testPrint: (printerName) => ipcRenderer.invoke("stage:test-print", printerName),
  calibrateMedia: (printerName) => ipcRenderer.invoke("stage:calibrate-media", printerName)
});
