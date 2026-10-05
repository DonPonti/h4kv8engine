const crypto = require('crypto');

const OWNER = 'DonPonti';
const REPO = 'h4kv8engine';
const BRANCH = 'main';
const API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;

// Only these exact paths can be read or written. Anything else is rejected,
// including "..", encoded separators, subfolders and unexpected extensions.
const DATA_PATH = 'src/_data/hfk.json';
const BLOG_RE = /^src\/blog\/[a-z0-9][a-z0-9-]{0,120}\.md$/;
const IMG_RE = /^src\/_img\/looks\/[a-z0-9][a-z0-9-]{0,120}\.(jpe?g|png|webp|gif)$/;
const allowed = (p) => p === DATA_PATH || BLOG_RE.test(p) || IMG_RE.test(p);

const SHA_RE = /^[0-9a-f]{40}$/;
const BASE64_RE = /^[A-Za-z0-9+/\r\n]*={0,2}$/;
// Netlify synchronous functions accept ~6 MB request bodies; stay safely below.
const MAX_CONTENT_CHARS = 5 * 1024 * 1024;

const json = (status, body, extra = {}) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra },
  body: JSON.stringify(body),
});

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---- auth -----------------------------------------------------------------

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const passwordMatches = (given, expected) =>
  crypto.timingSafeEqual(digest(given), digest(expected));

// Best-effort brute-force throttle. Serverless instances are short-lived, so this
// slows down guessing but is not a hard guarantee. Use a long random password.
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();
const clientId = (event) => {
  const h = event.headers || {};
  return h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
};
function throttled(id) {
  const now = Date.now();
  const rec = failures.get(id);
  if (!rec || now - rec.first > FAIL_WINDOW_MS) { failures.delete(id); return false; }
  return rec.count >= FAIL_LIMIT;
}
function recordFailure(id) {
  const now = Date.now();
  const rec = failures.get(id);
  if (!rec || now - rec.first > FAIL_WINDOW_MS) failures.set(id, { first: now, count: 1 });
  else rec.count += 1;
  if (failures.size > 500) for (const [k, v] of failures) if (now - v.first > FAIL_WINDOW_MS) failures.delete(k);
}

// ---- GitHub ---------------------------------------------------------------

async function gh(path, options = {}) {
  const r = await fetch(API + path, {
    ...options,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + process.env.HFK_GITHUB_TOKEN,
      'x-github-api-version': '2026-03-10',
      ...(options.headers || {}),
    },
  });
  const t = await r.text();
  let d = {};
  try { d = t ? JSON.parse(t) : {}; } catch { /* non-JSON body */ }
  if (!r.ok) {
    const status = [404, 409, 422].includes(r.status) ? r.status : 502;
    throw new HttpError(status, d.message || 'GitHub request failed');
  }
  return d;
}

const contentsUrl = (p) => '/contents/' + p.split('/').map(encodeURIComponent).join('/');
const cleanMessage = (m, fallback) => String(m || fallback).replace(/\s+/g, ' ').trim().slice(0, 200) || fallback;

function requirePath(p) {
  p = String(p || '');
  if (!allowed(p)) throw new HttpError(400, 'Path not allowed');
  return p;
}
function requireSha(sha, required) {
  if (sha === undefined || sha === null || sha === '') {
    if (required) throw new HttpError(400, 'Missing file sha');
    return undefined;
  }
  if (!SHA_RE.test(String(sha))) throw new HttpError(400, 'Invalid sha');
  return String(sha);
}

// ---- handler --------------------------------------------------------------

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' }, { allow: 'GET, POST' });
  }

  const id = clientId(event);
  if (throttled(id)) return json(429, { error: 'Too many failed attempts. Try again in 15 minutes.' });

  const expected = process.env.HFK_ADMIN_PASSWORD;
  if (!expected) return json(500, { error: 'HFK_ADMIN_PASSWORD is not configured' });
  const given = String((event.headers && (event.headers.authorization || event.headers.Authorization)) || '').replace(/^Bearer\s+/i, '');
  if (!given || !passwordMatches(given, expected)) {
    recordFailure(id);
    return json(401, { error: 'Unauthorized' });
  }
  if (!process.env.HFK_GITHUB_TOKEN) return json(500, { error: 'HFK_GITHUB_TOKEN is not configured' });

  try {
    const q = event.queryStringParameters || {};

    if (event.httpMethod === 'GET') {
      if (q.op === 'state') {
        const r = await gh('/contents/' + DATA_PATH + '?ref=' + BRANCH);
        return json(200, { sha: r.sha, content: r.content });
      }
      if (q.op === 'posts') {
        const r = await gh('/contents/src/blog?ref=' + BRANCH);
        return json(200, Array.isArray(r) ? r.filter((x) => x.type === 'file' && BLOG_RE.test(x.path)) : []);
      }
      if (q.op === 'file') {
        // Netlify has already URL-decoded query values; decoding again would allow %252e tricks.
        const p = requirePath(q.path);
        return json(200, await gh(contentsUrl(p) + '?ref=' + BRANCH));
      }
      return json(400, { error: 'Unknown request' });
    }

    let x;
    try { x = JSON.parse(event.body || '{}'); } catch { throw new HttpError(400, 'Invalid JSON body'); }
    if (!x || typeof x !== 'object') throw new HttpError(400, 'Invalid request body');

    if (x.op === 'save') {
      const p = requirePath(x.path);
      const content = String(x.content || '');
      if (!content) throw new HttpError(400, 'Empty content');
      if (content.length > MAX_CONTENT_CHARS) throw new HttpError(413, 'File is too large (limit about 3.5 MB)');
      if (!BASE64_RE.test(content)) throw new HttpError(400, 'Content must be base64');
      const body = { message: cleanMessage(x.message, 'HFK Studio update'), content, branch: BRANCH };
      const sha = requireSha(x.sha, false);
      if (sha) body.sha = sha;
      const r = await gh(contentsUrl(p), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return json(200, { sha: r.content && r.content.sha, commit: r.commit && r.commit.sha, path: p });
    }

    if (x.op === 'delete') {
      const p = requirePath(x.path);
      if (p === DATA_PATH) throw new HttpError(400, 'The main data file cannot be deleted');
      const sha = requireSha(x.sha, true);
      const r = await gh(contentsUrl(p), {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: cleanMessage(x.message, 'Delete from HFK Studio'), sha, branch: BRANCH }),
      });
      return json(200, { commit: r.commit && r.commit.sha });
    }

    return json(400, { error: 'Unknown operation' });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error('HFK function error:', e);
    return json(500, { error: 'HFK server error' });
  }
};

exports._internals = { allowed };
