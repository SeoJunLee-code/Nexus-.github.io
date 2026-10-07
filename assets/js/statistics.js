/* NEXUS · Statistics — the full Stat Registry (data/statistics.json) with filters, sort, search, paging,
   URL state (?q=&proj=&phase=&metric=&ci=&core=1&sort=&dir=&page=), CSV export and a two-stat Compare Mode. */
(function () {
  "use strict";
  const { $, $$, h, esc, fmt, fmtCI, load, stat, forest, copy, toast, css, root } = window.NX;
  const PER = 50;

  Promise.all([load("statistics.json"), load("provenance.json"), load("research.json")]).then(([S, PV, R]) => {
    const ALL = S.items;
    const byId = new Map(ALL.map((x) => [x.id, x]));
    const ref = (x) => x && { id: x.id, v: x.v, lo: x.lo, hi: x.hi, n: x.n };

    // ---------------------------------------------------------------- meta
    const cell = (lab, val) => h("div", {}, h("div", { class: "lab" }, lab), h("div", { class: "val" }, val));
    $("#st-meta").append(
      cell("수치", String(ALL.length)),
      cell("95% CI 있음", String(ALL.filter((x) => x.lo != null).length)),
      cell("H1 / Paper 5", `${ALL.filter((x) => x.proj === "h1").length} / ${ALL.filter((x) => x.proj === "paper5").length}`),
      cell("원본 파일", String(new Set(ALL.flatMap((x) => x.src.split(" + "))).size)),
      cell("Build", R.built.replace("T", " ").replace("Z", " UTC")),
    );

    // ---------------------------------------------------------------- filters
    const uniq = (k) => [...new Set(ALL.map((x) => x[k]))].sort();
    const PROJ_KO = { h1: "H1", paper5: "Paper 5" };
    uniq("proj").forEach((v) => $("#f-proj").append(h("option", { value: v }, PROJ_KO[v] || v)));
    uniq("phase").forEach((v) => $("#f-phase").append(h("option", { value: v }, v)));
    uniq("metric").forEach((v) => $("#f-metric").append(h("option", { value: v }, v)));
    const F = { q: $("#f-q"), proj: $("#f-proj"), phase: $("#f-phase"), metric: $("#f-metric"), ci: $("#f-ci"), core: $("#f-core") };
    const st = { sort: "", dir: 1, page: 1 };

    const params = new URLSearchParams(location.search);
    ["q", "proj", "phase", "metric", "ci"].forEach((k) => { if (params.get(k)) F[k].value = params.get(k); });
    F.core.checked = params.get("core") === "1";
    if (params.get("sort")) { st.sort = params.get("sort"); st.dir = params.get("dir") === "-1" ? -1 : 1; }
    st.page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
    const exactId = params.get("q") && byId.has(params.get("q")) ? params.get("q") : null;

    function filtered() {
      const terms = F.q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const exact = byId.has(F.q.value.trim());
      return ALL.filter((x) => {
        if (F.proj.value && x.proj !== F.proj.value) return false;
        if (F.phase.value && x.phase !== F.phase.value) return false;
        if (F.metric.value && x.metric !== F.metric.value) return false;
        if (F.core.checked && !x.core) return false;
        const hasCI = x.lo != null && x.hi != null;
        switch (F.ci.value) {
          case "ex05": if (!hasCI || !(x.lo > 0.5 || x.hi < 0.5)) return false; break;
          case "in05": if (!hasCI || !(x.lo <= 0.5 && x.hi >= 0.5)) return false; break;
          case "ex0": if (!hasCI || !(x.lo > 0 || x.hi < 0)) return false; break;
          case "noci": if (hasCI) return false; break;
        }
        if (exact) return x.id === F.q.value.trim();
        if (!terms.length) return true;
        const hay = `${x.id} ${x.label} ${x.src} ${x.path || ""} ${x.method || ""} ${x.metric} ${x.phase}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
    }
    const COLS = [
      ["label", "항목"], ["v", "값", 1], ["ci", "95% CI", 1], ["n", "n", 1], ["phase", "단계"], ["metric", "지표"], ["src", "원본 · 경로 / 방법"], ["", "비교"],
    ];
    const keyOf = { label: (x) => x.label, v: (x) => x.v, ci: (x) => (x.hi != null ? x.hi - x.lo : Infinity), n: (x) => x.n ?? -1, phase: (x) => x.phase, metric: (x) => x.metric, src: (x) => x.src + (x.path || "") };

    function syncURL() {
      const p = new URLSearchParams();
      ["q", "proj", "phase", "metric", "ci"].forEach((k) => F[k].value && p.set(k, F[k].value));
      if (F.core.checked) p.set("core", "1");
      if (st.sort) { p.set("sort", st.sort); if (st.dir < 0) p.set("dir", "-1"); }
      if (st.page > 1) p.set("page", st.page);
      const qs = p.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }

    let lastRows = [];
    function render() {
      let rows = filtered();
      if (st.sort && keyOf[st.sort]) {
        const k = keyOf[st.sort];
        rows = rows.slice().sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir; });
      }
      lastRows = rows;
      const pages = Math.max(1, Math.ceil(rows.length / PER));
      st.page = Math.min(st.page, pages);
      const slice = rows.slice((st.page - 1) * PER, st.page * PER);
      $("#st-count").textContent = `${rows.length.toLocaleString()} / ${ALL.length.toLocaleString()} 개 · ${st.page} / ${pages} 쪽`;

      const t = $("#st-table");
      t.innerHTML = "";
      const tr = h("tr");
      COLS.forEach(([k, label, isNum]) => {
        const th = h("th", { class: isNum ? "num" : "", scope: "col" });
        if (k) {
          th.setAttribute("aria-sort", st.sort === k ? (st.dir > 0 ? "ascending" : "descending") : "none");
          th.append(h("button", { type: "button", onclick: () => { if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = k === "v" ? -1 : 1; } st.page = 1; render(); } }, label, st.sort === k ? (st.dir > 0 ? " ↑" : " ↓") : ""));
        } else th.append(label);
        tr.append(th);
      });
      t.append(h("thead", {}, tr));
      const tb = h("tbody");
      if (!slice.length) tb.append(h("tr", {}, h("td", { colspan: COLS.length, class: "faint" }, "조건에 맞는 수치가 없습니다.")));
      slice.forEach((x) => tb.append(h("tr", { class: x.id === exactId ? "hl" : "", id: x.id === exactId ? "hit" : null },
        h("td", { class: "lab-cell" }, x.label, x.core ? h("span", { class: "badge preregistered", style: "margin-left:6px;font-size:10px;padding:1px 6px" }, "core") : null,
          h("div", { class: "mono faint", style: "font-size:10.5px;margin-top:2px;word-break:break-all" }, x.id)),
        h("td", { class: "num" }, stat(ref(x), { d: Number.isInteger(x.v) ? 0 : 3, label: x.label })),
        h("td", { class: "num faint" }, x.lo != null ? fmtCI(x, 3) : "—"),
        h("td", { class: "num" }, x.n != null ? String(x.n) : "—"),
        h("td", {}, (PROJ_KO[x.proj] || x.proj) === x.phase ? x.phase : `${PROJ_KO[x.proj] || x.proj} · ${x.phase}`),
        h("td", {}, x.metric),
        h("td", { class: "src-cell" }, x.src, h("br"), h("span", { style: "color:var(--text-2)" }, x.path || x.method || "")),
        h("td", {}, h("div", { style: "display:flex;gap:4px" },
          h("button", { class: "mini-btn", type: "button", "aria-label": `${x.label} 를 비교 A 로`, onclick: () => setCmp("a", x.id) }, "A"),
          h("button", { class: "mini-btn", type: "button", "aria-label": `${x.label} 를 비교 B 로`, onclick: () => setCmp("b", x.id) }, "B"))))));
      t.append(tb);

      const pg = $("#st-pager");
      pg.innerHTML = "";
      const go = (p) => { st.page = p; render(); $("#table").scrollIntoView({ block: "start" }); };
      pg.append(h("button", { type: "button", disabled: st.page <= 1, onclick: () => go(st.page - 1), "aria-label": "이전 쪽" }, "←"));
      const nums = new Set([1, pages, st.page - 1, st.page, st.page + 1].filter((p) => p >= 1 && p <= pages));
      let prev = 0;
      [...nums].sort((a, b) => a - b).forEach((p) => { if (p - prev > 1) pg.append(h("span", {}, "…")); pg.append(h("button", { type: "button", "aria-current": p === st.page ? "page" : null, onclick: () => go(p) }, String(p))); prev = p; });
      pg.append(h("button", { type: "button", disabled: st.page >= pages, onclick: () => go(st.page + 1), "aria-label": "다음 쪽" }, "→"));
      syncURL();
    }
    let deb = 0;
    F.q.addEventListener("input", () => { clearTimeout(deb); deb = setTimeout(() => { st.page = 1; render(); }, 120); });
    ["proj", "phase", "metric", "ci", "core"].forEach((k) => F[k].addEventListener("change", () => { st.page = 1; render(); }));
    $("#f-reset").addEventListener("click", () => { ["q", "proj", "phase", "metric", "ci"].forEach((k) => (F[k].value = "")); F.core.checked = false; st.sort = ""; st.dir = 1; st.page = 1; render(); });
    render();
    if (exactId) { const hit = $("#hit"); if (hit) setTimeout(() => hit.scrollIntoView({ block: "center" }), 100); }

    // ---------------------------------------------------------------- CSV / link
    const csvCell = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    $("#csv-btn").addEventListener("click", () => {
      const head = ["id", "label", "v", "lo", "hi", "n", "proj", "phase", "metric", "src", "path", "method"];
      const body = lastRows.map((x) => head.map((k) => csvCell(x[k])).join(","));
      const blob = new Blob(["﻿" + [head.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
      const a = h("a", { href: URL.createObjectURL(blob), download: `nexus_statistics_${lastRows.length}.csv` });
      document.body.append(a); a.click(); a.remove();
      toast(`${lastRows.length}개 행을 CSV 로 내려받았습니다`);
    });
    $("#link-btn").addEventListener("click", () => copy(location.href, "현재 필터 링크를 복사했습니다"));

    // ---------------------------------------------------------------- compare
    const dlist = $("#stat-ids");
    ALL.forEach((x) => dlist.append(h("option", { value: x.id }, x.label)));
    const A = $("#cmp-a"), B = $("#cmp-b");
    const hl = R.highlights || {};
    A.value = (hl.fals_1i_total || {}).id || ALL[0].id;
    B.value = (hl.fals_1i_kscore || {}).id || ALL[1].id;
    function setCmp(which, id) { (which === "a" ? A : B).value = id; compare(); $("#compare").scrollIntoView({ block: "start" }); }
    function compare() {
      const out = $("#cmp-out");
      out.innerHTML = "";
      const a = byId.get(A.value.trim()), b = byId.get(B.value.trim());
      [[a, A.value, "A"], [b, B.value, "B"]].forEach(([x, raw, tag], k) => {
        const col = h("div", { class: "col" }, h("div", { class: "kicker" + (k ? " v" : "") }, "Statistic " + tag));
        if (!x) { col.append(h("p", { class: "pending" }, raw ? `DATA PENDING — '${raw}' 라는 id 가 없습니다` : "id 를 입력하세요")); out.append(col); return; }
        const dl = h("dl");
        [["값", stat(ref(x), { ci: true, cid: 3, d: Number.isInteger(x.v) ? 0 : 3 })], ["n", x.n ?? "—"], ["지표", x.metric], ["단계", `${PROJ_KO[x.proj]} · ${x.phase}`], ["원본", x.src], [x.path ? "JSON path" : "계산 방법", x.path || x.method || "—"]]
          .forEach(([k2, v]) => dl.append(h("dt", {}, k2), h("dd", { style: "white-space:normal;word-break:break-all", class: k2 === "JSON path" || k2 === "원본" ? "mono" : "" }, v instanceof Node ? v : String(v))));
        col.append(h("h3", { style: "margin-top:4px;font-size:14.5px" }, x.label), dl);
        out.append(col);
      });
      const ch = $("#cmp-chart");
      ch.innerHTML = "";
      if (a && b) {
        const both = a.lo != null && b.lo != null;
        const overlap = both ? !(a.hi < b.lo || b.hi < a.lo) : null;
        const sameMetric = a.metric === b.metric;
        out.append(h("p", { class: "faint", style: "grid-column:1/-1;margin:0;font-size:12.5px" },
          h("span", { class: "fact" }, "사실"), `차이 (A − B) = ${fmt(a.v - b.v, 3)}. `,
          both ? `95% CI ${overlap ? "가 겹칩니다" : "가 겹치지 않습니다"}.` : "한쪽 이상에 CI 가 없습니다.",
          sameMetric ? "" : " 두 수치의 지표 종류가 다릅니다 — 직접 비교에 주의.",
          " 이 화면은 차이의 유의성을 판정하지 않습니다."));
        const vals = [a, b].flatMap((x) => [x.v, x.lo, x.hi]).filter((v) => v !== null && v !== undefined);
        if (vals.every((v) => Math.abs(v) <= 1.0001)) {
          const min = Math.min(0, ...vals), max = Math.max(1, ...vals);
          forest(ch, [{ label: "A", ref: ref(a), color: css("--cyan") }, { label: "B", ref: ref(b), color: css("--violet") }],
            { min, max, ref: a.metric === "AUROC" || b.metric === "AUROC" ? 0.5 : (min < 0 ? 0 : null), refLabel: a.metric === "AUROC" ? "0.5 = 우연" : "0", ticks: min < 0 ? [min, 0, max] : [0, 0.25, 0.5, 0.75, 1], labW: 40, width: 900, rowH: 34, aria: "비교 포레스트 플롯" });
        }
      }
    }
    A.addEventListener("change", compare); B.addEventListener("change", compare);
    compare();

    // ---------------------------------------------------------------- downloads
    const DERIVED = [
      ["data/research.json", "프로젝트·상태·핵심 수치(highlights)"], ["data/h1.json", "H1 결과 (조건·구간·쌍·예시)"], ["data/paper5.json", "Paper 5 단계별 결과 (1c·1d 는 요약)"],
      ["data/paper5_scan.json", "1c 신호 탐색 전체 표 · 1d 층화 전체 표"], ["data/statistics.json", "Stat Registry 전체"], ["data/timeline.json", "연구 일지 이벤트"],
      ["data/graph.json", "연구 지도 노드·연결"], ["data/provenance.json", "원본 파일·코드 SHA-256, PREREG 해시"],
    ];
    const dt = $("#dl-table");
    dt.append(h("thead", {}, h("tr", {}, h("th", {}, "파일"), h("th", {}, "내용"), h("th", {}, "SHA-256 / 비고"), h("th", {}, ""))));
    const tb = h("tbody");
    DERIVED.forEach(([f, d]) => tb.append(h("tr", {}, h("td", { class: "mono" }, f), h("td", {}, d), h("td", { class: "faint" }, "build_data.py 가 생성"), h("td", {}, h("a", { class: "mini-btn", href: root + f, download: "" }, "↓")))));
    PV.sources.concat(PV.code.map((c) => ({ ...c, committed: true, role: "분석 코드 (원본 셀 그대로)" }))).forEach((s) => tb.append(h("tr", {},
      h("td", { class: "mono" }, s.file), h("td", {}, s.role || "—"), h("td", { class: "mono faint", style: "font-size:11px" }, s.sha256.slice(0, 24) + "…" + (s.committed ? "" : " · 로컬 전용")),
      h("td", {}, s.committed ? h("a", { class: "mini-btn", href: root + s.file, download: "" }, "↓") : h("span", { class: "faint", title: s.note || "" }, "—")))));
    dt.append(tb);
    window.NX.reveal();
  }).catch((e) => { console.error(e); $("#table").prepend(h("div", { class: "callout warn" }, "데이터를 불러오지 못했습니다: " + e.message)); });
})();
