export type MobileSurvey = {
  id:string; project:string; district:string; tehsil:string; village:string;
  projectId?:string; jobId?:string; jobName?:string; plotName?:string;
  gataNo?:string; caseNo?:string; address?:string; remark?:string;
  totalArea:number; totalDistance:number; totalPoints:number; startedAt:string; endedAt?:string;
  status:string; mode:string; landRecordSource?:string; provenance?:string;
  surveyorName?:string; userId?:string; roverSerial?:string; deviceId?:string;
  districtCode?:string;tehsilCode?:string;villageCode?:string;
};
export type MobilePoint = {
  id:string; pointNumber:string; name:string; latitude:number; longitude:number;
  address?:string; remark?:string; pointType?:string; capturedAt:string;
  altitude?:number; horizontalAccuracy?:number; verticalAccuracy?:number; fixType?:string;
};
export type MobileSurveyDetail = {session:MobileSurvey; points:MobilePoint[]; track:MobilePoint[]};
