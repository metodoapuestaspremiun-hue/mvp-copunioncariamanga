import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const prefijo = (formData.get('prefijo') as string) || 'evidencia';

    if (!file) {
      return NextResponse.json({ error: 'No se envió ningún archivo' }, { status: 400 });
    }

    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const apiKey = process.env.BUNNY_STORAGE_API_KEY;
    const storageHost = process.env.BUNNY_STORAGE_HOST || 'storage.bunnycdn.com';
    const pullZone = process.env.BUNNY_PULLZONE_URL || 'https://mvps.b-cdn.net';

    if (!storageZone || !apiKey) {
      return NextResponse.json({ error: 'Credenciales de BunnyCDN no configuradas' }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${prefijo}-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
    const uploadUrl = `https://${storageHost}/${storageZone}/cariamanga/${fileName}`;

    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        AccessKey: apiKey,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: buffer,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Fallo al subir a BunnyCDN: ${errText}` }, { status: 502 });
    }

    const publicUrl = `${pullZone}/cariamanga/${fileName}`;
    return NextResponse.json({ ok: true, url: publicUrl, fileName });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
