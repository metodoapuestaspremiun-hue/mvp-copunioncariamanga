'use client';
import { createContext, useContext } from 'react';
import type { SesionUsuario } from '@/shared/permisos';
export const SesionCtx = createContext<SesionUsuario | null>(null);
export const useUsuario = () => useContext(SesionCtx) as SesionUsuario;
