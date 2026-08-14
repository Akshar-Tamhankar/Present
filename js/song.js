/* ==========================================================================
   song.js — the built-in song, synthesised from scratch.

   This exists so the game is playable and *perfectly* in sync before you've
   picked a real track. The beatmap is emitted from the same pattern data as
   the music, so the notes and the audio can never drift apart.

   Implementation note: this writes samples straight into a Float32Array
   rather than building a Web Audio graph. An OfflineAudioContext version of
   this arrangement needed ~3000 nodes and took 24 SECONDS to render, because
   cost there scales with (node count × song length). Plain arithmetic does
   the same job in about a fifth of a second.

   Swap in your own MP3 via CONFIG.songUrl when you're ready.
   ========================================================================== */

window.Song = (function () {

  /* --- musical constants ------------------------------------------------ */

  const N = {
    F2: 87.31, G2: 98.00, A2: 110.00, C3: 130.81,
    F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, C6: 1046.50
  };

  // I – V – vi – IV in C. The most reliably emotional four bars in pop music.
  const PROG = [
    { pad: [N.C4, N.E4, N.G4], bass: N.C3 },   // C
    { pad: [N.B3, N.D4, N.G4], bass: N.G2 },   // G/B
    { pad: [N.A3, N.C4, N.E4], bass: N.A2 },   // Am
    { pad: [N.A3, N.C4, N.F4], bass: N.F2 }    // F
  ];

  // Melody over one 16-beat block: [beat, freq, beats-long]
  const MELODY = [
    [0.0, N.E5, 0.5], [1.0, N.D5, 0.5], [1.5, N.C5, 0.5], [2.0, N.D5, 1.0], [3.5, N.C5, 0.5],
    [4.0, N.B4, 1.0], [5.5, N.D5, 0.5], [6.0, N.B4, 1.0], [7.0, N.G4, 1.0],
    [8.0, N.A4, 1.0], [9.0, N.C5, 0.5], [9.5, N.E5, 1.0], [11.0, N.D5, 1.0],
    [12.0, N.C5, 1.0], [13.0, N.A4, 0.5], [13.5, N.C5, 0.5], [14.0, N.A4, 2.0]
  ];

  // High counter-melody, sprinkled on top in the back half.
  const SPARKLE = [
    [0.5, N.G5, 0.4], [2.5, N.C6, 0.4], [4.5, N.D5, 0.4], [6.5, N.G5, 0.4],
    [8.5, N.E5, 0.4], [10.5, N.A5, 0.4], [12.5, N.F5, 0.4], [14.5, N.C6, 0.4]
  ];

  /* --- arrangement ------------------------------------------------------ */
  const BLOCKS = [
    { len: 8,  drums: false, mel: false, spark: false, notes: 'none'    }, // intro
    { len: 16, drums: true,  mel: true,  spark: false, notes: 'quarter' }, // verse
    { len: 16, drums: true,  mel: true,  spark: true,  notes: 'swing'   },
    { len: 16, drums: true,  mel: true,  spark: true,  notes: 'eighth'  }, // chorus
    { len: 16, drums: true,  mel: true,  spark: true,  notes: 'swing'   },
    { len: 16, drums: true,  mel: true,  spark: true,  notes: 'eighth'  }, // last push
    { len: 8,  drums: false, mel: true,  spark: true,  notes: 'tail'    }  // outro
  ];

  /* --- where the clickable hearts land (beat offsets in a block) -------- */
  const PATTERNS = {
    none:    [],
    quarter: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    swing:   [0, 1, 1.5, 2, 3, 4, 4.5, 5, 6, 7, 7.5, 8, 9, 10, 10.5, 11, 12, 13, 13.5, 14],
    eighth:  [0, 0.5, 1, 2, 2.5, 3, 4, 4.5, 5, 6, 6.5, 7,
              8, 8.5, 9, 10, 10.5, 11, 12, 12.5, 13, 14, 14.5],
    tail:    [0, 2, 4, 6, 8, 12]
  };

  /* ======================================================================
     DSP primitives — everything writes additively into L / R
     ====================================================================== */

  // Deterministic noise, so every render of the song is bit-identical.
  let nseed = 1234567;
  function nrand() {
    nseed = (nseed * 1664525 + 1013904223) | 0;
    return nseed / 2147483648;
  }

  function tri(phase) {                       // phase in turns
    const s = phase - Math.floor(phase);
    return 4 * Math.abs(s - 0.5) - 1;
  }

  function kick(L, R, sr, t0, g) {
    const start = (t0 * sr) | 0, len = (0.30 * sr) | 0;
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      const f = 46 + 118 * Math.exp(-tt * 40);
      ph += f / sr;
      const env = Math.exp(-tt * 12) * (1 - Math.exp(-tt * 800));
      const v = Math.sin(ph * 6.283185) * env * g;
      L[k] += v; R[k] += v;
    }
  }

  function snare(L, R, sr, t0, g) {
    const start = (t0 * sr) | 0, len = (0.24 * sr) | 0;
    let lp = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      const env = Math.exp(-tt * 24);
      const nz = nrand();
      const hp = nz - prev; prev = nz;         // differentiator = highpass
      lp += 0.30 * (hp - lp);                  // …then smooth back down
      const body = Math.sin(6.283185 * 195 * tt) * Math.exp(-tt * 42) * 0.45;
      const v = (lp * 2.1 + body) * env * g;
      L[k] += v * 0.96; R[k] += v * 1.04;
    }
  }

  function hat(L, R, sr, t0, g) {
    const start = (t0 * sr) | 0, len = (0.075 * sr) | 0;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      const env = Math.exp(-tt * 90);
      const nz = nrand();
      const hp = nz - prev; prev = nz;
      const v = hp * env * g;
      L[k] += v * 0.85; R[k] += v * 1.15;
    }
  }

  function bass(L, R, sr, t0, freq, dur, g) {
    const start = (t0 * sr) | 0, len = ((dur + 0.05) * sr) | 0;
    let ph = 0, lp = 0;
    const a = 1 - Math.exp(-6.283185 * 320 / sr);   // one-pole lowpass @320Hz
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      ph += freq / sr;
      const env = Math.min(1, tt * 60) * Math.exp(-tt * 1.6) * (tt < dur ? 1 : 0);
      lp += a * (tri(ph) - lp);
      const v = lp * env * g;
      L[k] += v; R[k] += v;
    }
  }

  function pad(L, R, sr, t0, freqs, dur, g) {
    const start = (t0 * sr) | 0, len = ((dur + 0.15) * sr) | 0;
    const a = 1 - Math.exp(-6.283185 * 1900 / sr);
    for (let v = 0; v < freqs.length; v++) {
      const f = freqs[v] * (1 + (v - 1) * 0.0022);   // gentle detune spread
      const panL = 1 - v * 0.14, panR = 0.72 + v * 0.14;
      let ph = 0, lp = 0;
      for (let i = 0; i < len; i++) {
        const k = start + i; if (k >= L.length) break;
        const tt = i / sr;
        ph += f / sr;
        // slow swell in, hold, release out
        const atk = Math.min(1, tt / 0.30);
        const rel = tt > dur * 0.72 ? Math.max(0, 1 - (tt - dur * 0.72) / (dur * 0.30)) : 1;
        lp += a * (tri(ph) - lp);
        const s = lp * atk * rel * g;
        L[k] += s * panL; R[k] += s * panR;
      }
    }
  }

  // Music-box pluck: fundamental plus two quiet harmonics, quick decay.
  function pluck(L, R, sr, t0, freq, dur, g, pan) {
    const start = (t0 * sr) | 0, len = ((dur + 0.08) * sr) | 0;
    const decay = 3.2 / Math.max(0.12, dur);
    const pl = 1 - (pan || 0) * 0.3, pr = 1 + (pan || 0) * 0.3;
    let p1 = 0, p2 = 0, p3 = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      p1 += freq / sr; p2 += freq * 2 / sr; p3 += freq * 3.01 / sr;
      const env = Math.exp(-tt * decay) * (1 - Math.exp(-tt * 500));
      const s = (tri(p1) * 0.72 +
                 Math.sin(p2 * 6.283185) * 0.22 +
                 Math.sin(p3 * 6.283185) * 0.08) * env * g;
      L[k] += s * pl; R[k] += s * pr;
    }
  }

  /* ======================================================================
     the arrangement pass
     ====================================================================== */

  function renderPCM(bpm, sr) {
    const spb = 60 / bpm;
    const lead = 0.40;
    const tail = 2.4;

    let totalBeats = 0;
    for (let i = 0; i < BLOCKS.length; i++) totalBeats += BLOCKS[i].len;

    const duration = lead + totalBeats * spb + tail;
    const n = Math.ceil(duration * sr);
    const L = new Float32Array(n), R = new Float32Array(n);

    nseed = 1234567;
    const beats = [];
    const at = function (beat) { return lead + beat * spb; };

    let beatCursor = 0;
    let barCursor = 0;

    for (let b = 0; b < BLOCKS.length; b++) {
      const blk = BLOCKS[b];
      const base = beatCursor;
      const bars = blk.len / 4;

      // chords + bass
      for (let bar = 0; bar < bars; bar++) {
        const chord = PROG[(barCursor + bar) % PROG.length];
        const t = at(base + bar * 4);
        pad(L, R, sr, t, chord.pad, spb * 4 * 0.95, 0.085);
        if (blk.drums) bass(L, R, sr, t, chord.bass, spb * 3.5, 0.42);
      }

      // drums
      if (blk.drums) {
        for (let i = 0; i < blk.len; i++) {
          const t = at(base + i);
          if (i % 4 === 0 || i % 4 === 2) kick(L, R, sr, t, 0.80);
          if (i % 4 === 1 || i % 4 === 3) snare(L, R, sr, t, 0.30);
          hat(L, R, sr, t, i % 2 === 0 ? 0.16 : 0.09);
          hat(L, R, sr, t + spb / 2, 0.07);
        }
      }

      // melody
      if (blk.mel) {
        for (let i = 0; i < MELODY.length; i++) {
          const m = MELODY[i];
          if (m[0] >= blk.len) continue;
          pluck(L, R, sr, at(base + m[0]), m[1], m[2] * spb * 0.9, 0.20, -0.25);
        }
      }
      if (blk.spark) {
        for (let i = 0; i < SPARKLE.length; i++) {
          const m = SPARKLE[i];
          if (m[0] >= blk.len) continue;
          pluck(L, R, sr, at(base + m[0]), m[1], m[2] * spb, 0.075, 0.45);
        }
      }

      // rhythm-game notes
      const pat = PATTERNS[blk.notes] || [];
      for (let i = 0; i < pat.length; i++) {
        if (pat[i] >= blk.len) continue;
        beats.push(+at(base + pat[i]).toFixed(4));
      }

      beatCursor += blk.len;
      barCursor  += bars;
    }

    /* --- master: soft-clip, then normalise to a sane peak --------------- */
    let peak = 0;
    for (let i = 0; i < n; i++) {
      // tanh-ish saturation keeps transients from cracking
      const l = L[i], r = R[i];
      const sl = l / (1 + Math.abs(l) * 0.35);
      const sr2 = r / (1 + Math.abs(r) * 0.35);
      L[i] = sl; R[i] = sr2;
      const m = Math.abs(sl) > Math.abs(sr2) ? Math.abs(sl) : Math.abs(sr2);
      if (m > peak) peak = m;
    }
    const gain = peak > 0.0001 ? (0.92 / peak) : 1;
    for (let i = 0; i < n; i++) { L[i] *= gain; R[i] *= gain; }

    // fade the very start and end so there's no click
    const fade = (0.03 * sr) | 0;
    for (let i = 0; i < fade; i++) {
      const f = i / fade;
      L[i] *= f; R[i] *= f;
      L[n - 1 - i] *= f; R[n - 1 - i] *= f;
    }

    return { L: L, R: R, beats: beats, duration: duration, lead: lead, spb: spb };
  }

  /* ======================================================================
     public
     ====================================================================== */

  /** Returns { buffer, beats, bpm, duration, lead }. */
  async function render(bpm) {
    bpm = bpm || 100;
    const ctx = AudioEngine.init();
    const sr = ctx.sampleRate;

    const pcm = renderPCM(bpm, sr);

    const buffer = ctx.createBuffer(2, pcm.L.length, sr);
    if (buffer.copyToChannel) {
      buffer.copyToChannel(pcm.L, 0);
      buffer.copyToChannel(pcm.R, 1);
    } else {
      buffer.getChannelData(0).set(pcm.L);
      buffer.getChannelData(1).set(pcm.R);
    }

    return {
      buffer: buffer, beats: pcm.beats, bpm: bpm,
      duration: pcm.duration, lead: pcm.lead, spb: pcm.spb
    };
  }

  return { render: render, PROG: PROG };
})();
