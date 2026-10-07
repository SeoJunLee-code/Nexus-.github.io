# ==============================================================================
# Paper 5 — Phase 1j: 1i와 같은 분해를 k=8/32만으로 (k=2 제외)  (분석 전용 · CPU · 새 로깅 없음)
# ==============================================================================
# 질문: k=2(거의 미학습)를 빼고 "학습된 모델 사이"만 보면 maxQ가 성공을 예측하는가? (1i의 det d0 잔여 0.597[0.50,0.69]가 실재하는가)
# 방식: 검증된 1i 원본(SHA-256)을 읽어 '문제 B의 표본에서 k∉{8,32} 제외' + '출력 파일명' 두 곳만 패치해 그대로 실행한다.
#       자체 점검 ②(1f 값 재현)는 k 전체로 계산되므로 그대로 유효하다. 문제 A'(계통 상관)는 1i 그대로 다시 나온다(무시).
# 사전 고정(실행 전): 아래 PREREG 문자열. 주 판정은 det·depth0·고리통제 한 조건뿐이고, 나머지는 탐색적이다.
# ==============================================================================
import os, glob, hashlib

SRC_NAME = "Paper5_Phase1i_cell.py"
SRC_SHA = "83fa18eb4167d10796d9776efb246948b799367c28bd2e2dbeb4e2905a9bc538"
KEEP_K = (8, 32)
PREREG = ("1j | 주 조건: run_confirm_det, depth0, 고리통제, k in {8,32}. "
          "resk(k 평균을 뺀 maxQ)와 kxd(같은 k끼리) 두 값의 95% CI(run 부트스트랩) 하한이 모두 0.5 초과이면 '잔여 신호 검출', "
          "아니면 '검출되지 않음(부재의 증명이 아님)'. 그 밖의 조건(ε d0, det d2, ε d2)은 탐색적이며 주장 근거로 쓰지 않는다. "
          "k별 run 20개씩 40개라 CI 반폭이 약 0.1이므로 약 0.6 미만의 효과는 구분하지 못한다.")
PREREG_SHA = hashlib.sha256(PREREG.encode()).hexdigest()[:12]

_cands = (glob.glob("/content/drive/MyDrive/Colab Notebooks/" + SRC_NAME)
          or glob.glob("/content/drive/MyDrive/**/" + SRC_NAME, recursive=True)
          or glob.glob(os.path.join(os.getcwd(), SRC_NAME)))
assert _cands, SRC_NAME + " 파일을 찾지 못했습니다."
_src = open(_cands[0], encoding="utf-8").read()
_ok = hashlib.sha256(_src.rstrip().encode()).hexdigest() == SRC_SHA
print("[1j loader] 1i 원본", _cands[0], "| 무결성", "OK" if _ok else "불일치")
assert _ok, "1i 원본이 검증본과 다릅니다. 패치하지 않고 멈춥니다."

_OLD1 = 'items = [r for r in F["pref"] if r["depth"] == dp and (cond == "all" or r["lf"] == 1)]'
_NEW1 = 'items = [r for r in F["pref"] if r["depth"] == dp and (cond == "all" or r["lf"] == 1) and r["k"] in KEEP_K]'
_OLD2 = '"analysis_phase1i.json"'
_NEW2 = '"analysis_phase1j.json"'
for _o, _n in ((_OLD1, _NEW1), (_OLD2, _NEW2)):
    assert _src.count(_o) == 1, "패치 대상 문자열이 정확히 1번 나오지 않습니다: " + _o[:40]
    _src = _src.replace(_o, _n)

print("=" * 78)
print(" Phase 1j | 1i 분해를 k in %s 로 제한 (k=2 제외) | PREREG %s" % (list(KEEP_K), PREREG_SHA))
print(" " + PREREG)
print("=" * 78)
exec(compile(_src, "Paper5_Phase1i_cell.py(patched->1j)", "exec"), globals())


# ------------------------------------------------------------------ 1j 판정 (사전 고정 규칙)
def _lo(o):
    ci = o.get("ci") if isinstance(o, dict) else None
    return ci[0] if ci and not np.isnan(ci[0]) else float("nan")


print("\n" + "#" * 78 + "\n 1j 판정 (사전 고정 규칙)\n" + "#" * 78)
_key = DET_FOLDERS[0] + "|d0|lf"
_R = RES["B"].get(_key)
_J = []
if _R is None:
    _line = "J 주 조건 데이터 없음 (%s)" % _key
else:
    _per = " ; ".join("k%d:run%d,pos%.2f,Q%.2f,rho%.2f" % (k, v["n_run"], v["pos_rate"], v["mean_maxq"], v["spearman"])
                      for k, v in _R["per_k"].items())
    _rl, _kl = _lo(_R["resk"]), _lo(_R["kxd"])
    if np.isnan(_rl) or np.isnan(_kl) or _R["n_pos"] < MIN_POS:
        _dec = "판정 불가(CI 없음 또는 양성<30)"
    elif _rl > 0.5 and _kl > 0.5:
        _dec = "잔여 신호 검출 (resk·kxd 하한 모두 > 0.5)"
    else:
        _dec = "검출되지 않음 (부재의 증명이 아님)"
    _w = (_R["resk"]["ci"][1] - _R["resk"]["ci"][0]) if "ci" in _R["resk"] else float("nan")
    _line = ("J primary det d0 lf: run=%d pos=%d | total=%s kscore=%s resk=%s kxd=%s seed_in_k=%s | resk CI폭=%.2f | %s | %s | PREREG %s"
             % (_R["n_run"], _R["n_pos"], fmt2(_R["total"]), fmt2(_R["kscore"]), fmt2(_R["resk"]),
                fmt2(_R["kxd"]), fmt2(_R["seed_in_k"]), _w, _per, _dec, PREREG_SHA))
print(_line)
print("\n===== 1j 보고서용 요약 (위 '보고서용 요약' 블록 전체와 이 J 줄을 함께 보내주세요) =====")
print(_line)
