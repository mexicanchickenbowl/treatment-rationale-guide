const KV_KEY = "streak-v1";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestGet({ request, env }) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!email) return new Response(JSON.stringify({ ok: false }), { status: 401 });
  const raw = await env.STREAK_DATA.get(KV_KEY);
  const data = raw ? JSON.parse(raw) : { completions: {} };
  return new Response(JSON.stringify({ ok: true, data }), {
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function onRequestPost({ request, env }) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (!email) return new Response(JSON.stringify({ ok: false }), { status: 401 });
  const body = await request.json();
  await env.STREAK_DATA.put(KV_KEY, JSON.stringify(body));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}
