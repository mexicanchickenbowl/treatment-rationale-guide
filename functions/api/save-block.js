// Cloudflare Pages Function: POST /api/save-block
//
// Protected by Cloudflare Access (policy covering /api/*). Access only forwards
// requests to this function after successful authentication and injects the
// authenticated user's email as Cf-Access-Authenticated-User-Email. We trust
// that header because Access sits in front of this function at the edge.
//
// Required Pages environment variables (set in the Cloudflare dashboard):
//   GITHUB_TOKEN     — fine-grained PAT with Contents:write on the one repo
//   GITHUB_REPO      — "owner/repo"
//   GITHUB_BRANCH    — defaults to "main"
//   ALLOWED_EMAILS   — comma-separated; optional belt-and-suspenders allowlist

const enc = new TextEncoder();
const dec = new TextDecoder();

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

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

function b64EncodeBytes(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function ghApi(env, path, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "endo-guide-editor",
      ...(init.headers || {}),
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const userEmail = request.headers.get("Cf-Access-Authenticated-User-Email") || "";
  if (!userEmail) return json({ ok: false, error: "no_identity" }, 401);

  // Belt-and-suspenders allowlist. The primary gate is the Access policy
  // configured in the Cloudflare dashboard; this is a second check in case
  // the policy is accidentally loosened.
  const allowed = (env.ALLOWED_EMAILS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(userEmail.toLowerCase())) {
    return json({ ok: false, error: "not_allowed", user: userEmail }, 403);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "bad_json" }, 400); }

  const { type, oldRaw, newText } = body || {};
  if (!type || !oldRaw || !newText) return json({ ok: false, error: "missing_fields" }, 400);

  const newRaw = rebuildRaw(type, newText);
  if (newRaw === null) return json({ ok: false, error: "unsupported_type" }, 400);
  if (!newRaw.trim()) return json({ ok: false, error: "empty" }, 400);
  if (newRaw === oldRaw) return json({ ok: true, newRaw, user: userEmail, noop: true });

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }
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
  const committerName = userEmail.split("@")[0] || "editor";
  const putRes = await ghApi(env, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Edit ${path} via web editor (${userEmail})\n\nType: ${type}\nFrom: ${shortOld}\nTo:   ${shortNew}`,
      content: padded,
      sha: fileJson.sha,
      branch,
      committer: { name: committerName, email: userEmail },
      author: { name: committerName, email: userEmail },
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
    user: userEmail,
    sha: commitJson?.commit?.sha || null,
  });
}

export async function onRequestOptions() {
  // Same-origin request — preflight not strictly needed, but some fetch
  // configurations still emit one. Reply quickly.
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
