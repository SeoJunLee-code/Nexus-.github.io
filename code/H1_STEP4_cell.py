# ============================================================================
#  H1 통합 셀  —  전체 복사해서 셀 하나에 붙이고 실행
#  맨 아래 STEP 숫자 하나만 고르면 끝. 나머지는 전부 자동.
#  실행이 끝나면 분석과 그림까지 자동으로 이어서 돌아간다.
#  런타임이 끊기면 같은 셀을 다시 실행하면 이어서 진행된다.
# ============================================================================
#
#   STEP = 0  ->  분석 + 그림만 (GPU 불필요, 30초)
#   STEP = 1  ->  MATH-500 Level 3~4 / 1.5B        (약 90분)  [완료됨]
#   STEP = 2  ->  GSM8K / 1.5B  (대조군)            (약 40분)   [완료됨]
#   STEP = 3  ->  MATH-500 Level 3~4 / 3B  (확장)   (약 150분)  [완료됨]
#   STEP = 4  ->  GSM8K / 3B    (확장 대조군)        (약 70분)
#
STEP = 4
# ============================================================================

N_SAMPLES, MAX_PROBLEMS = 16, 120
MAX_NEW_TOKENS, TEMPERATURE, TOP_P = 1024, 0.7, 0.95
GEN_CHUNK, TIME_LIMIT_MIN, SEED = 16, 170, 1234

PLAN = {
    1: ("Qwen/Qwen2.5-1.5B-Instruct", "math500", ('3', '4')),
    2: ("Qwen/Qwen2.5-1.5B-Instruct", "gsm8k",   ('NA',)),
    3: ("Qwen/Qwen2.5-3B-Instruct",   "math500", ('3', '4')),
    4: ("Qwen/Qwen2.5-3B-Instruct",   "gsm8k",   ('NA',)),
}

import re, json, os, time, math, glob, random
from collections import Counter

# ============================ 1. 순수 함수 ============================
def extract_boxed(t):
    i = t.rfind('\\boxed')
    if i == -1: return None
    i += 6
    while i < len(t) and t[i] == ' ': i += 1
    if i >= len(t): return None
    if t[i] != '{':
        m = re.match(r'[^\s$\\]+', t[i:]); return m.group(0) if m else None
    d, s = 0, i + 1
    for j in range(i, len(t)):
        if t[j] == '{': d += 1
        elif t[j] == '}':
            d -= 1
            if d == 0: return t[s:j]
    return None

def extract2(t):
    """(답, 출처). boxed / hash = 유효표, lastnum = 무효표, none = 답 없음"""
    if not isinstance(t, str): return None, 'none'
    b = extract_boxed(t)
    if b is not None: return b.strip(), 'boxed'
    m = re.findall(r'####\s*([^\n]+)', t)
    if m: return m[-1].strip(), 'hash'
    n = re.findall(r'-?\d[\d,]*\.?\d*', t)
    if n: return n[-1].strip(), 'lastnum'
    return None, 'none'

_PAT = [(r'\\left',''),(r'\\right',''),(r'\\!',''),(r'\\,',''),(r'\\;',''),
        (r'\\dfrac',r'\\frac'),(r'\\tfrac',r'\\frac'),(r'\\%',''),(r'%',''),
        (r'\^\{?\\circ\}?',''),(r'\\\$',''),(r'\$',''),
        (r'\\mbox\{[^}]*\}',''),(r'\\text\{([^}]*)\}',r'\1')]

def normalize(a):
    if a is None: return None
    s = str(a).strip()
    for p, r in _PAT: s = re.sub(p, r, s)
    s = s.replace(' ', '').rstrip('.').strip()
    while re.search(r'\d,\d{3}', s): s = re.sub(r'(\d),(\d{3})', r'\1\2', s)
    s = re.sub(r'^\+', '', s)
    try:
        f = float(s); return str(int(f)) if f == int(f) else repr(f)
    except ValueError: pass
    for _ in range(3):
        s2 = re.sub(r'\\frac\{([^{}]+)\}\{([^{}]+)\}', r'\1/\2', s)
        if s2 == s: break
        s = s2
    return s if s else None

