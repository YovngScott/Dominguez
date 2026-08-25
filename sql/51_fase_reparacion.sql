-- =========================================================
-- 51_fase_reparacion.sql
-- Agrega soporte para el seguimiento detallado de la fase de reparación
// del vehículo en el taller.
-- =========================================================

ALTER TABLE casos ADD COLUMN IF NOT EXISTS fase_reparacion text DEFAULT 'desabolladura'
  CHECK (fase_reparacion IN ('desabolladura', 'preparacion', 'pintura', 'horno', 'armado', 'lavado_pulido', 'listo_entrega'));
