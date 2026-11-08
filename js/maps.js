// Direcciones: URLs de Google Maps y WhatsApp, y detección de aeropuertos. Funciones puras.
// (Más adelante, el cálculo automático de km con una API puede vivir en este módulo.)

/** Google Maps en el celular acepta hasta 3 paradas intermedias; en la compu, hasta 9. */
export const MAX_PARADAS_MAPS_MOVIL = 3;

/** Atajos: si en B, C o una parada se escribe solo esto (sin importar mayúsculas), se usa la dirección completa. */
export const ALIAS_DIRECCIONES = {
  eze: 'Aeropuerto Internacional Ezeiza',
  aep: 'Aeroparque Jorge Newbery',
};

/** Reemplaza un atajo ("EZE", "aep") por la dirección completa. Cualquier otro texto queda igual (sin espacios de más). */
export function expandirAlias(texto) {
  const t = String(texto || '').trim();
  return ALIAS_DIRECCIONES[normalizar(t)] || t;
}

/** Puntos intermedios de la ruta A → B → (paradas) → C → D (con los atajos ya reemplazados). */
export function puntosIntermedios({ origen, paradas = [], destino }) {
  return [origen, ...paradas, destino].map(expandirAlias).filter(Boolean);
}

/**
 * URL de direcciones de Google Maps con la ruta completa: sale de A y termina en D.
 * En iPhone, si la app de Google Maps está instalada, el enlace la abre.
 */
export function urlGoogleMaps({ puntoA, puntoD, origen, paradas = [], destino }) {
  const salida = (puntoA || '').trim();
  const llegada = (puntoD || '').trim() || salida;
  const params = new URLSearchParams({ api: '1', origin: salida, destination: llegada, travelmode: 'driving' });
  const intermedios = puntosIntermedios({ origen, paradas, destino });
  if (intermedios.length) params.set('waypoints', intermedios.join('|'));
  return 'https://www.google.com/maps/dir/?' + params.toString();
}

/** Enlace de WhatsApp con el texto precargado (el usuario elige el contacto). */
export function urlWhatsApp(texto) {
  return 'https://wa.me/?text=' + encodeURIComponent(texto);
}

/** Quita acentos y pasa a minúsculas, para comparar direcciones. */
export function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * ¿La dirección es un aeropuerto? Compara con las palabras clave de la configuración.
 * Las palabras de 3 letras o menos (EZE, AEP) tienen que aparecer como palabra suelta,
 * para que "Ezequiel" o "Aepe" no cuenten.
 */
export function esAeropuerto(direccion, palabras = []) {
  const t = normalizar(direccion);
  if (!t.trim()) return false;
  return palabras.some((p) => {
    const w = normalizar(p).trim();
    if (!w) return false;
    if (w.length <= 3) return new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(t);
    return t.includes(w);
  });
}
