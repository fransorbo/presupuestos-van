/**
 * Presupuestos Van → Google Sheets.
 *
 * Recibe cada presupuesto que se guarda desde la app y lo agrega como una fila en la primera
 * hoja de esta planilla. Usa la primera fila como encabezados: si llega un dato que no tiene
 * columna, la agrega al final. Las columnas que ya existen se pueden mover de lugar sin problema.
 *
 * Instalación (una sola vez, desde la planilla): Extensiones → Apps Script, pegar este código,
 * Implementar → Nueva implementación → Aplicación web (Ejecutar como: yo; Acceso: cualquier usuario)
 * y copiar la URL que termina en /exec en Configuración → Google Sheets de la app.
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var datos = JSON.parse(e.postData.contents);
    var fila = datos && datos.fila;
    if (!fila || typeof fila !== 'object') return responder({ ok: false, error: 'Faltan los datos del viaje.' });

    var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var ultimaColumna = hoja.getLastColumn();
    var encabezados = ultimaColumna ? hoja.getRange(1, 1, 1, ultimaColumna).getValues()[0] : [];
    var normalizar = function (t) { return String(t).trim().toLowerCase(); };
    var indice = {};
    encabezados.forEach(function (h, i) { if (String(h).trim()) indice[normalizar(h)] = i; });

    // Columnas nuevas para los datos que todavía no tienen encabezado
    Object.keys(fila).forEach(function (clave) {
      if (indice[normalizar(clave)] === undefined) {
        encabezados.push(clave);
        indice[normalizar(clave)] = encabezados.length - 1;
        hoja.getRange(1, encabezados.length).setValue(clave).setFontWeight('bold');
      }
    });

    var valores = encabezados.map(function () { return ''; });
    Object.keys(fila).forEach(function (clave) {
      valores[indice[normalizar(clave)]] = convertir(fila[clave]);
    });
    hoja.appendRow(valores);
    var numero = hoja.getLastRow();
    formatear(hoja, numero, encabezados);
    return responder({ ok: true, fila: numero });
  } catch (err) {
    return responder({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/** 'AAAA-MM-DD' → fecha; fecha-hora ISO → fecha y hora (en la zona horaria de la planilla). */
function convertir(v) {
  if (typeof v !== 'string') return v;
  var m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return new Date(v);
  // Evita que un texto que empieza con = + - @ se tome como fórmula
  if (/^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function formatear(hoja, numero, encabezados) {
  encabezados.forEach(function (h, i) {
    var celda = hoja.getRange(numero, i + 1);
    var n = String(h).trim().toLowerCase();
    if (n === 'creado') celda.setNumberFormat('dd/mm/yyyy hh:mm');
    else if (n === 'fecha') celda.setNumberFormat('dd/mm/yyyy');
  });
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Para probar desde el navegador que la implementación responde. */
function doGet() {
  return responder({ ok: true, mensaje: 'Presupuestos Van: listo para guardar.' });
}
