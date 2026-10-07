/* NEXUS · Paper 5 page — every number from data/paper5.json (+ paper5_scan.json, loaded lazily),
   built from analysis_phase1c..1i.json and the 1j cell by build_data.py. 1j has no result file → 실행 전. */
(function () {
  "use strict";
  const { $, $$, h, esc, fmt, pct, date, load, badge, stat, forest, provPanel, copy, css } = window.NX;
  window.NXViz.cluster($("#bg-viz"), { seed: 33, cx: 0.6, scale: 0.34 });

  const FOLDER_KO = {
    run_cpu_progress_stall: "progress_stall (depth2)",
    run_cpu_progress_stall_multidepth: "progress_stall · multidepth",
    run_multidepth_v2: "multidepth_v2",
    "run_stochastic_eps0.1": "확률 정책 ε=0.1",
    run_confirm_det: "1f 확인 · 결정론",
    "run_confirm_stochastic_eps0.1": "1f 확인 · 확률 ε=0.1",
  };
  const fk = (f) => FOLDER_KO[f] || f;
  const keyName = (k) => { const [f, d, c] = k.split("|"); return `${fk(f)} · ${d}${c ? " · " + (c === "lf" ? "고리통제" : "전체") : ""}`; };
  const STRATA_KO = { raw: "raw (층화 없음)", dist: "dist (거리 층)", layout: "layout (배치 층)", "lay×dist": "lay×dist (배치×거리)" };
  const ciEx = (r) => r && r.lo != null && (r.lo > 0.5 || r.hi < 0.5);
  const table = (el, head, rows) => {
    el.innerHTML = "";
    el.append(h("thead", {}, h("tr", {}, head.map(([t, num]) => h("th", { class: num ? "num" : "" }, t)))));
    const tb = h("tbody");
    rows.forEach((r) => tb.append(r));
    el.append(tb);
  };
  const td = (x, cls) => h("td", { class: cls || "" }, x);
  const num = (x) => td(x, "num");

  Promise.all([load("paper5.json"), load("timeline.json"), load("provenance.json"), load("research.json")]).then(([P5, TL, PV, R]) => {
    const PH = P5.phases;
    const proj = R.projects.find((p) => p.id === "paper5");
    const HL = R.highlights || {};
    $("#p5-badge").append(badge(proj && proj.status));

    // ---------------------------------------------------------------- meta row
    const code1i = (PV.code.find((f) => f.file.endsWith("Paper5_Phase1i_cell.py")) || {}).sha256 || "—";
    const cell = (lab, node, mono) => h("div", {}, h("div", { class: "lab" }, lab), h("div", { class: "val" + (mono ? " mono" : "") }, node));
    $("#p5-meta").append(
      cell("1f 재현 · 결정론 d0", stat(HL.repro_1f_det, { ci: true })),
      cell("1i kscore (k 만)", stat(HL.fals_1i_kscore, { ci: true })),
      cell("분석 단계 (결과 파일)", h("span", {}, `${Object.values(PH).filter((p) => p.available).length}개 · 1j 실행 전`)),
      cell("PREREG", h("span", { class: "mono", title: (PH["1f"].prereg_sha || "") }, `1f ${(PH["1f"].prereg_sha || "—").slice(0, 12)} · 1j ${PH["1j"].data.prereg.sha12}`), true),
      cell("1i Code SHA-256", h("span", { title: code1i }, code1i.slice(0, 16) + "…"), true),
    );

    // ---------------------------------------------------------------- layer 1 plain story (numbers from highlights)
    $("#p5-plain").append(
      "확률 정책 폴더에서 처음 찾은 신호(1e, 배치×거리 층화 AUROC ", stat(HL.expect_1e, { d: 2 }), ")를 사전 고정(PREREG) 확인 실험 1f 에서 다시 쟀고, 결정론 정책에서 AUROC ",
      stat(HL.repro_1f_det, { d: 2 }), " — ", h("strong", {}, "재현"), "되었습니다. 그런데 1g 에서 ", h("strong", {}, "같은 학습 설정 k 끼리만"), " 비교하자 multidepth_v2 폴더의 값이 ",
      stat(HL.unexp_1g_lxd, { d: 2 }), " → ", stat(HL.unexp_1g_kxd, { d: 2 }), " (우연 수준 근처)이 되었습니다. 1i 는 재현된 값 자체를 분해했고, k 하나만 쓴 점수의 AUROC 가 ",
      stat(HL.fals_1i_kscore, { d: 2 }), " 였습니다 (원래 신호 ", stat(HL.fals_1i_total, { d: 2 }), "). k 평균을 뺀 잔여 ", stat(HL.fals_1i_resk, { d: 2, ci: true }),
      ", 같은 k 끼리 비교 ", stat(HL.fals_1i_kxd, { d: 2, ci: true }), ". 잔여 신호가 정말 있는지는 k=2(거의 미학습)를 뺀 사전 고정 분석 1j 가 판정하며, ", h("strong", {}, "1j 는 아직 실행하지 않았습니다."));

    // ---------------------------------------------------------------- phase status list
    const ps = $("#phase-status");
    const ul = h("ul", { class: "phase-list", style: "list-style:none;margin:0;padding:0;display:grid;gap:10px" });
    Object.values(PH).forEach((p) => ul.append(h("li", { style: "display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:start;border-bottom:1px solid var(--line);padding-bottom:10px" },
      h("span", { class: "mono", style: "font-weight:600" }, p.id),
      h("div", {}, h("div", { style: "font-size:13px" }, (p.notebooks || []).join(" · ") || "—"),
        h("div", { class: "faint", style: "font-size:11.5px" }, `${p.src || "결과 파일 없음"} · ${date(p.created_in_json || p.drive_modified)}`, h("br"), p.status.why)),
      badge(p.status))));
    ps.append(ul);

    // ---------------------------------------------------------------- narrative timeline
    window.NXC.htimeline($("#p5-htl"), TL.events, { filter: (e) => e.project === "paper5" });

    // ---------------------------------------------------------------- 1c scan (lazy full table)
    const C1 = PH["1c"].summary;
    let SCAN = null;
    const fSel = $("#scan-folder"), gSel = $("#scan-group");
    let sortBy = "name";
    C1.folders.forEach((f, i) => fSel.append(h("option", { value: i }, `${fk(f.folder)} (run ${f.n_runs})`)));
    const fillGroups = () => {
      const f = C1.folders[+fSel.value];
      gSel.innerHTML = "";
      f.groups.forEach((g, i) => gSel.append(h("option", { value: i }, g.name)));
    };
    function drawScan() {
      const fi = +fSel.value, gi = +gSel.value;
      const src = SCAN ? SCAN.folders[fi] : C1.folders[fi];
      const g = src.groups[gi];
      if (!g) return;
      let feats = g.features.slice();
      if (sortBy === "v") feats.sort((a, b) => (b.stat.v ?? -1) - (a.stat.v ?? -1));
      $("#scan-meta").textContent = `${g.name} · 에피소드 ${g.n_ep} · 양성 ${g.n_pos} · 군집(run) ${g.n_clusters} · 신호 ${feats.length}개${SCAN ? "" : " (요약: 대표 신호만 — 전체 표 불러오는 중)"} · CI 가 0.5 를 벗어난 신호는 밝게 표시`;
      forest($("#scan-chart"), feats.map((x) => ({ label: x.name, ref: x.stat, dim: !x.excl_05, color: !x.excl_05 ? css("--text-3") : x.stat.v > 0.5 ? css("--cyan") : css("--magenta") })),
        { min: 0, max: 1, ref: 0.5, refLabel: "0.5 = 우연", ticks: [0, 0.25, 0.5, 0.75, 1], labW: 190, width: 900, rowH: 24, aria: "1c 신호별 AUROC 와 95% CI",
          desc: "0.5 보다 아래 = 값이 클수록 실패 쪽 (방향이 반대일 뿐 예측력은 있음). CI 는 run 군집 부트스트랩 (원자료 ci95)." });
    }
    fSel.addEventListener("change", () => { fillGroups(); drawScan(); });
    gSel.addEventListener("change", drawScan);
    $$("#phase-1c .seg button").forEach((b) => b.addEventListener("click", () => { $$("#phase-1c .seg button").forEach((x) => x.setAttribute("aria-pressed", x === b)); sortBy = b.dataset.s; drawScan(); }));
    fillGroups(); drawScan();
    const scanP = load("paper5_scan.json").then((S) => { SCAN = S["1c"]; drawScan(); return S; });

    // ---------------------------------------------------------------- tautology
    const detRows = [];
    C1.folders.forEach((f) => f.determinism.forEach((d) => detRows.push(h("tr", {},
      td(fk(f.folder)), td("depth " + d.depth), num(stat(d.ep, { int: true })), num(stat(d.fail, { int: true })), num(stat(d.fail_rev, { int: true })),
      num(stat(d.rev, { int: true })), num(h("span", { class: d.key_after_rev.v === 0 ? "" : "better" }, stat(d.key_after_rev, { int: true })))))));
    table($("#det-table"), [["폴더"], ["깊이"], ["에피소드", 1], ["fail", 1], ["fail_rev", 1], ["rev", 1], ["key_after_rev", 1]], detRows);
    const det = C1.folders.filter((f) => !/stochastic/.test(f.folder));
    const detAll = det.every((f) => f.determinism.every((d) => d.fail_rev.v === d.fail.v && d.key_after_rev.v === 0));
    const sto = C1.folders.filter((f) => /stochastic/.test(f.folder));
    const revFeat = (() => { const g = C1.folders[0].groups.find((x) => x.name.startsWith("std_N5")); return g && g.features.find((x) => x.name === "S6_revisit_mean"); })();
    $("#taut-notes").append(
      h("h3", { style: "margin-top:0" }, "무엇을 보여 주나"),
      h("p", {}, h("span", { class: "fact" }, "사실"), detAll
        ? ` 결정론 정책 폴더 ${det.length}개의 모든 깊이에서 fail = fail_rev (실패한 에피소드는 전부 재방문 포함), key_after_rev = 0 (재방문 뒤 열쇠 도달 없음).`
        : " 결정론 폴더 중 일부는 fail ≠ fail_rev 이거나 key_after_rev > 0 입니다 — 표를 보세요."),
      sto.length ? h("p", {}, h("span", { class: "fact" }, "사실"), " 확률 정책(ε=0.1) 폴더에서는 key_after_rev 가 ", sto[0].determinism.map((d, i) => [i ? ", " : "", stat(d.key_after_rev, { int: true }), ` (depth ${d.depth})`]), " 로 0 이 아닙니다.") : null,
      revFeat ? h("p", {}, h("span", { class: "fact" }, "사실"), ` 1c 의 전체 표본(${C1.folders[0].groups.find((x) => x.name.startsWith("std_N5")).name})에서 재방문 신호 S6_revisit_mean 의 AUROC 는 `, stat(revFeat.stat, { ci: true }), " — 0.5 에서 멀리 떨어져 있습니다.") : null,
      h("p", {}, h("span", { class: "interp" }, "해석"), " 결정론 정책은 같은 상태에서 늘 같은 행동을 하므로, 한 번 재방문하면 같은 고리를 계속 돕니다. 그래서 '재방문했다'는 신호가 실패를 맞히는 것은 실패의 정의를 다시 말하는 것(동어반복)에 가깝습니다. 1c 이후 분석이 처음 N+1 걸음에 재방문이 없는 '고리통제(loop-free)' 표본을 쓰는 이유입니다."),
      h("p", { class: "faint", style: "font-size:12.5px" }, "숫자는 analysis_phase1c.json 의 determinism 항목 (paper5.json → 1c.summary)."));

    // ---------------------------------------------------------------- 1d perturbation
    const pf = $("#pert-folder"), pg = $("#pert-group");
    let D1 = null;
    function fillPert() {
      const f = D1.folders[+pf.value];
      pg.innerHTML = "";
      f.groups.forEach((g, i) => pg.append(h("option", { value: i }, `${g.name} (ep ${g.n_ep}, 양성 ${g.n_pos})`)));
    }
    function drawPert() {
      const g = D1.folders[+pf.value].groups[+pg.value];
      const row = (n) => g.rows.find((r) => r.name === n);
      const mq = row("S1a_maxq_last"), dist = g.rows.find((r) => r.name.startsWith("거리"));
      const strata = ["raw", "dist", "layout", "lay×dist"];
      const mk = (r, col) => strata.filter((s) => r && r.strata[s]).map((s) => ({ label: STRATA_KO[s], ref: r.strata[s], color: col }));
      if (mq) forest($("#pert-maxq"), mk(mq, css("--cyan")), { min: 0, max: 1, ref: 0.5, refLabel: "0.5", ticks: [0, 0.25, 0.5, 0.75, 1], labW: 150, width: 460, aria: "S1a_maxq_last 층화별 AUROC", desc: "S1a_maxq_last (N=5 시점 maxQ) — 층화 방식별 AUROC" });
      else $("#pert-maxq").innerHTML = '<p class="pending">DATA PENDING — 이 그룹에 S1a_maxq_last 없음</p>';
      if (dist) forest($("#pert-dist"), mk(dist, css("--violet")), { min: 0, max: 1, ref: 0.5, refLabel: "0.5", ticks: [0, 0.25, 0.5, 0.75, 1], labW: 150, width: 460, aria: "거리 층화별 AUROC",
        desc: "거리(가까울수록↑) 자체의 AUROC. 거리로 층화한 경우(dist, lay×dist)는 원자료 값이 null 이라 비움 — 층 안에서 거리가 같기 때문." });
      else $("#pert-dist").innerHTML = '<p class="pending">DATA PENDING</p>';
    }
    scanP.then((S) => {
      D1 = S["1d"];
      D1.folders.forEach((f, i) => pf.append(h("option", { value: i }, fk(f.folder))));
      fillPert(); drawPert(); window.NX.reveal();
    }).catch((e) => { $("#pert-maxq").innerHTML = `<p class="pending">paper5_scan.json 을 불러오지 못함: ${esc(e.message)}</p>`; $("#scan-meta").textContent += " · 전체 표를 불러오지 못해 요약만 표시"; });
    pf.addEventListener("change", () => { fillPert(); drawPert(); });
    pg.addEventListener("change", drawPert);

    // ---------------------------------------------------------------- 1e / 1f
    const F = PH["1f"];
    $("#f-prereg").append(`PREREG sha256 ${(F.prereg_sha || "—").slice(0, 12)}… · run ${F.data.n_runs_done} · complete ${F.data.complete} · 1f-H1/H2/H3 은 Paper 5 내부 가설 번호 (H1 프로젝트와 무관)`);
    const fRows = [];
    const COND = { det: "결정론", eps: "확률 ε=0.1" };
    Object.entries(F.data.conds).forEach(([c, cd]) => cd.tests.forEach((t) => {
      const main = !!t.verdict;
      fRows.push(h("tr", { class: main ? "" : "sub" }, td(COND[c] || c), td(h("span", { class: main ? "" : "faint" }, t.name)), num(stat(t.stat, { ci: true })),
        td(t.verdict ? h("span", { class: "badge " + (t.verdict === "재현" ? "preregistered" : t.verdict.startsWith("역방향") ? "falsified" : t.verdict.startsWith("판정 불가") ? "pending" : "exploratory") }, t.verdict) : h("span", { class: "faint" }, "보조 (판정 없음)"))));
    }));
    table($("#f-tests"), [["조건"], ["검정"], ["값 [95% CI]", 1], ["판정 (원문)"]], fRows);
    const E = PH["1e"].data;
    table($("#e-diffs"), [["폴더"], ["층화"], ["직접", 1], ["플래너", 1], ["차이 [95% CI]", 1], ["공통 run", 1]],
      E.diffs.map((d) => h("tr", {}, td(fk(d.folder)), td(d.strata), num(fmt(d.direct)), num(fmt(d.planner)), num(stat(d.stat, { ci: true })), num(String(d.n_common_runs)))));

    // ---------------------------------------------------------------- 1g / 1h
    const G = PH["1g"].data, Hh = PH["1h"].data;
    const cellS = (r) => num(h("span", { class: ciEx(r) ? "" : "faint" }, stat(r, { d: 3, ci: true })));
    table($("#g-table"), [["조건"], ["lxd", 1], ["kxd", 1], ["within", 1], ["between", 1], ["1g 라벨 (원문)"]],
      G.B.map((b) => h("tr", { class: b.key === "run_multidepth_v2|d0|lf" ? "hl" : "" }, td(keyName(b.key)), cellS(b.stats.lxd), cellS(b.stats.kxd), cellS(b.stats.within), cellS(b.stats.between), td(b.label, "wrap-cell faint"))));
    table($("#h-table"), [["조건"], ["total", 1], ["kscore", 1], ["resk", 1], ["kxd", 1], ["1h 라벨 (원문)"]],
      Hh.B.map((b) => h("tr", { class: b.key === "run_multidepth_v2|d0|lf" ? "hl" : "" }, td(keyName(b.key)), cellS(b.stats.total), cellS(b.stats.kscore), cellS(b.stats.resk), cellS(b.stats.kxd), td(b.label, "wrap-cell faint"))));

    // ---------------------------------------------------------------- 1i lab + compare
    const I = PH["1i"];
    window.NXLab.mount({ ctrl: $("#lab-ctrl"), canvas: $("#lab-canvas"), out: $("#lab-out"), cap: $("#lab-cap"), key: $("#lab-key") }, I);
    const ca = $("#cmp-a"), cb = $("#cmp-b");
    I.data.B.forEach((b, i) => { ca.append(h("option", { value: i, selected: i === 0 }, keyName(b.key))); cb.append(h("option", { value: i, selected: i === 2 }, keyName(b.key))); });
    function compare() {
      const out = $("#cmp-out");
      out.innerHTML = "";
      [I.data.B[+ca.value], I.data.B[+cb.value]].forEach((b, k) => {
        const dl = h("dl");
        dl.append(h("dt", {}, "에피소드 / 양성 / run"), h("dd", {}, `${b.n_ep} / ${b.n_pos} / ${b.n_run}`));
        window.NXLab.METRICS.forEach(([m]) => dl.append(h("dt", {}, m), h("dd", {}, h("span", { class: ciEx(b.stats[m]) ? "" : "faint" }, stat(b.stats[m], { ci: true })))));
        dl.append(h("dt", {}, "1i 라벨"), h("dd", { style: "white-space:normal" }, b.label || "—"));
        out.append(h("div", { class: "col" }, h("div", { class: "kicker" + (k ? " v" : "") }, k ? "Condition B" : "Condition A"), h("h3", { style: "margin-top:4px" }, keyName(b.key)), dl));
      });
      out.append(h("p", { class: "faint", style: "font-size:12px;grid-column:1/-1;margin:0" }, "흐린 값 = 95% CI 가 0.5 를 포함. 두 조건의 우열을 매기지 않습니다 (표본·정책이 다름)."));
    }
    ca.addEventListener("change", compare); cb.addEventListener("change", compare);
    compare();

    // ---------------------------------------------------------------- 1i vs 1j
    const J = PH["1j"].data;
    const main1i = I.data.B.find((b) => b.key === "run_confirm_det|d0|lf");
    const ij = ["total", "kscore", "resk", "kxd"].map((m) => h("tr", {}, td(h("span", { class: "mono" }, m), ""), num(main1i ? stat(main1i.stats[m], { ci: true }) : h("span", { class: "pending" }, "DATA PENDING")),
      td(["resk", "kxd"].includes(m) ? "판정 지표" : h("span", { class: "faint" }, "참고")), td(J.result ? "—" : badge(PH["1j"].status))));
    table($("#ij-table"), [["지표"], ["1i (k=2,8,32)", 1], ["1j 역할"], [`1j (k=${J.prereg.keep_k.join(",")})`]], ij);
    $("#prereg-text").textContent = J.prereg.text;
    const pm = $("#prereg-meta");
    [["PREREG sha256", J.prereg.sha256, 1], ["sha12 (1j 코드가 출력하는 값)", J.prereg.sha12, 1], ["계산 방법", J.prereg.method], ["유지 k", J.prereg.keep_k.join(", ")],
      ["재사용 코드", J.prereg.src_name], ["1j 에 기록된 1i 코드 해시", J.prereg.src_sha_recorded, 1],
      ["1i 코드 해시 대조", PV.verify_1i.ok ? "일치 — code/Paper5_Phase1i_cell.py 의 rstrip sha256 = 1j 기록값" : "불일치"], ["결과 파일", J.result ? J.result_file_expected : `${J.result_file_expected} 없음 → 실행 전`]]
      .forEach(([k, v, mono]) => pm.append(h("dt", {}, k), h("dd", { class: mono ? "mono" : "" }, String(v))));

    // ---------------------------------------------------------------- checklist
    const ok = (b) => h("span", { class: "badge " + (b === true ? "preregistered" : b === false ? "falsified" : "pending") }, b === true ? "통과" : b === false ? "실패" : "확인 불가");
    const chk = [];
    const noteEl = (note) => (note && note.length > 110 ? h("details", {}, h("summary", { style: "cursor:pointer" }, `${note.split(" · ").length}건 원문 보기`), h("div", { style: "margin-top:6px" }, note)) : note || "");
    const add = (what, src, res, note) => chk.push(h("tr", {}, td(what, "wrap-cell"), td(h("span", { class: "mono" }, src)), td(ok(res)), td(noteEl(note), "wrap-cell faint")));
    add("1d 구현과 같은 AUROC 함수 사용", "1e self_check.match_1d_impl", E.self_check.match_1d_impl);
    E.self_check.repro_1d.forEach((r) => add(`1d 수치 재계산 · ${keyName(r.key)}`, "1e self_check.repro_1d", r.ok, `기대 ${r.expected} / 재계산 ${fmt(r.got)}`));
    [["1g", G], ["1h", Hh], ["1i", I.data]].forEach(([pid, d]) => {
      add(`${pid} brute-force 대조 불일치 수`, `${pid} self.brute`, d.self.brute === 0, `brute = ${d.self.brute}`);
      const lines = d.self.repro || [];
      add(`${pid} 이전 단계 수치 재계산 (${lines.length}건)`, `${pid} self.repro`, lines.length ? lines.every((l) => /OK\s*$/.test(l)) : null, lines.join(" · "));
    });
    add("1i 자체 판정 all_ok", "1i self.all_ok", I.data.self.all_ok);
    add("1i 코드가 1j 에 기록된 해시와 같은가", "provenance.verify_1i", PV.verify_1i.ok, `rstrip sha256 ${PV.verify_1i.computed_rstrip_sha256.slice(0, 16)}… (사이트 빌드 시 계산)`);
    add("1f PREREG 원문 대조", "analysis_phase1f.json prereg_sha", null, "해시만 있고 원문이 저장소에 없어 대조 불가");
    add("1b–1h 셀 코드 해시", "Drive", null, `${(PV.drive_only_code || []).length}개 코드 파일이 Drive 에만 있어 SHA 미계산`);
    chk.push(h("tr", {}, td("1j 결과"), td(h("span", { class: "mono" }, J.result_file_expected)), td(badge(PH["1j"].status)), td("결과 파일 없음 — 판정하지 않음", "wrap-cell faint")));
    table($("#check-table"), [["점검"], ["근거 필드"], ["결과"], ["비고"]], chk);

    // ---------------------------------------------------------------- limitations
    const k2 = main1i && main1i.per_k && main1i.per_k["2"];
    $("#p5-limits").append(h("ul", {},
      h("li", {}, h("span", { class: "limit" }, "한계"), `1c–1i 중 사전 고정 기록이 있는 단계는 1f 하나뿐입니다. 나머지(${Object.values(PH).filter((p) => p.available && p.status.code === "exploratory").map((p) => p.id).join(", ")})는 탐색적 분석입니다.`),
      h("li", {}, h("span", { class: "limit" }, "한계"), "1f 의 PREREG 원문은 이 저장소에 없습니다. 해시(", h("span", { class: "mono" }, (F.prereg_sha || "").slice(0, 12)), ")만 결과 파일에 있어, 가설 문장과의 대조는 할 수 없습니다."),
      h("li", {}, h("span", { class: "limit" }, "한계"), "재현된 1f 신호는 1i 분해에서 대부분 학습 설정 k 로 설명됐습니다 (kscore ", stat(HL.fals_1i_kscore, { d: 3 }), " vs total ", stat(HL.fals_1i_total, { d: 3 }), "). ", h("span", { class: "interp" }, "해석"), "1i 까지의 결과로는 'maxQ 가 자신감을 반영한다'는 해석을 뒷받침할 수 없습니다. k 를 넘어서는 잔여 신호가 있는지는 1j 판정 전까지 미정입니다."),
      k2 ? h("li", {}, h("span", { class: "limit" }, "한계"), `1i 에는 거의 학습되지 않은 k=2 가 들어 있습니다 (결정론 d0 고리통제에서 k=2 성공률 ${pct(k2.pos_rate, 1)}, 에피소드 ${k2.n_ep}). k 효과가 이 극단 때문인지는 k=2 를 뺀 1j 가 봅니다.`) : null,
      h("li", {}, h("span", { class: "limit" }, "한계"), "1j PREREG 스스로 밝힌 검출력 한계: k별 run 20개씩 40개라 CI 반폭이 약 0.1 → 약 0.6 미만의 효과는 구분하지 못합니다."),
      h("li", {}, h("span", { class: "limit" }, "한계"), "1c 는 여러 신호 × 여러 폴더·표본 조건을 한꺼번에 본 탐색이며, 결과 파일에 다중 비교 보정 기록이 없습니다."),
      h("li", {}, h("span", { class: "limit" }, "한계"), "모든 결과는 이 프로젝트의 자체 환경·에이전트에서 나온 것이며, 다른 환경·모델로의 일반화는 검증하지 않았습니다."),
      h("li", {}, h("span", { class: "limit" }, "한계"), "1b–1h 셀 코드는 Drive 에만 있어 저장소에 없고, 코드 해시를 제공하지 못합니다. 저장소에 있는 코드는 1i·1j 셀입니다.")));

    // ---------------------------------------------------------------- provenance
    const srcs = PV.sources.filter((s) => s.project === "paper5");
    $("#prov-box").append(provPanel([
      ["Source", h("span", {}, srcs.map((s) => h("div", { class: "mono" }, `${s.file} · sha256 ${s.sha256.slice(0, 16)}… · ${s.bytes} B`))), false],
      ["Derived", "data/paper5.json · data/paper5_scan.json (build_data.py)", true],
      ["Code", h("span", {}, PV.code.filter((c) => /Paper5/.test(c.file)).map((c) => h("div", { class: "mono" }, `${c.file} · ${c.sha256.slice(0, 16)}…`))), false],
      ["PREREG", `1f ${F.prereg_sha || "—"} (원문 없음) · 1j ${J.prereg.sha256}`, true],
      ["Status", `${proj.status.label} — ${proj.status.why}`],
      ["Synthetic data", "없음 — 실제 실행 결과 JSON"],
      ["Build", R.built],
    ]));

    $("#cite-btn").addEventListener("click", () => copy(`NEXUS research portfolio. "Paper 5 · 내부 신호로 성공 예측하기" (data build ${R.built}). ${location.href.split("#")[0]}`, "인용 정보를 복사했습니다"));
    window.NX.reveal();
    if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  }).catch((e) => { console.error(e); $("#question").prepend(h("div", { class: "callout warn" }, "데이터를 불러오지 못했습니다: " + e.message)); });
})();
