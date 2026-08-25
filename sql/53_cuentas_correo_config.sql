-- =========================================================
-- 53_cuentas_correo_config.sql
-- Tabla para almacenar hasta 4 cuentas de correo vinculadas (Gmail, Outlook, Dominio)
-- para el monitoreo del bot de Inteligencia Artificial.
-- =========================================================

CREATE TABLE IF NOT EXISTS cuentas_correo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  proveedor text NOT NULL CHECK (proveedor IN ('gmail', 'google_workspace', 'outlook', 'dominio_personalizado')),
  nombre_cuenta text DEFAULT 'Correo del Taller',
  es_predeterminado boolean DEFAULT false,
  activo boolean DEFAULT true,
  frecuencia_minutos integer DEFAULT 5,
  imap_host text,
  imap_port integer DEFAULT 993,
  imap_user text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insertar las cuentas iniciales por defecto si no existen
INSERT INTO cuentas_correo_config (email, proveedor, nombre_cuenta, es_predeterminado, activo)
VALUES 
  ('dominguez.apintura@gmail.com', 'gmail', 'Recepción de Cotizaciones', true, true),
  ('cotizaciones.dautopintura@gmail.com', 'google_workspace', 'Seguros y Reclamos', false, true)
ON CONFLICT (email) DO NOTHING;
