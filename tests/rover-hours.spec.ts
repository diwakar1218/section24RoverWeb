import {test,expect,type Page} from "@playwright/test";

async function fixture(page:Page) {
  const now=new Date().toISOString(),ago=(minutes:number)=>new Date(Date.now()-minutes*60000).toISOString();
  const active={data:{id:"active-rover",name:"DA2 Active",serialNumber:"ROVER-01",source:"android",surveyorName:"Surveyor One",districtId:"district-one",district:"Agra",tehsil:"Sadar",village:"Rampur",jobId:"plot-one",jobName:"Plot one",latitude:27.18,longitude:78.01,lastHeartbeat:now,observedAt:now,lastActiveAt:now,activeSince:ago(60),inactiveSince:null,fixType:"RtkFixed",address:"Recorded Agra address"},connectionStatus:"Online",receivingGnss:true,activeSurvey:true};
  const inactive={data:{...active.data,id:"inactive-rover",name:"DA2 Inactive",serialNumber:"ROVER-02",districtId:"district-two",district:"Lucknow",latitude:26.85,longitude:80.93,lastHeartbeat:ago(60),observedAt:ago(65),lastActiveAt:ago(65),activeSince:null,inactiveSince:ago(60),address:"Recorded Lucknow address"},connectionStatus:"Offline",receivingGnss:false,activeSurvey:false};
  const unused={data:{...active.data,id:"unused-rover",name:"DA2 Unused",serialNumber:"ROVER-03",latitude:null,longitude:null,lastHeartbeat:null,observedAt:null,lastActiveAt:null,activeSince:null,inactiveSince:null},connectionStatus:"Offline",receivingGnss:false,activeSurvey:false};
  const rows=[{rover:active,totalSeconds:7200,todaySeconds:3600,surveyCount:4},{rover:inactive,totalSeconds:3600,todaySeconds:1800,surveyCount:2},{rover:unused,totalSeconds:0,todaySeconds:0,surveyCount:0}];
  await page.addInitScript(()=>{
    // Keep marker, popup and geocoder interaction deterministic without external requests.
    class FieldMap {
      element:HTMLElement;zoom=8;
      constructor(element:HTMLElement){this.element=element;}
      setCenter(){} setZoom(zoom:number){this.zoom=zoom;}getZoom(){return this.zoom;}fitBounds(){}panTo(){}
    }
    class Marker {
      content:HTMLElement;
      constructor({map,content}:{map:FieldMap;content:HTMLElement}){this.content=content;map.element.appendChild(content);}
      set map(value:unknown){if(!value)this.content.remove();}
      addListener(_event:string,callback:()=>void){this.content.addEventListener("click",callback);}
    }
    class Bounds{extend(){return this;}}
    class Geocoder{async geocode(){return {results:[{formatted_address:"Survey Road, Lucknow, Uttar Pradesh, India"}]};}}
    Object.assign(window,{google:{maps:{LatLngBounds:Bounds,ControlPosition:{TOP_RIGHT:1,RIGHT_BOTTOM:2},event:{addListenerOnce(_map:unknown,_event:string,callback:()=>void){setTimeout(callback,0);},clearInstanceListeners(){}},async importLibrary(name:string){return name==="maps"?{Map:FieldMap}:name==="marker"?{AdvancedMarkerElement:Marker}:{Geocoder};}}}});
  });
  await page.route("**/api/v1/**",async route=>{
    const url=new URL(route.request().url()),path=url.pathname,district=url.searchParams.get("districtId");
    const visible=rows.filter(r=>!district||r.rover.data.districtId===district);
    let data:unknown=[];
    if(path.endsWith("/auth/refresh"))data={accessToken:"fixture"};
    else if(path.endsWith("/auth/me"))data={userId:"admin",organizationId:"org",name:"Survey administrator",grants:["dashboard.read","rovers.read","surveys.read"].map(permission=>({permission,scope:"Organization"}))};
    else if(path.endsWith("/capabilities"))data={integratedDashboard:true};
    else if(path.endsWith("/geography"))data={states:[],districts:[],tehsils:[],villages:[]};
    else if(path.endsWith("/land-records/district"))data=[];
    else if(path.endsWith("/rover-hours"))data={totalSeconds:visible.reduce((sum,r)=>sum+r.totalSeconds,0),todaySeconds:visible.reduce((sum,r)=>sum+r.todaySeconds,0),rovers:visible};
    else if(path.endsWith("/rovers"))data={items:visible.map(r=>r.rover),total:visible.length};
    else if(path.endsWith("/summary"))data={users:2,activeUsers:2,surveyors:2,connectedControllers:1,completedSurveys:1,activeSessions:1,pendingSyncEvents:0,activeDistricts:1,rovers:visible.length,online:1,offline:visible.length-1,stale:0,workingSurveyors:1,activeJobs:1,points:0,areaM2:0};
    else if(path.endsWith("/district-wise"))data=[{districtId:"district-one",name:"Agra",total:1,completed:0,active:1,points:0,areaM2:0},{districtId:"district-two",name:"Lucknow",total:1,completed:1,active:0,points:0,areaM2:0}];
    await route.fulfill({json:data});
  });
  await page.route("**/hubs/monitoring**",route=>route.fulfill({status:503}));
  await page.goto("/dashboard");
}

