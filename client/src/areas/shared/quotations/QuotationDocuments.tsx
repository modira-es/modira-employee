
import { useRef, useState } from "react";
import { Download, ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { Quotation } from "./quotationTypes";

export async function uploadQuotationPdf(quotation:Quotation,file:File) {
  if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))throw new Error("Solo se permiten archivos PDF.");
  if(file.size<=0)throw new Error("El archivo está vacío.");
  if(file.size>10*1024*1024)throw new Error("El PDF no puede superar los 10 MB.");
  const path=`${quotation.company_id}/${quotation.numero_presupuesto}.pdf`;
  const {error:up}=await supabase.storage.from("quotations").upload(path,file,{upsert:true,contentType:"application/pdf"});
  if(up)throw up;
  const {error:attach}=await supabase.rpc("attach_quotation_document",{p_quotation_id:quotation.id,p_document_path:path});
  if(attach)throw attach;
  const {data:hash,error:hashError}=await supabase.functions.invoke("set-quotation-document-hash",{body:{quotationId:quotation.id}});
  if(hashError)throw hashError;
  if(!hash?.success||!hash?.documentSha256)throw new Error("No se pudo registrar el hash de seguridad del PDF.");
}

export default function QuotationDocuments({quotation,canManage,canRead,onChanged}:{quotation:Quotation;canManage:boolean;canRead:boolean;onChanged?:()=>void}) {
  const input=useRef<HTMLInputElement|null>(null);
  const [busy,setBusy]=useState(false);

  const upload=async(file:File)=>{
    if(!canManage)return;
    if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))return toast.error("Solo se permiten archivos PDF.");
    if(file.size<=0)return toast.error("El archivo está vacío.");
    if(file.size>10*1024*1024)return toast.error("El PDF no puede superar los 10 MB.");
    try{
      setBusy(true);
      await uploadQuotationPdf(quotation,file);
      toast.success("PDF del presupuesto sustituido correctamente.");onChanged?.();
    }catch(e:any){console.error("[QuotationDocuments] upload",e);toast.error(e?.message||"No se pudo adjuntar el PDF.");}
    finally{setBusy(false);if(input.current)input.current.value="";}
  };

  const open=async(download=false)=>{
    if(!canRead||!quotation.document_path)return;
    try{
      setBusy(true);
      const {data,error}=await supabase.storage.from("quotations").createSignedUrl(quotation.document_path,300,download?{download:`${quotation.numero_presupuesto}.pdf`}:undefined);
      if(error)throw error;if(!data?.signedUrl)throw new Error("No se pudo generar el enlace seguro del PDF.");
      if(download){const a=document.createElement("a");a.href=data.signedUrl;a.download=`${quotation.numero_presupuesto}.pdf`;a.target="_blank";a.rel="noopener noreferrer";document.body.appendChild(a);a.click();a.remove();}
      else window.open(data.signedUrl,"_blank","noopener,noreferrer");
    }catch(e:any){toast.error(e?.message||"No se pudo abrir el PDF.");}
    finally{setBusy(false);}
  };

  return <section className="border-b border-gray-200 pb-6">
    <div className="flex items-center justify-between border-b border-gray-100 pb-3"><div><h2 className="text-sm font-semibold text-gray-900">Documento del presupuesto</h2><p className="mt-1 text-xs text-gray-500">PDF privado con acceso mediante URL firmada.</p></div></div>
    <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/>
    <div className="pt-5">{quotation.document_path?<div className="flex flex-col gap-4 rounded-lg border border-green-100 bg-green-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-green-700"><FileText className="h-5 w-5"/></div><div><p className="font-semibold text-gray-800">{quotation.numero_presupuesto}.pdf</p><p className="text-xs text-green-700">{quotation.document_sha256?"PDF preparado para trazabilidad":"PDF asociado"}</p></div></div>{canRead&&<div className="flex gap-2"><button onClick={()=>open(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<ExternalLink className="h-4 w-4"/>}Ver PDF</button><button onClick={()=>open(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"><Download className="h-4 w-4"/>Descargar</button></div>}</div>:<div className="rounded-lg border border-dashed border-gray-300 p-8 text-center"><FileText className="mx-auto h-6 w-6 text-gray-400"/><p className="mt-2 text-sm font-semibold text-gray-700">Sin PDF adjunto</p><p className="mt-1 text-xs text-gray-500">{canManage?"Puedes adjuntarlo desde la gestión del presupuesto.":"Este presupuesto no tiene documento disponible."}</p>{canManage&&<button onClick={()=>input.current?.click()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-xs font-semibold text-white"><Upload className="h-4 w-4"/>Adjuntar PDF</button>}</div>}</div>
  </section>;
}
