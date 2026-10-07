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

  window.NXC = { graph, htimeline, TYPE_KO };
})();
