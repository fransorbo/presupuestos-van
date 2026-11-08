// Interfaz: conecta el formulario con la lógica (calc.js) y el guardado (storage.js).
import { calcular, nombresTramos, num, parsearNumero, cantidadPeajes, tarifaFija } from './calc.js';
import { formatMoneda, formatNumero, formatHora, textoWhatsApp, textoEspera, VARIABLES_PLANTILLA } from './format.js';
import { urlGoogleMaps, urlWhatsApp, puntosIntermedios, esAeropuerto, expandirAlias, MAX_PARADAS_MAPS_MOVIL } from './maps.js';
import { validarConfig, obtener } from './validar.js';
import { cargarConfig, guardarConfig, restablecerConfig, cargarViaje, guardarViaje, exportarJSON, importarJSON, cacheDirecciones } from './storage.js';
import { puntosRuta, calcularKmRuta, ErrorKm } from './distancias.js';

export const VERSION_APP = '1.4.0';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

let config = cargarConfig();
let viaje = { ...viajeNuevo(), ...(cargarViaje() || {}) };
delete viaje.tipoCambio; // el tipo de cambio ahora sale siempre de la configuración

function viajeNuevo(anterior = {}) {
  return {
    origen: '',
    destino: '',
    paradas: [],
    tipoViaje: 'km',
    porAgencia: false,
    modoTramos: anterior.modoTramos ?? false,
    kmTotales: '',
    tramos: ['', '', ''],
    fecha: '',
    hora: '',
    pasajeros: '',
    chofer: anterior.chofer ?? 'cristian',
    horasEspera: '',
    noches: '',
    estacionamiento: {
      monto: config.estacionamiento.montoPorDefecto ? formatNumero(config.estacionamiento.montoPorDefecto, 0, 2) : '',
      moneda: config.estacionamiento.moneda,
    },
    esCountry: false,
    countryPorcentaje: formatNumero(config.countryPorcentaje, 0, 2),
    moneda: anterior.moneda ?? 'ARS',
    aumentoPorcentaje: '',
    redondeo: '', // '', 'arriba' o 'abajo'
    precioManual: '',
    incluirDesglose: anterior.incluirDesglose ?? false,
  };
}

function poner(obj, ruta, valor) {
  const ks = ruta.split('.');
  const ult = ks.pop();
  const destino = ks.reduce((o, k) => (o[k] ??= {}), obj);
  destino[ult] = valor;
}

const aValor = (txt) => (txt === 'true' ? true : txt === 'false' ? false : txt);

// ---------------------------------------------------------------- pantalla principal

function pintarFormulario() {
  $$('[data-v]').forEach((el) => {
    const v = obtener(viaje, el.dataset.v);
    if (el.classList.contains('seg')) marcarSeg(el, String(v));
    else if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  });
  $('#moneda-pesos').checked = viaje.moneda === 'ARS';
  pintarParadas();
  pintarTramos();
}

/** Botones del tipo de viaje: "Por km" + una opción por cada tarifa fija de la configuración. */
function pintarTiposViaje() {
  const seg = $('#tipos-viaje');
  $$('button:not([data-valor="km"])', seg).forEach((b) => b.parentNode.removeChild(b));
  for (const t of config.tarifasFijas || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.valor = t.id;
    b.innerHTML = '<span></span><small></small>';
    $('span', b).textContent = t.corto || t.nombre;
    $('small', b).textContent = `USD ${formatNumero(t.usd, 0, 2)} fijo`;
    seg.append(b);
  }
  if (viaje.tipoViaje !== 'km' && !tarifaFija(viaje, config)) viaje.tipoViaje = 'km';
  marcarSeg(seg, viaje.tipoViaje);
}

function marcarSeg(seg, valor) {
  $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === valor)));
}

function pintarParadas() {
  const cont = $('#paradas');
  cont.innerHTML = '';
  viaje.paradas.forEach((p, i) => {
    const fila = document.createElement('div');
    fila.className = 'campo parada';
    fila.innerHTML = `
      <span class="etq"><span class="chip chip-parada">${i + 1}</span> Parada ${i + 1}</span>
      <div class="con-boton">
        <input type="text" data-parada="${i}" placeholder="Dirección de la parada (o EZE / AEP)" autocomplete="off" autocapitalize="words">
        <button type="button" class="btn-quitar" data-quitar="${i}" aria-label="Quitar parada ${i + 1}">✕</button>
      </div>
      <span class="ayuda destacada" data-ayuda-parada="${i}"></span>`;
    $('input', fila).value = p;
    cont.append(fila);
  });
}

