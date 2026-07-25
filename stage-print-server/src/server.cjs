"use strict";

const express = require("express");
const cors = require("cors");

const ALLOWED_ORIGINS = [
  "http://localhost:8085",
  "http://127.0.0.1:8085",
  "https://dominguez.vercel.app",
  "https://app-dev.dominguezautopintura.com",
  "https://app.dominguezautopintura.com"
];

function auth(token) {
  return (req, res, next) => {
    const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (supplied !== token) return res.status(401).json({ error: "No autorizado." });
    next();
  };
}

function createPrintServer({ port, token, getDefaultPrinter, listPrinters, printRawZpl }) {
  return new Promise((resolve, reject) => {
    const api = express();
    api.disable("x-powered-by");
    api.use((req, res, next) => {
      res.header("Access-Control-Allow-Private-Network", "true");
      next();
    });
    api.use(
      cors({
        origin(origin, callback) {
          if (!origin || ALLOWED_ORIGINS.includes(origin) || /^http:\/\/192\.168\.\d+\.\d+:8085$/.test(origin)) {
            return callback(null, true);
          }
          callback(new Error("Origen no permitido."));
        },
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "OPTIONS"]
      })
    );
    api.use(express.json({ limit: "5mb" }));

    api.get("/health", (_req, res) =>
      res.json({
        status: "ok",
        product: "STAGE AI LABS Print Server",
        version: "1.0.0",
        printer: getDefaultPrinter() || null
      })
    );

    api.get("/printers", auth(token), async (_req, res) => {
      try {
        res.json({ printers: await listPrinters() });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    api.post("/print/label", auth(token), async (req, res) => {
      const zpl = String(req.body?.zpl || "");
      const printerName = String(req.body?.printerName || getDefaultPrinter() || "");
      if (!zpl.trim()) return res.status(400).json({ error: "Falta el contenido ZPL." });
      if (!printerName) return res.status(400).json({ error: "Falta seleccionar la impresora." });
      if (!zpl.includes("^XA") || !zpl.includes("^XZ")) {
        return res.status(400).json({ error: "El contenido no parece ser una etiqueta ZPL válida." });
      }
      try {
        const result = await printRawZpl({ zpl, printerName });
        res.json({ success: true, printer: printerName, ...result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    api.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada." }));

    const server = api.listen(port, "0.0.0.0", () => resolve(server));
    server.on("error", reject);
  });
}

module.exports = { createPrintServer };
