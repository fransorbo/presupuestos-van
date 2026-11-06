import { test, igual, cerca, verdadero } from './runner.js';
import {
  puntosRuta, normalizarDireccion, variantesBusqueda, leerNominatim, leerOsrm, urlOsrm, urlNominatim,
  pedidoGoogle, leerGoogle, calcularKmRuta, ErrorKm, redondearKm, urlMapaOsrm,
} from '../js/distancias.js';

test('link al mapa de OSRM con todos los puntos en orden', () => {
  const url = new URL(urlMapaOsrm([{ lat: -34.1, lon: -58.2 }, { lat: -34.3, lon: -58.4 }, { lat: -34.5, lon: -58.6 }]));
  igual(url.origin, 'https://map.project-osrm.org');
  igual(url.searchParams.getAll('loc'), ['-34.100000,-58.200000', '-34.300000,-58.400000', '-34.500000,-58.600000']);
  igual(url.searchParams.get('center'), '-34.30000,-58.40000');
  igual(url.searchParams.get('srv'), '0', 'en auto');
  igual(urlMapaOsrm([]), '');
});

const lanza = async (fn, texto) => {
  try {
    await fn();
  } catch (e) {
    verdadero(e instanceof ErrorKm, 'tiene que ser ErrorKm: ' + e);
    if (texto) verdadero(e.message.includes(texto), e.message);
    return;
  }
  throw new Error('se esperaba un error');
};

const base = { puntoA: 'Chaco 2625', puntoD: 'Carpe Diem', origen: 'Aeroparque', destino: 'Nordelta' };

test('puntos de la ruta: A, B, paradas, C, D', () => {
  igual(puntosRuta({ ...base, paradas: ['Obelisco'] }), ['Chaco 2625', 'Aeroparque', 'Obelisco', 'Nordelta', 'Carpe Diem']);
});

test('puntos de la ruta: avisa si falta B, C o hay una parada vacía', async () => {
  await lanza(() => puntosRuta({ ...base, origen: ' ' }), 'recogida');
  await lanza(() => puntosRuta({ ...base, destino: '' }), 'dejada');
  await lanza(() => puntosRuta({ ...base, paradas: ['X', ''] }), 'parada 2');
});

test('normaliza direcciones: abreviaturas, código postal y Argentina', () => {
  igual(
    normalizarDireccion('Carpe Diem Art, Gdor. Carlos Tejedor 627, B1824 Lanús, Provincia de Buenos Aires, Argentina'),
    'Carpe Diem Art, Gobernador Carlos Tejedor 627, Lanús, Buenos Aires, Argentina'
  );
  igual(normalizarDireccion('Av. Corrientes 1234, CABA'), 'Avenida Corrientes 1234, CABA, Argentina');
  igual(normalizarDireccion('Chaco 2625, Valentín Alsina'), 'Chaco 2625, Valentín Alsina, Argentina', 'no toca el número de calle');
  igual(normalizarDireccion('Avellaneda 100'), 'Avellaneda 100, Argentina', '"Av" dentro de una palabra no cambia');
});

test('variantes de búsqueda: prueba sin el nombre del lugar', () => {
  const v = variantesBusqueda('Carpe Diem Art, Gdor. Carlos Tejedor 627, B1824 Lanús, Provincia de Buenos Aires, Argentina');
  igual(v[0], 'Carpe Diem Art, Gobernador Carlos Tejedor 627, Lanús, Buenos Aires, Argentina');
  igual(v[1], 'Gobernador Carlos Tejedor 627, Lanús, Buenos Aires, Argentina');
  igual(variantesBusqueda('Nordelta, Tigre'), ['Nordelta, Tigre, Argentina']);
});

test('URLs de Nominatim y OSRM', () => {
  const u = new URL(urlNominatim('Chaco 2625, Argentina'));
  igual(u.searchParams.get('q'), 'Chaco 2625, Argentina');
  igual(u.searchParams.get('countrycodes'), 'ar');
  igual(urlOsrm([{ lat: -34.1, lon: -58.2 }, { lat: -34.3, lon: -58.4 }]), 'https://router.project-osrm.org/route/v1/driving/-58.200000,-34.100000;-58.400000,-34.300000?overview=false');
});

test('lee respuestas de Nominatim y OSRM', async () => {
  igual(leerNominatim([{ lat: '-34.5', lon: '-58.4', display_name: 'Aeroparque' }]), { lat: -34.5, lon: -58.4, nombre: 'Aeroparque' });
  igual(leerNominatim([]), null);
  igual(leerOsrm({ code: 'Ok', routes: [{ legs: [{ distance: 18480.8 }, { distance: 32648.7 }] }] }), [18.4808, 32.6487]);
  await lanza(() => leerOsrm({ code: 'NoRoute' }), 'ruta');
});

