// Maquina de estados del bulto. Unica fuente de verdad de las transiciones. PURO: sin BD ni HTTP.
export type Estado =
  | 'registrado' | 'pendiente_despacho' | 'cargado' | 'en_transito' | 'descargado'
  | 'recibido_agencia' | 'pendiente_redespacho' | 'disponible_retiro' | 'entregado'
  | 'anulado' | 'retenido' | 'devuelto';

export type Accion = 'cerrar_manifiesto' | 'cargar' | 'salida_real' | 'descargar' | 'recibir' | 'entregar';

const T: Record<Accion, Partial<Record<Estado, Estado>>> = {
  cerrar_manifiesto: { registrado: 'pendiente_despacho', pendiente_redespacho: 'pendiente_despacho' },
  cargar: { pendiente_despacho: 'cargado' },
  salida_real: { cargado: 'en_transito' },
  descargar: { en_transito: 'descargado' },
  recibir: { descargado: 'recibido_agencia' },
  entregar: { disponible_retiro: 'entregado' },
};

export class TransicionInvalida extends Error {
  constructor(public estado: Estado, public accion: Accion | string) {
    super(`No se puede '${accion}' desde '${estado}'`);
  }
}

export function transitar(e: Estado, a: Accion): Estado {
  const n = T[a][e];
  if (!n) throw new TransicionInvalida(e, a);
  return n;
}

/** Tras 'recibido_agencia' el sistema decide el siguiente estado. */
export function tras_recepcion(agenciaRecepcionId: string, destinoFinalId: string): 'disponible_retiro' | 'pendiente_redespacho' {
  return agenciaRecepcionId === destinoFinalId ? 'disponible_retiro' : 'pendiente_redespacho';
}

const ANULABLES: Estado[] = ['registrado', 'pendiente_despacho', 'pendiente_redespacho'];
const RETENIBLES: Estado[] = ['registrado', 'pendiente_despacho', 'cargado', 'en_transito', 'descargado',
  'recibido_agencia', 'pendiente_redespacho', 'disponible_retiro'];

export function anular(e: Estado): Estado {
  if (!ANULABLES.includes(e)) throw new TransicionInvalida(e, 'anular');
  return 'anulado';
}
export function retener(e: Estado): { nuevo: Estado; previo: Estado } {
  if (!RETENIBLES.includes(e)) throw new TransicionInvalida(e, 'retener');
  return { nuevo: 'retenido', previo: e };
}
export function liberar(e: Estado, previo: Estado | null): Estado {
  if (e !== 'retenido' || !previo) throw new TransicionInvalida(e, 'liberar');
  return previo;
}
export const BLOQUEADOS_PARA_CARGA: Estado[] = ['anulado', 'retenido', 'devuelto', 'entregado'];
