/**
 * RPG Map Editor server: Sign in with Freebuff, plus per-account map saves in
 * the site's D1 database. Everything else is the static Vite build.
 */
import { createFreebuffAuth, isSameOriginRequest } from "@freebuff/auth";

const MAX_MAP_BYTES = 1_500_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

let cachedAuth = null;
function getAuth(env) {
  if (!cachedAuth) {
    cachedAuth = createFreebuffAuth({
      clientId: env.FREEBUFF_CLIENT_ID,
      issuer: env.FREEBUFF_ISSUER,
      baseUrl: env.APP_ORIGIN,
    });
  }
  return cachedAuth;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS maps (
       user_id TEXT NOT NULL,
       id TEXT NOT NULL,
       name TEXT NOT NULL,
       cols INTEGER NOT NULL,
       rows INTEGER NOT NULL,
       data TEXT NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       PRIMARY KEY (user_id, id)
     )`
  ).run();
  schemaReady = true;
}

async function handleApi(request, env, auth) {
  const user = await auth.getUser(request);
  if (!user) return json({ error: "Sign in required" }, 401);

  await ensureSchema(env);
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/maps(?:\/([^/]+))?$/);
  if (!match) return json({ error: "Not found" }, 404);

  const id = match[1] ? decodeURIComponent(match[1]) : null;
  if (id && !ID_PATTERN.test(id)) return json({ error: "Bad map id" }, 400);

  if (request.method === "GET") {
    if (!id) {
      const { results } = await env.DB.prepare(
        "SELECT id, name, cols, rows, updated_at FROM maps WHERE user_id = ? ORDER BY updated_at DESC"
      )
        .bind(user.sub)
        .all();
      return json({ maps: results ?? [] });
    }
    const row = await env.DB.prepare(
      "SELECT id, name, cols, rows, data, updated_at FROM maps WHERE user_id = ? AND id = ?"
    )
      .bind(user.sub, id)
      .first();
    if (!row) return json({ error: "Map not found" }, 404);
    return json({ map: row });
  }

  // Every write must come from the site's own pages.
  if (!isSameOriginRequest(request, env.APP_ORIGIN)) {
    return json({ error: "Forbidden" }, 403);
  }

  if (request.method === "PUT" && id) {
    const text = await request.text();
    if (text.length > MAX_MAP_BYTES) {
      return json({ error: "That map is too large to save." }, 413);
    }
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid map payload" }, 400);
    }
    if (
      !body ||
      typeof body.name !== "string" ||
      typeof body.cols !== "number" ||
      typeof body.rows !== "number" ||
      !body.data ||
      typeof body.data !== "object"
    ) {
      return json({ error: "Invalid map payload" }, 400);
    }
    const name = body.name.trim().slice(0, 120) || "Untitled map";
    const cols = Math.min(500, Math.max(1, Math.round(body.cols)));
    const rows = Math.min(500, Math.max(1, Math.round(body.rows)));
    const data = JSON.stringify(body.data);
    if (data.length > MAX_MAP_BYTES) {
      return json({ error: "That map is too large to save." }, 413);
    }
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO maps (user_id, id, name, cols, rows, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         name = excluded.name,
         cols = excluded.cols,
         rows = excluded.rows,
         data = excluded.data,
         updated_at = excluded.updated_at`
    )
      .bind(user.sub, id, name, cols, rows, data, now, now)
      .run();
    return json({ ok: true, id, updatedAt: now });
  }

  if (request.method === "DELETE" && id) {
    await env.DB.prepare("DELETE FROM maps WHERE user_id = ? AND id = ?")
      .bind(user.sub, id)
      .run();
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const auth = getAuth(env);
    return auth.wrap(async (req) => {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) {
        return handleApi(req, env, auth);
      }
      return env.ASSETS.fetch(req);
    })(request, env, ctx);
  },
};
