import { MobileSurveyDetail } from "@/features/mobile-survey-detail";
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <MobileSurveyDetail id={id}/>;
}
