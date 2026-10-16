
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flag,
  FolderKanban,
  Loader2,
  Plus,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { createProjectTask } from "./projectTaskRpc";
import type {
  MilestoneOption,
  ProjectOption,
  ProjectTask,
  ProjectTaskFilters,
  ProjectTaskPriority,
  ProjectTaskStatus,
  WorkerOption,
} from "./projectTaskTypes";

const STATUS: Record<ProjectTaskStatus, { label: string; icon: any; className: string }> = {
  to_do: { label: "Por hacer", icon: Clock3, className: "bg-slate-100 text-slate-600" },
  in_progress: { label: "En curso", icon: Clock3, className: "bg-amber-50 text-amber-700" },
  pending_review: { label: "Pendiente de revisión", icon: Flag, className: "bg-violet-50 text-violet-700" },
  completed: { label: "Completada", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelada", icon: XCircle, className: "bg-slate-100 text-slate-500" },
};

const PRIORITY: Record<ProjectTaskPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

function isOverdue(task: ProjectTask) {
  return !!task.due_at && !["completed", "cancelled"].includes(task.status) &&
    new Date(task.due_at).getTime() < Date.now();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export interface ProjectTasksProps {
  tasks: ProjectTask[];
  projects: ProjectOption[];
  milestones: MilestoneOption[];
  workers: WorkerOption[];
  loading: boolean;
  onRefresh: () => void;
  basePath: string;
}

export default function ProjectTasks({
  tasks,
  projects,
  milestones,
  workers,
  loading,
  onRefresh,
  basePath,
}: ProjectTasksProps) {
  const [, navigate] = useLocation();
  const { hasPermission, worker } = useAuth();
  const canCreate = hasPermission("project_tasks.create");
  const isDirection = hasPermission("system.workers.read");
  const canAssignOthers = isDirection;
  const canRecommend = hasPermission("project_tasks.create") && !isDirection;
  const workerById = useMemo(() => new Map(workers.map(w => [w.id, w.name])), [workers]);
  const [filters, setFilters] = useState<ProjectTaskFilters>({
    projectId: "all",
    milestoneId: "all",
    status: "all",
    priority: "all",
    workerId: "all",
    search: "",
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
  title: "",
  description: "",
  projectId: "",
  milestoneId: "",
  priority: "normal" as ProjectTaskPriority,
  dueAt: "",
  workerId: "",
  recommendedWorkerId: "",
});

  const filteredMilestones = useMemo(
    () => filters.projectId === "all"
      ? milestones
      : milestones.filter((m) => m.project_id === filters.projectId),
    [filters.projectId, milestones],
  );

  const filtered = useMemo(() => tasks.filter((task) => {
    const q = filters.search.trim().toLowerCase();
    return (
      (filters.projectId === "all" || task.project_id === filters.projectId) &&
      (filters.milestoneId === "all" || task.milestone_id === filters.milestoneId) &&
      (filters.status === "all" || task.status === filters.status) &&
      (filters.priority === "all" || task.priority === filters.priority) &&
      (filters.workerId === "all" || task.assigned_to_worker_id === filters.workerId) &&
      (!q ||
        task.title.toLowerCase().includes(q) ||
        (task.description || "").toLowerCase().includes(q) ||
        (task.project_name || "").toLowerCase().includes(q))
    );
  }), [filters, tasks]);

  const stats = useMemo(() => ({
    total: tasks.length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    review: tasks.filter(t => t.status === "pending_review").length,
    urgent: tasks.filter(t => t.priority === "urgent" && t.status !== "cancelled").length,
  }), [tasks]);

  async function handleCreate() {
    if (!form.title.trim() || !form.projectId) {
      toast.error("Título y proyecto son obligatorios.");
      return;
    }
    try {
      setCreating(true);
      await createProjectTask({
  p_project_id: form.projectId,
  p_milestone_id: form.milestoneId || null,
  p_title: form.title.trim(),
  p_description: form.description.trim() || null,
  p_priority: form.priority,
  p_due_at: form.dueAt ? new Date(form.dueAt).toISOString() : null,
  p_assigned_to_worker_id: canAssignOthers
    ? form.workerId || null
    : null,
  p_recommended_worker_id: canRecommend
    ? form.recommendedWorkerId || null
    : null,
});
      toast.success("Tarea creada correctamente.");
      setCreateOpen(false);
      setForm({ title: "", description: "", projectId: "", milestoneId: "", priority: "normal", dueAt: "", workerId: "" ,recommendedWorkerId: ""});
      onRefresh();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo crear la tarea.");
    } finally {
      setCreating(false);
    }
  }

  const selectClass = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#102A66]";

  return (
    <div className="min-h-full bg-[#F7F8FA] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#102A66]">Proyectos</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tareas de proyectos</h1>
            <p className="mt-1 text-sm text-slate-500">Gestiona y realiza el seguimiento de las tareas de tus proyectos.</p>
          </div>
          {canCreate && (
            <button onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#102A66] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#0b2152]">
              <Plus className="h-4 w-4" /> Nueva tarea
            </button>
          )}
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Total", stats.total, FolderKanban],
            ["En curso", stats.inProgress, Clock3],
            ["Revisión", stats.review, Flag],
            ["Urgentes", stats.urgent, AlertTriangle],
          ].map(([label, value, Icon]: any) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{label}</span>
                <Icon className="h-4 w-4 text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <select className={selectClass} value={filters.projectId} onChange={e => setFilters(f => ({ ...f, projectId: e.target.value, milestoneId: "all" }))}>
              <option value="all">Todos los proyectos</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <select className={selectClass} value={filters.milestoneId} onChange={e => setFilters(f => ({ ...f, milestoneId: e.target.value }))}>
              <option value="all">Todos los milestones</option>
              {filteredMilestones.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <select className={selectClass} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="all">Todos los estados</option>
              {Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
            </select>
            <select className={selectClass} value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}>
              <option value="all">Todas las prioridades</option>
              {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className={selectClass} value={filters.workerId} onChange={e => setFilters(f => ({ ...f, workerId: e.target.value }))}>
              <option value="all">Todos los responsables</option>
              {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#102A66]" placeholder="Buscar tarea..." value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <th className="px-5 py-3">Tarea</th><th className="px-5 py-3">Proyecto</th><th className="px-5 py-3">Milestone</th><th className="px-5 py-3">Responsable</th><th className="px-5 py-3">Rol</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Prioridad</th><th className="px-5 py-3">Progreso</th><th className="px-5 py-3">Fecha límite</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={9} className="px-5 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[#102A66]" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-5 py-16 text-center text-sm text-slate-500">No hay tareas que coincidan con los filtros.</td></tr>
                ) : filtered.map(task => {
                  const status = STATUS[task.status];
                  const StatusIcon = status.icon;
                  return (
                    <tr key={task.id} className="cursor-pointer transition hover:bg-slate-50" onClick={() => navigate(`${basePath}/${task.id}`)}>
                      <td className="px-5 py-4"><div className="font-medium text-slate-900">{task.title}</div><div className="mt-1 line-clamp-1 text-xs text-slate-400">{task.description || "Sin descripción"}</div></td>
                      <td className="px-5 py-4 text-sm text-slate-600">{task.project_name || "—"}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{task.milestone_name || "Sin milestone"}</td>
                      <td className="px-5 py-4 text-sm text-slate-600">{task.responsible_name || (task.assigned_to_worker_id ? workerById.get(task.assigned_to_worker_id) : null) || "Sin asignar"}</td>
                      <td className="px-5 py-4 text-sm text-slate-500">{task.assigned_to_worker_id ? "Developer" : "—"}</td>
                      <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}><StatusIcon className="h-3.5 w-3.5" />{status.label}</span></td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-600">{PRIORITY[task.priority]}</td>
                      <td className="px-5 py-4 min-w-[130px]"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#102A66]" style={{ width: `${task.progress}%` }} /></div><span className="text-xs font-semibold text-slate-600">{task.progress}%</span></div></td>
                      <td className="px-5 py-4 text-sm"><span className={isOverdue(task) ? "font-semibold text-red-600" : "text-slate-600"}>{formatDate(task.due_at)}</span>{isOverdue(task) && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-red-500">Vencida</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {loading ? <div className="px-5 py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-[#102A66]" /></div> :
              filtered.map(task => {
                const status = STATUS[task.status]; const StatusIcon = status.icon;
                return <button key={task.id} onClick={() => navigate(`${basePath}/${task.id}`)} className="block w-full p-4 text-left hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.project_name || "—"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${status.className}`}>{status.label}</span></div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{task.responsible_name || (task.assigned_to_worker_id ? workerById.get(task.assigned_to_worker_id) : null) || "Sin asignar"}{task.assigned_to_worker_id && <span className="ml-1 text-slate-400">· Developer</span>}</span><span>{PRIORITY[task.priority]}</span></div>
                  <div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#102A66]" style={{ width: `${task.progress}%` }} /></div><span className="text-xs">{task.progress}%</span></div>
                </button>;
              })}
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div><h2 className="text-lg font-semibold text-slate-900">Nueva tarea</h2><p className="text-sm text-slate-500">Crea una tarea vinculada a un proyecto.</p></div>
              <button onClick={() => setCreateOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">×</button>
            </div>
            <div className="space-y-4 p-6">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Título *</span><input className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-[#102A66]" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Descripción</span><textarea className="min-h-[100px] w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#102A66]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Proyecto *</span><select className={selectClass + " w-full"} value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value, milestoneId: "" }))}><option value="">Seleccionar proyecto</option>{projects.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Milestone</span><select className={selectClass + " w-full"} value={form.milestoneId} onChange={e => setForm(f => ({ ...f, milestoneId: e.target.value }))}><option value="">Sin milestone</option>{milestones.filter(m => m.project_id === form.projectId).map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Prioridad</span><select className={selectClass + " w-full"} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as ProjectTaskPriority }))}>{Object.entries(PRIORITY).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">Fecha límite</span><input type="datetime-local" className={selectClass + " w-full"} value={form.dueAt} onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))} /></label>
              </div>
{canAssignOthers ? (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-slate-600">
      Responsable
    </span>

    <select
      className={selectClass + " w-full"}
      value={form.workerId}
      onChange={e =>
        setForm(f => ({
          ...f,
          workerId: e.target.value,
        }))
      }
    >
      <option value="">Sin asignar</option>

      {workers.map(w => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
    </select>
  </label>
) : (
  <div className="space-y-4">
    <div>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">
          Responsable
        </span>

        <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
          Sin asignar
        </div>
      </label>
    </div>

    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        Recomendar responsable
      </span>

      <select
        className={selectClass + " w-full"}
        value={form.recommendedWorkerId}
        onChange={e =>
          setForm(f => ({
            ...f,
            recommendedWorkerId: e.target.value,
          }))
        }
      >
        <option value="">Sin recomendación</option>

        {workers.map(w => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>

      <p className="mt-1.5 text-xs text-slate-400">
        La recomendación será revisada por Dirección antes de asignar la tarea.
      </p>
    </label>
  </div>
)}            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setCreateOpen(false)} className="h-10 rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button disabled={creating} onClick={handleCreate} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#102A66] px-4 text-sm font-semibold text-white disabled:opacity-60">{creating && <Loader2 className="h-4 w-4 animate-spin" />}Crear tarea</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
