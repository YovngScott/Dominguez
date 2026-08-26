const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

function normalized(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Oculta copias históricas que ya entraron por dos cuentas antes de usar el
// Message-ID global. Exige mismo remitente, asunto y resumen dentro de una
// ventana corta para no confundir respuestas distintas del mismo hilo.
export function dedupeDashboardMessages(messages) {
  const accepted = [];
  const recentBySignature = new Map();

  for (const message of messages || []) {
    const signature = [
      normalized(message.metadata?.remitente),
      normalized(message.metadata?.asunto || message.titulo),
      normalized(message.cuerpo),
    ].join("|");
    const timestamp = new Date(message.creado_en || 0).getTime();
    const previous = recentBySignature.get(signature);
    if (signature !== "||" && previous && Number.isFinite(timestamp) && Math.abs(previous - timestamp) <= DUPLICATE_WINDOW_MS) continue;
    if (signature !== "||" && Number.isFinite(timestamp)) recentBySignature.set(signature, timestamp);
    accepted.push(message);
  }
  return accepted;
}

