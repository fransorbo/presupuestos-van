// Cálculo automático de km de la ruta A → B → (paradas) → C → D.
//
// Proveedores:
//   'osm'    → OpenStreetMap: Nominatim (busca cada dirección) + OSRM (calcula la ruta). Gratis, sin clave.
//   'google' → Google Routes API (computeRoutes). Necesita una clave de API (ver README).
//
// Las funciones que arman URLs y leen respuestas son puras (se testean en tests/distancias.test.js).
// `calcularKmRuta` hace los pedidos de red; recibe `fetch`, la espera y la caché como parámetros
// para poder probarla sin internet.
import { expandirAlias } from './maps.js';

export const PROVEEDORES = {
  osm: 'OpenStreetMap (gratis)',
  google: 'Google Maps (con clave)',
};

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const GOOGLE_ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ESPERA_NOMINATIM_MS = 1100; // Nominatim pide como máximo 1 búsqueda por segundo
const CACHE_DIAS = 90;

/** Error con un mensaje para mostrarle al usuario. */
export class ErrorKm extends Error {}

/** Lista de puntos de la ruta. Tira ErrorKm si falta algo. */
export function puntosRuta({ puntoA, puntoD, origen, paradas = [], destino }) {
  const limpio = (t) => String(t || '').trim();
  if (!limpio(puntoA) || !limpio(puntoD)) throw new ErrorKm('Faltan los puntos A o D en Configuración.');
  if (!limpio(origen)) throw new ErrorKm('Escribí la dirección de recogida (B).');
  if (!limpio(destino)) throw new ErrorKm('Escribí la dirección de dejada (C).');
  const i = paradas.findIndex((p) => !limpio(p));
  if (i >= 0) throw new ErrorKm(`La parada ${i + 1} está vacía: completala o quitala.`);
  return [limpio(puntoA), ...[origen, ...paradas, destino].map(expandirAlias), limpio(puntoD)];
}

/** Nombres de los puntos, en el mismo orden que puntosRuta (para los mensajes de error). */
export function nombresPuntos(cantParadas = 0) {
  return ['A (salida)', 'B (recogida)', ...Array.from({ length: cantParadas }, (_, i) => `parada ${i + 1}`), 'C (dejada)', 'D (llegada)'];
}

// ------------------------------------------------------------ OpenStreetMap

const ABREVIATURAS = [
  [/\bAv(?:da)?\.?(?=\s)/gi, 'Avenida'],
  [/\bGdor\.?(?=\s)/gi, 'Gobernador'],
  [/\bGral\.?(?=\s)/gi, 'General'],
  [/\bPte\.?(?=\s)/gi, 'Presidente'],
  [/\bCnel\.?(?=\s)/gi, 'Coronel'],
  [/\bTte\.?(?=\s)/gi, 'Teniente'],
  [/\bDr\.?(?=\s)/gi, 'Doctor'],
  [/\bIng\.?(?=\s)/gi, 'Ingeniero'],
  [/\bPje\.?(?=\s)/gi, 'Pasaje'],
  [/\bProvincia de Buenos Aires\b/gi, 'Buenos Aires'],
  [/\bPcia\.? de Buenos Aires\b/gi, 'Buenos Aires'],
];

/** Expande abreviaturas y quita códigos postales con letra (B1824, C1425ABC). */
export function normalizarDireccion(direccion) {
  let t = String(direccion || '');
  for (const [re, por] of ABREVIATURAS) t = t.replace(re, por);
  t = t.replace(/\b[A-Z]\d{4}[A-Z]{0,3}\b/g, '');
  t = t
    .split(',')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
  if (!/argentina/i.test(t)) t += ', Argentina';
  return t;
}

/**
 * Variantes para buscar una dirección en OpenStreetMap, de la más completa a la más simple.
 * Si la primera parte no tiene números y otra sí (por ejemplo "Carpe Diem Art, Gdor. Carlos Tejedor 627, …"),
 * también se prueba sin el nombre del lugar.
 */
export function variantesBusqueda(direccion) {
  const original = String(direccion || '').trim();
  const norm = normalizarDireccion(original);
  const partes = norm.split(', ');
  const variantes = [norm];
  if (partes.length > 2 && !/\d/.test(partes[0]) && partes.slice(1).some((p) => /\d/.test(p))) {
    variantes.push(partes.slice(1).join(', '));
  }
  variantes.push(/argentina/i.test(original) ? original : `${original}, Argentina`);
  return [...new Set(variantes)];
}

export function urlNominatim(consulta) {
  const p = new URLSearchParams({ format: 'jsonv2', q: consulta, limit: '1', countrycodes: 'ar', 'accept-language': 'es' });
  return `${NOMINATIM}?${p}`;
}

/** Lee la respuesta de Nominatim: { lat, lon, nombre } o null si no encontró nada. */
export function leerNominatim(json) {
  const r = Array.isArray(json) ? json[0] : null;
  if (!r || r.lat == null || r.lon == null) return null;
  return { lat: Number(r.lat), lon: Number(r.lon), nombre: r.display_name || '' };
}

export function urlOsrm(coordenadas) {
  const pts = coordenadas.map((c) => `${c.lon.toFixed(6)},${c.lat.toFixed(6)}`).join(';');
  return `${OSRM}${pts}?overview=false`;
}

/**
 * Link al mapa de OSRM con la ruta (el mismo servicio que calcula los km), para revisarla.
 * openstreetmap.org no sirve para esto porque no acepta paradas intermedias.
 */
