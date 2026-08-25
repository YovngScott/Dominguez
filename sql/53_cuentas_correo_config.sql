-- =========================================================
-- 53_cuentas_correo_config.sql
-- Tabla para almacenar las cuentas de correo vinculadas con autorización OAuth / IMAP
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
  token_acceso text, -- Contraseña de aplicación o Refresh Token OAuth
  estado_oauth text DEFAULT 'autorizado' CHECK (estado_oauth IN ('autorizado', 'pendiente_autorizacion', 'error_credenciales')),
  autorizado_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Insertar las cuentas iniciales por defecto
INSERT INTO cuentas_correo_config (email, proveedor, nombre_cuenta, es_predeterminado, activo, estado_oauth)
VALUES 
  ('dominguez.apintura@gmail.com', 'gmail', 'Recepción de Cotizaciones', true, true, 'autorizado'),
  ('cotizaciones.dautopintura@gmail.com', 'google_workspace', 'Seguros y Reclamos', false, true, 'autorizado')
ON CONFLICT (email) DO NOTHING;
