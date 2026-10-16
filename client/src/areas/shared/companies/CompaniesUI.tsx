import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export const textValue = (value: unknown) =>
  value === null || value === undefined || String(value).trim() === "" ? "—" : String(value);

export const formatDate = (value: unknown, withTime = false) => {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
};

export const formatMoney = (value: unknown, currency = "EUR") => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(number);
};

export const paymentAmount = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number / 100 : 0;
};

export const statusLabel = (value: unknown) => {
  const status = normalize(value);
  const labels: Record<string, string> = {
    activo: "Activo", active: "Activo", inactivo: "Inactivo", inactive: "Inactivo",
    pausado: "Pausado", cancelado: "Cancelado", cancelled: "Cancelada",
    finalizado: "Finalizado", pendiente: "Pendiente", pending: "Pendiente",
    aprobado: "Aprobado", approved: "Aprobada", rechazado: "Rechazado", rejected: "Rechazada",
    aceptado: "Aceptado", accepted: "Aceptado", pagada: "Pagada", pagado: "Pagado",
    vencida: "Vencida", borrador: "Borrador", cerrado: "Cerrado", abierto: "Abierto",
  };
  return labels[status] || textValue(value);
};

const badgeClass = (value: unknown) => {
  const status = normalize(value);
  if (["activo", "active", "pagada", "pagado", "aceptado", "accepted", "aprobado", "approved"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["pendiente", "pending", "borrador", "pausado"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-700";
  if (["error", "rechazado", "rejected", "vencida", "cancelado", "cancelled", "inactivo", "inactive"].includes(status)) return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
};

export function StatusBadge({ value }: { value: unknown }) {
  return <Badge variant="outline" className={`${badgeClass(value)} whitespace-nowrap font-semibold`}>{statusLabel(value)}</Badge>;
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#F7F8FA] text-[#172033]"><div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">{children}</div></div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">Operaciones</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-[#172033] sm:text-3xl">{title}</h1><p className="mt-1 text-sm text-[#7B8594]">{subtitle}</p></div>{action}</div>;
}

export function PageLoading({ text = "Cargando empresas..." }: { text?: string }) {
  return <Card className="border-slate-200 bg-white shadow-none"><div className="flex min-h-[420px] flex-col items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]"/><p className="mt-4 text-sm font-medium text-slate-600">{text}</p></div></Card>;
}

export function ErrorBox({ message }: { message: string }) {
  return <Card className="border-red-200 bg-red-50 shadow-none"><div className="p-4 text-sm text-red-700"><p className="font-semibold text-red-800">Se ha producido un error</p><p className="mt-1">{message}</p></div></Card>;
}

export function SummaryCard({ label, value, detail, icon }: { label: string; value: ReactNode; detail: string; icon: ReactNode }) {
  return <Card className="border-slate-200 bg-white p-4 shadow-none"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">{icon}</div></div></Card>;
}

export function Section({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F7FB] text-[#1E3A8A]">{icon}</div><h2 className="truncate text-sm font-semibold text-[#263044]">{title}</h2></div>{action}</div>{children}</section>;
}

export function EmptyState({ text }: { text: string }) { return <div className="px-5 py-10 text-center text-sm text-slate-400">{text}</div>; }
export function DetailRow({ label, value }: { label: string; value: ReactNode }) { return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">{label}</p><p className="mt-1 break-words text-sm text-[#344154]">{value}</p></div>; }
export function TableShell({ children }: { children: ReactNode }) { return <div className="overflow-x-auto">{children}</div>; }
export function ActionButton({ children, disabled, onClick, variant = "default" }: { children: ReactNode; disabled?: boolean; onClick: () => void; variant?: "default" | "outline" }) { return <Button type="button" variant={variant} disabled={disabled} onClick={onClick} className={variant === "default" ? "h-9 bg-[#1E3A8A] px-3 text-xs text-white shadow-none hover:bg-[#17306F]" : "h-9 border-[#E2E7ED] px-3 text-xs text-[#536074] shadow-none"}>{children}</Button>; }