export function urlMapaOsrm(coordenadas) {
  if (!coordenadas?.length) return '';
  const lat = coordenadas.reduce((s, c) => s + c.lat, 0) / coordenadas.length;
  const lon = coordenadas.reduce((s, c) => s + c.lon, 0) / coordenadas.length;
  const p = new URLSearchParams({ z: '11', center: `${lat.toFixed(5)},${lon.toFixed(5)}` });
  for (const c of coordenadas) p.append('loc', `${c.lat.toFixed(6)},${c.lon.toFixed(6)}`);
  p.set('hl', 'es');
  p.set('alt', '0');
  p.set('srv', '0'); // 0 = auto
  return `https://map.project-osrm.org/?${p}`;
}

/** Lee la respuesta de OSRM: km de cada tramo. */
export function leerOsrm(json) {
  const legs = json?.routes?.[0]?.legs;
  if (json?.code !== 'Ok' || !Array.isArray(legs)) throw new ErrorKm('OpenStreetMap no encontró una ruta en auto entre esos puntos.');
  return legs.map((l) => l.distance / 1000);
}

// ------------------------------------------------------------ Google

/** Pedido a la Routes API de Google (computeRoutes). */
export function pedidoGoogle(puntos, clave) {
  const lugar = (address) => ({ address });
  return {
    url: GOOGLE_ROUTES,
    opciones: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': clave,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.legs.distanceMeters',
      },
      body: JSON.stringify({
        origin: lugar(puntos[0]),
        destination: lugar(puntos[puntos.length - 1]),
        intermediates: puntos.slice(1, -1).map(lugar),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        languageCode: 'es-AR',
        regionCode: 'AR',
        units: 'METRIC',
      }),
    },
  };
}

/** Lee la respuesta de Google: km de cada tramo. */
export function leerGoogle(json) {
  if (json?.error) throw new ErrorKm(`Google respondió: ${json.error.message || json.error.status || 'error'}. Revisá la clave en Configuración.`);
  const legs = json?.routes?.[0]?.legs;
  if (!Array.isArray(legs) || !legs.length) throw new ErrorKm('Google no encontró una ruta con esas direcciones. Revisalas.');
  return legs.map((l) => (l.distanceMeters || 0) / 1000);
}

// ------------------------------------------------------------ cálculo

/** Redondea a 1 decimal. */
export const redondearKm = (km) => Math.round(km * 10) / 10;

/**
 * Calcula los km de la ruta.
 * @param {string[]} puntos   direcciones en orden (de puntosRuta)
 * @param {{proveedor, googleApiKey}} opciones
 * @param {{fetch, esperar, cache}} deps   cache: { leer(clave), guardar(clave, valor) } (opcional)
 * @returns {Promise<{ tramosKm: number[], totalKm: number, proveedor: string, encontrados: {direccion, nombre, lat, lon}[], urlMapa: string }>}
 *   urlMapa: link para ver la ruta en el mapa de OSRM (vacío con Google)
 */
export async function calcularKmRuta(puntos, opciones, deps = {}) {
  const f = deps.fetch || globalThis.fetch.bind(globalThis);
  const proveedor = opciones?.proveedor === 'google' ? 'google' : 'osm';
  let tramos;
  let encontrados = [];
  let urlMapa = '';

  if (proveedor === 'google') {
    const clave = String(opciones.googleApiKey || '').trim();
    if (!clave) throw new ErrorKm('Falta la clave de Google en Configuración.');
    const { url, opciones: op } = pedidoGoogle(puntos, clave);
    const r = await pedirJSON(f, url, op);
    tramos = leerGoogle(r);
  } else {
    const coords = [];
    const nombres = nombresPuntos(puntos.length - 4);
    let ultimaBusqueda = 0;
    for (let i = 0; i < puntos.length; i++) {
      const lugar = await buscarOSM(puntos[i], f, deps, () => ultimaBusqueda, (t) => (ultimaBusqueda = t));
      if (!lugar) throw new ErrorKm(`No se encontró la dirección de ${nombres[i]}: "${puntos[i]}". Probá escribirla con calle, número y localidad (por ejemplo "Av. Corrientes 1234, CABA").`);
      coords.push(lugar);
      encontrados.push({ direccion: puntos[i], nombre: lugar.nombre, lat: lugar.lat, lon: lugar.lon });
    }
    tramos = leerOsrm(await pedirJSON(f, urlOsrm(coords)));
    urlMapa = urlMapaOsrm(coords);
  }

  const tramosKm = tramos.map(redondearKm);
  const totalKm = redondearKm(tramos.reduce((s, k) => s + k, 0));
  return { tramosKm, totalKm, proveedor, encontrados, urlMapa };
}

async function buscarOSM(direccion, f, deps, ultima, marcar) {
  const clave = 'osm:' + direccion.toLowerCase();
  const enCache = deps.cache?.leer(clave);
  if (enCache && Date.now() - (enCache.ts || 0) < CACHE_DIAS * 864e5) return enCache;
  const esperar = deps.esperar || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (const consulta of variantesBusqueda(direccion)) {
    const falta = ESPERA_NOMINATIM_MS - (Date.now() - ultima());
    if (ultima() && falta > 0) await esperar(falta);
    marcar(Date.now());
    const lugar = leerNominatim(await pedirJSON(f, urlNominatim(consulta)));
    if (lugar) {
      deps.cache?.guardar(clave, { ...lugar, ts: Date.now() });
      return lugar;
    }
  }
  return null;
}

async function pedirJSON(f, url, opciones) {
  let r;
  try {
    r = await f(url, opciones);
  } catch {
    throw new ErrorKm('No hay conexión a internet (o el servicio no responde). Probá de nuevo.');
  }
  let json = null;
  try {
    json = await r.json();
  } catch {}
  if (!r.ok && !json?.error) throw new ErrorKm(`El servicio respondió con un error (${r.status}). Probá de nuevo en un rato.`);
  return json;
}
