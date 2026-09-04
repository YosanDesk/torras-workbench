"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Tab = "progress" | "requests" | "ideas";
type Week = { capacity: number; start: string; end: string };
type Product = { id: string; name: string; videoTarget: number; videoDone: number; imageTarget: number; imageDone: number; note?: string };
type WorkRequest = { id: string; name: string; product: string; deliveryType: string; feishuLink: string; quantity: number; dueDate: string; priority: string; submitter: string; notes: string; status: "待确认" | "制作中" | "已完成"; createdAt: string };
type Idea = { id: string; title: string; copy: string; referenceLink: string; story: string; category: "文案" | "视频" | "用户故事" | "其他"; recorder: string; date?: string; accepted: boolean; createdAt: string };
type WeekRecord = Week & { id: string; products: Product[] };
type AppData = { week: Week; products: Product[]; requests: WorkRequest[]; ideas: Idea[]; weekHistory?: WeekRecord[]; activeWeekId?: string };
type SaveState = "loading" | "saved" | "saving" | "error";

const EDIT_SESSION_KEY = "torras-edit-session-expires";
const EDIT_PASSWORD = "0702";

const fallback: AppData = {
  week: { capacity: 0, start: "2026-08-31", end: "2026-09-06" },
  products: [
    { id: "product-air", name: "Air", videoTarget: 0, videoDone: 0, imageTarget: 0, imageDone: 0, note: "" },
    { id: "product-air-pro", name: "Air Pro", videoTarget: 0, videoDone: 0, imageTarget: 0, imageDone: 0, note: "" },
    { id: "product-leather", name: "皮革", videoTarget: 0, videoDone: 0, imageTarget: 0, imageDone: 0, note: "" },
  ], requests: [], ideas: [], weekHistory: [], activeWeekId: "2026-08-31",
};

const rangeLabel = (start: string, end: string) => {
  const a = new Date(`${start}T00:00:00`); const b = new Date(`${end}T00:00:00`);
  return `${a.getMonth() + 1}.${a.getDate()}-${b.getMonth() + 1}.${b.getDate()}`;
};
const emptyRequest = { name: "", product: "", deliveryType: "视频", feishuLink: "", quantity: 1, dueDate: "2026-08-31", priority: "普通", submitter: "", notes: "" };
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const weekType = (start: string) => Math.abs(Math.round((new Date(`${start}T00:00:00`).getTime() - new Date("2026-08-31T00:00:00").getTime()) / (7 * 86400000))) % 2 === 0 ? "小周" : "大周";
const localDateValue = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const normalizeLegacyWeekStart = (start: string) => {
  const value = new Date(`${start}T00:00:00`); const anchor = new Date("2026-08-30T00:00:00");
  const offset = Math.round((value.getTime() - anchor.getTime()) / 86400000);
  if (offset >= 0 && offset <= 119 && offset % 7 === 0) { value.setDate(value.getDate() + 1); return localDateValue(value); }
  return start;
};
const emptyIdea = { title: "", copy: "", referenceLink: "", story: "", category: "文案" as const, recorder: "", date: localDateValue(new Date()) };
const ideaDateLabel = (idea: Idea) => new Date(`${idea.date || idea.createdAt.slice(0, 10)}T00:00:00`).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
const weeklyPeriods = Array.from({ length: 17 }, (_, index) => {
  const date = new Date("2026-08-31T00:00:00"); date.setDate(date.getDate() + index * 7);
  const end = new Date(date); end.setDate(end.getDate() + 6);
  const fmt = (value: Date) => `${value.getMonth() + 1}.${value.getDate()}`;
  return { start: localDateValue(date), end: localDateValue(end), label: `${fmt(date)}-${fmt(end)}` };
});

