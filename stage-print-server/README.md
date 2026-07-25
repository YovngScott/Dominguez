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
