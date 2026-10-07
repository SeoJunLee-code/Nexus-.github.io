# ==============================================================================
#  Paper 5 — Phase 1i: 1g에서 새로 나온 두 문제의 대조 분석 (분석 전용 · CPU · 새 로깅 없음)
# ==============================================================================
#  문제 A'. 1g의 "같은 시드 계열" 진단은 레이아웃 효과를 걸러내지 못했다 → 레이아웃별 평균을 뺀 상관을 관계(seed,k)별로 비교
#  문제 B'. 1g에서 k×dist(같은 k끼리 비교)는 거의 0.5 → maxQ 신호가 k(학습 설정) 자체인지 분해 (k만 쓴 점수와 비교)
#  자체 점검: ① 층화 AUROC 무차별 대조 ② 1e 값 재현 ③ 1g의 kxd 재현 ④ 레이아웃 대응(phi0) 점검
# ==============================================================================
N = 5
B = 1000                 # run 단위 bootstrap
NPERM = 1000             # 순열 검정 횟수
MIN_CLUSTERS = 10
MIN_POS = 30
EXACT = 1e-5             # t=0 maxQ '일치' 기준 (절대 오차)
MAIN = "S1a_maxq_last"
EXPECT_1E = {("run_confirm_det", 0): 0.820, ("run_confirm_det", 2): 0.320,
             ("run_confirm_stochastic_eps0.1", 0): 0.861, ("run_confirm_stochastic_eps0.1", 2): 0.566}   # 1f 보고 lay×dist(고리통제, maxQ)
EPS_FOLDER = "run_confirm_stochastic_eps0.1"
DET_FOLDERS = ["run_confirm_det"]

import os, json, time, gzip, glob, warnings
import numpy as np
warnings.filterwarnings("ignore")
T0 = time.time()


def setup_base():
    try:
        from google.colab import drive  # noqa
        if not os.path.isdir("/content/drive/MyDrive"):
            drive.mount("/content/drive", force_remount=False)
        base = "/content/drive/MyDrive/phase1_signals"
        if not os.path.isdir(base):
            raise RuntimeError("phase1_signals 폴더 없음")
        print(f"[저장] Google Drive {base}")
        return base
    except Exception as e:
        base = os.path.abspath("./phase1_signals")
        print(f"[저장] 로컬 {base} ({type(e).__name__})")
        return base


BASE = setup_base()


def strat_auroc(y, x, s):
    """층화 AUROC = Σ_층 U_층 / Σ_층 (n1_층·n0_층).  (Phase1d strat_auroc와 같은 정의)
    같은 층 안의 (양성, 음성) 쌍만 비교. 동점 0.5. 한 클래스만 있는 층은 쌍 0 → 기여 없음."""
    y = np.asarray(y, float); x = np.asarray(x, float); s = np.asarray(s, float)
    m = ~np.isnan(x)
    y, x, s = y[m], x[m], s[m]
    n = len(y)
    if n == 0:
        return float("nan")
    o = np.lexsort((x, s))
    y, x, s = y[o], x[o], s[o]
    new_s = np.r_[True, s[1:] != s[:-1]]
    new_g = new_s | np.r_[True, x[1:] != x[:-1]]
    pos = np.arange(n)
    sid = np.cumsum(new_s) - 1
    s_start = pos[new_s][sid]                     # 원소별: 자기 층의 시작 위치
    g_start = pos[new_g]
    g_cnt = np.diff(np.r_[g_start, n])
    g_rank = (g_start - s_start[g_start]) + (g_cnt + 1) / 2.0   # 층 안 평균 순위
    r = g_rank[np.cumsum(new_g) - 1]
    ns = sid[-1] + 1
    n1 = np.bincount(sid, weights=y, minlength=ns)
    nn = np.bincount(sid, minlength=ns).astype(float)
    U = np.bincount(sid, weights=r * y, minlength=ns) - n1 * (n1 + 1) / 2.0
    tot = (n1 * (nn - n1)).sum()
    return float(U.sum() / tot) if tot > 0 else float("nan")


