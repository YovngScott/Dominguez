"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const POWERSHELL = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe"
);

function runPowerShell(args, timeout = 20000) {
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args],
      { windowsHide: true, timeout, encoding: "utf8", maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const message = String(stderr || stdout || error.message).trim();
          return reject(new Error(message || "PowerShell terminó con error."));
        }
        resolve(stdout);
      }
    );
  });
}

async function listPrinters() {
  const script =
    "$p=Get-CimInstance Win32_Printer | Select-Object " +
    "@{N='name';E={$_.Name}},@{N='isDefault';E={[bool]$_.Default}},DriverName,PortName;" +
    "$p | ConvertTo-Json -Compress";
  const stdout = await runPowerShell(["-Command", script]);
  const parsed = stdout.trim() ? JSON.parse(stdout) : [];
  return (Array.isArray(parsed) ? parsed : [parsed]).map((printer) => ({
    name: printer.name,
    isDefault: Boolean(printer.isDefault),
    driverName: printer.DriverName || "",
    portName: printer.PortName || ""
  }));
}

async function printRawZpl(printerName, zpl) {
  if (!printerName) throw new Error("Selecciona una impresora.");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-print-"));
  const zplPath = path.join(tmpDir, "label.zpl");
  // En producción electron-builder extrae este archivo a app.asar.unpacked,
  // porque PowerShell no puede ejecutar un script dentro del archivo ASAR.
  const bundledScript = path.join(__dirname, "raw-print.ps1");
  const scriptPath = bundledScript.includes("app.asar")
    ? bundledScript.replace("app.asar", "app.asar.unpacked")
    : bundledScript;
  fs.writeFileSync(zplPath, Buffer.from(String(zpl), "ascii"));
  try {
    await runPowerShell(
      ["-File", scriptPath, "-PrinterName", printerName, "-FilePath", zplPath],
      30000
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { listPrinters, printRawZpl };
