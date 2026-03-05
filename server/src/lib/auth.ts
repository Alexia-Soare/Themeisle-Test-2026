import { usersTable } from "../db/schema";
import db from "../db";
import { eq } from "drizzle-orm";

/**
 * Hash a password using Bun's built-in crypto
 */
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Create a simple session token (JWT-like, but simplified for MVP)
 * In production, use a proper JWT library
 */
export function createSessionToken(userId: number): string {
  const payload = {
    userId,
    iat: Math.floor(Date.now() / 1000),
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Parse and validate a session token
 */
export function parseSessionToken(
  token: string
): { userId: number; iat: number } | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const payload = JSON.parse(decoded);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Get user from token
 */
export async function getUserFromToken(
  token: string
): Promise<typeof usersTable.$inferSelect | null> {
  const payload = parseSessionToken(token);
  if (!payload) return null;

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, payload.userId),
  });
  return user || null;
}
