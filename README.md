# Sistema de Digitalización — Taller Automotriz

Sistema web administrativo (React + Supabase) para reemplazar carpetas físicas
y libretas: gestiona vehículos/casos de reparación por aseguradora, fotos de
evidencia (hasta 50 por caso) y cotizaciones en PDF. Pensado para usarse en
escritorio y en tablet (patio del taller).

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor** y ejecuta, en este orden, los archivos de `sql/`:
   1. `01_schema.sql` — tablas, índices, triggers y políticas RLS.
   2. `02_seed_lookups.sql` — aseguradoras (Reservas, Colonial, Atlántica,
      Coop-Seguro, Sura, Internacional, Personal — luego se agregan Ochoa y
      Viamar, y los nombres se actualizan a los legales completos),
      categorías de foto y tipos de documento.
   3. `03_seed_marcas_modelos.sql` — catálogo de 52 marcas y ~378 modelos
      (generado por `scripts/gen_marcas_modelos.mjs`; vuelve a correr ese
      script y reemplaza el archivo si quieres ajustar el catálogo).
   4. `04_storage_setup.sql` — crea los buckets de Storage y sus políticas.
   5. `05_migracion_estados.sql` — ajusta el flujo a las dos categorías del
      taller ("En espera de piezas" / "Listos para trabajar"). Convierte el
      estado a texto, así que se ejecuta una sola vez.
   6. `06_historial_y_entrega.sql` — agrega la bitácora automática del caso
      (tabla `historial_caso` + trigger) y los datos de entrega (fecha y firma
      digital del cliente). Ejecutar una vez.
   7. `07_cotizaciones.sql` — módulo de cotizaciones: tabla `cotizaciones`,
      numeración automática (COT-AAAA-####), bucket de Storage `cotizaciones`
      y evidencias. Ejecutar una vez.
   8. `08_piezas_catalogo.sql` — catálogo de piezas de carrocería para
      autocompletar el nombre de la pieza en las cotizaciones. Ejecutar una vez.
   9. `09_aseguradora_contacto.sql` — agrega dirección y teléfono a las
      aseguradoras (se muestran en el encabezado del PDF de la cotización).
      Ejecutar una vez.
   10. `10_ordenes_reparacion.sql` — orden de reparación / recibo de entrada
       del vehículo, con numeración automática que continúa desde el último
       recibo de papel (empieza en 4599). Ejecutar una vez.
   11. `11_caso_suplidor.sql` — agrega el campo "Suplidor" (de las piezas) al
       caso. Ejecutar una vez.
   12. `12_pdf_size.sql` — sube el límite de tamaño de los buckets de PDF a
       50 MB. Ejecutar una vez. (Para archivos aún mayores, sube también el
       límite global en Dashboard → Storage → Settings.)
   13. `13_orden_combustible.sql` — agrega "Tipo de combustible" a la orden de
       reparación. Ejecutar una vez.
   14. `14_aseguradoras_ochoa_viamar.sql` — agrega Ochoa y Viamar como
       aseguradoras. Ejecutar una vez.
   15. `15_piezas_recibidas.sql` — seguimiento de piezas pendientes/recibidas
       por caso (apartado "Piezas"). Ejecutar una vez.
   16. `16_citas.sql` — agenda de citas del taller (apartado "Citas"). Ejecutar
       una vez.
   17. `17_categorias_danos_ingreso.sql` — reorganiza las categorías de foto:
       separa "Daños / Ingreso" en "Daños" (al cotizar) e "Ingreso" (cuando
       llegan las piezas y el vehículo entra al taller) y elimina
       "Cotización de piezas" y "Proceso". Ejecutar una vez.
   18. `18_estado_en_taller.sql` — agrega la categoría "Vehículo en el taller"
       a los estados permitidos del caso. Ejecutar una vez.
   19. `19_nombres_aseguradoras.sql` — actualiza los nombres de las
       aseguradoras al nombre legal/comercial completo y renombra "Personal"
       a "General". Ejecutar una vez.
   20. `20_backfill_casos_recibos.sql` — repara los recibos creados antes de
       que el sistema enlazara/creara el caso automáticamente: a cada recibo
       sin caso le busca uno por chasis o le crea uno nuevo. Ejecutar una vez
       (es seguro volver a correrlo: si ya no quedan recibos sin caso, no
       hace nada).
   21. `21_firma_cliente_caso.sql` — agrega la columna para guardar la firma
       que el cliente hace con el dedo en la tablet al crear la cotización
       (se reutiliza después en el PDF del recibo). Ejecutar una vez.
   22. `22_fk_usuarios_on_delete.sql` — permite borrar un usuario de
       Authentication sin el error "Database error deleting user": cambia las
       referencias a `auth.users` (created_by/uploaded_by/recibida_by) a
       ON DELETE SET NULL, así los registros se conservan y solo pierden el
       autor. Ejecutar una vez.
   23. `23_etiquetas_piezas.sql` — guarda las etiquetas de piezas generadas
       desde /piezas/etiquetas para verlas en un historial y poder modificar
       sus piezas o reimprimirlas. Ejecutar una vez.
   24. `24_etiquetas_cajas.sql` — una etiqueta ahora puede tener varias cajas
       (cada una con sus piezas, una hoja por caja). Agrega la columna `cajas`
       y migra las etiquetas viejas. Ejecutar una vez.
   25. `25_fotos_100.sql` — sube el máximo de fotos por caso de 50 a 100.
       Ejecutar una vez.
   26. `27_piezas_tramo.sql` — agrega la ubicación física (tramo/anaquel) a
       cada pieza recibida, para la vista de Tramos. Ejecutar una vez.
   27. `28_etiqueta_caso.sql` — vincula cada etiqueta de piezas al caso del
       vehículo (para el QR) y guarda el cliente/teléfono de la etiqueta.
       Ejecutar una vez.
   28. `29_aseguradora_contactos.sql` — contactos (correos) de cada
       aseguradora, para enviarles la cotización por correo. Ejecutar una vez.
3. Ve a **Authentication > Users** y crea manualmente un usuario (correo +
   contraseña) por cada administrador del taller. No hay registro público:
   el acceso es exclusivo para administradores que tú creas a mano.
4. (Opcional) Sube los logos de cada aseguradora al bucket
   `logos-aseguradoras` y actualiza la columna `logo_url` en la tabla
   `aseguradoras` con la URL pública resultante.

## 1.b. Logo de marca

Guarda el logo de **Dominguez Auto Pintura** como `public/logo.png` y la app lo
usará automáticamente en el encabezado y el login. Mientras no exista ese
archivo, se muestra una marca SVG provisional con los mismos colores (rojo/negro).

## 2. Configurar el frontend

```bash
cp .env.example .env
# completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (Project Settings > API)
npm install
npm run dev -- --host   # --host permite abrir la app desde la tablet en la misma red Wi-Fi
```

## 2.b. Publicar con HTTPS (recomendado para tablet/iPhone)

En la red local la app corre sobre `http://`, y algunos navegadores móviles
(sobre todo iOS) limitan funciones del navegador en contextos no seguros.
Publicarla en HTTPS lo resuelve, da respaldo automático y acceso desde
cualquier lugar. La forma más simple (gratis):

1. Sube el proyecto a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com) (o [netlify.com](https://netlify.com))
   importa ese repositorio. El proyecto ya incluye `vercel.json` y
   `public/_redirects` para que las rutas de la app funcionen.
3. En la configuración del proyecto en Vercel/Netlify, agrega las variables de
   entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (los mismos valores
   del `.env`).
4. Deploy. Obtendrás una URL `https://…` para usar en la tablet y el iPhone.

## 2.c. Impresión directa de etiquetas (KT Print Server)

Las etiquetas de piezas (4x2") pueden imprimirse **directo** en la impresora
térmica, sin abrir el diálogo de impresión de la PC. Para eso se usa la app
**KT Print Server** (corre en `http://127.0.0.1:9100` en la PC conectada a la
impresora) y la app le envía la etiqueta en **ZPL** (`src/lib/piezasLabelZpl.js`,
cliente en `src/lib/printServer.js`).

Cómo funciona al pulsar **Imprimir etiquetas**:

1. La app pregunta al print server si está activo (`/health`).
2. Si lo está: genera el ZPL y lo manda a la impresora elegida (`POST /print/label`).
   No se abre nada — sale directo.
3. Si no lo está (o el navegador bloquea la conexión): cae automáticamente al
   PDF de siempre para imprimir a mano.

**Requisito de dominio (CORS):** el print server solo acepta conexiones desde
los dominios de su lista (`app.dominguezautopintura.com`,
`app-dev.dominguezautopintura.com`, `localhost:8085`). Por eso, para que la
impresión directa funcione, la app debe abrirse desde
`https://app.dominguezautopintura.com` (agregar ese dominio como *custom domain*
del proyecto en Vercel y apuntar el DNS). Desde otra URL (p. ej. la de
`*.vercel.app`) el navegador bloquea la conexión al print server y la app usa el
PDF. La impresora se elige automáticamente (la térmica de etiquetas) y se puede
cambiar con el selector que aparece junto al botón cuando el print server está
activo.

## 2.d. Envío de cotizaciones por correo (Brevo)

Desde la vista de una cotización, el botón **"Enviar por correo"** la manda a
los contactos de la aseguradora (con el PDF y, opcional, las fotos de daños
adjuntos). El envío lo hace una **función serverless** (`api/enviar-correo.js`)
que usa **[Brevo](https://www.brevo.com/es/)**; la API key vive solo en el
servidor (nunca en el navegador).

Para activarlo, en **Vercel → Settings → Environment Variables** agrega:

- `BREVO_API_KEY` = la API key de Brevo (Settings → SMTP & API → API Keys).
- `BREVO_BCC_EMAIL` (opcional) = un correo (p. ej. de Google Workspace) que
  recibirá copia oculta de cada envío. Como Brevo entrega directo por API sin
  pasar por Gmail, sin esto los correos enviados no aparecen en ningún
  "Enviados" — con el bcc sí quedan visibles ahí.

Luego **Redeploy** el proyecto. El remitente configurado es
`segurosycotizaciones@dominguezapintura.com` (debe estar verificado en Brevo
para buena entrega). Los contactos por aseguradora se guardan en la tabla
`aseguradora_contactos` y se pueden agregar al vuelo desde el mismo modal de
envío.

## 3. Estructura de Storage y por qué no se satura el espacio

Buckets (ver `sql/04_storage_setup.sql`):

| Bucket | Acceso | Contenido | Límite |
|---|---|---|---|
| `fotos-casos` | privado (solo administradores) | fotos de cada caso, ruta `caso_id/categoria_id/uuid.jpg` | 8 MB/archivo |
| `documentos-casos` | privado | PDFs de cotizaciones, ruta `caso_id/uuid.pdf` | 15 MB/archivo |
| `logos-aseguradoras` | lectura pública | logos del dashboard | 2 MB/archivo |

**Optimización de fotos:** una foto tomada con la cámara de una tablet pesa
típicamente 4-12 MB. Antes de subirla, el frontend (`src/lib/imageCompress.js`)
la redimensiona a un máximo de 1600px de ancho y la recomprime a JPEG calidad
80% directamente en el navegador (usando `<canvas>`), sin pasar por ningún
servidor. El resultado pesa entre 150-400 KB sin pérdida visible en pantalla.
Con 50 fotos por caso, esto implica ~10-20 MB por caso en lugar de hasta
600 MB si se subieran sin comprimir — una diferencia decisiva en costo y
velocidad de carga en redes Wi-Fi de taller.

Los buckets de fotos y documentos son **privados**: el frontend nunca usa
URLs públicas, genera *signed URLs* de 1 hora (`createSignedUrl`) cada vez
que necesita mostrar una imagen o un PDF.

## 4. Estructura del frontend

```
src/
  lib/supabaseClient.js     cliente Supabase
  lib/imageCompress.js      compresión de fotos antes de subir
  hooks/useAuth.js          sesión de Supabase Auth
  pages/Login.jsx           acceso de administradores
  pages/Dashboard.jsx       cuadrícula de aseguradoras + buscador global
  pages/CaseList.jsx        casos de una aseguradora
  pages/CaseDetail.jsx      perfil del caso (datos + tabs Fotos/Documentos)
  pages/NewCase.jsx         alta de cliente + vehículo + caso
  components/SearchBar.jsx  búsqueda por placa, chasis, reclamo o asegurado
  components/PhotoManager.jsx     subida/categorización/galería de fotos
  components/DocumentManager.jsx  subida y visor de PDFs
```

## 5. Notas de seguridad

- Todas las tablas tienen RLS habilitado; solo usuarios autenticados
  (`authenticated`) pueden leer/escribir. Los usuarios anónimos no tienen
  ningún acceso, salvo lectura del bucket público de logos.
- Si en el futuro necesitas distinguir roles (ej. solo lectura vs. admin
  total), crea una tabla `perfiles` ligada a `auth.users` y ajusta las
  políticas en `01_schema.sql`.