def is_correct(p, g):
    p, g = normalize(p), normalize(g)
    return p is not None and g is not None and p == g

def majority_vote(a):
    v = [x for x in a if x is not None]
    if not v: return None, 0, False, 0
    top = Counter(v).most_common(); b = top[0][1]
    return top[0][0], b, sum(1 for _, n in top if n == b) > 1, len(v)

def build_record(prob, texts, lens, cap):
    pairs  = [extract2(t) for t in texts]
    raw    = [a for a, _ in pairs]
    src    = [s for _, s in pairs]
    strict = [a if s in ('boxed', 'hash') else None for a, s in zip(raw, src)]
    fl     = [is_correct(a, prob['gold']) for a in strict]
    maj, cnt, tied, valid = majority_vote(strict)
    return {'problem_id': prob['id'], 'gold': prob['gold'],
            'answers': strict, 'answers_raw': raw, 'sources': src, 'gen_lens': lens,
            'correct_flags': fl, 'p_single': sum(fl)/len(fl) if fl else 0.0,
            'n_boxed': sum(1 for s in src if s == 'boxed'),
            'n_fallback': sum(1 for s in src if s == 'lastnum'),
            'n_cap': sum(1 for L in lens if L >= cap),
            'majority': maj, 'maj_count': cnt, 'maj_tied': tied, 'n_valid': valid,
            'maj_correct': is_correct(maj, prob['gold']),
            'maj_correct_loose': is_correct(majority_vote(raw)[0], prob['gold']),
            'n_distinct': len(set(a for a in strict if a is not None))}

def ensure_clean_tail(path):
    if not os.path.exists(path) or os.path.getsize(path) == 0: return 0
    d = open(path, 'rb').read()
    if d.endswith(b'\n'): return 0
    c = d.rfind(b'\n'); open(path, 'wb').write(d[:c+1] if c != -1 else b'')
    return len(d) - (c + 1)

def load_done(path):
    s = set()
    if not os.path.exists(path): return s
    for line in open(path, encoding='utf-8'):
        t = line.strip()
        if not t: continue
        try: s.add(json.loads(t)['problem_id'])
        except Exception: pass
    return s

# ============================ 2. 자체 테스트 ============================
def selftest():
    f = []
    def ck(k, g, e):
        if g != e: f.append(f"{k}: {g!r} != {e!r}")
    ck('b1', extract2("so \\boxed{42}"), ('42','boxed'))
    ck('b2', extract2("\\boxed{\\frac{\\sqrt{3}}{2}}"), ('\\frac{\\sqrt{3}}{2}','boxed'))
    ck('b3', extract2("a \\boxed{1} b \\boxed{7}"), ('7','boxed'))
    ck('b4', extract2("\\boxed{p - q}"), ('p - q','boxed'))
    ck('h1', extract2("blah #### 18"), ('18','hash'))
    ck('f1', extract2("step 1: 12 step 2: cut"), ('2','lastnum'))
    ck('f2', extract2("no numbers here"), (None,'none'))
    ck('f3', extract2(None), (None,'none'))
    ck('e1', is_correct('\\dfrac{1}{2}','\\frac{1}{2}'), True)
    ck('e2', is_correct('1/2','\\frac{1}{2}'), True)
    ck('e3', is_correct('1,000','1000'), True)
    ck('e4', is_correct('0.50','0.5'), True)
    ck('e5', is_correct('$42$','42'), True)
    ck('e6', is_correct('90^\\circ','90'), True)
    ck('e7', is_correct('2/4','1/2'), False)
    ck('e8', is_correct(None,'5'), False)
    ck('m1', majority_vote(['a']*9+['b']*7), ('a',9,False,16))
    ck('m2', majority_vote(['a']*8+['b']*8)[2], True)
    ck('m3', majority_vote([None]*16), (None,0,False,0))
    ck('m4', majority_vote(['a']*3+[None]*13), ('a',3,False,3))
    r = build_record({'id':'t','gold':'\\frac{1}{2}'},
                     ["\\boxed{\\frac{1}{2}}","\\boxed{1/2}","step 3 then 9","\\boxed{7}"],
                     [10,10,512,10], 512)
    ck('r1', r['n_valid'], 3); ck('r2', round(r['p_single'],3), 0.5)
    ck('r3', r['n_fallback'], 1); ck('r4', r['n_cap'], 1)
    ck('r5', r['maj_correct'], True); ck('r6', r['n_boxed'], 3)
    if f:
        print(f"[SELFTEST] {len(f)}개 실패"); [print("  ", x) for x in f]
        raise SystemExit("자체 테스트 실패 -> 중단 (GPU 사용 안 함)")
    print("[SELFTEST] 26개 항목 전부 통과")

