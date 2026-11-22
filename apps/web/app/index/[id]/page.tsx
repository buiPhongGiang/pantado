import IndexView from "../../../src/ui/index-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IndexView id={id} />;
}
