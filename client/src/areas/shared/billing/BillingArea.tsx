import { useCallback } from "react";
import { useLocation } from "wouter";
import Billing from "./Billing";
import InvoiceCreate from "./InvoiceCreate";
import InvoiceDetail from "./InvoiceDetail";

export default function BillingArea({ basePath = "/employee/billing" }: { basePath?: string }) {
  const [location, setLocation] = useLocation();
  const normalizedBase = basePath.replace(/\/$/, "");
  const rest = location.startsWith(`${normalizedBase}/`) ? location.slice(`${normalizedBase}/`.length) : "";
  if (location === `${normalizedBase}/new` || rest === "new") return <InvoiceCreate basePath={normalizedBase}/>;
  const detailId = rest && rest !== "new" ? rest.split("/")[0] : null;
  if (detailId) return <InvoiceDetail invoiceId={detailId} basePath={normalizedBase}/>;
  return <Billing basePath={normalizedBase} onCreate={()=>setLocation(`${normalizedBase}/new`)} onOpen={invoice=>setLocation(`${normalizedBase}/${invoice.id}`)}/>;
}
