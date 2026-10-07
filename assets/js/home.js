/* NEXUS home page */
(function () {
  "use strict";
  const { $, h, esc, fmt, pct, date, load, badge, stat, I, root, toast } = window.NX;

  window.NXViz.sphere($("#hero-canvas"), window.innerWidth < 760 ? { cx: 0.64, cy: 0.56, scale: 0.4 } : {});
  $("#hero-evidence").addEventListener("click", () => document.getElementById("evidence-btn").click());

  Promise.all([load("research.json"), load("h1.json"), load("paper5.json"), load("timeline.json"), load("graph.json"), load("provenance.json"), load("statistics.json"), load("paper5_scan.json")])
    .then(([R, H1, P5, TL, G, PV, ST, SCAN]) => {
      const proj = Object.fromEntries(R.projects.map((p) => [p.id, p]));
      const HL = R.highlights || {};
      const conds = H1.status === "ok" ? H1.conditions : [];
      const bfs = conds.map((c) => c.backfire).filter(Boolean).sort((a, b) => a.v - b.v);
      const refuted = conds.filter((c) => c.verdict_en === "H1 REFUTED").length;

      // ---- hero cards
      const hc = $("#hero-cards");
      hc.append(
        h("div", { class: "hero-card" }, h("div", { class: "kk" }, "H1"), badge(proj.h1.status),
          h("h3", {}, "다수결 역효과(Backfire)", h("br"), h("span", { class: "muted", style: "font-size:13px" }, "LLM 수학 추론 · Self-consistency")),
          h("a", { class: "link-arrow", href: root + "h1/" }, "View →")),
        h("div", { class: "hero-card" }, h("div", { class: "kk" }, "Paper 5"), badge(proj.paper5.status),
          h("h3", {}, "내부 신호로 성공 예측하기", h("br"), h("span", { class: "muted", style: "font-size:13px" }, "RL 에이전트 · Self-falsification")),
          h("a", { class: "link-arrow", href: root + "paper5/" }, "View →")));
      const hs = $("#hero-stats");
      [[R.counts.projects, "Major Projects"], [R.counts.phases_with_data, "Analysis Phases"], [R.counts.stats, "Traced Statistics"]].forEach(([n, l]) =>
        hs.append(h("div", { class: "st" }, h("div", { class: "num" }, String(n)), h("div", { class: "lab" }, l))));

      // ---- featured cards
      const fc = $("#feat-cards");
      const card = (p, viz, kpis, extra) => {
        const cv = h("canvas", { "aria-hidden": "true" }), ov = h("canvas", { class: "rorb", "aria-hidden": "true" });
        const el = h("article", { class: "panel rcard reveal", dataset: { proj: p.id } },
          h("div", { class: "rviz" }, cv, ov),
          h("div", { class: "row" }, h("div", { class: "kicker" + (p.id === "paper5" ? " v" : "") }, p.id === "h1" ? "H1" : "Paper 5"), badge(p.status)),
          h("h3", { class: "h-card" }, p.title), h("p", { class: "q", style: "margin:0" }, p.question),
          h("div", { class: "tag-row" }, p.tags.map((t) => h("span", { class: "tag" }, "# " + t))),
          extra || null,
          h("div", { class: "kpis" }, kpis.map(([node, l]) => h("div", {}, h("div", { class: "v" }, node), h("div", { class: "l" }, l)))),
          h("a", { class: "link-arrow", href: root + p.link }, "연구 열기 →"));
        fc.append(el);
        window.NXViz.field(cv, { seed: p.id === "h1" ? 5 : 9, hue: p.id === "h1" ? "b" : "v" });
        window.NXViz.orb(ov, { seed: p.id === "h1" ? 41 : 77, hue: p.id === "h1" ? "b" : "v", n: 700, arcs: 6, ring: false, scale: 0.4 });
      };
      card(proj.h1, null, [
        [h("span", {}, String(refuted), h("span", { class: "faint" }, ` / ${conds.length}`)), "조건 반증 (판정 규칙)"],
        [bfs.length ? h("span", {}, stat(bfs[0], { d: 2 }), "–", stat(bfs[bfs.length - 1], { d: 2 })) : h("span", { class: "pending" }, "PENDING"), "Backfire 범위 (4조건)"],
        [stat(conds[0] && conds[0].stats.n_problems, { int: true }), "조건당 문제 수"],
      ], h("p", { class: "faint", style: "font-size:12.5px;margin:0" }, `판정 규칙: ${conds[0] ? conds[0].verdict_rule : "—"}`));
      card(proj.paper5, null, [
        [stat(HL.repro_1f_det, { d: 3 }), "1f 사전 고정 재현 AUROC"],
        [stat(HL.fals_1i_kscore, { d: 3 }), "1i: k 하나만으로"],
        [stat(HL.fals_1i_resk, { d: 3 }), "1i: k 를 뺀 잔여"],
      ], h("p", { class: "faint", style: "font-size:12.5px;margin:0" }, "0.5 = 우연 수준. 1f 에서 재현된 신호의 대부분이 1i 에서 학습 설정 k 로 설명됨 — 다음 단계 1j 는 사전 고정, 실행 전."));

      document.querySelectorAll("#feat-filter .chip").forEach((b) => b.addEventListener("click", () => {
        document.querySelectorAll("#feat-filter .chip").forEach((x) => x.setAttribute("aria-pressed", x === b));
        document.querySelectorAll("#feat-cards .rcard").forEach((c) => { c.hidden = b.dataset.f !== "all" && c.dataset.proj !== b.dataset.f; });
      }));

      // ---- interactive research visualization (1i lab + 3D evidence cloud)
      window.NXLab.mountPro({ ctrl: $("#lab-ctrl"), canvas: $("#lab-canvas"), out: $("#lab-out"), cap: $("#lab-cap"), key: $("#lab-stage-key") }, P5.phases["1i"], ST, SCAN);

      // ---- research map
      window.NXC.rmap($("#rmap"), G);

      // ---- interactive experiment (1c cube + tiles)
      experiment(SCAN["1c"]);

      // ---- stats summary
      const ph = Object.values(P5.phases);
      const tally = {};
      ph.forEach((p) => { tally[p.status.label] = (tally[p.status.label] || 0) + 1; });
      const ss = $("#stat-summary");
      const row = (l, v, sub) => h("div", { style: "display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13.5px" }, h("span", { class: "muted" }, l), h("span", { class: "num" }, v, sub ? h("span", { class: "faint", style: "font-size:11.5px;margin-left:6px" }, sub) : null));
      ss.append(
        row("추출된 수치", String(R.counts.stats), "statistics.json"),
        row("95% CI 가 있는 수치", String(R.counts.stats_with_ci)),
        row("원자료 파일", String(R.counts.source_files), "SHA-256 기록"),
        row("H1 조건 (반증)", `${refuted} / ${conds.length}`),
        row("Paper 5 단계", String(ph.length), Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" · ")),
      );
      ss.append(h("a", { class: "btn sm", style: "margin-top:14px", href: root + "data/statistics.json", download: "", html: I.download + "statistics.json" }));

      // ---- THE JOURNEY + filter
      const draw = (f) => window.NXC.journey($("#journey-track"), TL.events, { filter: f === "all" ? null : (e) => e.project === f });
      draw("all");
      document.querySelectorAll("#jr-filter .chip").forEach((b) => b.addEventListener("click", () => {
        document.querySelectorAll("#jr-filter .chip").forEach((x) => x.setAttribute("aria-pressed", x === b));
        draw(b.dataset.f);
      }));

      // ---- failure chain (Paper 5 actual path)
      const j = (P5.phases["1j"].data || {}).prereg || {};
      const steps = [
        ["EXPECTED", "", "1c–1e", h("p", {}, "처음 5걸음의 maxQ 가 높으면 성공한다. 확률 정책 depth0 고리통제 층화 AUROC ", stat(HL.expect_1e, { d: 3 }), " (1e).")],
        ["EXPERIMENT", "", "1f · 사전 고정", h("p", {}, "새 run 60개로 사전 고정 가설 H1 확인: 결정론 ", stat(HL.repro_1f_det, { d: 3 }), " · 확률 ", stat(HL.repro_1f_eps, { d: 3 }), " — 판정 '재현'.")],
        ["UNEXPECTED", "u", "1g · 진단", h("p", {}, "같은 k 끼리만 비교하면 신호가 사라짐: 전체 ", stat(HL.unexp_1g_lxd, { d: 3 }), " → 같은 k ", stat(HL.unexp_1g_kxd, { d: 3 }), " (multidepth_v2 depth0).")],
        ["REVISION", "r", "1h · 대조", h("p", {}, "1e 폴더에서 maxQ 를 k 성분과 나머지로 분해: k 하나만 쓴 점수 ", stat(HL.rev_1h_kscore, { d: 3 }), " ≥ maxQ ", stat(HL.rev_1h_total, { d: 3 }), " (multidepth_v2 depth0).")],
        ["SELF-FALSIFICATION", "f", "1i · 1f 분해", h("p", {}, "재현된 ", stat(HL.fals_1i_total, { d: 3 }), " 중 k 만으로 ", stat(HL.fals_1i_kscore, { d: 3 }), ", k 를 뺀 잔여 ", stat(HL.fals_1i_resk, { d: 3 }), " — '신호의 대부분이 k 로 설명됨'.")],
        ["NEXT QUESTION", "n", "1j · 실행 전", h("p", {}, "k=2(거의 미학습)를 빼고 k=8/32 만으로도 잔여 신호가 남는가? 판정 기준 사전 고정 — PREREG ", h("code", {}, j.sha12 || "—"), ".")],
      ];
      const ch = $("#chain-steps");
      steps.forEach(([st, cls, ph2, body]) => ch.append(h("div", {}, h("div", { class: "faint mono", style: "font-size:11px;margin-top:6px" }, ph2), h("div", { class: "st " + cls }, st), body)));

      // ---- verification list
      const v = $("#verify-list");
      const vi = PV.verify_1i || {};
      const item = (ok, title, detail) => h("div", { class: "feat", style: "padding:12px 0;border-top:1px solid var(--line)" },
        h("div", { class: "ic", style: ok === false ? "color:var(--rose)" : ok === null ? "color:var(--amber)" : "" , html: ok === false ? I.close : I.evidence }),
        h("div", {}, h("h4", {}, title), h("p", {}, detail)));
      v.append(
        item(true, `원자료 ${PV.sources.length}개 · SHA-256 기록`, "analysis_phase1c~1i.json, H1 문제별 집계와 원본 jsonl 4개의 해시가 provenance.json 에 있습니다."),
        item(vi.ok, `1i 코드 무결성 ${vi.ok ? "일치" : "불일치"}`, `1j 로더에 기록된 1i 원본 SHA ${String(vi.recorded_in_1j || "").slice(0, 12)}… 를 이 저장소의 code/${"Paper5_Phase1i_cell.py"} 로 다시 계산해 대조.`),
        item(true, "PREREG 해시", `1f: ${String((PV.prereg["1f"] || {}).sha256 || "—").slice(0, 12)}… (결과 파일 기록) · 1j: ${j.sha12 || "—"} (코드의 PREREG 문자열에서 계산)`),
        item(true, "H1 재계산 = 원본", "build_data.py 의 H1 계산은 H1_STEP4_cell.py 의 함수와 같은 결과를 냅니다 (tests/test_build.py 가 원본 함수로 대조)."),
      );

      // ---- log mini
      const lm = $("#log-mini");
      TL.events.slice(-4).reverse().forEach((e) => lm.append(h("div", { style: "display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;padding:8px 0;border-top:1px solid var(--line);font-size:13px" },
        h("span", { class: "faint mono", style: "font-size:11.5px" }, date(e.date)), h("a", { href: root + "log/#" + e.id }, e.title, h("span", { class: "faint", style: "display:block;font-size:12px" }, e.detail.slice(0, 80) + (e.detail.length > 80 ? "…" : ""))))));

      window.NX.reveal();
    })
    .catch((e) => {
      console.error(e);
      document.getElementById("feat-cards").innerHTML = `<div class="callout warn">데이터를 불러오지 못했습니다 (${esc(e.message)}). file:// 로 열었다면 <code>python3 -m http.server</code> 로 여세요.</div>`;
    });

  // ------------------------------------------------------------------ 1c interactive experiment
  const FAM = [["S1a_maxq", "maxQ"], ["S1b_qmargin", "Q 마진"], ["S2_prederr_lag1", "예측 오차"], ["S3_ensdisagree", "앙상블 불일치"], ["S4_latentrep", "잠재 반복"], ["S5_actcycle", "행동 순환"], ["S5b_cyclerun", "순환 길이"], ["S6_revisit", "재방문"]];
  const STAT = ["mean", "std", "last"];
  const FK = { run_cpu_progress_stall: "progress_stall", run_cpu_progress_stall_multidepth: "progress_stall · multidepth", run_multidepth_v2: "multidepth_v2", "run_stochastic_eps0.1": "확률 정책 ε=0.1" };
  function experiment(C) {
    const { $, h, fmt } = window.NX;
    if (!C) { $("#xp-tiles").append(h("p", { class: "pending" }, "DATA PENDING — paper5_scan.json 없음")); return; }
    const NS = C.N_prefix || [5, 10];
    const st = { n: 0, f: 0, d: null, mode: "std" };
    const fSel = $("#xp-folder");
    C.folders.forEach((f, i) => fSel.append(h("option", { value: i }, `${FK[f.folder] || f.folder} (run ${f.n_runs})`)));
    const depthsOf = (f) => [...new Set(f.groups.map((g) => (g.name.match(/depth(\d)/) || [])[1]).filter(Boolean))].sort();
    const grp = (f, mode, N, d) => f.groups.find((g) => g.name === `${mode}_N${N}_depth${d}_key`);
    const feat = (g, name) => g && (g.features.find((x) => x.name === name) || null);
    const cellsOf = (g, fname) => FAM.flatMap(([fk, fl]) => STAT.map((sx) => { const nm = `${fk}_${sx}`, x = feat(g, nm); return { ref: x ? x.stat : null, label: `${nm} · ${fl} (${sx})`, sub: g ? `${g.name} · 에피소드 ${g.n_ep} · 양성 ${g.n_pos}${fname ? " · " + fname : ""}` : "그룹 없음" }; }));
    // voxel cells: family (8) × stat (3) × folder (4) for the chosen mode / N / depth
    let cube = null;
    function cubeCells() {
      const out = [];
      C.folders.forEach((f, k) => { const g = grp(f, st.mode, NS[st.n], st.d); FAM.forEach(([fk, fl], i) => STAT.forEach((sx, j) => { const x = feat(g, `${fk}_${sx}`); if (x) out.push({ i, j, k, ref: x.stat, label: `${fk}_${sx} · ${FK[f.folder] || f.folder}`, sub: `${g.name} · 에피소드 ${g.n_ep} · 양성 ${g.n_pos}` }); })); });
      return out;
    }
    const axes = [[-1, -1.2, 1, "maxQ"], [0.55, -1.2, 1, "재방문"], [-1.15, -0.62, 1, "mean"], [-1.15, 0.62, 1, "last"], [1.06, -1, -0.75, "폴더 1"], [1.06, -1, 0.75, "폴더 4"]];
    function sync() {
      const f = C.folders[st.f];
      const ds = depthsOf(f);
      if (!ds.includes(st.d)) st.d = ds.includes("0") ? "0" : ds[0];
      const dseg = $("#xp-depth");
      dseg.innerHTML = "";
      ds.forEach((d) => dseg.append(h("button", { type: "button", role: "radio", "aria-pressed": d === st.d, "aria-checked": d === st.d, onclick: () => { st.d = d; sync(); } }, `depth ${d}`)));
      document.querySelectorAll("#xp-mode button").forEach((b) => { const on = b.dataset.v === st.mode; b.setAttribute("aria-pressed", on); b.setAttribute("aria-checked", on); });
      $("#xp-n").value = st.n; $("#xp-nval").textContent = `N = ${NS[st.n]}`;
      // tiles: N5, N10, diff
      const g5 = grp(f, st.mode, NS[0], st.d), g10 = grp(f, st.mode, NS[1], st.d);
      const c5 = cellsOf(g5), c10 = cellsOf(g10);
      const diff = c5.map((c, i) => ({ label: c.label.split(" · ")[0], d: c.ref && c10[i].ref ? c10[i].ref.v - c.ref.v : null, sub: `N=${NS[1]} − N=${NS[0]}` }));
      const box = $("#xp-tiles");
      box.innerHTML = "";
      const minPos = C.min_pos;
      [[`N = ${NS[0]}`, c5, g5, null, st.n === 0], [`N = ${NS[1]}`, c10, g10, null, st.n === 1], ["차이 (N10 − N5)", diff, null, "diff", false]].forEach(([title, cells, g, kind, on]) => {
        const t = h("div", { class: "xp-tile" + (on ? " on" : "") });
        const holder = h("div");
        t.append(h("div", { class: "xp-tt" }, title), holder,
          h("div", { class: "xp-tn faint" }, kind ? "파랑 = N10 에서 낮아짐 · 분홍 = 높아짐" : g ? `ep ${g.n_ep} · 양성 ${g.n_pos}${minPos && g.n_pos < minPos ? ` (min_pos ${minPos} 미만)` : ""}` : "그룹 없음"));
        box.append(t);
        window.NX3D.tile(holder, cells, { cols: 6, kind, span: 0.3, aria: `${title} 신호 타일 (행 = 신호 계열 쌍, 칸 = mean/std/last)` });
      });
      // cube
      const cells = cubeCells();
      const focus = (c) => c.k === st.f;
      if (!cube) cube = window.NX3D.voxels($("#xp-cube"), [FAM.length, STAT.length, C.folders.length], cells, { axes, focus, scale: 0.27, ry: -0.75, rx: 0.5 });
      else cube.setCells(cells, focus);
      $("#xp-cap").textContent = `복셀 ${cells.length}개 · ${st.mode} · N=${NS[st.n]} · depth ${st.d} · 진한 칸 = CI 가 0.5 를 벗어남 · 선택한 폴더만 선명하게`;
      // lines: rank plot N5 vs N10
      const ranked = c5.map((c, i) => [c, c10[i]]).filter(([a]) => a.ref).sort((a, b) => b[0].ref.v - a[0].ref.v);
      window.NX3D.lines($("#xp-lines"), [
        { label: `N = ${NS[0]}`, color: getComputedStyle(document.documentElement).getPropertyValue("--cyan").trim(), pts: ranked.map(([a], i) => [i + 1, a.ref.v, a.ref, a.label]) },
        { label: `N = ${NS[1]}`, color: getComputedStyle(document.documentElement).getPropertyValue("--magenta").trim(), pts: ranked.map(([, b], i) => [i + 1, b.ref ? b.ref.v : null, b.ref, b.label]) },
      ], { ymin: 0, ymax: 1, yticks: [0, 0.5, 1], ref: 0.5, xname: "순위", xlabel: `신호 순위 (N=${NS[0]} 기준)`, xfmt: (v) => (v === 1 || v % 5 === 0 ? String(v) : ""), width: 620, height: 150, aria: "신호 순위별 AUROC, N5 대 N10" });
    }
    $("#xp-cbar").append(window.NX3D.colorbar("auroc"));
    $("#xp-n").addEventListener("input", (e) => { st.n = +e.target.value; sync(); });
    fSel.addEventListener("change", () => { st.f = +fSel.value; sync(); });
    document.querySelectorAll("#xp-mode button").forEach((b) => b.addEventListener("click", () => { st.mode = b.dataset.v; sync(); }));
    sync();
  }

  // ---- tools
  const tools = [
    [I.search, "검색 & 명령 팔레트 (Ctrl + K)", "연구·개념·로그·통계 수치를 한 번에 찾습니다.", () => document.getElementById("search-btn").click()],
    [I.evidence, "Evidence Mode", "모든 수치에 출처 표시 — 누르면 원본 파일과 JSON 경로가 열립니다.", () => document.getElementById("evidence-btn").click()],
    [I.sun, "다크 / 라이트 모드", "취향과 환경에 맞게 테마를 바꿉니다.", () => document.getElementById("theme-btn").click()],
    [I.copy, "Compare Mode", "두 실험 조건을 나란히 비교합니다 (Statistics 페이지).", () => (location.href = root + "statistics/#compare")],
    [I.print, "인쇄 / PDF", "연구 페이지는 인쇄용 스타일이 있어 브라우저 인쇄로 PDF 를 만들 수 있습니다.", () => (location.href = root + "h1/#print")],
    [I.download, "JSON 내려받기", "사이트가 쓰는 데이터 파일을 그대로 받을 수 있습니다.", () => (location.href = root + "reproduce/#data")],
  ];
  const tg = document.getElementById("tools");
  tools.forEach(([ic, t, d, fn]) => tg.append(h("button", { class: "panel tight feat", style: "text-align:left;cursor:pointer;font:inherit;color:inherit;width:100%", onclick: fn },
    h("div", { class: "ic", html: ic }), h("div", {}, h("h4", {}, t), h("p", {}, d)))));
})();
