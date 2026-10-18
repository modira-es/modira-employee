import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity, ArrowLeft, BarChart3, CalendarDays, CheckCircle2,
  CircleDollarSign, ExternalLink, Loader2, Plus, RefreshCw,
  Target, TrendingUp, Users, X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

type CampaignSummary = {
  campaign_uuid: string;
  campaign_name: string;
  campaign_platform: string;
  campaign_currency: string;
  ad_spend: number | string;
  additional_campaign_costs: number | string;
  total_marketing_cost: number | string;
  impressions: number | string;
  clicks: number | string;
  landing_page_views: number | string;
  platform_reported_leads: number | string;
  attributed_leads: number | string;
  qualified_leads: number | string;
  new_customers: number | string;
  quotations_count: number | string;
  accepted_quotations_count: number | string;
  invoices_count: number | string;
  invoiced_revenue_eur: number | string;
  collected_revenue_eur: number | string;
  roas: number | string | null;
  invoiced_roi_percent: number | string | null;
};

type Campaign = {
  id: string;
  name: string;
  platform: string;
  channel: string;
  objective: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  planned_budget: number | null;
  currency: string;
  landing_page_url: string | null;
  utm_campaign: string | null;
};

const currency = (value: unknown, code = "EUR") =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: code, maximumFractionDigits: 0 }).format(Number(value ?? 0));
const integer = (value: unknown) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Number(value ?? 0));
const platformLabels: Record<string, string> = {
  manual: "Manual", meta_ads: "Meta Ads", google_ads: "Google Ads",
  linkedin_ads: "LinkedIn Ads", tiktok_ads: "TikTok Ads", other: "Otra plataforma",
};
const statusLabels: Record<string, string> = {
  draft: "Borrador", active: "Activa", paused: "Pausada", completed: "Finalizada", archived: "Archivada",
};

function MetricCard({ icon: Icon, label, value, helper }: {
  icon: typeof Activity; label: string; value: string; helper: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E6EAF0] bg-white p-5 shadow-sm shadow-slate-900/[0.02]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#778397]">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F1F4F8] text-[#52627A]"><Icon className="h-4 w-4" /></span>
        {label}
      </div>
      <p className="mt-5 text-2xl font-semibold tracking-tight text-[#17243B]">{value}</p>
      <p className="mt-1 text-xs text-[#8994A5]">{helper}</p>
    </div>
  );
}

