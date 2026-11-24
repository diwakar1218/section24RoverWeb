import { RoverDetails } from "@/features/details";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RoverDetails id={id} />;
}
