#!/usr/bin/env python3
"""NEXUS build_data.py — data_raw/ 와 code/ 의 원자료에서 사이트용 data/*.json 을 만든다.

원칙
  * 사이트에 보이는 연구 수치는 전부 이 스크립트가 원자료에서 뽑는다. 손으로 옮긴 수치는 없다.
  * 모든 수치에는 출처(src 파일, JSON 경로 또는 계산 방법)가 붙는다. 사이트의 Evidence Mode 가 이것을 보여 준다.
  * 원자료가 없으면 값을 추정하지 않고 status = "pending" 으로 남긴다.

실행
  python3 build_data.py            # data/*.json 재생성
  python3 build_data.py --check    # 재생성 결과가 커밋된 data/ 와 같은지만 확인 (CI 용)

H1 원자료(h1v2_*.jsonl)는 저장소에 올리지 않는다(.gitignore). 있으면 data_raw/h1_problem_rows.json
(문제별 집계값만, 문제·답 텍스트 없음)을 다시 만들고, 없으면 커밋된 h1_problem_rows.json 을 쓴다.
H1 계산식은 code/H1_STEP4_cell.py 의 _enrich / _bf / _lb / _boot 와 같다 (tests/test_build.py 가 대조한다).
"""
from __future__ import annotations

import argparse
import ast
import glob
import hashlib
import json
import math
import os
import random
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# Paper 5 page section ids (1e shares the 1f section, 1h shares the 1g section)
P5_ANCHOR = {"1e": "phase-1f", "1h": "phase-1g"}
ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data_raw"
CODE = ROOT / "code"
OUT = ROOT / "data"

H1_CODE = "H1_STEP4_cell.py"
P5_1I_CODE = "Paper5_Phase1i_cell.py"
P5_1J_CODE = "Paper5_Phase1j_cell.py"
PHASES = ["1c", "1d", "1e", "1f", "1g", "1h", "1i", "1j"]


