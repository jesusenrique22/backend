import fs from 'fs';
import path from 'path';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'medical-documents');
const MAX_BYTES = 12 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function ensureUploadDir(): void {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

export function saveBase64MedicalFile(
  base64: string,
  mimeType: string,
  originalName: string,
): { fileUrl: string; fileName: string; fileSize: number; mimeType: string } {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error('Tipo de archivo no permitido. Usa PDF o imagen (JPG, PNG, WebP).');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > MAX_BYTES) {
    throw new Error('El archivo supera el límite de 12 MB');
  }
  if (buffer.length === 0) {
    throw new Error('Archivo vacío');
  }

  ensureUploadDir();
  const ext = extensionForMime(mimeType, originalName);
  const safeBase = sanitizeFileName(originalName).replace(/\.[^.]+$/, '') || 'documento';
  const storedName = `${Date.now()}-${safeBase}${ext}`;
  const absPath = path.join(UPLOAD_ROOT, storedName);
  fs.writeFileSync(absPath, buffer);

  return {
    fileUrl: `/uploads/medical-documents/${storedName}`,
    fileName: originalName || storedName,
    fileSize: buffer.length,
    mimeType,
  };
}

export function deleteMedicalFile(fileUrl: string): void {
  if (!fileUrl.startsWith('/uploads/medical-documents/')) return;
  const name = path.basename(fileUrl);
  const abs = path.join(UPLOAD_ROOT, name);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

function extensionForMime(mimeType: string, originalName: string): string {
  const fromName = path.extname(originalName).toLowerCase();
  if (fromName && ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)) {
    return fromName;
  }
  switch (mimeType) {
    case 'application/pdf':
      return '.pdf';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    default:
      return '.jpg';
  }
}
