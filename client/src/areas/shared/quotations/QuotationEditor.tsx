
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Calculator, FileText, Info, Plus, ReceiptText, ShieldCheck, Trash2, Upload, X, Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Company, Project, QuotationForm } from "./quotationTypes";
import { calculateQuotationFiscalAmounts, calculateSubtotal, cleanServices, money, EMPTY_SERVICE } from "./quotationTypes";
import { Field, Section, TotalRow } from "./QuotationUI";

export default function QuotationEditor({
  form,
  setForm,
  companies,
  projects,
  saving,
  selectedPdf,
  setSelectedPdf,
  creationMode,
  onCancel,
  onSave,
  workerNotes,
  onPublish,
  publishLabel = "Publicar presupuesto",
  saveLabel,
  hidePdf = false,
  lockProject = false,
  workflowMode = false,
}:{
  form:QuotationForm;
  setForm:Dispatch<SetStateAction<QuotationForm>>;
  companies:Company[];
  projects:Project[];
  saving:boolean;
  selectedPdf:File|null;
  setSelectedPdf:(file:File|null)=>void;
  creationMode:boolean;
  onCancel:()=>void;
  onSave:()=>void;
  canManageDocument: boolean;
  workerNotes: string;
  onPublish?:()=>void;
  publishLabel?:string;
  saveLabel?:string;
  hidePdf?:boolean;
  lockProject?:boolean;
  workflowMode?:boolean;
}) {
  const availableProjects=useMemo(()=>projects.filter(p=>!form.company_id||String(p.company_id)===String(form.company_id)),[projects,form.company_id]);
  const base=calculateSubtotal(form.servicios_incluidos);
  const fiscal=calculateQuotationFiscalAmounts(base,Number(form.iva_porcentaje||0),form.irpf_aplicado,Number(form.irpf_porcentaje||0));
  const update=<K extends keyof QuotationForm>(key:K,value:QuotationForm[K])=>setForm(cur=>({...cur,[key]:value}));
  const updateService=(i:number,field:"descripcion"|"cantidad"|"precio",value:string)=>setForm(cur=>{
    const next=[...cur.servicios_incluidos];const s=next[i]||{...EMPTY_SERVICE};
    next[i]=field==="descripcion"?{...s,descripcion:value}:field==="cantidad"?{...s,cantidad:Number(value||0)}:{...s,precio:Number(value||0)};
    return {...cur,servicios_incluidos:next};
  });
  const addService=()=>setForm(cur=>({...cur,servicios_incluidos:[...cur.servicios_incluidos,{...EMPTY_SERVICE}]}));
  const removeService=(i:number)=>setForm(cur=>{const next=cur.servicios_incluidos.filter((_,idx)=>idx!==i);return {...cur,servicios_incluidos:next.length?next:[{...EMPTY_SERVICE}]};});
  const handlePdf=(file:File|null)=>{if(!file)return setSelectedPdf(null);if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))return toast.error("Solo se permiten archivos PDF.");if(file.size<=0)return toast.error("El archivo está vacío.");if(file.size>10*1024*1024)return toast.error("El PDF no puede superar los 10 MB.");setSelectedPdf(file);};

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
    <div className="space-y-6">
      <Section title="Datos del presupuesto" icon={<FileText className="h-4 w-4"/>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Empresa" required><Select value={form.company_id} onValueChange={v=>{const c=companies.find(x=>x.id===v);setForm(cur=>({...cur,company_id:v,project_id:"",iva_porcentaje:c?.iva_aprobado_at?(c.iva_aprobado_aplicado?"".concat(String(c.iva_aprobado_porcentaje??21)):"0"):c?.iva_recomendado_aplicado&&Number.isFinite(Number(c.iva_recomendado_porcentaje))?String(c.iva_recomendado_porcentaje):"21"}))}} disabled={saving||lockProject}><SelectTrigger className="h-10 border-gray-200"><SelectValue placeholder="Selecciona una empresa"/></SelectTrigger><SelectContent>{companies.map(c=><SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Proyecto" required><Select value={form.project_id} onValueChange={v=>update("project_id",v)} disabled={saving||!form.company_id||lockProject}><SelectTrigger className="h-10 border-gray-200"><SelectValue placeholder={form.company_id?"Selecciona un proyecto":"Selecciona primero una empresa"}/></SelectTrigger><SelectContent>{availableProjects.map(p=><SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="Número de presupuesto"><Input value={creationMode?"Se generará automáticamente":form.numero_presupuesto} disabled className="h-10 bg-gray-50 text-gray-500"/></Field>
          <Field label="Estado"><div className="flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">{form.estado}<span className="ml-auto text-xs text-gray-400">Respuesta del cliente</span></div></Field>
          {form.project_id&&<div className="sm:col-span-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3.5 py-3 text-xs text-gray-500"><FileText className="h-4 w-4 text-gray-400"/>Cliente vinculado al proyecto: <strong className="text-gray-700">{availableProjects.find(p=>p.id===form.project_id)?.client_id?"Cliente vinculado":"Sin cliente vinculado"}</strong></div>}
          <Field label="Título" required className="sm:col-span-2"><Input value={form.titulo} onChange={e=>update("titulo",e.target.value)} maxLength={300} disabled={saving} className="h-10"/></Field>
          {!workflowMode&&<Field label="Fecha de emisión"><Input type="date" value={form.fecha_emision} onChange={e=>update("fecha_emision",e.target.value)} disabled={saving} className="h-10"/></Field>}
          <Field label="Fecha de validez"><Input type="date" value={form.fecha_validez} onChange={e=>update("fecha_validez",e.target.value)} disabled={saving} className="h-10"/></Field>
          <Field label="Descripción detallada" className="sm:col-span-2"><Textarea value={form.descripcion_detallada} onChange={e=>update("descripcion_detallada",e.target.value)} rows={4} disabled={saving} placeholder="Describe el alcance y condiciones de la propuesta…"/></Field>
        </div>
      </Section>

      <Section title="Servicios incluidos" icon={<ReceiptText className="h-4 w-4"/>} action={<button type="button" onClick={addService} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"><Plus className="h-3.5 w-3.5"/>Añadir línea</button>}>
        <div className="space-y-3">{form.servicios_incluidos.map((s,i)=><div key={i} className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-[minmax(0,1fr)_100px_130px_auto]"><Field label="Concepto"><Input value={s.descripcion} onChange={e=>updateService(i,"descripcion",e.target.value)} disabled={saving}/></Field><Field label="Cantidad"><Input type="number" min="0" step="0.01" value={s.cantidad} onChange={e=>updateService(i,"cantidad",e.target.value)} disabled={saving}/></Field><Field label="Precio unitario"><Input type="number" min="0" step="0.01" value={s.precio} onChange={e=>updateService(i,"precio",e.target.value)} disabled={saving}/></Field><button type="button" onClick={()=>removeService(i)} disabled={saving} className="mt-auto inline-flex h-10 items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700"><Trash2 className="h-3.5 w-3.5"/></button></div>)}</div>
      </Section>

      <Section title="Fiscalidad" icon={<Calculator className="h-4 w-4"/>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Base imponible"><Input value={fiscal.subtotal.toFixed(2)} disabled className="h-10 bg-gray-50"/></Field>
          {form.company_id && workerNotes.trim() && (
  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 sm:col-span-2">
    <div className="flex items-start gap-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="text-sm font-semibold text-amber-900">
          Notas internas de la empresa
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-900/80">
          {workerNotes}
        </p>
      </div>
    </div>
  </div>
)}
          <Field label="IVA"><div className="space-y-2"><div className="relative"><Input type="number" min="0" max="100" step="0.01" value={form.iva_porcentaje} onChange={e=>update("iva_porcentaje",e.target.value)} disabled={saving} className="h-10 pr-8"/><span className="absolute right-3 top-2.5 text-xs text-gray-400">%</span></div>{form.company_id&&<FiscalHint company={companies.find(c=>c.id===form.company_id)}/>}</div></Field>
          <div className="rounded-lg border border-gray-200 p-4 sm:col-span-2"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={form.irpf_aplicado} onChange={e=>{const v=e.target.checked;update("irpf_aplicado",v);if(!v)update("irpf_porcentaje","0")}} disabled={saving} className="mt-1 h-4 w-4"/><span><span className="block text-sm font-semibold text-gray-800">Aplicar retención de IRPF</span><span className="mt-0.5 block text-xs text-gray-500">Se calcula sobre la base imponible y reduce el importe a pagar.</span></span></label>{form.irpf_aplicado&&<div className="mt-4 max-w-xs"><Field label="Porcentaje de IRPF"><Input type="number" min="0.01" max="100" step="0.01" value={form.irpf_porcentaje} onChange={e=>update("irpf_porcentaje",e.target.value)} disabled={saving}/></Field></div>}</div>
          <div className="rounded-lg bg-gray-50 p-4 sm:col-span-2 space-y-2 text-sm"><TotalRow label="Base imponible" value={money(fiscal.subtotal)}/><TotalRow label={`IVA (${fiscal.ivaRate.toFixed(2)}%)`} value={money(fiscal.ivaImporte)}/><TotalRow label="Total bruto" value={money(fiscal.total)} strong/>{form.irpf_aplicado&&<TotalRow label={`IRPF (${fiscal.irpfRate.toFixed(2)}%)`} value={`− ${money(fiscal.irpfImporte)}`}/>}<div className="border-t border-gray-200 pt-2"><TotalRow label="Importe a pagar" value={money(fiscal.importeAPagar)} strong emphasized/></div></div>
        </div>
      </Section>

      <Section title="Notas" icon={<FileText className="h-4 w-4" />}><Textarea value={form.notas} onChange={e=>update("notas",e.target.value)} rows={4} disabled={saving} placeholder="Notas internas o información adicional…"/></Section>

      {!hidePdf&&<Section title="Documento PDF" icon={<Upload className="h-4 w-4" />}><label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-5 py-8 text-center hover:bg-blue-50/30"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#1E3A8A]"><Upload className="h-4 w-4"/></div><p className="mt-3 text-sm font-semibold text-gray-800">{selectedPdf?selectedPdf.name:"Adjuntar presupuesto en PDF"}</p><p className="mt-1 text-xs text-gray-500">Solo PDF · máximo 10 MB</p><input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e=>handlePdf(e.target.files?.[0]||null)} disabled={saving}/></label>{selectedPdf&&<button type="button" onClick={()=>setSelectedPdf(null)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600"><X className="h-3.5 w-3.5"/>Quitar archivo</button>}</Section>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={onCancel} disabled={saving} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">Salir</button><button onClick={onSave} disabled={saving} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">{saving?<Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>:<Check className="mr-2 inline h-4 w-4"/>}{saveLabel||(creationMode?"Crear presupuesto":"Guardar cambios")}</button>{onPublish&&<button onClick={onPublish} disabled={saving} className="rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white">{saving?<Loader2 className="mr-2 inline h-4 w-4 animate-spin"/>:<Check className="mr-2 inline h-4 w-4"/>}{publishLabel}</button>}</div>
    </div>
    <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start"><div className="border border-gray-200 bg-white"><div className="border-b border-gray-100 p-4"><p className="text-sm font-semibold">Vista previa del importe</p><p className="mt-1 text-xs leading-5 text-gray-500">IVA e IRPF se calculan sobre la base; la BD recalcula los importes definitivos.</p></div><div className="space-y-3 p-4"><TotalRow label="Base imponible" value={money(fiscal.subtotal)}/><TotalRow label={`IVA (${fiscal.ivaRate.toFixed(2)}%)`} value={money(fiscal.ivaImporte)}/><TotalRow label="Total bruto" value={money(fiscal.total)} strong/>{form.irpf_aplicado&&<TotalRow label={`IRPF (${fiscal.irpfRate.toFixed(2)}%)`} value={`− ${money(fiscal.irpfImporte)}`}/>}<div className="border-t border-gray-200 pt-3"><TotalRow label="A pagar" value={money(fiscal.importeAPagar)} strong emphasized/></div></div></div><div className="border border-blue-100 bg-blue-50/60"><div className="flex gap-3 p-4"><ShieldCheck className="h-5 w-5 text-[#1E3A8A]"/><div><p className="text-sm font-semibold text-[#1E3A8A]">Reglas del presupuesto</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-gray-600"><li>• Número generado por backend.</li><li>• Empresa, proyecto y cliente se derivan en BD.</li><li>• Importes se recalculan en PostgreSQL.</li><li>• El PDF se guarda en Storage privado.</li><li>• La aceptación contractual corresponde al cliente.</li></ul></div></div></div></aside>
  </div>;
}

function FiscalHint({company}:{company?:Company}) {
  if(!company)return null;
  const approved=Boolean(company.iva_aprobado_at), recommended=company.iva_recomendado_aplicado===true&&Number.isFinite(Number(company.iva_recomendado_porcentaje));
  return <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5"><Info className="mt-0.5 h-4 w-4 text-[#1E3A8A]"/><p className="text-xs leading-5 text-gray-600">{approved?<><strong className="text-[#1E3A8A]">IVA aprobado: </strong>{company.iva_aprobado_aplicado?`${Number(company.iva_aprobado_porcentaje)} %`:"No aplicado"}. Puedes modificarlo para esta operación.</>:recommended?<><strong className="text-[#1E3A8A]">IVA recomendado: </strong>{Number(company.iva_recomendado_porcentaje)} %. No hay tratamiento aprobado por solicitud.</>:<>No hay IVA aprobado ni recomendado. Se usa 21 % como referencia inicial.</>}</p></div>;
}
