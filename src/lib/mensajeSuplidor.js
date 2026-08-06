import { nombrePieza } from "./cotizacion";

// Mensaje que se le manda al suplidor para pedirle precio de las piezas de una
// cotización. Va solo con los NOMBRES de las piezas (con su lado si aplica):
// el suplidor no tiene por qué ver los precios que el taller le cotizó al
// seguro. Las repetidas se agrupan para no mandar la misma pieza dos veces.
export function piezasDeCotizacion(cot) {
  const vistas = new Map();
  (cot?.items_piezas || []).forEach((it) => {
    const nombre = nombrePieza(it).trim();
    if (!nombre) return;
    const clave = nombre.toLowerCase();
    const cantidad = Number(it.cantidad) || 1;
    vistas.set(clave, { nombre, cantidad: (vistas.get(clave)?.cantidad || 0) + cantidad });
  });
  return [...vistas.values()];
}

// Texto plano listo para WhatsApp. saludo + vehículo + lista numerada.
export function mensajeCotizarPiezas(cot, nombreSuplidor) {
  const vehiculo = [cot?.marca, cot?.modelo, cot?.anio].filter(Boolean).join(" ");
  const piezas = piezasDeCotizacion(cot);

  const lineas = [];
  lineas.push(`Saludos${nombreSuplidor ? " " + nombreSuplidor : ""}, le escribimos de Dominguez Auto Pintura.`);
  lineas.push("");
  lineas.push(
    vehiculo
      ? `Necesitamos cotizar las siguientes piezas para un ${vehiculo}:`
      : "Necesitamos cotizar las siguientes piezas:"
  );
  lineas.push("");
  piezas.forEach((p, i) => {
    lineas.push(`${i + 1}. ${p.nombre}${p.cantidad > 1 ? ` (${p.cantidad})` : ""}`);
  });
  lineas.push("");
  lineas.push("Favor indicarnos precio y disponibilidad. Gracias.");

  return lineas.join("\n");
}

// Enlace de WhatsApp con el mensaje ya escrito. Se usa el enlace oficial en vez
// del envío automático porque no depende del servidor de WhatsApp del taller y
// deja el mensaje en el celular del usuario para revisarlo antes de mandarlo.
export function enlaceWhatsapp(telefono, texto) {
  const d = String(telefono || "").replace(/\D/g, "");
  const numero = d.length === 10 ? "1" + d : d; // RD: 10 dígitos locales
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
