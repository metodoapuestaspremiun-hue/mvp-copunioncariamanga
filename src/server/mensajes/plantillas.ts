// Textos de los avisos. Dicen "ultima informacion registrada": NUNCA ubicacion en vivo.
const MARCA = 'Union Transportes Cariamanga';
export function fechaEC(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' }).format(d);
}
export const T = {
  registro_confirmado: (p: { nombre: string; remitente: string; n: number; destino: string }) =>
    `Hola ${p.nombre}, ${MARCA} registro una encomienda para ti de parte de ${p.remitente}: ${p.n} bulto(s) con destino ${p.destino}. Te avisaremos cada avance.`,
  en_camino: (p: { n: number; desde: string; destino: string }) =>
    `Tu encomienda (${p.n} bulto(s)) salio de ${p.desde} rumbo a ${p.destino}. Ultima informacion registrada: ${fechaEC()}.`,
  llegada_intermedia: (p: { agencia: string; recibidos: number; total: number; destino: string }) =>
    `Tu encomienda llego a ${p.agencia} (${p.recibidos} de ${p.total} bultos) y continua su camino hacia ${p.destino}. Ultima informacion registrada: ${fechaEC()}.`,
  disponible_retiro: (p: { agencia: string; codigo: string; hasta: Date }) =>
    `Tu encomienda esta lista para retirar en ${p.agencia}. Tu codigo de retiro es ${p.codigo} y vale hasta el ${fechaEC(p.hasta)}. Presentalo con un documento de identidad.`,
};
