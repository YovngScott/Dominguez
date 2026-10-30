// Acepta también montos anteriores escritos con RD$ y separadores de miles.
export function cantidadDeducible(valor) {
  const texto = String(valor ?? "").replace(/^\s*RD\$\s*/i, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) return "";
  return texto;
}

export function mostrarDeducible(valor) {
  const cantidad = cantidadDeducible(valor);
  if (!cantidad) return "";
  return `RD$ ${Number(cantidad).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