# ============================ 3. 저장소 ============================
def setup_storage(sub="h1_results"):
    try:
        from google.colab import drive
        drive.mount('/content/drive', force_remount=False)
        d = os.path.join('/content/drive/MyDrive', sub); os.makedirs(d, exist_ok=True)
        t = os.path.join(d, '.wt'); open(t,'w').write('ok'); os.remove(t)
        print(f"[storage] drive {d}"); return d
    except Exception as e:
        print(f"[storage] Drive 사용 불가: {type(e).__name__}: {e}")
    d = os.path.join('/content', sub); os.makedirs(d, exist_ok=True)
    print(f"[storage] local {d}  ** 런타임 끊기면 사라짐 **"); return d

# ============================ 4. 생성 ============================
def do_run(OUT_DIR):
    selftest()
    import torch
    if not torch.cuda.is_available():
        raise SystemExit(f"GPU 없음 (torch {torch.__version__}, CUDA {torch.version.cuda}). "
                         "런타임 -> 런타임 연결 해제 및 삭제 후 T4로 재연결하세요.")
    cap_ = torch.cuda.get_device_capability(0)
    DTYPE = torch.bfloat16 if cap_[0] >= 8 else torch.float16
    torch.manual_seed(SEED + STEP)
    print(f"[env] {torch.cuda.get_device_name(0)} cc{cap_[0]}.{cap_[1]} / {DTYPE}")

    MODEL_ID, DATASET, LEVELS = PLAN[STEP]
    tagm = MODEL_ID.split('/')[-1].replace('Qwen2.5-','').replace('-Instruct','')
    LV = ''.join(LEVELS)
    PATH = os.path.join(OUT_DIR, f"h1v2_{DATASET}_L{LV}_{tagm}_t{MAX_NEW_TOKENS}.jsonl")
    print(f"[cfg] STEP {STEP} | {MODEL_ID} / {DATASET} / L{LV} / {MAX_NEW_TOKENS}tok")
    print(f"[cfg] 결과 파일: {PATH}")

    from datasets import load_dataset
    if DATASET == 'math500':
        ds = load_dataset("HuggingFaceH4/MATH-500", split="test")
        rows = [r for r in ds if str(r['level']).strip()[-1] in LEVELS]
        problems = [{'id': str(r.get('unique_id', i)), 'q': r['problem'], 'gold': r['answer']}
                    for i, r in enumerate(rows)]
    else:
        ds = load_dataset("openai/gsm8k", "main", split="test")
        problems = [{'id': f"gsm{i}", 'q': r['question'],
                     'gold': r['answer'].split('####')[-1].strip()}
                    for i, r in enumerate(ds)]
    problems = problems[:MAX_PROBLEMS]
    if not problems: raise SystemExit("문제 0개 로드됨 -> 중단")
    print(f"[data] {len(problems)}문제 | 예시정답 {[p['gold'] for p in problems[:5]]}")

    from transformers import AutoTokenizer, AutoModelForCausalLM
    t0 = time.time()
    tok = AutoTokenizer.from_pretrained(MODEL_ID)
    try: model = AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype=DTYPE)
    except TypeError: model = AutoModelForCausalLM.from_pretrained(MODEL_ID, torch_dtype=DTYPE)
    model = model.to('cuda').eval()
    EOS = tok.eos_token_id
    PAD = tok.pad_token_id if tok.pad_token_id is not None else EOS
    if EOS is None: raise SystemExit("eos_token_id 없음 -> 중단")
    print(f"[model] {time.time()-t0:.0f}초 / "
          f"{sum(p.numel() for p in model.parameters())/1e9:.2f}B")

    INSTR = ("Solve the problem step by step. "
             "Put your final answer inside \\boxed{}.\n\nProblem: ")

    def gen_texts(q, n, cap):
        text = tok.apply_chat_template([{"role":"user","content": INSTR + q}],
                                       tokenize=False, add_generation_prompt=True)
        enc = tok(text, return_tensors="pt").to('cuda')
        plen, texts, lens, done = enc['input_ids'].shape[1], [], [], 0
        while done < n:
            k = min(GEN_CHUNK, n - done)
            with torch.inference_mode():
                o = model.generate(**enc, do_sample=True, temperature=TEMPERATURE,
                                   top_p=TOP_P, max_new_tokens=cap,
                                   num_return_sequences=k, pad_token_id=PAD)
            for i in range(o.shape[0]):
                s = o[i, plen:].tolist()
                L = s.index(EOS) + 1 if EOS in s else len(s)
                texts.append(tok.decode(s[:L], skip_special_tokens=True)); lens.append(L)
            done += k
        return texts, lens

    NEED = ('answers','answers_raw','sources','gen_lens','correct_flags','n_valid',
            'n_boxed','n_fallback','n_cap','maj_correct','maj_correct_loose','p_single')

    def loop(limit, label):
        cut = ensure_clean_tail(PATH)
        if cut: print(f"[repair] 잘린 마지막 줄 {cut}바이트 제거")
        done = load_done(PATH)
        todo = [p for p in problems if p['id'] not in done][:limit]
        print(f"[{label}] 완료 {len(done)} / 이번에 {len(todo)}문제")
        start, n = time.time(), 0
        with open(PATH, 'a', encoding='utf-8') as f:
            for p in todo:
                if (time.time()-start)/60 > TIME_LIMIT_MIN:
                    print("[run] 시간제한 도달. 같은 셀을 다시 실행하면 이어집니다."); break
                texts, lens = gen_texts(p['q'], N_SAMPLES, MAX_NEW_TOKENS)
                rec = build_record(p, texts, lens, MAX_NEW_TOKENS)
                f.write(json.dumps(rec, ensure_ascii=False)+'\n')
                f.flush(); os.fsync(f.fileno())
                n += 1; el = time.time()-start
                print(f"[{label} {n}/{len(todo)}] p={rec['p_single']:.2f} "
                      f"maj={'O' if rec['maj_correct'] else 'X'} "
                      f"유효표={rec['n_valid']}/{N_SAMPLES} boxed={rec['n_boxed']} "
                      f"상한={rec['n_cap']} 중앙길이={sorted(lens)[len(lens)//2]} "
                      f"| ETA {el/n*(len(todo)-n)/60:.0f}분")
        return n

    if not load_done(PATH):
        loop(2, 'check')
        chk = [json.loads(l) for l in open(PATH, encoding='utf-8') if l.strip()]
        miss = [k for k in NEED if k not in chk[0]]
        print(f"\n[스키마] 키 {len(chk[0])}개 | 누락: {miss if miss else '없음'}")
        if miss:
            raise SystemExit("기록 형식이 다릅니다 -> 중단. 위 누락 항목을 알려주세요.")
        print("[스키마] 정상. 전체 실행을 이어서 시작합니다.\n")
    loop(MAX_PROBLEMS, 'run')
    print(f"\n[done] {PATH}")

