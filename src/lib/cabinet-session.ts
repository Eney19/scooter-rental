// Легка підписана сесія для особистого кабінету кур'єра (без окремої таблиці
// сесій). Кука містить courierId + строк придатності + HMAC-підпис, тож її
// неможливо підробити, не знаючи CABINET_SESSION_SECRET.
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "pd_cabinet";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 днів

function getSecret(): string {
  const secret = process.env.CABINET_SESSION_SECRET;
  if (!secret) throw new Error("CABINET_SESSION_SECRET is not set");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createSessionToken(courierId: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${courierId}.${expires}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [courierId, expiresStr, signature] = parts;
  const payload = `${courierId}.${expiresStr}`;
  const expected = sign(payload);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;

  return courierId;
}

export const CABINET_COOKIE_NAME = COOKIE_NAME;
export const CABINET_COOKIE_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

// Для читання сесії в Route Handlers (app router).
export async function getCourierIdFromCookies(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return verifySessionToken(token);
}
