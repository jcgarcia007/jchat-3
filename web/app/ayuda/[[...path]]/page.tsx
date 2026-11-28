// `/ayuda` and `/ayuda/...` are the Spanish alias of the help center: they redirect to the same path under `/help` with `?lang=es`
// (the middleware turns it into the language cookie). A route of the app, not a next.config.ts redirect. Only plain slug segments
// are followed, so the alias can never send anybody to another site.
import { redirect } from "next/navigation";

const SEGMENT = /^[a-z0-9-]+$/i;

export default async function AyudaAlias({ params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const segments = path.slice(0, 2).every((s) => SEGMENT.test(s)) ? path.slice(0, 2) : [];
  redirect(`/help${segments.length ? `/${segments.join("/")}` : ""}?lang=es`);
}
