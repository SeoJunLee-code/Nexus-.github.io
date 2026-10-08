# NEXUS — AI Research Portfolio

H1(다수결 역효과)과 Paper 5(내부 신호 모니터링) 두 연구의 기록을 보여 주는 정적 웹사이트입니다.
프레임워크와 빌드 도구 없이 HTML/CSS/JS 만으로 만들었고, 화면의 모든 연구 수치는 `data/*.json` 에서 읽습니다.
`data/*.json` 은 `build_data.py` 가 `data_raw/` 의 원자료에서 만듭니다.

## 원칙

- **수치를 지어내지 않는다.** 원자료에 없는 값은 `DATA PENDING` 으로 표시합니다. HTML 에 들어 있는 소수는 테스트가 통계표와 대조합니다.
- **상태는 규칙으로 정한다.** 결과 파일에 PREREG 해시가 있으면 `사전 고정`, 결과 파일이 없으면 `실행 전`, 그 밖에는 `탐색적`. H1 은 원본 판정 규칙으로 4조건 모두 REFUTED 라서 `반증됨`.
- **부정적 결과를 숨기지 않는다.** H1 반증, Paper 5 의 1g(예상 밖 결과)와 1i(자기 반증)를 그대로 보여 줍니다.
- **사실 / 해석 / 가설 / 한계를 구분한다.** 본문에 `사실` `해석` `가설` `한계` 태그를 붙였습니다.
- **출처를 따라갈 수 있다.** Evidence Mode(상단 방패 아이콘)를 켜고 숫자를 누르면 원본 파일, JSON 경로(또는 계산 방법), 원본 파일 SHA-256 이 나옵니다.

## 구조

```
Nexus-.github.io/
├─ index.html            Home (연구 목록·필터, 1i 분해 + 3D 증거 공간, THE JOURNEY, 연구 지도, 1c 실험 큐브·타일, 실패 체인, 검증)
├─ h1/                   H1 · 다수결 역효과
├─ paper5/               Paper 5 · 내부 신호로 성공 예측하기 (1c → 1j)
├─ statistics/           전체 통계표 (필터·정렬·검색·?q=·CSV·Compare)
├─ reproduce/            코드/원자료 SHA-256, PREREG, 브라우저 내 해시 검증, 실행 방법
├─ log/                  연구 일지 (log/#ev17 처럼 항목별 앵커)
├─ 404.html
├─ assets/css/nexus.css  디자인 토큰(다크 기본 + 라이트), 컴포넌트, 인쇄 CSS
├─ assets/js/            core(셸·로딩 화면·Evidence·검색·차트) · viz(장식 캔버스) · viz3d(실데이터 3D 점구름·복셀·히트 타일) · components(지도·여정 타임라인) · lab · 페이지별 스크립트
├─ data/                 build_data.py 가 만든 JSON (사이트가 읽는 유일한 데이터)
├─ data_raw/             원자료 (analysis_phase1c–1i.json, h1_problem_rows.json, drive_manifest.json)
├─ code/                 원본 Colab 셀 (H1_STEP4, Paper5 1i, 1j) — Drive 원본과 바이트 수 일치
├─ build_data.py         원자료 → data/*.json (표준 라이브러리만 사용)
└─ tests/test_build.py   검증 테스트
```

## 시각화 메모

- **장식과 데이터를 나눈다.** `viz.js` (히어로 구체, 카드·타임라인의 오브, 배경 입자)는 장식이며 수치를 담지 않습니다. `viz3d.js` 의 모든 점·복셀·칸은 `data/*.json` 의 값 하나이고, 마우스를 올리면 값과 CI, 누르면 출처가 열립니다.
- **3D 증거 공간** (Home): 통계표의 AUROC(CI 있는 것) 전부. 가로 = AUROC, 세로 = CI 폭, 깊이 = 단계(1c–1i). 선택한 1i 조건의 분해 지표가 강조됩니다.
- **1c 실험 큐브·타일** (Home): 신호 계열(8) × 통계(mean/std/last) × 폴더(4). 타일은 N=5 / N=10 / 차이. 색은 0.5 를 중심으로 갈라지는 척도(아래 = 보라·분홍, 0.5 = 남색, 위 = 하늘·노랑).
- **로딩 화면**: 페이지가 실제로 요청한 `data/*.json` 의 진행률과 크기를 보여 줍니다. 세션의 첫 페이지에서만 인트로로 보이고, 이후에는 로딩이 0.35초를 넘을 때만 나타납니다. 8초가 지나면 무조건 닫히며, Esc 나 '건너뛰기' 로 바로 닫을 수 있습니다. 위쪽 타일 4개는 장식입니다.

