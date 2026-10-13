import { describe, it, expect } from 'vitest';
import { evaluarSalida } from '@/domain/salida';
import { decidirEscaneo } from '@/domain/escaneo';
import { transitar, tras_recepcion, anular, retener, liberar } from '@/domain/estados';
import { cotizar, pesoVolumetricoG } from '@/domain/tarifa';
import { nuevoQrToken, nuevoCodigoLegible, QR_REGEX, clasificarCodigo, hmacCodigo, codigoCoincide, nuevoCodigoRetiro } from '@/domain/codigos';

const base = {
  cargadosValidos: new Set<string>(), descargados: new Set<string>(), faltantesAbiertos: new Set<string>(),
  conteoContinuan: null as number | null, reescaneados: new Set<string>(), exigirReescaneo: false, conflictosCriticos: 0,
};

describe('salida por parada (criterios 3, 22)', () => {
  const items = [
    { bultoId: 'a', rol: 'sube' as const }, { bultoId: 'b', rol: 'sube' as const },
    { bultoId: 'c', rol: 'continua' as const }, { bultoId: 'd', rol: 'baja' as const },
  ];
  const ok = { ...base, items, cargadosValidos: new Set(['a', 'b']), descargados: new Set(['d']), conteoContinuan: 1 };

  it('autoriza cuando todo concilia', () => {
    const r = evaluarSalida(ok);
    expect(r.normalPermitida).toBe(true);
    expect(r.esperadoABordo).toBe(3);
  });
  it('N escaneos no bastan: se concilia por identidad', () => {
    const r = evaluarSalida({ ...ok, cargadosValidos: new Set(['a', 'x']) });
    expect(r.normalPermitida).toBe(false);
    expect(r.bloqueos[0]).toMatchObject({ codigo: 'carga_incompleta', bultos: ['b'] });
  });
  it('un faltante abierto bloquea lo normal y permite excepcion A', () => {
    const r = evaluarSalida({ ...ok, cargadosValidos: new Set(['a']), faltantesAbiertos: new Set(['b']) });
    expect(r.normalPermitida).toBe(false);
    expect(r.excepcionPermitida).toBe('A');
  });
  it('los que continuan exigen conteo exacto', () => {
    expect(evaluarSalida({ ...ok, conteoContinuan: null }).bloqueos.map(b => b.codigo)).toContain('conteo_continuan_faltante');
    expect(evaluarSalida({ ...ok, conteoContinuan: 2 }).bloqueos.map(b => b.codigo)).toContain('conteo_continuan_no_coincide');
  });
  it('con reescaneo exigido se concilia por identidad', () => {
    expect(evaluarSalida({ ...ok, exigirReescaneo: true }).normalPermitida).toBe(false);
    expect(evaluarSalida({ ...ok, exigirReescaneo: true, reescaneados: new Set(['c']) }).normalPermitida).toBe(true);
  });
  it('bulto que debia bajar y no bajo bloquea (G9)', () => {
    const r = evaluarSalida({ ...ok, descargados: new Set() });
    expect(r.bloqueos.map(b => b.codigo)).toContain('baja_pendiente');
  });
  it('conflictos criticos NO son excepcionables', () => {
    const r = evaluarSalida({ ...ok, conflictosCriticos: 1 });
    expect(r.normalPermitida).toBe(false);
    expect(r.excepcionPermitida).toBeNull();
  });
});

describe('escaneo (criterios 1, 2, 6, 13, 21)', () => {
  const e = { parada: 2, viajeCmd: 'V1', viajeBulto: 'V1' as string | null };
  it('paquete ajeno al viaje => sobrante', () => {
    const d = decidirEscaneo({ ...e, tipo: 'carga', estado: 'pendiente_despacho', item: null });
    expect(d.resultado).toBe('no_esperado'); expect(d.incidencia).toBe('sobrante');
  });
  it('carga correcta', () => {
    const d = decidirEscaneo({ ...e, tipo: 'carga', estado: 'pendiente_despacho', item: { sube: 2, baja: 3 } });
    expect(d.resultado).toBe('ok'); expect(d.nuevoEstado).toBe('cargado');
  });
  it('carga repetida no cambia nada', () => {
    const d = decidirEscaneo({ ...e, tipo: 'carga', estado: 'cargado', item: { sube: 2, baja: 4 } });
    expect(d.resultado).toBe('repetido'); expect(d.nuevoEstado).toBeUndefined();
  });
  it('anulado o retenido no se carga', () => {
    for (const estado of ['anulado', 'retenido'] as const)
      expect(decidirEscaneo({ ...e, tipo: 'carga', estado, item: { sube: 2, baja: 4 } }).resultado).toBe('bloqueado');
  });
  it('descarga de un bulto que continua => alerta y sin cambio de estado', () => {
    const d = decidirEscaneo({ ...e, tipo: 'descarga', estado: 'en_transito', item: { sube: 1, baja: 4 } });
    expect(d.resultado).toBe('debia_continuar'); expect(d.nuevoEstado).toBeUndefined();
  });
  it('descarga de otro viaje no cambia en silencio', () => {
    const d = decidirEscaneo({ ...e, viajeBulto: 'V9', tipo: 'descarga', estado: 'en_transito', item: null });
    expect(d.resultado).toBe('descarga_incorrecta'); expect(d.nuevoEstado).toBeUndefined();
  });
  it('descarga correcta en su parada', () => {
    const d = decidirEscaneo({ ...e, tipo: 'descarga', estado: 'en_transito', item: { sube: 1, baja: 2 } });
    expect(d.nuevoEstado).toBe('descargado'); expect(d.incidencia).toBeUndefined();
  });
  it('se paso de parada (G4): baja con incidencia', () => {
    const d = decidirEscaneo({ ...e, tipo: 'descarga', estado: 'en_transito', item: { sube: 0, baja: 1 } });
    expect(d.nuevoEstado).toBe('descargado'); expect(d.incidencia).toBe('pasado_de_parada');
  });
});

