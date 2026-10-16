import { useLocation } from "wouter";
import Companies from "./Companies";
import CompanyDetail from "./CompanyDetail";

export default function CompaniesArea({ basePath = "/employee/companies" }: { basePath?: string }) {
  const [location] = useLocation();
  const base = basePath.replace(/\/+$/, "");
  const prefix = `${base}/`;
  const id = location.startsWith(prefix) ? location.slice(prefix.length).split("/")[0] : null;
  return id ? <CompanyDetail companyId={id} basePath={base}/> : <Companies basePath={base}/>;
}
