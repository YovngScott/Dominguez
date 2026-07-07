// Función serverless (Vercel) que firma URLs de Cloudflare R2 para las fotos:
//   op="upload"   → devuelve una URL PUT prefirmada para subir.
//   op="download" → devuelve { path: urlGET } para ver/descargar.
//   op="delete"   → elimina los objetos indicados.
// Requiere sesión de Supabase. Las credenciales de R2 viven solo en Vercel.
import { presignPut, presignGet, deleteObject, r2Config } from "../r2/client.js";
import { validarSesionSupabase } from "../whatsapp/evolution.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  if (!r2Config().ok) {
    return res.status(500).json({
      error: "Falta configurar R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET en Vercel.",
    });
  }
  if (!(await validarSesionSupabase(req))) {
    return res.status(401).json({ error: "No autenticado." });
  }

  const { op, path, paths } = req.body || {};
  const lista = Array.isArray(paths) ? paths : path ? [path] : [];

  try {
    if (op === "upload") {
      if (!path) return res.status(400).json({ error: "Falta la ruta del archivo." });
      return res.status(200).json({ url: await presignPut(path) });
    }
    if (op === "download") {
      const urls = {};
      await Promise.all(
        lista.map(async (p) => {
          urls[p] = await presignGet(p);
        })
      );
      return res.status(200).json({ urls });
    }
    if (op === "delete") {
      await Promise.all(lista.map((p) => deleteObject(p)));
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Operación no válida." });
  } catch (e) {
    return res.status(502).json({ error: "Error con R2: " + e.message });
  }
}
