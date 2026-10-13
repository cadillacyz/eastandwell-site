// Small enhancements. Every page reads and works without this file.
(function () {
  'use strict';
  var doc = document.documentElement;
  var zh = (doc.lang || '').indexOf('zh') === 0; // Chinese pages use the 24-hour clock
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // Sections fade up and photographs settle as they come into view.
  if ('IntersectionObserver' in window && !reduce) {
    doc.classList.add('reveal-ready');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('[data-reveal], .media').forEach(function (el) { io.observe(el); });
  }

  // Video loops: load only near the screen, pause off screen, never on reduced motion or data saver.
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var moving = !reduce && !saveData;
  var loadVideo = function (v) {
    if (!v.getAttribute('src')) { v.preload = 'auto'; v.src = v.getAttribute('data-src'); }
  };
  var startVideo = function (v) {
    loadVideo(v);
    var p = v.play();
    if (p && p.catch) {
      p.catch(function () {
        // Not ready yet (or the tab was hidden): try again once it can play.
        var retry = function () { v.removeEventListener('canplay', retry); var q = v.play(); if (q && q.catch) q.catch(function () {}); };
        v.addEventListener('canplay', retry);
      });
    }
  };
  $$('video[data-cinemagraph]').forEach(function (v) {
    var once = v.getAttribute('data-cinemagraph') === 'once';
    var minW = Number(v.getAttribute('data-min-width') || 0);
    if (!moving || window.innerWidth < minW) {
      if (once && v.getAttribute('data-poster-end')) v.poster = v.getAttribute('data-poster-end');
      return;
    }
    if (once) return; // started by the page that owns it (the window seat)
    var toggle = v.parentElement && v.parentElement.querySelector('[data-video-toggle]');
    var userPaused = false;
    var label = function () {
      if (!toggle) return;
      toggle.classList.toggle('is-paused', v.paused);
      toggle.setAttribute('aria-label', toggle.getAttribute(v.paused ? 'data-label-play' : 'data-label-pause'));
    };
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', function () {
        if (v.paused) { userPaused = false; startVideo(v); } else { userPaused = true; v.pause(); }
      });
      v.addEventListener('play', label);
      v.addEventListener('pause', label);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { if (!userPaused) startVideo(v); } else if (!v.paused) { v.pause(); }
        });
      }, { rootMargin: '150px 0px' }).observe(v);
    } else {
      startVideo(v);
    }
  });

  // Destination pages: the pinned clock follows the scene being read, and its sky lightens with the morning.
  var dialEl = $('[data-dial]');
  if (dialEl) {
    var stops = JSON.parse(dialEl.getAttribute('data-sky-stops'));
    var hexToRgb = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); };
    var mix = function (a, b, t) {
      var x = hexToRgb(a), y = hexToRgb(b);
      return '#' + x.map(function (v, i) { var n = Math.round(v + (y[i] - v) * t).toString(16); return n.length < 2 ? '0' + n : n; }).join('');
    };
    var skyAt = function (m) {
      m = ((m % 1440) + 1440) % 1440;
      var i = 0;
      while (i < stops.length - 2 && stops[i + 1][0] <= m) i++;
      var f = (m - stops[i][0]) / ((stops[i + 1][0] - stops[i][0]) || 1);
      var day = m >= 390 && m <= 1080 ? Math.sin(Math.PI * (m - 390) / 690) : -0.25;
      var night = m < 330 || m > 1170 ? 1 : m < 420 ? (420 - m) / 90 : m > 1080 ? (m - 1080) / 90 : 0;
      return { top: mix(stops[i][1], stops[i + 1][1], f), bottom: mix(stops[i][2], stops[i + 1][2], f), sun: Math.round(Math.max(8, Math.min(112, 88 - day * 70))), night: Math.max(0, Math.min(1, night)) };
    };
    var skyEl = $('[data-dial-sky]', dialEl);
    var dayEl = $('[data-dial-day]', dialEl);
    var timeEl = $('[data-dial-time]', dialEl);
    var ticks = $$('.dial-ticks li', dialEl);
    var scenes = $$('.hours-list .hour');
    var shown = 0;
    var show = function (idx) {
      if (idx === shown) return;
      shown = idx;
      var s = scenes[idx];
      var sky = skyAt(Number(s.getAttribute('data-minutes')));
      skyEl.style.setProperty('--sky-top', sky.top);
      skyEl.style.setProperty('--sky-bottom', sky.bottom);
      skyEl.style.setProperty('--sun-y', sky.sun + '%');
      skyEl.style.setProperty('--night', sky.night);
      ticks.forEach(function (t, i) { t.classList.toggle('is-on', i === idx); });
      dialEl.classList.add('is-changing');
      setTimeout(function () {
        dayEl.textContent = s.getAttribute('data-day');
        timeEl.textContent = s.getAttribute('data-time');
        dialEl.classList.remove('is-changing');
      }, reduce ? 0 : 220);
    };
    var pick = function () {
      var line = window.innerHeight * 0.45, idx = 0;
      scenes.forEach(function (s, i) { if (s.getBoundingClientRect().top < line) idx = i; });
      show(idx);
    };
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    pick();
  }

  // Mobile menu: close after choosing a link, or with Escape.
  $$('.nav-mobile').forEach(function (menu) {
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { menu.removeAttribute('open'); }); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.hasAttribute('open')) { menu.removeAttribute('open'); $('summary', menu).focus(); }
    });
  });

  // Guide contents: highlight the section being read.
  var tocLinks = $$('.toc a');
  if (tocLinks.length) {
    var heads = $$('.prose h2[id]');
    var current = null;
    var mark = function () {
      var id = heads.length ? heads[0].id : null;
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top < 160) id = heads[i].id; else break;
      }
      if (id === current) return;
      current = id;
      tocLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + id); });
    };
    window.addEventListener('scroll', mark, { passive: true });
    mark();
  }
  $$('.toc-mobile a').forEach(function (a) {
    a.addEventListener('click', function () { a.closest('details').removeAttribute('open'); });
  });

  // The Plan a checkup form: Web3Forms emails it to us. Without an access key it sends nothing and says so.
  $$('.signup-form').forEach(function (form) {
    var status = $('.form-status', form);
    var button = $('button[type=submit]', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var key = form.getAttribute('data-key');
      if (!key) { status.textContent = form.getAttribute('data-soon'); return; }
      var fd = new FormData(form);
      if (fd.get('botcheck')) return;
      var name = fd.get('name') || '';
      // The email arrives with these labels, in this order. name and email let Reply go to the visitor.
      var data = {
        access_key: key,
        subject: form.getAttribute('data-subject') + (name ? ': ' + name : ''),
        from_name: 'East&Well website',
        'Form': 'Plan a checkup, eastandwell.com',
        name: name,
        email: fd.get('email'),
        'City': fd.get('city'),
        'Travel month': fd.get('travel_month'),
        'State': fd.get('state') || 'Not given',
        'Page language': form.getAttribute('data-lang-name'),
        'Page': location.href.split('#')[0]
      };
      button.disabled = true;
      status.textContent = form.getAttribute('data-sending');
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res.success) throw new Error(res.message);
        form.reset();
        status.textContent = form.getAttribute('data-sent');
      }).catch(function () {
        status.textContent = form.getAttribute('data-failed');
      }).then(function () { button.disabled = false; });
    });
  });

  // Destination pages: the time in that city, its sunrise and sunset, and a photograph to match.
  var clockEl = $('[data-clock]');
  if (clockEl) {
    var zone = clockEl.getAttribute('data-zone');
    var lat = parseFloat(clockEl.getAttribute('data-lat'));
    var lon = parseFloat(clockEl.getAttribute('data-lon'));
    var offset = parseFloat(clockEl.getAttribute('data-offset'));
    var fmtTime = function (m) {
      m = ((Math.round(m) % 1440) + 1440) % 1440;
      var h = Math.floor(m / 60), mi = m % 60, h12 = h % 12 === 0 ? 12 : h % 12;
      if (zh) return h + ':' + (mi < 10 ? '0' : '') + mi;
      return h12 + ':' + (mi < 10 ? '0' : '') + mi + ' ' + (h < 12 ? 'am' : 'pm');
    };
    var weekdayZh = new Intl.DateTimeFormat('zh-CN', { timeZone: zone, weekday: 'long' });
    var sun = function (y, mo, d) {
      // NOAA approximation; minutes after local midnight.
      var n = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
      var g = 2 * Math.PI / 365 * (n - 1);
      var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      var r = Math.PI / 180, la = lat * r;
      var ha = Math.acos(Math.cos(90.833 * r) / (Math.cos(la) * Math.cos(decl)) - Math.tan(la) * Math.tan(decl)) / r;
      return { rise: 720 - 4 * (lon + ha) - eq + offset, set: 720 - 4 * (lon - ha) - eq + offset };
    };
    var photos = $$('[data-light]', clockEl);
    var tick = function () {
      var parts = {};
      new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'long', hourCycle: 'h23' })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      var mins = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
      var s = sun(Number(parts.year), Number(parts.month), Number(parts.day));
      if (zh) {
        $('[data-now-time]', clockEl).textContent = fmtTime(mins);
        var period = mins < 300 ? '凌晨' : mins < 720 ? '上午' : mins < 780 ? '中午' : mins < 1080 ? '下午' : '晚上';
        $('[data-now-day]', clockEl).textContent = period + ' · ' + weekdayZh.format(new Date());
      } else {
        var t = fmtTime(mins).split(' ');
        $('[data-now-time]', clockEl).textContent = t[0];
        $('[data-now-day]', clockEl).textContent = t[1] + ', ' + parts.weekday;
      }
      $('[data-now-rise]', clockEl).textContent = fmtTime(s.rise);
      $('[data-now-set]', clockEl).textContent = fmtTime(s.set);
      var light = 'night';
      if (mins >= s.rise - 60 && mins < s.rise + 120) light = 'dawn';
      else if (mins >= s.rise + 120 && mins < s.set - 60) light = 'day';
      else if (mins >= s.set - 60 && mins < s.set + 90) light = 'evening';
      photos.forEach(function (img) {
        var on = img.getAttribute('data-light') === light;
        img.classList.toggle('is-on', on);
        if (on) $('[data-now-credit]', clockEl).textContent = img.getAttribute('data-credit');
      });
    };
    try { tick(); setInterval(tick, 30000); } catch (e) { /* the page still reads fine without the clock */ }
  }

  // Phrases: read aloud with the device's own voice, where one exists for that language.
  if ('speechSynthesis' in window) {
    $$('[data-say]').forEach(function (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var u = new SpeechSynthesisUtterance(btn.getAttribute('data-say'));
        u.lang = btn.getAttribute('data-say-lang');
        u.rate = 0.8;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      });
    });
  }

  // The window seat: scrolling flies the night. The scene stays pinned while the section scrolls past.
  var ws = $('[data-window-seat]');
  if (ws) {
    var phases = JSON.parse(ws.getAttribute('data-phases'));
    var flight = JSON.parse(ws.getAttribute('data-flight'));
    var labels = JSON.parse(ws.getAttribute('data-labels'));
    var credits = JSON.parse(ws.getAttribute('data-credits'));
    var playBtn = $('[data-play]', ws);
    var soundBtn = $('[data-sound]', ws);
    var chapters = $$('.ws-chapter', ws);
    var phaseBox = $('.ws-phase', ws);
    var departImg = $('.ws-depart img', ws);
    var departLayer = $('.ws-depart', ws);
    var plane = $('[data-plane]', ws);
    var halo = $('[data-plane-halo]', ws);
    var done = $('[data-route-done]', ws);
    var credit = $('[data-ws-credit]', ws);
    var progress = $('.ws-progress', ws);
    var toDest = $('[data-to-dest]', ws);
    var sunrise = $('video.ws-arrive', ws);
    var miles = doc.lang.indexOf('zh') === 0 ? flight.distanceKm : flight.distanceMiles;
    var value = -1;
    var lastPhase = -1;
    var wasArrived = false;
    var autoFly = null;
    var globe = null;

    var fmt = function (min) {
      var d = Math.floor(min / 1440), r = min - d * 1440, h = Math.floor(r / 60), m = r % 60;
      var mm = (m < 10 ? '0' : '') + m;
      if (flight.clock24) return { time: h + ':' + mm, sub: flight.days[d] || '' };
      return { time: (h % 12 === 0 ? 12 : h % 12) + ':' + mm, sub: flight.ampm[h < 12 ? 0 : 1] + ' ' + (flight.days[d] || '') };
    };
    var setText = function (sel, text) { var el = $(sel, ws); if (el && el.textContent !== text) el.textContent = text; };

    // Cabin lighting through the night: [cabin brightness, mood colour, window light spill, shade lowered]
    var lighting = function (t) {
      if (t < 0.08) return [1, 'rgba(0, 0, 0, 0)', 0, '6%'];
      if (t < 0.12) return [0.55, 'rgba(70, 90, 170, .22)', 0, '6%'];
      if (t < 0.86) return [0.34, 'rgba(78, 92, 190, .30)', 0, '54%'];
      if (t < 0.985) return [0.72, 'rgba(230, 150, 80, .20)', 0.25, '16%'];
      return [0.9, 'rgba(255, 170, 90, .30)', 1, '0%'];
    };

    // Cabin sound, made in the browser: a low engine hum, and the seatbelt chime before landing. Off until asked for.
    var audio = null;
    var startSound = function () {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      var ctx = new Ctx();
      var len = 3 * ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; data[i] = last * 3.2; }
      var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      var low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 380;
      var gain = ctx.createGain(); gain.gain.value = 0;
      src.connect(low); low.connect(gain); gain.connect(ctx.destination); src.start();
      return { ctx: ctx, gain: gain };
    };
    var hum = function (level) {
      if (!audio) return;
      audio.gain.gain.cancelScheduledValues(audio.ctx.currentTime);
      audio.gain.gain.setTargetAtTime(level, audio.ctx.currentTime, 0.8);
    };
    var chime = function () {
      if (!audio) return;
      var c = audio.ctx, t0 = c.currentTime + 0.05;
      [[1318.5, 0], [1046.5, 0.45]].forEach(function (n) {
        [1, 2.01].forEach(function (k, j) {
          var o = c.createOscillator(), g = c.createGain();
          o.type = 'sine'; o.frequency.value = n[0] * k;
          g.gain.setValueAtTime(0, t0 + n[1]);
          g.gain.linearRampToValueAtTime(j ? 0.035 : 0.12, t0 + n[1] + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[1] + 1.8);
          o.connect(g); g.connect(c.destination); o.start(t0 + n[1]); o.stop(t0 + n[1] + 1.9);
        });
      });
    };
    var humFor = function (t) { return t >= 0.985 ? 0 : t < 0.08 ? 0.42 : t < 0.86 ? 0.3 : 0.24; };

    var render = function (v) {
      v = Math.max(0, Math.min(1000, Math.round(v)));
      if (v === value) return;
      value = v;
      var t = value / 1000;
      var flown = Math.round(t * flight.durationMinutes);
      var home = fmt(flight.departMinutes + flown);
      var away = fmt(flight.departMinutes + flight.offsetMinutes + flown);
      setText('[data-clock-home]', home.time); setText('[data-clock-home-sub]', home.sub);
      setText('[data-clock-away]', away.time); setText('[data-clock-away-sub]', away.sub);
      setText('[data-clock-air]', Math.floor(flown / 60) + 'h ' + (flown % 60 < 10 ? '0' : '') + (flown % 60) + 'm');
      if (toDest) toDest.textContent = Math.round(miles * (1 - t)).toLocaleString('en-US');

      var idx = 0;
      phases.forEach(function (p, i) { if (t >= p.at) idx = i; });
      if (idx !== lastPhase) {
        var first = lastPhase === -1;
        if (audio && idx === 4 && lastPhase === 3) chime();
        lastPhase = idx;
        chapters.forEach(function (c, i) { c.setAttribute('aria-pressed', i === idx ? 'true' : 'false'); });
        var swap = function () { setText('[data-phase-title]', phases[idx].title); setText('[data-phase-text]', phases[idx].text); phaseBox.classList.remove('is-changing'); };
        if (first || reduce) { swap(); } else { phaseBox.classList.add('is-changing'); setTimeout(swap, 380); }
      }

      var L = lighting(t);
      ws.style.setProperty('--cabin', L[0]);
      ws.style.setProperty('--mood', L[1]);
      ws.style.setProperty('--spill', L[2]);
      ws.style.setProperty('--shade', L[3]);
      ws.classList.toggle('is-moving', t > 0.01);
      if (progress) progress.style.setProperty('--p', t);

      // Climbing out of Los Angeles: the city tilts away and shrinks, then gives way to the night.
      var climb = Math.min(1, t / 0.12);
      if (departImg) {
        departImg.style.setProperty('--bank', (-7 * (1 - climb)).toFixed(2) + 'deg');
        departImg.style.setProperty('--climb', (1.3 - 0.22 * climb).toFixed(3));
      }
      if (departLayer) departLayer.style.opacity = t <= 0.07 ? 1 : (t >= 0.14 ? 0 : ((0.14 - t) / 0.07).toFixed(3));

      var arrived = t >= 0.985;
      ws.classList.toggle('is-arrived', arrived);
      if (sunrise && moving && arrived !== wasArrived) {
        if (arrived) { sunrise.currentTime = 0; startVideo(sunrise); } else { sunrise.pause(); }
      }
      wasArrived = arrived;
      if (credit) credit.textContent = arrived ? credits.arrive : (t < 0.1 ? credits.depart : credits.night);
      hum(humFor(t));

      var a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      var x = (a * 548 + b * 300 + c * 52).toFixed(1), y = (a * 196 + b * -34 + c * 170).toFixed(1);
      plane.setAttribute('cx', x); plane.setAttribute('cy', y);
      halo.setAttribute('cx', x); halo.setAttribute('cy', y);
      done.setAttribute('stroke-dasharray', (t * 100).toFixed(2) + ' 100');
      if (globe) globe.update(t);
      playBtn.textContent = autoFly ? labels.pause : (value >= 1000 ? labels.again : (value > 0 ? labels.resume : labels.start));
    };

    // Scroll position → the night.
    var range = function () {
      var r = ws.getBoundingClientRect();
      var top = window.scrollY + r.top;
      return { top: top, span: Math.max(1, ws.offsetHeight - window.innerHeight) };
    };
    var fromScroll = function () {
      var g = range();
      render(((window.scrollY - g.top) / g.span) * 1000);
      if (value > 0 && sunrise && moving) loadVideo(sunrise);
    };
    var scrollToValue = function (v, smooth) {
      var g = range();
      window.scrollTo({ top: g.top + (v / 1000) * g.span, behavior: smooth && !reduce ? 'smooth' : 'auto' });
    };

    // Play: fly the rest of the night by scrolling for you. Any wheel, touch or key hands control back.
    var stopAuto = function () {
      if (!autoFly) return;
      cancelAnimationFrame(autoFly.raf); autoFly = null;
      ['wheel', 'touchstart', 'keydown'].forEach(function (e) { window.removeEventListener(e, stopAuto); });
      var v = value; value = -1; render(v);
    };
    playBtn.addEventListener('click', function () {
      if (autoFly) { stopAuto(); return; }
      if (sunrise && moving) loadVideo(sunrise);
      var startV = value >= 1000 ? 0 : Math.max(0, value);
      if (value >= 1000) scrollToValue(0, false);
      var g = range();
      var from = g.top + (startV / 1000) * g.span, to = g.top + g.span;
      var ms = 32000 * (1 - startV / 1000), t0 = performance.now();
      autoFly = { raf: 0 };
      ['wheel', 'touchstart', 'keydown'].forEach(function (e) { window.addEventListener(e, stopAuto, { passive: true }); });
      var step = function (now) {
        if (!autoFly) return;
        var p = Math.min(1, (now - t0) / ms);
        window.scrollTo(0, from + (to - from) * p);
        fromScroll();
        if (p < 1) autoFly.raf = requestAnimationFrame(step); else stopAuto();
      };
      autoFly.raf = requestAnimationFrame(step);
      var v = value; value = -1; render(v);
    });

    chapters.forEach(function (c, i) {
      c.addEventListener('click', function () {
        stopAuto();
        var at = Number(c.getAttribute('data-at'));
        scrollToValue(i === chapters.length - 1 ? 1000 : at * 1000 + 12, true);
      });
    });

    soundBtn.addEventListener('click', function () {
      var on = soundBtn.getAttribute('aria-pressed') !== 'true';
      if (on) {
        if (!audio) audio = startSound();
        if (audio && audio.ctx.state === 'suspended') audio.ctx.resume();
      }
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      $('[data-sound-label]', soundBtn).textContent = on ? labels.soundOn : labels.soundOff;
      if (audio) hum(on ? humFor(value / 1000) : 0);
      if (!on && audio) { var a2 = audio; setTimeout(function () { if (soundBtn.getAttribute('aria-pressed') !== 'true') { a2.ctx.suspend(); } }, 1600); }
    });
    var origHum = hum;
    hum = function (level) { if (soundBtn.getAttribute('aria-pressed') === 'true') origHum(level); };

    window.addEventListener('scroll', function () { if (!autoFly) fromScroll(); }, { passive: true });
    window.addEventListener('resize', fromScroll);
    fromScroll();

    // The seatback map becomes a real globe on wide screens: NASA's Earth at night (served from this
    // site), the true great-circle route, and the plane following it. Anything that fails leaves the
    // drawn map in place.
    var mapBox = $('[data-globe]', ws);
    var canGlobe = function () {
      if (!mapBox || window.innerWidth < 1180 || !window.fetch) return false;
      try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
    };
    var makeGlobe = function (ml) {
      var rad = Math.PI / 180;
      var A = [-118.4081, 33.9425], B = [126.4407, 37.4602]; // LAX, ICN
      var vec = function (p) { var la = p[1] * rad, lo = p[0] * rad; return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]; };
      var va = vec(A), vb = vec(B);
      var d = Math.acos(va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]);
      var raw = function (f) {
        var s1 = Math.sin((1 - f) * d) / Math.sin(d), s2 = Math.sin(f * d) / Math.sin(d);
        var v = [0, 1, 2].map(function (i) { return s1 * va[i] + s2 * vb[i]; });
        return [Math.atan2(v[1], v[0]) / rad, Math.asin(v[2]) / rad];
      };
      var N = 160, pts = [];
      for (var i = 0; i <= N; i++) pts.push(raw(i / N));
      for (var j = 1; j < pts.length; j++) { // keep longitudes continuous across the date line
        while (pts[j][0] - pts[j - 1][0] > 180) pts[j][0] -= 360;
        while (pts[j][0] - pts[j - 1][0] < -180) pts[j][0] += 360;
      }
      var posAt = function (t) {
        var p = raw(t), ref = pts[Math.min(N, Math.round(t * N))];
        while (p[0] - ref[0] > 180) p[0] -= 360;
        while (p[0] - ref[0] < -180) p[0] += 360;
        return p;
      };
      var bearing = function (t) {
        var p = posAt(Math.max(0, t - 0.004)), q = posAt(Math.min(1, t + 0.004));
        var la1 = p[1] * rad, la2 = q[1] * rad, dl = (q[0] - p[0]) * rad;
        return Math.atan2(Math.sin(dl) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl)) / rad;
      };
      var line = function (coords) { return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }; };
      var flown = function (t) { var arr = pts.slice(0, Math.max(1, Math.floor(t * N)) + 1); arr.push(posAt(t)); return line(arr); };
      var host = $('.hud-globe', mapBox);
      var map = new ml.Map({
        container: host,
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        center: pts[0],
        zoom: 1.05,
        style: {
          version: 8,
          projection: { type: 'globe' },
          sources: {
            night: { type: 'raster', tiles: [new URL(mapBox.getAttribute('data-tiles'), document.baseURI).href.replace(/%7B/g, '{').replace(/%7D/g, '}')], tileSize: 256, maxzoom: 3 },
            route: { type: 'geojson', data: line(pts) },
            flown: { type: 'geojson', data: flown(0) },
            ends: { type: 'geojson', data: { type: 'FeatureCollection', features: [A, B].map(function (c) { return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }; }) } },
          },
          layers: [
            { id: 'space', type: 'background', paint: { 'background-color': '#03050a' } },
            { id: 'night', type: 'raster', source: 'night', paint: { 'raster-opacity': 0.95, 'raster-brightness-max': 1, 'raster-saturation': -0.15 } },
            { id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#F3F2EE', 'line-opacity': 0.4, 'line-width': 1.2, 'line-dasharray': [1, 2.5] } },
            { id: 'flown', type: 'line', source: 'flown', paint: { 'line-color': '#DCE5DF', 'line-width': 2.2 } },
            { id: 'ends', type: 'circle', source: 'ends', paint: { 'circle-radius': 3.5, 'circle-color': '#F3F2EE', 'circle-stroke-color': '#0E1311', 'circle-stroke-width': 1 } },
          ],
          sky: { 'atmosphere-blend': 0.9 },
        },
      });
      var el = document.createElement('div');
      el.className = 'globe-plane';
      el.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.2c.7 0 1.2.9 1.2 2.1v5.6l7.6 4.4v2l-7.6-2.4v4.6l2.2 1.7v1.6L12 20.9l-3.4.9v-1.6l2.2-1.7v-4.6l-7.6 2.4v-2l7.6-4.4V4.3c0-1.2.5-2.1 1.2-2.1z"/></svg>';
      var marker = new ml.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(pts[0]).addTo(map);
      map.on('load', function () {
        mapBox.classList.remove('is-loading');
        mapBox.classList.add('is-globe', 'is-ready');
        map.resize();
      });
      return {
        update: function (t) {
          var p = posAt(t);
          marker.setLngLat(p).setRotation(bearing(t));
          var src = map.getSource('flown');
          if (src) src.setData(flown(t));
          map.jumpTo({ center: [p[0], Math.max(-60, Math.min(60, p[1] - 4))] });
        },
      };
    };
    if (canGlobe()) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = mapBox.getAttribute('data-css');
      document.head.appendChild(css);
      import(new URL(mapBox.getAttribute('data-lib'), document.baseURI).href).then(function (ml) {
        mapBox.classList.add('is-loading');
        globe = makeGlobe(ml);
        globe.update(Math.max(0, value) / 1000);
      }).catch(function () { mapBox.classList.remove('is-loading', 'is-globe', 'is-ready'); globe = null; });
    }
  }
  var escHtml = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var fill = function (tpl, map) { return tpl.replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : m; }); };
  $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });

  // The journal: links to a chapter open the folded list of every guide.
  var allFold = $('[data-all-guides]');
  var followHash = function (e) {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && document.getElementById(id);
    if (!el || !allFold || !allFold.contains(el) || allFold.open) return;
    allFold.open = true;
    el.scrollIntoView({ block: 'start', behavior: e ? 'smooth' : 'instant' }); // jump straight there on arrival
  };
  if (allFold) { followHash(); window.addEventListener('hashchange', followHash); }

  // Your week, planned: real time zones (daylight saving included) and typical flight times.
  var pl = $('[data-planner]');
  if (pl) {
    var cfg = JSON.parse(pl.getAttribute('data-config'));
    var L = JSON.parse(pl.getAttribute('data-labels'));
    var plForm = $('form', pl);
    var dateBox = $('#pl-date', pl);
    var zhPl = cfg.lang === 'zh';
    var locale = zhPl ? 'zh-CN' : 'en-US';
    var DAY = 86400000;

    var partsIn = function (ms, tz) {
      var p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
        .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = Number(x.value); });
      return p;
    };
    var offsetOf = function (ms, tz) { var p = partsIn(ms, tz); return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - ms; };
    var zonedToUtc = function (y, m, d, hh, mm, tz) {
      var guess = Date.UTC(y, m - 1, d, hh, mm);
      var first = guess - offsetOf(guess, tz);
      return guess - offsetOf(first, tz);
    };
    var localDate = function (ms, tz) { var p = partsIn(ms, tz); return Date.UTC(p.year, p.month - 1, p.day); }; // a calendar day, as UTC midnight
    var fmtDay = function (dayMs) { return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(dayMs)); };
    var fmtTime = function (ms, tz) {
      return new Intl.DateTimeFormat(zhPl ? 'zh-CN' : 'en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: zhPl ? 'h23' : 'h12' }).format(new Date(ms)).replace(/\s?(AM|PM)/, function (m, x) { return ' ' + x.toLowerCase(); });
    };
    var fmtDur = function (min) { var h = Math.floor(min / 60), m = min % 60; return zhPl ? h + ' 小时' + (m ? ' ' + m + ' 分' : '') : h + ' h' + (m ? ' ' + m + ' m' : ''); };
    var weekday = function (dayMs) { return new Date(dayMs).getUTCDay(); };

    // Default: a Thursday about three weeks out.
    (function () {
      var d = new Date(Date.now() + 21 * DAY);
      d.setUTCDate(d.getUTCDate() + ((4 - d.getUTCDay() + 7) % 7));
      dateBox.value = d.toISOString().slice(0, 10);
    })();

    var plan = null;
    var plRender = function () {
      var fd = new FormData(plForm);
      var from = cfg.airports.filter(function (a) { return a.code === fd.get('from'); })[0];
      var to = cfg.cities.filter(function (c) { return c.id === fd.get('to'); })[0];
      var r = cfg.routes[to.id][from.code];
      var connect = !!r[2];
      var outMin = r[0] + (connect ? cfg.connect : 0), backMin = r[1] + (connect ? cfg.connect : 0);
      var dv = (dateBox.value || '').split('-').map(Number);
      if (dv.length !== 3 || !dv[0]) return;
      var dt = (fd.get('when') === 'midday' ? cfg.depart.midday : cfg.depart.evening).split(':').map(Number);

      var departMs = zonedToUtc(dv[0], dv[1], dv[2], dt[0], dt[1], from.tz);
      var arriveMs = departMs + outMin * 60000;
      var arriveDay = localDate(arriveMs, to.tz);
      var checkupDay = arriveDay + 2 * DAY;
      if (weekday(checkupDay) === 0) checkupDay += DAY; // centers are usually closed on Sundays
      var resultsDay = checkupDay + DAY;
      if (weekday(resultsDay) === 0) resultsDay += DAY;
      var backDay = resultsDay + DAY;
      var bp = new Date(backDay), bt = cfg.back.split(':').map(Number);
      var backMs = zonedToUtc(bp.getUTCFullYear(), bp.getUTCMonth() + 1, bp.getUTCDate(), bt[0], bt[1], to.tz);
      var homeMs = backMs + backMin * 60000;
      var departDay = localDate(departMs, from.tz), homeDay = localDate(homeMs, from.tz);

      var days = [];
      days.push({ day: departDay, time: fmtTime(departMs, from.tz), title: fill(L.fly, { from: from.name }), text: fill(connect ? L.flyConnect : L.flyNonstop, { dur: fmtDur(outMin) }) });
      var landHour = partsIn(arriveMs, to.tz).hour % 24;
      var landText = landHour < 5 ? L.landEarly : landHour >= 18 ? L.landLate : L.landText;
      days.push({ day: arriveDay, time: fmtTime(arriveMs, to.tz), title: fill(L.land, { to: to.name }), text: landText, kind: 'arrive' });
      for (var d = arriveDay + DAY; d < checkupDay; d += DAY) {
        days.push({ day: d, title: L.rest, text: d + DAY === checkupDay ? L.restLast : L.restText, kind: 'muted' });
      }
      days.push({ day: checkupDay, time: to.start, title: L.checkup, text: fill(L.checkupText, { start: to.start, meal: to.meal }), kind: 'key' });
      days.push({ day: resultsDay, title: L.results, text: L.resultsText });
      var sameDay = homeDay === backDay;
      var when = sameDay ? fill(L.sameDay, { t: fmtTime(homeMs, from.tz) }) : fill(L.nextDay, { t: fmtTime(homeMs, from.tz), d: fmtDay(homeDay) });
      days.push({ day: backDay, time: fmtTime(backMs, to.tz), title: L.home, text: fill(L.homeText, { dur: fmtDur(backMin), city: from.name, when: when }) });

      $('[data-days]', pl).innerHTML = days.map(function (x) {
        return '<li class="pl-day' + (x.kind ? ' is-' + x.kind : '') + '"><p class="pl-date">' + escHtml(fmtDay(x.day)) + (x.time ? '<span>' + escHtml(x.time) + '</span>' : '') + '</p>'
          + '<p class="pl-title">' + escHtml(x.title) + '</p><p class="pl-text">' + escHtml(x.text) + '</p></li>';
      }).join('');

      // Weekdays off: from departure (or the day after an evening flight) through the day you land home.
      var firstOff = fd.get('when') === 'evening' ? departDay + DAY : departDay;
      var off = 0;
      for (var w = firstOff; w <= homeDay; w += DAY) { var k = weekday(w); if (k !== 0 && k !== 6) off++; }
      $('[data-stat="days"]', pl).textContent = String(Math.round((homeDay - departDay) / DAY) + 1);
      $('[data-stat="off"]', pl).textContent = String(off);
      $('[data-stat="air"]', pl).textContent = fmtDur(outMin + backMin);
      plan = { from: from, to: to, departMs: departMs, arriveMs: arriveMs, checkupDay: checkupDay, backMs: backMs, homeMs: homeMs };
    };

    // A calendar file built in the browser: the two flights and the checkup day.
    var ics = function () {
      if (!plan) return;
      var stamp = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
      var dayStamp = function (ms) { return new Date(ms).toISOString().slice(0, 10).replace(/-/g, ''); };
      var ev = function (uid, start, end, title, allDay) {
        return ['BEGIN:VEVENT', 'UID:' + uid + '-' + plan.departMs + '@eastandwell.com', 'DTSTAMP:' + stamp(Date.now()),
          allDay ? 'DTSTART;VALUE=DATE:' + dayStamp(start) : 'DTSTART:' + stamp(start),
          allDay ? 'DTEND;VALUE=DATE:' + dayStamp(end) : 'DTEND:' + stamp(end),
          'SUMMARY:' + title, 'END:VEVENT'].join('\r\n');
      };
      var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//East&Well//Checkup week//EN',
        ev('out', plan.departMs, plan.arriveMs, fill(L.calOut, { from: plan.from.name, to: plan.to.name })),
        ev('checkup', plan.checkupDay, plan.checkupDay + DAY, fill(L.calCheckup, { to: plan.to.name }), true),
        ev('back', plan.backMs, plan.homeMs, fill(L.calBack, { to: plan.to.name, from: plan.from.name })),
        'END:VCALENDAR'].join('\r\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
      a.download = L.calFile;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    };
    $('[data-ics]', pl).addEventListener('click', ics);
    plForm.addEventListener('input', plRender);
    plForm.addEventListener('change', plRender);
    plRender();
  }

  // Home: the three cities, one at a time, each in the light it has right now (the city pages' rules:
  // dawn from an hour before sunrise, evening from an hour before sunset). Only the photographs in use
  // are fetched. It pauses for reduced motion, on its pause button, and while the tab is hidden.
  (function () {
  var open = $('[data-home-open]');
  if (open) {
    var slides = $$('[data-slide]', open);
    var picks = $$('[data-pick]', open);
    var pauseBtn = $('[data-pause-btn]', open);
    var words = JSON.parse(open.getAttribute('data-light-words'));
    var nowWord = open.getAttribute('data-now');
    var sunAt = function (y, mo, d, lat, lon, off) {
      var n = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
      var g = 2 * Math.PI / 365 * (n - 1);
      var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
      var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
      var r = Math.PI / 180, la = lat * r;
      var ha = Math.acos(Math.cos(90.833 * r) / (Math.cos(la) * Math.cos(decl)) - Math.tan(la) * Math.tan(decl)) / r;
      return { rise: 720 - 4 * (lon + ha) - eq + off, set: 720 - 4 * (lon - ha) - eq + off };
    };
    var cityNow = function (el) {
      var parts = {};
      new Intl.DateTimeFormat('en-US', { timeZone: el.getAttribute('data-zone'), year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      var h = Number(parts.hour) % 24, mi = Number(parts.minute), mins = h * 60 + mi;
      var s = sunAt(Number(parts.year), Number(parts.month), Number(parts.day), parseFloat(el.getAttribute('data-lat')), parseFloat(el.getAttribute('data-lon')), parseFloat(el.getAttribute('data-offset')));
      var light = 'night';
      if (mins >= s.rise - 60 && mins < s.rise + 120) light = 'dawn';
      else if (mins >= s.rise + 120 && mins < s.set - 60) light = 'day';
      else if (mins >= s.set - 60 && mins < s.set + 90) light = 'evening';
      var mm = (mi < 10 ? '0' : '') + mi;
      var time = zh ? h + ':' + mm : (h % 12 === 0 ? 12 : h % 12) + ':' + mm + ' ' + (h < 12 ? 'am' : 'pm');
      return { time: time, light: light };
    };
    var current = 0, timer = null, paused = !!reduce;
    var show = function (img) {
      if (img.getAttribute('data-src')) {
        img.srcset = img.getAttribute('data-srcset'); img.src = img.getAttribute('data-src');
        img.removeAttribute('data-src'); img.removeAttribute('data-srcset');
      }
    };
    var refresh = function () {
      slides.forEach(function (slide, i) {
        var n = cityNow(slide);
        $$('[data-light]', slide).forEach(function (img) {
          var on = img.getAttribute('data-light') === n.light;
          if (on) show(img);
          img.classList.toggle('is-shown', on);
        });
        var t = picks[i] && $('[data-pick-time]', picks[i]);
        if (t) t.textContent = n.time;
        if (i === current) {
          var img = $('[data-light="' + n.light + '"]', slide);
          $('[data-now-label]', open).textContent = nowWord.replace('{city}', slide.getAttribute('data-city'));
          $('[data-now-time]', open).textContent = n.time;
          $('[data-now-light]', open).textContent = words[n.light];
          $('[data-now-credit]', open).textContent = img ? img.getAttribute('data-credit') : '';
          var link = $('[data-now-link]', open);
          link.href = slide.getAttribute('data-href');
          link.textContent = slide.getAttribute('data-see');
        }
      });
    };
    var go = function (i) {
      current = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        s.classList.toggle('is-on', k === current);
        if (k === current) s.removeAttribute('aria-hidden'); else s.setAttribute('aria-hidden', 'true');
      });
      picks.forEach(function (p, k) {
        p.classList.remove('is-on');
        p.setAttribute('aria-pressed', String(k === current));
      });
      // Restart the active line's fill.
      void open.offsetWidth;
      if (picks[current]) picks[current].classList.add('is-on');
      refresh();
    };
    var stop = function () { clearInterval(timer); timer = null; };
    var run = function () { stop(); if (!paused) timer = setInterval(function () { go(current + 1); }, 8000); };
    var setPaused = function (p) {
      paused = p;
      open.classList.toggle('is-still', p);
      if (pauseBtn) {
        pauseBtn.setAttribute('aria-pressed', String(p));
        pauseBtn.textContent = open.getAttribute(p ? 'data-play' : 'data-pause');
      }
      run();
    };
    picks.forEach(function (p, i) { p.addEventListener('click', function () { go(i); run(); }); });
    if (pauseBtn) pauseBtn.addEventListener('click', function () { setPaused(!paused); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else run(); });
    try {
      setPaused(paused);
      go(0);
      setInterval(refresh, 30000);
    } catch (e) { /* the first city's dawn photograph and caption stay as they are */ }
  }
  })();

  // Home: the checkup guide's example answer, drawn as the guide draws it (a turning body of dots, the
  // checks lit, leader lines to the labels). Still on reduced motion; it rests while off screen.
  (function () {
  var scanEl = $('[data-home-scan]');
  if (scanEl) {
    var cv = $('canvas', scanEl);
    var D = JSON.parse(scanEl.getAttribute('data-home-scan'));
    if (cv && cv.getContext && window.Path2D) {
      var HALF = new Path2D('M200,134 L184,134 C183,150 182,164 178,178 C164,186 140,190 122,196 C108,201 100,216 99,236 C96,272 91,314 87,350 C83,388 77,432 73,472 C70,496 68,524 74,546 C78,558 90,560 94,548 C98,530 98,504 95,482 C97,446 102,406 108,368 C114,326 120,286 126,246 C127,242 128,240 130,238 C134,264 138,294 140,324 C142,348 141,364 139,376 C137,396 127,420 121,442 C117,458 116,472 117,486 C119,540 125,600 135,660 C138,676 140,690 139,704 C138,730 134,762 136,800 C139,840 145,880 149,906 C150,918 142,930 137,940 C134,948 145,953 159,953 C171,953 181,950 185,944 C187,934 185,924 183,912 C181,880 181,840 183,800 C185,762 184,730 185,704 C187,660 191,600 195,540 C197,516 199,502 200,494 Z');
      var HEAD = new Path2D('M200,44 C222,44 236,62 236,90 C236,113 225,132 212,139 C207,142 193,142 188,139 C175,132 164,113 164,90 C164,62 178,44 200,44 Z');
      var probe = document.createElement('canvas').getContext('2d');
      var inside = function (x, y) { return probe.isPointInPath(HEAD, x, y) || probe.isPointInPath(HALF, x <= 200 ? x : 400 - x, y); };
      var seed = 7;
      var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      var P = [];
      for (var y = 40; y <= 956; y += 3.2) {
        var runs = [], a0 = null;
        for (var x = 40; x < 200; x += 0.5) { var on = inside(x, y); if (on && a0 === null) a0 = x; if (!on && a0 !== null) { runs.push([a0, x]); a0 = null; } }
        if (a0 !== null) runs.push([a0, 200]);
        runs.forEach(function (rn) {
          var lo = rn[0], hi = rn[1], torso = hi >= 199.5, c = torso ? 200 : (lo + hi) / 2, rad = torso ? 200 - lo : (hi - lo) / 2;
          var k = y < 145 ? 0.92 : torso ? 0.58 : 1, n = Math.max(2, Math.round((hi - lo) / 3.2));
          for (var i = 0; i < n; i++) {
            var px = lo + (hi - lo) * (i + rnd()) / n, py = y + (rnd() - 0.5) * 2.4;
            var z = k * Math.sqrt(Math.max(0, rad * rad - (px - c) * (px - c)));
            P.push(px, py, z, px, py, -z, 400 - px, py, z, 400 - px, py, -z);
          }
        });
      }
      var s2 = 11;
      var r2 = function () { s2 = (s2 * 16807) % 2147483647; return s2 / 2147483647; };
      var CL = D.marks.map(function (m) {
        var b = m.blob, pts = [], n = Math.max(30, Math.round(b[3] * b[4] * 0.55));
        var add = function (cx) { for (var i = 0; i < n; i++) { var t = r2() * Math.PI * 2, u = Math.acos(2 * r2() - 1), sr = Math.cbrt(r2()); pts.push(cx + b[3] * sr * Math.sin(u) * Math.cos(t), b[1] + b[4] * sr * Math.sin(u) * Math.sin(t), b[2] + b[5] * sr * Math.cos(u)); } };
        add(b[0]); if (m.pair) add(400 - b[0]);
        return { cls: m.cls, pts: pts };
      });
      var COL = { due: '169,214,189', later: '150,180,165', not: '150,150,145' };
      var ALPHA = { due: 0.85, later: 0.42, not: 0.3 };
      var w = 0, hgt = 0, ctx = null, raf = 0, visible = false;
      var frame = function (t) {
        raf = 0;
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        if (cv.clientWidth !== w || cv.clientHeight !== hgt) { w = cv.clientWidth; hgt = cv.clientHeight; cv.width = Math.round(w * dpr); cv.height = Math.round(hgt * dpr); ctx = cv.getContext('2d'); }
        if (!w || !hgt) return;
        var kk = (w / 1200) * dpr, OX = 600, OY = 30, S = 0.96;
        ctx.setTransform(kk, 0, 0, kk, 0, 0);
        ctx.clearRect(0, 0, 1200, 1000);
        var th = reduce ? 0.28 : 0.4 * Math.sin(t / 4600), co = Math.cos(th), si = Math.sin(th);
        var proj = function (x, y, z) { var X = (x - 200) * co + z * si, Z = -(x - 200) * si + z * co, p = 1400 / (1400 - Z); return [OX + X * S * p, OY + (500 + (y - 500) * p) * S, Z]; };
        var scanY = reduce ? -999 : ((t / 22) % 1300) - 150;
        if (!reduce) { ctx.fillStyle = 'rgba(169,214,189,.16)'; ctx.fillRect(OX - 175, OY + scanY * S - 0.5, 350, 1); }
        for (var i = 0; i < P.length; i += 3) {
          var pr = proj(P[i], P[i + 1], P[i + 2]);
          var glow = Math.max(0, 1 - Math.abs(P[i + 1] - scanY) / 14);
          var al = 0.1 + 0.42 * Math.min(1, Math.max(0, (pr[2] + 60) / 120)) + 0.45 * glow;
          ctx.fillStyle = 'rgba(232,229,222,' + al.toFixed(3) + ')';
          ctx.fillRect(pr[0] - 0.6, pr[1] - 0.6, 1.2, 1.2);
        }
        CL.forEach(function (cl) {
          ctx.fillStyle = 'rgba(' + COL[cl.cls] + ',' + ALPHA[cl.cls] + ')';
          for (var j = 0; j < cl.pts.length; j += 3) { var p = proj(cl.pts[j], cl.pts[j + 1], cl.pts[j + 2]); ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2); }
        });
        if (w > 520) {
          D.lines.forEach(function (l) {
            var p = proj(l.at[0], l.at[1], l.at[2]), left = l.side === 'left';
            var x0 = left ? 372 : 828, x1 = left ? 396 : 804;
            ctx.beginPath();
            ctx.setLineDash(l.cls === 'due' ? [] : [3, 4]);
            ctx.strokeStyle = l.cls === 'not' ? 'rgba(150,150,145,.45)' : 'rgba(232,229,222,.42)';
            ctx.lineWidth = 0.8;
            ctx.moveTo(x0, l.y); ctx.lineTo(x1, l.y); ctx.lineTo(p[0], p[1]); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath(); ctx.arc(p[0], p[1], 2.3, 0, Math.PI * 2); ctx.fill();
          });
        }
        if (visible && !reduce) raf = requestAnimationFrame(frame);
      };
      var wake = function () { if (!raf) raf = requestAnimationFrame(frame); };
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) wake(); }, { rootMargin: '120px' }).observe(scanEl);
      } else { visible = true; wake(); }
      window.addEventListener('resize', wake, { passive: true });
      wake();
    }
  }
  })();

  // Home: the price horizon (What it costs). Data comes from the figure's data-price-horizon attribute
  // (src/data/price-horizon.mjs). The finished chart is drawn at once; the first time it comes into view it
  // replays as a short animation (lines draw in, the sun rises, the big numbers count up). A watchdog snaps
  // everything to its end state, so a paused animation can never leave it blank or half-counted.
  (function () {
    var fig = $('[data-price-horizon]');
    if (!fig) return;
    var cfg; try { cfg = JSON.parse(fig.getAttribute('data-price-horizon')); } catch (e) { return; }
    var host = $('.ph-chart', fig), foot = $('.ph-foot', fig), toggle = $('.ph-toggle', fig);
    var homeNum = $('#ph-home', fig), homeSub = $('#ph-home-sub', fig);
    var NS = 'http://www.w3.org/2000/svg';
    var usd = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
    var ids = cfg.rows.filter(function (r) { return r.id; }).map(function (r) { return r.id; });
    var S = { homeV: cfg.core, sun: 1, count: 1, show: {}, prog: {} };
    ids.forEach(function (id) { S.show[id] = 1; S.prog[id] = 1; });

    var tweens = [], running = false;
    var get = function (k, sub) { return sub ? S[k][sub] : S[k]; };
    var set = function (k, sub, v) { if (sub) S[k][sub] = v; else S[k] = v; };
    var tween = function (k, sub, to, ms, delay) {
      if (reduce) { set(k, sub, to); return; }
      tweens = tweens.filter(function (t) { return !(t.k === k && t.sub === sub); });
      tweens.push({ k: k, sub: sub, from: get(k, sub), to: to, t0: performance.now() + (delay || 0), ms: ms });
      if (!running) { running = true; requestAnimationFrame(step); }
    };
    var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };
    var step = function (now) {
      tweens = tweens.filter(function (t) {
        if (now < t.t0) return true;
        var k = Math.min(1, (now - t.t0) / t.ms);
        set(t.k, t.sub, t.from + (t.to - t.from) * easeOut(k));
        return k < 1;
      });
      draw();
      if (tweens.length) requestAnimationFrame(step); else running = false;
    };
    var watchdog;
    var finishAll = function () { tweens.forEach(function (t) { set(t.k, t.sub, t.to); }); tweens = []; draw(); };
    var guard = function (ms) { clearTimeout(watchdog); watchdog = setTimeout(finishAll, ms); };

    // Layout: names beside the lines on a wide card, above them on a narrow one.
    var L, svg;
    var build = function () {
      var compact = host.clientWidth < 440;
      var W = compact ? 360 : 560, top = 30, rowH = compact ? 42 : 34;
      L = { W: W, top: top, rowH: rowH, compact: compact, plotL: compact ? 10 : 150, plotR: W - (compact ? 88 : 78), rows: [] };
      var y = top;
      cfg.rows.forEach(function (r) { L.rows.push({ r: r, y: y }); y += r.group ? 22 : rowH; });
      L.axisY = y + 6; L.H = y + 30;
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + L.H);
      svg.setAttribute('focusable', 'false');
      svg.innerHTML = '<defs>' +
        '<filter id="ph-glow" filterUnits="userSpaceOnUse" x="-40" y="-40" width="' + (W + 80) + '" height="' + (L.H + 80) + '"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
        '<radialGradient id="ph-sun"><stop offset="0" stop-color="#FFE7B0"/><stop offset=".55" stop-color="#F2BE5C"/><stop offset="1" stop-color="#E3A43E"/></radialGradient>' +
        '<radialGradient id="ph-halo"><stop offset="0" stop-color="#F2BE5C" stop-opacity=".42"/><stop offset=".45" stop-color="#F2BE5C" stop-opacity=".1"/><stop offset="1" stop-color="#F2BE5C" stop-opacity="0"/></radialGradient>' +
        '<linearGradient id="ph-beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#F2BE5C" stop-opacity=".55"/><stop offset="1" stop-color="#F2BE5C" stop-opacity="0"/></linearGradient>' +
        '</defs><g class="ph-grid"></g><g class="ph-halo"></g><g class="ph-rows"></g><g class="ph-sunwrap"></g>';
      var rowsG = svg.querySelector('.ph-rows');
      L.rows.forEach(function (o) {
        var r = o.r, g = document.createElementNS(NS, 'g');
        if (r.group) {
          g.setAttribute('data-group', '1');
          g.innerHTML = '<text class="ph-t-group" x="0" y="' + (o.y + 15) + '"></text>';
          g.firstChild.textContent = r.group.toUpperCase();
        } else {
          var cy = compact ? o.y + 28 : o.y + rowH / 2;
          g.setAttribute('data-id', r.id); g.setAttribute('data-cy', cy);
          g.innerHTML = '<rect x="-8" y="' + o.y + '" width="' + (W + 16) + '" height="' + rowH + '" fill="transparent"/>' +
            '<text class="ph-t-name" x="0" y="' + (compact ? o.y + 12 : cy + 4) + '"></text>' +
            '<line class="ph-seg" y1="' + cy + '" y2="' + cy + '" stroke="#7FB09C" stroke-width="4.5" stroke-linecap="round" filter="url(#ph-glow)"/>' +
            '<line class="ph-over" y1="' + cy + '" y2="' + cy + '" stroke="#F2BE5C" stroke-width="4.5" stroke-linecap="round" opacity="0"/>' +
            '<circle class="ph-lo" cy="' + cy + '" r="5.5" fill="#7FB09C" stroke="#131C18" stroke-width="2"/>' +
            '<circle class="ph-hi" cy="' + cy + '" r="4" fill="#131C18" stroke="#7FB09C" stroke-width="2"/>' +
            '<path class="ph-arrow" fill="none" stroke="#7FB09C" stroke-width="2"/>' +
            '<text class="ph-t-val ph-vlo" y="' + (cy + 4.5) + '"></text><text class="ph-t-val ph-vhi" y="' + (cy + 4.5) + '"></text>';
          $('.ph-t-name', g).textContent = r.name;
          bindTip(g, r);
        }
        rowsG.appendChild(g);
      });
      host.innerHTML = '';
      host.appendChild(svg);
    };
    var x = function (v) { return L.plotL + (Math.min(v, cfg.max) / cfg.max) * (L.plotR - L.plotL); };

    var hoverId = null;
    var draw = function () {
      var grid = '';
      for (var v = 0; v <= cfg.max; v += 1000) {
        grid += '<line x1="' + x(v) + '" x2="' + x(v) + '" y1="' + (L.top - 8) + '" y2="' + L.axisY + '" stroke="rgba(243,242,238,.12)"/>';
        if (v % 2000 === 0) grid += '<text class="ph-t-axis" x="' + x(v) + '" y="' + (L.axisY + 18) + '" text-anchor="middle">' + (v === 0 ? '$0' : '$' + v / 1000 + 'k') + '</text>';
      }
      grid += '<line x1="' + L.plotL + '" x2="' + L.plotR + '" y1="' + L.axisY + '" y2="' + L.axisY + '" stroke="rgba(243,242,238,.28)"/>';
      svg.querySelector('.ph-grid').innerHTML = grid;
      var firstSeoul = ids[1];
      $$('.ph-rows > g', svg).forEach(function (g, i) {
        if (g.getAttribute('data-group')) { g.style.opacity = i === 0 ? S.show[ids[0]] : S.show[firstSeoul]; return; }
        var id = g.getAttribute('data-id'), cy = +g.getAttribute('data-cy');
        var r = cfg.rows.filter(function (q) { return q.id === id; })[0], p = S.prog[id];
        g.style.opacity = S.show[id] * (hoverId && hoverId !== id ? 0.35 : 1);
        var lo = x(r.lo), hiV = r.hi ? r.lo + (r.hi - r.lo) * p : r.lo, hi = x(hiV);
        var seg = $('.ph-seg', g), over = $('.ph-over', g);
        seg.setAttribute('x1', lo); seg.setAttribute('x2', hi); seg.style.display = r.hi ? '' : 'none';
        if (r.hi && hiV > S.homeV) { over.setAttribute('x1', Math.max(lo, x(S.homeV))); over.setAttribute('x2', hi); over.setAttribute('opacity', 0.92 * S.sun); }
        else over.setAttribute('opacity', 0);
        $('.ph-lo', g).setAttribute('cx', lo);
        var clipped = r.hi && r.hi > cfg.max && p > 0.99;
        var hc = $('.ph-hi', g); hc.setAttribute('cx', hi); hc.style.display = r.hi && !clipped && p > 0.02 ? '' : 'none';
        $('.ph-arrow', g).setAttribute('d', clipped ? 'M' + (hi - 2) + ',' + (cy - 5) + ' L' + (hi + 5) + ',' + cy + ' L' + (hi - 2) + ',' + (cy + 5) : '');
        var lab = Math.max(0, Math.min(1, (p - 0.75) / 0.25));
        var vlo = $('.ph-vlo', g), vhi = $('.ph-vhi', g);
        if (r.hi) { vlo.textContent = L.compact ? '' : usd(r.lo); vlo.setAttribute('x', lo - 10); vlo.setAttribute('text-anchor', 'end'); vlo.style.opacity = lab; }
        else { vlo.textContent = usd(r.lo); vlo.setAttribute('x', lo + 12); vlo.setAttribute('text-anchor', 'start'); vlo.style.opacity = S.show[id]; }
        vhi.setAttribute('x', hi + (clipped ? 12 : 10)); vhi.textContent = r.hi ? usd(r.hi) : ''; vhi.style.opacity = lab;
      });
      var sx = x(S.homeV), sy = L.axisY;
      svg.querySelector('.ph-halo').innerHTML = S.sun > 0 ? '<circle cx="' + sx + '" cy="' + sy + '" r="' + (110 * S.sun) + '" fill="url(#ph-halo)" opacity="' + S.sun + '"/><rect x="' + (sx - 1) + '" y="' + (L.top - 14) + '" width="2" height="' + (sy - L.top + 14) + '" fill="url(#ph-beam)" opacity="' + S.sun + '"/>' : '';
      svg.querySelector('.ph-sunwrap').innerHTML = S.sun > 0 ? '<circle cx="' + sx + '" cy="' + sy + '" r="' + (11 * S.sun) + '" fill="url(#ph-sun)"/>' : '';
      $$('.ph-num', fig).forEach(function (el) {
        var to = el === homeNum ? S.homeV : +el.getAttribute('data-to');
        var shown = usd(to * (el === homeNum && S.count >= 1 ? 1 : S.count));
        var small = $('small', el);
        if (small) { var after = el.lastChild === small; el.textContent = ''; if (!after) el.appendChild(small); el.appendChild(document.createTextNode(shown)); if (after) el.appendChild(small); }
        else el.textContent = shown;
      });
    };

    var tip = document.createElement('div');
    tip.className = 'ph-tip'; tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    function bindTip(g, r) {
      g.addEventListener('pointermove', function (e) {
        hoverId = r.id; draw();
        tip.innerHTML = '<b></b><br><span></span>';
        tip.firstChild.textContent = r.name; tip.lastChild.textContent = r.tip;
        tip.style.opacity = 1;
        tip.style.left = Math.min(e.clientX + 16, window.innerWidth - 296) + 'px';
        tip.style.top = (e.clientY + 16) + 'px';
      });
      g.addEventListener('pointerleave', function () { hoverId = null; tip.style.opacity = 0; draw(); });
    }

    var pop = function (el) { el.classList.remove('ph-pop'); void el.offsetWidth; el.classList.add('ph-pop'); };
    var play = function () {
      if (reduce) return;
      ids.forEach(function (id) { S.show[id] = 0; S.prog[id] = 0; });
      S.sun = 0; S.count = 0; draw();
      tween('count', null, 1, 1300, 0);
      setTimeout(function () { $$('.ph-num', fig).forEach(pop); }, 1300);
      tween('show', ids[0], 1, 400, 200);
      ids.slice(1).forEach(function (id, i) { tween('show', id, 1, 350, 350 + i * 130); tween('prog', id, 1, 850, 420 + i * 130); });
      tween('sun', null, 1, 800, 1250);
      guard(2700);
    };

    toggle.addEventListener('click', function () {
      var on = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
      homeSub.textContent = cfg.homeSub[on ? 1 : 0];
      tween('homeV', null, on ? cfg.colonoscopy : cfg.core, 900);
      pop(homeNum);
      guard(1200);
    });

    build(); draw();
    fig.classList.add('ph-ready');
    foot.hidden = false;
    if ('IntersectionObserver' in window && !reduce) {
      var seen = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { seen.disconnect(); play(); }
      }, { threshold: 0.35 });
      seen.observe(fig);
    }
    var lastCompact = L.compact, rz;
    window.addEventListener('resize', function () {
      clearTimeout(rz);
      rz = setTimeout(function () { if ((host.clientWidth < 440) !== lastCompact) { build(); draw(); lastCompact = L.compact; } }, 150);
    });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && tweens.length) finishAll(); });
  })();
})();
