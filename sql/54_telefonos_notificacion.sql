-- SQL Migration: 54_telefonos_notificacion.sql
CREATE TABLE IF NOT EXISTS telefonos_notificacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_empleado TEXT NOT NULL,
  telefono TEXT NOT NULL,
  rol TEXT DEFAULT 'Recepción',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default shop number
INSERT INTO telefonos_notificacion (nombre_empleado, telefono, rol, activo)
VALUES ('Recepción Principal Taller', '8095757986', 'Recepción', true)
ON CONFLICT DO NOTHING;
