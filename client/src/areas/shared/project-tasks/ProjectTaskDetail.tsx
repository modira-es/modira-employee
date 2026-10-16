
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Flag,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  addProjectTaskComment,
  directionSetProjectTaskState,
  getProjectTask,
  getProjectTaskHistory,
  getProjectTaskVisibility,
  reassignProjectTask,
  setProjectTaskVisibility,
  reviewProjectTask,
  startProjectTask,
  submitProjectTaskForReview,
  updateProjectTask,
  updateProjectTaskProgress,
} from "./projectTaskRpc";
import type {
  MilestoneOption,
  ProjectOption,
  ProjectTask,
  ProjectTaskHistory,
  ProjectTaskPriority,
  ProjectTaskRoleOption,
  ProjectTaskStatus,
  WorkerOption,
} from "./projectTaskTypes";

const LABELS: Record<ProjectTaskStatus, string> = {
  to_do: "Por hacer",
  in_progress: "En curso",
  pending_review: "Pendiente de revisión",
  completed: "Completada",
  cancelled: "Cancelada",
};
const PRIORITY: Record<ProjectTaskPriority, string> = { low: "Baja", normal: "Normal", high: "Alta", urgent: "Urgente" };

function fmt(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ProjectTaskDetail({
  taskId,
  basePath,
  workers,
  projects,
  milestones,
  roles,
  onChanged,
}: {
  taskId: string;
  basePath: string;
  workers?: WorkerOption[];
  projects: ProjectOption[];
  milestones: MilestoneOption[];
  roles?: ProjectTaskRoleOption[];
  onChanged?: () => void;
}) {
  const [, navigate] = useLocation();
  const { hasPermission, worker } = useAuth();
  const isDirection = hasPermission("system.workers.read");
  const canUpdate = hasPermission("project_tasks.update");
  const canProgress = canUpdate && !!worker;
  const canAssign = isDirection;
  const developerWorkers = (workers ?? []);
  const developerRoles = (roles ?? []).filter((role) => role.code === "developer");

  const [task, setTask] = useState<ProjectTask | null>(null);
  const [history, setHistory] = useState<ProjectTaskHistory[]>([]);
  const [visibility, setVisibility] = useState<{ workerIds: string[]; roleIds: string[] }>({ workerIds: [], roleIds: [] });
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressComment, setProgressComment] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [comment, setComment] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState({ title: "", description: "", priority: "normal" as ProjectTaskPriority, dueAt: "" });

  async function load() {
    try {
      setLoading(true);
      const [nextTask, nextHistory, nextVisibility] = await Promise.all([
        getProjectTask(taskId),
        getProjectTaskHistory(taskId),
        getProjectTaskVisibility(taskId),
      ]);
      setTask(nextTask);
      setHistory(nextHistory);
      setVisibility({
        workerIds: nextVisibility.filter(v => !!v.worker_id).map(v => v.worker_id as string),
        roleIds: nextVisibility.filter(v => !!v.role_id).map(v => v.role_id as string),
      });
      if (nextTask) {
        setProgress(nextTask.progress);
        setEdit({
          title: nextTask.title,
          description: nextTask.description || "",
          priority: nextTask.priority,
          dueAt: nextTask.due_at ? new Date(nextTask.due_at).toISOString().slice(0, 16) : "",
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "No se pudo cargar la tarea.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [taskId]);

  const statusTone = useMemo(() => {
    if (!task) return "bg-slate-100 text-slate-600";
    if (task.status === "completed") return "bg-emerald-50 text-emerald-700";
    if (task.status === "pending_review") return "bg-violet-50 text-violet-700";
    if (task.status === "in_progress") return "bg-amber-50 text-amber-700";
    if (task.status === "cancelled") return "bg-slate-100 text-slate-500";
    return "bg-slate-100 text-slate-600";
  }, [task]);

  async function run(action: () => Promise<any>, success: string) {
    try {
      setSaving(true);
      await action();
      toast.success(success);
      await load();
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo completar la operación.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="min-h-full bg-[#F7F8FA] p-10"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#102A66]" /></div>;
  if (!task) return <div className="min-h-full bg-[#F7F8FA] p-10 text-center text-sm text-slate-500">Tarea no encontrada.</div>;

  const isResponsible = !!worker?.id && task.assigned_to_worker_id === worker.id;
  const responsibleName =
    task.responsible_name ||
(task.assigned_to_worker_id ? (workers ?? []).find(w => w.id === task.assigned_to_worker_id)?.name : null);
  const recommendedWorker = task.recommended_worker_id
    ? developerWorkers.find((w) => w.id === task.recommended_worker_id)
    : null;
  const projectName = task.project_name || projects.find(p => p.id === task.project_id)?.nombre || "Proyecto";
  const milestoneName = task.milestone_name || (task.milestone_id ? milestones.find(m => m.id === task.milestone_id)?.nombre : null);
  return (
    <div className="min-h-full bg-[#F7F8FA] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <button onClick={() => navigate(basePath)} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Volver a tareas</button>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#102A66]">{projectName}</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{task.title}</h1>
            <p className="mt-1 text-sm text-slate-500">{milestoneName || "Tarea general del proyecto"}</p>
          </div>
          <span className={`inline-flex w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${statusTone}`}>{LABELS[task.status]}</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-900">Seguimiento</h2>
                {isDirection && (
                  <button
                    type="button"
                    onClick={() => setVisibilityOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#102A66] hover:bg-slate-50"
                  >
                    <UserRound className="h-4 w-4" />
                    Compartir tarea
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Seguimiento</h2>
                <span className="text-sm font-semibold text-slate-700">{task.progress}%</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#102A66] transition-all" style={{ width: `${task.progress}%` }} /></div>
              <div className="mt-5 flex flex-wrap gap-2">
                {task.status === "to_do" && isResponsible && <button disabled={saving} onClick={() => run(() => startProjectTask(task.id), "Tarea iniciada.")} className="rounded-xl bg-[#102A66] px-3 py-2 text-sm font-semibold text-white">Iniciar tarea</button>}
                {task.status === "in_progress" && isResponsible && canProgress && <button disabled={saving} onClick={() => run(async () => { await updateProjectTaskProgress(task.id, progress, progressComment || null); setProgressComment(""); }, "Progreso actualizado.")} className="rounded-xl bg-[#102A66] px-3 py-2 text-sm font-semibold text-white">Guardar progreso</button>}
                {task.status === "in_progress" && isResponsible && task.progress === 100 && <button disabled={saving} onClick={() => run(() => submitProjectTaskForReview(task.id, progressComment || null), "Tarea enviada a revisión.")} className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white">Enviar a revisión</button>}
                {task.status === "pending_review" && isDirection && (
                  <>
                    <button disabled={saving} onClick={() => run(() => reviewProjectTask(task.id, "approved", reviewComment || null), "Tarea aprobada.")} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Aprobar tarea</button>
                    <button disabled={saving} onClick={() => run(() => reviewProjectTask(task.id, "returned", reviewComment || null), "Tarea devuelta a trabajo.")} className="rounded-xl border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-700">Devolver a trabajo</button>
                  </>
                )}
                {isDirection && !["completed", "cancelled"].includes(task.status) && <button disabled={saving} onClick={() => run(() => directionSetProjectTaskState(task.id, "cancelled", "Cancelada desde Dirección"), "Tarea cancelada.")} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600">Cancelar</button>}
              </div>

              {task.status === "in_progress" && isResponsible && (
                <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px]">
                  <input type="range" min={0} max={100} value={progress} onChange={e => setProgress(Number(e.target.value))} />
                  <input value={progressComment} onChange={e => setProgressComment(e.target.value)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Comentario opcional" />
                </div>
              )}
              {task.status === "pending_review" && isDirection && (
                <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} className="mt-4 min-h-[90px] w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Comentario de revisión..." />
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">Descripción</h2>{canUpdate && !["completed", "cancelled"].includes(task.status) && <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#102A66]"><Pencil className="h-3.5 w-3.5" /> Editar</button>}</div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">{task.description || "Sin descripción."}</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-6 py-4"><h2 className="text-sm font-semibold text-slate-900">Historial de actividad</h2></div>
              <div className="divide-y divide-slate-100">
                {history.length === 0 ? <div className="p-6 text-sm text-slate-500">Todavía no hay actividad.</div> :
                  history.map(item => <div key={item.id} className="p-5"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-full bg-slate-100 p-2"><Clock3 className="h-4 w-4 text-slate-500" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-slate-800">{item.actor_name || "Trabajador"}</p><span className="text-xs text-slate-400">{fmt(item.created_at)}</span></div><p className="mt-1 text-sm text-slate-600">{item.action === "review_approved" ? "Aprobó la tarea" : item.action === "review_returned" ? "Devolvió la tarea a trabajo" : item.action === "submitted_for_review" ? "Envió la tarea a revisión" : item.action === "progress_updated" ? `Actualizó el progreso${item.new_progress != null ? ` a ${item.new_progress}%` : ""}` : item.action === "started" ? "Inició la tarea" : item.action === "reassigned" ? "Reasignó la tarea" : item.action === "cancelled" ? "Canceló la tarea" : item.action === "created" ? "Creó la tarea" : item.action === "comment" ? "Añadió un comentario" : "Actualizó la tarea"}</p>{item.comment && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{item.comment}</p>}</div></div></div>)}
              </div>
              <div className="border-t border-slate-100 p-5">
                <div className="flex gap-2"><input value={comment} onChange={e => setComment(e.target.value)} className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm" placeholder="Escribir comentario..." /><button disabled={!comment.trim() || saving} onClick={() => run(async () => { await addProjectTaskComment(task.id, comment.trim()); setComment(""); }, "Comentario añadido.")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#102A66] px-4 text-sm font-semibold text-white"><MessageSquare className="h-4 w-4" /> Añadir</button></div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-900">Información</h2>
              <div className="mt-4 space-y-4 text-sm">
                <div><p className="text-xs text-slate-400">Responsable</p><p className="mt-1 font-medium text-slate-700">{responsibleName || "Sin asignar"}</p>{task.assigned_to_worker_id && <p className="mt-0.5 text-xs text-slate-400">Developer</p>}</div>
              {task.recommended_worker_id && (
  <div>
    <p className="text-xs text-slate-400">
      Recomendación del Developer
    </p>

    <p className="mt-1 font-medium text-[#102A66]">
      {recommendedWorker?.name || "Trabajador recomendado"}
    </p>
  </div>
)}
                <div><p className="text-xs text-slate-400">Prioridad</p><p className="mt-1 font-medium text-slate-700">{PRIORITY[task.priority]}</p></div>
                <div><p className="text-xs text-slate-400">Fecha límite</p><p className="mt-1 font-medium text-slate-700">{fmt(task.due_at)}</p></div>
                <div><p className="text-xs text-slate-400">Inicio</p><p className="mt-1 font-medium text-slate-700">{fmt(task.started_at)}</p></div>
                <div><p className="text-xs text-slate-400">Enviada a revisión</p><p className="mt-1 font-medium text-slate-700">{fmt(task.submitted_for_review_at)}</p></div>
                <div><p className="text-xs text-slate-400">Completada</p><p className="mt-1 font-medium text-slate-700">{fmt(task.completed_at)}</p></div>
              </div>
              {canAssign && !["completed", "cancelled"].includes(task.status) && (
                <button onClick={() => setAssignOpen(true)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><UserRound className="h-4 w-4" /> Reasignar</button>
              )}
            </section>

            {task.status === "pending_review" && <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5"><p className="text-sm font-semibold text-violet-800">Pendiente de revisión</p><p className="mt-1 text-xs leading-5 text-violet-700">La tarea ha llegado al 100 % y espera la validación de Dirección.</p></div>}
            {task.status === "completed" && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-sm font-semibold text-emerald-800">✓ Completada por Dirección</p><p className="mt-1 text-xs text-emerald-700">La tarea ha superado el proceso de revisión.</p></div>}
          </aside>
        </div>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5"><h2 className="font-semibold text-slate-900">Editar tarea</h2><p className="text-sm text-slate-500">Proyecto, responsable, estado y progreso permanecen protegidos.</p></div>
            <div className="space-y-4 p-6">
              <input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.title} onChange={e => setEdit(v => ({ ...v, title: e.target.value }))} />
              <textarea className="min-h-[120px] w-full rounded-xl border border-slate-200 p-3 text-sm" value={edit.description} onChange={e => setEdit(v => ({ ...v, description: e.target.value }))} />
              <select className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.priority} onChange={e => setEdit(v => ({ ...v, priority: e.target.value as ProjectTaskPriority }))}><option value="low">Baja</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select>
              <input type="datetime-local" className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm" value={edit.dueAt} onChange={e => setEdit(v => ({ ...v, dueAt: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><button onClick={() => setEditOpen(false)} className="rounded-xl px-4 py-2 text-sm">Cancelar</button><button disabled={saving} onClick={() => run(async () => { await updateProjectTask(task.id, { title: edit.title.trim(), description: edit.description.trim() || null, priority: edit.priority, due_at: edit.dueAt ? new Date(edit.dueAt).toISOString() : null }); setEditOpen(false); }, "Tarea actualizada.")} className="rounded-xl bg-[#102A66] px-4 py-2 text-sm font-semibold text-white">Guardar</button></div>
          </div>
        </div>
      )}


      {visibilityOpen && canAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="font-semibold text-slate-900">Visibilidad de la tarea</h2>
              <p className="mt-1 text-sm text-slate-500">
                La tarea seguirá protegida por el backend. Selecciona qué Developers concretos o el rol Developer completo podrán verla.
              </p>
            </div>
            <div className="max-h-[60vh] space-y-6 overflow-y-auto p-6">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Developers</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {developerWorkers.map(w => (
                    <label key={w.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={visibility.workerIds.includes(w.id)}
                        onChange={e => setVisibility(v => ({
                          ...v,
                          workerIds: e.target.checked ? [...v.workerIds, w.id] : v.workerIds.filter(id => id !== w.id),
                        }))}
                      />
                      <span className="text-sm font-medium text-slate-700">{w.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Rol</p>
                {developerRoles.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                    No hay un rol Developer disponible para seleccionar.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {developerRoles.map(role => (
                      <label key={role.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={visibility.roleIds.includes(role.id)}
                          onChange={e => setVisibility(v => ({
                            ...v,
                            roleIds: e.target.checked ? [...v.roleIds, role.id] : v.roleIds.filter(id => id !== role.id),
                          }))}
                        />
                        <span className="text-sm font-medium text-slate-700">{role.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setVisibilityOpen(false)} className="rounded-xl px-4 py-2 text-sm text-slate-600">Cancelar</button>
              <button
                disabled={visibilitySaving}
                onClick={async () => {
                  try {
                    setVisibilitySaving(true);
                    await setProjectTaskVisibility(task.id, visibility.workerIds, visibility.roleIds);
                    toast.success("Visibilidad actualizada.");
                    setVisibilityOpen(false);
                    await load();
                    onChanged?.();
                  } catch (err: any) {
                    toast.error(err?.message || "No se pudo actualizar la visibilidad.");
                  } finally {
                    setVisibilitySaving(false);
                  }
                }}
                className="rounded-xl bg-[#102A66] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {visibilitySaving ? "Guardando..." : "Guardar visibilidad"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-slate-100 px-6 py-5"><h2 className="font-semibold text-slate-900">Reasignar tarea</h2><p className="text-sm text-slate-500">Solo Dirección puede cambiar el responsable.</p></div>
            <div className="space-y-4 p-6"><select id="task-reassign" className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="">Sin asignar</option>{(workers ?? []).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select><p className="text-xs text-slate-400">El backend registra la reasignación en el historial.</p></div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><button onClick={() => setAssignOpen(false)} className="rounded-xl px-4 py-2 text-sm">Cancelar</button><button onClick={() => { const value = (document.getElementById("task-reassign") as HTMLSelectElement)?.value || null; void run(() => reassignProjectTask(task.id, value, "Reasignación desde Dirección"), "Tarea reasignada.").then(() => setAssignOpen(false)); }} className="rounded-xl bg-[#102A66] px-4 py-2 text-sm font-semibold text-white">Reasignar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
