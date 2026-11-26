import crypto from 'node:crypto';

export const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function isValidYouTubeVideoId(videoId) {
  return typeof videoId === 'string' && YOUTUBE_VIDEO_ID_REGEX.test(videoId.trim());
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function hmacSha256Hex(secret, value) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex');
}

export function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function generateRandomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateStudentCode(board = 'AP') {
  const prefix = board === 'TS' ? 'TS10' : 'AP10';
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${rand}`;
}

export function maskPhoneOrEmail(phone, email) {
  if (phone && phone.length >= 6) {
    return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
  }
  if (email && email.includes('@')) {
    const [local, domain] = email.split('@');
    const safeLocal = local.length > 2 ? `${local.slice(0, 2)}***` : `${local[0] || '*'}***`;
    return `${safeLocal}@${domain}`;
  }
  return 'STUDENT';
}
