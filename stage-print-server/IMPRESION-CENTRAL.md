# Impresión central de Domínguez Auto Pintura

Desde cualquier computadora con internet, el usuario del taller pulsa **Imprimir etiquetas** en la web. La solicitud viaja por HTTPS a una cola privada de Supabase. El receptor instalado en la PC conectada a la 4BARCODE recoge el trabajo y lo entrega al sistema de impresión de Windows.

## Uso diario

1. Enciende la PC central, inicia sesión en Windows y enciende la impresora.
2. Print Server inicia automáticamente. Su panel debe mostrar **Impresora central por internet · Conectada**.
3. En cualquier otra computadora, entra a la web con el usuario del taller y pulsa **Imprimir etiquetas** en el caso, en Etiquetas o en el historial.
4. Recoge las etiquetas en la 4BARCODE de la PC central.

Puedes cerrar la ventana del receptor. Continúa funcionando junto al reloj de Windows. La PC debe estar encendida, sin suspensión y con acceso a internet. Las otras computadoras solo necesitan la web.

La instalación de recuperación incluye `scripts/install-watchdog.ps1`. Registra una comprobación cada minuto para abrir el receptor si se cierra o reiniciarlo si deja de responder tres veces seguidas. Se inicia mediante un ejecutable de Windows sin consola, que crea PowerShell con `CreateNoWindow`, para que las comprobaciones no abran la terminal. Si Windows no permite crear la tarea, instala un supervisor del usuario cada 30 segundos. Ambos trabajan con la sesión de Windows del usuario, sin almacenar contraseñas. Para mantenimiento, la presencia de `pausar-receptor.flag` en `%APPDATA%\stage-ai-labs-print-server` suspende la recuperación.

## Instalación o recuperación

La carpeta privada **Impresion central Dominguez** del Escritorio contiene el instalador 1.2.0, el controlador, `settings.json`, el SQL de activación y un script de reinstalación. Conserva esa carpeta fuera de C antes de formatear. `settings.json` vincula el receptor con el taller y debe permanecer privado.

Instala el receptor únicamente en la PC conectada a la impresora. Para reemplazar esa PC, cierra el receptor en la anterior y restaura la configuración en la nueva. Comprueba el nombre de la impresora desde su panel y pulsa **Guardar impresora**. No hace falta volver a ejecutar el SQL al restaurar la misma configuración.

Para generar una instalación nueva desde el repositorio, ejecuta `scripts/prepare-central-print.cjs` con un JSON que contenga `url` y `anonKey` públicos del proyecto. El script crea un secreto aleatorio local y un archivo SQL que registra únicamente su hash. Ejecuta el SQL en el proyecto correcto, copia la configuración privada al directorio de datos del receptor e instala la aplicación. La activación incluye una sola etiqueta de prueba.

## Cuando no sale una etiqueta

- **PC desconectada**. Abre Print Server en la PC central y revisa internet. Espera a que aparezca **Conectada**.
- **En cola**. El trabajo sigue pendiente. Volver a pulsar el mismo botón consulta la misma solicitud mientras no haya terminado.
- **Revisar impresora**. Comprueba el rollo, la conexión USB y la cola de Windows antes de volver a enviarla. Un corte durante el envío puede dejar una impresión físicamente realizada pero sin confirmación.
- **Nombre de impresora incorrecto**. Selecciona la 4BARCODE conectada a esa PC y guarda la selección.
- **Falta activar el SQL**. Usa el archivo de activación de esa instalación en el SQL Editor de Supabase.

## Funcionamiento y mantenimiento

- Las tablas están en `impresion_privada`, fuera del esquema expuesto por la API, con RLS y sin acceso directo para `anon` o `authenticated`.
- Los usuarios autenticados y activos del taller pueden enviar trabajos y consultar únicamente sus propias solicitudes. El navegador nunca recibe el secreto del receptor.
- El receptor utiliza una capacidad aleatoria de 256 bits, almacenada solo en su configuración local. No contiene una clave `service_role`.
- Las funciones expuestas son wrappers sin privilegios elevados. Las operaciones internas comprueban la sesión del usuario o la capacidad limitada del receptor.
- La recogida es atómica, con identificador persistente de petición y `SKIP LOCKED`. Las confirmaciones perdidas se reintentan sin volver a enviar papel. Un reinicio durante la impresión pasa el trabajo a revisión.
- Los trabajos pendientes vencen después de cinco minutos. Los que estuvieron procesándose sin confirmación durante dos minutos pasan a revisión. No se reimprimen automáticamente.
- **Enviado** confirma la entrega al sistema de impresión de Windows. La comprobación física requiere revisar el papel.
- No se abren puertos de internet ni se requiere acceso a la red local desde el navegador.

Pruebas automatizadas en `tests/printServer.test.js`, `tests/cloudPrintWorker.test.js` y `tests/printQueueSql.test.js`. La última utiliza PostgreSQL local en memoria mediante PGlite, sin tocar datos del taller. Ejecuta `npm test`, `npm run build` y el análisis estático de los archivos modificados antes de publicar. El instalador se genera con `npm run build --prefix stage-print-server`.

Referencias de implementación: [funciones y permisos de Supabase](https://supabase.com/docs/guides/database/functions), [seguridad de la API](https://supabase.com/docs/guides/api/securing-your-api), [bloqueos de PostgreSQL](https://www.postgresql.org/docs/17/sql-select.html#SQL-FOR-UPDATE-SHARE).
