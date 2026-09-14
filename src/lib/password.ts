// Хешування паролів кур'єрів для входу в особистий кабінет.
// Використовує вбудований у Node scrypt (без зайвих npm-залежностей на кшталт bcrypt).
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// Токен для скидання паролю — зберігаємо тільки хеш (SHA-256, без солі
// потрібен лише для короткочасного одноразового токена), а сам токен іде в
// лист і ніколи не потрапляє в базу в чистому вигляді.
import { createHash } from "crypto";

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
