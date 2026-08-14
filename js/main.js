/* ==========================================================================
   main.js — screen flow and wiring.
   title → how to play → game → (result) → gift box → reveal
   ========================================================================== */

(function () {

  const $  = function (s) { return document.querySelector(s); };
  const $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  let song = null;          // { beats, beatGrid }
  let loaded = false;
  let loading = null;

  /* ====================================================================== */
  /*  screens                                                                */
  /* ====================================================================== */

  let current = 'title';

  function show(id) {
    $$('.screen').forEach(function (s) { s.classList.remove('is-active'); });
    const el = document.getElementById('screen-' + id);
    if (el) el.classList.add('is-active');
    current = id;
    document.body.dataset.screen = id;
    if (window.FX) {
      if (id === 'title') FX.titleIn();
      else if (id === 'result') FX.statsCount();
    }
  }

  /* ====================================================================== */
  /*  personalisation                                                        */
  /* ====================================================================== */

  function applyConfig() {
    $$('[data-slot]').forEach(function (el) {
      const key = el.dataset.slot;
      if (CONFIG[key] != null && CONFIG[key] !== '') el.textContent = CONFIG[key];
    });
    document.title = CONFIG.name ? CONFIG.name + ' ♡' : '♡';
  }

  /* ====================================================================== */
  /*  song loading                                                           */
  /* ====================================================================== */

  function loadSong() {
    if (loading) return loading;

    loading = (async function () {
      if (CONFIG.songUrl) {
        // --- your own track ---
        await AudioEngine.loadUrl(CONFIG.songUrl);
        const dur = AudioEngine.duration();
        let beats = Beatmap.CUSTOM && Beatmap.CUSTOM.length
          ? Beatmap.clean(Beatmap.CUSTOM)
          : Beatmap.fromBpm(CONFIG.bpm || 100, 0.5, dur, 1);
        // Beat grid for the background throb: every other note is close enough.
        const grid = [];
        for (let i = 0; i < beats.length; i += 2) grid.push(beats[i]);
        // synthesise a reasonable ride for a custom track: tunnel through
        // the middle drops, a catch break between them, QTE at the end
        const ph = [
          { mode: 'target', start: 0,          end: dur * 0.22 },
          { mode: 'volley', start: dur * 0.22, end: dur * 0.32 },
          { mode: 'tunnel', start: dur * 0.32, end: dur * 0.46 },
          { mode: 'catch',  start: dur * 0.46, end: dur * 0.55 },
          { mode: 'flight', start: dur * 0.55, end: dur * 0.65 },
          { mode: 'flip',   start: dur * 0.65, end: dur * 0.75 },
          { mode: 'orbit',  start: dur * 0.75, end: dur * 0.88 },
          { mode: 'qte',    start: dur * 0.88, end: dur * 0.97 },
          { mode: 'target', start: dur * 0.97, end: dur + 5 }
        ];
        beats = beats.filter(function (t) {
          return !(t >= dur * 0.46 && t < dur * 0.55);   // catch window owns its time
        });
        song = { beats: beats, beatGrid: grid, phases: ph,
                 spb: 60 / (CONFIG.bpm || 100),
                 kiai: [{ start: dur * 0.30, end: dur * 0.48 },
                        { start: dur * 0.70, end: dur * 0.88 }] };
      } else {
        // --- built-in generated track ---
        const r = await Song.render(CONFIG.bpm || 100);
        AudioEngine.setBuffer(r.buffer);
        const spb = 60 / r.bpm;
        const grid = [];
        for (let t = r.lead; t < r.duration - 2; t += spb) grid.push(t);
        song = { beats: r.beats, beatGrid: grid, kiai: r.kiai || [],
                 phases: r.phases || [], spb: r.spb };
      }
      loaded = true;
      return song;
    })();

    return loading;
  }

  /* ====================================================================== */
  /*  flow                                                                   */
  /* ====================================================================== */

  async function begin() {
    const btn = $('#btn-start');
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.querySelector('span').textContent = 'warming up…';

    try {
      await AudioEngine.unlock();
      await loadSong();
    } catch (err) {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'try again';
      console.error(err);
      const hint = $('.title-hint');
      hint.textContent = 'couldn\'t load the music — ' + err.message;
      hint.style.color = '#ffd0d0';
      return;
    }

    btn.classList.remove('is-loading');
    btn.disabled = false;
    btn.querySelector('span').textContent = 'press to begin';
    show('howto');
  }

  function playRound() {
    show('game');
    Game.load(song.beats, {
      beatGrid: song.beatGrid,
      kiai: song.kiai,
      phases: song.phases,
      spb: song.spb,
      approach: CONFIG.approachTime,
      offsetMs: CONFIG.audioOffsetMs,
      onFinish: onRoundEnd
    });
    // Small beat of breathing room so the screen transition finishes before
    // the first note is already on its way in.
    setTimeout(function () {
      AudioEngine.play(0);
      Game.start();
    }, 420);
  }

  function onRoundEnd(res) {
    AudioEngine.fadeOut(0.8);

    if (res.passed) {
      // the song was the whole gauntlet — straight to the box
      setTimeout(function () {
        show('gift');
        Gift.reset(function () { show('reveal'); revealSequence(); });
      }, 900);
      return;
    }

    // Didn't fill the meter — stay warm about it.
    const s = res.stats;
    $('#result-title').textContent = res.fill > 0.8 ? 'so close!' : 'not quite yet';
    $('#result-sub').textContent = res.attempts >= 2
      ? "i'll make it a little easier this time. promise."
      : 'the meter needs to be full. you\'ve got this.';
    $('#result-stats').innerHTML =
      stat('perfect', s.perfect) + stat('lovely', s.great) + stat('good', s.good) +
      stat('missed', s.miss) + stat('best combo', s.best);
    setTimeout(function () { show('result'); }, 700);
  }

  function stat(label, n) {
    return '<div class="stat"><b>' + n + '</b><i>' + label + '</i></div>';
  }

  function revealSequence() {
    FX.reveal();
  }

  function restart() {
    Game.stop();
    AudioEngine.stop();
    AudioEngine.setVolume(0.9);
    Scene.setMode('ambient');
    show('title');
  }

  /* ====================================================================== */
  /*  gameplay input                                                         */
  /* ====================================================================== */

  function onPointerDown(e) {
    if (current !== 'game') return;
    if (e.target.closest('.btn-quit')) return;
    Game.input(e);
  }

  function onKey(e) {
    if (e.code === 'Space' || e.code === 'Enter') {
      if (current === 'game') {
        e.preventDefault();
        if (!e.repeat) Game.input(e);
      } else if (current === 'cal') {
        e.preventDefault();
        if (!e.repeat) calTap(e);
      }
    }
    if (e.key === 'Escape' && current === 'game') restart();
  }

  /* ====================================================================== */
  /*  calibration                                                            */
  /* ====================================================================== */

  const cal = { on: false, beats: [], taps: [], timer: 0, next: 0, spb: 0.6 };

  function calStart() {
    show('cal');
    cal.on = true; cal.beats = []; cal.taps = [];
    $('#cal-read').textContent = 'taps: 0';

    AudioEngine.unlock().then(function () {
      const ctx = AudioEngine.ctx;
      cal.next = ctx.currentTime + 0.4;
      cal.timer = setInterval(function () {
        if (!cal.on) return;
        const ahead = ctx.currentTime + 0.25;
        while (cal.next < ahead) {
          calClick(cal.next);
          cal.beats.push(cal.next);
          const at = cal.next;
          const delay = Math.max(0, (at - ctx.currentTime) * 1000);
          setTimeout(function () {
            const d = document.getElementById('cal-dot');
            if (!d) return;
            d.classList.remove('hit'); void d.offsetWidth; d.classList.add('hit');
          }, delay);
          cal.next += cal.spb;
        }
      }, 60);
    });
  }

  function calClick(when) {
    const ctx = AudioEngine.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 1500;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.18, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(g); g.connect(ctx.destination);
    o.start(when); o.stop(when + 0.08);
  }

  function calTap(e) {
    if (!cal.on || !cal.beats.length) return;
    const t = AudioEngine.now();
    let bestD = Infinity;
    for (let i = cal.beats.length - 1; i >= 0 && i > cal.beats.length - 12; i--) {
      const d = t - cal.beats[i];
      if (Math.abs(d) < Math.abs(bestD)) bestD = d;
    }
    if (Math.abs(bestD) > cal.spb * 0.5) return;      // wild tap, ignore
    cal.taps.push(bestD * 1000);
    const med = median(cal.taps);
    $('#cal-read').textContent = 'taps: ' + cal.taps.length +
      (cal.taps.length >= 4 ? '  ·  offset ' + Math.round(med) + 'ms' : '');
  }

  function median(a) {
    const s = a.slice().sort(function (x, y) { return x - y; });
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function calStop() {
    cal.on = false;
    clearInterval(cal.timer);
  }

  function calSave() {
    if (cal.taps.length >= 4) {
      const off = Math.max(-250, Math.min(250, median(cal.taps)));
      CONFIG.audioOffsetMs = off;
      try { localStorage.setItem('gift.offset', String(off)); } catch (e) {}
    }
    calStop();
    show('howto');
  }

  function calReset() {
    CONFIG.audioOffsetMs = 0;
    cal.taps = [];
    try { localStorage.removeItem('gift.offset'); } catch (e) {}
    $('#cal-read').textContent = 'taps: 0  ·  offset 0ms';
  }

  /* ====================================================================== */
  /*  boot                                                                   */
  /* ====================================================================== */

  function boot() {
    applyConfig();
    Scene.mount();
    Scene.setClock(function () { return Game.songTime(); });

    try {
      const saved = localStorage.getItem('gift.offset');
      if (saved != null) CONFIG.audioOffsetMs = parseFloat(saved) || 0;
    } catch (e) {}

    $('#btn-start').addEventListener('click', begin);
    $('#btn-play').addEventListener('click', playRound);
    $('#btn-retry').addEventListener('click', playRound);
    $('#btn-quit').addEventListener('click', restart);
    $('#btn-again').addEventListener('click', restart);
    $('#btn-calibrate').addEventListener('click', calStart);
    $('#btn-cal-save').addEventListener('click', calSave);
    $('#btn-cal-reset').addEventListener('click', calReset);
    $('#cal-dot').addEventListener('pointerdown', calTap);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    FX.mountTilt();

    // A backgrounded tab throttles rAF and the song runs on without us, so
    // the run is unsalvageable. Grace period first: brief blips (screenshots,
    // window-manager flicker) shouldn't kill a run. Then drop back to the
    // ready screen, not the title — one click to pick it up again.
    let hiddenTimer = 0;
    document.addEventListener('visibilitychange', function () {
      if (window.__keepAlive) return;   // console escape hatch for automation
      if (document.hidden) {
        hiddenTimer = setTimeout(function () {
          if (document.hidden && current === 'game' && Game.isRunning) {
            Game.stop();
            AudioEngine.stop();
            show('howto');
          }
        }, 350);
      } else {
        clearTimeout(hiddenTimer);
      }
    });

    show('title');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
