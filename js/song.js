/* ==========================================================================
   song.js — the built-in track, synthesised from scratch. 128 BPM, real
   build-ups, real drops.

   The song IS the level. Every block declares a gameplay mode, and the game
   morphs to match: vista rhythm → neon tunnel → catch interlude → second
   drop → QTE finale. Beatmap, kiai windows and phase map all come from the
   same arrangement table, so nothing can ever drift.

   Rendered straight into a Float32Array (a Web Audio graph at this density
   took 24s to render; arithmetic takes a fraction of a second).
   ========================================================================== */

window.Song = (function () {

  /* --- notes ------------------------------------------------------------ */

  const N = {
    F2: 87.31, G2: 98.00, A2: 110.00, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00,
    A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50, D6: 1174.66, E6: 1318.51
  };

  // I – V/B – vi – IV in C, the heartbeat of every anthem
  const PROG = [
    { pad: [N.C4, N.E4, N.G4], bass: N.C3, arp: [N.C4, N.E4, N.G4, N.C5, N.E5, N.C5, N.G4, N.E4] },
    { pad: [N.B3, N.D4, N.G4], bass: N.G2, arp: [N.B3, N.D4, N.G4, N.B4, N.D5, N.B4, N.G4, N.D4] },
    { pad: [N.A3, N.C4, N.E4], bass: N.A2, arp: [N.A3, N.C4, N.E4, N.A4, N.C5, N.A4, N.E4, N.C4] },
    { pad: [N.A3, N.C4, N.F4], bass: N.F2, arp: [N.F3, N.A3, N.C4, N.F4, N.A4, N.F4, N.C4, N.A3] }
  ];

  // verse melody — music box, gentle
  const VERSE = [
    [0.0, N.E5, 0.5], [1.0, N.D5, 0.5], [1.5, N.C5, 0.5], [2.0, N.D5, 1.0], [3.5, N.C5, 0.5],
    [4.0, N.B4, 1.0], [5.5, N.D5, 0.5], [6.0, N.B4, 1.0], [7.0, N.G4, 1.0],
    [8.0, N.A4, 1.0], [9.0, N.C5, 0.5], [9.5, N.E5, 1.0], [11.0, N.D5, 1.0],
    [12.0, N.C5, 1.0], [13.0, N.A4, 0.5], [13.5, N.C5, 0.5], [14.0, N.A4, 2.0]
  ];

  // drop hook — saw lead, 8th-note anthem
  const HOOK = [
    [0, N.E5], [0.5, N.G5], [1, N.C6], [1.5, N.G5], [2, N.A5], [2.5, N.G5], [3, N.E5], [3.5, N.D5],
    [4, N.D5], [4.5, N.G5], [5, N.B5], [5.5, N.G5], [6, N.G5], [6.5, N.F5], [7, N.E5], [7.5, N.D5],
    [8, N.C5], [8.5, N.E5], [9, N.A5], [9.5, N.E5], [10, N.C6], [10.5, N.A5], [11, N.E5], [11.5, N.C5],
    [12, N.F5], [12.5, N.A5], [13, N.C6], [13.5, N.A5], [14, N.G5], [14.5, N.A5], [15, N.B5], [15.5, N.D6]
  ];

  /* --- the arrangement --------------------------------------------------
     mode: 'target' | 'tunnel' | 'catch' | 'qte'
     feel: 'soft' | 'groove' | 'build' | 'drop' | 'finale'
     ---------------------------------------------------------------------- */
  const BLOCKS = [
    { len: 8,  feel: 'soft',   mode: 'target', notes: 'none'    },  // intro
    { len: 16, feel: 'groove', mode: 'target', notes: 'quarter' },  // verse A
    { len: 8,  feel: 'build',  mode: 'target', notes: 'buildup' },  // build 1
    { len: 16, feel: 'drop',   mode: 'tunnel', notes: 'drop', kiai: true },   // DROP 1
    { len: 8,  feel: 'soft',   mode: 'catch',  notes: 'none'    },  // breakdown → catch
    { len: 8,  feel: 'groove', mode: 'target', notes: 'swing'   },  // verse B
    { len: 8,  feel: 'build',  mode: 'tunnel', notes: 'buildup' },  // build 2 (tunnel opens early)
    { len: 16, feel: 'drop',   mode: 'tunnel', notes: 'drop', kiai: true },   // DROP 2
    { len: 8,  feel: 'finale', mode: 'qte',    notes: 'qte'     },  // QTE finale
    { len: 4,  feel: 'soft',   mode: 'target', notes: 'none'    }   // outro
  ];

  const PATTERNS = {
    none:    [],
    quarter: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    swing:   [0, 1, 1.5, 2, 3, 4, 4.5, 5, 6, 7, 7.5],
    buildup: [0, 1, 2, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5],
    drop:    [0, 0.5, 1, 2, 2.5, 3, 4, 4.5, 5, 6, 6.5, 7,
              8, 8.5, 9, 10, 10.5, 11, 12, 12.5, 13, 14, 14.5, 15],
    qte:     [0.5, 2.5, 4.5, 6.5]
  };

  /* ======================================================================
     DSP — everything writes additively into L / R
     ====================================================================== */

  let nseed = 1234567;
  function nrand() {
    nseed = (nseed * 1664525 + 1013904223) | 0;
    return nseed / 2147483648;
  }

  function tri(ph) { const s = ph - Math.floor(ph); return 4 * Math.abs(s - 0.5) - 1; }
  function saw(ph) { const s = ph - Math.floor(ph); return 2 * s - 1; }

  /** Sidechain pump: everything ducks at each beat, EDM-style. */
  function pump(tt, spb, depth) {
    const tb = tt % spb;
    return 1 - depth * Math.exp(-tb * 16);
  }

  function kick(L, R, sr, t0, g) {
    const start = (t0 * sr) | 0, len = (0.32 * sr) | 0;
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      const f = 44 + 130 * Math.exp(-tt * 38);
      ph += f / sr;
      const env = Math.exp(-tt * 11) * (1 - Math.exp(-tt * 900));
      const punch = Math.exp(-tt * 200) * 0.35 * (nrand());
      const v = (Math.sin(ph * 6.283185) + punch) * env * g;
      L[k] += v; R[k] += v;
    }
  }

  function snare(L, R, sr, t0, g) {
    const start = (t0 * sr) | 0, len = (0.22 * sr) | 0;
    let lp = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      const env = Math.exp(-tt * 26);
      const nz = nrand();
      const hp = nz - prev; prev = nz;
      lp += 0.32 * (hp - lp);
      const body = Math.sin(6.283185 * 200 * tt) * Math.exp(-tt * 46) * 0.4;
      const v = (lp * 2.2 + body) * env * g;
      L[k] += v * 0.95; R[k] += v * 1.05;
    }
  }

  function hat(L, R, sr, t0, g) {
    const start = (t0 * sr) | 0, len = (0.06 * sr) | 0;
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      const env = Math.exp(-tt * 110);
      const nz = nrand();
      const hp = nz - prev; prev = nz;
      const v = hp * env * g;
      L[k] += v * 0.8; R[k] += v * 1.2;
    }
  }

  /** Long noise wash — crash at section starts. */
  function crash(L, R, sr, t0, g) {
    const start = (t0 * sr) | 0, len = (1.4 * sr) | 0;
    let lp = 0, prev = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      const env = Math.exp(-tt * 3.2);
      const nz = nrand();
      const hp = nz - prev; prev = nz;
      lp += 0.6 * (hp - lp);
      const v = lp * env * g;
      L[k] += v * 0.9; R[k] += v * 1.1;
    }
  }

  /** White-noise riser sweeping up into a drop. */
  function riser(L, R, sr, t0, dur, g) {
    const start = (t0 * sr) | 0, len = (dur * sr) | 0;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const u = i / len;
      const cut = 0.04 + u * u * 0.9;              // filter opens as it climbs
      lp += cut * (nrand() - lp);
      const env = u * u * (1 - Math.exp(-(1 - u) * 60));
      const v = lp * env * g;
      L[k] += v * (1 - u * 0.5); R[k] += v * (0.5 + u * 0.5);
    }
  }

  /** Accelerating snare roll — the classic bar-before-the-drop. */
  function roll(L, R, sr, t0, beats, spb, g) {
    const divs = [1, 1, 2, 2, 4, 4, 8, 8];         // per beat
    let t = t0;
    for (let b = 0; b < beats; b++) {
      const d = divs[Math.min(divs.length - 1, b)];
      for (let i = 0; i < d; i++) {
        snare(L, R, sr, t + (i / d) * spb, g * (0.5 + 0.5 * (b / beats)));
      }
      t += spb;
    }
  }

  function bass(L, R, sr, t0, freq, dur, g, spb, ducked) {
    const start = (t0 * sr) | 0, len = ((dur + 0.05) * sr) | 0;
    let ph = 0, lp = 0;
    const a = 1 - Math.exp(-6.283185 * 360 / sr);
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      ph += freq / sr;
      const env = Math.min(1, tt * 70) * (tt < dur ? 1 : Math.exp(-(tt - dur) * 30));
      lp += a * ((saw(ph) * 0.55 + tri(ph) * 0.45) - lp);
      const duck = ducked ? pump(t0 + tt, spb, 0.6) : 1;
      const v = lp * env * g * duck;
      L[k] += v; R[k] += v;
    }
  }

  function pad(L, R, sr, t0, freqs, dur, g, spb, ducked) {
    const start = (t0 * sr) | 0, len = ((dur + 0.15) * sr) | 0;
    const a = 1 - Math.exp(-6.283185 * 2100 / sr);
    for (let v0 = 0; v0 < freqs.length; v0++) {
      const f = freqs[v0] * (1 + (v0 - 1) * 0.0025);
      const panL = 1 - v0 * 0.15, panR = 0.7 + v0 * 0.15;
      let ph = 0, lp = 0;
      for (let i = 0; i < len; i++) {
        const k = start + i; if (k >= L.length) break;
        const tt = i / sr;
        ph += f / sr;
        const atk = Math.min(1, tt / 0.25);
        const rel = tt > dur * 0.7 ? Math.max(0, 1 - (tt - dur * 0.7) / (dur * 0.32)) : 1;
        lp += a * (tri(ph) - lp);
        const duck = ducked ? pump(t0 + tt, spb, 0.5) : 1;
        const s = lp * atk * rel * g * duck;
        L[k] += s * panL; R[k] += s * panR;
      }
    }
  }

  function pluck(L, R, sr, t0, freq, dur, g, pan) {
    const start = (t0 * sr) | 0, len = ((dur + 0.08) * sr) | 0;
    const decay = 3.4 / Math.max(0.12, dur);
    const pl = 1 - (pan || 0) * 0.3, pr = 1 + (pan || 0) * 0.3;
    let p1 = 0, p2 = 0, p3 = 0;
    for (let i = 0; i < len; i++) {
      const k = start + i; if (k >= L.length) break;
      const tt = i / sr;
      p1 += freq / sr; p2 += freq * 2 / sr; p3 += freq * 3.01 / sr;
      const env = Math.exp(-tt * decay) * (1 - Math.exp(-tt * 500));
      const s = (tri(p1) * 0.7 + Math.sin(p2 * 6.283185) * 0.22 +
                 Math.sin(p3 * 6.283185) * 0.08) * env * g;
      L[k] += s * pl; R[k] += s * pr;
    }
  }

  /** Detuned 3-voice saw lead — the drop voice. */
  function lead(L, R, sr, t0, freq, dur, g, spb) {
    const start = (t0 * sr) | 0, len = ((dur + 0.06) * sr) | 0;
    const det = [0.994, 1.0, 1.007];
    const a = 1 - Math.exp(-6.283185 * 3000 / sr);
    for (let v0 = 0; v0 < det.length; v0++) {
      let ph = 0, lp = 0;
      const panL = v0 === 0 ? 1.15 : v0 === 2 ? 0.85 : 1;
      const panR = v0 === 0 ? 0.85 : v0 === 2 ? 1.15 : 1;
      for (let i = 0; i < len; i++) {
        const k = start + i; if (k >= L.length) break;
        const tt = i / sr;
        ph += freq * det[v0] / sr;
        const env = Math.min(1, tt * 180) * (tt < dur ? 1 : Math.exp(-(tt - dur) * 26));
        lp += a * (saw(ph) - lp);
        const duck = pump(t0 + tt, spb, 0.35);
        const s = lp * env * g * duck / det.length;
        L[k] += s * panL; R[k] += s * panR;
      }
    }
  }

  /** 16th-note arp shimmering over the drops. */
  function arp(L, R, sr, t0, seq, beats, spb, g) {
    const per = spb / 2;                            // 8ths of the 8-note seq = 16ths feel
    let t = t0, idx = 0;
    const total = Math.round(beats / 0.5);
    for (let i = 0; i < total; i++) {
      pluck(L, R, sr, t, seq[idx % seq.length] * 2, per * 1.4, g, (idx % 2) ? 0.5 : -0.5);
      idx++; t += per;
    }
  }

  /* ======================================================================
     the arrangement pass
     ====================================================================== */

  function renderPCM(bpm, sr) {
    const spb = 60 / bpm;
    const lead0 = 0.40, tail = 2.2;

    let totalBeats = 0;
    for (let i = 0; i < BLOCKS.length; i++) totalBeats += BLOCKS[i].len;

    const duration = lead0 + totalBeats * spb + tail;
    const n = Math.ceil(duration * sr);
    const L = new Float32Array(n), R = new Float32Array(n);

    nseed = 1234567;
    const beats = [], kiai = [], phases = [];
    const at = function (beat) { return lead0 + beat * spb; };

    let cursor = 0, barCursor = 0;

    for (let b = 0; b < BLOCKS.length; b++) {
      const blk = BLOCKS[b];
      const base = cursor;
      const bars = Math.ceil(blk.len / 4);
      const t0 = at(base), t1 = at(base + blk.len);

      phases.push({ mode: blk.mode, start: +t0.toFixed(3), end: +t1.toFixed(3), feel: blk.feel });
      if (blk.kiai) kiai.push({ start: +t0.toFixed(3), end: +t1.toFixed(3) });

      const isDrop = blk.feel === 'drop';
      const isBuild = blk.feel === 'build';
      const isFinale = blk.feel === 'finale';
      const soft = blk.feel === 'soft';

      // crash on every section boundary except the very start
      if (b > 0) crash(L, R, sr, t0, soft ? 0.10 : 0.16);

      /* chords + bass, one chord per bar */
      for (let bar = 0; bar < bars; bar++) {
        const chord = PROG[(barCursor + bar) % PROG.length];
        const bt = at(base + bar * 4);
        const blen = Math.min(4, blk.len - bar * 4);
        if (isFinale) {
          // half-time: massive chords, let them ring
          pad(L, R, sr, bt, chord.pad.concat([chord.pad[0] * 2]), spb * blen * 0.98, 0.14, spb, false);
          bass(L, R, sr, bt, chord.bass, spb * blen * 0.9, 0.4, spb, false);
        } else {
          pad(L, R, sr, bt, chord.pad, spb * blen * 0.96, soft ? 0.10 : 0.085, spb, isDrop);
          if (!soft) {
            if (isDrop) {
              // pumping 8th bass
              for (let e = 0; e < blen * 2; e++) {
                bass(L, R, sr, bt + e * spb / 2, chord.bass, spb * 0.42, 0.34, spb, true);
              }
            } else {
              bass(L, R, sr, bt, chord.bass, spb * 3.4, 0.36, spb, false);
            }
          }
        }
        if (isDrop) arp(L, R, sr, bt, chord.arp, blen, spb, 0.05);
      }

      /* drums */
      if (!soft && !isFinale) {
        for (let i = 0; i < blk.len; i++) {
          const t = at(base + i);
          kick(L, R, sr, t, isDrop ? 0.9 : 0.78);
          if (i % 2 === 1) snare(L, R, sr, t, isDrop ? 0.34 : 0.28);
          hat(L, R, sr, t + spb / 2, isDrop ? 0.2 : 0.13);
          if (isDrop) { hat(L, R, sr, t + spb * 0.25, 0.09); hat(L, R, sr, t + spb * 0.75, 0.09); }
        }
      }
      if (isFinale) {
        // half-time: kick on 1, big snare on 3
        for (let i = 0; i < blk.len; i += 4) {
          kick(L, R, sr, at(base + i), 0.9);
          snare(L, R, sr, at(base + i + 2), 0.4);
          crash(L, R, sr, at(base + i), 0.08);
        }
      }
      if (isBuild) {
        roll(L, R, sr, t0, blk.len, spb, 0.26);
        riser(L, R, sr, t0, blk.len * spb, 0.30);
        // rising pluck ostinato
        for (let i = 0; i < blk.len * 2; i++) {
          const u = i / (blk.len * 2);
          pluck(L, R, sr, t0 + i * spb / 2, N.C5 * (1 + u * 0.5), spb * 0.4, 0.10 + u * 0.12, (i % 2) ? 0.4 : -0.4);
        }
      }

      /* melody */
      if (blk.feel === 'groove') {
        for (let i = 0; i < VERSE.length; i++) {
          const m = VERSE[i];
          if (m[0] >= blk.len) continue;
          pluck(L, R, sr, at(base + m[0]), m[1], m[2] * spb * 0.9, 0.20, -0.25);
        }
      }
      if (isDrop) {
        for (let i = 0; i < HOOK.length; i++) {
          const m = HOOK[i];
          if (m[0] >= blk.len) continue;
          lead(L, R, sr, at(base + m[0]), m[1], spb * 0.48, 0.16, spb);
        }
      }
      if (soft && b > 0) {
        // breakdown sparkle
        for (let i = 0; i < blk.len; i++) {
          pluck(L, R, sr, at(base + i + 0.5), [N.C6, N.G5, N.A5, N.E6][i % 4], spb * 0.8, 0.08, (i % 2) ? 0.5 : -0.5);
        }
      }

      /* beatmap */
      const pat = PATTERNS[blk.notes] || [];
      for (let i = 0; i < pat.length; i++) {
        if (pat[i] >= blk.len) continue;
        beats.push(+at(base + pat[i]).toFixed(4));
      }
      cursor += blk.len;
      barCursor += bars;
    }

    /* master: soft-clip + normalise + edge fades */
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const sl = L[i] / (1 + Math.abs(L[i]) * 0.4);
      const sr2 = R[i] / (1 + Math.abs(R[i]) * 0.4);
      L[i] = sl; R[i] = sr2;
      const m = Math.abs(sl) > Math.abs(sr2) ? Math.abs(sl) : Math.abs(sr2);
      if (m > peak) peak = m;
    }
    const gain = peak > 0.0001 ? (0.92 / peak) : 1;
    for (let i = 0; i < n; i++) { L[i] *= gain; R[i] *= gain; }
    const fade = (0.03 * sr) | 0;
    for (let i = 0; i < fade; i++) {
      const f = i / fade;
      L[i] *= f; R[i] *= f;
      L[n - 1 - i] *= f; R[n - 1 - i] *= f;
    }

    return { L: L, R: R, beats: beats, kiai: kiai, phases: phases,
             duration: duration, lead: lead0, spb: spb };
  }

  /* ====================================================================== */

  async function render(bpm) {
    bpm = bpm || 128;
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

    return { buffer: buffer, beats: pcm.beats, kiai: pcm.kiai, phases: pcm.phases,
             bpm: bpm, duration: pcm.duration, lead: pcm.lead, spb: pcm.spb };
  }

  return { render: render, PROG: PROG };
})();
