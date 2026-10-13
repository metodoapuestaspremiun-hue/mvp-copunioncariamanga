'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { llamar } from '@/lib/cliente';
import { Error_ } from '@/components/ui';

export default function Login() {
  const r = useRouter();
  useEffect(() => {
    r.replace('/panel');
  }, [r]);
  const [email, setEmail] = useState('operador@demo.local'); const [password, setPassword] = useState('');
  const [err, setErr] = useState<any>(null); const [cargando, setCargando] = useState(false);
  const entrar = async () => {
    setErr(null); setCargando(true);
    try { await llamar('/api/auth/login', 'POST', { email, password }); r.push('/panel'); }
    catch (e) { setErr(e); } finally { setCargando(false); }
  };
  return (
    <main style={{ maxWidth: 420, paddingTop: 50 }}>
      <div className="card">
        <h1>Trazabilidad de Encomiendas</h1>
        <p className="muted">Union Transportes Cariamanga · <b>DEMOSTRACION</b> (datos ficticios)</p>
        <label>Correo<input value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label style={{ marginTop: 10 }}>Contrasena<input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} /></label>
        <Error_ e={err} />
        <div style={{ marginTop: 14 }}><button onClick={entrar} disabled={cargando}>Ingresar</button></div>
        <p className="muted" style={{ marginTop: 16 }}>Usuarios de demo: operador@, ayudante@, supervisor@, gerente@ (todos @demo.local)</p>
      </div>
    </main>
  );
}
