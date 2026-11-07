"use strict";

// 初期設定：起床7時・非堕落目標10時間。
const DEFAULT_WAKE_MINUTES = 7 * 60;
const DEFAULT_GOAL_MINUTES = 10 * 60;
const KEY = "daraku_app_bank_v1";
const OLD_KEY = "daraku_timer_v3";
const DEFAULT_ACTIVITIES = [
  {id:"堕落",name:"堕落",icon:"☕",color:"#9f3030",archived:false},
  {id:"勉強",name:"勉強",icon:"📖",color:"#2563eb",archived:false},
  {id:"筋トレ",name:"筋トレ",icon:"🏋️",color:"#15803d",archived:false},
  {id:"仕事",name:"仕事",icon:"💼",color:"#7e22ce",archived:false}
];
const activityIds=()=>data.activities.map(a=>a.id);
const activityById=id=>data.activities.find(a=>a.id===id);
const visibleActivities=()=>data.activities.filter(a=>!a.archived);
const safeColor=value=>/^#[0-9a-fA-F]{6}$/.test(value)?value:"#0f766e";
const HOUR = 3600000;
const $ = id => document.getElementById(id);

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function dateFromKey(key) { const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d); }
function nextDay(key) { const d=dateFromKey(key); d.setDate(d.getDate()+1); return dayKey(d); }
function wakeMs(key) { const d=dateFromKey(key); const day=data?.days?.find(x=>x.key===key); const minutes=day?.wakeMinutes ?? data?.settings?.wakeMinutes ?? DEFAULT_WAKE_MINUTES; d.setHours(0,minutes,0,0); return d.getTime(); }
function midnightMs(key) { return dateFromKey(nextDay(key)).getTime(); }
function basicBudget(key) { return Math.max(0, midnightMs(key)-wakeMs(key)-(data?.days?.find(x=>x.key===key)?.goalMinutes ?? data?.settings?.goalMinutes ?? DEFAULT_GOAL_MINUTES)*60000); }
function emptyTotals() { return Object.fromEntries(DEFAULT_ACTIVITIES.map(a=>[a.id,0])); }
function newDay(key,openingBank) {
  return {key,openingBank,activity:"堕落",activityStart:dateFromKey(key).getTime() + (data?.settings?.wakeMinutes ?? DEFAULT_WAKE_MINUTES)*60000,wakeMinutes:data?.settings?.wakeMinutes ?? DEFAULT_WAKE_MINUTES,goalMinutes:data?.settings?.goalMinutes ?? DEFAULT_GOAL_MINUTES,totals:Object.fromEntries((data?.activities??DEFAULT_ACTIVITIES).map(a=>[a.id,0])),manualWithdrawn:0,transactions:[],closed:false};
}
function format(ms) {
  const sign=ms<0?"−":""; const s=Math.floor(Math.abs(ms)/1000);
  return sign+[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,"0")).join(":");
}
function readSaved() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function validDay(d) {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d.key) && typeof d.activity==="string" && Number.isFinite(d.activityStart) && Number.isFinite(d.openingBank) && Number.isFinite(d.manualWithdrawn) && d.totals && Object.values(d.totals).every(v=>Number.isFinite(v)) && Array.isArray(d.transactions);
}
function initialData() {
  const key=dayKey(new Date()); const today={key,openingBank:0,activity:"堕落",activityStart:dateFromKey(key).getTime()+DEFAULT_WAKE_MINUTES*60000,wakeMinutes:DEFAULT_WAKE_MINUTES,goalMinutes:DEFAULT_GOAL_MINUTES,totals:emptyTotals(),manualWithdrawn:0,transactions:[],closed:false};
  // 既存v3の「今日の活動タイマー」だけ引き継ぐ。銀行残高は新規0から。
  try {
    const old=JSON.parse(localStorage.getItem(OLD_KEY));
    if(old && old.day===key && DEFAULT_ACTIVITIES.some(a=>a.id===old.activity) && Number.isFinite(old.activityStart) && old.totals && DEFAULT_ACTIVITIES.every(a=>Number.isFinite(old.totals[a.id]))) {
      today.activity=old.activity;
      today.activityStart=Math.max(today.activityStart,old.activityStart);
      today.totals={...old.totals};
    }
  } catch { /* no previous data */ }
  return {settings:{wakeMinutes:DEFAULT_WAKE_MINUTES,goalMinutes:DEFAULT_GOAL_MINUTES},activities:structuredClone(DEFAULT_ACTIVITIES),days:[today]};
}
let data=readSaved();
if(!data || !Array.isArray(data.days) || !data.days.length || !data.days.every(validDay)) data=initialData();
// 既存データを壊さず、カスタム活動の設定を追加する。
if (!Array.isArray(data.activities)) data.activities=structuredClone(DEFAULT_ACTIVITIES);
for (const d of data.days) {
  for (const a of data.activities) if (!Number.isFinite(d.totals[a.id])) d.totals[a.id]=0;
}
// 旧データから設定値を補完する。過去の精算値は変更しない。
if (!data.settings) data.settings={wakeMinutes:DEFAULT_WAKE_MINUTES,goalMinutes:DEFAULT_GOAL_MINUTES};
for (const d of data.days) {
  if (!Number.isInteger(d.wakeMinutes)) d.wakeMinutes=DEFAULT_WAKE_MINUTES;
  if (!Number.isInteger(d.goalMinutes)) d.goalMinutes=DEFAULT_GOAL_MINUTES;
}
function save(){ localStorage.setItem(KEY,JSON.stringify(data)); }
function activeDay(){ return data.days[data.days.length-1]; }
function totalsAt(day,atMs){
  const t={...day.totals};
  if(!day.closed && atMs>=wakeMs(day.key)) {
    const from=Math.max(day.activityStart,wakeMs(day.key));
    const until=Math.min(atMs,midnightMs(day.key));
    t[day.activity]+=Math.max(0,until-from);
  }
  return t;
}
function settle(day) {
  if(day.closed) return;
  const totals=totalsAt(day,midnightMs(day.key));
  day.totals=totals;
  day.activityStart=midnightMs(day.key);
  const daraku=totals["堕落"];
  const basic=basicBudget(day.key);
  const unusedBasic=Math.max(0,basic-daraku);
  const manualUsed=Math.min(day.manualWithdrawn,Math.max(0,daraku-basic));
  const refund=day.manualWithdrawn-manualUsed;
  const automatic=Math.max(0,daraku-basic-day.manualWithdrawn);
  const finalBalance=day.openingBank+basic-daraku;
  // 明細は「予約済み引き出し→未使用分返金」を含む。最終残高は一度だけ差額で確定。
  if(unusedBasic>0) day.transactions.push({label:"基本予算の貯蓄",amount:unusedBasic,at:midnightMs(day.key)});
  if(refund>0) day.transactions.push({label:"未使用引き出し分の返金",amount:refund,at:midnightMs(day.key)});
  if(automatic>0) day.transactions.push({label:"自動補填・予算超過",amount:-automatic,at:midnightMs(day.key)});
  day.closingBank=finalBalance;
  day.closed=true;
}
function synchronize(now=new Date()) {
  const key=dayKey(now);
  let day=activeDay();
  if(key<day.key) return; // 端末の日付を過去へ変更した場合はデータを壊さない
  let changed=false;
  while(day.key<key) {
    settle(day);
    const following=newDay(nextDay(day.key),day.closingBank);
    data.days.push(following);
    day=following;
    changed=true;
  }
  if(changed) save();
}
function metrics(day,nowMs) {
  const totals=totalsAt(day,nowMs);
  const basic=basicBudget(day.key);
  const daraku=totals["堕落"];
  const manual=day.manualWithdrawn;
  const autoUsed=Math.max(0,daraku-basic-manual);
  const bankNow=day.openingBank-manual-autoUsed;
  const firstRemaining=basic+manual-daraku;
  // 基本・手動分を使い切った後は銀行の残量を表示。
  const remaining=firstRemaining>=0?firstRemaining:bankNow;
  const productive=Object.entries(totals).filter(([a])=>a!=="堕落").reduce((sum,[,v])=>sum+v,0);
  return {totals,basic,daraku,productive,bankNow,remaining,autoUsed};
}
function render() {
  synchronize();
  const day=activeDay(),now=Date.now(),sleeping=now<wakeMs(day.key);
  const m=metrics(day,now);
  $("remaining").textContent=sleeping?"--:--:--":format(m.remaining);
  $("remaining").style.color=m.remaining<0?"#f87171":"#34d399";
  $("status").textContent=sleeping?"睡眠モード・起床予定時刻まで待機":day.activity==="堕落"?"☕ 堕落中・カウントダウン中":`${activityById(day.activity)?.name??"活動"}中・カウントダウン停止`;
  $("productive").textContent=format(sleeping?0:m.productive);
  $("bank").textContent=format(m.bankNow);
  $("bank-large").textContent=format(m.bankNow);
  $("bank").classList.toggle("negative",m.bankNow<0);
  $("bank-large").classList.toggle("negative",m.bankNow<0);
  $("bank-warning").textContent=m.bankNow<0?"未返済時間があります":"";
  $("saving-estimate").textContent=format(m.basic-m.daraku);
  $("saving-estimate").classList.toggle("negative",m.basic-m.daraku<0);
  $("withdrawn-today").textContent=format(day.manualWithdrawn);
  renderActivityButtons(m.totals,sleeping,day.activity);
  const canWithdraw=!sleeping && m.bankNow>0;
  document.querySelectorAll("[data-minutes]").forEach(b=>b.disabled=!canWithdraw);
  $("withdraw-form").querySelector("button").disabled=!canWithdraw;
  renderTransactions();
  if ($("graphs-page").classList.contains("active")) renderGraphs();
}
function switchActivity(next) {
  synchronize();
  const day=activeDay(),now=Date.now();
  if(now<wakeMs(day.key)){alert("起床予定時刻より前は活動を開始できません");return;}
  if(!visibleActivities().some(a=>a.id===next)||day.activity===next)return;
  day.totals=totalsAt(day,now);
  day.activity=next;
  day.activityStart=now;
  save();render();
}
function withdraw(minutes) {
  synchronize();
  const day=activeDay(),now=Date.now();
  if(now<wakeMs(day.key)){alert("起床予定時刻前は引き出せません");return;}
  const amount=minutes*60000;
  if(!Number.isSafeInteger(amount)||amount<=0){$("withdraw-message").textContent="正しい時間を入力してください";return;}
  const available=metrics(day,now).bankNow;
  if(available<=0){$("withdraw-message").textContent="銀行残高がないため引き出せません";return;}
  if(amount>available){$("withdraw-message").textContent="銀行残高が不足しています";return;}
  if(!confirm(`${format(amount)} を銀行から引き出しますか？\n当日中の取り消しはできません。`))return;
  day.manualWithdrawn+=amount;
  day.transactions.push({label:"手動引き出し",amount:-amount,at:now});
  save();$("withdraw-message").textContent=`${format(amount)} を引き出しました`;render();
}
function renderTransactions() {
  const entries=data.days.flatMap(d=>d.transactions.map(t=>({...t,key:d.key}))).sort((a,b)=>b.at-a.at).slice(0,12);
  const root=$("transactions");root.replaceChildren();
  if(!entries.length){root.textContent="取引はまだありません";return;}
  entries.forEach(t=>{
    const row=document.createElement("div");row.className="transaction";
    const left=document.createElement("div");left.textContent=t.label;
    const small=document.createElement("small");small.textContent=new Date(t.at).toLocaleString("ja-JP");left.appendChild(small);
    const right=document.createElement("b");right.className=t.amount>=0?"positive":"negative";right.textContent=(t.amount>=0?"+":"")+format(t.amount);
    row.append(left,right);root.appendChild(row);
  });
}
function renderHistory() {
  const root=$("history-list");if(!root)return;root.replaceChildren();
  const closed=data.days.filter(d=>d.closed).slice(-30).reverse();
  if(!closed.length){root.textContent="精算済みの履歴はまだありません。翌日の起床時刻前でも、日付が変わると精算されます。";root.className="hint";return;}
  closed.forEach(d=>{
    const card=document.createElement("div");card.className="card history-card";
    const heading=document.createElement("h3");heading.textContent=d.key;card.appendChild(heading);
    const activityRows=Object.entries(d.totals).filter(([,v])=>v>0).map(([id,v])=>[activityById(id)?.name??id,v]);
    const rows=[["基本堕落予算",basicBudget(d.key)],...activityRows,["銀行の前日比",d.closingBank-d.openingBank],["精算後の銀行残高",d.closingBank]];
    rows.forEach(([label,value])=>{const row=document.createElement("div"),l=document.createElement("span"),v=document.createElement("b");l.textContent=label;v.textContent=format(value);if(value<0)v.className="negative";row.append(l,v);card.appendChild(row);});
    root.appendChild(card);
  });
}
function renderActivityButtons(totals,sleeping,activeId) {
  const root=$("activities-list");
  const shown=visibleActivities();
  // 1秒ごとの更新ではボタンを作り直さず、操作中のタップを邪魔しない。
  const signature=shown.map(a=>[a.id,a.name,a.icon,a.color].join("|")).join(";");
  if(root.dataset.signature!==signature) {
    root.replaceChildren();root.dataset.signature=signature;
    shown.forEach(a=>{
      const b=document.createElement("button");b.type="button";b.className="activity";b.dataset.activity=a.id;b.style.backgroundColor=safeColor(a.color);
      const icon=document.createElement("span");icon.className="activity-icon";icon.textContent=a.icon;
      const name=document.createElement("span");name.className="activity-name";name.textContent=a.name+"開始";
      const time=document.createElement("small");time.className="activity-time";
      b.append(icon,name,time);b.addEventListener("click",()=>switchActivity(a.id));root.appendChild(b);
    });
  }
  root.querySelectorAll(".activity").forEach(b=>{
    b.classList.toggle("selected",!sleeping&&b.dataset.activity===activeId);
    b.querySelector(".activity-time").textContent=format(sleeping?0:(totals[b.dataset.activity]??0));
  });
}
function renderActivityEditor() {
  const root=$("activity-editor");root.replaceChildren();
  data.activities.filter(a=>a.id!=="堕落"&&!a.archived).forEach(a=>{
    const form=document.createElement("form");form.className="card editor-form";
    const title=document.createElement("h3");title.textContent=`${a.icon} ${a.name}`;
    const nameLabel=document.createElement("label");nameLabel.textContent="活動名 ";
    const name=document.createElement("input");name.required=true;name.maxLength=12;name.value=a.name;nameLabel.appendChild(name);
    const iconLabel=document.createElement("label");iconLabel.textContent="アイコン ";
    const icon=document.createElement("input");icon.required=true;icon.maxLength=8;icon.value=a.icon;iconLabel.appendChild(icon);
    const colorLabel=document.createElement("label");colorLabel.textContent="色 ";
    const color=document.createElement("input");color.type="color";color.value=safeColor(a.color);colorLabel.appendChild(color);
    const actions=document.createElement("div");actions.className="editor-actions";
    const saveBtn=document.createElement("button");saveBtn.type="submit";saveBtn.textContent="変更を保存";
    const deleteBtn=document.createElement("button");deleteBtn.type="button";deleteBtn.className="delete-activity";deleteBtn.textContent="削除";
    actions.append(saveBtn,deleteBtn);form.append(title,nameLabel,iconLabel,colorLabel,actions);
    form.addEventListener("submit",e=>{
      e.preventDefault();const n=name.value.trim(),i=icon.value.trim();
      if(!n||!i){$("activity-message").textContent="名前とアイコンを入力してください";return;}
      if(data.activities.some(x=>x.id!==a.id&&!x.archived&&x.name===n)){$("activity-message").textContent="同じ名前の活動があります";return;}
      a.name=n;a.icon=i;a.color=color.value;save();renderActivityEditor();render();$("activity-message").textContent="活動の変更を保存しました";
    });
    deleteBtn.addEventListener("click",()=>{
      if(!confirm(`「${a.name}」を削除しますか？ 過去の活動時間は残ります。`))return;
      synchronize();const day=activeDay();
      if(day.activity===a.id){const now=Date.now();day.totals=totalsAt(day,now);day.activity="堕落";day.activityStart=now;}
      a.archived=true;save();renderActivityEditor();render();$("activity-message").textContent="活動を削除しました。過去の記録は保存されています";
    });
    root.appendChild(form);
  });
}
$("add-activity-form").addEventListener("submit",e=>{
  e.preventDefault();
  const name=$("new-activity-name").value.trim(),icon=$("new-activity-icon").value.trim(),color=$("new-activity-color").value;
  if(!name||!icon)return;
  if(visibleActivities().length>=12){$("activity-message").textContent="活動は堕落を含めて最大12個です";return;}
  if(visibleActivities().some(a=>a.name===name)){$("activity-message").textContent="同じ名前の活動があります";return;}
  const id=`custom_${Date.now()}_${Math.floor(Math.random()*100000)}`;
  data.activities.push({id,name,icon,color:safeColor(color),archived:false});
  for(const d of data.days)d.totals[id]=0;
  save();$("new-activity-name").value="";renderActivityEditor();render();$("activity-message").textContent=`「${name}」を追加しました`;
});
document.querySelectorAll("[data-minutes]").forEach(b=>b.addEventListener("click",()=>withdraw(Number(b.dataset.minutes))));
$("withdraw-form").addEventListener("submit",event=>{event.preventDefault();const h=Number($("withdraw-hours").value),m=Number($("withdraw-minutes").value);if(!Number.isInteger(h)||h<0||h>999||!Number.isInteger(m)||m<0||m>59){$("withdraw-message").textContent="時間と分を正しく入力してください";return;}withdraw(h*60+m);});
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{
  if (b.dataset.page === "history") { showGraphs("activity", "history"); }
  else { showPage(b.dataset.page); }
}));
function showPage(name) {
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===(name === "graphs" ? (graphReturnPage === "history" ? "history" : "bank") : name)));
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`${name}-page`));
  if (name==="settings") {
    const wake=data.settings.wakeMinutes;
    $("wake-time").value=`${String(Math.floor(wake/60)).padStart(2,"0")}:${String(wake%60).padStart(2,"0")}`;
    $("goal-hours").value=Math.floor(data.settings.goalMinutes/60);
    $("goal-minutes").value=data.settings.goalMinutes%60;
    $("settings-message").textContent="";
    renderActivityEditor();
  }
  render();
}
$("settings").addEventListener("click",()=>showPage("settings"));
$("settings-back").addEventListener("click",()=>showPage("home"));
$("settings-form").addEventListener("submit",event=>{
  event.preventDefault();
  synchronize();
  const time=$("wake-time").value;
  const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  const hours=Number($("goal-hours").value),minutes=Number($("goal-minutes").value);
  if (!match || !Number.isInteger(hours) || hours<0 || hours>23 || !Number.isInteger(minutes) || minutes<0 || minutes>59) {
    $("settings-message").textContent="時刻と目標時間を正しく入力してください";return;
  }
  const wake=Number(match[1])*60+Number(match[2]);
  const goal=hours*60+minutes;
  if (goal>1440-wake) {
    $("settings-message").textContent="非堕落目標は起床から0:00までの時間以内にしてください";return;
  }
  const day=activeDay();
  const now=Date.now();
  const oldWake=wakeMs(day.key);
  const newWake=dateFromKey(day.key).getTime()+wake*60000;
  // 当日既に活動が始まっている場合、開始時刻の修正は活動ログなしでは安全に再計算できない。
  // そのため翌日から適用し、今日の計測と銀行精算を保護する。
  const started=now>=oldWake || Object.values(day.totals).some(v=>v>0) || day.manualWithdrawn>0;
  data.settings={wakeMinutes:wake,goalMinutes:goal};
  if (!started && !day.closed) {
    day.wakeMinutes=wake;
    day.goalMinutes=goal;
    day.activityStart=newWake;
  }
  save();render();
  $("settings-message").textContent=started
    ?"保存しました。今日の記録を守るため、変更は明日から適用されます。"
    :"保存しました。今日から適用されます。";
});
render();setInterval(render,1000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)render();});