test('pedido y respuesta de Google', async () => {
  const { url, opciones } = pedidoGoogle(['A', 'B', 'C', 'D'], 'CLAVE');
  igual(url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
  igual(opciones.headers['X-Goog-Api-Key'], 'CLAVE');
  const body = JSON.parse(opciones.body);
  igual(body.origin, { address: 'A' });
  igual(body.destination, { address: 'D' });
  igual(body.intermediates, [{ address: 'B' }, { address: 'C' }]);
  igual(body.travelMode, 'DRIVE');
  igual(leerGoogle({ routes: [{ legs: [{ distanceMeters: 10000 }, { distanceMeters: 2500 }] }] }), [10, 2.5]);
  await lanza(() => leerGoogle({ error: { message: 'API key not valid' } }), 'API key not valid');
});

test('redondea km a 1 decimal', () => {
  igual(redondearKm(18.4808), 18.5);
  igual(redondearKm(32.64), 32.6);
});

// "Internet falso" para probar calcularKmRuta sin red
function internetFalso({ noEncuentra = [], osrm } = {}) {
  const pedidos = [];
  const fetch = async (url, op) => {
    pedidos.push(url);
    const u = new URL(url);
    if (u.hostname.startsWith('nominatim')) {
      const q = u.searchParams.get('q');
      const n = pedidos.length;
      const vacio = noEncuentra.some((t) => q.includes(t));
      return { ok: true, status: 200, json: async () => (vacio ? [] : [{ lat: String(-34 - n / 100), lon: '-58.4', display_name: 'Encontrado: ' + q }]) };
    }
    if (u.hostname.startsWith('router')) {
      return { ok: true, status: 200, json: async () => osrm || { code: 'Ok', routes: [{ legs: [{ distance: 10040 }, { distance: 20000 }, { distance: 5000 }] }] } };
    }
    if (u.hostname === 'routes.googleapis.com') {
      return { ok: true, status: 200, json: async () => ({ routes: [{ legs: [{ distanceMeters: 1000 }, { distanceMeters: 2000 }, { distanceMeters: 3000 }] }] }) };
    }
    throw new Error('url inesperada ' + url);
  };
  return { fetch, pedidos };
}
const sinEspera = async () => {};
const cacheMemoria = () => {
  const m = new Map();
  return { leer: (k) => m.get(k), guardar: (k, v) => m.set(k, v), m };
};

test('OSM: busca las 4 direcciones, calcula la ruta y suma los tramos', async () => {
  const red = internetFalso();
  const r = await calcularKmRuta(['A 1', 'B 2', 'C 3', 'D 4'], { proveedor: 'osm' }, { fetch: red.fetch, esperar: sinEspera });
  igual(r.tramosKm, [10, 20, 5]);
  igual(r.totalKm, 35);
  igual(r.proveedor, 'osm');
  igual(r.encontrados.length, 4);
  igual(red.pedidos.filter((u) => u.includes('nominatim')).length, 4);
  igual(new URL(r.urlMapa).searchParams.getAll('loc').length, 4, 'link al mapa con los 4 puntos');
});

test('OSM: si no encuentra la dirección completa, prueba sin el nombre del lugar', async () => {
  const red = internetFalso({ noEncuentra: ['Carpe Diem'] });
  const r = await calcularKmRuta(['A 1', 'B 2', 'C 3', 'Carpe Diem Art, Gdor. Carlos Tejedor 627, Lanús'], { proveedor: 'osm' }, { fetch: red.fetch, esperar: sinEspera });
  verdadero(r.encontrados[3].nombre.includes('Gobernador Carlos Tejedor 627'), r.encontrados[3].nombre);
});

test('OSM: dirección inexistente → error claro con el punto', async () => {
  const red = internetFalso({ noEncuentra: ['Inventada'] });
  await lanza(() => calcularKmRuta(['A 1', 'Calle Inventada 1', 'C 3', 'D 4'], { proveedor: 'osm' }, { fetch: red.fetch, esperar: sinEspera }), 'B (recogida)');
});

test('OSM: guarda las direcciones encontradas y no las vuelve a buscar', async () => {
  const cache = cacheMemoria();
  const red1 = internetFalso();
  await calcularKmRuta(['A 1', 'B 2', 'C 3', 'D 4'], { proveedor: 'osm' }, { fetch: red1.fetch, esperar: sinEspera, cache });
  const red2 = internetFalso();
  await calcularKmRuta(['A 1', 'X 9', 'C 3', 'D 4'], { proveedor: 'osm' }, { fetch: red2.fetch, esperar: sinEspera, cache });
  igual(red2.pedidos.filter((u) => u.includes('nominatim')).length, 1, 'solo busca la dirección nueva');
});

test('OSM: espera entre búsquedas (máximo 1 por segundo)', async () => {
  const esperas = [];
  const red = internetFalso();
  await calcularKmRuta(['A 1', 'B 2', 'C 3', 'D 4'], { proveedor: 'osm' }, { fetch: red.fetch, esperar: async (ms) => esperas.push(ms) });
  igual(esperas.length, 3);
  verdadero(esperas.every((ms) => ms > 1000 && ms <= 1100), String(esperas));
});

test('Google: usa la clave y lee los tramos', async () => {
  const red = internetFalso();
  const r = await calcularKmRuta(['A', 'B', 'C', 'D'], { proveedor: 'google', googleApiKey: 'K' }, { fetch: red.fetch });
  igual(r.tramosKm, [1, 2, 3]);
  igual(r.totalKm, 6);
  igual(r.urlMapa, '', 'con Google no hay link a OSRM');
  await lanza(() => calcularKmRuta(['A', 'B', 'C', 'D'], { proveedor: 'google', googleApiKey: '' }, { fetch: red.fetch }), 'clave');
});

test('sin internet → error claro', async () => {
  const fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await lanza(() => calcularKmRuta(['A', 'B', 'C', 'D'], { proveedor: 'osm' }, { fetch, esperar: sinEspera }), 'conexión');
});
