/* NEXUS core — shell (nav/footer), data loading, Evidence Mode, search, theme, SVG chart helpers.
   No framework. Every research number on the page comes from data/*.json (built by build_data.py). */
(function () {
  "use strict";
  const root = document.body.dataset.root || "./";
  const page = document.body.dataset.page || "home";
  document.documentElement.classList.remove("no-js");

  // ---------------------------------------------------------------- utils
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v)) ? "—" : (Number.isInteger(v) && d !== "f" ? String(v) : Number(v).toFixed(d));
  const fmtCI = (s, d = 2) => (s && s.lo !== undefined && s.lo !== null) ? `[${Number(s.lo).toFixed(d)}, ${Number(s.hi).toFixed(d)}]` : "";
  const pct = (v, d = 1) => (v === null || v === undefined) ? "—" : (v * 100).toFixed(d) + "%";
  const date = (iso) => iso ? iso.slice(0, 10) : "—";

  const cache = {};
  function load(name) {
    if (!cache[name]) {
      cache[name] = fetch(root + "data/" + name, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(name + " " + r.status);
        return r.json();
      });
    }
    return cache[name];
  }

  // ---------------------------------------------------------------- icons
  const I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
    evidence: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.8-.3 2.8 1a9.6 9.6 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>',
  };
  const LOGO = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><defs><linearGradient id="nxg" x1="0" y1="0" x2="32" y2="32"><stop offset="0" stop-color="#59d6ff"/><stop offset=".55" stop-color="#9b6bff"/><stop offset="1" stop-color="#d466ff"/></linearGradient></defs><g stroke="url(#nxg)" stroke-width="1.3"><path d="M16 4v24M5.6 10l20.8 12M26.4 10 5.6 22"/><circle cx="16" cy="16" r="11.5" stroke-opacity=".35"/></g><g fill="url(#nxg)"><circle cx="16" cy="16" r="3.2"/><circle cx="16" cy="4" r="1.7"/><circle cx="16" cy="28" r="1.7"/><circle cx="5.6" cy="10" r="1.7"/><circle cx="26.4" cy="22" r="1.7"/><circle cx="26.4" cy="10" r="1.7"/><circle cx="5.6" cy="22" r="1.7"/></g></svg>';

  // ---------------------------------------------------------------- theme
  const THEME_KEY = "nexus-theme";
  function getTheme() {
    try { return localStorage.getItem(THEME_KEY) || "dark"; } catch (e) { return "dark"; }
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* storage blocked */ }
    const b = $("#theme-btn");
    if (b) { b.innerHTML = (t === "light" ? I.moon : I.sun) + `<span class="label-wide">${t === "light" ? "Dark" : "Light"}</span>`; b.setAttribute("aria-label", t === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"); }
    document.dispatchEvent(new CustomEvent("nexus:theme", { detail: t }));
  }
  document.documentElement.dataset.theme = getTheme();

  // ---------------------------------------------------------------- shell
  const NAV = [
    ["home", "", "Home"], ["h1", "h1/", "H1"], ["paper5", "paper5/", "Paper 5"],
    ["statistics", "statistics/", "Statistics"], ["reproduce", "reproduce/", "Reproduce"], ["log", "log/", "Log"],
  ];
  function renderShell() {
    const nav = $("#nav");
    if (nav) {
      nav.className = "nav";
      nav.innerHTML = `<div class="wrap">
        <a class="brand" href="${root}" aria-label="NEXUS 홈">${LOGO}<span>NEXUS</span></a>
        <nav class="nav-links" aria-label="주 메뉴">${NAV.map(([id, href, label]) => `<a href="${root}${href}"${id === page ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>
        <div class="nav-tools">
          <button class="icon-btn" id="evidence-btn" aria-pressed="false" title="Evidence Mode — 모든 수치의 출처 표시">${I.evidence}<span class="label-wide">Evidence</span></button>
          <button class="icon-btn" id="theme-btn"></button>
          <button class="icon-btn" id="search-btn" aria-label="검색 (Ctrl+K)">${I.search}<kbd class="label-wide">Ctrl K</kbd></button>
          <button class="icon-btn menu-btn" id="menu-btn" aria-label="메뉴 열기" aria-expanded="false">${I.menu}</button>
        </div></div>`;
      $("#menu-btn").addEventListener("click", (e) => {
        const open = nav.classList.toggle("open");
        e.currentTarget.setAttribute("aria-expanded", open);
      });
      $("#theme-btn").addEventListener("click", () => setTheme(getTheme() === "light" ? "dark" : "light"));
      $("#search-btn").addEventListener("click", openSearch);
      $("#evidence-btn").addEventListener("click", toggleEvidence);
      setTheme(getTheme());
    }
    const foot = $("#footer");
    if (foot) {
      foot.className = "footer";
      foot.innerHTML = `<div class="wrap">
        <a class="brand" href="${root}" style="font-size:13px">${LOGO}<span>NEXUS</span></a>
        <span>AI Research Portfolio · 비상업 개인 연구 기록</span>
        <nav aria-label="하단 메뉴">${NAV.map(([, href, label]) => `<a href="${root}${href}">${label}</a>`).join("")}</nav>
        <span class="r" id="build-stamp">data build —</span></div>`;
      load("research.json").then((r) => { $("#build-stamp").textContent = `data build ${r.built.replace("T", " ").replace("Z", " UTC")} · stats ${r.counts.stats}`; }).catch(() => {});
    }
    document.body.append(
      h("div", { class: "scrim", id: "scrim" }),
      h("aside", { class: "drawer", id: "drawer", role: "dialog", "aria-modal": "true", "aria-labelledby": "ev-title", tabindex: "-1" }),
      h("div", { class: "search-modal", id: "search", role: "dialog", "aria-modal": "true", "aria-label": "NEXUS 검색" }),
      h("div", { class: "tooltip", id: "tooltip", role: "tooltip" }),
      h("div", { class: "toast", id: "toast", role: "status", "aria-live": "polite" })
    );
    $("#scrim").addEventListener("click", closeDrawer);
  }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("on"), 1800);
  }
  async function copy(text, msg = "복사했습니다") {
    try { await navigator.clipboard.writeText(text); toast(msg); }
    catch (e) {
      const ta = h("textarea", { style: "position:fixed;opacity:0" }, text);
      document.body.append(ta); ta.select();
      try { document.execCommand("copy"); toast(msg); } catch (e2) { toast("복사 실패 — 직접 선택해 주세요"); }
      ta.remove();
    }
  }

  // ---------------------------------------------------------------- status badge
  function badge(status) {
    if (!status) return h("span", { class: "badge pending" }, "DATA PENDING");
    return h("span", { class: "badge " + (status.code || "pending"), title: status.why || "" }, status.label || status.code);
  }

  // ---------------------------------------------------------------- stat element (Evidence Mode target)
  function stat(ref, opts = {}) {
    const d = opts.d ?? 3;
    if (!ref || ref.v === null || ref.v === undefined) {
      return h("span", { class: "pending", title: "원자료에 값이 없음" }, opts.pendingText || "DATA PENDING");
    }
    const txt = opts.pct ? pct(ref.v, opts.pctd ?? 1) : (opts.int ? String(Math.round(ref.v)) : fmt(ref.v, d));
    const el = h("span", {
      class: "num" + (opts.class ? " " + opts.class : ""), tabindex: "0", role: "button",
      "aria-label": `${opts.label || ref.id} ${txt} — 출처 보기`,
      dataset: { stat: ref.id, v: ref.v, lo: ref.lo ?? "", hi: ref.hi ?? "", n: ref.n ?? "" },
    }, txt);
    if (opts.ci && ref.lo !== undefined && ref.lo !== null) {
      return h("span", { class: "stat-wrap" }, el, " ", h("span", { class: "ci" }, fmtCI(ref, opts.cid ?? 2)));
    }
    return el;
  }

  // ---------------------------------------------------------------- Evidence drawer
  let lastFocus = null;
  async function openEvidence(id, el) {
    lastFocus = el || document.activeElement;
    const dr = $("#drawer");
    const v = el ? el.dataset.v : "";
    const lo = el ? el.dataset.lo : "";
    const hi = el ? el.dataset.hi : "";
    dr.innerHTML = `<header><div><div class="kicker">Evidence</div><h3 id="ev-title" style="font-size:15px;margin-top:4px">출처 추적</h3></div>
      <button class="icon-btn" id="ev-close" aria-label="닫기">${I.close}</button></header>
      <div class="body"><div class="ev-val">${esc(v !== "" ? (Number.isInteger(+v) ? v : (+v).toFixed(3)) : "—")}</div>
      <div class="ev-ci">${lo !== "" ? `95% CI [${(+lo).toFixed(3)}, ${(+hi).toFixed(3)}]` : "CI 없음"}</div>
      <dl class="prov-grid" style="padding:0" id="ev-dl"><dt>Stat ID</dt><dd class="mono">${esc(id)}</dd><dt>출처</dt><dd class="faint">불러오는 중…</dd></dl>
      <div class="ev-actions"></div></div>`;
    $("#ev-close").addEventListener("click", closeDrawer);
    dr.classList.add("on"); $("#scrim").classList.add("on");
    dr.focus();
    try {
      const [stats, prov] = await Promise.all([load("statistics.json"), load("provenance.json")]);
      const s = stats.items.find((x) => x.id === id);
      if (!s) throw new Error("not found");
      const file = prov.sources.find((f) => f.file.endsWith("/" + s.src.split(" + ")[0]));
      const dl = $("#ev-dl");
      dl.innerHTML = `
        <dt>항목</dt><dd>${esc(s.label)}</dd>
        <dt>Stat ID</dt><dd class="mono">${esc(s.id)}</dd>
        <dt>Source</dt><dd class="mono">${esc(s.src)}</dd>
        ${s.path ? `<dt>Field (JSON path)</dt><dd class="mono">${esc(s.path)}</dd>` : ""}
        ${s.method ? `<dt>계산 방법</dt><dd>${esc(s.method)}</dd>` : ""}
        <dt>지표</dt><dd>${esc(s.metric)}${s.n ? ` · n = ${s.n}` : ""}</dd>
        <dt>프로젝트 / 단계</dt><dd>${esc(s.proj)} · ${esc(s.phase)}</dd>
        ${file ? `<dt>Source SHA-256</dt><dd class="mono">${esc(file.sha256)}</dd><dt>저장소 포함</dt><dd>${file.committed ? "예 — " + esc(file.file) : "아니오 (로컬 전용) — " + esc(file.note || "")}</dd>` : ""}
        <dt>생성</dt><dd>build_data.py 가 원자료에서 추출 · 손으로 옮긴 값 아님</dd>`;
      const act = $(".ev-actions", dr);
      act.append(
        h("button", { class: "btn sm", onclick: () => copy(`${s.label}: ${s.v}${s.lo != null ? ` (95% CI ${s.lo}–${s.hi})` : ""} — source ${s.src}${s.path ? " · " + s.path : ""}`, "수치와 출처를 복사했습니다"), html: I.copy + "수치+출처 복사" }),
        h("a", { class: "btn sm ghost", href: root + "statistics/?q=" + encodeURIComponent(s.id), html: I.arrow + "통계표에서 보기" }),
        file && file.committed ? h("a", { class: "btn sm ghost", href: root + file.file, download: "", html: I.download + "원자료" }) : null
      );
    } catch (e) {
      $("#ev-dl").innerHTML += `<dt>오류</dt><dd>출처 정보를 불러오지 못했습니다 (${esc(e.message)}). 로컬에서 file:// 로 열면 fetch 가 막힙니다 — python3 -m http.server 로 여세요.</dd>`;
    }
  }
  function closeDrawer() {
    $("#drawer").classList.remove("on"); $("#scrim").classList.remove("on");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function toggleEvidence() {
    const on = document.body.classList.toggle("evidence-on");
    $("#evidence-btn").setAttribute("aria-pressed", on);
    toast(on ? "Evidence Mode — 표시된 수치를 누르면 출처가 열립니다" : "Evidence Mode 끔");
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-stat]");
    if (el) { e.preventDefault(); openEvidence(el.dataset.stat, el); }
  });
  document.addEventListener("keydown", (e) => {
    const el = e.target.closest && e.target.closest("[data-stat]");
    if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openEvidence(el.dataset.stat, el); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
    if (e.key === "Escape") { closeDrawer(); closeSearch(); }
    if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
  });

  // ---------------------------------------------------------------- search
  let INDEX = null;
  const SECTIONS = [
    ["page", "Home", "", "NEXUS 홈 · 연구 지도 · 타임라인"],
    ["page", "H1 · 다수결 역효과", "h1/", "majority vote backfire MATH-500 GSM8K Qwen self-consistency"],
    ["section", "H1 · 4조건 결과표", "h1/#results", "backfire accuracy CI verdict refuted"],
    ["section", "H1 · Backfire vs 산술 하한", "h1/#floor", "arithmetic floor lower bound pigeonhole"],
    ["section", "H1 · 정확도 구간별 backfire", "h1/#interval", "accuracy bin interval"],
    ["section", "H1 · 설계 변경 기록", "h1/#history", "revision v1 v2 level 5 level 3-4 1024 tokens"],
    ["section", "H1 · 한계", "h1/#limits", "limitations"],
    ["page", "Paper 5 · 내부 신호 모니터링", "paper5/", "maxQ monitoring agent reinforcement learning key layout"],
    ["section", "Paper 5 · 신호 탐색 (1c)", "paper5/#phase-1c", "signal scan S1a maxq qmargin prederr ensdisagree latentrep actcycle revisit"],
    ["section", "Paper 5 · 재방문 동어반복", "paper5/#tautology", "revisit tautology loop control determinism key_after_rev"],
    ["section", "Paper 5 · 교란 통제 (1d)", "paper5/#phase-1d", "confound perturbation layout distance stratified"],
    ["section", "Paper 5 · 재현 0.82 (1f)", "paper5/#phase-1f", "reproduction PREREG confirm 재현"],
    ["section", "Paper 5 · 자기 반증 (1i)", "paper5/#phase-1i", "self-falsification decomposition kscore resk kxd k training setting"],
    ["section", "Paper 5 · 1i / 1j 비교", "paper5/#phase-1j", "1j prereg not run 실행 전"],
    ["section", "Paper 5 · 체크리스트", "paper5/#checklist", "checklist self check brute repro"],
    ["page", "Statistics · 전체 통계표", "statistics/", "CI AUROC filter sort source json"],
    ["page", "Reproduce · 재현 정보", "reproduce/", "SHA-256 PREREG hash code build_data"],
    ["page", "Log · 연구 일지", "log/", "journal decisions failures revisions"],
  ];
  async function buildIndex() {
    const items = SECTIONS.map(([k, t, href, s]) => ({ k, t, href: root + href, s }));
    try {
      const [tl, graph] = await Promise.all([load("timeline.json"), load("graph.json")]);
      tl.events.forEach((e) => items.push({ k: "log", t: e.title, href: root + "log/#" + e.id, s: date(e.date) + " · " + e.detail }));
      graph.nodes.forEach((n) => items.push({ k: "concept", t: n.label, href: root + (n.link || ""), s: n.desc }));
    } catch (e) { /* offline */ }
    return items;
  }
  async function statItems() {
    try {
      const s = await load("statistics.json");
      return s.items.filter((x) => x.core || x.proj === "h1").map((x) => ({ k: "stat", t: `${x.label} = ${fmt(x.v)}`, href: root + "statistics/?q=" + encodeURIComponent(x.id), s: `${x.src}${x.path ? " · " + x.path : ""}` }));
    } catch (e) { return []; }
  }
  let selIdx = 0;
  async function openSearch() {
    const m = $("#search");
    if (!m.innerHTML) {
      m.innerHTML = `<div class="search-box"><div class="in">${I.search}<input id="sq" type="search" placeholder="Search NEXUS — backfire, AUROC, PREREG, 1i…" aria-label="검색어" autocomplete="off"/><kbd class="faint mono" style="font-size:11px">Esc</kbd></div>
        <ul class="search-results" id="sr" role="listbox"></ul><div class="search-foot"><span>↑↓ 이동</span><span>Enter 열기</span><span>통계 수치도 검색됩니다</span></div></div>`;
      m.addEventListener("click", (e) => { if (e.target === m) closeSearch(); });
      $("#sq").addEventListener("input", runSearch);
      $("#sq").addEventListener("keydown", (e) => {
        const links = $$("#sr a");
        if (e.key === "ArrowDown") { e.preventDefault(); selIdx = Math.min(selIdx + 1, links.length - 1); mark(links); }
        if (e.key === "ArrowUp") { e.preventDefault(); selIdx = Math.max(selIdx - 1, 0); mark(links); }
        if (e.key === "Enter" && links[selIdx]) { links[selIdx].click(); }
      });
    }
    m.classList.add("on");
    $("#sq").value = "";
    $("#sq").focus();
    if (!INDEX) {
      $("#sr").innerHTML = `<li class="search-empty">색인 불러오는 중…</li>`;
      INDEX = await buildIndex();
      statItems().then((s) => { INDEX = INDEX.concat(s); runSearch(); });
    }
    runSearch();
  }
  function mark(links) { links.forEach((a, i) => a.setAttribute("aria-selected", i === selIdx)); if (links[selIdx]) links[selIdx].scrollIntoView({ block: "nearest" }); }
  function runSearch() {
    const q = ($("#sq").value || "").trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    let res = (INDEX || []).filter((it) => {
      const hay = (it.t + " " + it.s + " " + it.k).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    if (!q) res = res.filter((r) => r.k === "page" || r.k === "section").slice(0, 12);
    res = res.slice(0, 40);
    selIdx = 0;
    $("#sr").innerHTML = res.length ? res.map((r, i) => `<li><a href="${r.href}" role="option" aria-selected="${i === 0}"><span class="k">${esc(r.k)}</span><span class="x">${esc(r.t)}<span class="s">${esc(r.s).slice(0, 140)}</span></span></a></li>`).join("") : `<li class="search-empty">결과 없음</li>`;
    $$("#sr a").forEach((a) => a.addEventListener("click", closeSearch));
  }
  function closeSearch() { const m = $("#search"); if (m) m.classList.remove("on"); }

  // ---------------------------------------------------------------- reveal on scroll
  let revIO = null;
  const seen = new WeakSet();
  function reveal() {
    const els = $$(".reveal").filter((e) => !seen.has(e));
    els.forEach((e) => seen.add(e));
    if (reduced || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    if (!revIO) revIO = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); revIO.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => revIO.observe(e));
  }

  // ---------------------------------------------------------------- subnav active
  function subnav() {
    const links = $$(".subnav a");
    if (!links.length) return;
    const secs = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (en.isIntersecting) {
          links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id));
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    secs.forEach((s) => io.observe(s));
  }

  // ---------------------------------------------------------------- tooltip
  function tip(html, x, y) {
    const t = $("#tooltip");
    if (!html) { t.classList.remove("on"); return; }
    t.innerHTML = html;
    t.classList.add("on");
    const w = t.offsetWidth, hh = t.offsetHeight;
    t.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px";
    t.style.top = Math.max(8, y - hh - 10) + "px";
  }

  // ---------------------------------------------------------------- SVG charts
  const SVGNS = "http://www.w3.org/2000/svg";
  const s = (tag, attrs = {}, ...kids) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
    kids.flat().forEach((k) => k && el.append(k instanceof Node ? k : document.createTextNode(k)));
    return el;
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /** Forest plot: rows [{label, ref, color?, sub?}] value + CI vs reference line. */
  function forest(container, rows, o = {}) {
    container.innerHTML = "";
    const W = o.width || 560, rowH = o.rowH || 30, labW = o.labW ?? 170, top = 24, bottom = 26;
    const H = top + bottom + rows.length * rowH;
    const min = o.min ?? 0, max = o.max ?? 1, ref = o.ref ?? 0.5;
    const x = (v) => labW + (W - labW - 16) * (v - min) / (max - min);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "forest plot" });
    const g = s("g", { class: "grid" });
    const ticks = o.ticks || [0, .25, .5, .75, 1];
    ticks.forEach((t) => { g.append(s("line", { x1: x(t), x2: x(t), y1: top - 6, y2: H - bottom })); svg.append(s("text", { x: x(t), y: H - 8, "text-anchor": "middle" }, String(t))); });
    svg.append(g);
    if (ref !== null) {
      svg.append(s("line", { class: "ref", x1: x(ref), x2: x(ref), y1: top - 10, y2: H - bottom }));
      svg.append(s("text", { x: x(ref) + 4, y: top - 12 }, o.refLabel || `기준 ${ref}`));
    }
    rows.forEach((r, i) => {
      const y = top + i * rowH + rowH / 2;
      const col = r.color || css("--blue");
      svg.append(s("text", { x: labW - 10, y: y + 4, "text-anchor": "end", style: `fill:${r.dim ? css("--text-3") : css("--text-2")};font-size:11.5px` }, r.label));
      if (!r.ref || r.ref.v === null || r.ref.v === undefined) {
        svg.append(s("text", { x: x(min) + 6, y: y + 4, style: `fill:${css("--amber")};font-size:10.5px` }, "DATA PENDING"));
        return;
      }
      const grp = s("g", { tabindex: "0", role: "button", "data-stat": r.ref.id, "data-v": r.ref.v, "data-lo": r.ref.lo ?? "", "data-hi": r.ref.hi ?? "", "aria-label": `${r.label} ${fmt(r.ref.v)} — 출처 보기`, style: "cursor:pointer" });
      grp.append(s("rect", { x: labW - 4, y: y - rowH / 2 + 2, width: W - labW, height: rowH - 4, fill: "transparent" }));
      if (r.ref.lo !== null && r.ref.lo !== undefined) {
        grp.append(s("line", { x1: x(Math.max(min, r.ref.lo)), x2: x(Math.min(max, r.ref.hi)), y1: y, y2: y, stroke: col, "stroke-width": 2, "stroke-linecap": "round", opacity: .75 }));
        [r.ref.lo, r.ref.hi].forEach((e) => grp.append(s("line", { x1: x(Math.max(min, Math.min(max, e))), x2: x(Math.max(min, Math.min(max, e))), y1: y - 5, y2: y + 5, stroke: col, "stroke-width": 1.5 })));
      }
      grp.append(s("circle", { cx: x(Math.max(min, Math.min(max, r.ref.v))), cy: y, r: 5, fill: col, style: `filter:drop-shadow(0 0 6px ${col})` }));
      grp.append(s("text", { x: W - 4, y: y - 8, "text-anchor": "end", style: `font-size:10.5px;fill:${css("--text-2")}` }, fmt(r.ref.v)));
      grp.addEventListener("mousemove", (e) => tip(`<b>${esc(r.label)}</b><br>${fmt(r.ref.v)} ${r.ref.lo != null ? `<span class="ci">${fmtCI(r.ref, 3)}</span>` : ""}${r.sub ? `<br><span class="faint">${esc(r.sub)}</span>` : ""}<br><span class="faint">클릭: 출처 보기</span>`, e.clientX, e.clientY));
      grp.addEventListener("mouseleave", () => tip(null));
      svg.append(grp);
    });
    container.append(svg);
    if (o.desc) container.append(h("p", { class: "chart-desc" }, o.desc));
    return svg;
  }

  /** Bar chart with optional reference lines: bars [{label, ref, color}] lines [{v, label, cls}] */
  function bars(container, data, o = {}) {
    container.innerHTML = "";
    const W = o.width || 560, H = o.height || 260, L = 40, R = 12, T = 18, B = 46;
    const max = o.max ?? 1;
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const bw = (W - L - R) / data.length;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": o.aria || "bar chart" });
    const g = s("g", { class: "grid" });
    [0, .25, .5, .75, 1].filter((t) => t <= max).forEach((t) => { g.append(s("line", { x1: L, x2: W - R, y1: y(t), y2: y(t) })); svg.append(s("text", { x: L - 6, y: y(t) + 4, "text-anchor": "end" }, String(t))); });
    svg.append(g);
    data.forEach((d, i) => {
      const x0 = L + i * bw + bw * 0.18, w = bw * 0.64;
      const col = d.color || css("--blue");
      if (d.ref && d.ref.v !== null && d.ref.v !== undefined) {
        const grp = s("g", { tabindex: "0", role: "button", "data-stat": d.ref.id, "data-v": d.ref.v, "data-lo": d.ref.lo ?? "", "data-hi": d.ref.hi ?? "", "aria-label": `${d.label} ${fmt(d.ref.v)} — 출처 보기`, style: "cursor:pointer" });
        const yy = y(d.ref.v);
        const gid = "gb" + Math.random().toString(36).slice(2, 8);
        const grad = s("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, s("stop", { offset: 0, "stop-color": col, "stop-opacity": .95 }), s("stop", { offset: 1, "stop-color": col, "stop-opacity": .25 }));
        svg.append(s("defs", {}, grad));
        grp.append(s("rect", { x: x0, y: Math.min(yy, y(0) - 1), width: w, height: Math.max(1, y(0) - yy), rx: 3, fill: `url(#${gid})`, stroke: col, "stroke-opacity": .6 }));
        grp.append(s("text", { x: x0 + w / 2, y: yy - 6, "text-anchor": "middle", style: `fill:${css("--text")};font-size:11px` }, o.pct ? pct(d.ref.v, 0) : fmt(d.ref.v, 2)));
        grp.addEventListener("mousemove", (e) => tip(`<b>${esc(d.label)}</b><br>${fmt(d.ref.v)}${d.ref.n ? ` · n=${d.ref.n}` : ""}<br><span class="faint">클릭: 출처 보기</span>`, e.clientX, e.clientY));
        grp.addEventListener("mouseleave", () => tip(null));
        svg.append(grp);
      }
      const lab = String(d.label).split("\n");
      lab.forEach((ln, j) => svg.append(s("text", { x: x0 + w / 2, y: H - B + 16 + j * 13, "text-anchor": "middle" }, ln)));
    });
    (o.lines || []).forEach((ln) => {
      if (ln.v === null || ln.v === undefined) return;
      svg.append(s("line", { class: ln.cls || "ref", x1: L, x2: W - R, y1: y(ln.v), y2: y(ln.v), ...(ln.color ? { stroke: ln.color, "stroke-dasharray": ln.dash || "5 4" } : {}) }));
      svg.append(s("text", { x: W - R, y: y(ln.v) - 5, "text-anchor": "end", style: `font-size:10.5px;fill:${ln.color || css("--text-3")}` }, ln.label));
    });
    container.append(svg);
    if (o.desc) container.append(h("p", { class: "chart-desc" }, o.desc));
  }

  // ---------------------------------------------------------------- provenance panel
  function provPanel(rows, title = "Data Provenance") {
    const d = h("details", { class: "prov" });
    d.append(h("summary", {}, h("span", { html: I.evidence, style: "width:16px;height:16px;display:inline-flex" }), title));
    const dl = h("dl", { class: "prov-grid" });
    rows.forEach(([k, v, mono]) => { dl.append(h("dt", {}, k)); dl.append(h("dd", { class: mono ? "mono" : "" }, v instanceof Node ? v : String(v ?? "—"))); });
    d.append(dl);
    return d;
  }

  // ---------------------------------------------------------------- init
  renderShell();
  let booted = false;
  function boot() { if (booted) return; booted = true; reveal(); subnav(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

  window.NX = { reveal, subnav, $, $$, h, esc, fmt, fmtCI, pct, date, load, badge, stat, forest, bars, provPanel, copy, toast, tip, I, LOGO, root, page, reduced, css, svg: s, openEvidence };
})();
