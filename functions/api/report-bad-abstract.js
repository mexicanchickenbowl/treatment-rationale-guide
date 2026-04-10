// Cloudflare Pages Function: POST /api/report-bad-abstract
//
// Receives a user report that the currently displayed abstract is the wrong
// paper for a given citation. Appends one entry to suggestions.json with
// type "abstract_mismatch" and commits via the GitHub Contents API, using the
// same auth path as save-block.js (Cloudflare Access in front of /api/*).
//
// Body (JSON):
//   { author, year, pmid, title, finding, section_id }
//
// Required Pages environment variables (same as save-block.js):
//   GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, ALLOWED_EMAILS (optional)

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

  const allowed = (env.ALLOWED_EMAILS || "")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(userEmail.toLowerCase())) {
    return json({ ok: false, error: "not_allowed", user: userEmail }, 403);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "bad_json" }, 400); }

  const { author = "", year = "", pmid = null, title = "", finding = "", section_id = "" } = body || {};
  if (!author) return json({ ok: false, error: "missing_author" }, 400);

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || "main";
  const path = "suggestions.json";

  // Fetch current suggestions.json (may not exist — in that case, create it).
  const getRes = await ghApi(env, `/repos/${repo}/contents/${path}?ref=${branch}`);
  let existingSha = null;
  let suggestions = [];
  if (getRes.ok) {
    const fileJson = await getRes.json();
    existingSha = fileJson.sha || null;
    try {
      const bin = atob((fileJson.content || "").replace(/\n/g, ""));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = dec.decode(bytes);
      suggestions = JSON.parse(text);
      if (!Array.isArray(suggestions)) suggestions = [];
    } catch {
      suggestions = [];
    }
  } else if (getRes.status !== 404) {
    const t = await getRes.text();
    return json({ ok: false, error: "fetch_failed", status: getRes.status, detail: t.slice(0, 300) }, 502);
  }

  const now = new Date().toISOString();
  const id = `user-report-${now.replace(/[^\d]/g, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
  const summary = `User reported wrong abstract for ${author}${year ? " (" + year + ")" : ""}`;
  suggestions.push({
    id,
    created_at: now,
    type: "abstract_mismatch",
    status: "pending",
    source: "user_report",
    reported_by: userEmail,
    summary,
    details: {
      author,
      year,
      current_pmid: pmid,
      current_title: title,
      finding,
      section_id,
    },
  });

  const body64 = b64EncodeBytes(enc.encode(JSON.stringify(suggestions, null, 2) + "\n"));
  const committerName = userEmail.split("@")[0] || "reporter";
  const putBody = {
    message: `Report wrong abstract: ${author}${year ? " (" + year + ")" : ""} (${userEmail})`,
    content: body64,
    branch,
    committer: { name: committerName, email: userEmail },
    author: { name: committerName, email: userEmail },
  };
  if (existingSha) putBody.sha = existingSha;

  const putRes = await ghApi(env, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(putBody),
  });
  if (!putRes.ok) {
    const t = await putRes.text();
    return json({ ok: false, error: "commit_failed", status: putRes.status, detail: t.slice(0, 400) }, 502);
  }
  const commitJson = await putRes.json().catch(() => ({}));
  return json({
    ok: true,
    id,
    user: userEmail,
    sha: commitJson?.commit?.sha || null,
  });
}

export async function onRequestOptions() {
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
