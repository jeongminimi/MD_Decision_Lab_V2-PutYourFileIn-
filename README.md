# MD Decision Lab

> **V2 개발 복사본** — V1의 분석·화면·SQLite 테이블 구조를 유지하고 배포 실행, 방문자별 합성 데모, Supabase 로그인과 계정별 비공개 SQLite를 추가했습니다. V1은 별도 폴더에 보존합니다. V2 실행·배포·사용자별 저장과 실제 연결 확인 방법은 [V2 배포 안내](docs/V2_DEPLOYMENT.md)를 먼저 확인하세요. 아래 원래 분석 기능 설명은 그대로 유지합니다.

**배포 버전에서도 H&M·로그인 없이 자기 파일을 분석할 수 있습니다.** 상단 **내 파일로 분석** → 상품·판매 CSV/XLSX와 재고 기준일 선택 → **파일 검증 후 연결** 순서입니다. 양식 예시는 화면에서 내려받을 수 있고, 자료와 판단 기록은 브라우저별 임시 DB에 분리됩니다. 기본 접근 기간은 접속 후 최대 24시간이며 쿠키 삭제 시 다시 접근할 수 없습니다. Supabase 로그인은 장기 보관과 다른 기기에서의 사용을 위한 선택 기능입니다.

구현과 검증 완료 범위, 실제 Supabase·컨테이너 연결 전 남은 확인은 [V2 검증 결과](docs/V2_VALIDATION.md)에 기록했습니다.

**주니어 MD가 상품별 판매·재고를 보고 무엇을 먼저 확인할지 정하고, 그 판단을 나중에 돌아볼 수 있게 돕는 로컬 업무 도구**

의류 MD 실무 경험(시즌 물량 확보, 주간 판매율 기반 재고 조율, 프로모션 운영)에서 출발한 포트폴리오 프로젝트입니다. 자세한 문제 정의와 결과는 [사례 연구](docs/PORTFOLIO_CASE_STUDY.md)에 있습니다.

**처음 사용한다면 [비전공자를 위한 사용 방법](docs/USER_GUIDE.md)에서 설치와 가상 의류 데모 연결부터 따라 하세요.** H&M 원본 파일 없이 기본 상품 판단과 전략 비교를 체험할 수 있습니다. H&M 동종 판매 비교와 다음 시즌 기획에는 별도의 원본 파일 적재가 필요합니다.

## 핵심 기능

- **오늘의 할 일**: 판단 기준일의 재고 위험(재고 0, 소진 위험, 재고 과다, 판매 감소·증가, 판매 미관측)을 우선순위대로 보여줍니다. 상품을 누르면 같은 화면에서 판정 이유, 판매 흐름, 재고 소진 예상일, 계획 입고, 판매율, 판매가·원가와 전략 비교로 이어집니다.
- **전체 상품**: 작업공간에 있는 모든 상품을 상품명·번호·종류·섹션으로 검색합니다. 표 제목을 누르면 상품명·종류·섹션·최근 30일 판매량·재고를 전체 검색 결과 기준으로 정렬할 수 있습니다. 상품을 누르면 최근 14일·30일 판매량과 재고 자료 유무를 확인할 수 있습니다. MD 판단 대상 상품은 **오늘의 할 일에서 검토**로 이동할 수 있습니다.
- **동종 판매 비교**: 2020-08-31 기준 같은 섹션·종류의 의류 또는 액세서리 중 최근 7일·14일 판매 순위, 판매량 중앙값, 상위 상품을 보여줍니다. 가상 재고가 연결된 상품에만 소진일과 추가 매입 검토 기준을 표시합니다.
- **다음 시즌 기획**: 같은 상품군 여러 종의 2019년과 2020년 7~8월 주간 판매 흐름을 나란히 봅니다. MD가 후보 2~5종과 각 준비 물량, 이유를 선택해 당시 판매 근거와 함께 저장합니다.
- **판매·마케팅 전략 시뮬레이션**: MD가 할인, 온라인 기획전, 상품 노출, 라이브 노출, 추가 매입 중 전략을 고르고 예상 판매량을 직접 입력합니다. 현재 운영과 제안 전략의 매출총이익·잔여 재고·재고 공백을 비교한 뒤 선택과 이유를 저장합니다.
- **판단 기록**: 선택한 조치와 이유를 당시의 숫자·출처와 함께 저장합니다.
- **회고와 추정 검증**: 8/31 판정 이후 실제로 어떻게 팔렸는지 판정 유형별로 보고, 8/31까지의 정보로 만든 9월 판매 추정을 실제 판매와 비교합니다.
- **자사 파일 업로드**: 상품·판매 CSV/XLSX를 올려 같은 판단을 자기 데이터로 할 수 있습니다.

