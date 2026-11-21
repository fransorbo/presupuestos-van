import { test, igual, cerca, verdadero } from './runner.js';
import { calcular } from '../js/calc.js';
import { DEFAULT_CONFIG } from '../js/config.js';
import { filaSheet, enviarAlSheet, esUrlSheet } from '../js/sheet.js';
import { validarConfig } from '../js/validar.js';

const def = () => JSON.parse(JSON.stringify(DEFAULT_CONFIG));
const URL_OK = 'https://script.google.com/macros/s/AKfy-abc_123/exec';
const creado = new Date('2026-11-20T15:30:00Z');

test('Sheet: la fila trae persona, fecha, total, recogida, dejada y los números internos', () => {
  const viaje = { origen: 'eze', paradas: ['', 'Obelisco'], destino: 'Av. Siempreviva 742', kmTotales: '100', moneda: 'ARS', tipoCambio: 1000, chofer: 'marcelo', porAgencia: true, precioManual: '150.000', hora: '08:30', pasajeros: '4' };
  const r = calcular(viaje, def());
  const f = filaSheet(viaje, r, def(), { persona: '  Ana Pérez ', fecha: '2026-12-01', creado });
  igual(Object.keys(f).slice(0, 6), ['Creado', 'Persona', 'Fecha', 'Total', 'Recogida', 'Dejada']);
  igual(f.Creado, '2026-11-20T15:30:00.000Z');
  igual(f.Persona, 'Ana Pérez');
  igual(f.Fecha, '2026-12-01');
  igual(f.Total, 150000);
  igual(f.Recogida, 'Aeropuerto Internacional Ezeiza');
  igual(f.Dejada, 'Av. Siempreviva 742');
  igual(f.Paradas, 'Obelisco');
  igual(f.Moneda, 'Pesos');
  cerca(f['Total USD'], 150);
  igual(f['Total pesos'], 150000);
  igual(f.Km, 100);
  igual(f.Chofer, 'Marcelo');
  igual(f.Agencia, 'Sí');
  igual(f['Comisión agencia ($)'], 30000);
  igual(f['Gastos ($)'], 109390);
  igual(f['Ganancia neta ($)'], 40610);
  cerca(f['Margen %'], 27.1);
  igual(f.Hora, '08:30');
  igual(f.Pasajeros, '4');
});

test('Sheet: sin nombre ni fecha quedan vacíos; tarifa fija en USD usa el aeropuerto como dejada', () => {
  const viaje = { tipoViaje: 'hotel-ezeiza', origen: 'Hotel de prueba', destino: '', chofer: 'cristian', paradas: [] };
  const r = calcular(viaje, def());
  const f = filaSheet(viaje, r, def(), { creado });
  igual(f.Persona, '');
  igual(f.Fecha, '');
  igual(f.Moneda, 'USD');
  igual(f.Total, r.total);
  igual(f.Dejada, def().tarifasFijas[0].destino);
  igual(f['Tipo de viaje'], def().tarifasFijas[0].nombre);
  igual(f.Chofer, 'Cristian');
  igual(f.Agencia, 'No');
  igual(f['Comisión agencia ($)'], '');
  const vuelta = { tipoViaje: 'ezeiza-hotel', origen: '', destino: 'Hotel de prueba', paradas: [] };
  const fv = filaSheet(vuelta, calcular(vuelta, def()), def(), { creado });
  igual(fv.Recogida, 'Aeropuerto Internacional Ministro Pistarini (Ezeiza)');
  igual(fv.Dejada, 'Hotel de prueba');
  igual(fv.Total, 110);
});

test('Sheet: dirección del script', () => {
  verdadero(esUrlSheet(URL_OK));
  verdadero(!esUrlSheet(''));
  verdadero(!esUrlSheet('https://docs.google.com/spreadsheets/d/abc/edit'));
  verdadero(!esUrlSheet('http://script.google.com/macros/s/abc/exec'));
  const c = def();
  c.sheetUrl = 'https://docs.google.com/spreadsheets/d/abc/edit';
  verdadero(validarConfig(c).some((e) => e.campo === 'sheetUrl'), 'la URL de la planilla no sirve');
  c.sheetUrl = URL_OK;
  igual(validarConfig(c), []);
});

test('Sheet: envío correcto, error del script y sin conexión', async () => {
  let pedido;
  const ok = await enviarAlSheet(URL_OK, { Total: 1 }, { fetchFn: async (u, o) => ((pedido = { u, o }), { ok: true, json: async () => ({ ok: true, fila: 7 }) }) });
  igual(ok.fila, 7);
  igual(pedido.o.method, 'POST');
  igual(JSON.parse(pedido.o.body), { fila: { Total: 1 } });
  verdadero(!pedido.o.headers, 'sin encabezados (pedido simple)');

  const falla = async (fetchFn) => {
    try {
      await enviarAlSheet(URL_OK, {}, { fetchFn });
      return '';
    } catch (e) {
      return e.message;
    }
  };
  verdadero((await falla(async () => ({ ok: true, json: async () => ({ ok: false, error: 'sin permiso' }) }))).includes('sin permiso'));
  verdadero((await falla(async () => { throw new TypeError('Failed to fetch'); })).includes('conexión'));
  verdadero((await falla(async () => ({ ok: true, json: async () => { throw new Error('html'); } }))).includes('Configuración'));
});