const safeNumber = (value: string | number) => Math.max(0, Number(value) || 0);
const weekLabel = (start: string) => {
  const anchor = new Date("2026-08-31T00:00:00").getTime();
  const value = new Date(`${start}T00:00:00`).getTime();
  const index = Math.floor((value - anchor) / (7 * 86400000)) + 1;
  const date = new Date(`${start}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日第${index}周`;
};

export default function Home() {
  const [tab, setTab] = useState<Tab>("progress");
  const [data, setData] = useState<AppData>(fallback);
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [ready, setReady] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState(emptyRequest);
  const [ideaDraft, setIdeaDraft] = useState(emptyIdea);
  const [isEditing, setIsEditing] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const skipFirstSave = useRef(true);

  const showToast = useCallback((type: "success" | "error", text: string) => {
    setToast({ type, text }); window.setTimeout(() => setToast(null), 3600);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setSaveState("loading");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json() as { data?: AppData; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error || "读取失败");
      const incoming = payload.data as Partial<AppData>;
      const loadedWeek = { ...fallback.week, ...(incoming.week || {}) };
      loadedWeek.start = normalizeLegacyWeekStart(loadedWeek.start);
      const loadedHistory = Array.isArray(incoming.weekHistory) ? incoming.weekHistory.map((item) => { const start = normalizeLegacyWeekStart(item.start); return start === item.start ? item : { ...item, id: start, start }; }) : [];
      setData({
        week: loadedWeek,
        products: Array.isArray(incoming.products) ? incoming.products : fallback.products,
        requests: Array.isArray(incoming.requests) && incoming.requests.every((item) => "deliveryType" in item) ? incoming.requests : [],
        ideas: Array.isArray(incoming.ideas) ? incoming.ideas : [],
        weekHistory: loadedHistory,
        activeWeekId: normalizeLegacyWeekStart(incoming.activeWeekId || incoming.week?.start || fallback.activeWeekId || fallback.week.start),
      });
      setSaveState("saved"); setReady(true);
    } catch (error) {
      setSaveState("error"); setReady(true);
      if (!silent) showToast("error", error instanceof Error ? error.message : "共享数据加载失败");
    }
  }, [showToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!ready) return;
    if (skipFirstSave.current) { skipFirstSave.current = false; return; }
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/dashboard", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "保存失败");
        setSaveState("saved");
      } catch (error) { setSaveState("error"); showToast("error", error instanceof Error ? error.message : "保存失败，请重试"); }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [data, ready, showToast]);

  const enterEditMode = () => {
    const expiresAt = Number(window.localStorage.getItem(EDIT_SESSION_KEY) || 0);
    if (expiresAt > Date.now()) { setIsEditing(true); showToast("success", "已进入编辑模式"); return; }
    setPassword(""); setPasswordError(""); setPasswordOpen(true);
  };
  const unlockEditing = (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== EDIT_PASSWORD) { setPasswordError("密码错误，请重新输入"); return; }
    const expiresAt = new Date(); expiresAt.setMonth(expiresAt.getMonth() + 6);
    window.localStorage.setItem(EDIT_SESSION_KEY, String(expiresAt.getTime()));
    setPasswordOpen(false); setPassword(""); setPasswordError(""); setIsEditing(true); showToast("success", "已进入编辑模式，密码将在本设备保存 6 个月");
  };

  const totals = useMemo(() => data.products.reduce((sum, p) => ({ target: sum.target + p.videoTarget + p.imageTarget, done: sum.done + Math.min(p.videoDone, p.videoTarget) + Math.min(p.imageDone, p.imageTarget) }), { target: 0, done: 0 }), [data.products]);
  const scheduled = totals.target;
  const done = totals.done;
  const remaining = Math.max(0, scheduled - done);
  const capacityPct = data.week.capacity ? Math.min(100, Math.round(done / data.week.capacity * 100)) : 0;
  const acceptedCount = data.ideas.filter((idea) => idea.accepted).length;

  const updateProduct = (id: string, patch: Partial<Product>) => setData((current) => ({ ...current, products: current.products.map((p) => p.id === id ? { ...p, ...patch } : p) }));
  const addProduct = () => setData((current) => ({ ...current, products: [...current.products, { id: uid("product"), name: "", videoTarget: 0, videoDone: 0, imageTarget: 0, imageDone: 0, note: "" }] }));

  const switchWeek = (start: string) => setData((current) => {
    const period = weeklyPeriods.find((item) => item.start === start);
    if (!period) return current;
    if (start === current.week.start) {
      return current.week.end === period.end ? current : { ...current, week: { ...current.week, end: period.end } };
    }
    const existing = (current.weekHistory || []).find((item) => item.start === start);
    const archivedCurrent: WeekRecord = { ...current.week, id: current.activeWeekId || current.week.start, products: current.products };
    if (existing) return { ...current, week: { capacity: existing.capacity, start: period.start, end: period.end }, products: existing.products, activeWeekId: existing.id, weekHistory: [...(current.weekHistory || []).filter((item) => item.id !== archivedCurrent.id), archivedCurrent] };
    const nextWeek: Week = { capacity: 0, start: period.start, end: period.end };
    return { ...current, week: nextWeek, products: current.products.map((item) => ({ ...item, videoTarget: 0, videoDone: 0, imageTarget: 0, imageDone: 0, note: "" })), activeWeekId: start, weekHistory: [...(current.weekHistory || []).filter((item) => item.id !== archivedCurrent.id), archivedCurrent] };
  });

  const submitRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requestDraft.product || !requestDraft.dueDate || !requestDraft.submitter) { showToast("error", "请完整填写产品、截止日期和提交人"); return; }
    const item: WorkRequest = { ...requestDraft, name: `${requestDraft.product} ${requestDraft.deliveryType}需求`, id: uid("request"), quantity: Math.max(1, requestDraft.quantity), status: "待确认", createdAt: new Date().toISOString() };
    setData((current) => ({ ...current, requests: [item, ...current.requests] }));
    setRequestOpen(false); setRequestDraft(emptyRequest); showToast("success", "需求已保存，正在通知飞书群");
    try {
      const response = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "飞书通知失败");
      showToast("success", "需求已保存并发送飞书通知");
    } catch (error) { showToast("error", `需求已保存；${error instanceof Error ? error.message : "飞书通知失败"}`); }
  };

  const submitIdea = (event: React.FormEvent) => {
    event.preventDefault();
    const generatedTitle = (ideaDraft.copy || ideaDraft.story).trim().slice(0, 28) || `${ideaDraft.category}灵感`;
    const item: Idea = { ...ideaDraft, title: generatedTitle, id: uid("idea"), accepted: false, createdAt: new Date().toISOString() };
    setData((current) => ({ ...current, ideas: [item, ...current.ideas] })); setIdeaOpen(false); setIdeaDraft(emptyIdea); showToast("success", "灵感已加入共享库");
  };

  const labels: Record<Tab, { title: string; eyebrow: string }> = { progress: { title: "视频进度", eyebrow: "CONTENT OPERATIONS" }, requests: { title: "视频需求表", eyebrow: "REQUEST PIPELINE" }, ideas: { title: "日区灵感库", eyebrow: "JAPAN IDEA LIBRARY" } };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img className="brand-badge" src="/torras-mark.jpeg" alt="TORRAS" /><div><strong>图拉斯</strong><small>日本站协助台</small></div></div>
      <nav aria-label="主导航">{([["progress", "视频进度", "01"], ["requests", "视频需求表", "02"], ["ideas", "日区灵感库", "03"]] as const).map(([key, label, index]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><span>{index}</span><b>{label}</b></button>)}</nav>
      <div className="sidebar-note"><i className={saveState === "error" ? "error-dot" : ""} />{saveState === "loading" ? "正在连接" : saveState === "error" ? "同步异常" : "共享协作中"}<small>数据跨设备实时保存</small></div>
    </aside>

    <main className={`page-${tab}`}>
      <header className="topbar"><div><p className="eyebrow">{labels[tab].eyebrow}</p><h1>{labels[tab].title}</h1></div><MangaScene variant={tab} /><div className="topbar-actions">{tab === "progress" && <><span className={`mode-pill ${isEditing ? "editing" : "readonly"}`}>{isEditing ? "编辑中" : "只读模式"}</span><button className={`edit-mode-button ${isEditing ? "active" : ""}`} onClick={() => isEditing ? setIsEditing(false) : enterEditMode()}>{isEditing ? "退出编辑" : "编辑模式"}</button></>}<div className={`save-pill ${saveState}`}><i />{saveState === "loading" ? "加载共享数据" : saveState === "saving" ? "正在保存" : saveState === "error" ? "保存失败" : "已自动保存"}</div></div></header>
      {!ready ? <Loading /> : <>
        {tab === "progress" && <ProgressView editable={isEditing} data={data} totals={{ done, scheduled, remaining, capacityPct }} setData={setData} updateProduct={updateProduct} addProduct={addProduct} switchWeek={switchWeek} />}
        {tab === "requests" && <RequestsView editable={true} requests={data.requests} onNew={() => setRequestOpen(true)} onStatus={(id, status) => setData((current) => ({ ...current, requests: current.requests.map((item) => item.id === id ? { ...item, status } : item) }))} onDelete={(id) => { setData((current) => ({ ...current, requests: current.requests.filter((item) => item.id !== id) })); showToast("success", "需求已删除"); }} />}
        {tab === "ideas" && <IdeasView editable={true} ideas={data.ideas} acceptedCount={acceptedCount} onNew={() => setIdeaOpen(true)} onToggle={(id) => setData((current) => ({ ...current, ideas: current.ideas.map((item) => item.id === id ? { ...item, accepted: !item.accepted } : item) }))} onDelete={(id) => { setData((current) => ({ ...current, ideas: current.ideas.filter((item) => item.id !== id) })); showToast("success", "灵感已删除"); }} />}
      </>}
    </main>
    {requestOpen && <Modal title="提交拍摄需求" subtitle="保存后将通过飞书机器人自动通知群聊" onClose={() => setRequestOpen(false)}><RequestForm value={requestDraft} setValue={setRequestDraft} onSubmit={submitRequest} onCancel={() => setRequestOpen(false)} /></Modal>}
    {ideaOpen && <Modal title="记录日区灵感" subtitle="把零散观察沉淀成团队可复用的内容资产" onClose={() => setIdeaOpen(false)}><IdeaForm value={ideaDraft} setValue={setIdeaDraft} onSubmit={submitIdea} onCancel={() => setIdeaOpen(false)} /></Modal>}
    {passwordOpen && <Modal title="进入编辑模式" subtitle="输入密码后，本设备 6 个月内无需再次输入" onClose={() => setPasswordOpen(false)}><form className="password-form" onSubmit={unlockEditing}><label><span>编辑密码</span><input autoFocus type="password" inputMode="numeric" value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }} placeholder="请输入密码" /></label>{passwordError && <p role="alert">{passwordError}</p>}<div className="form-actions"><button type="button" className="secondary-button" onClick={() => setPasswordOpen(false)}>取消</button><button className="primary-button" type="submit">确认进入</button></div></form></Modal>}
    {toast && <div className={`toast ${toast.type}`} role="status"><b>{toast.type === "success" ? "✓" : "!"}</b>{toast.text}</div>}
  </div>;
}

