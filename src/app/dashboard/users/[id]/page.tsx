import { UserManagementDetails } from "@/features/management";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <UserManagementDetails id={id} />;
}
