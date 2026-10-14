'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SesionCtx } from '@/components/Sesion';
import { puede, type SesionUsuario, type Rol } from '@/shared/permisos';

interface RolInfo {
  id: string;
  titulo: string;
  subtitulo: string;
  icono: string;
  roles: { rol: Rol; agenciaId: string | null }[];
  rutasPermitidas: { href: string; label: string; permiso?: string }[];
}

// Roles de la cooperativa
const ROLES: RolInfo[] = [
  {
    id: 'operador',
    titulo: 'Operador Ventanilla',
    subtitulo: 'Crea encomiendas, recibe y entrega',
    icono: '🏢',
    roles: [{ rol: 'operador', agenciaId: null }],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel' },
      { href: '/encomiendas/nueva', label: '+ Nueva encomienda', permiso: 'encomienda:crear' },
      { href: '/encomiendas', label: 'Encomiendas' },
      { href: '/viajes', label: 'Viajes' },
      { href: '/recepcion', label: 'Recepción', permiso: 'recepcion:confirmar' },
      { href: '/redespachos', label: 'Redespachos' },
      { href: '/entrega', label: 'Entrega a Cliente', permiso: 'entrega:crear' },
      { href: '/incidencias', label: 'Incidencias' },
    ],
  },
  {
    id: 'despachador',
    titulo: 'Despachador Andén',
    subtitulo: 'Arma viajes y manifiestos de carga',
    icono: '📋',
    roles: [{ rol: 'despachador', agenciaId: null }],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel' },
      { href: '/viajes', label: 'Viajes y Manifiestos' },
      { href: '/redespachos', label: 'Redespachos' },
      { href: '/incidencias', label: 'Incidencias' },
    ],
  },
  {
    id: 'ayudante',
    titulo: 'Ayudante de Bus',
    subtitulo: 'Escaneo de bultos y conteo a bordo',
    icono: '🚌',
    roles: [{ rol: 'ayudante', agenciaId: null }],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel' },
      { href: '/viajes', label: 'Mis Viajes (Escaneo)' },
      { href: '/incidencias', label: 'Incidencias' },
    ],
  },
  {
    id: 'guardia',
    titulo: 'Guardia / Control Salida',
    subtitulo: 'Verifica carga y autoriza salida',
    icono: '🛡️',
    roles: [{ rol: 'guardia', agenciaId: null }, { rol: 'responsable_agencia', agenciaId: null }],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel' },
      { href: '/viajes', label: 'Autorizar Salidas' },
      { href: '/incidencias', label: 'Incidencias' },
    ],
  },
  {
    id: 'supervisor',
    titulo: 'Supervisor Operativo',
    subtitulo: 'Resuelve incidencias y excepciones',
    icono: '⭐',
    roles: [{ rol: 'supervisor', agenciaId: null }],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel' },
      { href: '/incidencias', label: 'Resolver Incidencias' },
      { href: '/viajes', label: 'Autorizar Excepciones' },
      { href: '/redespachos', label: 'Redespachos' },
      { href: '/mensajes', label: 'Auditoría Mensajes', permiso: 'ver:mensajes' },
    ],
  },
  {
    id: 'gerente',
    titulo: 'Gerencia General',
    subtitulo: 'Supervisión y métricas globales',
    icono: '📊',
    roles: [{ rol: 'gerente', agenciaId: null }],
    rutasPermitidas: [
      { href: '/panel', label: 'Panel Ejecutivo' },
      { href: '/tarifas', label: 'Tarifas y Precios' },
      { href: '/encomiendas', label: 'Historial Encomiendas' },
      { href: '/viajes', label: 'Historial Viajes' },
      { href: '/incidencias', label: 'Auditoría Incidencias' },
      { href: '/mensajes', label: 'Mensajes WhatsApp', permiso: 'ver:mensajes' },
    ],
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [rolActualId, setRolActualId] = useState<string>('operador');
  const [sidebarAbierto, setSidebarAbierto] = useState<boolean>(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState<boolean>(false);

  // Inicializar rol y estado del sidebar
  useEffect(() => {
    // Cargar rol desde localStorage o cookie
    const rolGuardado = localStorage.getItem('rol_usuario');
    const cookiesArr = document.cookie.split('; ');
    const rolCookie = cookiesArr.find(row => row.startsWith('demo_rol='))?.split('=')[1];
    const rolFinal = rolGuardado || rolCookie;
    if (rolFinal && ROLES.some(r => r.id === rolFinal)) {
      setRolActualId(rolFinal);
    }
    const guardadoSidebar = localStorage.getItem('sidebar_abierto');
    // En escritorio por defecto abierto si no se ha guardado, en móvil cerrado
    if (guardadoSidebar !== null) {
      setSidebarAbierto(guardadoSidebar === 'true');
    } else if (typeof window !== 'undefined' && window.innerWidth > 900) {
      setSidebarAbierto(true);
    }
  }, []);

  // Cerrar menú móvil al cambiar de ruta
  useEffect(() => {
    setMenuMovilAbierto(false);
  }, [pathname]);

  const toggleSidebar = () => {
    setSidebarAbierto(prev => {
      const nuevo = !prev;
      localStorage.setItem('sidebar_abierto', String(nuevo));
      return nuevo;
    });
  };

  const cambiarRol = (nuevoRolId: string) => {
    setRolActualId(nuevoRolId);
    localStorage.setItem('rol_usuario', nuevoRolId);
    document.cookie = `demo_rol=${nuevoRolId}; path=/; max-age=86400; SameSite=Lax`;
    window.location.reload();
  };

  const configRol = ROLES.find(r => r.id === rolActualId) || ROLES[0];

  const sesionActiva: SesionUsuario = {
    id: `mvp-${configRol.id}`,
    nombre: configRol.titulo,
    email: `${configRol.id}@cariamanga.com`,
    roles: configRol.roles,
  };

  const enlacesDisponibles = configRol.rutasPermitidas.filter(
    link => !link.permiso || puede(sesionActiva, link.permiso)
  );

  return (
    <SesionCtx.Provider value={sesionActiva}>
      <div className="demo-wrapper">
        {/* BACKDROP PARA SIDEBAR DE PERFILES */}
        {sidebarAbierto && (
          <div 
            className="demo-sidebar-backdrop noprint" 
            onClick={toggleSidebar}
            aria-label="Cerrar menú de perfiles"
          />
        )}

        {/* SIDEBAR LATERAL PLEGABLE (PERFILES) */}
        <aside className={`demo-sidebar noprint ${sidebarAbierto ? 'abierto' : 'cerrado'}`}>
          <div className="demo-sidebar-header">
            <div>
              <p className="demo-sidebar-title">Perfiles de Usuario</p>
              <h3 className="demo-sidebar-subtitle">Cambiar Perfil</h3>
            </div>
            <button
              type="button"
              onClick={toggleSidebar}
              className="btn-icono-sidebar"
              title="Ocultar barra lateral"
            >
              ✕
            </button>
          </div>

          <div className="demo-roles-list">
            {ROLES.map(rol => {
              const estaActivo = rol.id === rolActualId;
              return (
                <button
                  key={rol.id}
                  type="button"
                  onClick={() => {
                    cambiarRol(rol.id);
                    setSidebarAbierto(false);
                  }}
                  className={`demo-role-btn ${estaActivo ? 'active' : ''}`}
                >
                  <span className="demo-role-name">
                    <span>{rol.icono} {rol.titulo}</span>
                    {estaActivo && <span className="demo-role-badge">Activo</span>}
                  </span>
                  <span className="demo-role-desc">{rol.subtitulo}</span>
                </button>
              );
            })}
          </div>

          <div style={{ padding: '14px 16px', borderTop: '1px solid #1e293b', fontSize: '12px', color: '#64748b' }}>
            Cooperativa Unión Cariamanga
          </div>
        </aside>

        {/* CONTENIDO PRINCIPAL: Header superior + Páginas */}
        <div className="demo-content-area">
          <nav className="top-header noprint">
            {/* Botón para cambiar de Rol */}
            <button
              type="button"
              onClick={toggleSidebar}
              className="btn-abrir-sidebar"
              title="Cambiar perfil"
            >
              <span>👥</span>
              <span className="btn-perfiles-texto">Perfiles</span>
            </button>

            <span className="brand">
              <span>📦</span>
              <span className="brand-texto">Cariamanga</span>
            </span>

            {/* Enlaces de navegación: en desktop están inline en el header, en móvil se muestran abajo */}
            <div className={`top-header-links ${menuMovilAbierto ? 'movil-visible' : ''}`}>
              {enlacesDisponibles.map(link => {
                const activo = pathname === link.href || (link.href !== '/panel' && pathname.startsWith(link.href));
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={activo ? 'activo' : ''}
                    onClick={() => setMenuMovilAbierto(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>

            <span className="header-spacer" />

            {/* Chip del rol actual */}
            <div 
              className="role-indicator-chip" 
              onClick={toggleSidebar} 
              style={{ cursor: 'pointer' }} 
              title="Toca para cambiar de rol"
            >
              <b>{configRol.icono} <span className="role-chip-name">{configRol.titulo}</span></b>
            </div>

            {/* Botón hamburguesa solo para pantallas móviles */}
            <button
              type="button"
              onClick={() => setMenuMovilAbierto(prev => !prev)}
              className="btn-hamburguesa-movil"
              aria-label="Abrir menú de navegación"
              title="Menú de secciones"
            >
              {menuMovilAbierto ? '✕' : '☰'}
            </button>
          </nav>

          <main>{children}</main>
        </div>
      </div>
    </SesionCtx.Provider>
  );
}