test("combined rover hours open per-rover totals including unused rovers, export and district filtering",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await fixture(page);
  const card=page.getByRole("button",{name:"Show details: Total rover hours",exact:true});
  await expect(card.locator(".rover-hours-value")).toContainText("3h");
  await expect(card.locator(".rover-hours-today")).toContainText("1h 30m 00s");
  await expect(card).toContainText("3 registered rovers");
  await card.click();
  const records=page.getByRole("region",{name:"Rover working hours detailed records"});
  await expect(records.locator("tbody tr")).toHaveCount(3);
  const unused=records.locator("tbody tr").filter({hasText:"DA2 Unused"});
  await expect(unused).toContainText("0h 00m 00s");
  await expect(unused.getByRole("link",{name:/View/})).toHaveAttribute("href","/dashboard/rovers/unused-rover");
  const download=page.waitForEvent("download");
  await records.getByRole("button",{name:"Export CSV / Excel",exact:true}).click();
  expect((await download).suggestedFilename()).toBe("rover_working_hours.csv");
  await page.screenshot({path:test.info().outputPath("rover_hours_desktop.png"),fullPage:true});
  for(const width of [1440,768,390]){
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    if(width===390)await page.screenshot({path:test.info().outputPath("rover_hours_mobile.png"),fullPage:true});
  }
  await page.getByRole("button",{name:"District",exact:true}).click();
  await page.getByRole("option",{name:"Agra",exact:true}).click();
  await expect(card).toContainText("2 registered rovers");
  await card.click();await expect(records.locator("tbody tr")).toHaveCount(2);
  await expect(records).not.toContainText("DA2 Inactive");
  expect(errors).toEqual([]);
});

test("active green markers retain a blue pulse; inactive red markers show address and inactivity without breaking View",async({page})=>{
  await fixture(page);
  const active=page.locator('.google-rover-marker[data-rover-id="active-rover"]');
  const inactive=page.locator('.google-rover-marker[data-rover-id="inactive-rover"]');
  await expect(active).toHaveCSS("background-color","rgb(19, 129, 104)");
  await expect(inactive).toHaveCSS("background-color","rgb(209, 60, 74)");
  expect(await active.evaluate(el=>getComputedStyle(el,"::before").animationName)).toBe("rover-active-pulse");
  expect(await active.evaluate(el=>getComputedStyle(el,"::before").borderTopColor)).toBe("rgb(52, 137, 237)");
  expect(await inactive.evaluate(el=>getComputedStyle(el,"::before").animationName)).toBe("none");
  await inactive.click();const popup=page.locator(".map-popup");
  await popup.scrollIntoViewIfNeeded();
  await expect(popup.getByText("Inactive since",{exact:true})).toBeInViewport();
  await expect(popup).toContainText("Inactive since");await expect(popup).toContainText("Inactive for");
  await expect(popup).toContainText("Last active");await expect(popup).not.toContainText("Not recorded");
  await expect(popup.locator(".rover-popup-address")).toContainText("Survey Road, Lucknow, Uttar Pradesh, India");
  await expect(popup).toContainText("26.85000000, 80.93000000");
  await page.screenshot({path:test.info().outputPath("rover_activity_card.png"),fullPage:true});
  await expect(popup.getByRole("link",{name:"View full details",exact:true})).toHaveAttribute("href","/dashboard/rovers/inactive-rover");
  await active.click();await expect(popup).toContainText("Active since");await expect(popup).not.toContainText("Inactive since");
  await page.emulateMedia({reducedMotion:"reduce"});
  expect(await active.evaluate(el=>getComputedStyle(el,"::before").animationName)).toBe("none");
  expect(await active.evaluate(el=>getComputedStyle(el,"::before").borderTopColor)).toBe("rgb(52, 137, 237)");
});
