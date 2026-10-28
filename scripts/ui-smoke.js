// Production UI: isolated profiles and synthetic native replies; no real client writes or Discord sends.
import { app, BrowserWindow, ipcMain } from 'electron';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import '../src/desktop/main.js';
const output=path.resolve('release/ui-smoke');
mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,`profile-${Date.now()}`));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
  const deadline=setTimeout(()=>{console.error('UI check timed out');app.exit(1)},90000);
  if(!BrowserWindow.getAllWindows().length)await once(app,'browser-window-created');
  const names=['八方肉包#1020','小明#TW1','小明#TW2','隊友 A#TW','隊友 B#TW'];
  let reads=0,readFailure=false,rosterChanged=false,applySuccess=false;
  const writes=[];
  ipcMain.removeHandler('lol:read-lobby');
  ipcMain.handle('lol:read-lobby',()=>{reads++;return readFailure?{ok:false,message:'測試：客戶端已離線'}:{ok:true,lobby:{players:names.map((name,i)=>({name:rosterChanged&&i===4?'新隊友#TW':name,id:`fixture-${i}`,firstPosition:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'][i],secondPosition:'UNSELECTED'})),localPlayerId:'fixture-0',fetchedAt:new Date().toISOString()}}});
  ipcMain.removeHandler('lol:apply-roles');
  ipcMain.handle('lol:apply-roles',(_event,results)=>{writes.push(results);return applySuccess?{ok:true,applied:{name:names[0],firstPosition:'MIDDLE',secondPosition:'UNSELECTED',fetchedAt:new Date().toISOString()}}:{ok:false,message:'測試：客戶端拒絕套用'}});
  const helpers=`
    const sleep=(ms=35)=>new Promise(r=>setTimeout(r,ms));
    const wait=async(check,message='UI did not settle')=>{await sleep();for(let i=0;i<160;i++){if(check())return;await sleep()}throw Error(message+': '+check.toString()+'; '+JSON.stringify({busy:document.querySelector('.role-setup,.draw-workspace')?.getAttribute('aria-busy'),toasts:[...document.querySelectorAll('.toast')].map(el=>el.textContent)}))};
    const clickText=text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);if(!b)throw Error('Missing button '+text);b.click()};
    const setField=async(selector,value)=>{
      const el=typeof selector==='string'?document.querySelector(selector):selector;if(!el)throw Error('Missing field '+selector);
      const select=el.matches('.app-select')?el:el.closest('.app-select');
      if(select){const trigger=select.querySelector('.app-select-trigger');trigger.click();await sleep();const menu=document.getElementById(trigger.getAttribute('aria-controls'));const option=[...menu.querySelectorAll('[role="option"]')].find(el=>el.dataset.value===value);if(!option||option.disabled)throw Error('Unavailable option '+value);option.click();await wait(()=>select.dataset.value===value&&!document.getElementById(trigger.getAttribute('aria-controls')));return;}
      if(el.getAttribute('role')==='radiogroup'){el.querySelector('[data-value="'+value+'"]').click();await sleep();return;}
      const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await sleep();
    };

    const settled=()=>document.querySelector('.role-setup,.draw-workspace')?.getAttribute('aria-busy')==='false';
    const prepare=async()=>{await wait(settled);document.querySelector('.finish-setup').click();await wait(()=>document.querySelector('.draw-workspace'))};
    const draw=async()=>{document.querySelector('.primary-draw').click();await wait(()=>settled()&&document.querySelector('.primary-draw')?.textContent==='重新抽籤')};
    const back=async()=>{clickText('返回設定');await wait(()=>document.querySelector('.role-setup'))};
  `;
  try{
    const window=BrowserWindow.getAllWindows()[0],errors=[];
    window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
    if(window.webContents.isLoading())await once(window.webContents,'did-finish-load');
    const run=code=>window.webContents.executeJavaScript(`(async()=>{${helpers}${code}})()`);
    const capture=async(name)=>{window.show();window.focus();window.webContents.invalidate();await new Promise(r=>setTimeout(r,180));await writeFile(path.join(output,name),(await window.webContents.capturePage()).toPNG())};
    const initial=await run(`
      await wait(()=>settled()&&document.querySelectorAll('.preparation-player-row').length===5);
      const labels=[...document.querySelectorAll('.preparation-player-name .player-label')].map(el=>el.textContent);
      if(labels.some(n=>n.includes('#'))||!labels.includes('小明 · 1')||!labels.includes('小明 · 2'))throw Error('Riot ID display incorrect');
      if(document.querySelector('.primary-draw,.player-avatar'))throw Error('Draw action or avatars visible during preparation');
      if(document.querySelector('select#draw-mode,details.discord-preparation')||document.querySelectorAll('#draw-mode [role="radio"]').length!==3)throw Error('Draw modes or Discord still collapsed');
      if(!document.querySelector('.discord-preparation .discord-sync-controls').getBoundingClientRect().height)throw Error('Discord controls not immediately visible');
      if(document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').getAttribute('aria-checked')==='true')throw Error('Auto-apply enabled by default');
      const before=JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);
      await prepare();
      if(document.querySelector('#draw-mode,.source-switch,.discord-sync-controls,.compact-tabs,.player-avatar'))throw Error('Setup controls leaked into drawing');
      if(document.querySelectorAll('.draw-workspace button').length!==3||!document.querySelector('.copy-results').disabled)throw Error('Ready action states incorrect');
      if(before!==JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats))throw Error('Preparation updated stats');
      return {labels,readyActions:3,preparationDoesNotDraw:true};
    `);
    await capture('ready.png');
    await run(`await draw();if(document.querySelectorAll('.table-role').length!==5)throw Error('Five-player role count incorrect');if(document.querySelector('.primary-draw').getBoundingClientRect().bottom>innerHeight)throw Error('Action below fold');`);
    await run(`if(document.documentElement.dataset.theme!=='dark')document.querySelector('[aria-label="切換深淺色模式"]').click();await wait(()=>settled()&&document.documentElement.dataset.theme==='dark');`);
    await capture('desktop-dark.png');
    await run(`if(document.documentElement.dataset.theme!=='light')document.querySelector('[aria-label="切換深淺色模式"]').click();await wait(()=>settled()&&document.documentElement.dataset.theme==='light');`);
    await capture('desktop-light.png');
    const desktopLayout=await run(`
      if(document.querySelector('.workspace-sidebar'))throw Error('Removed sidebar is still present');
      const canvas=document.querySelector('main.container').getBoundingClientRect();
      if(Math.abs((canvas.left+canvas.right)/2-innerWidth/2)>1)throw Error('Desktop workspace is not centered');
      if(!document.querySelector('.compact-header .app-brand').getClientRects().length)throw Error('Top brand navigation missing');
      const icons=[...document.querySelectorAll('.draw-workspace img.role-glyph')];
      if(document.querySelector('.assignment-marker'))throw Error('Random result marked as assigned');
      if(document.querySelector('.discord-availability')?.textContent!=='尚未設定')throw Error('Unconfigured Discord destination unclear');
      if(icons.length!==5||icons.some(img=>!img.complete||!img.naturalWidth||getComputedStyle(img).maskImage!=='none'))throw Error('Original gold icons not rendered as images');
      const positions=[...document.querySelectorAll('.roster-player-card')].map(card=>card.getBoundingClientRect());
      if(Math.max(...positions.map(p=>p.top))-Math.min(...positions.map(p=>p.top))>1)throw Error('Desktop results not on one row');
      return {topNavigation:true,centeredWorkspace:true,originalGoldImages:true,fiveColumns:true};
    `);
    const originalSize=window.getContentSize();
    const originalMinimum=window.getMinimumSize();
    const wideLayouts=[];
    for(const [width,height] of [[1920,1080],[2560,1360]]){
      window.setContentSize(width,height);await new Promise(r=>setTimeout(r,150));
      const layout=await run(`
        const canvas=document.querySelector('main.container').getBoundingClientRect();
        const cards=[...document.querySelectorAll('.roster-player-card')].map(el=>el.getBoundingClientRect());
        const action=document.querySelector('.draw-screen-actions').getBoundingClientRect();
        if(canvas.width<innerWidth*.63||canvas.width>1681)throw Error('Wide workspace is too narrow or unbounded');
        if(document.documentElement.scrollWidth>innerWidth||cards.some(card=>card.bottom>action.top)||action.bottom>innerHeight)throw Error('Wide result overflow');
        if(parseFloat(getComputedStyle(document.querySelector('.player-label')).fontSize)<16)throw Error('Wide player text too small');
        return {width:innerWidth,height:innerHeight,canvasWidth:canvas.width};
      `);
      await capture(`wide-results-${width}.png`);
      await run(`await back()`);
      await run(`
        const button=document.querySelector('.finish-setup').getBoundingClientRect();
        const grid=document.querySelector('.preparation-grid').getBoundingClientRect();
        const actions=document.querySelector('.preparation-actions').getBoundingClientRect();
        if(button.bottom>innerHeight||button.top<grid.bottom||actions.top-grid.bottom>130)throw Error('Wide preparation action detached or clipped');
        if(parseFloat(getComputedStyle(document.querySelector('.preparation-player-name .player-label')).fontSize)<16)throw Error('Wide preparation text too small');
      `);
      await capture(`wide-preparation-${width}.png`);
      await run(`await prepare()`);
      wideLayouts.push(layout);
    }
    window.setContentSize(...originalSize);await new Promise(r=>setTimeout(r,150));
    window.setMinimumSize(320,480);
    window.setContentSize(390,844);await new Promise(r=>setTimeout(r,150));
    await capture('five-player-mobile.png');
    const fivePlayerMobile=await run(`
      const cards=[...document.querySelectorAll('.roster-player-card')].map(card=>card.getBoundingClientRect());
      const actions=document.querySelector('.draw-screen-actions').getBoundingClientRect();
      const scroll=document.querySelector('.workspace-scroll');
      if(document.documentElement.scrollWidth>innerWidth||cards.length!==5)throw Error('Five-player mobile overflow');
      if(cards.some(card=>card.bottom>actions.top||card.height<89))throw Error('Actions obscure a player result: '+JSON.stringify({cards,actions}));
      if(actions.bottom>innerHeight||scroll.scrollHeight>scroll.clientHeight+2)throw Error('Five-player mobile result not fully visible');
      return {allFiveVisible:true,noActionOverlap:true};
    `);
    await run(`await back()`);
    const mobilePreparation=await run(`
      const button=document.querySelector('.finish-setup').getBoundingClientRect();
      const actions=document.querySelector('.preparation-actions').getBoundingClientRect();
      if(button.bottom>innerHeight||button.top<actions.top||button.height<44)throw Error('Mobile preparation action is not reachable');
      return {actionVisible:true};
    `);
    await capture('preparation-mobile.png');
    await run(`await prepare()`);
    window.setContentSize(...originalSize);window.setMinimumSize(...originalMinimum);await new Promise(r=>setTimeout(r,150));
    await run(`
      await back();await setField('#draw-mode','client');await wait(settled);await prepare();await draw();
      if([...document.querySelectorAll('.table-role')].map(el=>el.textContent).join(',')!=='上路,打野,中路,下路,輔助')throw Error('Client preferences lost');
      if(document.querySelectorAll('.assignment-marker').length!==5)throw Error('Client assigned roles not marked');
      await back();await setField('#draw-mode','custom');await wait(()=>settled()&&document.querySelectorAll('.inline-preference').length===5);
      const select=[...document.querySelectorAll('.inline-preference')];await setField(select[2],'');await setField(select[0],'中路');
      const left=[...document.querySelectorAll('.inline-preference')].map(el=>el.getBoundingClientRect().left);if(Math.max(...left)-Math.min(...left)>1)throw Error('Preference controls misaligned');
      document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').click();await wait(settled);await prepare();await draw();
      if(document.querySelector('.table-role').textContent!=='中路'||!document.querySelector('[data-notice-id="apply-roles"].is-error')?.textContent.includes('抽籤結果已保留'))throw Error('Apply error erased result');
      if(document.querySelectorAll('.assignment-marker').length!==4||document.querySelectorAll('.roster-player-card')[2].querySelector('.assignment-marker'))throw Error('Unspecified custom roles marked as assigned');
      await back();document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').click();await wait(settled);await prepare();
      const before=JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);
      document.activeElement?.blur();document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'z',bubbles:true}));await wait(()=>document.querySelector('.role-setup'));
      if(document.querySelector('[aria-label="玩家來源"] button[aria-pressed="true"]').textContent!=='客戶端隊伍')throw Error('Return shortcut switched source');
      await prepare();if(document.querySelectorAll('.table-role').length!==5)throw Error('Unchanged preparation erased results');
      if(before!==JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats))throw Error('Return changed stats');
    `);
    if(writes.length!==1||writes[0].some((r,i)=>r.name!==names[i]))throw Error('Native payload lost full IDs');
    await capture('assigned-results.png');
    readFailure=true;
    await run(`document.querySelector('.primary-draw').click();await wait(()=>settled()&&document.querySelector('[data-notice-id="draw-error"].is-error')?.textContent.includes('離線'));if(!document.querySelector('[data-notice-id="apply-roles"].is-error'))throw Error('Concurrent apply error fixture missing');if(document.querySelectorAll('.table-role').length!==5)throw Error('Read error erased results')`);
    readFailure=false;applySuccess=true;
    await run(`await back();document.querySelector('.preparation-client-status button').click();await wait(()=>settled()&&document.querySelectorAll('.preparation-player-row').length===5);document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').click();await wait(settled);await prepare();await draw();await wait(()=>document.querySelector('[data-notice-id="apply-roles"].is-success')?.textContent.includes('分路已套用'));if(document.querySelector('.inline-status.is-success,.client-apply-indicator'))throw Error('Apply success still uses banner or card marker')`);
    await capture('apply-toast.png');
    await run(`await back();document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').click();await wait(settled);await prepare()`);
    applySuccess=false;rosterChanged=true;
    await run(`const before=JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);document.querySelector('.primary-draw').click();await wait(()=>settled()&&document.querySelector('.role-setup'));if(!document.querySelector('[role="alert"]')?.textContent.includes('重新確認'))throw Error('Changed team not flagged');if(before!==JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats))throw Error('Changed team drawn without confirmation')`);
    await run(`
      clickText('管理 Webhook');await wait(()=>document.querySelector('.settings-dialog')?.open);await sleep();
      await setField('#discord-label','測試頻道');await setField('#discord-webhook','https://discord.com/api/webhooks/123456789012345678/synthetic_test_only');await sleep();
      document.querySelector('.discord-settings-content form').requestSubmit();await wait(()=>document.querySelector('.discord-destination-list')?.textContent.includes('測試頻道'));
      if(document.querySelector('.settings-dialog [aria-label="Discord 自動同步"]').getAttribute('aria-checked')!=='false')throw Error('Save enabled sync');
      document.querySelector('[aria-label="刪除 測試頻道"]').click();await wait(()=>!document.querySelector('.discord-destination-list'));
      document.querySelector('.settings-dialog [aria-label="關閉設定"]').click();await sleep();document.querySelector('[aria-label="設定"]').click();await wait(()=>document.querySelector('.data-settings-panel'));
    `);
    await capture('settings-light.png');
    await run(`document.querySelector('.settings-dialog [aria-label="關閉設定"]').click();await sleep();const before=JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);clickText('抽英雄');await sleep();await wait(()=>document.querySelector('.champion-actions button')&&!document.querySelector('.champion-actions button').disabled);document.querySelector('.champion-actions button').click();await wait(()=>document.querySelector('.champion-result h3')?.textContent);if(before!==JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats))throw Error('Champion draw changed stats');clickText('抽分路');await wait(()=>document.querySelector('.role-setup'));`);
    const web=new BrowserWindow({show:false,width:1040,height:760,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await web.loadURL('lol-draw://app/');await web.webContents.executeJavaScript(`localStorage.setItem('lolDrawStats',JSON.stringify({'同名#1':{},'同名#2':{},'第三位':{}}));localStorage.setItem('lolDiscordSync',JSON.stringify({schemaVersion:2,enabled:false,activeDestinationId:'123456789012345678',destinations:[{id:'123456789012345678',label:'測試伺服器',webhookUrl:'https://discord.com/api/webhooks/123456789012345678/synthetic_test_only'},{id:'223456789012345678',label:'另一個伺服器',webhookUrl:'https://discord.com/api/webhooks/223456789012345678/synthetic_test_only'}]}));`);web.reload();await once(web.webContents,'did-finish-load');
    const webRun=code=>web.webContents.executeJavaScript(`(async()=>{${helpers}${code}})()`);
    await webRun(`await wait(()=>document.querySelector('.role-setup'));document.querySelector('.recent-player-picker summary').click();await sleep();document.querySelector('.known-chip').click();await wait(settled);`);
    for(const appearance of ['dark','light']){
      await webRun(`
        if(document.documentElement.dataset.theme!==${JSON.stringify(appearance)})document.querySelector('[aria-label="切換深淺色模式"]').click();
        await wait(()=>settled()&&document.documentElement.dataset.theme===${JSON.stringify(appearance)});
        await sleep(200);
        document.querySelector('.recent-player-picker').open=true;
        await sleep();
        const menu=document.querySelector('.recent-player-popover').getBoundingClientRect();
        if(menu.width<500||menu.left<0||menu.right>innerWidth||menu.top<0||menu.bottom>innerHeight)throw Error('Enlarged desktop history menu is clipped');
        if([...document.querySelectorAll('.known-chip')].some(el=>el.getBoundingClientRect().height<56))throw Error('History selection target is too small');
        const luminance=color=>{const rgb=color.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722};
        for(const chip of document.querySelectorAll('.known-chip')){const style=getComputedStyle(chip),a=luminance(style.color),b=luminance(style.backgroundColor);if((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)<4.5)throw Error('History player text has insufficient contrast: '+JSON.stringify({theme:document.documentElement.dataset.theme,selected:chip.getAttribute('aria-pressed'),color:style.color,background:style.backgroundColor}))}
        for(const label of ['歷史統計','設定']){const button=document.querySelector('.compact-header [aria-label="'+label+'"]');if(!button.querySelector('svg')||!button.title||button.textContent.trim())throw Error('Toolbar icon or accessible name missing')}
      `);
      web.show();web.webContents.invalidate();await new Promise(r=>setTimeout(r,180));await writeFile(path.join(output,`history-${appearance}.png`),(await web.webContents.capturePage()).toPNG());
    }
    await webRun(`document.querySelector('.known-chip[aria-pressed="true"]').click();await wait(settled);document.querySelector('.recent-player-picker').open=false;`);
    await webRun(`

      const toggle=document.querySelector('.discord-preparation .discord-sync-switch');
      if(toggle.getAttribute('aria-checked')!=='false'||!toggle.textContent.includes('關閉'))throw Error('Discord off switch is ambiguous');
      const off=getComputedStyle(toggle.querySelector('.discord-switch-track')).backgroundColor;
      toggle.click();await wait(()=>toggle.getAttribute('aria-checked')==='true');await sleep(240);
      const on=getComputedStyle(toggle.querySelector('.discord-switch-track')).backgroundColor;
      if(off===on||!toggle.textContent.includes('開啟')||toggle.getBoundingClientRect().height<44)throw Error('Discord enabled switch lacks visible contrast or label');
    `);
    web.show();await writeFile(path.join(output,'discord-switch-light.png'),(await web.webContents.capturePage()).toPNG());
    await webRun(`document.querySelector('[aria-label="切換深淺色模式"]').click();await wait(()=>document.documentElement.dataset.theme==='dark');await sleep(240)`);
    await writeFile(path.join(output,'discord-switch-dark.png'),(await web.webContents.capturePage()).toPNG());
    await webRun(`document.querySelector('.discord-preparation .discord-sync-switch').click();await wait(()=>document.querySelector('.discord-sync-switch').getAttribute('aria-checked')==='false');document.querySelector('[aria-label="切換深淺色模式"]').click();await wait(()=>document.documentElement.dataset.theme==='light')`);
    await webRun(`
      if(document.querySelector('.discord-preparation select'))throw Error('Native full-width destination select still present');
      const trigger=document.querySelector('.discord-destination-trigger'),heading=document.querySelector('.discord-section-heading').getBoundingClientRect(),box=trigger.getBoundingClientRect();
      if(box.width>200||box.top<heading.top||box.bottom>heading.bottom)throw Error('Destination selector not compact or in heading');
      trigger.click();await sleep();
      const menu=document.querySelector('.discord-destination-menu').getBoundingClientRect();
      if(menu.left<0||menu.right>innerWidth||menu.top<0||menu.bottom>innerHeight)throw Error('Destination menu clipped');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
      if(!document.activeElement.textContent.includes('另一個伺服器'))throw Error('Destination keyboard navigation failed');
      document.activeElement.click();await wait(()=>!document.querySelector('.discord-destination-menu')&&trigger.textContent.includes('另一個伺服器'));await sleep();
      if(document.activeElement!==trigger||document.querySelector('.discord-sync-switch').getAttribute('aria-checked')!=='false')throw Error('Destination selection lost focus or enabled sending');
      trigger.click();await sleep();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await sleep();
      if(document.querySelector('.discord-destination-menu')||document.activeElement!==trigger)throw Error('Destination Escape dismissal failed');
      trigger.click();await sleep();[...document.querySelectorAll('.discord-destination-menu [role="option"]')].find(el=>el.textContent.includes('測試伺服器')).click();await wait(()=>trigger.textContent.includes('測試伺服器')&&!document.querySelector('.discord-destination-menu'));
    `);
    await webRun(`
      document.querySelector('[aria-label="設定"]').click();await wait(()=>document.querySelector('.settings-dialog').open);
      [...document.querySelectorAll('.settings-nav button')].find(el=>el.textContent==='Discord').click();await sleep();
      const trigger=document.querySelector('.settings-dialog .setting-section-heading .discord-destination-trigger');if(!trigger)throw Error('Settings still uses native Discord selector');
      trigger.click();await sleep();const menu=document.querySelector('.settings-dialog .app-select-menu'),box=menu.getBoundingClientRect();
      if(!menu.matches(':popover-open')||box.left<0||box.right>innerWidth||!menu.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)))throw Error('Settings destination menu is hidden behind modal');
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await sleep();
      if(!document.querySelector('.settings-dialog').open||document.querySelector('.settings-dialog .app-select-menu'))throw Error('Escape closed settings instead of menu');
      document.querySelector('[aria-label="關閉設定"]').click();await sleep();
    `);
    const website=await webRun(`
      await wait(()=>document.querySelector('.role-setup'));if(window.lolDesktop||document.querySelector('.source-switch,.auto-apply-control'))throw Error('Desktop controls leaked into website');
      const history=document.querySelector('.recent-player-picker');history.querySelector('summary').click();await sleep();const chips=[...history.querySelectorAll('.known-chip')];if(chips.length!==3)throw Error('History players missing');
      chips[0].click();await wait(settled);chips[1].click();await wait(settled);if(!history.open||document.querySelectorAll('.preparation-player-row').length!==2)throw Error('History continuous selection broken');
      chips[1].click();await wait(settled);if(document.querySelectorAll('.preparation-player-row').length!==1)throw Error('History deselection broken');chips[1].click();await wait(settled);chips[2].click();await wait(settled);
      await setField('#draw-mode','custom');await wait(()=>document.querySelectorAll('.inline-preference').length===3);await setField('.inline-preference','中路');await sleep();await prepare();await draw();
      if(document.querySelectorAll('.table-role').length!==6)throw Error('Secondary roles missing');if(document.querySelector('.player-avatar,.inline-preference,#draw-mode,.discord-summary'))throw Error('Draw screen clutter');
      if(document.querySelector('.draw-secondary').textContent.includes('副位'))throw Error('Secondary caption was not removed');
      if(document.querySelectorAll('.assignment-marker').length!==1)throw Error('Manual assigned role not marked');
      if(document.querySelector('.discord-destination-name')?.textContent!=='測試伺服器')throw Error('Footer does not show selected Discord destination');
      if(document.querySelector('.discord-draw-status').dataset.state!=='off')throw Error('Disabled Discord state changed');
      if(document.querySelector('.discord-availability').textContent!=='傳送已關閉')throw Error('Discord sending availability not visible');
      const assigned=document.querySelector('.table-role.is-assigned .table-role-icon');
      if(!assigned||parseFloat(getComputedStyle(assigned,'::before').borderTopWidth)<1||!assigned.querySelector('.assignment-marker svg'))throw Error('Assigned role frame or lock missing');
      await back();if(document.querySelectorAll('.preparation-player-row').length!==3||document.querySelector('#draw-mode').dataset.value!=='custom')throw Error('Return lost settings');await prepare();return {manualDraw:true,secondaryRoles:true,continuousHistory:true,preservesParameters:true};
    `);
    web.show();await writeFile(path.join(output,'secondary-results.png'),(await web.webContents.capturePage()).toPNG());
    web.setContentSize(390,844);await new Promise(r=>setTimeout(r,150));
    const mobile=await webRun(`if(document.documentElement.scrollWidth>innerWidth)throw Error('Mobile overflow');return {noOverflow:true}`);
    web.show();await writeFile(path.join(output,'website-mobile.png'),(await web.webContents.capturePage()).toPNG());
    await webRun(`
      await back();document.querySelector('.recent-player-picker summary').click();await sleep();
      const menu=document.querySelector('.recent-player-popover').getBoundingClientRect();
      if(menu.width<330||menu.left<15||menu.right>innerWidth-15||menu.top<0||menu.bottom>innerHeight)throw Error('Mobile history menu clipped');
    `);
    await writeFile(path.join(output,'history-mobile.png'),(await web.webContents.capturePage()).toPNG());
    await webRun(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));if(document.querySelector('.recent-player-picker').open)throw Error('History Escape dismissal failed');if(document.activeElement!==document.querySelector('.recent-player-picker summary'))throw Error('History focus not restored')`);
    web.destroy();
    if(reads<5||errors.length)throw Error(errors.join('\n')||'Client not refreshed on draw');
    const check={initial,desktopLayout,wideLayouts,fivePlayerMobile,mobilePreparation,website,mobile,historyReadableInBothThemes:true,accessibleToolbarIcons:true,clientPreferences:true,customPreferences:true,applyFailurePreservesResult:true,readFailurePreservesResult:true,changedRosterRequiresConfirmation:true,completeIdsInNativePayload:true,settingsCrud:true,championDraw:true};
    await writeFile(path.join(output,'result.json'),JSON.stringify(check,null,2));console.log(JSON.stringify(check));clearTimeout(deadline);app.exit(0);
  }catch(error){console.error(error.stack);clearTimeout(deadline);app.exit(1)}
});
