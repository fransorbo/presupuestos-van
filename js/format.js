// Formato de números y armado del texto para WhatsApp. Funciones puras.
import { esAeropuerto } from './maps.js';
// Formato argentino: punto de miles y coma decimal (USD 1.250,00 / $ 1.437.500).

/** Formatea un número con punto de miles y coma decimal. */
export function formatNumero(n, minDec = 0, maxDec = minDec) {
  if (!Number.isFinite(n)) n = 0;
  const factor = 10 ** maxDec;
  let r = Math.round(Math.abs(n) * factor) / factor;
  let [ent, dec = ''] = r.toFixed(maxDec).split('.');
  dec = dec.replace(/0+$/, '');
  while (dec.length < minDec) dec += '0';
  ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const signo = n < 0 && r !== 0 ? '-' : '';
  return signo + ent + (dec ? ',' + dec : '');
}

const NBSP = '\u00a0'; // espacio que no se corta: "$ 600.875" nunca queda partido en dos líneas

/** USD con 2 decimales; ARS sin decimales. */
export function formatMoneda(monto, moneda) {
  return moneda === 'ARS' ? `$${NBSP}${formatNumero(monto, 0, 0)}` : `USD${NBSP}${formatNumero(monto, 2, 2)}`;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** '2026-11-20' → 'viernes 20/11/2026' (vacío si no hay fecha válida). */
export function formatFecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${DIAS[d.getDay()]} ${m[3]}/${m[2]}/${m[1]}`;
}

/** '09:30' → '09:30 h' */
export function formatHora(hhmm) {
  return /^\d{2}:\d{2}/.test(hhmm || '') ? `${hhmm.slice(0, 5)} h` : '';
}

/** Variables que se pueden usar en la plantilla (se muestran en Configuración). */
export const VARIABLES_PLANTILLA = {
  origen: 'Lugar de recogida (B)',
  destino: 'Lugar de dejada (C)',
  paradas: 'Paradas intermedias',
  recorrido: 'Recogida → paradas → dejada',
  fecha: 'Fecha del viaje',
  hora: 'Hora del viaje',
  pasajeros: 'Cantidad de pasajeros',
  espera: 'Espera incluida (1 hora desde el aterrizaje si la recogida es en un aeropuerto; si no, 15 minutos)',
  extras: 'Extras con costo (espera adicional, hotel, estacionamiento)',
  desglose: 'Detalle de precios (si está activado)',
  total: 'Total en la moneda elegida',
  equivalente: 'Total en la otra moneda, entre paréntesis',
  km: 'Km totales',
  chofer: 'Nombre del chofer',
};

const lineaExtra = {
  espera: (l) => `${l.detalle} de espera adicional`,
  estacionamiento: () => 'estacionamiento',
  hotel: (l) => `${l.detalle} de hotel`,
};

/** Lista de extras con costo: "2 horas de espera adicional, 1 noche de hotel y estacionamiento". */
export function textoExtras(lineas) {
  const items = lineas.filter((l) => l.extra && Math.abs(l.usd) > 1e-9 && lineaExtra[l.id]).map((l) => lineaExtra[l.id](l));
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
}

/** Desglose para el cliente, en la moneda elegida. */
export function textoDesglose(resultado) {
  const { moneda, tipoCambio } = resultado;
  const conv = (usd) => (moneda === 'ARS' ? usd * tipoCambio : usd);
  const filas = resultado.desgloseCliente.map((l) => {
    // Al cliente no se le muestra el precio por km ni el % de recargo, solo la cantidad
    const det = l.id === 'km' ? ` (${formatNumero(resultado.km, 0, 2)} km)` : l.detalle && l.id !== 'country' && l.id !== 'minimo' ? ` (${l.detalle})` : '';
    return `• ${l.etiqueta}${det}: ${formatMoneda(conv(l.usd), moneda)}`;
  });
  return filas.length ? ['Detalle:', ...filas].join('\n') : '';
}

/**
 * Arma el texto de WhatsApp a partir de la plantilla.
 * Si todas las variables de una línea quedan vacías (por ejemplo, sin fecha), la línea se omite.
 * No deja más de una línea en blanco seguida.
 */
export function textoWhatsApp({ plantilla, viaje, resultado, incluirDesglose, config }) {
  const paradas = (viaje.paradas || []).map((p) => p.trim()).filter(Boolean);
  const origen = (viaje.origen || '').trim();
  // En las tarifas fijas, si no se escribió la dejada, se usa el aeropuerto de la tarifa
  const destino = (viaje.destino || '').trim() || resultado.tarifaFija?.destino || '';
  const recorrido = [origen, ...paradas, destino].filter(Boolean).join(' → ');
  const pax = Number(viaje.pasajeros) > 0 ? String(Math.round(Number(viaje.pasajeros))) : '';
  const eq = resultado.equivalente;

  const valores = {
    origen,
    destino,
    paradas: paradas.join(', '),
    recorrido,
    fecha: formatFecha(viaje.fecha),
    hora: formatHora(viaje.hora),
    pasajeros: pax,
    espera: textoEspera(origen, config),
    extras: textoExtras(resultado.lineas || []),

    desglose: incluirDesglose ? textoDesglose(resultado) : '',
    total: formatMoneda(resultado.total, resultado.moneda),
    equivalente: eq ? `(≈ ${formatMoneda(eq.monto, eq.moneda)})` : '',
    km: formatNumero(resultado.km, 0, 2),
    chofer: config?.choferes?.[viaje.chofer]?.nombre || '',
  };

  const lineas = [];
  for (const linea of (plantilla || '').split('\n')) {
    let conVariables = 0;
    let conValor = 0;
    const nueva = linea.replace(/\{(\w+)\}/g, (m, k) => {
      if (!(k in valores)) return m; // variable desconocida: se deja como está
      conVariables++;
      if (valores[k]) conValor++;
      return valores[k];
    });
    if (conVariables > 0 && conValor === 0) continue; // todas sus variables están vacías → se omite
    lineas.push(nueva.replace(/[ \t]+$/gm, ''));
  }

  // Colapsar líneas en blanco repetidas y quitar las de los extremos
  const salida = [];
  for (const l of lineas) {
    if (l === '' && (salida.length === 0 || salida[salida.length - 1] === '')) continue;
    salida.push(l);
  }
  while (salida.length && salida[salida.length - 1] === '') salida.pop();
  return salida.join('\n');
}

/** Texto de la espera incluida: depende de si la recogida es en un aeropuerto. */
export function textoEspera(origen, config) {
  const e = config?.esperaIncluida;
  if (!e) return '';
  return esAeropuerto(origen, config.palabrasAeropuerto || []) ? e.textoAeropuerto : e.textoNormal;
}
