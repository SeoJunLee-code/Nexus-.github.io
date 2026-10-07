/* NEXUS · Reproduce — provenance.json rendered as tables, plus in-browser SHA-256 verification (Web Crypto). */
(function () {
  "use strict";
  const { $, h, esc, date, load, badge, copy, toast, root } = window.NX;

  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const canHash = !!(window.crypto && crypto.subtle);
  const sha256 = async (data) => hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? new TextEncoder().encode(data) : data));
  const fetchBuf = (f) => fetch(root + f, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`${f} ${r.status}`); return r.arrayBuffer(); });
  const td = (x, cls) => h("td", { class: cls || "" }, x);
  const codeBlock = (el, lines) => { el.innerHTML = ""; lines.forEach((l) => el.append(h("div", { class: l.startsWith("#") ? "faint" : "" }, l))); el.append(h("button", { class: "mini-btn no-print", type: "button", style: "margin-top:8px", onclick: () => copy(lines.filter((l) => !l.startsWith("#")).join("\n"), "명령을 복사했습니다") }, "복사")); };

  // Python str.rstrip() and JS trimEnd() both strip Unicode whitespace.
  const pyRstrip = (s) => s.replace(/\s+$/u, "");
  // Extract a parenthesised run of adjacent Python string literals:  NAME = ("a" "b" ...)
  function pyConcat(src, name) {
    const m = src.match(new RegExp(name + "\\s*=\\s*\\(([\\s\\S]*?)\\)\\s*\\n"));
    if (!m) return null;
    const parts = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1].replace(/\\(["\\'])/g, "$1"));
    return parts.join("");
  }

  codeBlock($("#cmd-build"), ["cd nexus", "# (선택) H1 원자료를 로컬에 둠: data_raw/h1v2_*.jsonl", "python3 build_data.py", "python3 build_data.py --check"]);
  codeBlock($("#cmd-serve"), ["cd nexus", "python3 -m http.server 8000", "# 브라우저에서 http://localhost:8000/"]);
  codeBlock($("#cmd-test"), ["cd nexus", "python3 -m unittest discover -s tests -v"]);

  Promise.all([load("provenance.json"), load("research.json"), load("paper5.json")]).then(([PV, R, P5]) => {
    const cell = (lab, val, mono) => h("div", {}, h("div", { class: "lab" }, lab), h("div", { class: "val" + (mono ? " mono" : "") }, val));
    $("#rp-meta").append(
      cell("저장소의 분석 코드", `${PV.code.length}개`),
      cell("Drive 전용 코드", `${PV.drive_only_code.length}개 (SHA 없음)`),
      cell("원자료 (저장소 / 로컬 전용)", `${PV.sources.filter((s) => s.committed).length} / ${PV.sources.filter((s) => !s.committed).length}`),
      cell("1i 코드 ↔ 1j 기록", PV.verify_1i.ok ? "일치" : "불일치"),
      cell("Data build", R.built.replace("T", " ").replace("Z", " UTC")),
    );

    // ---------------------------------------------------------------- code
    const ct = $("#code-table");
    ct.append(h("thead", {}, h("tr", {}, ["파일", "SHA-256", "바이트", "Drive 원본 크기와 일치", ""].map((x) => h("th", {}, x)))));
    const cb = h("tbody");
    PV.code.concat([{ file: PV.builder.file, sha256: PV.builder.sha256, bytes: null, size_match_drive: null, builder: true }]).forEach((c) => cb.append(h("tr", {},
      td(h("span", { class: "mono" }, c.file), ""), td(h("span", { class: "mono", style: "font-size:11.5px;word-break:break-all;white-space:normal" }, c.sha256), "wrap-cell"),
      td(c.bytes != null ? String(c.bytes) : "—", "num"), td(c.builder ? h("span", { class: "faint" }, "사이트 빌더 (Drive 원본 없음)") : c.size_match_drive ? "예" : "아니오"),
      td(h("a", { class: "mini-btn", href: root + c.file, download: "" }, "↓")))));
    ct.append(cb);
    const dt = $("#drive-table");
    dt.append(h("thead", {}, h("tr", {}, ["파일", "단계", "크기 (B)", "수정 (Drive)", "SHA-256"].map((x) => h("th", {}, x)))));
    const db = h("tbody");
    PV.drive_only_code.forEach((c) => db.append(h("tr", {}, td(h("span", { class: "mono" }, c.title)), td(c.phase), td(String(c.size), "num"), td(date(c.modified)), td(h("span", { class: "pending" }, "확인 불가")))));
    dt.append(db);

    // ---------------------------------------------------------------- prereg
    const p1f = PV.prereg["1f"], p1j = PV.prereg["1j"];
    $("#prereg-1f").append(h("div", { class: "title-row" }, h("h3", { style: "margin:0" }, "Paper 5 · 1f"), badge(P5.phases["1f"].status)),
      h("dl", { class: "prov-grid", style: "padding:12px 0 0" }, h("dt", {}, "PREREG sha256"), h("dd", { class: "mono", style: "word-break:break-all" }, p1f.sha256),
        h("dt", {}, "기록 위치"), h("dd", { class: "mono" }, `${p1f.src} · ${p1f.path}`), h("dt", {}, "원문"), h("dd", {}, p1f.note),
        h("dt", {}, "검증"), h("dd", {}, h("span", { class: "pending" }, "확인 불가"), " — 원문이 없어 해시를 다시 계산할 수 없음")));
    $("#prereg-1j").append(h("div", { class: "title-row" }, h("h3", { style: "margin:0" }, "Paper 5 · 1j"), badge(P5.phases["1j"].status)),
      h("div", { class: "code-block", style: "white-space:pre-wrap;margin-top:12px;font-size:12px" }, p1j.text),
      h("dl", { class: "prov-grid", style: "padding:12px 0 0" }, h("dt", {}, "sha256"), h("dd", { class: "mono", style: "word-break:break-all" }, p1j.sha256),
        h("dt", {}, "sha12"), h("dd", { class: "mono" }, p1j.sha12), h("dt", {}, "계산 방법"), h("dd", {}, p1j.method),
        h("dt", {}, "결과"), h("dd", {}, "analysis_phase1j.json 없음 — 실행 전. 결과가 생기면 build_data.py 가 이 해시와 결과 파일의 PREREG 를 대조하도록 확장해야 합니다.")));

    // ---------------------------------------------------------------- sources
    const st = $("#src-table");
    st.append(h("thead", {}, h("tr", {}, ["파일", "역할", "프로젝트", "바이트", "SHA-256", "저장소"].map((x) => h("th", {}, x)))));
    const sb = h("tbody");
    PV.sources.forEach((s) => sb.append(h("tr", {}, td(h("span", { class: "mono" }, s.file)), td(s.role || "—", "wrap-cell"), td(s.project === "h1" ? "H1" : "Paper 5"),
      td(String(s.bytes), "num"), td(h("span", { class: "mono", style: "font-size:11px;word-break:break-all;white-space:normal" }, s.sha256), "wrap-cell"),
      td(s.committed ? h("a", { class: "mini-btn", href: root + s.file, download: "" }, "↓ 포함") : h("span", { class: "faint", title: s.note || "" }, "로컬 전용")))));
    st.append(sb);

    ["research", "h1", "paper5", "paper5_scan", "statistics", "timeline", "graph", "provenance"].forEach((n) => $("#data-list").append(h("a", { class: "tag", href: `${root}data/${n}.json`, download: "" }, `↓ ${n}.json`)));

    // ---------------------------------------------------------------- gaps
    $("#gap-list").append(h("ul", {},
      h("li", {}, h("span", { class: "limit" }, "불가"), "Paper 5 의 원 에피소드 로그(phase1_signals/*/seeds/*.json.gz)는 저장소에 없습니다. 분석 JSON(1c–1i)부터의 재생성만 가능합니다."),
      h("li", {}, h("span", { class: "limit" }, "불가"), `1b–1h 셀 코드 ${PV.drive_only_code.length}개는 Drive 에만 있어 해시를 제공하지 못합니다.`),
      h("li", {}, h("span", { class: "limit" }, "불가"), "1f PREREG 원문이 없어 해시 대조가 불가능합니다."),
      h("li", {}, h("span", { class: "limit" }, "불가"), "H1 원자료 jsonl 은 저장소에 올리지 않았습니다. 로컬에 있는 사람만 SHA-256 으로 같은 파일인지 확인할 수 있습니다 (위 '내 파일 대조')."),
      h("li", {}, h("span", { class: "limit" }, "미정"), "1j 는 실행 전이라 결과·판정이 없습니다."),
      h("li", {}, h("span", { class: "limit" }, "불가"), "H1 v1(Level 5) 실행 파일과 analysis_episode_level.json 은 이 저장소에 없습니다.")));

    // ---------------------------------------------------------------- browser verification
    const known = new Map();
    PV.sources.forEach((s) => known.set(s.sha256, s.file));
    PV.code.forEach((c) => known.set(c.sha256, c.file));
    known.set(PV.builder.sha256, PV.builder.file);

    const vt = $("#verify-table");
    function vrow(what, expected, got, ok) {
      return h("tr", {}, td(what, "wrap-cell"), td(h("span", { class: "mono", style: "font-size:11px" }, (expected || "—").slice(0, 16) + (expected && expected.length > 16 ? "…" : "")), ""),
        td(h("span", { class: "mono", style: "font-size:11px" }, (got || "—").slice(0, 16) + (got && got.length > 16 ? "…" : "")), ""),
        td(h("span", { class: "badge " + (ok === true ? "preregistered" : ok === false ? "falsified" : "pending") }, ok === true ? "일치" : ok === false ? "불일치" : "확인 불가")));
    }
    vt.append(h("thead", {}, h("tr", {}, ["대조 항목", "기록값", "브라우저 계산", "결과"].map((x) => h("th", {}, x)))), h("tbody", {}, h("tr", {}, h("td", { colspan: 4, class: "faint" }, canHash ? "버튼을 누르면 계산합니다." : "이 브라우저(또는 http 비보안 연결)에서는 Web Crypto 를 쓸 수 없습니다. https 또는 localhost 로 여세요."))));
    $("#verify-btn").disabled = !canHash;
    $("#verify-btn").addEventListener("click", async () => {
      const tb = vt.querySelector("tbody");
      tb.innerHTML = "";
      const files = PV.sources.filter((s) => s.committed).map((s) => [s.file, s.sha256]).concat(PV.code.map((c) => [c.file, c.sha256]), [[PV.builder.file, PV.builder.sha256]]);
      for (const [f, exp] of files) {
        try { const got = await sha256(await fetchBuf(f)); tb.append(vrow(f, exp, got, got === exp)); }
        catch (e) { tb.append(vrow(f + " (" + e.message + ")", exp, null, null)); }
      }
      try {
        const src1i = new TextDecoder().decode(await fetchBuf("code/Paper5_Phase1i_cell.py"));
        const src1j = new TextDecoder().decode(await fetchBuf("code/Paper5_Phase1j_cell.py"));
        const rec = (src1j.match(/SRC_SHA\s*=\s*"([0-9a-f]{64})"/) || [])[1];
        const got = await sha256(pyRstrip(src1i));
        tb.append(vrow("1i 코드 rstrip SHA-256 ↔ 1j 셀의 SRC_SHA (1j 가 실행 전에 하는 확인과 같음)", rec, got, rec ? got === rec : null));
        const pre = pyConcat(src1j, "PREREG");
        const pg = pre ? (await sha256(pre)) : null;
        tb.append(vrow("1j 셀 코드에서 읽은 PREREG 문자열 → sha256[:12] ↔ 사이트 기록 sha12", PV.prereg["1j"].sha12, pg && pg.slice(0, 12), pg ? pg.slice(0, 12) === PV.prereg["1j"].sha12 : null));
        tb.append(vrow("PREREG 문자열 ↔ 사이트에 표시한 원문", PV.prereg["1j"].sha256, pg, pre ? pre === PV.prereg["1j"].text : null));
      } catch (e) { tb.append(vrow("1i/1j 코드 대조 (" + e.message + ")", null, null, null)); }
      tb.append(vrow("1f PREREG 원문", PV.prereg["1f"].sha256, null, null));
      toast("브라우저 검증을 마쳤습니다");
    });

    $("#file-in").addEventListener("change", async (e) => {
      const out = $("#file-out");
      out.innerHTML = "";
      if (!canHash) { out.append(h("p", { class: "pending" }, "Web Crypto 를 쓸 수 없는 환경입니다.")); return; }
      for (const f of e.target.files) {
        const buf = await f.arrayBuffer();
        const got = await sha256(buf);
        let hit = known.get(got);
        let extra = "";
        if (!hit && f.name === "Paper5_Phase1i_cell.py") {
          const rs = await sha256(pyRstrip(new TextDecoder().decode(buf)));
          if (rs === PV.verify_1i.recorded_in_1j) { hit = "Paper5_Phase1i_cell.py (rstrip 기준)"; extra = " · 끝 공백만 다름 — 1j 로더는 이 파일을 통과시킵니다"; }
        }
        out.append(h("div", { class: "callout " + (hit ? "" : "warn"), style: "font-size:13px;margin-bottom:8px" },
          h("div", {}, h("b", {}, f.name), ` · ${f.size} B`, h("div", { class: "mono", style: "font-size:11px;word-break:break-all" }, got),
            hit ? h("div", { style: "color:var(--green)" }, `기록된 파일과 일치: ${hit}${extra}`) : h("div", {}, "기록된 해시 목록에 없음 — 다른 버전이거나 다른 파일입니다."))));
      }
    });
    window.NX.reveal();
    if (location.hash) { const t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
  }).catch((e) => { console.error(e); $("#run").prepend(h("div", { class: "callout warn" }, "데이터를 불러오지 못했습니다: " + e.message)); });
})();