# ------------------------------------------------------------------ 공통
def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def clean(o):
    """NaN/inf → None, 튜플 → 리스트. JSON 으로 안전하게 내보내기 위함."""
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {str(k): clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    return o


def r6(x):
    if x is None:
        return None
    if isinstance(x, float):
        if math.isnan(x) or math.isinf(x):
            return None
        return round(x, 6)
    return x


def path_str(keys) -> str:
    out = ""
    for k in keys:
        if isinstance(k, int):
            out += f"[{k}]"
        elif all(ch.isalnum() or ch == "_" for ch in str(k)) and not str(k)[:1].isdigit():
            out += ("." if out else "") + str(k)
        else:
            out += f'["{k}"]'
    return out


def load_json(name: str):
    p = RAW / name
    if not p.exists():
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def get_in(d, keys):
    for k in keys:
        if d is None:
            return None
        d = d.get(k) if isinstance(d, dict) else (d[k] if isinstance(d, list) and isinstance(k, int) and k < len(d) else None)
    return d


# ------------------------------------------------------------------ 통계 레지스트리
class Registry:
    """사이트의 모든 수치. id → {v, lo, hi, src, path|method, label, proj, phase, metric, ...}"""

    def __init__(self):
        self.items: dict[str, dict] = {}

    def add(self, sid, v, *, src, label, proj, phase, metric, path=None, method=None, lo=None, hi=None,
            n=None, note=None, unit=None, core=False):
        if sid in self.items:
            raise ValueError(f"duplicate stat id {sid}")
        st = {"id": sid, "v": r6(v), "lo": r6(lo), "hi": r6(hi), "src": src, "label": label,
              "proj": proj, "phase": phase, "metric": metric}
        if path is not None:
            st["path"] = path
        if method is not None:
            st["method"] = method
        if n is not None:
            st["n"] = n
        if note:
            st["note"] = note
        if unit:
            st["unit"] = unit
        if core:
            st["core"] = True
        self.items[sid] = st
        return st

    def ref(self, sid):
        """페이지 JSON 에 넣는 짧은 사본. 출처 전체는 statistics.json 에서 id 로 찾는다 (Evidence Mode)."""
        st = self.items[sid]
        out = {"id": sid, "v": st["v"]}
        if st.get("lo") is not None or st.get("hi") is not None:
            out["lo"], out["hi"] = st.get("lo"), st.get("hi")
        if st.get("n") is not None:
            out["n"] = st["n"]
        return out


REG = Registry()


def add_vci(sid, node, keys, *, src, label, proj, phase, metric="AUROC", core=False, note=None):
    """{"v":..,"ci":[lo,hi]} 노드 등록."""
    if not isinstance(node, dict) or "v" not in node:
        return None
    ci = node.get("ci") or [None, None]
    return REG.add(sid, node.get("v"), lo=ci[0], hi=ci[1], src=src, path=path_str(keys), label=label,
                   proj=proj, phase=phase, metric=metric, core=core, note=note)


def add_auroc(sid, node, keys, *, src, label, proj, phase, core=False):
    """{"auroc":..,"ci95":[lo,hi]} 노드 등록."""
    if not isinstance(node, dict) or "auroc" not in node:
        return None
    ci = node.get("ci95") or [None, None]
    return REG.add(sid, node.get("auroc"), lo=ci[0], hi=ci[1], src=src, path=path_str(keys) + ".auroc",
                   label=label, proj=proj, phase=phase, metric="AUROC", core=core)


# ------------------------------------------------------------------ H1
H1_RE_FIELDS = ("problem_id", "answers", "correct_flags", "maj_correct")  # 원본 _load 의 REQ


def h1_rows_from_jsonl(path: Path):
    """원본 _load + _enrich 와 같은 규칙으로 문제별 집계값을 만든다 (답 텍스트는 버린다)."""
    recs, bad = [], 0
    with open(path, encoding="utf-8") as fh:
        lines = fh.readlines()
    for line in lines:
        s = line.strip()
        if not s:
            continue
        try:
            r = json.loads(s)
        except json.JSONDecodeError:
            bad += 1
            continue
        if all(k in r for k in H1_RE_FIELDS):
            recs.append(r)
        else:
            bad += 1
    rows = []
    for r in recs:
        ans, fl, maj = r["answers"], r["correct_flags"], r["maj_correct"]
        n = len(ans)
        c = sum(bool(x) for x in fl)
        wc = Counter(a for a, f in zip(ans, fl) if a is not None and not f)
        mw = len(wc)
        nw = sum(wc.values())
        rows.append({"id": r["problem_id"], "n": n, "c": c, "nw": nw, "mw": mw,
                     "tw": max(wc.values()) if wc else 0, "maj": bool(maj),
                     "cap": r.get("n_cap", 0), "valid": r.get("n_valid", n),
                     "boxed": r.get("n_boxed", 0), "fallback": r.get("n_fallback", 0)})
    return rows, bad


def enrich(row):
    """원본 _enrich 와 같은 필드."""
    n, c, nw, mw = row["n"], row["c"], row["nw"], row["mw"]
    mmw = math.ceil(nw / mw) if mw else 0
    return dict(p=c / n, c=c, n=n, nw=nw, mw=mw, min_max_wrong=mmw, maj=bool(row["maj"]),
                deg=(c == 0 or c == n), forced=(mw > 0 and mmw > c), cap=row.get("cap", 0),
                valid=row.get("valid", n))


def bf(rs):
    return sum(1 for x in rs if not x["maj"]) / len(rs)


def lb(rs):
    return sum(1.0 if x["min_max_wrong"] > x["c"] else (0.5 if x["min_max_wrong"] == x["c"] else 0.0) for x in rs) / len(rs)


def gap(rs):
    return bf(rs) - lb(rs)


def boot(fn, rows, B=10000, seed=0):
    r = random.Random(seed)
    s = []
    for _ in range(B):
        s.append(fn([rows[r.randrange(len(rows))] for _ in range(len(rows))]))
    s.sort()
    return round(s[int(.025 * B)], 3), round(s[int(.975 * B) - 1], 3)


H1_BINS = [(0, .125), (.125, .25), (.25, .5), (.5, 1.01)]


def parse_h1_name(name):
    # h1v2_{DATASET}_L{LV}_{tagm}_t{MAX_NEW_TOKENS}  (H1_STEP4_cell.py do_run 의 PATH 규칙)
    core = name.replace("h1v2_", "").replace(".jsonl", "")
    parts = core.split("_")
    ds, lv, model, tok = parts[0], parts[1][1:], parts[2], parts[3][1:]
    return {"key": core, "dataset": ds, "levels": lv, "model": model, "max_new_tokens": int(tok)}


def h1_code_config():
    src = (CODE / H1_CODE).read_text(encoding="utf-8")
    tree = ast.parse(src)
    cfg = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            names = [t.id for t in node.targets if isinstance(t, ast.Name)]
            tup = [t for t in node.targets if isinstance(t, ast.Tuple)]
            try:
                val = ast.literal_eval(node.value)
            except Exception:
                continue
            for nm in names:
                cfg[nm] = val
            for t in tup:
                for el, v in zip(t.elts, val):
                    if isinstance(el, ast.Name):
                        cfg[el.id] = v
    plan = cfg.get("PLAN", {})
    return {
        "N_SAMPLES": cfg.get("N_SAMPLES"), "MAX_PROBLEMS": cfg.get("MAX_PROBLEMS"),
        "MAX_NEW_TOKENS": cfg.get("MAX_NEW_TOKENS"), "TEMPERATURE": cfg.get("TEMPERATURE"),
        "TOP_P": cfg.get("TOP_P"), "SEED": cfg.get("SEED"),
        "PLAN": {str(k): {"model": v[0], "dataset": v[1], "levels": list(v[2])} for k, v in plan.items()},
    }


def build_h1(prov):
    jsonls = sorted(RAW.glob("h1v2_*.jsonl"))
    rows_path = RAW / "h1_problem_rows.json"
    if jsonls:
        conds = {}
        for p in jsonls:
            rows, bad = h1_rows_from_jsonl(p)
            conds[p.name] = {"src_sha256": sha256_file(p), "bytes": p.stat().st_size, "excluded": bad, "rows": rows}
        rows_doc = {"_about": "h1v2_*.jsonl 에서 build_data.py 가 뽑은 문제별 집계값. 문제·답 텍스트는 없다. "
                              "필드: n=샘플 수, c=정답 샘플 수, nw=오답(답 있음) 수, mw=서로 다른 오답 종류 수, tw=가장 많이 나온 오답의 표 수, "
                              "maj=다수결 정답 여부, cap=토큰 상한 도달 수, valid=유효 답 수, boxed/fallback=추출 방식별 수.",
                    "conditions": conds}
        rows_path.write_text(json.dumps(rows_doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    if not rows_path.exists():
        return {"status": "pending", "reason": "h1v2_*.jsonl 과 h1_problem_rows.json 이 모두 없음"}

    doc = json.loads(rows_path.read_text(encoding="utf-8"))
    rows_sha = sha256_file(rows_path)
    prov.append({"file": "data_raw/h1_problem_rows.json", "sha256": rows_sha, "bytes": rows_path.stat().st_size,
                 "role": "H1 문제별 집계 (jsonl 에서 생성)", "project": "h1", "committed": True})
    cfg = h1_code_config()
    conditions, store = [], {}
    for fname in sorted(doc["conditions"]):
        cd = doc["conditions"][fname]
        prov.append({"file": f"data_raw/{fname}", "sha256": cd["src_sha256"], "bytes": cd["bytes"],
                     "role": "H1 원자료 (문제당 16개 샘플)", "project": "h1", "committed": False,
                     "note": "로컬 전용. 저장소에는 h1_problem_rows.json 만 올림"})
        meta = parse_h1_name(fname)
        key = meta["key"]
        recs = cd["rows"]
        rows = [enrich(r) for r in recs]
        nd = [x for x in rows if not x["deg"]]
        tot = sum(r["n"] for r in recs)
        mp = sum(x["p"] for x in rows) / len(rows)
        ma = sum(1 for x in rows if x["maj"]) / len(rows)
        src = fname
        base = f"h1.{key}"
        M = "H1_STEP4_cell.py do_analysis 와 같은 계산 · "
        REG.add(f"{base}.n_problems", len(recs), src=src, method="사용 가능한 문제 수 (_load 의 REQ 필드 보유)",
                label=f"문제 수 · {key}", proj="h1", phase="H1", metric="count")
        REG.add(f"{base}.single_acc", mp, src=src, method=M + "mean(p), p = 정답 샘플 / 16",
                label=f"단일 샘플 정확도 · {key}", proj="h1", phase="H1", metric="accuracy", core=True)
        REG.add(f"{base}.maj_acc", ma, src=src, method=M + "mean(maj_correct)",
                label=f"다수결(16) 정확도 · {key}", proj="h1", phase="H1", metric="accuracy", core=True)
        REG.add(f"{base}.maj_gain", ma - mp, src=src, method=M + "다수결 정확도 − 단일 정확도",
                label=f"다수결 이득 · {key}", proj="h1", phase="H1", metric="diff")
        REG.add(f"{base}.n_nondeg", len(nd), src=src, method=M + "0 < c < n 인 문제 수 (비축퇴)",
                label=f"비축퇴 문제 수 · {key}", proj="h1", phase="H1", metric="count")
        REG.add(f"{base}.boxed_share", sum(r["boxed"] for r in recs) / tot, src=src, method=M + "Σ n_boxed / 전체 샘플",
                label=f"\\boxed 추출 비율 · {key}", proj="h1", phase="H1", metric="rate")
        REG.add(f"{base}.fallback_share", sum(r["fallback"] for r in recs) / tot, src=src,
                method=M + "Σ n_fallback / 전체 샘플 (마지막 숫자로 대체, 무효표)", label=f"폴백 비율 · {key}",
                proj="h1", phase="H1", metric="rate")
        REG.add(f"{base}.cap_share", sum(r["cap"] for r in recs) / tot, src=src, method=M + "Σ n_cap / 전체 샘플",
                label=f"토큰 상한 도달 비율 · {key}", proj="h1", phase="H1", metric="rate")
        cond = {"key": key, **meta, "src": fname,
                "model_id": next((v["model"] for v in cfg["PLAN"].values()
                                  if v["dataset"] == meta["dataset"] and v["model"].endswith(f"{meta['model']}-Instruct")), None),
                "stats": {}}
        for k in ("n_problems", "single_acc", "maj_acc", "maj_gain", "n_nondeg", "boxed_share", "fallback_share", "cap_share"):
            cond["stats"][k] = REG.ref(f"{base}.{k}")
        cond["p0"] = sum(1 for x in rows if x["c"] == 0)
        cond["p1"] = sum(1 for x in rows if x["c"] == x["n"])
        if nd:
            o, l = bf(nd), lb(nd)
            ci = boot(bf, nd)
            gci = boot(gap, nd)
            REG.add(f"{base}.backfire", o, lo=ci[0], hi=ci[1], src=src,
                    method=M + "backfire = 비축퇴 문제 중 다수결 오답 비율, 95% CI = 문제 부트스트랩 B=10000 seed=0",
                    label=f"Backfire · {key}", proj="h1", phase="H1", metric="backfire", n=len(nd), core=True)
            REG.add(f"{base}.floor", l, src=src,
                    method=M + "산술 하한 = ceil(오답 수/오답 종류) > 정답 수 이면 1, 같으면 0.5 (_lb)",
                    label=f"산술 하한 · {key}", proj="h1", phase="H1", metric="backfire", n=len(nd), core=True)
            REG.add(f"{base}.gap", o - l, lo=gci[0], hi=gci[1], src=src,
                    method=M + "backfire − 산술 하한, 95% CI = 부트스트랩 B=10000 seed=0",
                    label=f"하한 초과분 · {key}", proj="h1", phase="H1", metric="diff", n=len(nd))
            fb = sum(1 for x in nd if not x["maj"] and x["forced"])
            nb = sum(1 for x in nd if not x["maj"])
            if mp < 0.12:
                ver_ko, ver_en = "판정 보류 (정확도 바닥)", "WITHHELD (accuracy floor)"
            elif ci[1] < 0.50:
                ver_ko, ver_en = "H1 반증", "H1 REFUTED"
            elif ci[0] > 0.50:
                ver_ko, ver_en = "H1 지지", "H1 SUPPORTED"
            else:
                ver_ko, ver_en = "불확정", "INCONCLUSIVE"
            bins = []
            for a, b in H1_BINS:
                g = [x for x in nd if a <= x["p"] < b]
                if g:
                    sid = f"{base}.bin_{a}_{b}"
                    REG.add(sid, bf(g), src=src, method=M + f"p ∈ [{a}, {b}) 인 비축퇴 문제의 backfire",
                            label=f"구간 backfire p∈[{a},{min(b,1.0)}) · {key}", proj="h1", phase="H1",
                            metric="backfire", n=len(g))
                    bins.append({"lo": a, "hi": min(b, 1.0), "n": len(g), "stat": REG.ref(sid)})
            mc = sum(x["cap"] for x in rows) / len(rows)
            num = sum((x["p"] - mp) * (x["cap"] - mc) for x in rows)
            den = math.sqrt(sum((x["p"] - mp) ** 2 for x in rows) * sum((x["cap"] - mc) ** 2 for x in rows))
            vd = sorted(x["valid"] for x in rows)
            bfp = [x["p"] for x in nd if not x["maj"]]
            hp = [x for x in nd if x["p"] > 0.5]
            cond.update({
                "verdict_ko": ver_ko, "verdict_en": ver_en,
                "verdict_rule": "CI 상한 < 0.50 → 반증, CI 하한 > 0.50 → 지지, 그 외 불확정, 평균 정확도 < 0.12 → 보류 (H1_STEP4_cell.py)",
                "backfire": REG.ref(f"{base}.backfire"), "floor": REG.ref(f"{base}.floor"), "gap": REG.ref(f"{base}.gap"),
                "forced_backfires": fb, "backfires": nb,
                "median_wrong_kinds": sorted(x["mw"] for x in nd)[len(nd) // 2],
                "max_p_backfire": max(bfp) if bfp else None,
                "high_p": len(hp), "high_p_backfire": sum(1 for x in hp if not x["maj"]),
                "corr_p_cap": r6(num / den) if den > 0 else None,
                "valid_median": vd[len(vd) // 2], "valid_zero": sum(1 for v in vd if v == 0),
                "valid_lt12": sum(1 for v in vd if v < 12),
                "bins": bins,
            })
            store[key] = [0.0 if x["maj"] else 1.0 for x in nd]
            # 설명용 실제 예시: 비축퇴 문제 중 다수결이 틀린 것 / 맞은 것 (원자료의 개수 그대로)
            ex_bf, ex_ok = [], []
            for r_, x in zip(recs, rows):
                if x["deg"]:
                    continue
                e_ = {"id": r_["id"], "n": r_["n"], "c": r_["c"], "tw": r_.get("tw"), "nw": r_["nw"], "mw": r_["mw"],
                      "valid": r_.get("valid"), "maj": r_["maj"], "forced": x["forced"]}
                (ex_ok if r_["maj"] else ex_bf).append(e_)
            cond["examples"] = {"backfire": ex_bf, "majority_right": ex_ok[:12]}
        conditions.append(cond)

    # HARD(math500) vs EASY(gsm8k) — 원본 do_analysis 와 같은 쌍·같은 시드
    pairs = []
    keys = [c["key"] for c in conditions]
    for a in keys:
        for b in keys:
            if "math500" in a and "gsm8k" in b and a in store and b in store:
                A, B_ = store[a], store[b]
                r = random.Random(0)
                s = []
                for _ in range(10000):
                    s.append(sum(A[r.randrange(len(A))] for _ in range(len(A))) / len(A)
                             - sum(B_[r.randrange(len(B_))] for _ in range(len(B_))) / len(B_))
                s.sort()
                sa = next(c for c in conditions if c["key"] == a)
                sb = next(c for c in conditions if c["key"] == b)
                sid = f"h1.diff.{a}__{b}"
                REG.add(sid, sa["backfire"]["v"] - sb["backfire"]["v"], lo=s[250], hi=s[9749],
                        src=f"{sa['src']} + {sb['src']}",
                        method="HARD−EASY backfire 차이, 95% CI = 각 조건 독립 부트스트랩 10000회 seed=0 (H1_STEP4_cell.py)",
                        label=f"backfire 차이 {a} − {b}", proj="h1", phase="H1", metric="diff")
                pairs.append({"hard": a, "easy": b, "stat": REG.ref(sid),
                              "verdict": "하드가 유의하게 높음" if s[250] > 0 else "차이 불확정 (검정력 부족 가능)"})

    verdicts = [c.get("verdict_en") for c in conditions if c.get("verdict_en")]
    if verdicts and all(v == "H1 REFUTED" for v in verdicts):
        status = {"code": "falsified", "label": "반증됨",
                  "why": f"원본 판정 규칙으로 {len(verdicts)}개 조건 모두 'H1 REFUTED' (backfire 95% CI 상한 < 0.50)"}
    elif verdicts and any(v == "H1 SUPPORTED" for v in verdicts):
        status = {"code": "exploratory", "label": "탐색적", "why": "일부 조건 지지 — 사전 고정 문서가 없어 탐색적으로 표시"}
    else:
        status = {"code": "exploratory", "label": "탐색적", "why": "판정이 섞여 있거나 불확정"}

    return {"status": "ok", "project_status": status, "config": cfg, "conditions": conditions, "pairs": pairs,
            "code_file": H1_CODE}


# ------------------------------------------------------------------ Paper 5
def phase_status(pid, prereg):
    if pid == "1j":
        return {"code": "not_run", "label": "실행 전", "why": "analysis_phase1j.json 이 없음 (코드와 PREREG 만 존재)"}
    if prereg:
        return {"code": "preregistered", "label": "사전 고정", "why": f"PREREG 해시 {prereg[:12]} 가 결과 파일에 기록됨"}
    return {"code": "exploratory", "label": "탐색적", "why": "결과 파일·코드에 사전 고정(PREREG) 기록이 없음"}


def generic_register(phase, data, src):
    """분석 JSON 전체를 훑어 CI 가 붙은 모든 수치를 레지스트리에 등록 (Statistics 페이지용)."""
    count = 0

    def walk(o, keys):
        nonlocal count
        if isinstance(o, dict):
            if "v" in o and isinstance(o.get("ci"), list) and len(o["ci"]) == 2:
                sid = f"p5.{phase}." + "/".join(str(k) for k in keys)
                if sid not in REG.items:
                    add_vci(sid, o, keys, src=src, label=label_of(phase, keys), proj="paper5", phase=phase)
                    count += 1
                return
            if "auroc" in o and isinstance(o.get("ci95"), list):
                sid = f"p5.{phase}." + "/".join(str(k) for k in keys)
                if sid not in REG.items:
                    add_auroc(sid, o, keys, src=src, label=label_of(phase, keys), proj="paper5", phase=phase)
                    count += 1
                return
            if "diff" in o and isinstance(o.get("ci95"), list):
                sid = f"p5.{phase}." + "/".join(str(k) for k in keys)
                if sid not in REG.items:
                    ci = o["ci95"]
                    REG.add(sid, o.get("diff"), lo=ci[0], hi=ci[1], src=src, path=path_str(keys) + ".diff",
                            label=label_of(phase, keys), proj="paper5", phase=phase, metric="diff")
                    count += 1
                return
            if "success" in o and isinstance(o.get("ci95"), list):
                sid = f"p5.{phase}." + "/".join(str(k) for k in keys)
                if sid not in REG.items:
                    ci = o["ci95"]
                    REG.add(sid, o.get("success"), lo=ci[0], hi=ci[1], src=src, path=path_str(keys) + ".success",
                            label=label_of(phase, keys), proj="paper5", phase=phase, metric="rate")
                    count += 1
                return
            for k, v in o.items():
                walk(v, keys + [k])
        elif isinstance(o, list):
            for i, v in enumerate(o):
                if isinstance(v, (dict, list)):
                    walk(v, keys + [i])

    walk(data, [])
    return count


def label_of(phase, keys):
    parts = [str(k) for k in keys if not (isinstance(k, int))]
    skip = {"results", "groups", "features", "auroc", "folders", "cond", "rows", "B", "A", "tests"}
    return f"{phase} · " + " · ".join(p for p in parts if p not in skip)


def parse_prereg_1j():
    src = (CODE / P5_1J_CODE).read_text(encoding="utf-8")
    tree = ast.parse(src)
    vals = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            nm = node.targets[0].id
            if nm in ("PREREG", "SRC_SHA", "KEEP_K", "SRC_NAME"):
                vals[nm] = ast.literal_eval(node.value)
    prereg = vals["PREREG"]
    full = hashlib.sha256(prereg.encode()).hexdigest()
    return {"text": prereg, "sha256": full, "sha12": full[:12], "keep_k": list(vals["KEEP_K"]),
            "src_name": vals["SRC_NAME"], "src_sha_recorded": vals["SRC_SHA"],
            "method": "hashlib.sha256(PREREG.encode()).hexdigest()[:12] — Paper5_Phase1j_cell.py 와 같은 식"}


def verify_1i_code(recorded):
    p = CODE / P5_1I_CODE
    if not p.exists():
        return {"ok": None, "reason": "코드 파일 없음"}
    txt = p.read_text(encoding="utf-8")
    got = hashlib.sha256(txt.rstrip().encode()).hexdigest()
    return {"ok": got == recorded, "computed_rstrip_sha256": got, "recorded_in_1j": recorded,
            "file_sha256": sha256_file(p),
            "method": "sha256(src.rstrip().encode()) — 1j 로더가 실행 전에 확인하는 방식과 같음"}


def build_paper5(prov, manifest):
    out = {"phases": {}, "code": {}}
    nb_titles = {f.get("phase"): f["title"] for f in manifest.get("files", []) if f.get("kind") == "notebook" and f.get("phase")}
    # 노트북 제목에 원 번호가 붙은 단계 이름 (예: ⑧1f분해). 1c 는 노트북 두 개.
    titles = {}
    for f in manifest.get("files", []):
        if f.get("kind") == "notebook" and f.get("phase"):
            t = f["title"].replace("▶ ", "").replace(".ipynb", "")
            titles.setdefault(f["phase"], []).append(t)
    raw = {}
    for ph in PHASES:
        name = f"analysis_phase{ph}.json"
        d = load_json(name)
        raw[ph] = d
        mf = next((f for f in manifest.get("files", []) if f["title"] == name), None)
        if d is not None:
            p = RAW / name
            prov.append({"file": f"data_raw/{name}", "sha256": sha256_file(p), "bytes": p.stat().st_size,
                         "role": f"Paper 5 Phase {ph} 분석 결과", "project": "paper5", "committed": True,
                         "drive_size": mf["size"] if mf else None,
                         "size_match_drive": (mf["size"] == p.stat().st_size) if mf else None})
            generic_register(ph, d, name)
        prereg = d.get("prereg_sha") if isinstance(d, dict) else None
        created = d.get("created") if isinstance(d, dict) else None
        out["phases"][ph] = {
            "id": ph, "available": d is not None, "src": name if d is not None else None,
            "notebooks": titles.get(ph, []), "created_in_json": created,
            "drive_modified": mf["modified"] if mf else None,
            "prereg_sha": prereg, "status": phase_status(ph, prereg) if (d is not None or ph == "1j") else
            {"code": "pending", "label": "DATA PENDING", "why": f"{name} 없음"},
        }

    # ---- 1c: 신호 탐색 + 재방문(동어반복) 진단
    c = raw["1c"]
    if c:
        folders = []
        for i, r in enumerate(c["results"]):
            det = []
            for dp, v in r.get("determinism", {}).items():
                base = f"p5.1c.det.{r['folder']}.d{dp}"
                for fld in ("ep", "fail", "fail_rev", "rev", "key_after_rev"):
                    REG.add(f"{base}.{fld}", v[fld], src="analysis_phase1c.json",
                            path=path_str(["results", i, "determinism", dp, fld]),
                            label=f"1c 결정성 진단 {fld} · {r['folder']} depth{dp}", proj="paper5", phase="1c",
                            metric="count")
                det.append({"depth": int(dp), **{fld: REG.ref(f"{base}.{fld}") for fld in ("ep", "fail", "fail_rev", "rev", "key_after_rev")}})
            groups = []
            for gname, g in r["groups"].items():
                feats = []
                for fname, fv in g["features"].items():
                    sid = f"p5.1c." + "/".join(["results", str(i), "groups", gname, "features", fname])
                    feats.append({"name": fname, "stat": REG.ref(sid), "excl_05": fv.get("excl_05")})
                groups.append({"name": gname, "n_ep": g["n_ep"], "n_pos": g["n_pos"], "n_clusters": g["n_clusters"],
                               "features": feats})
            folders.append({"folder": r["folder"], "n_runs": r["n_runs"], "determinism": det, "groups": groups})
        out["phases"]["1c"]["data"] = {"N_prefix": c.get("N_prefix"), "H_loop": c.get("H_loop"),
                                       "min_pos": c.get("min_pos"), "folders": folders}

    # ---- 1d: 교란 통제 (raw / dist / layout / lay×dist)
    d = raw["1d"]
    if d:
        folders = []
        for i, r in enumerate(d["results"]):
            groups = []
            for gname, g in r["groups"].items():
                rows = []
                for fname, fv in g["rows"].items():
                    strata = {}
                    for st, node in fv.items():
                        sid = "p5.1d." + "/".join(["results", str(i), "groups", gname, "rows", fname, st])
                        strata[st] = REG.ref(sid) if (node is not None and sid in REG.items) else None
                    rows.append({"name": fname, "strata": strata})
                groups.append({"name": gname, "n_ep": g["n_ep"], "n_pos": g["n_pos"], "n_clusters": g["n_clusters"],
                               "rows": rows})
            folders.append({"folder": r["folder"], "groups": groups})
        out["phases"]["1d"]["data"] = {"N": d.get("N"), "B": d.get("B"), "folders": folders}

    # ---- 1e: 보강 분석 (direct depth0 vs planner depth2, 성공률, 1d 재현)
    e = raw["1e"]
    if e:
        diffs = []
        for fname, fv in e["folders"].items():
            dd = fv.get("diff_d0_minus_d2")
            if not dd:
                continue
            for strat in ("raw", "lay×dist"):
                node = dd.get(strat)
                if not node:
                    continue
                sid = "p5.1e." + "/".join(["folders", fname, "diff_d0_minus_d2", strat])
                diffs.append({"folder": fname, "strata": strat, "direct": r6(node.get("direct")),
                              "planner": r6(node.get("planner")), "stat": REG.ref(sid),
                              "n_common_runs": dd.get("n_common_runs")})
        succ = []
        for k, v in e.get("d_success", {}).items():
            sid = "p5.1e." + "/".join(["d_success", k])
            if sid in REG.items:
                succ.append({"key": k, "stat": REG.ref(sid), "key_rate": r6(v.get("key_rate")),
                             "per_k": clean(v.get("per_k"))})
            else:
                succ.append({"key": k, "stat": None, "note": "success 값이 NaN (원자료 그대로)"})
        repro = [{"key": k, **clean(v)} for k, v in e.get("self_check", {}).get("repro_1d", {}).items()]
        out["phases"]["1e"]["data"] = {"diffs": diffs, "success": succ, "self_check": {
            "match_1d_impl": e.get("self_check", {}).get("match_1d_impl"), "repro_1d": repro}}

    # ---- 1f: 사전 고정 확인 실험 (재현 0.82)
    f = raw["1f"]
    if f:
        conds = {}
        for cname, cv in f["cond"].items():
            tests = []
            for tname, tv in cv["tests"].items():
                sid = f"p5.1f.cond/{cname}/tests/{tname}"
                ci = tv.get("ci95") or [None, None]
                val = tv.get("auroc", tv.get("diff"))
                mk = "AUROC" if "auroc" in tv else "diff"
                if sid not in REG.items:
                    REG.add(sid, val, lo=ci[0], hi=ci[1], src="analysis_phase1f.json",
                            path=path_str(["cond", cname, "tests", tname]) + (".auroc" if mk == "AUROC" else ".diff"),
                            label=f"1f {cname} {tname}", proj="paper5", phase="1f", metric=mk,
                            core=(tname == "H1"))
                else:
                    REG.items[sid]["core"] = REG.items[sid].get("core") or tname == "H1"
                tests.append({"name": tname, "stat": REG.ref(sid), "verdict": tv.get("verdict"),
                              "n_common": tv.get("n_common")})
            groups = []
            for gname, gv in cv["groups"].items():
                groups.append({"name": gname, "n": gv["n"], "pos": gv["pos"], "nrun": gv["nrun"],
                               "auroc": {k: REG.ref("p5.1f." + "/".join(["cond", cname, "groups", gname, "auroc", k]))
                                         for k in gv["auroc"]}})
            succ = {dp: {**clean(sv), "stat": REG.ref("p5.1f." + "/".join(["cond", cname, "success", dp]))}
                    for dp, sv in cv.get("success", {}).items()}
            conds[cname] = {"tests": tests, "groups": groups, "success": succ}
        out["phases"]["1f"]["data"] = {"complete": f.get("complete"), "n_runs_done": f.get("n_runs_done"),
                                       "conds": conds}

    # ---- 1g / 1h / 1i : run 간·run 내, k 분해
    for ph in ("1g", "1h", "1i"):
        g = raw[ph]
        if not g:
            continue
        B = []
        for key, node in g.get("B", {}).items():
            item = {"key": key, "label": node.get("label"), "n_ep": node.get("n_ep"), "n_pos": node.get("n_pos"),
                    "n_run": node.get("n_run"), "stats": {}}
            for mk, mv in node.items():
                sid = f"p5.{ph}." + "/".join(["B", key, mk])
                if sid in REG.items:
                    item["stats"][mk] = REG.ref(sid)
            if "per_k" in node:
                item["per_k"] = clean(node["per_k"])
            if "eta2" in node:
                item["eta2"] = r6(node["eta2"])
            if "rxd_perm" in node:
                item["rxd_perm"] = clean(node["rxd_perm"])
            B.append(item)
        A = []
        for key, node in g.get("A", {}).items():
            if node is None:
                A.append({"key": key, "value": None})
                continue
            A.append({"key": key, **clean(node)})
        out["phases"][ph]["data"] = {"B": B, "A": A, "self": clean(g.get("self", {}))}

    # 1i 핵심 수치 core 표시 (det d0 lf: total/kscore/resk/kxd)
    for mk in ("total", "kscore", "kmean", "resk", "kxd", "seed_in_k"):
        sid = f"p5.1i.B/run_confirm_det|d0|lf/{mk}"
        if sid in REG.items:
            REG.items[sid]["core"] = True

    # ---- 1j: 사전 고정, 실행 전
    if (CODE / P5_1J_CODE).exists():
        pj = parse_prereg_1j()
        out["phases"]["1j"]["data"] = {"prereg": pj, "result": None,
                                       "result_file_expected": "analysis_phase1j.json"}
        out["code"]["1i_verify"] = verify_1i_code(pj["src_sha_recorded"])
    return out


# ------------------------------------------------------------------ 타임라인 / 로그
def build_timeline(manifest, h1, p5):
    ev = []
    m = {f["title"]: f for f in manifest.get("files", [])}

    def add(date, proj, typ, title, detail, src, link, stat=None):
        ev.append({"date": date, "project": proj, "type": typ, "title": title, "detail": detail, "src": src,
                   "link": link, **({"stat": stat} if stat else {})})

    fo = manifest.get("folders", {})
    if "h1_results" in fo:
        add(fo["h1_results"]["created"], "h1", "question", "H1 시작 — h1_results 폴더 생성",
            "작업 시작 시점을 폴더 생성 시각으로 표시.", "drive_manifest.json · folders.h1_results", "h1/#question")
    if "phase1_signals" in fo:
        add(fo["phase1_signals"]["created"], "paper5", "question", "Paper 5 Phase 1 시작 — phase1_signals 폴더 생성",
            "작업 시작 시점을 폴더 생성 시각으로 표시.", "drive_manifest.json · folders.phase1_signals", "paper5/#question")
    # H1
    if "h1_math500_l5_Qwen2.5-1.5B.jsonl" in m:
        f = m["h1_math500_l5_Qwen2.5-1.5B.jsonl"]
        add(f["created"], "h1", "experiment", "H1 1차 실행 — MATH-500 Level 5 · Qwen2.5-1.5B",
            "파일명 기준 Level 5 문제로 첫 실행. 이 파일은 저장소에 없음(메타데이터만).",
            "drive_manifest.json · h1_math500_l5_Qwen2.5-1.5B.jsonl", "h1/#history")
    if "h1_fig1_diagnosis.png" in m:
        f = m["h1_fig1_diagnosis.png"]
        add(f["created"], "h1", "analysis", "진단 그림 생성 (h1_fig1_diagnosis.png)",
            "v1 결과를 진단한 그림 파일. 그림 내용은 이 사이트에 옮기지 않음.",
            "drive_manifest.json · h1_fig1_diagnosis.png", "h1/#history")
    if "h1v2_math500_L34_1.5B_t1024.jsonl" in m:
        f = m["h1v2_math500_L34_1.5B_t1024.jsonl"]
        add(f["created"], "h1", "revision", "설계 수정 v2 — Level 3–4, 최대 1024 토큰",
            "파일명이 h1 → h1v2, L5 → L34, t1024 로 바뀜. STEP 1 (MATH-500 · 1.5B) 실행.",
            "drive_manifest.json · H1_STEP4_cell.py PLAN", "h1/#history")
    for t, step, lab in (("h1v2_gsm8k_LNA_1.5B_t1024.jsonl", 2, "GSM8K · 1.5B (대조군)"),
                         ("h1v2_math500_L34_3B_t1024.jsonl", 3, "MATH-500 · 3B (확장)"),
                         ("h1v2_gsm8k_LNA_3B_t1024.jsonl", 4, "GSM8K · 3B (확장 대조군)")):
        if t in m:
            add(m[t]["created"], "h1", "experiment", f"STEP {step} — {lab}", "H1_STEP4_cell.py 의 PLAN 단계.",
                f"drive_manifest.json · {t}", "h1/#results")
    if h1.get("status") == "ok":
        last = max((m[t]["modified"] for t in m if t.startswith("h1v2_")), default=None)
        st = h1["project_status"]
        add(last, "h1", "falsification", f"H1 판정: {st['label']}", st["why"],
            "h1_problem_rows.json → build_data.py (원본 판정 규칙)", "h1/#results")
        add(last, "h1", "next", "H1 다음 질문 — 아직 기록 없음", "H1_STEP4_cell.py 에는 4단계 이후 계획이 기록되어 있지 않음 — 다음 질문은 아직 문서화되지 않음.",
            "H1_STEP4_cell.py", "h1/#next")

    # Paper 5
    ph = p5["phases"]
    def p5date(pid):
        x = ph.get(pid, {})
        if x.get("created_in_json"):
            return x["created_in_json"].replace(" ", "T") + "Z"
        return x.get("drive_modified")

    if "Paper5_Phase1b_cell.py" in m:
        add(m["▶ Paper5_Phase1b_실행.ipynb"]["modified"] if "▶ Paper5_Phase1b_실행.ipynb" in m else m["Paper5_Phase1b_cell.py"]["created"],
            "paper5", "experiment", "Phase 1b 실행", "노트북·코드 파일만 확인됨 (결과 JSON 은 이 저장소에 없음).",
            "drive_manifest.json", "paper5/#narrative")
    text = {
        "1c": ("experiment", "1c — ① 고리(재방문) 통제 · ② 확률 정책 로깅",
               "신호 후보 24개를 표준 표본과 고리통제 표본에서 비교하고, 결정론 정책의 재방문-실패 관계를 진단."),
        "1d": ("experiment", "1d — ③ 교란 통제", "거리·레이아웃 층화로 '가까워서 성공'하는 효과를 걷어냄."),
        "1e": ("revision", "1e — ④ 보강 분석", "직접 행동(depth0) vs 플래너(depth2) 신호 차이, 1d 값 재현 점검."),
        "1f": ("experiment", "1f — ⑤ 사전 고정 확인 실험", "새 run 60개로 사전 고정 가설 H1~H3 판정."),
        "1g": ("unexpected", "1g — ⑥ 진단", "1i 코드 머리말 원문: “1g에서 k×dist(같은 k끼리 비교)는 거의 0.5”."),
        "1h": ("revision", "1h — ⑦ 대조", "maxQ 신호를 k(학습 설정) 성분과 나머지로 분해 — 1e 폴더."),
        "1i": ("falsification", "1i — ⑧ 1f 분해 (자기 반증)", "같은 분해를 1f 확인 실험 데이터에 적용."),
    }
    for pid, (typ, title, det) in text.items():
        if ph.get(pid, {}).get("available"):
            add(p5date(pid), "paper5", typ, title, det, f"analysis_phase{pid}.json", "paper5/#" + P5_ANCHOR.get(pid, f"phase-{pid}"))
    if "1i" in ph and ph["1i"].get("data"):
        lab = next((b["label"] for b in ph["1i"]["data"]["B"] if b["key"] == "run_confirm_det|d0|lf"), None)
        if lab:
            ev[-1]["detail"] += f" 주 조건 라벨(원문): “{lab}”"
    if (CODE / P5_1J_CODE).exists():
        f = m.get("Paper5_Phase1j_cell.py")
        add(f["created"] if f else None, "paper5", "next", "1j — PREREG 고정, 실행 전",
            "k=2 를 빼고 학습된 모델(k=8, 32)끼리도 잔여 신호가 남는가? 판정 기준은 코드에 사전 고정됨.",
            "Paper5_Phase1j_cell.py", "paper5/#phase-1j")
    ev = [e for e in ev if e["date"]]
    ev.sort(key=lambda e: e["date"])
    for i, e in enumerate(ev):
        e["id"] = f"ev{i:02d}"
    return ev


# ------------------------------------------------------------------ 그래프
def build_graph(h1, p5):
    st_h1 = h1.get("project_status", {}).get("label", "DATA PENDING")
    nodes = [
        {"id": "nexus", "label": "NEXUS", "kind": "core", "desc": "두 연구를 잇는 중심. 질문 → 실험 → 반증 → 다음 질문."},
        {"id": "h1", "label": "H1 · 다수결 역효과", "kind": "project", "status": st_h1, "link": "h1/",
         "desc": "LLM 이 같은 수학 문제를 16번 풀 때 다수결이 오히려 틀리게 만드는가."},
        {"id": "p5", "label": "Paper 5 · 내부 신호", "kind": "project", "status": "탐색적", "link": "paper5/",
         "desc": "강화학습 에이전트의 maxQ 가 성공을 미리 알려 주는가, 그리고 그 신호는 무엇인가."},
        {"id": "reasoning", "label": "Reasoning", "kind": "domain", "desc": "MATH-500 · GSM8K 수학 추론 (Qwen2.5-Instruct 1.5B/3B)"},
        {"id": "monitoring", "label": "Monitoring", "kind": "domain", "desc": "에이전트 내부 값으로 실패를 미리 감지하려는 시도"},
        {"id": "planning", "label": "Planning", "kind": "domain", "desc": "depth0(직접 행동) vs depth2(플래너) 비교 — 1e"},
        {"id": "learning", "label": "Learning (k)", "kind": "domain", "desc": "학습 설정 k (k=2 는 거의 미학습) — 1h·1i 의 핵심 교란"},
        {"id": "majority", "label": "Majority vote", "kind": "method", "desc": "16개 샘플 중 최다 답 선택"},
        {"id": "floor", "label": "Arithmetic floor", "kind": "method", "desc": "비둘기집 원리로 피할 수 없는 backfire 의 하한"},
        {"id": "auroc", "label": "Stratified AUROC", "kind": "method", "desc": "레이아웃×거리 층 안에서만 비교한 AUROC"},
        {"id": "loop", "label": "Loop control", "kind": "method", "desc": "재방문이 없는 표본만 사용 — 동어반복 제거 (1c)"},
        {"id": "confound", "label": "Confound control", "kind": "method", "desc": "거리·레이아웃 층화 (1d)"},
        {"id": "prereg", "label": "PREREG", "kind": "method", "desc": "실행 전 판정 기준 고정 (1f, 1j)"},
        {"id": "falsify", "label": "Self-falsification", "kind": "method", "desc": "자기 결과를 분해해 반증 (1i)"},
        {"id": "next", "label": "1j (실행 전)", "kind": "next", "link": "paper5/#phase-1j",
         "desc": "k=8/32 만으로 잔여 신호 검증 — 사전 고정, 아직 실행하지 않음"},
    ]
    edges = [("nexus", "h1"), ("nexus", "p5"), ("h1", "reasoning"), ("h1", "majority"), ("majority", "floor"),
             ("p5", "monitoring"), ("p5", "planning"), ("p5", "learning"), ("p5", "auroc"), ("auroc", "loop"),
             ("auroc", "confound"), ("p5", "prereg"), ("p5", "falsify"), ("falsify", "learning"), ("falsify", "next"),
             ("prereg", "next"), ("monitoring", "planning"), ("reasoning", "monitoring")]
    return {"nodes": nodes, "edges": [{"source": a, "target": b} for a, b in edges]}


# ------------------------------------------------------------------ main
def build():
    manifest = load_json("drive_manifest.json") or {"files": []}
    prov = []
    h1 = build_h1(prov)
    p5 = build_paper5(prov, manifest)
    timeline = build_timeline(manifest, h1, p5)
    graph = build_graph(h1, p5)

    code_files = []
    for p in sorted(CODE.glob("*.py")):
        mf = next((f for f in manifest.get("files", []) if f["title"] == p.name), None)
        code_files.append({"file": f"code/{p.name}", "sha256": sha256_file(p), "bytes": p.stat().st_size,
                           "drive_size": mf["size"] if mf else None,
                           "size_match_drive": (mf["size"] == p.stat().st_size) if mf else None})
    drive_only_code = [f for f in manifest.get("files", []) if f.get("kind") == "code" and not (CODE / f["title"]).exists()]

    # 1c 전체 신호 탐색·1d 교란 표는 커서 따로 (탐색기를 열 때만 불러옴)
    p5_core = json.loads(json.dumps(p5))
    p5_scan = {"1c": p5_core["phases"]["1c"].pop("data", None), "1d": p5_core["phases"]["1d"].pop("data", None)}
    if p5_scan["1c"]:
        # 본문에 쓰는 1c 요약: 결정성 진단 + maxQ_last / S6_revisit 만
        keep = {"S1a_maxq_last", "S6_revisit_last", "S6_revisit_mean"}
        p5_core["phases"]["1c"]["summary"] = {
            "N_prefix": p5_scan["1c"]["N_prefix"], "H_loop": p5_scan["1c"]["H_loop"],
            "folders": [{"folder": f["folder"], "n_runs": f["n_runs"], "determinism": f["determinism"],
                         "groups": [{**{k: g[k] for k in ("name", "n_ep", "n_pos", "n_clusters")},
                                     "features": [x for x in g["features"] if x["name"] in keep]}
                                    for g in f["groups"]]}
                        for f in p5_scan["1c"]["folders"]]}
    if p5_scan["1d"]:
        p5_core["phases"]["1d"]["summary"] = {
            "folders": [{"folder": f["folder"], "groups": [{**{k: g[k] for k in ("name", "n_ep", "n_pos", "n_clusters")},
                                                            "rows": [r for r in g["rows"] if r["name"] in ("S1a_maxq_last", "거리(가까울수록↑)")]}
                                                           for g in f["groups"]]}
                        for f in p5_scan["1d"]["folders"]]}

    p5_status = {"code": "exploratory", "label": "탐색적",
                 "why": "가장 최근 완료 단계(1i)는 사전 고정 기록이 없는 분석. 다음 단계 1j 는 사전 고정·실행 전."}
    research = {
        "projects": [
            {"id": "h1", "title": "H1 · 다수결 역효과(Backfire)", "title_en": "Majority-vote backfire",
             "question": "같은 수학 문제를 16번 풀게 하고 다수결로 답을 고르면, 정답이 섞여 나오는 문제에서 다수결이 오히려 틀리는 경우가 절반을 넘는가?",
             "status": h1.get("project_status", {"code": "pending", "label": "DATA PENDING", "why": "원자료 없음"}),
             "link": "h1/", "tags": ["Reasoning", "Self-consistency", "Falsified"]},
            {"id": "paper5", "title": "Paper 5 · 내부 신호로 성공 예측하기", "title_en": "Can an agent's maxQ monitor its own success?",
             "question": "에이전트가 처음 5걸음 동안 보인 maxQ 로, 그 뒤 열쇠(key)에 도달할지 예측할 수 있는가 — 그리고 그 신호는 정말 '자신감'인가, 학습 정도(k)일 뿐인가?",
             "status": p5_status, "link": "paper5/", "tags": ["Monitoring", "RL", "Self-falsification", "PREREG"]},
        ],
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    counts = {
        "projects": 2,
        "phases_with_data": sum(1 for x in p5["phases"].values() if x.get("available")),
        "stats": len(REG.items),
        "stats_with_ci": sum(1 for s in REG.items.values() if s.get("lo") is not None),
        "source_files": len(prov),
    }
    research["counts"] = counts
    # 홈·요약에 쓰는 대표 수치 (id 는 statistics.json 의 항목; 값은 원자료에서 온 그대로)
    HL = {
        "expect_1e": "p5.1e.folders/run_stochastic_eps0.1/groups/depth0_lf/auroc/S1a_maxq_last|lay×dist",
        "repro_1f_det": "p5.1f.cond/det/tests/H1",
        "repro_1f_eps": "p5.1f.cond/eps/tests/H1",
        "unexp_1g_lxd": "p5.1g.B/run_multidepth_v2|d0|lf/lxd",
        "unexp_1g_kxd": "p5.1g.B/run_multidepth_v2|d0|lf/kxd",
        "rev_1h_total": "p5.1h.B/run_multidepth_v2|d0|lf/total",
        "rev_1h_kscore": "p5.1h.B/run_multidepth_v2|d0|lf/kscore",
        "fals_1i_total": "p5.1i.B/run_confirm_det|d0|lf/total",
        "fals_1i_kscore": "p5.1i.B/run_confirm_det|d0|lf/kscore",
        "fals_1i_resk": "p5.1i.B/run_confirm_det|d0|lf/resk",
        "fals_1i_kxd": "p5.1i.B/run_confirm_det|d0|lf/kxd",
    }
    research["highlights"] = {k: REG.ref(v) for k, v in HL.items() if v in REG.items}
    missing = [k for k, v in HL.items() if v not in REG.items]
    if missing:
        research["highlights_missing"] = missing

    provenance = {"sources": prov, "code": code_files, "drive_only_code": drive_only_code,
                  "verify_1i": p5["code"].get("1i_verify"),
                  "prereg": {"1f": {"sha256": p5["phases"]["1f"].get("prereg_sha"), "src": "analysis_phase1f.json",
                                    "path": "prereg_sha", "note": "PREREG 원문은 이 저장소에 없음 — 해시만 결과 파일에 기록됨"},
                             "1j": (p5["phases"]["1j"].get("data") or {}).get("prereg")},
                  "builder": {"file": "build_data.py", "sha256": sha256_file(Path(__file__))},
                  "manifest": {"file": "data_raw/drive_manifest.json", "retrieved": manifest.get("retrieved")}}

    files = {
        "research.json": research,
        "h1.json": h1,
        "paper5.json": p5_core,
        "paper5_scan.json": p5_scan,
        "statistics.json": {"count": len(REG.items), "items": list(REG.items.values())},
        "timeline.json": {"events": timeline},
        "graph.json": graph,
        "provenance.json": provenance,
    }
    return {k: clean(v) for k, v in files.items()}


def dump(obj, pretty=False):
    if pretty:
        return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"


PRETTY = {"research.json", "graph.json", "provenance.json", "timeline.json"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="재생성 결과가 data/ 와 같은지 확인 (built 시각 제외)")
    a = ap.parse_args()
    files = build()
    OUT.mkdir(exist_ok=True)
    if a.check:
        bad = []
        for name, obj in files.items():
            p = OUT / name
            if not p.exists():
                bad.append(f"{name}: 없음")
                continue
            old = json.loads(p.read_text(encoding="utf-8"))
            new = json.loads(dump(obj))
            for d in (old, new):
                if isinstance(d, dict):
                    d.pop("built", None)
                    if name == "provenance.json":
                        d.get("builder", {}).pop("sha256", None)
            if old != new:
                bad.append(f"{name}: 다름")
        if bad:
            print("CHECK FAIL:\n  " + "\n  ".join(bad))
            sys.exit(1)
        print("CHECK OK: data/ 가 원자료와 일치")
        return
    for name, obj in files.items():
        (OUT / name).write_text(dump(obj, name in PRETTY), encoding="utf-8")
    r = files["research.json"]["counts"]
    print(f"[build_data] {len(files)} files → {OUT}  stats={r['stats']} (CI {r['stats_with_ci']})  "
          f"sources={r['source_files']}  phases={r['phases_with_data']}")
    h1 = files["h1.json"]
    if h1.get("status") == "ok":
        for c in h1["conditions"]:
            b = c.get("backfire") or {}
            print(f"  H1 {c['key']}: backfire={b.get('v'):.3f} [{b.get('lo')}, {b.get('hi')}] → {c.get('verdict_en')}")
    v = files["provenance.json"].get("verify_1i") or {}
    print(f"  1i code sha check (vs 1j record): {v.get('ok')}")


if __name__ == "__main__":
    main()
