
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { ArrowLeft, Building2, Calculator, CalendarDays, Check, CircleDollarSign, CreditCard, Download, ExternalLink, FileText, FolderKanban, Pencil, RefreshCw, ReceiptText, ShieldCheck, Trash2, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { Company, Profile, Project, Quotation, QuotationForm } from "./quotationTypes";
import { calculateQuotationFiscalAmounts, calculateSubtotal, cleanServices, formatDate, isExpired, money, toForm, toIsoDate } from "./quotationTypes";
import QuotationEditor from "./QuotationEditor";
import QuotationDocuments from "./QuotationDocuments";
import { ErrorBox, Loading, QuotationStatusBadge, Section, TotalRow } from "./QuotationUI";

interface Client {id:string;profile_id:string|null;nombre:string;email:string|null;company_id:string|null;}
type WorkflowState = { quotation_id:string; current_version_id:string|null; workflow_status:"presented"|"in_review"|"accepted"|"rejected"; updated_at:string };
type OfficialVersion = { id:string; quotation_id:string; version_major:number; version_minor:number; version_label:string; content_snapshot:Record<string,any>; document_path:string|null; document_sha256:string|null; is_current:boolean; published_at:string; client_notified_at:string|null; client_response:string|null; responded_at:string|null };
type ChangeRequest = { id:string; official_version_id:string; request_text:string; request_status:"open"|"resolved"|"cancelled"; requested_at:string; resolved_at:string|null };
type WorkflowDraft = { id:string; draft_kind:"initial"|"correction"|"requested_change"; draft_status:"draft"|"published"|"discarded"; updated_at:string };

export default function QuotationDetail({quotationId,onBack,onEditDraft}:{quotationId:string;onBack:()=>void;onEditDraft?:(draftId:string)=>void}) {
  const {user}=useAuth();
  const [permissions,setPermissions]=useState({
  read: false,
  update: false,
  del: false,
  documentRead: false,
  documentManage: false,
});
  const [q,setQ]=useState<Quotation|null>(null);
  const [companies,setCompanies]=useState<Company[]>([]);
  const [projects,setProjects]=useState<Project[]>([]);
  const [profiles,setProfiles]=useState<Profile[]>([]);
  const [clients,setClients]=useState<Client[]>([]);
  const [form,setForm]=useState<QuotationForm|null>(null);
  const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[saving,setSaving]=useState(false);
  const [editing,setEditing]=useState(false),[selectedPdf,setSelectedPdf]=useState<File|null>(null),[error,setError]=useState<string|null>(null);
  const [workerNotes,setWorkerNotes]=useState("");
  const [workflowState,setWorkflowState]=useState<WorkflowState|null>(null);
  const [officialVersions,setOfficialVersions]=useState<OfficialVersion[]>([]);
  const [changeRequests,setChangeRequests]=useState<ChangeRequest[]>([]);
  const [activeDraft,setActiveDraft]=useState<WorkflowDraft|null>(null);

  const checkPermissions=useCallback(async()=>{
    if(!user?.id)return;
const codes = [
  "quotations.read",
  "quotations.update",
  "quotations.delete",
  "quotation_documents.read",
  "quotation_documents.manage",
] as const;
    const entries=await Promise.all(codes.map(async code=>{const {data,error}=await supabase.rpc("current_worker_has_permission",{p_permission_code:code});return [code,!error&&data===true] as const;}));
    const r=Object.fromEntries(entries) as Record<string,boolean>;
setPermissions({
  read: !!r["quotations.read"],
  update: !!r["quotations.update"],
  del: !!r["quotations.delete"],
  documentRead: !!r["quotation_documents.read"],
  documentManage: !!r["quotation_documents.manage"],
});
  },[user?.id]);

  const load=useCallback(async(silent=false)=>{
    if(!user?.id||!permissions.read)return;
    try{
      silent?setRefreshing(true):setLoading(true);setError(null);
      const [qr,cr,pr,fr,cl,ws,ov,requests,drafts]=await Promise.all([
        supabase.from("quotations").select("*").eq("id",quotationId).maybeSingle(),
        supabase.from("companies").select("id,company_name,iva_recomendado_aplicado,iva_recomendado_porcentaje,iva_aprobado_aplicado,iva_aprobado_porcentaje,iva_aprobado_at").order("company_name"),
        supabase.from("projects").select("id,nombre,company_id,client_id,user_id,estado").order("nombre"),
        supabase.from("profiles").select("id,nombre,email,company_id").order("nombre"),
        supabase.from("clients").select("id,profile_id,nombre,email,company_id").order("nombre"),
        supabase.from("quotation_workflow_state").select("quotation_id,current_version_id,workflow_status,updated_at").eq("quotation_id",quotationId).maybeSingle(),
        supabase.from("quotation_official_versions").select("id,quotation_id,version_major,version_minor,version_label,content_snapshot,document_path,document_sha256,is_current,published_at,client_notified_at,client_response,responded_at").eq("quotation_id",quotationId).order("version_major",{ascending:false}).order("version_minor",{ascending:false}),
        supabase.from("quotation_change_requests").select("id,official_version_id,request_text,request_status,requested_at,resolved_at").eq("quotation_id",quotationId).order("requested_at",{ascending:false}),
        supabase.from("quotation_workflow_drafts").select("id,draft_kind,draft_status,updated_at").eq("quotation_id",quotationId).eq("draft_status","draft").order("updated_at",{ascending:false}).limit(1)
      ]);
      if(qr.error)throw qr.error;if(!qr.data)throw new Error("Presupuesto no encontrado o no disponible.");
      setQ(qr.data as Quotation);setForm(toForm(qr.data as Quotation));setCompanies((cr.data||[]) as Company[]);setProjects((pr.data||[]) as Project[]);setProfiles((fr.data||[]) as Profile[]);setClients((cl.data||[]) as Client[]);
      setWorkflowState((ws.error?null:ws.data) as WorkflowState|null);setOfficialVersions((ov.error?[]:ov.data||[]) as OfficialVersion[]);setChangeRequests((requests.error?[]:requests.data||[]) as ChangeRequest[]);setActiveDraft((drafts.error?null:(drafts.data?.[0]||null)) as WorkflowDraft|null);
    }catch(e:any){setError(e?.message||"No se pudo cargar el presupuesto.");}
    finally{setLoading(false);setRefreshing(false);}
  },[user?.id,permissions.read,quotationId]);

  useEffect(()=>{checkPermissions()},[checkPermissions]);
  useEffect(()=>{if(permissions.read)load()},[permissions.read,load]);

  useEffect(()=>{
  const companyId=q?.company_id;

  if(!companyId){
    setWorkerNotes("");
    return;
  }

  const loadWorkerNotes=async()=>{
    try{
      const {data,error}=await supabase.rpc(
        "get_company_worker_notes_for_quotation",
        {
          p_company_id:companyId,
        }
      );

      if(error)throw error;

      setWorkerNotes(data||"");
    }catch{
      setWorkerNotes("");
    }
  };

  void loadWorkerNotes();
},[q?.company_id]);

  const company=q?companies.find(c=>c.id===q.company_id)?.company_name||"Sin empresa":"";
  const project=q?projects.find(p=>p.id===q.project_id):null;
  const client=q?clients.find(c=>c.id===q.client_id):null;
  const profile=client?.profile_id?profiles.find(p=>p.id===client.profile_id):null;
  const services=q?cleanServices(q.servicios_incluidos):[];
  const fiscal=q?calculateQuotationFiscalAmounts(Number(q.precio_base||calculateSubtotal(services)),Number(q.iva_porcentaje||0),q.irpf_aplicado,Number(q.irpf_porcentaje||0)):null;
  const expired=Boolean(q&&q.estado==="Pendiente"&&isExpired(q.fecha_validez));

  const save=async()=>{
    if(!q||!form)return;
    setError(null);
    if(!form.company_id||!form.project_id||!form.titulo.trim())return setError("Empresa, proyecto y título son obligatorios.");
    const project=projects.find(p=>p.id===form.project_id);if(!project)return setError("El proyecto seleccionado no existe.");if(project.company_id!==form.company_id)return setError("El proyecto no pertenece a la empresa seleccionada.");
    const iva=Number(form.iva_porcentaje||0),irpf=Number(form.irpf_porcentaje||0),clean=cleanServices(form.servicios_incluidos);
    if(iva<0||iva>100||!Number.isFinite(iva))return setError("El IVA debe estar entre 0 y 100.");if(form.irpf_aplicado&&(!Number.isFinite(irpf)||irpf<=0||irpf>100))return setError("El IRPF debe ser mayor que 0 y menor o igual que 100.");if(!form.irpf_aplicado&&irpf!==0)return setError("Si el IRPF no se aplica, debe ser 0.");if(clean.some(s=>!s.descripcion))return setError("Todos los servicios deben tener descripción.");
    try{
      setSaving(true);
      const {data,error:rpcError}=await supabase.rpc("update_quotation_by_worker",{p_quotation_id:q.id,p_project_id:form.project_id,p_titulo:form.titulo.trim(),p_descripcion_detallada:form.descripcion_detallada.trim()||null,p_servicios_incluidos:clean,p_iva_porcentaje:iva,p_irpf_aplicado:Boolean(form.irpf_aplicado),p_irpf_porcentaje:form.irpf_aplicado?irpf:0,p_estado:q.estado,p_fecha_emision:form.fecha_emision?toIsoDate(form.fecha_emision):q.fecha_emision,p_fecha_validez:form.fecha_validez?toIsoDate(form.fecha_validez):null,p_notas:form.notas.trim()||null});
      if(rpcError)throw rpcError;
      const saved=(Array.isArray(data)?data[0]:data) as Quotation;if(!saved?.id)throw new Error("La base de datos no devolvió el presupuesto actualizado.");
if (selectedPdf) {
  if (!permissions.documentManage) {
    throw new Error(
      "No tienes permiso para gestionar el PDF del presupuesto."
    );
  }

  const {
    uploadQuotationPdf,
  } = await import("./QuotationDocuments");

  await uploadQuotationPdf(
    saved,
    selectedPdf
  );
}
      setEditing(false);setSelectedPdf(null);toast.success("Presupuesto actualizado correctamente.");await load(true);
    }catch(e:any){setError(e?.message||"No se pudo guardar el presupuesto.");}finally{setSaving(false);}
  };

  const startOrResumeDraft=async()=>{
    if(!q||!workflowState||!permissions.update)return;
    if(activeDraft){onEditDraft?.(activeDraft.id);return;}
    try{
      setSaving(true);setError(null);
      const kind=workflowState.workflow_status==="in_review"?"requested_change":"correction";
      const {data,error:rpcError}=await supabase.rpc("start_quotation_workflow_draft",{p_project_id:q.project_id,p_quotation_id:q.id,p_draft_kind:kind});
      if(rpcError)throw rpcError;
      if(!data?.id)throw new Error("La base de datos no devolvió el borrador.");
      toast.success(kind==="requested_change"?"Borrador para atender la solicitud creado.":"Borrador de corrección creado. El cliente seguirá viendo la versión oficial actual.");
      onEditDraft?.(String(data.id));
    }catch(e:any){setError(e?.message||"No se pudo iniciar el borrador.");await load(true);}finally{setSaving(false);}
  };

  const generateCurrentVersionPdf=async()=>{
    const current=officialVersions.find(v=>v.is_current);
    if(!current)return;
    try{
      setSaving(true);setError(null);
      const {data,error:invokeError}=await supabase.functions.invoke("set-quotation-document-hash",{body:{action:"generate_quotation_official_version_document",version_id:current.id}});
      if(invokeError){let message=invokeError.message||"No se pudo generar el PDF.";try{const body=await invokeError.context?.json();message=body?.error||message;}catch{}throw new Error(message);}
      if(!data?.success||!data?.document_path||!data?.document_sha256)throw new Error("El backend no confirmó el PDF oficial.");
      toast.success(`PDF de ${current.version_label} generado y registrado.`);await load(true);
    }catch(e:any){setError(e?.message||"No se pudo generar el PDF oficial.");}finally{setSaving(false);}
  };

  const openOfficialPdf=async(version:OfficialVersion,download=false)=>{
    if(!version.document_path)return;
    try{
      const {data,error:storageError}=await supabase.storage.from("quotations").createSignedUrl(version.document_path,300,download?{download:`${q?.numero_presupuesto||"presupuesto"}-${version.version_label}.pdf`}:undefined);
      if(storageError)throw storageError;if(!data?.signedUrl)throw new Error("No se pudo generar el enlace seguro del PDF.");
      if(download){const a=document.createElement("a");a.href=data.signedUrl;a.download=`${q?.numero_presupuesto||"presupuesto"}-${version.version_label}.pdf`;a.target="_blank";a.rel="noopener noreferrer";document.body.appendChild(a);a.click();a.remove();}else window.open(data.signedUrl,"_blank","noopener,noreferrer");
    }catch(e:any){toast.error(e?.message||"No se pudo abrir el PDF de esta versión.");}
  };

  const deleteQuotation=async()=>{
    if(!q||!permissions.del)return;
    if(!window.confirm(`¿Seguro que quieres eliminar el presupuesto ${q.numero_presupuesto}?`))return;
    try{
      setSaving(true);
      const paths=Array.from(new Set([q.document_path,...officialVersions.map(v=>v.document_path)].filter((p):p is string=>Boolean(p))));
      const {data,error:rpcError}=await supabase.rpc("delete_quotation_by_worker",{p_quotation_id:q.id});
      if(rpcError)throw rpcError;
      const deleted=Array.isArray(data)?data[0]:data;if(!deleted?.id)throw new Error("La base de datos no confirmó la eliminación.");
      if(paths.length){const {error:storageError}=await supabase.storage.from("quotations").remove(paths);if(storageError)console.warn("[QuotationDetail] orphaned PDFs",storageError);}
      toast.success("Presupuesto eliminado correctamente.");onBack();
    }catch(e:any){setError(e?.message||"No se pudo eliminar el presupuesto.");}finally{setSaving(false);}
  };

  if(loading)return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><Loading text="Cargando presupuesto…"/></div>;
  if(!permissions.read)return <div className="min-h-screen bg-[#F7F8FA] p-8"><ErrorBox message="Este rol no tiene permiso para consultar presupuestos."/><button onClick={onBack} className="mt-4 text-sm font-semibold text-[#1E3A8A]">Volver</button></div>;
  if(!q||!fiscal)return <div className="min-h-screen bg-[#F7F8FA] p-8"><ErrorBox message={error||"Presupuesto no encontrado."}/><button onClick={onBack} className="mt-4 text-sm font-semibold text-[#1E3A8A]">Volver</button></div>;

  return <div className="min-h-screen bg-[#F7F8FA] text-[#172033]"><div className="mx-auto w-full max-w-[1540px] space-y-6 p-5 sm:p-6 lg:p-8">
    <div><p className="text-sm font-semibold">Presupuestos</p><p className="text-xs text-gray-400">Ficha del presupuesto</p></div>
    <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500"><ArrowLeft className="h-4 w-4"/>Volver a presupuestos</button>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="mb-2 flex flex-wrap items-center gap-2"><WorkflowStatusBadge workflowState={workflowState} legacyStatus={q.estado}/>{q.document_path?<span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">PDF adjunto</span>:<span className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500">Sin PDF</span>}{expired&&<span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">Vencido</span>}</div><p className="text-sm font-semibold text-[#1E3A8A]">{q.numero_presupuesto}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{q.titulo||"Presupuesto"}</h1><p className="mt-1 text-sm text-gray-500">{company} · {project?.nombre||"Sin proyecto"}</p></div><div className="flex flex-wrap gap-2">{q.document_path&&permissions.documentRead&&<><button onClick={async()=>{const {data}=await supabase.storage.from("quotations").createSignedUrl(q.document_path!,300);if(data?.signedUrl)window.open(data.signedUrl,"_blank","noopener,noreferrer");}} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"><ExternalLink className="h-4 w-4"/>Ver PDF</button><button onClick={async()=>{const {data}=await supabase.storage.from("quotations").createSignedUrl(q.document_path!,300,{download:`${q.numero_presupuesto}.pdf`});if(data?.signedUrl){const a=document.createElement("a");a.href=data.signedUrl;a.download=`${q.numero_presupuesto}.pdf`;a.click();}}} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"><Download className="h-4 w-4"/>Descargar</button></>}{<button onClick={()=>load(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700"><RefreshCw className={refreshing?"h-4 w-4 animate-spin":"h-4 w-4"}/>Actualizar</button>}{permissions.update&&q.estado!=="Aceptado"&&!editing&&(workflowState?<button onClick={startOrResumeDraft} disabled={saving||workflowState.workflow_status==="accepted"||workflowState.workflow_status==="rejected"} className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white"><Pencil className="h-4 w-4"/>{activeDraft?"Continuar borrador":workflowState.workflow_status==="in_review"?"Atender solicitud":"Preparar corrección"}</button>:<button onClick={()=>{setForm(toForm(q));setEditing(true);setSelectedPdf(null)}} className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white"><Pencil className="h-4 w-4"/>Editar</button>)}</div></div>
    {error&&<ErrorBox message={error}/>}
    {workflowState&&<section className="border border-blue-100 bg-white p-5 space-y-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-semibold text-gray-900">Flujo de versiones oficiales</h2><p className="mt-1 text-sm text-gray-500">Los borradores internos no sustituyen lo que ve el cliente. Solo una versión publicada con PDF registrado se comunica al cliente.</p></div><span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${workflowState.workflow_status==="presented"?"border-amber-200 bg-amber-50 text-amber-700":workflowState.workflow_status==="in_review"?"border-blue-200 bg-blue-50 text-blue-700":workflowState.workflow_status==="accepted"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-red-200 bg-red-50 text-red-700"}`}>{workflowState.workflow_status==="presented"?"Presentado":workflowState.workflow_status==="in_review"?"En revisión":workflowState.workflow_status==="accepted"?"Aceptado":"Rechazado"}</span></div>
      {workflowState.workflow_status==="in_review"&&<div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">El cliente ha solicitado cambios. La respuesta está bloqueada hasta que se publique una nueva versión.</div>}
      {workflowState.workflow_status==="accepted"&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Presupuesto aceptado. Se conservan las protecciones contractuales y no se puede modificar ni publicar otra versión.</div>}
      {workflowState.workflow_status==="rejected"&&<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">La negociación ha quedado cerrada por rechazo del cliente.</div>}
      {officialVersions.find(v=>v.is_current&&!v.document_path)&&<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm text-amber-900">La versión actual está publicada en base de datos, pero todavía no tiene PDF registrado. El cliente no ha sido notificado.</p><button onClick={generateCurrentVersionPdf} disabled={saving} className="rounded-lg bg-[#1E3A8A] px-3 py-2 text-xs font-semibold text-white">Generar PDF y notificar</button></div>}
      {changeRequests.length>0&&<div><h3 className="text-sm font-semibold text-gray-800">Solicitudes de cambio</h3><div className="mt-2 space-y-2">{changeRequests.map(r=><div key={r.id} className="rounded-lg border border-gray-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-gray-700">{r.request_status==="open"?"Pendiente de resolver":r.request_status==="resolved"?"Resuelta":"Cancelada"}</span><span className="text-xs text-gray-400">{formatDate(r.requested_at)}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{r.request_text}</p></div>)}</div></div>}
      <div><h3 className="text-sm font-semibold text-gray-800">Historial oficial</h3><p className="mt-1 text-xs text-gray-500">Solo se muestran versiones publicadas; los borradores internos no aparecen en este historial.</p><div className="mt-3 space-y-2">{officialVersions.map(v=><div key={v.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-gray-900">{v.version_label}</span>{v.is_current&&<span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Actual</span>}{v.client_response&&<span className="text-xs text-gray-500">Respuesta: {v.client_response}</span>}</div><p className="mt-1 text-xs text-gray-500">Publicada: {formatDate(v.published_at)}{v.client_notified_at?" · Notificada al cliente":" · Pendiente de notificación"}</p><p className="mt-1 text-xs text-gray-500">{v.document_sha256?`SHA-256: ${v.document_sha256.slice(0,16)}…`:"Sin documento registrado"}</p></div>{v.document_path&&permissions.documentRead&&<div className="flex gap-2"><button onClick={()=>openOfficialPdf(v,false)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"><ExternalLink className="h-3.5 w-3.5"/>Ver PDF</button><button onClick={()=>openOfficialPdf(v,true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"><Download className="h-3.5 w-3.5"/>Descargar</button></div>}</div>)}</div></div>
    </section>}
    {editing?<QuotationEditor form={form||toForm(q)} setForm={setForm as Dispatch<SetStateAction<QuotationForm>>} companies={companies} projects={projects} saving={saving} selectedPdf={selectedPdf} setSelectedPdf={setSelectedPdf} creationMode={false} onCancel={()=>{setEditing(false);setSelectedPdf(null);setForm(toForm(q))}} onSave={save} canManageDocument={permissions.documentManage} workerNotes={workerNotes}/>:
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[[Calculator,"Base imponible",money(q.precio_base)],[CircleDollarSign,"IVA",money(fiscal.ivaImporte)],[ReceiptText,"Total bruto",money(q.precio_total)],[ShieldCheck,"IRPF",q.irpf_aplicado?money(q.irpf_importe):"No aplicado"],[CreditCard,"A pagar",money(fiscal.importeAPagar)]].map(([Icon,label,value],i)=><div key={String(label)} className="border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{String(label)}</p><p className="mt-2 truncate text-2xl font-bold text-slate-800">{String(value)}</p><Icon className="mt-2 h-4 w-4 text-[#1E3A8A]"/></div>)}</div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="space-y-6">
        <Section title="Información del presupuesto" icon={<FileText className="h-4 w-4"/>}><div className="grid gap-5 sm:grid-cols-2"><Info icon={<FileText/>} label="Número" value={q.numero_presupuesto}/><Info icon={<Building2/>} label="Empresa" value={company}/><Info icon={<FolderKanban/>} label="Proyecto" value={project?.nombre||"Sin proyecto"}/><Info icon={<User/>} label="Cliente" value={client?.nombre||"Sin cliente"} secondary={client?.email||profile?.email}/><Info icon={<CalendarDays/>} label="Fecha de emisión" value={formatDate(q.fecha_emision)}/><Info icon={<CalendarDays/>} label="Fecha de validez" value={formatDate(q.fecha_validez)}/><Info icon={<Check/>} label="Estado" value={<QuotationStatusBadge status={q.estado}/>} /></div></Section>
        <Section title="Concepto y servicios" icon={<FileText className="h-4 w-4"/>}>{q.descripcion_detallada&&<div className="mb-5 rounded-lg bg-gray-50 p-4"><p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Descripción</p><p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{q.descripcion_detallada}</p></div>}<div className="overflow-hidden rounded-lg border border-gray-200"><div className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500"><span>Concepto</span><span className="text-right">Cantidad</span><span className="text-right">Precio</span><span className="text-right">Importe</span></div>{services.map((s,i)=><div key={i} className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] px-4 py-3 text-sm border-t border-gray-100"><span>{s.descripcion}</span><span className="text-right text-gray-600">{s.cantidad}</span><span className="text-right text-gray-600">{money(s.precio)}</span><span className="text-right font-semibold">{money(s.cantidad*s.precio)}</span></div>)}</div></Section>
        {q.notas&&<Section title="Notas" icon={<FileText className="h-4 w-4"/>}><p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{q.notas}</p></Section>}
        <Section title="Resumen económico" icon={<Calculator className="h-4 w-4"/>}><div className="space-y-3 text-sm"><TotalRow label="Base imponible" value={money(q.precio_base)}/><TotalRow label={`IVA (${q.iva_porcentaje}%)`} value={money(fiscal.ivaImporte)}/><TotalRow label="Total bruto" value={money(q.precio_total)} strong/><TotalRow label={q.irpf_aplicado?`IRPF (${q.irpf_porcentaje}%)`:"IRPF"} value={q.irpf_aplicado?`− ${money(q.irpf_importe)}`:"No aplicado"}/><div className="border-t border-gray-200 pt-3"><TotalRow label="Importe a pagar" value={money(fiscal.importeAPagar)} strong emphasized/></div></div></Section>
{!workflowState&&<QuotationDocuments
  quotation={q}
  canManage={
    permissions.documentManage &&
    q.estado !== "Aceptado"
  }
  canRead={permissions.documentRead}
  onChanged={() => load(true)}
/>}
      </div>
      <aside className="space-y-6"><div className="border border-gray-200 bg-white"><div className="p-4 border-b border-gray-100"><p className="text-sm font-semibold">Estado del presupuesto</p><p className="mt-1 text-xs text-gray-500">La aceptación contractual la registra el cliente mediante el flujo seguro.</p></div><div className="p-4 space-y-4"><div className="flex justify-between"><span className="text-sm text-gray-500">Estado contractual</span><QuotationStatusBadge status={q.estado}/></div>{workflowState&&<div className="flex justify-between"><span className="text-sm text-gray-500">Estado del flujo</span><span className="text-sm font-semibold">{workflowState.workflow_status==="presented"?"Presentado":workflowState.workflow_status==="in_review"?"En revisión":workflowState.workflow_status==="accepted"?"Aceptado":"Rechazado"}</span></div>}{q.estado==="Pendiente"&&<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Pendiente de aceptación por el cliente. El trabajador no puede forzar la aceptación.</div>}{q.quotation_version&&<div className="flex justify-between"><span className="text-sm text-gray-500">Versión</span><span className="font-semibold">{q.quotation_version}</span></div>}</div></div><div className="border border-blue-100 bg-blue-50/60"><div className="flex gap-3 p-4"><ShieldCheck className="h-5 w-5 text-[#1E3A8A]"/><div><p className="text-sm font-semibold text-[#1E3A8A]">Presupuesto protegido</p><p className="mt-1 text-xs leading-5 text-gray-600">Los aceptados quedan congelados y el PDF asociado queda protegido frente a modificaciones.</p></div></div></div>{permissions.del&&q.estado!=="Aceptado"&&<div className="border border-red-200 bg-white"><div className="p-4"><p className="text-sm font-semibold text-red-700">Zona de eliminación</p><p className="mt-1 text-xs text-gray-500">La eliminación está sujeta a las protecciones del backend.</p><button onClick={deleteQuotation} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 className="h-4 w-4"/>Eliminar presupuesto</button></div></div>}</aside></div>
    </>}
  </div></div>;
}
function Info({icon,label,value,secondary}:{icon:ReactNode;label:string;value:ReactNode;secondary?:ReactNode}){return <div className="flex gap-3"><div className="mt-0.5 text-gray-400">{icon}</div><div><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-gray-800">{value}</p>{secondary&&<p className="mt-0.5 text-xs text-gray-500">{secondary}</p>}</div></div>}

function WorkflowStatusBadge({workflowState,legacyStatus}:{workflowState:WorkflowState|null;legacyStatus:Quotation["estado"]}){if(!workflowState)return <QuotationStatusBadge status={legacyStatus}/>;const status=workflowState.workflow_status;const label=status==="presented"?"Presentado":status==="in_review"?"En revisión":status==="accepted"?"Aceptado":"Rechazado";const cls=status==="presented"?"border-amber-200 bg-amber-50 text-amber-700":status==="in_review"?"border-blue-200 bg-blue-50 text-blue-700":status==="accepted"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-red-200 bg-red-50 text-red-700";return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>; }
