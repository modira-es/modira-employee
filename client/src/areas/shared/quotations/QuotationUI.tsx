
import type { ReactNode } from "react";
import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { QuotationStatus } from "./quotationTypes";

export function QuotationStatusBadge({ status }: { status: QuotationStatus }) {
  const styles: Record<QuotationStatus,string> = {
    Pendiente: "border-amber-200 bg-amber-50 text-amber-700",
    Aceptado: "border-emerald-200 bg-emerald-50 text-emerald-700",
    Rechazado: "border-red-200 bg-red-50 text-red-700",
  };
  const dots: Record<QuotationStatus,string> = {
    Pendiente: "bg-amber-500", Aceptado: "bg-emerald-500", Rechazado: "bg-red-500",
  };
  return <Badge variant="outline" className={styles[status]}>
    <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${dots[status]}`} />{status}
  </Badge>;
}

export function Section({title,icon,action,children}:{title:string;icon?:ReactNode;action?:ReactNode;children:ReactNode}) {
  return <section className="border-b border-gray-200 pb-6">
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
      <div className="flex items-center gap-2"><span className="text-[#1E3A8A]">{icon}</span><h2 className="text-sm font-semibold text-gray-900">{title}</h2></div>{action}
    </div><div className="pt-5">{children}</div>
  </section>;
}
export function Field({label,required,children,className=""}:{label:string;required?:boolean;children:ReactNode;className?:string}) {
  return <div className={className}><label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}{required&&<span className="ml-1 text-red-500">*</span>}</label>{children}</div>;
}
export function TotalRow({label,value,strong,emphasized}:{label:string;value:ReactNode;strong?:boolean;emphasized?:boolean}) {
  return <div className={`flex items-center justify-between gap-4 ${emphasized?"text-[#1E3A8A]":""}`}><span className={strong?"font-semibold":"text-gray-600"}>{label}</span><span className={strong?`font-bold ${emphasized?"text-lg":"text-gray-900"}`:"font-medium text-gray-800"}>{value}</span></div>;
}
export function ErrorBox({message}:{message:string}) {
  return <div className="border border-red-200 bg-red-50 p-4"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600"/><div><p className="font-semibold text-red-800">Se ha producido un error</p><p className="mt-1 text-sm text-red-700">{message}</p></div></div></div>;
}
export function Loading({text="Cargando…"}:{text?:string}) {
  return <div className="flex min-h-[420px] flex-col items-center justify-center border border-slate-200 bg-white"><Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]"/><p className="mt-4 text-sm font-medium text-slate-600">{text}</p></div>;
}
export function QuotationIcon({large=false}:{large?:boolean}) {
  return <div className={`flex shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A] ${large?"h-12 w-12 rounded-2xl":"h-9 w-9"}`}><FileText className={large?"h-6 w-6":"h-4 w-4"}/></div>;
}
export function PageHeader({title,subtitle}:{title:string;subtitle:string}) {
  return <div><p className="text-sm font-semibold text-[#263044]">{title}</p><p className="text-xs text-[#939CAA]">{subtitle}</p></div>;
}
