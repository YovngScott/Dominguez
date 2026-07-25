const printerSelect = document.getElementById("printerSelect");
const serverBadge = document.getElementById("serverBadge");
const message = document.getElementById("message");
const saveBtn = document.getElementById("saveBtn");
const testBtn = document.getElementById("testBtn");
const refreshBtn = document.getElementById("refreshBtn");

function showMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("error", error);
}

function renderPrinters(printers, selected) {
  printerSelect.innerHTML = "";
  if (!printers.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No se encontraron impresoras";
    printerSelect.appendChild(option);
    return;
  }
  for (const printer of printers) {
    const option = document.createElement("option");
    option.value = printer.name;
    option.textContent = `${printer.name}${printer.isDefault ? " · Predeterminada" : ""}`;
    option.selected = printer.name === selected;
    printerSelect.appendChild(option);
  }
}

async function load() {
  try {
    const data = await window.stagePrint.getState();
    renderPrinters(data.printers, data.settings.printerName);
    serverBadge.textContent = data.status.running ? "● En línea" : "● Con error";
    serverBadge.className = `badge ${data.status.running ? "ok" : "error"}`;
    document.getElementById("serverAddress").textContent = `localhost:${data.status.port}`;
    document.getElementById("lastPrint").textContent = data.status.lastPrint
      ? new Date(data.status.lastPrint.at).toLocaleString("es-DO")
      : "Aún no";
    if (data.status.lastError) showMessage(data.status.lastError, true);
  } catch (error) {
    serverBadge.textContent = "● Error";
    serverBadge.className = "badge error";
    showMessage(error.message, true);
  }
}

refreshBtn.addEventListener("click", async () => {
  refreshBtn.disabled = true;
  try {
    const printers = await window.stagePrint.refreshPrinters();
    renderPrinters(printers, printerSelect.value);
    showMessage("Lista de impresoras actualizada.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    refreshBtn.disabled = false;
  }
});

saveBtn.addEventListener("click", async () => {
  if (!printerSelect.value) return showMessage("Selecciona una impresora.", true);
  saveBtn.disabled = true;
  try {
    await window.stagePrint.savePrinter(printerSelect.value);
    showMessage(`Impresora guardada: ${printerSelect.value}`);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    saveBtn.disabled = false;
  }
});

testBtn.addEventListener("click", async () => {
  if (!printerSelect.value) return showMessage("Selecciona una impresora.", true);
  testBtn.disabled = true;
  testBtn.textContent = "Imprimiendo…";
  try {
    await window.stagePrint.testPrint(printerSelect.value);
    showMessage("Prueba enviada correctamente a la impresora.");
    await load();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = "Imprimir prueba";
  }
});

load();
