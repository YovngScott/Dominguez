// Modo oscuro: agrega/quita la clase "dark" en <html> y lo recuerda.
const KEY = "tema";

export function temaOscuroGuardado() {
  try {
    return localStorage.getItem(KEY) === "dark";
  } catch {
    return false;
  }
}

export function aplicarTema(oscuro) {
  document.documentElement.classList.toggle("dark", oscuro);
  try {
    localStorage.setItem(KEY, oscuro ? "dark" : "light");
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}
