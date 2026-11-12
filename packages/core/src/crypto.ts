import crypto from 'node:crypto';

/**
 * Mã hóa và giải mã API Key / OAuth Token bằng AES-256-GCM (Mục 5 & Mục 12).
 * Khóa lấy từ biến môi trường APP_SECRET.
 */
function getSecretKey(): Buffer {
  const rawSecret = process.env.APP_SECRET || 'videoforge-secret-key-32-bytes!!';
  return crypto.createHash('sha256').update(rawSecret).digest();
}

export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const key = getSecretKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(cipherText?: string | null): string {
  if (!cipherText) return '';
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(secret?: string | null): string {
  if (!secret) return '';
  const plain = secret.includes(':') ? decryptSecret(secret) : secret;
  if (!plain) return '••••••••';
  if (plain.length <= 8) return '••••••••';
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}
