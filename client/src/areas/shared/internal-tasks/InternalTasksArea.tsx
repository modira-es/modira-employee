import React from "react";
import { useLocation } from "wouter";
import InternalTasks from "./InternalTasks";
import InternalTaskDetail from "./InternalTaskDetail";

interface Props {
  basePath?: string;
  taskId?: string;
}

export default function InternalTasksArea({
  basePath = "/employee/tasks",
  taskId,
}: Props) {
  const [, navigate] = useLocation();
  const base = basePath.replace(/\/$/, "");

  if (taskId) {
    return (
      <InternalTaskDetail
        taskId={taskId}
        onBack={() => navigate(base)}
      />
    );
  }

  return (
    <InternalTasks
      basePath={base}
      onOpenTask={(id) => navigate(`${base}/${id}`)}
    />
  );
}
