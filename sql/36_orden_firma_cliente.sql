-- Firma del cliente en el recibo (imagen PNG en base64). Se captura antes de
-- imprimir y se coloca sobre la línea "Firma del cliente" del PDF.
-- Ejecutar una vez en el SQL Editor de Supabase.
alter table ordenes_reparacion add column if not exists firma_cliente_url text;
