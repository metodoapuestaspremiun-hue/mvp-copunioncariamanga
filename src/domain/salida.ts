// Conciliacion para autorizar la salida de una parada. NO cuenta escaneos: concilia conjuntos. PURO.
export type RolEnParada = 'sube' | 'continua' | 'baja';
export interface ItemParada { bultoId: string; rol: RolEnParada }

export interface EntradaSalida {
  items: ItemParada[];                  // manifiesto vigente, filtrado a esta parada
  cargadosValidos: Set<string>;         // bultos 'sube' correctamente cargados
  descargados: Set<string>;             // bultos 'baja' ya descargados
  faltantesAbiertos: Set<string>;       // bultos con incidencia 'faltante' abierta
  conteoContinuan: number | null;       // conteo del ayudante
  reescaneados: Set<string>;            // solo si exigirReescaneo
  exigirReescaneo: boolean;
  conflictosCriticos: number;           // incidencias sobrante/descarga_incorrecta sin resolver
}

export type CodigoBloqueo =
  | 'conflicto_critico' | 'carga_incompleta' | 'baja_pendiente' | 'faltante_abierto'
  | 'conteo_continuan_faltante' | 'conteo_continuan_no_coincide';
export interface Bloqueo { codigo: CodigoBloqueo; bultos?: string[]; esperado?: number; recibido?: number }

export interface ResultadoSalida {
  normalPermitida: boolean;
  excepcionPermitida: 'A' | null;
  bloqueos: Bloqueo[];
  esperadoABordo: number;
}

// 'conflicto_critico' NO es excepcionable: primero se resuelve la incidencia.
const EXCEPCIONABLES = new Set<CodigoBloqueo>([
  'carga_incompleta', 'baja_pendiente', 'faltante_abierto', 'conteo_continuan_faltante', 'conteo_continuan_no_coincide',
]);

export function evaluarSalida(e: EntradaSalida): ResultadoSalida {
  const sube = e.items.filter(i => i.rol === 'sube').map(i => i.bultoId);
  const continua = e.items.filter(i => i.rol === 'continua').map(i => i.bultoId);
  const baja = e.items.filter(i => i.rol === 'baja').map(i => i.bultoId);
  const bloqueos: Bloqueo[] = [];

  const sinCarga = sube.filter(id => !e.cargadosValidos.has(id));
  const sinCargaFalt = sinCarga.filter(id => e.faltantesAbiertos.has(id));
  const sinCargaSolo = sinCarga.filter(id => !e.faltantesAbiertos.has(id));
  if (sinCargaSolo.length) bloqueos.push({ codigo: 'carga_incompleta', bultos: sinCargaSolo });
  if (sinCargaFalt.length) bloqueos.push({ codigo: 'faltante_abierto', bultos: sinCargaFalt });

  const sinBajar = baja.filter(id => !e.descargados.has(id));
  const sinBajarFalt = sinBajar.filter(id => e.faltantesAbiertos.has(id));
  const sinBajarSolo = sinBajar.filter(id => !e.faltantesAbiertos.has(id));
  if (sinBajarSolo.length) bloqueos.push({ codigo: 'baja_pendiente', bultos: sinBajarSolo });
  if (sinBajarFalt.length) bloqueos.push({ codigo: 'faltante_abierto', bultos: sinBajarFalt });

  if (continua.length > 0) {
    if (e.exigirReescaneo) {
      const falta = continua.filter(id => !e.reescaneados.has(id));
      if (falta.length) bloqueos.push({ codigo: 'conteo_continuan_no_coincide', bultos: falta });
    } else if (e.conteoContinuan === null) {
      bloqueos.push({ codigo: 'conteo_continuan_faltante', esperado: continua.length });
    } else if (e.conteoContinuan !== continua.length) {
      bloqueos.push({ codigo: 'conteo_continuan_no_coincide', esperado: continua.length, recibido: e.conteoContinuan });
    }
  }

  if (e.conflictosCriticos > 0) bloqueos.push({ codigo: 'conflicto_critico', recibido: e.conflictosCriticos });

  const esperadoABordo = continua.length + sube.length;
  if (bloqueos.length === 0) return { normalPermitida: true, excepcionPermitida: null, bloqueos, esperadoABordo };
  const todos = bloqueos.every(b => EXCEPCIONABLES.has(b.codigo));
  return { normalPermitida: false, excepcionPermitida: todos ? 'A' : null, bloqueos, esperadoABordo };
}

export function describirBloqueo(b: Bloqueo): string {
  switch (b.codigo) {
    case 'carga_incompleta': return `Faltan por cargar ${b.bultos?.length} bulto(s)`;
    case 'baja_pendiente': return `Debian bajar y siguen a bordo: ${b.bultos?.length} bulto(s)`;
    case 'faltante_abierto': return `Hay ${b.bultos?.length} bulto(s) con faltante abierto`;
    case 'conteo_continuan_faltante': return `Falta el conteo de bultos que continuan (esperado ${b.esperado})`;
    case 'conteo_continuan_no_coincide':
      return b.bultos ? `Faltan re-escanear ${b.bultos.length} bulto(s) que continuan`
        : `El conteo de continuan no coincide (esperado ${b.esperado}, recibido ${b.recibido})`;
    case 'conflicto_critico': return `Hay ${b.recibido} incidencia(s) sin resolver (sobrante / descarga incorrecta)`;
  }
}
