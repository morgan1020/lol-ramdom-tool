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
    const clickText=text=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.getAttribute('aria-label')===text);if(!b)throw Error('Missing button '+text);b.click()};
    const setField=async(selector,value)=>{
      const el=typeof selector==='string'?document.querySelector(selector):selector;if(!el)throw Error('Missing field '+selector);
      const select=el.matches('.app-select')?el:el.closest('.app-select');
      if(select){const trigger=select.querySelector('.app-select-trigger');trigger.click();await sleep();const menu=document.getElementById(trigger.getAttribute('aria-controls'));const option=[...menu.querySelectorAll('[role="option"]')].find(el=>el.dataset.value===value);if(!option||option.disabled)throw Error('Unavailable option '+value);option.click();await wait(()=>select.dataset.value===value&&!document.getElementById(trigger.getAttribute('aria-controls')));return;}
      if(el.getAttribute('role')==='radiogroup'){el.querySelector('[data-value="'+value+'"]').click();await sleep();return;}
      const proto=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await sleep();
    };

    const settled=()=>document.querySelector('.role-setup,.draw-workspace')?.getAttribute('aria-busy')==='false';
    const draw=async()=>{document.querySelector('.primary-draw').click();await wait(()=>settled()&&document.querySelector('.primary-draw')?.textContent==='重新抽籤')};
    const checkRoleIcons=async(theme,count)=>{
      if(document.documentElement.dataset.theme!==theme)document.querySelector('[aria-label="切換深淺色模式"]').click();
      await wait(()=>settled()&&document.documentElement.dataset.theme===theme);
      const icons=[...document.querySelectorAll('.draw-workspace .draw-card-result img.role-glyph')].filter(icon=>icon.getClientRects().length);
      if(icons.length!==count)throw Error('Unexpected result icon count for '+theme);
      await Promise.all(icons.map(icon=>icon.decode()));
      if(icons.some(icon=>getComputedStyle(icon).colorScheme!==theme||getComputedStyle(icon).maskImage!=='none'))throw Error('Result icon appearance is incorrect for '+theme);
    };
  `;
  try{
    const window=BrowserWindow.getAllWindows()[0],errors=[];
    window.webContents.setBackgroundThrottling(false);
    window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
    if(window.webContents.isLoading())await once(window.webContents,'did-finish-load');
    const run=code=>window.webContents.executeJavaScript(`(async()=>{${helpers}${code}})()`);
    const capture=async(name)=>{window.show();window.focus();window.webContents.invalidate();await new Promise(r=>setTimeout(r,180));await writeFile(path.join(output,name),(await window.webContents.capturePage()).toPNG())};
    const initial=await run(`
      await wait(()=>settled()&&document.querySelectorAll('.solo-empty-card').length===5);
      if(document.querySelector('.roster-player-card[data-player-id],.source-switch,#draw-mode')||document.querySelectorAll('.solo-empty-card').length!==5)throw Error('Initial roster must show five empty slots and no source or mode switch');
      clickText('讀取 LoL 隊伍');await wait(()=>settled()&&document.querySelectorAll('.roster-player-card').length===5);
      const refreshIcon = document.querySelector('.lol-refresh-button > span');
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (getComputedStyle(refreshIcon).animationName !== (reducedMotion ? 'none' : 'lol-refresh-spin')) throw Error('Refresh did not respect the motion preference');
      const labels=[...document.querySelectorAll('.roster-player-card .player-label')].map(el=>el.textContent);
      if(labels.some(n=>n.includes('#'))||!labels.includes('小明 · 1')||!labels.includes('小明 · 2'))throw Error('Riot ID display incorrect');
      if(!document.querySelector('.solo-draw-workspace.draw-workspace .primary-draw:not(:disabled)')||document.querySelector('.finish-setup,.btn-return,.table-role'))throw Error('Solo workspace must be ready without drawing');
      if(document.querySelector('#draw-mode,.source-switch,details.solo-draw-discord'))throw Error('Removed switches or collapsed Discord controls present');
      if(!document.querySelector('.solo-draw-discord .draw-discord-menu [role=combobox]')?.getBoundingClientRect().height)throw Error('Discord setup action not immediately visible');
      if(document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').getAttribute('aria-checked')==='true')throw Error('Auto-apply enabled by default');
      const before=JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);
      if(document.querySelector('.table-role')||document.querySelector('.primary-draw').textContent!=='開始抽籤')throw Error('Ready workspace must not generate results');
      if(before!==JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats))throw Error('Preparation updated stats');
      return {labels,readyActions:3,preparationDoesNotDraw:true};
    `);
    if(reads!==1)throw Error('Roster should be read exactly once on explicit import');
    await capture('ready.png');
    const tabGeometry = `
      const tabs = [...document.querySelectorAll('.compact-tabs [role="tab"]')];
      return tabs.map(tab => {
        const { x, y, width, height } = tab.getBoundingClientRect();
        return { x, y, width, height };
      });
    `;
    const tabsBefore = await run(tabGeometry);
    if (tabsBefore.length !== 2 || Math.abs(tabsBefore[0].width - tabsBefore[1].width) > 1 || tabsBefore[0].height !== tabsBefore[1].height) throw Error('Tool tabs must be equal in size');
    for (const [index, tab] of tabsBefore.entries()) {
      window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 });
      const baseBorder = await run(`
        const tab = document.querySelectorAll('.compact-tabs [role="tab"]')[${index}];
        await wait(() => !tab.matches(':hover') && !tab.getAnimations().length);
        return getComputedStyle(tab).borderTopColor;
      `);
      window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(tab.x + tab.width / 2), y: Math.round(tab.y + tab.height / 2) });
      await run(`
        const tab = document.querySelectorAll('.compact-tabs [role="tab"]')[${index}];
        await wait(() => tab.matches(':hover') && getComputedStyle(tab).borderTopColor !== ${JSON.stringify(baseBorder)}, 'Tool tab hover feedback missing');
      `);
    }
    await run(`clickText('抽英雄'); await wait(() => document.querySelector('.champion-flow'));`);
    if (JSON.stringify(await run(tabGeometry)) !== JSON.stringify(tabsBefore)) throw Error('Tool tabs shifted on selection');
    await run(`clickText('抽分路'); await wait(() => settled() && document.querySelector('.solo-draw-workspace'));`);
    await run(`await draw();if([...document.querySelectorAll('.table-role')].map(el=>el.textContent).join(',')!=='上路,打野,中路,下路,輔助')throw Error('Five-player cards must follow main role order');if(document.querySelector('.primary-draw').getBoundingClientRect().bottom>innerHeight)throw Error('Action below fold');`);
    await run(`
      const reveal = '.draw-card-result.is-revealing > .table-role > .table-role-icon';
      const first = [...document.querySelectorAll(reveal)];
      if (first.length !== 5 || document.querySelectorAll('.is-own-result .own-result-glow').length !== 1) throw Error('Draw reveal or own highlight missing');
      if (matchMedia('(prefers-reduced-motion: no-preference)').matches && first.some((icon, index) =>
        getComputedStyle(icon).animationName !== 'role-icon-reveal' || Math.abs(parseFloat(getComputedStyle(icon).animationDelay) * 1000 - index * 75) > 1)) throw Error('Incorrect reveal stagger');
      if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
        const glow = document.querySelector('.own-result-glow');
        const sweep = glow.getAnimations().find(animation => animation.animationName === 'own-result-sweep');
        if (!sweep) throw Error('Own card sweep missing');
        const style = getComputedStyle(glow);
        const { delay, duration } = sweep.effect.getTiming();
        const initialTime = sweep.currentTime;
        sweep.pause();
        const angles = [0, .25, .5, .75, 1].map(fraction => {
          sweep.currentTime = delay + duration * fraction;
          const angle = style.getPropertyValue('--own-result-angle').trim();
          return angle.endsWith('turn') ? parseFloat(angle) * 360 : parseFloat(angle);
        });
        const distances = angles.slice(1).map((angle, index) => angle - angles[index]);
        if (!style.maskComposite.includes('exclude') || !style.backgroundImage.includes('conic-gradient') ||
            !distances.every(distance => distance > 0) || Math.abs(angles[4] - 360) > 1 ||
            distances[1] <= distances[0] || distances[1] <= distances[2] || distances[2] <= distances[3]) {
          throw Error('Own card highlight must accelerate then ease to a stop: ' + JSON.stringify(angles));
        }
        sweep.currentTime = initialTime;
        sweep.play();
      }
      if (matchMedia('(prefers-reduced-motion: reduce)').matches &&
          (getComputedStyle(first[0]).animationName !== 'none' || getComputedStyle(document.querySelector('.own-result-glow')).animationName !== 'none' ||
           getComputedStyle(document.querySelector('.is-own-result'), '::after').boxShadow === 'none')) throw Error('Reduced motion must keep the static border only');
      await wait(() => document.querySelector('.primary-draw:not(:disabled)'));
      document.querySelector('.primary-draw').click();
      await wait(() => first.every(icon => !icon.isConnected));
      await wait(settled);
      if (document.querySelectorAll('.is-revealing').length !== 5) throw Error('Redraw did not restart reveal');
    `);
    if(reads!==1)throw Error('Draw without auto-apply unexpectedly reread LoL');
    await run(`await checkRoleIcons('dark',5)`);
    await capture('desktop-dark.png');
    await run(`await checkRoleIcons('light',5)`);
    await capture('desktop-light.png');
    const desktopLayout=await run(`
      if(document.querySelector('.workspace-sidebar'))throw Error('Removed sidebar is still present');
      const canvas=document.querySelector('main.container').getBoundingClientRect();
      if(Math.abs((canvas.left+canvas.right)/2-innerWidth/2)>1)throw Error('Desktop workspace is not centered');
      if(!document.querySelector('.compact-header .app-brand').getClientRects().length)throw Error('Top brand navigation missing');
      if(document.querySelector('.assignment-marker'))throw Error('Random result marked as assigned');
      const positions=[...document.querySelectorAll('.roster-player-card')].map(card=>card.getBoundingClientRect());
      if(Math.max(...positions.map(p=>p.top))-Math.min(...positions.map(p=>p.top))>1)throw Error('Desktop results not on one row');
      return {topNavigation:true,centeredWorkspace:true,roleIconsInBothThemes:true,fiveColumns:true};
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
        if(document.documentElement.scrollWidth>innerWidth||cards.length!==5||action.bottom>innerHeight)throw Error('Wide result overflow');
        if(parseFloat(getComputedStyle(document.querySelector('.player-label')).fontSize)<16)throw Error('Wide player text too small');
        return {width:innerWidth,height:innerHeight,canvasWidth:canvas.width};
      `);
      await capture(`wide-results-${width}.png`);
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
      if(cards.some(card=>card.height<89))throw Error('Actions obscure a player result: '+JSON.stringify({cards,actions}));
      scroll.scrollTop=scroll.scrollHeight; if(actions.bottom>innerHeight||document.querySelector('.roster-player-card:last-child').getBoundingClientRect().bottom>actions.top+2)throw Error('Five-player mobile result is not reachable');
      return {allFiveReachable:true,noActionOverlap:true};
    `);
    window.setContentSize(...originalSize);window.setMinimumSize(...originalMinimum);await new Promise(r=>setTimeout(r,150));
    await run(`
      const select=[...document.querySelectorAll('.sync-role-picker [role=combobox]')];
      if(select.length!==5||select.some(el=>!el.closest('.roster-player-card')))throw Error('Preference selector must belong to each player card');
      const ownSelector=document.querySelector('.roster-player-card:has(.self-badge) .sync-role-picker [role=combobox]');
      await setField(ownSelector,'中路');
      if(document.querySelector('.table-role, [aria-label="複製上次結果"]'))throw Error('Editing preferences must clear the current result');
      document.querySelector('[aria-label="抽完更新我的 LoL 分路"]').click();await wait(settled);await draw();
      if(document.querySelector('.roster-player-card:has(.self-badge) .table-role').textContent!=='中路'||!document.querySelector('[data-notice-id="apply-roles"].is-error')?.textContent.includes('抽籤結果已保留'))throw Error('Apply error erased result');
      if(document.querySelectorAll('.assignment-marker').length!==1)throw Error('Unspecified roles marked as assigned');
      if(!document.querySelector('.solo-draw-workspace'))throw Error('Workspace disappeared after draw');
    `);
    if(writes.length!==1||writes[0].some((r,i)=>r.name!==names[i]))throw Error('Native payload lost full IDs');
    await capture('assigned-results.png');
    readFailure=true;
    await run(`document.querySelector('.primary-draw').click();await wait(()=>settled()&&document.querySelector('[data-notice-id="draw-error"].is-error')?.textContent.includes('離線'));if(!document.querySelector('[data-notice-id="apply-roles"].is-error'))throw Error('Concurrent apply error fixture missing');if(document.querySelectorAll('.table-role').length!==5)throw Error('Read error erased results')`);
    readFailure=false;applySuccess=true;
    await run(`await draw();await wait(()=>document.querySelector('[data-notice-id="apply-roles"].is-success')?.textContent.includes('分路已套用'));if(document.querySelector('.inline-status.is-success,.client-apply-indicator'))throw Error('Apply success still uses banner or card marker')`);
    await capture('apply-toast.png');
    applySuccess=false;rosterChanged=true;
    const writesBeforeChange=writes.length;
    await run(`const before=JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats),namesBefore=[...document.querySelectorAll('.roster-player-card .player-label')].map(el=>el.textContent).join('|');document.querySelector('.primary-draw').click();await wait(()=>settled()&&document.querySelector('[data-notice-id="draw-error"]')?.textContent.includes('重新讀取 LoL 隊伍'));if(before!==JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats))throw Error('Changed team drawn without confirmation');if(namesBefore!==[...document.querySelectorAll('.roster-player-card .player-label')].map(el=>el.textContent).join('|'))throw Error('Changed team replaced editable names')`);
    if(writes.length!==writesBeforeChange)throw Error('Changed team unexpectedly applied roles');
    await run(`
      document.querySelector('.solo-draw-discord .draw-discord-menu [role=combobox]').click();await sleep();clickText('管理 Webhook');await wait(()=>document.querySelector('.settings-dialog')?.open);await sleep();
      await setField('#discord-label','測試頻道');await setField('#discord-webhook','https://discord.com/api/webhooks/123456789012345678/synthetic_test_only');await sleep();
      document.querySelector('.discord-settings-content form').requestSubmit();await wait(()=>document.querySelector('.discord-destination-list')?.textContent.includes('測試頻道'));
      if(document.querySelector('.settings-dialog [aria-label="Discord 自動同步"]').getAttribute('aria-checked')!=='false')throw Error('Save enabled sync');
      document.querySelector('[aria-label="刪除 測試頻道"]').click();await wait(()=>!document.querySelector('.discord-destination-list'));
      document.querySelector('.settings-dialog [aria-label="關閉設定"]').click();await sleep();document.querySelector('[aria-label="設定"]').click();await wait(()=>document.querySelector('.data-settings-panel'));
    `);
    await capture('settings-light.png');
    await run(`document.querySelector('.settings-dialog [aria-label="關閉設定"]').click();await sleep();const before=JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats);clickText('抽英雄');await sleep();await wait(()=>document.querySelector('.champion-actions button')&&!document.querySelector('.champion-actions button').disabled);document.querySelector('.champion-actions button').click();await wait(()=>document.querySelector('.champion-result h3')?.textContent);if(before!==JSON.stringify((await window.lolDesktop.initializeData({})).value.data.stats))throw Error('Champion draw changed stats');clickText('抽分路');await wait(()=>document.querySelector('.solo-draw-workspace'));`);
    const web=new BrowserWindow({show:false,width:1040,height:760,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    await web.loadURL('lol-draw://app/');await web.webContents.executeJavaScript(`localStorage.setItem('lolDrawStats',JSON.stringify({'同名#1':{},'同名#2':{},'第二位':{},'第三位':{}}));localStorage.setItem('lolDiscordSync',JSON.stringify({schemaVersion:2,enabled:false,activeDestinationId:'123456789012345678',destinations:[{id:'123456789012345678',label:'測試伺服器',webhookUrl:'https://discord.com/api/webhooks/123456789012345678/synthetic_test_only'},{id:'223456789012345678',label:'另一個伺服器',webhookUrl:'https://discord.com/api/webhooks/223456789012345678/synthetic_test_only'}]}));`);web.reload();await once(web.webContents,'did-finish-load');
    const webRun=code=>web.webContents.executeJavaScript(`(async()=>{${helpers}${code}})()`);
    await webRun(`await wait(()=>document.querySelector('.solo-draw-workspace'));clickText('新增玩家');await wait(()=>document.querySelector('dialog[open] .solo-add-dialog'));[...document.querySelectorAll('dialog[open] summary')].find(el=>el.textContent.includes('歷史玩家')).click();await sleep();`);
    for(const appearance of ['dark','light']){
      await webRun(`
        if(document.documentElement.dataset.theme!==${JSON.stringify(appearance)})document.querySelector('[aria-label="切換深淺色模式"]').click();
        await wait(()=>settled()&&document.documentElement.dataset.theme===${JSON.stringify(appearance)});
        await sleep(200);
        [...document.querySelectorAll('dialog[open] details')].find(el=>el.querySelector('summary')?.textContent.includes('歷史玩家')).open=true;
        await sleep();
        const menu=document.querySelector('dialog[open] .solo-add-dialog').getBoundingClientRect();
        if(menu.left<0||menu.right>innerWidth||menu.top<0||menu.bottom>innerHeight)throw Error('History dialog is clipped');
        const luminance=color=>{const rgb=color.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722};
        for(const chip of document.querySelectorAll('.known-chip')){const style=getComputedStyle(chip),a=luminance(style.color),b=luminance(style.backgroundColor);if((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)<4.5)throw Error('History player text has insufficient contrast: '+JSON.stringify({theme:document.documentElement.dataset.theme,selected:chip.getAttribute('aria-pressed'),color:style.color,background:style.backgroundColor}))}
        for(const label of ['歷史統計','設定']){const button=document.querySelector('.compact-header [aria-label="'+label+'"]');if(!button.querySelector('svg')||!button.title||button.textContent.trim())throw Error('Toolbar icon or accessible name missing')}
      `);
      web.show();web.webContents.invalidate();await new Promise(r=>setTimeout(r,180));await writeFile(path.join(output,`history-${appearance}.png`),(await web.webContents.capturePage()).toPNG());
    }
    await webRun(`document.querySelector('.solo-add-dialog [aria-label="關閉"]').click();await wait(()=>!document.querySelector('.solo-add-dialog'));`);
    await webRun(`
      if(document.querySelector('.solo-draw-discord select'))throw Error('Native full-width destination select still present');
      const trigger=document.querySelector('.solo-draw-discord .discord-destination-trigger'),box=trigger.getBoundingClientRect();
      if(box.width>200||!box.height)throw Error('Footer destination selector is not compact or visible');
      trigger.click();await sleep();
      const menu=document.querySelector('.discord-destination-menu').getBoundingClientRect();
      if(menu.left<0||menu.right>innerWidth||menu.top<0||menu.bottom>innerHeight)throw Error('Destination menu clipped');
      for(let i=0;i<2;i++)document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
      if(!document.activeElement.textContent.includes('另一個伺服器'))throw Error('Destination keyboard navigation failed');
      document.activeElement.click();await wait(()=>!document.querySelector('.discord-destination-menu')&&trigger.textContent.includes('另一個伺服器'));await sleep();
      await wait(()=>document.activeElement===trigger,'Destination selection lost focus');
      if(trigger.closest('.draw-discord-menu').dataset.value!=='223456789012345678')throw Error('Destination selection failed to enable sending');
      trigger.click();await sleep();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await sleep();
      if(document.querySelector('.discord-destination-menu')||document.activeElement!==trigger)throw Error('Destination Escape dismissal failed');
      trigger.click();await sleep();[...document.querySelectorAll('.discord-destination-menu [role="option"]')].find(el=>el.textContent.includes('測試伺服器')).click();await wait(()=>trigger.textContent.includes('測試伺服器')&&!document.querySelector('.discord-destination-menu'));
      trigger.click();await sleep();clickText('不自動傳送');await wait(()=>trigger.textContent.includes('不自動傳送')&&!document.querySelector('.discord-destination-menu'));
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
    await webRun(`
      await wait(()=>document.querySelector('.solo-draw-workspace'));if(document.querySelector('#draw-mode,.source-switch')||window.lolDesktop||document.querySelector('.auto-apply-control'))throw Error('Unexpected desktop controls or switches');
      clickText('新增玩家');await wait(()=>document.querySelector('dialog[open] .solo-add-dialog'));
      await setField('#player-name','手動玩家'); document.querySelector('.manual-add-form').requestSubmit();
      await wait(()=>!document.querySelector('.solo-add-dialog')&&document.querySelector('[data-player-id="手動玩家"]'));
      clickText('新增玩家');await wait(()=>document.querySelector('dialog[open] .solo-add-dialog'));
      const history=document.querySelector('.solo-add-history'); history.open=true;
      for (let i=0;i<2;i++) {
        const chip=history.querySelector('.known-chip[aria-pressed="false"]:not(:disabled)');
        if(!chip)throw Error('History players missing');
        chip.click();await wait(()=>settled()&&document.querySelectorAll('.roster-player-card[data-player-id]').length===i+2);
      }
      document.querySelector('.solo-add-dialog [aria-label="關閉"]').click();
      await wait(()=>!document.querySelector('.solo-add-dialog'));
      await setField(document.querySelector('.sync-role-picker [role=combobox]'),'中路');await draw();
      if(document.querySelectorAll('.table-role').length!==6)throw Error('Secondary roles missing');if(document.querySelector('.player-avatar'))throw Error('Draw screen clutter');
      if(document.querySelector('.draw-secondary').textContent.includes('副位'))throw Error('Secondary caption was not removed');
      if(document.querySelectorAll('.assignment-marker').length!==1)throw Error('Manual assigned role not marked');
      const assigned=document.querySelector('.table-role.is-assigned .table-role-icon');
      if(!assigned||parseFloat(getComputedStyle(assigned,'::before').borderTopWidth)<1||!assigned.querySelector('.assignment-marker svg'))throw Error('Assigned role frame or lock missing');
    `);
    web.show();
    for(const theme of ['dark','light']){
      await webRun(`await checkRoleIcons('${theme}',6)`);
      await writeFile(path.join(output,`website-results-${theme}.png`),(await web.webContents.capturePage()).toPNG());
    }
    const website=await webRun(`
      if(document.querySelectorAll('.roster-player-card[data-player-id]').length!==3||document.querySelectorAll('.solo-empty-card').length!==2||document.querySelectorAll('.sync-role-picker [role=combobox]').length!==3)throw Error('Draw lost roster or preferences');
      return {manualDraw:true,secondaryRoles:true,continuousHistory:true,preservesParameters:true,roleIconsInBothThemes:true};
    `);
    web.show();await writeFile(path.join(output,'secondary-results.png'),(await web.webContents.capturePage()).toPNG());
    web.setContentSize(390,844);await new Promise(r=>setTimeout(r,150));
    const mobile=await webRun(`if(document.documentElement.scrollWidth>innerWidth)throw Error('Mobile overflow');return {noOverflow:true}`);
    web.show();await writeFile(path.join(output,'website-mobile.png'),(await web.webContents.capturePage()).toPNG());
    await webRun(`
      clickText('新增玩家');await wait(()=>document.querySelector('dialog[open] .solo-add-dialog'));
      const history=[...document.querySelectorAll('dialog[open] details')].find(el=>el.querySelector('summary')?.textContent.includes('歷史玩家'));history.open=true;await sleep();
      const menu=document.querySelector('dialog[open] .solo-add-dialog').getBoundingClientRect();
      if(menu.left<0||menu.right>innerWidth||menu.top<0||menu.bottom>innerHeight)throw Error('Mobile history dialog clipped');
    `);
    await writeFile(path.join(output,'history-mobile.png'),(await web.webContents.capturePage()).toPNG());
    await webRun(`document.querySelector('.solo-add-dialog [aria-label="關閉"]').click();await wait(()=>!document.querySelector('.solo-add-dialog'))`);
    const removePoint = await webRun(`
      const button = document.querySelector('.roster-player-card.has-result .solo-remove-player');
      button.scrollIntoView({block:'nearest'});
      await sleep();
      const box = button.getBoundingClientRect();
      const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
      if (document.elementFromPoint(x,y)?.closest('button') !== button) throw Error('Role selector covers the remove button');
      return {x,y};
    `);
    web.focus();
    web.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...removePoint});
    web.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...removePoint});
    await webRun(`
      await wait(()=>document.querySelectorAll('.roster-player-card[data-player-id]').length===2);
      if (document.querySelector('.sync-role-menu')) throw Error('Removing a player opened the role picker');
    `);
    web.destroy();
    if(reads<4||errors.length)throw Error(errors.join('\n')||'Client not refreshed on draw');
    const check={initial,desktopLayout,wideLayouts,fivePlayerMobile,website,mobile,historyReadableInBothThemes:true,accessibleToolbarIcons:true,clientPreferences:true,customPreferences:true,applyFailurePreservesResult:true,readFailurePreservesResult:true,changedRosterRequiresConfirmation:true,completeIdsInNativePayload:true,settingsCrud:true,championDraw:true};
    await writeFile(path.join(output,'result.json'),JSON.stringify(check,null,2));console.log(JSON.stringify(check));clearTimeout(deadline);app.exit(0);
  }catch(error){console.error(error.stack);clearTimeout(deadline);app.exit(1)}
});