function ProgressView({ editable, data, totals, setData, updateProduct, addProduct, switchWeek }: { editable: boolean; data: AppData; totals: { done: number; scheduled: number; remaining: number; capacityPct: number }; setData: React.Dispatch<React.SetStateAction<AppData>>; updateProduct: (id: string, patch: Partial<Product>) => void; addProduct: () => void; switchWeek: (start: string) => void }) {
  return <>
    <section className="capacity-panel"><div className="panel-heading"><div><span className="section-index">WEEKLY CAPACITY</span><h2>本周产能 <em className={`week-type ${weekType(data.week.start) === "小周" ? "small" : "large"}`}>（{weekType(data.week.start)}）</em></h2><p>按本周实际资源规划拍摄与图片交付</p></div><div className="date-range"><label>开始日期<input type="date" value={data.week.start} onChange={(e) => { const period = weeklyPeriods.find((item) => item.start === e.target.value); if (period) switchWeek(period.start); }} /></label><span>—</span><label>结束日期<input type="date" value={data.week.end} onChange={(e) => { const period = weeklyPeriods.find((item) => item.end === e.target.value); if (period) switchWeek(period.start); }} /></label><select aria-label="历史周" value={data.week.start} onChange={(e) => switchWeek(e.target.value)}>{!weeklyPeriods.some((period) => period.start === data.week.start) && <option value={data.week.start}>{rangeLabel(data.week.start, data.week.end)}（当前）</option>}{weeklyPeriods.map((period) => <option key={period.start} value={period.start}>{period.label}{period.start === data.week.start ? "（当前）" : ""}</option>)}</select></div></div>
      <div className="summary-grid"><label className="capacity-input"><span>{weekLabel(data.week.start)} · 可完成</span><div><input disabled={!editable} aria-label="本周可完成内容数量" type="number" min="0" value={data.week.capacity} onChange={(e) => setData((d) => ({ ...d, week: { ...d.week, capacity: safeNumber(e.target.value) } }))} /><small>项内容</small></div></label><Summary label="已完成" value={totals.done} unit="项" /><Summary label="已排期" value={totals.scheduled} unit="项" /><Summary label="待完成" value={totals.remaining} unit="项" /><Summary label="还可接需求" value={Math.max(0, data.week.capacity - totals.scheduled)} unit="项" /></div>
      <div className="total-progress"><div><span>总产能进度</span><b>{totals.capacityPct}%</b></div><div className="progress-track"><i style={{ width: `${totals.capacityPct}%` }} /></div><p>{totals.scheduled > data.week.capacity ? `当前排期超出本周产能 ${totals.scheduled - data.week.capacity} 项，请及时调整。` : `本周还有 ${Math.max(0, data.week.capacity - totals.done)} 项内容产能。`}</p></div>
    </section>
    <section className="deliveries"><div className="section-heading"><div><span className="section-index">DELIVERY BOARD</span><h2>视频进度明细</h2><p>修改目标和完成量后，进度与状态会自动更新</p></div><button disabled={!editable} className="primary-button" onClick={addProduct}>＋ 新增产品行</button></div>
      {data.products.length === 0 ? <Empty disabled={!editable} icon="＋" title="还没有产品" text="新增第一行并填写本周交付目标。" action="新增产品行" onAction={addProduct} /> : <div className="product-grid">{data.products.map((product) => <ProductRow editable={editable} key={product.id} product={product} update={updateProduct} remove={() => setData((d) => ({ ...d, products: d.products.filter((p) => p.id !== product.id) }))} />)}</div>}
    </section>
  </>;
}

