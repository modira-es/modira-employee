import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Flag,
  FolderKanban,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  createProjectTask,
  directionSetProjectTaskState,
  reviewProjectTask,
  startProjectTask,
  submitProjectTaskForReview,
} from "./projectTaskRpc";
import type {
  MilestoneOption,
  ProjectOption,
  ProjectTask,
  ProjectTaskFilters,
  ProjectTaskPriority,
  ProjectTaskStatus,
  WorkerOption,
} from "./projectTaskTypes";

const STATUS: Record<ProjectTaskStatus, { label: string; icon: any; accent: string; badge: string }> = {
  to_do: { label: "Por hacer", icon: Circle, accent: "border-t-slate-300", badge: "bg-slate-100 text-slate-600" },
  in_progress: { label: "En curso", icon: Clock3, accent: "border-t-blue-500", badge: "bg-blue-50 text-blue-700" },
  pending_review: { label: "En revisión", icon: Flag, accent: "border-t-amber-400", badge: "bg-amber-50 text-amber-700" },
  completed: { label: "Completadas", icon: CheckCircle2, accent: "border-t-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Anuladas", icon: XCircle, accent: "border-t-slate-300", badge: "bg-slate-100 text-slate-500" },
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

function dueLabel(value: string | null | undefined) {
  if (!value) return "Sin vencimiento";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(value);
  due.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `Vencida hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`;
  if (days === 0) return "Vence hoy";
  return `Caduca en ${days} ${days === 1 ? "día" : "días"}`;
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

type BoardView = "all" | "mine" | "priority" | "week" | "cancelled";

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
  const canUpdate = hasPermission("project_tasks.update");
  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w.name])), [workers]);
  const projectById = useMemo(
  () => new Map(projects.map(project => [project.id, project.nombre])),
  [projects]
);

