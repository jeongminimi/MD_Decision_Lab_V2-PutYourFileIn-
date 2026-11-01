import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, Check, Database, FileUp, Info, RefreshCw, TriangleAlert } from "lucide-react";
import type { WorkView } from "./App";
import { workApi, type WorkAnalysis, type WorkDataset, type WorkDecision, type WorkInputs, type WorkProduct } from "./workApi";
import HmSimulation from "./HmSimulation";
import CatalogPage from "./CatalogPage";
import StrategyPlanner from "./StrategyPlanner";
import { useAccount } from "./Account";
import { apiBase, apiFetch } from "./http";
import "./work.css";

const n = (value: number) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value);
const won = (value: number) => value < 0 ? `-₩${n(Math.abs(value))}` : `₩${n(value)}`;
const nextDay = (day: string) => { const next = new Date(`${day}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10); };
const HM_DECISION_DATE = "2020-08-31";
const riskLabels: Record<string, string> = {
  stockout: "재고 확인", stock_risk: "소진 위험", overstock: "재고 과다",
  declining: "판매 감소", rising: "판매 증가", data_gap: "자료 확인", not_observed: "판매 미관측", stable: "정상",
};
const HM_SAMPLE_BIAS = "표본 범위: H&M 작업공간의 상품은 2019·2020년 7월 1일~8월 31일 판매 상위 상품입니다. 판단 기준일(8월 31일) 이후 판매는 선정에 쓰지 않았습니다. 여름 판매 상위 상품만 모은 표본이라 H&M 전체를 대표하지 않으며, 9월에 처음 팔리기 시작한 신상은 포함되지 않습니다.";
const lifecycleLabels: Record<string, string> = {
  regular: "일반 판매", summer_clearance: "여름 잔여", fall_prelaunch: "가을 신상 출시 전",
  winter_carryover: "작년 겨울 행사",
};

function WeeklyChart({ data }: { data: { date: string; units: number }[] }) {
  const weeks = [];
  for (let i = 0; i < data.length; i += 7) {
    const rows = data.slice(i, i + 7);
    weeks.push({ label: rows[0]?.date.slice(5) || "", units: rows.reduce((sum, row) => sum + row.units, 0) });
  }
  const max = Math.max(1, ...weeks.map((week) => week.units));
  return <div className="work-chart" role="img" aria-label={`기간별 판매량: ${weeks.map((week) => `${week.label} ${n(week.units)}개`).join(", ")}`}>
    {weeks.map((week, index) => <div className="work-chart-column" key={`${week.label}-${index}`}>
      <b>{n(week.units)}</b><div className="work-chart-track"><span style={{ height: `${Math.max(3, week.units / max * 100)}%` }} /></div><small>{week.label}</small>
    </div>)}
  </div>;
}

export default function WorkPage({ view, onNavigate }: { view: WorkView; onNavigate: (view: WorkView) => void }) {
  const [datasets, setDatasets] = useState<WorkDataset[]>([]);
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [asOf, setAsOf] = useState("");
  const [chartStart, setChartStart] = useState("");
  const [section, setSection] = useState("");
  const [analysis, setAnalysis] = useState<WorkAnalysis | null>(null);
  const [decisions, setDecisions] = useState<WorkDecision[]>([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [observedExpanded, setObservedExpanded] = useState(false);
  const [requestedSimSku, setRequestedSimSku] = useState<string | null>(null);
  const scrollToProduct = useRef(false);
  const dataset = datasets.find((item) => item.id === datasetId);
  const simActive = dataset?.kind === "hm";

  useEffect(() => {
    void workApi.datasets().then((items) => {
      setDatasets(items);
      if (items.length) { setDatasetId(items[0].id); setAsOf(items[0].end_date); }
    }).catch((err) => setError(err instanceof Error ? err.message : "데이터를 불러오지 못했습니다."));
  }, []);

  async function refresh(id = datasetId, day = asOf, chosenSection = section, start = chartStart) {
    if (id == null) return;
    const [result, saved] = await Promise.all([workApi.analysis(id, day, chosenSection, start), workApi.decisions(id)]);
    setAnalysis(result); setDecisions(saved);
    setSelectedSku((current) => current && !result.products.some((product) => product.sku === current) ? "" : current);
  }
  useEffect(() => { void refresh().catch((err) => setError(err instanceof Error ? err.message : "분석을 불러오지 못했습니다.")); }, [datasetId, asOf, section, chartStart]);

  function changeDataset(id: number) {
    const next = datasets.find((item) => item.id === id);
    if (!next) return;
    setAnalysis(null); setSection(""); setChartStart(""); setSelectedSku("");
    setDatasetId(id); setAsOf(next.end_date); setError(""); setNotice("");
  }

  const attention = analysis?.products.filter((item) => item.risk !== "stable" && item.risk !== "data_gap") || [];
  const visible = useMemo(() => analysis?.products.filter((item) => `${item.sku} ${item.name} ${item.category}`.toLowerCase().includes(query.toLowerCase())) || [], [analysis, query]);
  const focus = analysis?.products.find((item) => item.sku === selectedSku);
  useLayoutEffect(() => {
    if ((!simActive || observedExpanded) && view === "overview" && scrollToProduct.current) {
      const target = document.getElementById("work-product-detail");
      if (target) { scrollToProduct.current = false; target.scrollIntoView({ behavior: "instant", block: "start" }); }
    }
  }, [simActive, observedExpanded, view, selectedSku, analysis]);
  function openProduct(sku: string) {
    if (simActive) setObservedExpanded(true);
    scrollToProduct.current = true;
    setSelectedSku(sku);
    if (view !== "overview") onNavigate("overview");
    else if (selectedSku === sku) {
      scrollToProduct.current = false;
      document.getElementById("work-product-detail")?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }
  function reviewFromCatalog(sku: string) {
    if (simActive) { setRequestedSimSku(sku); onNavigate("overview"); }
    else {
      if (section && !analysis?.products.some((item) => item.sku === sku)) setSection("");
      openProduct(sku);
    }
  }

  return <div className="work-page">
    <header className="work-header"><div><span className="section-kicker">MD DECISION LAB</span><h1>{view === "overview" ? "오늘의 할 일" : view === "products" ? "전체 상품" : view === "actions" ? "내 결정 기록" : "다음 시즌 기획"}</h1></div>
      <div className="work-source-controls"><label>작업공간<select aria-label="작업공간" value={datasetId ?? ""} onChange={(event) => changeDataset(Number(event.target.value))}>{datasets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{dataset && <span className={`work-provenance ${dataset.kind}`}>{dataset.kind === "hm" ? "H&M 실제 판매 시연" : dataset.kind === "synthetic" ? "가상 데모 자료" : "자사 업로드 자료"}</span>}</div>
    </header>
    {error && <div className="error-banner"><TriangleAlert size={17}/>{error}</div>}
    {notice && <div className="notice-banner"><Check size={16}/>{notice}</div>}
    {view === "products" && dataset && <CatalogPage dataset={dataset} asOf={simActive ? HM_DECISION_DATE : asOf} simulation={simActive} onReview={reviewFromCatalog}/>}
    {simActive && datasetId != null && view !== "products" && <HmSimulation datasetId={datasetId} view={view} onNavigate={onNavigate} requestedSku={requestedSimSku} onRequestedSkuUsed={() => setRequestedSimSku(null)}/>}
    {(!simActive || view !== "products") && <OptionalObservedDetails enabled={simActive} expanded={observedExpanded} onExpandedChange={setObservedExpanded}>
    {dataset && view !== "products" && <section className="work-filters" aria-label="분석 범위">
      <label>의류 섹션<select value={section} onChange={(event) => { setSection(event.target.value); setSelectedSku(""); }}><option value="">전체 섹션</option>{analysis?.sections.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>그래프 시작일<input type="date" min={dataset.start_date} max={asOf} value={chartStart} onChange={(event) => setChartStart(event.target.value)}/></label>
      <label>분석 기준일<input type="date" min={dataset.start_date} max={dataset.end_date} value={asOf} onChange={(event) => { setAsOf(event.target.value); setSelectedSku(""); }}/></label>
      <button type="button" className="button button-secondary" onClick={() => void refresh()}><RefreshCw size={15}/> 새로고침</button>
    </section>}
    {dataset && view !== "products" && <details className="work-source-details"><summary><Info size={15}/> 데이터 출처</summary><p>{dataset.source_note}</p></details>}
    {view === "overview" && <>
      {analysis && <>
        <section className="work-summary" aria-label="핵심 지표"><div><small>최근 30일 판매</small><strong>{n(analysis.summary.units_30d)}개</strong></div><div><small>우선 확인</small><strong>{n(analysis.summary.attention_count)}개</strong></div><div><small>분석 상품</small><strong>{n(analysis.summary.total_products)}종</strong></div></section>
        <div className="work-overview-main"><section className="panel work-panel"><div className="work-panel-heading"><div><span className="section-kicker">PRIORITY</span><h2>우선 확인할 상품</h2></div><button type="button" className="button button-secondary" onClick={() => onNavigate("products")}>전체 상품 <ArrowRight size={16}/></button></div>
          <div className="work-priority-list">{(attention.length ? attention : analysis.products).slice(0, 10).map((item) => <button type="button" key={item.sku} onClick={() => openProduct(item.sku)}>{item.image_ref && <img className="work-product-image" src={item.image_ref} alt="" loading="lazy"/>}<span className={`work-risk ${item.risk}`}>{riskLabels[item.risk] || item.risk}</span><span className="work-priority-main"><b>{item.name}</b><small>{item.reason}</small></span><span className="work-action">{item.action}<ArrowRight size={15}/></span></button>)}</div>
          {!analysis.products.length && <p className="work-empty">이 범위에 분석할 상품이 없습니다.</p>}
        </section>
        <section className="panel work-panel"><div className="work-panel-heading"><div><span className="section-kicker">SALES TREND</span><h2>기간별 판매량</h2></div><small>관측된 판매 수량 · 7일 단위</small></div><WeeklyChart data={analysis.daily_chart}/></section></div>
        <details className="panel work-panel catalog-analysis-list"><summary>분석 상품 {n(analysis.products.length)}종 모두 보기</summary>
          <input className="work-search" aria-label="분석 상품 검색" placeholder="상품명 또는 SKU 검색" value={query} onChange={(event) => setQuery(event.target.value)}/>
          <div className="table-scroll"><table className="data-table work-table"><thead><tr><th>상품</th><th>최근 14일 / 직전</th><th><abbr title="현재 재고를 최근 판매 속도로 나눈 예상 일수. 재고를 입력한 경우에만 표시합니다.">재고 / 소진 예상일</abbr></th><th>다음 검토</th></tr></thead><tbody>{visible.map((item) => <tr key={item.sku} className={focus?.sku === item.sku ? "selected-row" : ""}><td><button type="button" className="work-table-product" onClick={() => openProduct(item.sku)}>{item.image_ref && <img className="work-product-image" src={item.image_ref} alt="" loading="lazy"/>}<span><b>{item.name}</b><small>{item.sku} · {item.category}</small></span></button></td><td>{n(item.units_14d)}개 / {n(item.prior_14d)}개<div className="work-mini-bar"><span style={{ width: `${Math.min(100, item.units_14d / Math.max(1, item.prior_14d, item.units_14d) * 100)}%` }}/></div></td><td>{item.stock_on_hand == null ? "재고 입력 필요" : `${n(item.stock_on_hand)}개`}<small>{item.days_of_cover == null ? "소진일 계산 전" : `약 ${n(item.days_of_cover)}일`}</small></td><td><span className={`work-risk ${item.risk}`}>{riskLabels[item.risk] || item.risk}</span><small>{item.action}</small></td></tr>)}</tbody></table></div>
        </details>
        {focus && datasetId != null && <div className="work-detail-target" id="work-product-detail"><ProductDetail key={`${datasetId}-${focus.sku}-${asOf}`} item={focus} dataset={dataset!} asOf={asOf} onChanged={() => refresh()}/></div>}
      </>}
      {dataset && <UploadPanel onUploaded={async (id) => { const items = await workApi.datasets(); setDatasets(items); changeDatasetFromUpload(id, items); }} busy={busy} setBusy={setBusy} setError={setError} setNotice={setNotice}/>}
    </>}
    {view === "actions" && dataset && <>{dataset.kind === "company" && <SalesUpdatePanel datasetId={dataset.id} onUploaded={async (date) => { setDatasets(await workApi.datasets()); setAsOf(date); }}/>}<section className="panel work-panel"><div className="work-panel-heading"><div><h2>내 결정 기록</h2><small>저장한 검토와 실제 실행을 구분합니다.</small></div></div>{decisions.length ? <div className="work-decision-list">{decisions.map((item) => <DecisionRow key={item.id} item={item} dataset={dataset} onChanged={() => refresh()}/>)}</div> : <p className="work-empty">저장한 판단이 없습니다. 상품에서 판매 전략을 계산하고 이유를 남겨보세요.</p>}</section></>}
    {view === "planning" && analysis && <PlanningPanel products={analysis.products} dataset={dataset!} onOpen={openProduct}/>}
    </OptionalObservedDetails>}
    {!dataset && <section className="panel work-panel"><h2>작업공간 연결</h2><p>자사 상품·판매 파일을 올리거나 H&M 시연 데이터가 연결되면 분석을 시작할 수 있습니다.</p><UploadPanel onUploaded={async (id) => { const items = await workApi.datasets(); setDatasets(items); changeDatasetFromUpload(id, items); }} busy={busy} setBusy={setBusy} setError={setError} setNotice={setNotice}/></section>}
    {dataset && <WorkPurposeFooter isHm={simActive}/>}
  </div>;

  function changeDatasetFromUpload(id: number, items: WorkDataset[]) {
    const next = items.find((item) => item.id === id);
    if (next) { setAnalysis(null); setSection(""); setChartStart(""); setSelectedSku(""); setDatasetId(id); setAsOf(next.end_date); }
  }
}

function OptionalObservedDetails({ enabled, expanded, onExpandedChange, children }: { enabled: boolean; expanded: boolean; onExpandedChange: (value: boolean) => void; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <details className="panel work-panel work-observed-extra" open={expanded} onToggle={(event) => { if (event.target === event.currentTarget) onExpandedChange(event.currentTarget.open); }}><summary>판매 원본 분석·직접 입력·기존 기록</summary><p>H&M 판매 원본으로 따로 살펴보거나 입력한 조건을 확인할 때 사용합니다. 위의 가상 운영 조건은 바뀌지 않습니다.</p>{children}</details>;
}

function WorkPurposeFooter({ isHm }: { isHm: boolean }) {
  return <section className="work-purpose-footer" aria-label="기능과 데이터 안내">
    <h2>기능별 확인 내용</h2>
    <ul>
      <li><b>오늘의 할 일</b><span>판매 변화와 재고 위험을 함께 보고 먼저 검토할 상품을 정합니다.</span></li>
      <li><b>전체 상품</b><span>상품을 검색하고 최근 판매량과 재고 정보 유무를 확인합니다.</span></li>
      <li><b>판매 전략 비교</b><span>할인·노출·매입안의 예상 판매량, 매출총이익, 잔여 재고를 비교합니다.</span></li>
      <li><b>내 결정 기록</b><span>선택 이유와 당시 수치를 남기고 이후 판매 흐름을 돌아봅니다.</span></li>
      <li><b>다음 시즌 기획</b><span>과거 판매 흐름과 추정 오차를 보고 준비 물량을 검토합니다.</span></li>
      <li><b>자사 파일 연결</b><span>상품·판매 자료를 올려 같은 기준으로 자사 상품을 분석합니다.</span></li>
    </ul>
    {isHm && <p className="work-purpose-source"><b>자료 기준</b> 판매 수량과 상품 정보는 H&amp;M 공개 기록입니다. 재고·발주·원화 가격·원가는 원본에 없어 기준일 전 판매 속도, 상품 종류, 가정한 리드타임·발주 규칙으로 만든 시연 값입니다. 이를 결합한 재고 위험과 매출총이익은 시뮬레이션 결과이며 실제 H&amp;M의 재고·이익·전략 효과가 아닙니다. {HM_SAMPLE_BIAS}</p>}
  </section>;
}

function SalesUpdatePanel({ datasetId, onUploaded }: { datasetId: number; onUploaded: (date: string) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function upload() {
    if (!file) return;
    setBusy(true); setMessage("");
    try { const result = await workApi.appendSales(datasetId, file, complete); await onUploaded(result.end_date); setMessage(`${result.updated}개 일별 기록을 반영했습니다. 전후 비교는 실제 실행일과 충분한 기록이 있을 때만 표시됩니다.`); }
    catch (err) { setMessage(err instanceof Error ? err.message : "판매 자료를 반영하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return <details className="panel work-upload"><summary><FileUp size={17}/> 조치 후 판매 자료 추가</summary><div className="work-upload-body"><p>자사 작업공간의 기존 SKU에 새 일별 판매를 추가합니다. 같은 SKU·날짜·채널 행만 새 값으로 교체합니다.</p><label>판매 파일 (CSV·XLSX)<input type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files?.[0] || null)}/></label><label className="work-checkbox"><input type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)}/> 새 기간의 모든 판매가 포함돼 있습니다. 기록이 없는 날은 0개 판매로 봐도 됩니다.</label><button type="button" className="button button-secondary" disabled={!file || busy} onClick={() => void upload()}>{busy ? "반영 중…" : "판매 기록 반영"}</button>{message && <small>{message}</small>}</div></details>;
}

function ProductDetail({ item, dataset, asOf, onChanged }: { item: WorkProduct; dataset: WorkDataset; asOf: string; onChanged: () => Promise<void> }) {
  const [fields, setFields] = useState<WorkInputs>({
    as_of_date: asOf, stock_on_hand: item.stock_on_hand, inbound_units: item.inbound_units, inbound_date: item.inbound_date,
    opening_stock: item.opening_stock, opening_date: item.opening_date, received_units: item.received_units,
    lead_time_days: item.lead_time_days, unit_price_krw: item.unit_price_krw,
    unit_cost_krw: item.unit_cost_krw, reorderable: item.reorderable, lifecycle: item.lifecycle,
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  function updateNumber(key: keyof WorkInputs, text: string) {
    setFields((value) => ({ ...value, [key]: text === "" ? null : Number(text) }));
  }
  async function saveInputs() {
    setBusy(true); setMessage("");
    try { await workApi.updateInputs(dataset.id, item.sku, fields); await onChanged(); setMessage("입력값을 저장했습니다. 재고·이익 판단을 다시 계산했습니다."); }
    catch (err) { setMessage(err instanceof Error ? err.message : "입력값을 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  const comparisonReady = item.stock_on_hand != null && item.inbound_units != null && item.unit_price_krw != null && item.unit_cost_krw != null;
  return <section className="panel work-panel work-detail"><div className="work-panel-heading"><div><span className="section-kicker">PRODUCT REVIEW · {item.sku}</span><h2>{item.name}</h2><small>{item.section} · {item.category}</small></div><span className="work-detail-identity">{item.image_ref && <img className="work-product-image large" src={item.image_ref} alt={`${item.name} 상품 사진`} loading="lazy"/>}<span className={`work-risk ${item.risk}`}>{riskLabels[item.risk] || item.risk}</span></span></div>
    <div className="work-observation"><span className="work-provenance observed">{dataset.kind === "hm" ? "H&M 실제 판매 기록" : dataset.kind === "synthetic" ? "가상 판매 기록" : "자사 판매 기록"}</span><b>{item.reason}</b><small>최근 7일 {n(item.units_7d)}개 · 30일 {n(item.units_30d)}개 · 전기 30일 {n(item.prior_30d)}개</small><small>채널별 30일: {Object.entries(item.channel_units_30d).map(([channel, units]) => `${channel} ${n(units)}개`).join(" · ") || "기록 없음"}{dataset.kind === "hm" ? " · 채널 번호의 온·오프라인 의미는 확인 전" : ""}</small><strong>다음 검토: {item.action}</strong></div>
    <div className="work-metrics"><div><small><abbr title="최근 14일 판매 수량을 14로 나눈 값으로 재고를 나눕니다. 판매 기간이 짧으면 관측된 일수로 나눕니다.">재고 소진 예상일</abbr></small><b>{item.days_of_cover == null ? "재고 입력 후 계산" : `약 ${n(item.days_of_cover)}일`}</b></div><div><small><abbr title="매출에서 상품 매입원가만 뺀 값입니다. 배송비·광고비 등은 제외합니다.">30일 매출총이익</abbr></small><b>{item.observed_gross_profit_30d == null ? "원본 이익 자료 없음" : won(item.observed_gross_profit_30d)}</b></div><div><small>전년 같은 기간 · 동일 SKU</small><b>{item.year_ago_30d == null ? "비교 기간 없음" : `${n(item.year_ago_30d)}개`}</b></div><div><small><abbr title="판매율 = 기간 판매 수량 ÷ (기초재고 + 기간 입고). 기초재고 + 입고 − 판매가 기준일 재고와 맞을 때만 계산합니다.">판매율</abbr>{item.sell_through.start ? ` · ${item.sell_through.start}~${item.sell_through.end}` : ""}</small><b>{item.sell_through.pct == null ? (item.sell_through.status === "mismatch" ? "수불 불일치" : "계산 안 함") : `${n(item.sell_through.pct)}%`}</b>{item.sell_through.pct == null ? <small>{item.sell_through.reason}</small> : <small>판매 {n(item.sell_through.sold_units ?? 0)} ÷ (기초 {n(item.sell_through.opening_stock ?? 0)} + 입고 {n(item.sell_through.received_units ?? 0)}) · {item.sell_through.source}</small>}</div></div>
    <details className="work-inputs"><summary>현재 재고·판매가·원가 입력 {item.input_source && <span className={`work-provenance ${item.input_source}`}>{item.input_source === "simulation" ? "내가 입력한 가정" : "내가 입력한 조건"}</span>}</summary><div className="work-form-grid">
      <label>현재 재고 (개)<input type="number" min="0" step="1" placeholder="예: 120" value={fields.stock_on_hand ?? ""} onChange={(event) => updateNumber("stock_on_hand", event.target.value)}/><small>{asOf} 기준 실제 수량 또는 시뮬레이션 값</small></label>
      <label>입고 예정 (개)<input type="number" min="0" step="1" placeholder="예: 30" value={fields.inbound_units ?? ""} onChange={(event) => updateNumber("inbound_units", event.target.value)}/></label>
      <label>입고 예정일<input type="date" min={nextDay(asOf)} value={fields.inbound_date ?? ""} onChange={(event) => setFields((value) => ({ ...value, inbound_date: event.target.value || null }))}/><small>날짜가 없으면 30일 가용 수량에 넣지 않습니다</small></label>
      <label>기초재고 (개)<input type="number" min="0" step="1" placeholder="예: 200" value={fields.opening_stock ?? ""} onChange={(event) => updateNumber("opening_stock", event.target.value)}/><small>판매율 계산용 · 기초재고일 판매 전 수량</small></label>
      <label>기초재고일<input type="date" max={asOf} value={fields.opening_date ?? ""} onChange={(event) => setFields((value) => ({ ...value, opening_date: event.target.value || null }))}/></label>
      <label>기간 중 실제 입고 (개)<input type="number" min="0" step="1" placeholder="예: 50" value={fields.received_units ?? ""} onChange={(event) => updateNumber("received_units", event.target.value)}/><small>기초재고일부터 {asOf}까지 들어온 수량</small></label>
      <label>입고 소요일 (일)<input type="number" min="0" step="1" placeholder="예: 14" value={fields.lead_time_days ?? ""} onChange={(event) => updateNumber("lead_time_days", event.target.value)}/></label>
      <label>현재 판매가 (원)<input type="number" min="0" step="1" placeholder="예: 59000" value={fields.unit_price_krw ?? ""} onChange={(event) => updateNumber("unit_price_krw", event.target.value)}/></label>
      <label>상품 매입원가 (원)<input type="number" min="0" step="1" placeholder="예: 24000" value={fields.unit_cost_krw ?? ""} onChange={(event) => updateNumber("unit_cost_krw", event.target.value)}/></label>
      <label>재발주<select value={fields.reorderable == null ? "" : String(fields.reorderable)} onChange={(event) => setFields((value) => ({ ...value, reorderable: event.target.value === "" ? null : event.target.value === "true" }))}><option value="">미확인</option><option value="true">가능</option><option value="false">불가</option></select></label>
      <label>상품 상태<select value={fields.lifecycle || ""} onChange={(event) => setFields((value) => ({ ...value, lifecycle: event.target.value || null }))}><option value="">미확인</option>{Object.entries(lifecycleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div><button type="button" className="button button-secondary" disabled={busy} onClick={() => void saveInputs()}>입력값 저장</button></details>
    <StrategyPlanner
      key={[item.sku, asOf, item.units_30d, item.stock_on_hand, item.inbound_units, item.unit_price_krw, item.unit_cost_krw].join("-")}
      observedUnits={item.units_30d}
      ready={comparisonReady}
      canReorder={item.reorderable === true}
      compareOption={(option) => workApi.compare({ dataset_id: dataset.id, sku: item.sku, as_of_date: asOf, ...option })}
      saveDecision={async (decision) => {
        await workApi.saveDecision({ dataset_id: dataset.id, sku: item.sku, as_of_date: asOf, ...decision });
        await onChanged();
      }}
    />
    {message && <p className="work-inline-message">{message}</p>}
  </section>;
}

function DecisionRow({ item, dataset, onChanged }: { item: WorkDecision; dataset: WorkDataset; onChanged: () => Promise<void> }) {
  const [date, setDate] = useState(item.as_of_date);
  const [outcome, setOutcome] = useState<{ status: string; note: string; before_units_7d?: number; after_units_7d?: number; before_revenue_7d?: number | null; after_revenue_7d?: number | null; before_gross_profit_7d?: number | null; after_gross_profit_7d?: number | null; before_stock?: number | null; after_stock?: number | null } | null>(null);
  const [error, setError] = useState("");
  async function execute() {
    try { await workApi.execute(item.id, date); await onChanged(); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "실행일을 저장하지 못했습니다."); }
  }
  return <article className="work-decision-row"><div><b>{item.name} · {item.action}</b><span>{item.executed_at ? `실행 기록 ${item.executed_at}` : "판단만 저장"}</span></div><p>{item.rationale}</p><small>{item.as_of_date} 기준 · 관측 14일 {n(item.observed_units_14d)}개 · 가정 이익 {item.estimated_gross_profit_krw == null ? "계산 전" : won(item.estimated_gross_profit_krw)}</small>
    {item.comparison_snapshot && <small>현재 운영 {item.comparison_snapshot.A.estimated_gross_profit_krw == null ? "재고 부족" : won(item.comparison_snapshot.A.estimated_gross_profit_krw)} · 제안 전략 {item.comparison_snapshot.B.estimated_gross_profit_krw == null ? "재고 부족" : won(item.comparison_snapshot.B.estimated_gross_profit_krw)} · 선택 {item.comparison_snapshot.selected_option === "A" ? "현재 운영" : "제안 전략"}</small>}
    {dataset.kind === "company" && <div className="work-outcome-controls">{!item.executed_at && <><label>실제 실행일<input type="date" min={item.as_of_date} value={date} onChange={(event) => setDate(event.target.value)}/></label><button className="button button-secondary" onClick={() => void execute()}>실행 기록</button></>}<button className="button button-secondary" onClick={() => void workApi.outcome(item.id).then(setOutcome).catch((err) => setError(err instanceof Error ? err.message : "결과를 불러오지 못했습니다."))}>전후 판매 확인</button></div>}
    {outcome && <div className="work-outcome">{outcome.status === "descriptive" && <div className="work-outcome-metrics"><span>판매량 <b>{n(outcome.before_units_7d || 0)} → {n(outcome.after_units_7d || 0)}개</b></span><span>매출 <b>{outcome.before_revenue_7d == null || outcome.after_revenue_7d == null ? "자료 없음" : `${won(outcome.before_revenue_7d)} → ${won(outcome.after_revenue_7d)}`}</b></span><span>매출총이익 <b>{outcome.before_gross_profit_7d == null || outcome.after_gross_profit_7d == null ? "자료 없음" : `${won(outcome.before_gross_profit_7d)} → ${won(outcome.after_gross_profit_7d)}`}</b></span><span>재고 <b>{outcome.before_stock == null || outcome.after_stock == null ? "두 날짜의 재고 입력 필요" : `${n(outcome.before_stock)} → ${n(outcome.after_stock)}개`}</b></span></div>}<small>{outcome.note}</small></div>}{error && <small className="work-error">{error}</small>}
  </article>;
}

function PlanningPanel({ products, dataset, onOpen }: { products: WorkProduct[]; dataset: WorkDataset; onOpen: (sku: string) => void }) {
  const groups = new Map<string, { current: number; previous: number; year: number; yearKnown: number; count: number }>();
  for (const item of products) {
    const row = groups.get(item.category) || { current: 0, previous: 0, year: 0, yearKnown: 0, count: 0 };
    row.current += item.units_30d; row.previous += item.prior_30d;
    if (item.year_ago_30d != null) { row.year += item.year_ago_30d; row.yearKnown += 1; }
    row.count += 1; groups.set(item.category, row);
  }
  const categories = [...groups.entries()].sort((a, b) => b[1].current - a[1].current).slice(0, 12);
  const seasonal = products.filter((item) => item.lifecycle && item.lifecycle !== "regular");
  return <><section className="panel work-panel"><div className="work-panel-heading"><div><h2>다음 기획에 참고할 판매 흐름</h2><small>현재 선택된 상품 범위에서 관측된 수량입니다. 전체 H&M 상품군의 실적은 아닙니다.</small></div></div><div className="table-scroll"><table className="data-table work-table"><thead><tr><th>상품 종류</th><th>상품 수</th><th>최근 30일</th><th>직전 30일</th><th>동일 상품 전년</th></tr></thead><tbody>{categories.map(([category, value]) => <tr key={category}><td>{category}</td><td>{n(value.count)}종</td><td>{n(value.current)}개</td><td>{n(value.previous)}개</td><td>{value.yearKnown ? `${n(value.year)}개 · ${value.yearKnown}종만` : "자료 없음"}</td></tr>)}</tbody></table></div><p className="work-caveat">H&M은 선정 상품 표본입니다. 신상은 작년 동일 SKU가 없을 수 있어 상품 종류의 수요 예측으로 바로 사용하지 않습니다.</p></section>
    <section className="panel work-panel"><div className="work-panel-heading"><div><h2>상품 상태별 검토</h2><small>여름 잔여·가을 신상·작년 겨울 행사 여부는 MD가 입력한 경우에만 적용합니다.</small></div></div>{seasonal.length ? <div className="work-priority-list">{seasonal.map((item) => <button key={item.sku} onClick={() => onOpen(item.sku)}><span className="work-risk stable">{lifecycleLabels[item.lifecycle!] || item.lifecycle}</span><span className="work-priority-main"><b>{item.name}</b><small>{item.reason}</small></span><ArrowRight size={16}/></button>)}</div> : <p className="work-empty">상품 상태가 아직 입력되지 않았습니다. 상품을 열어 여름 잔여·가을 신상·작년 겨울 행사를 지정할 수 있습니다.</p>}{dataset.kind === "hm" && <p className="work-caveat">H&M에는 출시 예정·재발주 가능 여부가 없습니다. 입력한 상품 상태는 시뮬레이션 조건입니다.</p>}</section></>;
}

function UploadPanel({ onUploaded, busy, setBusy, setError, setNotice }: {
  onUploaded: (id: number) => Promise<void>; busy: boolean; setBusy: (value: boolean) => void;
  setError: (value: string) => void; setNotice: (value: string) => void;
}) {
  const { canUpload, runtime, user } = useAccount();
  const [name, setName] = useState("");
  const [snapshot, setSnapshot] = useState(new Date().toISOString().slice(0, 10));
  const [complete, setComplete] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [products, setProducts] = useState<File | null>(null);
  const [sales, setSales] = useState<File | null>(null);
  async function submit() {
    if (!products || !sales || !name.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await workApi.upload(name, snapshot, complete, products, sales, synthetic);
      await onUploaded(result.id);
      setNotice(`${result.product_count}종 상품과 ${result.daily_rows}개 일별 판매 기록을 새 작업공간에 연결했습니다.`);
    } catch (err) { setError(err instanceof Error ? err.message : "파일을 연결하지 못했습니다."); }
    finally { setBusy(false); }
  }
  if (!canUpload) return <section className="panel work-upload"><p>{runtime.auth_enabled ? "자기 파일을 올리려면 로그인해 주세요. 데모 입력·전략 비교·판단 저장은 바로 체험할 수 있습니다." : "현재는 합성 의류 데모입니다. 자기 파일은 개인 PC에서 연결할 수 있습니다."}</p></section>;
  async function clearTemporaryData() {
    if (!window.confirm("이 브라우저에서 올린 자료와 판단 기록을 삭제하고 합성 데모로 돌아갈까요? 삭제한 자료는 되돌릴 수 없습니다.")) return;
    setBusy(true); setError("");
    try {
      const response = await apiFetch("/api/workspace/reset", { method: "POST" });
      if (!response.ok) throw new Error("자료를 지우지 못했습니다. 다시 시도해 주세요.");
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "자료를 지우지 못했습니다."); setBusy(false); }
  }
  return <details id="company-upload" className="panel work-upload" open={runtime.mode !== "local"}>
    <summary><FileUp size={17}/> 상품·판매 파일 연결</summary>
    <div className="work-upload-body">
      <p>상품·판매 CSV 또는 XLSX를 올리면 바로 분석합니다. 재고 기준일은 판매 파일의 마지막 날짜로 지정하세요.</p>
      {runtime.mode !== "local" && !user && <small>이 브라우저의 임시 작업공간입니다. 접속 후 최대 {Math.round(runtime.guest_ttl_seconds / 3600)}시간 동안 접근할 수 있으며, 쿠키를 지우면 다시 열 수 없습니다.</small>}
      <div className="work-template-links">
        <a className="button button-secondary" href={`${apiBase}/api/templates/products`} download>상품 파일 예시</a>
        <a className="button button-secondary" href={`${apiBase}/api/templates/sales`} download>판매 파일 예시</a>
      </div>
      <div className="work-form-grid">
        <label>작업공간 이름<input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 10월 여성복 운영"/></label>
        <label>재고 기준일<input type="date" value={snapshot} onChange={(event) => setSnapshot(event.target.value)}/></label>
        <label>상품 파일<input type="file" accept=".csv,.xlsx" onChange={(event) => setProducts(event.target.files?.[0] || null)}/><small>필수: sku, name · 재고·원가 등은 선택</small></label>
        <label>일별 판매 파일<input type="file" accept=".csv,.xlsx" onChange={(event) => setSales(event.target.files?.[0] || null)}/><small>필수: sku, sale_date, units_sold</small></label>
      </div>
      <label className="work-checkbox"><input type="checkbox" checked={complete} onChange={(event) => setComplete(event.target.checked)}/> 선택 기간의 모든 판매가 포함돼 있습니다. 기록이 없는 날은 0개 판매로 봐도 됩니다.</label>
      <label className="work-checkbox"><input type="checkbox" checked={synthetic} onChange={(event) => setSynthetic(event.target.checked)}/> 가상 데이터로 표시 (공개 데모 파일을 올릴 때 체크)</label>
      <button type="button" className="button button-primary" disabled={!products || !sales || !name.trim() || busy} onClick={() => void submit()}><Database size={16}/>{busy ? "검증하고 연결 중…" : "파일 검증 후 연결"}</button>
      {runtime.mode !== "local" && !user && <button type="button" className="button button-secondary" disabled={busy} onClick={() => void clearTemporaryData()}>내 임시 자료 삭제</button>}
    </div>
  </details>;
}
