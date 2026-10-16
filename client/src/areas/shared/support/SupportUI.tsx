import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle,
  Loader2,
  Ticket,
} from "lucide-react";
import type { TicketPriority, TicketStatus } from "./supportTypes";
import { priorityLabel, statusLabel } from "./supportTypes";

export function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <div>
          <p className="text-sm font-semibold text-[#263044]">{title}</p>
          <p className="mt-0.5 text-xs text-[#939CAA]">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}


export function TopPageHeader({
  eyebrow,
  subtitle,
}: {
  eyebrow: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#263044]">{eyebrow}</p>
        <p className="text-xs text-[#939CAA]">{subtitle}</p>
      </div>
    </div>
  );
}

export function PageLoading({ text }: { text: string }) {
  return (
    <Card className="border border-slate-200 bg-white shadow-none">
      <div className="flex min-h-[420px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
        <p className="mt-4 text-sm font-medium text-slate-600">{text}</p>
      </div>
    </Card>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <Card className="border border-red-200 bg-red-50 shadow-none">
      <div className="flex items-start gap-3 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div>
          <p className="font-semibold text-red-800">Se ha producido un error</p>
          <p className="mt-1 text-sm text-red-700">{message}</p>
        </div>
      </div>
    </Card>
  );
}

export function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <Card className="border border-slate-200 bg-white p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          {icon}
        </div>
      </div>
    </Card>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const styles: Record<TicketStatus, string> = {
    abierto: "border-blue-200 bg-blue-50 text-blue-700",
    en_progreso: "border-amber-200 bg-amber-50 text-amber-700",
    cerrado: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  const dots: Record<TicketStatus, string> = {
    abierto: "bg-blue-500",
    en_progreso: "bg-amber-500",
    cerrado: "bg-emerald-500",
  };

  return (
    <Badge variant="outline" className={`${styles[status]} whitespace-nowrap font-semibold`}>
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${dots[status]}`} />
      {statusLabel(status)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const styles: Record<TicketPriority, string> = {
    baja: "border-slate-200 bg-slate-50 text-slate-600",
    normal: "border-blue-200 bg-blue-50 text-blue-700",
    alta: "border-orange-200 bg-orange-50 text-orange-700",
    urgente: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <Badge variant="outline" className={`${styles[priority]} whitespace-nowrap font-semibold`}>
      {priorityLabel(priority)}
    </Badge>
  );
}

export function SupportSection({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          {icon ? <span className="text-[#1E3A8A]">{icon}</span> : null}
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 border-gray-200 bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SupportTicketIcon({ large = false }: { large?: boolean }) {
  return (
    <div className={[
      "flex shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]",
      large ? "h-12 w-12 rounded-2xl" : "h-9 w-9",
    ].join(" ")}>
      <Ticket className={large ? "h-6 w-6" : "h-4 w-4"} />
    </div>
  );
}

export function InfoMini({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={[
        "mt-1 truncate text-sm",
        strong ? "font-semibold text-gray-900" : "font-medium text-gray-700",
      ].join(" ")}>
        {value}
      </p>
    </div>
  );
}

