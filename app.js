'use strict';
// token: only via #t= fragment, then localStorage (never in files or logs)
// STATIC = plan B (GitHub Pages): read published JSON files, no token, no SSE, poll.
const STATIC=!!window.DESK_STATIC;
const m=STATIC?null:location.hash.match(/t=([^&]+)/);if(m){localStorage.token=decodeURIComponent(m[1]);history.replaceState(null,'',location.pathname)}
const TOKEN=STATIC?'':(localStorage.token||'');const H=STATIC?{cache:'no-store'}:{headers:{Authorization:'Bearer '+TOKEN}};
function staticPath(u){const [p,q]=u.split('?');const r=(q||'').match(/range=(\w+)/);let f;
  if(p==='/api/state')f='state.json';else if(p==='/api/chart')f='chart-'+(r?r[1]:'LIVE')+'.json';else if(p==='/api/activity')f='activity.json';
  else if(p==='/api/account')f='account.json';else if(p==='/api/settings')f='settings.json';
  else if(p.startsWith('/api/agents/'))f='agents/'+p.split('/')[3]+'.json';else if(p.startsWith('/api/audit/'))f='audit/'+p.split('/')[3]+'.json';
  else if(p.startsWith('/api/coin/'))f='coin/'+p.split('/')[3]+'.json';else f=p.replace(/^\//,'');
  return 'data/'+f+'?v='+Math.floor(Date.now()/30000)}
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(v<0?'-':'')+'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const ago=iso=>{if(!iso)return'';const s=(Date.now()-Date.parse(iso))/1000;return s<60?'now':s<3600?Math.floor(s/60)+'m ago':s<86400?Math.floor(s/3600)+'h ago':Math.floor(s/86400)+'d ago'};
const hhmm=iso=>iso?new Date(iso).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'';
let range='LIVE',lastOk=null,S=null,retryIn=0;
async function j(u){const r=await fetch(STATIC?staticPath(u):u,H);if(!r.ok)throw new Error(r.status);return r.json()}

/* ---------- odometer ---------- */
function odometer(el,text){el.classList.remove('skel');
  if(el.dataset.v===text)return;const old=el.dataset.v||'';el.dataset.v=text;
  if(el.children.length!==text.length){el.innerHTML=[...text].map(ch=>/\d/.test(ch)?`<span class="d"><span>${[...Array(10).keys()].map(n=>`<b>${n}</b>`).join('')}</span></span>`:`<span class="s">${esc(ch)}</span>`).join('')}
  const kids=[...el.children];const n=kids.length;
  kids.forEach((k,i)=>{if(!k.classList.contains('d'))return;const d=+text[i];const inner=k.firstChild;inner.style.transitionDelay=((n-1-i)*30)+'ms';inner.style.transform=`translateY(${-d*70}px)`});
}

/* ---------- helpers ---------- */
function parseVal(v){const mm=String(v||'').match(/([+-])?\$([\d,.]+)/);const pm=String(v||'').match(/([+-]?[\d.]+)%/);
  return {usd:mm?(mm[1]==='-'?-1:1)*parseFloat(mm[2].replace(/,/g,'')):null,pct:pm?parseFloat(pm[1]):null}}
const nameOf=title=>String(title||'').replace(/^(Sold|Bought|Stopped|Rejected)\s+/,'');
function coinAvatar(name,seed){return `<div class="coin" style="background:${coinColor(seed||name)}">${esc((name||'?').trim()[0]||'?').toUpperCase()}</div>`}
function actRow(r){const name=nameOf(r.title);const pv=parseVal(r.value);let cls='',v=esc(r.value),sub='';
  if(r.kind==='sold'){cls=pv.usd>=0?'up':'down';v=`${pv.usd!=null?(pv.usd>=0?'+':'')+money(pv.usd):esc(r.value)}<small>${pv.pct!=null?(pv.pct>=0?'+':'')+pv.pct+'%':''}</small>`}
  else if(r.kind==='stopped'){cls='down';v=`${pv.usd!=null?money(pv.usd):esc(r.value)}<small>${esc((r.subtitle.match(/-[\d.]+%/)||[''])[0])}</small>`}
  else if(r.kind==='bought'){const parts=String(r.value).split('·');v=`${esc(parts[0])}<small class="muted">${esc(parts[1]||'')}</small>`}
  else{cls='muted'}
  return `<a class="row" href="${esc(r.link||'#')}" target="_blank" rel="noopener">${coinAvatar(name,r.mint)}<div class="mid"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.subtitle)} · ${ago(r.ts)}</div></div><div class="v ${cls}">${v}</div></a>`}

/* ---------- agent cards ---------- */
const META={scanner:{c:'#64d2ff',i:'◎',n:'Scanner'},auditor:{c:'#00d35a',i:'⛨',n:'Auditor'},analyst:{c:'#ffd60a',i:'◔',n:'Analyst'},executor:{c:'#00d35a',i:'⚡',n:'Executor'},risk:{c:'#ff6b9a',i:'◆',n:'Risk'}};
const ORDER=['auditor','scanner','analyst','executor','risk'];
let audit=null,execDec=null;
function hd(a){const mt=META[a.name];return `<div class="hd"><div class="ag" style="background:${mt.c}22;color:${mt.c}">${mt.i}</div>${mt.n}<span class="st"><i class="${a.status==='paused'?'p':''}"></i>${a.status==='paused'?'Paused':'Running'}</span></div>`}
function cardHTML(a){const mt=META[a.name];let big='',sub='',body='';
  if(a.name==='auditor'){big=`${a.takenApart} taken apart`;sub=`${a.rejected} rejected`;
    const L=(audit&&audit.layers)||[];const names=['Mint','Freeze','Dev','Top 10','LP','Age','Bundles','Delegates'];
    body=`<div class="strips">${names.map((nm,i)=>{const l=L.find(x=>x.layer===i+1);return `<div class="${l?(l.pass?'ok':'bad'):''}">${nm}</div>`}).join('')}</div>`+
      `<div class="sub">${audit&&L.length?(L.every(l=>l.pass)&&L.length===8?'8/8 → Executor':esc('Rejected · '+((L.find(l=>!l.pass)||{}).value_text||''))):'No coin taken apart yet'}</div>`}
  if(a.name==='scanner'){big=`${a.pools} pools`;sub='graduations seen today';
    const f=(a.feed||[]).slice(0,4);body=f.length?`<div class="feed">${f.map(x=>`<div class="${x.verdict==='kill'?'k':'p'}"><span class="n">${esc(x.name||x.mint.slice(0,6))}</span><span class="r">${esc(x.verdict==='pass'?'→ auditor':x.reason||x.verdict)}</span></div>`).join('')}</div>`:'<div class="sub">Listening for graduations</div>'}
  if(a.name==='analyst'){big='Scoring';sub=`mode: ${esc(a.mode)}`;body=`<div class="ring"><canvas id="ring"></canvas><div class="sub">${a.lastScore?`Last coin ${a.lastScore.pass?'passed':'rejected'}<br>green from 70`:'No coin scored yet'}</div></div>`}
  if(a.name==='executor'){big=`${a.trades} trades`;const last=execDec&&execDec[0];
    sub=last&&last.size_usd?`${money(last.size_usd)} · ${a.stackPct}% of stack`:`${a.stackPct}% of stack per trade`;
    body=`<div class="bar"><i style="width:${last&&last.verdict==='bought'?100:0}%"></i></div><div class="sub">${last?(last.verdict==='bought'?'✓ Filled':esc((last.verdict||'')+(last.reason?' · '+last.reason:''))):'Waiting for a signal'}</div>`}
  if(a.name==='risk'){big=a.guarding?'Guarding':'Idle';sub=a.guarding?`${a.guarding} open position${a.guarding>1?'s':''}`:(a.lastExit||'No open positions');
    body=`<div class="pills"><span class="pill pill-red mono">stop -${a.stopPct}%</span><span class="pill pill-green mono">trail ${a.trailPct}%</span></div>`}
  return `<div class="card">${hd(a)}<div class="big" style="color:${a.name==='scanner'?mt.c:'#fff'}">${big}</div><div class="sub">${sub}</div><div class="body">${body}</div></div>`}

/* ---------- views ---------- */
async function loadHome(){
  S=await j('/api/state');
  const [chart,act,adec,edec]=await Promise.all([j('/api/chart?range='+range),j('/api/activity'),j('/api/agents/auditor/decisions'),j('/api/agents/executor/decisions')]);
  audit=adec.rows[0]?await j('/api/audit/'+adec.rows[0].mint):null;execDec=edec.rows;
  odometer($('odo'),money(S.balance));$('badge').hidden=S.mode!=='PAPER';
  const start=chart.start||S.balance,pnl=S.balance-start;
  $('pnl').className='pnl '+(pnl>=0?'up':'down');$('pnl').textContent=`${pnl>=0?'+':'-'}${money(Math.abs(pnl))} (${S.todayPct>=0?'+':''}${S.todayPct.toFixed(2)}%)`;
  $('mult').textContent=S.multiplier.toFixed(2)+'×';$('mult').className='pill '+(S.multiplier>=1?'pill-green':'pill-red');
  const risk=S.agents.find(a=>a.name==='risk')||{};
  const marks=chart.marks.map(mk=>{const nm=nameOf(mk.title),pv=parseVal(mk.value),t=Date.parse(mk.ts);
    if(mk.kind==='bought')return{t,label:'Bought '+nm,color:COLORS.blue};
    if(mk.kind==='sold')return{t,label:(pv.usd>=0?'+':'-')+'$'+Math.abs(pv.usd||0).toFixed(2),color:pv.usd>=0?COLORS.green:COLORS.red,initial:(nm[0]||'?').toUpperCase()};
    if(mk.kind==='stopped')return{t,label:`-${risk.stopPct}% · -$${Math.abs(pv.usd||0).toFixed(2)}`,color:COLORS.red,initial:(nm[0]||'?').toUpperCase()};
    return null}).filter(Boolean);
  const pts=chart.points.map(p=>({t:Date.parse(p.ts),v:p.value}));
  drawBalance($('chart'),pts,start,marks);$('chartEmpty').hidden=marks.length>0;
  const run=S.agents.filter(a=>a.status==='running').length;$('nrun').textContent=run;
  const sc=$('cards').scrollLeft;$('cards').innerHTML=ORDER.map(n=>cardHTML(S.agents.find(a=>a.name===n))).join('');$('cards').scrollLeft=sc;
  const an=S.agents.find(a=>a.name==='analyst');if($('ring'))drawRing($('ring'),an.lastScore?an.lastScore.score:null,70);
  $('act5').innerHTML=act.rows.length?act.rows.slice(0,5).map(actRow).join(''):'<div class="empty">Nothing yet tonight</div>';
  $('dot').hidden=!act.rows.some(r=>r.kind!=='rejected'&&Date.now()-Date.parse(r.ts)<3600e3);
}
async function loadAgents(){const s=S||await j('/api/state');const out=[];
  for(const n of ['scanner','auditor','analyst','executor','risk']){const a=s.agents.find(x=>x.name===n);const d=await j(`/api/agents/${n}/decisions`);
    out.push(`<div class="agfull">${hd(a)}<div class="sub" style="margin:6px 0 8px">last ${d.rows.length} decisions</div>${d.rows.length?d.rows.map(r=>`<div class="dec"><span class="muted">${hhmm(r.ts)}</span><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.mint.slice(0,4)+'…'+r.mint.slice(-4))}</a><span>${esc(r.verdict||'')}</span><span class="muted">${esc(r.reason??'')}</span></div>`).join(''):'<div class="empty">No decisions yet</div>'}</div>`)}
  $('agentsFull').innerHTML=out.join('')}
