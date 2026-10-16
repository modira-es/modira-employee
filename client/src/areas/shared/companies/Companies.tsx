import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRightLeft, Building2, CheckCircle2, ChevronRight, Clock3, Filter, RefreshCw, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Company, Row } from "./companyTypes";
import { DetailRow, EmptyState, ErrorBox, PageHeader, PageLoading, PageShell, Section, StatusBadge, SummaryCard, TableShell, formatDate, normalize, textValue } from "./CompaniesUI";

async function assertWorker() {
  const { data, error } = await supabase.rpc("current_user_is_worker");
  if (error) throw error;
  if (data !== true) throw new Error("La sesión actual no corresponde a un trabajador activo de Modira.");
}

export default function Companies({ basePath = "/employee/companies" }: { basePath?: string }) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Row[]>([]);
  const [changeRequests, setChangeRequests] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");
  const [previousFilter, setPreviousFilter] = useState("current");

  const load = useCallback(async (silent = false) => {
    if (!user) { setLoading(false); return; }
    try {
      silent ? setRefreshing(true) : setLoading(true);
      setError(null);
      await assertWorker();
      const [c, p, r] = await Promise.all([
        supabase.from("companies").select("*").order("company_name", { ascending: true }),
        supabase.from("profiles").select("*").order("nombre", { ascending: true }),
        supabase.from("company_change_requests").select("*").order("created_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      if (p.error) throw p.error;
      if (r.error) throw r.error;
      setCompanies((c.data || []) as Company[]);
      setProfiles((p.data || []) as Row[]);
      setChangeRequests((r.data || []) as Row[]);
    } catch (e: any) { setError(e?.message || "No se pudieron cargar las empresas."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const previousIds = useMemo(() => new Set(changeRequests.filter(r => ["approved", "aprobado", "accepted", "aceptado"].includes(normalize(r.status))).map(r => r.current_company_id).filter(Boolean)), [changeRequests]);
  const userCounts = useMemo(() => { const m = new Map<string, number>(); profiles.forEach(p => p.company_id && m.set(p.company_id, (m.get(p.company_id) || 0) + 1)); return m; }, [profiles]);
  const pendingCount = changeRequests.filter(r => ["pending", "pendiente"].includes(normalize(r.status))).length;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(c => {
      const previous = previousIds.has(c.id);
      const previousOk = previousFilter === "all" || (previousFilter === "current" && !previous) || (previousFilter === "previous" && previous);
      const searchOk = !q || [c.company_name,c.company_code,c.legal_name,c.cif_vat,c.billing_email,c.phone,c.website,c.city,c.province,c.industry].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
      const statusOk = statusFilter === "all" || (statusFilter === "active" && c.is_active !== false) || (statusFilter === "inactive" && c.is_active === false);
      const subOk = subscriptionFilter === "all" || normalize(c.subscription_status) === normalize(subscriptionFilter);
      return previousOk && searchOk && statusOk && subOk;
    }).sort((a,b) => String(a.company_name || "").localeCompare(String(b.company_name || ""), "es"));
  }, [companies, previousIds, previousFilter, search, statusFilter, subscriptionFilter]);

  if (loading) return <PageShell><PageHeader title="Empresas" subtitle="Gestión y consulta de empresas"/><PageLoading/></PageShell>;
  return <PageShell>
    <PageHeader title="Empresas" subtitle="Consulta y gestión de la relación con las empresas" action={<Button variant="outline" onClick={() => void load(true)} disabled={refreshing} className="h-9 border-[#E2E7ED] shadow-none"><RefreshCw className={refreshing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"}/>Actualizar</Button>}/>
    {error && <ErrorBox message={error}/>} 
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard icon={<Building2 className="h-4 w-4"/>} label="Empresas" value={companies.length} detail="Total disponible para el trabajador"/>
      <SummaryCard icon={<CheckCircle2 className="h-4 w-4"/>} label="Activas" value={companies.filter(c => c.is_active !== false).length} detail="Empresas operativas"/>
      <SummaryCard icon={<Users className="h-4 w-4"/>} label="Usuarios" value={profiles.filter(p => p.company_id).length} detail="Perfiles asociados"/>
      <SummaryCard icon={<Clock3 className="h-4 w-4"/>} label="Cambios pendientes" value={pendingCount} detail="Solicitudes por revisar"/>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-2 lg:flex-row"><div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA2AE]"/><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por empresa, código, CIF, email, teléfono o ubicación..." className="h-10 border-[#E2E7ED] pl-9 shadow-none"/></div><div className="flex flex-col gap-2 sm:flex-row"><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-10 w-full sm:w-[160px]"><Filter className="mr-2 h-4 w-4"/><SelectValue placeholder="Estado"/></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="active">Activas</SelectItem><SelectItem value="inactive">Inactivas</SelectItem></SelectContent></Select><Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}><SelectTrigger className="h-10 w-full sm:w-[180px]"><SelectValue placeholder="Suscripción"/></SelectTrigger><SelectContent><SelectItem value="all">Todas las suscripciones</SelectItem>{Array.from(new Set(companies.map(c => c.subscription_status).filter(Boolean))).map(s => <SelectItem key={String(s)} value={String(s)}>{String(s)}</SelectItem>)}</SelectContent></Select><Select value={previousFilter} onValueChange={setPreviousFilter}><SelectTrigger className="h-10 w-full sm:w-[180px]"><SelectValue placeholder="Histórico"/></SelectTrigger><SelectContent><SelectItem value="current">Empresas actuales</SelectItem><SelectItem value="previous">Empresas anteriores</SelectItem><SelectItem value="all">Todas</SelectItem></SelectContent></Select></div></div></div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><TableShell><table className="w-full min-w-[900px] text-left"><thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Plan / suscripción</th><th className="px-5 py-3">Usuarios</th><th className="px-5 py-3">Ubicación</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Actualización</th><th className="px-5 py-3 text-right">Acción</th></tr></thead><tbody>{filtered.length === 0 ? <tr><td colSpan={7}><EmptyState text="No hay empresas que coincidan con los filtros actuales."/></td></tr> : filtered.map(c => <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-[#FBFCFE]"><td className="px-5 py-4"><button type="button" onClick={() => setLocation(`${basePath.replace(/\/+$/, "")}/${c.id}`)} className="text-left"><p className="text-sm font-semibold text-[#263044] hover:text-[#1E3A8A]">{c.company_name}</p><p className="mt-1 text-[11px] text-[#9AA2AE]">{c.company_code}</p></button></td><td className="px-5 py-4 text-sm text-[#536074]">{textValue(c.subscription_plan)}{c.subscription_status && <div className="mt-1"><StatusBadge value={c.subscription_status}/></div>}</td><td className="px-5 py-4 text-sm text-[#536074]">{userCounts.get(c.id) || 0}</td><td className="px-5 py-4 text-sm text-[#536074]">{[c.city,c.province].filter(Boolean).join(", ") || "—"}</td><td className="px-5 py-4"><StatusBadge value={c.is_active === false ? "inactivo" : "activo"}/></td><td className="px-5 py-4 text-sm text-[#718096]">{formatDate(c.updated_at)}</td><td className="px-5 py-4 text-right"><Button variant="ghost" onClick={() => setLocation(`${basePath.replace(/\/+$/, "")}/${c.id}`)} className="h-8 text-[#1E3A8A]">Revisar<ChevronRight className="ml-1 h-4 w-4"/></Button></td></tr>)}</tbody></table></TableShell></div>
    <CompanyChangeRequests companies={companies} profiles={profiles} requests={changeRequests} onResolved={load}/>
  </PageShell>;
}

function CompanyChangeRequests({ companies, profiles, requests, onResolved }: { companies: Company[]; profiles: Row[]; requests: Row[]; onResolved: (silent?: boolean) => Promise<void> }) {
  const [status, setStatus] = useState("pending"); const [search, setSearch] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const filtered = requests.filter(r => { const q = search.toLowerCase(); const a = companies.find(c => c.id === r.current_company_id); const b = companies.find(c => c.id === r.requested_company_id); const s = normalize(r.status); const statusOk = status === "all" || (status === "pending" && ["pending","pendiente"].includes(s)) || (status === "approved" && ["approved","aprobado","accepted","aceptado"].includes(s)) || (status === "rejected" && ["rejected","rechazado"].includes(s)); const qOk = !q || [r.requested_company_name,a?.company_name,b?.company_name,r.requested_cif_vat].filter(Boolean).some(v => String(v).toLowerCase().includes(q)); return statusOk && qOk; });
  const resolve = async (id: string, action: "approved" | "rejected") => { try { setBusy(id); const { error } = await supabase.rpc("resolve_company_change_request", { p_request_id: id, p_action: action }); if (error) throw error; toast.success(action === "approved" ? "Solicitud aprobada correctamente." : "Solicitud rechazada correctamente."); await onResolved(true); } catch(e:any) { toast.error(e?.message || "No se pudo resolver la solicitud."); } finally { setBusy(null); } };
  return <Section title="Solicitudes de cambio de empresa" icon={<ArrowRightLeft className="h-4 w-4"/>} action={<span className="text-xs text-[#9AA2AE]">{filtered.length} solicitudes</span>}><div className="border-b border-slate-100 p-4"><div className="flex flex-col gap-3 lg:flex-row"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por empresa actual o solicitada..." className="h-10 shadow-none"/><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-10 lg:w-[180px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pending">Pendientes</SelectItem><SelectItem value="approved">Aceptadas</SelectItem><SelectItem value="rejected">Rechazadas</SelectItem><SelectItem value="all">Todas</SelectItem></SelectContent></Select></div></div>{filtered.length === 0 ? <EmptyState text={status === "pending" ? "No hay solicitudes pendientes." : "No hay solicitudes que coincidan."}/> : <TableShell><table className="w-full min-w-[1000px] text-left"><thead className="border-b border-slate-100 bg-[#FAFBFC]"><tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]"><th className="px-5 py-3">Empresa actual</th><th className="px-5 py-3">Empresa solicitada</th><th className="px-5 py-3">Usuario</th><th className="px-5 py-3">Proyectos</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Fecha</th><th className="px-5 py-3 text-right">Acción</th></tr></thead><tbody>{filtered.map(r => { const current=companies.find(c=>c.id===r.current_company_id); const requested=companies.find(c=>c.id===r.requested_company_id); const p=profiles.find(x=>x.id===r.user_id); const pending=["pending","pendiente"].includes(normalize(r.status)); return <tr key={r.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-4 text-sm font-semibold">{textValue(current?.company_name)}</td><td className="px-5 py-4"><p className="text-sm font-semibold">{textValue(r.requested_company_name || requested?.company_name)}</p><p className="mt-1 text-xs text-slate-400">{textValue(r.requested_legal_name)} · NIF {textValue(r.requested_cif_vat)}</p></td><td className="px-5 py-4"><p className="text-sm">{[p?.nombre,p?.apellidos].filter(Boolean).join(" ") || p?.email || "Usuario"}</p><p className="mt-1 text-xs text-slate-400">{textValue(p?.email)}</p></td><td className="px-5 py-4 text-xs">{r.apply_to_active_projects ? "Aplicar también a proyectos activos" : "Mantener proyectos"}</td><td className="px-5 py-4"><StatusBadge value={r.status}/></td><td className="px-5 py-4 text-sm text-slate-500">{formatDate(r.created_at,true)}</td><td className="px-5 py-4 text-right">{pending ? <div className="flex justify-end gap-2"><Button disabled={busy===r.id} onClick={()=>void resolve(r.id,"approved")} className="h-8 w-8 bg-[#1E3A8A] p-0"><CheckCircle2 className="h-4 w-4"/></Button><Button disabled={busy===r.id} variant="outline" onClick={()=>void resolve(r.id,"rejected")} className="h-8 w-8 p-0"><X className="h-4 w-4"/></Button></div> : <span className="text-xs text-slate-400">Revisada</span>}</td></tr>})}</tbody></table></TableShell>}</Section>;
}
