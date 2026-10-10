// POST /api/publish — called by the admin "배포 저장" button.
//
// Body: { secret: string, items: Array<WorkItem> }
//   WorkItem: { uid, title, artist, year, medium, cat, desc, fit, video,
//               builtin?: true,      // built-in work: image is kept from index.master.html
//               url?: string,        // user-entered image URL (https)
//               dataUrl?: string }   // uploaded image (data:image/...)
//
// What it does:
//   1. Checks PUBLISH_SECRET (constant-time compare).
//   2. Reads index.master.html and tools/headblock.txt from GitHub main.
//   3. Rewrites the DEFAULT_ART block with the submitted works.
//   4. Builds the visitor page (same steps as tools/build_deploy.py).
//   5. Commits index.master.html + index.html to main in ONE commit.
//      Vercel deploys main automatically.
//
// Env: PUBLISH_SECRET (shared secret), GITHUB_TOKEN (contents:write on this repo only).

const crypto = require('crypto');

const OWNER = 'cmdSteady';
const REPO = 'dialogue';
const BRANCH = 'main';
const MASTER = 'index.master.html';
const OUT = 'index.html';
const HEADBLOCK = 'tools/headblock.txt';
const API = 'https://api.github.com';
const MAX_WORKS = 30; // matches MAX_ITEMS in the admin UI
const FITS = ['contain', 'cover'];
const UID_RE = /^[A-Za-z0-9_-]{1,80}$/;

function checkSecret(given) {
  const expected = process.env.PUBLISH_SECRET || '';
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function gh(path, opts = {}) {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'dialogue-publish',
    ...(opts.headers || {}),
  };
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { ...opts, headers });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`GitHub ${r.status} on ${path}: ${text.slice(0, 200)}`);
  }
  return r;
}

