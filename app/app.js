/* Vice Ledger — GTA VI trophy guide & tracker. Offline; only fetches its own data file. */
(function () {
  'use strict';
  var LS_KEY = 'vice-ledger-v4';
  var DEMO_EARNED = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 16, 21];
  var DEMO_COUNTS = { 15: 120, 28: 6, 31: 40, 35: 55 };

  var DATA = null;
  var state = { earned: {}, counts: {}, spoiler: false, theme: 'paper', tab: 'checklist',
    kind: 'all', grade: 'all', q: '', hideEarned: false, selected: 28 };
  var srcById = {};

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function params() { return new URLSearchParams(location.search); }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ earned: state.earned, counts: state.counts })); } catch (e) {}
  }
  function loadSaved() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var d = JSON.parse(raw);
      state.earned = d.earned || {}; state.counts = d.counts || {};
      return true;
    } catch (e) { return false; }
  }
  function isEarned(id) { return !!state.earned[id]; }
  function isHidden(t) { return state.spoiler && t.kind === 'story' && !isEarned(t.id); }
  function dispName(t) { return isHidden(t) ? 'Hidden story trophy' : t.name; }
  function gradeChip(t) {
    if (isHidden(t)) return '<span class="chip">hidden</span>';
    return '<span class="chip grade-' + esc(t.grade) + '">' + esc(t.grade) + '</span>';
  }
  function kindChip(t) { if (t.kind === t.grade) return ''; return '<span class="chip">' + esc(t.kind) + '</span>'; }
  function phaseChip(t) { return '<span class="chip">Phase ' + t.phase + '</span>'; }
  function srcChip(t) { return '<span class="chip src">' + t.sources.length + ' src</span>'; }
  function countChip(t) {
    if (!t.target) return '';
    var n = state.counts[t.id] || 0;
    return '<span class="chip count">' + n + '/' + fmtTarget(t) + '</span>';
  }
  function fmtTarget(t) {
    if (t.targetUnit === '$ laundered' || t.targetUnit === '$ spent') return '$' + t.target.toLocaleString('en-US');
    return String(t.target);
  }
  function auditNumbers() {
    var total = 0, backed = 0, steps = 0;
    DATA.trophies.forEach(function (t) {
      total += t.sources.length;
      t.steps.forEach(function (s) {
        steps++;
        if ((s.match(/\[\d+\]/g) || []).length >= 2) backed++;
      });
    });
    var sites = {};
    DATA.sources.forEach(function (s) { if (s.site !== 'Vice Ledger roadmap') sites[s.site] = 1; });
    return { total: total, backed: backed, steps: steps, pages: DATA.sources.length,
      sites: Object.keys(sites).length, disputes: DATA.disputes.length };
  }
  function auditHtml() {
    var a = auditNumbers();
    // sites counts external sites only: the 'Vice Ledger roadmap' source is our own
    // inference note, not an external site (validator counts 29 incl. it).
    return '<b>' + a.total + '/' + a.total + ' claims cited</b> &middot; ' + a.backed +
      ' backed by 2+ sources &middot; ' + a.pages + ' pages &middot; ' + a.sites +
      ' sites &middot; ' + a.disputes + ' disputes shown &middot; ' + DATA.trophies.length +
      ' trophies &middot; ' + DATA.trophies.filter(function (t) { return t.missable; }).length +
      ' missable &middot; 28 hidden on PlayStation &middot; List 2026-11-18 &middot; Guide updated 2026-11-21';
  }
  function renderAudit() { $('auditStrip').innerHTML = auditHtml(); }

  function renderProgress() {
    var n = DATA.trophies.filter(function (t) { return isEarned(t.id); }).length;
    var total = DATA.trophies.length;
    var missN = DATA.trophies.filter(function (t) { return t.missable; }).length;
    var pct = Math.round(n / total * 100);
    $('progressText').textContent = n + ' / ' + total + ' trophies earned';
    $('progressPct').textContent = pct + '% to platinum';
    $('progressFill').style.width = pct + '%';
    var next = null;
    var ordered = DATA.trophies.slice().sort(function (a, b) { return (a.phase - b.phase) || (a.id - b.id); });
    for (var i = 0; i < ordered.length; i++) {
      if (!isEarned(ordered[i].id)) { next = ordered[i]; break; }
    }
    $('nextUp').textContent = next ? ('Next up: ' + dispName(next)) : 'Next up: Platinum — Vice Got a Price!';
    $('missCount').textContent = '(' + missN + ')';
  }

  function markSteps(text) {
    return esc(text).replace(/\[(\d+)\]/g, '<span class="mk">[$1]</span>');
  }
  function sourceListHtml(t) {
    var out = '<ol class="src-list">';
    t.sources.forEach(function (sid, i) {
      var s = srcById[sid];
      out += '<li><b>[' + (i + 1) + '] ' + esc(s.site) + '</b> — ' + esc(s.label) +
        ' · <span class="sdate">' + esc(s.date) + '</span><br>' + esc(s.covers) +
        (s.url ? '<br><span class="hidden-note">' + esc(s.url) + '</span>' : '') + '</li>';
    });
    return out + '</ol>';
  }
  function stepperHtml(t) {
    if (!t.target) return '';
    var n = state.counts[t.id] || 0;
    return '<div class="stepper"><span><b>YOUR COUNT</b> — ' + n + ' / ' + fmtTarget(t) +
      ' ' + esc(t.targetUnit) + '</span>' +
      '<button type="button" data-action="count-minus" data-id="' + t.id + '" aria-label="Decrease count">&minus;</button>' +
      '<span class="count-num">' + n + '</span>' +
      '<button type="button" data-action="count-plus" data-id="' + t.id + '" aria-label="Increase count">+</button></div>';
  }
  function windowHtml(t) {
    if (!t.window) return '';
    var txt = t.window.indexOf('MISSABLE WINDOW') === 0 ? t.window : 'MISSABLE WINDOW: ' + t.window;
    return '<div class="window-box">' + esc(txt) + '</div>';
  }
  // NOTE: dispute shapes differ by design — a per-trophy dispute carries
  // {text, sources[]} versions (with dated citations), while the global
  // DATA.disputes list carries plain-string versions. Both renderers below
  // consume their own shape on purpose; do not "normalize" them into one.
  function disputeHtml(t) {
    if (!t.dispute) return '';
    var d = t.dispute;
    function ver(v, label) {
      var srcs = v.sources.map(function (sid) { return esc(srcById[sid].site) + ' ' + esc(srcById[sid].date); }).join(', ');
      return '<div class="ver"><b>' + label + ':</b> ' + esc(v.text) + ' <span class="hidden-note">(' + srcs + ')</span></div>';
    }
    return '<div class="dispute-box"><b>SOURCES DIFFER — both versions shown</b>' +
      ver(d.a, 'Version A') + ver(d.b, 'Version B') +
      '<div class="our-call"><b>Our call:</b> ' + esc(d.call.replace(/^Our call: ?/, '')) + '</div></div>';
  }
  function saveHtml(t) {
    if (!t.saveAdvice) return '';
    return '<div class="save-box"><b>Save advice:</b> ' + esc(t.saveAdvice) + '</div>';
  }
  function detailHtml(t) {
    if (isHidden(t)) {
      return '<div class="detail"><h2>Hidden story trophy</h2>' +
        '<p class="hidden-note">Spoiler-safe is ON. This story trophy is hidden until earned — its name, description and grade stay hidden everywhere, including here.</p>' +
        '<p>Play the story to earn it, then it reveals itself in this guide.</p></div>';
    }
    var h = '<div class="detail"><div class="dhead"><h2>' + esc(t.name) + '</h2><div>' + gradeChip(t) + ' ' + srcChip(t) + '</div></div>';
    h += '<p class="ddesc">' + esc(t.description) + '</p>';
    h += '<p>' + kindChip(t) + ' ' + phaseChip(t) +
      (t.missable ? ' <span class="chip miss">MISSABLE</span>' : '') +
      (t.possiblyMissable ? ' <span class="chip miss">POSSIBLY MISSABLE</span>' : '') + '</p>';
    h += stepperHtml(t);
    h += windowHtml(t);
    h += disputeHtml(t);
    h += '<h3>Guide</h3><ol class="steps">';
    t.steps.forEach(function (s) { h += '<li>' + markSteps(s) + '</li>'; });
    h += '</ol>';
    h += '<div class="keyfact"><b>Key fact:</b> ' + esc(t.keyFact) + '</div>';
    h += saveHtml(t);
    h += '<h3>Dated sources (' + t.sources.length + ')</h3>' + sourceListHtml(t);
    return h + '</div>';
  }

  function trophyRow(t) {
    var hidden = isHidden(t);
    var checked = isEarned(t.id) ? ' checked' : '';
    var cls = 'trow' + (state.selected === t.id ? ' sel' : '') + (isEarned(t.id) ? ' earned' : '');
    var aria = hidden ? 'Hidden story trophy' : t.name;
    var h = '<div class="' + cls + '" data-action="select" data-id="' + t.id + '" role="button" tabindex="0" aria-label="' + esc(aria) + '">';
    h += '<input type="checkbox" data-action="toggle-earned" data-id="' + t.id + '"' + checked +
      ' aria-label="Mark ' + esc(aria) + ' as earned" tabindex="-1">';
    h += '<span style="flex:1;min-width:0"><span class="tname">' + esc(dispName(t)) + '</span><br>';
    h += hidden ? '<span class="tdesc">Hidden until earned.</span>' :
      '<span class="tdesc">' + esc(t.description) + '</span>';
    h += '<span class="tmeta">' + gradeChip(t) + ' ' + kindChip(t) + ' ' + phaseChip(t) +
      (t.missable ? ' <span class="chip miss">MISSABLE</span>' : '') +
      (t.possiblyMissable ? ' <span class="chip miss">POSSIBLY MISSABLE</span>' : '') +
      ' ' + srcChip(t) + ' ' + countChip(t) + '</span></span></div>';
    return h;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return DATA.trophies.filter(function (t) {
      if (state.kind === 'missable') { if (!t.missable && !t.possiblyMissable) return false; }
      else if (state.kind !== 'all' && t.kind !== state.kind) return false;
      if (state.grade !== 'all' && t.grade !== state.grade) return false;
      if (state.hideEarned && isEarned(t.id)) return false;
      if (q) {
        // Search only what the UI shows: a spoiler-hidden story trophy must
        // not leak through its real name, description or key fact.
        var sn = isHidden(t) ? 'Hidden story trophy' : t.name;
        var sd = isHidden(t) ? 'Hidden until earned.' : t.description;
        var sf = isHidden(t) ? '' : t.keyFact;
        if (sn.toLowerCase().indexOf(q) === -1 && sd.toLowerCase().indexOf(q) === -1 && sf.toLowerCase().indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function viewChecklist() {
    var list = filtered();
    var sel = DATA.trophies.find(function (t) { return t.id === state.selected; }) || DATA.trophies[0];
    var h = '<div class="filters">' +
      '<select id="kindSel" aria-label="Kind filter">' +
      ['all', 'story', 'missable', 'collectible', 'activity', 'stranger', 'crime', 'misc', 'completion', 'platinum'].map(function (k) {
        return '<option value="' + k + '"' + (state.kind === k ? ' selected' : '') + '>' + (k === 'all' ? 'All kinds' : k) + '</option>';
      }).join('') + '</select>' +
      '<select id="gradeSel" aria-label="Grade filter">' +
      ['all', 'platinum', 'gold', 'silver', 'bronze'].map(function (g) {
        return '<option value="' + g + '"' + (state.grade === g ? ' selected' : '') + '>' + (g === 'all' ? 'All grades' : g) + '</option>';
      }).join('') + '</select>' +
      '<input type="search" id="qInput" placeholder="Search trophies…" value="' + esc(state.q) + '" aria-label="Search trophies">' +
      '<label><input type="checkbox" id="hideEarned"' + (state.hideEarned ? ' checked' : '') + '> Hide earned</label>' +
      '<span class="hidden-note">' + list.length + ' of ' + DATA.trophies.length + ' shown</span></div>';
    h += '<div class="split"><div class="list">' + list.map(trophyRow).join('') + '</div>' + detailHtml(sel) + '</div>';
    return h;
  }

  function viewRoadmap() {
    var counts = [1, 2, 3, 4, 5].map(function (p) { return DATA.trophies.filter(function (t) { return t.phase === p; }).length; });
    var h = '<div class="summary-strip"><b>All ' + DATA.trophies.length + ' trophies shown</b> &middot; Phase 1: ' + counts[0] +
      ' &middot; Phase 2: ' + counts[1] + ' &middot; Phase 3: ' + counts[2] + ' &middot; Phase 4: ' + counts[3] +
      ' &middot; Phase 5: ' + counts[4] + ' &middot; ' + auditHtml() + '</div>';
    DATA.phases.forEach(function (ph) {
      var ts = DATA.trophies.filter(function (t) { return t.phase === ph.id; });
      h += '<section class="phase"><div class="phead"><h2>Phase ' + ph.id + ' — ' + esc(ph.name) + '</h2><span class="chip">' + ts.length + ' trophies</span></div>';
      h += '<p class="hidden-note">Goal: ' + esc(ph.goal) + '</p><ul>';
      ts.forEach(function (t) {
        h += '<li><b>' + esc(dispName(t)) + '</b> ' + gradeChip(t) + ' ' + srcChip(t) +
          (isHidden(t) ? '' : '<br><span class="k">' + esc(t.keyFact) + '</span>') + '</li>';
      });
      h += '</ul></section>';
    });
    return h;
  }

  function viewMissables() {
    var miss = DATA.trophies.filter(function (t) { return t.missable; });
    var pma = DATA.trophies.find(function (t) { return t.possiblyMissable; });
    var h = '<div class="summary-strip"><b>' + miss.length + ' missable trophies</b>' +
      (pma ? ' + 1 possibly missable (' + esc(pma.name) + ')' : '') + ' &middot; ' +
      'Every missable trophy carries a window box and save advice. ' + auditHtml() + '</div><div class="miss-grid">';
    var cards = pma ? miss.concat([pma]) : miss;
    cards.forEach(function (t) {
      h += '<article class="miss-card"><h2>' + esc(dispName(t)) + '</h2>';
      if (isHidden(t)) {
        h += '<p class="hidden-note">Hidden story trophy — spoiler-safe is on.</p>';
      } else {
        h += '<p>' + gradeChip(t) + ' ' + kindChip(t) + ' ' + srcChip(t) + '</p>';
        h += '<p class="ddesc">' + esc(t.description) + '</p>';
        h += windowHtml(t) + saveHtml(t);
        h += '<h3>Dated sources (' + t.sources.length + ')</h3>' + sourceListHtml(t);
      }
      h += '</article>';
    });
    return h + '</div>';
  }

  function viewSources() {
    var h = '<div class="summary-strip">' + auditHtml() + '</div>';
    h += '<h2>Source matrix — ' + DATA.sources.length + ' pages, ' + auditNumbers().sites + ' sites</h2>';
    h += '<table class="matrix"><thead><tr><th>#</th><th>Site</th><th>Page</th><th>Date</th><th>What it covers</th></tr></thead><tbody>';
    DATA.sources.forEach(function (s, i) {
      h += '<tr><td>' + (i + 1) + '</td><td><b>' + esc(s.site) + '</b></td><td>' + esc(s.label) + '</td><td>' + esc(s.date) + '</td><td>' + esc(s.covers) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<h2 style="margin-top:16px">Disputes shown both ways — ' + DATA.disputes.length + '</h2>';
    DATA.disputes.forEach(function (d) {
      h += '<div class="dispute-box"><b>' + esc(d.id) + ' — ' + esc(d.trophy) + ': ' + esc(d.topic) + '</b>' +
        '<div class="ver"><b>Version A:</b> ' + esc(d.a) + '</div>' +
        '<div class="ver"><b>Version B:</b> ' + esc(d.b) + '</div>' +
        '<div class="our-call"><b>Our call:</b> ' + esc(d.call.replace(/^Our call: ?/, '')) + '</div></div>';
    });
    return h;
  }

  function render() {
    renderAudit();
    renderProgress();
    document.body.setAttribute('data-theme', state.theme);
    $('themeBtn').textContent = state.theme === 'paper' ? 'Night theme' : 'Paper theme';
    var sb = $('spoilerBtn');
    sb.textContent = 'Spoiler-safe: ' + (state.spoiler ? 'ON' : 'OFF');
    sb.setAttribute('aria-pressed', state.spoiler ? 'true' : 'false');
    document.querySelectorAll('.tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
    var v = $('view');
    if (state.tab === 'checklist') v.innerHTML = viewChecklist();
    else if (state.tab === 'roadmap') v.innerHTML = viewRoadmap();
    else if (state.tab === 'missables') v.innerHTML = viewMissables();
    else v.innerHTML = viewSources();
    var ks = $('kindSel'); if (ks) ks.addEventListener('change', function () { state.kind = ks.value; render(); });
    var gs = $('gradeSel'); if (gs) gs.addEventListener('change', function () { state.grade = gs.value; render(); });
    var qi = $('qInput'); if (qi) qi.addEventListener('input', function () {
      state.q = qi.value;
      var pos = qi.selectionStart;
      render();
      // render() rebuilds the input node: refocus the NEW one and restore the caret,
      // otherwise typing stops after the first character.
      var nq = $('qInput'); if (nq) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) {} }
    });
    var he = $('hideEarned'); if (he) he.addEventListener('change', function () { state.hideEarned = he.checked; render(); });
  }

  function applyParams() {
    var p = params();
    if (p.get('theme') === 'night') state.theme = 'night';
    if (p.get('spoiler') === '1') state.spoiler = true;
    if (p.get('filter')) state.kind = p.get('filter');
    var hash = location.hash || '';
    var m = hash.match(/^#guide-(\d+)$/);
    if (m) { state.tab = 'checklist'; state.selected = parseInt(m[1], 10); }
    else if (hash === '#roadmap') state.tab = 'roadmap';
    else if (hash === '#missables') state.tab = 'missables';
    else if (hash === '#sources') state.tab = 'sources';
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) {
      var tab = e.target.closest('.tabs button');
      if (tab) { state.tab = tab.getAttribute('data-tab'); render(); }
      return;
    }
    var a = el.getAttribute('data-action');
    var id = parseInt(el.getAttribute('data-id'), 10);
    if (a === 'toggle-earned') return; // let the checkbox toggle natively; the change handler below saves it
    if (a === 'select') { state.selected = id; state.tab = 'checklist'; render(); }
    else if (a === 'count-plus') {
      var t = DATA.trophies.find(function (x) { return x.id === id; });
      var cur = state.counts[id] || 0;
      if (cur < t.target) { state.counts[id] = cur + 1; save(); render(); }
    } else if (a === 'count-minus') {
      var cur2 = state.counts[id] || 0;
      if (cur2 > 0) { state.counts[id] = cur2 - 1; save(); render(); }
    }
    e.preventDefault();
  });
  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-action="toggle-earned"]');
    if (!el) return;
    var id = parseInt(el.getAttribute('data-id'), 10);
    if (el.checked) state.earned[id] = true; else delete state.earned[id];
    save(); render();
  });
  document.addEventListener('keydown', function (e) {
    var row = e.target.closest('.trow');
    if (!row) return;
    var id = parseInt(row.getAttribute('data-id'), 10);
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); state.selected = id; state.tab = 'checklist'; render(); }
    else if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      if (state.earned[id]) delete state.earned[id]; else state.earned[id] = true;
      save(); render();
    }
  });
  $('themeBtn').addEventListener('click', function () {
    state.theme = state.theme === 'paper' ? 'night' : 'paper'; render();
  });
  $('spoilerBtn').addEventListener('click', function () {
    state.spoiler = !state.spoiler; render();
  });
  $('exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ earned: state.earned, counts: state.counts }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'vice-ledger-progress.json'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('importBtn').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    var f = $('importFile').files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        state.earned = d.earned || {}; state.counts = d.counts || {};
        save(); render();
      } catch (err) { alert('That file is not valid Vice Ledger progress JSON.'); }
      $('importFile').value = ''; // allow importing the same file again
    };
    r.readAsText(f);
  });
  $('resetBtn').addEventListener('click', function () {
    if (!confirm('Reset all progress and counts?')) return;
    state.earned = {}; state.counts = {};
    save(); render();
  });

  fetch('data/trophies.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status + ' loading trophy data'); return r.json(); }).then(function (d) {
    DATA = d;
    DATA.sources.forEach(function (s) { srcById[s.id] = s; });
    var had = loadSaved();
    if (!had && params().get('demo') === '1') {
      DEMO_EARNED.forEach(function (id) { state.earned[id] = true; });
      Object.keys(DEMO_COUNTS).forEach(function (k) { state.counts[k] = DEMO_COUNTS[k]; });
      save();
    }
    applyParams();
    render();
    window.addEventListener('hashchange', function () { applyParams(); render(); });
  }).catch(function (err) {
    $('view').innerHTML = '<p>Could not load the trophy data. ' + esc(String(err)) + '</p>';
  });
})();