기획전·진열·라이브의 판매 증가는 자동 추정하지 않습니다. MD가 입력한 예상 판매량을 계산에 사용하며, 방문·노출 자료가 없어 전환율을 계산하지 않습니다. 매출총이익은 상품 원가까지만 반영합니다.

### 화면 사용 흐름

1. **오늘의 할 일**에서 우선 확인할 상품을 고르고, 아래로 열린 상세와 판매·마케팅 전략 시뮬레이션을 검토합니다. 전체 분석 대상 목록은 필요할 때만 펼칩니다.
2. 다른 상품을 찾을 때는 **전체 상품**에서 검색합니다. 이 화면은 판매량과 재고 확인에 집중하며, 전략 비교와 판단 저장은 **오늘의 할 일**에서 합니다.
3. **내 결정 기록**에서 저장 당시의 숫자와 이유를 확인합니다. 저장은 실제 할인·발주 실행을 뜻하지 않습니다.
4. 각 화면 맨 아래의 **기능별 확인 내용**에서 그 기능으로 판단할 수 있는 것과 H&M 자료의 생성 근거를 확인합니다. 기존 판매 원본 분석·직접 입력·판단 기록은 H&M 화면 아래 펼침 영역에서 계속 사용할 수 있습니다.

H&M 전체 상품 화면에는 원본 `articles.csv`의 **105,542종**이 의류 외 품목까지 표시됩니다. 판매량은 판단 화면과 같은 **2020-08-31 기준**으로 별도 집계하며, 목록에는 최근 30일 수량을, 상품 상세에는 최근 14일·30일 수량을 표시합니다. 동종 판매 비교와 다음 시즌 기획은 의류 72,505종·액세서리 11,519종의 상품군에 적용합니다. 순위는 **같은 범위·섹션·종류에서 해당 기간 판매가 관측된 상품끼리** 매깁니다. 운영 판단에 쓰는 상품은 이 전체 목록과 별도의 표본이며, 가상 재고는 운영 시뮬레이션에 연결된 상품에만 표시합니다. H&M에 실제 재고 자료가 없는 상품은 재고를 임의로 채우지 않고 **자료 없음**으로 표시합니다. 자사 업로드 작업공간에서는 업로드한 상품 전체를 검색합니다.

### H&M 다운로드 없이 체험하기

실행 후 `오늘의 할 일` → **상품·판매 파일 연결**에서 작업공간 이름을 `가상 의류 공개 데모`, 재고 기준일을 `2026-08-31`로 입력합니다. [상품 파일](sample_data/public_demo/products.csv)과 [판매 파일](sample_data/public_demo/sales.csv)을 올리고 **선택 기간의 모든 판매가 포함**, **가상 데이터로 표시**에 체크하세요. 30개 상품의 60일 판매·재고로 우선 확인 목록, 판매율, 판매·마케팅 전략 시뮬레이션을 시험할 수 있습니다. 이 두 파일은 전부 **합성 자료**이며 H&M 판매 기록이 아닙니다. 생성 방법은 [데모 생성 스크립트](sample_data/public_demo/build_demo.py)에 있습니다.

