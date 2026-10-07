/* NEXUS components — research network graph + mission-log timeline (data: graph.json, timeline.json). */
(function () {
  "use strict";
  const { h, esc, date, svg: s, css, root, reduced } = window.NX;

  // fixed layout (viewBox 1000×560) — readable, stable between loads
  const POS = { // viewBox 1000×640
    nexus: [500, 320], h1: [235, 230], p5: [735, 230],
    reasoning: [90, 90], majority: [110, 420], floor: [270, 560],
    monitoring: [610, 70], planning: [900, 95], learning: [935, 310], auroc: [690, 470],
    loop: [420, 600], confound: [640, 600], prereg: [470, 470], falsify: [880, 440], next: [965, 590],
  };
  const KIND_R = { core: 40, project: 22, domain: 13, method: 10, next: 13 };
  const TYPE_KO = { question: "질문", experiment: "실험", analysis: "분석", unexpected: "예상 밖 결과", revision: "수정", falsification: "반증", next: "다음 질문" };

  function graph(container, data, opts = {}) {
    const box = h("div", { class: "graph-box" });
    const info = h("div", { class: "graph-info", "aria-live": "polite" }, h("span", { class: "faint" }, "노드에 마우스를 올리거나 Tab 으로 이동하세요. 클릭하면 해당 연구로 이동합니다."));
    const svgEl = s("svg", { viewBox: "0 0 1000 640", role: "img", "aria-label": "연구 네트워크: NEXUS 중심에 H1, Paper 5 와 관련 개념·방법이 연결된 지도" });
    const defs = s("defs");
    const rg = s("radialGradient", { id: "nodeglow" }, s("stop", { offset: 0, "stop-color": "#ffffff", "stop-opacity": 0.95 }), s("stop", { offset: 0.35, "stop-color": "#9b6bff", "stop-opacity": 0.75 }), s("stop", { offset: 1, "stop-color": "#5b8cff", "stop-opacity": 0 }));
    defs.append(rg);
    svgEl.append(defs);
    const adj = {};
    data.edges.forEach((e) => { (adj[e.source] = adj[e.source] || new Set()).add(e.target); (adj[e.target] = adj[e.target] || new Set()).add(e.source); });
    const edgeEls = data.edges.map((e) => {
      const a = POS[e.source], b = POS[e.target];
      if (!a || !b) return null;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - 18;
      const p = s("path", { class: "edge", d: `M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`, fill: "none", "data-a": e.source, "data-b": e.target });
      svgEl.append(p);
      return p;
    }).filter(Boolean);
    const nodeEls = {};
    data.nodes.forEach((n) => {
      const p = POS[n.id] || [500, 280];
      const r = KIND_R[n.kind] || 8;
      const col = n.kind === "project" ? (n.id === "h1" ? css("--rose") : css("--violet")) : n.kind === "domain" ? css("--blue") : n.kind === "next" ? css("--text-3") : n.kind === "core" ? css("--cyan") : css("--cyan");
      const g = s("g", { class: "node", tabindex: "0", role: "button", "aria-label": `${n.label}: ${n.desc}`, transform: `translate(${p[0]},${p[1]})`, "data-id": n.id, "data-kind": n.kind });
      if (n.kind === "core") {
        g.append(s("circle", { r: r * 2.4, fill: "url(#nodeglow)", opacity: 0.55 }));
        g.append(s("circle", { class: "core", r, fill: "none", stroke: col, "stroke-width": 1.5 }));
        g.append(s("circle", { r: r * 0.55, fill: col, opacity: 0.85 }));
        g.append(s("text", { y: 4, "text-anchor": "middle", style: "fill:#fff;font-size:17px;letter-spacing:.18em;font-weight:600" }, "NEXUS"));
      } else {
        g.append(s("circle", { r: r * 2.2, fill: col, opacity: 0.12 }));
        g.append(s("circle", { class: "ring", r, fill: "none", stroke: col, "stroke-width": n.kind === "next" ? 1.4 : 1.2, "stroke-dasharray": n.kind === "next" ? "3 3" : null }));
        g.append(s("circle", { r: Math.max(2.5, r * 0.45), fill: col }));
        const lx = p[0] > 800 ? -r - 10 : r + 10;
        g.append(s("text", { x: lx, y: 4, "text-anchor": p[0] > 800 ? "end" : "start", style: n.kind === "project" ? `font-size:27px;font-weight:600;fill:${css("--text")}` : "" }, n.label));
        if (n.status) g.append(s("text", { x: lx, y: 34, "text-anchor": p[0] > 800 ? "end" : "start", style: `font-size:20px;fill:${n.status === "반증됨" ? css("--rose") : n.status === "실행 전" ? css("--text-3") : css("--violet")}` }, n.status));
      }
      const show = () => focus(n.id);
      g.addEventListener("mouseenter", show); g.addEventListener("focus", show);
      g.addEventListener("mouseleave", () => focus(null)); g.addEventListener("blur", () => focus(null));
      g.addEventListener("click", () => { if (n.link) location.href = root + n.link; else show(); });
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" && n.link) location.href = root + n.link; });
      nodeEls[n.id] = g;
      svgEl.append(g);
    });
    function focus(id, keepInfo) {
      box.classList.toggle("dim", !!id);
      Object.entries(nodeEls).forEach(([k, el]) => el.classList.toggle("on", !!id && (k === id || (adj[id] && adj[id].has(k)))));
      edgeEls.forEach((e) => e.classList.toggle("on", !!id && (e.dataset.a === id || e.dataset.b === id)));
      if (id && !keepInfo) {
        const n = data.nodes.find((x) => x.id === id);
        info.innerHTML = `<b>${esc(n.label)}</b>${n.status ? ` · <span class="faint">${esc(n.status)}</span>` : ""}<br><span class="muted">${esc(n.desc)}</span>${n.link ? ` <span class="link-arrow">열기 →</span>` : ""}`;
      }
    }
    box.append(svgEl, info);
    if (opts.filters) {
      const seg = h("div", { class: "seg graph-filter", role: "group", "aria-label": "그래프 필터" });
      const F = [["all", "All"], ["h1", "H1"], ["p5", "Paper 5"], ["method", "Methods"], ["domain", "Domains"]];
      F.forEach(([k, l], i) => seg.append(h("button", { "aria-pressed": i === 0, onclick: (e) => {
        seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === e.currentTarget));
        if (k === "all") return focus(null);
        if (k === "h1" || k === "p5") return focus(k);
        box.classList.add("dim");
        Object.values(nodeEls).forEach((el) => el.classList.toggle("on", el.dataset.kind === k));
        edgeEls.forEach((e) => e.classList.remove("on"));
      } }, l)));
      container.append(seg);
    }
    container.append(box);
    if (opts.emphasize) setTimeout(() => focus(opts.emphasize), 50);
    return { focus };
  }

  /** horizontal mission-log timeline */
  function htimeline(container, events, opts = {}) {
    const list = opts.filter ? events.filter(opts.filter) : events;
    const wrap = h("div", { class: "htl", role: "region", "aria-label": "연구 타임라인 (가로 스크롤)", tabindex: "0" });
    const track = h("div", { class: "htl-track" });
    const detail = h("div", { class: "htl-detail panel tight", "aria-live": "polite" }, h("span", { class: "faint" }, "항목을 누르면 내용과 출처가 여기에 나타납니다."));
    list.forEach((e) => {
      const btn = h("button", { "aria-expanded": "false", "aria-controls": "htl-detail" }, e.title);
      const it = h("div", { class: "htl-item", dataset: { type: e.type } },
        h("div", { class: "d" }, date(e.date)), h("div", { class: "dot", "aria-hidden": "true" }), btn,
        h("div", { class: "typ" }, `${e.project === "h1" ? "H1" : "Paper 5"} · ${TYPE_KO[e.type] || e.type}`));
      btn.addEventListener("click", () => {
        track.querySelectorAll("button").forEach((b) => b.setAttribute("aria-expanded", b === btn));
        detail.innerHTML = `<div class="kicker ${e.type === "falsification" ? "v" : ""}">${esc(TYPE_KO[e.type] || e.type)} · ${esc(date(e.date))}</div>
          <h3 style="margin:6px 0">${esc(e.title)}</h3><p class="muted" style="margin:0 0 8px">${esc(e.detail)}</p>
          <div class="faint mono" style="font-size:11.5px">source: ${esc(e.src)}</div>
          <a class="link-arrow" style="margin-top:8px" href="${root}${e.link}">관련 내용 열기 →</a>`;
      });
      track.append(it);
    });
    detail.id = "htl-detail";
    wrap.append(track);
    container.append(wrap, detail);
    if (!reduced && opts.scrollEnd) requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
  }

  /** THE JOURNEY — horizontal milestone track with orb thumbnails, axis dates and status. */
  const ORB_OF = { question: "g", experiment: "b", analysis: "b", unexpected: "r", revision: "v", falsification: "r", next: "n" };
  function statusOf(e) {
    if (e.type === "next") return e.project === "paper5" ? ["실행 전", "pill"] : ["기록 없음", "muted"];
    if (e.type === "falsification") return ["반증", "fals"];
    if (e.type === "unexpected") return ["예상 밖 결과", "warn"];
    return ["완료", "done"];
  }
  function journey(container, events, opts = {}) {
    container.innerHTML = "";
    const list = opts.filter ? events.filter(opts.filter) : events;
    const wrap = h("div", { class: "jr", role: "region", "aria-label": "연구 여정 타임라인 (가로 스크롤)", tabindex: "0" });
    const track = h("ol", { class: "jr-track" });
    const detail = h("div", { class: "htl-detail panel tight", id: "jr-detail", "aria-live": "polite" }, h("span", { class: "faint" }, "항목을 누르면 내용과 출처가 여기에 나타납니다."));
    let lastMonth = "";
    list.forEach((e, i) => {
      const m = date(e.date).slice(0, 7);
      const [stTxt, stCls] = statusOf(e);
      const cv = h("canvas", { class: "jr-orb", "aria-hidden": "true" });
      const btn = h("button", { class: "jr-btn", type: "button", "aria-expanded": "false", "aria-controls": "jr-detail" },
        cv, h("span", { class: "jr-n mono" }, String(i + 1).padStart(2, "0")),
        h("span", { class: "jr-t" }, e.title),
        h("span", { class: "jr-s" }, `${e.project === "h1" ? "H1" : "Paper 5"} · ${TYPE_KO[e.type] || e.type} · ${date(e.date).slice(5)}`),
        h("span", { class: "jr-st " + stCls }, stTxt));
      const li = h("li", { class: "jr-item", dataset: { type: e.type } },
        h("div", { class: "jr-axis" }, m !== lastMonth ? h("span", { class: "jr-m mono" }, m.replace("-", ".")) : null, h("i", { class: "jr-dot" })), btn);
      lastMonth = m;
      btn.addEventListener("click", () => {
        track.querySelectorAll(".jr-btn").forEach((b) => b.setAttribute("aria-expanded", b === btn));
        detail.innerHTML = `<div class="kicker ${e.type === "falsification" ? "v" : ""}">${esc(TYPE_KO[e.type] || e.type)} · ${esc(date(e.date))}</div>
          <h3 style="margin:6px 0">${esc(e.title)}</h3><p class="muted" style="margin:0 0 8px">${esc(e.detail)}</p>
          <div class="faint mono" style="font-size:11.5px">source: ${esc(e.src)}</div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px"><a class="link-arrow" href="${root}${e.link}">관련 내용 열기 →</a><a class="link-arrow" href="${root}log/#${e.id}">일지에서 보기 →</a></div>`;
      });
      track.append(li);
      requestAnimationFrame(() => window.NXViz.orb(cv, { seed: 17 + i * 7, hue: ORB_OF[e.type] || "b", n: 260, arcs: 3 }));
    });
    wrap.append(track);
    container.append(wrap, detail);
    if (opts.scrollEnd && !reduced) requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
  }

  /** CONNECTED EXPLORATIONS — glowing research map (same graph.json, bloom styling, star canvas behind). */
  // organic layout for the tall research-map panel (viewBox 1000×900)
  const MAP_POS = {
    nexus: [470, 480], h1: [240, 350], p5: [690, 330],
    reasoning: [120, 200], majority: [120, 580], floor: [250, 760],
    monitoring: [540, 140], planning: [850, 190], learning: [900, 430],
    auroc: [610, 700], loop: [420, 820], confound: [700, 840], prereg: [470, 640], falsify: [830, 580], next: [940, 790],
  };
  function rmap(container, data, opts = {}) {
    container.innerHTML = "";
    const box = h("div", { class: "rmap" });
    const bg = h("canvas", { class: "rmap-bg", "aria-hidden": "true" });
    const info = h("div", { class: "rmap-info", "aria-live": "polite" }, h("span", { class: "faint" }, "노드에 마우스를 올리거나 Tab 으로 이동 · 클릭하면 연구로 이동"));
    const VB = opts.viewBox || [1000, 900];
    const svgEl = s("svg", { viewBox: `0 0 ${VB[0]} ${VB[1]}`, role: "img", "aria-label": "연구 지도: NEXUS 를 중심으로 H1, Paper 5, 개념과 방법이 이어진 네트워크" });
    const defs = s("defs");
    const flt = s("filter", { id: "rmglow", x: "-200%", y: "-200%", width: "500%", height: "500%" },
      s("feGaussianBlur", { stdDeviation: "7", result: "b" }), s("feMerge", {}, s("feMergeNode", { in: "b" }), s("feMergeNode", { in: "b" }), s("feMergeNode", { in: "SourceGraphic" })));
    defs.append(flt);
    svgEl.append(defs);
    const pos = opts.pos || MAP_POS;
    const adj = {};
    data.edges.forEach((e) => { (adj[e.source] = adj[e.source] || new Set()).add(e.target); (adj[e.target] = adj[e.target] || new Set()).add(e.source); });
    const edgeEls = data.edges.map((e) => {
      const a = pos[e.source], b = pos[e.target];
      if (!a || !b) return null;
      const dx = b[0] - a[0], dy = b[1] - a[1], mx = (a[0] + b[0]) / 2 - dy * 0.18, my = (a[1] + b[1]) / 2 + dx * 0.18;
      const p = s("path", { class: "rm-edge", d: `M${a[0]},${a[1]} Q${mx},${my} ${b[0]},${b[1]}`, "data-a": e.source, "data-b": e.target });
      svgEl.append(p);
      return p;
    }).filter(Boolean);
    const COL = (n) => n.kind === "core" ? css("--cyan") : n.kind === "project" ? (n.id === "h1" ? css("--rose") : css("--magenta")) : n.kind === "domain" ? css("--blue") : n.kind === "next" ? css("--text-3") : css("--violet");
    const RAD = { core: 15, project: 11, domain: 8, method: 6.5, next: 7 };
    const nodeEls = {};
    data.nodes.forEach((n, i) => {
      const p = pos[n.id] || [VB[0] / 2, VB[1] / 2];
      const r = RAD[n.kind] || 6, col = COL(n);
      const g = s("g", { class: "rm-node", tabindex: "0", role: "button", "aria-label": `${n.label}: ${n.desc}`, transform: `translate(${p[0]},${p[1]})`, "data-id": n.id, "data-kind": n.kind, style: `--d:${(i % 7) * 0.6}s` });
      g.append(s("circle", { class: "rm-halo", r: r * 3.2, fill: col, opacity: 0.16 }));
      g.append(s("circle", { class: "rm-glow", r: r * 1.15, fill: col, filter: "url(#rmglow)", opacity: n.kind === "next" ? 0.45 : 0.95 }));
      g.append(s("circle", { r: r * 0.55, fill: "#ffffff", opacity: n.kind === "next" ? 0.5 : 0.95 }));
      if (n.kind === "next") g.append(s("circle", { r: r * 2, fill: "none", stroke: col, "stroke-dasharray": "3 4", "stroke-width": 1.2 }));
      const right = p[0] > VB[0] * 0.78;
      g.append(s("text", { class: "rm-label" + (n.kind === "project" || n.kind === "core" ? " big" : ""), x: right ? -r * 2 - 6 : r * 2 + 6, y: 5, "text-anchor": right ? "end" : "start" }, n.kind === "core" ? "NEXUS" : n.label));
      if (n.status) g.append(s("text", { class: "rm-status", x: right ? -r * 2 - 6 : r * 2 + 6, y: 26, "text-anchor": right ? "end" : "start", style: `fill:${n.status === "반증됨" ? css("--rose") : n.status === "실행 전" ? css("--text-3") : css("--violet")}` }, n.status));
      const show = () => focus(n.id);
      g.addEventListener("mouseenter", show); g.addEventListener("focus", show);
      g.addEventListener("mouseleave", () => focus(null)); g.addEventListener("blur", () => focus(null));
      g.addEventListener("click", () => { if (n.link) location.href = root + n.link; else show(); });
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" && n.link) location.href = root + n.link; });
      nodeEls[n.id] = g;
      svgEl.append(g);
    });
    function focus(id) {
      box.classList.toggle("dim", !!id);
      Object.entries(nodeEls).forEach(([k, el]) => el.classList.toggle("on", !!id && (k === id || (adj[id] && adj[id].has(k)))));
      edgeEls.forEach((e) => e.classList.toggle("on", !!id && (e.dataset.a === id || e.dataset.b === id)));
      if (id) { const n = data.nodes.find((x) => x.id === id); info.innerHTML = `<b>${esc(n.label)}</b>${n.status ? ` · <span class="faint">${esc(n.status)}</span>` : ""} — <span class="muted">${esc(n.desc)}</span>${n.link ? ` <span class="link-arrow">열기 →</span>` : ""}`; }
    }
    box.append(bg, svgEl, info);
    container.append(box);
    // star web behind (decorative)
    const R = ((sd) => () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296))(99);
    const stars = Array.from({ length: 260 }, () => [R(), R(), R()]);
    function drawBg() {
      const ctx = bg.getContext("2d"), rc = bg.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      bg.width = rc.width * dpr; bg.height = rc.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const light = document.documentElement.dataset.theme === "light";
      ctx.clearRect(0, 0, rc.width, rc.height);
      const P = stars.map(([x, y, z]) => [x * rc.width, y * rc.height, z]);
      ctx.lineWidth = 0.5;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const d = Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]);
        if (d < 62) { ctx.strokeStyle = light ? `rgba(80,90,200,${(1 - d / 62) * 0.12})` : `rgba(140,120,255,${(1 - d / 62) * 0.16})`; ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); ctx.stroke(); }
      }
      P.forEach(([x, y, z]) => { ctx.fillStyle = light ? `rgba(60,70,180,${0.2 + z * 0.4})` : `rgba(${z > 0.7 ? "212,150,255" : "140,170,255"},${0.25 + z * 0.6})`; const sz = z > 0.93 ? 2.2 : 1.1; ctx.fillRect(x, y, sz, sz); });
    }
    new ResizeObserver(drawBg).observe(bg);
    document.addEventListener("nexus:theme", drawBg);
    return { focus };
  }

  window.NXC = { graph, htimeline, journey, rmap, TYPE_KO };
})();
