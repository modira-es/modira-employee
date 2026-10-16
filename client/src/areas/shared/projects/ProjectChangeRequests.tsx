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

interface Props { requests:ProjectChangeRequest[]; canManage:boolean; reviewNotes:Record<string,string>; onNotes:(id:string,v:string)=>void; onResolve:(r:ProjectChangeRequest,a:"in_review"|"accepted"|"rejected"|"completed")=>Promise<void>; }
const labels:Record<ProjectChangeRequest["status"],string>={pending:"Pendiente",in_review:"En revisión",accepted:"Aceptada",rejected:"Rechazada",completed:"Completada"};
export default function ProjectChangeRequests({requests,canManage,reviewNotes,onNotes,onResolve}:Props){
 return <div className="space-y-4">{!requests.length?<Card className="rounded-2xl border-dashed p-8 text-center text-slate-500">No hay solicitudes de cambio.</Card>:requests.map(r=><Card key={r.id} className="rounded-2xl border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-[#172033]">Solicitud de cambio</h4><p className="mt-1 text-xs text-slate-400">{new Date(r.requested_at||r.created_at).toLocaleString("es-ES")}</p></div><Badge>{labels[r.status]}</Badge></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{r.description}</p>{r.review_notes&&<div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><span className="font-medium">Notas internas:</span> {r.review_notes}</div>}{canManage&&r.status!=="completed"&&r.status!=="rejected"&&<div className="mt-5 space-y-3 border-t pt-4"><Textarea placeholder="Notas de revisión internas" value={reviewNotes[r.id]||""} onChange={e=>onNotes(r.id,e.target.value)}/><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>onResolve(r,"in_review")}>En revisión</Button><Button size="sm" onClick={()=>onResolve(r,"accepted")} className="bg-emerald-600">Aceptar</Button><Button size="sm" variant="outline" className="text-red-600" onClick={()=>onResolve(r,"rejected")}>Rechazar</Button>{r.status==="accepted"&&<Button size="sm" onClick={()=>onResolve(r,"completed")} className="bg-[#1E3A8A]">Completar</Button>}</div></div>}</Card>)}</div>;
}
