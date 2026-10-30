export default async function PublicResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  return (
    <main>
      <h1>public result {id}</h1>
    </main>
  );
}
