"""NEXUS build checks.  Run:  python3 -m unittest discover -s tests -v   (from nexus/)

1. build_data.py 의 H1 계산 == 원본 셀(code/H1_STEP4_cell.py)의 _enrich/_bf/_lb/_gap/_boot 결과
2. build_data.py --check (커밋된 data/ 가 원자료에서 다시 만든 결과와 같은가)
3. 1i 코드 무결성 (1j 셀의 SRC_SHA), 1j PREREG 해시, provenance 의 크기·해시
4. 페이지 JSON 의 모든 stat ref 가 statistics.json 과 같은 값인가
5. HTML 에 근거 없는 연구 수치가 박혀 있지 않은가, 내부 링크·앵커가 살아 있는가
6. 저장소에 올라갈 파일에 키·토큰·이메일·원자료 jsonl 이 없는가
"""
import ast
import hashlib
import json
import math
import random
import re
import subprocess
import sys
import unittest
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import build_data as BD  # noqa: E402

DATA = ROOT / "data"
RAW = ROOT / "data_raw"
CODE = ROOT / "code"


def jload(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def original_h1_namespace():
    """Pull REQ/_load/_enrich/_bf/_lb/_gap/_boot out of the original Colab cell without running it."""
    src = (CODE / "H1_STEP4_cell.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    want = {"REQ", "_load", "_enrich", "_bf", "_lb", "_gap", "_boot"}
    keep = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in want:
            keep.append(node)
        elif isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in want for t in node.targets):
            keep.append(node)
    mod = ast.Module(body=keep, type_ignores=[])
    ns = {"json": json, "math": math, "random": random, "Counter": Counter}
    exec(compile(mod, "H1_STEP4_cell.py[extract]", "exec"), ns)
    missing = want - set(ns)
    assert not missing, f"원본 셀에서 찾지 못함: {missing}"
    return ns


def synth_record(row):
    """Rebuild a record that the original _enrich reads identically (it only uses counts)."""
    n, c, nw, mw = row["n"], row["c"], row["nw"], row["mw"]
    answers, flags = [], []
    answers += ["CORRECT"] * c
    flags += [True] * c
    if mw:
        first = nw - (mw - 1)
        for k in range(mw):
            cnt = first if k == 0 else 1
            answers += [f"W{k}"] * cnt
            flags += [False] * cnt
    rest = n - c - nw
    answers += [None] * rest
    flags += [False] * rest
    return {"problem_id": row["id"], "answers": answers, "correct_flags": flags, "maj_correct": row["maj"],
            "n_cap": row.get("cap", 0), "n_valid": row.get("valid", n)}


class TestH1MatchesOriginal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.O = original_h1_namespace()
        cls.rows_doc = jload(RAW / "h1_problem_rows.json")
        cls.h1 = jload(DATA / "h1.json")

    def conditions(self):
        conds = self.rows_doc["conditions"] if "conditions" in self.rows_doc else self.rows_doc
        out = {}
        for k, v in conds.items():
            if k.startswith("_"):
                continue
            out[k.replace("h1v2_", "").replace(".jsonl", "")] = v["rows"] if isinstance(v, dict) and "rows" in v else v
        self.assertEqual(len(out), 4, "H1 조건은 4개여야 함")
        return out

    def test_enrich_and_stats_equal_original(self):
        O = self.O
        by_key = {c["key"]: c for c in self.h1["conditions"]}
        for key, rows in self.conditions().items():
            with self.subTest(cond=key):
                ours = [BD.enrich(r) for r in rows]
                theirs = [O["_enrich"](synth_record(r)) for r in rows]
                self.assertEqual(ours, theirs)
                nd = [x for x in theirs if not x["deg"]]
                self.assertTrue(nd)
                self.assertEqual(BD.bf(nd), O["_bf"](nd))
                self.assertEqual(BD.lb(nd), O["_lb"](nd))
                self.assertEqual(BD.boot(BD.bf, nd), O["_boot"](O["_bf"], nd))
                self.assertEqual(BD.boot(BD.gap, nd), O["_boot"](O["_gap"], nd))
                c = by_key[key]
                lo, hi = O["_boot"](O["_bf"], nd)
                self.assertAlmostEqual(c["backfire"]["v"], O["_bf"](nd), places=6)
                self.assertEqual((c["backfire"]["lo"], c["backfire"]["hi"]), (lo, hi))
                self.assertAlmostEqual(c["floor"]["v"], O["_lb"](nd), places=6)
                expect = "H1 REFUTED" if hi < 0.5 else ("H1 SUPPORTED" if lo > 0.5 else "INCONCLUSIVE")
                self.assertTrue(c["verdict_en"].startswith(expect) or c["verdict_en"] == expect, c["verdict_en"])

    def test_jsonl_rows_match_committed_rows(self):
        jsonls = sorted(RAW.glob("h1v2_*.jsonl"))
        if not jsonls:
            self.skipTest("h1v2_*.jsonl 이 로컬에 없음 (저장소에 올리지 않는 파일) — 커밋된 집계로만 검사")
        conds = self.conditions()
        for p in jsonls:
            key = p.name.replace("h1v2_", "").replace(".jsonl", "")
            with self.subTest(file=p.name):
                rows, bad = BD.h1_rows_from_jsonl(p)
                self.assertEqual(rows, conds[key])
                recs, bad_o = self.O["_load"](str(p))
                self.assertEqual(bad, bad_o)
                self.assertEqual([BD.enrich(r) for r in rows], [self.O["_enrich"](r) for r in recs])

    def test_all_conditions_refuted(self):
        self.assertTrue(all(c["verdict_en"] == "H1 REFUTED" for c in self.h1["conditions"]))
        self.assertEqual(self.h1["project_status"]["code"], "falsified")


class TestBuildCheck(unittest.TestCase):
    def test_build_check_passes(self):
        r = subprocess.run([sys.executable, str(ROOT / "build_data.py"), "--check"], capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("CHECK OK", r.stdout)


class TestIntegrity(unittest.TestCase):
    def test_1i_code_hash_matches_1j_record(self):
        src1j = (CODE / "Paper5_Phase1j_cell.py").read_text(encoding="utf-8")
        rec = re.search(r'SRC_SHA\s*=\s*"([0-9a-f]{64})"', src1j).group(1)
        src1i = (CODE / "Paper5_Phase1i_cell.py").read_text(encoding="utf-8")
        self.assertEqual(hashlib.sha256(src1i.rstrip().encode()).hexdigest(), rec)
        self.assertTrue(jload(DATA / "provenance.json")["verify_1i"]["ok"])

    def test_1j_prereg_hash(self):
        tree = ast.parse((CODE / "Paper5_Phase1j_cell.py").read_text(encoding="utf-8"))
        node = next(n for n in tree.body if isinstance(n, ast.Assign) and any(getattr(t, "id", "") == "PREREG" for t in n.targets))
        prereg = ast.literal_eval(node.value)
        p = jload(DATA / "paper5.json")["phases"]["1j"]
        self.assertEqual(p["data"]["prereg"]["text"], prereg)
        self.assertEqual(p["data"]["prereg"]["sha12"], hashlib.sha256(prereg.encode()).hexdigest()[:12])
        self.assertEqual(p["status"]["code"], "not_run")
        self.assertIsNone(p["data"]["result"])
        self.assertFalse((RAW / "analysis_phase1j.json").exists())

    def test_provenance_sizes_and_hashes(self):
        pv = jload(DATA / "provenance.json")
        for s in pv["sources"] + pv["code"]:
            f = ROOT / s["file"]
            if not f.exists():
                self.assertFalse(s.get("committed", True), f"{s['file']} 없음")
                continue
            with self.subTest(file=s["file"]):
                self.assertEqual(f.stat().st_size, s["bytes"])
                self.assertEqual(BD.sha256_file(f), s["sha256"])
        for c in pv["code"]:
            self.assertTrue(c["size_match_drive"], c["file"])

    def test_user_check_numbers_1i(self):
        """사용자 확인 요청 수치: 1i det·d0·고리통제 total/kscore/resk = 0.820 / 0.788 / 0.597 (원본 JSON)."""
        raw = jload(RAW / "analysis_phase1i.json")
        b = raw["B"]["run_confirm_det|d0|lf"]

        def val(x):
            return x["auroc"] if isinstance(x, dict) and "auroc" in x else (x["v"] if isinstance(x, dict) else x)
        got = [round(val(b[k]), 3) for k in ("total", "kscore", "resk")]
        self.assertEqual(got, [0.820, 0.788, 0.597])


class TestRefsAndHtml(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.stats = {x["id"]: x for x in jload(DATA / "statistics.json")["items"]}

    def walk_refs(self, o, found):
        if isinstance(o, dict):
            if "id" in o and "v" in o and isinstance(o.get("id"), str) and set(o) <= {"id", "v", "lo", "hi", "n"}:
                found.append(o)
            for v in o.values():
                self.walk_refs(v, found)
        elif isinstance(o, list):
            for v in o:
                self.walk_refs(v, found)

    def test_refs_resolve_with_same_values(self):
        for name in ("h1.json", "paper5.json", "paper5_scan.json", "research.json"):
            refs = []
            self.walk_refs(jload(DATA / name), refs)
            self.assertTrue(refs, name)
            for r in refs:
                with self.subTest(file=name, id=r["id"]):
                    s = self.stats.get(r["id"])
                    if r["v"] is None:
                        continue
                    self.assertIsNotNone(s, "statistics.json 에 없음")
                    self.assertEqual(s["v"], r["v"])
                    self.assertEqual(s.get("lo"), r.get("lo"))
                    self.assertEqual(s.get("hi"), r.get("hi"))

    def html_files(self):
        return [ROOT / "index.html"] + sorted(ROOT.glob("*/index.html")) + ([ROOT / "404.html"] if (ROOT / "404.html").exists() else [])

    def test_no_unbacked_research_decimals_in_html(self):
        vals = [x["v"] for x in self.stats.values() if isinstance(x["v"], float)]
        thresholds = {"0.5", "0.50"}
        for f in self.html_files():
            txt = f.read_text(encoding="utf-8")
            txt = re.sub(r"<style.*?</style>|<script.*?</script>|style=\"[^\"]*\"|href=\"[^\"]*\"|<link[^>]*>", "", txt, flags=re.S)
            txt = re.sub(r"Qwen2\.5|\d+(\.\d+)?B\b|Python 3\.\d+", "", txt)
            for m in re.finditer(r"(?<![\w.])\d+\.\d{2,}(?![\w.])", txt):
                tok = m.group(0)
                if tok in thresholds:
                    continue
                d = len(tok.split(".")[1])
                with self.subTest(file=f.name, number=tok):
                    self.assertTrue(any(round(v, d) == float(tok) for v in vals), f"{f.relative_to(ROOT)}: {tok} 가 어떤 통계값과도 맞지 않음")

    def test_internal_links_and_anchors(self):
        class P(HTMLParser):
            def __init__(self):
                super().__init__()
                self.links, self.ids, self.srcs = [], set(), []

            def handle_starttag(self, tag, attrs):
                a = dict(attrs)
                if "id" in a:
                    self.ids.add(a["id"])
                if tag == "a" and a.get("href"):
                    self.links.append(a["href"])
                if tag in ("script", "img") and a.get("src"):
                    self.srcs.append(a["src"])
                if tag == "link" and a.get("href"):
                    self.srcs.append(a["href"])

        pages = {}
        for f in self.html_files():
            p = P()
            p.feed(f.read_text(encoding="utf-8"))
            pages[f] = p
        for f, p in pages.items():
            for href in p.links + p.srcs:
                if href.startswith(("http://", "https://", "mailto:", "javascript:")):
                    continue
                with self.subTest(page=str(f.relative_to(ROOT)), href=href):
                    path, _, frag = href.partition("#")
                    path = path.split("?")[0]
                    target = (f.parent / path).resolve() if path else f
                    if target.is_dir():
                        target = target / "index.html"
                    self.assertTrue(target.exists(), f"없는 파일: {href}")
                    if frag and target in pages:
                        self.assertIn(frag, pages[target].ids, f"없는 앵커: {href}")
        # links stored in data (timeline / graph / research)
        page_of = {"": ROOT / "index.html"}
        for f in pages:
            if f.parent != ROOT:
                page_of[f.parent.name + "/"] = f
        datalinks = [e["link"] for e in jload(DATA / "timeline.json")["events"]]
        datalinks += [n["link"] for n in jload(DATA / "graph.json")["nodes"] if n.get("link")]
        datalinks += [p["link"] for p in jload(DATA / "research.json")["projects"]]
        for link in datalinks:
            with self.subTest(datalink=link):
                path, _, frag = link.partition("#")
                self.assertIn(path, page_of, f"없는 페이지: {link}")
                if frag:
                    self.assertIn(frag, pages[page_of[path]].ids, f"없는 앵커: {link}")


class TestNoSecrets(unittest.TestCase):
    def tracked_like_files(self):
        skip_dirs = {"__pycache__", ".git"}
        for p in ROOT.rglob("*"):
            if p.is_file() and not (set(p.parts) & skip_dirs) and p.suffix not in (".jsonl", ".pyc", ".png", ".svg"):
                yield p

    def test_no_keys_tokens_emails(self):
        pats = {
            "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(com|net|org|io|kr|edu|ai)\b"),
            "api key": re.compile(r"(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|hf_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{30,})"),
            "assignment": re.compile(r"(api[_-]?key|secret|password|access[_-]?token)\s*[:=]\s*['\"][^'\"]{8,}", re.I),
        }
        allowed_email = {"noreply@anthropic.com"}
        for f in self.tracked_like_files():
            if f.name == "test_build.py":
                continue
            txt = f.read_text(encoding="utf-8", errors="ignore")
            for name, pat in pats.items():
                for m in pat.finditer(txt):
                    if m.group(0) in allowed_email:
                        continue
                    self.fail(f"{f.relative_to(ROOT)}: {name} 의심 문자열 {m.group(0)[:12]}…")

    def test_jsonl_is_gitignored(self):
        gi = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("data_raw/*.jsonl", gi)


if __name__ == "__main__":
    unittest.main()
