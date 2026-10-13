// Utilidades del navegador (NO importar modulos de node aqui).
export async function llamar<T = any>(url: string, metodo = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, { method: metodo, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e: any = new Error(j.mensaje || j.error || `Error ${r.status}`);
    e.codigo = j.error; e.detalle = j.detalle; e.status = r.status;
    if (r.status === 401 && typeof window !== 'undefined' && !location.pathname.startsWith('/login')) location.href = '/login';
    throw e;
  }
  return j as T;
}
export const fechaEC = (d?: string | Date | null) =>
  d ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' }).format(new Date(d)) : '';
export const dinero = (c?: number | null) => (c == null ? '' : `$${(c / 100).toFixed(2)}`);
export const fmtLegible = (s: string) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s);
export const nuevoEventId = () => crypto.randomUUID();
export const ETIQUETA_ESTADO: Record<string, string> = {
  registrado: 'Registrado', pendiente_despacho: 'Pendiente de despacho', cargado: 'Cargado', en_transito: 'En transito', descargado: 'Descargado',
  recibido_agencia: 'Recibido en agencia', pendiente_redespacho: 'Pendiente de redespacho', disponible_retiro: 'Disponible para retiro',
  entregado: 'Entregado', anulado: 'Anulado', retenido: 'Retenido', devuelto: 'Devuelto',
  entregada: 'Entregada', parcialmente_disponible: 'Parcialmente disponible', en_proceso: 'En proceso',
};
