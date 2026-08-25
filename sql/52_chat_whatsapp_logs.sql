-- =========================================================
-- 52_chat_whatsapp_logs.sql
-- Crea la tabla para almacenar el historial de mensajes de WhatsApp
-- para dar contexto y memoria a la Inteligencia Artificial.
-- =========================================================

CREATE TABLE IF NOT EXISTS chat_whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jid text NOT NULL,
  sender_name text,
  role text NOT NULL CHECK (role IN ('cliente', 'suplidor', 'seguro', 'bot')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Índice para búsquedas rápidas de historial por contacto
CREATE INDEX IF NOT EXISTS idx_chat_whatsapp_logs_jid ON chat_whatsapp_logs (jid, created_at ASC);
