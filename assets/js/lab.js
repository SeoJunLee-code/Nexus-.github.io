/* NEXUS decomposition lab — interactive view of analysis_phase1i.json (Paper 5 · Phase 1i).
   Controls pick one condition key in phase.B; the stage plots per-k (mean maxQ, success rate, n_ep) exactly as stored;
   the panel shows the stratified-AUROC decomposition with 95% CIs. No simulated values. */
(function () {
  "use strict";
  const { h, esc, fmt, pct, forest, css, reduced, badge } = window.NX;

  const METRICS = [
    ["total", "total", "원래 신호: maxQ 그대로"],
    ["kscore", "kscore", "k(학습 설정) 하나만으로 예측"],
    ["kmean", "kmean", "각 k 의 평균 maxQ 만 쓴 점수"],
    ["resk", "resk", "maxQ − k 평균 (k 로 설명 안 되는 잔여)"],
    ["kxd", "kxd", "같은 k 끼리만 비교 (층 = k×거리)"],
    ["seed_in_k", "seed_in_k", "같은 k 안에서 run 평균 차이 (seed 간)"],
  ];
  const POLICY = { run_confirm_det: "결정론 정책", "run_confirm_stochastic_eps0.1": "확률 정책 ε=0.1" };

  function mount(els, phase, opts = {}) {
    const B = phase.data.B;
    const keys = B.map((b) => b.key);
    const parse = (k) => { const [f, d, c] = k.split("|"); return { f, d, c }; };
    const st = { f: "run_confirm_det", d: "d0", c: "lf" };
    if (opts.start) Object.assign(st, parse(opts.start));

    // ---------------- controls
    const ctrl = els.ctrl;
    ctrl.innerHTML = "";
    ctrl.append(h("div", {}, h("div", { class: "kicker" }, "Phase 1i"), h("h3", { style: "font-size:17px;margin:6px 0 4px" }, "maxQ 신호 분해"),
      h("p", { class: "faint", style: "font-size:12.5px;margin:0" }, "AI 가 처음 5걸음 동안 느낀 '자신감(maxQ)'이 그 뒤의 성공을 예측하는가? 예측한다면 그건 자신감인가, 학습 정도(k)인가?"),
      h("div", { style: "margin-top:10px" }, badge(phase.status))));
    const group = (label, name, options) => {
      const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": label });
      options.forEach(([v, l]) => seg.append(h("button", { role: "radio", "aria-pressed": st[name] === v, "aria-checked": st[name] === v, "data-v": v, onclick: () => { st[name] = v; if (name === "f" && v === "run_confirm_det") st.c = "lf"; sync(); } }, l)));
      const wrap = h("div", {}, h("span", { class: "lab-label" }, label), seg);
      wrap._seg = seg; wrap._name = name;
      return wrap;
    };
    const gF = group("정책 (1f 확인 실험 폴더)", "f", [["run_confirm_det", "결정론"], ["run_confirm_stochastic_eps0.1", "확률 ε=0.1"]]);
    const gD = group("계획 깊이", "d", [["d0", "d0 · 직접"], ["d2", "d2 · 플래너"]]);
    const gC = group("표본", "c", [["lf", "고리통제"], ["all", "전체"]]);
    ctrl.append(gF, gD, gC);
    const note = h("p", { class: "faint", style: "font-size:11.5px;margin:0" });
    ctrl.append(note);

    // ---------------- stage (canvas)
    const cv = els.canvas, ctx = cv.getContext("2d");
    let cur = null, target = null, anim = 0;
    function layout() {
      const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return [r.width, r.height];
    }
    const XMAX = 0.7;
    function draw(nodes, t) {
      const [w, hh] = layout();
      ctx.clearRect(0, 0, w, hh);
      const L = 46, R = 24, T = 40, Bm = 78;
      const X = (v) => L + (w - L - R) * (v / XMAX), Y = (v) => T + (hh - T - Bm) * (1 - v);
      // perspective-ish floor grid
      ctx.strokeStyle = css("--chart-grid"); ctx.lineWidth = 1;
      for (let i = 0; i <= 7; i++) { const x = X(i / 10); ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, hh - Bm); ctx.stroke(); }
      for (let i = 0; i <= 4; i++) { const y = Y(i / 4); ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); }
      ctx.fillStyle = css("--chart-axis"); ctx.font = "11px Inter, sans-serif";
      for (let i = 0; i <= 4; i++) ctx.fillText((i / 4).toFixed(2), 8, Y(i / 4) + 4);
      for (let i = 0; i <= 7; i++) ctx.fillText((i / 10).toFixed(1), X(i / 10) - 8, hh - Bm + 18);
      ctx.fillText("평균 maxQ (k 별) →", w - R - 112, hh - Bm - 8);
      // links k2→k8→k32
      const P = nodes.map((n) => [X(n.mq), Y(n.pr), n]);
      ctx.strokeStyle = css("--line-2"); ctx.setLineDash([4, 5]); ctx.beginPath();
      P.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
      const cols = [css("--text-3"), css("--blue"), css("--magenta")];
      P.forEach(([x, y, n], i) => {
        const r = 8 + Math.sqrt(n.ne) * 1.3;
        const col = cols[i] || css("--cyan");
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
        g.addColorStop(0, col + "cc"); g.addColorStop(0.35, col + "44"); g.addColorStop(1, col + "00");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
        const pulse = 0;
        ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, r + pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        // label placement: flip to the left near the right edge; stack when nodes are close
        const txt2 = `성공 ${pct(n.pr0, 0)} · maxQ ${n.mq0.toFixed(2)} · ep ${n.ne0}`;
        ctx.font = "11px Inter, sans-serif";
        const tw = Math.max(ctx.measureText(txt2).width, 40);
        const left = x + r + 8 + tw > w - 8;
        let ly = y - 4;
        for (let j = 0; j < i; j++) { const q = P[j]; if (Math.hypot(q[0] - x, q[1] - y) < 60) ly = q._ly + (q._ly <= y ? 34 : -34); }
        P[i]._ly = ly;
        const lx = left ? x - r - 8 - tw : x + r + 8;
        if (Math.abs(ly - (y - 4)) > 1) { ctx.strokeStyle = col; ctx.globalAlpha = .5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(left ? lx + tw : lx, ly); ctx.stroke(); ctx.globalAlpha = 1; }
        ctx.fillStyle = css("--text"); ctx.font = "600 12px Inter, sans-serif";
        ctx.fillText(`k=${n.k}`, lx, ly);
        ctx.fillStyle = css("--text-2"); ctx.font = "11px Inter, sans-serif";
        ctx.fillText(txt2, lx, ly + 15);
      });
    }
    function nodesOf(item) {
      return Object.entries(item.per_k || {}).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => ({ k, mq: v.mean_maxq, pr: v.pos_rate, ne: v.n_ep, mq0: v.mean_maxq, pr0: v.pos_rate, ne0: v.n_ep }));
    }
    function loop(now) {
      if (!target) return;
      if (!cur) cur = target.map((n) => ({ ...n }));
      let done = true;
      cur.forEach((n, i) => {
        const tg = target[i] || n;
        ["mq", "pr", "ne"].forEach((k) => { const d = tg[k] - n[k]; if (Math.abs(d) > 1e-4) { n[k] += d * 0.12; done = false; } else n[k] = tg[k]; });
        n.k = tg.k; n.mq0 = tg.mq0; n.pr0 = tg.pr0; n.ne0 = tg.ne0;
      });
      draw(cur, now);
      if (!done) { if (reduced) loop(now); else anim = requestAnimationFrame(loop); }
    }

    // ---------------- output
    function sync() {
      if (st.f === "run_confirm_det") st.c = "lf"; // 결정론 폴더에는 '전체' 분석이 없다 (1i 코드: all 은 ε 폴더만)
      [gF, gD, gC].forEach((g) => g._seg.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === st[g._name]; b.setAttribute("aria-pressed", on); b.setAttribute("aria-checked", on); }));
      const allBtn = gC._seg.querySelector('[data-v="all"]');
      allBtn.disabled = st.f === "run_confirm_det";
      allBtn.title = allBtn.disabled ? "1i 는 결정론 폴더에서 '전체' 표본을 분석하지 않음 (코드 규칙)" : "";
      note.textContent = st.f === "run_confirm_det" ? "결정론 폴더는 고리통제 표본만 분석됨 (1i 코드: cond='all' 은 ε 폴더만)." : "확률 정책은 재방문 후에도 열쇠에 도달할 수 있어 '전체' 표본도 분석됨.";
      const key = `${st.f}|${st.d}|${st.c}`;
      const item = B.find((b) => b.key === key);
      els.key && (els.key.textContent = key);
      const out = els.out;
      out.innerHTML = "";
      if (!item) { out.append(h("p", { class: "pending" }, "DATA PENDING — 이 조합은 1i 결과에 없음")); target = null; return; }
      const rows = METRICS.map(([k, l, sub], i) => ({ label: l, ref: item.stats[k], sub, color: k === "total" ? css("--cyan") : k === "kscore" || k === "kmean" ? css("--violet") : k === "resk" || k === "kxd" ? css("--magenta") : css("--blue") }));
      out.append(h("div", { class: "panel-title", style: "margin:0" }, h("div", {}, h("h3", {}, `${POLICY[st.f]} · ${st.d === "d0" ? "depth 0" : "depth 2"} · ${st.c === "lf" ? "고리통제" : "전체"}`),
        h("div", { class: "sub" }, `에피소드 ${item.n_ep} · 성공(양성) ${item.n_pos} · run ${item.n_run} · 층화 AUROC (0.5 = 우연)`))));
      const ch = h("div", { class: "chart" });
      out.append(ch);
      forest(ch, rows, { min: 0.2, max: 1, ref: 0.5, refLabel: "0.5 = 예측력 없음", ticks: [0.2, 0.4, 0.5, 0.6, 0.8, 1], labW: 92, width: 460, rowH: 28, aria: "1i 분해 AUROC 포레스트 플롯" });
      out.append(h("div", { class: "callout " + (/k\(학습 설정\)로 설명/.test(item.label || "") ? "fals" : "warn"), style: "font-size:13px" },
        h("span", { html: window.NX.I.info }), h("div", {}, h("div", { class: "faint", style: "font-size:11px;letter-spacing:.1em" }, "1i 자동 라벨 (원문, label_h 규칙)"), item.label || "—")));
      target = nodesOf(item);
      els.cap && (els.cap.textContent = "점 = 학습 설정 k (k=2 는 거의 미학습) · 원 크기 ∝ √에피소드 수 · 위치는 analysis_phase1i.json 의 per_k 값 그대로");
      cancelAnimationFrame(anim); anim = requestAnimationFrame(loop);
      if (opts.onChange) opts.onChange(key, item);
    }
    new ResizeObserver(() => cur && draw(cur, performance.now())).observe(cv);
    document.addEventListener("nexus:theme", () => cur && draw(cur, performance.now()));
    sync();
  }

  /* ---------------- Home lab (reference layout): controls · 3D evidence cube · tiles + curves */
  const PHASES = ["1c", "1d", "1e", "1f", "1g", "1h", "1i"];
  const FAM = ["S1a_maxq", "S1b_qmargin", "S2_prederr_lag1", "S3_ensdisagree", "S4_latentrep", "S5_actcycle", "S5b_cyclerun", "S6_revisit"];
  const STATS3 = ["mean", "std", "last"];
  const FSHORT = { run_cpu_progress_stall: "progress_stall", run_cpu_progress_stall_multidepth: "multidepth (cpu)", run_multidepth_v2: "multidepth_v2", "run_stochastic_eps0.1": "확률 ε=0.1" };
  const CONDS = [["run_confirm_det", "d0", "결정론 d0"], ["run_confirm_det", "d2", "결정론 d2"], ["run_confirm_stochastic_eps0.1", "d0", "ε d0"], ["run_confirm_stochastic_eps0.1", "d2", "ε d2"]];
  function mountPro(els, phase, stats, scan) {
    const B = phase.data.B;
    const st = { ci: 0, all: false, step: METRICS.length - 1, tab: "tiles" };
    const cur = () => { const [f, d] = CONDS[st.ci]; return { f, d, c: f === "run_confirm_det" || !st.all ? "lf" : "all" }; };
    const keyOf = () => { const c = cur(); return `${c.f}|${c.d}|${c.c}`; };

    // ---- left: controls
    const ctrl = els.ctrl;
    ctrl.innerHTML = "";
    ctrl.append(h("div", { class: "l2-head" }, h("h3", {}, "maxQ 신호 분해"), badge(phase.status)),
      h("p", { class: "l2-q" }, "AI 의 '자신감(maxQ)'은 학습 정도(k)를 넘어서는 정보를 담고 있을까?"));
    const range = h("input", { type: "range", min: 0, max: METRICS.length - 1, step: 1, value: st.step, class: "l2-range", "aria-label": "분해 단계" });
    const stepLab = h("span", { class: "l2-step mono" });
    const stepSub = h("div", { class: "faint", style: "font-size:11.5px;margin-top:2px" });
    range.addEventListener("input", () => { st.step = +range.value; stopPlay(); sync(); });
    const condGrid = h("div", { class: "l2-conds", role: "radiogroup", "aria-label": "조건 (1f 확인 실험 폴더 · 깊이)" });
    CONDS.forEach(([, , l], i) => condGrid.append(h("button", { type: "button", role: "radio", onclick: () => { st.ci = i; sync(); } }, l)));
    const allChk = h("input", { type: "checkbox", id: "l2-all" });
    allChk.addEventListener("change", () => { st.all = allChk.checked; sync(); });
    const play = h("button", { class: "btn l2-run", type: "button" }, "분해 재생");
    let timer = 0;
    function stopPlay() { clearInterval(timer); timer = 0; play.textContent = "분해 재생"; }
    play.addEventListener("click", () => {
      if (timer) return stopPlay();
      if (reduced) { st.step = METRICS.length - 1; return sync(); }
      st.step = 0; sync(); play.textContent = "■ 정지";
      timer = setInterval(() => { if (st.step >= METRICS.length - 1) return stopPlay(); st.step++; sync(); }, 1100);
    });
    ctrl.append(
      h("div", { class: "l2-field" }, h("div", { class: "l2-row" }, h("span", { class: "lab-label" }, "분해 단계"), stepLab), range, stepSub),
      h("div", { class: "l2-field" }, h("span", { class: "lab-label" }, "조건 (1f 확인 실험 · 깊이)"), condGrid,
        h("label", { class: "chk", style: "margin-top:8px", for: "l2-all" }, allChk, "확률 정책은 전체 표본으로")),
      play);

    // ---- centre: 3D evidence cube (every AUROC with a CI, phases 1c–1i)
    const items = stats.items.filter((x) => x.metric === "AUROC" && x.lo != null && PHASES.includes(x.phase));
    const vs = items.map((x) => x.v), ws = items.map((x) => x.hi - x.lo);
    const xmin = Math.floor(Math.min(...vs) * 10) / 10, xmax = Math.ceil(Math.max(...vs) * 10) / 10, wmax = Math.ceil(Math.max(...ws) * 10) / 10;
    const X = (v) => -1 + 2 * (v - xmin) / (xmax - xmin);
    const pts = items.map((x) => ({ x: X(x.v), y: 1 - 2 * ((x.hi - x.lo) / wmax), z: -1 + 2 * PHASES.indexOf(x.phase) / (PHASES.length - 1),
      v: x.v, ref: { id: x.id, v: x.v, lo: x.lo, hi: x.hi }, label: x.label, sub: `${x.src} · CI 폭 ${fmt(x.hi - x.lo)}`, strong: x.lo > 0.5 || x.hi < 0.5, short: x.id.split("/").pop() }));
    const axes = [[-1, -1.14, 1, String(xmin)], [0.92, -1.14, 1, String(xmax)], [X(0.5) - 0.05, -1.14, 1, "0.5"], [-0.3, -1.3, 1, "AUROC →"],
      [-1.12, 0.96, 1, "CI 좁음"], [-1.12, -0.96, 1, `CI ${wmax}`], [1.06, -1.06, -1, "1c"], [1.06, -1.06, 1, "1i"]];
    const cl = window.NX3D.cloud(els.canvas, pts, { axes, scale: 0.3, dy: 10, planeX: X(0.5), rx: 0.38, ry: -0.72 });
    els.cap.textContent = `점 ${pts.length}개 = 통계표의 AUROC 전부(1c–1i, CI 있는 것) · 가로 AUROC · 세로 CI 폭 · 깊이 단계 · 점선 면 = 0.5(우연) · 밝을수록 CI 가 0.5 를 벗어남`;

    // ---- right: tabs (tiles + curves / decomposition)
    const out = els.out;
    out.innerHTML = "";
    const tabs = h("div", { class: "l2-tabs", role: "tablist" });
    const panel = h("div", { class: "l2-panel", role: "tabpanel" });
    [["tiles", "신호 타일 (1c)"], ["dec", "분해 (1i)"]].forEach(([k, l]) => tabs.append(h("button", { type: "button", role: "tab", "data-t": k, onclick: () => { st.tab = k; sync(); } }, l)));
    out.append(tabs, panel);
    const C1 = scan && scan["1c"];
    const tileCells = (g) => FAM.flatMap((fk) => STATS3.map((sx) => { const x = g && g.features.find((y) => y.name === `${fk}_${sx}`); return { ref: x ? x.stat : null, label: `${fk}_${sx}`, sub: g ? `${g.name} · 에피소드 ${g.n_ep} · 양성 ${g.n_pos}` : "" }; }));

    function sync() {
      const c = cur();
      condGrid.querySelectorAll("button").forEach((b, i) => { b.setAttribute("aria-pressed", i === st.ci); b.setAttribute("aria-checked", i === st.ci); });
      allChk.disabled = c.f === "run_confirm_det";
      range.value = st.step;
      const [mk, ml, msub] = METRICS[st.step];
      stepLab.textContent = `${ml} · ${st.step + 1}/${METRICS.length}`;
      stepSub.textContent = msub;
      tabs.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", b.dataset.t === st.tab));
      const key = keyOf(), item = B.find((b) => b.key === key);
      els.key && (els.key.textContent = key);
      cl.highlight(item ? METRICS.slice(0, st.step + 1).map(([m]) => item.stats[m] && item.stats[m].id).filter(Boolean) : [], item && item.stats[mk] ? item.stats[mk].id : null);
      panel.innerHTML = "";
      if (st.tab === "tiles") {
        if (!C1) { panel.append(h("p", { class: "pending" }, "DATA PENDING — paper5_scan.json 없음")); return; }
        const depth = c.d.replace("d", "");
        [["std", "전체 표본"], ["loopfree", "고리통제"]].forEach(([mode, ml2]) => {
          panel.append(h("div", { class: "l2-rowlab" }, `${ml2} · N=5 · depth ${depth}`));
          const row = h("div", { class: "l2-tiles" });
          C1.folders.forEach((f) => {
            const g = f.groups.find((x) => x.name === `${mode}_N5_depth${depth}_key`);
            const holder = h("div");
            row.append(h("figure", { class: "l2-tile" }, holder, h("figcaption", {}, FSHORT[f.folder] || f.folder)));
            if (g) window.NX3D.tile(holder, tileCells(g), { cols: 5, aria: `${f.folder} ${g.name} 신호 24개 AUROC` });
            else holder.append(h("div", { class: "htile none", title: `depth ${depth} 그룹 없음` }, h("span", {}, "없음")));
          });
          panel.append(row);
        });
        panel.append(window.NX3D.colorbar("auroc"));
        const ch = h("div", { class: "chart", style: "margin-top:12px" });
        panel.append(h("div", { class: "l2-rowlab" }, "학습 설정 k 별 성공률 (1i · 고리통제)"), ch);
        const cols = [css("--cyan"), css("--blue"), css("--magenta"), css("--violet")];
        const ser = CONDS.map(([f, d, l], i) => { const it = B.find((b) => b.key === `${f}|${d}|lf`); return { label: l, color: cols[i], pts: it ? Object.entries(it.per_k || {}).filter(([, v]) => v).map(([k, v]) => [+k, v.pos_rate, null, `에피소드 ${v.n_ep} · run ${v.n_run}`]) : [] }; });
        window.NX3D.lines(ch, ser, { log2: true, xname: "k", xlabel: "k (log)", width: 440, height: 150, aria: "1i 조건별 k 에 따른 성공률" });
        panel.append(h("p", { class: "faint", style: "font-size:11px;margin:4px 0 0" }, "타일 한 칸 = 1c 신호 하나의 AUROC (24칸). 빗금 = 값 없음. 곡선 = analysis_phase1i.json per_k."));
      } else {
        if (!item) { panel.append(h("p", { class: "pending" }, "DATA PENDING — 이 조합은 1i 결과에 없음")); return; }
        panel.append(h("div", { class: "sub faint", style: "font-size:12px;margin-bottom:6px" }, `${POLICY[c.f]} · ${c.d === "d0" ? "depth 0" : "depth 2"} · ${c.c === "lf" ? "고리통제" : "전체"} — 에피소드 ${item.n_ep} · 양성 ${item.n_pos} · run ${item.n_run}`));
        const ch = h("div", { class: "chart" });
        panel.append(ch);
        forest(ch, METRICS.map(([k, l, sub], i) => ({ label: l, ref: i <= st.step ? item.stats[k] : null, sub, dim: i > st.step, color: i === st.step ? css("--cyan") : k === "total" ? css("--blue") : css("--violet") })),
          { min: 0.2, max: 1, ref: 0.5, refLabel: "0.5 = 예측력 없음", ticks: [0.2, 0.4, 0.5, 0.6, 0.8, 1], labW: 84, width: 440, rowH: 27, aria: "1i 분해 AUROC" });
        ch.querySelectorAll("text").forEach((t) => { if (t.textContent === "DATA PENDING") t.textContent = "재생 / 슬라이더로 공개"; });
        panel.append(h("div", { class: "callout " + (/k\(학습 설정\)로 설명/.test(item.label || "") ? "fals" : "warn"), style: "font-size:12.5px" },
          h("span", { html: window.NX.I.info }), h("div", {}, h("div", { class: "faint", style: "font-size:11px;letter-spacing:.1em" }, "1i 자동 라벨 (원문)"), item.label || "—")));
      }
    }
    sync();
  }

  window.NXLab = { mount, mountPro, METRICS };
})();
