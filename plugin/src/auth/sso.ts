/**
 * OIDC SSO login for ClawForge.
 * Uses Authorization Code flow with PKCE via the control plane's token exchange endpoint.
 */

import crypto from "node:crypto";
import http from "node:http";
import type { ClawForgePluginConfig, SessionTokens } from "../types.js";
import { saveSession } from "./token-store.js";

const CALLBACK_PORT = 19832;
const CALLBACK_PATH = "/clawforge/callback";

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function generateCodeVerifier(): string {
  return base64url(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier: string): string {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

function generateState(): string {
  return base64url(crypto.randomBytes(16));
}

/**
 * Build the OIDC authorization URL.
 */
export function buildAuthorizationUrl(params: {
  issuerUrl: string;
  clientId: string;
  codeChallenge: string;
  state: string;
  redirectUri: string;
}): string {
  const url = new URL("/authorize", params.issuerUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  return url.toString();
}

/**
 * Exchange the authorization code for tokens via the control plane.
 */
async function exchangeCodeForSession(params: {
  controlPlaneUrl: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<SessionTokens> {
  const response = await fetch(`${params.controlPlaneUrl}/api/v1/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "authorization_code",
      code: params.code,
      codeVerifier: params.codeVerifier,
      redirectUri: params.redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return (await response.json()) as SessionTokens;
}

/**
 * Start a temporary local server to receive the OIDC callback,
 * then exchange the code for a ClawForge session token.
 */
export async function performSsoLogin(config: ClawForgePluginConfig): Promise<SessionTokens> {
  const issuerUrl = config.sso?.issuerUrl;
  const clientId = config.sso?.clientId;
  const controlPlaneUrl = config.controlPlaneUrl;

  if (!issuerUrl || !clientId || !controlPlaneUrl) {
    throw new Error("ClawForge SSO requires controlPlaneUrl, sso.issuerUrl, and sso.clientId in plugin config");
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const redirectUri = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;

  const authUrl = buildAuthorizationUrl({
    issuerUrl,
    clientId,
    codeChallenge,
    state,
    redirectUri,
  });

  return new Promise<SessionTokens>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith(CALLBACK_PATH)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Login failed</h2><p>You can close this window.</p></body></html>");
        server.close();
        reject(new Error(`OIDC error: ${error}`));
        return;
      }

      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Invalid callback</h2></body></html>");
        server.close();
        reject(new Error("Invalid OIDC callback: missing code or state mismatch"));
        return;
      }

      try {
        const tokens = await exchangeCodeForSession({
          controlPlaneUrl,
          code,
          codeVerifier,
          redirectUri,
        });

        saveSession(tokens);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h2>Login successful!</h2><p>You can close this window and return to OpenClaw.</p></body></html>",
        );
        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end("<html><body><h2>Token exchange failed</h2></body></html>");
        server.close();
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      // In a real implementation, we would open the browser to `authUrl`.
      // The caller (plugin register) should handle opening the URL.
      (server as http.Server & { authUrl?: string }).authUrl = authUrl;
    });

    // Timeout after 5 minutes.
    setTimeout(
      () => {
        server.close();
        reject(new Error("SSO login timed out after 5 minutes"));
      },
      5 * 60 * 1000,
    );
  });
}