function Summary({ label, value, unit }: { label: string; value: number; unit: string }) { return <div><span>{label}</span><strong>{value}</strong><small>{unit}</small></div>; }
function ProductRow({ editable, product, update, remove }: { editable: boolean; product: Product; update: (id: string, patch: Partial<Product>) => void; remove: () => void }) {
  const totalTarget = product.videoTarget + product.imageTarget;
  const totalDone = Math.min(product.videoDone, product.videoTarget) + Math.min(product.imageDone, product.imageTarget);
  const remaining = Math.max(0, totalTarget - totalDone);
  const pct = totalTarget ? Math.min(100, Math.round(totalDone / totalTarget * 100)) : 0;
  const complete = totalTarget > 0 && product.videoDone >= product.videoTarget && product.imageDone >= product.imageTarget;
  const pace = complete ? "已完成" : pct < 50 ? "待提速" : "进行中";
  return <article className="product-card">
    <div className="product-card-head">
      <input disabled={!editable} className="product-name" aria-label="产品名称" placeholder="填写产品名称" value={product.name} onChange={(e) => update(product.id, { name: e.target.value })} />
      <div className="product-card-actions"><em className={`pace-badge ${complete ? "done" : pct < 50 ? "slow" : "active"}`}>{pace}</em><button disabled={!editable} className="icon-button delete" aria-label={`删除${product.name || "产品"}`} onClick={remove}>×</button></div>
    </div>
    <p className="product-summary">总目标 <b>{totalTarget}</b> 项，视频 <b>{product.videoTarget}</b> 条，图片 <b>{product.imageTarget}</b> 张，剩余 <b>{remaining}</b> 项</p>
    <div className="category-progress" aria-label={`${product.name}进度 ${pct}%`}><i style={{ width: `${pct}%` }} /></div>
    <div className="product-kpis">
      <div><strong>{totalDone}</strong><span>已完成</span></div>
      <div><strong>{pct}%</strong><span>达成率</span></div>
      <Metric editable={editable} label="视频" done={product.videoDone} target={product.videoTarget} setDone={(value) => update(product.id, { videoDone: value })} setTarget={(value) => update(product.id, { videoTarget: value })} />
      <Metric editable={editable} label="图片" done={product.imageDone} target={product.imageTarget} setDone={(value) => update(product.id, { imageDone: value })} setTarget={(value) => update(product.id, { imageTarget: value })} />
    </div>
    <label className="product-note"><span>备注</span><textarea disabled={!editable} rows={2} value={product.note || ""} onChange={(e) => update(product.id, { note: e.target.value })} placeholder="记录待确认事项、拍摄要求或交付风险…" /></label>
  </article>;
}
function Metric({ editable, label, done, target, setDone, setTarget }: { editable: boolean; label: string; done: number; target: number; setDone: (v: number) => void; setTarget: (v: number) => void }) { return <div className="metric"><div><input disabled={!editable} aria-label={`${label}已完成`} title={`${label}已完成`} type="number" min="0" value={done} onChange={(e) => setDone(safeNumber(e.target.value))} /><span>/</span><input disabled={!editable} aria-label={`${label}目标`} title={`${label}目标`} type="number" min="0" value={target} onChange={(e) => setTarget(safeNumber(e.target.value))} /></div><small>{label}（完成 / 目标）</small></div>; }

