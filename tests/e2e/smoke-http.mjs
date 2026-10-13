// Prueba de humo por HTTP contra la app corriendo (npm run dev / npm start).  Uso: node tests/e2e/smoke-http.mjs [http://localhost:3000]
import { randomUUID } from 'node:crypto';
const BASE = process.argv[2] || 'http://localhost:3000';
const PASS = process.env.DEMO_PASSWORD || 'Demo2026!';
let fallos = 0;
const ok = (c, m) => { console.log((c ? '  OK  ' : ' FALLA ') + m); if (!c) fallos++; };

class Cliente {
  constructor() { this.cookie = ''; }
  async llamar(url, metodo = 'GET', body) {
    const r = await fetch(BASE + url, { method: metodo, redirect: 'manual', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    const texto = await r.text(); let j = null; try { j = JSON.parse(texto); } catch {}
    return { status: r.status, j, texto };
  }
  async login(k) { const r = await this.llamar('/api/auth/login', 'POST', { email: `${k}@demo.local`, password: PASS }); if (r.status !== 200) throw new Error(`login ${k}: ${r.status} ${r.texto}`); return r.j; }
}

const anon = new Cliente();
console.log('Seguridad basica');
ok((await anon.llamar('/api/panel')).status === 401, 'sin sesion: /api/panel -> 401');
ok((await anon.llamar('/api/auth/login', 'POST', { email: 'operador@demo.local', password: 'mala' })).status === 401, 'contrasena incorrecta -> 401');
const q1 = await anon.llamar('/q/ABCDEFGHJKMNPQRSTVWXYZ0123'); const q2 = await anon.llamar('/q/token-invalido');
ok(q1.status === 200 && q2.status === 200 && q1.texto.replace(/ABCDEF\w+/g, '') === q2.texto.replace(/token-invalido/g, ''), '/q/:token responde igual (200) con token valido o invalido, sin datos');
ok((await anon.llamar('/api/cron/mensajes', 'POST')).status === 401, 'cron sin clave -> 401');

const op = new Cliente(), ay = new Cliente(), su = new Cliente(), ge = new Cliente();
await op.login('operador'); await ay.login('ayudante'); await su.login('supervisor'); await ge.login('gerente');
console.log('Permisos');
const cat = (await op.llamar('/api/catalogos')).j;
const ag = Object.fromEntries(cat.agencias.map(a => [a.ciudad, a.id]));
const cuerpoEnc = { origenId: ag.Quito, destinoId: ag.Zumba, remitenteNombre: 'Remitente', destNombre: 'Destinatario', destTel: '0991234567', bultos: [{ pesoG: 1500 }, { pesoG: 2500 }] };
ok((await ay.llamar('/api/encomiendas', 'POST', cuerpoEnc)).status === 403, 'ayudante NO puede registrar encomiendas -> 403');
ok((await ge.llamar('/api/escaneos', 'POST', { eventId: randomUUID(), tipo: 'carga', viajeId: 'x', parada: 1, codigo: 'ABCD2345' })).status === 403, 'gerente NO puede escanear (solo lectura) -> 403');
ok((await op.llamar('/api/encomiendas', 'POST', { ...cuerpoEnc, bultos: [] })).status === 400, 'datos invalidos -> 400');

console.log('Flujo');
const cot = (await op.llamar('/api/cotizaciones/calcular', 'POST', { origenId: ag.Quito, destinoId: ag.Zumba, bultos: cuerpoEnc.bultos })).j;
ok(cot.valorCent === 1080 && cot.etiqueta === 'TARIFAS DE DEMOSTRACIÓN', `cotizacion de la tabla: ${cot.valorCent} centavos (${cot.etiqueta})`);
const enc = (await op.llamar('/api/encomiendas', 'POST', cuerpoEnc)).j;
ok(enc.bultos?.length === 2, `encomienda ${enc.codigo} con 2 bultos`);
const rutaId = cat.rutas[0].id;
const viaje = (await op.llamar('/api/viajes', 'POST', { rutaId, fecha: new Date().toISOString().slice(0, 10), vehiculo: 'SMOKE-' + Date.now() % 1000 })).j;
for (const b of enc.bultos) await op.llamar(`/api/viajes/${viaje.id}/manifiesto/items`, 'POST', { codigo: b.codigoLegible, subeOrden: 1, bajaOrden: 3 });
ok((await op.llamar(`/api/viajes/${viaje.id}/manifiesto/cerrar`, 'POST')).status === 200, 'manifiesto cerrado');
ok((await ay.llamar(`/api/viajes/${viaje.id}/manifiesto/modificar`, 'POST', { motivo: 'x' })).status === 403, 'ayudante NO puede modificar el manifiesto -> 403');
const sc = (b, id = randomUUID()) => ay.llamar('/api/escaneos', 'POST', { eventId: id, tipo: 'carga', viajeId: viaje.id, parada: 1, codigo: b });
ok((await sc(enc.bultos[0].qrToken)).j.resultado === 'ok', 'ayudante escanea el QR del bulto 1 -> ok');
const idDup = randomUUID(); await sc(enc.bultos[1].codigoLegible, idDup);
ok((await sc(enc.bultos[1].codigoLegible, idDup)).j.resultado === 'ok', 'mismo eventId reintentado -> misma respuesta, sin duplicar');
const bl = await su.llamar(`/api/viajes/${viaje.id}/paradas/1/autorizar`, 'POST', { tipo: 'normal' });
ok(bl.status === 200, 'supervisor autoriza (todo conciliado)');
ok((await su.llamar(`/api/viajes/${viaje.id}/paradas/1/salida-real`, 'POST')).status === 200, 'salida real registrada');
const vp = (await su.llamar(`/api/viajes/${viaje.id}/paradas/2`)).j;
ok(vp.bultos.every(b => b.rol === 'continua' && b.estado === 'en_transito'), 'en la parada 2 los bultos CONTINUAN y siguen en transito');
const panel = (await ge.llamar('/api/panel')).j;
ok(Array.isArray(panel.porEstado) && panel.porEstado.some(e => e.estado === 'en_transito'), 'gerente ve el panel');
const csv = await ge.llamar('/api/export/eventos');
ok(csv.status === 200 && csv.texto.includes('escaneo_carga'), 'gerente descarga el CSV de eventos');
ok((await op.llamar('/api/export/eventos')).status === 403, 'operador NO exporta CSV -> 403');
const tl = (await op.llamar(`/api/bultos/${enc.bultos[0].id}/timeline`)).j;
ok(tl.eventos.length >= 4, `linea de tiempo del bulto con ${tl.eventos.length} eventos`);
ok((await op.llamar('/api/auth/logout', 'POST')).status === 200 && (await op.llamar('/api/panel')).status === 401, 'cerrar sesion invalida la cookie');
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);
