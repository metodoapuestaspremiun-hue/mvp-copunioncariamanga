import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: '50px', marginBottom: '10px' }}>🔍</div>
      <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f1d38', marginBottom: '8px' }}>Página no encontrada</h2>
      <p style={{ color: '#64748b', marginBottom: '20px' }}>La ruta solicitada no existe o no tienes permisos para acceder.</p>
      <Link href="/panel" className="btn">
        Ir al Panel Principal ➔
      </Link>
    </div>
  );
}