// ---- 履歴と銀行のグラフ（外部ライブラリ不要） ----
let chartKind="activity";
let chartPeriod="day";
let graphReturnPage="history";
const NS="http://www.w3.org/2000/svg";
const chartHours=ms=>(ms/3600000).toFixed(1);
function graphText(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=text;return el;}
function showGraphs(kind,origin){
  chartKind=kind;graphReturnPage=origin;
  showPage("graphs");renderGraphs();
}
$("bank-graph-button").addEventListener("click",()=>showGraphs("bank","bank"));
$("graphs-back").addEventListener("click",()=>{
  if (graphReturnPage === "history") showPage("home");
  else showPage(graphReturnPage);
});
document.querySelectorAll("[data-chart]").forEach(button=>button.addEventListener("click",()=>{chartKind=button.dataset.chart;renderGraphs();}));
document.querySelectorAll("[data-period]").forEach(button=>button.addEventListener("click",()=>{chartPeriod=button.dataset.period;renderGraphs();}));
function renderGraphs(){
  document.querySelectorAll("[data-chart]").forEach(b=>b.classList.toggle("active",b.dataset.chart===chartKind));
  document.querySelectorAll("[data-period]").forEach(b=>b.classList.toggle("active",b.dataset.period===chartPeriod));
  $("activity-chart-panel").hidden=chartKind!=="activity";
  $("bank-chart-panel").hidden=chartKind!=="bank";
  if(chartKind==="activity")renderActivityChart();else renderBankChart();
}
function groupKey(key,period){
  if(period==="day")return key;
  if(period==="month")return key.slice(0,7);
  const d=dateFromKey(key),weekday=(d.getDay()+6)%7;
  d.setDate(d.getDate()-weekday);
  return dayKey(d);
}
function chartDays(){
  const now=Date.now();
  return data.days.filter(d=>wakeMs(d.key)<=now).map(d=>({
    key:d.key,totals:d.closed?d.totals:totalsAt(d,now),
    balance:d.closed?d.closingBank:metrics(d,now).bankNow
  }));
}
function renderActivityChart(){
  const root=$("activity-chart"),legend=$("activity-legend"),summary=$("activity-chart-summary");
  root.replaceChildren();legend.replaceChildren();summary.replaceChildren();
  const days=chartDays();
  if(!days.length){root.appendChild(graphText("p","chart-empty","活動記録はまだありません"));return;}
  const groups=new Map();
  days.forEach(d=>{
    const key=groupKey(d.key,chartPeriod);
    if(!groups.has(key))groups.set(key,{key,totals:{}});
    const t=groups.get(key).totals;
    Object.entries(d.totals).forEach(([id,v])=>{t[id]=(t[id]||0)+v;});
  });
  const items=Array.from(groups.values()).slice(chartPeriod==="day"?-7:chartPeriod==="week"?-8:-6);
  const max=Math.max(1,...items.map(x=>Object.values(x.totals).reduce((a,b)=>a+b,0)));
  const colors=new Map(data.activities.map(a=>[a.id,safeColor(a.color)]));
  const names=new Map(data.activities.map(a=>[a.id,a.name]));
  const ids=["堕落",...Array.from(new Set(items.flatMap(x=>Object.keys(x.totals)))).filter(id=>id!=="堕落")];
  items.forEach(item=>{
    const col=graphText("div","chart-column","");
    const total=Object.values(item.totals).reduce((a,b)=>a+b,0);
    col.appendChild(graphText("span","bar-value",chartHours(total)+"h"));
    const track=graphText("div","bar-track","");
    ids.forEach(id=>{
      const amount=item.totals[id]||0;
      if(amount<=0)return;
      const part=graphText("div","bar-part","");
      part.style.height=`${amount/max*175}px`;
      part.style.backgroundColor=colors.get(id)||"#64748b";
      part.title=`${names.get(id)||id}: ${format(amount)}`;
      track.appendChild(part);
    });
    col.appendChild(track);
    const label=chartPeriod==="day"?item.key.slice(5).replace("-","/"):chartPeriod==="week"?item.key.slice(5).replace("-","/")+"〜":item.key.slice(2).replace("-","/");
    col.appendChild(graphText("span","bar-label",label));root.appendChild(col);
  });
  ids.forEach(id=>{
    if(!items.some(item=>(item.totals[id]||0)>0))return;
    const tag=graphText("span","",names.get(id)||id),dot=document.createElement("i");
    dot.style.backgroundColor=colors.get(id)||"#64748b";tag.prepend(dot);legend.appendChild(tag);
  });
  const all=items.reduce((acc,item)=>{
    Object.entries(item.totals).forEach(([id,v])=>acc[id]=(acc[id]||0)+v);return acc;
  },{});
  const daraku=all["堕落"]||0,productive=Object.entries(all).filter(([id])=>id!=="堕落").reduce((s,[,v])=>s+v,0);
  const total=daraku+productive;
  [["表示期間の堕落時間",format(daraku)],["表示期間の非堕落時間",format(productive)],["非堕落の割合",total?`${(productive/total*100).toFixed(1)}%`:"—"]].forEach(([k,v])=>{
    const row=document.createElement("div");row.append(graphText("span","",k),graphText("b","",v));summary.appendChild(row);
  });
}
function svgNode(tag,attributes={}){
  const el=document.createElementNS(NS,tag);
  Object.entries(attributes).forEach(([k,v])=>el.setAttribute(k,String(v)));
  return el;
}
function renderBankChart(){
  const root=$("bank-chart"),summary=$("bank-chart-summary");
  root.replaceChildren();summary.replaceChildren();
  const days=chartDays().slice(-30);
  if(!days.length){root.appendChild(graphText("p","chart-empty","銀行の記録はまだありません"));return;}
  const values=days.map(d=>d.balance/3600000);
  let lo=Math.min(0,...values),hi=Math.max(0,...values);
  if(hi-lo<1){lo-=.5;hi+=.5;}
  const width=340,height=215,left=39,right=10,top=15,bottom=36;
  const x=i=>left+(days.length===1?(width-left-right)/2:i/(days.length-1)*(width-left-right));
  const y=v=>top+(hi-v)/(hi-lo)*(height-top-bottom);
  const svg=svgNode("svg",{viewBox:`0 0 ${width} ${height}`,role:"img","aria-label":"直近30日の銀行残高の折れ線グラフ"});
  for(let i=0;i<=4;i++){
    const value=lo+(hi-lo)*i/4,yy=y(value);
    svg.appendChild(svgNode("line",{x1:left,y1:yy,x2:width-right,y2:yy,class:Math.abs(value)<.00001?"chart-zero":"chart-gridline"}));
    const tick=svgNode("text",{x:left-5,y:yy+3,"text-anchor":"end",class:"chart-axis"});tick.textContent=value.toFixed(1);svg.appendChild(tick);
  }
  if(lo<0&&hi>0)svg.appendChild(svgNode("line",{x1:left,y1:y(0),x2:width-right,y2:y(0),class:"chart-zero"}));
  const path=values.map((v,i)=>`${i===0?"M":"L"}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  svg.appendChild(svgNode("path",{d:path,class:"chart-line"}));
  values.forEach((v,i)=>{
    const circle=svgNode("circle",{cx:x(i),cy:y(v),r:days.length<=10?3.2:2.2,class:"chart-point"});
    const title=svgNode("title");title.textContent=`${days[i].key}: ${format(days[i].balance)}`;circle.appendChild(title);svg.appendChild(circle);
  });
  const labelIndices=[0,Math.floor((days.length-1)/2),days.length-1];
  [...new Set(labelIndices)].forEach(i=>{
    const tick=svgNode("text",{x:x(i),y:height-12,"text-anchor":i===0?"start":i===days.length-1?"end":"middle",class:"chart-axis"});
    tick.textContent=days[i].key.slice(5).replace("-","/");svg.appendChild(tick);
  });
  root.appendChild(svg);
  const last=days.at(-1).balance,first=days[0].balance;
  [["最新の銀行残高",format(last)],["表示期間の増減",format(last-first)],["記録日数",`${days.length}日`]].forEach(([k,v],i)=>{
    const row=document.createElement("div"),value=graphText("b",i<2&&v.startsWith("−")?"negative":"",v);
    row.append(graphText("span","",k),value);summary.appendChild(row);
  });
}


// ---- バックアップ・復元 ----
const BACKUP_FORMAT = "daraku-countdown-backup";
const BACKUP_VERSION = 1;
const backupMessage = message => { $("backup-message").textContent = message; };

$("export-backup").addEventListener("click", () => {
  try {
    synchronize();
    save();
    const backup = {format:BACKUP_FORMAT,version:BACKUP_VERSION,exportedAt:new Date().toISOString(),data};
    const blob = new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daraku-backup-${dayKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    backupMessage("バックアップの保存を開始しました。iPhoneでは『ファイル』アプリなどに保存してください。");
  } catch (error) {
    backupMessage("バックアップの作成に失敗しました。端末の空き容量などを確認してください。");
  }
});

// 不正なJSONや別アプリのファイルで既存データを消さないための検証。
function validateBackup(backup) {
  if (!backup || backup.format!==BACKUP_FORMAT || backup.version!==BACKUP_VERSION) throw Error("このアプリの対応バックアップではありません。");
  const restored=backup.data;
  if (!restored || typeof restored!=="object" || !Array.isArray(restored.days) || restored.days.length===0 || restored.days.length>20000) throw Error("日別データが正しくありません。");
  const settings=restored.settings;
  if (!settings || !Number.isInteger(settings.wakeMinutes) || settings.wakeMinutes<0 || settings.wakeMinutes>=1440 || !Number.isInteger(settings.goalMinutes) || settings.goalMinutes<0 || settings.goalMinutes>1440-settings.wakeMinutes) throw Error("設定データが正しくありません。");
  if (!Array.isArray(restored.activities) || restored.activities.length<1 || restored.activities.length>200 || !restored.activities.some(a=>a.id==="堕落")) throw Error("活動データが正しくありません。");
  const ids=new Set();
  for (const a of restored.activities) {
    if (!a || typeof a.id!=="string" || !a.id || a.id.length>100 || ids.has(a.id) || typeof a.name!=="string" || typeof a.icon!=="string" || typeof a.color!=="string" || typeof a.archived!=="boolean") throw Error("活動データが正しくありません。");
    ids.add(a.id);
  }
  let previous="";
  for (const day of restored.days) {
    if (!validDay(day) || day.key<=previous || !Number.isInteger(day.wakeMinutes) || day.wakeMinutes<0 || day.wakeMinutes>=1440 || !Number.isInteger(day.goalMinutes) || day.goalMinutes<0 || day.goalMinutes>1440-day.wakeMinutes || typeof day.closed!=="boolean" || !ids.has(day.activity) || day.activityStart<0 || day.manualWithdrawn<0 || !Object.prototype.hasOwnProperty.call(day.totals,"堕落")) throw Error("日別記録が正しくありません。");
    const date=dateFromKey(day.key);
    if (!Number.isFinite(date.getTime()) || dayKey(date)!==day.key || day.key>dayKey(new Date())) throw Error("日付データが正しくありません。");
    for (const [id,value] of Object.entries(day.totals)) if (!ids.has(id) || !Number.isFinite(value) || value<0) throw Error("活動時間が正しくありません。");
    for (const tx of day.transactions) if (!tx || typeof tx.label!=="string" || !Number.isFinite(tx.amount) || !Number.isFinite(tx.at)) throw Error("銀行取引データが正しくありません。");
    if (day.closed && !Number.isFinite(day.closingBank)) throw Error("銀行残高が正しくありません。");
    previous=day.key;
  }
  if (restored.days.slice(0,-1).some(d=>!d.closed) || restored.days.at(-1).closed) throw Error("日付の状態が正しくありません。");
  return restored;
}

$("restore-backup").addEventListener("click", async () => {
  const file=$("import-backup").files?.[0];
  if (!file) { backupMessage("復元するJSONファイルを選択してください。");return; }
  if (file.size>20*1024*1024) { backupMessage("ファイルが大きすぎます（上限20MB）。");return; }
  let restored;
  try {
    restored=validateBackup(JSON.parse(await file.text()));
  } catch (error) {
    backupMessage(`復元できません：${error.message || "ファイルを確認してください。"}`);
    return;
  }
  const days=restored.days.length;
  if (!confirm(`バックアップ（${days}日分）から復元しますか？\n現在の活動記録・銀行残高・設定は上書きされます。\nまだバックアップしていない場合はキャンセルしてください。`)) return;
  try {
    // 保存に成功した場合だけメモリ上のデータも切り替える。
    localStorage.setItem(KEY,JSON.stringify(restored));
    data=restored;
    synchronize();
    $("import-backup").value="";
    showPage("home");
    alert("復元が完了しました。活動記録・銀行残高・設定を読み込みました。");
  } catch (error) {
    backupMessage("復元に失敗しました。端末の保存容量を確認してください。");
  }
});


// PWA: secure origins (HTTPS / localhost) only. No app data is stored in the service worker.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.warn('オフライン機能の登録に失敗しました:', error);
    });
  });
}
