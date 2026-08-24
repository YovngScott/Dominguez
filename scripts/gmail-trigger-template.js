/* eslint-disable */
// ============================================================================
// Google Apps Script Trigger Template (Multi-Aseguradoras)
// ============================================================================
// INSTRUCCIONES:
// 1. Ve a https://script.google.com/ con la cuenta de Gmail del taller.
// 2. Crea un "Nuevo proyecto".
// 3. Borra el código por defecto y pega este script.
// 4. Cambia la URL en la variable WEBHOOK_URL por tu URL de Vercel desplegada.
// 5. Guarda el proyecto.
// 6. Haz clic en el icono del reloj (Activadores) a la izquierda y añade uno nuevo:
//    - Función que ejecutar: processSuraEmails
//    - Evento: Basado en tiempo -> Temporizador por minutos -> Cada 5 minutos.
// ============================================================================

const WEBHOOK_URL = "https://TU-PROYECTO-VERCEL.vercel.app/api/procesar-seguro";

// Filtro de búsqueda optimizado para capturar correos de las principales aseguradoras
// (Sura, Coop-Seguros, La Internacional, Seguros Reservas, Atlántica, La Colonial de Seguros)
const SEARCH_QUERY = "is:unread (from:sura.com.do OR from:segurosreservas.com OR from:lacolonial.com.do OR from:coopseguros.coop OR from:segurosatlantica.com OR \"Sura\" OR \"Coop-Seguro\" OR \"La Internacional\" OR \"Reservas\" OR \"Atlántica\" OR \"Colonial\")";
const PROCESSED_LABEL = "Seguros-Procesado";

function processSuraEmails() {
  // 1. Obtener o crear etiqueta de control para evitar duplicados
  let label = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  if (!label) {
    label = GmailApp.createLabel(PROCESSED_LABEL);
  }
  
  // 2. Buscar correos no leídos que coincidan con el filtro de Aseguradoras
  const threads = GmailApp.search(SEARCH_QUERY);
  
  for (const thread of threads) {
    // Revisar si ya tiene la etiqueta de procesado por si acaso
    const labels = thread.getLabels();
    const isProcessed = labels.some(l => l.getName() === PROCESSED_LABEL);
    if (isProcessed) continue;

    const messages = thread.getMessages();
    const lastMessage = messages[messages.length - 1];
    
    // Obtener y mapear archivos adjuntos PDF (si existen)
    const attachments = lastMessage.getAttachments();
    const pdfAttachments = [];
    
    for (const att of attachments) {
      if (att.getContentType() === "application/pdf") {
        pdfAttachments.push({
          name: att.getName(),
          contentType: att.getContentType(),
          data: Utilities.base64Encode(att.getBytes())
        });
      }
    }
    
    // 3. Preparar la carga para nuestro Webhook de Vercel (siempre lo enviamos, tenga PDFs o no)
    const payload = {
      subject: lastMessage.getSubject(),
      body: lastMessage.getPlainBody(),
      attachments: pdfAttachments
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    try {
      Logger.log("Enviando webhook para: " + lastMessage.getSubject());
      const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
      const statusCode = response.getResponseCode();
      
      if (statusCode === 200) {
        // ÉXITO: Marcamos como procesado (Cola Transaccional Segura)
        thread.markRead();
        thread.addLabel(label);
        Logger.log("Correo procesado con éxito.");
      } else {
        Logger.log("Error de servidor (" + statusCode + "): " + response.getContentText());
      }
    } catch (e) {
      Logger.log("Fallo de red al enviar el webhook: " + e.message);
      // OJO: Si falla la red, el correo se queda en "no leído" y sin la etiqueta,
      // lo que garantiza que se reintentará en el próximo ciclo de 5 minutos.
    }
  }
}
