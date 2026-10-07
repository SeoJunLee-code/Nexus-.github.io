/* NEXUS home page */
(function () {
  "use strict";
  const { $, h, esc, fmt, pct, date, load, badge, stat, I, root, toast } = window.NX;

  window.NXViz.sphere($("#hero-canvas"), {});
  $("#hero-evidence").addEventListener("click", () => document.getElementById("evidence-btn").click());

  Promise.all([load("research.json"), load("h1.json"), load("paper5.json"), load("timeline.json"), load("graph.json"), load("provenance.json")])
    .then(([R, H1, P5, TL, G, PV]) => {
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
        const cv = h("canvas", { "aria-hidden": "true" });
        const el = h("article", { class: "panel rcard reveal" },
          h("div", { class: "rviz" }, cv),
          h("div", { class: "row" }, h("div", { class: "kicker" + (p.id === "paper5" ? " v" : "") }, p.id === "h1" ? "H1" : "Paper 5"), badge(p.status)),
          h("h3", { class: "h-card" }, p.title), h("p", { class: "q", style: "margin:0" }, p.question),
          h("div", { class: "tag-row" }, p.tags.map((t) => h("span", { class: "tag" }, "# " + t))),
          extra || null,
          h("div", { class: "kpis" }, kpis.map(([node, l]) => h("div", {}, h("div", { class: "v" }, node), h("div", { class: "l" }, l)))),
          h("a", { class: "link-arrow", href: root + p.link }, "연구 열기 →"));
        fc.append(el);
        window.NXViz.field(cv, { seed: p.id === "h1" ? 5 : 9, hue: p.id === "h1" ? "b" : "v" });
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

      // ---- lab
      window.NXLab.mount({ ctrl: $("#lab-ctrl"), canvas: $("#lab-canvas"), out: $("#lab-out"), cap: $("#lab-cap"), key: $("#lab-stage-key") }, P5.phases["1i"]);

      // ---- graph
      window.NXC.graph($("#graph"), G, { filters: true });

      // ---- mini timeline (latest 6)
      const tm = $("#tl-mini");
      TL.events.slice(-6).reverse().forEach((e) => {
        const li = h("li", { dataset: { type: e.type } }, h("div", { class: "d" }, date(e.date), h("span", { class: "typ" }, window.NXC.TYPE_KO[e.type] || e.type)),
          h("a", { class: "t", href: root + e.link }, e.title));
        tm.append(li);
      });

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

      // ---- horizontal timeline + filter
      const draw = (f) => { $("#htl").innerHTML = ""; window.NXC.htimeline($("#htl"), TL.events, { filter: f === "all" ? null : (e) => e.project === f }); };
      draw("all");
      document.querySelectorAll("#tl-filter button").forEach((b) => b.addEventListener("click", () => {
        document.querySelectorAll("#tl-filter button").forEach((x) => x.setAttribute("aria-pressed", x === b));
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
