import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Activity, AlertCircle, ArrowLeft, Building2, CalendarDays, Check, CheckCircle2,
  ChevronRight, CircleDollarSign, CircleDot, Clock3, ExternalLink, FileText,
  FolderKanban, Loader2, MessageSquare, Paperclip, Pencil, Plus, RefreshCw,
  Send, Ticket, Trash2, Upload, User, X
} from "lucide-react";
import { toast } from "sonner";

export type ProjectStatus = "Pendiente" | "Activo" | "Pausado" | "Entregado" | "Completado";
export type MilestoneStatus = "pendiente" | "en_curso" | "completado";

export interface Project {
  id: string; nombre: string; descripcion: string | null; estado: ProjectStatus;
  fecha_inicio: string; fecha_fin: string | null; company_id: string | null;
  client_id: string | null; user_id: string | null; created_at: string;
  updated_at?: string | null; cliente_nombre: string; cliente_email: string; empresa_nombre: string;
}
export interface ProjectProgress {
  project_id: string; total_milestones: number; completed_milestones: number; progress_percentage: number;
}
export interface ProjectMilestone {
  id: string; project_id: string; nombre: string; descripcion: string | null;
  fecha_prevista: string; orden: number; estado: MilestoneStatus;
  completed_at: string | null; created_by: string | null; created_at: string; updated_at: string;
}
export interface ProjectDocument {
  id: string; project_id: string; file_name: string; storage_path: string;
  mime_type: string; file_size: number; uploaded_by: string | null; created_at: string; updated_at: string;
}
export interface ProjectUpdate {
  id: string; project_id: string; titulo: string; contenido: string;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface ProjectChangeRequest {
  id: string; project_id: string; user_id: string | null; company_id: string | null;
  client_id: string | null; description: string; status: "pending" | "in_review" | "accepted" | "rejected" | "completed";
  requested_at: string; created_at: string; reviewed_by: string | null; reviewed_at: string | null; review_notes?: string | null;
}
export interface RelatedBilling {
  id: string; numero_factura: string | null; estado: string | null; monto: number | null;
  importe_a_pagar: number | null; fecha_vencimiento: string | null;
}
export interface RelatedQuotation {
  id: string; numero_presupuesto: string | null; titulo: string | null; estado: string | null; precio_total: number | null;
}
export interface RelatedTicket {
  id: string; asunto: string; estado: string; prioridad: string; created_at: string;
}

async function hasPermission(code: string) {
  const { data, error } = await supabase.rpc("current_worker_has_permission", { p_permission_code: code });
  if (error) return false;
  return Boolean(data);
}

interface Props { projectId:string; documents:ProjectDocument[]; canManage:boolean; onRefresh:()=>Promise<void>; }
export default function ProjectDocuments({projectId,documents,canManage,onRefresh}:Props){
 const input=useRef<HTMLInputElement|null>(null); const [busy,setBusy]=useState(false);
 const upload=async(file:File)=>{if(file.type!=="application/pdf")return toast.error("Solo se permiten documentos PDF.");if(!file.size)return toast.error("El documento está vacío.");setBusy(true);const id=crypto.randomUUID();const path=`${projectId}/${id}.pdf`;try{const{error:u}=await supabase.storage.from("project-documents").upload(path,file,{contentType:"application/pdf",upsert:false});if(u)throw u;const{error:a}=await supabase.rpc("attach_project_document",{p_project_id:projectId,p_document_id:id,p_file_name:file.name,p_file_size:file.size});if(a){await supabase.storage.from("project-documents").remove([path]);throw a;}await onRefresh();toast.success("Documento adjuntado.");}catch(e:any){toast.error(e?.message||"No se pudo adjuntar.");}finally{setBusy(false);if(input.current)input.current.value=""}};
 const open=async(d:ProjectDocument)=>{try{const{data,error}=await supabase.storage.from("project-documents").createSignedUrl(d.storage_path,600);if(error||!data?.signedUrl)throw error||new Error("No se pudo generar el acceso.");window.open(data.signedUrl,"_blank","noopener,noreferrer")}catch(e:any){toast.error(e?.message||"No se pudo abrir el documento.")}};
 const remove=async(d:ProjectDocument)=>{if(!window.confirm(`¿Eliminar "${d.file_name}"?`))return;setBusy(true);try{const{s}=await supabase.storage.from("project-documents").remove([d.storage_path]);void s;const{error}=await supabase.rpc("detach_project_document",{p_document_id:d.id});if(error)throw error;await onRefresh();toast.success("Documento eliminado.");}catch(e:any){toast.error(e?.message||"No se pudo eliminar.");}finally{setBusy(false)}};
 return <div className="space-y-5"><div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-semibold text-[#172033]">Documentos</h3><p className="text-sm text-slate-500">Documentación PDF asociada al proyecto.</p></div>{canManage&&<><input ref={input} hidden type="file" accept="application/pdf" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f)}}/><Button disabled={busy} onClick={()=>input.current?.click()} className="rounded-xl bg-[#1E3A8A]"><Upload className="mr-2 h-4 w-4"/>Adjuntar PDF</Button></>}</div>
 {!documents.length&&<Card className="rounded-2xl border-dashed p-10 text-center text-slate-500">No hay documentos adjuntos.</Card>}
 <div className="grid gap-3 md:grid-cols-2">{documents.map(d=><Card key={d.id} className="rounded-2xl border-slate-200 p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600"><FileText className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="truncate font-medium text-[#172033]">{d.file_name}</p><p className="text-xs text-slate-400">{(d.file_size/1024).toFixed(0)} KB · {new Date(d.created_at).toLocaleDateString("es-ES")}</p></div><Button size="icon" variant="ghost" onClick={()=>open(d)} title="Abrir"><ExternalLink className="h-4 w-4"/></Button>{canManage&&<Button size="icon" variant="ghost" className="text-red-600" onClick={()=>remove(d)} title="Eliminar"><Trash2 className="h-4 w-4"/></Button>}</div></Card>)}</div></div>;
}