def brute_strat_auroc(y, x, s):
    U = 0.0; T = 0.0
    for v in np.unique(s):
        m = s == v
        p, q = x[m][y[m] == 1], x[m][y[m] == 0]
        if len(p) and len(q):
            d = p[:, None] - q[None, :]
            U += (d > 0).sum() + 0.5 * (d == 0).sum(); T += len(p) * len(q)
    return U / T if T > 0 else float("nan")


# ------------------------------------------------------------------ 로딩
def _has_key(r):
    return bool(r["has_key"]) if "has_key" in r else r["phi"] > 50.0


def load_folder(folder):
    name = os.path.basename(folder.rstrip("/"))
    files = sorted(glob.glob(os.path.join(folder, "seeds", "seed*_k*.json.gz")))
    eps, pref = [], []
    for p in files:
        try:
            with gzip.open(p, "rt", encoding="utf-8") as f:
                d = json.load(f)
        except Exception as e:
            print(f"  [skip] {name}/{os.path.basename(p)} ({type(e).__name__})")
            continue
        seed, k = int(d["meta"]["seed"]), int(d["meta"]["k"])
        g = {}
        for r in d["rows"]:
            g.setdefault((int(r.get("depth", 2)), int(r["episode"])), []).append(r)
        del d
        for (dp, e), rs in g.items():
            rs.sort(key=lambda r: r["t"])
            eps.append(dict(seed=seed, k=k, depth=dp, ep=e, q0=float(rs[0]["S1a_maxq"]), phi0=float(rs[0]["phi"])))
            if len(rs) <= N + 1 or any(_has_key(r) for r in rs[:N + 1]):
                continue
            mq = [float(r["S1a_maxq"]) for r in rs[:N] if r["S1a_maxq"] is not None]
            if not mq:
                continue
            pref.append(dict(seed=seed, k=k, depth=dp, layout=e, y=int(any(_has_key(r) for r in rs[N + 1:])),
                             lf=int(all(r["S6_revisit"] == 0 for r in rs[:N + 1])),
                             x=mq[-1], d4=-float(rs[N - 1]["phi"])))
    return dict(name=name, eps=eps, pref=pref)


# ------------------------------------------------------------------ 문제 A: 모델 동일성
def run_vectors(eps, depth):
    out = {}
    for r in eps:
        if r["depth"] == depth:
            out.setdefault((r["seed"], r["k"]), {})[r["ep"]] = (r["q0"], r["phi0"])
    return out


def compare_vectors(A, Bv):
    common = sorted(set(A) & set(Bv))
    if len(common) < 5:
        return None
    a = np.array([A[e][0] for e in common]); b = np.array([Bv[e][0] for e in common])
    pa = np.array([A[e][1] for e in common]); pb = np.array([Bv[e][1] for e in common])
    r = float(np.corrcoef(a, b)[0, 1]) if a.std() > 0 and b.std() > 0 else float("nan")
    return dict(maxdiff=float(np.abs(a - b).max()), r=r, phi_same=bool(np.all(pa == pb)), n=len(common))


def model_identity(E, F, depth):
    VE, VF = run_vectors(E["eps"], depth), run_vectors(F["eps"], depth)
    if not VE or not VF:
        return None
    same, best_other, best_exact, rs, md = 0, 0, 0, [], []
    n = 0
    partners = {}
    for ke, ve in VE.items():
        cands = {kf: compare_vectors(ve, vf) for kf, vf in VF.items()}
        cands = {kf: c for kf, c in cands.items() if c}
        if not cands:
            continue
        n += 1
        if ke in cands:
            c = cands[ke]; rs.append(c["r"]); md.append(c["maxdiff"])
            same += int(c["maxdiff"] < EXACT)
        kb = min(cands, key=lambda kf: cands[kf]["maxdiff"])
        if cands[kb]["maxdiff"] < EXACT:
            best_exact += 1
            partners[kb] = ke
            if kb != ke:
                best_other += 1
    return dict(depth=depth, n_runs=n, same_key_exact=same, best_partner_exact=best_exact,
                best_partner_other_key=best_other,
                same_key_r_median=float(np.nanmedian(rs)) if rs else float("nan"),
                same_key_maxdiff_median=float(np.median(md)) if md else float("nan"))


