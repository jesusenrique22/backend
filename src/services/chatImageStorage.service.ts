import fs from 'fs';
import path from 'path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'chat-images');
const MAX_BYTES = 6 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function ensureChatUploadDir(): void {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

export function saveBase64ChatImage(
  base64: string,
  mimeType: string,
): { fileUrl: string; mimeType: string } {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error('Solo se permiten imágenes (JPG, PNG, WebP, GIF)');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_BYTES) {
    throw new Error('La imagen supera el límite de 6 MB');
  }
  if (buffer.length === 0) {
    throw new Error('Imagen vacía');
  }

  ensureChatUploadDir();
  const ext =
    mimeType === 'image/png'
      ? '.png'
      : mimeType === 'image/webp'
        ? '.webp'
        : mimeType === 'image/gif'
          ? '.gif'
          : '.jpg';
  const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_ROOT, storedName), buffer);

  return {
    fileUrl: `/uploads/chat-images/${storedName}`,
    mimeType,
  };
}