async function loadActivity(){const a=await j('/api/activity');$('actAll').innerHTML=a.rows.length?a.rows.map(actRow).join(''):'<div class="empty">Nothing yet tonight</div>'}
async function loadAccount(){const a=await j('/api/account');const st=await j('/api/settings');
  const tg=a.telegram||{};
  $('acct').innerHTML=`<div class="acard"><div class="r"><span>Mode</span><span><span class="pill pill-orange">${esc(a.mode)}</span></span></div><div class="r"><span>Stack</span><span>${money(a.stack)}</span></div>
  ${a.profile_url?`<div class="r"><span>Your FOMO profile</span><a href="${esc(a.profile_url)}" target="_blank" rel="noopener">@${esc(a.fomo_handle)}</a></div>`:''}
  <div class="r"><span>Invite a friend</span><button class="link" id="invite">Share</button></div></div>
  <div class="acard"><div class="r"><span>Telegram</span><span>${tg.polling?'connected':'not connected'}${tg.bot?' · @'+esc(tg.bot):''}</span></div><div class="r"><span>Owner</span><span>${tg.owner_registered?'registered':'send /start to the bot'}</span></div>
  <div class="r"><span>Email alerts</span><span>daily digest</span></div><div class="r"><span>Web push</span><span>${esc(a.webpush)}</span></div>${STATIC?'':'<div class="r"><span>Send test push</span><button class="link" id="testpush">Send</button></div>'}</div>
  <div class="acard">${Object.entries(st.settings).map(([k,v])=>`<div class="r"><span class="small">${esc(k)}</span><span class="mono small">${esc(v)}</span></div>`).join('')}</div>`;
  $('invite').onclick=async()=>{try{if(navigator.share)await navigator.share({url:a.signup_url});else{await navigator.clipboard.writeText(a.signup_url);$('invite').textContent='Link copied'}}catch(e){}};
  if($('testpush'))$('testpush').onclick=async()=>{await fetch('/api/test_push',{method:'POST',...H});$('testpush').textContent='Sent'}}