def internal_check(F):
    """같은 폴더·같은 run·같은 레이아웃: depth0와 depth2의 t=0 maxQ는 (같은 모델이면) 같아야 한다."""
    V0, V2 = run_vectors(F["eps"], 0), run_vectors(F["eps"], 2)
    keys = sorted(set(V0) & set(V2))
    if not keys:
        return None
    ok = 0
    for k in keys:
        c = compare_vectors(V0[k], V2[k])
        ok += int(bool(c) and c["maxdiff"] < EXACT)
    return dict(n=len(keys), ok=ok)


# ------------------------------------------------------------------ 문제 B: run 간 vs run 내
def make_group(items):
    items = sorted(items, key=lambda r: (r["seed"], r["k"]))
    runs = sorted({(r["seed"], r["k"]) for r in items})
    ridx = {rk: i for i, rk in enumerate(runs)}
    G = dict(runs=runs, run=np.array([ridx[(r["seed"], r["k"])] for r in items], int),
             y=np.array([r["y"] for r in items], float), x=np.array([r["x"] for r in items], float),
             lay=np.array([r["layout"] for r in items], float), d4=np.array([r["d4"] for r in items], float),
             kk=np.array([r["k"] for r in items], float))
    nrun = len(runs)
    cnt = np.bincount(G["run"], minlength=nrun).astype(float)
    mean = np.bincount(G["run"], weights=G["x"], minlength=nrun) / cnt
    G["xm"] = mean[G["run"]]                       # run 평균 (between 성분)
    G["xc"] = G["x"] - G["xm"]                     # run 평균 제거 (within 성분)
    G["pos_rate"] = np.bincount(G["run"], weights=G["y"], minlength=nrun) / cnt
    G["run_mean"], G["run_cnt"] = mean, cnt
    G["sizes"] = cnt.astype(int); G["starts"] = np.cumsum(G["sizes"]) - G["sizes"]
    G["n_ep"], G["n_pos"], G["n_run"] = len(items), int(G["y"].sum()), nrun
    sst = ((G["x"] - G["x"].mean()) ** 2).sum()
    G["eta2"] = float(((G["xm"] - G["x"].mean()) ** 2).sum() / sst) if sst > 0 else float("nan")
    return G


def draw_idx(G, pick):
    pick = np.asarray(pick, int)
    st, sz = G["starts"][pick], G["sizes"][pick]
    tot = int(sz.sum())
    off = np.repeat(np.cumsum(sz) - sz, sz)
    return np.arange(tot) - off + np.repeat(st, sz), np.repeat(np.arange(len(pick)), sz)


def stats_on(G, idx, rid):
    y, d, lay, kk = G["y"][idx], G["d4"][idx], G["lay"][idx], G["kk"][idx]
    lxd = lay * 100 + d
    return dict(lxd=strat_auroc(y, G["x"][idx], lxd),
                kxd=strat_auroc(y, G["x"][idx], kk * 1000 + d),
                within=strat_auroc(y, G["xc"][idx], lxd),
                between=strat_auroc(y, G["xm"][idx], lxd),
                rxd=strat_auroc(y, G["x"][idx], rid * 1000.0 + d))


def spearman(a, b):
    from scipy.stats import rankdata
    if len(a) < 5 or np.std(a) == 0 or np.std(b) == 0:
        return float("nan")
    ra, rb = rankdata(a), rankdata(b)
    return float(np.corrcoef(ra, rb)[0, 1])


