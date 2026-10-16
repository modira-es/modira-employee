export type ProjectTaskStatus =
  | "to_do"
  | "in_progress"
  | "pending_review"
  | "completed"
  | "cancelled";

export type ProjectTaskPriority = "low" | "normal" | "high" | "urgent";

export interface ProjectTask {
  id: string;
  project_id: string;
  milestone_id: string | null;
  title: string;
  description: string | null;
  created_by_worker_id: string;
  assigned_to_worker_id: string | null;

  // Recomendación de responsable realizada al crear la tarea.
  // No implica asignación real: la asignación definitiva la hace Dirección.
  recommended_worker_id: string | null;

  status: ProjectTaskStatus;
  progress: number;
  priority: ProjectTaskPriority;
  due_at: string | null;
  started_at: string | null;
  submitted_for_review_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  completed_by_worker_id: string | null;
  cancelled_by_worker_id: string | null;
  created_at: string;
  updated_at: string;

  project_name?: string | null;
  milestone_name?: string | null;
  responsible_name?: string | null;

  // Nombre del trabajador recomendado, cuando esté disponible.
  recommended_worker_name?: string | null;
}

export interface ProjectTaskVisibilityEntry {
  worker_id: string | null;
  worker_name: string | null;
  role_id: string | null;
  role_code: string | null;
  role_name: string | null;
}

export interface ProjectTaskRoleOption {
  id: string;
  code: string;
  name: string;
}

export interface ProjectTaskHistory {
  id: string;
  task_id: string;
  actor_worker_id: string;
  action: string;
  old_status: ProjectTaskStatus | null;
  old_progress: number | null;
  new_status: ProjectTaskStatus | null;
  new_progress: number | null;
  comment: string | null;
  created_at: string;
  actor_name?: string | null;
}

export interface ProjectOption {
  id: string;
  nombre: string;
}

export interface MilestoneOption {
  id: string;
  project_id: string;
  nombre: string;
}

export interface WorkerOption {
  id: string;
  name: string;
  email?: string | null;
}

export interface ProjectTaskFilters {
  projectId: string;
  milestoneId: string;
  status: string;
  priority: string;
  workerId: string;
  search: string;
}