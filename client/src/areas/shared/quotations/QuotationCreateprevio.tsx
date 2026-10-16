
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Company, Project, Quotation, QuotationForm } from "./quotationTypes";
import { calculateQuotationFiscalAmounts, calculateSubtotal, cleanServices, emptyQuotationForm, toIsoDate } from "./quotationTypes";
import QuotationEditor from "./QuotationEditor";
import { ErrorBox, Loading } from "./QuotationUI";
import { uploadQuotationPdf } from "./QuotationDocuments";

export default function QuotationCreate({onBack,onCreated}:{onBack:()=>void;onCreated:(id:string)=>void}) {
  const {user}=useAuth();
  const [permissions,setPermissions] = useState({
  create: false,
  documentManage: false,
});
  const [companies,setCompanies]=useState<Company[]>([]);
  const [projects,setProjects]=useState<Project[]>([]);
  const [form,setForm]=useState<QuotationForm>(emptyQuotationForm());
  const [selectedPdf,setSelectedPdf]=useState<File|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [workerNotes,setWorkerNotes]=useState("");

  useEffect(()=>{(async()=>{
    if(!user?.id){setLoading(false);return;}
    try{
      const [createPermission, documentPermission] =
  await Promise.all([
    supabase.rpc(
      "current_worker_has_permission",
      {
        p_permission_code: "quotations.create",
      }
    ),
    supabase.rpc(
      "current_worker_has_permission",
      {
        p_permission_code: "quotation_documents.manage",
      }
    ),
  ]);

setPermissions({
  create:
    !createPermission.error &&
    createPermission.data === true,

  documentManage:
    !documentPermission.error &&
    documentPermission.data === true,
});

if (
  createPermission.error ||
  createPermission.data !== true
) {
  return;
}
      const [c,p]=await Promise.all([
        supabase.from("companies").select("id,company_name,iva_recomendado_aplicado,iva_recomendado_porcentaje,iva_aprobado_aplicado,iva_aprobado_porcentaje,iva_aprobado_at").order("company_name"),
        supabase.from("projects").select("id,nombre,company_id,client_id,user_id,estado").order("nombre")
      ]);
      if(c.error)throw c.error;if(p.error)throw p.error;setCompanies((c.data||[]) as Company[]);setProjects((p.data||[]) as Project[]);
    }catch(e:any){setError(e?.message||"No se pudieron cargar las opciones.");}finally{setLoading(false);}
  })()},[user?.id]);

  const availableProjects=useMemo(()=>projects.filter(p=>!form.company_id||p.company_id===form.company_id),[projects,form.company_id]);
useEffect(()=>{
  const companyId=form.company_id;

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
    }catch(e:any){
      setWorkerNotes("");
      setError(
        e?.message||"No se pudieron cargar las notas internas de la empresa."
      );
    }
  };

  void loadWorkerNotes();
},[form.company_id]);
  const save=async()=>{
    setError(null);
    if (!permissions.create) {
  return setError(
    "Tu rol no tiene permiso para crear presupuestos."
  );
}
    if(!form.company_id)return setError("Selecciona una empresa.");
    const project=projects.find(p=>p.id===form.project_id);
    if(!project)return setError("Selecciona un proyecto.");
    if(project.company_id!==form.company_id)return setError("El proyecto no pertenece a la empresa seleccionada.");
    if(!project.user_id)return setError("El proyecto seleccionado no tiene un usuario asociado.");
    if(!project.client_id)return setError("El proyecto seleccionado no tiene un cliente vinculado.");
    if(!form.titulo.trim())return setError("Introduce un título para el presupuesto.");
    const iva=Number(form.iva_porcentaje||0),irpf=Number(form.irpf_porcentaje||0),services=cleanServices(form.servicios_incluidos);
    if(iva<0||iva>100||!Number.isFinite(iva))return setError("El porcentaje de IVA debe estar entre 0 y 100.");
    if(form.irpf_aplicado&&(!Number.isFinite(irpf)||irpf<=0||irpf>100))return setError("El porcentaje de IRPF debe ser mayor que 0 y menor o igual que 100.");
    if(!form.irpf_aplicado&&irpf!==0)return setError("Si el IRPF no se aplica, el porcentaje debe ser 0.");
    if(!services.length||services.some(s=>!s.descripcion.trim()))return setError("Añade al menos un servicio y completa su descripción.");
    try{
      setSaving(true);
      const {data,error:rpcError}=await supabase.rpc("create_quotation_by_worker",{
        p_company_id:form.company_id,p_project_id:project.id,p_titulo:form.titulo.trim(),
        p_descripcion_detallada:form.descripcion_detallada.trim()||null,p_servicios_incluidos:services,
        p_iva_porcentaje:iva,p_irpf_aplicado:Boolean(form.irpf_aplicado),p_irpf_porcentaje:form.irpf_aplicado?irpf:0,
        p_estado:"Pendiente",p_fecha_emision:form.fecha_emision?toIsoDate(form.fecha_emision):new Date().toISOString(),
        p_fecha_validez:form.fecha_validez?toIsoDate(form.fecha_validez):null,p_notas:form.notas.trim()||null
      });
      if(rpcError)throw rpcError;
      const created=(Array.isArray(data)?data[0]:data) as Quotation;
      if(!created?.id)throw new Error("La base de datos no devolvió el presupuesto creado.");
      if(selectedPdf){try{await uploadQuotationPdf(created,selectedPdf);}catch(e){console.error(e);toast.warning("El presupuesto se creó, pero no se pudo adjuntar el PDF.");}}
      toast.success(`Presupuesto ${created.numero_presupuesto} creado correctamente.`);
      onCreated(created.id);
    }catch(e:any){setError(e?.message||"No se pudo crear el presupuesto.");}
    finally{setSaving(false);}
  };

  if(loading)return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><Loading text="Preparando nuevo presupuesto…"/></div>;
  if(!permissions.create)return <div className="min-h-screen bg-[#F7F8FA] p-5 sm:p-6 lg:p-8"><ErrorBox message="Este rol no tiene permiso para crear presupuestos."/><button onClick={onBack} className="mt-4 text-sm font-semibold text-[#1E3A8A]">Volver</button></div>;

  const fiscal=calculateQuotationFiscalAmounts(calculateSubtotal(form.servicios_incluidos),Number(form.iva_porcentaje||0),form.irpf_aplicado,Number(form.irpf_porcentaje||0));
  return <div className="min-h-screen bg-[#F7F8FA] text-[#172033]"><div className="mx-auto w-full max-w-[1540px] space-y-6 p-5 sm:p-6 lg:p-8">
    <div><p className="text-sm font-semibold">Presupuestos</p><p className="text-xs text-gray-400">Nuevo presupuesto</p></div>
    <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800"><ArrowLeft className="h-4 w-4"/>Volver a presupuestos</button>
    <div><div className="flex items-center gap-2 text-sm text-[#64748B]"><FileText className="h-4 w-4 text-[#1E3A8A]"/>Presupuestos</div><h1 className="mt-2 text-3xl font-bold tracking-tight">Crear presupuesto</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">El número y los importes definitivos los asigna y valida el backend.</p></div>
    {error&&<ErrorBox message={error}/>}
    <QuotationEditor form={form} setForm={setForm} companies={companies} projects={availableProjects} saving={saving}  selectedPdf={selectedPdf} setSelectedPdf={setSelectedPdf} creationMode onCancel={onBack} onSave={save} canManageDocument={permissions.documentManage} workerNotes={workerNotes}/>
  </div></div>;
}
