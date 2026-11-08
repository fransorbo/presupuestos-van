// Guardado en localStorage: configuración y el presupuesto en curso.
// (El historial de presupuestos, cuando se haga, puede guardarse acá con su propia clave.)
import { DEFAULT_CONFIG, CONFIG_VERSION } from './config.js';
import { validarConfig } from './validar.js';

const CLAVE_CONFIG = 'vantrip.config';
const CLAVE_VIAJE = 'vantrip.viaje';

const clonar = (o) => JSON.parse(JSON.stringify(o));
const esObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Combina lo guardado con los valores por defecto (las claves nuevas toman el valor por defecto). */
export function combinar(base, guardado) {
  if (!esObjeto(guardado)) return clonar(base);
  const out = clonar(base);
  for (const [k, v] of Object.entries(guardado)) {
    if (esObjeto(base[k]) && esObjeto(v)) out[k] = combinar(base[k], v);
    else if (k in base || k === 'choferes') out[k] = clonar(v);
  }
  return out;
}

function leer(clave) {
  try {
    const t = localStorage.getItem(clave);
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}
function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

/**
 * Actualiza una configuración guardada con una versión anterior de la app.
 * v1 → v2: cambiaron el precio por km (5 → 1 USD), el punto A (ahora hay A y D) y la plantilla.
 * v2 → v3: el tipo de cambio pasa a 1550 (ahora se cambia solo en Configuración) y se saca el redondeo automático.
 */
export function migrar(guardado) {
  if (!esObjeto(guardado)) return guardado;
  const g = clonar(guardado);
  // La versión 1 de la app siempre guardaba `version: 1`; sin versión se toma como actual
  if ((g.version ?? CONFIG_VERSION) < 2) {
    delete g.precioKmUSD;
    delete g.puntoA;
    delete g.plantillaWhatsApp;
  }
  if ((g.version ?? CONFIG_VERSION) < 3) {
    delete g.tipoCambio;
    if (esObjeto(g.redondeo)) delete g.redondeo.activo;
  }
  g.version = CONFIG_VERSION;
  return g;
}

export function cargarConfig() {
  const cfg = combinar(DEFAULT_CONFIG, migrar(leer(CLAVE_CONFIG)));
  return validarConfig(cfg).length ? clonar(DEFAULT_CONFIG) : cfg;
}

export function guardarConfig(cfg) {
  return escribir(CLAVE_CONFIG, { ...cfg, version: CONFIG_VERSION });
}

export function restablecerConfig() {
  try {
    localStorage.removeItem(CLAVE_CONFIG);
  } catch {}
  return clonar(DEFAULT_CONFIG);
}

export function cargarViaje() {
  return leer(CLAVE_VIAJE);
}
export function guardarViaje(viaje) {
  escribir(CLAVE_VIAJE, viaje);
}

/**
 * Caché de direcciones ya buscadas en OpenStreetMap (así A y D no se buscan en cada viaje).
 * Tiene la forma que espera calcularKmRuta en distancias.js.
 */
const CLAVE_GEO = 'vantrip.direcciones';
export const cacheDirecciones = {
  leer(clave) {
    return (leer(CLAVE_GEO) || {})[clave];
  },
  guardar(clave, valor) {
    const todo = leer(CLAVE_GEO) || {};
    todo[clave] = valor;
    const claves = Object.keys(todo);
    if (claves.length > 300) claves.slice(0, claves.length - 300).forEach((k) => delete todo[k]); // no crecer sin límite
    escribir(CLAVE_GEO, todo);
  },
};

/** Texto JSON para exportar la configuración. */
export function exportarJSON(cfg) {
  return JSON.stringify({ app: 'presupuestos-van', exportado: new Date().toISOString(), config: cfg }, null, 2);
}

/** Lee un JSON exportado. Devuelve { config } o { errores }. */
export function importarJSON(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { errores: ['El archivo no es un JSON válido.'] };
  }
  const cfg = combinar(DEFAULT_CONFIG, migrar(datos?.config ?? datos));
  const errores = validarConfig(cfg).map((e) => e.mensaje);
  return errores.length ? { errores } : { config: cfg };
}
