/* NEXUS data-viz layer — real-data 3D point cloud, voxel cube, heat tiles and a small line chart.
   Every mark here is one value from data/*.json; hover shows it, click opens the Evidence drawer.
   (Decorative particles live in viz.js; nothing in this file is decorative.) */
(function () {
  "use strict";
  const { h, esc, fmt, fmtCI, tip, css, reduced, openEvidence, svg: s } = window.NX;

  // ------------------------------------------------------------------ colour
  // AUROC scale, diverging at 0.5: below → violet/magenta, 0.5 → deep blue, above → cyan/yellow.
  const AUROC_STOPS = [[0, [255, 79, 216]], [0.25, [138, 77, 255]], [0.5, [26, 42, 122]], [0.75, [34, 199, 255]], [1, [255, 242, 122]]];
  const PT_STOPS = [[0, [255, 92, 220]], [0.25, [170, 100, 255]], [0.5, [112, 124, 255]], [0.75, [60, 210, 255]], [1, [255, 245, 150]]];
  const DIFF_STOPS = [[0, [90, 120, 255]], [0.5, [11, 18, 64]], [1, [255, 107, 214]]];
  function ramp(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i], k = (t - a) / (b - a || 1);
        return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k];
      }
    }
    return stops[stops.length - 1][1];
  }
  const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const color = { auroc: (v) => ramp(AUROC_STOPS, v), point: (v) => ramp(PT_STOPS, v), diff: (d, span = 0.3) => ramp(DIFF_STOPS, 0.5 + d / (2 * span)), rgb };

  function colorbar(kind, o = {}) {
    const stops = kind === "diff" ? DIFF_STOPS : AUROC_STOPS;
    const grad = stops.map(([t, c]) => `${rgb(c)} ${t * 100}%`).join(",");
    const labels = kind === "diff" ? [`−${o.span ?? 0.3}`, "0", `+${o.span ?? 0.3}`] : ["0", "0.5 (우연)", "1"];
    return h("div", { class: "cbar", "aria-hidden": "true" }, h("div", { class: "cbar-g", style: `background:linear-gradient(90deg,${grad})` }),
      h("div", { class: "cbar-l" }, labels.map((l) => h("span", {}, l))));
  }

  // ------------------------------------------------------------------ 3D core
  function scene(canvas, opts) {
    const ctx = canvas.getContext("2d");
    const st = { ry: opts.ry ?? -0.6, rx: opts.rx ?? 0.42, auto: !reduced, drag: null, w: 1, h: 1, dpr: 1, hover: null, raf: 0, visible: true, last: performance.now() };
    function size() {
      const r = canvas.getBoundingClientRect();
      st.dpr = Math.min(window.devicePixelRatio || 1, 2); st.w = Math.max(1, r.width); st.h = Math.max(1, r.height);
      canvas.width = st.w * st.dpr; canvas.height = st.h * st.dpr; ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    }
    function project(x, y, z) { // inputs in [-1, 1]
      const cy = Math.cos(st.ry), sy = Math.sin(st.ry), cx = Math.cos(st.rx), sx = Math.sin(st.rx);
      const x2 = x * cy + z * sy, z2 = -x * sy + z * cy;
      const y2 = y * cx - z2 * sx, z3 = y * sx + z2 * cx;
      const f = 3.2 / (3.2 + z3), sc = Math.min(st.w, st.h) * (opts.scale ?? 0.33);
      return [st.w / 2 + x2 * sc * f, st.h / 2 - y2 * sc * f + (opts.dy ?? 0), z3, f];
    }
    function box(labels) { // wireframe cube with axis labels
      const c = [-1, 1], P = [];
      c.forEach((x) => c.forEach((y) => c.forEach((z) => P.push([x, y, z]))));
      ctx.strokeStyle = css("--chart-grid") || "rgba(140,160,255,.18)"; ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
        const d = P[i].reduce((n, v, k) => n + (v !== P[j][k] ? 1 : 0), 0);
        if (d !== 1) continue;
        const a = project(...P[i]), b = project(...P[j]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.fillStyle = css("--chart-axis") || "#8a93c0"; ctx.font = "10.5px Inter, sans-serif";
      (labels || []).forEach(([x, y, z, t]) => { const p = project(x, y, z); ctx.fillText(t, p[0], p[1]); });
    }
    function loop(now) {
      const dt = Math.min(64, now - st.last); st.last = now;
      if (st.auto && !st.drag) st.ry += dt * 0.00012;
      opts.draw();
      if (st.auto && st.visible && !document.hidden) st.raf = requestAnimationFrame(loop);
    }
    function kick() { cancelAnimationFrame(st.raf); st.last = performance.now(); if (st.auto) st.raf = requestAnimationFrame(loop); else opts.draw(); }
    canvas.addEventListener("pointerdown", (e) => { st.drag = [e.clientX, e.clientY, st.ry, st.rx]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener("pointerup", (e) => { const d = st.drag; st.drag = null; if (d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 4 && st.hover && st.hover.id) { const r = st.hover.ref || {}; openEvidence(st.hover.id, { dataset: { v: r.v ?? "", lo: r.lo ?? "", hi: r.hi ?? "" }, focus: () => canvas.focus() }); } });
    canvas.addEventListener("pointermove", (e) => {
      if (st.drag) { st.ry = st.drag[2] + (e.clientX - st.drag[0]) * 0.008; st.rx = Math.max(-1.2, Math.min(1.2, st.drag[3] + (e.clientY - st.drag[1]) * 0.006)); if (!st.auto) opts.draw(); tip(null); return; }
      const r = canvas.getBoundingClientRect(); const hit = opts.pick(e.clientX - r.left, e.clientY - r.top);
      st.hover = hit; canvas.style.cursor = hit ? "pointer" : "grab";
      tip(hit ? hit.html : null, e.clientX, e.clientY);
      if (!st.auto) opts.draw();
    });
    canvas.addEventListener("pointerleave", () => { st.hover = null; tip(null); if (!st.auto) opts.draw(); });
    canvas.addEventListener("keydown", (e) => {
      const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key];
      if (k) { e.preventDefault(); st.ry += k[0]; st.rx = Math.max(-1.2, Math.min(1.2, st.rx + k[1])); st.auto = false; opts.draw(); }
      if (e.key === " ") { e.preventDefault(); st.auto = !st.auto && !reduced; kick(); }
    });
    new ResizeObserver(() => { size(); opts.draw(); }).observe(canvas);
    new IntersectionObserver((en) => { st.visible = en[0].isIntersecting; if (st.visible) kick(); }).observe(canvas);
    document.addEventListener("nexus:theme", () => opts.draw());
    size();
    return { ctx, st, project, box, kick };
  }

  /** points: [{x,y,z in -1..1, v (colour value), ref, label, sub}] ; opts.axes labels */
  function cloud(canvas, points, opts = {}) {
    let hl = new Set(), proj = [], labelId = null;
    const S = scene(canvas, { ...opts, draw, pick });
    function draw() {
      const { ctx, st, project } = S;
      ctx.clearRect(0, 0, st.w, st.h);
      S.box(opts.axes);
      const light = document.documentElement.dataset.theme === "light";
      ctx.globalCompositeOperation = light ? "source-over" : "lighter";
      proj = points.map((p, i) => { const q = project(p.x, p.y, p.z); return { i, x: q[0], y: q[1], z: q[2], f: q[3], p }; }).sort((a, b) => b.z - a.z);
      const dim = hl.size > 0;
      proj.forEach((q) => {
        const p = q.p, on = hl.has(p.ref && p.ref.id);
        const c = color.point(p.v);
        const a = (dim ? (on ? 1 : p.strong ? 0.42 : 0.2) : p.strong ? 0.9 : 0.45) * (q.z < 0 ? 1 : 0.65);
        const r = (on ? 4.4 : p.strong ? 1.8 : 1.25) * q.f;
        if (p.strong && !on) { ctx.fillStyle = rgb(c, a * 0.16); ctx.beginPath(); ctx.arc(q.x, q.y, r * 3, 0, 7); ctx.fill(); }
        if (on) { const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 4); g.addColorStop(0, rgb(c, a * 0.55)); g.addColorStop(1, rgb(c, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q.x, q.y, r * 4, 0, 7); ctx.fill(); }
        ctx.fillStyle = rgb(c, a); ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";
      // labels for highlighted points
      ctx.font = "600 11px Inter, sans-serif";
      proj.filter((q) => q.p.ref && q.p.ref.id === labelId).forEach((q) => {
        ctx.fillStyle = css("--text"); ctx.fillText(`${q.p.short || q.p.label} ${fmt(q.p.ref.v)}`, q.x + 9, q.y - 7);
      });
      if (S.st.hover && S.st.hover.q) { const q = S.st.hover.q; ctx.strokeStyle = css("--text"); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(q.x, q.y, 7, 0, 7); ctx.stroke(); }
    }
    function pick(mx, my) {
      let best = null, bd = 10;
      for (let i = proj.length - 1; i >= 0; i--) { const q = proj[i]; const d = Math.hypot(q.x - mx, q.y - my); if (d < bd && (hl.size === 0 || hl.has(q.p.ref && q.p.ref.id) || d < 4)) { bd = d; best = q; } }
      if (!best) return null;
      const p = best.p;
      return { id: p.ref && p.ref.id, ref: p.ref, q: best, html: `<b>${esc(p.label)}</b><br>${fmt(p.ref.v)} <span class="ci">${fmtCI(p.ref, 3)}</span>${p.sub ? `<br><span class="faint">${esc(p.sub)}</span>` : ""}<br><span class="faint">클릭: 출처 · 드래그: 회전</span>` };
    }
    S.kick();
    return { highlight(ids, label) { hl = new Set(ids); labelId = label || null; if (!S.st.auto) draw(); }, redraw: draw };
  }

  /** voxels: dims [nx, ny, nz]; cells [{i,j,k, ref, label, sub}] ; opts.focus(cell) → bool */
  function voxels(canvas, dims, cells, opts = {}) {
    let focus = opts.focus || (() => true), faces = [];
    const S = scene(canvas, { ...opts, draw, pick });
    const [nx, ny, nz] = dims, m = Math.max(nx, ny, nz);
    const ax = (i, n) => ((i + 0.5) / n * 2 - 1) * (n / m);
    function draw() {
      const { ctx, st, project } = S;
      ctx.clearRect(0, 0, st.w, st.h);
      S.box(opts.axes);
      const half = 0.86 / m;
      faces = [];
      cells.forEach((c) => {
        if (!c.ref || c.ref.v == null) return;
        const cx = ax(c.i, nx), cy = ax(c.j, ny), cz = ax(c.k, nz);
        const q = project(cx, cy, cz);
        const strong = c.ref.lo != null && (c.ref.lo > 0.5 || c.ref.hi < 0.5);
        const on = focus(c);
        faces.push({ c, q, x: q[0], y: q[1], z: q[2], strong, on, cx, cy, cz });
      });
      faces.sort((a, b) => b.z - a.z);
      faces.forEach((f) => {
        const col = color.auroc(f.c.ref.v);
        const alpha = f.on ? (f.strong ? 0.92 : 0.5) : 0.1;
        // draw cube: 3 visible faces approximated by projecting the 8 corners and filling the hull per face
        const P = [];
        [-1, 1].forEach((dx) => [-1, 1].forEach((dy) => [-1, 1].forEach((dz) => P.push(project(f.cx + dx * half, f.cy + dy * half, f.cz + dz * half)))));
        const FACES = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
        const shade = [0.75, 0.75, 0.6, 1, 0.85, 0.85];
        FACES.map((fc, k) => ({ fc, k, z: fc.reduce((n, i) => n + P[i][2], 0) / 4 })).sort((a, b) => b.z - a.z).slice(3).forEach(({ fc, k }) => {
          ctx.beginPath(); fc.forEach((i, n) => (n ? ctx.lineTo(P[i][0], P[i][1]) : ctx.moveTo(P[i][0], P[i][1]))); ctx.closePath();
          ctx.fillStyle = rgb(col.map((v) => v * shade[k]), alpha); ctx.fill();
          if (f.on) { ctx.strokeStyle = rgb(col, Math.min(1, alpha + 0.2)); ctx.lineWidth = 0.6; ctx.stroke(); }
        });
        f.hx = P;
      });
      if (S.st.hover && S.st.hover.f) { const f = S.st.hover.f; ctx.strokeStyle = css("--text"); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, 7); ctx.stroke(); }
    }
    function pick(mx, my) {
      let best = null, bd = 12;
      for (let i = faces.length - 1; i >= 0; i--) { const f = faces[i]; if (!f.on) continue; const d = Math.hypot(f.x - mx, f.y - my); if (d < bd) { bd = d; best = f; } }
      if (!best) return null;
      const c = best.c;
      return { id: c.ref.id, ref: c.ref, f: best, html: `<b>${esc(c.label)}</b><br>AUROC ${fmt(c.ref.v)} <span class="ci">${fmtCI(c.ref, 3)}</span>${c.sub ? `<br><span class="faint">${esc(c.sub)}</span>` : ""}<br><span class="faint">클릭: 출처 · 드래그: 회전</span>` };
    }
    S.kick();
    return { setFocus(fn) { focus = fn; draw(); }, setCells(c, fn) { cells = c; if (fn) focus = fn; draw(); }, redraw: draw };
  }

  /** heat tile: cells [{ref|null, label, sub, d (diff value)}] in a cols×rows grid (crisp cells, no smoothing). */
  function tile(container, cells, o = {}) {
    container.innerHTML = "";
    const cols = o.cols || 5, rows = Math.ceil(cells.length / cols) || 1;
    const grid = h("div", { class: "htile" + (o.kind === "diff" ? " diff" : ""), role: "img", "aria-label": o.aria || "heat tile", style: `grid-template-columns:repeat(${cols},1fr)` });
    for (let i = 0; i < cols * rows; i++) {
      const c = cells[i];
      if (!c || (o.kind !== "diff" && (!c.ref || c.ref.v == null)) || (o.kind === "diff" && c.d == null)) {
        grid.append(h("span", { class: "hc empty", title: c ? `${c.label}: 값 없음` : "" }));
        continue;
      }
      const col = o.kind === "diff" ? color.diff(c.d, o.span) : color.auroc(c.ref.v);
      const strong = o.kind !== "diff" && c.ref.lo != null && (c.ref.lo > 0.5 || c.ref.hi < 0.5);
      const el = h("span", { class: "hc" + (strong ? " strong" : ""), style: `background:${rgb(col)}`, tabindex: o.kind === "diff" ? null : "0", role: o.kind === "diff" ? null : "button",
        "aria-label": o.kind === "diff" ? null : `${c.label} AUROC ${fmt(c.ref.v)}`, dataset: o.kind === "diff" ? {} : { stat: c.ref.id, v: c.ref.v, lo: c.ref.lo ?? "", hi: c.ref.hi ?? "" } });
      el.addEventListener("mousemove", (e) => tip(o.kind === "diff" ? `<b>${esc(c.label)}</b><br>차이 ${c.d >= 0 ? "+" : ""}${fmt(c.d)}${c.sub ? `<br><span class="faint">${esc(c.sub)}</span>` : ""}`
        : `<b>${esc(c.label)}</b><br>AUROC ${fmt(c.ref.v)} <span class="ci">${fmtCI(c.ref, 3)}</span>${c.sub ? `<br><span class="faint">${esc(c.sub)}</span>` : ""}<br><span class="faint">클릭: 출처</span>`, e.clientX, e.clientY));
      el.addEventListener("mouseleave", () => tip(null));
      grid.append(el);
    }
    container.append(grid);
    return grid;
  }

  /** small SVG line chart: series [{label, color, pts:[[x,y,ref?]]}], x log2 optional */
  function lines(container, series, o = {}) {
    container.innerHTML = "";
    const W = o.width || 360, H = o.height || 170, L = 34, R = 10, T = 12, B = 26;
    const xs = series.flatMap((sr) => sr.pts.map((p) => p[0]));
    const tx = o.log2 ? (v) => Math.log2(v) : (v) => v;
    const x0 = Math.min(...xs.map(tx)), x1 = Math.max(...xs.map(tx));
    const y0 = o.ymin ?? 0, y1 = o.ymax ?? 1;
    const X = (v) => L + (W - L - R) * ((tx(v) - x0) / (x1 - x0 || 1)), Y = (v) => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
    const svgEl = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "line chart" });
    const g = s("g", { class: "grid" });
    (o.yticks || [0, 0.5, 1]).forEach((t) => { g.append(s("line", { x1: L, x2: W - R, y1: Y(t), y2: Y(t) })); svgEl.append(s("text", { x: L - 5, y: Y(t) + 4, "text-anchor": "end" }, String(t))); });
    [...new Set(xs)].sort((a, b) => a - b).forEach((v) => svgEl.append(s("text", { x: X(v), y: H - 8, "text-anchor": "middle" }, o.xfmt ? o.xfmt(v) : String(v))));
    svgEl.append(g);
    if (o.ref != null) svgEl.append(s("line", { class: "ref", x1: L, x2: W - R, y1: Y(o.ref), y2: Y(o.ref) }));
    series.forEach((sr) => {
      const pts = sr.pts.filter((p) => p[1] != null);
      if (!pts.length) return;
      svgEl.append(s("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${X(p[0])},${Y(p[1])}`).join(" "), fill: "none", stroke: sr.color, "stroke-width": 1.8, style: `filter:drop-shadow(0 0 4px ${sr.color})` }));
      pts.forEach((p) => {
        const c = s("circle", { cx: X(p[0]), cy: Y(p[1]), r: 3.2, fill: sr.color, ...(p[2] ? { tabindex: 0, role: "button", "data-stat": p[2].id, "data-v": p[2].v, "data-lo": p[2].lo ?? "", "data-hi": p[2].hi ?? "", style: "cursor:pointer" } : {}) });
        c.addEventListener("mousemove", (e) => tip(`<b>${esc(sr.label)}</b><br>${o.xname || "x"} ${p[0]} · ${fmt(p[1])}${p[3] ? `<br><span class="faint">${esc(p[3])}</span>` : ""}`, e.clientX, e.clientY));
        c.addEventListener("mouseleave", () => tip(null));
        svgEl.append(c);
      });
    });
    container.append(svgEl);
    const lg = h("div", { class: "lg-row" }, series.map((sr) => h("span", {}, h("i", { style: `background:${sr.color}` }), sr.label)), o.xlabel ? h("span", { class: "faint", style: "margin-left:auto" }, "x: " + o.xlabel) : null);
    container.prepend(lg);
  }

  window.NX3D = { cloud, voxels, tile, lines, colorbar, color };
})();
