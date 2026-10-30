import { apiFetch } from "./http";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === "string" ? error.detail : "요청을 처리하지 못했습니다.");
  }
  return response.json() as Promise<T>;
}

export interface WorkDataset {
  id: number; name: string; kind: "hm" | "company" | "synthetic"; start_date: string; end_date: string;
  source_note: string; complete_calendar: boolean;
}

export interface WorkProduct {
  sku: string; name: string; category: string; section: string; image_ref: string | null;
  lifecycle: string | null; units_7d: number; units_14d: number; prior_14d: number;
  units_30d: number; prior_30d: number; year_ago_30d: number | null;
  channel_units_30d: Record<string, number>;
  observed_revenue_30d: number | null; observed_gross_profit_30d: number | null;
  stock_on_hand: number | null; inbound_units: number | null; inbound_date: string | null; lead_time_days: number | null;
  opening_stock: number | null; opening_date: string | null; received_units: number | null; sell_through: SellThrough;
  unit_price_krw: number | null; unit_cost_krw: number | null; reorderable: boolean | null;
  input_source: string | null; input_as_of_date: string | null; days_of_cover: number | null;
  risk: string; reason: string; action: string;
}

export interface SellThrough {
  status: "ok" | "missing" | "mismatch" | "no_supply" | "not_applicable"; pct: number | null; reason: string;
  source: string | null; start?: string; end?: string; sold_units?: number; opening_stock?: number | null;
  received_units?: number | null; closing_stock?: number | null; difference_units?: number | null; label?: string;
}

export interface WorkAnalysis {
  dataset: Pick<WorkDataset, "id" | "name" | "kind" | "source_note" | "complete_calendar">;
  as_of_date: string; chart_start: string; sections: string[]; products: WorkProduct[];
  daily_chart: { date: string; units: number }[];
  summary: { total_products: number; attention_count: number; units_30d: number };
}

export interface CatalogProduct {
  sku: string; name: string; category: string; section: string; image_ref: string | null;
  units_14d: number | null; units_30d: number | null; sales_as_of_date: string | null;
  stock_on_hand: number | null; stock_source: string; stock_as_of_date: string | null;
  reviewable: boolean;
}

export interface PeerContext {
  sku: string; scope: "apparel" | "accessory" | "other"; as_of_date: string;
  section?: string; category?: string; note: string;
  observed?: { units_7d: number; prior_7d: number; units_14d: number; prior_14d: number };
  comparison?: { registered: number; active_14d: number; active_7d: number;
    rank_14d: number | null; rank_7d: number | null; median_14d: number | null;
    median_7d: number | null; enough_peers: boolean };
  top_peers?: { sku: string; name: string; units_14d: number }[];
  inventory?: { stock_on_hand: number; lead_time_days: number; reorderable: boolean;
    inbound_before_lead: number; source: string } | null;
  replenishment?: { daily_units: number; safety_days: number; target_units: number;
    review_units: number | null; cover_days: number | null; note: string } | null;
}

export interface SeasonGroup { section: string; category: string; scope: "apparel" | "accessory"; products: number; units_14d: number }
export interface SeasonReview {
  as_of_date: string; section: string; category: string; scope: "apparel" | "accessory";
  registered: number; note: string;
  weekly: { week_index: number; start_2019: string; start_2020: string; units_2019: number; units_2020: number }[];
  totals: { "2019": number; "2020": number; active_2019: number; active_2020: number };
  candidates: { sku: string; name: string; units_2019: number; units_2020: number; units_14d: number }[];
}
export interface SeasonPlan { id: number; section: string; category: string; as_of_date: string;
  candidates: { sku: string; planned_units: number }[]; planned_units: number;
  rationale: string; created_at: string; sales_snapshot: SeasonReview }