def analyze_group(G, rng):
    all_idx = np.arange(G["n_ep"])
    st = stats_on(G, all_idx, G["run"])
    out = {k: dict(v=st[k]) for k in st}
    big = G["run_cnt"] >= 5
    out["run_spearman"] = dict(v=spearman(G["run_mean"][big], G["pos_rate"][big]), n=int(big.sum()))
    out["eta2"] = G["eta2"]
    out.update(n_ep=G["n_ep"], n_pos=G["n_pos"], n_run=G["n_run"])
    if G["n_run"] >= MIN_CLUSTERS and 2 <= G["n_pos"] < G["n_ep"]:
        bag = {k: [] for k in st}; bag_sp = []
        for _ in range(B):
            pick = rng.randint(0, G["n_run"], G["n_run"])
            idx, rid = draw_idx(G, pick)
            s = stats_on(G, idx, rid)
            for k in bag:
                bag[k].append(s[k])
            m = G["run_cnt"][pick] >= 5
            bag_sp.append(spearman(G["run_mean"][pick][m], G["pos_rate"][pick][m]))
        for k in bag:
            v = np.array([a for a in bag[k] if not np.isnan(a)])
            out[k]["ci"] = [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] if len(v) > B * 0.5 else [float("nan")] * 2
        v = np.array([a for a in bag_sp if not np.isnan(a)])
        out["run_spearman"]["ci"] = [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] if len(v) > B * 0.5 else [float("nan")] * 2
        # run×dist 순열 검정: run×dist 층 안에서 라벨을 섞는다 (귀무: run 안에서 maxQ와 무관)
        s_rd = G["run"] * 1000.0 + G["d4"]
        o = np.argsort(s_rd, kind="stable")
        ys = G["y"][o]
        null = []
        for _ in range(NPERM):
            idx = np.lexsort((rng.random(G["n_ep"]), s_rd))
            yp = np.empty(G["n_ep"]); yp[idx] = ys
            null.append(strat_auroc(yp, G["x"], s_rd))
        null = np.array(null)
        obs = st["rxd"]
        out["rxd_perm"] = dict(null_mean=float(np.nanmean(null)), null_lo=float(np.nanpercentile(null, 2.5)),
                               null_hi=float(np.nanpercentile(null, 97.5)),
                               p_two=float((np.sum(np.abs(null - 0.5) >= abs(obs - 0.5) - 1e-12) + 1) / (len(null) + 1)))
    return out


def fmt(o, star_ok=True):
    if not isinstance(o, dict):
        return "nan" if o is None or (isinstance(o, float) and np.isnan(o)) else f"{o:.3f}"
    v = o["v"]
    if "ci" in o and not np.isnan(o["ci"][0]):
        star = "*" if (star_ok and (o["ci"][0] > 0.5 or o["ci"][1] < 0.5)) else ""
        return f"{v:.3f}[{o['ci'][0]:.2f},{o['ci'][1]:.2f}]{star}"
    return f"{v:.3f}"


def label(r):
    """자동 라벨 (규칙: between이 전체 신호의 대부분이고 within CI가 0.5를 포함하면 'run 간 지배')."""
    if r["n_pos"] < MIN_POS:
        return "미확정(양성<30)"
    if "ci" not in r["within"]:
        return "판정 불가"
    tot = r["lxd"]["v"] - 0.5
    btw = r["between"]["v"] - 0.5
    wlo, whi = r["within"]["ci"]
    if wlo > 0.5:
        return "run 내에도 신호 존재"
    if whi < 0.5:
        return "run 내에서는 역방향"
    if tot > 0.05 and btw >= 0.7 * tot:
        return "run 간 차이가 신호의 대부분 (run 내는 검출 안 됨)"
    return "혼합/판정 불가 (run 내 검출 안 됨, run 간도 뚜렷하지 않음)"


# ------------------------------------------------------------------ 1i = 1h 분석을 1f 폴더에 적용
EXPECT_KXD = {}


def pcorr(a, b):
    a = np.asarray(a, float); b = np.asarray(b, float)
    if len(a) < 5 or a.std() == 0 or b.std() == 0:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def resid_vecs(V):
    acc = {}
    for v in V.values():
        for e, (q, _) in v.items():
            acc.setdefault(e, []).append(q)
    mu = {e: float(np.mean(a)) for e, a in acc.items()}
    return {k: {e: (q - mu[e], p) for e, (q, p) in v.items()} for k, v in V.items()}


def rel_of(ke, kd):
    if ke == kd:
        return "same"
    if ke[0] == kd[0]:
        return "same_seed"
    if ke[1] == kd[1]:
        return "same_k"
    return "other"


