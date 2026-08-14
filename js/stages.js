/* ==========================================================================
   stages.js — Acts II and III, so the gift isn't one long clicking exercise.

     Act II  · petal catch — hearts tumble through the breeze, click them
               before they're gone
     Act III · the finale  — quick-time: a ring closes on a prompt, hit it
               at the moment it seals

   Both draw on their own transparent overlay canvas above the scene and
   below the DOM screens, and both are unloseable: falling short just offers
   the act again, a little more kindly.
   ========================================================================== */

window.Stages = (function () {

  let cv = null, g = null, W = 0, H = 0, DPR = 1;
  let raf = 0, last = 0;
  let act = null;              // null | 'catch' | 'qte'
  let state = null;
  let onDone = function () {};
  let card = null, cardTitle = null, cardSub = null;
  let mercyCatch = 0;          // grows on retries; goal shrinks with it

  /* ---------------------------------------------------------------------- */

  function mount() {
    if (cv) return;
    cv = document.createElement('canvas');
    cv.id = 'stagefx';
    cv.style.cssText =
      'position:fixed;inset:0;z-index:1;pointer-events:none;display:block';
    document.getElementById('scene').insertAdjacentElement('afterend', cv);
    g = cv.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    card = document.getElementById('stage-card');
    cardTitle = card.querySelector('.stage-title');
    cardSub = card.querySelector('.stage-sub');

    document.addEventListener('pointerdown', input, true);
    document.addEventListener('keydown', key, true);
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR);
    cv.height = Math.floor(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function showCard(title, sub, ms, cb) {
    cardTitle.textContent = title;
    cardSub.textContent = sub;
    card.classList.add('on');
    setTimeout(function () {
      card.classList.remove('on');
      if (cb) setTimeout(cb, 380);
    }, ms);
  }

  /* ---------------------------------------------------------------------- */

  function start(which, mercy, done) {
    mount();
    onDone = done || function () {};
    act = null;

    // keep the music alive under the acts, quieter
    if (!AudioEngine.isPlaying) {
      AudioEngine.setVolume(0.4);
      try { AudioEngine.play(0); } catch (e) {}
    }

    if (which === 'catch') {
      showCard('act two ♡', 'catch the drifting hearts — click them!', 2000, function () {
        state = catchState(mercy);
        act = 'catch';
        run();
      });
    } else {
      showCard('the finale ♡', 'when the ring closes… that\'s your moment', 2000, function () {
        state = qteState(mercy);
        act = 'qte';
        run();
      });
    }
  }

  function run() {
    cancelAnimationFrame(raf);
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    g.clearRect(0, 0, W, H);
  }

  function finish(passed, retryFn) {
    const wasAct = act;
    act = null;
    stopLoop();
    if (passed) {
      AudioEngine.sfx.unlock();
      Scene.celebrate();
      showCard(wasAct === 'catch' ? 'so many ♡' : 'perfect timing ♡',
               wasAct === 'catch' ? 'you caught us.' : 'of course it was you.',
               1700, onDone);
    } else {
      showCard('almost!', 'one more try — you\'ve got this', 1500, retryFn);
    }
  }

  /* ======================================================================
     ACT II — petal catch
     ====================================================================== */

  function catchState(mercy) {
    const goal = Math.max(8, 12 - mercy * 2);       // kinder every retry
    return {
      items: [], burstsFx: [],
      caught: 0, goal: goal,
      t: 0, dur: 22,
      spawnT: 0, spawnEvery: 0.55,
      wind: 0.35
    };
  }

  function spawnItem(s) {
    const heart = Math.random() < 0.55;
    const fromTop = Math.random() < 0.7;
    s.items.push({
      heart: heart,
      x: fromTop ? Math.random() * W * 0.9 : -40,
      y: fromTop ? -40 : Math.random() * H * 0.5,
      vx: 40 + Math.random() * 110,
      vy: 46 + Math.random() * 90,
      r: heart ? 20 + Math.random() * 14 : 12 + Math.random() * 8,
      rot: Math.random() * 6.28, rotV: (Math.random() - 0.5) * 3,
      sway: Math.random() * 6.28,
      dead: false, pop: 0
    });
  }

  function catchTick(dt) {
    const s = state;
    s.t += dt;
    s.spawnT -= dt;
    if (s.spawnT <= 0 && s.t < s.dur - 2.5) {
      spawnItem(s);
      s.spawnT = s.spawnEvery * (0.7 + Math.random() * 0.6);
    }

    for (let i = s.items.length - 1; i >= 0; i--) {
      const it = s.items[i];
      if (it.dead) {
        it.pop += dt * 3.2;
        if (it.pop >= 1) s.items.splice(i, 1);
        continue;
      }
      it.sway += dt * 2.1;
      it.x += (it.vx + Math.sin(it.sway) * 26) * dt;
      it.y += it.vy * dt;
      it.rot += it.rotV * dt;
      if (it.y > H + 60 || it.x > W + 60) s.items.splice(i, 1);
    }

    stepBursts(dt);

    // time up or goal reached
    if (s.caught >= s.goal) {
      finish(true);
      return;
    }
    if (s.t >= s.dur) {
      mercyCatch++;
      finish(false, function () { start('catch', mercyCatch, onDone); });
    }
  }

  function catchDraw() {
    const s = state;
    g.clearRect(0, 0, W, H);

    // items
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      g.save();
      g.translate(it.x, it.y);
      g.rotate(it.rot);
      if (it.dead) {
        g.globalAlpha = Math.max(0, 1 - it.pop);
        g.scale(1 + it.pop * 0.8, 1 + it.pop * 0.8);
      }
      if (it.heart) {
        g.shadowColor = 'rgba(255,80,150,0.9)';
        g.shadowBlur = 18;
        const gr = g.createLinearGradient(0, -it.r, 0, it.r);
        gr.addColorStop(0, '#ff8fb6');
        gr.addColorStop(1, '#e0175d');
        g.fillStyle = gr;
        heartOn(g, 0, 0, it.r, 0);
        g.fill();
        g.shadowBlur = 0;
        g.lineWidth = 2;
        g.strokeStyle = 'rgba(255,255,255,0.65)';
        g.stroke();
      } else {
        g.globalAlpha *= 0.85;
        g.fillStyle = '#f7b3cd';
        petalOn(g, it.r);
        g.fill();
      }
      g.restore();
    }

    drawBursts();
    hudBar('hearts  ' + s.caught + ' / ' + s.goal,
           Math.min(1, s.caught / s.goal),
           Math.max(0, s.dur - s.t));
  }

  function catchInput(x, y) {
    const s = state;
    let best = -1, bestD = 1e9;
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      if (it.dead || !it.heart) continue;
      const d = Math.hypot(it.x - x, it.y - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD < s.items[best].r * 2.1) {
      const it = s.items[best];
      it.dead = true; it.pop = 0;
      s.caught++;
      burst(it.x, it.y, 14);
      AudioEngine.sfx.great();
      return;
    }
    // clicked a petal or air — soft feedback, no penalty
    AudioEngine.sfx.good();
  }

  /* ======================================================================
     ACT III — the quick-time finale
     ====================================================================== */

  function qteState(mercy) {
    const total = 6;
    return {
      total: total, hit: 0,
      cur: null, curT: 0,
      windowLo: 0.86 - mercy * 0.04,     // ring scale where the window opens
      windowHi: 1.18 + mercy * 0.06,
      speed: 1,
      waitT: 0.6,
      shake: 0, flash: 0
    };
  }

  function newPrompt(s) {
    const m = Math.min(W, H);
    s.cur = {
      x: W / 2 + (Math.random() - 0.5) * m * 0.34,
      y: H * 0.46 + (Math.random() - 0.5) * m * 0.22,
      r: m * 0.075,
      ring: 2.6,                                   // ring scale, closes to 1
      dur: (1.5 - s.hit * 0.12) / s.speed,         // faster every hit
      label: ['click!', 'now!', 'here!', 'this one!', 'again!', 'last one!'][s.hit] || 'click!'
    };
    s.curT = 0;
  }

  function qteTick(dt) {
    const s = state;
    s.flash = Math.max(0, s.flash - dt * 2.4);
    s.shake = Math.max(0, s.shake - dt * 3.5);

    if (!s.cur) {
      s.waitT -= dt;
      if (s.waitT <= 0) newPrompt(s);
      stepBursts(dt);
      return;
    }

    s.curT += dt;
    const p = s.cur;
    p.ring = 2.6 - (s.curT / p.dur) * (2.6 - 0.7);

    if (p.ring <= 0.68) {
      // sailed past the window — same prompt again, slightly slower
      s.cur = null;
      s.waitT = 0.75;
      s.speed = Math.max(0.75, s.speed * 0.92);
      s.shake = 1;
      AudioEngine.sfx.miss();
    }
    stepBursts(dt);
  }

  function qteDraw() {
    const s = state;
    g.clearRect(0, 0, W, H);

    if (s.flash > 0) {
      g.fillStyle = 'rgba(255,214,235,' + (s.flash * 0.22) + ')';
      g.fillRect(0, 0, W, H);
    }

    const p = s.cur;
    if (p) {
      const jx = s.shake ? (Math.random() - 0.5) * 10 * s.shake : 0;
      const jy = s.shake ? (Math.random() - 0.5) * 10 * s.shake : 0;
      const inWin = p.ring >= s.windowLo && p.ring <= s.windowHi;

      g.save();
      g.translate(p.x + jx, p.y + jy);

      // the target heart
      g.shadowColor = inWin ? 'rgba(255,214,90,1)' : 'rgba(255,80,150,0.85)';
      g.shadowBlur = inWin ? 34 : 20;
      const gr = g.createLinearGradient(0, -p.r, 0, p.r);
      gr.addColorStop(0, inWin ? '#ffe9a0' : '#ff8fb6');
      gr.addColorStop(1, inWin ? '#ffb13d' : '#e0175d');
      g.fillStyle = gr;
      heartOn(g, 0, 0, p.r, 0);
      g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 2.5;
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.stroke();

      // the closing ring
      g.lineWidth = inWin ? 6 : 3.5;
      g.strokeStyle = inWin ? 'rgba(255,226,120,0.95)' : 'rgba(255,255,255,0.75)';
      heartOn(g, 0, 0, p.r * p.ring, 0);
      g.stroke();

      // label
      g.font = '700 ' + Math.round(p.r * 0.42) + 'px "Baloo 2", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.shadowColor = 'rgba(74,0,46,0.9)';
      g.shadowBlur = 10;
      g.fillText(p.label, 0, p.r * 1.75);
      g.shadowBlur = 0;
      g.restore();
    }

    drawBursts();
    hudBar('moments  ' + s.hit + ' / ' + s.total, s.hit / s.total, null);
  }

  function qteInput() {
    const s = state;
    const p = s.cur;
    if (!p) return;
    const inWin = p.ring >= s.windowLo && p.ring <= s.windowHi;
    if (inWin) {
      s.hit++;
      s.flash = 1;
      burst(p.x, p.y, 22);
      AudioEngine.sfx.perfect();
      s.cur = null;
      s.waitT = 0.55;
      if (s.hit >= s.total) finish(true);
    } else {
      // too early — the ring keeps closing, no reset, just a nudge
      s.shake = 0.7;
      AudioEngine.sfx.good();
    }
  }

  /* ======================================================================
     shared bits
     ====================================================================== */

  let bursts = [];
  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const v = 120 + Math.random() * 260;
      bursts.push({
        x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
        life: 1, decay: 1.2 + Math.random() * 1.4,
        r: 2.5 + Math.random() * 4,
        heart: Math.random() < 0.4,
        rot: Math.random() * 6.28, rotV: (Math.random() - 0.5) * 10,
        tone: Math.random()
      });
    }
  }
  function stepBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= b.decay * dt;
      if (b.life <= 0) { bursts.splice(i, 1); continue; }
      b.vy += 480 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.rot += b.rotV * dt;
    }
  }
  function drawBursts() {
    for (let i = 0; i < bursts.length; i++) {
      const b = bursts[i];
      g.save();
      g.globalAlpha = Math.max(0, b.life);
      g.fillStyle = b.tone > 0.6 ? '#ffedc2' : b.tone > 0.3 ? '#ffb3d4' : '#ff6ea3';
      g.translate(b.x, b.y);
      g.rotate(b.rot);
      if (b.heart) { heartOn(g, 0, 0, b.r * 1.6, 0); g.fill(); }
      else { g.beginPath(); g.arc(0, 0, b.r * b.life, 0, 6.283); g.fill(); }
      g.restore();
    }
  }

  function hudBar(label, frac, secsLeft) {
    const w = Math.min(W * 0.6, 420);
    const x = (W - w) / 2, y = H * 0.075;
    g.save();
    g.fillStyle = 'rgba(30,2,26,0.55)';
    roundRect(g, x - 18, y - 26, w + 36, 62, 18);
    g.fill();

    g.font = '700 13px "Quicksand", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,235,245,0.95)';
    g.fillText(label.toUpperCase(), W / 2, y - 8);

    roundRect(g, x, y + 6, w, 12, 6);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fill();
    if (frac > 0.005) {
      roundRect(g, x, y + 6, Math.max(12, w * Math.min(1, frac)), 12, 6);
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#ff9ec4');
      gr.addColorStop(1, '#ff3d7f');
      g.fillStyle = gr;
      g.fill();
    }

    if (secsLeft != null) {
      g.font = '800 15px "Baloo 2", sans-serif';
      g.fillStyle = secsLeft < 5 ? '#ffd2ce' : 'rgba(255,235,245,0.9)';
      g.fillText(Math.ceil(secsLeft) + 's', x + w + 4, y + 12);
    }
    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function heartOn(g, cx, cy, s, rot) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const st = Math.sin(t);
      let px = st * st * st;
      let py = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 - 0.375;
      px *= s; py *= s;
      if (rot) {
        const c = Math.cos(rot), sn = Math.sin(rot);
        const nx = px * c - py * sn, ny = px * sn + py * c;
        px = nx; py = ny;
      }
      if (i === 0) g.moveTo(cx + px, cy + py); else g.lineTo(cx + px, cy + py);
    }
    g.closePath();
  }

  function petalOn(g, r) {
    g.beginPath();
    g.moveTo(0, -r);
    g.bezierCurveTo(r * 0.95, -r * 0.55, r * 0.62, r * 0.75, 0, r);
    g.bezierCurveTo(-r * 0.62, r * 0.75, -r * 0.95, -r * 0.55, 0, -r);
  }

  /* ---------------------------------------------------------------------- */

  function tick(now) {
    if (!act) return;
    raf = requestAnimationFrame(tick);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;

    // keep the quiet backing loop going
    if (!AudioEngine.isPlaying) {
      try { AudioEngine.play(0); } catch (e) {}
    }

    if (act === 'catch') { catchTick(dt); if (act === 'catch') catchDraw(); }
    else if (act === 'qte') { qteTick(dt); if (act === 'qte') qteDraw(); }
  }

  function input(e) {
    if (!act) return;
    if (e.target && e.target.closest && e.target.closest('.btn-quit')) return;
    if (act === 'catch') catchInput(e.clientX, e.clientY);
    else if (act === 'qte') qteInput();
  }

  function key(e) {
    if (!act) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (act === 'qte') qteInput();
      else if (act === 'catch') { /* space does nothing here — it's a mouse act */ }
    }
  }

  function abort() {
    act = null;
    state = null;
    stopLoop();
    if (card) card.classList.remove('on');
  }

  return { start: start, abort: abort,
           get active() { return !!act; },
           get _debug() {
             return {
               act: act, state: state,
               // manual clock for automated tests (rAF starves in hidden tabs)
               step: function (dt) {
                 if (act === 'catch') catchTick(dt);
                 else if (act === 'qte') qteTick(dt);
               }
             };
           } };
})();