## 데이터 구조: 실제 판매 + 생성한 내부 자료

MD 판단에는 판매·재고·발주·원가가 모두 필요하지만, 공개 자료(H&M Kaggle)에는 판매만 있습니다. 그래서 데이터를 네 층으로 나누고, 화면의 모든 숫자에 출처를 표시합니다.

| 층 | 내용 | 출처 표시 |
|---|---|---|
| 수요 | 일별 판매, 작년 같은 기간 판매 | `H&M 관측` (실제 거래 기록) |
| 내부 운영 조건 | 재고 수불, 발주·리드타임, 판매가·원가, 시즌 상태 | `가상 운영 조건` (회사 내부 자료 대신 생성) |
| 판단 | 재고 위험, 판매 전략 비교, 매출총이익, 판매 추정 | `시뮬레이션` |
| 검증 | 판단 기준일 이후 판매 | `H&M 관측` |

H&M **운영 시뮬레이션**의 판단 기준일은 **2020-08-31**로 고정합니다. 표본 선정, 재고 설정, 발주, 추정 모두 그 이후 판매를 쓰지 않으며, 9월 판매를 바꿔도 8/31까지의 결과가 같은지 테스트로 확인합니다. 전체 상품의 판매 수량도 같은 기준일로 표시하고, 9월 1~22일 판매는 기준일 판단에 포함하지 않은 `이후 관측`으로 구분해 보여줍니다.

## 주요 결과 (요약)

| 확인 내용 | 결과 |
|---|---|
| 9월 판매 추정 (H&M 220종) | 최근 14일 속도 유지: 합계 +35.5%, 상품별 오차율 53.1% → **작년 계절 보정: 합계 −0.4%, 오차율 43.0%** |
| 8/31 재고 과다 판정 20종 | 9/22에도 가상 재고의 93%가 남음 |
| 9월 공급 부족 | 8/31에 재고 공백을 예상한 11종과 실제 공급 부족이 난 11종이 같음 (부족 수량은 상품마다 크게 다름) |

재고·발주·원가가 가상이므로 **실제 H&M의 품절이나 원화 매출을 뜻하지 않습니다.** 위 표의 220종 판매 추정 검증과 46종 운영 시뮬레이션은 표본 범위가 다릅니다. 한계와 시험 후 버린 방식은 [WORKSPACE_DATA.md](docs/WORKSPACE_DATA.md)에 공개했습니다.

## 핵심 코드

계산은 화면이 아닌 백엔드에서 수행합니다. 화면의 전략 선택과 입력은 [StrategyPlanner.tsx](frontend/src/StrategyPlanner.tsx)에 있고, 서버가 아래 규칙으로 결과를 다시 계산해 저장합니다.

**1. 어떤 상품을 먼저 볼지** — [work_risk.py](backend/app/services/work_risk.py)의 판정 순서 일부입니다. 재고가 0이거나 입고 소요일보다 빨리 소진될 때 먼저 확인합니다. 재발주 불가 상품에는 추가 매입을 권하지 않습니다.

```python
if stock == 0:
    return "stockout", "입력한 현재 재고가 0개입니다.", "재고·판매 가능 여부 확인"
if not observed_any:
    return "not_observed", "기준일까지 관측된 판매가 없습니다. 판매 속도와 소진 예상일을 계산하지 않습니다.", "판매 시작 여부 확인"
if stock is not None and lead_time_days is not None and cover is not None and cover <= lead_time_days:
    reason = f"재고 {stock}개는 현재 속도로 약 {cover}일분이며, 입고 소요일 {lead_time_days}일 이하입니다."
    return "stock_risk", reason, "재발주 불가: 소진 관리" if reorderable is False else "추가 매입 검토"
```

**2. 입고 전 재고 공백 찾기** — [stock_timeline.py](backend/app/services/stock_timeline.py)는 예상 판매량을 30일에 나누어 매일 공급 가능한 수량과 비교합니다. 30일 총량이 충분해도 입고가 늦으면 첫 부족일을 반환합니다.

