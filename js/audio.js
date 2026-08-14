/* ==========================================================================
   audio.js — Web Audio engine + the precise song clock.

   Why not just use <audio>.currentTime? Because it's quantised to the
   browser's render quantum and jitters by 20–50ms — which is the entire
   difference between "perfect" and "miss" in a rhythm game. AudioContext
   gives us a sample-accurate clock instead.
   ========================================================================== */

window.AudioEngine = (function () {

  let ctx = null;
  let buffer = null;      // the decoded / rendered song
  let source = null;      // currently playing BufferSourceNode
  let master = null;

  let startedAt = 0;      // ctx.currentTime when the song began
  let playing = false;
  let pausedAt = 0;

  /* --- one-shot SFX bus (hit sounds) ------------------------------------ */
  let sfxGain = null;

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(master);

    return ctx;
  }

  // Browsers suspend the context until a real user gesture. Call from a click.
  async function unlock() {
    init();
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx.state === 'running';
  }

  /* --- loading ---------------------------------------------------------- */

  async function loadUrl(url) {
    init();
    const res = await fetch(url);
    if (!res.ok) throw new Error('Could not load ' + url + ' (' + res.status + ')');
    const bytes = await res.arrayBuffer();
    buffer = await ctx.decodeAudioData(bytes);
    return buffer;
  }

  function setBuffer(buf) { buffer = buf; return buffer; }

  function duration() { return buffer ? buffer.duration : 0; }
  function sampleRate() { return ctx ? ctx.sampleRate : 44100; }

  /* --- transport -------------------------------------------------------- */

  function play(atSeconds) {
    if (!buffer) throw new Error('No song loaded');
    stop();
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(master);

    const offset = atSeconds || 0;
    // Schedule a hair in the future so the first note isn't clipped by
    // the scheduling deadline.
    const when = ctx.currentTime + 0.06;
    source.start(when, offset);

    startedAt = when - offset;
    playing = true;
    pausedAt = 0;

    source.onended = function () {
      if (source && source.__stoppedByUs) return;
      playing = false;
    };
    return startedAt;
  }

  function stop() {
    if (source) {
      source.__stoppedByUs = true;
      try { source.stop(); } catch (e) { /* already stopped */ }
      try { source.disconnect(); } catch (e) {}
      source = null;
    }
    playing = false;
  }

  function fadeOut(seconds) {
    if (!playing) return;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0.0001, t + seconds);
    setTimeout(function () {
      stop();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0.9, ctx.currentTime);
    }, seconds * 1000 + 40);
  }

  /**
   * Current position in the song, in seconds.
   * Negative during the lead-in (before sample 0), which is what lets us
   * run a count-in without any special-casing.
   */
  function position() {
    if (!ctx) return 0;
    if (!playing) return pausedAt;
    return ctx.currentTime - startedAt;
  }

  /** Wall-clock now, same timebase as position(). Used to timestamp input. */
  function now() { return ctx ? ctx.currentTime : 0; }

  /** Convert a DOM event timeStamp into a song position (lower latency). */
  function positionAtEvent(evt) {
    // performance.now() and event.timeStamp share a timebase in every
    // browser we care about; AudioContext.currentTime does not, so we
    // measure the offset between them once per call.
    const nowPerf = performance.now();
    const drift = (typeof evt.timeStamp === 'number' && evt.timeStamp > 0 && evt.timeStamp <= nowPerf)
      ? (nowPerf - evt.timeStamp) / 1000
      : 0;
    // Ignore absurd drift (some browsers hand back epoch-based stamps).
    const safeDrift = drift > 0.25 ? 0 : drift;
    return position() - safeDrift;
  }

  /* --- little synthesised hit sounds ------------------------------------ */

  function blip(freq, dur, type, gain) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain == null ? 0.3 : gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  const SFX = {
    perfect: function () { blip(880, 0.16, 'triangle', 0.34); blip(1320, 0.13, 'sine', 0.2); },
    great:   function () { blip(740, 0.14, 'triangle', 0.28); },
    good:    function () { blip(560, 0.12, 'triangle', 0.22); },
    miss:    function () { blip(180, 0.11, 'sawtooth', 0.10); },
    unlock:  function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        setTimeout(function () { blip(f, 0.5, 'triangle', 0.26); }, i * 95);
      });
    }
  };

  function setVolume(v) { if (master) master.gain.value = v; }

  return {
    init: init, unlock: unlock,
    loadUrl: loadUrl, setBuffer: setBuffer,
    play: play, stop: stop, fadeOut: fadeOut, setVolume: setVolume,
    position: position, positionAtEvent: positionAtEvent, now: now,
    duration: duration, sampleRate: sampleRate,
    sfx: SFX,
    get ctx() { return ctx; },
    get isPlaying() { return playing; }
  };
})();