export default function MarketingDashboard() {
  const [, navigate] = useLocation();
  const { hasPermission } = useAuth();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<CampaignSummary[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const canManage = hasPermission("marketing.campaigns.manage");
  const canReadCampaigns = hasPermission("marketing.campaigns.read");

  const [form, setForm] = useState({
    name: "", channel: "paid_social", platform: "meta_ads", objective: "lead_generation",
    status: "draft", starts_on: "", ends_on: "", landing_page_url: "",
    utm_source: "", utm_medium: "paid_social", utm_campaign: "", planned_budget: "",
    currency: "EUR", description: "",
  });

  const loadData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [summaryResult, campaignsResult] = await Promise.all([
        supabase.rpc("marketing_get_dashboard_summary", {
          p_from_date: fromDate || null, p_to_date: toDate || null, p_campaign_id: null,
        }),
        canReadCampaigns
          ? supabase.from("marketing_campaigns")
              .select("id,name,platform,channel,objective,status,starts_on,ends_on,planned_budget,currency,landing_page_url,utm_campaign")
              .order("created_at", { ascending: false }).limit(100)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (summaryResult.error) throw summaryResult.error;
      if (campaignsResult.error) throw campaignsResult.error;
      setSummary((summaryResult.data ?? []) as CampaignSummary[]);
      setCampaigns((campaignsResult.data ?? []) as Campaign[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se han podido cargar los datos de marketing.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [fromDate, toDate, canReadCampaigns]);

  useEffect(() => { void loadData(); }, [loadData]);

  const totals = useMemo(() => summary.reduce((acc, row) => {
    acc.spend += Number(row.ad_spend ?? 0);
    acc.extra += Number(row.additional_campaign_costs ?? 0);
    acc.cost += Number(row.total_marketing_cost ?? 0);
    acc.impressions += Number(row.impressions ?? 0);
    acc.clicks += Number(row.clicks ?? 0);
    acc.views += Number(row.landing_page_views ?? 0);
    acc.leads += Number(row.attributed_leads ?? 0);
    acc.qualified += Number(row.qualified_leads ?? 0);
    acc.customers += Number(row.new_customers ?? 0);
    acc.quotations += Number(row.quotations_count ?? 0);
    acc.accepted += Number(row.accepted_quotations_count ?? 0);
    acc.invoiced += Number(row.invoiced_revenue_eur ?? 0);
    acc.collected += Number(row.collected_revenue_eur ?? 0);
    return acc;
  }, { spend: 0, extra: 0, cost: 0, impressions: 0, clicks: 0, views: 0, leads: 0, qualified: 0, customers: 0, quotations: 0, accepted: 0, invoiced: 0, collected: 0 }), [summary]);

  const weightedRoas = totals.cost > 0 ? totals.invoiced / totals.cost : null;
  const roi = totals.cost > 0 ? ((totals.invoiced - totals.cost) / totals.cost) * 100 : null;

  const createCampaign = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setFormError("");
    try {
      const { error: rpcError } = await supabase.rpc("marketing_create_campaign", {
        p_name: form.name.trim(), p_channel: form.channel, p_platform: form.platform,
        p_objective: form.objective, p_status: form.status,
        p_starts_on: form.starts_on || null, p_ends_on: form.ends_on || null,
        p_landing_page_url: form.landing_page_url || null,
        p_utm_source: form.utm_source || null, p_utm_medium: form.utm_medium || null,
        p_utm_campaign: form.utm_campaign || null, p_utm_term: null, p_utm_content: null,
        p_planned_budget: form.planned_budget === "" ? null : Number(form.planned_budget),
        p_currency: form.currency, p_description: form.description || null, p_notes: null,
      });
      if (rpcError) throw rpcError;
      setShowCreate(false);
      setForm({ name: "", channel: "paid_social", platform: "meta_ads", objective: "lead_generation", status: "draft", starts_on: "", ends_on: "", landing_page_url: "", utm_source: "", utm_medium: "paid_social", utm_campaign: "", planned_budget: "", currency: "EUR", description: "" });
      await loadData(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se ha podido crear la campaña.");
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#17243B]">
      <main className="mx-auto max-w-[1540px] px-5 py-7 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E0E5EC] bg-white text-[#66758A] hover:bg-[#F4F6F9]" aria-label="Volver al inicio"><ArrowLeft className="h-4 w-4" /></button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#8A96A8]">Modira · Growth</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Marketing & adquisición</h1>
              <p className="mt-1 text-sm text-[#7E899A]">Del gasto publicitario a los clientes, presupuestos y cobros.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-[#E0E5EC] bg-white px-3 py-2 text-xs text-[#6D7A8D]"><CalendarDays className="h-4 w-4" /><input aria-label="Fecha desde" type="date" value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} className="bg-transparent text-[#334155] outline-none" /></label>
            <label className="flex items-center gap-2 rounded-xl border border-[#E0E5EC] bg-white px-3 py-2 text-xs text-[#6D7A8D]">Hasta <input aria-label="Fecha hasta" type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} className="bg-transparent text-[#334155] outline-none" /></label>
            <button onClick={() => void loadData(true)} disabled={refreshing} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E0E5EC] bg-white text-[#6D7A8D] hover:bg-[#F4F6F9] disabled:opacity-50" title="Actualizar"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /></button>
            {canManage && <button onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#102A66] px-4 text-sm font-semibold text-white hover:bg-[#193B85]"><Plus className="h-4 w-4" /> Nueva campaña</button>}
          </div>
        </header>

        {error && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}<p className="mt-1 text-xs text-red-600">Comprueba que las migraciones 177 y 178 se ejecutaron correctamente y que tu usuario tiene el permiso marketing.dashboard.read.</p></div>}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={CircleDollarSign} label="Coste de marketing" value={currency(totals.cost)} helper={`${currency(totals.spend)} en anuncios · ${currency(totals.extra)} en costes adicionales`} />
          <MetricCard icon={Users} label="Leads atribuidos" value={integer(totals.leads)} helper={`${integer(totals.qualified)} cualificados · ${integer(totals.customers)} nuevos clientes`} />
          <MetricCard icon={Target} label="Presupuestos" value={integer(totals.quotations)} helper={`${integer(totals.accepted)} aceptados`} />
          <MetricCard icon={TrendingUp} label="Ingresos facturados" value={currency(totals.invoiced)} helper={`${currency(totals.collected)} cobrados`} />
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={BarChart3} label="Impresiones" value={integer(totals.impressions)} helper="Según los datos importados o manuales" />
          <MetricCard icon={ExternalLink} label="Clics" value={integer(totals.clicks)} helper={`${integer(totals.views)} visitas a landing page`} />
          <MetricCard icon={Activity} label="ROAS estimado" value={weightedRoas === null ? "—" : `${weightedRoas.toLocaleString("es-ES", { maximumFractionDigits: 2 })}×`} helper="Ingresos facturados / coste de marketing" />
          <MetricCard icon={CheckCircle2} label="ROI facturado" value={roi === null ? "—" : `${roi.toLocaleString("es-ES", { maximumFractionDigits: 1 })}%`} helper="Solo compara importes en EUR" />
        </section>

        <section className="mt-7 overflow-hidden rounded-2xl border border-[#E5E9EF] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EDF0F4] px-5 py-4">
            <div><h2 className="font-semibold">Campañas</h2><p className="mt-1 text-xs text-[#8792A3]">Rendimiento atribuido al periodo seleccionado.</p></div>
            <span className="rounded-lg bg-[#F2F5F9] px-2.5 py-1 text-xs font-semibold text-[#637187]">{campaigns.length} campañas</span>
          </div>
          {loading ? <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-[#7A8799]"><Loader2 className="h-4 w-4 animate-spin" /> Cargando analítica…</div>
          : campaigns.length === 0 ? <div className="px-5 py-14 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F1F4F8] text-[#6E7D92]"><Target className="h-5 w-5" /></div><h3 className="mt-3 font-semibold">Todavía no hay campañas</h3><p className="mt-1 text-sm text-[#8490A1]">Crea una campaña para empezar a registrar métricas y atribuir conversiones.</p>{canManage && <button onClick={() => setShowCreate(true)} className="mt-4 rounded-xl bg-[#102A66] px-4 py-2 text-sm font-semibold text-white">Crear primera campaña</button>}</div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#FAFBFC] text-[10px] uppercase tracking-[0.12em] text-[#8792A3]"><tr><th className="px-5 py-3 font-semibold">Campaña</th><th className="px-4 py-3 font-semibold">Plataforma</th><th className="px-4 py-3 font-semibold">Estado</th><th className="px-4 py-3 text-right font-semibold">Presupuesto</th><th className="px-4 py-3 text-right font-semibold">Gasto</th><th className="px-4 py-3 text-right font-semibold">Leads</th><th className="px-5 py-3 text-right font-semibold">Facturado</th></tr></thead><tbody className="divide-y divide-[#F0F2F5]">{campaigns.map(c => { const row = summary.find(s => s.campaign_uuid === c.id); return <tr key={c.id} className="hover:bg-[#FBFCFD]"><td className="px-5 py-4"><p className="font-semibold text-[#263449]">{c.name}</p><p className="mt-1 text-xs text-[#8B96A6]">{c.utm_campaign || c.channel.replaceAll("_", " ")}</p></td><td className="px-4 py-4 text-[#5F6D81]">{platformLabels[c.platform] || c.platform}</td><td className="px-4 py-4"><span className={`rounded-lg px-2 py-1 text-xs font-medium ${c.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{statusLabels[c.status] || c.status}</span></td><td className="px-4 py-4 text-right text-[#59677A]">{c.planned_budget == null ? "—" : currency(c.planned_budget, c.currency)}</td><td className="px-4 py-4 text-right font-medium">{currency(row?.total_marketing_cost ?? 0, row?.campaign_currency || c.currency)}</td><td className="px-4 py-4 text-right">{integer(row?.attributed_leads ?? 0)}</td><td className="px-5 py-4 text-right font-medium">{currency(row?.invoiced_revenue_eur ?? 0)}</td></tr>; })}</tbody></table></div>}
        </section>

        {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#111827]/45 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowCreate(false); }}><div role="dialog" aria-modal="true" aria-labelledby="create-campaign-title" className="my-6 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="create-campaign-title" className="text-lg font-semibold">Nueva campaña</h2><p className="mt-1 text-sm text-[#7D899A]">Configura la campaña y sus parámetros UTM.</p></div><button onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-[#78869A] hover:bg-[#F2F4F7]" aria-label="Cerrar"><X className="h-4 w-4" /></button></div>
          <form onSubmit={createCampaign} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-xs font-semibold text-[#5F6D81]">Nombre *<input required maxLength={200} value={form.name} onChange={e => setForm({...form, name:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#5576B8]" /></label>
            <label className="text-xs font-semibold text-[#5F6D81]">Canal<select value={form.channel} onChange={e => setForm({...form, channel:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] bg-white px-3 py-2.5 text-sm font-normal"><option value="paid_social">Publicidad en redes</option><option value="paid_search">Publicidad en buscadores</option><option value="organic_social">Redes orgánicas</option><option value="organic_search">SEO</option><option value="email">Email</option><option value="referral">Referidos</option><option value="partner">Partners</option><option value="other">Otro</option></select></label>
            <label className="text-xs font-semibold text-[#5F6D81]">Plataforma<select value={form.platform} onChange={e => setForm({...form, platform:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] bg-white px-3 py-2.5 text-sm font-normal"><option value="meta_ads">Meta Ads</option><option value="google_ads">Google Ads</option><option value="linkedin_ads">LinkedIn Ads</option><option value="tiktok_ads">TikTok Ads</option><option value="manual">Manual / sin plataforma</option><option value="other">Otra</option></select></label>
            <label className="text-xs font-semibold text-[#5F6D81]">Objetivo<select value={form.objective} onChange={e => setForm({...form, objective:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] bg-white px-3 py-2.5 text-sm font-normal"><option value="lead_generation">Generar leads</option><option value="traffic">Tráfico</option><option value="brand_awareness">Reconocimiento</option><option value="sales">Ventas</option><option value="retargeting">Remarketing</option><option value="other">Otro</option></select></label>
            <label className="text-xs font-semibold text-[#5F6D81]">Estado<select value={form.status} onChange={e => setForm({...form, status:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] bg-white px-3 py-2.5 text-sm font-normal"><option value="draft">Borrador</option><option value="active">Activa</option><option value="paused">Pausada</option></select></label>
            <label className="text-xs font-semibold text-[#5F6D81]">Presupuesto previsto<input type="number" min="0" step="0.01" value={form.planned_budget} onChange={e => setForm({...form, planned_budget:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-[#5F6D81]">Moneda<select value={form.currency} onChange={e => setForm({...form, currency:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] bg-white px-3 py-2.5 text-sm font-normal"><option value="EUR">EUR (€)</option><option value="USD">USD ($)</option><option value="GBP">GBP (£)</option></select></label>
            <label className="text-xs font-semibold text-[#5F6D81]">Fecha de inicio<input type="date" value={form.starts_on} onChange={e => setForm({...form, starts_on:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-[#5F6D81]">Fecha de fin<input type="date" min={form.starts_on || undefined} value={form.ends_on} onChange={e => setForm({...form, ends_on:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal" /></label>
            <label className="sm:col-span-2 text-xs font-semibold text-[#5F6D81]">URL de landing page<input type="url" value={form.landing_page_url} onChange={e => setForm({...form, landing_page_url:e.target.value})} placeholder="https://…" className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-[#5F6D81]">UTM source<input value={form.utm_source} onChange={e => setForm({...form, utm_source:e.target.value})} placeholder="meta, google…" className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal" /></label>
            <label className="text-xs font-semibold text-[#5F6D81]">UTM medium<input value={form.utm_medium} onChange={e => setForm({...form, utm_medium:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal" /></label>
            <label className="sm:col-span-2 text-xs font-semibold text-[#5F6D81]">UTM campaign<input value={form.utm_campaign} onChange={e => setForm({...form, utm_campaign:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal" /></label>
            <label className="sm:col-span-2 text-xs font-semibold text-[#5F6D81]">Descripción<textarea rows={2} value={form.description} onChange={e => setForm({...form, description:e.target.value})} className="mt-1.5 w-full rounded-xl border border-[#DDE3EB] px-3 py-2.5 text-sm font-normal" /></label>
            {formError && <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2 border-t border-[#EDF0F4] pt-4"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-[#DDE3EB] px-4 py-2.5 text-sm font-semibold text-[#657287]">Cancelar</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#102A66] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Guardando…" : "Crear campaña"}</button></div>
          </form>
        </div></div>}
      </main>
    </div>
  );
}
