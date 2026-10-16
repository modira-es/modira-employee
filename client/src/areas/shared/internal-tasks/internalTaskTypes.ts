export type InternalTaskStatus =
  | "to_do"
  | "in_progress"
  | "pending_review"
  | "completed"
  | "cancelled";

export type InternalTaskPriority = "low" | "normal" | "high" | "urgent";

export interface InternalTask {
  id: string;
  title: string;
  description: string | null;
  created_by_worker_id: string;
  assigned_to_worker_id: string | null;
  status: InternalTaskStatus;
  progress: number;
  priority: InternalTaskPriority;
  due_at: string | null;
  started_at: string | null;
  submitted_for_review_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  completed_by_worker_id: string | null;
  cancelled_by_worker_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InternalTaskUpdate {
  id: string;
  task_id: string;
  actor_worker_id: string;
  action: string;
  old_status: InternalTaskStatus | null;
  old_progress: number | null;
  new_status: InternalTaskStatus | null;
  new_progress: number | null;
  comment: string | null;
  created_at: string;
}

export interface InternalTaskVisibility {
  workers: Array<{
    worker_id: string;
    display_name: string;
    created_at?: string;
  }>;
  roles: Array<{
    role_id: string;
    code: string;
    name: string;
    created_at?: string;
  }>;
}

export interface TaskWorkerOption {
  id: string;
  display_name: string;
}

export const INTERNAL_TASK_PERMISSIONS = {
  read: "internal_tasks.read",
  create: "internal_tasks.create",
  update: "internal_tasks.update",
  assign: "internal_tasks.assign",
  review: "internal_tasks.review",
  complete: "internal_tasks.complete",
  delete: "internal_tasks.delete",
  manageVisibility: "internal_tasks.manage_visibility",
} as const;

export const TASK_WORKERS_READ_PERMISSION = "task_workers.read";

export const STATUS_OPTIONS: Array<{ value: InternalTaskStatus; label: string }> = [
  { value: "to_do", label: "Por hacer" },
  { value: "in_progress", label: "En progreso" },
  { value: "pending_review", label: "Pendiente de revisión" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Anulada" },
];

export const PRIORITY_OPTIONS: Array<{ value: InternalTaskPriority; label: string }> = [
  { value: "low", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export function statusLabel(status: InternalTaskStatus) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

export function priorityLabel(priority: InternalTaskPriority) {
  return PRIORITY_OPTIONS.find((item) => item.value === priority)?.label ?? priority;
}

export function historyActionLabel(action: string) {
  const labels: Record<string, string> = {
    created: "Tarea creada",
    assigned: "Tarea asignada",
    reassigned: "Responsable cambiado",
    visibility_changed: "Visibilidad actualizada",
    started: "Tarea iniciada",
    progress_updated: "Progreso actualizado",
    commented: "Comentario añadido",
    submitted_for_review: "Enviada a revisión",
    reviewed: "Tarea revisada",
    returned_to_progress: "Devuelta a progreso",
    completed: "Tarea completada",
    cancelled: "Tarea anulada",
    reopened: "Tarea reabierta",
    updated: "Tarea actualizada",
  };

  return labels[action] ?? action;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(value));
}
