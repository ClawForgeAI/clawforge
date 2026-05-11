import { TextEncoder } from "node:util";
import { jwtVerify, SignJWT } from "jose";
import type { HumanIdentity, HumanRole } from "./identities.js";

/**
 * Framework-free JWT helpers built on `jose`. The server today goes through
 * `@fastify/jwt` (via `app.jwt.verify`); these helpers expose the same
 * sign/verify operations without the Fastify dependency so plugin code,
 * worker code, and tests can call them directly.
 *
 * Token claim shape mirrors what the server signs today: `{ userId, orgId,
 * email, role }`. We expose the strict claim type for typed callers and a
 * looser `unknown` form so adapters can refresh sessions without enforcing
 * the shape themselves.
 */

export type ClawForgeJwtClaims = {
  userId: string;
  orgId: string;
  email: string;
  role: HumanRole;
  /** Standard JWT claims that jose may add. */
  iat?: number;
  exp?: number;
};

const DEFAULT_ALG = "HS256";

function toKey(secret: string | Uint8Array): Uint8Array {
  return typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
}

export type SignJwtOptions = {
  /** Seconds until expiry. Defaults to 8 hours, matching the server today. */
  expiresInSec?: number;
  /** Algorithm. HS256 by default — same as `@fastify/jwt` defaults. */
  algorithm?: "HS256" | "HS384" | "HS512";
  /** Optional issuer / audience to embed. */
  issuer?: string;
  audience?: string;
};

/**
 * Sign a ClawForge JWT. Designed for HS256 (shared secret) which is the
 * server's current configuration; asymmetric algorithms are out of scope
 * for this helper.
 */
export async function signClawForgeJwt(
  claims: Omit<ClawForgeJwtClaims, "iat" | "exp">,
  secret: string | Uint8Array,
  options: SignJwtOptions = {},
): Promise<string> {
  const expiresInSec = options.expiresInSec ?? 8 * 60 * 60;
  const builder = new SignJWT({ ...claims })
    .setProtectedHeader({ alg: options.algorithm ?? DEFAULT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSec}s`);
  if (options.issuer) builder.setIssuer(options.issuer);
  if (options.audience) builder.setAudience(options.audience);
  return builder.sign(toKey(secret));
}

export type VerifyJwtOptions = {
  issuer?: string;
  audience?: string;
};

/**
 * Verify a ClawForge JWT. Returns the typed claims; throws (via jose) on
 * invalid signature, expiry, or malformed payload.
 */
export async function verifyClawForgeJwt(
  token: string,
  secret: string | Uint8Array,
  options: VerifyJwtOptions = {},
): Promise<ClawForgeJwtClaims> {
  const { payload } = await jwtVerify(token, toKey(secret), {
    issuer: options.issuer,
    audience: options.audience,
  });
  return payload as unknown as ClawForgeJwtClaims;
}

/**
 * Project a verified JWT payload into a `HumanIdentity`. Useful for the
 * server middleware refactor in PR #9.
 */
export function jwtClaimsToHumanIdentity(claims: ClawForgeJwtClaims): HumanIdentity {
  return {
    kind: "human",
    userId: claims.userId,
    orgId: claims.orgId,
    email: claims.email,
    role: claims.role,
  };
}