# ============================ 5. 분석 ============================
REQ = ('problem_id', 'answers', 'correct_flags', 'maj_correct')

def _load(path):
    out, bad = [], 0
    for line in open(path, encoding='utf-8'):
        s = line.strip()
        if not s: continue
        try: r = json.loads(s)
        except json.JSONDecodeError: bad += 1; continue
        if all(k in r for k in REQ): out.append(r)
        else: bad += 1
    return out, bad

def _enrich(r):
    ans, fl, maj = r['answers'], r['correct_flags'], r['maj_correct']
    n = len(ans); c = sum(bool(x) for x in fl)
    wc = Counter(a for a, f in zip(ans, fl) if a is not None and not f)
    mw = len(wc); nw = sum(wc.values())
    mmw = math.ceil(nw / mw) if mw else 0
    return dict(p=c/n, c=c, n=n, nw=nw, mw=mw, min_max_wrong=mmw,
                maj=bool(maj), deg=(c == 0 or c == n),
                forced=(mw > 0 and mmw > c),
                cap=r.get('n_cap', 0), valid=r.get('n_valid', n))

_bf  = lambda rs: sum(1 for x in rs if not x['maj']) / len(rs)
_lb  = lambda rs: sum(1.0 if x['min_max_wrong'] > x['c']
                      else (0.5 if x['min_max_wrong'] == x['c'] else 0.0)
                      for x in rs) / len(rs)
