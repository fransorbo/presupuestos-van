// Guardado de presupuestos en Google Sheets, a través de un Apps Script publicado como aplicación web
// (ver apps-script/GuardarPresupuesto.gs). Cada guardado agrega una fila.
import { expandirAlias } from './maps.js';

const redondear = (v, dec = 0) => (Number.isFinite(v) ? Math.round(v * 10 ** dec) / 10 ** dec : '');

/** Dirección válida de una aplicación web de Apps Script. */
export function esUrlSheet(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(String(url || '').trim());
}

/**
 * Arma la fila para el Sheet. Las claves son los encabezados de las columnas (en este orden).
 * Fechas: 'AAAA-MM-DD' (Fecha) y fecha-hora ISO (Creado); el script las convierte en fechas del Sheet.
 */
export function filaSheet(viaje, r, config, { persona = '', fecha = '', creado = new Date() } = {}) {
  const tc = Number(r.tipoCambio) || 0;
  const aPesos = (usd) => (tc ? redondear(usd * tc) : '');
  const totalPesos = r.moneda === 'ARS' ? redondear(r.total) : aPesos(r.totalUSD);
  const paradas = (viaje.paradas || []).map(expandirAlias).map((p) => p.trim()).filter(Boolean);
  const destino = expandirAlias(viaje.destino || '') || r.tarifaFija?.destino || '';
  const chofer = config.choferes?.[viaje.chofer]?.nombre || viaje.chofer || '';
  return {
    Creado: creado.toISOString(),
    Persona: String(persona || '').trim(),
    Fecha: fecha || '',
    Total: r.moneda === 'ARS' ? redondear(r.total) : redondear(r.total, 2),
    Recogida: expandirAlias(viaje.origen || '').trim(),
    Dejada: destino.trim(),
    Moneda: r.moneda === 'ARS' ? 'Pesos' : 'USD',
    'Total USD': redondear(r.totalUSD, 2),
    'Total pesos': totalPesos,
    'Tipo de cambio': tc || '',
    Hora: viaje.hora || '',
    Pasajeros: viaje.pasajeros ? String(viaje.pasajeros).trim() : '',
    Paradas: paradas.join(' → '),
    'Tipo de viaje': r.tarifaFija ? r.tarifaFija.nombre || r.tarifaFija.corto : 'Por km',
    Km: r.km ? redondear(r.km, 1) : '',
    Chofer: chofer,
    Agencia: r.agencia ? 'Sí' : 'No',
    'Comisión agencia ($)': r.agencia ? aPesos(r.agencia.comisionUSD) : '',
    'Gastos ($)': r.gastos ? aPesos(r.gastos.totalUSD) : '',
    'Ganancia neta ($)': r.gastos ? aPesos(r.gastos.gananciaUSD) : '',
    'Margen %': r.gastos?.margen == null ? '' : redondear(r.gastos.margen, 1),
  };
}

/** Envía la fila al Apps Script. Devuelve la respuesta del script o lanza un Error con un mensaje para mostrar. */
export async function enviarAlSheet(url, fila, { fetchFn = fetch, tiempoMs = 20000 } = {}) {
  if (!esUrlSheet(url)) throw new Error('Falta cargar la dirección del Sheet en Configuración.');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl && setTimeout(() => ctrl.abort(), tiempoMs);
  let resp;
  try {
    // Sin encabezados: el pedido es "simple" y Google no exige permisos extra (CORS)
    resp = await fetchFn(url.trim(), { method: 'POST', body: JSON.stringify({ fila }), signal: ctrl?.signal, redirect: 'follow' });
  } catch {
    throw new Error('No se pudo conectar con Google. Revisá la conexión e intentá de nuevo.');
  } finally {
    if (timer) clearTimeout(timer);
  }
  let datos = null;
  try {
    datos = await resp.json();
  } catch {}
  if (!resp.ok || !datos?.ok) {
    throw new Error(datos?.error ? `El Sheet respondió: ${datos.error}` : 'Google no aceptó el guardado. Revisá la dirección del Sheet en Configuración.');
  }
  return datos;
}