let view='home';
async function refresh(){try{if(view==='home')await loadHome();else if(view==='agents')await loadAgents();else if(view==='activity')await loadActivity();else await loadAccount();
  lastOk=new Date();$('err').hidden=true;if(S)showStale(S.generated_at)}catch(e){showErr()}}
function showStale(iso){const el=$('stale');if(!el)return;if(!STATIC||!iso){el.hidden=true;return}
  const s=(Date.now()-Date.parse(iso))/1000;if(s>180){el.hidden=false;el.textContent='datos de hace '+Math.max(1,Math.floor(s/60))+' min'}else el.hidden=true}
function showErr(){retryIn=STATIC?30:15;$('err').hidden=false;tickErr()}
function tickErr(){if($('err').hidden)return;$('err').textContent=`Desk offline · retrying in ${retryIn}s · last update ${lastOk?lastOk.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'never'}`;if(retryIn-->0)setTimeout(tickErr,1000)}
function go(v){view=v;document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!=='v-'+v);document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.go===v));scrollTo(0,0);refresh()}
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));
$('ranges').onclick=e=>{const b=e.target.closest('button');if(!b)return;range=b.dataset.r;document.querySelectorAll('#ranges button').forEach(x=>x.classList.toggle('on',x===b));refresh()};
// SSE live updates (EventSource can't send headers: token goes as ?t=, access log is off on the server)
let pend=null;function soon(){clearTimeout(pend);pend=setTimeout(refresh,400)}
function sse(){if(!window.EventSource||!TOKEN)return;const es=new EventSource('/api/stream?t='+encodeURIComponent(TOKEN));
  ['scan','audit_layer','audit','verdict','signal','fill','exit','balance'].forEach(k=>es.addEventListener(k,soon));es.onerror=()=>{es.close();setTimeout(sse,5000)}}
addEventListener('resize',()=>{if(view==='home')refresh()});
refresh();if(!STATIC)sse();setInterval(refresh,STATIC?30000:15000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
