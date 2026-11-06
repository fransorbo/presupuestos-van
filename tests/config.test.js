import { test, igual, verdadero } from './runner.js';
import { DEFAULT_CONFIG } from '../js/config.js';
import { validarConfig } from '../js/validar.js';
import { combinar, importarJSON, exportarJSON, migrar } from '../js/storage.js';

const copia = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG));

test('la configuración por defecto es válida', () => {
  igual(validarConfig(DEFAULT_CONFIG), []);
});

test('valida negativos, no numéricos y opciones', () => {
  const c = copia();
  c.precioKmUSD = -1;
  c.peajes.monto = NaN;
  c.peajes.redondeo = 'medio';
  c.countryPorcentaje = 150;
  c.puntoA = ' ';
  c.puntoD = '';
  c.precioMinimo.monto = -1;
  c.agenciaPorcentaje = 120;
  c.tarifasFijas[0].usd = NaN;
  const campos = validarConfig(c).map((e) => e.campo);
  igual(
    campos.sort(),
    ['agenciaPorcentaje', 'countryPorcentaje', 'peajes.monto', 'peajes.redondeo', 'precioKmUSD', 'precioMinimo.monto', 'puntoA', 'puntoD', 'tarifasFijas.0.usd'].sort()
  );

});

test('la plantilla tiene que incluir {total}', () => {
  const c = copia();
  c.plantillaWhatsApp = 'Hola';
  verdadero(validarConfig(c).some((e) => e.campo === 'plantillaWhatsApp'));
});

test('combinar: lo guardado pisa, las claves nuevas toman el valor por defecto', () => {
  const r = combinar(DEFAULT_CONFIG, { precioKmUSD: 7, peajes: { monto: 3000 }, claveVieja: 1 });
  igual(r.precioKmUSD, 7);
  igual(r.peajes.monto, 3000);
  igual(r.peajes.cadaKm, DEFAULT_CONFIG.peajes.cadaKm);
  igual('claveVieja' in r, false);
  igual(r.plantillaWhatsApp, DEFAULT_CONFIG.plantillaWhatsApp);
});

test('exportar e importar ida y vuelta', () => {
  const c = copia();
  c.precioKmUSD = 6.5;
  const r = importarJSON(exportarJSON(c));
  igual(r.config.precioKmUSD, 6.5);
});

test('importar rechaza JSON roto o con valores inválidos', () => {
  verdadero(importarJSON('{no es json').errores.length === 1);
  verdadero(importarJSON(JSON.stringify({ config: { precioKmUSD: -5 } })).errores.length >= 1);
});

test('cálculo de km: OSM por defecto; Google exige clave', () => {
  igual(DEFAULT_CONFIG.distancias.proveedor, 'osm');
  const c = copia();
  c.distancias.proveedor = 'google';
  igual(validarConfig(c).map((e) => e.campo), ['distancias.googleApiKey']);
  c.distancias.googleApiKey = 'AIza-prueba';
  igual(validarConfig(c), []);
});

test('valores nuevos por defecto', () => {
  igual(DEFAULT_CONFIG.precioKmUSD, 1);
  igual(DEFAULT_CONFIG.precioMinimo, { monto: 90000, moneda: 'ARS' });
  igual(DEFAULT_CONFIG.agenciaPorcentaje, 20);
  igual(DEFAULT_CONFIG.tarifasFijas.map((t) => t.usd), [100, 80]);
  verdadero(DEFAULT_CONFIG.puntoA.startsWith('Chaco 2625, Valentín Alsina'));
  verdadero(DEFAULT_CONFIG.puntoD.startsWith('Carpe Diem Art, Gdor. Carlos Tejedor 627'));
});

test('migración v1 → v2: toma el precio por km, el punto A y la plantilla nuevos; conserva lo demás', () => {
  const v1 = { version: 1, precioKmUSD: 5, puntoA: 'Chaco 2625, Lanús', plantillaWhatsApp: 'vieja {total}', tipoCambio: 1300, countryPorcentaje: 8 };
  const r = combinar(DEFAULT_CONFIG, migrar(v1));
  igual(r.precioKmUSD, 1);
  igual(r.puntoA, DEFAULT_CONFIG.puntoA);
  igual(r.plantillaWhatsApp, DEFAULT_CONFIG.plantillaWhatsApp);
  igual(r.tipoCambio, 1300);
  igual(r.countryPorcentaje, 8);
  igual(r.version, 2);
  // Una configuración v2 guardada no se toca
  const v2 = combinar(DEFAULT_CONFIG, migrar({ ...r, precioKmUSD: 1.5 }));
  igual(v2.precioKmUSD, 1.5);
});
