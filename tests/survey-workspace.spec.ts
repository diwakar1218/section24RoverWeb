import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('uploaded plots preserve project/job hierarchy in list, search, detail and export', async ({page}) => {
  const base={project:'Canal project',projectId:'project-a',district:'Lucknow',tehsil:'Sadar',village:'Village',gataNo:'001/2',caseNo:'CASE-24',totalArea:55,totalDistance:30,totalPoints:1,startedAt:'2026-11-20T06:00:00Z',mode:'point',status:'completed'};
  const plots=[{...base,id:'plot-a',jobId:'job-a',jobName:'Boundary job',plotName:'Plot A'}, {...base,id:'plot-b',jobId:'job-b',jobName:'Road job',plotName:'Plot B'}];
  await page.route('**/api/v1/**', async route=>{
    const path=new URL(route.request().url()).pathname;
    let json:unknown=[];
    if(path.endsWith('/auth/refresh'))json={accessToken:'fixture'};
    else if(path.endsWith('/auth/me'))json={userId:'reader',organizationId:'org',name:'Reader',grants:[{permission:'surveys.read',scope:'Organization'}]};
    else if(path.endsWith('/survey/history'))json=plots;
    else if(path.endsWith('/survey/plot-b'))json={session:plots[1],points:[{id:'p',pointNumber:'P001',name:'Corner',latitude:26.8,longitude:80.9,capturedAt:base.startedAt,address:'Saved address'}],track:[]};
    await route.fulfill({json});
  });
  await page.route('**/hubs/monitoring**',route=>route.fulfill({status:503,body:'Fixture polling'}));
  await page.route('https://maps.googleapis.com/maps/api/js?**',route=>route.abort());
  await page.goto('/dashboard/mobile-surveys');
  const rows=page.getByRole('region',{name:'Uploaded surveys'}).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await page.getByRole('textbox',{name:'Search surveys',exact:true}).fill('Road job');
  await expect(rows).toHaveCount(1);await expect(rows).toContainText('Plot B');await expect(rows).toContainText('Canal project / Road job');
  await page.getByRole('link',{name:'Plot B',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Plot B.',exact:true})).toBeVisible();
  const metadata=page.locator('.survey-metadata');await expect(metadata).toContainText('Canal project');await expect(metadata).toContainText('Road job');await expect(metadata).toContainText('001/2');await expect(metadata).toContainText('CASE-24');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'CSV / Excel',exact:true}).click();
  const file=await download;const path=await file.path();const csv=await readFile(path!,'utf8');
  expect(csv).toContain('Canal project');expect(csv).toContain('Road job');expect(csv).toContain('Plot B');expect(csv).toContain('CASE-24');
});
