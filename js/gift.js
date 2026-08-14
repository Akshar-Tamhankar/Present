/* ==========================================================================
   gift.js — the unwrapping.

   Two deliberate physical acts, because a box that opens itself isn't a
   present:
     1. drag the bow  → the ribbons untie and fall away
     2. drag the lid up → it lifts off

   The bow is a 2D overlay (see index.html); the lid lives inside the 3D box,
   so its drag transform must be COMPOSED with its resting transform — an
   inline `transform:` replaces the stylesheet one wholesale.
   ========================================================================== */

window.Gift = (function () {

  // must match .lid's stylesheet transform exactly
  const LID_BASE = 'translate(-50%,-50%) translateY(-82px) ';

  let box, lid, ribbons, bow, hint, glow, prompt;
  let stage = 0;                 // 0 tied · 1 untied · 2 open
  let onOpen = function () {};
  let bound = false;

  function cache() {
    box     = document.getElementById('giftbox');
    lid     = document.getElementById('lid');
    ribbons = document.getElementById('ribbons');
    bow     = document.getElementById('bow');
    hint    = document.getElementById('gift-hint');
    glow    = document.getElementById('gift-glow');
    prompt  = document.getElementById('gift-prompt');
  }

  function reset(cb) {
    cache();
    onOpen = cb || function () {};
    stage = 0;
    ribbons.className = 'ribbons';
    lid.className = 'lid';
    lid.style.cssText = '';
    bow.className = 'bow';
    bow.style.cssText = '';
    box.classList.remove('is-open');
    glow.classList.remove('on');
    glow.style.cssText = '';
    hint.textContent = 'drag the bow to untie it';
    hint.classList.remove('hide');
    prompt.classList.remove('hide');
    if (!bound) { bind(); bound = true; }
  }

  function capture(el, e) {
    // synthetic events (and some post-cancel states) have no live pointer
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function release(el, e) {
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  /* ---------------------------------------------------------------------- */

  function bind() {
    bow.addEventListener('pointerdown', startBow);
    lid.addEventListener('pointerdown', startLid);
  }

  /* --- 1. untie --------------------------------------------------------- */

  function startBow(e) {
    if (stage !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    capture(bow, e);
    bow.classList.add('grabbed');

    function move(ev) {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      const d = Math.hypot(dx, dy);
      const pull = Math.min(1, d / 90);
      bow.style.transform =
        'translate(-50%,-50%) translate(' + dx * 0.55 + 'px,' + dy * 0.55 + 'px) ' +
        'scale(' + (1 + pull * 0.14) + ') rotate(' + dx * 0.09 + 'deg)';
      if (d > 90) finishBow(ev, dx, dy);
    }

    function up() { cleanup(); if (stage === 0) springBack(); }

    function cleanup() {
      bow.removeEventListener('pointermove', move);
      bow.removeEventListener('pointerup', up);
      bow.removeEventListener('pointercancel', up);
      bow.classList.remove('grabbed');
      release(bow, e);
    }

    function springBack() {
      bow.style.transition = 'transform .38s cubic-bezier(.34,1.56,.64,1)';
      bow.style.transform = 'translate(-50%,-50%)';
      setTimeout(function () { bow.style.transition = ''; }, 400);
    }

    function finishBow(ev, dx, dy) {
      cleanup();
      stage = 1;
      const ang = Math.atan2(dy, dx);
      bow.style.transition = 'transform .75s cubic-bezier(.32,.85,.4,1), opacity .75s ease';
      bow.style.transform =
        'translate(-50%,-50%) translate(' + Math.cos(ang) * 460 + 'px,' +
        (Math.sin(ang) * 300 + 260) + 'px) rotate(' + (dx > 0 ? 300 : -300) + 'deg) scale(.6)';
      bow.style.opacity = '0';
      ribbons.classList.add('untied');
      AudioEngine.sfx.good();
      hint.classList.add('hide');
      setTimeout(function () {
        hint.textContent = 'now lift the lid ↑';
        hint.classList.remove('hide');
      }, 620);
    }

    bow.addEventListener('pointermove', move);
    bow.addEventListener('pointerup', up);
    bow.addEventListener('pointercancel', up);
  }

  /* --- 2. lift ---------------------------------------------------------- */

  function startLid(e) {
    if (stage !== 1) {
      if (stage === 0) nudge();
      return;
    }
    e.preventDefault();
    const sy = e.clientY, sx = e.clientX;
    capture(lid, e);
    lid.classList.add('grabbed');

    function move(ev) {
      const dy = Math.min(0, ev.clientY - sy);      // upward only
      const dx = (ev.clientX - sx) * 0.25;
      const lift = Math.min(1, -dy / 110);
      lid.style.transform = LID_BASE +
        'translate3d(' + dx + 'px,' + dy + 'px,0) rotateX(' + (-lift * 8) + 'deg) ' +
        'rotateZ(' + (dx * 0.06) + 'deg)';
      glow.style.opacity = (lift * 0.9).toFixed(3);
      if (-dy > 110) finishLid(dx);
    }

    function up() { cleanup(); if (stage === 1) springBack(); }

    function cleanup() {
      lid.removeEventListener('pointermove', move);
      lid.removeEventListener('pointerup', up);
      lid.removeEventListener('pointercancel', up);
      lid.classList.remove('grabbed');
      release(lid, e);
    }

    function springBack() {
      lid.style.transition = 'transform .4s cubic-bezier(.34,1.4,.64,1)';
      lid.style.transform = '';
      glow.style.opacity = '0';
      setTimeout(function () { lid.style.transition = ''; }, 420);
    }

    function finishLid(dx) {
      cleanup();
      stage = 2;
      box.classList.add('is-open');
      glow.classList.add('on');
      glow.style.opacity = '';
      lid.style.transition = 'transform 1.05s cubic-bezier(.22,.9,.3,1), opacity .9s ease .35s';
      lid.style.transform = LID_BASE +
        'translate3d(' + (dx + 60) + 'px,-460px,180px) rotateX(-46deg) rotateZ(24deg) scale(1.06)';
      lid.style.opacity = '0';
      hint.classList.add('hide');
      prompt.classList.add('hide');
      AudioEngine.sfx.unlock();
      Scene.celebrate();
      setTimeout(function () { onOpen(); }, 900);
    }

    lid.addEventListener('pointermove', move);
    lid.addEventListener('pointerup', up);
    lid.addEventListener('pointercancel', up);
  }

  /** Tried to lift while still tied — wiggle the bow to say "this first". */
  function nudge() {
    bow.classList.remove('nudge');
    void bow.offsetWidth;
    bow.classList.add('nudge');
  }

  return { reset: reset };
})();
