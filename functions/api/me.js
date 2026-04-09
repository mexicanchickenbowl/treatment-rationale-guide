// Cloudflare Pages Function: GET /api/me
//
// Returns the authenticated user's email (via the Cloudflare Access
// header). The client polls this to determine whether edit mode can be
// entered without a login redirect. Protected by the same Access policy
// that covers /api/*.

export async function onRequestGet({ request }) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email") || "";
  if (!email) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return new Response(JSON.stringify({ ok: true, email }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
