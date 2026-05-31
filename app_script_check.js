
const APP_CONFIG = {
  // auto: /api/github → 同梱ファイル → GitHub Raw の順に自動で試します。
  // Cloudflare側のGitHub環境変数が未設定でも、Date/Ques の同梱JSONから読み込めます。
  sourceMode: 'local',
  github: { owner: '', repo: '', branch: 'main', rootPath: '' },
  cloudProgress: true
};
const $=id=>document.getElementById(id);
let me={authenticated:false,email:null,name:null};
let examsIndex={exams:[]};
let currentExamId=null, partsCache={}, tickHandle=null;
let state={examId:null,part:null,mode:'all',attemptId:null,order:[],index:0,correct:0,answers:[],startedAt:null,elapsedMs:0,sessionStartedAt:null,timerRunning:false,finished:false};
function escapeHtml(str){return String(str??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}
function fmtTime(ms){if(!ms||ms<0)return'00:00';const s=Math.floor(ms/1000),m=Math.floor(s/60),sec=s%60,h=Math.floor(m/60),mm=m%60;return h>0?`${h}:${String(mm).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
function makeAttemptId(){return 'att_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10)}
function simpleHashText(str){let h=2166136261;for(let i=0;i<String(str).length;i++){h^=String(str).charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36)}
function historySignature(h){
  const answers=(h?.answers||[]).map(a=>`${a.q||''}:${a.choice||''}:${(a.correctAnswer||[]).join('/')}:${a.correct?'1':'0'}`).join(',');
  const order=(h?.order||[]).join(',');
  return simpleHashText([h?.examId||'',h?.part||'',h?.mode||'all',h?.startedAt||'',h?.completedAt||'',h?.correct??'',h?.elapsedMs??'',order,answers].join('|'));
}
function stableLegacyAttemptId(h){return 'legacy_'+historySignature(h)}
function historyIdentity(h){return h?.attemptId || stableLegacyAttemptId(h)}
function mergeHistory(...lists){
  const map=new Map(), seen=new Set();
  lists.flat().filter(Boolean).forEach(h=>{
    const x=ensureTimingFields({...h});
    const keys=[historyIdentity(x), historySignature(x)].filter(Boolean);
    if(keys.some(k=>seen.has(k))) return;
    keys.forEach(k=>seen.add(k));
    map.set(keys[0],x);
  });
  return [...map.values()].sort((a,b)=>new Date(b.completedAt||b.startedAt||0)-new Date(a.completedAt||a.startedAt||0));
}
function ensureTimingFields(s){
  if(!s) return s;
  if(typeof s.elapsedMs!=='number'){
    const last=s.answers&&s.answers.length?s.answers[s.answers.length-1].time:0;
    s.elapsedMs=Number(last||0);
  }
  if(!('sessionStartedAt' in s)) s.sessionStartedAt=null;
  if(!('timerRunning' in s)) s.timerRunning=false;
  if(!s.attemptId) s.attemptId=stableLegacyAttemptId(s);
  return s;
}
function currentElapsedMs(){
  if(!state||!state.examId||!state.part) return 0;
  const base=Number(state.elapsedMs||0);
  if(state.timerRunning&&state.sessionStartedAt) return base+Math.max(0,Date.now()-state.sessionStartedAt);
  if(typeof state.elapsedMs==='number') return base;
  return state.startedAt?Math.max(0,Date.now()-state.startedAt):0;
}
function snapshotState(){
  ensureTimingFields(state);
  return {...state,elapsedMs:currentElapsedMs(),sessionStartedAt:null,timerRunning:false};
}
function partName(p){return p==='am'?'午前':'午後'}
function correctLabel(q){return q.correct.length>1?q.correct.join(' または '):String(q.correct[0])}
let activeSourceMode = 'local';
const GUEST_KEY = 'me2_guest_login';
const SITE_AUTH_KEY = 'me2_site_auth';
function safeAssetPath(path){return String(path||'').replace(/^\.\//,'').replace(/^\//,'')}
function githubConfigured(){const g=APP_CONFIG.github||{};return Boolean(g.owner&&g.repo&&g.owner!=='YOUR_GITHUB_USER'&&g.repo!=='ME2_JSON_App')}
function sourceLabel(mode){return {auto:'自動',cloudflare_proxy:'Cloudflare Proxy',github_raw:'GitHub Raw',local:'同梱ファイル'}[mode]||mode}

function fetchWithTimeout(url, options={}, ms=2500){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), ms);
  return fetch(url, {...options, signal: ctrl.signal}).finally(()=>clearTimeout(timer));
}
function friendlyFetchError(e){
  if(e && (e.name === 'AbortError' || String(e.message||'').includes('aborted'))) return 'タイムアウト';
  return e?.message || String(e);
}
function assetUrlForMode(path, mode){
  const safe=safeAssetPath(path);
  if(mode==='github_raw'){
    const g=APP_CONFIG.github, root=(g.rootPath||'').replace(/^\//,'').replace(/\/$/,'');
    return `https://raw.githubusercontent.com/${encodeURIComponent(g.owner)}/${encodeURIComponent(g.repo)}/${encodeURIComponent(g.branch||'main')}/${root?root+'/':''}${safe}`;
  }
  if(mode==='cloudflare_proxy') return `/api/github?path=${encodeURIComponent(safe)}`;
  return safe;
}
function assetUrl(path){return assetUrlForMode(path, activeSourceMode || 'local')}
function candidateSourceModes(){
  if(APP_CONFIG.sourceMode && APP_CONFIG.sourceMode !== 'auto') return [APP_CONFIG.sourceMode];
  // 固まる原因になりやすい /api/github より、まず同梱ファイルを読む。
  const modes=['local','cloudflare_proxy'];
  if(githubConfigured()) modes.push('github_raw');
  return modes;
}
async function fetchJSON(path){
  const errors=[];
  for(const mode of candidateSourceModes()){
    try{
      const r=await fetchWithTimeout(assetUrlForMode(path, mode),{cache:'no-store'},2500);
      if(!r.ok) throw new Error(`${r.status}`);
      const data=await r.json();
      activeSourceMode=mode;
      $('sourceBadge').textContent=sourceLabel(mode);
      return data;
    }catch(e){errors.push(`${mode}:${friendlyFetchError(e)}`)}
  }
  throw new Error(`${path}: ${errors.join(' / ')}`);
}
function randomId(prefix='guest'){
  const a=new Uint8Array(8); crypto.getRandomValues(a);
  return prefix+'_'+[...a].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function randomToken(){
  const a=new Uint8Array(18); crypto.getRandomValues(a);
  return [...a].map(x=>x.toString(36).padStart(2,'0')).join('').slice(0,24);
}
function getGuest(){return loadLocal(GUEST_KEY,null)}
function setGuest(g){saveLocal(GUEST_KEY,g)}
function clearGuest(){localStorage.removeItem(GUEST_KEY)}
function getSiteAuth(){return loadLocal(SITE_AUTH_KEY,null)}
function setSiteAuth(a){saveLocal(SITE_AUTH_KEY,a)}
function clearSiteAuth(){localStorage.removeItem(SITE_AUTH_KEY)}
function hasCloudLogin(){const a=getSiteAuth(), g=getGuest();return Boolean((a&&a.loginId&&a.sessionToken)||(g&&g.id&&g.token))}
function guestHeaders(){
  const a=getSiteAuth();
  if(a&&a.loginId&&a.sessionToken) return {'X-ME2-Login-Id':a.loginId,'X-ME2-Session-Token':a.sessionToken};
  const g=getGuest();
  if(!g||!g.id||!g.token) return {};
  return {'X-ME2-Guest-Id':g.id,'X-ME2-Guest-Token':g.token,'X-ME2-Guest-Name':g.name||'ゲスト'};
}
function saveLocal(k,v){localStorage.setItem(k,JSON.stringify(v))}function loadLocal(k,f=null){try{return JSON.parse(localStorage.getItem(k)||'null')??f}catch(e){return f}}
const stateKey=(examId,part)=>`me2_state_${examId}_${part}`; const historyKey=(examId,part)=>`me2_history_${examId}_${part}`;
const cloudStateTimers={}, cloudStateLast={};
async function apiProgress(method, payload=null){
  if(!APP_CONFIG.cloudProgress) return null;
  try{
    let url='/api/progress';
    const opt={method,headers:{'content-type':'application/json',...guestHeaders()}};
    if(method==='GET' && payload){
      const params=new URLSearchParams();
      Object.entries(payload).forEach(([k,v])=>{if(v!==undefined&&v!==null)params.set(k,String(v))});
      url += '?' + params.toString();
    } else if(payload) opt.body=JSON.stringify(payload);
    const r=await fetchWithTimeout(url,opt,3000);
    if(!r.ok) throw new Error(String(r.status));
    $('progressMode').textContent='端末保存 + Cloudflare KV保存';
    return await r.json();
  }catch(e){$('progressMode').textContent='端末保存のみ（KV未設定・未ログイン・通信失敗）';return null;}
}
async function loadMe(){
  try{const r=await fetchWithTimeout('/api/me',{cache:'no-store',headers:guestHeaders()},2000);if(!r.ok)throw new Error(String(r.status));me=await r.json();}
  catch(e){me={authenticated:false,email:null,name:null,local:true};}
  $('userBadge').textContent=me.accountLabel?`ログイン: ${me.accountLabel}`:'未ログイン/ローカル';
  return me;
}
function showLoginInfo(){
  hideAll();
  $('loginCard').classList.remove('hidden');
  const site=getSiteAuth();
  const g=getGuest();
  const siteBox = site ? `
    <div class="account-card small">
      <b>サイトログイン中</b><br>
      ログインID：<span class="code">${escapeHtml(site.loginId)}</span><br>
      表示名：${escapeHtml(site.displayName||site.loginId)}<br>
      保存先：Cloudflare KV
    </div>` : `<p class="small">サイトログインは未ログインです。好きなログインIDを登録すると、別端末でも同じIDで進行状況を復元できます。</p>`;
  const guestBox = g ? `
    <div class="mobile-note small">
      <b>旧ゲストログイン中</b><br>
      ゲストID：<span class="code">${escapeHtml(g.id)}</span><br>
      復元コード：<span class="code">${escapeHtml(g.token)}</span>
    </div>` : '';
  $('loginInfo').innerHTML=`
    ${siteBox}
    <div class="form-grid">
      <div class="form-card">
        <h3>新規登録</h3>
        <p class="small">ログインIDは自分で決められます。英数字・_・- の3〜32文字がおすすめです。</p>
        <div class="field"><label for="regLoginId">ログインID</label><input id="regLoginId" autocomplete="username" placeholder="例：me2_user01"></div>
        <div class="field"><label for="regName">表示名</label><input id="regName" autocomplete="nickname" placeholder="例：太郎 / ゲスト など"></div>
        <div class="field"><label for="regPassword">保存用パスワード</label><input id="regPassword" type="password" autocomplete="new-password" placeholder="4文字以上"></div>
        <div class="field"><label for="regPassword2">保存用パスワード確認</label><input id="regPassword2" type="password" autocomplete="new-password" placeholder="もう一度入力"></div>
        <button onclick="registerSiteAccount()">このIDで登録</button>
      </div>
      <div class="form-card">
        <h3>ログイン</h3>
        <p class="small">登録済みのログインIDと保存用パスワードでログインします。</p>
        <div class="field"><label for="loginId">ログインID</label><input id="loginId" autocomplete="username" placeholder="登録したID"></div>
        <div class="field"><label for="loginPassword">保存用パスワード</label><input id="loginPassword" type="password" autocomplete="current-password" placeholder="保存用パスワード"></div>
        <button class="secondary" onclick="loginSiteAccount()">ログイン</button>
      </div>
    </div>
    <div id="siteLoginStatus" class="login-status">入力内容はこの画面内で送信します。ポップアップは使いません。</div>
    <div class="danger-zone small">
      <b>補助機能</b><br>
      Cloudflare KVが未設定の場合は、端末内保存だけで動きます。<br>
      ${guestBox}
      <div class="row" style="margin-top:10px">
        <button class="ghost" onclick="createGuestLogin()">登録せず簡単ゲストで使う</button>
        <button class="danger" onclick="logoutSiteAccount()">サイトログアウト</button>
        <button class="danger" onclick="logoutGuest()">旧ゲスト情報を削除</button>
        <button class="secondary" onclick="loadMe().then(showLoginInfo)">ログイン状態を再確認</button>
      </div>
    </div>
    <p class="small"><b>Cloudflare Access：</b>${escapeHtml(me.access?.email||me.email||'-')}</p>
  `;
}
function loginStatus(msg, ok=false){const el=$('siteLoginStatus');if(el){el.innerHTML=msg;el.className='login-status '+(ok?'status-ok':'status-warn')}}
function normalizeLoginId(v){return String(v||'').trim().toLowerCase()}
async function registerSiteAccount(){
  const loginId=normalizeLoginId($('regLoginId').value), displayName=String($('regName').value||'').trim()||loginId;
  const password=$('regPassword').value, password2=$('regPassword2').value;
  if(!/^[a-z0-9_-]{3,32}$/.test(loginId)) return loginStatus('ログインIDは英数字・_・- の3〜32文字で入力してください。');
  if(password.length<4) return loginStatus('保存用パスワードは4文字以上にしてください。');
  if(password!==password2) return loginStatus('確認用パスワードが一致していません。');
  loginStatus('登録中…');
  try{
    const r=await fetchWithTimeout('/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'register',loginId,displayName,password})},5000);
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||String(r.status));
    setSiteAuth({loginId:data.account.loginId,displayName:data.account.displayName,sessionToken:data.sessionToken,sessionExpiresAt:data.sessionExpiresAt});
    clearGuest();
    await loadMe();
    loginStatus(`登録しました。現在のログインID：<span class="code">${escapeHtml(data.account.loginId)}</span>`,true);
    setTimeout(showLoginInfo,600);
  }catch(e){loginStatus('登録できません：'+escapeHtml(e.message||e));}
}
async function loginSiteAccount(){
  const loginId=normalizeLoginId($('loginId').value), password=$('loginPassword').value;
  if(!loginId||!password) return loginStatus('ログインIDと保存用パスワードを入力してください。');
  loginStatus('ログイン中…');
  try{
    const r=await fetchWithTimeout('/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'login',loginId,password})},5000);
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||String(r.status));
    setSiteAuth({loginId:data.account.loginId,displayName:data.account.displayName,sessionToken:data.sessionToken,sessionExpiresAt:data.sessionExpiresAt});
    clearGuest();
    await loadMe();
    loginStatus(`ログインしました。ようこそ、${escapeHtml(data.account.displayName||data.account.loginId)} さん。`,true);
    if(currentExamId) renderPartMenu();
    setTimeout(showLoginInfo,600);
  }catch(e){loginStatus('ログインできません：'+escapeHtml(e.message||e));}
}
async function logoutSiteAccount(){
  const a=getSiteAuth();
  if(a&&a.sessionToken){
    try{await fetchWithTimeout('/api/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'logout',sessionToken:a.sessionToken})},2500)}catch(e){}
  }
  clearSiteAuth();
  await loadMe();
  showLoginInfo();
}
function createGuestLogin(){
  const g={id:randomId('guest'),token:randomToken(),name:'ゲスト',createdAt:new Date().toISOString()};
  setGuest(g);clearSiteAuth();
  loadMe().then(showLoginInfo);
}
function restoreGuestLogin(){
  const id=String($('oldGuestId')?.value||'').trim();
  const token=String($('oldGuestToken')?.value||'').trim();
  if(!id||!token) return loginStatus('ゲストIDと復元コードを入力してください。');
  setGuest({id,token,name:'ゲスト',restoredAt:new Date().toISOString()});clearSiteAuth();
  loadMe().then(showLoginInfo);
}
function logoutGuest(){
  clearGuest();
  loadMe().then(showLoginInfo);
}
async function loadIndex(){
  $('sourceBadge').textContent='自動確認中';
  try{
    examsIndex=await fetchJSON('Date/Ques/exams_index.json');
    $('loadMode').innerHTML=`<span class="status-ok">読み込み成功（${sourceLabel(activeSourceMode)}）</span>`;
  }catch(e){
    $('loadMode').innerHTML=`<span class="status-warn">読み込み失敗：Date/Ques/exams_index.json が見つかりません。GitHubにDateフォルダが上がっているか確認してください。<br><span class="code">${escapeHtml(e.message||e)}</span></span>`;
    examsIndex={exams:[]};
  }
}
async function getPart(examId,part){const key=`${examId}_${part}`;if(partsCache[key])return partsCache[key];const rec=getExamRecord(examId);const path=rec?.parts?.[part];if(!path)throw new Error('part path missing');partsCache[key]=await fetchJSON(path);return partsCache[key]}
function getExamRecord(id){return examsIndex.exams.find(x=>String(x.id)===String(id))}
function hideAll(){['menuCard','loginCard','partCard','quizCard','finishCard'].forEach(id=>$(id).classList.add('hidden'))}
function showMenu(){if(state&&state.timerRunning){pauseTimer();saveState()}hideAll();$('menuCard').classList.remove('hidden');renderMenu();updateHeader()}
function renderMenu(){const grid=$('examGrid');grid.innerHTML='';$('roundCount').textContent=`${examsIndex.exams.length}回分`;if(!examsIndex.exams.length){grid.innerHTML='<div class="mobile-note small">試験回を読み込めません。Date/Ques/exams_index.json が配置されているか確認してください。</div>';return}examsIndex.exams.forEach(ex=>{const div=document.createElement('div');div.className='round-card';div.onclick=()=>selectExam(ex.id);div.innerHTML=`<h3>${escapeHtml(ex.title)}</h3><p class="small">${escapeHtml(ex.subtitle||'')}</p><p class="small">問題数：午前/午後 各60問</p>`;grid.appendChild(div)})}
async function selectExam(examId){if(state&&state.timerRunning){pauseTimer();saveState()}currentExamId=examId;hideAll();$('partCard').classList.remove('hidden');const rec=getExamRecord(examId);$('selectedExamTitle').textContent=rec?rec.title:'試験回';await renderPartMenu()}
async function loadCloudState(examId,part){
  if(!hasCloudLogin()) return null;
  const res=await apiProgress('GET',{type:'state',examId,part});
  const cloudState=res?.data?.data;
  if(cloudState&&cloudState.examId&&cloudState.part){ensureTimingFields(cloudState);saveLocal(stateKey(examId,part),cloudState);return cloudState;}
  return null;
}
async function loadCloudHistory(examId,part){
  if(!hasCloudLogin()) return [];
  const res=await apiProgress('GET',{type:'history',examId,part});
  const arr=Array.isArray(res?.data)?res.data:(Array.isArray(res?.data?.data)?res.data.data:[]);
  return arr.map(x=>ensureTimingFields(x?.data&&x.data.examId?x.data:x)).filter(x=>x&&x.examId&&x.part);
}
function saveMergedHistoryLocal(examId,part,hist){saveLocal(historyKey(examId,part),mergeHistory(hist).slice(0,300));}
async function renderPartMenu(){
  for(const part of ['am','pm']){
    const box=$(part+'Box');
    let saved=loadLocal(stateKey(currentExamId,part));
    if(!saved && hasCloudLogin()) saved=await loadCloudState(currentExamId,part);
    let hist=loadLocal(historyKey(currentExamId,part),[]);
    if(hasCloudLogin()){const cloudHist=await loadCloudHistory(currentExamId,part);hist=mergeHistory(hist,cloudHist);saveMergedHistoryLocal(currentExamId,part,hist);}
    if(saved) ensureTimingFields(saved);
    const savedText=saved&&!saved.finished?`途中保存あり：${saved.index+1}問目 / 経過 ${fmtTime(saved.elapsedMs||0)} / `:'';
    const lastText=hist.length&&hist[0].elapsedMs!==undefined?` / 直近 ${fmtTime(hist[0].elapsedMs||0)}`:'';
    box.innerHTML=`<h3>${partName(part)}</h3><p class="small">${savedText}履歴 ${hist.length}件${lastText}</p><div class="row"><button onclick="startAttempt('${part}','all')">最初から</button>${saved&&!saved.finished?`<button class="secondary" onclick="resumeAttempt('${part}')">途中から</button>`:''}<button class="ghost" onclick="showHistory('${part}')">履歴</button></div>`;
  }
}
async function startAttempt(part,mode='all'){const pack=await getPart(currentExamId||state.examId,part);const total=pack.questions.length;state={examId:currentExamId||state.examId,part,mode,attemptId:makeAttemptId(),order:[...Array(total).keys()],index:0,correct:0,answers:[],startedAt:Date.now(),elapsedMs:0,sessionStartedAt:null,timerRunning:false,finished:false};startTimer();saveState();showQuiz();renderQuestion()}
async function resumeAttempt(part){let s=loadLocal(stateKey(currentExamId,part));if(!s&&hasCloudLogin())s=await loadCloudState(currentExamId,part);if(!s)return;state=ensureTimingFields(s);state.timerRunning=false;state.sessionStartedAt=null;await getPart(state.examId,part);startTimer();showQuiz();renderQuestion()}
function showQuiz(){hideAll();$('quizCard').classList.remove('hidden')}
function currentPack(){return partsCache[`${state.examId}_${state.part}`]}function getCurrentQuestion(){return currentPack()?.questions?.[state.order[state.index]]}
function renderQuestion(){const q=getCurrentQuestion();if(!q){showFinish();return}$('qMeta').textContent=`${getExamRecord(state.examId).title} ${partName(state.part)} 第${q.number}問 / ${state.order.length}問中${state.index+1}問目　範囲：${q.range||'未設定'}`;$('bar').style.width=`${state.index/state.order.length*100}%`;$('stem').textContent=q.stem;const qImg=$('questionImage');qImg.innerHTML=(q.hasFigure&&q.image)?`<details open><summary>図・表を表示（解答前に確認）</summary><p class="image-hint">この問題は図・表を使います。画像を確認して解答してください。</p><img class="source-img" src="${escapeHtml(assetUrl(q.image))}" alt="図表画像" /></details>`:'';const choices=$('choices');choices.innerHTML='';q.choices.forEach((c,i)=>{const btn=document.createElement('button');btn.className='choice';btn.onclick=()=>answer(i+1);btn.innerHTML=`<span class="num">${i+1}</span><span>${escapeHtml(c)}</span>`;choices.appendChild(btn)});$('result').style.display='none';$('result').className='result';$('result').innerHTML='';$('nextBtn').classList.add('hidden');updateHeader();saveState()}
function answeredCount(){return state.answers.length}
function answer(choice){const q=getCurrentQuestion();if(state.answers[state.index])return;const correct=q.correct.includes(choice);state.answers[state.index]={q:q.number,choice,correct,correctAnswer:q.correct.slice(),time:currentElapsedMs(),range:q.range||''};if(correct)state.correct++;Array.from(document.querySelectorAll('.choice')).forEach((btn,i)=>{btn.disabled=true;const n=i+1;if(q.correct.includes(n))btn.classList.add('correct');if(n===choice&&!correct)btn.classList.add('wrong')});showExplanation(q,choice,correct);$('nextBtn').classList.remove('hidden');$('bar').style.width=`${(state.index+1)/state.order.length*100}%`;saveState();updateHeader();setTimeout(()=>$('result').scrollIntoView({behavior:'smooth',block:'start'}),80)}
function showExplanation(q,choice,correct){const rate=answeredCount()?Math.round(state.correct/answeredCount()*1000)/10:0,res=$('result');res.style.display='block';res.className='result '+(correct?'good':'bad');const rows=q.choices.map((c,i)=>{const n=i+1,isC=q.correct.includes(n),note=(q.choiceNotes&&q.choiceNotes[i])?q.choiceNotes[i]:(isC?'この選択肢が正答です。':'誤りポイント：正答は '+correctLabel(q)+' です。');return`<tr><th>${n}</th><td>${escapeHtml(c)}</td><td>${isC?'✅ 正答':'×'}</td><td>${escapeHtml(note)}</td></tr>`}).join('');const img=(q.hasFigure&&q.image)?`<details><summary>図・表を再表示</summary><img class="source-img" src="${escapeHtml(assetUrl(q.image))}" /></details>`:'';res.innerHTML=`<h3>${correct?'正解！':'不正解'}</h3><p><b>あなたの回答：</b>${choice}　<b>正答：</b>${correctLabel(q)}　<b>現在の正答率：</b>${rate}%</p><p><b>範囲：</b>${escapeHtml(q.range||'未設定')}</p><p><b>要点解説：</b>${escapeHtml(q.tip||'正答表に基づいて判定します。')}</p><table class="explain-table"><thead><tr><th>番号</th><th>選択肢</th><th>判定</th><th>どこが違う？ / 解説ポイント</th></tr></thead><tbody>${rows}</tbody></table>${img}`}
function nextQuestion(){if(state.index>=state.order.length-1){pauseTimer();state.finished=true;saveState();saveHistory();showFinish();return}state.index++;saveState();renderQuestion()}
function startTimer(){clearInterval(tickHandle);ensureTimingFields(state);state.timerRunning=true;state.sessionStartedAt=Date.now();tickHandle=setInterval(updateHeader,1000);updateHeader()}
function pauseTimer(){clearInterval(tickHandle);if(state&&state.examId&&state.part){state.elapsedMs=currentElapsedMs();state.sessionStartedAt=null;state.timerRunning=false;}updateHeader()}
function updateHeader(){$('partBadge').textContent=state.part?`${getExamRecord(state.examId)?.title||''} ${partName(state.part)} ${Math.min(state.index+1,state.order.length)}/${state.order.length}`:'未開始';$('scoreBadge').textContent=`${state.correct}/${answeredCount()} 正解`;$('timerBadge').textContent=fmtTime(currentElapsedMs())}
function scheduleCloudStateSave(snap,force=false){
  if(!APP_CONFIG.cloudProgress||!hasCloudLogin())return;
  const k=`${snap.examId}_${snap.part}`;
  const run=()=>{cloudStateLast[k]=Date.now();apiProgress('POST',{type:'state',examId:snap.examId,part:snap.part,data:snap});};
  clearTimeout(cloudStateTimers[k]);
  const wait=Math.max(0,1300-(Date.now()-(cloudStateLast[k]||0)));
  if(force||wait===0)run();else cloudStateTimers[k]=setTimeout(run,wait);
}
function saveState(){if(!state.examId||!state.part)return;ensureTimingFields(state);const snap=snapshotState();saveLocal(stateKey(state.examId,state.part),snap);scheduleCloudStateSave(snap);$('saveStateText').textContent='保存済み'}
function saveHistory(){const k=historyKey(state.examId,state.part);const snap={...snapshotState(),attemptId:state.attemptId||makeAttemptId(),finished:true,completedAt:new Date().toISOString()};const hist=mergeHistory([snap],loadLocal(k,[])).slice(0,300);saveLocal(k,hist);scheduleCloudStateSave(snap,true);apiProgress('POST',{type:'attempt',examId:state.examId,part:state.part,data:snap})}
async function resetPart(part){if(confirm(`${getExamRecord(currentExamId).title} ${partName(part)} の途中保存を削除しますか？`)){localStorage.removeItem(stateKey(currentExamId,part));await apiProgress('DELETE',{type:'state',examId:currentExamId,part});renderPartMenu()}}
function showFinish(){pauseTimer();hideAll();$('finishCard').classList.remove('hidden');const elapsed=state.elapsedMs||0;$('finalPart').textContent=`${getExamRecord(state.examId).title} ${partName(state.part)}`;$('finalScore').textContent=`${state.correct} / ${state.order.length}`;$('finalRate').textContent=`${Math.round(state.correct/state.order.length*1000)/10}%`;$('finalTime').textContent=fmtTime(elapsed);renderWrongList()}
function renderWrongList(){const pack=currentPack(), wrong=state.answers.map((a,i)=>({a,q:pack.questions[state.order[i]]})).filter(x=>!x.a.correct), box=$('wrongList');$('retryWrongBtn').disabled=wrong.length===0;box.innerHTML=`<h3>間違った問題一覧：${wrong.length}問</h3>`+(wrong.length?wrong.map(({a,q})=>`<div class="wrong-item"><b>第${q.number}問 / 範囲：${escapeHtml(q.range||'未設定')}</b><br>あなた：${a.choice} / 正答：${correctLabel(q)}<br><span class="small">${escapeHtml(q.tip||'')}</span></div>`).join(''):'<p class="small">全問正解です。すごい。</p>')}
function retryWrong(){const wrongIndexes=state.answers.map((a,i)=>a.correct?null:state.order[i]).filter(x=>x!==null);if(!wrongIndexes.length)return;state={...state,mode:'wrong',attemptId:makeAttemptId(),order:wrongIndexes,index:0,correct:0,answers:[],startedAt:Date.now(),elapsedMs:0,sessionStartedAt:null,timerRunning:false,finished:false};startTimer();saveState();showQuiz();renderQuestion()}
function historyStatsHtml(hist, pack){
  const base=hist.filter(h=>h && (h.mode||'all')==='all');
  const target=base.length?base:hist;
  const rates=target.map(h=>{const total=h.order?.length||h.answers?.length||0;return total?((h.correct||0)/total*100):0});
  const attempts=target.length;
  const avgRate=attempts?rates.reduce((a,b)=>a+b,0)/attempts:0;
  const bestRate=attempts?Math.max(...rates):0;
  const latest=target[0];
  const latestTotal=latest?.order?.length||latest?.answers?.length||0;
  const latestRate=latestTotal?((latest.correct||0)/latestTotal*100):0;
  const totalTime=target.reduce((a,h)=>a+Number(h.elapsedMs||0),0);
  const avgTime=attempts?totalTime/attempts:0;
  const missMap=new Map();
  target.forEach(h=>{
    (h.answers||[]).forEach((a,i)=>{
      if(a && !a.correct){
        const qNo=a.q || pack?.questions?.[h.order?.[i]]?.number || '?';
        missMap.set(qNo,(missMap.get(qNo)||0)+1);
      }
    });
  });
  const misses=[...missMap.entries()].sort((a,b)=>b[1]-a[1]||Number(a[0])-Number(b[0])).slice(0,5);
  const missText=misses.length?misses.map(([q,c])=>`第${q}問 ${c}回`).join(' / '):'なし';
  return `<div class="card" style="box-shadow:none;background:#f8fafc;margin:10px 0 14px">
    <h3>全体統計</h3>
    <div class="kpi">
      <div><b>${attempts}</b><span>通常演習回数</span></div>
      <div><b>${Math.round(avgRate*10)/10}%</b><span>平均正答率</span></div>
      <div><b>${Math.round(bestRate*10)/10}%</b><span>最高正答率</span></div>
      <div><b>${Math.round(latestRate*10)/10}%</b><span>最新正答率</span></div>
      <div><b>${fmtTime(totalTime)}</b><span>累計時間</span></div>
      <div><b>${fmtTime(avgTime)}</b><span>平均時間</span></div>
    </div>
    <p class="small"><b>よく間違える問題：</b>${escapeHtml(missText)}</p>
    ${hist.length!==attempts?`<p class="small">※統計は通常演習を優先して集計しています。間違い復習を含む総履歴は ${hist.length} 件です。</p>`:''}
  </div>`;
}
async function cleanupDuplicateHistoryDb(part){
  if(!hasCloudLogin()){
    alert('DBの重複削除には、サイトログインまたはゲストログインが必要です。未ログインの場合は端末内の履歴だけが使われます。');
    return;
  }
  const title=`${getExamRecord(currentExamId)?.title||''} ${partName(part)}`;
  if(!confirm(`${title} のDB上の重複履歴を削除しますか？\n\n同じ履歴が複数保存されている場合、1件だけ残してCloudflare KV側から整理します。`)) return;
  $('wrongList').innerHTML=`<h3>${escapeHtml(title)} 履歴</h3><p class="small">DB上の重複履歴を整理中…</p>`;
  const res=await apiProgress('POST',{type:'historyDedupe',examId:currentExamId,part});
  if(!res||!res.ok){
    alert('DBの重複削除に失敗しました。ログイン状態、KV設定、通信状態を確認してください。');
    await showHistory(part);
    return;
  }
  const cloudHist=await loadCloudHistory(currentExamId,part);
  const localHist=loadLocal(historyKey(currentExamId,part),[]);
  const merged=mergeHistory(localHist,cloudHist).slice(0,300);
  saveMergedHistoryLocal(currentExamId,part,merged);
  alert(`DB重複削除が完了しました。\n整理前：${res.before ?? '?'}件\n整理後：${res.after ?? '?'}件\n削除：${res.deleted ?? 0}件`);
  await showHistory(part);
}
async function showHistory(part){
  hideAll();$('finishCard').classList.remove('hidden');
  $('wrongList').innerHTML=`<h3>${getExamRecord(currentExamId)?.title||''} ${partName(part)} 履歴</h3><p class="small">履歴を読み込み中…</p>`;
  await getPart(currentExamId,part);
  let hist=loadLocal(historyKey(currentExamId,part),[]);
  if(hasCloudLogin()){const cloudHist=await loadCloudHistory(currentExamId,part);hist=mergeHistory(hist,cloudHist);}
  hist=mergeHistory(hist);
  saveMergedHistoryLocal(currentExamId,part,hist);
  const pack=partsCache[`${currentExamId}_${part}`];
  const stats=historyStatsHtml(hist, pack);
  const rows=hist.map((h,idx)=>{
    const total=h.order?.length||h.answers?.length||0, rate=total?Math.round((h.correct||0)/total*1000)/10:0;
    const wrong=(h.answers||[]).map((a,i)=>({a,q:pack?.questions?.[h.order?.[i]]})).filter(x=>x.a&&!x.a.correct&&x.q);
    const wrongHtml=wrong.length?wrong.map(({a,q})=>`<div class="wrong-item"><b>第${q.number}問 / 範囲：${escapeHtml(q.range||'未設定')}</b><br>あなた：${a.choice} / 正答：${correctLabel(q)}<br><span class="small">${escapeHtml(q.tip||'')}</span></div>`).join(''):'<p class="small">全問正解、または間違いデータなし。</p>';
    return `<div class="history-row"><b>${idx+1}. ${new Date(h.completedAt||h.startedAt||Date.now()).toLocaleString()}</b><br>${h.mode==='wrong'?'間違い復習 / ':''}${h.correct||0}/${total} 正解（${rate}%） / 所要時間 ${fmtTime(h.elapsedMs||0)}<br><span class="small">履歴ID：${escapeHtml(h.attemptId||'legacy')}</span><details><summary>この回の間違いを見る</summary>${wrongHtml}</details></div>`;
  }).join('');
  $('wrongList').innerHTML=`<h3>${getExamRecord(currentExamId)?.title||''} ${partName(part)} 履歴：${hist.length}件</h3>${stats}<div class="row" style="margin:10px 0 14px"><button class="warn" onclick="cleanupDuplicateHistoryDb('${part}')">DBの重複履歴を削除</button><span class="small">表示上の重複除去だけでなく、Cloudflare KV内の重複データも1件に整理します。</span></div>`+(hist.length?rows:'<p class="small">履歴はまだありません。</p>');
}
function downloadText(filename,text,type='application/json'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url)}
function exportCurrentJSON(){downloadText(`progress_${state.examId}_${state.part}.json`,JSON.stringify(snapshotState(),null,2))}
function exportAllProgress(){const data={exportedAt:new Date().toISOString(),localStorage:{}};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('me2_'))data.localStorage[k]=localStorage.getItem(k)}downloadText('me2_all_progress_backup.json',JSON.stringify(data,null,2))}
function exportCurrentCSV(){const rows=[['回','部門','問題','範囲','あなたの回答','正答','正誤','経過時間']];const pack=currentPack();state.answers.forEach((a,i)=>{const q=pack.questions[state.order[i]];rows.push([getExamRecord(state.examId).title,partName(state.part),q.number,q.range||'',a.choice,a.correctAnswer.join('/'),a.correct?'正解':'不正解',fmtTime(a.time)])});const csv=rows.map(r=>r.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n');downloadText(`result_${state.examId}_${state.part}.csv`,csv,'text/csv;charset=utf-8')}
function importProgress(input){const f=input.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const obj=JSON.parse(reader.result);if(obj.localStorage){Object.entries(obj.localStorage).forEach(([k,v])=>localStorage.setItem(k,v));alert('進行データを読み込みました。')}else if(obj.examId&&obj.part){saveLocal(stateKey(obj.examId,obj.part),obj);alert('進行データを読み込みました。')}}catch(e){alert('JSONを読み込めませんでした。')}};reader.readAsText(f)}
async function init(){
  $('loadMode').innerHTML='<span class="status-warn">読み込み中…</span>';
  try { await loadMe(); } catch(e) { me={authenticated:false,email:null,name:null,local:true}; $('userBadge').textContent='未ログイン/ローカル'; }
  try { await loadIndex(); } catch(e) { $('loadMode').innerHTML=`<span class="status-warn">読み込み失敗：${escapeHtml(friendlyFetchError(e))}</span>`; examsIndex={exams:[]}; }
  showMenu();
  // 進行状況のクラウド確認は画面表示後に実行。ここで止まってもメニュー表示を妨げない。
  apiProgress('GET').catch(()=>null);
}
init();