def lineage(VE, VD):
    """ε run마다 결정론 run 전체와 t=0 maxQ 벡터 상관을 계산하고 관계(seed,k)별로 요약."""
    out = {}
    for tag, (A, Bv) in {"raw": (VE, VD), "resid": (resid_vecs(VE), resid_vecs(VD))}.items():
        per = {r: [] for r in ("same", "same_seed", "same_k", "other")}
        top = []; n = 0
        for ke, ve in A.items():
            cs = {}
            for kd, vd in Bv.items():
                com = sorted(set(ve) & set(vd))
                if len(com) < 5:
                    continue
                cs[kd] = pcorr([ve[e][0] for e in com], [vd[e][0] for e in com])
            cs = {k: c for k, c in cs.items() if not np.isnan(c)}
            if not cs:
                continue
            n += 1
            for r in per:
                v = [c for kd, c in cs.items() if rel_of(ke, kd) == r]
                if v:
                    per[r].append(float(np.mean(v)))
            if ke in cs:
                top.append(int(cs[ke] >= max(cs.values()) - 1e-12))
        out[tag] = dict(n=n, top_share=float(np.mean(top)) if top else float("nan"),
                        **{r: (float(np.median(v)) if v else float("nan")) for r, v in per.items()})
    return out


def lineage_diag(L):
    d = L["resid"]["same"] - L["resid"]["other"]
    if np.isnan(d):
        return "판정 불가"
    sd = L["resid"]["same_seed"] - L["resid"]["other"]
    sk = L["resid"]["same_k"] - L["resid"]["other"]
    if d >= 0.3:
        return "→ 같은 (seed,k) 짝에서만 레이아웃 효과를 뺀 뒤에도 상관이 뚜렷함: 같은 초기화·학습 계열 가능성 (그래도 값은 다름)."
    if d >= 0.1 or sd >= 0.1:
        return "→ 약한 계통 일치(레이아웃 효과를 뺀 뒤 same/same_seed가 other보다 약간 높음). 단정 불가."
    return "→ 계통 일치 증거 없음: 높은 상관(raw)은 레이아웃 구조 때문이고, 같은 (seed,k)라는 증거는 아님. 사실상 별개 모델."


def make_group_h(items):
    G = make_group(items)
    kk, x = G["kk"], G["x"]
    G["xk"] = np.zeros_like(x)
    for kv in np.unique(kk):
        m = kk == kv
        G["xk"][m] = x[m].mean()
    G["xr"] = x - G["xk"]
    # seed 효과: run 평균에서 같은 k의 run 평균을 뺀 값(같은 k 안에서 seed 간 차이)
    km = np.zeros_like(G["xm"])
    for kv in np.unique(kk):
        m = kk == kv
        km[m] = np.mean([G["run_mean"][i] for i in range(G["n_run"]) if G["runs"][i][1] == kv])
    rm = G["xm"]
    G["xs"] = rm - km
    return G


def stats_h(G, idx):
    y, lay, d = G["y"][idx], G["lay"][idx], G["d4"][idx]
    kk = G["kk"][idx]
    lxd = lay * 100 + d; kxd = kk * 1000 + d
    return dict(total=strat_auroc(y, G["x"][idx], lxd), kscore=strat_auroc(y, kk, lxd),
                kmean=strat_auroc(y, G["xk"][idx], lxd), resk=strat_auroc(y, G["xr"][idx], lxd),
                kxd=strat_auroc(y, G["x"][idx], kxd), seed_in_k=strat_auroc(y, G["xm"][idx], kxd),
                seedres=strat_auroc(y, G["xs"][idx], kxd))