function RequestsView({ editable, requests, onNew, onStatus, onDelete }: { editable: boolean; requests: WorkRequest[]; onNew: () => void; onStatus: (id: string, status: WorkRequest["status"]) => void; onDelete: (id: string) => void }) {
  return <section className="requests-section"><div className="page-intro"><div><span className="section-index">REQUEST INTAKE</span><h2>集中接收拍摄需求</h2><p>为了方便排期，需要至少提前一周提交需求。</p></div><button type="button" disabled={!editable} className="primary-button" onClick={onNew}>＋ 提交新需求</button></div><div className="request-stats"><Summary label="全部需求" value={requests.length} unit="条" /><Summary label="待确认" value={requests.filter((x) => x.status === "待确认").length} unit="条" /><Summary label="制作中" value={requests.filter((x) => x.status === "制作中").length} unit="条" /><Summary label="已完成" value={requests.filter((x) => x.status === "已完成").length} unit="条" /></div>{requests.length === 0 ? <Empty disabled={!editable} icon="02" title="暂无拍摄需求" text="运营和其他同事提交的需求会在这里统一流转。" action="提交第一条需求" onAction={onNew} /> : <div className="request-list">{requests.map((item) => <article className="request-card" key={item.id}><div className="request-top"><div className="request-title"><span className={`priority ${item.priority}`}>{item.priority}</span><h3>{item.name}</h3></div><div className="request-actions"><select disabled={!editable} aria-label={`${item.name}状态`} value={item.status} onChange={(e) => onStatus(item.id, e.target.value as WorkRequest["status"])}><option>待确认</option><option>制作中</option><option>已完成</option></select><button disabled={!editable} className="request-delete" aria-label={`删除需求：${item.name}`} onClick={() => { if (window.confirm(`确定删除需求“${item.name}”吗？删除后无法恢复。`)) onDelete(item.id); }}>删除</button></div></div><div className="request-meta"><span>产品<b>{item.product}</b></span><span>交付<b>{item.deliveryType} × {item.quantity}</b></span><span>截止<b>{item.dueDate}</b></span><span>提交人<b>{item.submitter}</b></span></div>{item.notes && <p>{item.notes}</p>}<footer><time>{new Date(item.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 提交</time>{item.feishuLink ? <a href={item.feishuLink} target="_blank" rel="noreferrer">打开飞书需求 ↗</a> : <span>无飞书链接</span>}</footer></article>)}</div>}</section>;
}

function IdeasView({ editable, ideas, acceptedCount, onNew, onToggle, onDelete }: { editable: boolean; ideas: Idea[]; acceptedCount: number; onNew: () => void; onToggle: (id: string) => void; onDelete: (id: string) => void }) { return <section className="ideas-section"><div className="page-intro"><div><span className="section-index">IDEA COLLECTION</span><h2>把日区观察变成内容</h2><p>按最新时间沉淀文案、视频和真实用户故事。</p></div><button disabled={!editable} className="primary-button" onClick={onNew}>＋ 记录新灵感</button></div><div className="idea-summary"><div><span>灵感总数</span><b>{ideas.length}</b></div><div><span>已采纳</span><b>{acceptedCount}</b></div><p>采纳率 <strong>{ideas.length ? Math.round(acceptedCount / ideas.length * 100) : 0}%</strong></p></div>{ideas.length === 0 ? <Empty disabled={!editable} icon="✦" title="还没有灵感便签" text="记录第一条日区文案、视频或用户故事。" action="记录新灵感" onAction={onNew} /> : <div className="idea-grid">{ideas.map((idea, index) => <article className={`idea-card tone-${index % 3}`} key={idea.id}><div className="idea-card-head"><span>{idea.category}</span><time>{ideaDateLabel(idea)}</time></div>{idea.copy && <div><small>日区文案</small><p>{idea.copy}</p></div>}{idea.story && <div><small>用户与手机壳的故事</small><p>{idea.story}</p></div>}<footer><div><b>{idea.recorder}</b>{idea.referenceLink && <a href={idea.referenceLink} target="_blank" rel="noreferrer">参考视频 ↗</a>}</div><span className="idea-actions"><button disabled={!editable} className="idea-delete" onClick={() => { if (window.confirm(`确定删除灵感“${idea.title}”吗？删除后无法恢复。`)) onDelete(idea.id); }}>删除</button><button disabled={!editable} className={idea.accepted ? "accepted" : "accept"} onClick={() => onToggle(idea.id)}>{idea.accepted ? "✓ 已采纳" : "采纳"}</button></span></footer></article>)}</div>}</section>; }

function MangaScene({ variant }: { variant: Tab }) {
  return <div className={`manga-scene ${variant}`} aria-hidden="true"><span className="manga-panel" /><span className="manga-horizon" /><span className="manga-sun" /><span className="manga-speed one" /><span className="manga-speed two" /><span className="manga-person"><i className="manga-hair" /><i className="manga-eye" /><i className="manga-body" /></span><span className="manga-prop"><i /><b /></span><span className="manga-spark one" /><span className="manga-spark two" /></div>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-label={title}><header><div><span className="section-index">NEW ENTRY</span><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header>{children}</div></div>; }
function Field({ label, required, children, wide }: { label: string; required?: boolean; children: React.ReactNode; wide?: boolean }) { return <label className={wide ? "field wide" : "field"}><span>{label}{required && <i>*</i>}</span>{children}</label>; }
function RequestForm({ value, setValue, onSubmit, onCancel }: { value: typeof emptyRequest; setValue: React.Dispatch<React.SetStateAction<typeof emptyRequest>>; onSubmit: (e: React.FormEvent) => void; onCancel: () => void }) { return <form className="form-grid" onSubmit={onSubmit}><Field label="产品" required><select required value={value.product} onChange={(e) => setValue({ ...value, product: e.target.value })}><option value="" disabled>请选择产品</option><option>Q3 air</option><option>Air pro</option><option>皮革</option><option>O3 air</option><option>Hue</option><option>其他</option></select></Field><Field label="交付类型"><select value={value.deliveryType} onChange={(e) => setValue({ ...value, deliveryType: e.target.value })}><option>视频</option><option>图片</option><option>视频 + 图片</option></select></Field><Field label="飞书需求链接" wide><input type="url" value={value.feishuLink} onChange={(e) => setValue({ ...value, feishuLink: e.target.value })} placeholder="https://..." /></Field><Field label="数量"><input type="number" min="1" value={value.quantity} onChange={(e) => setValue({ ...value, quantity: Math.max(1, safeNumber(e.target.value)) })} /></Field><Field label="截止日期" required><input type="date" value={value.dueDate} onChange={(e) => setValue({ ...value, dueDate: e.target.value })} /></Field><Field label="优先级"><select value={value.priority} onChange={(e) => setValue({ ...value, priority: e.target.value })}><option>普通</option><option>优先</option><option>紧急</option></select></Field><Field label="提交人" required><input value={value.submitter} onChange={(e) => setValue({ ...value, submitter: e.target.value })} placeholder="姓名" /></Field><Field label="补充说明" wide><textarea value={value.notes} onChange={(e) => setValue({ ...value, notes: e.target.value })} placeholder="拍摄重点、规格或其他备注" /></Field><div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" type="submit">提交并通知飞书</button></div></form>; }
function IdeaForm({ value, setValue, onSubmit, onCancel }: { value: typeof emptyIdea; setValue: React.Dispatch<React.SetStateAction<typeof emptyIdea>>; onSubmit: (e: React.FormEvent) => void; onCancel: () => void }) { return <form className="form-grid" onSubmit={onSubmit}><Field label="分类"><select value={value.category} onChange={(e) => setValue({ ...value, category: e.target.value as typeof value.category })}><option>文案</option><option>视频</option><option>用户故事</option><option>其他</option></select></Field><Field label="日期"><input type="date" value={value.date} onChange={(e) => setValue({ ...value, date: e.target.value })} /></Field><Field label="记录人" wide><input value={value.recorder} onChange={(e) => setValue({ ...value, recorder: e.target.value })} placeholder="姓名（选填）" /></Field><Field label="日区文案" wide><textarea value={value.copy} onChange={(e) => setValue({ ...value, copy: e.target.value })} placeholder="记录原始文案或表达方向（选填）" /></Field><Field label="参考视频链接" wide><input type="url" value={value.referenceLink} onChange={(e) => setValue({ ...value, referenceLink: e.target.value })} placeholder="https://...（选填）" /></Field><Field label="用户与手机壳的故事" wide><textarea value={value.story} onChange={(e) => setValue({ ...value, story: e.target.value })} placeholder="记录具体的人、场景和情绪（选填）" /></Field><div className="form-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button className="primary-button" type="submit">保存灵感</button></div></form>; }
function Empty({ disabled = false, icon, title, text, action, onAction }: { disabled?: boolean; icon: string; title: string; text: string; action: string; onAction: () => void }) { return <div className="empty-state"><i>{icon}</i><h3>{title}</h3><p>{text}</p><button disabled={disabled} className="secondary-button" onClick={onAction}>{action}</button></div>; }
function Loading() { return <div className="loading-state"><span /><div><i /><i /><i /><i /></div><p>正在加载团队共享数据…</p></div>; }
