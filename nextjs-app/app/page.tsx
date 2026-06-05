import { connection } from "next/server";
import { redirect } from "next/navigation";
import EvaluatorClient from "./EvaluatorClient";
import { verifySiteAuthFromCookies } from "@/lib/requireSiteAuth";

export default async function Page() {
  await connection();
  const authed = await verifySiteAuthFromCookies();
  if (!authed) redirect("/login");
  return <EvaluatorClient />;
}
