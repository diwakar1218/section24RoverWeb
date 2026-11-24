import {test,expect,type BrowserContext,type Page} from '@playwright/test';

const profile={userId:'admin',organizationId:'org',name:'Session administrator',grants:['users.read','users.manage','roles.manage','dashboard.read'].map(permission=>({permission,scope:'Organization'}))};
type State={outage:boolean;saveStatus:number;refreshes:number;rotation:boolean;cookie:number;revoked:boolean;shortToken:boolean;authorizedSaves:number};
async function fixture(context:BrowserContext):Promise<State> {
  const state:State={outage:false,saveStatus:409,refreshes:0,rotation:false,cookie:0,revoked:false,shortToken:false,authorizedSaves:0};
  await context.route('**/api/v1/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path.endsWith('/auth/refresh')) {
      state.refreshes++;
      if(state.outage)return route.fulfill({status:503,json:{title:'API temporarily unavailable'}});
      if(state.revoked)return route.fulfill({status:401});
      if(state.rotation){
        await new Promise(resolve=>setTimeout(resolve,50));
        const expected='survey_refresh=r'+state.cookie;
        if(!req.headers().cookie?.includes(expected)){state.revoked=true;return route.fulfill({status:401});}
        state.cookie++;
      }
      return route.fulfill({json:{accessToken:'fixture-'+state.refreshes,expiresIn:state.shortToken?1:300},headers:{'Set-Cookie':`survey_refresh=r${state.cookie}; HttpOnly; Path=/api/v1/auth; SameSite=Strict`}});
    }
    if(path.endsWith('/auth/logout')) {state.revoked=true;return route.fulfill({status:204,headers:{'Set-Cookie':'survey_refresh=; Path=/api/v1/auth; Max-Age=0'}});}
    if(path.endsWith('/auth/me'))return route.fulfill({json:profile});
    if(path.endsWith('/geography'))return route.fulfill({json:{states:[],districts:[],tehsils:[],villages:[]}});
    if(path.endsWith('/roles'))return route.fulfill({json:[{id:'viewer',name:'Viewer',scope:'Organization',permissions:[]}]});
    if(path.endsWith('/users')&&req.method()==='POST') {
      if(state.saveStatus===401)return route.fulfill({status:401});
      if(state.saveStatus!==201)return route.fulfill({status:state.saveStatus,json:{title:'This username already exists.'}});
      state.authorizedSaves++;return route.fulfill({status:201,json:{id:'created'}});
    }
    if(path.endsWith('/users/created/management'))return route.fulfill({json:{version:1,roleIds:['viewer'],profile:{id:'created',fullName:'New Surveyor',username:'new.surveyor',isActive:true,roles:['Viewer'],district:'',organizationId:'org'}}});
    return route.fulfill({json:[]});
  });
  return state;
}
async function openForm(page:Page){await page.goto('/dashboard/users/create');await expect(page.getByRole('heading',{name:'Create user.',exact:true})).toBeVisible();}
async function fillForm(page:Page){
  await page.getByLabel(/^Full name/).fill('New Surveyor');await page.getByLabel(/^Username/).fill('new.surveyor');
  await page.getByLabel(/^Initial password/).fill('Temporary-password-2026!');await page.getByRole('checkbox',{name:/Viewer/}).check();
}

test('user validation is yellow, duplicate-user error is red, retry saves with a green toast',async({page,context})=>{
  const state=await fixture(context);await openForm(page);
  await page.getByRole('button',{name:'Save user',exact:true}).click();await expect(page.locator('.toast-warning')).toBeVisible();
  await fillForm(page);await page.getByRole('button',{name:'Save user',exact:true}).click();
  await expect(page.locator('.toast-error')).toContainText('This username already exists.');await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('New Surveyor');
  await page.locator('.toast-error').getByRole('button',{name:'Dismiss notification'}).click();await expect(page.locator('.toast-error')).toHaveCount(0);
  await page.getByRole('button',{name:'Save user',exact:true}).click();await expect(page.locator('.toast-error')).toContainText('This username already exists.');
  state.saveStatus=201;await page.getByRole('button',{name:'Save user',exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard\/users\/created$/);await expect(page.locator('.toast-success')).toContainText('User created successfully.');expect(state.authorizedSaves).toBe(1);
});

test('failed refresh retains the form and logged-in workspace; recovery renews the token',async({page,context})=>{
  const state=await fixture(context);await openForm(page);await fillForm(page);
  state.outage=true;state.saveStatus=401;
  await page.getByRole('button',{name:'Save user',exact:true}).click();
  await expect(page.locator('.toast-error')).toContainText('API temporarily unavailable');await expect(page).toHaveURL(/\/dashboard\/users\/create$/);
  await expect(page.getByLabel('Full name',{exact:true})).toHaveValue('New Surveyor');
  state.outage=false;state.saveStatus=201;
  await page.getByRole('button',{name:'Save user',exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/users\/created$/);
});

test('reload during an outage shows reconnect instead of logging out',async({page,context})=>{
  const state=await fixture(context);await openForm(page);state.outage=true;await page.reload();
  await expect(page.getByRole('heading',{name:'Reconnecting to your workspace'})).toBeVisible();await expect(page).toHaveURL(/\/dashboard\/users\/create$/);
  state.outage=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'Create user.',exact:true})).toBeVisible();
});

for(const fallback of [false,true])test(`tabs coordinate rotating browser cookies and share explicit logout; storage fallback=${fallback}`,async({context})=>{
  if(fallback)await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined,configurable:true}));
  const state=await fixture(context);state.rotation=true;
  await context.addCookies([{name:'survey_refresh',value:'r0',domain:'127.0.0.1',path:'/api/v1/auth',httpOnly:true,sameSite:'Strict',secure:false}]);
  const first=await context.newPage(),second=await context.newPage();
  await Promise.all([openForm(first),openForm(second)]);expect(state.revoked).toBe(false);
  await Promise.all([first.reload(),second.reload()]);
  await expect(first.getByRole('heading',{name:'Create user.',exact:true})).toBeVisible();await expect(second.getByRole('heading',{name:'Create user.',exact:true})).toBeVisible();expect(state.revoked).toBe(false);
  const cookies=await context.cookies();expect(cookies.find(c=>c.name==='survey_refresh')?.expires).toBe(-1);
  expect(await first.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('survey.auth.lock.')))).toEqual([]);
  await first.getByRole('button',{name:'Sign out',exact:true}).click();await expect(first).toHaveURL(/\/login$/);await expect(second).toHaveURL(/\/login$/);
});

test('short-lived access token renews before the next authenticated request',async({page,context})=>{
  const state=await fixture(context);state.shortToken=true;await openForm(page);await fillForm(page);const before=state.refreshes;
  await page.waitForTimeout(1200);state.shortToken=false;state.saveStatus=201;
  await page.getByRole('button',{name:'Save user',exact:true}).click();await expect(page).toHaveURL(/\/dashboard\/users\/created$/);expect(state.refreshes).toBeGreaterThan(before);
});