describe('estados', () => {
  it('ciclo completo de un tramo', () => {
    let s = transitar('registrado', 'cerrar_manifiesto');
    s = transitar(s, 'cargar'); s = transitar(s, 'salida_real'); s = transitar(s, 'descargar'); s = transitar(s, 'recibir');
    expect(s).toBe('recibido_agencia');
    expect(tras_recepcion('loja', 'zumba')).toBe('pendiente_redespacho');
    expect(tras_recepcion('zumba', 'zumba')).toBe('disponible_retiro');
  });
  it('transiciones invalidas lanzan', () => {
    expect(() => transitar('registrado', 'cargar')).toThrow();
    expect(() => transitar('en_transito', 'entregar')).toThrow();
  });
  it('anular, retener y liberar', () => {
    expect(anular('registrado')).toBe('anulado');
    expect(() => anular('cargado')).toThrow();
    const r = retener('cargado'); expect(r.nuevo).toBe('retenido');
    expect(liberar('retenido', r.previo)).toBe('cargado');
  });
});

describe('tarifa', () => {
  const reglas = [{ id: 'r1', desdeG: 0, hastaG: 5000, precioCent: 300 }, { id: 'r2', desdeG: 5000, hastaG: 20000, precioCent: 700 }];
  it('peso volumetrico', () => expect(pesoVolumetricoG(500, 400, 300, 5000)).toBe(12000));
  it('rangos: desde incluido, hasta excluido', () => {
    expect(cotizar([{ pesoG: 4999 }], reglas, 5000).valorCent).toBe(300);
    expect(cotizar([{ pesoG: 5000 }], reglas, 5000).valorCent).toBe(700);
  });
  it('usa el mayor entre peso real y volumetrico', () => {
    const r = cotizar([{ pesoG: 1000, largoMm: 500, anchoMm: 400, altoMm: 300 }], reglas, 5000);
    expect(r.detalle[0].pesoFactG).toBe(12000); expect(r.valorCent).toBe(700);
  });
  it('sin regla: no se inventa tarifa', () => {
    const r = cotizar([{ pesoG: 90000 }], reglas, 5000);
    expect(r.sinRegla).toBe(true); expect(r.valorCent).toBe(0);
  });
  it('suma por bulto', () => expect(cotizar([{ pesoG: 100 }, { pesoG: 6000 }], reglas, 5000).valorCent).toBe(1000));
});

describe('codigos', () => {
  it('QR: formato y longitud', () => { for (let i = 0; i < 200; i++) expect(nuevoQrToken()).toMatch(QR_REGEX); });
  it('codigos legibles unicos', () => expect(new Set(Array.from({ length: 1000 }, nuevoCodigoLegible)).size).toBe(1000));
  it('clasifica QR y legible, tolera guion y minusculas', () => {
    const q = nuevoQrToken();
    expect(clasificarCodigo(q)).toEqual({ qrToken: q });
    expect(clasificarCodigo('abcd-2345')).toEqual({ codigoLegible: 'ABCD2345' });
    expect(clasificarCodigo('xx')).toBeNull();
  });
  it('codigo de retiro: 6 digitos y HMAC', () => {
    const c = nuevoCodigoRetiro(); expect(c).toMatch(/^\d{6}$/);
    const h = hmacCodigo('s', 'enc1', c);
    expect(codigoCoincide(h, 's', 'enc1', c)).toBe(true);
    expect(codigoCoincide(h, 's', 'enc1', '000000' === c ? '000001' : '000000')).toBe(false);
    expect(codigoCoincide(h, 's', 'enc2', c)).toBe(false);
  });
});
