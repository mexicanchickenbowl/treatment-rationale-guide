// Cloudflare Worker: GitHub OAuth + live source editor for the Endo Guide.
//
// Endpoints:
//   GET  /api/auth/login?return=<url>   — redirect to GitHub OAuth
//   GET  /api/auth/callback?code&state  — exchange code, verify allowlist, issue JWT, bounce back
//   GET  /api/auth/me                   — verify a bearer JWT
//   POST /api/save-block                — verify JWT, commit an endo-guide.md edit via the GitHub API
//
// Required secrets (wrangler secret put):
//   GITHUB_CLIENT_ID      — OAuth App client ID
//   GITHUB_CLIENT_SECRET  — OAuth App client secret
//   GITHUB_TOKEN          — fine-grained PAT with Contents:write on the one repo
//   JWT_SECRET            — random string for signing session JWTs
//
// Required vars (wrangler.toml [vars]):
//   GITHUB_REPO       — "owner/name"
//   GITHUB_BRANCH     — "main"
//   SITE_ORIGIN       — "https://<you>.github.io"  (exact origin, no trailing slash)
//   ALLOWED_GH_USERS  — comma-separated GitHub logins allowed to edit

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- base64url helpers ----
function b64urlEncodeBytes(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecodeBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// Standard base64 (padded, +/) — what GitHub's Contents API expects
function b64EncodeBytes(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ---- JWT (HS256) ----
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const h = b64urlEncodeBytes(enc.encode(JSON.stringify(header)));
  const p = b64urlEncodeBytes(enc.encode(JSON.stringify(payload)));
  const data = `${h}.${p}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${b64urlEncodeBytes(sig)}`;
}

async function verifyJWT(token, secret) {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecodeBytes(s), enc.encode(`${h}.${p}`));
    if (!ok) return null;
    const payload = JSON.parse(dec.decode(b64urlDecodeBytes(p)));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ---- HTTP helpers ----
function corsHeaders(origin, env) {
  const allow = env.SITE_ORIGIN || "";
  const allowOrigin = origin && (origin === allow || !allow) ? origin : allow || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

// ---- markdown block helpers ----
function rebuildRaw(type, newText) {
  const t = (newText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (type === "p") return t.split("\n").map(s => s.trim()).filter(Boolean).join(" ");
  if (type === "h3") return "### " + t.split("\n", 1)[0].trim();
  if (type === "h4") return "#### " + t.split("\n", 1)[0].trim();
  return null;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

// ---- GitHub API wrapper ----
async function ghApi(env, path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "endo-guide-editor",
      ...(init.headers || {}),
    },
  });
  return res;
}

function allowedUsers(env) {
  return (env.ALLOWED_GH_USERS || "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

// ---- handlers ----
async function handleLogin(request, env) {
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return") || env.SITE_ORIGIN || "";
  const state = b64urlEncodeBytes(enc.encode(JSON.stringify({ r: returnTo, n: crypto.randomUUID() })));
  const redirectUri = `${url.origin}/api/auth/callback`;
  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "read:user");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("allow_signup", "false");
  return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  if (!code || !stateRaw) return new Response("Missing code/state", { status: 400 });
  let state;
  try {
    state = JSON.parse(dec.decode(b64urlDecodeBytes(stateRaw)));
  } catch {
    return new Response("Bad state", { status: 400 });
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/auth/callback`,
    }),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenJson.access_token) {
    return new Response(`OAuth failed: ${tokenJson.error || "no token"}`, { status: 401 });
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      "Authorization": `Bearer ${tokenJson.access_token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "endo-guide-editor",
    },
  });
  const user = await userRes.json().catch(() => ({}));
  if (!user.login) return new Response("User fetch failed", { status: 401 });

  const allowed = allowedUsers(env);
  if (!allowed.includes(user.login.toLowerCase())) {
    return new Response(
      `Signed in as ${user.login}, but that account is not in the allowlist for this guide.`,
      { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJWT(
    { sub: user.login, exp: now + 7 * 86400, iat: now },
    env.JWT_SECRET,
  );

  // Bounce back to the page the user came from, with token in the URL fragment
  // (fragments are not sent to servers, so this keeps the token out of logs).
  let returnUrl;
  try {
    returnUrl = new URL(state.r || env.SITE_ORIGIN);
  } catch {
    returnUrl = new URL(env.SITE_ORIGIN);
  }
  returnUrl.hash = `endo_token=${encodeURIComponent(jwt)}&endo_user=${encodeURIComponent(user.login)}`;
  return Response.redirect(returnUrl.toString(), 302);
}

async function handleMe(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return json({ ok: false });
  const payload = await verifyJWT(m[1], env.JWT_SECRET);
  if (!payload?.sub) return json({ ok: false });
  return json({ ok: true, user: payload.sub, exp: payload.exp });
}

async function handleSaveBlock(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return json({ ok: false, error: "no_token" }, 401);
  const payload = await verifyJWT(m[1], env.JWT_SECRET);
  if (!payload?.sub) return json({ ok: false, error: "invalid_token" }, 401);

  const allowed = allowedUsers(env);
  if (!allowed.includes(payload.sub.toLowerCase())) {
    return json({ ok: false, error: "not_allowed" }, 403);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "bad_json" }, 400); }

  const { type, oldRaw, newText } = body || {};
  if (!type || !oldRaw || !newText) return json({ ok: false, error: "missing_fields" }, 400);

  const newRaw = rebuildRaw(type, newText);
  if (newRaw === null) return json({ ok: false, error: "unsupported_type" }, 400);
  if (!newRaw.trim()) return json({ ok: false, error: "empty" }, 400);
  if (newRaw === oldRaw) return json({ ok: true, newRaw, user: payload.sub, noop: true });

  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const path = "endo-guide.md";

  const getRes = await ghApi(env, `/repos/${repo}/contents/${path}?ref=${branch}`);
  if (!getRes.ok) {
    const t = await getRes.text();
    return json({ ok: false, error: "fetch_failed", status: getRes.status, detail: t.slice(0, 300) }, 502);
  }
  const fileJson = await getRes.json();
  const bin = atob((fileJson.content || "").replace(/\n/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const content = dec.decode(bytes);

  const count = countOccurrences(content, oldRaw);
  if (count === 0) return json({ ok: false, error: "not_found" }, 404);
  if (count > 1) return json({ ok: false, error: "ambiguous" }, 409);

  const idx = content.indexOf(oldRaw);
  const updated = content.slice(0, idx) + newRaw + content.slice(idx + oldRaw.length);

  const padded = b64EncodeBytes(enc.encode(updated));

  const shortOld = oldRaw.length > 70 ? oldRaw.slice(0, 67) + "…" : oldRaw;
  const shortNew = newRaw.length > 70 ? newRaw.slice(0, 67) + "…" : newRaw;
  const putRes = await ghApi(env, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Edit ${path} via web editor (${payload.sub})\n\nType: ${type}\nFrom: ${shortOld}\nTo:   ${shortNew}`,
      content: padded,
      sha: fileJson.sha,
      branch,
      committer: { name: payload.sub, email: `${payload.sub}@users.noreply.github.com` },
      author: { name: payload.sub, email: `${payload.sub}@users.noreply.github.com` },
    }),
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    return json({ ok: false, error: "commit_failed", status: putRes.status, detail: t.slice(0, 400) }, 502);
  }
  const commitJson = await putRes.json().catch(() => ({}));
  return json({
    ok: true,
    newRaw,
    user: payload.sub,
    sha: commitJson?.commit?.sha || null,
  });
}

// ---- entry ----
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    let res;
    try {
      if (url.pathname === "/api/auth/login" && request.method === "GET") {
        res = await handleLogin(request, env);
      } else if (url.pathname === "/api/auth/callback" && request.method === "GET") {
        res = await handleCallback(request, env);
      } else if (url.pathname === "/api/auth/me" && request.method === "GET") {
        res = await handleMe(request, env);
      } else if (url.pathname === "/api/save-block" && request.method === "POST") {
        res = await handleSaveBlock(request, env);
      } else if (url.pathname === "/" || url.pathname === "") {
        res = new Response("endo-guide editor worker — see /api/auth/login", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      } else {
        res = json({ ok: false, error: "not_found" }, 404);
      }
    } catch (e) {
      res = json({ ok: false, error: "server_error", detail: String(e).slice(0, 400) }, 500);
    }

    // Attach CORS headers to API responses (not HTML/redirects)
    const ct = res.headers.get("Content-Type") || "";
    if (ct.startsWith("application/json")) {
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    }
    return res;
  },
};