async function getRaw(path) {
  const r = await gh(`/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: { Accept: 'application/vnd.github.raw' },
  });
  return r.text();
}

// uid -> EMBED_* constant name, read from the master so built-in images are reused by name.
function builtinEmbedTokens(master) {
  const map = {};
  const re = /\{ embed:(EMBED_\w+),\s*uid:'([^']+)'/g;
  let m;
  while ((m = re.exec(master))) map[m[2]] = m[1];
  return map;
}

const jsStr = (s) => JSON.stringify(String(s ?? ''));

function validateItem(it, i) {
  if (!it || typeof it !== 'object') throw new Error(`item ${i}: not an object`);
  if (typeof it.uid !== 'string' || !UID_RE.test(it.uid)) throw new Error(`item ${i}: bad uid`);
  for (const k of ['title', 'artist', 'year', 'medium', 'cat', 'desc', 'video']) {
    if (it[k] != null && (typeof it[k] !== 'string' || it[k].length > 4000)) {
      throw new Error(`item ${i}: bad ${k}`);
    }
  }
  if (!FITS.includes(it.fit || 'cover')) throw new Error(`item ${i}: bad fit`);
}

function artLine(it, tokens) {
  let embed;
  if (it.builtin) {
    embed = tokens[it.uid];
    if (!embed) throw new Error(`unknown built-in work: ${it.uid}`);
  } else if (typeof it.dataUrl === 'string') {
    if (!/^data:image\//.test(it.dataUrl)) throw new Error(`item ${it.uid}: bad image data`);
    embed = jsStr(it.dataUrl);
  } else if (typeof it.url === 'string') {
    if (!/^https:\/\//.test(it.url)) throw new Error(`item ${it.uid}: image URL must be https`);
    embed = jsStr(it.url);
  } else {
    throw new Error(`item ${it.uid}: no image`);
  }
  return (
    `  { embed:${embed}, uid:${jsStr(it.uid)}, title:${jsStr(it.title)}, artist:${jsStr(it.artist)}, ` +
    `year:${jsStr(it.year)}, medium:${jsStr(it.medium)}, cat:${jsStr(it.cat)}, fit:${jsStr(it.fit || 'cover')}, ` +
    `desc:${jsStr(it.desc)}, video:${jsStr(it.video)} }`
  );
}

function replaceArt(master, lines) {
  const re = /const DEFAULT_ART = \[\n[\s\S]*?\n\];\n/;
  if (!re.test(master)) throw new Error('DEFAULT_ART block not found in master');
  return master.replace(re, () => `const DEFAULT_ART = [\n${lines.join(',\n')}\n];\n`);
}

// Port of tools/build_deploy.py. Keep the two in sync.
function buildVisitor(master, headblock) {
  let s = master;
  const rep = (a, b) => {
    if (!s.includes(a)) throw new Error('build pattern not found: ' + a.slice(0, 70));
    s = s.replace(a, () => b);
  };
  const TITLE = '<title>천년의 대화 — Dialogue of a Thousand Years</title>\n';
  rep(TITLE, TITLE + headblock + '\n\n');
  rep('#about .ab-end{position:relative;padding-bottom:70vh}', '#about .ab-end{position:relative;padding-bottom:75vh}');
  rep('</style>', '#drawer,#pinWrap,#scrim,#adminBadge,#dEdit{display:none!important}\n:root{color-scheme:dark}\n</style>');
  rep(
    '<button id="adminBtn" data-cursor="ui" aria-label="관리자"><span class="dot"></span><span id="adminLbl">ADMIN</span></button>',
    '<button id="adminBtn" hidden tabindex="-1"></button><span id="adminLbl" hidden></span>'
  );
  rep('function openPin(){', 'function openPin(){ return;');
  rep('function openDrawer(){', 'function openDrawer(){ return;');
  rep('async function applyDroppedFiles(files){', 'async function applyDroppedFiles(files){ return;');
  rep('saved = await Store.get(GALLERY_KEY);', 'saved = null;');
  rep('const defaultItems = () => DEFAULT_ART.map(', 'const defaultItems = () => DEFAULT_ART.filter(a => a.uid).map(');
  return s;
}

async function commitFiles(files, message) {
  const ref = await (await gh(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`)).json();
  const parent = ref.object.sha;
  const parentCommit = await (await gh(`/repos/${OWNER}/${REPO}/git/commits/${parent}`)).json();

  const tree = [];
  for (const [path, content] of Object.entries(files)) {
    const blob = await (
      await gh(`/repos/${OWNER}/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'utf-8' }),
      })
    ).json();
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const newTree = await (
    await gh(`/repos/${OWNER}/${REPO}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
    })
  ).json();

  const commit = await (
    await gh(`/repos/${OWNER}/${REPO}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [parent],
        author: { name: 'Claude', email: 'noreply@anthropic.com', date: new Date().toISOString() },
      }),
    })
  ).json();

  // force:false -> fails (422) if main moved meanwhile; the handler retries once.
  await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return commit.sha;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!process.env.PUBLISH_SECRET || !process.env.GITHUB_TOKEN) {
    return res.status(500).json({ error: 'server not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'bad JSON' }); }
  }
  body = body || {};

  if (!checkSecret(body.secret)) return res.status(401).json({ error: 'unauthorized' });

  const items = body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_WORKS) {
    return res.status(400).json({ error: `items must be 1..${MAX_WORKS}` });
  }
  const seen = new Set();
  try {
    items.forEach((it, i) => {
      validateItem(it, i);
      if (seen.has(it.uid)) throw new Error(`duplicate uid: ${it.uid}`);
      seen.add(it.uid);
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      const [master, head] = await Promise.all([getRaw(MASTER), getRaw(HEADBLOCK)]);
      const tokens = builtinEmbedTokens(master);
      const newMaster = replaceArt(master, items.map((it) => artLine(it, tokens)));
      const newOut = buildVisitor(newMaster, head);
      try {
        const sha = await commitFiles(
          { [MASTER]: newMaster, [OUT]: newOut },
          `publish: gallery update (${items.length} works)`
        );
        return res.status(200).json({ ok: true, commit: sha, works: items.length });
      } catch (e) {
        lastErr = e;
        if (!/GitHub 422/.test(e.message)) throw e; // only retry on a non-fast-forward race
      }
    }
    throw lastErr;
  } catch (e) {
    console.error('publish failed:', e);
    return res.status(500).json({ error: 'publish failed', detail: String(e.message).slice(0, 300) });
  }
};

// Exposed for local tests only.
module.exports._internal = { buildVisitor, replaceArt, artLine, builtinEmbedTokens };
