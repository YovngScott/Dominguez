import { supabase } from "./supabaseClient";

// Avisa al cliente que su cita fue confirmada (WhatsApp siempre; correo si es
// solicitud web). Llama a la función serverless /api/confirmar-cita.
export async function avisarCitaConfirmada(payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const r = await fetch("/api/confirmar-cita", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token || ""}` },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.success) throw new Error(data.error || `Error ${r.status} al avisar la confirmación.`);
  return data;
}
