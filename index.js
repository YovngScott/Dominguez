'use strict';

const express = require('express');
const cors = require('cors');
const auth = require('./middleware/auth');
const printersRouter = require('./routes/printers');
const { router: printRouter, printEvents } = require('./routes/print');

const PORT = 9100;

const ALLOWED_ORIGINS = [
  'http://localhost:8085',
  'https://dominguez.vercel.app',
  'https://app-dev.dominguezautopintura.com',
  'https://app.dominguezautopintura.com',
];

function createServer() {
  const app = express();

  // Private Network Access (Chrome): permite que una web publica HTTPS
  // alcance este servidor local (127.0.0.1).
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Private-Network", "true");
    next();
  });

  app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  }));

  app.use(express.json());

  // Health check — unauthenticated
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Protected routes
  app.use('/printers', auth, printersRouter);
  app.use('/print', auth, printRouter);

  // 404 fallback
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  function startServer() {
    return new Promise((resolve, reject) => {
      const server = app.listen(PORT, '127.0.0.1', () => {
        console.log(`[server] Listening on http://127.0.0.1:${PORT}`);
        resolve(server);
      });
      server.on('error', reject);
    });
  }

  return { app, startServer, printEvents };
}

module.exports = createServer;
//                        
