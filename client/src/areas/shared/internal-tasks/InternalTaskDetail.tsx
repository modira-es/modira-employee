import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, CheckCircle2, Edit3, History, MessageSquare, Play, RefreshCw, Send, ShieldCheck, Trash2, UserRound, X, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { INTERNAL_TASK_PERMISSIONS, InternalTask, InternalTaskPriority, InternalTaskStatus, InternalTaskUpdate, InternalTaskVisibility, PRIORITY_OPTIONS, STATUS_OPTIONS, formatDate, statusLabel } from "./internalTaskTypes";
import { ErrorBox, LoadingState, PriorityBadge, ProgressBar, Section, StatusBadge, SummaryCard } from "./InternalTaskUI";

export default function InternalTaskDetail({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const { worker, hasPermission } = useAuth() as any;
  const has = (p: string) => hasPermission(p);
  const canUpdate = has(INTERNAL_TASK_PERMISSIONS.update);
  const canReview = has(INTERNAL_TASK_PERMISSIONS.review);
  const canDelete = has(INTERNAL_TASK_PERMISSIONS.delete);
  const canVisibility = has(INTERNAL_TASK_PERMISSIONS.manageVisibility);

  const [task, setTask] = useState<InternalTask | null>(null);
  const [history, setHistory] = useState<InternalTaskUpdate[]>([]);
  const [visibility, setVisibility] = useState<InternalTaskVisibility>({ workers: [], roles: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [progress, setProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState(false);
  const [directionStatus, setDirectionStatus] = useState<InternalTaskStatus>("to_do");
  const [directionProgress, setDirectionProgress] = useState(0);
  const [visibilityWorkerIds, setVisibilityWorkerIds] = useState("");
  const [visibilityRoleIds, setVisibilityRoleIds] = useState("");
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "normal" as InternalTaskPriority, due_at: "", assigned_to_worker_id: "" });

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true); else setLoading(true);
      setError(null);
      const { data, error: e } = await supabase.rpc("get_internal_task", { p_task_id: taskId });
      if (e) throw e;
      const current = data as InternalTask;
      setTask(current); setProgress(current.progress); setDirectionStatus(current.status); setDirectionProgress(current.progress); setEditForm({ title: current.title, description: current.description || "", priority: current.priority, due_at: current.due_at ? new Date(current.due_at).toISOString().slice(0,16) : "", assigned_to_worker_id: current.assigned_to_worker_id || "" });
      const [h, v] = await Promise.all([
        supabase.rpc("get_internal_task_history", { p_task_id: taskId, p_limit: 200, p_offset: 0 }),
        canVisibility ? supabase.rpc("get_internal_task_visibility", { p_task_id: taskId }) : Promise.resolve({ data: null, error: null } as any),
      ]);
      if (h.error) throw h.error;
      setHistory((h.data || []) as InternalTaskUpdate[]);
      if (!v.error && v.data) setVisibility(v.data as InternalTaskVisibility);
    } catch (err: any) { setError(err?.message || "No se pudo cargar la tarea."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [taskId, canVisibility]);

  useEffect(() => { void load(); }, [load]);

  const assignedToCurrent = !!(
    task?.assigned_to_worker_id &&
    worker?.id &&
    task.assigned_to_worker_id === worker.id
  );

  // Editar los datos de una tarea no debe mostrarse a cualquier trabajador
  // que simplemente tenga acceso de lectura a la tarea.
  //
  // - Dirección puede editar/controlar cualquier tarea.
  // - Un trabajador no-Dirección solo puede editar una tarea que tenga
  //   asignada a sí mismo.
  // El backend/RPC sigue siendo la autoridad final.
  const canEditMetadata =
    canReview || (assignedToCurrent && canUpdate);

  const invokeTask = async (fn: string, args: Record<string, any>) => {
    setSaving(true); setError(null);
    try { const { data, error: e } = await supabase.rpc(fn, args); if (e) throw e; if (data && typeof data === "object" && "id" in data) setTask(data as InternalTask); await load(true); }
    catch (err: any) { setError(err?.message || "No se pudo completar la operación."); }
    finally { setSaving(false); }
  };

  const updateProgress = async () => {
    if (!task) return;
    await invokeTask("update_internal_task_progress", { p_task_id: task.id, p_progress: progress, p_comment: null });
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setSaving(true); setError(null);
    try { const { error: e } = await supabase.rpc("add_internal_task_comment", { p_task_id: taskId, p_comment: comment.trim() }); if (e) throw e; setComment(""); await load(true); }
    catch (err: any) { setError(err?.message || "No se pudo añadir el comentario."); } finally { setSaving(false); }
  };

  const saveMetadata = async () => {
    if (!task || !canEditMetadata) return;
    await invokeTask("update_internal_task", { p_task_id: task.id, p_changes: { title: editForm.title, description: editForm.description, priority: editForm.priority, due_at: editForm.due_at ? new Date(editForm.due_at).toISOString() : null, ...(has(INTERNAL_TASK_PERMISSIONS.assign) ? { assigned_to_worker_id: editForm.assigned_to_worker_id || null } : {}) }, p_comment: null });
    setEdit(false);
  };

  const filteredHistory = useMemo(() => history, [history]);
  if (loading) return <LoadingState text="Cargando tarea..." />;
  if (!task) return <div className="mx-auto max-w-4xl p-6"><ErrorBox message={error || "Tarea no encontrada."}/></div>;

  return <div className="min-h-full bg-[#F8FAFC] text-slate-900"><div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
    <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4"/>Volver a tareas</button>
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={task.status}/><PriorityBadge priority={task.priority}/></div><h1 className="mt-2 text-3xl font-bold tracking-tight">{task.title}</h1><p className="mt-1 text-sm text-slate-500">#{task.id}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void load(true)} disabled={refreshing}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar</Button>{canEditMetadata && <Button variant="outline" onClick={() => setEdit(true)}><Edit3 className="mr-2 h-4 w-4"/>Editar</Button>}{canDelete && task.status !== "cancelled" && <Button variant="outline" className="text-red-700" onClick={async()=>{const reason=window.prompt("Motivo de la anulación"); if(reason?.trim()) await invokeTask("delete_internal_task",{p_task_id:task.id,p_reason:reason.trim()});}}><Trash2 className="mr-2 h-4 w-4"/>Anular</Button>}</div></div>
    {error ? <ErrorBox message={error}/> : null}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><SummaryCard icon={<CheckCircle2 className="h-4 w-4"/>} label="Estado" value={statusLabel(task.status)}/><SummaryCard icon={<ShieldCheck className="h-4 w-4"/>} label="Progreso" value={`${task.progress}%`}/><SummaryCard icon={<CalendarDays className="h-4 w-4"/>} label="Vencimiento" value={task.due_at ? formatDate(task.due_at) : "Sin fecha"}/><SummaryCard icon={<UserRound className="h-4 w-4"/>} label="Responsable" value={task.assigned_to_worker_id ? task.assigned_to_worker_id.slice(0,8) : "Sin asignar"}/><SummaryCard icon={<History className="h-4 w-4"/>} label="Actualizado" value={formatDate(task.updated_at)}/></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Section title="Información" icon={<ClipboardIcon/>}>{edit && canEditMetadata ? <div className="space-y-4"><Input value={editForm.title} onChange={e=>setEditForm({...editForm,title:e.target.value})}/><Textarea value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})}/><div className="grid gap-3 sm:grid-cols-2"><select value={editForm.priority} onChange={e=>setEditForm({...editForm,priority:e.target.value as InternalTaskPriority})} className="h-10 rounded-md border border-slate-200 px-3 text-sm">{PRIORITY_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><Input type="datetime-local" value={editForm.due_at} onChange={e=>setEditForm({...editForm,due_at:e.target.value})}/></div>{has(INTERNAL_TASK_PERMISSIONS.assign)?<Input placeholder="ID trabajador responsable" value={editForm.assigned_to_worker_id} onChange={e=>setEditForm({...editForm,assigned_to_worker_id:e.target.value})}/>:null}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setEdit(false)}>Cancelar</Button><Button onClick={()=>void saveMetadata()} disabled={saving}>Guardar</Button></div></div>:<><p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{task.description || "Sin descripción."}</p><div className="mt-5"><div className="mb-2 flex justify-between text-xs text-slate-500"><span>Progreso</span><span>{task.progress}%</span></div><ProgressBar value={task.progress}/></div></>}</Section>
        {assignedToCurrent && canUpdate && task.status === "to_do" ? <Section title="Trabajo" icon={<Play className="h-4 w-4"/>}><Button onClick={()=>void invokeTask("start_internal_task",{p_task_id:task.id})} disabled={saving}><Play className="mr-2 h-4 w-4"/>Iniciar tarea</Button></Section>:null}
        {assignedToCurrent && canUpdate && ["to_do","in_progress"].includes(task.status) ? <Section title="Actualizar progreso" icon={<ShieldCheck className="h-4 w-4"/>}><div className="space-y-4"><input type="range" min="0" max="100" value={progress} onChange={e=>setProgress(Number(e.target.value))} className="w-full"/><div className="flex items-center justify-between text-sm"><span>{progress}%</span><Button onClick={()=>void updateProgress()} disabled={saving}>Guardar progreso</Button></div>{task.status === "in_progress" && progress === 100 ? <Button variant="outline" onClick={()=>void invokeTask("submit_internal_task_for_review",{p_task_id:task.id,p_comment:null})} disabled={saving}><Send className="mr-2 h-4 w-4"/>Enviar a revisión</Button>:null}</div></Section>:null}
        {canReview ? <Section title="Control de Dirección" icon={<ShieldCheck className="h-4 w-4"/>}><div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><select value={directionStatus} onChange={e=>setDirectionStatus(e.target.value as InternalTaskStatus)} className="h-10 rounded-md border border-slate-200 px-3 text-sm">{STATUS_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><Input type="number" min={0} max={100} value={directionProgress} onChange={e=>setDirectionProgress(Number(e.target.value))}/></div><Button onClick={()=>void invokeTask("direction_set_internal_task_state",{p_task_id:task.id,p_status:directionStatus,p_progress:directionProgress,p_comment:null})} disabled={saving}>Aplicar estado y progreso</Button></div></Section> : null}{canReview && task.status === "pending_review" ? <Section title="Revisión de Dirección" icon={<ShieldCheck className="h-4 w-4"/>}><div className="flex flex-wrap gap-2"><Button onClick={()=>void invokeTask("review_internal_task",{p_task_id:task.id,p_decision:"approved",p_comment:null})} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700"><Check className="mr-2 h-4 w-4"/>Aprobar y completar</Button><Button variant="outline" onClick={()=>void invokeTask("review_internal_task",{p_task_id:task.id,p_decision:"returned",p_comment:null})} disabled={saving}><X className="mr-2 h-4 w-4"/>Devolver a progreso</Button></div></Section>:null}
        {has("internal_tasks.update") && task.status !== "cancelled" ? <Section title="Comentarios" icon={<MessageSquare className="h-4 w-4"/>}><Textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Añadir comentario..."/><div className="mt-2 flex justify-end"><Button onClick={()=>void addComment()} disabled={saving || !comment.trim()}><Send className="mr-2 h-4 w-4"/>Añadir comentario</Button></div></Section>:null}
        <Section title="Historial" icon={<History className="h-4 w-4"/>}>{filteredHistory.length===0?<p className="text-sm text-slate-500">Sin actividad registrada.</p>:<div className="divide-y divide-slate-100">{filteredHistory.map(item=><div key={item.id} className="py-4 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-800">{item.action}</p>{item.comment?<p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{item.comment}</p>:null}</div><span className="shrink-0 text-xs text-slate-400">{formatDate(item.created_at)}</span></div>{item.new_status?<p className="mt-1 text-xs text-slate-500">{statusLabel(item.new_status)} · {item.new_progress ?? 0}%</p>:null}</div>)}</div>}</Section>
      </div>
      <div className="space-y-6">{canVisibility?<Section title="Visibilidad" icon={<ShieldCheck className="h-4 w-4"/>}><p className="text-xs text-slate-500">La configuración de visibilidad se controla exclusivamente mediante las RPC de Dirección.</p><div className="mt-4 space-y-4">{visibility.workers.length ? <div><p className="text-xs font-semibold text-slate-500">Trabajadores actuales</p>{visibility.workers.map(w=><div key={w.worker_id} className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">{w.display_name}</div>)}</div>:null}{visibility.roles.length ? <div><p className="text-xs font-semibold text-slate-500">Roles actuales</p>{visibility.roles.map(r=><div key={r.role_id} className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">{r.name}</div>)}</div>:null}<Textarea placeholder="IDs de trabajadores para la nueva visibilidad" value={visibilityWorkerIds} onChange={e=>setVisibilityWorkerIds(e.target.value)}/><Textarea placeholder="IDs de roles para la nueva visibilidad" value={visibilityRoleIds} onChange={e=>setVisibilityRoleIds(e.target.value)}/><Button onClick={()=>void invokeTask("set_internal_task_visibility",{p_task_id:task.id,p_worker_ids:visibilityWorkerIds.split(/[,\n]/).map(v=>v.trim()).filter(Boolean),p_role_ids:visibilityRoleIds.split(/[,\n]/).map(v=>v.trim()).filter(Boolean),p_comment:"Visibilidad actualizada desde Employee Area"})} disabled={saving}>Guardar visibilidad</Button><p className="text-xs text-slate-400">Las migraciones 128–131 no crean una RPC para enumerar todos los workers/roles. No se ha inventado ninguna.</p></div></Section>:null}</div>
    </div>
  </div></div>;
}

function ClipboardIcon(){return <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-300 text-[9px]">✓</span>}
