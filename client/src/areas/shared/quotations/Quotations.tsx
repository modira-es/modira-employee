
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Search, RefreshCw, Plus, FileText, Clock3, CheckCircle2, AlertCircle, Calculator, CircleDollarSign, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Company, Project, Quotation, QuotationStatus } from "./quotationTypes";
import { formatDate, isExpired, money } from "./quotationTypes";
import { QuotationIcon, Loading } from "./QuotationUI";

type SortOption = "recent"|"oldest"|"amount_high"|"amount_low"|"validity";

export interface QuotationsProps {
  onOpen?: (quotation: Quotation) => void;
  onCreate?: () => void;
  onOpenDraft?: (draftId: string) => void;
}

type WorkflowDraftListItem = { id:string; company_id:string; project_id:string; quotation_id:string|null; draft_kind:"initial"|"correction"|"requested_change"; draft_status:"draft"|"published"|"discarded"; updated_at:string; content:Record<string,unknown> };

export default function Quotations({onOpen,onCreate,onOpenDraft}:QuotationsProps) {
  const { user } = useAuth();
  const [permissions,setPermissions] = useState({read:false,create:false,update:false,del:false,documentRead:false});
  const [permissionsLoading,setPermissionsLoading] = useState(true);
  const [quotations,setQuotations] = useState<Quotation[]>([]);
  const [drafts,setDrafts] = useState<WorkflowDraftListItem[]>([]);
  const [companies,setCompanies] = useState<Company[]>([]);
  const [projects,setProjects] = useState<Project[]>([]);
  const [loading,setLoading] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [search,setSearch] = useState("");
  const [companyFilter,setCompanyFilter] = useState("all");
  const [projectFilter,setProjectFilter] = useState("all");
  const [statusFilter,setStatusFilter] = useState<"all"|QuotationStatus|"Presentado"|"En revisión">("all");
  const [sort,setSort] = useState<SortOption>("recent");

  const checkPermissions=useCallback(async()=>{
    if(!user?.id){setPermissions({read:false,create:false,update:false,del:false,documentRead:false});setPermissionsLoading(false);return;}
    try{
      const codes=["quotations.read","quotations.create","quotations.update","quotations.delete","quotation_documents.read"] as const;
      const entries=await Promise.all(codes.map(async code=>{
        const {data,error}=await supabase.rpc("current_worker_has_permission",{p_permission_code:code});
        return [code,!error&&data===true] as const;
      }));
      const r=Object.fromEntries(entries) as Record<string,boolean>;
      setPermissions({read:!!r["quotations.read"],create:!!r["quotations.create"],update:!!r["quotations.update"],del:!!r["quotations.delete"],documentRead:!!r["quotation_documents.read"]});
    }catch(e){console.error("[Quotations] permission error",e);setPermissions({read:false,create:false,update:false,del:false,documentRead:false});}
    finally{setPermissionsLoading(false);}
  },[user?.id]);

  const loadData=useCallback(async(silent=false)=>{
    if(!user?.id||!permissions.read){setQuotations([]);setLoading(false);return;}
    try{
      silent?setRefreshing(true):setLoading(true);
      const [q,c,p,d,workflow]=await Promise.all([
        supabase.from("quotations").select("id,company_id,user_id,project_id,client_id,numero_presupuesto,titulo,descripcion_detallada,servicios_incluidos,precio_base,iva_porcentaje,precio_total,irpf_aplicado,irpf_porcentaje,irpf_importe,estado,fecha_emision,fecha_validez,notas,document_path,document_sha256,quotation_version,created_at,updated_at").order("created_at",{ascending:false}),
        supabase.from("companies").select("id,company_name").order("company_name",{ascending:true}),
        supabase.from("projects").select("id,nombre,company_id,client_id,user_id,estado").order("nombre",{ascending:true}),
        supabase.from("quotation_workflow_drafts").select("id,company_id,project_id,quotation_id,draft_kind,draft_status,updated_at,content").eq("draft_status","draft").order("updated_at",{ascending:false}),
        supabase.from("quotation_workflow_state").select("quotation_id,workflow_status,current_version_id")
      ]);
      if(q.error)throw q.error;if(c.error)throw c.error;if(p.error)throw p.error;
      const stateRows=(workflow.error?[]:workflow.data||[]) as Array<{quotation_id:string;workflow_status:Quotation["workflow_status"];current_version_id:string|null}>;
      const stateById=new Map(stateRows.map(row=>[row.quotation_id,row]));
      const baseQuotations=(q.data||[]) as Quotation[];
      const currentVersionIds=stateRows.map(row=>row.current_version_id).filter(Boolean) as string[];
      let versionLabels=new Map<string,string>();
      if(currentVersionIds.length){const {data:versions}=await supabase.from("quotation_official_versions").select("id,version_label").in("id",currentVersionIds);versionLabels=new Map((versions||[]).map((v:any)=>[v.id,v.version_label]));}
      setQuotations(baseQuotations.map(item=>{const state=stateById.get(item.id);return {...item,workflow_status:state?.workflow_status??null,current_version_id:state?.current_version_id??null,current_version_label:state?.current_version_id?versionLabels.get(state.current_version_id)??null:null};}));setCompanies((c.data||[]) as Company[]);setProjects((p.data||[]) as Project[]);setDrafts((d.error?[]:d.data||[]) as WorkflowDraftListItem[]);
    }catch(e){console.error("[Quotations] load error",e);}
    finally{setLoading(false);setRefreshing(false);}
  },[user?.id,permissions.read]);

  useEffect(()=>{checkPermissions();},[checkPermissions]);
  useEffect(()=>{if(!permissionsLoading)loadData();},[permissionsLoading,loadData]);

  const visibleProjects=useMemo(()=>companyFilter==="all"?projects.filter(p=>quotations.some(q=>q.project_id===p.id)):projects.filter(p=>String(p.company_id)===String(companyFilter)),[projects,quotations,companyFilter]);
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return [...quotations].filter(item=>{
      const c=companies.find(x=>x.id===item.company_id);const p=projects.find(x=>x.id===item.project_id);
      const match=!q||[item.numero_presupuesto,item.titulo,item.descripcion_detallada,c?.company_name,p?.nombre].some(v=>String(v||"").toLowerCase().includes(q));
      const effectiveStatus=item.workflow_status==="presented"?"Presentado":item.workflow_status==="in_review"?"En revisión":item.workflow_status==="accepted"?"Aceptado":item.workflow_status==="rejected"?"Rechazado":item.estado;
      return match&&(companyFilter==="all"||item.company_id===companyFilter)&&(projectFilter==="all"||item.project_id===projectFilter)&&(statusFilter==="all"||effectiveStatus===statusFilter);
    }).sort((a,b)=>{
      if(sort==="amount_high")return Number(b.precio_total)-Number(a.precio_total);
      if(sort==="amount_low")return Number(a.precio_total)-Number(b.precio_total);
      if(sort==="validity")return new Date(a.fecha_validez||"9999-12-31").getTime()-new Date(b.fecha_validez||"9999-12-31").getTime();
      const da=new Date(a.created_at).getTime(),db=new Date(b.created_at).getTime();return sort==="oldest"?da-db:db-da;
    });
  },[quotations,companies,projects,search,companyFilter,projectFilter,statusFilter,sort]);

  const metrics=useMemo(()=>({
    total:filtered.length,pending:filtered.filter(q=>q.workflow_status==="presented"||q.workflow_status==="in_review"||(!q.workflow_status&&q.estado==="Pendiente")).length,accepted:filtered.filter(q=>q.workflow_status==="accepted"||(!q.workflow_status&&q.estado==="Aceptado")).length,rejected:filtered.filter(q=>q.workflow_status==="rejected"||(!q.workflow_status&&q.estado==="Rechazado")).length,
    totalValue:filtered.reduce((s,q)=>s+Number(q.precio_total||0),0),acceptedValue:filtered.filter(q=>q.workflow_status==="accepted"||(!q.workflow_status&&q.estado==="Aceptado")).reduce((s,q)=>s+Number(q.precio_total||0),0)
  }),[filtered]);

  if(permissionsLoading||loading)return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><Loading text="Cargando presupuestos…"/></div>;
  if(!permissions.read)return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><div className="border border-slate-200 bg-white p-10 text-center"><FileText className="mx-auto h-8 w-8 text-slate-400"/><h2 className="mt-3 font-semibold text-slate-800">Acceso no disponible</h2><p className="mt-1 text-sm text-slate-500">Este rol no tiene permiso para consultar presupuestos.</p></div></div>;

  const companyName=(id:string)=>companies.find(c=>c.id===id)?.company_name||"Sin empresa";
  const projectName=(id:string|null)=>projects.find(p=>p.id===id)?.nombre||"Sin proyecto";

  return <div className="min-h-screen bg-[#F7F8FA] text-[#172033]">
    <div className="mx-auto w-full max-w-[1540px] space-y-6 p-5 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-[#263044]">Presupuestos</p><p className="text-xs text-[#939CAA]">Gestión comercial y consulta financiera</p></div></div>
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm text-gray-500"><FileText className="h-4 w-4"/>Gestión comercial</div><h1 className="text-2xl font-bold tracking-tight text-[#1E3A8A]">Presupuestos</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">Consulta propuestas, servicios, fiscalidad, validez y documentación.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>loadData(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"><RefreshCw className={`h-4 w-4 ${refreshing?"animate-spin":""}`}/>Actualizar</button>{permissions.create&&<button onClick={onCreate} className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162D6B]"><Plus className="h-4 w-4"/>Crear presupuesto</button>}</div></section>
      {drafts.length>0&&<section className="space-y-3"><div><h2 className="text-sm font-semibold text-gray-900">Borradores internos</h2><p className="mt-1 text-xs text-gray-500">Solo visibles para el equipo. No se han enviado al cliente.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{drafts.map(d=>{const company=companies.find(c=>c.id===d.company_id)?.company_name||"Empresa";const project=projects.find(p=>p.id===d.project_id)?.nombre||"Proyecto";const kind=d.draft_kind==="initial"?"Nuevo presupuesto":d.draft_kind==="correction"?"Corrección interna":"Solicitud de cambios";return <button key={d.id} onClick={()=>onOpenDraft?.(d.id)} className="border border-amber-200 bg-amber-50/60 p-4 text-left hover:bg-amber-50"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-gray-900">{String(d.content?.titulo||kind)}</p><p className="mt-1 text-xs text-gray-600">{kind}</p></div><span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700">Borrador</span></div><p className="mt-3 text-xs text-gray-600">{company} · {project}</p><p className="mt-2 text-[11px] text-gray-400">Último guardado: {formatDate(d.updated_at)}</p></button>})}</div></section>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{[
        [FileText,"Presupuestos",metrics.total],[Clock3,"Pendientes",metrics.pending],[CheckCircle2,"Aceptados",metrics.accepted],[AlertCircle,"Rechazados",metrics.rejected],[Calculator,"Total presupuestado",money(metrics.totalValue)],[CircleDollarSign,"Valor aceptado",money(metrics.acceptedValue)]
            ].map(([Icon,label,value],i)=><div key={String(label)} className="border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{String(label)}</p><p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-800">{String(value)}</p></div><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">{typeof Icon === "function" && <Icon className="h-4 w-4"/>}</div></div></div>)}</div>
      <div className="border border-gray-200 bg-white"><div className="flex flex-col gap-3 p-4 xl:flex-row"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por número, empresa, proyecto o título…" className="h-10 border-gray-200 pl-9"/></div><div className="flex flex-wrap gap-2">
        <Filter value={companyFilter} set={v=>{setCompanyFilter(v);setProjectFilter("all")}} options={[["all","Todas las empresas"],...companies.map(c=>[c.id,c.company_name])]}/>
        <Filter value={projectFilter} set={setProjectFilter} options={[["all","Todos los proyectos"],...visibleProjects.map(p=>[p.id,p.nombre])]}/>
        <Filter value={statusFilter} set={v=>setStatusFilter(v as any)} options={[["all","Todos los estados"],["Pendiente","Pendiente (legacy)"],["Presentado","Presentado"],["En revisión","En revisión"],["Aceptado","Aceptado"],["Rechazado","Rechazado"]]}/>
        <Filter value={sort} set={v=>setSort(v as SortOption)} options={[["recent","Más recientes"],["oldest","Más antiguas"],["amount_high","Mayor importe"],["amount_low","Menor importe"],["validity","Próxima validez"]]}/>
      </div></div></div>
      {!filtered.length?<div className="border border-gray-200 bg-white p-14 text-center"><QuotationIcon large/><h3 className="mt-4 font-semibold text-gray-900">{search||companyFilter!=="all"||projectFilter!=="all"||statusFilter!=="all"?"No hay presupuestos que coincidan":"Todavía no hay presupuestos"}</h3><p className="mt-1 text-sm text-gray-500">Ajusta los filtros o crea un nuevo presupuesto.</p>{permissions.create&&<button onClick={onCreate} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4"/>Crear presupuesto</button>}</div>:
      <><div className="hidden overflow-hidden border border-gray-200 bg-white md:block"><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3">Presupuesto</th><th className="px-5 py-3">Empresa / proyecto</th><th className="px-5 py-3">Emisión</th><th className="px-5 py-3">Validez</th><th className="px-5 py-3">Importe</th><th className="px-5 py-3">Estado</th><th/></tr></thead><tbody className="divide-y divide-gray-100">{filtered.map(q=>{const expired=(q.workflow_status==="presented"||(!q.workflow_status&&q.estado==="Pendiente"))&&isExpired(q.fecha_validez);return <tr key={q.id} onClick={()=>onOpen?.(q)} className="cursor-pointer hover:bg-gray-50/80"><td className="px-5 py-4"><div className="flex items-start gap-3"><QuotationIcon/><div><p className="font-semibold text-gray-900">{q.numero_presupuesto}{q.current_version_label&&<span className="ml-2 text-xs font-semibold text-blue-700">{q.current_version_label}</span>}</p><p className="mt-0.5 max-w-[240px] truncate text-xs text-gray-500">{q.titulo}</p></div></div></td><td className="px-5 py-4"><p className="font-medium text-gray-800">{companyName(q.company_id)}</p><p className="mt-0.5 text-xs text-gray-500">{projectName(q.project_id)}</p></td><td className="px-5 py-4 text-gray-600">{formatDate(q.fecha_emision)}</td><td className={`px-5 py-4 ${expired?"font-semibold text-red-600":"text-gray-600"}`}>{formatDate(q.fecha_validez)}{expired&&<p className="text-xs">Vencido</p>}</td><td className="px-5 py-4 font-semibold text-gray-900">{money(q.precio_total)}</td><td className="px-5 py-4"><StatusDisplay quotation={q}/></td><td className="px-5 py-4 text-right"><ChevronRight className="ml-auto h-4 w-4 text-gray-400"/></td></tr>})}</tbody></table></div></div>
      <div className="grid gap-3 md:hidden">{filtered.map(q=><button key={q.id} onClick={()=>onOpen?.(q)} className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-gray-300"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><QuotationIcon/><div><p className="font-semibold">{q.numero_presupuesto}{q.current_version_label&&<span className="ml-2 text-xs text-blue-700">{q.current_version_label}</span>}</p><p className="text-xs text-gray-500">{q.titulo}</p></div></div><StatusDisplay quotation={q}/></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs"><Info label="Empresa" value={companyName(q.company_id)}/><Info label="Proyecto" value={projectName(q.project_id)}/><Info label="Validez" value={isExpired(q.fecha_validez)&&(q.workflow_status==="presented"||(!q.workflow_status&&q.estado==="Pendiente"))?"Vencido":formatDate(q.fecha_validez)}/><Info label="Total" value={money(q.precio_total)} strong/></div></button>)}</div></>}
      <div className="flex justify-between text-xs text-gray-500"><span>Mostrando {filtered.length} de {quotations.length} presupuestos</span><span className="hidden sm:inline">La numeración la genera el backend.</span></div>
    </div></div>;
}

function StatusDisplay({quotation}:{quotation:Quotation}){const status=quotation.workflow_status==="presented"?"Presentado":quotation.workflow_status==="in_review"?"En revisión":quotation.workflow_status==="accepted"?"Aceptado":quotation.workflow_status==="rejected"?"Rechazado":quotation.estado;const style=status==="Aceptado"?"border-emerald-200 bg-emerald-50 text-emerald-700":status==="Rechazado"?"border-red-200 bg-red-50 text-red-700":status==="En revisión"?"border-blue-200 bg-blue-50 text-blue-700":"border-amber-200 bg-amber-50 text-amber-700";return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${style}`}>{status}</span>;}
function Filter({value,set,options}:{value:string;set:(v:string)=>void;options:string[][]}){return <Select value={value} onValueChange={set}><SelectTrigger className="h-10 min-w-[150px] border-gray-200 bg-white"><SelectValue/></SelectTrigger><SelectContent>{options.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>}
function Info({label,value,strong}:{label:string;value:string;strong?:boolean}){return <div><p className="text-gray-500">{label}</p><p className={`mt-0.5 truncate ${strong?"font-bold text-gray-900":"font-medium text-gray-700"}`}>{value}</p></div>}
