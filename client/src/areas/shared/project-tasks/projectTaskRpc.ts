
import { supabase } from "@/lib/supabase";
import type {
  MilestoneOption,
  ProjectOption,
  ProjectTask,
  ProjectTaskHistory,
  WorkerOption,
  ProjectTaskVisibilityEntry,
  ProjectTaskRoleOption,
} from "./projectTaskTypes";

/**
 * Adapter único de RPC para Project Tasks.
 *
 * 133 crea las tablas y 134 protege RLS/privilegios.
 * Las escrituras/lecturas pasan por RPC SECURITY DEFINER de la
 * migración 135. Si los nombres definitivos de 135 cambian,
 * solo hay que tocar este archivo.
 */

export async function getProjectTasks() {
  const { data, error } = await supabase.rpc("get_project_tasks", {});
  if (error) throw error;
  return (data ?? []) as ProjectTask[];
}

export async function getProjectTask(taskId: string) {
  const { data, error } = await supabase.rpc("get_project_task", {
    p_task_id: taskId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as ProjectTask | null;
}

export async function createProjectTask(payload: {
  p_project_id: string;
  p_milestone_id: string | null;
  p_title: string;
  p_description: string | null;
  p_priority: string;
  p_due_at: string | null;
  p_assigned_to_worker_id: string | null;
  p_recommended_worker_id: string | null;
}) {
  const { data, error } = await supabase.rpc("create_project_task", {
    p_project_id: payload.p_project_id,
    p_title: payload.p_title,
    p_description: payload.p_description,
    p_milestone_id: payload.p_milestone_id,
    p_assigned_to_worker_id: payload.p_assigned_to_worker_id,
    p_recommended_worker_id: payload.p_recommended_worker_id,
    p_priority: payload.p_priority,
    p_due_at: payload.p_due_at,
  });

  if (error) throw error;
  return data as ProjectTask;
}

export async function updateProjectTask(
  taskId: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await supabase.rpc("update_project_task", {
    p_task_id: taskId,
    p_title: (payload.title as string | null | undefined) ?? null,
    p_description: (payload.description as string | null | undefined) ?? null,
    p_milestone_id: (payload.milestone_id as string | null | undefined) ?? null,
    p_priority: (payload.priority as string | null | undefined) ?? null,
    p_due_at: (payload.due_at as string | null | undefined) ?? null,
  });
  if (error) throw error;
  return data as ProjectTask;
}

export async function startProjectTask(taskId: string) {
  const { data, error } = await supabase.rpc("start_project_task", {
    p_task_id: taskId,
  });
  if (error) throw error;
  return data as ProjectTask;
}

export async function updateProjectTaskProgress(
  taskId: string,
  progress: number,
  comment?: string | null,
) {
  // La migración 135 define update_project_task_progress(UUID, INTEGER).
  // El comentario de progreso se registra mediante la RPC existente
  // add_project_task_comment(UUID, TEXT), sin necesidad de una migración nueva.
  const { data, error } = await supabase.rpc("update_project_task_progress", {
    p_task_id: taskId,
    p_progress: progress,
  });

  if (error) throw error;

  const cleanComment = comment?.trim();
  if (cleanComment) {
    const { error: commentError } = await supabase.rpc(
      "add_project_task_comment",
      {
        p_task_id: taskId,
        p_comment: cleanComment,
      },
    );

    if (commentError) throw commentError;
  }

  return data as ProjectTask;
}

export async function submitProjectTaskForReview(
  taskId: string,
  comment?: string | null,
) {
  const { data, error } = await supabase.rpc("submit_project_task_for_review", {
    p_task_id: taskId,
    p_comment: comment ?? null,
  });
  if (error) throw error;
  return data as ProjectTask;
}

export async function reviewProjectTask(
  taskId: string,
  decision: "approved" | "returned",
  comment: string | null,
) {
  const { data, error } = await supabase.rpc("review_project_task", {
    p_task_id: taskId,
    p_approved: decision === "approved",
    p_comment: comment,
  });
  if (error) throw error;
  return data as ProjectTask;
}

export async function reassignProjectTask(
  taskId: string,
  workerId: string | null,
  comment: string | null,
) {
  const { data, error } = await supabase.rpc("reassign_project_task", {
    p_task_id: taskId,
    p_assigned_to_worker_id: workerId,
  });
  if (error) throw error;
  return data as ProjectTask;
}

export async function directionSetProjectTaskState(
  taskId: string,
  state: "to_do" | "in_progress" | "cancelled",
  comment: string | null,
) {
  const { data, error } = await supabase.rpc("direction_set_project_task_state", {
    p_task_id: taskId,
    p_status: state,
    p_comment: comment,
  });
  if (error) throw error;
  return data as ProjectTask;
}

export async function deleteProjectTask(taskId: string, reason: string) {
  const { data, error } = await supabase.rpc("delete_project_task", {
    p_task_id: taskId,
    p_comment: reason,
  });
  if (error) throw error;
  return data as ProjectTask;
}

export async function addProjectTaskComment(taskId: string, comment: string) {
  const { data, error } = await supabase.rpc("add_project_task_comment", {
    p_task_id: taskId,
    p_comment: comment,
  });
  if (error) throw error;
  return data as ProjectTaskHistory;
}

export async function getProjectTaskHistory(taskId: string) {
  const { data, error } = await supabase.rpc("get_project_task_history", {
    p_task_id: taskId,
  });
  if (error) throw error;
  return (data ?? []) as ProjectTaskHistory[];
}

/**
 * Project/milestone/worker options.
 * 134 revoca SELECT directo sobre project_tasks, no sobre projects/workers.
 * Estas lecturas usan las relaciones ya existentes del worker area.
 */
export async function getProjectTaskVisibility(taskId: string) {
  const { data, error } = await supabase.rpc("get_project_task_visibility", {
    p_task_id: taskId,
  });
  if (error) throw error;
  return (data ?? []) as ProjectTaskVisibilityEntry[];
}

export async function setProjectTaskVisibility(
  taskId: string,
  workerIds: string[],
  roleIds: string[],
) {
  const { data, error } = await supabase.rpc("set_project_task_visibility", {
    p_task_id: taskId,
    p_worker_ids: workerIds,
    p_role_ids: roleIds,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function getProjectTaskRoleOptions() {
  const { data, error } = await supabase
    .from("worker_roles")
    .select("id,code,name")
    .eq("is_active", true)
    .eq("code", "developer")
    .order("name");

  if (error) return [] as ProjectTaskRoleOption[];
  return (data ?? []) as ProjectTaskRoleOption[];
}

export async function getProjectOptions() {
  const { data, error } = await supabase
    .from("projects")
    .select("id,nombre")
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as ProjectOption[];
}

export async function getMilestoneOptions() {
  const { data, error } = await supabase
    .from("project_milestones")
    .select("id,project_id,nombre")
    .order("orden")
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as MilestoneOption[];
}

export async function getWorkerOptions() {
  const { data, error } = await supabase.rpc("get_task_worker_options");
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.display_name || "Trabajador",
  })) as WorkerOption[];
}
