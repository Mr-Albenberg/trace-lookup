/**
 * Trace Lookup — data backend (Cloudflare Worker)
 * ------------------------------------------------
 * A thin, secret-holding proxy between the static Trace Lookup page and the
 * Endato / EnformionGO "Galaxy" people-search API. Your API credentials live
 * here as Worker secrets and never touch the browser.
 *
 * Endpoints this Worker exposes to the page:
 *   POST /person   { first, last, middle?, city?, state?, dob?, type? }  -> PersonSearch
 *   POST /phone    { phone }                                             -> Caller ID
 *   GET  /ping                                                           -> health check
 *
 * It returns the provider's JSON as-is (plus CORS). The page normalizes it.
 *
 * SETUP (see api/README.md for the full walk-through):
 *   1. npm i -g wrangler  &&  wrangler login
 *   2. wrangler secret put GALAXY_AP_NAME       (your Endato/Enformion AP name)
 *   3. wrangler secret put GALAXY_AP_PASSWORD   (your AP password)
 *   4. wrangler deploy
 *   5. Paste the deployed URL into the page's Settings (gear icon).
 *
 * Optional vars (wrangler.toml [vars] or dashboard):
 *   GALAXY_BASE   default https://devapi.enformion.com
 *                 legacy Endato accounts use https://devapi.endato.com
 *   ALLOW_ORIGIN  lock CORS to your page, e.g. https://you.github.io  (default *)
 *
 * NOTE: endpoint paths and the Caller ID search-type below follow the
 * documented Galaxy API. If your account's dashboard shows different paths,
 * adjust the two constants under "PROVIDER ENDPOINTS".
 */

/* ---- PROVIDER ENDPOINTS (adjust here if your account differs) ---- */
const PERSON_PATH = "/PersonSearch";
const PHONE_PATH  = "/Phone/CallerID";   // galaxy-search-type below
const PHONE_SEARCH_TYPE = "DevAPICallerID";

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || "*";
    const H = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: H });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/ping" || path === "/") {
      const configured = !!(env.GALAXY_AP_NAME && env.GALAXY_AP_PASSWORD);
      return json({ ok: true, service: "trace-lookup-api", configured }, 200, H);
    }

    if (!env.GALAXY_AP_NAME || !env.GALAXY_AP_PASSWORD) {
      return json({ error: "Worker is missing GALAXY_AP_NAME / GALAXY_AP_PASSWORD secrets. Run `wrangler secret put ...`." }, 500, H);
    }

    const base = (env.GALAXY_BASE || "https://devapi.enformion.com").replace(/\/+$/, "");
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
    const p = { ...Object.fromEntries(url.searchParams), ...body };

    try {
      if (path === "/person") {
        if (!p.last && !p.LastName) return json({ error: "Provide at least a last name." }, 400, H);
        const searchType = p.type === "Teaser" ? "Teaser" : "Person";
        const payload = {
          FirstName: p.first || p.FirstName || "",
          MiddleName: p.middle || p.MiddleName || "",
          LastName: p.last || p.LastName || "",
          Includes: ["Addresses", "PhoneNumbers", "EmailAddresses"],
          Page: 1,
          ResultsPerPage: Math.min(+p.limit || 5, 10),
        };
        if (p.city || p.state) payload.Addresses = [{ AddressLine2: [p.city, p.state].filter(Boolean).join(", ") }];
        if (p.dob) payload.Dob = p.dob;
        const r = await callGalaxy(base + PERSON_PATH, searchType, payload, env);
        return json(r.data, r.status, H);
      }

      if (path === "/phone") {
        const phone = p.phone || p.Phone;
        if (!phone) return json({ error: "Provide a phone number." }, 400, H);
        const r = await callGalaxy(base + PHONE_PATH, PHONE_SEARCH_TYPE, { Phone: phone }, env);
        return json(r.data, r.status, H);
      }

      return json({ error: "Unknown path. Use POST /person or POST /phone." }, 404, H);
    } catch (e) {
      return json({ error: "Upstream request failed", detail: String(e) }, 502, H);
    }
  },
};

async function callGalaxy(endpoint, searchType, payload, env) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "galaxy-ap-name": env.GALAXY_AP_NAME,
      "galaxy-ap-password": env.GALAXY_AP_PASSWORD,
      "galaxy-search-type": searchType,
    },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({ error: "Provider returned a non-JSON response", status: r.status }));
  return { status: r.status, data };
}

function json(obj, status, H) {
  return new Response(JSON.stringify(obj), { status, headers: { ...H, "Content-Type": "application/json" } });
}
