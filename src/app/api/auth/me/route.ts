import { api } from '@/server/http';
export const GET = api({ permiso: null }, async ({ user }) => user);