```python
for offset in range(1, horizon + 1):
    day = as_of + timedelta(offset)
    supply = stock + sum(units for arrival, units in counted if arrival <= day)
    if expected_units * offset > supply * horizon:
        first_gap = first_gap or day
        max_gap = max(max_gap, ceil(expected_units * offset / horizon - supply))
```

**3. 전략의 이익과 판단 기록** — [work_routes.py](backend/app/api/work_routes.py)는 할인 적용가로 매출총이익을 계산하고, 저장할 때 두 조건을 서버에서 다시 계산합니다. H&M 시뮬레이션도 [hm_sim_routes.py](backend/app/api/hm_sim_routes.py)에서 같은 날짜별 재고 검사를 사용합니다.

```python
price = round(inp.unit_price_krw * (1 - payload.discount_pct / 100), 2)
profit = round(payload.expected_units_30d * (price - inp.unit_cost_krw), 2) if feasible else None
```

예상 판매량은 사용자가 넣는 가정입니다. 이 코드는 할인이나 노출이 판매를 얼마나 늘리는지 증명하지 않습니다.

**4. 동종 판매 순위와 다음 시즌 근거** — [peer_routes.py](backend/app/api/peer_routes.py)는 의류와 액세서리를 구분하고, 같은 섹션·종류에서 판매가 관측된 상품만 순위의 분모로 사용합니다. 기획 후보는 작년과 올해 판매 상위 상품을 함께 포함하며, 선택한 물량·이유와 당시 판매 근거를 DB에 저장합니다.

```python
active14 = [item.units_14d for item in cohort if item.units_14d > 0]
def rank(value, numbers):
    return 1 + sum(other > value for other in numbers) if value > 0 and numbers else None
```

이 순위는 관측 판매 수량의 비교입니다. 상품별 실제 재고·노출·판매 가능 기간을 알 수 없어 인기도나 다음 시즌 수요를 확정하지 않습니다.

## 실행 방법

> 개발 경험이 없다면 [프로그램 사용 방법](docs/USER_GUIDE.md)을 보세요. 설치부터 판단 저장까지 순서대로 안내합니다.

필요한 것: Python 3.11 이상, Node.js 20 이상.

### 1. 백엔드

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8001
```

V2 API 문서: <http://127.0.0.1:8001/docs>

### 2. 프런트엔드

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

V2 화면은 `http://localhost:5180`에서 열립니다. 개발 중에는 Vite가 `/api`를 `http://127.0.0.1:8001`로 전달하고, 배포 후에는 화면과 API가 같은 주소를 사용합니다. 별도 서버 구성은 `VITE_API_BASE_URL`로 지정할 수 있습니다.

### 3. H&M 데이터 직접 내려받기 (선택)

