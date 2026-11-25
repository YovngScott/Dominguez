# STAGE AI LABS Print Server

Servidor local propio para imprimir etiquetas ZPL directamente desde Dominguez Auto Pintura.

## Compatibilidad HTTP

- `GET /health`
- `GET /printers` con `Authorization: Bearer <token>`
- `POST /print/label` con `{ "zpl": "...", "printerName": "..." }`

## Desarrollo

```powershell
npm install
node scripts/generate-assets.mjs
npm start
```

Para probar sin ocupar el puerto del servidor instalado:

```powershell
$env:STAGE_PRINT_PORT=9110
npm start
```

## Instalador

```powershell
npm run build
```

El instalador queda en `release/`.

## Recuperación del estado local

La versión 1.2.1 conserva y aparta `cloud-print-state.json` si un corte deja
el archivo vacío, truncado o lleno de ceros. Reconecta con otra identidad de
recogida: los trabajos anteriores sin confirmación quedan para revisión en
la cola y no se vuelven a imprimir automáticamente. El estado se escribe
antes de recoger o enviar un trabajo; no se reescribe durante las consultas
sin trabajos. Las escrituras usan un archivo temporal, sincronización a disco
y cambio de nombre.
