// Textos de los avisos por WhatsApp con formato profesional y amigable
const MARCA = 'Cooperativa Unión Cariamanga';

export function fechaEC(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' }).format(d);
}

// Limpia el nombre de la agencia quitando "(DEMO)" o palabras redundantes
function limpiarAgencia(nombre: string): string {
  return (nombre || '').replace(/\s*\(DEMO\)/gi, '').trim();
}

export const T = {
  registro_confirmado: (p: { nombre: string; remitente: string; n: number; destino: string }) => {
    const paquetesTexto = p.n === 1 ? '1 paquete' : `${p.n} paquetes`;
    const agDestino = limpiarAgencia(p.destino);
    return `📦 *${MARCA}* — Encomiendas\n\n` +
      `¡Hola *${p.nombre}*! 👋\n` +
      `Hemos registrado una encomienda a tu nombre enviada por *${p.remitente}*.\n\n` +
      `📋 *Detalle del envío:*\n` +
      `• Cantidad: ${paquetesTexto}\n` +
      `• Destino: ${agDestino}\n\n` +
      `Te notificaremos en tiempo real cuando tu encomienda salga a carretera y cuando esté lista para retirar. ✨`;
  },

  en_camino: (p: { n: number; desde: string; destino: string }) => {
    const paquetesTexto = p.n === 1 ? 'Tu paquete va' : `Tus ${p.n} paquetes van`;
    return `🚌 *${MARCA}* — En camino\n\n` +
      `¡Buenas noticias! ${paquetesTexto} viajando en nuestra unidad rumbo a *${limpiarAgencia(p.destino)}*.\n\n` +
      `📍 Salida registrada desde: ${limpiarAgencia(p.desde)}\n` +
      `🕒 Fecha y hora: ${fechaEC()}\n\n` +
      `Te avisaremos en cuanto llegue a la agencia de destino. 🚀`;
  },

  llegada_intermedia: (p: { agencia: string; recibidos: number; total: number; destino: string }) => {
    return `🔄 *${MARCA}* — Escala de viaje\n\n` +
      `Tu envío ha llegado a la agencia de *${limpiarAgencia(p.agencia)}* (${p.recibidos} de ${p.total} paquete(s)) para su conexión y continúa su ruta hacia *${limpiarAgencia(p.destino)}*.\n\n` +
      `🕒 Actualizado: ${fechaEC()}`;
  },

  disponible_retiro: (p: { agencia: string; codigo: string; hasta: Date; encCodigo?: string }) => {
    return `🎉 *${MARCA}* — ¡Tu encomienda está lista!\n\n` +
      `Tu paquete (${p.encCodigo ? `*${p.encCodigo}*` : 'encomienda'}) ya se encuentra disponible para entrega en *${limpiarAgencia(p.agencia)}*.\n\n` +
      `🔐 *Tu Código de Retiro es:* *${p.codigo}*\n` +
      `📅 Válido hasta: ${fechaEC(p.hasta)}\n\n` +
      `📌 *Importante para retirar:*\n` +
      `1. Indica este código de retiro en ventanilla.\n` +
      `2. Presenta tu cédula o documento de identidad.\n\n` +
      `¡Gracias por confiar en Cooperativa Unión Cariamanga! 🤝`;
  },
};
