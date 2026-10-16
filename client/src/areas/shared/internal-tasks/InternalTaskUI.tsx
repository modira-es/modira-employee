import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  Flag,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  InternalTaskPriority,
  InternalTaskStatus,
  PRIORITY_OPTIONS,
  statusLabel,
  priorityLabel,
} from "./internalTaskTypes";

export function Section({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {icon}
          {title}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      <FileText className="mx-auto h-8 w-8 text-slate-400" />
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
    </div>
  );
}

export function LoadingState({ text = "Cargando..." }: { text?: string }) {
  return <div className="flex min-h-[240px] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{text}</div>;
}

export function StatusBadge({ status }: { status: InternalTaskStatus }) {
  const cls: Record<InternalTaskStatus, string> = {
    to_do: "bg-slate-100 text-slate-700",
    in_progress: "bg-blue-50 text-blue-700",
    pending_review: "bg-amber-50 text-amber-700",
    completed: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-red-50 text-red-700",
  };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cls[status]}`}>{statusLabel(status)}</span>;
}

export function PriorityBadge({ priority }: { priority: InternalTaskPriority }) {
  const icon = priority === "urgent" || priority === "high" ? <Flag className="h-3.5 w-3.5" /> : null;
  return <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">{icon}{priorityLabel(priority)}</span>;
}

export function ProgressBar({ value }: { value: number }) {
  return <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#1E3A8A] transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-medium text-slate-500">{icon}{label}</div><p className="mt-2 text-lg font-bold text-slate-900">{value}</p>{detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}</div>;
}

export function TaskSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Buscar tareas..." className="pl-9" /></div>;
}

export function ActionButton({ children, icon, ...props }: React.ComponentProps<typeof Button> & { icon?: React.ReactNode }) {
  return <Button {...props}>{icon}{children}</Button>;
}

export const taskIcons = { CheckCircle2, Clock3, MessageSquare, Play, RotateCcw, ShieldCheck, User, XCircle, AlertCircle };
export { PRIORITY_OPTIONS };
export { Textarea };
