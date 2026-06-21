import { useEffect, useRef } from "react";

// Autoguardado silencioso de formularios en localStorage.
// Objetivo: en tablets con poca RAM, si se cierra el navegador sin guardar,
// no se pierde lo escrito. Es invisible para el usuario y ocupa pocos KB.

const PREFIX = "draft:";
const MAX_AGE = 1000 * 60 * 60 * 48; // 48 horas: borradores viejos se descartan

function soloNoVacios(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v !== "" && v != null) out[k] = v;
  });
  return out;
}

/**
 * Restaura el borrador al montar y lo guarda (con debounce) en cada cambio.
 * - key: identificador único del formulario ("newcase", "newquote", "neworder").
 * - enabled: solo se activa en formularios nuevos en blanco (no edición).
 * - initial: valores prellenados que tienen prioridad sobre el borrador
 *   (ej. la aseguradora al entrar desde su página).
 */
export function useFormDraft({ key, form, setForm, enabled = true, initial }) {
  const restored = useRef(false);

  // Restaurar una sola vez al montar
  useEffect(() => {
    if (!enabled || restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (!raw) return;
      const { ts, data } = JSON.parse(raw);
      if (!data || (ts && Date.now() - ts > MAX_AGE)) {
        localStorage.removeItem(PREFIX + key);
        return;
      }
      setForm((f) => ({ ...f, ...data, ...soloNoVacios(initial) }));
    } catch {
      /* borrador inválido: se ignora */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  // Guardar con un pequeño debounce para no escribir en cada tecla
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data: form }));
      } catch {
        /* almacenamiento lleno o no disponible: se ignora */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form, enabled, key]);
}

// Borra el borrador (se llama tras guardar con éxito).
export function clearFormDraft(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignora */
  }
}
