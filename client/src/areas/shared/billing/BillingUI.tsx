import type { ReactNode } from "react";
import { AlertCircle, Calculator, CreditCard, FileCheck2, FileText, Loader2, ReceiptText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, normalizedStatus, money } from "./billingTypes";
import type { InvoiceStatus } from "./billingTypes";

export function InvoiceStatusBadge({ status }: { status: unknown }) {
  const normalized = normalizedStatus(status);
  const styles: Record<InvoiceStatus, string> = { borrador: "border-none bg-gray-100 text-gray-600 hover:bg-gray-100",pendiente: "border-none bg-amber-100 text-amber-700 hover:bg-amber-100", pagada: "border-none bg-green-100 text-green-700 hover:bg-green-100", vencida: "border-none bg-red-100 text-red-700 hover:bg-red-100", cancelada: "border-none bg-gray-100 text-gray-600 hover:bg-gray-100" };
  return <Badge className={styles[normalized]}>{STATUS_LABELS[normalized]}</Badge>;
}

export function InvoiceIcon({ large = false }: { large?: boolean }) {
  return <div className={`flex shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A] ${large ? "h-12 w-12" : "h-9 w-9"}`}><ReceiptText className={large ? "h-5 w-5" : "h-4 w-4"} /></div>;
}

export function Loading({ text = "Cargando…" }: { text?: string }) {
  return <div className="flex min-h-[420px] flex-col items-center justify-center border border-slate-200 bg-white"><Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]"/><p className="mt-4 text-sm font-medium text-slate-600">{text}</p></div>;
}

export function AccessDenied() {
  return <div className="border border-slate-200 bg-white p-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-slate-400"/><h2 className="mt-3 font-semibold text-slate-800">Acceso no disponible</h2><p className="mt-1 text-sm text-slate-500">Este rol no tiene permiso para consultar facturación.</p></div>;
}

export function ErrorMessage({ message }: { message: string }) { return <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{message}</span></div>; }

export function Section({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <section className="border-b border-gray-200 pb-6"><div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3"><div className="flex items-center gap-2"><span className="text-[#1E3A8A]">{icon}</span><h2 className="text-sm font-semibold text-gray-900">{title}</h2></div>{action}</div><div className="pt-5">{children}</div></section>;
}

export function Field({ label, required, children, className = "" }: { label: string; required?: boolean; children: ReactNode; className?: string }) { return <div className={className}><label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}{required && <span className="ml-1 text-red-500">*</span>}</label>{children}</div>; }

export function MetricCard({ icon, label, value, helper, emphasized }: { icon: ReactNode; label: string; value: ReactNode; helper?: ReactNode; emphasized?: boolean }) { return <div className={`border border-slate-200 bg-white p-4 ${emphasized ? "border-blue-200" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-800">{value}</p>{helper && <p className="mt-1 text-xs text-slate-400">{helper}</p>}</div><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">{icon}</div></div></div>; }

export function InfoBlock({ icon, label, value, secondary }: { icon?: ReactNode; label: string; value: ReactNode; secondary?: ReactNode }) { return <div className="flex gap-3"><div className="mt-0.5 text-gray-400">{icon}</div><div className="min-w-0"><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-gray-800">{value}</p>{secondary && <p className="mt-0.5 break-all text-xs text-gray-500">{secondary}</p>}</div></div>; }

export function InfoMini({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) { return <div><p className="text-gray-500">{label}</p><p className={`mt-0.5 truncate ${strong ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>{value}</p></div>; }

export function TotalRow({ label, value, strong, emphasized }: { label: string; value: ReactNode; strong?: boolean; emphasized?: boolean }) { return <div className={`flex items-center justify-between gap-4 ${emphasized ? "text-[#1E3A8A]" : ""}`}><span className={strong ? "font-semibold" : "text-gray-600"}>{label}</span><span className={strong ? `font-bold ${emphasized ? "text-lg" : "text-gray-900"}` : "font-medium text-gray-800"}>{value}</span></div>; }

export function BackendRules() { return <div className="border-blue-100 bg-blue-50/60"><div className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A8A]"/><div><p className="text-sm font-semibold text-[#1E3A8A]">Reglas del backend</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-gray-600"><li>• El número de factura se genera en backend.</li><li>• Empresa y proyecto se validan conjuntamente.</li><li>• IVA, IRPF, bruto y a pagar se recalculan en BD.</li><li>• Crear, editar y eliminar usan las RPC del worker.</li><li>• El PDF se almacena en un bucket privado.</li><li>• “Pagada” depende de un pago confirmado.</li></ul></div></div></div>; }

export function DocumentBadge({ attached }: { attached: boolean }) { return attached ? <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700"><FileCheck2 className="mr-1 h-3.5 w-3.5"/>PDF adjunto</Badge> : <Badge variant="outline" className="border-gray-200 bg-white text-gray-500">Sin PDF</Badge>; }

export const fiscalIcons = { base: <Calculator className="h-4 w-4"/>, total: <ReceiptText className="h-4 w-4"/>, payable: <CreditCard className="h-4 w-4"/>, invoice: <FileText className="h-4 w-4"/> };
