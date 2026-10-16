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

interface Props { projectId:string; quotations:RelatedQuotation[]; billing:RelatedBilling[]; tickets:RelatedTicket[]; onNavigate?:(path:string)=>void; }
const money=(v:number|null|undefined)=>typeof v==="number"?new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR"}).format(v):"—";
export default function ProjectRelations({projectId,quotations,billing,tickets,onNavigate}:Props){
 return <div className="space-y-6"><div><h3 className="text-lg font-semibold text-[#172033]">Relaciones</h3><p className="text-sm text-slate-500">Presupuestos, facturas y soporte vinculados al proyecto.</p></div>
 <Card className="rounded-2xl border-slate-200 p-5"><div className="mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-[#1E3A8A]"/><h4 className="font-semibold">Presupuestos</h4></div>{!quotations.length?<p className="text-sm text-slate-500">No hay presupuestos relacionados.</p>:<div className="space-y-2">{quotations.map(q=><button key={q.id} onClick={()=>onNavigate?.("/employee/quotations")} className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:bg-slate-50"><div><p className="font-medium">{q.numero_presupuesto||"Presupuesto"}</p><p className="text-sm text-slate-500">{q.titulo||"Sin título"} · {q.estado||"—"}</p></div><span className="font-semibold">{money(q.precio_total)}</span></button>)}</div>}</Card>
 <Card className="rounded-2xl border-slate-200 p-5"><div className="mb-4 flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-[#1E3A8A]"/><h4 className="font-semibold">Facturación</h4></div>{!billing.length?<p className="text-sm text-slate-500">No hay facturas relacionadas.</p>:<div className="space-y-2">{billing.map(b=><button key={b.id} onClick={()=>onNavigate?.("/employee/billing")} className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:bg-slate-50"><div><p className="font-medium">{b.numero_factura||"Factura"}</p><p className="text-sm text-slate-500">{b.estado||"—"} · vencimiento {b.fecha_vencimiento?new Date(b.fecha_vencimiento).toLocaleDateString("es-ES"):"—"}</p></div><span className="font-semibold">{money(b.importe_a_pagar??b.monto)}</span></button>)}</div>}</Card>
 <Card className="rounded-2xl border-slate-200 p-5"><div className="mb-4 flex items-center gap-2"><Ticket className="h-5 w-5 text-[#1E3A8A]"/><h4 className="font-semibold">Soporte</h4></div>{!tickets.length?<p className="text-sm text-slate-500">No hay tickets relacionados.</p>:<div className="space-y-2">{tickets.map(t=><button key={t.id} onClick={()=>onNavigate?.("/employee/support")} className="flex w-full items-center justify-between rounded-xl border p-3 text-left hover:bg-slate-50"><div><p className="font-medium">{t.asunto}</p><p className="text-sm text-slate-500">{t.estado} · {t.prioridad}</p></div><span className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString("es-ES")}</span></button>)}</div>}</Card>
 </div>;
}
