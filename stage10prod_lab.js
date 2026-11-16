import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import { getFirestore, doc, getDocFromServer, setDoc } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config-prod.js';
const $ = id => document.getElementById(id);
const EXPECTED = 'daraku-app';
const KEY = 'daraku_app_bank_v1';
const app = initializeApp(firebaseConfig, 'daraku-production-initial');
const auth = getAuth(app), db = getFirestore(app);
let user = null, raw = null, payload = null, hash = null, cloudEmpty = false, savedFile = false, created = false;
$('project').textContent = firebaseConfig.projectId;
const log = (msg) => $('log').textContent = msg;
const assertProject = () => { if (firebaseConfig.projectId !== EXPECTED) throw Error('接続先がdaraku-appではありません。中止します。'); };
const bytesToHex = arr => Array.from(arr, x => x.toString(16).padStart(2,'0')).join('');
const sha = async s => bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
const canonical = x => JSON.stringify(x, function(k,v){ if(v && typeof v === "object" && !Array.isArray(v)) return Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])); return v; });
const ref = () => doc(db, 'darakuSyncV1', user.uid);
const stats = d => ({days:d.days.length,activities:d.activities.length,segments:d.days.reduce((n,x)=>n+(x.segments?.length||0),0),sleepSegments:d.days.reduce((n,x)=>n+(x.sleepSegments?.length||0),0),transactions:d.days.reduce((n,x)=>n+(x.transactions?.length||0),0)});
function refresh(){const ok=!!user && firebaseConfig.projectId===EXPECTED; $('read').disabled=!ok; $('check').disabled=!ok||!payload; $('backup').disabled=!ok||!payload; $('create').disabled=!ok||!payload||!cloudEmpty||!savedFile||!$('saved').checked||created; $('verify').disabled=!ok||(!created && !cloudEmpty);}
function reset(){raw=null;payload=null;hash=null;cloudEmpty=false;savedFile=false;created=false;$('saved').checked=false;refresh();}
async function action(fn){try{assertProject();await fn();}catch(e){log('停止：'+(e.code||e.message));}finally{refresh();}}
onAuthStateChanged(auth,u=>{user=u;reset();$('authState').textContent=u?'ログイン済み：'+u.email:'未ログイン';});
$('login').onclick=()=>action(async()=>{await signInWithEmailAndPassword(auth,$('email').value,$('password').value);log('本番Firebaseログイン成功');});
$('register').onclick=()=>action(async()=>{if(!confirm('本番Firebase daraku-app に新規アカウントを作成します。続けますか？'))return;await createUserWithEmailAndPassword(auth,$('email').value,$('password').value);log('本番Firebaseアカウント作成成功');});
$('read').onclick=()=>action(async()=>{reset();raw=localStorage.getItem(KEY);if(!raw)throw Error('この画面には本番データがありません。登録禁止。');const data=JSON.parse(raw);if(!data||!Array.isArray(data.days)||!Array.isArray(data.activities)||!data.settings||data.days.length===0)throw Error('データ構造が不正、または記録0日。登録禁止。');payload={format:'daraku-countdown-backup',version:1,exportedAt:new Date().toISOString(),data};hash=await sha(canonical(payload));log('① 読み取り成功：'+JSON.stringify(stats(data))+'\nバックアップSHA-256：'+hash+'\n端末への書き込み0件');});
$('check').onclick=()=>action(async()=>{if(!payload)throw Error('先に①');const s=await getDocFromServer(ref());cloudEmpty=!s.exists();if(!cloudEmpty)throw Error('② 既存同期文書が存在します。絶対に上書きしません。');log('② 本番 darakuSyncV1/'+user.uid+' は未作成。既存文書への書き込みなし。');});
$('backup').onclick=()=>action(async()=>{if(!payload)throw Error('先に①');const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='daraku-production-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);savedFile=true;log('③ バックアップのダウンロードを開始。ファイルアプリで実保存を確認し、チェックを入れてください。');});
$('saved').onchange=refresh;
$('create').onclick=()=>action(async()=>{if(!payload||!cloudEmpty||!savedFile||!$('saved').checked)throw Error('事前確認が不足');const current=localStorage.getItem(KEY);if(current!==raw)throw Error('①以降にiPhoneデータが変化しました。①からやり直してください。');const s=await getDocFromServer(ref());if(s.exists())throw Error('既存文書があるため中止');if(!confirm('本番 daraku-app にiPhone最新データを初回登録します。既存文書は上書きしません。続けますか？'))return;await setDoc(ref(),{ownerUid:user.uid,format:'daraku-sync-v1',revision:1,backup:payload,createdAt:new Date().toISOString()});created=true;log('④ 本番初回登録成功。SHA-256：'+hash+'\n端末データは未変更。⑤で再取得してください。');});
$('verify').onclick=()=>action(async()=>{if(!payload)throw Error('①が必要');const s=await getDocFromServer(ref());if(!s.exists())throw Error('クラウド文書なし');const d=s.data();const serverHash=await sha(canonical(d.backup));const match=serverHash===hash;log('⑤ '+(match?'合格：SHA-256完全一致':'不一致：要確認')+'\nrevision: '+d.revision+'\nSHA-256: '+serverHash+'\n'+JSON.stringify(stats(d.backup.data))+'\n端末データ変更0件\n自動同期は未有効');});
refresh();
