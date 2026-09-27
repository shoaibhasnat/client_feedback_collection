import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";

/** URL-safe random token. 24 bytes = 192 bits, above the 128-bit minimum in the brief. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Salted hash so raw IPs are never stored. */
export async function ipHash(): Promise<string> {
  return sha256(`${serverEnv().ipHashSalt}:${await clientIp()}`).slice(0, 32);
}
