/* ==========================================================================
   game.js — timing, judging, scoring.

   Design note: this game cannot be *lost*, only not-yet-won. A miss costs you
   combo and meter progress, never anything you'd already earned, and the bar
   to clear is deliberately low (CONFIG.fillThreshold). It's a gift, not a
   test. If someone does fall short, the windows widen on the next attempt.
   ========================================================================== */

window.Game = (function () {

  const els = {};
  let notes = [];
  let beatGrid = [];
  let beatIdx = 0;

  let running = false;
  let raf = 0;
  let attempts = 0;

  let stats = null;
  let win = { perfect: 85, great: 145, good: 205 };
  let approach = 1.55;
  let offsetMs = 0;
  let endsAt = 0;
  let countInFrom = 0;
  let kiaiWindows = [];
  let inKiai = false;

  let onFinish = function () {};

  const VALUE = { perfect: 1.0, great: 0.85, good: 0.6 };
  const PRAISE = {
    perfect: ['PERFECT', 'FLAWLESS', 'ADORE YOU', 'IN SYNC'],
    great:   ['LOVELY', 'GREAT', 'SO GOOD'],
    good:    ['nice', 'good', 'okay!'],
    miss:    ['oops', 'missed', 'hm'],
    stray:   ['too soon!', 'wait for it', 'easy…']
  };

  /* ====================================================================== */

  function cacheEls() {
    els.meterFill = document.getElementById('meter-fill');
    els.meterPct  = document.getElementById('meter-pct');
    els.combo     = document.getElementById('combo');
    els.comboNum  = document.getElementById('combo-num');
    els.judge     = document.getElementById('judge');
    els.countin   = document.getElementById('countin');
  }

  /**
   * beats: array of times (seconds into the audio) where a note lands.
   * opts:  { beatGrid, approach, windows, offsetMs, onFinish }
   */
  function load(beats, opts) {
    if (!els.meterFill) cacheEls();
    opts = opts || {};

    notes = beats.slice().sort(function (a, b) { return a - b; })
                 .map(function (t) { return { t: t, judged: null, off: 0 }; });

    beatGrid = (opts.beatGrid || []).slice().sort(function (a, b) { return a - b; });
    approach = opts.approach || CONFIG.approachTime || 1.55;
    offsetMs = opts.offsetMs || 0;
    onFinish = opts.onFinish || function () {};
    kiaiWindows = opts.kiai || [];
    inKiai = false;
    Scene.setKiai(false);

    // Mercy: after a failed attempt, widen the windows.
    const base = opts.windows || CONFIG.windows;
    const mercy = Math.max(0, attempts - (CONFIG.mercyAfter || 1) + 1);
    const k = Math.pow(1.25, mercy);
    win = { perfect: base.perfect * k, great: base.great * k, good: base.good * k };

    endsAt = (notes.length ? notes[notes.length - 1].t : 0) + 1.6;
    countInFrom = notes.length ? notes[0].t : 0;

    stats = { perfect: 0, great: 0, good: 0, miss: 0, stray: 0,
              combo: 0, best: 0, units: 0, total: notes.length };

    Scene.setNotes(notes, approach);
    renderHud(true);
    return notes.length;
  }

  function start() {
    if (!notes.length) return;
    attempts++;
    beatIdx = 0;
    running = true;
    Scene.setMode('play');
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    Scene.setMode('ambient');
  }

  function songTime() { return AudioEngine.position() - offsetMs / 1000; }

  /* ====================================================================== */
  /*  input                                                                  */
  /* ====================================================================== */

  function input(evt) {
    if (!running) return;
    const t = (evt ? AudioEngine.positionAtEvent(evt) : AudioEngine.position()) - offsetMs / 1000;
    const hitX = evt && typeof evt.clientX === 'number' && evt.clientX > 0 ? evt.clientX : null;
    const hitY = evt && typeof evt.clientY === 'number' && evt.clientY > 0 ? evt.clientY : null;

    // nearest unjudged note
    let best = -1, bestD = Infinity;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.judged) continue;
      const d = Math.abs(n.t - t);
      if (d < bestD) { bestD = d; best = i; }
      else if (n.t > t + 1) break;          // sorted — nothing closer ahead
    }

    const ms = bestD * 1000;
    if (best < 0 || ms > win.good) { judgeStray(hitX, hitY); return; }

    const n = notes[best];
    n.off = (t - n.t) * 1000;
    const q = ms <= win.perfect ? 'perfect' : ms <= win.great ? 'great' : 'good';
    n.judged = q;

    stats[q]++;
    stats.units += VALUE[q];
    stats.combo++;
    if (stats.combo > stats.best) stats.best = stats.combo;

    Scene.punch(q);
    Scene.burst(q);
    AudioEngine.sfx[q]();
    Scene.judgment(q, praise(q), hitX, hitY);
    if (stats.combo > 0 && stats.combo % 10 === 0) Scene.milestone(stats.combo);
    renderHud();
  }

  function judgeStray(hitX, hitY) {
    stats.stray++;
    stats.combo = 0;
    Scene.punch('stray');
    AudioEngine.sfx.miss();
    Scene.judgment('stray', praise('stray'), hitX, hitY);
    renderHud();
  }

  /* ====================================================================== */
  /*  frame                                                                  */
  /* ====================================================================== */

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);

    const t = songTime();

    // notes that sailed past
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.judged) continue;
      if (n.t < t - win.good / 1000) {
        n.judged = 'miss';
        stats.miss++;
        stats.combo = 0;
        Scene.judgment('miss', praise('miss'), null, null);
        renderHud();
      } else if (n.t > t + 0.5) break;
    }

    // kiai (fever) sections
    let fever = false;
    for (let i = 0; i < kiaiWindows.length; i++) {
      if (t >= kiaiWindows[i].start && t < kiaiWindows[i].end) { fever = true; break; }
    }
    if (fever !== inKiai) {
      inKiai = fever;
      Scene.setKiai(fever);
      const track = document.querySelector('.meter-track');
      if (track) track.classList.toggle('fever', fever);
    }

    // musical throb
    while (beatIdx < beatGrid.length && beatGrid[beatIdx] <= t) {
      Scene.pulse(beatIdx % 4 === 0 ? 1.15 : 0.6);
      beatIdx++;
    }

    // count-in
    const untilFirst = countInFrom - t;
    if (untilFirst > 0 && untilFirst < 3.4) {
      const n = Math.ceil(untilFirst / (beatGrid.length > 1 ? (beatGrid[1] - beatGrid[0]) : 0.6));
      els.countin.textContent = n <= 3 ? '♥'.repeat(Math.max(1, n)) : '';
      els.countin.classList.add('on');
    } else if (els.countin.classList.contains('on') && untilFirst <= 0) {
      els.countin.classList.remove('on');
      els.countin.textContent = '';
    }

    if (t >= endsAt) finish();
  }

  function finish() {
    stop();
    const need = stats.total * (CONFIG.fillThreshold || 0.55);
    const fill = need > 0 ? Math.min(1, stats.units / need) : 1;
    const passed = fill >= 0.999;
    const acc = stats.total ? (stats.perfect + stats.great + stats.good) / stats.total : 0;
    onFinish({ passed: passed, fill: fill, accuracy: acc, stats: stats, attempts: attempts });
  }

  /* ====================================================================== */
  /*  hud                                                                    */
  /* ====================================================================== */

  function fillRatio() {
    const need = stats.total * (CONFIG.fillThreshold || 0.55);
    return need > 0 ? Math.min(1, stats.units / need) : 0;
  }

  function renderHud(reset) {
    const f = reset ? 0 : fillRatio();
    els.meterFill.style.width = (f * 100).toFixed(1) + '%';
    els.meterPct.textContent = Math.round(f * 100) + '%';
    els.meterFill.classList.toggle('full', f >= 0.999);

    const c = reset ? 0 : stats.combo;
    els.comboNum.textContent = c;
    els.combo.classList.toggle('on', c >= 3);
    if (c >= 3) {
      els.combo.classList.remove('bump');
      void els.combo.offsetWidth;         // restart the animation
      els.combo.classList.add('bump');
    }
  }

  /** Pick a random line for a judgment — rendered by Scene at the hit point. */
  function praise(q) {
    const list = PRAISE[q] || [''];
    return list[(Math.random() * list.length) | 0];
  }

  /* ====================================================================== */

  return {
    load: load, start: start, stop: stop, input: input,
    songTime: songTime,
    get isRunning() { return running; },
    get attempts() { return attempts; },
    get stats() { return stats; }
  };
})();