def analyze_h(G, rng):
    st = stats_h(G, np.arange(G["n_ep"]))
    out = {k: dict(v=v) for k, v in st.items()}
    out.update(n_ep=G["n_ep"], n_pos=G["n_pos"], n_run=G["n_run"])
    if G["n_run"] >= MIN_CLUSTERS and 2 <= G["n_pos"] < G["n_ep"]:
        bag = {k: [] for k in st}
        for _ in range(B):
            pick = rng.randint(0, G["n_run"], G["n_run"])
            idx, _r = draw_idx(G, pick)
            s = stats_h(G, idx)
            for k in bag:
                bag[k].append(s[k])
        for k in bag:
            v = np.array([a for a in bag[k] if not np.isnan(a)])
            out[k]["ci"] = [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] if len(v) > B * 0.5 \
                else [float("nan")] * 2
    # k별 기술통계 + k 안에서 run 수준 Spearman
    per_k = {}
    for kv in sorted(set(r[1] for r in G["runs"])):
        ids = [i for i in range(G["n_run"]) if G["runs"][i][1] == kv]
        rm = np.array([G["run_mean"][i] for i in ids]); pr = np.array([G["pos_rate"][i] for i in ids])
        ne = int(sum(G["run_cnt"][i] for i in ids))
        per_k[int(kv)] = dict(n_run=len(ids), n_ep=ne,
                              pos_rate=float(sum(G["pos_rate"][i] * G["run_cnt"][i] for i in ids) / ne) if ne else float("nan"),
                              mean_maxq=float(np.mean(rm)), spearman=spearman(rm, pr))
    out["per_k"] = per_k
    return out


def label_h(R):
    if R["n_pos"] < MIN_POS:
        return "미확정(양성<30)"
    t = R["total"]
    if "ci" not in t or np.isnan(t["ci"][0]):
        return "판정 불가(CI 없음)"
    if t["ci"][0] <= 0.5:
        return "전체 신호가 0.5와 구분 안 됨(분해 대상 아님)"
    share = (R["kmean"]["v"] - 0.5) / (t["v"] - 0.5)
    s_ci = R["seed_in_k"].get("ci", [float("nan")] * 2)
    k_ci = R["kxd"].get("ci", [float("nan")] * 2)
    if share >= 0.7 and s_ci[0] <= 0.5 <= s_ci[1] and k_ci[0] <= 0.5 <= k_ci[1]:
        return "신호의 대부분이 k(학습 설정)로 설명됨 (같은 k 안에서는 seed 간·run 내 신호 없음)"
    if s_ci[0] > 0.5:
        return "같은 k 안에서도 seed(run) 간 차이가 신호로 남음"
    return "혼합/판정 불가 (k가 일부 설명하나 단정할 수 없음)"


def fmt2(o):
    return fmt(o) if isinstance(o, dict) else str(o)


# ------------------------------------------------------------------ 실행
print("=" * 78)
print("  Phase 1i | A: ε와 결정론의 계통(레이아웃 효과 제거) · B: maxQ 신호가 k(학습 설정)인가")
print("=" * 78)
D = {}
for nm in DET_FOLDERS + [EPS_FOLDER]:
    p = os.path.join(BASE, nm)
    if not os.path.isdir(p):
        print(f"  [없음] {nm}"); continue
    t = time.time(); D[nm] = load_folder(p)
    print(f"  [load] {nm}: 에피소드 {len(D[nm]['eps'])} | N스텝 표본 {len(D[nm]['pref'])} | {time.time()-t:.0f}s")
RES = {"A": {}, "B": {}, "self": {}}