## 데이터 다시 만들기 · 검사

```bash
cd Nexus-.github.io
python3 build_data.py            # data/*.json 재생성
python3 build_data.py --check    # 커밋된 data/ 가 원자료에서 다시 만든 결과와 같은지 (빌드 시각 제외)
python3 -m unittest discover -s tests -v
```

테스트가 확인하는 것:

1. `build_data.py` 의 H1 계산이 원본 셀 `H1_STEP4_cell.py` 의 `_enrich / _bf / _lb / _gap / _boot` 결과와 같은지 (원본 함수를 AST 로 꺼내 실행)
2. `h1v2_*.jsonl` 이 로컬에 있으면 그것에서 만든 문제별 집계가 커밋된 `h1_problem_rows.json` 과 같은지 (없으면 건너뜀)
3. `--check` 통과, 1i 코드의 rstrip SHA-256 = 1j 셀의 `SRC_SHA`, 1j PREREG 해시, provenance 의 크기·해시
4. 1i 결정론·depth0·고리통제 total/kscore/resk 가 원본 JSON 에서 0.820 / 0.788 / 0.597 인지
5. 페이지 JSON 의 모든 stat 참조가 `statistics.json` 과 같은 값인지, HTML 의 소수가 통계값으로 뒷받침되는지, 내부 링크·앵커가 살아 있는지
6. 키·토큰·이메일 의심 문자열이 없는지, jsonl 이 `.gitignore` 에 있는지

## 로컬에서 보기

```bash
cd Nexus-.github.io
python3 -m http.server 8000      # http://localhost:8000/
```

`file://` 로 직접 열면 브라우저가 `fetch` 를 막아 데이터가 보이지 않습니다.

## 배포 (GitHub Pages)

이 저장소(`SeoJunLee-code/Nexus-.github.io`)의 `main` 브랜치 루트가 그대로 사이트입니다. 모든 링크가 상대 경로라 하위 경로에서도 동작합니다.

- 주소: https://seojunlee-code.github.io/Nexus-.github.io/
- 설정: Settings → Pages → Build and deployment → Source `Deploy from a branch`, Branch `main` / `/ (root)`
- `.nojekyll` 이 있어 Jekyll 처리 없이 파일이 그대로 게시됩니다.
- 공개 저장소이므로 `data_raw/` 의 분석 JSON, `code/` 의 셀 코드도 공개됩니다. H1 원자료 `h1v2_*.jsonl` 은 `.gitignore` 로 제외되어 올라가지 않습니다.

## 데이터 메모

- **H1 원자료 `h1v2_*.jsonl`** (4개, 각 약 100–120 KB)은 저장소에 올리지 않습니다 (`.gitignore`). SHA-256 만 `data/provenance.json` 에 기록합니다. 저장소에는 문제·답 텍스트를 뺀 문제별 집계 `data_raw/h1_problem_rows.json` 만 있습니다.
- **Paper 5 1j** 는 PREREG 만 고정된 상태입니다. `analysis_phase1j.json` 이 생기면 `data_raw/` 에 넣고 `build_data.py` 에 1j 결과 읽기를 추가해야 합니다 (지금은 `실행 전` 으로 고정 표시).
- **없는 것**: 1f PREREG 원문(해시만 있음), 1b–1h 셀 코드(Drive 에만 있음 → 해시 없음), Paper 5 원 에피소드 로그, H1 v1(Level 5) 실행 파일, `analysis_episode_level.json`.
- 개인 정보(학교, 이메일, 경력)는 넣지 않았습니다. `drive_manifest.json` 에는 파일 이름·크기·시각만 있고 소유자 계정은 뺐습니다.
- 디자인 참고 이미지의 연구 내용(가상의 수치·제목)은 쓰지 않았고 시각 스타일만 참고했습니다.
