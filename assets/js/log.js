/* NEXUS · Log — date-grouped journal from data/timeline.json. Anchors = event ids (log/#ev17). */
(function () {
  "use strict";
  const { $, $$, h, date, load, root } = window.NX;
  const TYPE_KO = window.NXC.TYPE_KO;
  const TYPES = ["question", "experiment", "analysis", "unexpected", "revision", "falsification", "next"];
  const PROJ = { h1: "H1", paper5: "Paper 5" };

  load("timeline.json").then((TL) => {
    const EV = TL.events.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const st = { proj: "", types: new Set(TYPES) };

    const cell = (lab, val) => h("div", {}, h("div", { class: "lab" }, lab), h("div", { class: "val" }, val));
    $("#log-meta").append(
      cell("기록", `${EV.length}건`),
      cell("기간", `${date(EV[0].date)} → ${date(EV[EV.length - 1].date)}`),
      cell("H1 / Paper 5", `${EV.filter((e) => e.project === "h1").length} / ${EV.filter((e) => e.project === "paper5").length}`),
      cell("반증", `${EV.filter((e) => e.type === "falsification").length}건`),
      cell("다음 질문 (실행 전 포함)", `${EV.filter((e) => e.type === "next").length}건`),
    );

    // type chips
    const chips = $("#f-type");
    TYPES.filter((t) => EV.some((e) => e.type === t)).forEach((t) => chips.append(h("button", { class: "chip", type: "button", "aria-pressed": "true", dataset: { t, type: t }, onclick: (ev) => {
      const b = ev.currentTarget;
      if (st.types.has(t)) st.types.delete(t); else st.types.add(t);
      b.setAttribute("aria-pressed", st.types.has(t));
      render();
    } }, TYPE_KO[t] || t)));
    $$("#f-proj button").forEach((b) => b.addEventListener("click", () => {
      st.proj = b.dataset.v;
      $$("#f-proj button").forEach((x) => { x.setAttribute("aria-pressed", x === b); x.setAttribute("aria-checked", x === b); });
      render();
    }));

    function item(e) {
      const li = h("li", { id: e.id, dataset: { type: e.type }, tabindex: "-1" });
      const det = h("div", { class: "det" },
        h("p", { style: "margin:0 0 6px" }, e.detail),
        h("div", { class: "mono faint", style: "font-size:11.5px;word-break:break-all" }, "source: ", e.src),
        h("div", { style: "display:flex;gap:12px;margin-top:6px;flex-wrap:wrap" },
          h("a", { class: "link-arrow", href: root + e.link }, "관련 내용 →"),
          h("a", { class: "link-arrow", href: "#" + e.id, onclick: () => { history.replaceState(null, "", "#" + e.id); } }, "이 항목 링크 #" + e.id)));
      const btn = h("button", { class: "t", type: "button", "aria-expanded": "false", "aria-controls": e.id + "-d" }, e.title);
      det.id = e.id + "-d";
      btn.addEventListener("click", () => { const o = li.classList.toggle("open"); btn.setAttribute("aria-expanded", o); });
      li.append(h("div", { class: "d" }, date(e.date), " ", (e.date.length > 10 ? e.date.slice(11, 16) + " UTC" : ""), h("span", { class: "typ" }, `${PROJ[e.project] || e.project} · ${TYPE_KO[e.type] || e.type}`)), btn, det);
      return li;
    }

    function render() {
      const box = $("#log-days");
      box.innerHTML = "";
      const list = EV.filter((e) => (!st.proj || e.project === st.proj) && st.types.has(e.type));
      if (!list.length) { box.append(h("p", { class: "faint" }, "조건에 맞는 기록이 없습니다.")); return; }
      const days = new Map();
      list.forEach((e) => { const d = date(e.date); if (!days.has(d)) days.set(d, []); days.get(d).push(e); });
      days.forEach((evs, d) => {
        const wd = new Date(d + "T00:00:00Z").toLocaleDateString("ko-KR", { weekday: "short", timeZone: "UTC" });
        box.append(h("section", { class: "log-day", "aria-label": d },
          h("h2", { class: "log-date" }, d, h("span", { class: "faint" }, ` (${wd})`)),
          h("ol", { class: "tl" }, evs.map(item))));
      });
    }
    render();

    // side: type summary + turning points
    const ts = $("#type-summary");
    TYPES.forEach((t) => { const n = EV.filter((e) => e.type === t).length; if (n) ts.append(h("div", { class: "type-row", dataset: { type: t } }, h("span", {}, TYPE_KO[t] || t), h("span", { class: "bar", style: `--w:${(n / EV.length) * 100}%` }), h("span", { class: "mono" }, String(n)))); });
    const tp = $("#turning");
    EV.filter((e) => ["unexpected", "revision", "falsification", "next"].includes(e.type)).forEach((e) => tp.append(h("li", { dataset: { type: e.type } },
      h("div", { class: "d" }, date(e.date), h("span", { class: "typ" }, TYPE_KO[e.type])), h("a", { class: "t", href: "#" + e.id, style: "display:block;color:inherit" }, e.title))));

    $("#expand-all").addEventListener("click", () => $$("#log-days li").forEach((li) => { li.classList.add("open"); li.querySelector("button.t").setAttribute("aria-expanded", "true"); }));
    $("#collapse-all").addEventListener("click", () => $$("#log-days li").forEach((li) => { li.classList.remove("open"); li.querySelector("button.t").setAttribute("aria-expanded", "false"); }));

    function openHash() {
      const id = location.hash.slice(1);
      if (!id) return;
      let li = document.getElementById(id);
      if (!li && EV.some((e) => e.id === id)) { st.proj = ""; st.types = new Set(TYPES); $$("#f-type .chip").forEach((c) => c.setAttribute("aria-pressed", "true")); render(); li = document.getElementById(id); }
      if (li && li.matches("#log-days li")) { li.classList.add("open"); li.querySelector("button.t").setAttribute("aria-expanded", "true"); li.scrollIntoView({ block: "center" }); li.focus({ preventScroll: true }); }
    }
    window.addEventListener("hashchange", openHash);
    openHash();
    window.NX.reveal();
  }).catch((e) => { console.error(e); $("#journal").prepend(h("div", { class: "callout warn" }, "데이터를 불러오지 못했습니다: " + e.message)); });
})();
