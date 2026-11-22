import AssetView from "../../../src/ui/asset-view";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssetView id={decodeURIComponent(id).toLowerCase()} />;
}
