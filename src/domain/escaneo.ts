// Decision de un escaneo (carga o descarga). PURO.
import { Estado, BLOQUEADOS_PARA_CARGA } from './estados';

export type TipoEscaneo = 'carga' | 'descarga';
export type ResultadoEscaneo =
  | 'ok' | 'repetido' | 'ya_a_bordo' | 'no_esperado' | 'conflicto_asignacion'
  | 'bloqueado' | 'descarga_incorrecta' | 'debia_continuar' | 'desconocido';

export interface EntradaEscaneo {
  tipo: TipoEscaneo;
  parada: number;
  viajeCmd: string;
  estado: Estado;
  viajeBulto: string | null;
  /** Item del manifiesto VIGENTE de viajeCmd, SIN filtrar por parada. */
  item: { sube: number; baja: number } | null;
}
export interface DecisionEscaneo {
  resultado: ResultadoEscaneo;
  nuevoEstado?: Estado;
  incidencia?: 'sobrante' | 'descarga_incorrecta' | 'pasado_de_parada';
  alerta?: string;
}

export function decidirEscaneo(i: EntradaEscaneo): DecisionEscaneo {
  if (BLOQUEADOS_PARA_CARGA.includes(i.estado)) {
    return { resultado: 'bloqueado', alerta: `Bulto ${i.estado}: no se puede operar` };
  }
  return i.tipo === 'carga' ? decidirCarga(i) : decidirDescarga(i);
}

function decidirCarga(i: EntradaEscaneo): DecisionEscaneo {
  if (i.estado === 'cargado' && i.viajeBulto === i.viajeCmd) return { resultado: 'repetido' };
  if ((i.estado === 'cargado' || i.estado === 'en_transito') && i.viajeBulto && i.viajeBulto !== i.viajeCmd) {
    return { resultado: 'conflicto_asignacion', alerta: 'Cargado en otro viaje activo' };
  }
  if (!i.item) {
    return { resultado: 'no_esperado', incidencia: 'sobrante', alerta: 'No pertenece a este viaje' };
  }
  // Continua a bordo: informativo, sin cambio de estado
  if (i.estado === 'en_transito' && i.item.sube < i.parada && i.item.baja > i.parada) {
    return { resultado: 'ya_a_bordo', alerta: 'Continua a bordo (ya estaba cargado)' };
  }
  if (i.item.sube !== i.parada) {
    return { resultado: 'no_esperado', alerta: 'No se carga en esta parada' };
  }
  if (i.estado !== 'pendiente_despacho') {
    return { resultado: 'conflicto_asignacion', alerta: `Estado actual: ${i.estado}` };
  }
  return { resultado: 'ok', nuevoEstado: 'cargado' };
}

function decidirDescarga(i: EntradaEscaneo): DecisionEscaneo {
  if (i.estado === 'descargado' || i.estado === 'recibido_agencia') return { resultado: 'repetido' };
  if (!i.item || i.viajeBulto !== i.viajeCmd) {
    return { resultado: 'descarga_incorrecta', incidencia: 'descarga_incorrecta', alerta: 'Este bulto no viene en este viaje' };
  }
  if (i.estado !== 'en_transito') {
    return { resultado: 'conflicto_asignacion', alerta: `Estado actual: ${i.estado}` };
  }
  if (i.item.sube < i.parada && i.item.baja > i.parada) {
    return { resultado: 'debia_continuar', incidencia: 'descarga_incorrecta', alerta: 'Este bulto CONTINUA a bordo. No lo baje.' };
  }
  if (i.item.baja === i.parada) return { resultado: 'ok', nuevoEstado: 'descargado' };
  if (i.item.baja < i.parada) {
    return { resultado: 'ok', nuevoEstado: 'descargado', incidencia: 'pasado_de_parada',
      alerta: 'Se paso de su parada: queda incidencia' };
  }
  return { resultado: 'conflicto_asignacion', alerta: 'Este bulto aun no corresponde bajar aqui' };
}