print("\n" + "#" * 78 + "\n  문제 A'. ε와 결정론 run의 t=0 maxQ 상관: 관계별(같은 seed·k / 같은 seed / 같은 k / 그 외)\n" + "#" * 78)
print("  raw = 그대로의 상관, resid = 에피소드(레이아웃)별 평균을 뺀 뒤의 상관. 레이아웃이 비슷해서 생기는 상관을 걸러내려는 것.")
print("  top = 같은 (seed,k) 짝이 결정론 run 중 가장 높은 상관인 ε run 비율 (무작위면 1/run수)")
phi_checks = []
if EPS_FOLDER in D:
    for nm in DET_FOLDERS:
        if nm not in D:
            continue
        dp = 0 if (run_vectors(D[nm]["eps"], 0) and run_vectors(D[EPS_FOLDER]["eps"], 0)) else 2
        VE, VD = run_vectors(D[EPS_FOLDER]["eps"], dp), run_vectors(D[nm]["eps"], dp)
        if not VE or not VD:
            continue
        for ke, ve in VE.items():           # 같은 에피소드 번호가 같은 레이아웃인지(phi0 일치) 확인
            if ke in VD:
                c = compare_vectors(ve, VD[ke]); phi_checks.append(bool(c and c["phi_same"]))
        L = lineage(VE, VD); dg = lineage_diag(L)
        RES["A"][f"{EPS_FOLDER}|{nm}|d{dp}"] = dict(L, diagnosis=dg, nE=len(VE), nD=len(VD))
        print(f"\n  [ε vs {nm} | depth{dp}] ε {len(VE)}개 × 결정론 {len(VD)}개")
        for tg in ("raw", "resid"):
            q = L[tg]
            print(f"     {tg:5s} 중앙값 상관: same={q['same']:.3f} same_seed={q['same_seed']:.3f} "
                  f"same_k={q['same_k']:.3f} other={q['other']:.3f} | top={q['top_share']:.3f}")
        print("     " + dg)
    if phi_checks:
        print(f"\n  레이아웃 대응 점검(같은 (seed,k) 짝에서 에피소드별 시작 거리 phi0 전부 일치): {sum(phi_checks)}/{len(phi_checks)}")

print("\n" + "#" * 78 + "\n  문제 B'. maxQ_last 신호는 k(학습 설정)로 설명되는가? (lay×dist 층화, * = 95% CI가 0.5를 벗어남)\n" + "#" * 78)
print("  total = maxQ | kscore = k 자체를 점수로 | kmean = 각 k의 평균 maxQ만 쓴 점수 | resk = maxQ에서 k 평균을 뺀 값")
print("  kxd = 같은 k끼리 비교 | seed_in_k = 같은 k에서 run 평균만(seed 간 차이) | seedres = 같은 k 안에서 run 평균의 k 평균 대비 편차")
rng = np.random.RandomState(0)
SUMM = []
for nm, F in D.items():
    for dp in sorted({r["depth"] for r in F["pref"]}):
        if dp == 1:
            continue
        for cond in ("lf", "all"):
            if cond == "all" and nm != EPS_FOLDER:
                continue
            items = [r for r in F["pref"] if r["depth"] == dp and (cond == "all" or r["lf"] == 1)]
            if len(items) < 20:
                continue
            t = time.time(); G = make_group_h(items); R = analyze_h(G, rng); lab = label_h(R)
            RES["B"][f"{nm}|d{dp}|{cond}"] = dict(R, label=lab)
            flag = "  ** 양성<30: 미확정 **" if R["n_pos"] < MIN_POS else ""
            print(f"\n  [{nm} | depth{dp} | {'고리통제' if cond=='lf' else '전체'}] 에피소드 {R['n_ep']} 양성 {R['n_pos']} run {R['n_run']}{flag}")
            for key, nmk in (("total", "total (maxQ)"), ("kscore", "kscore (k만)"), ("kmean", "kmean (k평균 maxQ)"),
                             ("resk", "resk (k 제거 maxQ)"), ("kxd", "kxd (같은 k)"),
                             ("seed_in_k", "seed_in_k"), ("seedres", "seedres")):
                print(f"     {nmk:22s} {fmt2(R[key])}")
            print("     k별: " + " | ".join(f"k={k}: run {v['n_run']} 양성률 {v['pos_rate']:.2f} maxQ {v['mean_maxq']:.2f} ρ={v['spearman']:.2f}"
                                          for k, v in R["per_k"].items()))
            print(f"     → {lab}   ({time.time()-t:.0f}s)")
            SUMM.append((nm, dp, cond, R, lab))

print("\n" + "#" * 78 + "\n  자체 점검\n" + "#" * 78)
rs = np.random.RandomState(1); bad = 0
for _ in range(200):
    n = rs.randint(5, 60)
    y = (rs.rand(n) < 0.4).astype(float); x = np.round(rs.randn(n), 1); s = rs.randint(0, 5, n).astype(float)
    a, b = strat_auroc(y, x, s), brute_strat_auroc(y, x, s)
    if not (np.isnan(a) and np.isnan(b)) and abs(a - b) > 1e-12:
        bad += 1