H&M 원본 데이터와 이미지는 이 저장소 및 공개 파일 저장소에 포함하지 않습니다. 시연에 사용하려면 각 사용자가 [H&M Personalized Fashion Recommendations 공식 Kaggle 페이지](https://www.kaggle.com/competitions/h-and-m-personalized-fashion-recommendations/data)에서 로그인하고 대회 규칙에 동의한 뒤 직접 내려받아야 합니다. 내려받은 파일은 저장소 밖의 개인 폴더에 보관하세요.

| 파일 | 필요 여부 | 사용처 |
|---|---|---|
| `articles.csv.zip` | 필수 | 상품명·종류·섹션 등 상품 정보 |
| `transactions_train.csv.zip` | 필수 | 일별 판매량, 동종 판매 비교, 다음 시즌 판매 흐름 |
| `images.zip` | 선택 | 상품 카드 사진. 없어도 분석 기능은 작동 |
| `customers.csv.zip` | 불필요 | 현재 프로그램은 고객 추천이나 개인정보를 사용하지 않음 |
| `sample_submission.csv.zip` | 불필요 | Kaggle 제출용 파일로 현재 프로그램에서 사용하지 않음 |

원본 파일을 GitHub, Supabase 공개 버킷 또는 배포 파일에 다시 올리지 마세요. 공개 시연이 필요하면 저장소에 포함된 **합성 의류 공개 데모**를 사용하고, H&M 자료는 규칙에 동의한 사용자의 로컬 분석 환경에서만 연결하세요.

```powershell
# backend/ 에서: 여성복 3개 섹션의 7/1~8/31 판매 상위 상품만 적재 (고객 ID는 저장하지 않음)
python scripts/import_hm.py --articles "C:\경로\articles.csv.zip" --transactions "C:\경로\transactions_train.csv.zip"

# 같은 backend/에서: 전체 상품 105,542종과 최근 14일·30일 판매량 적재
python scripts/import_hm_catalog.py --articles "C:\경로\articles.csv.zip" --transactions "C:\경로\transactions_train.csv.zip"

# 같은 backend/에서: 8/31 기준 의류·액세서리 동종 판매와 2019/2020 주간 비교 자료 적재
python scripts/import_hm_peer_sales.py --articles "C:\경로\articles.csv.zip" --transactions "C:\경로\transactions_train.csv.zip"

# 저장소 최상위로 이동한 뒤: 가상 운영 조건 CSV 생성과 검증
cd ..
python sample_data/hm_operating_case/generate_hm_operating_case.py
python sample_data/hm_operating_case/verify_hm_operating_case.py
```

표본 적재 스크립트 `import_hm.py`는 실행 전에 원본 파일의 크기와 SHA-256을 [기록된 값](docs/DATA_SOURCES.md)과 비교합니다. 전체 상품·동종 판매 적재 스크립트는 기존 집계를 덮어쓰지 않습니다. 앱의 H&M 작업공간에서 **운영 시뮬레이션 자료 연결**을 한 번 누르면 검증 후 저장됩니다. 이 기능에는 `customers.csv.zip`과 `sample_submission.csv.zip`이 필요하지 않습니다. 상품 적재에는 `images.zip`도 필요하지 않습니다. 사진을 쓰려면 표본 적재 명령에 `--images "C:\경로\images.zip"`을 선택적으로 추가하세요. 표본 데이터를 다시 만드는 `--replace`는 기존 H&M 작업공간과 연결된 판단 기록도 삭제하므로 백업 없이 실행하지 마세요.

연결된 상품 사진은 H&M Kaggle 자료입니다. 화면에서는 기본으로 보이며, 캡처할 때는 상단의 **사진 숨김** 버튼으로 가릴 수 있습니다.

### 4. 자사 파일로 쓰기

`오늘의 할 일`의 **상품·판매 파일 연결**에서 두 파일을 올립니다. 열 형식은 `sample_data/company_products_template.csv`, `sample_data/company_sales_template.csv`를 참고하세요. 입고 예정일·기초재고 등 선택 열은 [WORKSPACE_DATA.md](docs/WORKSPACE_DATA.md)에 있습니다. 고객명·연락처 같은 개인정보 열은 지우고 올리세요.

### 테스트

```powershell
cd backend
python -m unittest discover -s tests
```

H&M 원본 파일은 앱의 H&M 자료를 새로 적재할 때만 필요합니다. 일부 통합 테스트는 로컬 DB와 가상 운영 조건 CSV가 있으면 추가 검증을 수행합니다.

## 폴더 안내

| 경로 | 내용 |
|---|---|
| `backend/app/api/work_routes.py` | 작업공간, 자사 업로드, 판매 전략 비교, 판단 기록 |
| `backend/app/api/catalog_routes.py` | 전체 상품 검색, 최근 판매량과 재고 출처 조회 |
| `backend/app/api/peer_routes.py` | 의류·액세서리 동종 판매 순위와 다음 시즌 기획안 저장 |
| `backend/app/api/hm_sim_routes.py` | H&M 운영 시뮬레이션, 회고, 9월 추정 검증 |
| `backend/app/services/` | 재고 위험 규칙, 날짜별 재고 확인, 판매율, 판매 추정 |
| `backend/scripts/import_hm.py` | H&M 원본에서 표본 적재 |
| `backend/scripts/import_hm_catalog.py` | H&M 원본 전체 상품과 최근 판매량 적재 |
| `backend/scripts/import_hm_peer_sales.py` | 8/31 동종 판매와 2019·2020년 주간 판매 집계 적재 |
| `frontend/src/WorkPage.tsx`, `CatalogPage.tsx`, `HmSimulation.tsx`, `StrategyPlanner.tsx`, `PeerPanel.tsx`, `SeasonPlanner.tsx` | 오늘의 할 일, 전체 상품, 동종 비교, 다음 시즌 기획, 참여형 판매 전략 비교 |
| `sample_data/hm_operating_case/` | 가상 운영 조건 생성·검증 스크립트와 [데이터 QA](sample_data/hm_operating_case/DATA_QA.md) |
| `sample_data/fashion_fw_case/` | 종료한 F/W 합성 사례. 회사 내부 자료(재고 수불, 시즌 상태, 작년 비교) 설계 참고용 |

## 문서

- [프로그램 사용 방법](docs/USER_GUIDE.md) — 비전공자용 설치·실행·자료 연결·판단 저장
- [사례 연구](docs/PORTFOLIO_CASE_STUDY.md) — 문제, 데이터 설계, 8/31 판단, 9월 회고, 한계, 보완점, 역할 구분
- [작업공간 데이터와 판단 기준](docs/WORKSPACE_DATA.md) — 계산식, 출처 구분, 추정 방법과 결과, 한계
- [데이터 출처와 보관](docs/DATA_SOURCES.md) — 원본 파일 해시, 저장소에 두지 않는 파일, 보관 원칙
- [H&M 운영 사례 데이터 QA](sample_data/hm_operating_case/DATA_QA.md) — 가상 운영 조건 생성 규칙과 전수 검증
- [내부 자료 설계 참고](docs/FASHION_DATA_DESIGN.md) — 종료한 F/W 합성 사례의 재고 수불·시즌 기획 설계
- `docs/BUILD_LOG.md`, `ARCHITECTURE.md`, `PRODUCT_SPEC.md`, `DECISION_RULES.md`, `CSV_IMPORT.md` — 초기 버전의 기록

## 한계

- 재고·발주·원가·시즌 상태는 가상입니다. 실제 회사 자료로 바꾸는 방법은 사례 연구의 "보완점"에 정리했습니다.
- H&M 전체 상품 검색은 모든 품목을 보여주지만, 운영 판단에 쓰는 표본은 여름 판매 상위 상품이라 전체를 대표하지 않고 9월에 처음 팔린 신상은 다루지 못합니다.
- 조치 전후 비교는 대조군이 없어 인과 효과를 증명하지 않습니다.
- 사이즈·컬러별 재고, 구매 예산(OTB), 반품, 여러 사용자 동시 사용은 지원하지 않습니다.
- 동종 판매 순위와 다음 시즌 비교는 판매 기록만 반영합니다. 상품별 노출량·할인·실제 재고가 없어 인기도 점수나 다음 시즌 수요 예측으로 해석할 수 없습니다. 재고 자료가 없는 액세서리에는 추가 매입량을 계산하지 않습니다.

## 역할과 도구

기획자는 MD 실무 경험을 바탕으로 문제, 판단 기준, 데이터 구분, 검수 기준을 정하고 결과를 검토했습니다. 구현·테스트·검증 스크립트 작성에는 AI 코딩 도구(Codex, Claude Code)를 사용했습니다. 이 도구가 실제 매출을 높였다고 주장하지 않습니다.
