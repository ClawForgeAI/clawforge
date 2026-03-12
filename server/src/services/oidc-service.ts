/**
 * OIDC token validation service.
 *
 * Discovers IdP configuration via .well-known/openid-configuration,
 * fetches JWKS, verifies id_tokens, and exchanges authorization codes.
 */

import * as jose from "jose";

export type OidcConfig = {
  issuerUrl: string;
  clientId: string;
  audience?: string;
};

export type OidcTokenClaims = {
  sub: string;
  email?: string;
  name?: string;
  preferred_username?: string;
  iss: string;
  aud: string | string[];
};

type OpenIdConfiguration = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
};

// Cache discovery documents and JWKS per issuer.
const discoveryCache = new Map<string, { config: OpenIdConfiguration; fetchedAt: number }>();
const jwksCache = new Map<
  string,
  { jwks: jose.JSONWebKeySet; keySet: ReturnType<typeof jose.createLocalJWKSet>; fetchedAt: number }
>();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Discover OpenID configuration from the issuer's .well-known endpoint.
 */
async function discoverOidcConfig(issuerUrl: string): Promise<OpenIdConfiguration> {
  const cached = discoveryCache.get(issuerUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const wellKnownUrl = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const response = await fetch(wellKnownUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery document from ${wellKnownUrl} (${response.status})`);
  }

  const config = (await response.json()) as OpenIdConfiguration;
  discoveryCache.set(issuerUrl, { config, fetchedAt: Date.now() });
  return config;
}

/**
 * Fetch and cache the JWKS from the IdP.
 */
async function getJwks(jwksUri: string): Promise<ReturnType<typeof jose.createLocalJWKSet>> {
  const cached = jwksCache.get(jwksUri);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.keySet;
  }

  const response = await fetch(jwksUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUri} (${response.status})`);
  }

  const jwks = (await response.json()) as jose.JSONWebKeySet;
  const keySet = jose.createLocalJWKSet(jwks);
  jwksCache.set(jwksUri, { jwks, keySet, fetchedAt: Date.now() });
  return keySet;
}

/**
 * Verify an id_token JWT against the IdP's JWKS.
 * Returns the decoded claims if valid, throws otherwise.
 */
export async function verifyIdToken(idToken: string, config: OidcConfig): Promise<OidcTokenClaims> {
  const discovery = await discoverOidcConfig(config.issuerUrl);
  const jwks = await getJwks(discovery.jwks_uri);

  const { payload } = await jose.jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: config.audience ?? config.clientId,
  });

  return {
    sub: payload.sub ?? "",
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
    preferred_username: payload.preferred_username as string | undefined,
    iss: payload.iss ?? "",
    aud: payload.aud ?? "",
  };
}

/**
 * Exchange an authorization code for tokens at the IdP's token endpoint.
 * Returns the raw token response including id_token.
 */
export async function exchangeCodeAtIdp(params: {
  issuerUrl: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{
  id_token: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const discovery = await discoverOidcConfig(params.issuerUrl);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: params.clientId,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });

  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IdP token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as {
    id_token: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}
