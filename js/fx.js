/* ==========================================================================
   fx.js — DOM choreography, powered by anime.js (vendored, MIT).

   The canvas engine owns the world; this owns the type: title letters
   springing in, the reveal timeline, stat counters, and the tilt-toward-
   the-cursor cards. Everything here degrades safely — if anime is missing
   or reduced-motion is set, elements just appear in their final state.
   ========================================================================== */

window.FX = (function () {

  const REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ok = function () { return !REDUCED && typeof anime === 'function'; };

  const $  = function (s) { return document.querySelector(s); };
  const $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function showAll(sel) {
    $$(sel).forEach(function (el) {
      el.style.opacity = 1;
      el.style.transform = 'none';
    });
  }

  /* ======================================================================
     title entrance — letters tumble in one by one
     ====================================================================== */

  function wrapChars(el) {
    if (el.dataset.wrapped === el.textContent) return;   // re-wrap on rename
    const text = el.textContent;
    el.textContent = '';
    for (let i = 0; i < text.length; i++) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = text[i] === ' ' ? ' ' : text[i];
      el.appendChild(s);
    }
    el.dataset.wrapped = text;
  }

  /**
   * Anime's engine runs on rAF, which pauses in hidden tabs — and a texted
   * link often opens in a background tab. Defer the entrance until we're
   * visible, and back every timeline with a watchdog that force-finishes the
   * elements if anything stalls. The gift must never be a blank screen.
   */
  function whenVisible(fn) {
    if (!document.hidden) { fn(); return; }
    const once = function () {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', once);
      fn();
    };
    document.addEventListener('visibilitychange', once);
  }

  function watchdog(sel, ms) {
    setTimeout(function () {
      $$(sel).forEach(function (el) {
        if (parseFloat(getComputedStyle(el).opacity) < 0.98) {
          if (typeof anime === 'function') anime.remove(el);
          el.style.opacity = 1;
          el.style.transform = 'none';
        }
      });
    }, ms);
  }

  function titleIn() {
    const name = $('.title-name');
    if (!name) return;
    wrapChars(name);

    if (!ok()) { showAll('.eyebrow,.title-name .ch,.title-sub,#btn-start,.title-hint'); return; }
    whenVisible(titleRun);
  }

  function titleRun() {
    anime.set('.eyebrow,.title-sub,#btn-start,.title-hint', { opacity: 0 });
    anime.set('.title-name .ch', { opacity: 0 });
    watchdog('.eyebrow,.title-name .ch,.title-sub,#btn-start,.title-hint', 3600);

    anime.timeline({ easing: 'easeOutCubic' })
      .add({ targets: '.eyebrow', opacity: [0, 1], translateY: [14, 0], duration: 500 })
      .add({
        targets: '.title-name .ch',
        opacity: [0, 1],
        translateY: [46, 0],
        rotate: function () { return anime.random(-14, 14) + 'deg'; },
        scale: [0.55, 1],
        duration: 780,
        delay: anime.stagger(52),
        easing: 'spring(1, 70, 11, 4)'
      }, '-=180')
      .add({ targets: '.title-sub', opacity: [0, 1], translateY: [16, 0], duration: 460 }, '-=420')
      .add({ targets: '#btn-start', opacity: [0, 1], translateY: [16, 0], scale: [0.92, 1], duration: 420 }, '-=220')
      .add({ targets: '.title-hint', opacity: [0, 1], duration: 420 }, '-=160');
  }

  /* ======================================================================
     the reveal — words slam in, then the golden ticket flips up
     ====================================================================== */

  function reveal() {
    const ticket = $('#ticket');
    if (!ok()) {
      showAll('.rw,.reveal-note,#btn-again');
      if (ticket) { ticket.style.opacity = 1; ticket.classList.add('settled'); }
      Scene.celebrate();
      return;
    }
    whenVisible(revealRun);
  }

  function revealRun() {
    const ticket = $('#ticket');
    ticket.classList.remove('settled');
    anime.set('.rw', { opacity: 0 });
    anime.set('.reveal-note,#btn-again', { opacity: 0 });
    anime.set(ticket, { opacity: 0 });
    watchdog('.rw,.reveal-note,#ticket,#btn-again', 4200);

    Scene.celebrate();

    anime.timeline()
      .add({
        targets: '.rw',
        opacity: [0, 1],
        translateY: [54, 0],
        rotate: [-3, 0],
        scale: [0.8, 1],
        duration: 850,
        delay: anime.stagger(150),
        easing: 'spring(1, 78, 12, 6)'
      })
      .add({
        targets: '.rw-gold',
        scale: [1, 1.06, 1],
        duration: 520,
        easing: 'easeInOutQuad',
        begin: function () { Scene.celebrate(); }
      }, '-=260')
      .add({
        targets: '.reveal-note',
        opacity: [0, 1], translateY: [18, 0],
        duration: 620, easing: 'easeOutCubic'
      }, '-=120')
      .add({
        targets: ticket,
        opacity: [0, 1],
        translateY: [90, 0],
        rotateX: [58, 0],
        scale: [0.82, 1],
        duration: 950,
        easing: 'spring(1, 65, 11, 2)',
        begin: function () { AudioEngine.sfx.unlock(); },
        complete: function () {
          ticket.classList.add('settled');   // hands idle bob + shine to CSS
          Scene.celebrate();
        }
      }, '-=200')
      .add({
        targets: '#btn-again',
        opacity: [0, 1], translateY: [12, 0], duration: 420, easing: 'easeOutCubic'
      }, '-=300');
  }

  /* ======================================================================
     result stats — numbers count up
     ====================================================================== */

  function statsCount() {
    if (!ok()) return;
    $$('.result-stats .stat b').forEach(function (el, i) {
      const n = parseInt(el.textContent, 10) || 0;
      const o = { v: 0 };
      el.textContent = '0';
      anime({
        targets: o, v: n,
        duration: 700, delay: 90 * i,
        easing: 'easeOutExpo', round: 1,
        update: function () { el.textContent = o.v; }
      });
    });
  }

  /* ======================================================================
     tilt — cards lean toward the cursor (kokonut-style, but hand-rolled)
     ====================================================================== */

  const tilt = { x: 0, y: 0, raf: 0 };

  function tiltLoop() {
    tilt.raf = 0;
    const screen = document.body.dataset.screen;
    if (screen === 'title') {
      const el = $('.title-inner');
      if (el) el.style.transform =
        'translate(' + (tilt.x * 9) + 'px,' + (tilt.y * 6) + 'px)';
    } else if (screen === 'reveal') {
      const wrap = $('.ticket-wrap');
      if (wrap) wrap.style.transform =
        'rotateX(' + (-tilt.y * 6) + 'deg) rotateY(' + (tilt.x * 8) + 'deg)';
    }
  }

  function mountTilt() {
    if (REDUCED) return;
    window.addEventListener('mousemove', function (e) {
      tilt.x = (e.clientX / window.innerWidth - 0.5) * 2;
      tilt.y = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!tilt.raf) tilt.raf = requestAnimationFrame(tiltLoop);
    }, { passive: true });
  }

  return { titleIn: titleIn, reveal: reveal, statsCount: statsCount, mountTilt: mountTilt };
})();
