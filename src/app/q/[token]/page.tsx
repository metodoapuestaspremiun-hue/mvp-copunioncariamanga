// Pagina publica del QR: NO consulta la base de datos. Responde IGUAL con un token valido o invalido.
export const dynamic = 'force-dynamic';
export default function QR() {
  return (
    <main style={{ textAlign: 'center', paddingTop: 60 }}>
      <h1>Etiqueta de encomienda</h1>
      <p>Esta etiqueta pertenece a una encomienda de Union Transportes Cariamanga.</p>
      <p>Para ver o registrar movimientos, ingresa al sistema con tu usuario.</p>
      <a className="btn" href="/login">Ingresar</a>
    </main>
  );
}
