import {readFileSync} from "node:fs";
import {join} from "node:path";

// Read the editable file at runtime; tracing includes it explicitly in the build.
// Binding also avoids treating the runtime cwd as a Turbopack filesystem glob.
const readSettingsFile=readFileSync.bind(undefined);

type ApiSettings={mode:string;localBaseUrl:string;serverBaseUrl:string};
type Overrides={SURVEY_API_MODE?:string;SURVEY_API_UPSTREAM?:string};

export function resolveApiBaseUrl(settings:ApiSettings,overrides:Overrides={}) {
  const mode=(overrides.SURVEY_API_MODE||settings.mode)?.trim().toLowerCase();
  if(mode!=="local"&&mode!=="server")throw new Error("Set mode to local or server in api_base_url.json.");
  const value=overrides.SURVEY_API_UPSTREAM?.trim()||(mode==="local"?settings.localBaseUrl:settings.serverBaseUrl)?.trim();
  let target:URL;
  try{target=new URL(value);}catch{throw new Error("Enter a valid API base URL in api_base_url.json.");}
  if(!["http:","https:"].includes(target.protocol)||target.username||target.password||target.search||target.hash)
    throw new Error("The API base URL must be HTTP/HTTPS without credentials, query or fragment.");
  if(/\/(?:api\/v1|health|swagger(?:\/index\.html)?)\/?$/i.test(target.pathname))
    throw new Error("Use the API root URL without /api/v1, /health or /swagger.");
  return target.href.replace(/\/+$/,"");
}

export function apiBaseUrl() {
  let settings:ApiSettings;
  try{settings=JSON.parse(readSettingsFile(join(process.cwd(),"api_base_url.json"),"utf8").replace(/^\uFEFF/,""));}
  catch{throw new Error("Cannot read api_base_url.json in the web application folder.");}
  return resolveApiBaseUrl(settings,{SURVEY_API_MODE:process.env.SURVEY_API_MODE,SURVEY_API_UPSTREAM:process.env.SURVEY_API_UPSTREAM});
}
