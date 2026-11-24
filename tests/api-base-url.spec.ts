import {test,expect} from "@playwright/test";
import {resolveApiBaseUrl} from "../src/lib/server/api-base-url";

const settings={mode:"local",localBaseUrl:"http://127.0.0.1:5082/",serverBaseUrl:"https://example.org/SurveyMonitoring_API/"};
test("local HTTP and hosted HTTPS share the same configurable API root",()=>{
  expect(resolveApiBaseUrl(settings)).toBe("http://127.0.0.1:5082");
  expect(resolveApiBaseUrl({...settings,mode:"server"})).toBe("https://example.org/SurveyMonitoring_API");
  expect(resolveApiBaseUrl(settings,{SURVEY_API_MODE:"server"})).toBe("https://example.org/SurveyMonitoring_API");
  expect(resolveApiBaseUrl(settings,{SURVEY_API_UPSTREAM:"http://192.168.1.20:5082/"})).toBe("http://192.168.1.20:5082");
});
test("invalid modes and URLs cannot silently select another API",()=>{
  expect(()=>resolveApiBaseUrl({...settings,mode:"typo"})).toThrow("local or server");
  for(const url of ["file:///etc/config","https://user:password@example.org/","https://example.org/?key=x","https://example.org/#fragment","http://127.0.0.1:5082/api/v1","http://127.0.0.1:5082/swagger/index.html"]){
    expect(()=>resolveApiBaseUrl({...settings,localBaseUrl:url})).toThrow();
  }
});
