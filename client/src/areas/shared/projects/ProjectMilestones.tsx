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

interface Props {
  projectId: string;
  milestones: ProjectMilestone[];
  canManage: boolean;
  onRefresh: () => Promise<void>;
}
const statusLabel: Record<MilestoneStatus,string> = { pendiente:"Pendiente", en_curso:"En curso", completado:"Completado" };

export default function ProjectMilestones({ projectId, milestones, canManage, onRefresh }: Props) {
  const [creating,setCreating]=useState(false);
  const [busy,setBusy]=useState<string|null>(null);
  const [editing,setEditing]=useState<string|null>(null);
  const [form,setForm]=useState({nombre:"",descripcion:"",fecha_prevista:""});
  const [editForm,setEditForm]=useState({nombre:"",descripcion:"",fecha_prevista:"",orden:"",estado:"pendiente" as MilestoneStatus});

  const create = async () => {
    if (!form.nombre.trim() || !form.fecha_prevista) return toast.error("Completa nombre y fecha prevista.");
    setBusy("create");
    try {
      const {error}=await supabase.rpc("create_project_milestone",{
        p_project_id:projectId,p_nombre:form.nombre.trim(),p_descripcion:form.descripcion.trim()||null,
        p_fecha_prevista:form.fecha_prevista
      });
      if(error) throw error;
      setForm({nombre:"",descripcion:"",fecha_prevista:""}); setCreating(false); await onRefresh(); toast.success("Hito creado correctamente.");
    } catch(e:any){ toast.error(e?.message||"No se pudo crear el hito."); }
    finally{setBusy(null);}
  };
  const startEdit=(m:ProjectMilestone)=>{setEditing(m.id);setEditForm({nombre:m.nombre,descripcion:m.descripcion||"",fecha_prevista:m.fecha_prevista.slice(0,16),orden:String(m.orden),estado:m.estado});};
  const save=async()=>{
    if(!editing) return;
    setBusy(editing);
    try{
      const {error}=await supabase.rpc("update_project_milestone",{p_milestone_id:editing,p_nombre:editForm.nombre.trim(),p_descripcion:editForm.descripcion.trim()||null,p_fecha_prevista:editForm.fecha_prevista,p_orden:Number(editForm.orden)||0,p_estado:editForm.estado});
      if(error) throw error; setEditing(null); await onRefresh(); toast.success("Hito actualizado.");
    }catch(e:any){toast.error(e?.message||"No se pudo actualizar el hito.");}finally{setBusy(null);}
  };
  const setStatus=async(id:string,estado:MilestoneStatus)=>{
    setBusy(id); try{const {error}=await supabase.rpc("set_project_milestone_status",{p_milestone_id:id,p_estado:estado});if(error)throw error;await onRefresh();toast.success("Estado del hito actualizado.");}catch(e:any){toast.error(e?.message||"No se pudo actualizar.");}finally{setBusy(null);}
  };
  const remove=async(m:ProjectMilestone)=>{
    if(!window.confirm(`¿Seguro que quieres eliminar el hito "${m.nombre}"?`)) return;
    setBusy(m.id); try{const {error}=await supabase.rpc("delete_project_milestone",{p_milestone_id:m.id});if(error)throw error;await onRefresh();toast.success("Hito eliminado.");}catch(e:any){toast.error(e?.message||"No se pudo eliminar.");}finally{setBusy(null);}
  };

  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3">
      <div><h3 className="text-lg font-semibold text-[#172033]">Hitos del proyecto</h3><p className="text-sm text-slate-500">Planificación y seguimiento del avance.</p></div>
      {canManage && <Button onClick={()=>setCreating(v=>!v)} className="rounded-xl bg-[#1E3A8A]"><Plus className="mr-2 h-4 w-4"/>Nuevo hito</Button>}
    </div>
    {creating && canManage && <Card className="rounded-2xl border-slate-200 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Input placeholder="Nombre del hito" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/>
        <Input type="datetime-local" value={form.fecha_prevista} onChange={e=>setForm({...form,fecha_prevista:e.target.value})}/>
        <Textarea className="md:col-span-2 min-h-[100px]" placeholder="Descripción" value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})}/>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="outline" onClick={()=>setCreating(false)}>Cancelar</Button><Button disabled={busy==="create"} onClick={create} className="rounded-xl bg-[#1E3A8A]">{busy==="create"?<Loader2 className="h-4 w-4 animate-spin"/>:"Crear hito"}</Button></div>
    </Card>}
    {!milestones.length && <Card className="rounded-2xl border-dashed p-10 text-center text-slate-500">No hay hitos registrados.</Card>}
    <div className="space-y-3">
      {milestones.map(m=><Card key={m.id} className="rounded-2xl border-slate-200 p-5">
        {editing===m.id && canManage ? <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2"><Input value={editForm.nombre} onChange={e=>setEditForm({...editForm,nombre:e.target.value})}/><Input type="datetime-local" value={editForm.fecha_prevista} onChange={e=>setEditForm({...editForm,fecha_prevista:e.target.value})}/>
          <Input value={editForm.orden} type="number" onChange={e=>setEditForm({...editForm,orden:e.target.value})}/>
          <Select value={editForm.estado} onValueChange={v=>setEditForm({...editForm,estado:v as MilestoneStatus})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pendiente">Pendiente</SelectItem><SelectItem value="en_curso">En curso</SelectItem><SelectItem value="completado">Completado</SelectItem></SelectContent></Select>
          <Textarea className="md:col-span-2" value={editForm.descripcion} onChange={e=>setEditForm({...editForm,descripcion:e.target.value})}/></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setEditing(null)}>Cancelar</Button><Button onClick={save} disabled={busy===m.id} className="rounded-xl bg-[#1E3A8A]">Guardar</Button></div>
        </div> : <div className="flex gap-4">
          <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#1E3A8A]"><CircleDot className="h-5 w-5"/></div>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold text-[#172033]">{m.orden}. {m.nombre}</h4><p className="mt-1 text-sm text-slate-500"><CalendarDays className="mr-1 inline h-3.5 w-3.5"/>{new Date(m.fecha_prevista).toLocaleString("es-ES")}</p></div><Badge className={m.estado==="completado"?"bg-emerald-100 text-emerald-700":m.estado==="en_curso"?"bg-blue-100 text-blue-700":"bg-slate-100 text-slate-700"}>{statusLabel[m.estado]}</Badge></div>
          {m.descripcion&&<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{m.descripcion}</p>}
          {canManage&&<div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>startEdit(m)}><Pencil className="mr-1.5 h-3.5 w-3.5"/>Editar</Button><Select value={m.estado} onValueChange={v=>setStatus(m.id,v as MilestoneStatus)}><SelectTrigger className="h-9 w-[145px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pendiente">Pendiente</SelectItem><SelectItem value="en_curso">En curso</SelectItem><SelectItem value="completado">Completado</SelectItem></SelectContent></Select><Button size="sm" variant="outline" className="text-red-600" onClick={()=>remove(m)}><Trash2 className="mr-1.5 h-3.5 w-3.5"/>Eliminar</Button></div>}</div>
        </div>}
      </Card>)}
    </div>
  </div>;
}
