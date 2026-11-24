import { UserEditor } from "@/features/management";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserEditor id={id} />;
}
