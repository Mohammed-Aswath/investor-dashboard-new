import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDashboardPassword, getSessionSecret } from "./env";

export const SESSION_COOKIE = "aqademiq_investor_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function secretKey(): Uint8Array {
  const secret = getSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET is not set in investor-analytics/.env");
  }
  return new TextEncoder().encode(secret);
}

export function verifyPassword(password: string): boolean {
  const expected = getDashboardPassword();
  if (!expected) return false;
  return password === expected;
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: "investor" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export { SESSION_TTL_SECONDS };
