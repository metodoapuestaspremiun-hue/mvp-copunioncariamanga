export type Rol = 'operador' | 'despachador' | 'ayudante' | 'guardia' | 'responsable_agencia'
  | 'evaluador' | 'supervisor' | 'gerente' | 'admin';

export const PUEDE: Record<Rol, string[]> = {
  operador: ['encomienda:crear', 'cotizar', 'etiqueta:imprimir', 'recepcion:confirmar', 'entrega:crear',
    'escaneo:operar', 'redespacho:asignar', 'manifiesto:gestionar', 'ver:panel'],
  despachador: ['manifiesto:gestionar', 'redespacho:asignar', 'ver:panel'],
  ayudante: ['escaneo:operar', 'conteo:continuan', 'ver:panel'],
  guardia: ['salida:autorizar', 'salida:registrar_real', 'ver:panel'],
  responsable_agencia: ['salida:autorizar', 'salida:registrar_real', 'ver:panel'],
  evaluador: ['cotizacion:fijar_rango', 'ver:panel'],
  supervisor: ['excepcion:autorizar', 'entrega_parcial:autorizar', 'incidencia:resolver', 'redespacho:asignar',
    'ver:panel', 'ver:mensajes', 'export:csv'],
  gerente: ['ver:panel', 'ver:mensajes', 'export:csv', 'ver:todo'],
  admin: ['usuario:gestionar', 'tarifa:gestionar', 'ver:panel', 'ver:mensajes', 'export:csv'],
};

export interface SesionUsuario {
  id: string; nombre: string; email: string;
  roles: { rol: Rol; agenciaId: string | null }[];
}

/** ¿Tiene el permiso (opcionalmente en una agencia)? agenciaId null en el rol = todas las agencias. */
export function puede(u: SesionUsuario, permiso: string, agenciaId?: string | null): boolean {
  return u.roles.some(r => PUEDE[r.rol]?.includes(permiso) && (!agenciaId || r.agenciaId === null || r.agenciaId === agenciaId));
}
