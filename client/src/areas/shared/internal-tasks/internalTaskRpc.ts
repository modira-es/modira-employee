import { supabase } from "@/lib/supabase";
import { InternalTask, TaskWorkerOption } from "./internalTaskTypes";

export async function getInternalTaskWorkerOptions(): Promise<TaskWorkerOption[]> {
  const { data, error } = await supabase.rpc("get_task_worker_options");
  if (error) throw error;
  return (data ?? []) as TaskWorkerOption[];
}

export async function getInternalTask(taskId: string) {
  const { data, error } = await supabase.rpc("get_internal_task", {
    p_task_id: taskId,
  });
  if (error) throw error;
  return data as InternalTask;
}

export async function getInternalTasks(status: string | null) {
  const { data, error } = await supabase.rpc("get_internal_tasks", {
    p_status: status,
    p_limit: 100,
    p_offset: 0,
  });
  if (error) throw error;
  return (data ?? []) as InternalTask[];
}
