/* NEXUS · H1 page — every number from data/h1.json (built from h1v2_*.jsonl by build_data.py). */
(function () {
  "use strict";
  const { $, $$, h, esc, fmt, pct, date, load, badge, stat, forest, bars, provPanel, copy, css, root } = window.NX;
  window.NXViz.cluster($("#bg-viz"), { seed: 21, cx: 0.55, scale: 0.34 });

  const TYPE_KO = { question: "질문", experiment: "실험", analysis: "분석", unexpected: "예상 밖 결과", revision: "수정", falsification: "반증", next: "다음 질문" };
  const name = (c) => `${c.dataset === "math500" ? "MATH-500 L3–4" : "GSM8K"} · ${c.model}`;

  Promise.all([load("h1.json"), load("timeline.json"), load("provenance.json"), load("research.json")]).then(([H, TL, PV, R]) => {
    if (H.status !== "ok") {
      $("#h1-badge").append(badge(null));
      $("#results").prepend(h("div", { class: "callout warn" }, "DATA PENDING — ", H.reason || "H1 원자료 없음"));
      return;
    }
    const C = H.conditions;
    const main = C.find((c) => c.dataset === "math500") || C[0]; // 원본 코드의 그림 기준 조건 (첫 math500)
    $("#h1-badge").append(badge(H.project_status));

    // ---- meta row
    const codeSha = (PV.code.find((f) => f.file.endsWith("H1_STEP4_cell.py")) || {}).sha256 || "—";
    const meta = $("#h1-meta");
    const cell = (lab, node, mono) => h("div", {}, h("div", { class: "lab" }, lab), h("div", { class: "val" + (mono ? " mono" : "") }, node));
    meta.append(
      cell(`Backfire · ${name(main)}`, stat(main.backfire, { d: 3, ci: true })),
      cell("판정", h("span", {}, `${C.filter((c) => c.verdict_en === "H1 REFUTED").length} / ${C.length} 조건 반증`)),
      cell("문제 수 (조건별)", stat(main.stats.n_problems, { int: true })),
      cell("Code SHA-256", h("span", { title: codeSha }, codeSha.slice(0, 16) + "…"), true),
      cell("PREREG", h("span", { class: "faint" }, "기록 없음 — 판정 규칙만 코드에 있음")),
    );

    // ---- layer 1 plain summary
    const bfs = C.map((c) => c.backfire).sort((a, b) => a.v - b.v);
    const plain = $("#h1-plain");
    plain.append("4가지 조건(모델 2개 × 문제집 2개) 모두에서 다수결이 틀린 비율은 ", stat(bfs[0], { pct: true, pctd: 0 }), "–", stat(bfs[bfs.length - 1], { pct: true, pctd: 0 }),
      " 였고, 95% 신뢰구간이 모두 50% 아래였습니다. 그래서 원래 정한 규칙대로 ", h("strong", {}, "H1 은 반증"), "되었습니다. 다수결은 대부분의 문제에서 정답을 지켰고, 역효과는 정확도가 낮은 문제에 몰려 있었습니다.");

    // ---- vote demo (real counts)
    const sel = $("#demo-cond");
    C.forEach((c, i) => sel.append(h("option", { value: i, selected: c === main }, name(c))));
    let kind = "backfire", idx = 0;
    function demo() {
      const c = C[+sel.value];
      const list = ((c.examples || {})[kind] || []).slice().sort((x, y) => kind === "backfire" ? (y.tw - y.c) - (x.tw - x.c) : (y.c - y.tw) - (x.c - x.tw));
      const box = $("#demo-dots");
      box.innerHTML = "";
      if (!list.length) { $("#demo-text").textContent = "해당 예시 없음"; return; }
      const e = list[idx % list.length];
      const other = e.nw - e.tw;
      const none = e.n - e.c - e.nw;
      const dots = [...Array(e.c).fill("c"), ...Array(e.tw).fill("t"), ...Array(Math.max(0, other)).fill("o"), ...Array(Math.max(0, none)).fill("n")];
      dots.forEach((d, i) => {
        const st = d === "c" ? "background:var(--green);box-shadow:0 0 10px var(--green)" : d === "t" ? "background:var(--rose);box-shadow:0 0 10px var(--rose)" : d === "o" ? "background:var(--text-3)" : "border:1px dashed var(--text-3)";
        box.append(h("span", { style: `width:26px;height:26px;border-radius:50%;display:block;${st};opacity:0;transition:opacity .3s ${i * 25}ms`, "aria-hidden": "true" }));
      });
      requestAnimationFrame(() => box.querySelectorAll("span").forEach((s) => (s.style.opacity = 1)));
      $("#demo-text").innerHTML = `<b>${esc(e.id)}</b> (${esc(name(c))}) — 정답 ${e.c}표, 가장 많은 오답 ${e.tw}표, 다른 오답 ${Math.max(0, other)}표(${e.mw}종류 중 나머지), 무효 ${Math.max(0, none)}표 → 다수결 <b style="color:${e.maj ? "var(--green)" : "var(--rose)"}">${e.maj ? "정답" : "오답"}</b>${!e.maj && e.forced ? " · 표 분포상 피할 수 없던 경우(산술 하한에 포함)" : ""}${e.tw === e.c ? " · 정답과 최다 오답이 동점 — 원본 majority_vote 의 Counter 순서로 결정됨" : ""}. <span class="faint">(${(idx % list.length) + 1} / ${list.length})</span>`;
    }
    sel.addEventListener("change", () => { idx = 0; demo(); });
    $$("#vote-demo .seg button").forEach((b) => b.addEventListener("click", () => { $$("#vote-demo .seg button").forEach((x) => x.setAttribute("aria-pressed", x === b)); kind = b.dataset.k; idx = 0; demo(); }));
    $("#demo-next").addEventListener("click", () => { idx++; demo(); });
    demo();

    // ---- config
    const cfg = H.config;
    const ct = $("#cfg-table");
    ct.innerHTML = "<thead><tr><th>항목</th><th>값</th></tr></thead>";
    const tb = h("tbody");
    [["모델", [...new Set(Object.values(cfg.PLAN).map((p) => p.model))].join(", ")], ["데이터", "HuggingFaceH4/MATH-500 (Level 3, 4) · openai/gsm8k main test"],
      ["문제당 샘플", cfg.N_SAMPLES], ["최대 문제 수", cfg.MAX_PROBLEMS], ["최대 생성 토큰", cfg.MAX_NEW_TOKENS], ["temperature / top_p", `${cfg.TEMPERATURE} / ${cfg.TOP_P}`], ["seed", cfg.SEED],
      ["실행 단계", Object.entries(cfg.PLAN).map(([k, p]) => `STEP ${k}: ${p.dataset} · ${p.model.split("/")[1]}`).join(" | ")]]
      .forEach(([k, v]) => tb.append(h("tr", {}, h("td", {}, k), h("td", { class: "wrap-cell" }, String(v)))));
    ct.append(tb);
    $("#rule-text").textContent = main.verdict_rule;

    // ---- results table
    const rt = $("#res-table");
    rt.innerHTML = `<thead><tr><th>조건</th><th>모델 ID</th><th class="num">문제</th><th class="num">단일 정확도</th><th class="num">다수결 정확도</th><th class="num">이득</th><th class="num">비축퇴</th><th class="num">Backfire [95% CI]</th><th class="num">산술 하한</th><th class="num">하한 초과분 [CI]</th><th>판정</th></tr></thead>`;
    const body = h("tbody");
    C.forEach((c) => body.append(h("tr", { class: c === main ? "hl" : "" },
      h("td", {}, name(c)), h("td", { class: "faint" }, c.model_id || "—"),
      h("td", { class: "num" }, stat(c.stats.n_problems, { int: true })), h("td", { class: "num" }, stat(c.stats.single_acc)), h("td", { class: "num" }, stat(c.stats.maj_acc)),
      h("td", { class: "num" }, stat(c.stats.maj_gain)), h("td", { class: "num" }, stat(c.stats.n_nondeg, { int: true })),
      h("td", { class: "num" }, stat(c.backfire, { ci: true })), h("td", { class: "num" }, stat(c.floor)), h("td", { class: "num" }, stat(c.gap, { ci: true })),
      h("td", {}, h("span", { class: "badge " + (c.verdict_en === "H1 REFUTED" ? "falsified" : "exploratory") }, c.verdict_ko)))));
    rt.append(body);

    forest($("#bf-forest"), C.map((c) => ({ label: name(c), ref: c.backfire, color: css("--magenta"), sub: c.verdict_ko })), { min: 0, max: 0.6, ref: 0.5, refLabel: "판정선 0.50", ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], labW: 150, aria: "조건별 backfire 95% CI" });
    const accData = [];
    C.forEach((c) => { accData.push({ label: name(c).replace(" · ", "\n") + "\n단일", ref: c.stats.single_acc, color: css("--text-3") }); accData.push({ label: "\n\n다수결", ref: c.stats.maj_acc, color: css("--blue") }); });
    bars($("#acc-bars"), accData, { height: 270, aria: "단일 샘플 대비 다수결 정확도" });
    const allUp = C.every((c) => c.stats.maj_gain.v > 0);
    $("#acc-sub").textContent = allUp ? `${C.length}개 조건 모두 다수결 정확도 > 단일 정확도 (이득 = 다수결 − 단일)` : "조건마다 다름";

    // ---- floor chart (grouped)
    const fData = [];
    C.forEach((c) => { fData.push({ label: name(c).replace(" · ", "\n"), ref: c.backfire, color: css("--magenta") }); fData.push({ label: "\n하한", ref: c.floor, color: css("--violet") }); });
    bars($("#floor-chart"), fData, { max: 0.6, height: 280, lines: [{ v: 0.5, label: "판정선 0.50", color: css("--rose") }], aria: "관측 backfire 와 산술 하한" });
    forest($("#gap-forest"), C.map((c) => ({ label: name(c), ref: c.gap, color: css("--violet") })), { min: -0.05, max: 0.2, ref: 0, refLabel: "0 = 하한과 같음", ticks: [-0.05, 0, 0.05, 0.1, 0.15, 0.2], labW: 130, width: 440 });

    // ---- interval
    const ic = $("#int-cond");
    C.forEach((c, i) => ic.append(h("option", { value: i, selected: c === main }, name(c))));
    function intervals() {
      const c = C[+ic.value];
      bars($("#int-chart"), c.bins.map((b) => ({ label: `p ${b.lo.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}–${b.hi === 1 ? "1" : b.hi}\n(n=${b.n})`, ref: b.stat, color: css("--magenta") })),
        { height: 280, lines: [{ v: c.backfire.v, label: `관측 ${fmt(c.backfire.v)}`, color: css("--text-2") }, { v: c.floor.v, label: `하한 ${fmt(c.floor.v)}`, color: css("--violet"), dash: "2 4" }, { v: 0.5, label: "판정선 0.50", color: css("--rose") }],
          aria: "정확도 구간별 backfire" });
      const n = $("#int-notes");
      n.innerHTML = "";
      n.append(h("h3", { style: "margin-top:0" }, name(c)),
        h("p", {}, "구간 = 문제별 단일 정확도 p. 비축퇴 문제만 포함."),
        h("ul", {},
          h("li", {}, "backfire 가 나온 문제 중 가장 높은 p: ", h("strong", {}, c.max_p_backfire === null ? "—" : fmt(c.max_p_backfire, 4))),
          h("li", {}, `p > 0.5 인 문제 ${c.high_p}개 중 backfire `, h("strong", {}, String(c.high_p_backfire)), "개"),
          h("li", {}, `다수결 오답 ${c.backfires}개 중 표 분포상 피할 수 없던(강제) 경우 `, h("strong", {}, String(c.forced_backfires)), "개"),
          h("li", {}, "비축퇴 문제의 오답 종류 수 중앙값: ", h("strong", {}, String(c.median_wrong_kinds)))),
        h("p", { class: "faint", style: "font-size:12.5px" }, "이 목록의 값은 h1.json 의 조건 항목(build_data.py 계산)입니다."));
    }
    ic.addEventListener("change", intervals);
    intervals();

    // ---- pairs
    const pt = $("#pair-table");
    pt.innerHTML = `<thead><tr><th>HARD</th><th>EASY</th><th class="num">차이 [95% CI]</th><th>판정 (원본 규칙)</th></tr></thead>`;
    const pb = h("tbody");
    H.pairs.forEach((p) => { const a = C.find((c) => c.key === p.hard), b = C.find((c) => c.key === p.easy); pb.append(h("tr", {}, h("td", {}, name(a)), h("td", {}, name(b)), h("td", { class: "num" }, stat(p.stat, { ci: true })), h("td", { class: "wrap-cell" }, p.verdict))); });
    pt.append(pb);
    const qt = $("#qc-table");
    qt.innerHTML = `<thead><tr><th>조건</th><th class="num">\\boxed</th><th class="num">폴백(무효)</th><th class="num">토큰 상한</th><th class="num">r(p, 상한)</th><th class="num">유효표 &lt;12</th></tr></thead>`;
    const qb = h("tbody");
    C.forEach((c) => qb.append(h("tr", {}, h("td", {}, name(c)), h("td", { class: "num" }, stat(c.stats.boxed_share, { pct: true })), h("td", { class: "num" }, stat(c.stats.fallback_share, { pct: true })),
      h("td", { class: "num" }, stat(c.stats.cap_share, { pct: true })), h("td", { class: "num" }, c.corr_p_cap === null ? "—" : fmt(c.corr_p_cap)), h("td", { class: "num" }, `${c.valid_lt12} / ${c.stats.n_problems.v}`))));
    qt.append(qb);

    // ---- compare mode
    const A = $("#cmp-a"), B = $("#cmp-b");
    C.forEach((c, i) => { A.append(h("option", { value: i, selected: i === 0 }, name(c))); B.append(h("option", { value: i, selected: i === 2 }, name(c))); });
    function compare() {
      const out = $("#cmp-out");
      out.innerHTML = "";
      const a = C[+A.value], b = C[+B.value];
      const rows = [["단일 정확도", (c) => c.stats.single_acc, 1], ["다수결 정확도", (c) => c.stats.maj_acc, 1], ["Backfire", (c) => c.backfire, -1], ["산술 하한", (c) => c.floor, 0], ["하한 초과분", (c) => c.gap, -1], ["비축퇴 문제", (c) => c.stats.n_nondeg, 0]];
      [a, b].forEach((c, k) => {
        const other = k ? a : b;
        const dl = h("dl");
        rows.forEach(([l, f, dir]) => {
          const v = f(c), w = f(other);
          const better = dir && v && w && (dir > 0 ? v.v > w.v : v.v < w.v);
          dl.append(h("dt", {}, l), h("dd", {}, h("span", { class: better ? "better" : "" }, stat(v, { int: l === "비축퇴 문제", ci: l !== "비축퇴 문제" }))));
        });
        dl.append(h("dt", {}, "판정"), h("dd", {}, c.verdict_ko));
        out.append(h("div", { class: "col" }, h("div", { class: "kicker" + (k ? " v" : "") }, k ? "Condition B" : "Condition A"), h("h3", { style: "margin-top:4px" }, name(c)), dl));
      });
    }
    A.addEventListener("change", compare); B.addEventListener("change", compare);
    compare();

    // ---- history
    const hist = $("#h1-history");
    TL.events.filter((e) => e.project === "h1").forEach((e) => hist.append(h("li", { dataset: { type: e.type }, id: e.id },
      h("div", { class: "d" }, date(e.date), h("span", { class: "typ" }, TYPE_KO[e.type] || e.type)), h("div", { class: "t" }, e.title), h("div", { class: "faint", style: "font-size:12.5px" }, e.detail, " · ", h("span", { class: "mono" }, e.src)))));

    // ---- limitations (facts from data / code)
    const caps = C.map((c) => c.stats.cap_share);
    $("#limits-list").append(h("ul", {},
      h("li", {}, h("span", { class: "limit" }, "한계"), "조건당 문제 수가 ", stat(main.stats.n_problems, { int: true }), "개, 비축퇴 문제는 그보다 적어(", C.map((c, i) => [i ? ", " : "", stat(c.stats.n_nondeg, { int: true })]), ") CI 폭이 넓습니다."),
      h("li", {}, h("span", { class: "limit" }, "한계"), "모델은 Qwen2.5-Instruct 1.5B·3B 두 개, temperature 0.7 한 가지 설정, 문제당 16표만 봤습니다."),
      h("li", {}, h("span", { class: "limit" }, "한계"), "MATH-500 은 Level 3–4 만 사용. 최대 1024 토큰이라 일부 풀이가 잘렸습니다 (토큰 상한 도달 비율 ", caps.map((c, i) => [i ? " · " : "", stat(c, { pct: true })]), ")."),
      h("li", {}, h("span", { class: "limit" }, "한계"), "가설 문장은 코드의 판정 규칙에서 읽은 것이며 사전 고정(PREREG) 문서는 확인되지 않았습니다. 그래서 상태 배지는 결과 규칙에 따른 '반증됨'이지만 '사전 고정'으로 표시하지 않습니다."),
      h("li", {}, h("span", { class: "limit" }, "한계"), `HARD vs EASY 차이는 ${H.pairs.length}쌍 중 CI 가 0 을 벗어난 쌍이 ${H.pairs.filter((p) => p.stat.lo > 0 || p.stat.hi < 0).length}개 — 원본 규칙 판정은 모두 '${[...new Set(H.pairs.map((p) => p.verdict))].join("', '")}'. 문제 난이도 효과는 결론 내리지 못했습니다.`),
      h("li", {}, h("span", { class: "limit" }, "한계"), "v1(Level 5) 실행 파일은 이 저장소에 없어 v1 결과는 표시하지 않습니다.")));

    // ---- provenance
    const srcs = PV.sources.filter((s) => s.project === "h1");
    $("#prov-box").append(provPanel([
      ["Source (집계)", "data_raw/h1_problem_rows.json", true],
      ["Source (원자료)", h("span", {}, srcs.filter((s) => !s.committed).map((s) => h("div", { class: "mono" }, `${s.file.replace("data_raw/", "")} · sha256 ${s.sha256.slice(0, 16)}… · ${s.bytes} B · 로컬 전용`))), false],
      ["Code", "code/H1_STEP4_cell.py", true],
      ["Code SHA-256", codeSha, true],
      ["PREREG", "없음 (확인된 사전 고정 문서 없음)"],
      ["Status", `${H.project_status.label} — ${H.project_status.why}`],
      ["재계산 확인", "build_data.py 의 H1 계산 = 원본 함수(_enrich/_bf/_lb/_boot) 결과 (tests/test_build.py). 원본 노트북 그림(h1_fig_result.png)의 MATH-500 1.5B 수치와도 일치 확인."],
      ["Synthetic data", "없음 — 실제 모델 생성 결과"],
      ["Build", R.built],
    ]));

    // citation
    $("#cite-btn").addEventListener("click", () => copy(`NEXUS research portfolio. "H1 · Majority-vote backfire" (data build ${R.built}). ${location.href.split("#")[0]}`, "인용 정보를 복사했습니다"));
    window.NX.reveal();
    if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  }).catch((e) => { console.error(e); $("#results").prepend(h("div", { class: "callout warn" }, "데이터를 불러오지 못했습니다: " + e.message)); });
})();
