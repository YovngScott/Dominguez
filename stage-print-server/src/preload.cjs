"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("stagePrint", {
  getState: () => ipcRenderer.invoke("stage:get-state"),
  refreshPrinters: () => ipcRenderer.invoke("stage:refresh-printers"),
  savePrinter: (printerName) => ipcRenderer.invoke("stage:save-printer", printerName),
  testPrint: (printerName) => ipcRenderer.invoke("stage:test-print", printerName)
});
