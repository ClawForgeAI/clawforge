/**
 * API key parsing for ClawForge service accounts (#44).
 *
 * Format (unchanged from `server/src/routes/api-keys.ts`):
 *
 *   cf_live_<base64url(32 bytes)>   # production keys
 *   cf_test_<base64url(32 bytes)>   # non-production / staging keys
 *
 * Lookup in the DB is by the first 16 characters (the `keyPrefix` column).
 * Verification uses bcrypt against `keyHash`.
 *
 * These helpers are pure: they let server middleware (and any future
 * worker/CLI) classify and parse the token without pulling in Fastify.
 */

export const API_KEY_LIVE_PREFIX = "cf_live_";
export const API_KEY_TEST_PREFIX = "cf_test_";
export const API_KEY_LOOKUP_PREFIX_LENGTH = 16;

export type ApiKeyEnvironment = "live" | "test";

export type ParsedApiKey = {
  /** Original token, unchanged. Never log this. */
  token: string;
  /** "live" for cf_live_*, "test" for cf_test_*. */
  environment: ApiKeyEnvironment;
  /** First 16 chars — used as a DB lookup index. */
  lookupPrefix: string;
};

/**
 * Detect whether a bearer token is an API key. Cheap string check; safe to
 * run on every request.
 */
export function isApiKey(token: string): boolean {
  return token.startsWith(API_KEY_LIVE_PREFIX) || token.startsWith(API_KEY_TEST_PREFIX);
}

/**
 * Parse a bearer token as an API key. Returns `null` if the token is not an
 * API key (caller should fall through to JWT verification).
 *
 * Does not contact a DB and does not verify the bcrypt hash — verification
 * is the caller's responsibility (the existing server middleware uses
 * `bcrypt.compare(token, key.keyHash)`).
 */
export function parseApiKey(token: string): ParsedApiKey | null {
  if (!isApiKey(token)) return null;
  const environment: ApiKeyEnvironment = token.startsWith(API_KEY_LIVE_PREFIX) ? "live" : "test";
  const lookupPrefix = token.slice(0, API_KEY_LOOKUP_PREFIX_LENGTH);
  return { token, environment, lookupPrefix };
}
