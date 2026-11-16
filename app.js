// T-Lab Papers dashboard (Tyrrell Lab Paper Tracker).
// Data comes from the Google Sheet through the Apps Script web app in config.js.
(function () {
  'use strict';

  const API = window.PAPER_TRACKER_API;
  const TOPICS = ['Aging', 'Atherosclerosis', 'Vascular Biology', 'Cardiac', 'Brain', 'Liver',
                  'Mitochondria', 'Immunology', 'Methods'];
  const MODELS = ['Human', 'Mouse'];
  const PAGE = 50;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
  };
  const KEY = 'pt.passcode', NAME = 'pt.name', CACHE = 'pt.cache';

  const $ = id => document.getElementById(id);
  const state = { papers: [], tags: new Set(), hasNotes: false, shown: PAGE };

  // ---------- helpers ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const yearOf = p => { const m = (p.citation || '').match(/\b(1[89]\d\d|20\d\d)\b/); return m ? +m[1] : 0; };

  function prep(list) {
    return list.map((p, i) => {
      const tags = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      return Object.assign({}, p, {
        _i: i,
        _tags: tags,
        _year: yearOf(p),
        _text: norm([p.title, p.citation, p.notes, p.tags].join(' ')),
        _authors: norm(p.authors),
      });
    });
  }

  // ---------- data ----------
  async function load(passcode, quiet) {
    if (!quiet) $('loading').hidden = false;
    try {
      const r = await fetch(API + '?action=list&k=' + encodeURIComponent(passcode));
      const d = await r.json();
      if (!d.ok) throw new Error(d.error === 'bad passcode' ? 'That passcode did not work.' : (d.error || 'Could not load.'));
      state.papers = prep(d.papers);
      store.set(CACHE, JSON.stringify(d.papers));
      return true;
    } finally {
      $('loading').hidden = true;
    }
  }

  async function addNote(paper, text) {
    const r = await fetch(API, {
      method: 'POST',
      // text/plain keeps this a "simple" request, so no CORS preflight is needed
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'note', k: store.get(KEY), pmid: paper.pmid, title: paper.title,
        note: text, name: store.get(NAME) || '',
      }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Could not save.');
    return d.notes;
  }

  async function saveTags(paper, tags) {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'tags', k: store.get(KEY), pmid: paper.pmid, title: paper.title, tags }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'Could not save.');
    return d.tags;
  }

  // Tags that are not one of the standard topics or models, A to Z.
  function customTags() {
    const set = new Set();
    state.papers.forEach(p => p._tags.forEach(t => { if (!TOPICS.includes(t) && !MODELS.includes(t)) set.add(t); }));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  // Standard topics first, then custom tags, then Human/Mouse, matching the sheet.
  function orderTags(list) {
    const rank = t => (TOPICS.includes(t) ? TOPICS.indexOf(t) : MODELS.includes(t) ? 1000 + MODELS.indexOf(t) : 500);
    return list.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  // ---------- filtering ----------
  function filtered() {
    const q = norm($('q').value).trim();
    const a = norm($('author').value).trim();
    const words = q ? q.split(/\s+/) : [];
    const sel = [...state.tags];
    let out = state.papers.filter(p =>
      words.every(w => p._text.includes(w)) &&
      (!a || p._authors.includes(a)) &&
      sel.every(t => p._tags.includes(t)) &&
      (!state.hasNotes || (p.notes || '').trim()));
    const sort = $('sort').value;
    const byAdded = (x, y) => (y.date || '').localeCompare(x.date || '') || y._i - x._i;
    if (sort === 'added') out.sort(byAdded);
    else if (sort === 'year') out.sort((x, y) => y._year - x._year || byAdded(x, y));
    else if (sort === 'yearOld') out.sort((x, y) => (x._year || 9999) - (y._year || 9999));
    else out.sort((x, y) => x.title.localeCompare(y.title));
    return out;
  }

  // ---------- rendering ----------
  function chip(label, count, pressed, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.innerHTML = esc(label) + ' <span class="n">' + count + '</span>';
    b.addEventListener('click', onClick);
    return b;
  }

  function renderChips(list) {
    const counts = {};
    list.forEach(p => p._tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
    const toggle = t => () => { state.tags.has(t) ? state.tags.delete(t) : state.tags.add(t); refresh(); };
    const fill = (el, names) => {
      el.replaceChildren(...names.map(t => chip(t, counts[t] || 0, state.tags.has(t), toggle(t))));
    };
    fill($('topicChips'), TOPICS);
    fill($('modelChips'), MODELS);
    const withNotes = list.filter(p => (p.notes || '').trim()).length;
    $('otherChips').replaceChildren(
      ...customTags().map(t => chip(t, counts[t] || 0, state.tags.has(t), toggle(t))),
      chip('Has notes', withNotes, state.hasNotes, () => { state.hasNotes = !state.hasNotes; refresh(); }));
  }

  function highlightAuthors(authors, a) {
    const parts = String(authors || '').split(/,\s*/).filter(Boolean);
    const needle = norm(a).trim();
    const marked = parts.map(n => (needle && norm(n).includes(needle) ? '<mark>' + esc(n) + '</mark>' : esc(n)));
    return { parts, marked };
  }

  function paperEl(p) {
    const li = document.createElement('li');
    li.className = 'card paper';
    const url = safeUrl(p.link) || safeUrl(p.pubmed);
    const { parts, marked } = highlightAuthors(p.authors, $('author').value);
    const long = parts.length > 8;
    const short = long ? marked.slice(0, 6).join(', ') + ', … , ' + marked[marked.length - 1] : marked.join(', ');
    const topicTags = orderTags(p._tags.filter(t => !MODELS.includes(t)));
    const modelTags = p._tags.filter(t => MODELS.includes(t));

    li.innerHTML =
      '<h3>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(p.title) + '</a>' : esc(p.title)) + '</h3>' +
      '<p class="authors"><span class="a-text">' + short + '</span>' +
        (long ? ' <button type="button" class="more-authors">all ' + parts.length + '</button>' : '') + '</p>' +
      (p.citation ? '<p class="cite">' + esc(p.citation) + '</p>' : '') +
      '<div class="meta">' +
        topicTags.map(t => '<button type="button" class="tag" data-tag="' + esc(t) + '">' + esc(t) + '</button>').join('') +
        modelTags.map(t => '<button type="button" class="tag model" data-tag="' + esc(t) + '">' + esc(t) + '</button>').join('') +
        '<span class="links">' +
          (safeUrl(p.pubmed) ? '<a href="' + esc(p.pubmed) + '" target="_blank" rel="noopener">PubMed</a>' : '') +
          (safeUrl(p.link) && p.link !== p.pubmed ? '<a href="' + esc(p.link) + '" target="_blank" rel="noopener">Full text</a>' : '') +
        '</span>' +
      '</div>' +
      '<div class="notes"' + ((p.notes || '').trim() ? '' : ' hidden') + '>' + esc(p.notes) + '</div>' +
      '<div class="note-actions"><button type="button" class="btn small quiet add-note">Add note</button>' +
        '<button type="button" class="btn small quiet edit-tags">Edit tags</button>' +
        (p.date ? ' <span class="added">Added ' + esc(p.date) + '</span>' : '') + '</div>';

    if (long) {
      li.querySelector('.more-authors').addEventListener('click', e => {
        li.querySelector('.a-text').innerHTML = marked.join(', ');
        e.currentTarget.remove();
      });
    }
    li.querySelectorAll('.tag').forEach(b => b.addEventListener('click', () => {
      state.tags.add(b.dataset.tag);
      refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    li.querySelector('.add-note').addEventListener('click', () => openNote(li, p));
    li.querySelector('.edit-tags').addEventListener('click', () => openTags(li, p));
    return li;
  }

  function openTags(li, p) {
    if (li.querySelector('.tag-form')) return;
    const picked = new Set(p._tags);
    const options = [...TOPICS, ...customTags(), ...MODELS];
    p._tags.forEach(t => { if (!options.includes(t)) options.push(t); });
    const f = document.createElement('form');
    f.className = 'tag-form';
    f.innerHTML =
      '<span class="tag-form-label">Tags (click to turn on or off)</span>' +
      '<div class="chips tag-options"></div>' +
      '<div class="row"><input type="text" class="new-tag" maxlength="40" placeholder="New tag, e.g. Microglia" aria-label="New tag">' +
      '<button class="btn small quiet add-tag" type="button">Add</button></div>' +
      '<div class="row"><button class="btn small" type="submit">Save tags</button>' +
      '<button class="btn small quiet cancel" type="button">Cancel</button><span class="msg" role="status"></span></div>';
    li.querySelector('.note-actions').after(f);
    const box = f.querySelector('.tag-options'), input = f.querySelector('.new-tag'), msg = f.querySelector('.msg');

    const draw = () => {
      box.replaceChildren(...options.map(t => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = t;
        b.setAttribute('aria-pressed', picked.has(t) ? 'true' : 'false');
        b.addEventListener('click', () => { picked.has(t) ? picked.delete(t) : picked.add(t); draw(); });
        return b;
      }));
    };
    const addNew = () => {
      const v = input.value.replace(/[,\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!v) return;
      const existing = options.find(t => t.toLowerCase() === v.toLowerCase());
      const name = existing || v;
      if (!existing) options.push(name);
      picked.add(name);
      input.value = '';
      draw();
    };
    draw();
    f.querySelector('.add-tag').addEventListener('click', addNew);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNew(); } });
    f.querySelector('.cancel').addEventListener('click', () => f.remove());
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (input.value.trim()) addNew();
      f.querySelector('[type=submit]').disabled = true;
      msg.textContent = 'Saving…';
      try {
        const tags = await saveTags(p, orderTags([...picked]));
        p.tags = tags;
        p._tags = tags.split(',').map(t => t.trim()).filter(Boolean);
        p._text = norm([p.title, p.citation, p.notes, p.tags].join(' '));
        li.replaceWith(paperEl(p));
        renderChips(filtered());
        store.set(CACHE, JSON.stringify(state.papers.map(stripPrivate)));
      } catch (err) {
        msg.textContent = err.message + ' Try again.';
        f.querySelector('[type=submit]').disabled = false;
      }
    });
  }

  function openNote(li, p) {
    if (li.querySelector('.note-form')) return;
    const f = document.createElement('form');
    f.className = 'note-form';
    f.innerHTML =
      '<label class="field"><span>New note (saved to the sheet with your name and today\'s date)</span>' +
      '<textarea maxlength="2000" required></textarea></label>' +
      '<div class="row"><button class="btn small" type="submit">Save note</button>' +
      '<button class="btn small quiet" type="button">Cancel</button><span class="msg" role="status"></span></div>';
    li.querySelector('.note-actions').after(f);
    const ta = f.querySelector('textarea'), msg = f.querySelector('.msg');
    ta.focus();
    f.querySelector('.quiet').addEventListener('click', () => f.remove());
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) return;
      if (!store.get(NAME)) {
        const n = (window.prompt('Your name, shown on your notes:') || '').trim();
        if (n) store.set(NAME, n.slice(0, 40));
      }
      f.querySelector('[type=submit]').disabled = true;
      msg.textContent = 'Saving…';
      try {
        const notes = await addNote(p, text);
        p.notes = notes;
        p._text = norm([p.title, p.citation, p.notes, p.tags].join(' '));
        const box = li.querySelector('.notes');
        box.textContent = notes;
        box.hidden = false;
        f.remove();
        renderChips(filtered());
        store.set(CACHE, JSON.stringify(state.papers.map(stripPrivate)));
      } catch (err) {
        msg.textContent = err.message + ' Try again.';
        f.querySelector('[type=submit]').disabled = false;
      }
    });
  }

  const stripPrivate = p => {
    const o = {};
    Object.keys(p).forEach(k => { if (k[0] !== '_') o[k] = p[k]; });
    return o;
  };

  function refresh(keepPage) {
    if (!keepPage) state.shown = PAGE;
    const list = filtered();
    renderChips(list);
    const n = list.length, total = state.papers.length;
    $('count').textContent = n === total ? total + ' papers' : n + ' of ' + total + ' papers';
    const frag = document.createDocumentFragment();
    list.slice(0, state.shown).forEach(p => frag.appendChild(paperEl(p)));
    if (!n) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No papers match these filters.';
      frag.appendChild(li);
    }
    $('list').replaceChildren(frag);
    $('moreBtn').hidden = n <= state.shown;
    $('moreBtn').textContent = 'Show more (' + (n - state.shown) + ' left)';
  }

  // ---------- startup ----------
  function showApp() {
    $('gate').hidden = true;
    $('app').hidden = false;
    $('topLinks').hidden = false;
    refresh();
  }

  function showGate(message) {
    $('app').hidden = true;
    $('topLinks').hidden = true;
    $('gate').hidden = false;
    $('gateError').textContent = message || '';
    $('nameInput').value = store.get(NAME) || '';
    $('passInput').focus();
  }

  let timer;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(() => refresh(), 150); };
  $('q').addEventListener('input', debounced);
  $('author').addEventListener('input', debounced);
  $('sort').addEventListener('change', () => refresh());
  $('moreBtn').addEventListener('click', () => { state.shown += PAGE; refresh(true); });
  $('clearBtn').addEventListener('click', () => {
    $('q').value = ''; $('author').value = ''; state.tags.clear(); state.hasNotes = false; refresh();
  });
  $('signOutBtn').addEventListener('click', () => {
    store.del(KEY); store.del(CACHE); state.papers = []; showGate();
  });
  $('refreshBtn').addEventListener('click', async () => {
    try { await load(store.get(KEY)); refresh(true); } catch (e) { showGate(e.message); }
  });

  $('gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pass = $('passInput').value.trim();
    const name = $('nameInput').value.trim();
    if (name) store.set(NAME, name.slice(0, 40));
    $('gateError').textContent = '';
    $('gate').hidden = true;
    try {
      await load(pass);
      store.set(KEY, pass);
      showApp();
    } catch (err) {
      showGate(err.message);
    }
  });

  (async function init() {
    const pass = store.get(KEY);
    if (!pass) return showGate();
    // Show the cached copy at once, then refresh from the sheet in the background.
    const cached = store.get(CACHE);
    if (cached) {
      try { state.papers = prep(JSON.parse(cached)); showApp(); } catch (e) { /* ignore bad cache */ }
    }
    try {
      await load(pass, !!cached);
      showApp();
    } catch (err) {
      store.del(KEY);
      showGate(err.message);
    }
  })();
})();
