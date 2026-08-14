/* ==========================================================================
   scene.js — everything drawn on the canvas.

   The look is built the way a matte painting is: depth layers, each one
   further away being lower-contrast and closer to the sky colour, with fog
   between them. That atmospheric falloff is what stops canvas art reading as
   flat vector shapes. Nothing here is an image file — it's all drawn, so the
   whole gift stays self-contained and loads instantly.

   Layer order, back to front:
     sky · sun · stars · ridges · far treeline · fog · lake · shore + carpet
     → centre glow → bokeh → the tree (trunk, limbs, canopy) → petals
     → target · notes · THE heart · sparks → god rays → grain → vignette

   The static layers are baked into offscreen canvases once per resize and
   blitted every frame; only the live things are redrawn.
   ========================================================================== */

window.Scene = (function () {

  let cv, ctx, W = 0, H = 0, DPR = 1;
  let raf = 0, last = 0, tGlobal = 0;

  let backdropCv = null, treeCv = null, grainPat = null;

  let notes = null;          // shared array of {t, judged} from Game
  let getSongTime = function () { return -999; };
  let approach = 1.55;
  let mode = 'ambient';      // 'ambient' | 'play'

  /* --- composition (matched to the reference frame) --------------------- */
  const HORIZON   = 0.520;   // waterline
  const BANK      = 0.615;   // dark hedge line where the petal field starts
  const SUN_X     = 0.630;   // the bright core of the sunrise fog
  const SUN_Y     = 0.415;

  /* --- heart spring state ---------------------------------------------- */
  const heart = {
    scale: 1, scaleV: 0,
    rot: 0, rotV: 0,
    glow: 0.35, glowV: 0,
    alpha: 0,                 // faded out except during play, so it never
    sad: 0                    // fights the title/menu type for the centre
  };

  let petals = [], bokeh = [], sparks = [], rings = [];

  /* --- juice state ------------------------------------------------------ */
  const par = { x: 0, y: 0, tx: 0, ty: 0 };   // mouse parallax, lerped
  const shake = { amp: 0, t: 0 };             // decaying screen shake
  let kiai = false;                            // osu-style fever sections
  let kiaiFlash = 0;                           // white pulse on kiai entry
  let beatFlash = 0;                           // per-beat glow during kiai
  let floaters = [];                           // judgment text at hit point
  let streaks = [];                            // Tsushima-style wind lines
  let streakTimer = 3.5;
  const REDUCED = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- deterministic rng, so the world is identical every load ---------- */
  let seed = 987654321;
  function rnd() {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    return seed / 0x7fffffff;
  }
  function rr(a, b) { return a + rnd() * (b - a); }
  function pick(a) { return a[(rnd() * a.length) | 0]; }

  /* ====================================================================== */
  /*  setup                                                                  */
  /* ====================================================================== */

  function mount() {
    cv = document.getElementById('scene');
    ctx = cv.getContext('2d', { alpha: false });
    resize();
    window.addEventListener('resize', debounce(resize, 120));
    if (!REDUCED) {
      window.addEventListener('mousemove', function (e) {
        par.tx = (e.clientX / W - 0.5) * 2;
        par.ty = (e.clientY / H - 0.5) * 2;
      }, { passive: true });
    }
    seedParticles();
    last = performance.now();
    // Paint one frame right now: rAF doesn't fire in hidden tabs, and a
    // texted link often opens in one — the world must already be there
    // the moment the tab is fronted.
    step(0.016);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function debounce(fn, ms) {
    let t = 0;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.floor(W * DPR);
    cv.height = Math.floor(H * DPR);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildBackdrop();
    buildTree();
    buildGrain();
  }

  function offscreen() {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(W * DPR));
    c.height = Math.max(1, Math.floor(H * DPR));
    const g = c.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    return { c: c, g: g };
  }

  function seedParticles() {
    petals = []; bokeh = [];
    for (let i = 0; i < 54; i++) petals.push(newPetal(true));
    for (let i = 0; i < 26; i++) bokeh.push(newBokeh(true));
  }

  function newPetal(anywhere) {
    // Two thirds shake loose from the canopy; the rest blow in across the top.
    // Everything drifts right, so the frame reads as one breeze off the tree.
    const fromTree = rnd() < 0.66;
    return {
      x: anywhere ? rnd() : (fromTree ? rr(-0.04, 0.55) : rr(0, 1)),
      y: anywhere ? rr(0, 0.9) : (fromTree ? rr(-0.05, 0.34) : -0.06),
      r: rr(5, 13),
      vy: rr(0.024, 0.062),
      vx: rr(0.028, 0.085),
      sway: rr(0.35, 1.1), swayP: rr(0, 6.28), swaySpd: rr(0.5, 1.4),
      rot: rr(0, 6.28), rotV: rr(-1.5, 1.5),
      flut: rr(0, 6.28), flutSpd: rr(1.2, 2.8),
      tone: rnd(), a: rr(0.45, 0.92)
    };
  }

  function newBokeh(anywhere) {
    return {
      x: rnd(), y: anywhere ? rnd() : 1.05,
      r: rr(10, 46), vy: rr(0.012, 0.045),
      p: rr(0, 6.28), a: rr(0.05, 0.16), warm: rnd()
    };
  }

  /* ======================================================================
     BAKED LAYER 1 — the world behind the tree
     ====================================================================== */

  function buildBackdrop() {
    const o = offscreen(), g = o.g;
    seed = 424242;

    const hz = H * HORIZON;
    const bk = H * BANK;
    const sx = W * SUN_X, sy = H * SUN_Y;

    /* --- sky: deep magenta up top burning to bright sunrise fog -------- */
    const sky = g.createLinearGradient(0, 0, 0, bk);
    sky.addColorStop(0.00, '#330b3e');
    sky.addColorStop(0.16, '#6d2264');
    sky.addColorStop(0.34, '#b6497e');
    sky.addColorStop(0.52, '#ea8899');
    sky.addColorStop(0.72, '#ffc9b4');
    sky.addColorStop(1.00, '#ffe6d4');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, bk + 1);

    // a few stars only where the sky is still dark
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W, y = rr(0, H * 0.13);
      const fade = 1 - y / (H * 0.13);
      g.globalAlpha = rr(0.1, 0.6) * fade;
      g.fillStyle = '#ffeaf6';
      g.beginPath(); g.arc(x, y, rr(0.4, 1.2), 0, 6.283); g.fill();
    }
    g.globalAlpha = 1;

    /* --- the sunrise core: huge soft blown-out glow -------------------- */
    const halo = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.62);
    halo.addColorStop(0.00, 'rgba(255,246,232,0.95)');
    halo.addColorStop(0.10, 'rgba(255,228,205,0.72)');
    halo.addColorStop(0.30, 'rgba(255,190,175,0.34)');
    halo.addColorStop(0.60, 'rgba(255,150,160,0.10)');
    halo.addColorStop(1.00, 'rgba(255,150,160,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);

    /* --- misty forest across the middle distance ----------------------
       Further bands are paler — atmospheric perspective is what sells
       the fog. The reference's forest is almost white where the light is. */
    treelineSoft(g, hz - H * 0.006, H * 0.085, 'rgba(214,150,183,0.30)', 4.1);
    treelineSoft(g, hz - H * 0.002, H * 0.065, 'rgba(190,120,163,0.42)', 9.7);
    treelineSoft(g, hz + H * 0.002, H * 0.046, 'rgba(158,86,136,0.55)', 15.3);

    // one pale blossom tree standing alone in the mist, left of centre
    (function mistTree() {
      const tx = W * 0.285, ty = hz + H * 0.002;
      const th = H * 0.085;
      g.save();
      const m = offscreen();
      m.g.fillStyle = 'rgba(255,214,228,0.85)';
      for (let i = 0; i < 12; i++) {
        m.g.beginPath();
        m.g.ellipse(tx + rr(-th * 0.75, th * 0.75), ty - th * rr(0.45, 1.05),
                    th * rr(0.2, 0.42), th * rr(0.16, 0.3), 0, 0, 6.283);
        m.g.fill();
      }
      m.g.strokeStyle = 'rgba(120,60,100,0.6)';
      m.g.lineWidth = 2.5;
      m.g.beginPath();
      m.g.moveTo(tx - th * 0.06, ty);
      m.g.lineTo(tx + th * 0.04, ty - th * 0.55);
      m.g.stroke();
      g.filter = 'blur(3px)';
      g.globalAlpha = 0.8;
      g.drawImage(m.c, 0, 0, W, H);
      g.restore();
    })();

    /* --- fog banks rolling through the trees --------------------------- */
    const fog = offscreen();
    for (let i = 0; i < 20; i++) {
      const fy = hz - H * rr(-0.015, 0.10);
      fog.g.fillStyle = 'rgba(255,226,224,' + rr(0.16, 0.40).toFixed(3) + ')';
      fog.g.beginPath();
      fog.g.ellipse(rnd() * W, fy, W * rr(0.16, 0.5), H * rr(0.010, 0.028), 0, 0, 6.283);
      fog.g.fill();
    }
    g.save();
    g.filter = 'blur(22px)';
    g.drawImage(fog.c, 0, 0, W, H);
    g.restore();

    /* --- the pond: a bright mirror under the fog ----------------------- */
    const water = g.createLinearGradient(0, hz, 0, bk);
    water.addColorStop(0.00, '#ffe2d2');
    water.addColorStop(0.35, '#f6b3b4');
    water.addColorStop(1.00, '#d183a0');
    g.fillStyle = water;
    g.fillRect(0, hz, W, bk - hz + 1);

    // reflection column under the sun + drifting glints
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let y = hz; y < bk; y += 2) {
      const d = (y - hz) / (bk - hz);
      const spread = Math.min(W, H) * (0.02 + d * 0.13);
      const a = (1 - d * 0.6) * 0.22 * (0.5 + 0.5 * Math.abs(Math.sin(y * 0.8)));
      const w = spread * rr(0.5, 1.2);
      const gr = g.createLinearGradient(sx - w, 0, sx + w, 0);
      gr.addColorStop(0, 'rgba(255,222,190,0)');
      gr.addColorStop(0.5, 'rgba(255,238,214,' + a.toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,222,190,0)');
      g.fillStyle = gr;
      g.fillRect(sx - w, y, w * 2, rr(1, 2));
    }
    for (let i = 0; i < 90; i++) {
      const d = Math.pow(rnd(), 0.8);
      const y = hz + d * (bk - hz);
      g.globalAlpha = (1 - d * 0.5) * rr(0.05, 0.2);
      g.fillStyle = '#fff0e2';
      g.fillRect(rnd() * W, y, Math.min(W, H) * rr(0.008, 0.05), rr(0.7, 1.6));
    }
    g.restore();
    g.globalAlpha = 1;

    // mist lying on the water
    const surf = g.createLinearGradient(0, hz - H * 0.01, 0, hz + H * 0.045);
    surf.addColorStop(0, 'rgba(255,232,228,0.55)');
    surf.addColorStop(1, 'rgba(255,232,228,0)');
    g.fillStyle = surf;
    g.fillRect(0, hz - H * 0.01, W, H * 0.055);

    /* --- lit grass strip, then the dark hedge band --------------------- */
    g.fillStyle = 'rgba(255,208,186,0.5)';
    g.fillRect(0, bk - H * 0.012, W, H * 0.012);

    g.fillStyle = '#451028';
    g.beginPath();
    g.moveTo(0, bk);
    for (let x = 0; x <= W; x += 8) {
      const u = x / W;
      g.lineTo(x, bk + Math.sin(u * 11 + 2.2) * H * 0.004 + Math.sin(u * 29 + 5) * H * 0.0025);
    }
    g.lineTo(W, bk + H * 0.030); g.lineTo(0, bk + H * 0.030);
    g.closePath();
    g.fill();

    /* --- the petal field ------------------------------------------------
       Base colour first, then a pool of warm light between the figures,
       then thousands of petals (and hearts) building real texture.       */
    const fieldTop = bk + H * 0.016;
    const field = g.createLinearGradient(0, fieldTop, 0, H);
    field.addColorStop(0.00, '#9c2c58');
    field.addColorStop(0.30, '#b83e69');
    field.addColorStop(0.68, '#8e2452');
    field.addColorStop(1.00, '#5a1136');
    g.fillStyle = field;
    g.fillRect(0, fieldTop - 2, W, H - fieldTop + 2);

    const poolX = W * 0.46, poolY = H * 0.72;
    const pool = g.createRadialGradient(poolX, poolY, 0, poolX, poolY, W * 0.40);
    pool.addColorStop(0, 'rgba(255,178,148,0.38)');
    pool.addColorStop(0.55, 'rgba(255,150,140,0.14)');
    pool.addColorStop(1, 'rgba(255,150,140,0)');
    g.fillStyle = pool;
    g.fillRect(0, fieldTop - 2, W, H - fieldTop + 2);

    const poolLight = function (x, y) {
      const dx = (x - poolX) / (W * 0.40), dy = (y - poolY) / (W * 0.40);
      return Math.max(0, 1 - Math.hypot(dx, dy));
    };

    const CARPET = ['#e26493', '#c94679', '#f28fb4', '#ad3266', '#8c2251', '#d55584', '#f7aac6'];
    const n = Math.round(W * 1.45);
    for (let i = 0; i < n; i++) {
      const v = Math.pow(rnd(), 0.60);
      const y = fieldTop + v * (H - fieldTop);
      const x = rnd() * W;
      const s = 2.2 + v * 10.5;
      const lit = poolLight(x, y);
      g.save();
      g.translate(x, y);
      g.rotate(rr(0, 6.283));
      g.scale(1, 0.30 + v * 0.18);
      g.globalAlpha = 0.35 + v * 0.45 + lit * 0.2;
      // the pool bleaches petals toward warm cream; corners fall to crimson
      g.fillStyle = lit > 0.55 && rnd() < 0.5 ? '#ffcfae'
                  : lit > 0.3 && rnd() < 0.3 ? '#fca0b4'
                  : pick(CARPET);
      if (rnd() < 0.055) heartPath(g, 0, 0, s * 0.85, 0);
      else petalPath(g, s);
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;

    /* --- bottom-corner shadow keeps the eye centred -------------------- */
    const floor = g.createLinearGradient(0, H * 0.82, 0, H);
    floor.addColorStop(0, 'rgba(40,3,28,0)');
    floor.addColorStop(1, 'rgba(40,3,28,0.62)');
    g.fillStyle = floor;
    g.fillRect(0, H * 0.82, W, H * 0.18);

    backdropCv = o.c;
  }

  /** Soft-topped misty treeline (conifer spikes blurred together). */
  function treelineSoft(g, baseY, maxH, colour, phase) {
    const m = offscreen();
    m.g.fillStyle = colour.replace(/[\d.]+\)$/, '1)');
    m.g.beginPath();
    m.g.moveTo(0, baseY + 2);
    let x = 0;
    while (x < W) {
      const w = rr(maxH * 0.28, maxH * 0.6);
      const h = maxH * (0.4 + Math.abs(Math.sin(x * 0.011 + phase)) * 0.8) * rr(0.65, 1.15);
      m.g.lineTo(x, baseY);
      m.g.lineTo(x + w * 0.5, baseY - h);
      m.g.lineTo(x + w, baseY);
      x += w * rr(0.6, 0.9);
    }
    m.g.lineTo(W, baseY + 2);
    m.g.closePath();
    m.g.fill();
    const alpha = parseFloat((colour.match(/([\d.]+)\)$/) || [0, 0.4])[1]);
    g.save();
    g.filter = 'blur(2.5px)';
    g.globalAlpha = alpha;
    g.drawImage(m.c, 0, 0, W, H);
    g.restore();
  }

  /* ======================================================================
     BAKED LAYER 2 — the blossom tree
     ====================================================================== */

  const BARK_DARK = '#20081c';
  const BARK_LIT  = '#6b2748';

  function TREE_AX() { return -W * 0.13; }
  function TREE_AY() { return -H * 0.10; }

  function buildTree() {
    const o = offscreen(), g = o.g;
    seed = 20240214;                       // fixed: the tree never re-rolls

    const limbs = [];                      // {x,y,cx,cy,x2,y2,w}
    const puffs = [];                      // {x,y,r}

    // Canopy must stay clear of the centre — the title, the heart and the
    // ticket all live there — so it spreads across the top and down the left
    // edge, leaving the middle of the frame open.
    const limitY = H * 0.26;
    const dropY  = H * 0.34;
    const leftX  = W * 0.26;   // blossoms may come low only in this margin

    function grow(x, y, ang, len, w, depth, maxDepth) {
      // steer gently back up if this limb is reaching into the centre
      if (y > limitY && x > leftX && depth > 0) {
        ang = ang * 0.45 + (-Math.abs(ang) * 0.8) * 0.55;
      }
      const x2 = x + Math.cos(ang) * len;
      const y2 = y + Math.sin(ang) * len;
      const bow = rr(-0.16, 0.16);
      limbs.push({
        x: x, y: y, w: w,
        cx: (x + x2) / 2 + Math.cos(ang + 1.5708) * len * bow,
        cy: (y + y2) / 2 + Math.sin(ang + 1.5708) * len * bow,
        x2: x2, y2: y2
      });

      const puff = function (px, py, r) {
        // top band anywhere, or low along the left margin — never the centre
        if (py < dropY || (px < leftX && py < H * 0.60)) {
          puffs.push({ x: px, y: py, r: r });
        }
      };

      if (depth >= 1) {
        const nc = depth >= 3 ? 4 : 3;
        for (let i = 0; i < nc; i++) {
          const f = rr(0.25, 1);
          puff(x + (x2 - x) * f + rr(-20, 20),
               y + (y2 - y) * f + rr(-18, 16), rr(18, 46));
        }
      }
      if (depth >= maxDepth || len < 14) { puff(x2, y2, rr(28, 58)); return; }

      const n = depth < 2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        grow(x2, y2,
             ang + rr(-0.44, 0.34) + (i - (n - 1) / 2) * 0.46,
             len * rr(0.58, 0.78), w * 0.6, depth + 1, maxDepth);
      }
    }

    /* --- boughs enter from off-frame top-left, like the reference ------
       No ground trunk: the tree stands outside the shot, and its heavy
       limbs reach in over the scene.                                     */
    const trunkW = Math.max(30, W * 0.040);

    // the main bough: enters at the left edge, drops, forks right
    grow(-W * 0.02, H * 0.10, 0.52, W * 0.135, trunkW, 0, 5);
    // second heavy limb across the very top
    grow(W * 0.06, -H * 0.03, 0.42, W * 0.16, trunkW * 0.8, 0, 5);
    // a hanging cluster entering from the top, right of centre
    grow(W * 0.58, -H * 0.04, 1.25, H * 0.09, trunkW * 0.42, 1, 4);

    /* --- 1 · soft mass behind: one blurred blit, not N blurs ----------- */
    const mass = offscreen();
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      mass.g.fillStyle = 'rgba(104,20,66,0.5)';
      mass.g.beginPath();
      mass.g.ellipse(p.x, p.y, p.r * 1.55, p.r * 1.3, 0, 0, 6.283);
      mass.g.fill();
    }
    g.save();
    g.filter = 'blur(24px)';
    g.drawImage(mass.c, 0, 0, W, H);
    g.restore();

    /* --- 2 · limbs ------------------------------------------------------ */
    g.lineCap = 'round';
    for (let i = 0; i < limbs.length; i++) {
      const b = limbs[i];
      g.strokeStyle = BARK_DARK;
      g.lineWidth = b.w;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.quadraticCurveTo(b.cx, b.cy, b.x2, b.y2);
      g.stroke();
      // rim light down the sunward side of the thicker limbs
      if (b.w > 4) {
        g.strokeStyle = 'rgba(150,60,96,0.55)';
        g.lineWidth = Math.max(1, b.w * 0.24);
        g.beginPath();
        g.moveTo(b.x + b.w * 0.3, b.y);
        g.quadraticCurveTo(b.cx + b.w * 0.3, b.cy, b.x2 + b.w * 0.2, b.y2);
        g.stroke();
      }
    }

    // bark grain along the heaviest limbs
    g.save();
    g.globalAlpha = 0.16;
    g.strokeStyle = '#000';
    g.lineWidth = 1.1;
    const heavy = limbs.filter(function (b) { return b.w > trunkW * 0.5; });
    for (let i = 0; i < 60 && heavy.length; i++) {
      const b = heavy[(rnd() * heavy.length) | 0];
      const f = rnd();
      const x = b.x + (b.x2 - b.x) * f, y = b.y + (b.y2 - b.y) * f;
      const off = b.w * rr(-0.35, 0.35);
      g.beginPath();
      g.moveTo(x, y + off);
      g.lineTo(x + rr(14, 30), y + off + rr(-4, 4));
      g.stroke();
    }
    g.restore();

    /* --- 3 · blossoms in front, each one lit from the sun ---------------
       Crimson-heavy, the way the reference's maple burns against the pale
       fog — pastel only where a petal catches the light. */
    // ordered light → dark: index maps to height within a cluster
    const TONES = [
      ['#ffe0eb', '#ff8fb5'], ['#ffc3d8', '#f0679c'], ['#ff9cbf', '#e04b85'],
      ['#ff7fae', '#d63d72'], ['#f2609a', '#b02458'], ['#e8548c', '#9c1d4e']
    ];
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];

      // cluster shading, pass 1: a soft shadow pooled under the cluster —
      // this is what makes a mass of petals read as a lit VOLUME
      const sh = g.createRadialGradient(p.x - p.r * 0.2, p.y + p.r * 0.35, 0,
                                        p.x - p.r * 0.2, p.y + p.r * 0.35, p.r * 1.15);
      sh.addColorStop(0, 'rgba(118,16,64,0.42)');
      sh.addColorStop(1, 'rgba(118,16,64,0)');
      g.fillStyle = sh;
      g.beginPath();
      g.ellipse(p.x - p.r * 0.2, p.y + p.r * 0.35, p.r * 1.15, p.r * 0.95, 0, 0, 6.283);
      g.fill();

      // pass 2: the petals themselves — shaded darker low, lighter high
      for (let j = 0; j < 13; j++) {
        const a = rr(0, 6.283), d = rr(0, p.r);
        const px = p.x + Math.cos(a) * d;
        const py = p.y + Math.sin(a) * d * 0.82;
        const rad = rr(p.r * 0.2, p.r * 0.46);
        // petals near the top of the cluster pull light tones, low ones dark
        const vert = (py - (p.y - p.r)) / (2 * p.r);        // 0 top → 1 bottom
        const ti = Math.min(TONES.length - 1,
                   Math.max(0, Math.round(vert * (TONES.length - 1) + rr(-1.2, 1.2))));
        const tone = TONES[ti];
        g.save();
        g.translate(px, py);
        g.rotate(rr(0, 6.283));
        g.globalAlpha = rr(0.6, 0.98);
        const gr = g.createRadialGradient(rad * 0.35, -rad * 0.4, rad * 0.08,
                                          0, 0, rad * 1.25);
        gr.addColorStop(0, tone[0]);
        gr.addColorStop(1, tone[1]);
        g.fillStyle = gr;
        petalPath(g, rad);
        g.fill();
        g.restore();
      }

      // pass 3: a crown of light where the sun grazes the top of the cluster
      const hl = g.createRadialGradient(p.x + p.r * 0.3, p.y - p.r * 0.45, 0,
                                        p.x + p.r * 0.3, p.y - p.r * 0.45, p.r * 0.9);
      hl.addColorStop(0, 'rgba(255,232,240,0.34)');
      hl.addColorStop(1, 'rgba(255,232,240,0)');
      g.fillStyle = hl;
      g.beginPath();
      g.ellipse(p.x + p.r * 0.3, p.y - p.r * 0.45, p.r * 0.9, p.r * 0.7, 0, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;

    /* --- 4 · a breath of haze over the whole canopy for depth ---------- */
    g.save();
    g.globalCompositeOperation = 'source-atop';
    const hazeG = g.createLinearGradient(0, 0, W * 0.6, H * 0.4);
    hazeG.addColorStop(0, 'rgba(255,170,190,0.05)');
    hazeG.addColorStop(1, 'rgba(255,140,170,0.16)');
    g.fillStyle = hazeG;
    g.fillRect(0, 0, W, H);
    g.restore();

    treeCv = o.c;
  }

  function petalPath(g, r) {
    g.beginPath();
    g.moveTo(0, -r);
    g.bezierCurveTo(r * 0.95, -r * 0.55, r * 0.62, r * 0.75, 0, r);
    g.bezierCurveTo(-r * 0.62, r * 0.75, -r * 0.95, -r * 0.55, 0, -r);
  }

  /* --- film grain: kills the last of the flat-vector look --------------- */
  function buildGrain() {
    const s = 160;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const g = c.getContext('2d');
    const img = g.createImageData(s, s);
    let q = 99991;
    for (let i = 0; i < img.data.length; i += 4) {
      q = (q * 1103515245 + 12345) & 0x7fffffff;
      const v = 128 + ((q / 0x3fffffff) - 1) * 26;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainPat = ctx.createPattern(c, 'repeat');
  }

  /* ====================================================================== */
  /*  public hooks                                                           */
  /* ====================================================================== */

  function setNotes(arr, approachSec) {
    notes = arr;
    if (approachSec) approach = approachSec;
  }
  function setClock(fn) { getSongTime = fn; }
  function setMode(m) { mode = m; }

  /** Heart reacts to a click. quality: 'perfect'|'great'|'good'|'stray' */
  function punch(quality) {
    const power = quality === 'perfect' ? 1 : quality === 'great' ? 0.82
                : quality === 'good' ? 0.62 : 0.3;
    heart.scaleV += 7.2 * power;
    const dir = (rnd() < 0.5 ? -1 : 1);
    heart.rotV += dir * (9.5 * power + rr(0, 2.5));
    heart.glowV += 5.0 * power;
    if (quality === 'stray') heart.sad = 1;
    if (!REDUCED && quality === 'perfect') shake.amp = Math.max(shake.amp, 3.2);
  }

  function pulse(strength) {
    heart.scaleV += 1.5 * (strength == null ? 1 : strength);
    heart.glowV += 1.4;
    rings.push({ r: 0, a: 0.30, w: 3 });
    if (kiai) beatFlash = 1;
  }

  function setKiai(on) {
    if (on === kiai) return;
    kiai = on;
    if (on) {
      kiaiFlash = 1;
      if (!REDUCED) shake.amp = Math.max(shake.amp, 5);
      spawnStreaks(4);
      burst('perfect');
    }
  }

  /** Judgment text where the click landed (osu-style). */
  function judgment(quality, text, x, y) {
    const cx = (x == null) ? W / 2 : x;
    const cy = (y == null) ? centreY() - baseSize() * 1.7 : y - 26;
    floater(quality, text, cx, cy);
  }

  /** Combo milestone: big gold callout + burst + kick. */
  function milestone(n) {
    floater('combo', n + ' COMBO', W / 2, centreY() - baseSize() * 2.3);
    burst('perfect');
    if (!REDUCED) shake.amp = Math.max(shake.amp, 4.5);
    spawnStreaks(2);
  }

  function burst(quality) {
    const cx = W / 2, cy = centreY();
    const n = quality === 'perfect' ? 26 : quality === 'great' ? 18 : 11;
    const spd = quality === 'perfect' ? 340 : quality === 'great' ? 270 : 200;
    for (let i = 0; i < n; i++) {
      const a = rr(0, 6.283);
      const v = spd * rr(0.35, 1);
      sparks.push({
        x: cx, y: cy,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        life: 1, decay: rr(0.9, 1.7),
        r: rr(2, 5.5),
        heart: rnd() < 0.45,
        tone: rnd(),
        rot: rr(0, 6.28), rotV: rr(-6, 6)
      });
    }
    rings.push({ r: 0, a: quality === 'perfect' ? 0.75 : 0.45, w: quality === 'perfect' ? 7 : 4 });
  }

  function celebrate() {
    for (let i = 0; i < 5; i++) setTimeout(function () { burst('perfect'); }, i * 120);
  }

  /* ====================================================================== */
  /*  geometry                                                               */
  /* ====================================================================== */

  function centreY() { return H * 0.52; }
  function baseSize() { return Math.max(64, Math.min(W, H) * 0.145); }

  /**
   * How big a note is when it spawns, as a multiple of the heart.
   * Derived from the viewport so the outermost ring is always fully visible —
   * a note that's clipped off-screen can't be read, and an unreadable note is
   * an unfair one. (heartPath spans 2s wide × 1.375s tall.)
   */
  function spawnScale() {
    const fit = Math.min(H * 0.58, W * 0.42);
    return Math.max(2.5, Math.min(4.0, fit / baseSize()));
  }

  function heartPath(g, cx, cy, s, rot) {
    g.beginPath();
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const st = Math.sin(t);
      let px = (16 * st * st * st) / 16;
      let py = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
      py -= 0.375;                                   // recentre vertically
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

  /* ====================================================================== */
  /*  the loop                                                               */
  /* ====================================================================== */

  function loop(now) {
    raf = requestAnimationFrame(loop);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;          // don't let a tab-switch explode physics
    tGlobal += dt;
    step(dt);
    draw();
  }

  function step(dt) {
    const kS = 190, cS = 15;
    heart.scaleV += (-kS * (heart.scale - 1) - cS * heart.scaleV) * dt;
    heart.scale += heart.scaleV * dt;

    const kR = 135, cR = 8.5;
    heart.rotV += (-kR * heart.rot - cR * heart.rotV) * dt;
    heart.rot += heart.rotV * dt;

    const kG = 90, cG = 12;
    heart.glowV += (-kG * (heart.glow - 0.35) - cG * heart.glowV) * dt;
    heart.glow += heart.glowV * dt;

    heart.sad = Math.max(0, heart.sad - dt * 3.2);

    const targetA = (mode === 'play') ? 1 : 0;
    heart.alpha += (targetA - heart.alpha) * Math.min(1, dt * 5.5);

    /* --- juice ---------------------------------------------------------- */
    par.x += (par.tx - par.x) * Math.min(1, dt * 3.2);
    par.y += (par.ty - par.y) * Math.min(1, dt * 3.2);

    shake.t += dt * 34;
    shake.amp = Math.max(0, shake.amp - dt * 26);
    kiaiFlash = Math.max(0, kiaiFlash - dt * 1.8);
    beatFlash = Math.max(0, beatFlash - dt * 3.4);

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt / f.dur;
      if (f.t >= 1) floaters.splice(i, 1);
    }

    streakTimer -= dt * (kiai ? 3.2 : 1);
    if (streakTimer <= 0) {
      spawnStreaks(kiai ? 3 : 1 + ((rnd() * 2) | 0));
      streakTimer = rr(4.5, 8);
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      s.t += dt / s.dur;
      if (s.t >= 1) streaks.splice(i, 1);
    }

    // fever wind: petals rush during kiai
    const gust = kiai ? 2.1 : 1;
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      p.y += p.vy * gust * dt;
      p.swayP += p.swaySpd * dt;
      p.x += (p.vx * gust + Math.sin(p.swayP) * p.sway * 0.05) * dt;
      p.rot += p.rotV * dt;
      p.flut += p.flutSpd * dt;
      // land on the bank rather than falling through the world
      if (p.y > 0.99 || p.x > 1.1) petals[i] = newPetal(false);
    }
    for (let i = 0; i < bokeh.length; i++) {
      const b = bokeh[i];
      b.y -= b.vy * dt;
      b.p += dt * 0.7;
      if (b.y < -0.1) bokeh[i] = newBokeh(false);
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= s.decay * dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.vy += 520 * dt;
      s.vx *= (1 - 1.6 * dt);
      s.vy *= (1 - 0.6 * dt);
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.rot += s.rotV * dt;
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += 430 * dt;
      r.a -= 2.6 * dt;
      if (r.a <= 0 || r.r > baseSize() * 1.6) rings.splice(i, 1);
    }
  }

  /* ---------------------------------------------------------------------- */

  function draw() {
    // decaying sinusoid shake — canvas only, the DOM HUD stays put
    const shx = shake.amp > 0.01 ? Math.sin(shake.t) * shake.amp : 0;
    const shy = shake.amp > 0.01 ? Math.cos(shake.t * 1.3) * shake.amp * 0.7 : 0;

    ctx.save();
    ctx.translate(shx, shy);

    // the world slides a few px against the cursor — cheap cinematic depth.
    // Overdraw by the max offset so parallax never exposes canvas edges.
    if (backdropCv) {
      ctx.drawImage(backdropCv, -8 + par.x * -6, -6 + par.y * -4, W + 16, H + 12);
    } else { ctx.fillStyle = '#160a2c'; ctx.fillRect(-8, -6, W + 16, H + 12); }

    drawCentreGlow();
    drawBokeh();
    drawTree();
    drawStreaks();
    drawPetals();
    drawPlayScrim();
    if (mode === 'play') drawTarget();
    drawShockRings();
    if (mode === 'play') drawNotes();
    drawHeart();
    drawSparks();
    drawFloaters();
    drawRays();
    drawKiai();
    drawGrain();
    drawVignette();
    ctx.restore();
  }

  function drawTree() {
    if (!treeCv) return;
    // Sway about the corner the boughs enter from, so the tips travel
    // furthest and the heavy wood barely moves. Nearest layer = most parallax.
    const ax = TREE_AX(), ay = TREE_AY();
    const a = Math.sin(tGlobal * 0.36) * 0.0060 + Math.sin(tGlobal * 0.91) * 0.0022;
    ctx.save();
    ctx.translate(par.x * -14, par.y * -9);
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.translate(-ax, -ay);
    ctx.drawImage(treeCv, -10, -8, W + 20, H + 16);
    ctx.restore();
  }

  function drawCentreGlow() {
    const cx = W / 2, cy = centreY();
    const r = baseSize() * (5.2 + heart.glow * 2.4);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const a = (0.10 + heart.glow * 0.30) * (0.35 + 0.65 * heart.alpha);
    g.addColorStop(0, 'rgba(255,120,180,' + a + ')');
    g.addColorStop(0.4, 'rgba(255,90,150,' + (a * 0.42) + ')');
    g.addColorStop(1, 'rgba(255,90,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBokeh() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bokeh.length; i++) {
      const b = bokeh[i];
      const x = b.x * W + Math.sin(b.p) * 14;
      const y = b.y * H;
      const g = ctx.createRadialGradient(x, y, 0, x, y, b.r);
      const col = b.warm > 0.5 ? '255,214,170' : '255,175,215';
      g.addColorStop(0, 'rgba(' + col + ',' + b.a + ')');
      g.addColorStop(0.55, 'rgba(' + col + ',' + (b.a * 0.35) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, b.r, 0, 6.283); ctx.fill();
    }
    ctx.restore();
  }

  const PETAL_TONES = [['#ffd9e6', '#f57ba5'], ['#f7a8c4', '#d94f7f'],
                       ['#ffeef4', '#ffb1cb'], ['#e86f9d', '#b02d5d']];

  function drawPetals() {
    ctx.save();
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      const x = p.x * W, y = p.y * H;
      const squash = Math.abs(Math.cos(p.flut)) * 0.75 + 0.25;
      const r = p.r;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.scale(squash, 1);
      ctx.globalAlpha = p.a;
      const tone = PETAL_TONES[(p.tone * PETAL_TONES.length) | 0];
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, tone[0]);
      g.addColorStop(1, tone[1]);
      ctx.fillStyle = g;
      petalPath(ctx, r);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /** Dusk pool behind the play field — keeps white-hot notes readable
      against the sunrise fog. Rides heart.alpha so it fades with play mode. */
  function drawPlayScrim() {
    if (heart.alpha < 0.02) return;
    const cx = W / 2, cy = centreY();
    const r = baseSize() * spawnScale() * 1.5;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(40,2,32,' + (0.38 * heart.alpha) + ')');
    g.addColorStop(0.6, 'rgba(40,2,32,' + (0.22 * heart.alpha) + ')');
    g.addColorStop(1, 'rgba(40,2,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /** The static outline showing exactly where a note must land. */
  function drawTarget() {
    const cx = W / 2, cy = centreY(), s = baseSize();
    ctx.save();
    ctx.lineWidth = 2.5;
    if (kiai) {   // fever sections run gold, osu-style
      const th = 0.7 + beatFlash * 0.3;
      ctx.strokeStyle = 'rgba(255,222,130,' + th + ')';
      ctx.shadowColor = 'rgba(255,200,80,0.9)';
      ctx.shadowBlur = 14 + beatFlash * 12;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.shadowColor = 'rgba(255,255,255,0.5)';
      ctx.shadowBlur = 10;
    }
    ctx.setLineDash([7, 9]);
    ctx.lineDashOffset = -tGlobal * 22;
    heartPath(ctx, cx, cy, s * 1.30, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawShockRings() {
    const cx = W / 2, cy = centreY();
    ctx.save();
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      // circles, deliberately NOT hearts — expanding heart outlines would
      // read as incoming notes; a circular shockwave is unambiguous feedback
      ctx.globalAlpha = Math.max(0, r.a) * 0.6 * heart.alpha;
      ctx.strokeStyle = '#ffe3ef';
      ctx.lineWidth = r.w;
      ctx.beginPath();
      ctx.arc(cx, cy, baseSize() * 1.05 + r.r, 0, 6.283);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawNotes() {
    if (!notes) return;
    const t = getSongTime();
    const cx = W / 2, cy = centreY(), s = baseSize();
    const START = spawnScale();
    const TARGET = 1.30;

    ctx.save();
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const dt = n.t - t;
      if (dt > approach || dt < -0.34) continue;
      if (n.judged && n.judged !== 'miss') continue;

      const prog = 1 - (dt / approach);
      const p = Math.max(0, Math.min(1.25, prog));
      const scale = s * (START + (TARGET - START) * p);

      // Far notes stay faint and near ones burn bright, so with eighth-note
      // patterns your eye still knows which ring is the one to hit.
      let a = 0.15 + 0.85 * Math.pow(p, 1.5);
      if (dt < 0) a *= Math.max(0, 1 + dt / 0.34);

      const hot = Math.min(1, p * 1.1);
      const col = 'rgba(255,' + Math.round(255 - 105 * hot) + ',' +
                  Math.round(255 - 105 * hot) + ',';

      // neon comet trail once a note is committed to the target — two echo
      // outlines lagging behind its shrink read as motion blur
      if (p > 0.45 && dt >= 0) {
        for (let e = 1; e <= 2; e++) {
          const es = scale + s * 0.09 * e;
          ctx.globalAlpha = 1;
          ctx.lineWidth = 2;
          ctx.strokeStyle = col + (a * 0.22 / e) + ')';
          heartPath(ctx, cx, cy, es, 0);
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      ctx.lineWidth = 3 + 3.5 * p;
      ctx.strokeStyle = col + (a * 0.95) + ')';
      ctx.shadowColor = 'rgba(255,110,170,' + (a * 0.85) + ')';
      ctx.shadowBlur = 18 * p;
      heartPath(ctx, cx, cy, scale, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,190,225,' + (a * 0.055) + ')';
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHeart() {
    if (heart.alpha < 0.012) return;
    const cx = W / 2, cy = centreY();
    const s = baseSize() * heart.scale;
    const dim = heart.sad;

    ctx.save();
    ctx.globalAlpha = heart.alpha;

    ctx.shadowColor = 'rgba(255,60,130,' + (0.55 + heart.glow * 0.45) + ')';
    ctx.shadowBlur = 40 + heart.glow * 70;

    const g = ctx.createLinearGradient(cx, cy - s, cx, cy + s);
    g.addColorStop(0, dim > 0.02 ? '#c96a90' : '#ff7fae');
    g.addColorStop(0.45, dim > 0.02 ? '#b93f68' : '#fb3f7e');
    g.addColorStop(1, dim > 0.02 ? '#8e1c44' : '#c8134f');
    ctx.fillStyle = g;
    heartPath(ctx, cx, cy, s, heart.rot);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,220,235,0.55)';
    ctx.stroke();

    ctx.save();
    heartPath(ctx, cx, cy, s, heart.rot);
    ctx.clip();
    const hx = cx - s * 0.34, hy = cy - s * 0.36;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, s * 0.72);
    hg.addColorStop(0, 'rgba(255,255,255,0.62)');
    hg.addColorStop(0.5, 'rgba(255,255,255,0.16)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(cx - s * 1.6, cy - s * 1.6, s * 3.2, s * 3.2);

    ctx.globalAlpha = 0.5 * heart.alpha;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.38, cy - s * 0.30, s * 0.16, s * 0.075, -0.6, 0, 6.283);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawSparks() {
    ctx.save();
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      const a = Math.max(0, Math.min(1, s.life));
      ctx.globalAlpha = a;
      ctx.fillStyle = s.tone > 0.62 ? '#fff0c2' : s.tone > 0.3 ? '#ffb3d4' : '#ff6ea3';
      if (s.heart) {
        heartPath(ctx, s.x, s.y, s.r * 1.5, s.rot);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * a, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* --- Tsushima wind: thin bright lines sweeping through the frame ------ */

  function spawnStreaks(n) {
    for (let i = 0; i < n; i++) {
      const y = rr(0.16, 0.62);
      streaks.push({
        x0: rr(-0.15, 0.25), y0: y,
        len: rr(0.22, 0.42),
        drop: rr(0.02, 0.07),           // gentle downhill drift
        bow: rr(-0.03, 0.05),           // curve of the gust
        t: 0, dur: rr(1.3, 2.1),
        w: rr(1, 2.2)
      });
    }
  }

  function drawStreaks() {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i];
      // head runs 0→1 first, tail follows: a comet of wind
      const head = Math.min(1, s.t * 1.35);
      const tail = Math.max(0, s.t * 1.35 - 0.42);
      if (tail >= 1) continue;
      const a = Math.sin(Math.min(1, s.t) * Math.PI) * 0.5;

      const X = function (u) { return (s.x0 + (s.len + 0.55) * u) * W; };
      const Y = function (u) {
        return (s.y0 + s.drop * u + Math.sin(u * Math.PI) * s.bow) * H;
      };

      ctx.strokeStyle = 'rgba(255,240,246,' + a.toFixed(3) + ')';
      ctx.lineWidth = s.w;
      ctx.beginPath();
      const STEPS = 14;
      for (let k = 0; k <= STEPS; k++) {
        const u = tail + (head - tail) * (k / STEPS);
        if (k === 0) ctx.moveTo(X(u), Y(u)); else ctx.lineTo(X(u), Y(u));
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /* --- judgment floaters at the point of the click ---------------------- */

  const FLOATER_STYLE = {
    perfect: { col: '#ffe89a', glow: 'rgba(255,200,60,0.95)', size: 1.15 },
    great:   { col: '#ffd9ea', glow: 'rgba(255,120,190,0.9)', size: 1.0 },
    good:    { col: '#d8e6ff', glow: 'rgba(150,190,255,0.85)', size: 0.9 },
    miss:    { col: 'rgba(255,225,235,0.75)', glow: 'rgba(80,10,50,0.6)', size: 0.78 },
    stray:   { col: 'rgba(255,225,235,0.75)', glow: 'rgba(80,10,50,0.6)', size: 0.78 },
    combo:   { col: '#fff3c4', glow: 'rgba(255,190,60,1)', size: 1.5 }
  };

  function floater(kind, text, x, y) {
    const st = FLOATER_STYLE[kind] || FLOATER_STYLE.good;
    floaters.push({
      text: text, x: x, y: y,
      col: st.col, glow: st.glow,
      px: st.size, t: 0,
      dur: kind === 'combo' ? 1.1 : 0.75,
      drift: rr(-14, 14)
    });
  }

  function drawFloaters() {
    if (!floaters.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < floaters.length; i++) {
      const f = floaters[i];
      // pop in fast, ride up, fade at the end
      const pop = Math.min(1, f.t * 6);
      const scale = 0.6 + 0.4 * (pop < 1 ? 1.35 - 0.35 * pop : 1);
      const rise = f.t * 52;
      const a = f.t > 0.6 ? 1 - (f.t - 0.6) / 0.4 : 1;
      const px = Math.round(Math.min(W, H) * 0.032 * f.px * scale);
      ctx.font = '800 ' + px + 'px "Baloo 2", sans-serif';
      ctx.globalAlpha = a;
      ctx.shadowColor = f.glow;
      ctx.shadowBlur = 14;
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, f.x + f.drift * f.t, f.y - rise);
    }
    ctx.restore();
  }

  /* --- kiai: the fever overlay ------------------------------------------ */

  function drawKiai() {
    if (kiaiFlash > 0.005) {
      ctx.fillStyle = 'rgba(255,240,220,' + (kiaiFlash * 0.28).toFixed(3) + ')';
      ctx.fillRect(-10, -10, W + 20, H + 20);
    }
    if (!kiai) return;
    // breathing golden edge-light while the chorus burns
    const breathe = 0.5 + 0.5 * Math.sin(tGlobal * 4.2) ;
    const a = 0.10 + 0.10 * breathe + beatFlash * 0.16;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34,
                                       W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(255,190,120,0)');
    g.addColorStop(1, 'rgba(255,160,90,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, W + 20, H + 20);
  }

  /** Volumetric shafts fanning out of the low sun. */
  function drawRays() {
    const sx = W * SUN_X, sy = H * SUN_Y;
    const R = Math.max(W, H) * 1.25;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(sx, sy);
    ctx.rotate(Math.sin(tGlobal * 0.07) * 0.05);
    for (let i = 0; i < 9; i++) {
      const a0 = (i / 9) * 6.283 + tGlobal * 0.012;
      const wdt = 0.035 + 0.045 * Math.abs(Math.sin(i * 2.3 + tGlobal * 0.22));
      const g = ctx.createLinearGradient(0, 0, Math.cos(a0) * R, Math.sin(a0) * R);
      g.addColorStop(0, 'rgba(255,222,190,0.085)');
      g.addColorStop(0.45, 'rgba(255,190,180,0.030)');
      g.addColorStop(1, 'rgba(255,170,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, a0 - wdt, a0 + wdt);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawGrain() {
    if (!grainPat) return;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = grainPat;
    // shift it every frame so it shimmers like real film rather than sitting still
    const ox = (tGlobal * 53) % 160, oy = (tGlobal * 71) % 160;
    ctx.translate(-ox, -oy);
    ctx.fillRect(0, 0, W + 160, H + 160);
    ctx.restore();
  }

  function drawVignette() {
    const g = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.32,
                                       W / 2, H * 0.5, Math.max(W, H) * 0.76);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(28,0,24,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ====================================================================== */

  return {
    mount: mount,
    setNotes: setNotes, setClock: setClock, setMode: setMode,
    punch: punch, pulse: pulse, burst: burst, celebrate: celebrate,
    setKiai: setKiai, judgment: judgment, milestone: milestone,
    get heartCentre() { return { x: W / 2, y: centreY(), s: baseSize() }; }
  };
})();
