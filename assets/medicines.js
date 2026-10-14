/* Medicine checker ("Can I bring my medicine?"). Everything runs on this page: nothing the visitor enters
   is stored or sent. Rules and words come from the page config (src/data/medicines.mjs). */
(function () {
  'use strict';
  var root = document.querySelector('[data-medcheck]');
  if (!root) return;
  var CFG = JSON.parse(root.getAttribute('data-config'));
  var L = CFG.lang, C = CFG.copy, S1 = C.s1, S2 = C.s2, V = C.v, S3 = C.s3, K = C.card;
  var ZH = L === 'zh';
  var DAY = 86400000;
  var KEY = { japan: 'jp', korea: 'kr', china: 'cn' };
  var ORDER = ['japan', 'korea', 'china'];
  var CARD_TITLE = { ja: '個人で使用する医薬品です', ko: '개인적으로 사용하는 의약품입니다', zh: '这些是我个人使用的药品' };
  var LANG_NAME = { ja: '日本語 Japanese', ko: '한국어 Korean', zh: '中文 Chinese' };

  var $ = function (s, r) { return (r || root).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fill = function (t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return o[k] != null ? o[k] : m; }); };

  var MEDS = {};
  CFG.meds.forEach(function (m) { MEDS[m.id] = m; });
  var HOL = {};
  CFG.holidays.forEach(function (d) { HOL[d] = 1; });

  // State: the trip, the medicines, and the visitor's progress. Kept in memory only.
  var st = { stops: [], undecided: false, layover: false, layoverIn: '', meds: [], unsure: [], unknown: [], office: 'tokyo', status: {}, papers: {}, cardLang: '' };

  // Dates ------------------------------------------------------------------------
  var parse = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(s + 'T00:00:00Z') : null; };
  var iso = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
  var WD = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], zh: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] };
  var MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var fmtDate = function (ms) {
    var d = new Date(ms);
    if (ZH) return d.getUTCFullYear() + ' 年 ' + (d.getUTCMonth() + 1) + ' 月 ' + d.getUTCDate() + ' 日（' + WD.zh[d.getUTCDay()] + '）';
    return WD.en[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MO[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  };
  var arrivals = function () {
    var out = [], prev = null;
    st.stops.forEach(function (s) {
      var a = st.undecided ? null : (parse(s.date) != null ? parse(s.date) : (prev && prev.at != null ? prev.at + prev.days * DAY : null));
      var row = { c: s.c, at: a, days: s.days };
      out.push(row); prev = row;
    });
    return out;
  };
  var arrivalIn = function (c) { var a = arrivals().filter(function (x) { return x.c === c; })[0]; return a ? a.at : null; };
  var daysIn = function (c) { return st.stops.filter(function (s) { return s.c === c; }).reduce(function (n, s) { return n + s.days; }, 0); };
  var tripDays = function () { return st.stops.reduce(function (n, s) { return n + s.days; }, 0) || 14; };
  var countries = function () { var seen = {}; return st.stops.map(function (s) { return s.c; }).filter(function (c) { return seen[c] ? false : (seen[c] = true); }); };
  var jpDeadline = function () { var a = arrivalIn('japan'); return a == null ? null : a - 14 * DAY; };
  // Korea: 10 working days before arrival, skipping weekends and Korean public holidays (KASI calendar).
  var krDeadline = function () {
    var a = arrivalIn('korea');
    if (a == null) return { ms: null };
    var d = a, n = 0;
    while (n < 10) {
      d -= DAY;
      var y = new Date(d).getUTCFullYear();
      if (CFG.holidayYears.indexOf(y) < 0) return { ms: null, later: true };
      var wd = new Date(d).getUTCDay();
      if (wd !== 0 && wd !== 6 && !HOL[iso(d)]) n++;
    }
    return { ms: d };
  };

  // Medicine names and matching -----------------------------------------------------
  var nameOf = function (m) { return ZH ? m.generic.zh + '（' + m.brand + '）' : m.brand; };
  var subOf = function (m) { return (m.flag ? m.flag[L] + ' · ' : '') + (ZH ? m.generic.en : m.generic.en); };
  var norm = function (s) { return String(s || '').toLowerCase().replace(/[\s\-.,#]/g, ''); };
  var dist = function (a, b) {
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  };
  var score = function (q, name) {
    var n = norm(name);
    if (n === q) return 0;
    if (n.indexOf(q) === 0) return 0.5;
    if (n.indexOf(q) > 0) return 1;
    if (q.length < 3) return 99;
    var d = Math.min(dist(q, n), dist(q, n.slice(0, q.length)) + 0.5);
    return d <= Math.max(1, Math.floor(q.length / 3)) ? 1 + d : 99;
  };
  var search = function (text) {
    var q = norm(text);
    if (!q) return [];
    var have = st.meds.map(function (e) { return e.id; });
    return CFG.meds.filter(function (m) { return have.indexOf(m.id) < 0; })
      .map(function (m) { return { m: m, s: Math.min.apply(null, m.names.map(function (nm) { return score(q, nm); }).concat([score(q, m.generic.zh)])) }; })
      .filter(function (x) { return x.s < 99; })
      .sort(function (a, b) { return a.s - b.s; })
      .slice(0, 4);
  };

  // Answers ------------------------------------------------------------------------------
  var fmtMg = function (n) {
    var x = Math.round(n * 100) / 100;
    if (x >= 1000) return (Math.round(x / 10) / 100) + (ZH ? ' 克' : ' g');
    return x + (ZH ? ' 毫克' : ' mg');
  };
  var kindOf = function (m, c) { return m[KEY[c]]; };
  var answer = function (e, c) {
    var m = MEDS[e.id], kind = kindOf(m, c), label = CFG.rules[c][kind].label, text = '';
    var dl;
    if (c === 'japan') {
      var month = function (word, limit) {
        if (e.days <= limit - 3) return { label: 'limit', text: fill(V.monthOk, { d: e.days, w: word }) };
        if (e.days <= limit + 1) return { label: 'check', text: fill(V.monthNear, { d: e.days, w: word }) };
        return { label: 'paper', text: fill(V.monthOver, { w: word }), over: true };
      };
      if (kind === 'psych') {
        var total = e.mg * e.tablets;
        return total <= m.jpLimit
          ? { label: 'limit', text: fill(V.psychOk, { t: fmtMg(total), g: m.generic[L], l: fmtMg(m.jpLimit) }) }
          : { label: 'paper', text: fill(V.psychOver, { t: fmtMg(total), g: m.generic[L], l: fmtMg(m.jpLimit) }), over: true };
      }
      if (kind === 'rx' || kind === 'inj') return month(V.oneMonth, 31);
      if (kind === 'otc') return month(V.twoMonths, 62);
      dl = jpDeadline();
      if (kind === 'narc' || kind === 'srm') text = dl != null ? fill(V.jpPermit, { date: fmtDate(dl) }) : V.jpPermitNoDate;
      else if (kind === 'codeine') text = dl != null ? fill(V.jpCodeine, { date: fmtDate(dl) }) : V.jpCodeineNoDate;
      else if (kind === 'pse') text = dl != null ? fill(V.jpPse, { date: fmtDate(dl) }) : V.jpPseNoDate;
      else if (kind === 'banned') text = V.jpBanned;
      else if (kind === 'thc') text = V.jpThc;
    } else if (c === 'korea') {
      if (kind === 'ok') text = MEDS[e.id].jpLimit ? V.krOk : fill(V.krOkDays, { d: e.days });
      else if (kind === 'permit') { dl = krDeadline(); text = dl.ms != null ? fill(V.krPermit, { date: fmtDate(dl.ms) }) : V.krPermitNoDate; }
      else if (kind === 'cbd') text = V.krCbd;
    } else {
      text = { ordinary: V.cnOrdinary, cat2: V.cnCat2, cat1: V.cnCat1, narc: V.cnNarc, unlisted: V.cnUnlisted, cbd: V.cnCbd }[kind];
    }
    return { label: label, text: text };
  };
  var answersFor = function (e) {
    var out = countries().map(function (c) { var a = answer(e, c); a.country = CFG.countries[c].name; return a; });
    if (st.layover && st.layoverIn === 'korea' && countries().indexOf('korea') < 0 && kindOf(MEDS[e.id], 'korea') === 'cbd') {
      out.push({ country: fill(V.layover, { x: CFG.countries.korea.name }), label: 'no', text: V.krCbd });
    }
    return out;
  };
  var pill = function (label) { return '<span class="mc-pill is-' + label + '">' + CFG.icons[label] + '<span>' + esc(CFG.labels[label]) + '</span></span>'; };

  // Tasks for the plan ------------------------------------------------------------------
  var tasks = function () {
    var out = [];
    var add = function (t) { if (!out.some(function (x) { return x.id === t.id; })) out.push(t); };
    var cs = countries();
    st.meds.forEach(function (e) {
      var m = MEDS[e.id], name = nameOf(m), leave = [];
      cs.forEach(function (c) {
        var kind = kindOf(m, c), a = answer(e, c);
        if (c === 'japan') {
          if (kind === 'narc' || kind === 'srm' || kind === 'codeine') add({ id: 'jp-permit-' + e.id, type: 'jpPermit', date: jpDeadline(), med: m, title: fill(S3.jpTask, { x: name }) });
          if (kind === 'pse') add({ id: 'jp-decide-' + e.id, type: 'decide', date: jpDeadline(), med: m, title: fill(S3.decideTask, { x: name }) });
          if (kind === 'banned') leave.push(S3.leaveWhy.banned);
          if (kind === 'thc') leave.push(S3.leaveWhy.thc);
          if (kind === 'psych' && a.over) add({ id: 'jp-cert-' + e.id, type: 'cert', date: null, med: m, title: fill(S3.certTask, { x: name }), why: S3.certWhy.jp });
          if ((kind === 'rx' || kind === 'inj' || kind === 'otc') && a.over) add({ id: 'jp-import-' + e.id, type: 'import', date: null, med: m, title: fill(S3.importTask, { x: name }), why: S3.importWhy });
        }
        if (c === 'korea') {
          if (kind === 'permit') { var k = krDeadline(); add({ id: 'kr-permit-' + e.id, type: 'krPermit', date: k.ms, later: k.later, med: m, entry: e, title: fill(S3.krTask, { x: name }) }); }
          if (kind === 'cbd') leave.push(S3.leaveWhy.krcbd);
        }
        if (c === 'china') {
          if (kind === 'cat1' || kind === 'narc') add({ id: 'cn-cert-' + e.id, type: 'cert', date: null, med: m, title: fill(S3.certTask, { x: name }), why: S3.certWhy.cn });
          if (kind === 'unlisted') add({ id: 'cn-ask-' + e.id, type: 'cnAsk', date: null, med: m, title: fill(S3.cnUnlistedTask, { x: name }), why: S3.cnUnlistedWhy });
          if (kind === 'cbd') leave.push(S3.leaveWhy.cncbd);
        }
      });
      if (st.layover && st.layoverIn === 'korea' && cs.indexOf('korea') < 0 && kindOf(m, 'korea') === 'cbd') leave.push(S3.leaveWhy.krcbd);
      if (leave.length) add({ id: 'leave-' + e.id, type: 'leave', date: null, med: m, title: fill(S3.leaveTask, { x: name }), why: leave.join(' ') });
    });
    st.unsure.forEach(function (n, i) { add({ id: 'unsure-' + i, type: 'unsure', date: null, title: fill(S3.unsureTask, { x: n }), why: S3.unsureWhy }); });
    st.unknown.forEach(function (n, i) { add({ id: 'unknown-' + i, type: 'unknown', date: null, title: fill(S3.unknownTask, { x: n }), why: S3.unknownWhy }); });
    return out.sort(function (a, b) {
      if (a.date != null && b.date != null) return a.date - b.date;
      if (a.date != null) return -1;
      if (b.date != null) return 1;
      return 0;
    });
  };
  var leaving = function (id) { return tasks().some(function (t) { return t.type === 'leave' && t.med && t.med.id === id; }); };
  var STEPS = { jpPermit: ['none', 'sent', 'got'], krPermit: ['none', 'sent', 'got'], decide: ['none', 'asked', 'answer', 'leave'], cnAsk: ['none', 'asked', 'answer'], unknown: ['none', 'asked', 'answer'], leave: ['none', 'done'], cert: ['none', 'done'], import: ['none', 'sent', 'got'], unsure: ['none', 'done'] };

  // Rendering -------------------------------------------------------------------------------
  var renderCountries = function () {
    var have = countries();
    $('[data-countries]').innerHTML = ORDER.map(function (c) {
      var on = have.indexOf(c) >= 0;
      return '<button type="button" class="mc-chip mc-country-chip" data-action="country" data-c="' + c + '" data-focus="country-' + c + '" aria-pressed="' + on + '">' + esc(CFG.countries[c].name) + '</button>';
    }).join('');
  };
  var renderStops = function () {
    var arr = arrivals();
    $('[data-pick]').hidden = st.stops.length > 0;
    var ud = $('[data-action="undecided"]');
    ud.textContent = st.undecided ? S1.addDates : S1.undecided;
    ud.setAttribute('aria-pressed', String(st.undecided));
    $('[data-undecided-note]').hidden = !st.undecided;
    $('[data-stops]').innerHTML = st.stops.map(function (s, i) {
      var n = CFG.countries[s.c].name, a = arr[i];
      var dateVal = s.date || (a.at != null ? iso(a.at) : '');
      return '<li class="mc-stop"><div class="mc-stop-head"><p><span class="mc-stop-num">' + (i + 1) + '</span><span class="mc-strong">' + esc(n) + '</span></p><span class="mc-stop-tools">' +
        '<button type="button" class="mc-icon-btn" data-action="up" data-i="' + i + '" data-focus="up-' + i + '" aria-label="' + esc(fill(S1.up, { x: n })) + '"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="mc-icon-btn" data-action="down" data-i="' + i + '" data-focus="down-' + i + '" aria-label="' + esc(fill(S1.down, { x: n })) + '"' + (i === st.stops.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button type="button" class="mc-icon-btn" data-action="remove-stop" data-i="' + i + '" aria-label="' + esc(fill(S1.remove, { x: n })) + '">×</button></span></div>' +
        (st.undecided ? '' : '<div class="mc-stop-fields"><label class="mc-field">' + esc(S1.arrive) + '<input type="date" data-date="' + i + '" data-focus="date-' + i + '" value="' + dateVal + '"></label>' +
        '<div class="mc-field"><span>' + esc(S1.days) + '</span><span class="mc-stepper"><button type="button" class="mc-step-btn" data-action="days" data-i="' + i + '" data-by="-1" data-focus="dless-' + i + '" aria-label="' + esc(fill(S1.less, { x: n })) + '">−</button>' +
        '<input type="number" min="1" max="180" inputmode="numeric" data-days="' + i + '" data-focus="days-' + i + '" value="' + s.days + '" aria-label="' + esc(S1.days + ': ' + n) + '">' +
        '<button type="button" class="mc-step-btn" data-action="days" data-i="' + i + '" data-by="1" data-focus="dmore-' + i + '" aria-label="' + esc(fill(S1.more, { x: n })) + '">+</button></span></div></div>' +
        (a.at != null ? '<p class="mc-note">' + esc(fmtDate(a.at)) + ' – ' + esc(fmtDate(a.at + s.days * DAY)) + '</p>' : '')) + '</li>';
    }).join('');
    var lay = $('[data-layover]');
    lay.innerHTML = '<button type="button" class="mc-toggle" data-action="layover" data-focus="layover" aria-pressed="' + st.layover + '"><span>' + esc(S1.layover) + '</span><span class="mc-box" aria-hidden="true">' + (st.layover ? '✓' : '') + '</span></button>' +
      (st.layover ? '<p class="mc-note">' + esc(S1.layoverNote) + '</p><div class="mc-chips" role="group" aria-label="' + esc(S1.layover) + '">' + ORDER.map(function (c) {
        return '<button type="button" class="mc-chip" data-action="layover-in" data-c="' + c + '" data-focus="lay-' + c + '" aria-pressed="' + (st.layoverIn === c) + '">' + esc(CFG.countries[c].name) + '</button>';
      }).join('') + '</div>' : '');
  };
  var renderMeds = function () {
    var list = $('[data-meds]');
    if (!st.meds.length && !st.unsure.length && !st.unknown.length) { list.innerHTML = '<li class="mc-empty">' + esc(S2.empty) + '</li>'; return; }
    var rows = st.meds.map(function (e, i) {
      var m = MEDS[e.id];
      var amount = '';
      if (m.jp === 'psych' && m.mgs) {
        amount = '<div class="mc-amount"><p class="mc-strong">' + esc(S2.tablets) + '</p><div class="mc-chips">' + m.mgs.map(function (mg) {
          return '<button type="button" class="mc-chip" data-action="mg" data-i="' + i + '" data-mg="' + mg + '" data-focus="mg-' + i + '-' + mg + '" aria-pressed="' + (e.mg === mg) + '">' + esc(fill(S2.strength, { x: mg })) + '</button>';
        }).join('') + '</div><span class="mc-stepper"><button type="button" class="mc-step-btn" data-action="tabs" data-i="' + i + '" data-by="-1" data-focus="tless-' + i + '" aria-label="' + esc(S2.fewer) + '">−</button>' +
          '<input type="number" min="1" max="999" inputmode="numeric" data-tabs="' + i + '" data-focus="tabs-' + i + '" value="' + e.tablets + '" aria-label="' + esc(S2.tablets) + '">' +
          '<button type="button" class="mc-step-btn" data-action="tabs" data-i="' + i + '" data-by="1" data-focus="tmore-' + i + '" aria-label="' + esc(S2.more) + '">+</button></span>' +
          '<p class="mc-note' + (e.touched ? '' : ' is-ask') + '">' + esc(fill(S2.tabletsHelp, { x: tripDays() })) + '</p></div>';
      } else if (['banned', 'thc'].indexOf(m.jp) < 0) {
        amount = '<div class="mc-amount mc-amount-row"><p class="mc-strong">' + esc(S2.days) + '</p><span class="mc-stepper"><button type="button" class="mc-step-btn" data-action="mdays" data-i="' + i + '" data-by="-1" data-focus="mdless-' + i + '" aria-label="' + esc(S2.fewer) + '">−</button>' +
          '<input type="number" min="1" max="365" inputmode="numeric" data-mdays="' + i + '" data-focus="mdays-' + i + '" value="' + e.days + '" aria-label="' + esc(S2.days) + '">' +
          '<button type="button" class="mc-step-btn" data-action="mdays" data-i="' + i + '" data-by="1" data-focus="mdmore-' + i + '" aria-label="' + esc(S2.more) + '">+</button></span></div>';
      }
      var ans = countries().length ? answersFor(e).map(function (a) {
        return '<li><p class="mc-strong">' + esc(a.country) + '</p>' + pill(a.label) + '<p>' + esc(a.text) + '</p></li>';
      }).join('') : '';
      return '<li class="mc-med"><div class="mc-med-head"><div><p class="mc-med-name">' + esc(nameOf(m)) + '</p><p class="mc-note">' + esc(subOf(m)) + '</p></div>' +
        '<button type="button" class="mc-icon-btn" data-action="remove-med" data-i="' + i + '" aria-label="' + esc(fill(S2.remove, { x: nameOf(m) })) + '">×</button></div>' + amount +
        (ans ? '<ul class="mc-answers">' + ans + '</ul>' : '') + '</li>';
    });
    st.unsure.forEach(function (n, i) {
      rows.push('<li class="mc-med"><div class="mc-med-head"><div><p class="mc-med-name">' + esc(fill(S2.unsureName, { x: n })) + '</p><p class="mc-note">' + esc(S2.unsureSub) + '</p></div><button type="button" class="mc-icon-btn" data-action="remove-unsure" data-i="' + i + '" aria-label="' + esc(fill(S2.remove, { x: n })) + '">×</button></div><ul class="mc-answers"><li><p class="mc-strong">' + esc(V.both) + '</p>' + pill('check') + '<p>' + esc(V.unsure) + '</p></li></ul></li>');
    });
    st.unknown.forEach(function (n, i) {
      rows.push('<li class="mc-med"><div class="mc-med-head"><div><p class="mc-med-name">' + esc(n) + '</p><p class="mc-note">' + esc(S2.unknownSub) + '</p></div><button type="button" class="mc-icon-btn" data-action="remove-unknown" data-i="' + i + '" aria-label="' + esc(fill(S2.remove, { x: n })) + '">×</button></div><ul class="mc-answers"><li><p class="mc-strong">' + esc(V.both) + '</p>' + pill('unchecked') + '<p>' + esc(V.unknown) + '</p></li></ul></li>');
    });
    list.innerHTML = rows.join('');
    var count = st.meds.length + st.unsure.length + st.unknown.length;
    $('[data-next-plan]').textContent = count === 1 ? S2.next1 : fill(S2.nextN, { x: count });
  };

  var dateBlock = function (ms) {
    var d = new Date(ms);
    return '<div class="mc-date" aria-hidden="true"><span>' + esc(S3.by_) + ' ' + (ZH ? '' : WD.en[d.getUTCDay()]) + '</span><strong>' + d.getUTCDate() + '</strong><span>' + (ZH ? (d.getUTCMonth() + 1) + ' 月' : MO[d.getUTCMonth()]) + '</span></div>';
  };
  var officeChips = function () {
    return '<div class="mc-chips" role="group" aria-label="' + esc(S3.airport) + '">' + CFG.offices.map(function (o) {
      return '<button type="button" class="mc-chip" data-action="office" data-o="' + o.id + '" data-focus="office-' + o.id + '" aria-pressed="' + (st.office === o.id) + '">' + esc(o.name) + '</button>';
    }).join('') + '</div>';
  };
  var office = function () { return CFG.offices.filter(function (o) { return o.id === st.office; })[0]; };
  var statusBlock = function (t) {
    var cur = st.status[t.id] || 'none';
    return '<p class="mc-strong mc-where">' + esc(S3.where) + '</p><div class="mc-chips" role="group" aria-label="' + esc(S3.where + ': ' + t.title) + '">' + STEPS[t.type].map(function (k) {
      return '<button type="button" class="mc-chip" data-action="status" data-t="' + esc(t.id) + '" data-s="' + k + '" data-focus="st-' + esc(t.id) + '-' + k + '" aria-pressed="' + (cur === k) + '">' + esc(S3.st[k]) + '</button>';
    }).join('') + '</div><p class="mc-note">' + esc(S3.stNote[cur]) + '</p>';
  };
  var askList = function () {
    return '<ul class="mc-list">' + countries().map(function (c) {
      return '<li>' + esc(fill(S3.askWho[c], { x: c === 'japan' ? office().mhlw + ' (' + office().name + ')' : '' })) + '</li>';
    }).join('') + '</ul>';
  };
  var taskHtml = function (t) {
    var body = '', extra = '';
    var arriveFmt = function (c) { var a = arrivalIn(c); return a == null ? '' : fmtDate(a); };
    if (t.type === 'krPermit') {
      body = t.date != null ? fill(S3.krWhen, { date: fmtDate(t.date), arrive: arriveFmt('korea') }) : (t.later ? S3.krWhenLater : S3.krWhenNoDate);
      var unit = t.med.jpLimit ? (ZH ? '药片' : 'tablets') : (ZH ? '药' : 'medicine');
      extra = '<p>' + esc(fill(S3.krAsk, { x: unit, d: daysIn('korea') })) + '</p><details class="mc-details"><summary>' + esc(S3.krSend) + '</summary><ol>' + S3.krItems.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol><p class="mc-note">' + esc(S3.krSource) + '</p></details><p class="mc-strong">' + esc(S3.krHow) + '</p>';
    } else if (t.type === 'jpPermit') {
      body = t.date != null ? fill(S3.jpWhen, { date: fmtDate(t.date), arrive: arriveFmt('japan') }) : S3.jpWhenNoDate;
      extra = '<details class="mc-details"><summary>' + esc(S3.jpSend) + '</summary><ol>' + S3.jpItems.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></details><p class="mc-strong">' + esc(S3.airport) + '</p>' + officeChips() + '<p>' + esc(fill(S3.writeTo, { x: office().ncd })) + '</p>' + gwNote();
    } else if (t.type === 'decide') {
      body = S3.decideWhy;
      extra = '<p class="mc-strong">' + esc(S3.decideChoices) + '</p><ol class="mc-list"><li>' + esc(fill(S3.decide1, { x: nameOf(t.med) })) + '</li><li>' + esc(S3.decide2) + '</li></ol><p class="mc-strong">' + esc(S3.airport) + '</p>' + officeChips() + '<p>' + esc(fill(S3.decideWrite, { x: office().ncd })) + '</p>' + gwNote();
    } else if (t.type === 'unknown' || t.type === 'cnAsk') {
      body = t.why;
      extra = askList() + '<p>' + esc(S3.unknownAsk) + '</p>';
    } else {
      body = t.why;
    }
    return '<article class="mc-task' + (t.date != null ? ' is-dated' : '') + ' is-' + t.type + '"><div class="mc-task-head">' + (t.date != null ? dateBlock(t.date) : '') +
      '<div>' + (t.date == null ? '<p class="mc-kicker">' + esc(S3.beforeYouGo) + '</p>' : '') + '<h3 class="mc-task-title">' + esc(t.title) + '</h3><p>' + esc(body) + '</p></div></div>' +
      (extra ? '<div class="mc-task-extra">' + extra + '</div>' : '') + '<div class="mc-task-status">' + statusBlock(t) + '</div></article>';
  };
  var gwNote = function () {
    var a = arrivalIn('japan');
    if (a == null) return '';
    var d = new Date(a), md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    return md >= 425 && md <= 515 ? '<p class="mc-note is-ask">' + esc(S3.gw) + '</p>' : '';
  };

  var renderPlan = function () {
    var plan = $('[data-plan]');
    var count = st.meds.length + st.unsure.length + st.unknown.length;
    var trip = arrivals();
    $('[data-trip-line]').textContent = trip.map(function (a) { return CFG.countries[a.c].name + (a.at != null ? ' · ' + fmtDate(a.at) : ''); }).join(ZH ? '，然后 ' : ', then ');
    $('[data-actions]').hidden = !count || !countries().length;
    if (!count || !countries().length) { plan.innerHTML = '<p class="mc-empty">' + esc(S3.empty) + '</p>'; $('[data-card]').hidden = true; return; }
    var ts = tasks();
    var html = '<h3 class="mc-h3">' + esc(S3.todoTitle) + '</h3>' + (ts.length ? ts.map(taskHtml).join('') : '<p>' + esc(S3.nothingTodo) + '</p>');

    // Packing instructions
    html += '<h3 class="mc-h3">' + esc(S3.packTitle) + '</h3>';
    st.meds.forEach(function (e) {
      var m = MEDS[e.id];
      if (leaving(e.id)) return;
      var lines = answersFor(e).map(function (a) { return '<li><strong>' + esc(a.country) + ':</strong> ' + esc(a.text) + '</li>'; });
      var controlled = countries().some(function (c) { var k = kindOf(m, c); return ['narc', 'srm', 'codeine', 'psych', 'permit', 'cat1', 'cat2'].indexOf(k) >= 0; });
      var pending = tasks().filter(function (t) { return t.med && t.med.id === e.id && (t.type === 'krPermit' || t.type === 'jpPermit') && (st.status[t.id] || 'none') !== 'got'; }).length;
      var deciding = tasks().some(function (t) { return t.med && t.med.id === e.id && (t.type === 'decide' || t.type === 'cnAsk'); });
      if (pending) lines.push('<li>' + esc(S3.packPermitPending) + '</li>');
      if (deciding) lines.push('<li>' + esc(S3.packWaiting) + '</li>');
      if (controlled) lines.push('<li>' + esc(S3.packControlled) + '</li>');
      if (countries().indexOf('china') >= 0 && ['cat1', 'cat2', 'narc'].indexOf(m.cn) >= 0) lines.push('<li>' + esc(S3.packDeclare) + '</li>');
      var amt = m.jp === 'psych' ? fill(K.tablets, { x: e.tablets }) + ' · ' + fill(S2.strength, { x: e.mg }) : fill(K.days, { x: e.days });
      html += '<article class="mc-pack"><p class="mc-med-name">' + esc(nameOf(m)) + ' <span class="mc-note">' + esc(amt) + '</span></p><ul>' + lines.join('') + '</ul></article>';
    });
    html += '<div class="mc-pack-all"><p class="mc-strong">' + esc(S3.packFor) + '</p><ul>' + S3.packAll.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';

    // Papers to bring
    var papers = [];
    ts.forEach(function (t) {
      if (t.type === 'krPermit') papers.push({ id: 'p-' + t.id, title: fill(S3.papers.permitKr, { x: nameOf(t.med) }), why: S3.papersWhy.permitKr });
      if (t.type === 'jpPermit') papers.push({ id: 'p-' + t.id, title: fill(S3.papers.permitJp, { x: nameOf(t.med) }), why: S3.papersWhy.permitJp });
      if (t.type === 'krPermit' || t.type === 'jpPermit' || t.type === 'cert') papers.push({ id: 'l-' + t.id, title: fill(S3.papers.letter, { x: nameOf(t.med) }), why: S3.papersWhy.letter });
    });
    papers.push({ id: 'rx', title: S3.papers.rx, why: S3.papersWhy.rx }, { id: 'card', title: S3.papers.card, why: S3.papersWhy.card });
    html += '<h3 class="mc-h3">' + esc(S3.papersTitle) + '</h3><ul class="mc-papers">' + papers.map(function (p) {
      var on = !!st.papers[p.id];
      return '<li><button type="button" class="mc-paper" data-action="paper" data-p="' + esc(p.id) + '" data-focus="paper-' + esc(p.id) + '" aria-pressed="' + on + '"><span class="mc-box" aria-hidden="true">' + (on ? '✓' : '') + '</span><span><strong>' + esc(p.title) + '</strong><span class="mc-note">' + esc(p.why) + '</span></span></button></li>';
    }).join('') + '</ul>';

    html += '<div class="mc-home"><p class="mc-strong">' + esc(S3.home) + '</p><p>' + esc(S3.homeText) + ' <a href="' + esc(S3.homeUsUrl) + '" rel="noopener">' + esc(S3.homeUs) + '</a> · <a href="' + esc(S3.homeCaUrl) + '" rel="noopener">' + esc(S3.homeCa) + '</a></p></div>';
    plan.innerHTML = html;
    renderCard();
  };

  // The customs list, in each destination's language --------------------------------------------
  var cardLangs = function () { return countries().map(function (c) { return CFG.countries[c].lang; }); };
  var cardItems = function (lang) {
    var items = [];
    st.meds.forEach(function (e) {
      var m = MEDS[e.id];
      if (leaving(e.id)) return;
      var local = lang === 'ja' ? m.ja : lang === 'ko' ? m.ko : m.generic.zh;
      var amount = m.jp === 'psych' ? fill(K.tablets, { x: e.tablets }) : fill(K.days, { x: e.days });
      if (lang === 'ko' && m.kr === 'permit') amount += ' · MFDS ' + K.permitNo;
      var deciding = tasks().some(function (t) { return t.med && t.med.id === e.id && (t.type === 'decide' || t.type === 'cnAsk'); });
      items.push({ local: local, english: m.brand + ' (' + m.generic.en + ')' + (m.jp === 'psych' ? ', ' + e.mg + ' mg' : ''), amount: amount, note: deciding ? K.deciding : '' });
    });
    st.unknown.concat(st.unsure).forEach(function (n) { items.push({ local: n, english: '', amount: '', note: K.deciding }); });
    return items;
  };
  var renderCard = function () {
    var box = $('[data-card]');
    var langs = cardLangs();
    if (!langs.length || !(st.meds.length + st.unsure.length + st.unknown.length)) { box.hidden = true; return; }
    if (langs.indexOf(st.cardLang) < 0) st.cardLang = langs[0];
    var lang = st.cardLang, items = cardItems(lang);
    box.hidden = false;
    box.innerHTML = '<h3 class="mc-h3" id="mc-card-title">' + esc(K.title) + '</h3><p>' + esc(K.lead) + '</p>' +
      (langs.length > 1 ? '<div class="mc-chips" role="group" aria-label="' + esc(K.title) + '">' + langs.map(function (l) {
        return '<button type="button" class="mc-chip" data-action="card-lang" data-l="' + l + '" data-focus="cl-' + l + '" aria-pressed="' + (l === lang) + '">' + esc(LANG_NAME[l]) + '</button>';
      }).join('') + '</div>' : '') +
      '<div class="mc-card-sheet" lang="' + (lang === 'zh' ? 'zh-Hans' : lang) + '"><p class="mc-card-title">' + esc(CARD_TITLE[lang]) + '</p><p class="mc-card-mine" lang="' + (ZH ? 'zh-Hans' : 'en') + '">' + esc(K.mine) + '</p><ul>' +
      items.map(function (it) {
        return '<li><p class="mc-card-local">' + esc(it.local) + '</p>' + (it.english ? '<p class="mc-card-en" lang="en">' + esc(it.english) + '</p>' : '') + (it.amount ? '<p class="mc-note">' + esc(it.amount) + '</p>' : '') + (it.note ? '<p class="mc-card-flag">' + esc(it.note) + '</p>' : '') + '</li>';
      }).join('') + '</ul><p class="mc-note">' + esc(K.check) + '</p></div>' +
      '<button type="button" class="btn" data-action="card-image">' + esc(K.save) + '</button><p class="mc-note">' + esc(K.saveNote) + '</p>';
  };
  // Draw the list on a canvas and offer it as a picture.
  var saveCardImage = function () {
    var lang = st.cardLang, items = cardItems(lang);
    var W = 1080, P = 72, cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    var font = function (px, bold) { return (bold ? '600 ' : '400 ') + px + 'px "Hanken Grotesk", "Noto Sans JP", "Noto Sans KR", "Noto Sans SC", "Hiragino Sans", "Apple SD Gothic Neo", "Microsoft YaHei", sans-serif'; };
    var wrap = function (text, px, bold, maxW) {
      ctx.font = font(px, bold);
      var out = [], line = '';
      String(text).split(/(\s+|(?=[　-鿿가-힯]))/).forEach(function (w) {
        var t = line + w;
        if (ctx.measureText(t).width > maxW && line) { out.push(line.trim()); line = w.trim(); } else line = t;
      });
      if (line.trim()) out.push(line.trim());
      return out;
    };
    var blocks = [];
    var addText = function (text, px, bold, color, gap) { wrap(text, px, bold, W - P * 2).forEach(function (l) { blocks.push({ t: l, px: px, bold: bold, color: color, h: Math.round(px * 1.35) }); }); blocks.push({ gap: gap || 0 }); };
    addText(CARD_TITLE[lang], 56, true, '#141816', 8);
    addText(K.mine, 30, false, '#3D4440', 28);
    items.forEach(function (it) {
      blocks.push({ rule: true });
      addText(it.local, 52, true, '#141816', 0);
      if (it.english) addText(it.english, 32, true, '#141816', 0);
      if (it.amount) addText(it.amount, 30, false, '#3D4440', 0);
      if (it.note) addText(it.note, 28, true, '#5C4410', 0);
      blocks.push({ gap: 18 });
    });
    blocks.push({ rule: true }, { gap: 12 });
    addText('East&Well · ' + K.title + ' · ' + CFG.checked, 24, false, '#3D4440', 0);
    var H = P * 2 + blocks.reduce(function (n, b) { return n + (b.h || 0) + (b.gap || 0) + (b.rule ? 22 : 0); }, 0);
    cv.width = W; cv.height = H;
    ctx.fillStyle = '#F3F2EE'; ctx.fillRect(0, 0, W, H);
    var y = P;
    blocks.forEach(function (b) {
      if (b.rule) { ctx.fillStyle = '#141816'; ctx.fillRect(P, y + 6, W - P * 2, 3); y += 22; return; }
      if (b.gap != null && !b.t) { y += b.gap; return; }
      ctx.font = font(b.px, b.bold); ctx.fillStyle = b.color; ctx.textBaseline = 'top';
      ctx.fillText(b.t, P, y); y += b.h;
    });
    cv.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = K.file;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }, 'image/png');
  };

  // A calendar file with every dated deadline, made in the browser.
  var saveCalendar = function () {
    var dated = tasks().filter(function (t) { return t.date != null; });
    if (!dated.length) return;
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    var day = function (ms) { return iso(ms).replace(/-/g, ''); };
    var clean = function (s) { return String(s).replace(/[,;\\]/g, function (c) { return '\\' + c; }); };
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//East&Well//Medicine checker//EN'].concat(dated.map(function (t) {
      return ['BEGIN:VEVENT', 'UID:' + t.id + '-' + day(t.date) + '@eastandwell.com', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + day(t.date), 'DTEND;VALUE=DATE:' + day(t.date + DAY), 'SUMMARY:' + clean(fill(S3.calTitle, { x: t.title })), 'END:VEVENT'].join('\r\n');
    })).concat(['END:VCALENDAR']).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    a.download = S3.calFile;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };

  // Suggestions while typing ---------------------------------------------------------------------
  var input = $('#mc-find'), sug = $('[data-suggest]');
  var renderSuggest = function () {
    var text = input.value.trim();
    if (!text) { sug.hidden = true; sug.innerHTML = ''; return; }
    var found = search(text);
    var twins = found.length > 1 && found[0].s === found[1].s;
    var head = !found.length ? S2.noMatch : twins ? S2.twins : S2.didYouMean;
    sug.hidden = false;
    sug.innerHTML = '<p class="mc-strong">' + esc(head) + '</p><ul role="listbox">' + found.map(function (x) {
      var m = x.m;
      return '<li><button type="button" role="option" aria-selected="false" class="mc-option" data-action="add" data-id="' + m.id + '"><span class="mc-option-name">' + esc(nameOf(m)) + '</span>' +
        (m.flag ? '<span class="mc-flag">' + esc(m.flag[L]) + '</span>' : '') + '<span class="mc-note">' + esc(m.look ? m.look[L] : m.generic[L]) + '</span></button></li>';
    }).join('') +
      (twins ? '<li><button type="button" class="mc-option is-quiet" data-action="unsure" data-n="' + esc(found[0].m.brand.split(',')[0]) + '"><span class="mc-option-name">' + esc(S2.notSure) + '</span></button></li>' : '') +
      '<li><button type="button" class="mc-option is-plain" data-action="unknown"><span>' + esc(fill(S2.addAnyway, { x: text })) + '</span></button></li></ul>';
  };
  input.addEventListener('input', renderSuggest);
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { input.value = ''; renderSuggest(); }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      var found = search(input.value);
      if (found.length && !(found.length > 1 && found[0].s === found[1].s)) addMed(found[0].m.id);
    }
  });

  var addMed = function (id) {
    var m = MEDS[id];
    st.meds.push({ id: id, mg: m.mgs ? m.mgs[Math.min(1, m.mgs.length - 1)] : 0, tablets: tripDays(), days: tripDays(), touched: false });
    input.value = ''; renderSuggest(); render(); input.focus();
  };

  // Events ------------------------------------------------------------------------------------------
  var clamp = function (n, lo, hi) { n = parseInt(n, 10); return isNaN(n) ? lo : Math.max(lo, Math.min(hi, n)); };
  root.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-action]');
    if (!b || !root.contains(b)) return;
    var a = b.getAttribute('data-action'), i = parseInt(b.getAttribute('data-i'), 10);
    if (a === 'country') {
      var c = b.getAttribute('data-c'), at = st.stops.map(function (s) { return s.c; }).indexOf(c);
      if (at >= 0) st.stops = st.stops.filter(function (s) { return s.c !== c; }); else st.stops.push({ c: c, date: '', days: 7 });
    } else if (a === 'up' && i > 0) { var t = st.stops[i - 1]; st.stops[i - 1] = st.stops[i]; st.stops[i] = t; }
    else if (a === 'down' && i < st.stops.length - 1) { var t2 = st.stops[i + 1]; st.stops[i + 1] = st.stops[i]; st.stops[i] = t2; }
    else if (a === 'remove-stop') st.stops.splice(i, 1);
    else if (a === 'days') st.stops[i].days = clamp(st.stops[i].days + Number(b.getAttribute('data-by')), 1, 180);
    else if (a === 'undecided') st.undecided = !st.undecided;
    else if (a === 'layover') { st.layover = !st.layover; if (!st.layover) st.layoverIn = ''; }
    else if (a === 'layover-in') st.layoverIn = b.getAttribute('data-c');
    else if (a === 'add') { addMed(b.getAttribute('data-id')); return; }
    else if (a === 'unsure') { st.unsure.push(b.getAttribute('data-n')); input.value = ''; renderSuggest(); }
    else if (a === 'unknown') { if (input.value.trim()) st.unknown.push(input.value.trim()); input.value = ''; renderSuggest(); }
    else if (a === 'remove-med') st.meds.splice(i, 1);
    else if (a === 'remove-unsure') st.unsure.splice(i, 1);
    else if (a === 'remove-unknown') st.unknown.splice(i, 1);
    else if (a === 'mg') { st.meds[i].mg = Number(b.getAttribute('data-mg')); st.meds[i].touched = true; }
    else if (a === 'tabs') { st.meds[i].tablets = clamp(st.meds[i].tablets + Number(b.getAttribute('data-by')), 1, 999); st.meds[i].touched = true; }
    else if (a === 'mdays') st.meds[i].days = clamp(st.meds[i].days + Number(b.getAttribute('data-by')), 1, 365);
    else if (a === 'office') st.office = b.getAttribute('data-o');
    else if (a === 'status') st.status[b.getAttribute('data-t')] = b.getAttribute('data-s');
    else if (a === 'paper') { var p = b.getAttribute('data-p'); st.papers[p] = !st.papers[p]; }
    else if (a === 'card-lang') st.cardLang = b.getAttribute('data-l');
    else if (a === 'card-image') { saveCardImage(); return; }
    else if (a === 'ics') { saveCalendar(); return; }
    else if (a === 'print') { window.print(); return; }
    else return;
    render();
  });
  root.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.hasAttribute('data-date')) st.stops[+el.getAttribute('data-date')].date = el.value;
    else if (el.hasAttribute('data-days')) st.stops[+el.getAttribute('data-days')].days = clamp(el.value, 1, 180);
    else if (el.hasAttribute('data-tabs')) { st.meds[+el.getAttribute('data-tabs')].tablets = clamp(el.value, 1, 999); st.meds[+el.getAttribute('data-tabs')].touched = true; }
    else if (el.hasAttribute('data-mdays')) st.meds[+el.getAttribute('data-mdays')].days = clamp(el.value, 1, 365);
    else return;
    render();
  });

  // Re-render everything, keeping keyboard focus where it was.
  var render = function () {
    var f = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-focus') : null;
    renderCountries(); renderStops(); renderMeds(); renderPlan();
    if (f) { var el = root.querySelector('[data-focus="' + f + '"]'); if (el) el.focus(); }
  };

  // A medicine passed from its answer page (?add=lorazepam).
  var pre = new URLSearchParams(location.search).get('add');
  if (pre && MEDS[pre]) st.meds.push({ id: pre, mg: MEDS[pre].mgs ? MEDS[pre].mgs[Math.min(1, MEDS[pre].mgs.length - 1)] : 0, tablets: 14, days: 14, touched: false });
  render();
})();
