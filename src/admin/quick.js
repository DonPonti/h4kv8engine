/*
 * HFK Studio: Quick Capture
 * Paste Instagram links -> pick a celebrity -> publish many looks in ONE commit.
 * Also: "Identify shoes" queue for tagging shoes in bulk later.
 *
 * The first half is pure logic (no DOM) so it can be unit tested in Node.
 * Saves always merge into the latest hfk.json from GitHub (never a stale in-memory copy).
 */
(function (root) {
  'use strict';

  var FN = '/.netlify/functions/hfk';
  var DATA_PATH = 'src/_data/hfk.json';
  var SESSION_KEY = 'hfk-admin-session';

  /* ------------------------------ helpers ------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slug(s) {
    return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function today() { // local date, not UTC (matters late at night in IST)
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  function b64(s) { var b = new TextEncoder().encode(s), bin = ''; b.forEach(function (x) { bin += String.fromCharCode(x); }); return btoa(bin); }
  function fromB64(s) { var bin = atob(String(s).replace(/\n/g, '')); return new TextDecoder().decode(Uint8Array.from(bin, function (c) { return c.charCodeAt(0); })); }
  function uuid() { return (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : 'look-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ------------------------------ Instagram ------------------------------ */
  // Shortcodes are case-sensitive: never lowercase them.
  function parseIg(raw) {
    try {
      var u = new URL(String(raw || '').trim());
      var h = u.hostname.toLowerCase();
      if (h !== 'instagram.com' && h !== 'www.instagram.com' && h !== 'm.instagram.com') return null;
      var parts = u.pathname.split('/').filter(Boolean);
      var i = parts.findIndex(function (p) { return ['p', 'reel', 'reels', 'tv'].indexOf(p.toLowerCase()) > -1; });
      var code = parts[i + 1];
      if (i < 0 || !code || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
      var kind = parts[i].toLowerCase() === 'reels' ? 'reel' : parts[i].toLowerCase();
      return { kind: kind, code: code, url: 'https://www.instagram.com/' + kind + '/' + code + '/' };
    } catch (e) { return null; }
  }

  // Pull every Instagram link out of arbitrary pasted text (share messages, captions, lists).
  function extractInstagram(text) {
    var found = [], seen = {};
    var matches = String(text || '').match(/https?:\/\/(?:www\.|m\.)?instagram\.com\/[^\s"'<>]+/gi) || [];
    matches.forEach(function (m) {
      var p = parseIg(m.replace(/[.,;:!?)\]}]+$/, ''));
      if (p && !seen[p.code]) { seen[p.code] = 1; found.push(p); }
    });
    return found;
  }

  function existingCodes(data) {
    var set = {};
    (data.updates || []).forEach(function (u) { var p = parseIg(u.instagramUrl); if (p) set[p.code] = 1; });
    return set;
  }

  /* ------------------------------ lookups ------------------------------ */
  function findCelebrity(data, text) {
    var q = String(text || '').trim().toLowerCase();
    if (!q) return null;
    var list = data.celebrities || [];
    var handle = q.replace(/^@/, '');
    var exact = list.find(function (c) {
      return String(c.name).toLowerCase() === q || c.slug === q || String(c.instagram || '').replace(/^@/, '').toLowerCase() === handle;
    });
    if (exact) return exact;
    var partial = list.filter(function (c) { return String(c.name).toLowerCase().indexOf(q) > -1; });
    return partial.length === 1 ? partial[0] : null;
  }

  // "Nike Air Max 90" (existing)  |  "Nike | Air Max 90" (create if missing)
  function resolveShoe(data, text) {
    var t = String(text || '').trim();
    if (!t) return { action: 'none' };
    var shoes = data.shoes || [];
    var low = t.toLowerCase();
    var hit = shoes.find(function (s) { return (s.brand + ' ' + s.name).toLowerCase() === low || s.slug === slug(t); });
    if (hit) return { action: 'existing', shoe: hit };
    if (t.indexOf('|') > -1) {
      var bits = t.split('|').map(function (x) { return x.trim(); });
      var brand = bits[0], name = bits.slice(1).join(' ').trim();
      if (!brand || !name) return { error: 'Use "Brand | Model" for a new shoe: ' + t };
      var s2 = shoes.find(function (s) { return s.slug === slug(brand + ' ' + name); });
      return s2 ? { action: 'existing', shoe: s2 } : { action: 'create', brand: brand, name: name };
    }
    return { error: '"' + t + '" is not in the shoe catalog. To add it, type Brand | Model.' };
  }

  function ensureShoe(data, r, createdLog) {
    if (r.action === 'existing') return r.shoe;
    data.shoes = data.shoes || []; data.brands = data.brands || [];
    var bs = slug(r.brand), ss = slug(r.brand + ' ' + r.name);
    var existing = data.shoes.find(function (s) { return s.slug === ss; });
    if (existing) return existing;
    if (!data.brands.some(function (b) { return b.slug === bs; })) data.brands.push({ name: r.brand, slug: bs, description: '' });
    var shoe = { brand: r.brand, brandSlug: bs, name: r.name, slug: ss, description: '', affiliates: [] };
    data.shoes.push(shoe);
    createdLog.push(r.brand + ' ' + r.name);
    return shoe;
  }

  function recount(data, slugs) {
    (data.celebrities || []).forEach(function (c) {
      if (slugs.indexOf(c.slug) > -1) c.updateCount = (data.updates || []).filter(function (u) { return u.celebritySlug === c.slug; }).length;
    });
  }

  /* ------------------------------ mutations ------------------------------ */
  // opts: { celebrity: slug, date, occasion, rows: [{ url, code, shoeText, confidence }] }
  function applyBatch(data, opts) {
    data.updates = Array.isArray(data.updates) ? data.updates : [];
    var celeb = (data.celebrities || []).find(function (c) { return c.slug === opts.celebrity; });
    if (!celeb) throw new Error('Celebrity not found. Pick one from the list.');
    var have = existingCodes(data), skipped = [], todo = [];
    (opts.rows || []).forEach(function (row) {
      var p = parseIg(row.url);
      if (!p) { skipped.push(row.url); return; }
      if (have[p.code]) { skipped.push(p.code); return; }
      have[p.code] = 1;
      var r = resolveShoe(data, row.shoeText);
      if (r.error) throw new Error(r.error);
      todo.push({ p: p, r: r, confidence: row.confidence });
    });
    if (!todo.length) throw new Error('Nothing new to publish (all links already tracked or invalid).');
    var created = [];
    var made = todo.map(function (x) {
      var shoe = x.r.action === 'none' ? null : ensureShoe(data, x.r, created);
      return {
        id: uuid(), celebritySlug: celeb.slug, celebrityName: celeb.name,
        shoeSlug: shoe ? shoe.slug : '', shoeName: shoe ? shoe.brand + ' ' + shoe.name : '',
        instagramUrl: x.p.url, date: opts.date || today(), occasion: opts.occasion || '', description: '',
        image: '', imageAlt: celeb.name + ' fashion look', imageCredit: '', sourceUrl: '', sourceName: '', sourceType: 'instagram',
        confidence: shoe ? (x.confidence || 'medium') : 'unidentified', identificationNotes: '', accessories: []
      };
    });
    data.updates.unshift.apply(data.updates, made);
    recount(data, [celeb.slug]);
    return { added: made.map(function (m) { return m.id; }), skipped: skipped, createdShoes: created, celebrity: celeb.name };
  }

  // items: [{ id, shoeText, confidence }]
  function applyIdentify(data, items) {
    var resolved = [];
    (items || []).forEach(function (it) {
      var u = (data.updates || []).find(function (x) { return x.id === it.id; });
      if (!u || !String(it.shoeText || '').trim()) return;
      var r = resolveShoe(data, it.shoeText);
      if (r.error) throw new Error(r.error);
      resolved.push({ u: u, r: r, confidence: it.confidence });
    });
    if (!resolved.length) throw new Error('Type a shoe on at least one look first.');
    var created = [];
    resolved.forEach(function (x) {
      var shoe = ensureShoe(data, x.r, created);
      x.u.shoeSlug = shoe.slug; x.u.shoeName = shoe.brand + ' ' + shoe.name; x.u.confidence = x.confidence || 'medium';
    });
    return { changed: resolved.length, createdShoes: created };
  }

  function undoBatch(data, ids) {
    var before = (data.updates || []).length, touched = {};
    data.updates = (data.updates || []).filter(function (u) {
      if (ids.indexOf(u.id) > -1) { touched[u.celebritySlug] = 1; return false; }
      return true;
    });
    recount(data, Object.keys(touched));
    return before - data.updates.length;
  }

  var core = { slug: slug, parseIg: parseIg, extractInstagram: extractInstagram, existingCodes: existingCodes, findCelebrity: findCelebrity,
    resolveShoe: resolveShoe, applyBatch: applyBatch, applyIdentify: applyIdentify, undoBatch: undoBatch, today: today };

  if (typeof module !== 'undefined' && module.exports) { module.exports = core; }
  if (typeof window === 'undefined') return;

  /* ------------------------------ GitHub-safe saving ------------------------------ */
  function api(url, opt) {
    opt = opt || {};
    var headers = Object.assign({ Authorization: 'Bearer ' + (sessionStorage.getItem(SESSION_KEY) || '') }, opt.headers || {});
    return fetch(url, Object.assign({}, opt, { headers: headers })).then(function (r) {
      return r.text().then(function (t) {
        var d = {}; try { d = t ? JSON.parse(t) : {}; } catch (e) { /* not json */ }
        if (!r.ok) { var err = new Error(d.error || 'Request failed (' + r.status + ')'); err.status = r.status; throw err; }
        return d;
      });
    });
  }
  function fetchLatest() {
    return api(FN + '?op=state').then(function (d) {
      var data = JSON.parse(fromB64(d.content));
      ['celebrities', 'shoes', 'brands', 'updates'].forEach(function (k) { if (!Array.isArray(data[k])) data[k] = []; });
      return { sha: d.sha, data: data };
    });
  }
  // Fetch newest file -> apply mutator -> save. On a sha conflict, start over with the newest file.
  function commit(mutator, message) {
    var attempt = function (n) {
      return fetchLatest().then(function (cur) {
        var result = mutator(cur.data);
        return api(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ op: 'save', path: DATA_PATH, content: b64(JSON.stringify(cur.data, null, 2) + '\n'), sha: cur.sha, message: message }) })
          .then(function () { return result; });
      }).catch(function (e) {
        if (n < 3 && (e.status === 409 || /sha|does not match/i.test(e.message || ''))) return attempt(n + 1);
        throw e;
      });
    };
    return attempt(1);
  }

  /* ------------------------------ UI ------------------------------ */
  var app = null; // window.hfkApp, set by app-secure.js
  var ui = { rows: [], text: '', celeb: '', batch: null, identCount: 8 };
  var LS = { last: 'hfk-qc-celeb', recent: 'hfk-qc-recent', batch: 'hfk-qc-batch' };
  var OCCASIONS = ['Airport', 'Street style', 'Event', 'Red carpet', 'Match day', 'Gym', 'Casual', 'Photoshoot', 'Travel'];
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function $(s, r) { return (r || document).querySelector(s); }

  function embedHtml(url) {
    var p = parseIg(url);
    if (!p) return '';
    return '<div class="ig-embed" data-ig-kind="' + esc(p.kind) + '" data-ig-code="' + esc(p.code) + '"><div class="ig-stage"></div><a class="ig-open" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">View on Instagram ↗</a></div>';
  }
  function togglePreview(box, url) {
    if (box.firstChild) { box.innerHTML = ''; return false; }
    box.innerHTML = embedHtml(url);
    // the user asked for this preview, so mount immediately instead of waiting for scroll
    if (root.HFKInstagram) root.HFKInstagram.mount(box.querySelector('.ig-embed'));
    return true;
  }
  function note(text, kind) {
    var el = $('#qcMsg'); if (!el) return;
    el.innerHTML = text ? '<div class="notice ' + (kind || '') + '">' + text + '</div>' : '';
  }
  function shoeOptions(state) {
    return (state.shoes || []).map(function (s) { return '<option value="' + esc(s.brand + ' ' + s.name) + '">'; }).join('');
  }
  function confSelect(cls, val) {
    return '<select class="' + cls + '" title="How sure is the shoe ID?">' + ['medium', 'high', 'verified'].map(function (c) {
      return '<option' + (c === (val || 'medium') ? ' selected' : '') + '>' + c + '</option>';
    }).join('') + '</select>';
  }

  function render() {
    var state = app.getState();
    ui.celeb = ui.celeb || lsGet(LS.last, '');
    var celebObj = state.celebrities.find(function (c) { return c.slug === ui.celeb; });
    var recent = lsGet(LS.recent, []).map(function (s) { return state.celebrities.find(function (c) { return c.slug === s; }); }).filter(Boolean);
    app.mount('');
    app.shell('Quick Capture', '<div id="qc">' +
      '<div class="panel"><div class="qc-top">' +
      '<label>Celebrity<input id="qcCeleb" list="qcCelebList" autocomplete="off" placeholder="Start typing a name…" value="' + esc(celebObj ? celebObj.name : '') + '"></label>' +
      '<label>Date<input id="qcDate" type="date" value="' + today() + '"></label>' +
      '<label>Occasion <span class="hint">(optional)</span><input id="qcOcc" list="qcOccList" placeholder="Airport, event…"></label></div>' +
      '<div id="qcCelebState" class="hint"></div>' +
      '<div class="qc-chips" id="qcChips">' + recent.map(function (c) { return '<button type="button" class="chip" data-slug="' + esc(c.slug) + '">' + esc(c.name) + '</button>'; }).join('') + '</div>' +
      '<datalist id="qcCelebList">' + state.celebrities.map(function (c) { return '<option value="' + esc(c.name) + '">'; }).join('') + '</datalist>' +
      '<datalist id="qcOccList">' + OCCASIONS.map(function (o) { return '<option value="' + o + '">'; }).join('') + '</datalist>' +
      '<datalist id="qcShoeList">' + shoeOptions(state) + '</datalist></div>' +
      '<div class="panel"><div class="sectionTitle"><h2>Instagram links</h2><button type="button" class="btn secondary" id="qcPasteBtn">📋 Paste from clipboard</button></div>' +
      '<textarea id="qcText" class="qc-text" placeholder="Paste one or many Instagram post / reel links. Messy text is fine: links are picked out automatically.">' + esc(ui.text) + '</textarea>' +
      '<div id="qcRows" class="qc-rows"></div>' +
      '<div class="actions" style="margin-top:12px"><button type="button" class="btn" id="qcPublish" disabled>Publish</button><span class="hint">Ctrl/⌘ + Enter · everything goes out as one commit</span></div>' +
      '<div id="qcMsg"></div></div>' +
      '<div id="qcLast"></div>' +
      '<div id="qcIdent"></div></div>');

    var celebInput = $('#qcCeleb');
    function setCeleb(c) {
      ui.celeb = c ? c.slug : '';
      if (c) { lsSet(LS.last, c.slug); }
      $('#qcCelebState').textContent = c ? '✓ ' + c.name + (c.top100Rank ? ' · HFK #' + c.top100Rank : '') + ' · ' + (c.updateCount || 0) + ' looks tracked' : (celebInput.value.trim() ? 'No unique match. Keep typing or pick from the list.' : '');
      syncPublish();
    }
    celebInput.addEventListener('input', function () { setCeleb(findCelebrity(state, celebInput.value)); });
    $('#qcChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-slug]'); if (!b) return;
      var c = state.celebrities.find(function (x) { return x.slug === b.dataset.slug; });
      celebInput.value = c.name; setCeleb(c); $('#qcText').focus();
    });
    $('#qcText').addEventListener('input', function () { ui.text = this.value; reparse(); });
    $('#qcPasteBtn').onclick = function () {
      if (!navigator.clipboard || !navigator.clipboard.readText) { note('Your browser blocks clipboard access. Paste into the box instead.', 'error'); return; }
      navigator.clipboard.readText().then(function (t) { var ta = $('#qcText'); ta.value = (ta.value ? ta.value.replace(/\s*$/, '\n') : '') + t; ui.text = ta.value; reparse(); }).catch(function () { note('Could not read the clipboard. Paste into the box instead.', 'error'); });
    };
    $('#qcPublish').onclick = publish;
    $('#qc').addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); publish(); } });
    setCeleb(celebObj || null);
    reparse();
    drawLast();
    drawIdent();
    if (!celebObj) celebInput.focus(); else $('#qcText').focus();
  }

  function reparse() {
    var state = app.getState();
    var prev = {}; ui.rows.forEach(function (r) { prev[r.code] = r; });
    var have = existingCodes(state);
    ui.rows = extractInstagram(ui.text).map(function (p) {
      var old = prev[p.code] || {};
      return { url: p.url, kind: p.kind, code: p.code, dup: !!have[p.code], shoeText: old.shoeText || '', confidence: old.confidence || 'medium' };
    });
    drawRows();
  }
  function newRows() { return ui.rows.filter(function (r) { return !r.dup; }); }
  function syncPublish() {
    var btn = $('#qcPublish'); if (!btn) return;
    var n = newRows().length;
    btn.disabled = !(n && ui.celeb);
    btn.textContent = n ? 'Publish ' + n + ' look' + (n > 1 ? 's' : '') : 'Publish';
  }
  function drawRows() {
    var box = $('#qcRows'); if (!box) return;
    box.innerHTML = ui.rows.map(function (r, i) {
      return '<div class="qc-row' + (r.dup ? ' dup' : '') + '" data-i="' + i + '"><div class="qc-row-main">' +
        '<span class="badge ' + (r.dup ? 'warn' : 'ok') + '">' + (r.dup ? 'already tracked' : 'new') + '</span>' +
        '<a href="' + esc(r.url) + '" target="_blank" rel="noopener noreferrer" class="qc-code">' + esc(r.kind + '/' + r.code) + '</a>' +
        '<button type="button" class="btn link" data-act="preview">Preview</button>' +
        (r.dup ? '' : '<input class="qc-shoe" list="qcShoeList" placeholder="Shoe (optional) · new: Brand | Model" value="' + esc(r.shoeText) + '">' + (r.shoeText ? confSelect('qc-conf', r.confidence) : '')) +
        '<button type="button" class="btn link dangerText" data-act="remove" title="Remove">✕</button></div><div class="qc-prev"></div></div>';
    }).join('');
    syncPublish();
    box.onclick = function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var row = b.closest('.qc-row'), r = ui.rows[+row.dataset.i];
      if (b.dataset.act === 'preview') { b.textContent = togglePreview(row.querySelector('.qc-prev'), r.url) ? 'Hide' : 'Preview'; }
      if (b.dataset.act === 'remove') { ui.text = ui.text.split(r.code).join('').replace(/\n{3,}/g, '\n\n'); var ta = $('#qcText'); if (ta) ta.value = ui.text; ui.rows.splice(+row.dataset.i, 1); drawRows(); }
    };
    box.oninput = function (e) {
      var row = e.target.closest('.qc-row'); if (!row) return;
      var r = ui.rows[+row.dataset.i];
      if (e.target.classList.contains('qc-shoe')) {
        var had = !!r.shoeText; r.shoeText = e.target.value;
        if (!!r.shoeText !== had) { // show/hide confidence without losing focus
          var main = row.querySelector('.qc-row-main'), sel = main.querySelector('.qc-conf');
          if (r.shoeText && !sel) e.target.insertAdjacentHTML('afterend', confSelect('qc-conf', r.confidence));
          if (!r.shoeText && sel) sel.remove();
        }
      }
      if (e.target.classList.contains('qc-conf')) r.confidence = e.target.value;
    };
  }

  function publish() {
    var btn = $('#qcPublish');
    if (!btn || btn.disabled) return;
    var rows = newRows(), celebSlug = ui.celeb;
    var opts = { celebrity: celebSlug, date: $('#qcDate').value || today(), occasion: $('#qcOcc').value.trim(),
      rows: rows.map(function (r) { return { url: r.url, shoeText: r.shoeText, confidence: r.confidence }; }) };
    btn.disabled = true; note('Publishing…');
    commit(function (data) { return applyBatch(data, opts); }, 'Quick capture: ' + rows.length + ' look' + (rows.length > 1 ? 's' : '') + ' for ' + (app.getState().celebrities.find(function (c) { return c.slug === celebSlug; }) || {}).name)
      .then(function (res) {
        var recent = [celebSlug].concat(lsGet(LS.recent, []).filter(function (s) { return s !== celebSlug; })).slice(0, 6);
        lsSet(LS.recent, recent);
        lsSet(LS.batch, { ids: res.added, celebrity: res.celebrity, at: Date.now() });
        ui.text = ''; ui.rows = [];
        return app.reload().then(function () {
          render();
          note('✓ Published ' + res.added.length + ' look' + (res.added.length > 1 ? 's' : '') + ' for ' + esc(res.celebrity) +
            (res.skipped.length ? ' · skipped ' + res.skipped.length + ' duplicate/invalid' : '') +
            (res.createdShoes.length ? ' · added shoe' + (res.createdShoes.length > 1 ? 's' : '') + ': ' + esc(res.createdShoes.join(', ')) : '') +
            '. The site rebuilds in about a minute.', 'success');
        });
      })
      .catch(function (e) { btn.disabled = false; note(esc(e.message), 'error'); });
  }

  function drawLast() {
    var box = $('#qcLast'); if (!box) return;
    var b = lsGet(LS.batch, null), state = app.getState();
    var live = b ? b.ids.filter(function (id) { return state.updates.some(function (u) { return u.id === id; }); }) : [];
    if (!b || !live.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="panel qc-last"><div><strong>Last batch:</strong> ' + live.length + ' look' + (live.length > 1 ? 's' : '') + ' for ' + esc(b.celebrity) + '</div><button type="button" class="btn secondary" id="qcUndo">Undo last batch</button></div>';
    $('#qcUndo').onclick = function () {
      if (!confirm('Remove these ' + live.length + ' look(s) you just published?')) return;
      this.disabled = true;
      commit(function (data) { return undoBatch(data, live); }, 'Undo quick capture: ' + live.length + ' look(s)')
        .then(function () { lsSet(LS.batch, null); return app.reload(); })
        .then(function () { render(); note('Undone.', 'success'); })
        .catch(function (e) { note(esc(e.message), 'error'); });
    };
  }

  function drawIdent() {
    var box = $('#qcIdent'); if (!box) return;
    var state = app.getState();
    var todo = state.updates.filter(function (u) { return !u.shoeSlug; });
    if (!todo.length) { box.innerHTML = ''; return; }
    var shown = todo.slice(0, ui.identCount);
    box.innerHTML = '<div class="panel"><div class="sectionTitle"><h2>Identify shoes</h2><span class="hint">' + todo.length + ' look' + (todo.length > 1 ? 's' : '') + ' without a shoe</span></div>' +
      shown.map(function (u) {
        return '<div class="qc-row" data-id="' + esc(u.id) + '"><div class="qc-row-main"><strong>' + esc(u.celebrityName) + '</strong><span class="hint">' + esc(u.date) + '</span>' +
          (u.instagramUrl ? '<button type="button" class="btn link" data-act="preview">Preview</button>' : '') +
          '<input class="qc-shoe" list="qcShoeList" placeholder="Shoe · new: Brand | Model">' + '</div><div class="qc-prev"></div></div>';
      }).join('') +
      '<div class="actions" style="margin-top:12px"><button type="button" class="btn" id="qcIdentSave">Save identifications</button>' +
      (todo.length > shown.length ? '<button type="button" class="btn secondary" id="qcIdentMore">Show more</button>' : '') + '</div><div id="qcIdentMsg"></div></div>';
    box.onclick = function (e) {
      var b = e.target.closest('[data-act="preview"]');
      if (b) { var row = b.closest('.qc-row'), u = state.updates.find(function (x) { return x.id === row.dataset.id; }); b.textContent = togglePreview(row.querySelector('.qc-prev'), u.instagramUrl) ? 'Hide' : 'Preview'; }
    };
    var more = $('#qcIdentMore'); if (more) more.onclick = function () { ui.identCount += 10; drawIdent(); };
    $('#qcIdentSave').onclick = function () {
      var items = [].slice.call(box.querySelectorAll('.qc-row')).map(function (row) {
        return { id: row.dataset.id, shoeText: row.querySelector('.qc-shoe').value, confidence: 'medium' };
      }).filter(function (i) { return i.shoeText.trim(); });
      var msg = $('#qcIdentMsg'), btn = this;
      if (!items.length) { msg.innerHTML = '<div class="notice error">Type a shoe on at least one look first.</div>'; return; }
      btn.disabled = true; msg.innerHTML = '<div class="notice">Saving…</div>';
      commit(function (data) { return applyIdentify(data, items); }, 'Identify shoes on ' + items.length + ' look' + (items.length > 1 ? 's' : ''))
        .then(function (res) { return app.reload().then(function () { render(); note('✓ Identified ' + res.changed + ' look' + (res.changed > 1 ? 's' : '') + (res.createdShoes.length ? ' · added: ' + esc(res.createdShoes.join(', ')) : ''), 'success'); }); })
        .catch(function (e) { btn.disabled = false; msg.innerHTML = '<div class="notice error">' + esc(e.message) + '</div>'; });
    };
  }

  root.hfkQuick = { render: function () { app = root.hfkApp; if (!app) return; render(); }, embedHtml: embedHtml, core: core };
})(typeof window !== 'undefined' ? window : globalThis);
