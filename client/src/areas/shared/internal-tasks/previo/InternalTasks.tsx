import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Plus, RefreshCw, UserRound } from "lucide-react";
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
  STATUS_OPTIONS,
  TaskWorkerOption,
  formatShortDate,
} from "./internalTaskTypes";
import { getInternalTaskWorkerOptions } from "./internalTaskRpc";
import {
  EmptyState,
  ErrorBox,
  LoadingState,
  PriorityBadge,
  ProgressBar,
  StatusBadge,
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
  const [status, setStatus] = useState<"all" | InternalTaskStatus>("all");
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
          p_status: status === "all" ? null : status,
          p_limit: 100,
          p_offset: 0,
        });

        if (rpcError) throw rpcError;
        setTasks((data || []) as InternalTask[]);
      } catch (err: any) {
        setError(err?.message || "No se pudieron cargar las tareas internas.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, status],
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
    if (!q) return tasks;

    return tasks.filter((task) =>
      [
        task.title,
        task.description || "",
        task.status,
        task.priority,
        workerName(task.assigned_to_worker_id),
      ].some((value) => value.toLowerCase().includes(q)),
    );
  }, [tasks, search, workerName]);

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

  return (
    <div className="min-h-full bg-[#F8FAFC] text-slate-900">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1E3A8A]">
              Operaciones
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Tareas internas</h1>
            <p className="mt-1 text-sm text-slate-500">
              Trabajo operativo interno entre trabajadores de Modira.
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
            {canCreate ? (
              <Button
                onClick={() => setShowCreate(true)}
                className="bg-[#1E3A8A] hover:bg-[#162D6B]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nueva tarea
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <ErrorBox message={error} /> : null}

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Visibles</p>
            <p className="mt-1 text-2xl font-bold">{tasks.length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Por hacer</p>
            <p className="mt-1 text-2xl font-bold">{tasks.filter((task) => task.status === "to_do").length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">En progreso</p>
            <p className="mt-1 text-2xl font-bold">{tasks.filter((task) => task.status === "in_progress").length}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">Revisión</p>
            <p className="mt-1 text-2xl font-bold">{tasks.filter((task) => task.status === "pending_review").length}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <TaskSearch value={search} onChange={setSearch} />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "all" | InternalTaskStatus)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="all">Todos los estados</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No hay tareas visibles"
            description="Las tareas se muestran según el acceso que determine el backend mediante RBAC y reglas de visibilidad."
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() =>
                  onOpenTask
                    ? onOpenTask(task.id)
                    : (window.location.href = `${basePath.replace(/\/$/, "")}/${task.id}`)
                }
                className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={task.status} />
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <h2 className="mt-2 truncate text-base font-bold text-slate-900">{task.title}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {task.description || "Sin descripción."}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3.5 w-3.5" />
                      {workerName(task.assigned_to_worker_id)}
                    </span>
                    {task.due_at ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatShortDate(task.due_at)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Progreso</span>
                    <span className="font-semibold">{task.progress}%</span>
                  </div>
                  <ProgressBar value={task.progress} />
                </div>
              </button>
            ))}
          </div>
        )}
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
