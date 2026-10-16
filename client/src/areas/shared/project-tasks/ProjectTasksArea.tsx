
import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import ProjectTasks from "./ProjectTasks";
import ProjectTaskDetail from "./ProjectTaskDetail";
import {
  getMilestoneOptions,
  getProjectOptions,
  getProjectTask,
  getProjectTasks,
  getWorkerOptions,
  getProjectTaskRoleOptions,
} from "./projectTaskRpc";
import type { MilestoneOption, ProjectOption, ProjectTask, ProjectTaskRoleOption, WorkerOption } from "./projectTaskTypes";

export default function ProjectTasksArea({
  basePath = "/employee/project-tasks",
}: {
  basePath?: string;
}) {
  const { hasPermission } = useAuth();
  const [, navigate] = useLocation();
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [milestones, setMilestones] = useState<MilestoneOption[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);
  const [roles, setRoles] = useState<ProjectTaskRoleOption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
        const [taskRows, projectRows, milestoneRows, workerRows, roleRows] =
        await Promise.all([
          getProjectTasks(),
          getProjectOptions(),
          getMilestoneOptions(),
          // get_task_worker_options() aplica task_workers.read en backend.
          // No bloqueamos esta carga con un mapa de permisos frontend
          // que podría quedar desactualizado.
          getWorkerOptions(),
          hasPermission("system.workers.read")
            ? getProjectTaskRoleOptions()
            : Promise.resolve([]),
        ]);
      setTasks(taskRows);
      setProjects(projectRows);
      setMilestones(milestoneRows);
      setWorkers(workerRows);
      setRoles(roleRows.filter((role) => role.code === "developer"));
    } catch (err: any) {
      console.error("[ProjectTasksArea] load:", err);
      toast.error(err?.message || "No se pudieron cargar las tareas de proyectos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [hasPermission]);

  return (
    <Switch>
      <Route path={`${basePath}/:id`} component={({ params }) => (
        <ProjectTaskDetail
          taskId={params.id}
          basePath={basePath}
          workers={workers}
          projects={projects}
          milestones={milestones}
          roles={roles}
          onChanged={load}
        />
      )} />
      <Route path={basePath} component={() => (
        <ProjectTasks
          tasks={tasks}
          projects={projects}
          milestones={milestones}
          workers={workers}
          loading={loading}
          onRefresh={load}
          basePath={basePath}
        />
      )} />
      <Route>
  <div />
</Route>
    </Switch>
  );
}
