// Mini corredor de tests para el navegador (sin dependencias).
const tests = [];
export function test(nombre, fn) {
  tests.push({ nombre, fn });
}
export function igual(real, esperado, msg = '') {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) throw new Error(`${msg}\n  esperado: ${b}\n  obtenido: ${a}`);
}
export function cerca(real, esperado, msg = '', tol = 1e-6) {
  if (typeof real !== 'number' || Math.abs(real - esperado) > tol) throw new Error(`${msg}\n  esperado: ≈${esperado}\n  obtenido: ${real}`);
}
export function verdadero(v, msg = '') {
  if (!v) throw new Error(msg || 'se esperaba verdadero');
}
export async function correr(salida) {
  let ok = 0;
  const fallas = [];
  for (const t of tests) {
    try {
      await t.fn();
      ok++;
      salida.insertAdjacentHTML('beforeend', `<li class="ok">✔ ${t.nombre}</li>`);
    } catch (e) {
      fallas.push(t.nombre);
      const li = document.createElement('li');
      li.className = 'falla';
      li.textContent = `✘ ${t.nombre}: ${e.message}`;
      salida.append(li);
    }
  }
  const resumen = `${ok}/${tests.length} tests OK` + (fallas.length ? ` — ${fallas.length} fallaron` : '');
  document.title = (fallas.length ? 'FALLA ' : 'OK ') + resumen;
  return { ok, total: tests.length, fallas, resumen };
}
