import CreateView from "../../src/ui/create-view";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** `/create`, `/create?draft=<base64url JSON>` (agent draft), `/create?fork=<indexAddress>` or `/create?edit=<indexAddress>` (new basket for your data index). */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  return <CreateView draft={one(q.draft)} fork={one(q.fork)} edit={one(q.edit)} />;
}
