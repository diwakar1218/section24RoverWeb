import type {RoverView} from "@/types";
export function roverIsActive(rover:RoverView) {
  return rover.connectionStatus==="Online"&&rover.receivingGnss;
}
export function roverActivity(rover:RoverView) {
  const active=roverIsActive(rover), unknown=rover.connectionStatus==="Unknown"||rover.data.telemetryAvailable===false;
  const observed=rover.data.lastActiveAt??rover.data.observedAt;
  const time=observed?Date.parse(observed):NaN;
  const inferred=!active&&!unknown&&Number.isFinite(time)?new Date(Math.min(Date.now(),time+30000)).toISOString():null;
  return {active,unknown,lastActiveAt:observed,activeSince:rover.data.activeSince??null,inactiveSince:rover.data.inactiveSince??inferred};
}
export function workDuration(seconds:number) {
  const value=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));
  return `${Math.floor(value/3600)}h ${String(Math.floor(value%3600/60)).padStart(2,"0")}m ${String(value%60).padStart(2,"0")}s`;
}
