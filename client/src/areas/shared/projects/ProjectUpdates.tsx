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

interface Props { projectId:string; updates:ProjectUpdate[]; canManage:boolean; onRefresh:()=>Promise<void>; }
export default function ProjectUpdates({projectId,updates,canManage,onRefresh}:Props){
 const [form,setForm]=useState({titulo:"",contenido:""}); const [editing,setEditing]=useState<string|null>(null);
 const [edit,setEdit]=useState({titulo:"",contenido:""}); const [busy,setBusy]=useState(false);
 const publish=async()=>{if(!form.titulo.trim()||!form.contenido.trim())return toast.error("Completa título y contenido.");setBusy(true);try{const{error}=await supabase.rpc("create_project_update",{p_project_id:projectId,p_titulo:form.titulo.trim(),p_contenido:form.contenido.trim()});if(error)throw error;setForm({titulo:"",contenido:""});await onRefresh();toast.success("Actualización publicada. El sistema notificará al cliente.");}catch(e:any){toast.error(e?.message||"No se pudo publicar.");}finally{setBusy(false);}};
 const save=async()=>{if(!editing)return;setBusy(true);try{const{error}=await supabase.rpc("update_project_update",{p_update_id:editing,p_titulo:edit.titulo.trim(),p_contenido:edit.contenido.trim()});if(error)throw error;setEditing(null);await onRefresh();toast.success("Actualización modificada.");}catch(e:any){toast.error(e?.message||"No se pudo modificar.");}finally{setBusy(false);}};
 const remove=async(u:ProjectUpdate)=>{if(!window.confirm(`¿Eliminar "${u.titulo}"?`))return;setBusy(true);try{const{error}=await supabase.rpc("delete_project_update",{p_update_id:u.id});if(error)throw error;await onRefresh();toast.success("Actualización eliminada.");}catch(e:any){toast.error(e?.message||"No se pudo eliminar.");}finally{setBusy(false);}};
 return <div className="space-y-5"><div><h3 className="text-lg font-semibold text-[#172033]">Actualizaciones</h3><p className="text-sm text-slate-500">Comunicaciones y novedades del proyecto.</p></div>
 {canManage&&<Card className="rounded-2xl border-slate-200 p-5"><div className="space-y-4"><Input placeholder="Título de la actualización" value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})}/><Textarea className="min-h-[120px]" placeholder="Escribe la actualización..." value={form.contenido} onChange={e=>setForm({...form,contenido:e.target.value})}/><div className="flex justify-end"><Button disabled={busy} onClick={publish} className="rounded-xl bg-[#1E3A8A]"><Send className="mr-2 h-4 w-4"/>Publicar</Button></div></div></Card>}
 {!updates.length&&<Card className="rounded-2xl border-dashed p-10 text-center text-slate-500">No hay actualizaciones.</Card>}
 {updates.map(u=><Card key={u.id} className="rounded-2xl border-slate-200 p-5"><div className="flex gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#1E3A8A]"><MessageSquare className="h-5 w-5"/></div><div className="min-w-0 flex-1">
 {editing===u.id&&canManage?<div className="space-y-3"><Input value={edit.titulo} onChange={e=>setEdit({...edit,titulo:e.target.value})}/><Textarea value={edit.contenido} onChange={e=>setEdit({...edit,contenido:e.target.value})}/><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setEditing(null)}>Cancelar</Button><Button disabled={busy} onClick={save} className="bg-[#1E3A8A]">Guardar</Button></div></div>:<><div className="flex flex-wrap justify-between gap-2"><div><h4 className="font-semibold text-[#172033]">{u.titulo}</h4><p className="mt-1 text-xs text-slate-400">{new Date(u.created_at).toLocaleString("es-ES")}</p></div>{canManage&&<div className="flex gap-1"><Button size="icon" variant="ghost" onClick={()=>{setEditing(u.id);setEdit({titulo:u.titulo,contenido:u.contenido})}}><Pencil className="h-4 w-4"/></Button><Button size="icon" variant="ghost" className="text-red-600" onClick={()=>remove(u)}><Trash2 className="h-4 w-4"/></Button></div>}</div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{u.contenido}</p></>}</div></div></Card>)}</div>;
}
