/* NEXUS visual layer — canvas particle structures (hero sphere, page clusters, card fields).
   Decorative only: no research values are encoded here. Pauses off-screen / hidden tab; static under reduced motion. */
(function () {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function palette() {
    const light = document.documentElement.dataset.theme === "light";
    return light
      ? { a: [47, 95, 224], b: [107, 63, 224], c: [163, 50, 214], d: [10, 143, 184], mode: "source-over", alpha: 0.75 }
      : { a: [91, 140, 255], b: [155, 107, 255], c: [212, 102, 255], d: [89, 214, 255], mode: "lighter", alpha: 1 };
  }
  const mix = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // seeded RNG so the structure looks identical every load
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function runner(canvas, draw) {
    const ctx = canvas.getContext("2d");
    let w = 0, hgt = 0, dpr = 1, raf = 0, visible = true, t0 = performance.now();
    const st = { mx: 0, my: 0, tmx: 0, tmy: 0 };
    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width); hgt = Math.max(1, r.height);
      canvas.width = w * dpr; canvas.height = hgt * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced || !visible) frame(performance.now(), true);
    }
    function frame(now, once) {
      st.mx += (st.tmx - st.mx) * 0.05; st.my += (st.tmy - st.my) * 0.05;
      ctx.clearRect(0, 0, w, hgt);
      draw(ctx, w, hgt, reduced ? 2.2 : (now - t0) / 1000, st, palette());
      if (!once && !reduced && visible) raf = requestAnimationFrame((n) => frame(n));
    }
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    const io = new IntersectionObserver((e) => {
      const was = visible; visible = e[0].isIntersecting && !document.hidden;
      if (visible && !was && !reduced) { cancelAnimationFrame(raf); raf = requestAnimationFrame((n) => frame(n)); }
    });
    io.observe(canvas);
    document.addEventListener("visibilitychange", () => {
      visible = !document.hidden;
      if (visible && !reduced) { cancelAnimationFrame(raf); raf = requestAnimationFrame((n) => frame(n)); }
    });
    canvas.parentElement.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      st.tmx = (e.clientX - r.left) / r.width - 0.5; st.tmy = (e.clientY - r.top) / r.height - 0.5;
    });
    document.addEventListener("nexus:theme", () => frame(performance.now(), true));
    resize();
    if (!reduced) raf = requestAnimationFrame((n) => frame(n)); else frame(performance.now(), true);
  }

  /* ---------------- hero: luminous neural sphere with orbital rings */
  function sphere(canvas, opts = {}) {
    const R = rng(7), N = opts.n || (window.innerWidth < 760 ? 1800 : 4200);
    const pts = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
      const jitter = 1 + (R() - 0.5) * 0.06;
      pts.push({ x: Math.cos(th) * r * jitter, y: y * jitter, z: Math.sin(th) * r * jitter, s: R(), c: R() });
    }
    const core = [];
    for (let i = 0; i < 380; i++) { // inner volumetric cloud
      const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = Math.pow(R(), 0.6) * 0.78;
      const q = Math.sqrt(1 - u * u);
      core.push({ x: q * Math.cos(th) * rr, y: u * rr, z: q * Math.sin(th) * rr, s: R() });
    }
    const links = [];
    for (let i = 0; i < 160; i++) { const a = (R() * core.length) | 0, b = (R() * core.length) | 0; links.push([a, b]); }
    const rings = [{ tilt: 0.42, rot: 0.2, r: 1.28, n: 160 }, { tilt: -0.3, rot: 1.1, r: 1.5, n: 130 }, { tilt: 1.2, rot: 2.3, r: 1.14, n: 100 }, { tilt: 0.1, rot: 0.7, r: 1.85, n: 90 }];
    rings.forEach((rg) => { rg.seed = []; for (let i = 0; i < rg.n; i++) rg.seed.push({ a: R() * Math.PI * 2, s: R() }); });
    const stars = Array.from({ length: 240 }, () => ({ x: R(), y: R(), s: R() }));

    runner(canvas, (ctx, w, hgt, t, st, P) => {
      const cx = w * (opts.cx ?? 0.56) + st.mx * 18, cy = hgt * (opts.cy ?? 0.5) + st.my * 14;
      const rad = Math.min(w * (opts.scale ?? 0.22), hgt * 0.34);
      const ry = t * 0.08 + st.mx * 0.5, rx = 0.32 + st.my * 0.3;
      const cy1 = Math.cos(ry), sy1 = Math.sin(ry), cx1 = Math.cos(rx), sx1 = Math.sin(rx);
      const proj = (p, k = 1) => {
        let x = p.x * k, y = p.y * k, z = p.z * k;
        let x2 = x * cy1 + z * sy1, z2 = -x * sy1 + z * cy1;
        let y2 = y * cx1 - z2 * sx1, z3 = y * sx1 + z2 * cx1;
        const f = 2.6 / (2.6 + z3);
        return [cx + x2 * rad * f, cy + y2 * rad * f, z3, f];
      };
      ctx.globalCompositeOperation = P.mode;
      // stars
      stars.forEach((s) => { ctx.fillStyle = rgba(P.d, (0.15 + s.s * 0.35) * P.alpha); ctx.fillRect(s.x * w, s.y * hgt, s.s * 1.4, s.s * 1.4); });
      // halo
      const g = ctx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad * 1.6);
      g.addColorStop(0, rgba(P.c, 0.22 * P.alpha)); g.addColorStop(0.35, rgba(P.b, 0.10 * P.alpha)); g.addColorStop(1, rgba(P.a, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad * 1.6, 0, Math.PI * 2); ctx.fill();
      // rings
      rings.forEach((rg, ri) => {
        const ct = Math.cos(rg.tilt), stl = Math.sin(rg.tilt), cr = Math.cos(rg.rot + t * 0.02), sr = Math.sin(rg.rot + t * 0.02);
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const a = (i / 120) * Math.PI * 2;
          let x = Math.cos(a) * rg.r, z = Math.sin(a) * rg.r, y = 0;
          let y2 = y * ct - z * stl, z2 = y * stl + z * ct;
          let x3 = x * cr - z2 * sr, z3 = x * sr + z2 * cr;
          const [px, py] = proj({ x: x3, y: y2, z: z3 });
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.strokeStyle = rgba(ri === 1 ? P.b : P.a, 0.32 * P.alpha); ctx.lineWidth = 0.9; ctx.stroke();
        rg.seed.forEach((sd) => {
          const a = sd.a + t * (0.05 + sd.s * 0.05) * (ri % 2 ? -1 : 1);
          let x = Math.cos(a) * rg.r, z = Math.sin(a) * rg.r;
          let y2 = -z * stl, z2 = z * ct;
          let x3 = x * cr - z2 * sr, z3 = x * sr + z2 * cr;
          const [px, py, pz] = proj({ x: x3, y: y2, z: z3 });
          const al = (0.25 + sd.s * 0.6) * (pz > 0 ? 0.55 : 1);
          ctx.fillStyle = rgba(sd.s > 0.85 ? P.c : P.d, al * P.alpha);
          const sz = sd.s > 0.92 ? 2.6 : 1.2;
          ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
        });
      });
      // inner links (neural)
      ctx.lineWidth = 0.5;
      links.forEach(([a, b], i) => {
        const p = proj(core[a]), q = proj(core[b]);
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + i);
        ctx.strokeStyle = rgba(mix(P.b, P.c, pulse), 0.10 * P.alpha);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      });
      core.forEach((p) => {
        const [px, py, pz, f] = proj(p);
        const a = (0.25 + p.s * 0.55) * (pz > 0 ? 0.6 : 1);
        ctx.fillStyle = rgba(mix(P.c, P.d, p.s), a * P.alpha);
        const sz = (0.8 + p.s * 1.8) * f;
        ctx.fillRect(px, py, sz, sz);
      });
      // shell
      pts.forEach((p) => {
        const [px, py, pz, f] = proj(p);
        const front = pz < 0;
        const tw = 0.6 + 0.4 * Math.sin(t * 2 + p.s * 30);
        const a = (front ? 1 : 0.28) * (0.45 + p.s * 0.55) * tw;
        const col = p.c < 0.5 ? mix(P.a, P.d, p.c * 2) : mix(P.b, P.c, (p.c - 0.5) * 2);
        ctx.fillStyle = rgba(col, a * P.alpha);
        const sz = (p.s > 0.97 ? 2.8 : 1.5) * f;
        ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      });
      // rim light (sphere surface)
      const rim = ctx.createRadialGradient(cx, cy, rad * 0.78, cx, cy, rad * 1.08);
      rim.addColorStop(0, rgba(P.a, 0)); rim.addColorStop(0.75, rgba(P.b, 0.16 * P.alpha)); rim.addColorStop(1, rgba(P.a, 0));
      ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(cx, cy, rad * 1.08, 0, Math.PI * 2); ctx.fill();
      // bright core flare
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 0.45);
      g2.addColorStop(0, rgba([255, 255, 255], 0.35 * P.alpha)); g2.addColorStop(0.2, rgba(P.c, 0.25 * P.alpha)); g2.addColorStop(1, rgba(P.b, 0));
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    });
  }

  /* ---------------- page hero cluster: dense polyhedral point cloud (H1 / Paper5 headers) */
  function cluster(canvas, opts = {}) {
    const R = rng(opts.seed || 11), pts = [];
    const n = opts.n || 1400;
    for (let i = 0; i < n; i++) {
      // points concentrated on an icosahedral shell + filaments
      const u = R() * 2 - 1, th = R() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      const k = R() < 0.75 ? 0.9 + R() * 0.12 : Math.pow(R(), 0.5) * 0.9;
      const facet = Math.round(th / (Math.PI / 5)) * (Math.PI / 5);
      const tt = th * 0.7 + facet * 0.3;
      pts.push({ x: q * Math.cos(tt) * k, y: u * k, z: q * Math.sin(tt) * k, s: R() });
    }
    const fil = Array.from({ length: 70 }, () => ({ a: R() * Math.PI * 2, b: R() * 2 - 1, l: 1.2 + R() * 1.4, s: R() }));
    runner(canvas, (ctx, w, hgt, t, st, P) => {
      const cx = w * (opts.cx ?? 0.5) + st.mx * 12, cy = hgt * (opts.cy ?? 0.5) + st.my * 10, rad = Math.min(w, hgt) * (opts.scale ?? 0.3);
      const ry = t * 0.1 + st.mx * 0.4, c = Math.cos(ry), s = Math.sin(ry), rx = 0.5, cx2 = Math.cos(rx), sx2 = Math.sin(rx);
      ctx.globalCompositeOperation = P.mode;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.5);
      g.addColorStop(0, rgba(P.a, 0.18 * P.alpha)); g.addColorStop(1, rgba(P.b, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad * 1.5, 0, Math.PI * 2); ctx.fill();
      fil.forEach((f) => {
        const q = Math.sqrt(1 - f.b * f.b);
        const x = Math.cos(f.a + t * 0.05) * q, y = f.b, z = Math.sin(f.a + t * 0.05) * q;
        const x2 = x * c + z * s;
        ctx.strokeStyle = rgba(f.s > .5 ? P.d : P.c, 0.12 * P.alpha); ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(cx + x2 * rad, cy + y * rad); ctx.lineTo(cx + x2 * rad * f.l, cy + y * rad * f.l); ctx.stroke();
      });
      pts.forEach((p) => {
        let x = p.x * c + p.z * s, z = -p.x * s + p.z * c;
        let y = p.y * cx2 - z * sx2, z2 = p.y * sx2 + z * cx2;
        const f = 2.4 / (2.4 + z2);
        const a = (z2 < 0 ? 0.8 : 0.25) * (0.3 + p.s * 0.7);
        ctx.fillStyle = rgba(mix(P.a, P.d, p.s), a * P.alpha);
        const sz = (p.s > 0.96 ? 2.2 : 1) * f;
        ctx.fillRect(cx + x * rad * f, cy + y * rad * f, sz, sz);
      });
      ctx.globalCompositeOperation = "source-over";
    });
  }

  /* ---------------- card field: drifting connected points */
  function field(canvas, opts = {}) {
    const R = rng(opts.seed || 3), n = opts.n || 70;
    const pts = Array.from({ length: n }, () => ({ x: R(), y: R(), vx: (R() - 0.5) * 0.02, vy: (R() - 0.5) * 0.02, s: R() }));
    runner(canvas, (ctx, w, hgt, t, st, P) => {
      ctx.globalCompositeOperation = P.mode;
      const pos = pts.map((p) => [((p.x + p.vx * t) % 1 + 1) % 1 * w, ((p.y + p.vy * t) % 1 + 1) % 1 * hgt, p.s]);
      for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1], d = Math.hypot(dx, dy);
        if (d < 70) { ctx.strokeStyle = rgba(opts.hue === "v" ? P.c : P.a, (1 - d / 70) * 0.28 * P.alpha); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(pos[i][0], pos[i][1]); ctx.lineTo(pos[j][0], pos[j][1]); ctx.stroke(); }
      }
      pos.forEach(([x, y, s]) => { ctx.fillStyle = rgba(s > 0.8 ? P.c : P.d, (0.4 + s * 0.6) * P.alpha); const z = s > 0.9 ? 2.6 : 1.4; ctx.fillRect(x - z / 2, y - z / 2, z, z); });
      ctx.globalCompositeOperation = "source-over";
    });
  }

  /* ---------------- orb thumbnail: small glowing particle globe (timeline / research cards). Static frame. */
  const ORB_HUE = { b: ["a", "d"], v: ["b", "c"], r: ["c", "c"], g: ["d", "a"], n: ["a", "b"] };
  function orb(canvas, opts = {}) {
    const R = rng(opts.seed || 1), n = opts.n || 520, pts = [];
    for (let i = 0; i < n; i++) { const u = R() * 2 - 1, th = R() * Math.PI * 2, q = Math.sqrt(1 - u * u), k = R() < 0.7 ? 1 : Math.pow(R(), 0.4); pts.push([q * Math.cos(th) * k, u * k, q * Math.sin(th) * k, R()]); }
    const arcs = Array.from({ length: opts.arcs ?? 5 }, () => [R() * Math.PI, R() * Math.PI * 2, 0.7 + R() * 0.5]);
    function draw() {
      const ctx = canvas.getContext("2d"), r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!canvas.isConnected || r.width < 8 || r.height < 8) return;
      const w = r.width, hh = r.height;
      canvas.width = w * dpr; canvas.height = hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const P = palette(), [ka, kb] = ORB_HUE[opts.hue || "b"] || ORB_HUE.b, ca = P[ka], cb = P[kb];
      const cx = w * (opts.cx ?? 0.5), cy = hh * (opts.cy ?? 0.5), rad = Math.min(w, hh) * (opts.scale ?? 0.36), ry = opts.rot ?? R() * 6, rx = 0.45;
      ctx.clearRect(0, 0, w, hh);
      ctx.globalCompositeOperation = P.mode;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.7);
      g.addColorStop(0, rgba(cb, 0.38 * P.alpha)); g.addColorStop(0.45, rgba(ca, 0.14 * P.alpha)); g.addColorStop(1, rgba(ca, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad * 1.7, 0, Math.PI * 2); ctx.fill();
      const c1 = Math.cos(ry), s1 = Math.sin(ry), c2 = Math.cos(rx), s2 = Math.sin(rx);
      const pr = (x, y, z) => { const x2 = x * c1 + z * s1, z2 = -x * s1 + z * c1, y2 = y * c2 - z2 * s2, z3 = y * s2 + z2 * c2; return [cx + x2 * rad, cy + y2 * rad, z3]; };
      ctx.lineWidth = 0.7;
      arcs.forEach(([a, b, k], i) => { ctx.strokeStyle = rgba(i % 2 ? ca : cb, 0.35 * P.alpha); ctx.beginPath();
        for (let t = 0; t <= 48; t++) { const th = (t / 48) * Math.PI * 2, x = Math.cos(th) * k, y = Math.sin(th) * k * Math.cos(a), z = Math.sin(th) * k * Math.sin(a); const q = pr(x * Math.cos(b) - z * Math.sin(b), y, x * Math.sin(b) + z * Math.cos(b)); t ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        ctx.stroke(); });
      pts.forEach(([x, y, z, sd]) => { const q = pr(x, y, z), a = (q[2] < 0 ? 0.9 : 0.3) * (0.35 + sd * 0.65); ctx.fillStyle = rgba(mix(ca, cb, sd), a * P.alpha); const sz = sd > 0.95 ? 1.9 : 1.05; ctx.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz); });
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 0.5);
      g2.addColorStop(0, rgba([255, 255, 255], 0.55 * P.alpha)); g2.addColorStop(0.3, rgba(cb, 0.3 * P.alpha)); g2.addColorStop(1, rgba(ca, 0));
      ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(cx, cy, rad * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      if (opts.ring !== false) { ctx.strokeStyle = rgba(ca, 0.45 * P.alpha); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, hh) / 2 - 1.5, 0, Math.PI * 2); ctx.stroke(); }
    }
    new ResizeObserver(draw).observe(canvas);
    document.addEventListener("nexus:theme", draw);
    draw();
  }

  window.NXViz = { sphere, cluster, field, orb };
})();
