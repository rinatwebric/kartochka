export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return (
    <main>
      <h1>studio {id}</h1>
    </main>
  );
}