function sincronizarTramos() {
  const n = viaje.paradas.length + 3;
  while (viaje.tramos.length < n) viaje.tramos.splice(viaje.tramos.length - 1, 0, '');
  if (viaje.tramos.length > n) viaje.tramos.splice(n - 1, viaje.tramos.length - n);
}

function pintarTramos() {
  sincronizarTramos();
  const nombres = nombresTramos(viaje.paradas.length);
  const cont = $('#lista-tramos');
  cont.innerHTML = '';
  nombres.forEach((nombre, i) => {
    const l = document.createElement('label');
    l.className = 'campo tramo';
    l.innerHTML = `<span class="etq">${nombre}</span>
      <span class="con-sufijo"><input type="text" inputmode="decimal" data-tramo="${i}" placeholder="0" autocomplete="off"><span class="sufijo">km</span></span>`;
    $('input', l).value = viaje.tramos[i] ?? '';
    cont.append(l);
  });
}

function actualizar() {
  guardarViaje(viaje);
  const r = calcular(viaje, config);

  for (const [id, nombre, direccion] of [['#texto-punto-a', config.nombreA, config.puntoA], ['#texto-punto-d', config.nombreD, config.puntoD]]) {
    $(id).textContent = (nombre || '').trim() || direccion;
    $(id).title = direccion;
  }

  // Tarifa fija: no hacen falta km, extras ni moneda (siempre USD)
  const fija = r.tarifaFija;
  // En las tarifas fijas los km no cambian el precio, pero sirven para calcular los gastos
  $('#ayuda-km-fija').hidden = !fija;
  $('#card-extras').hidden = !!fija;
  $('#nota-moneda-fija').hidden = !fija;
  $('#campo-moneda').hidden = !!fija;
  $('#texto-moneda').textContent = viaje.moneda === 'ARS' ? 'En pesos' : 'En dólares';
  $('#ayuda-moneda').textContent = `Dólar a $ ${formatNumero(config.tipoCambio, 0, 2)} · se cambia en Configuración`;

  // Resumen de "Datos del viaje" (para verlo con el desplegable cerrado)
  const pax = num(viaje.pasajeros);
  const fechaCorta = /^\d{4}-\d{2}-\d{2}$/.test(viaje.fecha || '') ? viaje.fecha.slice(8, 10) + '/' + viaje.fecha.slice(5, 7) : '';
  $('#resumen-datos').textContent = [fechaCorta, formatHora(viaje.hora), pax ? `${Math.round(pax)} pax` : ''].filter(Boolean).join(' · ');
  const notaFija = $('#nota-tarifa-fija');
  notaFija.hidden = !fija;
  if (fija) notaFija.textContent = `Precio cerrado: USD ${formatNumero(fija.usd, 2, 2)}. No se suman km, peajes, extras ni recargos. Si dejás vacía la dejada, el mensaje dice "${fija.destino}".`;
  $('[data-v="destino"]').placeholder = fija ? fija.destino : 'Dirección de dejada (o EZE / AEP)';

  // Espera incluida según la recogida
  const ayudaEspera = $('#ayuda-espera-incluida');
  const enAeropuerto = esAeropuerto(viaje.origen, config.palabrasAeropuerto);
  // Atajos EZE / AEP: se muestra a qué dirección corresponden
  const atajo = (texto) => {
    const completa = expandirAlias(texto);
    return completa && completa !== String(texto || '').trim() ? `✈️ ${completa}` : '';
  };
  const nombreB = atajo(viaje.origen);
  ayudaEspera.textContent = viaje.origen.trim() ? `${nombreB ? nombreB + '. ' : enAeropuerto ? '✈️ Aeropuerto. ' : ''}${textoEspera(viaje.origen, config)}` : '';
  $('#ayuda-destino').textContent = atajo(viaje.destino);
  $$('[data-ayuda-parada]').forEach((el) => (el.textContent = atajo(viaje.paradas[Number(el.dataset.ayudaParada)])));
  ayudaEspera.classList.toggle('destacada', enAeropuerto);

  $('#ayuda-agencia').textContent = `La agencia se queda con el ${formatNumero(config.agenciaPorcentaje, 0, 2)}%. El presupuesto no cambia.`;
  $('#km-total').hidden = !!viaje.modoTramos;
  $('#km-tramos').hidden = !viaje.modoTramos;
  $('#suma-tramos').textContent = `${formatNumero(r.km, 0, 2)} km`;
  $('#campo-country').hidden = !viaje.esCountry;

  // Google Maps
  const intermedios = puntosIntermedios(viaje);
  const btnMaps = $('#btn-maps');
  if (intermedios.length) {
    btnMaps.href = urlGoogleMaps({ puntoA: config.puntoA, puntoD: config.puntoD, ...viaje });
    btnMaps.removeAttribute('aria-disabled');
  } else {
    btnMaps.removeAttribute('href');
    btnMaps.setAttribute('aria-disabled', 'true');
  }
  const avisoMaps = $('#aviso-maps');
  avisoMaps.hidden = intermedios.length <= MAX_PARADAS_MAPS_MOVIL;
  avisoMaps.textContent = `Google Maps en el celular acepta hasta ${MAX_PARADAS_MAPS_MOVIL} puntos intermedios (hay ${intermedios.length}). Si no aparecen todos, abrí la ruta en la compu o cargá los km por tramo.`;

  // Ayudas de valores sin configurar
  $('#ayuda-espera').textContent = config.esperaPorHoraUSD ? `USD ${formatNumero(config.esperaPorHoraUSD, 0, 2)} por hora` : 'Tarifa sin configurar (USD 0)';
  $('#ayuda-hotel').textContent = config.hotelPorNocheUSD ? `USD ${formatNumero(config.hotelPorNocheUSD, 0, 2)} por noche` : 'Monto sin configurar (USD 0)';

  // Desglose
  const enMoneda = (usd) => (r.moneda === 'ARS' ? usd * r.tipoCambio : usd);
  const filas = r.lineas.filter((l) => l.id === 'km' || Math.abs(l.usd) > 1e-9);
  $('#desglose').innerHTML = '';
  for (const l of filas) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th><span class="concepto"></span><span class="detalle"></span></th><td></td>`;
    $('.concepto', tr).textContent = l.etiqueta;
    $('.detalle', tr).textContent = l.detalle;
    $('td', tr).textContent = formatMoneda(enMoneda(l.usd), r.moneda);
    $('#desglose').append(tr);
  }
  const pendientes = [];
  if (!fija && (!config.peajes.cadaKm || !config.peajes.monto)) pendientes.push('peajes');
  if (pendientes.length) {
    const tr = document.createElement('tr');
    tr.className = 'pendiente';
    tr.innerHTML = `<th colspan="2">Peajes sin configurar: no se suman.</th>`;
    $('#desglose').append(tr);
  }

  $('#avisos').innerHTML = '';
  const avisos = [...r.avisos];
  if (r.minimoAplicado) avisos.push('El total daba menos que el precio mínimo: se cobra el mínimo.');
  for (const a of avisos) {
    const p = document.createElement('p');
    p.className = 'aviso';
    p.textContent = a;
    $('#avisos').append(p);
  }

  // Gastos variables, ganancia y margen: solo informativo
  const g = r.gastos;
  $('#gastos-nota').textContent = r.km
    ? `Aproximado para ${formatNumero(r.km, 0, 1)} km${viaje.chofer === 'marcelo' ? ', con Marcelo' : ''}${r.agencia ? ', por agencia' : ''}.`
    : 'Cargá los km para calcular los gastos del recorrido.';
  const contGastos = $('#gastos-lineas');
  contGastos.innerHTML = '';
  for (const l of g.lineas.filter((l) => Math.abs(l.usd) > 1e-9)) {
    const fila = document.createElement('div');
    fila.className = 'agencia-fila';
    fila.innerHTML = '<span><span class="concepto"></span> <small></small></span><span class="monto-gasto"></span>';
    $('.concepto', fila).textContent = l.etiqueta;
    $('small', fila).textContent = l.detalle;
    $('.monto-gasto', fila).textContent = formatMoneda(enMoneda(l.usd), r.moneda);
    contGastos.append(fila);
  }
  $('#gastos-total').textContent = `− ${formatMoneda(enMoneda(g.totalUSD), r.moneda)}`;
  const ganancia = $('#gastos-ganancia');
  ganancia.textContent = formatMoneda(enMoneda(g.gananciaUSD), r.moneda);
  ganancia.classList.toggle('negativo', g.gananciaUSD < 0);
  const margen = $('#gastos-margen');
  margen.textContent = g.margen == null ? '—' : `${formatNumero(g.margen, 0, 1)}%`;
  margen.classList.toggle('negativo', g.margen != null && g.margen < 0);

  // Ajustes a mano del total
  const red = r.redondeo;
  $$('.btn-redondeo').forEach((b) => {
    const sentido = b.dataset.redondeo;
    $('.monto', b).textContent = formatMoneda(red[sentido], r.moneda);
    b.setAttribute('aria-pressed', String(red.elegido === sentido));
    b.disabled = !(red[sentido] > 0) || r.precioManual;
  });
  $('#sufijo-manual').textContent = r.moneda === 'ARS' ? '$' : 'USD';
  $('#ayuda-ajustes').textContent = r.precioManual
    ? 'Se usa el precio escrito a mano (reemplaza el cálculo, el aumento y el redondeo).'
    : `Redondeo a ${formatMoneda(red.multiplo, r.moneda)} (se cambia en Configuración).`;

  const totalTxt = formatMoneda(r.total, r.moneda);
  $('#total').textContent = totalTxt;
  $('#total-barra').textContent = totalTxt;
  $('#equivalente').textContent = r.equivalente ? `≈ ${formatMoneda(r.equivalente.monto, r.equivalente.moneda)} (cambio $ ${formatNumero(r.tipoCambio, 0, 2)})` : '';

  // WhatsApp
  const texto = textoWhatsApp({ plantilla: config.plantillaWhatsApp, viaje, resultado: r, incluirDesglose: viaje.incluirDesglose, config });
  $('#vista-previa').textContent = texto;
  $('#btn-whatsapp').href = urlWhatsApp(texto);
  return texto;
}

let textoActual = '';
const refrescar = () => (textoActual = actualizar());

function enlazarPrincipal() {
  const vista = $('#vista-principal');

  vista.addEventListener('input', (e) => {
    const el = e.target;
    // Si cambia la ruta, el último cálculo de km deja de valer
    if (el.dataset.parada != null || el.dataset.v === 'origen' || el.dataset.v === 'destino') $('#resultado-km').hidden = true;
    if (el.dataset.v) {
      poner(viaje, el.dataset.v, el.type === 'checkbox' ? el.checked : el.value);
    } else if (el.dataset.parada != null) viaje.paradas[Number(el.dataset.parada)] = el.value;
    else if (el.dataset.tramo != null) viaje.tramos[Number(el.dataset.tramo)] = el.value;
    else return;
    refrescar();
  });

  // Los switches en iOS disparan 'change' (no siempre 'input')
  vista.addEventListener('change', (e) => {
    if (e.target.id === 'moneda-pesos') {
      viaje.moneda = e.target.checked ? 'ARS' : 'USD';
      // El redondeo y el precio a mano dependen de la moneda: se borran al cambiarla
      viaje.redondeo = '';
      viaje.precioManual = '';
      $('[data-v="precioManual"]').value = '';
      refrescar();
      return;
    }
    if (e.target.type === 'checkbox' && e.target.dataset.v) {
      poner(viaje, e.target.dataset.v, e.target.checked);
      refrescar();
    }
  });

  vista.addEventListener('click', (e) => {
    const btnSeg = e.target.closest('.seg[data-v] button');
    if (btnSeg) {
      const seg = btnSeg.parentElement;
      if (seg.dataset.v === 'tipoViaje' && viaje.tipoViaje !== btnSeg.dataset.valor) {
        // Otro tipo de viaje (y quizás otra moneda): el redondeo y el precio a mano ya no valen
        viaje.redondeo = '';
        viaje.precioManual = '';
        $('[data-v="precioManual"]').value = '';
      }
      poner(viaje, seg.dataset.v, aValor(btnSeg.dataset.valor));
      marcarSeg(seg, btnSeg.dataset.valor);
      refrescar();
      return;
    }
    const btnRed = e.target.closest('[data-redondeo]');
    if (btnRed) {
      const sentido = btnRed.dataset.redondeo;
      viaje.redondeo = viaje.redondeo === sentido ? '' : sentido; // tocar de nuevo lo saca
      refrescar();
      return;
    }
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) {
      const i = Number(quitar.dataset.quitar);
      viaje.paradas.splice(i, 1);
      viaje.tramos.splice(i + 1, 1);
      $('#resultado-km').hidden = true;
      pintarParadas();
      pintarTramos();
      refrescar();
    }
  });

  $('#btn-agregar-parada').addEventListener('click', () => {
    viaje.paradas.push('');
    $('#resultado-km').hidden = true;
    sincronizarTramos();
    pintarParadas();
    pintarTramos();
    refrescar();
    $(`[data-parada="${viaje.paradas.length - 1}"]`).focus();
  });

  $('#btn-calcular-km').addEventListener('click', calcularKm);

  $('#btn-maps').addEventListener('click', (e) => {
    if (e.currentTarget.getAttribute('aria-disabled')) {
      e.preventDefault();
      aviso('Primero escribí la recogida o la dejada.');
    }
  });

  const copiarYAvisar = async () => {
    const ok = await copiar(textoActual);
    if (ok) return aviso('Texto copiado ✓ Pegalo en WhatsApp');
    // Si el navegador no deja copiar, se deja el mensaje seleccionado para copiarlo a mano
    const pre = $('#vista-previa');
    pre.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rango = document.createRange();
    rango.selectNodeContents(pre);
    getSelection().removeAllRanges();
    getSelection().addRange(rango);
    aviso('No se pudo copiar solo. El texto quedó seleccionado: tocá "Copiar".');
  };
  $('#btn-copiar').addEventListener('click', copiarYAvisar);
  $('#btn-copiar-barra').addEventListener('click', copiarYAvisar);
  $('#ir-resultado').addEventListener('click', () => $('#resultado').scrollIntoView({ behavior: 'smooth', block: 'start' }));

  $('#btn-nuevo').addEventListener('click', () => {
    if (!confirm('¿Empezar un presupuesto nuevo? Se borran los datos cargados.')) return;
    viaje = viajeNuevo(viaje);
    pintarFormulario();
    refrescar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Mostrar la barra de total solo cuando el resultado y el mensaje no están a la vista
  const barra = $('#barra-total');
  const visibles = new Set();
  const io = new IntersectionObserver(
    (entradas) => {
      for (const en of entradas) en.isIntersecting ? visibles.add(en.target) : visibles.delete(en.target);
      barra.classList.toggle('oculta', visibles.size > 0);
    },
    { threshold: 0.15 }
  );
  io.observe($('#resultado'));
  io.observe($('#btn-copiar').closest('.card'));
}

// ---------------------------------------------------------------- calcular km

function mostrarResultadoKm(tipo, armar) {
  const caja = $('#resultado-km');
  caja.className = `resultado-km ${tipo}`;
  caja.innerHTML = '';
  armar(caja);
  caja.hidden = false;
}

const parrafo = (texto, clase) => {
  const p = document.createElement('p');
  if (clase) p.className = clase;
  p.textContent = texto;
  return p;
};

async function calcularKm() {
  const btn = $('#btn-calcular-km');
  if (btn.disabled) return;
  let puntos;
  try {
    // En una tarifa fija sin dejada escrita, se usa el aeropuerto de la tarifa
    const destino = viaje.destino.trim() || tarifaFija(viaje, config)?.destino || '';
    puntos = puntosRuta({ puntoA: config.puntoA, puntoD: config.puntoD, ...viaje, destino });
  } catch (e) {
    mostrarResultadoKm('error', (c) => c.append(parrafo(e.message)));
    return;
  }

  const proveedor = config.distancias?.proveedor === 'google' ? 'google' : 'osm';
  btn.disabled = true;
  $('span', btn).textContent = 'Calculando…';
  mostrarResultadoKm('cargando', (c) =>
    c.append(parrafo(proveedor === 'osm' ? 'Buscando las direcciones en OpenStreetMap… puede tardar unos segundos.' : 'Consultando Google Maps…'))
  );

  try {
    const r = await calcularKmRuta(puntos, config.distancias, { cache: cacheDirecciones });
    viaje.tramos = r.tramosKm.map((k) => formatNumero(k, 0, 1));
    viaje.kmTotales = formatNumero(r.totalKm, 0, 1);
    pintarFormulario();
    refrescar();

    const nombres = nombresTramos(viaje.paradas.length);
    mostrarResultadoKm('ok', (c) => {
      c.append(parrafo(`✓ ${formatNumero(r.totalKm, 0, 1)} km según ${proveedor === 'osm' ? 'OpenStreetMap' : 'Google Maps'}`, 'resultado-km-titulo'));
      c.append(parrafo(r.tramosKm.map((k, i) => `${nombres[i]}: ${formatNumero(k, 0, 1)} km`).join(' · '), 'resultado-km-tramos'));
      if (proveedor === 'osm') {
        c.append(parrafo('Puede diferir un poco de Google Maps. Revisá la ruta y que las direcciones encontradas sean las correctas:', 'resultado-km-nota'));
        if (r.urlMapa) {
          const a = document.createElement('a');
          a.className = 'link-mapa-osm';
          a.href = r.urlMapa;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'Ver la ruta en el mapa de OpenStreetMap ↗';
          c.append(a);
        }
        const det = document.createElement('details');
        det.innerHTML = '<summary>Direcciones encontradas</summary><ol></ol>';
        for (const e of r.encontrados) {
          const li = document.createElement('li');
          li.textContent = e.nombre;
          $('ol', det).append(li);
        }
        c.append(det);
      }
    });
  } catch (e) {
    const msg = e instanceof ErrorKm ? e.message : `No se pudo calcular: ${e.message}`;
    mostrarResultadoKm('error', (c) => c.append(parrafo(msg)));
  } finally {
    btn.disabled = false;
    $('span', btn).textContent = 'Calcular km';
  }
}

// ---------------------------------------------------------------- configuración

let borrador = null; // copia de la configuración mientras se edita

function pintarConfig(cfg) {
  borrador = JSON.parse(JSON.stringify(cfg));
  $$('[data-c]').forEach((el) => {
    const v = obtener(borrador, el.dataset.c);
    if (el.classList.contains('seg')) marcarSeg(el, String(v));
    else if (el.type === 'checkbox') el.checked = !!v;
    else if (el.dataset.tipo === 'numero') el.value = formatNumero(v, 0, 4);
    else el.value = v ?? '';
  });
  $$('.campo.error', $('#form-config')).forEach((c) => c.classList.remove('error'));
  $('#errores-config').hidden = true;
  actualizarConfigUI();
}

function leerConfigDelFormulario() {
  const cfg = JSON.parse(JSON.stringify(borrador));
  $$('[data-c]').forEach((el) => {
    if (el.classList.contains('seg')) return; // ya se guardó al tocar
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.dataset.tipo === 'numero') v = parsearNumero(el.value);
    else v = el.value;
    if (typeof v === 'string' && el.tagName !== 'TEXTAREA') v = v.trim();
    poner(cfg, el.dataset.c, v);
  });
  cfg.puntoA = cfg.puntoA.trim().replace(/\s*\n\s*/g, ', ');
  cfg.puntoD = cfg.puntoD.trim().replace(/\s*\n\s*/g, ', ');
  cfg.nombreA = String(cfg.nombreA || '').trim();
  cfg.nombreD = String(cfg.nombreD || '').trim();
  cfg.esperaIncluida.textoAeropuerto = cfg.esperaIncluida.textoAeropuerto.trim();
  cfg.esperaIncluida.textoNormal = cfg.esperaIncluida.textoNormal.trim();
  return cfg;
}

function actualizarConfigUI() {
  const cfg = leerConfigDelFormulario();
  const google = cfg.distancias?.proveedor === 'google';
  $('#campo-google-key').hidden = !google;
  $('#ayuda-proveedor').textContent = google
    ? 'Da los mismos km que Google Maps. Necesita una clave de API.'
    : 'Gratis y sin clave. Los km pueden diferir un poco de Google Maps.';
  const c = cfg.costos || {};
  const por100 = (costo, cadaKm) => (num(cadaKm) ? (100 * num(costo)) / num(cadaKm) : 0);
  const base100 = num(c.combustibleLitrosCada100Km) * num(c.combustiblePrecioLitro) + num(c.peajesCada100Km) + por100(c.aceiteCosto, c.aceiteCadaKm) + por100(c.neumaticosCosto, c.neumaticosCadaKm);
  const marcelo100 = num(c.choferHorasCada100Km) * num(c.choferPrecioHora);
  $('#ejemplo-gastos').textContent = `Cada 100 km: $ ${formatNumero(base100, 0, 0)} (+ $ ${formatNumero(marcelo100, 0, 0)} si viaja Marcelo, + ${formatNumero(num(cfg.agenciaPorcentaje), 0, 2)}% del total si es por agencia).`;
  const cada = num(cfg.peajes.cadaKm);
  $('#ejemplo-peajes').textContent = cada
    ? `Ejemplo: con 250 km se cobran ${cantidadPeajes(250, cfg.peajes)} peajes.`
    : 'Peajes desactivados (cada 0 km).';
}

const ETIQUETAS = {
  puntoA: 'Salida (A)',
  puntoD: 'Llegada (D)',
  nombreA: 'Salida (A): nombre corto',
  nombreD: 'Llegada (D): nombre corto',
  tipoCambio: 'Tipo de cambio',
  precioKmUSD: 'Precio por km',
  'precioMinimo.monto': 'Precio mínimo',
  'precioMinimo.moneda': 'Precio mínimo: moneda',
  'tarifasFijas.0.usd': 'Tarifa fija Hotel → Ezeiza',
  'tarifasFijas.1.usd': 'Tarifa fija Hotel → Aeroparque',
  agenciaPorcentaje: 'Comisión de agencia',
  'costos.choferHorasCada100Km': 'Gastos: horas de Marcelo',
  'costos.choferPrecioHora': 'Gastos: precio hora de Marcelo',
  'costos.combustibleLitrosCada100Km': 'Gastos: litros cada 100 km',
  'costos.combustiblePrecioLitro': 'Gastos: precio del litro',
  'costos.peajesCada100Km': 'Gastos: peajes',
  'costos.aceiteCadaKm': 'Gastos: aceite cada km',
  'costos.aceiteCosto': 'Gastos: costo aceite/service',
  'costos.neumaticosCadaKm': 'Gastos: neumáticos cada km',
  'costos.neumaticosCosto': 'Gastos: costo neumáticos',
  'distancias.proveedor': 'Servicio para calcular km',
  'distancias.googleApiKey': 'Clave de Google',
  'esperaIncluida.textoAeropuerto': 'Espera incluida (aeropuerto)',
  'esperaIncluida.textoNormal': 'Espera incluida (otros lugares)',
  esperaPorHoraUSD: 'Tarifa de espera',
  hotelPorNocheUSD: 'Hotel por noche',
  'peajes.cadaKm': 'Peajes: cada km',
  'peajes.monto': 'Peajes: monto',
  'peajes.moneda': 'Peajes: moneda',
  'peajes.redondeo': 'Peajes: redondeo',
  'estacionamiento.montoPorDefecto': 'Estacionamiento',
  'estacionamiento.moneda': 'Estacionamiento: moneda',
  countryPorcentaje: 'Recargo country',
  ajusteGeneralPorcentaje: 'Ajuste general',
  'redondeo.multiploUSD': 'Redondeo USD',
  'redondeo.multiploARS': 'Redondeo pesos',
  plantillaWhatsApp: 'Plantilla de WhatsApp',
};

function cambios(antes, despues) {
  return Object.keys(ETIQUETAS).filter((k) => JSON.stringify(obtener(antes, k)) !== JSON.stringify(obtener(despues, k)));
}

function mostrarErrores(errores) {
  $$('.campo.error', $('#form-config')).forEach((c) => c.classList.remove('error'));
  const caja = $('#errores-config');
  if (!errores.length) {
    caja.hidden = true;
    return;
  }
  caja.innerHTML = '<strong>Revisá estos campos:</strong>';
  const ul = document.createElement('ul');
  for (const e of errores) {
    const li = document.createElement('li');
    li.textContent = e.mensaje;
    ul.append(li);
    $(`[data-c="${e.campo}"]`)?.closest('.campo')?.classList.add('error');
  }
  caja.append(ul);
  caja.hidden = false;
  caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function aplicarConfig(nueva) {
  config = nueva;
  guardarConfig(config);
  pintarTiposViaje();
  pintarFormulario();
  refrescar();
}

function enlazarConfig() {
  const form = $('#form-config');

  // Variables de la plantilla
  const cont = $('#variables');
  for (const [k, desc] of Object.entries(VARIABLES_PLANTILLA)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'variable';
    b.innerHTML = `<code>{${k}}</code><span></span>`;
    $('span', b).textContent = desc;
    b.addEventListener('click', () => {
      const ta = $('#plantilla');
      const ini = ta.selectionStart ?? ta.value.length;
      const fin = ta.selectionEnd ?? ini;
      ta.value = ta.value.slice(0, ini) + `{${k}}` + ta.value.slice(fin);
      ta.focus();
      ta.setSelectionRange(ini + k.length + 2, ini + k.length + 2);
    });
    cont.append(b);
  }

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg[data-c] button');
    if (!btn) return;
    poner(borrador, btn.parentElement.dataset.c, btn.dataset.valor);
    marcarSeg(btn.parentElement, btn.dataset.valor);
    actualizarConfigUI();
  });
  form.addEventListener('input', actualizarConfigUI);
  form.addEventListener('change', actualizarConfigUI);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const nueva = leerConfigDelFormulario();
    const errores = validarConfig(nueva);
    mostrarErrores(errores);
    if (errores.length) return;
    const lista = cambios(config, nueva);
    if (!lista.length) {
      aviso('No hay cambios para guardar.');
      return;
    }
    const resumen = lista.map((k) => `• ${ETIQUETAS[k]}`).join('\n');
    if (!confirm(`¿Guardar estos cambios?\n\n${resumen}`)) return;
    aplicarConfig(nueva);
    aviso('Configuración guardada ✓');
    irA('');
  });

  $('#btn-cancelar').addEventListener('click', () => salirDeConfig());

  $('#btn-exportar').addEventListener('click', async () => {
    const json = exportarJSON(config);
    const nombre = `presupuestos-van-config-${new Date().toISOString().slice(0, 10)}.json`;
    const archivo = new File([json], nombre, { type: 'application/json' });
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Configuración Presupuestos Van' });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(archivo);
    a.download = nombre;
    document.body.append(a);
    a.click();
    setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
  });

  $('#input-importar').addEventListener('change', async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    const r = importarJSON(await archivo.text());
    if (r.errores) {
      alert('No se pudo importar:\n\n' + r.errores.join('\n'));
      return;
    }
    if (!confirm('¿Reemplazar la configuración actual por la del archivo?')) return;
    aplicarConfig(r.config);
    pintarConfig(config);
    aviso('Configuración importada ✓');
  });

  $('#btn-restablecer').addEventListener('click', () => {
    if (!confirm('¿Restablecer todos los valores por defecto? Se pierde la configuración actual (podés exportarla antes).')) return;
    aplicarConfig(restablecerConfig());
    pintarConfig(config);
    aviso('Valores por defecto restablecidos');
  });

  $('#version').textContent = `Versión ${VERSION_APP}`;
}

function salirDeConfig() {
  const sinGuardar = cambios(config, leerConfigDelFormulario()).length > 0;
  if (sinGuardar && !confirm('Hay cambios sin guardar. ¿Salir igual?')) return;
  irA('');
}

// ---------------------------------------------------------------- navegación y utilidades

function irA(hash) {
  if (hash) location.hash = hash;
  else history.replaceState(null, '', location.pathname + location.search), mostrarVista();
}

function mostrarVista() {
  const enConfig = location.hash === '#config';
  $('#vista-principal').hidden = enConfig;
  $('#vista-config').hidden = !enConfig;
  $('#barra-total').hidden = enConfig;
  $('#btn-config').hidden = enConfig;
  $('#btn-volver').hidden = !enConfig;
  $('#titulo').textContent = enConfig ? 'Configuración' : 'Presupuesto';
  if (enConfig) pintarConfig(config);
  window.scrollTo(0, 0);
}

/** Copia al portapapeles. Sin HTTPS (por ejemplo, probando por Wi-Fi) usa el método viejo, que sí anda en iPhone. */
async function copiar(texto) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {}
  }
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.setAttribute('readonly', '');
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', fontSize: '16px' });
  document.body.append(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, texto.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {}
  ta.remove();
  return ok;
}

let timerToast;
function aviso(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('visible'), 2600);
}

// ---------------------------------------------------------------- inicio

$('#btn-config').addEventListener('click', () => irA('#config'));
$('#btn-volver').addEventListener('click', salirDeConfig);
window.addEventListener('hashchange', mostrarVista);

sincronizarTramos();
pintarTiposViaje();
enlazarPrincipal();
enlazarConfig();
pintarFormulario();
refrescar();
mostrarVista();

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