const milestoneById = useMemo(
  () => new Map(milestones.map(milestone => [milestone.id, milestone.nombre])),
  [milestones]
);
  const [activeView, setActiveView] = useState<BoardView>("all");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
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

  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    return tasks.filter((task) => {
      if (activeView === "cancelled") {
        if (task.status !== "cancelled") return false;
      } else if (task.status === "cancelled") {
        return false;
      }
      if (activeView === "mine" && task.assigned_to_worker_id !== worker?.id) return false;
      if (activeView === "priority" && !["high", "urgent"].includes(task.priority)) return false;
      if (activeView === "week") {
        if (!task.due_at) return false;
        const due = new Date(task.due_at);
        if (Number.isNaN(due.getTime()) || due < startOfWeek || due >= endOfWeek) return false;
      }
      return (
        (filters.projectId === "all" || task.project_id === filters.projectId) &&
        (filters.milestoneId === "all" || task.milestone_id === filters.milestoneId) &&
        (filters.status === "all" || task.status === filters.status) &&
        (filters.priority === "all" || task.priority === filters.priority) &&
        (filters.workerId === "all" || task.assigned_to_worker_id === filters.workerId) &&
        (!query ||
          task.title.toLowerCase().includes(query) ||
          (task.description || "").toLowerCase().includes(query) ||
          (task.project_name || "").toLowerCase().includes(query) ||
          (task.milestone_name || "").toLowerCase().includes(query))
      );
    });
  }, [activeView, filters, tasks, worker?.id]);

  const stats = useMemo(() => ({
    total: tasks.filter((task) => task.status !== "cancelled").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    review: tasks.filter((task) => task.status === "pending_review").length,
    urgent: tasks.filter((task) => task.priority === "urgent" && task.status !== "cancelled").length,
  }), [tasks]);

  const initialsFor = (workerId: string | null | undefined) => {
    if (!workerId) return "—";
    const name = workerById.get(workerId) || (workerId === worker?.id ? "Tú" : "Trabajador");
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : (parts[0] || "?").slice(0, 2).toUpperCase();
  };

  async function moveTask(task: ProjectTask, targetStatus: ProjectTaskStatus) {
    if (movingTaskId || task.status === targetStatus || task.status === "cancelled" || targetStatus === "cancelled") return;
    const isResponsible = !!worker?.id && task.assigned_to_worker_id === worker.id;

    // El tablero solo ofrece transiciones ya autorizadas por las RPC existentes.
    if (!isDirection) {
      const canStart = isResponsible && canUpdate && task.status === "to_do" && targetStatus === "in_progress";
      const canSubmit = isResponsible && canUpdate && task.status === "in_progress" &&
        targetStatus === "pending_review" && task.progress >= 100;
      if (!canStart && !canSubmit) {
        toast.error(
          task.status === "in_progress" && targetStatus === "pending_review" && task.progress < 100
            ? "Para enviar la tarea a revisión, primero debe alcanzar el 100 % de progreso."
            : "Solo el responsable puede iniciar o enviar su tarea a revisión. Las demás transiciones se realizan desde el detalle según los permisos.",
        );
        return;
      }
    } else {
      const canReview = task.status === "pending_review" &&
        (targetStatus === "completed" || targetStatus === "in_progress");
      const canDirectionMove = ["to_do", "in_progress"].includes(task.status) &&
        ["to_do", "in_progress"].includes(targetStatus);
      if (!canReview && !canDirectionMove) {
        toast.error("Esta transición debe realizarse desde el detalle de la tarea.");
        return;
      }
    }

    setMovingTaskId(task.id);
    setDraggingTaskId(null);
    try {
      if (isDirection && task.status === "pending_review" && targetStatus === "completed") {
        await reviewProjectTask(task.id, "approved", null);
      } else if (isDirection && task.status === "pending_review" && targetStatus === "in_progress") {
        await reviewProjectTask(task.id, "returned", null);
      } else if (isDirection && ["to_do", "in_progress"].includes(task.status) &&
        ["to_do", "in_progress"].includes(targetStatus)) {
        await directionSetProjectTaskState(task.id, targetStatus as "to_do" | "in_progress", "Estado actualizado desde el tablero de tareas de proyectos");
      } else if (task.status === "to_do" && targetStatus === "in_progress") {
        await startProjectTask(task.id);
      } else if (task.status === "in_progress" && targetStatus === "pending_review") {
        await submitProjectTaskForReview(task.id);
      }
      toast.success("Estado de la tarea actualizado.");
      onRefresh();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo cambiar el estado de la tarea.");
    } finally {
      setMovingTaskId(null);
    }
  }

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
        p_assigned_to_worker_id: canAssignOthers ? form.workerId || null : null,
        p_recommended_worker_id: canRecommend ? form.recommendedWorkerId || null : null,
      });
      toast.success("Tarea creada correctamente.");
      setCreateOpen(false);
      setForm({ title: "", description: "", projectId: "", milestoneId: "", priority: "normal", dueAt: "", workerId: "", recommendedWorkerId: "" });
      onRefresh();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo crear la tarea.");
    } finally {
      setCreating(false);
    }
  }

  const selectClass = "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#102A66]";
  const views: { id: BoardView; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "mine", label: "Mis tareas" },
    { id: "priority", label: "Prioritarias" },
    { id: "week", label: "De esta semana" },
    { id: "cancelled", label: "Anuladas" },
  ];
  const columns: ProjectTaskStatus[] = ["to_do", "in_progress", "pending_review", "completed"];

  if (loading) {
    return <div className="min-h-full bg-[#F6F8FC] p-10"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#1E3A8A]" /></div>;
  }

  return (
    <div className="min-h-full bg-[#F6F8FC] text-slate-900">
      <div className="mx-auto w-full max-w-[1800px] space-y-5 p-4 sm:p-6 lg:p-8">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1E3A8A]">Proyectos · Equipo</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Tareas de proyectos</h1>
          <p className="text-sm text-slate-500">Organiza las tareas de tus proyectos, sus hitos y el avance de cada responsable.</p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
            {views.map((view) => {
              const selected = activeView === view.id;
              const count = view.id === "all" ? tasks.filter((task) => task.status !== "cancelled").length
                : view.id === "mine" ? tasks.filter((task) => task.status !== "cancelled" && task.assigned_to_worker_id === worker?.id).length
                : view.id === "priority" ? tasks.filter((task) => task.status !== "cancelled" && ["high", "urgent"].includes(task.priority)).length
                : view.id === "cancelled" ? tasks.filter((task) => task.status === "cancelled").length
                : tasks.filter((task) => {
                    if (task.status === "cancelled" || !task.due_at) return false;
                    const now = new Date();
                    const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
                    const end = new Date(start); end.setDate(end.getDate() + 7);
                    const due = new Date(task.due_at);
                    return due >= start && due < end;
                  }).length;
              return (
                <button key={view.id} type="button" onClick={() => setActiveView(view.id)}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${selected ? "bg-[#1E3A8A] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                  {view.label}<span className={`rounded-full px-2 py-0.5 text-[11px] ${selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" onClick={onRefresh} className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              <RefreshCw className="mr-2 h-4 w-4" />Actualizar
            </button>
            {canCreate && <button onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1E3A8A] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#162D6B]"><Plus className="h-4 w-4" /> Nueva tarea</button>}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <select className={selectClass} value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value, milestoneId: "all" }))}>
              <option value="all">Todos los proyectos</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.nombre}</option>)}
            </select>
            <select className={selectClass} value={filters.milestoneId} onChange={(e) => setFilters((f) => ({ ...f, milestoneId: e.target.value }))}>
              <option value="all">Todos los hitos</option>
              {filteredMilestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.nombre}</option>)}
            </select>
            <select className={selectClass} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="all">Todos los estados</option>
              {Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
            </select>
            <select className={selectClass} value={filters.priority} onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value }))}>
              <option value="all">Todas las prioridades</option>
              {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className={selectClass} value={filters.workerId} onChange={(e) => setFilters((f) => ({ ...f, workerId: e.target.value }))}>
              <option value="all">Todos los responsables</option>
              {workers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#102A66]" placeholder="Buscar tarea, proyecto o hito..." value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
            </div>
          </div>
        </div>

        {activeView === "cancelled" ? (
          <section className="min-h-[320px] rounded-2xl border border-slate-200 bg-slate-100/70 p-3">
            <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-slate-500" /><h2 className="font-bold">Tareas anuladas</h2></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{filtered.length}</span>
            </div>
            {filtered.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{filtered.map((task) => (
              <ProjectTaskCard key={task.id} task={task}projectName={projectById.get(task.project_id) || "Proyecto sin nombre"}
milestoneName={
  task.milestone_id
    ? milestoneById.get(task.milestone_id) || "Hito sin nombre"
    : null
} workerName={task.responsible_name || workerById.get(task.assigned_to_worker_id || "") || "Sin asignar"} workerInitials={initialsFor(task.assigned_to_worker_id)} onOpen={() => navigate(`${basePath}/${task.id}`)} disabledDrag />
            ))}</div> : <EmptyBoard title="No hay tareas anuladas" description="Las tareas canceladas aparecerán aquí." />}
          </section>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {columns.map((columnId) => {
              const column = STATUS[columnId];
              const Icon = column.icon;
              const columnTasks = filtered.filter((task) => task.status === columnId);
              return (
                <section key={columnId}
                  onDragOver={(event) => {
                    if (draggingTaskId && (isDirection || (worker?.id && ["in_progress", "pending_review"].includes(columnId)))) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/project-task-id") || draggingTaskId;
                    const task = filtered.find((item) => item.id === id) || tasks.find((item) => item.id === id);
                    if (task) void moveTask(task, columnId);
                  }}
                  className={`min-h-[420px] rounded-2xl border border-slate-200/90 border-t-4 ${column.accent} bg-slate-100/70 p-3 transition`}>
                  <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm">
                    <div className="flex min-w-0 items-center gap-2"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${column.badge}`}><Icon className="h-4 w-4" /></span><h2 className="truncate text-sm font-bold text-slate-800">{column.label}</h2></div>
                    <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{columnTasks.length}</span>
                  </div>
                  <div className="space-y-3" style={{ minHeight: columnTasks.length === 0 ? "380px" : undefined }}>
                    {columnTasks.map((task) => (
                      <ProjectTaskCard
                        key={task.id}
                        task={task}
                        projectName={projectById.get(task.project_id) || "Proyecto sin nombre"}
milestoneName={
  task.milestone_id
    ? milestoneById.get(task.milestone_id) || "Hito sin nombre"
    : null
}
                        workerName={task.responsible_name || workerById.get(task.assigned_to_worker_id || "") || "Sin asignar"}
                        workerInitials={initialsFor(task.assigned_to_worker_id)}
                        onOpen={() => navigate(`${basePath}/${task.id}`)}
                        onDragStart={(event) => {
                          setDraggingTaskId(task.id);
                          event.dataTransfer.setData("text/project-task-id", task.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggingTaskId(null)}
                        dragging={draggingTaskId === task.id || movingTaskId === task.id}
                        disabledDrag={
                          movingTaskId === task.id ||
                          (isDirection
                            ? ["completed", "cancelled"].includes(task.status)
                            : !(canUpdate && task.assigned_to_worker_id === worker?.id &&
                              (task.status === "to_do" || (task.status === "in_progress" && task.progress >= 100))))
                        }
                      />
                    ))}
                    {columnTasks.length === 0 && <div className="sr-only">Zona para depositar tareas</div>}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        <p className="text-xs text-slate-400">Arrastra una tarjeta a otra columna para cambiar su estado cuando tu rol y el flujo de la tarea lo permitan. Los cambios se validan mediante las RPC existentes.</p>
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

function EmptyBoard({ title, description }: { title: string; description: string }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center"><p className="text-sm font-semibold text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-500">{description}</p></div>;
}

function ProjectTaskCard({
  task,
  workerName,
  projectName,
  milestoneName,
  workerInitials,
  onOpen,
  onDragStart,
  onDragEnd,
  dragging,
  disabledDrag = false,
}: {
  task: ProjectTask;
  workerName: string;
  projectName: string;
  milestoneName: string | null;
  workerInitials: string;
  onOpen: () => void;
  onDragStart?: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  disabledDrag?: boolean;
}) {
  const urgent = task.priority === "urgent" || task.priority === "high";
  const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
  const overdue = isOverdue(task);
  return (
    <article draggable={!disabledDrag} onDragStart={onDragStart} onDragEnd={onDragEnd}
      className={`group relative rounded-xl border bg-white p-4 text-left shadow-sm transition ${dragging ? "scale-[0.99] border-blue-300 opacity-60 shadow-md" : "border-slate-200/90 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"} ${disabledDrag ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    <span
      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
        task.priority === "urgent"
          ? "bg-rose-100 text-rose-700"
          : task.priority === "high"
            ? "bg-orange-100 text-orange-700"
            : task.priority === "normal"
              ? "bg-blue-50 text-blue-700"
              : "bg-slate-100 text-slate-600"
      }`}
    >
      {PRIORITY[task.priority]}
    </span>
  </div>

  {!disabledDrag && (
    <GripVertical
      className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500"
      aria-label="Arrastrar tarea"
    />
  )}
</div>
      <button type="button" onClick={onOpen} className="block w-full rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
        <h3 className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">{task.title}</h3>
        <p className="mt-1.5 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-slate-500">{task.description || "Sin descripción."}</p>
        <div className="mt-3 flex flex-col items-start gap-1.5">
  <span
    title={projectName}
    className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800"
  >
    <FolderKanban className="h-3 w-3 shrink-0" />
    <span className="truncate">
      {projectName}
    </span>
  </span>

  {milestoneName && (
    <span
      title={milestoneName}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600"
    >
      <Flag className="h-3 w-3 shrink-0" />
      <span className="truncate">
        {milestoneName}
      </span>
    </span>
  )}
</div>
      </button>
     
      <div className="mt-3 w-full" aria-label={`Progreso ${progress}%`}>
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${progress}%`, backgroundColor: "#3157A4", minWidth: progress > 0 ? "3px" : "0" }} />
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className={`flex min-w-0 items-center gap-1.5 text-[11px] ${overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}>
          <CalendarDays className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{dueLabel(task.due_at)}</span>
        </div>
        <span title={workerName} aria-label={`Responsable: ${workerName}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-[11px] font-bold text-[#1E3A8A]">{workerInitials}</span>
      </div>
    </article>
  );
}
