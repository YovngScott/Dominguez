/* global process */
import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en variables de entorno." });
  }

  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const action = req.query?.action || req.body?.action;

  // --------------------------------------------------------------------------
  // 1. PROCESAR DOCUMENTOS (Carnet de Seguro y/o Matrícula)
  // --------------------------------------------------------------------------
  if (action === "procesar_documentos") {
    const { imagenes = [] } = req.body || {};
    if (!imagenes || imagenes.length === 0) {
      return res.status(400).json({ error: "No se enviaron imágenes de documentos para procesar." });
    }

    try {
      const parts = [
        {
          text: `
          Eres un perito experto en digitalización de documentos vehiculares de la República Dominicana (Carnets de Seguros y Matrículas de la DGII).
          Analiza detenidamente la(s) imagen(es) provista(s) y extrae todos los datos legibles para precargar una cotización de taller de colisiones.
          
          REGLAS DE EXTRACCIÓN:
          - cliente_nombre: Nombre del propietario o asegurado.
          - telefono: Teléfono de contacto si está visible.
          - email: Correo electrónico si está visible.
          - rnc_cedula: Cédula o RNC del propietario.
          - marca: Marca del vehículo (ej: Toyota, Honda, Hyundai, Kia, Nissan, etc.).
          - modelo: Modelo del vehículo (ej: Corolla, Civic, Tucson, Sportage, CR-V, etc.).
          - anio: Año del vehículo como texto (ej: "2020").
          - color: Color del vehículo.
          - placa: Número de placa del vehículo.
          - chasis: Número de chasis / VIN del vehículo (17 caracteres alfanuméricos usualmente).
          - tipo_vehiculo: Tipo de carrocería si se deduce (ej: "Sedan", "Jeepeta / SUV", "Camioneta", etc.).
          - aseguradora_nombre: Nombre de la aseguradora (ej: Seguros Reservas, La Colonial, Atlántica, Coop-Seguros, Sura, La Internacional, Mapfre, etc.).
          - numero_poliza: Número de póliza de seguro.
          - numero_reclamo: Número de reclamo o siniestro si aparece en el carnet o volante.
          `
        }
      ];

      for (const img of imagenes) {
        let rawBase64 = img.base64 || img;
        if (rawBase64.includes("base64,")) {
          rawBase64 = rawBase64.split("base64,")[1];
        }
        parts.push({
          inlineData: {
            mimeType: img.mimeType || "image/jpeg",
            data: rawBase64
          }
        });
      }

      const docSchema = {
        type: "object",
        properties: {
          cliente_nombre: { type: "string" },
          telefono: { type: "string" },
          email: { type: "string" },
          rnc_cedula: { type: "string" },
          marca: { type: "string" },
          modelo: { type: "string" },
          anio: { type: "string" },
          color: { type: "string" },
          placa: { type: "string" },
          chasis: { type: "string" },
          tipo_vehiculo: { type: "string" },
          aseguradora_nombre: { type: "string" },
          numero_poliza: { type: "string" },
          numero_reclamo: { type: "string" }
        }
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            role: "user",
            parts
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: docSchema
        }
      });

      const extracted = JSON.parse(response.text || "{}");
      return res.status(200).json({ success: true, data: extracted });
    } catch (err) {
      console.error("Error procesando documentos con IA:", err);
      return res.status(500).json({ error: "Error al analizar los documentos con IA: " + err.message });
    }
  }

  // --------------------------------------------------------------------------
  // 2. PROCESAR AUDIO O DICTADO DE PIEZAS Y MANO DE OBRA
  // --------------------------------------------------------------------------
  if (action === "procesar_audio_piezas") {
    const { audioBase64, mimeType = "audio/webm", textoTranscrito } = req.body || {};

    if (!audioBase64 && !textoTranscrito) {
      return res.status(400).json({ error: "No se proporcionó audio ni texto para procesar." });
    }

    try {
      const parts = [
        {
          text: `
          Eres el perito automotriz en jefe de "Dominguez Auto Pintura".
          Tu trabajo es escuchar la nota de voz grabada por el técnico/evaluador del taller y estructurar la lista exacta de piezas y mano de obra a cotizar.

          REGLAS ESTRICTAS DE NOMENCLATURA CANÓNICA DE CARROCERÍA:
          Aplica rigurosamente las siguientes abreviaturas en mayúsculas:
          - Delantero / Delantera -> "DELT"
          - Trasero / Trasera -> "TRAS"
          - Derecho / Derecha (Right Hand) -> "RH"
          - Izquierdo / Izquierda (Left Hand) -> "LH"
          - Superior -> "SUP"
          - Inferior -> "INF"
          - Interior -> "INT"
          - Exterior -> "EXT"
          - Con Guía -> "C/G"
          - Sin Guía -> "S/G"
          - Central -> "CENT"

          EJEMPLOS DE ESTANDARIZACIÓN DE PIEZAS:
          - "Puerta delantera derecha" -> "PUERTA DELT RH"
          - "Guardalodo delantero izquierdo" -> "GUARDALODO DELT LH"
          - "Bumper delantero" -> "BUMPER DELT"
          - "Halógeno izquierdo" -> "HALOGENO LH"
          - "Foco delantero derecho" -> "FOCO DELT RH"
          - "Stop trasero izquierdo" -> "STOP TRAS LH"
          - "Guía de bumper trasero derecho" -> "GUIA BUMPER TRAS RH"
          - "Compuerta trasera" -> "COMPUERTA TRAS"
          - "Punta de chasis delantera derecha" -> "PUNTA DE CHASIS DELT RH"
          - "Parrilla delantera superior" -> "PARRILLA DELT SUP"

          SEPARACIÓN DE MANO DE OBRA / SERVICIOS:
          Si el evaluador menciona labores o trabajos como:
          - "Pintar puerta delantera derecha" -> Servicio: "PINTURA", Pieza relacionada: "PUERTA DELT RH"
          - "Desabollar y pintar guardalodo" -> Servicio: "DESABOLLADURA Y PINTURA", Pieza: "GUARDALODO DELT LH"
          - "Alinear chasis" -> Servicio: "ALINEACION DE CHASIS", Pieza: ""
          - "Montar y desmontar frente" -> Servicio: "MONTAJE Y DESMONTAJE", Pieza: "FRENTE"
          - "Enderezar puente delantero" -> Servicio: "ENDEREZADO", Pieza: "PUENTE DELT"

          Si el evaluador solo menciona nombres de piezas sin aclarar mano de obra, colócalas en "piezas".
          Si el evaluador menciona cantidades (ej: "2 amortiguadores"), asigna la cantidad correspondiente. De lo contrario, cantidad = 1.
          `
        }
      ];

      if (audioBase64) {
        let cleanBase64 = audioBase64;
        if (cleanBase64.includes("base64,")) {
          cleanBase64 = cleanBase64.split("base64,")[1];
        }
        parts.push({
          inlineData: {
            mimeType: mimeType.split(";")[0].trim(),
            data: cleanBase64
          }
        });
      }

      if (textoTranscrito) {
        parts.push({
          text: `Texto transcrito por el dictado: "${textoTranscrito}"`
        });
      }

      const itemsSchema = {
        type: "object",
        properties: {
          transcripcion_resumen: { type: "string" },
          piezas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                cantidad: { type: "integer" },
                precio: { type: "number" },
                itbis_pct: { type: "number" },
                incluye_itbis: { type: "boolean" }
              },
              required: ["nombre", "cantidad"]
            }
          },
          servicios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                pieza: { type: "string" },
                cantidad: { type: "integer" },
                precio: { type: "number" },
                itbis_pct: { type: "number" },
                incluye_itbis: { type: "boolean" }
              },
              required: ["nombre", "cantidad"]
            }
          }
        },
        required: ["piezas", "servicios"]
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
          {
            role: "user",
            parts
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: itemsSchema
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      return res.status(200).json({ success: true, data: parsed });
    } catch (err) {
      console.error("Error procesando audio con IA:", err);
      return res.status(500).json({ error: "Error al procesar el audio con IA: " + err.message });
    }
  }

  return res.status(400).json({ error: "Acción no reconocida." });
}