print(f"  ① strat_auroc vs 무차별 쌍 비교 (200세트): 불일치 {bad}건 → {'OK' if bad == 0 else '실패'}")
RES["self"]["brute"] = bad
rep = []; okall = True
for (nm, dp), exp in EXPECT_1E.items():
    if nm not in D:
        rep.append(f"{nm} depth{dp}: 데이터 없음"); okall = False; continue
    G = make_group_h([r for r in D[nm]["pref"] if r["depth"] == dp and r["lf"] == 1])
    v = stats_h(G, np.arange(G["n_ep"]))["total"]; ok = abs(v - exp) < 0.0015; okall &= ok
    rep.append(f"{nm} depth{dp} total: 기대 {exp:.3f} / 재계산 {v:.3f} {'OK' if ok else '불일치'}")
print("  ② 1e 값 재현:"); [print("     " + l) for l in rep]
rep2 = []
for (nm, dp), exp in EXPECT_KXD.items():
    if nm not in D:
        rep2.append(f"{nm} depth{dp}: 데이터 없음"); okall = False; continue
    G = make_group_h([r for r in D[nm]["pref"] if r["depth"] == dp and r["lf"] == 1])
    v = stats_h(G, np.arange(G["n_ep"]))["kxd"]; ok = abs(v - exp) < 0.0015; okall &= ok
    rep2.append(f"{nm} depth{dp} kxd: 1g 보고 {exp:.3f} / 재계산 {v:.3f} {'OK' if ok else '불일치'}")
print("  ③ 1g의 kxd 재현:"); [print("     " + l) for l in rep2]
RES["self"]["repro"] = rep + rep2; RES["self"]["all_ok"] = bool(okall and bad == 0)
print(f"  ④ 레이아웃 대응(phi0) 점검은 문제 A' 아래 줄 참고 (전부 일치해야 raw/resid 상관을 믿을 수 있음)")


def _js(o):
    if isinstance(o, dict):
        return {str(k): _js(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_js(v) for v in o]
    if isinstance(o, (np.floating, float)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return o


outp = os.path.join(BASE, "analysis_phase1i.json")
try:
    with open(outp, "w") as f:
        json.dump(_js(RES), f, ensure_ascii=False, indent=1)
    print(f"\n[저장] {outp} | 총 {time.time()-T0:.0f}s")
except Exception as e:
    print(f"[저장 실패] {type(e).__name__}: {e}")

print("\n===== 보고서용 요약 (이 블록을 그대로 보내주세요) =====")
for key, v in RES["A"].items():
    print(f"A {key} nE={v['nE']} nD={v['nD']} raw(same/seed/k/other)={v['raw']['same']:.3f}/{v['raw']['same_seed']:.3f}/{v['raw']['same_k']:.3f}/{v['raw']['other']:.3f} "
          f"resid={v['resid']['same']:.3f}/{v['resid']['same_seed']:.3f}/{v['resid']['same_k']:.3f}/{v['resid']['other']:.3f} top={v['resid']['top_share']:.3f} | {v['diagnosis']}")
print(f"P phi0일치 {sum(phi_checks)}/{len(phi_checks)}")
for nm, dp, cond, R, lab in SUMM:
    print(f"B {nm} d{dp} {cond} ep={R['n_ep']} pos={R['n_pos']} run={R['n_run']} | total={fmt2(R['total'])} kscore={fmt2(R['kscore'])} kmean={fmt2(R['kmean'])} "
          f"resk={fmt2(R['resk'])} kxd={fmt2(R['kxd'])} seed_in_k={fmt2(R['seed_in_k'])} seedres={fmt2(R['seedres'])} | "
          + " ; ".join(f"k{k}:pos{v['pos_rate']:.2f},Q{v['mean_maxq']:.2f},ρ{v['spearman']:.2f}" for k, v in R["per_k"].items()) + f" | {lab}")
print("S brute_bad=%d all_ok=%s | %s" % (bad, RES["self"]["all_ok"], "; ".join(rep + rep2)))