_gap = lambda rs: _bf(rs) - _lb(rs)

def _boot(fn, rows, B=10000, seed=0):
    r = random.Random(seed); s = []
    for _ in range(B):
        s.append(fn([rows[r.randrange(len(rows))] for _ in range(len(rows))]))
    s.sort(); return round(s[int(.025*B)], 3), round(s[int(.975*B)-1], 3)

def do_analysis(OUT_DIR):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    files = sorted(glob.glob(os.path.join(OUT_DIR, 'h1v2_*.jsonl')))
    if not files:
        print(f"[분석] {OUT_DIR} 에 h1v2_*.jsonl 없음. 실행을 먼저 하세요.")
        return
    summary, store = [], {}
    for path in files:
        recs, bad = _load(path)
        name = os.path.basename(path).replace('h1v2_', '').replace('.jsonl', '')
        if not recs:
            print(f"[skip] {name}: 사용가능 0 / 제외 {bad}"); continue
        tot = sum(len(r['answers']) for r in recs)
        rows = [_enrich(r) for r in recs]
        nd = [x for x in rows if not x['deg']]
        mp = sum(x['p'] for x in rows)/len(rows)
        ma = sum(1 for x in rows if x['maj'])/len(rows)
        print(f"\n=== {name} | {len(recs)}문제" + (f" (제외 {bad})" if bad else "") + " ===")
        print(f"단일정확도 {mp:.3f} | 다수결 {ma:.3f} | 이득 {ma-mp:+.3f}")
        print(f"추출: boxed {sum(r['n_boxed'] for r in recs)/tot:.3f} | "
              f"폴백무효 {sum(r['n_fallback'] for r in recs)/tot:.3f} | "
              f"토큰상한 {sum(r['n_cap'] for r in recs)/tot:.3f}")
        vd = sorted(x['valid'] for x in rows)
        print(f"유효표 중앙 {vd[len(vd)//2]}/{rows[0]['n']} | "
              f"0표 {sum(1 for v in vd if v==0)}문제 | "
              f"12표미만 {sum(1 for v in vd if v<12)}문제")
        print(f"퇴화 p=0 {sum(1 for x in rows if x['c']==0)} / "
              f"p=1 {sum(1 for x in rows if x['c']==x['n'])} -> 비퇴화 {len(nd)}")
        if not nd:
            print("비퇴화 0 -> 판정 불가"); continue
        o, l = _bf(nd), _lb(nd); ci = _boot(_bf, nd)
        print(f"backfire {o:.3f} 95%CI {ci} | 산술하한 {l:.3f} | "
              f"집중분 {o-l:+.3f} 95%CI {_boot(_gap, nd)}")
        print(f"강제 {sum(1 for x in nd if not x['maj'] and x['forced'])}"
              f"/{sum(1 for x in nd if not x['maj'])} | "
              f"고유오답중앙 {sorted(x['mw'] for x in nd)[len(nd)//2]}")
        print("p구간: " + "  ".join(
            f"{a:.2f}-{b:.2f} n={len(g)} bf={_bf(g):.2f}"
            for a, b in [(0,.125),(.125,.25),(.25,.5),(.5,1.01)]
            if (g := [x for x in nd if a <= x['p'] < b])))
        bfp = [x['p'] for x in nd if not x['maj']]
        print(f"backfire 문제의 p 최대 {max(bfp):.2f}" if bfp else "backfire 없음")
        hp = [x for x in nd if x['p'] > 0.5]
        print(f"p>0.5 문제 {len(hp)}개 중 backfire {sum(1 for x in hp if not x['maj'])}개")
        mc = sum(x['cap'] for x in rows)/len(rows)
        num = sum((x['p']-mp)*(x['cap']-mc) for x in rows)
        den = math.sqrt(sum((x['p']-mp)**2 for x in rows)
                        * sum((x['cap']-mc)**2 for x in rows))
        print(f"[교란] p와 토큰상한도달 상관 r={num/den:+.3f}" if den > 0
              else "[교란] 상한도달 없음 (절단 없음)")
        verdict = ("H1 반증" if ci[1] < 0.50 else
                   "H1 지지" if ci[0] > 0.50 else "불확정")
        ven = ("H1 REFUTED" if ci[1] < 0.50 else
               "H1 SUPPORTED" if ci[0] > 0.50 else "INCONCLUSIVE")
        if mp < 0.12:
            verdict, ven = "판정 보류 (정확도 바닥)", "WITHHELD (accuracy floor)"
        print(f">>> 판정: {verdict}")
        store[name] = [0.0 if x['maj'] else 1.0 for x in nd]
        summary.append(dict(name=name, n=len(recs), mp=mp, ma=ma, nd=len(nd), bf=o,
                            ci=ci, lb=l, gap=o-l, verdict=verdict, verdict_en=ven,
                            rows=rows, nd_rows=nd))

    for a in list(store):
        for b in list(store):
            if 'math500' in a and 'gsm8k' in b:
                A, B_ = store[a], store[b]
                r = random.Random(0); s = []
                for _ in range(10000):
                    s.append(sum(A[r.randrange(len(A))] for _ in range(len(A)))/len(A)
                           - sum(B_[r.randrange(len(B_))] for _ in range(len(B_)))/len(B_))
                s.sort()
                sa = next(x for x in summary if x['name'] == a)
                sb = next(x for x in summary if x['name'] == b)
                ok = "하드가 유의하게 높음" if s[250] > 0 else "차이 불확정 (검정력 부족 가능)"
                print(f"\n[대조] HARD {a} {sa['bf']:.3f}  vs  EASY {b} {sb['bf']:.3f}"
                      f" | 차이 95%CI [{s[250]:+.3f}, {s[9749]:+.3f}] -> {ok}")

    if not summary: return
    main = next((s for s in summary if 'math500' in s['name']), summary[0])
    rows, nd = main['rows'], main['nd_rows']
    o, l = _bf(nd), _lb(nd)
    C = dict(bad='#c0392b', good='#2c7fb8', mid='#7f8c8d', light='#bdc3c7')
    fig, ax = plt.subplots(1, 3, figsize=(15, 4.4))
    a = ax[0]
    a.bar([0, 1], [main['mp'], main['ma']], 0.5, color=[C['light'], C['good']])
    for i, v in enumerate([main['mp'], main['ma']]):
        a.text(i, v + .015, f'{v:.3f}', ha='center', fontsize=11)
    a.set_xticks([0, 1]); a.set_xticklabels(['single sample', 'majority of 16'])
    a.set_ylim(0, 1.0); a.set_ylabel('accuracy')
    a.set_title(f"(a) Majority voting helps\ngain {main['ma']-main['mp']:+.3f}")
    a.grid(axis='y', alpha=.3)
    b = ax[1]
    b.hist([x['p'] for x in rows], bins=[i/16 for i in range(18)],
           color=C['light'], edgecolor='k', linewidth=.6)
    b.axvspan(0.25, 0.60, color=C['good'], alpha=.15)
    b.axvline(0.12, color=C['bad'], ls='--', lw=1.6)
    b.set_xlabel('per-problem single-sample accuracy  p')
    b.set_ylabel('number of problems')
    b.set_title(f"(b) Accuracy distribution\nmean p={main['mp']:.3f}, "
                f"{sum(1 for x in rows if x['c']==0)}/{len(rows)} at p=0")
    b.grid(axis='y', alpha=.3)
    c_ = ax[2]
    names, vals = [], []
    for lo_, hi_ in [(0,.125),(.125,.25),(.25,.5),(.5,1.01)]:
        g = [x for x in nd if lo_ <= x['p'] < hi_]
        if g:
            names.append(f'{lo_:.2f}-{hi_:.2f}\n(n={len(g)})'); vals.append(_bf(g))
    c_.bar(range(len(vals)), vals, color=[C['bad'] if v > .5 else C['good'] for v in vals])
    for i, v in enumerate(vals):
        c_.text(i, v + .02, f'{v:.2f}', ha='center', fontsize=9)
    c_.axhline(o, color=C['mid'], lw=1.4)
    c_.axhline(l, color=C['bad'], ls=':', lw=1.8)
    c_.axhline(0.5, color='k', ls='--', lw=1.2)
    c_.text(len(vals)-.45, o+.015, f'observed {o:.3f}', fontsize=8, ha='right', color=C['mid'])
    c_.text(len(vals)-.45, l-.05, f'arithmetic floor {l:.3f}', fontsize=8,
            ha='right', color=C['bad'])
    c_.text(len(vals)-.45, 0.515, 'decision line 0.50', fontsize=8, ha='right')
    c_.set_xticks(range(len(vals))); c_.set_xticklabels(names, fontsize=8)
    c_.set_ylim(0, 1.05); c_.set_ylabel('backfire rate'); c_.set_xlabel('accuracy bin')
    c_.set_title(f"(c) Backfire {o:.3f} CI {main['ci']}\n>>> {main['verdict_en']}")
    c_.grid(axis='y', alpha=.3)
    fig.suptitle(main['name'].replace('_', ' '), y=1.02, fontsize=11)
    plt.tight_layout()
    fp = os.path.join(OUT_DIR, 'h1_fig_result.png')
    plt.savefig(fp, dpi=150, bbox_inches='tight')
    print(f"\n[fig] 저장 {fp}")

    print("\n===== 보고서용 요약 (이 블록을 그대로 보내주세요) =====")
    for s in summary:
        print(f"{s['name']}: n={s['n']} p={s['mp']:.3f} maj={s['ma']:.3f} "
              f"비퇴화={s['nd']} backfire={s['bf']:.3f} CI={s['ci']} "
              f"하한={s['lb']:.3f} 집중분={s['gap']:+.3f} -> {s['verdict']}")

# ============================ 6. 실행 ============================
OUT_DIR = setup_storage()
if STEP in PLAN:
    do_run(OUT_DIR)
    print("\n" + "=" * 60)
    print("실행 완료. 이어서 분석을 시작합니다.")
    print("=" * 60)
do_analysis(OUT_DIR)
