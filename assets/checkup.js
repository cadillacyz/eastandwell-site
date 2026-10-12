// Your checkup, by the guidelines. Two answers (age and sex) light up the body scan straight away;
// everything else is an optional refinement on the same page, and each answer redraws the result
// and says what changed. Then a card for each check, the next ten years and a brief to print.
// Runs entirely in the browser: nothing anyone enters is stored or sent. The data comes from
// attributes the build writes.
(function () {
  'use strict';
  var root = document.querySelector('[data-consult]');
  if (!root) return;

  var data = function (k) { return JSON.parse(root.getAttribute('data-' + k)); };
  var ITEMS = data('items'), FACTS = data('facts'), C = data('copy'), SPOTS = data('spots'), ILLUS = data('illus');
  var ZH = root.getAttribute('data-lang') === 'zh';
  var YEAR = new Date().getFullYear();
  var q = function (s, r) { return (r || root).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var fill = function (t, a, b, c) { return String(t).split('{a}').join(a).split('{b}').join(b == null ? '' : b).split('{c}').join(c == null ? '' : c); };
  var list = function (xs) { return xs.join(ZH ? '、' : ', '); };
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Answers -------------------------------------------------------------------------------
  var A = { family: {} }, famActive = null, famNone = false;
  var inRange = function (lo, hi) { return A.age >= lo && A.age <= hi; };
  // The optional questions, in reading order. "part" picks the small heading each sits under.
  var STEPS = [
    { id: 'ever', part: 0, type: 'choice', opts: ['yes', 'no'] },
    { id: 'heavy', part: 0, type: 'choice', opts: ['yes', 'no', 'unsure'], show: function () { return A.ever === 'yes'; } },
    { id: 'weight', part: 0, type: 'choice', opts: ['yes', 'no', 'unsure'] },
    { id: 'family', part: 1, type: 'family' },
    { id: 'colon', part: 2, type: 'choice', opts: ['u5', '5to10', 'o10', 'never', 'stool', 'ns'], show: function () { return inRange(40, 85); } },
    { id: 'mammo', part: 2, type: 'choice', opts: ['u1', '1to2', 'o2', 'never', 'ns'], show: function () { return A.sex === 'female' && inRange(40, 74); } },
    { id: 'cervix', part: 2, type: 'choice', opts: ['u3', '3to5', 'o5', 'ns', 'none'], show: function () { return A.sex === 'female' && inRange(21, 65); } },
    { id: 'tested', part: 2, type: 'multi', show: function () { return A.age <= 79; } },
    { id: 'sugar', part: 2, type: 'choice', opts: ['yes', 'no', 'unsure'], show: function () { return A.weight === 'yes' && inRange(35, 70); } },
  ];
  var step = function (id) { return STEPS.filter(function (s) { return s.id === id; })[0]; };
  var rows = function () { return STEPS.filter(function (s) { return !s.show || s.show(); }); };
  var ready = function () { return A.age >= 18 && A.age <= 100 && !!A.sex; };
  var answered = function (id) {
    if (id === 'family') return famNone || Object.keys(A.family).some(function (k) { return A.family[k] && A.family[k].c; });
    if (id === 'tested') return !!A.tested;
    return A[id] != null;
  };
  var optLabel = function (id, key) {
    if (key === 'yes') return C.yes;
    if (key === 'no') return C.no;
    if (key === 'unsure') return C.unsure;
    var Q = C.q[id];
    return (Q && Q.opts && Q.opts[key]) || key;
  };
  var smokeKey = function () { return A.ever !== 'yes' ? 'no' : A.heavy === 'yes' ? 'heavy' : A.heavy === 'unsure' ? 'unsure' : 'yes'; };
  var F = C.q.family;
  var describe = function (r) { return F.cancers[r.c] + (r.a ? ' · ' + F.ages[r.a] : ''); };
  var testedText = function () {
    var t = A.tested || {};
    var on = ['hcv', 'hiv'].filter(function (k) { return t[k]; }).map(function (k) { return C.q.tested.opts[k]; });
    return on.length ? list(on) : C.q.tested.neither;
  };

  // What the visitor has told us, for the printed brief.
  var notes = function () {
    var r = [];
    if (A.age) r.push([C.noteKeys.age, String(A.age)]);
    if (A.sex) r.push([C.noteKeys.sex, C.q.sex.opts[A.sex]]);
    if (A.ever) r.push([C.noteKeys.smoking, C.smokeWords[smokeKey()]]);
    if (A.weight) r.push([C.noteKeys.weight, C.weightWords[A.weight]]);
    ['mother', 'father', 'sibling', 'child'].forEach(function (p) { var f = A.family[p]; if (f && f.c) r.push([F.people[p], describe(f)]); });
    ['colon', 'mammo', 'cervix'].forEach(function (k) { if (A[k] && step(k).show()) r.push([C.noteKeys[k], optLabel(k, A[k])]); });
    if (A.tested && step('tested').show()) r.push([C.noteKeys.tested, testedText()]);
    if (A.sugar && step('sugar').show()) r.push([C.noteKeys.sugar, optLabel('sugar', A.sugar)]);
    return r;
  };

  // ---- What the answers mean ----------------------------------------------------------------
  var evaluate = function () {
    var a = A, age = a.age;
    var heavy = a.ever === 'yes' && a.heavy === 'yes';
    var fam = Object.keys(a.family).map(function (k) { return a.family[k]; }).filter(function (r) { return r && r.c; });
    var famColon = fam.filter(function (r) { return r.c === 'colon'; });
    var famColonYoung = famColon.length >= 2 || famColon.some(function (r) { return r.a === 'u50' || r.a === '50s'; });
    var famBreast = fam.some(function (r) { return r.c === 'breast' || r.c === 'ovarian'; });
    var famProstate = fam.some(function (r) { return r.c === 'prostate'; });
    var needOk = function (it) {
      switch (it.need) {
        case 'heavy': return heavy;
        case 'heavyUnsure': return a.ever === 'yes' && a.heavy === 'unsure';
        case 'ever': return a.ever === 'yes';
        case 'never': return a.ever !== 'yes';
        case 'notHeavy': return !heavy;
        case 'overweight': return a.weight === 'yes';
        case 'overweightUnsure': return a.weight === 'unsure';
        case 'famBreast': return famBreast;
        default: return true;
      }
    };
    var FY = C.result.forYou;
    var out = [];
    ITEMS.forEach(function (it) {
      if (!(it.sex === 'any' || it.sex === a.sex) || !needOk(it)) return;
      var lo = it.age[0], hi = it.age[1];
      if (it.id === 'crc' && famColon.length) lo = 40;
      var r = { it: it, status: 'due', next: 0, startAge: 0, notes: [], last: '', every: it.every };
      if (age < lo) {
        if (it.list === 'rec' && lo - age <= 10) { r.status = 'later'; r.startAge = lo; r.next = YEAR + (lo - age); r.hi = hi; out.push(r); }
        return;
      }
      if (age > hi) return;
      r.hi = hi;
      if (it.list === 'talk') { r.status = 'talk'; if (it.id === 'psa' && famProstate) r.notes.push(FY.psaFamily); out.push(r); return; }
      if (it.list === 'not') { r.status = 'not'; out.push(r); return; }
      if (it.id === 'crc') {
        r.every = famColonYoung ? 5 : 10;
        r.last = a.colon ? optLabel('colon', a.colon) : '';
        var lastYear = a.colon === 'u5' ? YEAR - 3 : a.colon === '5to10' ? YEAR - 7 : 0;
        if (a.colon === 'stool') { r.status = 'ok'; r.next = YEAR + 1; r.every = 1; r.notes.push(FY.crcStool); }
        else if (lastYear && lastYear + r.every > YEAR) { r.status = 'ok'; r.next = lastYear + r.every; }
        if (famColonYoung) r.notes.push(FY.crcFamilyYoung); else if (famColon.length) r.notes.push(FY.crcFamily);
        if (r.status === 'due') r.notes.push(FY.crcPrep);
      } else if (it.id === 'breast') {
        r.last = a.mammo ? optLabel('mammo', a.mammo) : '';
        if (a.mammo === 'u1') { r.status = 'ok'; r.next = YEAR + 1; }
        if (famBreast) r.notes.push(FY.breastFamily);
      } else if (it.id === 'cervix') {
        if (a.cervix === 'none') return;
        r.every = age < 30 ? 3 : 5;
        r.last = a.cervix ? optLabel('cervix', a.cervix) : '';
        if (a.cervix === 'u3') { r.status = 'ok'; r.next = YEAR + (age < 30 ? 2 : 4); }
        else if (a.cervix === '3to5' && age >= 30) r.notes.push(FY.cervix3to5);
      } else if (it.id === 'diabetes') {
        r.last = a.sugar ? optLabel('sugar', a.sugar) : '';
        if (a.sugar === 'yes') { r.status = 'ok'; r.next = YEAR + 2; }
      } else if (it.id === 'hcv' || it.id === 'hiv') {
        if (a.tested && a.tested[it.id]) r.status = 'done';
        r.last = a.tested ? testedText() : '';
      }
      out.push(r);
    });
    return out;
  };

  // ---- The result ---------------------------------------------------------------------------
  var R = [], MARKS = [], selected = null;
  var clsOf = function (s) { return s === 'done' ? 'ok' : s; };
  var statusText = function (r) {
    var S = C.result.status;
    if (r.status === 'due') return S.due;
    if (r.status === 'ok') return r.next ? fill(S.ok, r.next) : S.okSoon;
    if (r.status === 'done') return S.done;
    if (r.status === 'later') return fill(S.later, r.startAge, r.next);
    if (r.status === 'talk') return S.talk;
    return S.not;
  };
  var oftenText = function (r) {
    var K = C.result.card, e = r.every;
    if (e == null) return '';
    return e === 0 ? K.once : e === 1 ? K.yearly : fill(K.years, e);
  };
  var count = function (st) { return R.filter(function (r) { return st.indexOf(r.status) >= 0; }).length; };

  // Group results by place on the body and status; several checks at one place share a label.
  var buildMarks = function () {
    var by = {};
    R.forEach(function (r) {
      var c = clsOf(r.status);
      if (!r.it.spot || c === 'talk') return;
      var key = r.it.spot + ':' + c;
      (by[key] = by[key] || { key: key, spot: r.it.spot, cls: c, results: [] }).results.push(r);
    });
    var marks = Object.keys(by).map(function (k) { return by[k]; });
    marks.forEach(function (m) {
      var one = m.results.length === 1;
      m.title = one ? m.results[0].it.label : (SPOTS[m.spot].name || m.results[0].it.label);
      m.sub = one ? statusText(m.results[0]) : list(m.results.map(function (r) { return (C.short && C.short[r.it.id]) || r.it.label; }));
      if (!one && m.cls !== 'due') m.sub = statusText(m.results[0]) + ' · ' + m.sub;
      m.y = SPOTS[m.spot].at[1];
    });
    var order = { due: 0, ok: 1, later: 2, not: 3 };
    marks.sort(function (a, b) { return order[a.cls] - order[b.cls] || a.y - b.y; });
    var n = 0;
    marks.forEach(function (m) { if (m.cls === 'due') m.num = ++n; });
    return marks;
  };

  // Lay labels out beside the figure: yours on the left by group, the extras on the right.
  var layoutLabels = function () {
    var place = function (items, top, bottom) {
      var units = items.reduce(function (s, x) { return s + (x.head ? 0.62 : 1); }, 0);
      var gap = Math.min(78, (bottom - top) / Math.max(1, units));
      var y = top;
      items.forEach(function (x) { x.ly = y + (x.head ? gap * 0.31 : gap / 2); y += x.head ? gap * 0.62 : gap; });
    };
    var left = [], right = [], G = C.result.groups;
    ['due', 'ok', 'later'].forEach(function (c) {
      var ms = MARKS.filter(function (m) { return m.cls === c; });
      if (ms.length) { left.push({ head: G[c], cls: c }); left.push.apply(left, ms); }
    });
    var ex = MARKS.filter(function (m) { return m.cls === 'not'; });
    if (ex.length) { right.push({ head: G.not, cls: 'not' }); right.push.apply(right, ex); }
    place(left, 40, 960);
    place(right, 110, Math.min(960, 110 + (ex.length + 1) * 84));
    return { left: left, right: right };
  };

  var renderHead = function () {
    var head = q('[data-res-head]'), RS = C.result;
    if (!ready()) { head.hidden = true; return; }
    var due = count(['due']);
    var colonDue = R.some(function (r) { return r.status === 'due' && r.it.id === 'crc'; });
    var line = due === 0 ? RS.headline0 : due === 1 ? RS.headline1 : fill(RS.headline, due);
    var rs = rows(), done = rs.filter(function (s) { return answered(s.id); }).length;
    head.hidden = false;
    head.innerHTML = '<p class="eyebrow">' + esc(fill(RS.eyebrow, A.age, C.q.sex.opts[A.sex])) + '</p>'
      + '<h2 class="cg-headline">' + esc(line) + (due ? ' <em>' + esc(colonDue ? RS.colonDay : RS.morning) + '</em>' : '') + '</h2>'
      + '<p class="cg-res-sub">' + esc(done < rs.length ? C.pending : RS.sub) + '</p>';
  };

  var renderLabels = function () {
    var box = q('[data-labels]');
    var lay = layoutLabels();
    var label = function (x, side) {
      if (x.head) return '<p class="cg-lbl-head is-' + side + ' is-' + x.cls + '" style="top:' + (x.ly / 10) + '%">' + esc(x.head) + '</p>';
      return '<button type="button" class="cg-lbl is-' + side + ' is-' + x.cls + '" data-pick="' + esc(x.key) + '" aria-pressed="false" style="top:' + (x.ly / 10) + '%">'
        + '<span class="cg-lbl-t">' + (x.num ? '<span class="cg-num">' + x.num + '</span>' : '') + esc(x.title) + '</span>'
        + (x.cls !== 'not' ? '<span class="cg-lbl-s">' + esc(x.sub) + '</span>' : '') + '</button>';
    };
    box.innerHTML = lay.left.map(function (x) { return label(x, 'left'); }).join('') + lay.right.map(function (x) { return label(x, 'right'); }).join('');
    q('[data-tap]').textContent = ready() ? C.result.tap : C.empty;
  };

  var renderTalk = function () {
    var box = q('[data-talk]');
    var talk = R.filter(function (r) { return r.status === 'talk'; });
    box.innerHTML = talk.length ? '<p class="cg-label">' + esc(C.result.groups.talk) + '</p><div class="cg-talk-list">' + talk.map(function (r) {
      return '<button type="button" class="cg-talk-item" data-pick="talk:' + esc(r.it.id) + '" aria-pressed="false"><span>' + esc(r.it.label) + '</span></button>';
    }).join('') + '</div>' : '';
  };

  // Before the two answers, the card says what the visitor is about to see.
  var previewCard = function () {
    var P = C.preview;
    return '<p class="cg-label">' + esc(P.title) + '</p><ul class="cg-preview">' + P.items.map(function (x) {
      return '<li><p class="cg-chip is-' + x[0] + '"><span></span>' + esc(x[1]) + '</p></li>';
    }).join('') + '</ul><p class="cg-card-text">' + esc(P.text) + '</p>';
  };

  var renderAll = function (from) {
    var before = snapshot();
    if (ready()) { R = evaluate(); MARKS = buildMarks(); } else { R = []; MARKS = []; }
    renderHead();
    renderLabels();
    renderTalk();
    renderRefine();
    q('[data-years]').innerHTML = ready() ? yearsHtml() : '';
    q('[data-foot]').hidden = !ready();
    // Keep the open card if it still exists; otherwise open the first check that is due.
    var keep = selected && (selected.indexOf('talk:') === 0
      ? R.some(function (r) { return 'talk:' + r.it.id === selected; })
      : MARKS.some(function (m) { return m.key === selected; }));
    if (!keep) {
      var dueMarks = MARKS.filter(function (m) { return m.cls === 'due'; });
      var first = dueMarks.filter(function (m) { return m.results.some(function (r) { return r.it.facts || r.it.illus; }); })[0] || dueMarks[0] || MARKS[0];
      var talk = R.filter(function (r) { return r.status === 'talk'; })[0];
      selected = first ? first.key : talk ? 'talk:' + talk.it.id : null;
    }
    if (selected) select(selected, false); else q('[data-card]').innerHTML = previewCard();
    startScan();
    renderSummary();
    if (from) showChange(from, before);
  };

  // ---- What changed: each answer says, right where it was given, what it did to the result ----
  var snapshot = function () {
    var m = {};
    R.forEach(function (r) { m[r.it.id] = { label: (C.short && C.short[r.it.id]) || r.it.label, text: statusText(r) }; });
    return m;
  };
  var showChange = function (rowId, before) {
    var now = snapshot(), lines = [], RF = C.refine;
    Object.keys(now).forEach(function (id) {
      if (!before[id]) lines.push(now[id].label + ': ' + now[id].text);
      else if (before[id].text !== now[id].text) lines.push(now[id].label + ': ' + now[id].text);
    });
    Object.keys(before).forEach(function (id) { if (!now[id]) lines.push(before[id].label + ': ' + RF.removed); });
    var box = q('[data-changed="' + rowId + '"]');
    if (!box) return;
    box.textContent = lines.length ? RF.changed + ' ' + lines.join(ZH ? '；' : '; ') : RF.none;
    box.classList.toggle('is-quiet', !lines.length);
  };

  // ---- Make it more accurate: every optional question on one page, in any order -------------
  var familyHtml = function () {
    var person = function (id, area) {
      var f = A.family[id], has = f && f.c;
      return '<button type="button" class="cg-person' + (has ? ' has' : '') + (famActive === id ? ' on' : '') + '" style="grid-area:' + area + '" data-person="' + id + '" aria-pressed="' + (famActive === id) + '">'
        + '<span class="cg-person-name">' + esc(F.people[id]) + '</span><span class="cg-person-note">' + esc(has ? describe(f) : F.add) + '</span></button>';
    };
    var html = '<div class="cg-tree"><span class="cg-ln a" aria-hidden="true"></span><span class="cg-ln b" aria-hidden="true"></span><span class="cg-ln c" aria-hidden="true"></span><span class="cg-ln d" aria-hidden="true"></span><span class="cg-ln e" aria-hidden="true"></span><span class="cg-ln f" aria-hidden="true"></span>'
      + person('mother', '1 / 1') + person('father', '1 / 3') + person('sibling', '2 / 1')
      + '<div class="cg-you" style="grid-area:2 / 2">' + esc(F.you) + '</div>' + person('child', '3 / 2') + '</div>';
    if (famActive) {
      var r = A.family[famActive] || {};
      html += '<div class="cg-pick"><p class="cg-pick-q">' + esc(fill(F.what, F.whoName[famActive])) + '</p><div class="cg-opts is-small">'
        + Object.keys(F.cancers).map(function (k) { return '<button type="button" class="cg-opt" data-cancer="' + k + '" aria-pressed="' + (r.c === k) + '">' + esc(F.cancers[k]) + '</button>'; }).join('')
        + '</div><p class="cg-pick-q">' + esc(F.when) + '</p><div class="cg-opts is-small">'
        + Object.keys(F.ages).map(function (k) { return '<button type="button" class="cg-opt" data-fage="' + k + '" aria-pressed="' + (r.a === k) + '">' + esc(F.ages[k]) + '</button>'; }).join('')
        + '</div>' + (r.c ? '<button type="button" class="btn-quiet" data-remove>' + esc(F.remove) + '</button>' : '') + '</div>';
    }
    return html + '<div class="cg-opts is-small"><button type="button" class="cg-opt" data-none aria-pressed="' + famNone + '">' + esc(F.none) + '</button></div>';
  };

  var rowHtml = function (st) {
    var Q = C.q[st.id], ctl = '';
    if (st.type === 'choice') {
      ctl = '<div class="cg-opts is-small' + (st.opts.length > 3 ? ' is-many' : '') + '">' + st.opts.map(function (o) {
        return '<button type="button" class="cg-opt" data-opt="' + st.id + ':' + o + '" aria-pressed="' + (A[st.id] === o) + '">' + esc(optLabel(st.id, o)) + '</button>';
      }).join('') + '</div>';
    } else if (st.type === 'multi') {
      var t = A.tested || {};
      ctl = '<div class="cg-opts is-small">' + ['hcv', 'hiv'].map(function (o) {
        return '<button type="button" class="cg-opt" data-multi="' + o + '" aria-pressed="' + !!t[o] + '">' + esc(Q.opts[o]) + '</button>';
      }).join('') + '<button type="button" class="cg-opt" data-multi="none" aria-pressed="' + !!t.none + '">' + esc(Q.neither) + '</button></div>';
    } else if (st.type === 'family') {
      ctl = familyHtml();
    }
    return '<div class="cg-row' + (answered(st.id) ? ' is-answered' : '') + '" data-row="' + st.id + '">'
      + '<div class="cg-row-q"><h3 class="cg-row-title"><span class="cg-tick" aria-hidden="true"></span>' + esc(Q.q) + '</h3>'
      + (Q.hint ? '<p class="cg-hint">' + esc(Q.hint) + '</p>' : '')
      + '<details class="cg-why"><summary>' + esc(C.why) + '</summary><p>' + esc(Q.why) + '</p>' + (Q.source ? '<p class="cg-src">' + esc(Q.source) + '</p>' : '') + '</details></div>'
      + '<div class="cg-row-a">' + ctl + '<p class="cg-changed" data-changed="' + st.id + '" aria-live="polite"></p></div></div>';
  };

  var renderRefine = function () {
    var box = q('[data-refine]');
    if (!ready()) { box.hidden = true; box.innerHTML = ''; return; }
    var rs = rows(), done = rs.filter(function (s) { return answered(s.id); }).length, RF = C.refine;
    var parts = C.parts.map(function (title, i) {
      var mine = rs.filter(function (s) { return s.part === i; });
      return mine.length ? '<div class="cg-part"><p class="cg-label">' + esc(title) + '</p>' + mine.map(rowHtml).join('') + '</div>' : '';
    }).join('');
    box.hidden = false;
    box.innerHTML = '<div class="cg-refine-head"><div><h2 class="h-sub">' + esc(RF.title) + '</h2><p class="cg-refine-lead">' + esc(RF.lead) + '</p></div>'
      + '<div class="cg-meter"><p>' + esc(fill(RF.count, done, rs.length)) + '</p><span class="cg-meter-bar"><span style="width:' + Math.round(100 * done / Math.max(1, rs.length)) + '%"></span></span></div></div>'
      + parts;
  };

  // ---- The bar that keeps the result in view while answering further down -------------------
  var stageSeen = true;
  var renderSummary = function () {
    var bar = q('[data-summary]'), S = C.summary;
    if (!ready()) { bar.hidden = true; return; }
    var bits = [fill(S.due, count(['due']))];
    if (count(['ok', 'done'])) bits.push(fill(S.ok, count(['ok', 'done'])));
    if (count(['not'])) bits.push(fill(S.not, count(['not'])));
    var up = q('[data-scan]').getBoundingClientRect().top < 0;
    bar.innerHTML = '<p class="cg-summary-text">' + esc(bits.join(' · ')) + '</p><button type="button" class="cg-summary-go" data-to-scan>' + esc(S.see) + ' ' + (up ? '↑' : '↓') + '</button>';
    bar.hidden = stageSeen;
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { stageSeen = es[0].isIntersecting; renderSummary(); }, { threshold: 0.15 }).observe(q('[data-scan]'));
  }

  // ---- Cards --------------------------------------------------------------------------------
  var select = function (key, fromUser) {
    selected = key;
    qa('[data-pick]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-pick') === key ? 'true' : 'false'); });
    var card = q('[data-card]');
    if (!card || !key) return;
    var rs;
    if (key.indexOf('talk:') === 0) {
      var id = key.slice(5);
      rs = R.filter(function (r) { return r.it.id === id; });
    } else {
      var m = MARKS.filter(function (x) { return x.key === key; })[0];
      rs = m ? m.results : [];
    }
    if (!rs.length) return;
    card.innerHTML = rs.length === 1 ? single(rs[0]) : group(rs, MARKS.filter(function (x) { return x.key === key; })[0]);
    qa('.facts-blocks[data-dots]', card).forEach(drawBlocks);
    if (fromUser && q('[data-scan]').classList.contains('is-compact')) card.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };
  var chip = function (r) { return '<p class="cg-chip is-' + clsOf(r.status) + '"><span></span>' + esc(statusText(r)) + '</p>'; };
  var source = function (r) {
    var K = C.result.card;
    return '<p class="cg-card-src">' + esc(r.it.grade ? fill(K.grade, r.it.grade) : K.gradeNone) + ' · <a href="' + esc(r.it.url) + '"' + (r.it.ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(K.source) + '</a></p>';
  };
  var single = function (r) {
    var K = C.result.card, it = r.it;
    var specs = [];
    if (it.time) specs.push([K.time, it.time]);
    if (oftenText(r)) specs.push([K.often, oftenText(r)]);
    if (r.last) specs.push([K.last, r.last]);
    var il = it.illus && ILLUS[it.illus];
    return chip(r) + '<h3 class="cg-card-title">' + esc(it.label) + '</h3>' + (it.label !== it.name ? '<p class="cg-card-full">' + esc(it.name) + '</p>' : '')
      + (specs.length ? '<dl class="cg-specs">' + specs.map(function (s) { return '<div><dt>' + esc(s[0]) + '</dt><dd>' + esc(s[1]) + '</dd></div>'; }).join('') + '</dl>' : '')
      + (il ? '<figure class="cg-illus' + (r.status === 'not' ? ' is-grey' : '') + '"><img src="' + esc(il.src) + '" alt="' + esc(il.alt) + '" loading="lazy"><figcaption>' + esc(K.illusCredit) + '</figcaption></figure>' : '')
      + (it.what ? '<p class="cg-label">' + esc(K.what) + '</p><p class="cg-card-text">' + esc(it.what) + '</p>' : '')
      + '<p class="cg-label">' + esc(r.status === 'not' ? K.whyNot : K.guideline) + '</p><p class="cg-card-text">' + esc(it.how) + '</p>'
      + (r.notes.length ? '<div class="cg-foryou"><p class="cg-label">' + esc(K.forYou) + '</p>' + r.notes.map(function (n) { return '<p>' + esc(n) + '</p>'; }).join('') + '</div>' : '')
      + (it.facts && FACTS[it.facts] ? FACTS[it.facts] : '')
      + source(r);
  };
  var group = function (rs, m) {
    var K = C.result.card;
    return chip(rs[0]) + '<h3 class="cg-card-title">' + esc(m ? m.title : rs[0].it.name) + '</h3>'
      + (rs[0].it.time ? '<dl class="cg-specs"><div><dt>' + esc(K.time) + '</dt><dd>' + esc(rs[0].it.time) + '</dd></div></dl>' : '')
      + rs.map(function (r) {
        return '<div class="cg-sub"><h4>' + esc(r.it.name) + '</h4><p class="cg-sub-status is-' + clsOf(r.status) + '">' + esc(statusText(r)) + (oftenText(r) ? ' · ' + esc(oftenText(r)) : '') + '</p>'
          + '<p class="cg-card-text">' + esc(r.it.what || r.it.how) + '</p>' + source(r) + '</div>';
      }).join('');
  };

  // 1,000 people as ten squares of 100: one full square of false alarms reads as "100" at a glance.
  var drawBlocks = function (box) {
    var groups = JSON.parse(box.getAttribute('data-dots'));
    var order = [];
    ['harm', 'harm2', 'benefit'].forEach(function (k) { groups.forEach(function (g) { if (g[0] === k) for (var i = 0; i < g[1]; i++) order.push(k); }); });
    var html = '';
    for (var b = 0; b < 10; b++) {
      var dots = '';
      for (var j = 0; j < 100; j++) {
        var k = order[b * 100 + j];
        if (k) dots += '<i class="d-' + k + '" style="left:' + ((j % 10) * 10 + 1.8) + '%;top:' + (Math.floor(j / 10) * 10 + 1.8) + '%"></i>';
      }
      html += '<span class="facts-block">' + dots + '</span>';
    }
    box.innerHTML = html;
  };

  // ---- Your next ten years: a skyline of years, each check a named tile ------------------------
  // Checks any doctor does every year at home are a footnote, not tiles: they never decide a trip.
  var AT_HOME = { bp: 1, mood: 1, alcohol: 1 };
  var yearsHtml = function () {
    var Y = C.result.years, span = [], byYear = {};
    for (var y = YEAR; y <= YEAR + 10; y++) { span.push(y); byYear[y] = []; }
    var add = function (yr, r, kind) {
      if (byYear[yr]) byYear[yr].push({ name: (C.short && C.short[r.it.id]) || r.it.label, kind: yr === YEAR ? 'now' : kind, colon: r.it.id === 'crc' });
    };
    var home = [];
    R.forEach(function (r) {
      if (!(r.status === 'due' || r.status === 'ok' || r.status === 'later') || r.every == null) return;
      if (AT_HOME[r.it.id]) { if (home.indexOf(r.it.label) < 0) home.push(r.it.label); return; }
      var endYear = YEAR + ((r.hi || 120) - A.age);
      var first = r.status === 'due' ? YEAR : r.next;
      if (r.every === 0) { add(first, r, r.status === 'later' ? 'first' : 'again'); return; }
      for (var yr = first; yr <= endYear && yr <= YEAR + 10; yr += r.every) add(yr, r, r.status === 'later' && yr === first ? 'first' : 'again');
    });
    var plane = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M21 15.5v-1.6l-7.7-4.9V3.8a1.3 1.3 0 0 0-2.6 0V9L3 13.9v1.6l7.7-2.4v5.3l-2 1.5V21l3.3-1 3.3 1v-1.1l-2-1.5v-5.3z" fill="currentColor"></path></svg>';
    var cols = span.map(function (yr) {
      var items = byYear[yr], n = items.length;
      var trip = yr !== YEAR && (n >= 2 || items.some(function (x) { return x.colon; }));
      var cls = yr === YEAR ? ' is-now' : trip ? ' is-trip' : n ? '' : ' is-quiet';
      return '<li class="cg-sky-col' + cls + '">'
        + '<div class="cg-sky-stack">' + items.map(function (x, i) { return '<span class="cg-tile is-' + x.kind + '" style="animation-delay:' + (i * 0.06) + 's">' + esc(x.name) + '</span>'; }).join('') + '</div>'
        + '<div class="cg-sky-base">'
        + (trip ? '<span class="cg-sky-trip">' + plane + esc(Y.trip) + '</span>' : '')
        + '<span class="cg-sky-year">' + yr + '</span>'
        + '<span class="cg-sky-age">' + esc(yr === YEAR ? Y.thisTrip : fill(Y.age, A.age + (yr - YEAR))) + '</span>'
        + '<span class="cg-sky-n">' + esc(n === 0 ? Y.none : n === 1 ? Y.one : fill(Y.n, n)) + '</span>'
        + '</div></li>';
    }).join('');
    return '<section class="cg-years wrap" aria-labelledby="cg-years-title">'
      + '<div class="cg-years-head"><div><h2 id="cg-years-title" class="h-sub">' + esc(Y.title) + '</h2><p class="cg-years-lead">' + esc(Y.lead) + '</p></div>'
      + '<div class="cg-legend"><span><i class="cg-tile is-now"></i>' + esc(Y.now) + '</span><span><i class="cg-tile is-again"></i>' + esc(Y.again) + '</span><span><i class="cg-tile is-first"></i>' + esc(Y.first) + '</span></div></div>'
      + '<ol class="cg-sky">' + cols + '</ol>'
      + (home.length ? '<p class="cg-sky-home">' + esc(fill(Y.atHome, list(home))) + '</p>' : '')
      + '</section>';
  };

  // ---- The brief to print ---------------------------------------------------------------------
  var buildBrief = function () {
    var B = C.brief, box = q('[data-brief]');
    if (!R.length) { box.innerHTML = ''; return; }
    var by = function (s) { return R.filter(function (r) { return s.indexOf(r.status) >= 0; }); };
    var date = new Intl.DateTimeFormat(ZH ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
    var trs = by(['due']).map(function (r) { return '<tr><td>' + esc(r.it.name) + '</td><td>' + esc(oftenText(r)) + '</td><td>' + esc(r.last || '–') + '</td><td><span class="cg-box"></span></td></tr>'; }).join('');
    var li = function (rs, withStatus) { return rs.map(function (r) { return '<li><strong>' + esc(r.it.name) + '</strong>' + (withStatus ? ' · ' + esc(statusText(r)) : '') + '</li>'; }).join(''); };
    box.innerHTML = '<div class="cg-brief-page"><p class="cg-brief-mast"><span>' + esc(C.brand) + '</span><span>' + esc(fill(B.prepared, date)) + '</span></p>'
      + '<h2>' + esc(B.title) + '</h2><p class="cg-brief-for">' + esc(B.for) + '</p>'
      + '<h3>' + esc(B.about) + '</h3><dl class="cg-brief-about">' + notes().map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>'
      + (trs ? '<h3>' + esc(B.due) + '</h3><table class="cg-brief-table"><thead><tr>' + B.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + trs + '</tbody></table>' : '')
      + (by(['ok', 'done', 'later']).length ? '<h3>' + esc(B.ok) + '</h3><ul>' + li(by(['ok', 'done', 'later']), true) + '</ul>' : '')
      + (by(['talk']).length ? '<h3>' + esc(B.talk) + '</h3><ul>' + li(by(['talk'])) + '</ul>' : '')
      + (by(['not']).length ? '<div class="cg-brief-leave"><h3>' + esc(B.leave) + '</h3><p>' + esc(list(by(['not']).map(function (r) { return r.it.name; }))) + '</p></div>' : '')
      + '<p class="cg-brief-foot">' + esc(B.foot) + '</p></div>';
  };
  window.addEventListener('beforeprint', buildBrief);

  // ---- The scan: a body made of points, turning slowly ----------------------------------------
  var HALF = 'M200,134 L184,134 C183,150 182,164 178,178 C164,186 140,190 122,196 C108,201 100,216 99,236 C96,272 91,314 87,350 C83,388 77,432 73,472 C70,496 68,524 74,546 C78,558 90,560 94,548 C98,530 98,504 95,482 C97,446 102,406 108,368 C114,326 120,286 126,246 C127,242 128,240 130,238 C134,264 138,294 140,324 C142,348 141,364 139,376 C137,396 127,420 121,442 C117,458 116,472 117,486 C119,540 125,600 135,660 C138,676 140,690 139,704 C138,730 134,762 136,800 C139,840 145,880 149,906 C150,918 142,930 137,940 C134,948 145,953 159,953 C171,953 181,950 185,944 C187,934 185,924 183,912 C181,880 181,840 183,800 C185,762 184,730 185,704 C187,660 191,600 195,540 C197,516 199,502 200,494 Z';
  var HEAD = 'M200,44 C222,44 236,62 236,90 C236,113 225,132 212,139 C207,142 193,142 188,139 C175,132 164,113 164,90 C164,62 178,44 200,44 Z';
  var BODY = null, raf = 0, io = null, visible = true, onResize = null;
  var buildBody = function (dense) {
    var half = new Path2D(HALF), head = new Path2D(HEAD);
    var probe = document.createElement('canvas').getContext('2d');
    var inside = function (x, y) { return probe.isPointInPath(head, x, y) || probe.isPointInPath(half, x <= 200 ? x : 400 - x, y); };
    var seed = 7;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var stepY = dense ? 3.2 : 4.4, pts = [];
    for (var y = 40; y <= 956; y += stepY) {
      var runs = [], a = null;
      for (var x = 40; x < 200; x += 0.5) { var on = inside(x, y); if (on && a === null) a = x; if (!on && a !== null) { runs.push([a, x]); a = null; } }
      if (a !== null) runs.push([a, 200]);
      runs.forEach(function (run) {
        var lo = run[0], hi = run[1], torso = hi >= 199.5;
        var c = torso ? 200 : (lo + hi) / 2, r = torso ? 200 - lo : (hi - lo) / 2;
        var k = y < 145 ? 0.92 : torso ? 0.58 : 1;
        var n = Math.max(2, Math.round((hi - lo) / stepY));
        for (var i = 0; i < n; i++) {
          var px = lo + (hi - lo) * (i + rnd()) / n, py = y + (rnd() - 0.5) * stepY * 0.75;
          var z = k * Math.sqrt(Math.max(0, r * r - (px - c) * (px - c)));
          pts.push(px, py, z, px, py, -z, 400 - px, py, z, 400 - px, py, -z);
        }
      });
    }
    return new Float32Array(pts);
  };
  var clusters = function () {
    var seed = 11;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    return MARKS.map(function (m) {
      var b = SPOTS[m.spot].blob, pts = [], n = Math.max(30, Math.round(b[3] * b[4] * 0.55));
      var add = function (cx) {
        for (var i = 0; i < n; i++) {
          var t = rnd() * Math.PI * 2, u = Math.acos(2 * rnd() - 1), s = Math.cbrt(rnd());
          pts.push(cx + b[3] * s * Math.sin(u) * Math.cos(t), b[1] + b[4] * s * Math.sin(u) * Math.sin(t), b[2] + b[5] * s * Math.cos(u));
        }
      };
      add(b[0]);
      if (SPOTS[m.spot].pair) add(400 - b[0]);
      return { key: m.key, cls: m.cls, pts: pts };
    });
  };
  var stopScan = function () {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (io) { io.disconnect(); io = null; }
    if (onResize) { window.removeEventListener('resize', onResize); onResize = null; }
  };
  var startScan = function () {
    stopScan();
    var scan = q('[data-scan]'), cv = q('canvas', scan);
    if (!cv || !window.Path2D) return;
    var dense = window.innerWidth >= 900;
    if (!BODY || BODY.dense !== dense) { BODY = { pts: buildBody(dense), dense: dense }; }
    var CL = clusters();
    var COL = { due: '169,214,189', ok: '150,180,165', later: '150,180,165', not: '150,150,145' };
    var ALPHA = { due: 0.85, ok: 0.55, later: 0.42, not: 0.3 };
    var w = 0, h = 0, ctx = null, compact = scan.clientWidth < 760;
    scan.classList.toggle('is-compact', compact);
    onResize = function () { var c2 = scan.clientWidth < 760; if (c2 !== compact) { compact = c2; scan.classList.toggle('is-compact', compact); } };
    window.addEventListener('resize', onResize);
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; });
      io.observe(scan);
    }
    var frame = function (t) {
      raf = requestAnimationFrame(frame);
      if (!visible && ctx) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.clientWidth !== w || cv.clientHeight !== h) {
        w = cv.clientWidth; h = cv.clientHeight;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        ctx = cv.getContext('2d');
      }
      if (!w || !h) return;
      var LW = compact ? 560 : 1200, LH = 1000, OX = LW / 2, OY = 30, S = 0.96;
      var k = (w / LW) * dpr;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, LW, LH);
      var th = still ? 0.28 : 0.4 * Math.sin(t / 4600), c = Math.cos(th), s = Math.sin(th);
      var proj = function (x, y, z) {
        var X = (x - 200) * c + z * s, Z = -(x - 200) * s + z * c, p = 1400 / (1400 - Z);
        return [OX + X * S * p, OY + (500 + (y - 500) * p) * S, Z];
      };
      var scanY = still ? -999 : ((t / 22) % 1300) - 150;
      if (!still) { ctx.fillStyle = 'rgba(169,214,189,.16)'; ctx.fillRect(OX - 175, OY + scanY * S - 0.5, 350, 1); }
      var P = BODY.pts;
      for (var i = 0; i < P.length; i += 3) {
        var pr = proj(P[i], P[i + 1], P[i + 2]);
        var glow = Math.max(0, 1 - Math.abs(P[i + 1] - scanY) / 14);
        var a = 0.1 + 0.42 * Math.min(1, Math.max(0, (pr[2] + 60) / 120)) + 0.45 * glow;
        ctx.fillStyle = 'rgba(232,229,222,' + a.toFixed(3) + ')';
        ctx.fillRect(pr[0] - 0.6, pr[1] - 0.6, 1.2, 1.2);
      }
      CL.forEach(function (cl) {
        var on = cl.key === selected, pulse = still ? 1 : 0.8 + 0.2 * Math.sin(t / 500);
        ctx.fillStyle = 'rgba(' + (on ? '214,236,222' : COL[cl.cls]) + ',' + (on ? pulse : ALPHA[cl.cls]) + ')';
        var size = on ? 2.4 : 2;
        for (var j = 0; j < cl.pts.length; j += 3) {
          var p = proj(cl.pts[j], cl.pts[j + 1], cl.pts[j + 2]);
          ctx.fillRect(p[0] - size / 2, p[1] - size / 2, size, size);
        }
      });
      if (compact) return;
      // Leader lines from each label to its place on the turning body.
      qa('.cg-lbl', scan).forEach(function (b) {
        var m = MARKS.filter(function (x) { return x.key === b.getAttribute('data-pick'); })[0];
        if (!m) return;
        var at = SPOTS[m.spot].at, p = proj(at[0], at[1], at[2]);
        var ly = parseFloat(b.style.top) * 10, left = b.classList.contains('is-left');
        var x0 = left ? 372 : 828, x1 = left ? 396 : 804, on = m.key === selected;
        ctx.beginPath();
        ctx.setLineDash(m.cls === 'not' || m.cls === 'later' ? [3, 4] : []);
        ctx.strokeStyle = on ? 'rgba(243,242,238,.95)' : m.cls === 'not' ? 'rgba(150,150,145,.45)' : 'rgba(232,229,222,.42)';
        ctx.lineWidth = on ? 1.2 : 0.8;
        ctx.moveTo(x0, ly); ctx.lineTo(x1, ly); ctx.lineTo(p[0], p[1]); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(p[0], p[1], on ? 3.2 : 2.3, 0, Math.PI * 2); ctx.fill();
      });
    };
    raf = requestAnimationFrame(frame);
  };

  // ---- The two answers that start everything --------------------------------------------------
  var ageBox = q('#cg-age'), ageErr = q('#cg-age-err');
  var setAge = function (n, quiet) {
    var ok = n >= 18 && n <= 100;
    ageErr.textContent = ok || quiet ? '' : C.q.age.error;
    if (!ok) return;
    if (A.age === n) return;
    A.age = n;
    renderAll(null);
  };
  ageBox.addEventListener('input', function () { setAge(parseInt(ageBox.value, 10), true); });
  ageBox.addEventListener('change', function () { if (ageBox.value) setAge(parseInt(ageBox.value, 10), false); });
  ageBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); setAge(parseInt(ageBox.value, 10), false); } });

  // ---- Events ---------------------------------------------------------------------------------
  var refocus = function (selector) { var el = selector && q(selector); if (el) el.focus({ preventScroll: true }); };
  root.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t || !root.contains(t)) return;
    if (t.hasAttribute('data-age-step')) {
      var base = parseInt(ageBox.value, 10);
      var n = base >= 18 && base <= 100 ? base + Number(t.getAttribute('data-age-step')) : 50;
      n = Math.max(18, Math.min(100, n));
      ageBox.value = n;
      setAge(n, false);
    } else if (t.hasAttribute('data-sex')) {
      A.sex = t.getAttribute('data-sex');
      qa('[data-sex]').forEach(function (b) { b.setAttribute('aria-pressed', b === t ? 'true' : 'false'); });
      if (!(A.age >= 18)) { ageErr.textContent = ageBox.value ? C.q.age.error : ''; ageBox.focus(); }
      renderAll(null);
    } else if (t.hasAttribute('data-opt')) {
      var kv = t.getAttribute('data-opt').split(':');
      A[kv[0]] = A[kv[0]] === kv[1] ? undefined : kv[1];
      renderAll(kv[0]);
      refocus('[data-opt="' + kv[0] + ':' + kv[1] + '"]');
    } else if (t.hasAttribute('data-multi')) {
      var k = t.getAttribute('data-multi'), m = A.tested || {};
      if (k === 'none') m = { none: !m.none };
      else { m[k] = !m[k]; m.none = false; }
      A.tested = (m.none || m.hcv || m.hiv) ? m : undefined;
      renderAll('tested');
      refocus('[data-multi="' + k + '"]');
    } else if (t.hasAttribute('data-person')) {
      var who = t.getAttribute('data-person');
      famActive = famActive === who ? null : who;
      renderRefine();
      refocus('[data-person="' + who + '"]');
    } else if (t.hasAttribute('data-cancer')) {
      var c = t.getAttribute('data-cancer');
      A.family[famActive] = Object.assign({}, A.family[famActive], { c: c });
      famNone = false;
      renderAll('family');
      refocus('[data-cancer="' + c + '"]');
    } else if (t.hasAttribute('data-fage')) {
      var g = t.getAttribute('data-fage');
      A.family[famActive] = Object.assign({}, A.family[famActive], { a: g });
      renderAll('family');
      refocus('[data-fage="' + g + '"]');
    } else if (t.hasAttribute('data-remove')) {
      var p = famActive;
      delete A.family[famActive];
      famActive = null;
      renderAll('family');
      refocus('[data-person="' + p + '"]');
    } else if (t.hasAttribute('data-none')) {
      famNone = !famNone;
      if (famNone) { A.family = {}; famActive = null; }
      renderAll('family');
      refocus('[data-none]');
    } else if (t.hasAttribute('data-pick')) {
      select(t.getAttribute('data-pick'), true);
    } else if (t.hasAttribute('data-to-scan')) {
      q('[data-scan]').scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    } else if (t.hasAttribute('data-restart')) {
      A = { family: {} }; famActive = null; famNone = false; selected = null;
      ageBox.value = '';
      qa('[data-sex]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      renderAll(null);
      root.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      ageBox.focus({ preventScroll: true });
    } else if (t.hasAttribute('data-print-brief')) {
      buildBrief();
      window.print();
    }
  });
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking || q('[data-summary]').hidden) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; renderSummary(); });
  }, { passive: true });

  root.classList.add('is-live');
  renderAll(null);
})();
