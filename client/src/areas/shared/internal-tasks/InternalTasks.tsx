import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Circle, Clock3, GripVertical, Plus, RefreshCw, UserRound, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  INTERNAL_TASK_PERMISSIONS,
  InternalTask,
  InternalTaskPriority,
  InternalTaskStatus,
  PRIORITY_OPTIONS,
  TaskWorkerOption,
} from "./internalTaskTypes";
import { getInternalTaskWorkerOptions } from "./internalTaskRpc";
import {
  EmptyState,
  ErrorBox,
  LoadingState,
  TaskSearch,
} from "./InternalTaskUI";

interface Props {
  basePath?: string;
  onOpenTask?: (id: string) => void;
}

const emptyForm = {
  title: "",
  description: "",
  priority: "normal" as InternalTaskPriority,
  due_at: "",
  assigned_to_worker_id: "",
  viewer_worker_ids: [] as string[],
  viewer_role_ids: "",
};

export default function InternalTasks({ basePath = "/employee/tasks", onOpenTask }: Props) {
  const { user, worker, hasPermission } = useAuth();
  const [tasks, setTasks] = useState<InternalTask[]>([]);
  const [workerOptions, setWorkerOptions] = useState<TaskWorkerOption[]>([]);
  const [activeView, setActiveView] = useState<"all" | "mine" | "priority" | "week" | "cancelled">("all");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const canCreate = hasPermission(INTERNAL_TASK_PERMISSIONS.create);
  const canAssign = hasPermission(INTERNAL_TASK_PERMISSIONS.assign);
  const canVisibility = hasPermission(INTERNAL_TASK_PERMISSIONS.manageVisibility);

  const load = useCallback(
    async (silent = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const { data, error: rpcError } = await supabase.rpc("get_internal_tasks", {
          p_status: null,
          p_limit: 100,
          p_offset: 0,
        });

        if (rpcError) throw rpcError;

        const listedTasks = (data || []) as InternalTask[];

        // El detalle de tarea usa get_internal_task como fuente de verdad para
        // progress. Normalizamos la respuesta porque PostgREST puede devolver
        // una fila como objeto o como array, según la firma de la RPC.
        const readProgress = (value: any): number | null => {
          const row = Array.isArray(value) ? value[0] : value;
          const candidate = row?.progress ?? row?.progress_percentage ?? row?.progress_percent;
          if (candidate === null || candidate === undefined || candidate === "") return null;
          const parsed = Number(candidate);
          return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
        };

        const enrichedTasks: InternalTask[] = [];
        for (let i = 0; i < listedTasks.length; i += 8) {
          const batch = listedTasks.slice(i, i + 8);
          const results = await Promise.all(batch.map(async (task) => {
            let currentProgress: number | null = null;
            try {
              const { data: detail, error: detailError } = await supabase.rpc("get_internal_tasks", {
                p_task_id: task.id,
              });
              if (!detailError) currentProgress = readProgress(detail);
            } catch {
              // Se intenta recuperar el último progreso del historial antes de
              // recurrir al valor que haya devuelto el listado.
            }

            if (currentProgress === null) {
              try {
                const { data: history, error: historyError } = await supabase.rpc("get_internal_task_history", {
                  p_task_id: task.id,
                  p_limit: 200,
                  p_offset: 0,
                });
                if (!historyError && Array.isArray(history)) {
                  const latestProgressUpdate = [...history]
                    .filter((item: any) => item.new_progress !== null && item.new_progress !== undefined)
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                  if (latestProgressUpdate) currentProgress = readProgress({ progress: latestProgressUpdate.new_progress });
                }
              } catch {
                // El fallback no debe impedir que se cargue el tablero.
              }
            }

            const listedProgress = readProgress(task);
            return {
              ...task,
              progress: currentProgress ?? listedProgress ?? 0,
            };
          }));
          enrichedTasks.push(...results);
        }
        setTasks(enrichedTasks);
      } catch (err: any) {
        setError(err?.message || "No se pudieron cargar las tareas internas.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user],
  );

  const loadWorkers = useCallback(async () => {
    try {
      const options = await getInternalTaskWorkerOptions();
      setWorkerOptions(options);
    } catch (err) {
      console.error("[InternalTasks] Error loading worker options:", err);
      setWorkerOptions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadWorkers();
  }, [loadWorkers]);

  const workerName = useCallback(
    (workerId: string | null | undefined) => {
      if (!workerId) return "Sin asignar";
      if (workerId === worker?.id) {
        const own = workerOptions.find((item) => item.id === workerId);
        return own?.display_name || "Tú";
      }
      return workerOptions.find((item) => item.id === workerId)?.display_name || "Trabajador";
    },
    [worker?.id, workerOptions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    const day = (startOfWeek.getDay() + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - day);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    return tasks.filter((task) => {
      if (activeView === "cancelled") {
        if (task.status !== "cancelled") return false;
      } else if (task.status === "cancelled") {
        return false;
      }

      if (activeView === "mine" && task.assigned_to_worker_id !== worker?.id) return false;
      if (activeView === "priority" && !["high", "urgent"].includes(String(task.priority).toLowerCase())) return false;
      if (activeView === "week") {
        if (!task.due_at) return false;
        const due = new Date(task.due_at);
        if (Number.isNaN(due.getTime()) || due < startOfWeek || due >= endOfWeek) return false;
      }

      if (!q) return true;
      return [task.title, task.description || "", task.status, task.priority, workerName(task.assigned_to_worker_id)]
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [tasks, activeView, search, workerName, worker?.id]);

  const initialsFor = (workerId: string | null | undefined) => {
    if (!workerId) return "—";
    const name = workerOptions.find((item) => item.id === workerId)?.display_name || (workerId === worker?.id ? "Tú" : "Trabajador");
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : (parts[0] || "?").slice(0, 2).toUpperCase();
  };

  const dueLabel = (dueAt: string | null | undefined) => {
    if (!dueAt) return "Sin vencimiento";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueAt);
    due.setHours(0, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (days < 0) return `Vencida hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`;
    if (days === 0) return "Vence hoy";
    return `Caduca en ${days} ${days === 1 ? "día" : "días"}`;
  };

  const moveTask = async (task: InternalTask, targetStatus: InternalTaskStatus) => {
    if (movingTaskId || task.status === targetStatus || task.status === "cancelled" || targetStatus === "cancelled") return;
    const isAssigned = !!worker?.id && task.assigned_to_worker_id === worker.id;

    // Solo Dirección puede forzar un cambio de estado. Para el resto se utilizan
    // las RPC de transición existentes, respetando el flujo de trabajo actual.
    if (!hasPermission(INTERNAL_TASK_PERMISSIONS.review)) {
      const allowedStart = isAssigned && hasPermission(INTERNAL_TASK_PERMISSIONS.update) && task.status === "to_do" && targetStatus === "in_progress";
      const allowedSubmit = isAssigned && hasPermission(INTERNAL_TASK_PERMISSIONS.update) && task.status === "in_progress" && targetStatus === "pending_review" && task.progress >= 100;
      if (!allowedStart && !allowedSubmit) {
        setError(task.status === "in_progress" && targetStatus === "pending_review" && task.progress < 100
          ? "Para enviar una tarea a revisión, primero debe alcanzar el 100 % de progreso."
          : "Tu rol no puede realizar esa transición de estado. Abre la tarea para consultar las acciones disponibles.");
        return;
      }
    }

    setMovingTaskId(task.id);
    setError(null);
    try {
      let result: { error: any };
      if (hasPermission(INTERNAL_TASK_PERMISSIONS.review) && task.status === "pending_review" && targetStatus === "completed") {
        result = await supabase.rpc("review_internal_task", {
          p_task_id: task.id,
          p_decision: "approved",
          p_comment: null,
        });
      } else if (hasPermission(INTERNAL_TASK_PERMISSIONS.review) && task.status === "pending_review" && targetStatus === "in_progress") {
        result = await supabase.rpc("review_internal_task", {
          p_task_id: task.id,
          p_decision: "returned",
          p_comment: null,
        });
      } else if (hasPermission(INTERNAL_TASK_PERMISSIONS.review)) {
        result = await supabase.rpc("direction_set_internal_task_state", {
          p_task_id: task.id,
          p_status: targetStatus,
          p_progress: targetStatus === "completed" ? 100 : task.progress,
          p_comment: "Estado actualizado desde el tablero de tareas internas",
        });
      } else if (task.status === "to_do" && targetStatus === "in_progress") {
        result = await supabase.rpc("start_internal_task", { p_task_id: task.id });
      } else {
        result = await supabase.rpc("submit_internal_task_for_review", {
          p_task_id: task.id,
          p_comment: null,
        });
      }
      if (result.error) throw result.error;
      await load(true);
    } catch (err: any) {
      setError(err?.message || "No se pudo cambiar el estado de la tarea.");
    } finally {
      setMovingTaskId(null);
      setDraggingTaskId(null);
    }
  };

  const createTask = async () => {
    if (!form.title.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const assigned = form.assigned_to_worker_id.trim() || worker?.id || null;

      const { data, error: rpcError } = await supabase.rpc("create_internal_task", {
        p_title: form.title.trim(),
        p_description: form.description.trim() || null,
        p_assigned_to_worker_id: assigned,
        p_priority: form.priority,
        p_due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        p_viewer_worker_ids: canVisibility ? form.viewer_worker_ids : null,
        p_viewer_role_ids: canVisibility
          ? form.viewer_role_ids
              .split(/[,\n]/)
              .map((value) => value.trim())
              .filter(Boolean)
          : null,
      });

      if (rpcError) throw rpcError;

      setTasks((current) => [data as InternalTask, ...current]);
      setForm(emptyForm);
      setShowCreate(false);
    } catch (err: any) {
      setError(err?.message || "No se pudo crear la tarea.");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <LoadingState text="Cargando tareas internas..." />;

  const views = [
    { id: "all", label: "Todas" },
    { id: "mine", label: "Mis tareas" },
    { id: "priority", label: "Prioritarias" },
    { id: "week", label: "De esta semana" },
    { id: "cancelled", label: "Anuladas" },
  ] as const;

  const columns = [
    { id: "to_do" as const, label: "Por hacer", icon: Circle, accent: "border-t-slate-300", badge: "bg-slate-100 text-slate-600" },
    { id: "in_progress" as const, label: "En progreso", icon: Clock3, accent: "border-t-blue-500", badge: "bg-blue-50 text-blue-700" },
    { id: "pending_review" as const, label: "En revisión", icon: UserRound, accent: "border-t-amber-400", badge: "bg-amber-50 text-amber-700" },
    { id: "completed" as const, label: "Completadas", icon: CheckCircle2, accent: "border-t-emerald-500", badge: "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <div className="min-h-full bg-[#F6F8FC] text-slate-900">
      <div className="mx-auto w-full max-w-[1800px] space-y-5 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#1E3A8A]">Operaciones · Equipo</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Tareas internas</h1>
          <p className="text-sm text-slate-500">Organiza el trabajo del equipo y sigue el avance de cada tarea.</p>
        </div>

        {error ? <ErrorBox message={error} /> : null}

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm">
            {views.map((view) => {
              const selected = activeView === view.id;
              const count = view.id === "all" ? tasks.filter((task) => task.status !== "cancelled").length
                : view.id === "mine" ? tasks.filter((task) => task.status !== "cancelled" && task.assigned_to_worker_id === worker?.id).length
                : view.id === "priority" ? tasks.filter((task) => task.status !== "cancelled" && ["high", "urgent"].includes(String(task.priority).toLowerCase())).length
                : view.id === "cancelled" ? tasks.filter((task) => task.status === "cancelled").length
                : tasks.filter((task) => {
                    if (task.status === "cancelled" || !task.due_at) return false;
                    const now = new Date(); const start = new Date(now); start.setHours(0,0,0,0); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
                    const end = new Date(start); end.setDate(end.getDate() + 7); const due = new Date(task.due_at);
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
          <div className="flex shrink-0 items-center gap-2">
            <div className="min-w-[220px]"><TaskSearch value={search} onChange={setSearch} /></div>
            <Button variant="outline" onClick={() => void load(true)} disabled={refreshing} className="h-10 rounded-xl border-slate-200 bg-white">
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Actualizar
            </Button>
            {canCreate ? <Button onClick={() => setShowCreate(true)} className="h-10 rounded-xl bg-[#1E3A8A] px-4 hover:bg-[#162D6B]"><Plus className="mr-2 h-4 w-4" />Nueva tarea</Button> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {activeView === "cancelled" ? (
            <section className="min-h-[420px] rounded-2xl border border-slate-200 bg-slate-100/70 p-3 md:col-span-2 2xl:col-span-4">
              <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-slate-500"/><h2 className="font-bold">Anuladas</h2></div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{filtered.length}</span>
              </div>
              {filtered.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{filtered.map((task) => (
                <TaskCard key={task.id} task={task} workerInitials={initialsFor(task.assigned_to_worker_id)} dueLabel={dueLabel(task.due_at)} workerName={workerName(task.assigned_to_worker_id)} onOpen={() => onOpenTask ? onOpenTask(task.id) : (window.location.href = `${basePath.replace(/\/$/, "")}/${task.id}`)} onDragStart={() => setDraggingTaskId(task.id)} onDragEnd={() => setDraggingTaskId(null)} dragging={draggingTaskId === task.id} disabledDrag />
              ))}</div> : <EmptyState title="No hay tareas anuladas" description="Las tareas anuladas aparecerán aquí." />}
            </section>
          ) : columns.map((column) => {
            const ColumnIcon = column.icon;
            const columnTasks = filtered.filter((task) => task.status === column.id);
            return (
              <section key={column.id} onDragOver={(event) => { if (hasPermission(INTERNAL_TASK_PERMISSIONS.review) || (worker?.id && column.id === "in_progress") || (worker?.id && column.id === "pending_review")) event.preventDefault(); }}
                onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("text/internal-task-id") || draggingTaskId; const task = filtered.find((item) => item.id === id) || tasks.find((item) => item.id === id); if (task) void moveTask(task, column.id); }}
                className={`min-h-[480px] rounded-2xl border border-slate-200/90 border-t-4 ${column.accent} bg-slate-100/70 p-3 transition ${draggingTaskId ? "" : ""}`}>
                <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm">
                  <div className="flex min-w-0 items-center gap-2"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${column.badge}`}><ColumnIcon className="h-4 w-4" /></span><h2 className="truncate text-sm font-bold text-slate-800">{column.label}</h2></div>
                  <span className="ml-2 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{columnTasks.length}</span>
                </div>
               <div
  className="space-y-3"
  style={{
    minHeight: columnTasks.length === 0 ? "200px" : undefined,
  }}
>
  {columnTasks.map((task) => (
    <TaskCard
      key={task.id}
      task={task}
      workerInitials={initialsFor(task.assigned_to_worker_id)}
      dueLabel={dueLabel(task.due_at)}
      workerName={workerName(task.assigned_to_worker_id)}
      onOpen={() =>
        onOpenTask
          ? onOpenTask(task.id)
          : (window.location.href = `${basePath.replace(/\/$/, "")}/${task.id}`)
      }
      onDragStart={(event) => {
        setDraggingTaskId(task.id);
        event.dataTransfer.setData("text/internal-task-id", task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setDraggingTaskId(null)}
      dragging={draggingTaskId === task.id || movingTaskId === task.id}
      disabledDrag={
        movingTaskId === task.id ||
        (!hasPermission(INTERNAL_TASK_PERMISSIONS.review) &&
          !(
            task.assigned_to_worker_id === worker?.id &&
            hasPermission(INTERNAL_TASK_PERMISSIONS.update) &&
            ["to_do", "in_progress"].includes(task.status)
          ))
      }
    />
  ))}
</div>
              </section>
            );
          })}
        </div>
        <p className="text-xs text-slate-400">Arrastra una tarjeta a otra columna para cambiar su estado. Las acciones disponibles dependen de tu rol y de las reglas de transición de cada tarea.</p>
      </div>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold">Nueva tarea interna</h2>
              <p className="mt-1 text-xs text-slate-500">
                La autorización definitiva se valida en la RPC.
              </p>
            </div>

            <div className="space-y-4 p-5">
              <Input
                placeholder="Título"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
              <Textarea
                placeholder="Descripción"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({ ...form, priority: event.target.value as InternalTaskPriority })
                  }
                  className="h-10 rounded-md border border-slate-200 px-3 text-sm"
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Input
                  type="datetime-local"
                  value={form.due_at}
                  onChange={(event) => setForm({ ...form, due_at: event.target.value })}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Responsable
                </label>
                {canAssign ? (
                  <select
                    value={form.assigned_to_worker_id}
                    onChange={(event) =>
                      setForm({ ...form, assigned_to_worker_id: event.target.value })
                    }
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Sin asignar</option>
                    {workerOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.display_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={form.assigned_to_worker_id || worker?.id || ""}
                    onChange={(event) =>
                      setForm({ ...form, assigned_to_worker_id: event.target.value })
                    }
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="">Sin asignar</option>
                    {worker?.id ? (
                      <option value={worker.id}>
                        {workerName(worker.id)} (tú)
                      </option>
                    ) : null}
                  </select>
                )}
              </div>

              {canVisibility ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Visibilidad adicional</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Solo Dirección puede definir quién más puede ver la tarea. El responsable siempre conserva acceso.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Trabajadores
                    </label>
                    <select
                      multiple
                      value={form.viewer_worker_ids}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          viewer_worker_ids: Array.from(event.target.selectedOptions, (option) => option.value),
                        })
                      }
                      className="min-h-28 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      {workerOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Textarea
                    placeholder="IDs de roles (opcional, separados por coma o salto de línea)"
                    value={form.viewer_role_ids}
                    onChange={(event) => setForm({ ...form, viewer_role_ids: event.target.value })}
                  />
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => void createTask()}
                  disabled={creating || !form.title.trim()}
                  className="bg-[#1E3A8A]"
                >
                  {creating ? "Creando..." : "Crear tarea"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function TaskCard({
  task, workerInitials, dueLabel, workerName, onOpen, onDragStart, onDragEnd, dragging, disabledDrag = false,
}: {
  task: InternalTask;
  workerInitials: string;
  dueLabel: string;
  workerName: string;
  onOpen: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  dragging: boolean;
  disabledDrag?: boolean;
}) {
  const priority = String(task.priority).toLowerCase();
const priorityLabel: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};
  const progressValue = Math.max(0, Math.min(100, Number(task.progress ?? 0) || 0));
  return (
    <article draggable={!disabledDrag} onDragStart={onDragStart} onDragEnd={onDragEnd}
      className={`group relative rounded-xl border bg-white p-4 text-left shadow-sm transition ${dragging ? "scale-[0.99] border-blue-300 opacity-60 shadow-md" : "border-slate-200/90 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"} ${disabledDrag ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}>
     <div className="mb-2 flex items-start justify-between gap-2">
  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
    <span
      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
        priority === "urgent"
          ? "bg-rose-100 text-rose-700"
          : priority === "high"
            ? "bg-orange-100 text-orange-700"
            : priority === "normal"
              ? "bg-blue-50 text-blue-700"
              : "bg-slate-100 text-slate-600"
      }`}
    >
      {priorityLabel[priority] || priority}
    </span>
  </div>

  {!disabledDrag ? (
    <GripVertical
      className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500"
      aria-label="Arrastrar tarea"
    />
  ) : null}
</div>
      <button type="button" onClick={onOpen} className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-md">
        <h3 className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">{task.title}</h3>
        <p className="mt-1.5 line-clamp-3 min-h-[3.75rem] text-xs leading-5 text-slate-500">{task.description || "Sin descripción."}</p>
      </button>
      <div className="mt-3" aria-label={`Progreso ${progressValue}%`}>
        <div className="mt-3 w-full" aria-label={`Progreso ${progressValue}%`}>
  <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
    <div
      className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-300 ease-out"
      style={{
        width: `${progressValue}%`,
        backgroundColor: "#3157A4",
        minWidth: progressValue > 0 ? "3px" : "0",
      }}
    />
  </div>
</div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className={`flex min-w-0 items-center gap-1.5 text-[11px] ${task.due_at && new Date(task.due_at).getTime() < new Date(new Date().setHours(0,0,0,0)) && task.status !== "completed" && task.status !== "cancelled" ? "font-semibold text-rose-600" : "text-slate-500"}`}>
          <CalendarDays className="h-3.5 w-3.5 shrink-0"/><span className="truncate">{dueLabel}</span>
        </div>
        <span title={workerName} aria-label={`Responsable: ${workerName}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-[11px] font-bold text-[#1E3A8A]">{workerInitials}</span>
      </div>
    </article>
  );
}
