import { useEffect, useState } from "react";
import { Activity, Boxes, ChartNoAxesCombined, Image, ImageOff, LayoutDashboard, Menu, X } from "lucide-react";
import WorkPage from "./WorkPage";
import { AccountControls, useAccount } from "./Account";

export type WorkView = "overview" | "products" | "actions" | "planning";

const labels: Record<WorkView, string> = {
  overview: "오늘의 할 일",
  products: "전체 상품",
  actions: "내 결정 기록",
  planning: "다음 시즌 기획",
};

export default function App() {
  const { runtime } = useAccount();
  const [view, setView] = useState<WorkView>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [uploadRequested, setUploadRequested] = useState(false);
  useEffect(() => {
    if (!uploadRequested || view !== "overview") return;
    const frame = requestAnimationFrame(() => {
      const panel = document.getElementById("company-upload");
      if (panel instanceof HTMLDetailsElement) panel.open = true;
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      setUploadRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [uploadRequested, view]);
  // Photos are visible on every fresh visit; hiding them is only for the current page session.
  const [hidePhotos, setHidePhotos] = useState(false);

  function togglePhotos() {
    setHidePhotos((value) => !value);
  }

  function navigate(next: WorkView) {
    setView(next);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <div className={`app-shell ${hidePhotos ? "hide-photos" : ""}`}>
    {mobileNavOpen && <button className="mobile-nav-backdrop" aria-label="메뉴 닫기" onClick={() => setMobileNavOpen(false)} />}
    <aside className={`sidebar ${mobileNavOpen ? "mobile-open" : ""}`}>
      <div className="brand-lockup"><div className="brand-mark">MD</div><div><strong>Decision Lab</strong><span>COMMERCE INTELLIGENCE</span></div></div>
      <nav className="side-nav" aria-label="주요 메뉴">
        <button className={view === "overview" ? "active" : ""} onClick={() => navigate("overview")}><LayoutDashboard size={17} /> 오늘의 할 일</button>
        <button className={view === "products" ? "active" : ""} onClick={() => navigate("products")}><Boxes size={17} /> 전체 상품</button>
        <button className={view === "actions" ? "active" : ""} onClick={() => navigate("actions")}><Activity size={17} /> 내 결정 기록</button>
        <p className="nav-spaced">분석</p>
        <button className={view === "planning" ? "active" : ""} onClick={() => navigate("planning")}><ChartNoAxesCombined size={17} /> 다음 시즌 기획</button>
      </nav>
      <div className="sidebar-bottom"><div className="user-row"><div className="avatar">MD</div><div><b>MD 매니저</b><small>{runtime.mode === "local" ? "로컬 작업공간" : "개인 작업공간"}</small></div></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" aria-label="메뉴 열기" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((open) => !open)}>{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button><div className="breadcrumbs"><span>MD Decision Lab</span><b>/</b><strong>{labels[view]}</strong></div><button type="button" className="photo-toggle" aria-pressed={hidePhotos} onClick={togglePhotos} title="상품 사진은 H&M Kaggle 자료입니다. 캡처·시연 자료에서는 숨기세요.">{hidePhotos ? <ImageOff size={16}/> : <Image size={16}/>}{hidePhotos ? "사진 숨김" : "사진 표시"}</button><AccountControls onUpload={() => { navigate("overview"); setUploadRequested(true); }}/></header>
      <div className="content-wrap"><WorkPage view={view} onNavigate={navigate}/><footer className="page-footer"><span>MD Decision Lab · {runtime.mode === "local" ? "로컬 MD 작업공간" : "개인 MD 작업공간"}</span><span>시나리오는 실제 매출 성과가 아닙니다.</span></footer></div>
    </main>
  </div>;
}