export const peerApi = {
  context: (datasetId: number, sku: string) => call<PeerContext>(`/api/work/peers/${encodeURIComponent(sku)}?dataset_id=${datasetId}`),
  groups: (datasetId: number) => call<SeasonGroup[]>(`/api/work/season-groups?dataset_id=${datasetId}`),
  review: (datasetId: number, section: string, category: string, scope: "apparel" | "accessory") => {
    const query = new URLSearchParams({ dataset_id: String(datasetId), section, category, scope });
    return call<SeasonReview>(`/api/work/season-review?${query}`);
  },
  plans: (datasetId: number) => call<SeasonPlan[]>(`/api/work/season-plans?dataset_id=${datasetId}`),
  savePlan: (body: { dataset_id: number; section: string; category: string; scope: "apparel" | "accessory";
    candidates: { sku: string; planned_units: number }[]; rationale: string }) => call<{ id: number; planned_units: number }>(
    "/api/work/season-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
};

export interface CatalogResult {
  dataset_id: number; total: number; page: number; page_size: number;
  catalog_ready: boolean; items: CatalogProduct[];
}

export type CatalogSortBy = "name" | "category" | "section" | "units_30d" | "stock";
export type CatalogSortDir = "asc" | "desc";

export interface WorkComparison {
  sku: string; dataset_kind: string; source: string; discount_pct: number;
  expected_units_30d: number; purchase_units: number; purchase_arrival_date: string | null; available_units: number;
  stock_and_inbound_units: number; proposed_unit_price_krw: number; feasible: boolean;
  first_gap_date: string | null; max_gap_units: number; receipts_counted: { date: string; units: number }[];
  excluded_notes: string[]; estimated_revenue_krw: number | null;
  estimated_gross_profit_krw: number | null; estimated_remaining_units: number | null; note: string;
}

export interface WorkDecision {
  id: number; sku: string; name: string; as_of_date: string; action: string;
  rationale: string; observed_units_14d: number; discount_pct: number | null;
  expected_units_30d: number | null; purchase_units: number | null;
  assumed_stock: number | null; estimated_gross_profit_krw: number | null;
  executed_at: string | null; created_at: string;
  comparison_snapshot?: { selected_option: "A" | "B"; A: WorkComparison; B: WorkComparison } | null;
}

export interface WorkInputs {
  as_of_date: string; stock_on_hand: number | null; inbound_units: number | null; inbound_date: string | null;
  opening_stock: number | null; opening_date: string | null; received_units: number | null;
  lead_time_days: number | null; unit_price_krw: number | null;
  unit_cost_krw: number | null; reorderable: boolean | null; lifecycle: string | null;
}

export interface WorkOption {
  dataset_id: number; sku: string; as_of_date: string; discount_pct: number;
  expected_units_30d: number; purchase_units: number;
}

export const workApi = {
  datasets: () => call<WorkDataset[]>("/api/work/datasets"),
  catalog: (id: number, query: string, page: number, asOf: string, simulation: boolean,
            sortBy: CatalogSortBy = "name", sortDir: CatalogSortDir = "asc") => {
    const params = new URLSearchParams({ dataset_id: String(id), q: query, page: String(page),
      as_of: asOf, simulation: String(simulation), sort_by: sortBy, sort_dir: sortDir });
    return call<CatalogResult>(`/api/work/catalog?${params}`);
  },
  analysis: (id: number, asOf?: string, section?: string, start?: string) => {
    const query = new URLSearchParams({ dataset_id: String(id) });
    if (asOf) query.set("as_of", asOf);
    if (section) query.set("section", section);
    if (start) query.set("chart_start", start);
    return call<WorkAnalysis>(`/api/work/analysis?${query}`);
  },
  upload: (name: string, snapshotDate: string, complete: boolean, products: File, sales: File, synthetic = false) => {
    const body = new FormData();
    body.set("name", name); body.set("snapshot_date", snapshotDate);
    body.set("complete_calendar", String(complete)); body.set("synthetic", String(synthetic));
    body.set("products_file", products); body.set("sales_file", sales);
    return call<{ id: number; product_count: number; daily_rows: number }>("/api/work/datasets/upload", { method: "POST", body });
  },
  appendSales: (id: number, file: File, complete: boolean) => {
    const body = new FormData(); body.set("sales_file", file); body.set("complete_calendar", String(complete));
    return call<{ updated: number; end_date: string; complete_calendar: boolean }>(
      `/api/work/datasets/${id}/sales/import`, { method: "POST", body });
  },
  updateInputs: (id: number, sku: string, body: WorkInputs) => call<{ sku: string }>(
    `/api/work/datasets/${id}/products/${encodeURIComponent(sku)}/inputs`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
  compare: (body: WorkOption) => call<WorkComparison>("/api/work/compare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }),
  decisions: (id: number) => call<WorkDecision[]>(`/api/work/datasets/${id}/decisions`),
  saveDecision: (body: WorkOption & { action: string; rationale: string; baseline_expected_units_30d?: number; selected_option?: "A" | "B" }) => call<{ id: number; saved: boolean }>(
    "/api/work/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  execute: (id: number, date: string) => call<{ id: number; executed_at: string }>(
    `/api/work/decisions/${id}/execute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ executed_at: date }) }),
  outcome: (id: number) => call<{ status: string; note: string; before_units_7d?: number; after_units_7d?: number }>(
    `/api/work/decisions/${id}/outcome`),
};

export interface SimScenario {
  id: number; dataset_id: number; name: string; as_of_date: string; ledger_start: string; ledger_end: string;
  source_note: string; bias_note: string; shortfall_note: string;
  sources: { sales: string; conditions: string; results: string };
}

export interface SimProduct {
  product_id: number; sku: string; name: string; section: string; category: string; image_ref: string | null;
  observed: { units_7d: number; units_14d: number; prior_14d: number; units_30d: number; prior_30d: number;
    first_sale_date: string | null; source: string };
  conditions: { stock_on_hand: number; planned_inbound_after_as_of: number; planned_inbound_30d: number;
    lead_time_days: number; reorderable: boolean; reorder_stop_date: string | null; scenario_lifecycle: string;
    lifecycle_label: string; list_price_krw: number; selling_price_krw: number; unit_cost_krw: number; source: string };
  signal: { risk: string; reason: string; action: string; days_of_cover: number | null;
    simulated_revenue_30d_krw: number; simulated_gross_profit_30d_krw: number; source: string };
  sell_through: SellThrough;
  post_as_of: { start: string; end: string; observed_units: number; supplied_units: number;
    policy_shortfall_units: number; first_shortfall_date: string | null; closing_stock: number };
}

export interface SimAnalysis {
  scenario: SimScenario; as_of_date: string; products: SimProduct[];
  summary: { total_products: number; risk_counts: Record<string, number>; attention_count: number;
    units_30d: number; simulated_gross_profit_30d_krw: number };
  post_as_of_summary: { start: string; end: string; observed_units: number; supplied_units: number;
    policy_shortfall_units: number; products_with_shortfall: number; note: string };
  retrospective: SimRetrospective;
}

export interface SimForecast {
  as_of_date: string; horizon_days: number; seasonal_factor: number | null;
  windows: Record<"recent" | "after" | "base_last_year" | "after_last_year", [string, string]>;
  seasonal_reference: { base_units: number; after_units: number };
  methods: Record<"velocity" | "seasonal", string>; note: string; sources: Record<string, string>;
  validation: { products: number } & Partial<Record<"velocity" | "seasonal",
    { estimated_units: number; actual_units: number; wape_pct: number | null; bias_pct: number | null }>>;
  products: { sku: string; name: string; risk: string; recent_14d_units: number;
    estimate: { velocity: number; seasonal: number | null }; supply_until_end: number;
    expected_gap_units: number | null; first_gap_date: string | null; purchase_arrives_in_window: boolean; actual_units: number;
    policy_shortfall_units: number }[];
}

export interface SimRetrospective {
  post_days: number; note: string; sources: Record<string, string>;
  groups: { risk: string; products: number; before_daily_units: number; after_daily_units: number;
    daily_change_pct: number | null; products_sold_after: number; products_with_shortfall: number;
    policy_shortfall_units: number; as_of_stock: number; end_stock: number }[];
}

export interface SimProductDetail extends SimProduct {
  scenario: SimScenario;
  policy: { selection_reason: string; assumption_reason: string };
  ledger: { date: string; period: "as_of_window" | "post_as_of_observed"; opening_stock: number; inbound_units: number;
    observed_units: number; supplied_units: number; policy_shortfall_units: number; closing_stock: number }[];
  planned_orders: { po_code: string; order_date: string; expected_receipt_date: string; actual_receipt_date: string | null;
    ordered_units: number; received_units: number; status: string; timing: string; assumption_reason: string }[];
  prices: { valid_from: string; valid_to: string; list_price_krw: number; selling_price_krw: number;
    unit_cost_krw: number; price_tier_rule: string; cost_rule: string }[];
}

export interface SimComparison {
  sku: string; as_of_date: string; discount_pct: number; expected_units_30d: number; purchase_units: number;
  purchase_arrival_date: string | null; purchase_counted_in_30d: boolean | null; available_units_30d: number;
  proposed_unit_price_krw: number; unit_cost_krw: number; feasible: boolean; estimated_revenue_krw: number | null;
  first_gap_date: string | null; max_gap_units: number; receipts_counted: { date: string; units: number }[];
  estimated_gross_profit_krw: number | null; estimated_remaining_units: number | null; source: string; note: string;
}

export interface SimDecision {
  id: number; sku: string; name: string; as_of_date: string; action: string; rationale: string; created_at: string;
  snapshot: { scenario: { id: number; name: string; as_of_date: string };
    observed: SimProduct["observed"]; conditions: SimProduct["conditions"]; signal: SimProduct["signal"];
    comparison: SimComparison; bias_note: string;
    alternatives?: { selected_option: "A" | "B"; A: SimComparison; B: SimComparison } };
}

export interface SimOption { scenario_id: number; sku: string; discount_pct: number; expected_units_30d: number; purchase_units: number }

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const simApi = {
  scenarios: (datasetId: number) => call<SimScenario[]>(`/api/work/sim/scenarios?dataset_id=${datasetId}`),
  importSample: (datasetId: number) => call<SimScenario>(`/api/work/sim/import-sample?dataset_id=${datasetId}`, { method: "POST" }),
  analysis: (scenarioId: number) => call<SimAnalysis>(`/api/work/sim/analysis?scenario_id=${scenarioId}`),
  forecast: (scenarioId: number) => call<SimForecast>(`/api/work/sim/forecast?scenario_id=${scenarioId}`),
  product: (scenarioId: number, sku: string) =>
    call<SimProductDetail>(`/api/work/sim/products/${encodeURIComponent(sku)}?scenario_id=${scenarioId}`),
  compare: (body: SimOption) => call<SimComparison>("/api/work/sim/compare", json(body)),
  decisions: (scenarioId: number) => call<SimDecision[]>(`/api/work/sim/decisions?scenario_id=${scenarioId}`),
  saveDecision: (body: SimOption & { action: string; rationale: string; baseline_expected_units_30d?: number; selected_option?: "A" | "B" }) => call<SimDecision>("/api/work/sim/decisions", json(body)),
};
