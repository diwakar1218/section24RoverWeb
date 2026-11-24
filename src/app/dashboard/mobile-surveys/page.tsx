import { MobileSurveys } from "@/features/mobile-surveys";
import { MobileSurveyDetail } from "@/features/mobile-survey-detail";
export default async function Page({searchParams}:{searchParams:Promise<{session?:string|string[]}>}) {
  const {session}=await searchParams;
  if(typeof session==="string"&&session)return <MobileSurveyDetail id={session}/>;
  return <MobileSurveys/>;
}
