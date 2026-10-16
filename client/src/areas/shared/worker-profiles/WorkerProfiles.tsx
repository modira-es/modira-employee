import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WORKER_PROFILE_PERMISSIONS,
  WorkerProfile,
  WorkerTask,
  WorkerTaskFilter,
  roleLabel,
} from "./workerProfileTypes";

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    to_do: "Pendiente",
    in_progress: "En curso",
    pending_review: "Pendiente de revisión",
    completed: "Completada",
    cancelled: "Cancelada",
  };
  return labels[status] || status;
}

function statusClass(status: string) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "pending_review":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "cancelled":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function WorkerCard({
  worker,
  onOpen,
}: {
  worker: WorkerProfile;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-left"
    >
      <Card className="h-full border-slate-200 bg-white shadow-none transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm">
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#102A66] text-sm font-bold text-white">
                {initials(worker.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{worker.name}</p>
                <p className="mt-0.5 truncate text-xs text-slate-400">
                  {worker.email || "Sin email"}
                </p>
              </div>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
          </div>

          <div className="mt-5 flex flex-wrap gap-1.5">
            {worker.roles.length ? (
              worker.roles.map((role) => (
                <Badge
                  key={role.code}
                  variant="outline"
                  className="border-slate-200 bg-slate-50 text-slate-600"
                >
                  {roleLabel(role.code, role.name)}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="border-slate-200 text-slate-500">
                Sin rol asignado
              </Badge>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 pt-4">
            <div className="pr-4">
              <div className="flex items-center gap-2 text-slate-400">
                <ClipboardList className="h-4 w-4" />
                <span className="text-xs font-medium">Asignadas</span>
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {worker.assigned_tasks_count}
              </p>
            </div>
            <div className="pl-4">
              <div className="flex items-center gap-2 text-slate-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-medium">Completadas</span>
              </div>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {worker.completed_tasks_count}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </button>
  );
}

function WorkerTasksDialog({
  worker,
  filter,
  onFilterChange,
  tasks,
  loading,
  onClose,
}: {
  worker: WorkerProfile | null;
  filter: WorkerTaskFilter;
  onFilterChange: (value: WorkerTaskFilter) => void;
  tasks: WorkerTask[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(worker)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        {worker ? (
          <>
            <DialogHeader className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between gap-4 pr-6">
                <div>
                  <DialogTitle className="text-xl text-slate-900">
                    Tareas de {worker.name}
                  </DialogTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    Consulta las tareas asignadas y el histórico de tareas completadas.
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-3">
              <button
                type="button"
                onClick={() => onFilterChange("assigned")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  filter === "assigned"
                    ? "bg-[#102A66] text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                Todas las asignadas
              </button>
              <button
                type="button"
                onClick={() => onFilterChange("completed")}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  filter === "completed"
                    ? "bg-[#102A66] text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                Completadas
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              {loading ? (
                <div className="flex min-h-[220px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#102A66]" />
                </div>
              ) : tasks.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <p className="mt-4 font-semibold text-slate-700">No hay tareas</p>
                  <p className="mt-1 text-sm text-slate-400">
                    No hay tareas que mostrar en este filtro.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {tasks.map((task) => (
                    <div key={task.id} className="py-4 first:pt-1 last:pb-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">{task.title}</p>
                          {task.description ? (
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">
                              {task.description}
                            </p>
                          ) : null}
                        </div>
                        <Badge variant="outline" className={statusClass(task.status)}>
                          {statusLabel(task.status)}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                        {task.priority ? <span>Prioridad: {task.priority}</span> : null}
                        <span>Creada: {formatDate(task.created_at)}</span>
                        {task.due_at ? <span>Vencimiento: {formatDate(task.due_at)}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function WorkerProfiles() {
  const { hasPermission } = useAuth();
  const [, setLocation] = useLocation();
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<WorkerProfile | null>(null);
  const [taskFilter, setTaskFilter] = useState<WorkerTaskFilter>("assigned");
  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  const allowed = hasPermission(WORKER_PROFILE_PERMISSIONS.read);

  const loadWorkers = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("get_direction_worker_profiles");
      if (rpcError) throw rpcError;
      setWorkers((data || []) as WorkerProfile[]);
    } catch (err: any) {
      setError(err?.message || "No se han podido cargar los perfiles de trabajadores.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadTasks = useCallback(async (workerId: string, filter: WorkerTaskFilter) => {
    setTasksLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_direction_worker_tasks", {
        p_worker_id: workerId,
        p_filter: filter,
      });
      if (rpcError) throw rpcError;
      setTasks((data || []) as WorkerTask[]);
    } catch (err: any) {
      setTasks([]);
      setError(err?.message || "No se han podido cargar las tareas del trabajador.");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) loadWorkers();
  }, [allowed, loadWorkers]);

  useEffect(() => {
    if (selectedWorker) loadTasks(selectedWorker.worker_id, taskFilter);
  }, [selectedWorker, taskFilter, loadTasks]);

  const roles = useMemo(() => {
    const map = new Map<string, string>();
    workers.forEach((worker) => {
      worker.roles.forEach((role) => map.set(role.code, roleLabel(role.code, role.name)));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [workers]);

  const filteredWorkers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return workers.filter((worker) => {
      const matchesRole =
        roleFilter === "all" || worker.roles.some((role) => role.code === roleFilter);
      const matchesSearch =
        !normalizedSearch ||
        worker.name.toLowerCase().includes(normalizedSearch) ||
        (worker.email || "").toLowerCase().includes(normalizedSearch);
      return matchesRole && matchesSearch;
    });
  }, [workers, roleFilter, search]);

  if (!allowed) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                <Users className="h-4 w-4" />
                <span>Administración</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span>Perfiles</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Perfiles de trabajadores</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Consulta el equipo, su rol y el estado de sus tareas internas.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => loadWorkers(true)}
              disabled={refreshing}
              className="w-fit border-slate-200 bg-white"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Actualizar</span>
            </Button>
          </div>

          {error ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <Card className="border-slate-200 bg-white shadow-none">
            <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
                <button
                  type="button"
                  onClick={() => setRoleFilter("all")}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    roleFilter === "all" ? "bg-[#102A66] text-white" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  Todos
                </button>
                {roles.map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setRoleFilter(code)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      roleFilter === code ? "bg-[#102A66] text-white" : "text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative w-full lg:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar trabajador..."
                  className="h-10 border-slate-200 pl-9"
                />
              </div>
            </div>
          </Card>

          {loading ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-[#102A66]" />
            </div>
          ) : filteredWorkers.length === 0 ? (
            <Card className="border-slate-200 bg-white shadow-none">
              <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                  <BriefcaseBusiness className="h-6 w-6" />
                </div>
                <h2 className="mt-4 font-semibold text-slate-800">No hay trabajadores</h2>
                <p className="mt-1 max-w-md text-sm text-slate-400">
                  No hay perfiles que coincidan con los filtros actuales.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredWorkers.map((worker) => (
                <WorkerCard
                  key={worker.worker_id}
                  worker={worker}
                  onOpen={() => {
                    setSelectedWorker(worker);
                    setTaskFilter("assigned");
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <WorkerTasksDialog
        worker={selectedWorker}
        filter={taskFilter}
        onFilterChange={setTaskFilter}
        tasks={tasks}
        loading={tasksLoading}
        onClose={() => setSelectedWorker(null)}
      />
    </div>
  );
}
