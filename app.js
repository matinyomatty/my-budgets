import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, onSnapshot, setDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const screens = ['setup','auth','onboard','app'];
const show = id => screens.forEach(x => $('#'+x).hidden = x !== id);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));

/* ================= constants ================= */
const KINDS = {
  cash:   { label:'Cash',            group:'Everyday money' },
  mobile: { label:'Mobile money',    group:'Everyday money' },
  bank:   { label:'Bank',            group:'Everyday money' },
  savings:{ label:'Savings',         group:'Savings & investments' },
  invest: { label:'Investment',      group:'Savings & investments' },
  asset:  { label:'Property / asset',group:'Property & assets' },
  loan:   { label:'Loan / debt',     group:'What you owe' },
};
const GROUP_ORDER = ['Everyday money','Savings & investments','Property & assets','What you owe'];
const ICONS = {
  cash:'<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  mobile:'<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  bank:'<svg viewBox="0 0 24 24"><path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18"/></svg>',
  savings:'<svg viewBox="0 0 24 24"><path d="M5 11a7 6 0 0 1 14 0v2a4 4 0 0 1-2 3.5V20h-3v-2h-4v2H7v-3.5A4 4 0 0 1 5 13z"/><path d="M10 7h4"/></svg>',
  invest:'<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>',
  asset:'<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7M5 10v10h14V10"/></svg>',
  loan:'<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  x:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  left:'<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right:'<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
};
const DEFAULT_CATS = {
  expense:["Food & groceries","Eating out","Rent","Electricity (LUKU)","Water","Transport & fuel","Airtime & internet","School fees","Health","Family support","Home & household","Car maintenance","Personal care","Clothing","Entertainment","Gifts & michango","Business stock","Fees & charges","Other"].map(n=>({name:n,budget:0})),
  income:["Salary","Business","Side income","Rent received","Interest & dividends","Gifts received","Other"]
};
const FEE_CAT = 'Fees & charges';
const ADJ_CAT = 'Balance adjustment';

/* ================= helpers ================= */
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const NOW = new Date();
const TODAY = iso(NOW);
const YESTERDAY = iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()-1));
const THIS_MONTH = TODAY.slice(0,7);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parseAmt = s => { const v = parseFloat(String(s).replace(/[^0-9.\-]/g,'')); return isFinite(v) ? v : NaN; };
const shiftMonth = (k, d) => { const [y,m]=k.split('-').map(Number); const dt=new Date(y,m-1+d,1); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}`; };
const daysIn = k => { const [y,m]=k.split('-').map(Number); return new Date(y,m,0).getDate(); };
const monthEnd = k => k === THIS_MONTH ? TODAY : `${k}-${pad(daysIn(k))}`;
const mLabel = (k, o={month:'long',year:'numeric'}) => { const [y,m]=k.split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString('en-GB',o); };
const mShort = k => mLabel(k,{month:'short'});
const monthsBetween = (a, b) => { const [y1,m1]=a.split('-').map(Number), [y2,m2]=b.split('-').map(Number); return (y2-y1)*12 + (m2-m1); };
const dLabel = d => d===TODAY ? 'Today' : d===YESTERDAY ? 'Yesterday' : (()=>{ const [y,m,dd]=d.split('-').map(Number); return new Date(y,m-1,dd).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short', ...(d.slice(0,4)!==TODAY.slice(0,4)?{year:'numeric'}:{})}); })();
const fullDate = d => { const [y,m,dd]=d.split('-').map(Number); return new Date(y,m-1,dd).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); };
const daysUntil = d => { const [y,m,dd]=d.split('-').map(Number); return Math.round((new Date(y,m-1,dd) - new Date(NOW.getFullYear(),NOW.getMonth(),NOW.getDate()))/864e5); };
const monthsUntil = d => daysUntil(d)/30.44;
const timeLeft = d => { const n=daysUntil(d); if (n<=0) return 'date passed'; if (n<45) return `${n} day${n>1?'s':''} left`; const m=Math.round(n/30.44); if (m<24) return `${m} months left`; const y=Math.floor(m/12), r=m%12; return `${y} year${y>1?'s':''}${r?` ${r} month${r>1?'s':''}`:''} left`; };
const goalDate = g => !g?.by ? '' : g.by.length===7 ? `${g.by}-${pad(daysIn(g.by))}` : g.by;
const isoValid = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d));
const fmtInput = el => { const neg = el.value.trim().startsWith('-'); const raw = el.value.replace(/[^0-9.]/g,''); if (!raw){ el.value = neg?'-':''; return; } const [i,d]=raw.split('.'); el.value = (neg?'-':'') + Number(i||0).toLocaleString('en-US') + (d!==undefined?'.'+d.slice(0,2):''); };
let toastT; const toast = m => { const t=$('#toast'); t.textContent=m; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2600); };

const state = { user:null, cfg:null, ledger:{}, tab:'home', month:THIS_MONTH, q:'', fType:'', fAcct:'', unsubs:[], loaded:false };
const cfg = () => state.cfg;
const cur = () => cfg()?.currency || 'TZS';
const num = n => Math.round(n).toLocaleString('en-US');
const money = n => (n<0?'−':'') + cur() + ' ' + num(Math.abs(n));
const signed = n => (n>0?'+':n<0?'−':'') + num(Math.abs(n));
const short = n => { const a=Math.abs(n), s=n<0?'−':''; return s + (a>=1e9 ? (a/1e9).toFixed(1).replace(/\.0$/,'')+'B' : a>=1e6 ? (a/1e6).toFixed(a>=1e8?0:a>=1e7?1:2).replace(/\.?0+$/,'')+'M' : a>=1e3 ? Math.round(a/1e3)+'k' : String(Math.round(a))); };

const accounts = (all=false) => (cfg()?.accounts||[]).filter(a => all || !a.archived);
const acct = id => (cfg()?.accounts||[]).find(a=>a.id===id);
const acctName = id => acct(id)?.name || 'No account';
const entries = k => state.ledger[k] || [];
const allEntries = () => Object.values(state.ledger).flat();
const expCats = () => cfg().categories?.expense || [];
const incCats = () => cfg().categories?.income || [];

/* ================= money maths ================= */
function balances(asOf){
  const b = {};
  for (const a of accounts(true)) b[a.id] = (!asOf || (a.openingDate||'') <= asOf) ? (+a.opening||0) : 0;
  const add = (id, v, date) => { const a = acct(id); if (!a || date < (a.openingDate||'')) return; b[id] += v; };
  for (const e of allEntries()){
    if (asOf && e.date > asOf) continue;
    const amt = +e.amount||0, fee = +e.fee||0;
    if (e.type==='expense') add(e.accountId, -amt, e.date);
    else if (e.type==='income') add(e.accountId, amt, e.date);
    else if (e.type==='adjust') add(e.accountId, amt, e.date);
    else if (e.type==='transfer'){ add(e.accountId, -(amt+fee), e.date); add(e.toAccountId, amt, e.date); }
  }
  return b;
}
const netWorth = b => accounts(true).reduce((s,a)=>s+(b[a.id]||0),0);
const sumKinds = (b, kinds) => accounts(true).filter(a=>kinds.includes(a.kind)).reduce((s,a)=>s+(b[a.id]||0),0);

function monthStats(k){
  const l = entries(k);
  let income=0, spent=0, fees=0, toSavings=0; const byCat = {};
  for (const e of l){
    const amt=+e.amount||0;
    if (e.type==='income') income += amt;
    else if (e.type==='expense'){ spent += amt; byCat[e.category||'Other'] = (byCat[e.category||'Other']||0) + amt; }
    else if (e.type==='transfer'){
      const f=+e.fee||0; if (f){ fees+=f; byCat[FEE_CAT]=(byCat[FEE_CAT]||0)+f; }
      const from=acct(e.accountId), to=acct(e.toAccountId);
      if (to && ['savings','invest','asset','loan'].includes(to.kind) && from && ['cash','mobile','bank'].includes(from.kind)) toSavings += amt;
    }
  }
  const out = spent + fees, kept = income - out;
  return { income, out, kept, rate: income>0 ? kept/income : null, byCat, toSavings, count:l.length };
}
function billStatus(k){
  const l = entries(k);
  return (cfg().bills||[]).map(b => {
    const paid = l.find(e => e.billId===b.id);
    const due = Math.min(+b.dueDay||1, daysIn(k));
    const late = !paid && k===THIS_MONTH && due < NOW.getDate();
    return { ...b, paid:!!paid, paidAmt: paid?+paid.amount:0, due, late };
  }).sort((a,b)=>(a.paid-b.paid)||(a.due-b.due));
}
function catUsage(type){
  const since = iso(new Date(NOW.getFullYear(), NOW.getMonth()-3, NOW.getDate()));
  const c = {}; allEntries().forEach(e => { if (e.type===type && e.date>=since) c[e.category]=(c[e.category]||0)+1; }); return c;
}
function lastAccount(type){
  const l = allEntries().filter(e=>e.type===type && acct(e.accountId) && !acct(e.accountId).archived).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  return l[0]?.accountId || accounts().find(a=>['mobile','cash','bank'].includes(a.kind))?.id || accounts()[0]?.id || '';
}

/* ================= Firebase ================= */
if (!firebaseConfig?.apiKey || firebaseConfig.apiKey.startsWith('PASTE')){ show('setup'); throw new Error('Missing Firebase config'); }
const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const uDoc = (...p) => doc(db, 'users', state.user.uid, ...p);
const writeErr = e => { console.error(e); toast(e?.code==='permission-denied' ? 'Not allowed to save. Check your Firestore rules.' : 'Saved on this phone. It will sync when you’re online.'); };
const saveCfg = () => setDoc(uDoc('config','v2'), clone(state.cfg)).catch(writeErr);
const saveMonth = k => setDoc(uDoc('ledger',k), { entries: entries(k), updatedAt: new Date().toISOString() }).catch(writeErr);

function startData(){
  let cfgSeen=false, ledSeen=false;
  const ready = () => { if (!cfgSeen || !ledSeen) return; if (!state.cfg || !accounts(true).length) showOnboarding(); else { show('app'); render(); } };
  state.unsubs.push(onSnapshot(uDoc('config','v2'), { includeMetadataChanges:true }, s => {
    if (s.exists()) state.cfg = clone(s.data());
    else if (s.metadata.fromCache && navigator.onLine) return; // wait for the server before showing setup
    cfgSeen = true; ready();
  }, e => { console.error(e); toast('Couldn’t load your data.'); }));
  state.unsubs.push(onSnapshot(collection(db,'users',state.user.uid,'ledger'), { includeMetadataChanges:true }, snap => {
    const m = {}; snap.docs.forEach(d => m[d.id] = clone(d.data().entries || []));
    state.ledger = m; ledSeen = true;
    const off = $('#offTag'); if (off) off.hidden = navigator.onLine;
    ready();
  }, e => { console.error(e); toast('Couldn’t load your transactions.'); }));
}
function stopData(){ state.unsubs.forEach(u=>u()); state.unsubs=[]; state.cfg=null; state.ledger={}; }
addEventListener('online', () => { const o=$('#offTag'); if (o) o.hidden=true; });
addEventListener('offline', () => { const o=$('#offTag'); if (o) o.hidden=false; });

onAuthStateChanged(auth, user => {
  stopData(); state.user = user;
  if (!user) return show('auth');
  startData();
});

/* ================= auth ================= */
function authErr(e){
  const m = { 'auth/invalid-credential':'Email or password is wrong.','auth/wrong-password':'Email or password is wrong.','auth/user-not-found':'No account with that email. Tap “Create account”.',
    'auth/email-already-in-use':'That email already has an account. Sign in instead.','auth/weak-password':'Use at least 6 characters for your password.','auth/invalid-email':'Enter a valid email address.',
    'auth/network-request-failed':'No connection. Check your internet and try again.','auth/too-many-requests':'Too many tries. Wait a few minutes, then try again.' };
  $('#aErr').textContent = m[e?.code] || e?.message || 'Sign-in failed.'; $('#aErr').hidden = false;
}
const creds = () => { $('#aErr').hidden = true; return [$('#aEmail').value.trim(), $('#aPass').value]; };
$('#authForm').addEventListener('submit', e => { e.preventDefault(); const [a,b]=creds(); signInWithEmailAndPassword(auth,a,b).catch(authErr); });
$('#signUpBtn').addEventListener('click', () => { const [a,b]=creds(); createUserWithEmailAndPassword(auth,a,b).catch(authErr); });
$('#resetBtn').addEventListener('click', () => { const em=$('#aEmail').value.trim(); if(!em){ $('#aErr').textContent='Type your email above first.'; $('#aErr').hidden=false; return; } sendPasswordResetEmail(auth,em).then(()=>toast('Reset link sent. Check your email.')).catch(authErr); });

/* ================= onboarding ================= */
const kindOptions = sel => Object.entries(KINDS).map(([k,v])=>`<option value="${k}" ${k===sel?'selected':''}>${v.label}</option>`).join('');
const obRow = (name='', kind='mobile', bal='') => `<div class="ob-row"><div class="full"><input class="inp" placeholder="Account name, e.g. M-Pesa" value="${esc(name)}" aria-label="Account name"><button type="button" class="rm" aria-label="Remove">${ICONS.x}</button></div>
  <select class="inp" aria-label="Type">${kindOptions(kind)}</select><input class="inp" inputmode="decimal" placeholder="Balance now" value="${esc(bal)}" aria-label="Current balance"></div>`;
function showOnboarding(){
  show('onboard');
  if (!$('#obRows').children.length) $('#obRows').innerHTML = obRow('Cash','cash') + obRow('M-Pesa','mobile') + obRow('','bank');
}
$('#obRows').addEventListener('click', e => { if (e.target.closest('.rm')) e.target.closest('.ob-row').remove(); });
$('#obRows').addEventListener('input', e => { if (e.target.inputMode==='decimal') fmtInput(e.target); });
$('#obAdd').addEventListener('click', () => { $('#obRows').insertAdjacentHTML('beforeend', obRow('','savings')); $('#obRows').lastElementChild.querySelector('input').focus(); });
$('#onboardForm').addEventListener('submit', e => {
  e.preventDefault();
  const rows = $$('.ob-row', $('#obRows')).map(r => { const [n,b] = $$('input',r); return { name:n.value.trim(), kind:$('select',r).value, bal:parseAmt(b.value) }; }).filter(r=>r.name);
  if (!rows.length){ $('#obErr').textContent='Add at least one account with a name.'; $('#obErr').hidden=false; return; }
  const accts = rows.map((r,i) => ({ id:uid(), name:r.name, kind:r.kind, opening: r.kind==='loan' ? -Math.abs(r.bal||0) : (r.bal||0), openingDate:TODAY, order:i }));
  state.cfg = { ...(state.cfg||{}), currency: state.cfg?.currency || 'TZS', savingsTarget: state.cfg?.savingsTarget ?? 20, categories: state.cfg?.categories || clone(DEFAULT_CATS), bills: state.cfg?.bills || [], goals: state.cfg?.goals || [], accounts: accts, createdAt: Date.now() };
  saveCfg(); show('app'); render(); toast('You’re set. Record your first transaction with +');
});

/* ================= views ================= */
function render(){
  if (!cfg()) return;
  $$('.tabbar [data-tab]').forEach(b => { if (b.dataset.tab===state.tab) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
  const v = $('#view');
  v.innerHTML = ({home:viewHome, activity:viewActivity, plan:viewPlan, insights:viewInsights})[state.tab]();
  if (state.tab==='activity'){ const s=$('#q'); if (s && document.activeElement?.id!=='q' && state.q) s.value=state.q; }
}
const monthNav = () => `<div class="monthnav"><button class="iconbtn" data-m="-1" aria-label="Previous month">${ICONS.left}</button><b>${esc(mLabel(state.month,{month:'short',year:'numeric'}))}</b><button class="iconbtn" data-m="1" aria-label="Next month" ${state.month>=THIS_MONTH?'disabled style="opacity:.35"':''}>${ICONS.right}</button></div>`;

function acctRows(b){
  const byGroup = {};
  accounts().sort((a,c)=>(a.order??0)-(c.order??0)).forEach(a => (byGroup[KINDS[a.kind]?.group||'Other'] ||= []).push(a));
  return GROUP_ORDER.filter(g=>byGroup[g]).map(g => `<div class="grp">${g}</div>` + byGroup[g].map(a => {
    const v = b[a.id]||0, isLoan = a.kind==='loan';
    return `<button class="acct" data-acct="${a.id}"><span class="ic">${ICONS[a.kind]||ICONS.cash}</span><span class="nm"><b>${esc(a.name)}</b><small>${KINDS[a.kind]?.label||''}</small></span><span class="bal ${v<0&&!isLoan?'neg':''}">${isLoan ? 'Owe '+num(Math.abs(v)) : (v<0?'−':'')+num(Math.abs(v))}</span></button>`;
  }).join('')).join('');
}

function sparkPath(vals, w, h){
  const min=Math.min(...vals), max=Math.max(...vals), span=(max-min)||1;
  return vals.map((v,i)=>`${i?'L':'M'}${(i/(vals.length-1)*w).toFixed(1)},${(h-4-(v-min)/span*(h-8)).toFixed(1)}`).join(' ');
}
function netWorthSeries(n){
  const out=[]; for (let i=n-1;i>=0;i--){ const k=shiftMonth(THIS_MONTH,-i); out.push({k, v:netWorth(balances(monthEnd(k)))}); } return out;
}

function viewHome(){
  const b = balances(), nw = netWorth(b);
  const series = netWorthSeries(6);
  const prev = netWorth(balances(monthEnd(shiftMonth(THIS_MONTH,-1))));
  const started = (cfg().accounts||[]).map(a=>a.openingDate).sort()[0] || TODAY;
  const hasPrev = started.slice(0,7) < THIS_MONTH;
  const change = nw - prev;
  const everyday = sumKinds(b,['cash','mobile','bank']), saved = sumKinds(b,['savings','invest']), owed = -sumKinds(b,['loan']), assets = sumKinds(b,['asset']);
  const ms = monthStats(THIS_MONTH);
  const bs = billStatus(THIS_MONTH).filter(x=>!x.paid);
  const recent = allEntries().sort((a,c)=> c.date.localeCompare(a.date) || (c.createdAt||0)-(a.createdAt||0)).slice(0,6);
  const hr = NOW.getHours(), greet = hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const target = cfg().savingsTarget ?? 20;
  return `
  <div class="ph"><div><p class="sub">${greet}<span class="offline" id="offTag" ${navigator.onLine?'hidden':''}>Offline</span></p><h1>Your money</h1></div><button class="iconbtn" id="openSettings" aria-label="Settings">${ICONS.gear}</button></div>
  <section class="nw" aria-label="Net worth">
    <p class="lbl">Net worth</p>
    <div class="val"><small>${esc(cur())}</small>${nw<0?'−':''}${num(Math.abs(nw))}</div>
    <div class="chg">${hasPrev ? `<b class="${change>=0?'up':'down'}">${signed(change)}</b> since end of ${esc(mLabel(shiftMonth(THIS_MONTH,-1),{month:'long'}))}` : 'Tracking since ' + esc(dLabel(started))}</div>
    ${hasPrev ? `<svg class="spark" viewBox="0 0 170 56" aria-hidden="true"><path d="${sparkPath(series.map(s=>s.v),170,56)}" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>` : ''}
    <div class="split">
      <div><span>Available</span><b>${short(everyday)}</b></div>
      <div><span>Saved & invested</span><b>${short(saved)}</b></div>
      ${assets ? `<div><span>Assets</span><b>${short(assets)}</b></div>` : ''}
      ${owed>0 ? `<div><span>You owe</span><b>${short(owed)}</b></div>` : ''}
    </div>
  </section>

  <div class="sec"><div class="sec-h"><h2>Accounts</h2></div>
    <div class="box">${acctRows(b)}<button class="addrow" id="addAcct">${ICONS.plus} Add account</button></div></div>

  <div class="sec"><div class="sec-h"><h2>${esc(mLabel(THIS_MONTH,{month:'long'}))} so far</h2><button class="link" data-goto="insights">Details</button></div>
    <div class="strip">
      <div><span>Money in</span><b class="in">${short(ms.income)}</b></div>
      <div><span>Money out</span><b class="out">${short(ms.out)}</b></div>
      <div><span>Kept</span><b>${ms.rate===null ? '—' : Math.round(ms.rate*100)+'%'}</b></div>
    </div>
    ${ms.rate!==null ? `<p class="hint" style="margin:8px 2px 0">${ms.rate*100 >= target ? `Above your ${target}% target. Keep it there.` : `Your target is to keep ${target}%. Spend ${money(Math.max(0, ms.out - ms.income*(1-target/100)))} less this month to hit it.`}</p>` : ''}
  </div>

  ${bs.length ? `<div class="sec"><div class="sec-h"><h2>Bills to pay</h2><span class="muted" style="font-size:.88rem">${short(bs.reduce((s,x)=>s+(+x.amount||0),0))} left</span></div>
    <div class="box">${bs.map(x=>`<div class="bill"><span class="nm"><b>${esc(x.name)}</b><small class="${x.late?'late':''}">${x.late?'Overdue · ':''}Due ${x.due} ${esc(mShort(THIS_MONTH))} · ${short(+x.amount||0)}</small></span><button class="pill" data-pay="${x.id}">Pay</button></div>`).join('')}</div></div>` : ''}

  <div class="sec"><div class="sec-h"><h2>Recent</h2>${recent.length?'<button class="link" data-goto="activity">See all</button>':''}</div>
    <div class="box">${recent.length ? recent.map(txRow).join('') : '<p class="empty">Nothing recorded yet. Tap + to add your first expense or income.</p>'}</div></div>`;
}

function txRow(e){
  const a = acct(e.accountId);
  let title, sub, amt, cls = e.type, mark;
  if (e.type==='transfer'){ title = `${acctName(e.accountId)} → ${acctName(e.toAccountId)}`; sub = [e.note, e.fee?`fee ${num(e.fee)}`:''].filter(Boolean).join(' · ') || 'Transfer'; amt = num(e.amount); mark='⇄'; }
  else if (e.type==='adjust'){ title = ADJ_CAT; sub = a?.name||''; amt = signed(+e.amount); mark='='; }
  else { title = e.category || 'Other'; sub = [e.note, a?.name].filter(Boolean).join(' · '); amt = (e.type==='income'?'+':'−') + num(e.amount); mark = (e.category||'?').trim()[0].toUpperCase(); }
  return `<button class="tx" data-tx="${e.id}" data-k="${e.date.slice(0,7)}"><span class="ic ${cls}">${esc(mark)}</span><span class="nm"><b>${esc(title)}</b><small>${esc(sub)}</small></span><span class="amt ${e.type==='income'?'in':''}">${amt}<small>${esc(dLabel(e.date))}</small></span></button>`;
}
function txRowNoDate(e){ return txRow(e).replace(/<small>[^<]*<\/small><\/span><\/button>$/,'</span></button>'); }

function viewActivity(){
  const q = state.q.toLowerCase();
  let list = q ? allEntries() : entries(state.month);
  if (state.fType) list = list.filter(e=>e.type===state.fType);
  if (state.fAcct) list = list.filter(e=>e.accountId===state.fAcct || e.toAccountId===state.fAcct);
  if (q) list = list.filter(e => [e.category,e.note,acctName(e.accountId),e.toAccountId?acctName(e.toAccountId):'',String(e.amount)].join(' ').toLowerCase().includes(q));
  list.sort((a,c)=> c.date.localeCompare(a.date) || (c.createdAt||0)-(a.createdAt||0));
  const groups = {}; list.slice(0,300).forEach(e => (groups[e.date] ||= []).push(e));
  const dayNet = l => l.reduce((s,e)=> s + (e.type==='income'?+e.amount: e.type==='expense'? -e.amount : e.type==='transfer' ? -(+e.fee||0) : 0), 0);
  const ms = monthStats(state.month);
  const typeChip = (t,l) => `<button class="chip" data-ft="${t}" aria-pressed="${state.fType===t}">${l}</button>`;
  return `
  <div class="ph"><h1>Activity</h1>${q?'':monthNav()}</div>
  <div class="search"><input class="inp" id="q" type="search" placeholder="Search all months" value="${esc(state.q)}" aria-label="Search transactions"></div>
  <div class="chips scroll" style="margin-bottom:12px">${typeChip('','All')}${typeChip('expense','Spent')}${typeChip('income','Received')}${typeChip('transfer','Transfers')}
    <select class="chip" id="fAcct" aria-label="Filter by account"><option value="">All accounts</option>${accounts(true).map(a=>`<option value="${a.id}" ${state.fAcct===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div>
  ${!q && !state.fType && !state.fAcct ? `<div class="strip" style="margin-bottom:14px"><div><span>In</span><b class="in">${short(ms.income)}</b></div><div><span>Out</span><b class="out">${short(ms.out)}</b></div><div><span>Net</span><b>${short(ms.kept)}</b></div></div>` : ''}
  <div class="box">${Object.keys(groups).length ? Object.entries(groups).map(([d,l]) => { const n=dayNet(l); return `<div class="day-h"><span>${esc(dLabel(d))}</span><span>${n?signed(n):''}</span></div>` + l.map(txRowNoDate).join(''); }).join('')
    : `<p class="empty">${q ? `Nothing matches “${esc(state.q)}”.` : `No transactions in ${esc(mLabel(state.month,{month:'long'}))}${state.fType||state.fAcct?' with these filters':''}.`}</p>`}</div>`;
}

function viewPlan(){
  const k = state.month, ms = monthStats(k);
  const cats = expCats().map(c=>({...c, spent: ms.byCat[c.name]||0}));
  Object.entries(ms.byCat).forEach(([n,v]) => { if (!cats.some(c=>c.name===n)) cats.push({name:n, budget:0, spent:v}); });
  const budgeted = cats.filter(c=>+c.budget>0), unb = cats.filter(c=>!(+c.budget>0) && c.spent>0);
  const totalBudget = budgeted.reduce((s,c)=>s+(+c.budget),0);
  const totalBudgetSpent = budgeted.reduce((s,c)=>s+c.spent,0);
  const isCur = k===THIS_MONTH, dayFrac = isCur ? NOW.getDate()/daysIn(k) : 1;
  const b = balances();
  const goals = cfg().goals || [];
  const billList = billStatus(k);
  return `
  <div class="ph"><h1>Plan</h1>${monthNav()}</div>

  <div class="sec" style="margin-top:0"><div class="sec-h"><h2>Budgets</h2><button class="link" id="editBudgets">Set budgets</button></div>
  <div class="box">
    ${budgeted.length ? `<div class="summary"><div><span>Budgeted</span><b>${short(totalBudget)}</b></div><div><span>Spent</span><b>${short(totalBudgetSpent)}</b></div><div><span>Left</span><b class="${totalBudget-totalBudgetSpent<0?'out':''}">${short(totalBudget-totalBudgetSpent)}</b></div>${ms.income?`<div><span>Of income</span><b>${Math.round(totalBudget/ms.income*100)}%</b></div>`:''}</div>` : ''}
    ${budgeted.sort((a,c)=>c.spent/c.budget - a.spent/a.budget).map(c => {
      const p = c.spent/c.budget, cls = p>1?'over':(p>dayFrac+.1 && p>.5)?'near':'';
      return `<div class="row"><div class="row-h"><b>${esc(c.name)}</b>${p>1?`<span class="over">${short(c.spent-c.budget)} over</span>`:`<span>${short(c.budget-c.spent)} left of ${short(c.budget)}</span>`}</div><div class="meter"><i class="${cls}" style="width:${Math.min(100,p*100)}%"></i></div>${cls==='near'&&isCur?`<div class="row-f"><span>Spending faster than the month is passing</span></div>`:''}</div>`;
    }).join('') || '<p class="empty">No budgets yet. Set a monthly limit for the categories that matter most, like food, transport and eating out.</p>'}
    ${unb.length ? `<div class="grp" style="border-top:1px solid var(--line);padding-top:12px">Not budgeted</div>` + unb.sort((a,c)=>c.spent-a.spent).map(c=>`<div class="row" style="border-top:0;padding-top:6px;padding-bottom:6px"><div class="row-h"><b>${esc(c.name)}</b><span>${short(c.spent)}</span></div></div>`).join('') + '<div style="height:8px"></div>' : ''}
  </div></div>

  <div class="sec"><div class="sec-h"><h2>Goals</h2><button class="link" id="addGoal">Add goal</button></div>
  <div class="box">${goals.length ? goals.map(g => {
      const have = Math.max(0, b[g.accountId]||0), tgt = +g.target||0, p = tgt?have/tgt:0, left = Math.max(0,tgt-have);
      const by = goalDate(g), mLeft = by ? monthsUntil(by) : 0;
      const foot = p>=1 ? 'Goal reached 🎉' : !by ? `${short(left)} to go · add a date to get a monthly amount` : by<=TODAY ? `Target date passed · ${short(left)} to go` : mLeft<1 ? `${money(left)} needed by ${fullDate(by)}` : `Put aside ${money(left/mLeft)}/month · ${timeLeft(by)} to ${fullDate(by)}`;
      return `<button class="row" data-goal="${g.id}"><div class="row-h"><b>${esc(g.name)}</b><span>${short(have)} of ${short(tgt)}</span></div><div class="meter"><i class="gold" style="width:${Math.min(100,p*100)}%"></i></div><div class="row-f"><span>${esc(foot)}</span><span>${esc(acctName(g.accountId))}</span></div></button>`;
    }).join('') : '<p class="empty">Name what you’re building toward (emergency fund, a plot, a car) and link the account the money sits in. You’ll see how much to put aside each month.</p>'}</div></div>

  <div class="sec"><div class="sec-h"><h2>Monthly bills</h2><button class="link" id="editBills">${billList.length?'Edit':'Add bills'}</button></div>
  <div class="box">${billList.length ? billList.map(x=>`<div class="bill"><span class="nm"><b>${esc(x.name)}</b><small class="${x.late?'late':''}">${x.paid?`Paid ${num(x.paidAmt)}`:`${x.late?'Overdue · ':''}Due ${x.due} ${esc(mShort(k))} · ${short(+x.amount||0)}`}</small></span>${x.paid?'<span class="muted">✓</span>':`<button class="pill" data-pay="${x.id}">Pay</button>`}</div>`).join('')
    : '<p class="empty">Rent, school fees, LUKU, internet: add the bills that come every month and they’ll show up on Home until you pay them.</p>'}</div></div>`;
}

function viewInsights(){
  const k = state.month, ms = monthStats(k), pk = shiftMonth(k,-1), pms = monthStats(pk);
  const target = cfg().savingsTarget ?? 20;
  const months = []; for (let i=5;i>=0;i--) months.push(shiftMonth(k,-i));
  const rates = months.map(m => ({m, s:monthStats(m)}));
  // savings rate chart
  const W=600,H=190,base=150, bw=50, slot=W/6, top=26;
  const maxR = Math.max(target, ...rates.map(r=>r.s.rate!==null?r.s.rate*100:0), 10), minR = Math.min(0, ...rates.map(r=>r.s.rate!==null?r.s.rate*100:0));
  const scale = (base-top)/((maxR-minR)||1), zeroY = top + maxR*scale;
  let rc = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Share of income kept, last six months">`;
  rc += `<line x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}" style="stroke:var(--line);stroke-width:1"/>`;
  rc += `<line x1="0" x2="${W}" y1="${zeroY - target*scale}" y2="${zeroY - target*scale}" style="stroke:var(--gold);stroke-width:1.5;stroke-dasharray:5 5"/><text x="4" y="${zeroY - target*scale - 6}" text-anchor="start" style="fill:var(--gold)">${target}% target</text>`;
  rates.forEach((r,i) => {
    const cx = slot*i+slot/2, v = r.s.rate!==null ? r.s.rate*100 : 0, h = Math.abs(v)*scale, yv = v>=0 ? zeroY-h : zeroY;
    const col = r.s.rate===null ? 'var(--track)' : v>=target ? 'var(--in)' : v>=0 ? 'color-mix(in srgb,var(--in) 45%,var(--track))' : 'var(--out)';
    rc += `<rect x="${cx-bw/2}" y="${yv}" width="${bw}" height="${Math.max(h,2)}" rx="5" style="fill:${col}"/>`;
    rc += `<text x="${cx}" y="${H-10}" text-anchor="middle" class="${r.m===k?'cur':''}">${esc(mShort(r.m))}</text>`;
    if (r.s.rate!==null) rc += `<text x="${cx}" y="${(v>=0?yv:yv+h)-5}" text-anchor="middle" class="${r.m===k?'cur':''}">${Math.round(v)}%</text>`;
  });
  rc += '</svg>';

  // net worth chart (12 months ending at selected month)
  const nwPts = []; for (let i=11;i>=0;i--){ const m=shiftMonth(k,-i); if (m<=THIS_MONTH) nwPts.push({m, v:netWorth(balances(monthEnd(m)))}); }
  const started = (cfg().accounts||[]).map(a=>a.openingDate).sort()[0] || TODAY;
  const nwUse = nwPts.filter(p => p.m >= started.slice(0,7));
  let nwChart = '';
  if (nwUse.length >= 2){
    const W2=600,H2=200,pl=6,pr=6,tp=30,bt=162; const vs=nwUse.map(p=>p.v), mn=Math.min(...vs), mx=Math.max(...vs), sp=(mx-mn)||1;
    const X = i => pl + i*(W2-pl-pr)/(nwUse.length-1), Y = v => bt - (v-mn)/sp*(bt-tp);
    const d = nwUse.map((p,i)=>`${i?'L':'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
    nwChart = `<svg viewBox="0 0 ${W2} ${H2}" role="img" aria-label="Net worth over time"><path d="${d} L${X(nwUse.length-1)},${bt} L${X(0)},${bt} Z" style="fill:color-mix(in srgb,var(--gold) 14%,transparent)"/><path d="${d}" style="fill:none;stroke:var(--gold);stroke-width:2.5"/>`
      + nwUse.map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.v)}" r="3.5" style="fill:var(--gold)"/>` + ((i===0||i===nwUse.length-1||nwUse.length<=6)?`<text x="${X(i)}" y="${H2-8}" text-anchor="${i===0?'start':i===nwUse.length-1?'end':'middle'}">${esc(mShort(p.m))}</text><text x="${X(i)}" y="${Y(p.v)-9}" text-anchor="${i===0?'start':i===nwUse.length-1?'end':'middle'}" class="cur">${short(p.v)}</text>`:'')).join('') + '</svg>';
  }

  // where money went
  const cats = Object.entries(ms.byCat).sort((a,b)=>b[1]-a[1]);
  const maxC = cats[0]?.[1] || 1;
  const whereRows = cats.map(([n,v]) => { const pv = pms.byCat[n]||0, d = v-pv; const pct = ms.out ? Math.round(v/ms.out*100) : 0;
    return `<div class="row"><div class="row-h"><b>${esc(n)}</b><span>${short(v)} · ${pct}%${pv ? ` <span class="cmp ${d>0?'up':'down'}">${d>0?'▲':'▼'} ${short(Math.abs(d))}</span>`:''}</span></div><div class="meter"><i style="width:${v/maxC*100}%;background:var(--ink);opacity:.8"></i></div></div>`; }).join('');

  // notes
  const notes = [];
  if (ms.rate!==null){
    notes.push(ms.rate*100>=target ? `You kept ${Math.round(ms.rate*100)}% of your income — above your ${target}% target.` : ms.rate>=0 ? `You kept ${Math.round(ms.rate*100)}% of your income. Hitting ${target}% means spending ${money(ms.out - ms.income*(1-target/100))} less.` : `You spent ${money(-ms.kept)} more than came in. Check the top categories below.`);
  }
  const deltas = Object.keys({...ms.byCat,...pms.byCat}).map(n=>({n, d:(ms.byCat[n]||0)-(pms.byCat[n]||0)})).sort((a,b)=>b.d-a.d);
  if (pms.out && deltas[0]?.d>0) notes.push(`${deltas[0].n} is up ${money(deltas[0].d)} on ${mLabel(pk,{month:'long'})}.`);
  if (ms.byCat[FEE_CAT]) notes.push(`Transfer and withdrawal fees cost you ${money(ms.byCat[FEE_CAT])} this month.`);
  if (ms.toSavings) notes.push(`You moved ${money(ms.toSavings)} into savings, investments or debt repayment.`);
  const last3 = [0,1,2].map(i=>monthStats(shiftMonth(THIS_MONTH,-i))).filter(s=>s.income>0);
  if (k===THIS_MONTH && last3.length>=2){ const avg = last3.reduce((s,x)=>s+x.kept,0)/last3.length; if (avg>0) notes.push(`At your recent pace you keep about ${money(avg)} a month — ${money(avg*12)} a year.`); }

  const big = entries(k).filter(e=>e.type==='expense').sort((a,b)=>b.amount-a.amount).slice(0,5);
  return `
  <div class="ph"><h1>Insights</h1>${monthNav()}</div>
  <div class="box">
    <div class="big-stat"><span class="muted" style="font-size:.88rem">Share of income you kept</span><div class="v">${ms.rate===null?'—':Math.round(ms.rate*100)+'%'}</div><p>${ms.income? `${money(ms.income)} in · ${money(ms.out)} out` : 'Record income this month to see this.'}</p></div>
    <div class="chart">${rc}</div>
    ${notes.length?`<ul class="notes">${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}
  </div>

  <div class="sec"><div class="sec-h"><h2>Where the money went</h2><span class="muted" style="font-size:.88rem">vs ${esc(mShort(pk))}</span></div>
    <div class="box">${whereRows || `<p class="empty">No spending recorded in ${esc(mLabel(k,{month:'long'}))}.</p>`}</div></div>

  ${big.length?`<div class="sec"><div class="sec-h"><h2>Biggest expenses</h2></div><div class="box">${big.map(txRow).join('')}</div></div>`:''}

  <div class="sec"><div class="sec-h"><h2>Net worth over time</h2></div>
    <div class="box">${nwChart?`<div class="chart">${nwChart}</div>`:'<p class="empty">This chart fills in as the months go by. Check back at the end of the month.</p>'}</div></div>`;
}

/* ================= sheets ================= */
const sheet = $('#sheet');
function openSheet(title, body, mount){
  $('#sheetBody').innerHTML = `<form class="sh" novalidate><div class="sh-h"><h2 id="sheetTitle">${esc(title)}</h2><button type="button" class="x" data-close aria-label="Close">${ICONS.x}</button></div>${body}</form>`;
  const f = $('#sheetBody form');
  $$('[data-close]', f).forEach(b => b.addEventListener('click', () => sheet.close()));
  $$('input[inputmode="decimal"]', f).forEach(i => i.addEventListener('input', () => fmtInput(i)));
  if (!sheet.open) sheet.showModal();
  mount && mount(f);
  return f;
}
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
const chipGroup = (f, sel, onPick) => $$(sel, f).forEach(c => c.addEventListener('click', () => { $$(sel, f).forEach(x=>x.setAttribute('aria-pressed', String(x===c))); onPick && onPick(c); }));
const picked = (f, sel) => $(sel+'[aria-pressed="true"]', f)?.dataset.v || '';

/* ---- record / edit transaction ---- */
function openTx(prefill={}, opts={}){
  const edit = prefill.id ? prefill : null;
  if (edit && edit.type==='adjust') return openAdjustView(edit);
  let type = prefill.type || 'expense';
  const build = () => {
    const cats = type==='income' ? incCats() : expCats().map(c=>c.name);
    const usage = catUsage(type);
    const ordered = [...cats].sort((a,b)=>(usage[b]||0)-(usage[a]||0));
    const selCat = prefill.category && cats.includes(prefill.category) ? prefill.category : '';
    if (prefill.category && !cats.includes(prefill.category)) ordered.unshift(prefill.category);
    const fromDef = prefill.accountId || lastAccount(type==='transfer'?'transfer':type);
    const toDef = prefill.toAccountId || '';
    const date = prefill.date || (state.month===THIS_MONTH || state.tab==='home' ? TODAY : state.month+'-01');
    const bb = balances();
    const acctChips = (cls, sel, exclude) => accounts().filter(a=>a.id!==exclude && a.kind!=='asset').map(a=>`<button type="button" class="chip ${cls}" data-v="${a.id}" aria-pressed="${a.id===sel}">${esc(a.name)}<small>${a.kind==='loan'?'owe '+short(-(bb[a.id]||0)):short(bb[a.id]||0)}</small></button>`).join('');
    return `
      <div class="seg" role="group" aria-label="Type">${['expense','income','transfer'].map(t=>`<button type="button" data-type="${t}" aria-pressed="${t===type}">${{expense:'Spent',income:'Received',transfer:'Transfer'}[t]}</button>`).join('')}</div>
      <div class="amount"><span>${esc(cur())}</span><input id="tAmt" inputmode="decimal" autocomplete="off" placeholder="0" value="${prefill.amount?num(prefill.amount):''}" aria-label="Amount"></div>
      ${type!=='transfer' ? `<div class="fl"><span>${type==='income'?'Source':'Category'}</span><div class="chips" id="tCats">${ordered.map((c,i)=>`<button type="button" class="chip cat" data-v="${esc(c)}" aria-pressed="${c===selCat}" ${i>=8 && c!==selCat && ordered.length>10 ?'hidden':''}>${esc(c)}</button>`).join('')}${ordered.length>10?`<button type="button" class="chip more" id="moreCats">More…</button>`:''}</div></div>` : ''}
      <div class="fl"><span>${type==='income'?'Into':'From'}</span><div class="chips scroll">${acctChips('from', fromDef)}</div></div>
      ${type==='transfer' ? `<div class="fl"><span>To</span><div class="chips scroll">${acctChips('to', toDef, fromDef)}</div></div>
        <label class="f">Fee (optional) <input id="tFee" inputmode="decimal" placeholder="e.g. M-Pesa or ATM charge" value="${prefill.fee?num(prefill.fee):''}"></label>` : ''}
      <div class="fl"><span>When</span><div class="chips"><button type="button" class="chip dt" data-v="${TODAY}" aria-pressed="${date===TODAY}">Today</button><button type="button" class="chip dt" data-v="${YESTERDAY}" aria-pressed="${date===YESTERDAY}">Yesterday</button><input type="date" id="tDate" class="chip" value="${date}" max="${TODAY}" aria-label="Pick date" style="padding:5px 10px"></div></div>
      <label class="f">Note <input id="tNote" maxlength="80" placeholder="${type==='expense'?'e.g. Shoprite, fuel at Puma':type==='income'?'e.g. September salary':'e.g. Moving to savings'}" value="${esc(prefill.note||'')}"></label>
      <p class="err" id="tErr" hidden></p>
      <div class="acts">${edit?'<button type="button" class="btn danger small" id="tDel">Delete</button>':''}<button type="submit" class="btn" id="tSave">Save</button></div>`;
  };
  const mount = f => {
    const amt = $('#tAmt', f);
    const updSave = () => { const v=parseAmt(amt.value); $('#tSave',f).textContent = v>0 ? `Save · ${num(v)}` : 'Save'; };
    amt.addEventListener('input', updSave); updSave();
    if (!prefill.amount) setTimeout(()=>amt.focus(), 60);
    $$('[data-type]', f).forEach(b => b.addEventListener('click', () => { prefill = {...prefill, amount: parseAmt(amt.value)||prefill.amount, note: $('#tNote',f).value, category:''}; type = b.dataset.type; openSheet(title(), build(), mount); }));
    chipGroup(f, '.cat');
    $('#moreCats',f)?.addEventListener('click', e => { $$('.cat[hidden]',f).forEach(c=>c.hidden=false); e.currentTarget.remove(); });
    chipGroup(f, '.from', c => { if (type==='transfer'){ prefill = {...prefill, amount: parseAmt(amt.value)||0, accountId:c.dataset.v, toAccountId: picked(f,'.to')===c.dataset.v?'':picked(f,'.to'), fee: parseAmt($('#tFee',f).value)||0, note: $('#tNote',f).value}; openSheet(title(), build(), mount); } });
    chipGroup(f, '.to');
    chipGroup(f, '.dt', c => $('#tDate',f).value = c.dataset.v);
    $('#tDate',f).addEventListener('change', e => $$('.dt',f).forEach(x=>x.setAttribute('aria-pressed', String(x.dataset.v===e.target.value))));
    $('#tDel',f)?.addEventListener('click', () => { if (!confirm('Delete this transaction?')) return; removeEntry(edit); sheet.close(); render(); toast('Deleted'); });
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      const amount = parseAmt(amt.value), date = $('#tDate',f).value, from = picked(f,'.from');
      const cat = type==='transfer' ? '' : picked(f,'.cat'), to = type==='transfer' ? picked(f,'.to') : '';
      const fee = type==='transfer' ? (parseAmt($('#tFee',f).value)||0) : 0;
      const err = !(amount>0) ? 'Enter the amount.' : type!=='transfer' && !cat ? `Pick a ${type==='income'?'source':'category'}.` : !from ? 'Pick an account.' : type==='transfer' && !to ? 'Pick where the money went.' : !isoValid(date) ? 'Pick a date.' : '';
      if (err){ $('#tErr',f).textContent = err; $('#tErr',f).hidden = false; return; }
      const rec = { id: edit?.id || uid(), type, amount, date, accountId: from, note: $('#tNote',f).value.trim(), createdAt: edit?.createdAt || Date.now() };
      if (type==='transfer'){ rec.toAccountId = to; if (fee) rec.fee = fee; } else rec.category = cat;
      const billId = edit?.billId || opts.billId; if (billId && type==='expense') rec.billId = billId;
      if (edit) removeEntry(edit);
      putEntry(rec);
      sheet.close(); render();
      const a = acct(from);
      toast(`${edit?'Updated':'Saved'} · ${a?.name||''} now ${short(balances()[from]||0)}`);
    });
  };
  const title = () => edit ? 'Edit transaction' : opts.title || 'Record';
  openSheet(title(), build(), mount);
}
function putEntry(rec){ const k = rec.date.slice(0,7); state.ledger[k] = [...entries(k).filter(x=>x.id!==rec.id), rec]; saveMonth(k); }
function removeEntry(e){ const k = e.date.slice(0,7); state.ledger[k] = entries(k).filter(x=>x.id!==e.id); saveMonth(k); }

function openAdjustView(e){
  openSheet(ADJ_CAT, `<p class="muted" style="margin:0">${esc(acctName(e.accountId))} was corrected by <b>${signed(+e.amount)}</b> on ${esc(dLabel(e.date))} to match the real balance.</p>
    <button type="button" class="btn danger" id="adjDel">Undo this adjustment</button>`, f => {
    $('#adjDel',f).addEventListener('click', () => { removeEntry(e); sheet.close(); render(); toast('Adjustment removed'); });
  });
}

/* ---- account detail / edit ---- */
function openAccount(id){
  const a = acct(id); if (!a) return;
  const bal = balances()[id]||0, isLoan = a.kind==='loan';
  const recent = allEntries().filter(e=>e.accountId===id||e.toAccountId===id).sort((x,y)=>y.date.localeCompare(x.date)||(y.createdAt||0)-(x.createdAt||0)).slice(0,8);
  openSheet(a.name, `
    <div><span class="muted" style="font-size:.86rem">${KINDS[a.kind]?.label}${isLoan?' · amount owed':' · balance'}</span><p class="big-bal">${esc(cur())} ${num(Math.abs(bal))}</p></div>
    <div class="fl"><span>Does this match ${isLoan?'what you owe':'your '+(a.kind==='mobile'?'M-Pesa / mobile money':a.kind==='bank'?'bank app':'real balance')}? If not, enter the real figure.</span>
      <div class="acts"><input class="inp" id="realBal" inputmode="decimal" placeholder="${isLoan?'Amount owed now':'Actual balance now'}"><button type="button" class="btn small" id="matchBtn" style="width:auto">Update</button></div></div>
    ${recent.length ? `<div class="box">${recent.map(txRow).join('')}</div>` : '<p class="muted" style="margin:0">No transactions yet.</p>'}
    <div class="acts"><button type="button" class="btn ghost" id="editAcct">Edit account</button></div>`, f => {
    $('#matchBtn',f).addEventListener('click', () => {
      let real = parseAmt($('#realBal',f).value); if (isNaN(real)) return $('#realBal',f).focus();
      if (isLoan) real = -Math.abs(real);
      const delta = real - bal; if (!delta){ toast('Already matches'); return; }
      putEntry({ id:uid(), type:'adjust', amount:delta, date:TODAY, accountId:id, createdAt:Date.now() });
      sheet.close(); render(); toast(`${a.name} updated to ${num(Math.abs(real))}`);
    });
    $$('.tx', f).forEach(t => t.addEventListener('click', () => { const e = entries(t.dataset.k).find(x=>x.id===t.dataset.tx); if (e) openTx(clone(e)); }));
    $('#editAcct',f).addEventListener('click', () => openAccountEdit(id));
  });
}
function openAccountEdit(id){
  const a = id ? acct(id) : null;
  const used = a && allEntries().some(e=>e.accountId===id||e.toAccountId===id);
  let kind = a?.kind || 'bank';
  openSheet(a ? 'Edit account' : 'Add account', `
    <label class="f">Name <input id="aName" maxlength="40" placeholder="e.g. CRDB, NMB Savings, UTT Umoja Fund, Plot at Fumba" value="${esc(a?.name||'')}"></label>
    <div class="fl"><span>Type</span><div class="chips">${Object.entries(KINDS).map(([k,v])=>`<button type="button" class="chip kind" data-v="${k}" aria-pressed="${k===kind}">${v.label}</button>`).join('')}</div></div>
    ${a ? '' : `<label class="f"><span id="aBalL">Balance right now</span><input id="aBal" inputmode="decimal" placeholder="0"></label>`}
    <p class="err" id="aErr2" hidden></p>
    <div class="acts">${a ? (used ? `<button type="button" class="btn ghost small" id="aArch">${a.archived?'Restore':'Hide'}</button>` : `<button type="button" class="btn danger small" id="aDel">Delete</button>`) : ''}<button type="submit" class="btn">${a?'Save':'Add account'}</button></div>
    ${a && used ? '<p class="hint">Accounts with transactions can be hidden but not deleted, so your history stays correct.</p>' : ''}`, f => {
    chipGroup(f, '.kind', c => { kind = c.dataset.v; const l=$('#aBalL',f); if (l) l.textContent = kind==='loan' ? 'Amount you owe right now' : kind==='asset' ? 'What it’s worth today' : 'Balance right now'; });
    setTimeout(()=>$('#aName',f).focus(), 60);
    $('#aDel',f)?.addEventListener('click', () => { if (!confirm('Delete this account?')) return; state.cfg.accounts = cfg().accounts.filter(x=>x.id!==id); saveCfg(); sheet.close(); render(); });
    $('#aArch',f)?.addEventListener('click', () => { a.archived = !a.archived; saveCfg(); sheet.close(); render(); toast(a.archived?'Account hidden':'Account restored'); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#aName',f).value.trim();
      if (!name){ $('#aErr2',f).textContent='Give the account a name.'; $('#aErr2',f).hidden=false; return; }
      if (a){ a.name = name; a.kind = kind; }
      else { const bal = parseAmt($('#aBal',f).value)||0; cfg().accounts.push({ id:uid(), name, kind, opening: kind==='loan' ? -Math.abs(bal) : bal, openingDate:TODAY, order: cfg().accounts.length }); }
      saveCfg(); sheet.close(); render(); toast(a?'Saved':'Account added');
    });
  });
}

/* ---- goals ---- */
function openGoal(id){
  const g = id ? cfg().goals.find(x=>x.id===id) : null;
  const opts = accounts().filter(a=>a.kind!=='loan');
  const pref = g?.accountId || opts.find(a=>['savings','invest'].includes(a.kind))?.id || '';
  openSheet(g ? 'Edit goal' : 'New goal', `
    <label class="f">What are you saving for? <input id="gName" maxlength="40" placeholder="e.g. Emergency fund, House build, Car" value="${esc(g?.name||'')}"></label>
    <label class="f">Target amount <input id="gTgt" inputmode="decimal" value="${g?.target?num(g.target):''}" placeholder="e.g. 20,000,000"></label>
    <div class="fl"><span>Reach it by</span>
      <div class="chips">${[[6,'6 months'],[12,'1 year'],[24,'2 years'],[36,'3 years'],[60,'5 years']].map(([m,l])=>`<button type="button" class="chip gq" data-m="${m}">${l}</button>`).join('')}</div>
      <input id="gBy" class="inp" type="date" min="${TODAY}" value="${esc(goalDate(g))}" aria-label="Target date">
      <p class="hint" style="margin:0" id="gByHint"></p></div>
    <div class="fl"><span>Where the money is kept</span><div class="chips">${opts.map(a=>`<button type="button" class="chip gacct" data-v="${a.id}" aria-pressed="${a.id===pref}">${esc(a.name)}</button>`).join('')}</div>
      <p class="hint" style="margin:0">Progress follows this account’s balance. Tip: use a separate savings account so it isn’t mixed with spending money.</p></div>
    <p class="err" id="gErr" hidden></p>
    <div class="acts">${g?'<button type="button" class="btn danger small" id="gDel">Delete</button>':''}<button type="submit" class="btn">${g?'Save':'Add goal'}</button></div>`, f => {
    chipGroup(f, '.gacct');
    const byIn = $('#gBy',f), hint = () => { const t=parseAmt($('#gTgt',f).value), d=byIn.value; $('#gByHint',f).textContent = d && isoValid(d) ? `${fullDate(d)} · ${timeLeft(d)}${t>0?` · about ${money(t/Math.max(1,monthsUntil(d)))} a month if you start from zero`:''}` : 'Pick a date so the app can tell you how much to put aside each month.'; };
    $$('.gq',f).forEach(c => c.addEventListener('click', () => { const d=new Date(NOW.getFullYear(), NOW.getMonth()+(+c.dataset.m), NOW.getDate()); byIn.value = iso(d); $$('.gq',f).forEach(x=>x.setAttribute('aria-pressed', String(x===c))); hint(); }));
    byIn.addEventListener('change', () => { $$('.gq',f).forEach(x=>x.setAttribute('aria-pressed','false')); hint(); });
    $('#gTgt',f).addEventListener('input', hint); hint();
    $('#gDel',f)?.addEventListener('click', () => { cfg().goals = cfg().goals.filter(x=>x.id!==id); saveCfg(); sheet.close(); render(); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const name=$('#gName',f).value.trim(), target=parseAmt($('#gTgt',f).value), accountId=picked(f,'.gacct');
      const by = $('#gBy',f).value;
      const err = !name?'Name your goal.':!(target>0)?'Enter a target amount.':by && (!isoValid(by) || by<=TODAY)?'Pick a date in the future.':!accountId?'Pick the account where this money sits.':'';
      if (err){ $('#gErr',f).textContent=err; $('#gErr',f).hidden=false; return; }
      const rec = { id:g?.id||uid(), name, target, by, accountId };
      cfg().goals = [...(cfg().goals||[]).filter(x=>x.id!==rec.id), rec];
      saveCfg(); sheet.close(); render(); toast(g?'Goal saved':'Goal added');
    });
  });
}

/* ---- budgets ---- */
function openBudgets(){
  const ms = monthStats(shiftMonth(THIS_MONTH,-1));
  openSheet('Monthly budgets', `
    <p class="hint" style="margin:0">Set a limit for each category you want to control. Leave blank for no limit. Last month’s spending is shown to help.</p>
    <div class="list-edit">${expCats().map((c,i)=>`<div class="le" style="grid-template-columns:1fr 130px"><div><b style="font-weight:500">${esc(c.name)}</b><div class="muted" style="font-size:.8rem">${ms.byCat[c.name]?'Last month '+short(ms.byCat[c.name]):''}</div></div><input class="inp" inputmode="decimal" data-i="${i}" value="${c.budget?num(c.budget):''}" placeholder="No limit" aria-label="Budget for ${esc(c.name)}"></div>`).join('')}</div>
    <button type="submit" class="btn">Save budgets</button>`, f => {
    f.addEventListener('submit', e => { e.preventDefault(); $$('input[data-i]',f).forEach(i => { expCats()[+i.dataset.i].budget = parseAmt(i.value)||0; }); saveCfg(); sheet.close(); render(); toast('Budgets saved'); });
  });
}

/* ---- bills ---- */
function openBills(){
  const row = (b={}) => `<div class="le bill" data-id="${esc(b.id||'')}"><input class="inp n" value="${esc(b.name||'')}" placeholder="e.g. Rent" aria-label="Bill name"><button type="button" class="rm" aria-label="Remove">${ICONS.x}</button>
    <select class="inp" aria-label="Category">${expCats().map(c=>`<option ${c.name===b.category?'selected':''}>${esc(c.name)}</option>`).join('')}</select>
    <input class="inp" inputmode="decimal" value="${b.amount?num(b.amount):''}" placeholder="Amount" aria-label="Amount"><input class="inp" inputmode="numeric" value="${esc(b.dueDay||'')}" placeholder="Day" aria-label="Due day of month"></div>`;
  openSheet('Monthly bills', `
    <p class="hint" style="margin:0">Name · category · usual amount · day of the month it’s due.</p>
    <div class="list-edit" id="bl">${(cfg().bills||[]).map(row).join('')}</div>
    <button type="button" class="btn ghost" id="bAdd">Add bill</button>
    <button type="submit" class="btn">Save bills</button>`, f => {
    const bl = $('#bl',f);
    bl.addEventListener('click', e => { if (e.target.closest('.rm')) e.target.closest('.le').remove(); });
    bl.addEventListener('input', e => { if (e.target.inputMode==='decimal') fmtInput(e.target); });
    $('#bAdd',f).addEventListener('click', () => { bl.insertAdjacentHTML('beforeend', row()); bl.lastElementChild.querySelector('input').focus(); });
    if (!(cfg().bills||[]).length) $('#bAdd',f).click();
    f.addEventListener('submit', e => {
      e.preventDefault();
      cfg().bills = $$('.le',bl).map(r => { const [n,a,d] = $$('input',r); return { id:r.dataset.id||uid(), name:n.value.trim(), category:$('select',r).value, amount:parseAmt(a.value)||0, dueDay:Math.min(31,Math.max(1,parseInt(d.value)||1)) }; }).filter(b=>b.name);
      saveCfg(); sheet.close(); render(); toast('Bills saved');
    });
  });
}
function payBill(id){
  const b = (cfg().bills||[]).find(x=>x.id===id); if (!b) return;
  const k = state.tab==='plan' ? state.month : THIS_MONTH;
  openTx({ type:'expense', amount:+b.amount||0, category:b.category, note:b.name, date: k===THIS_MONTH ? TODAY : `${k}-${pad(Math.min(+b.dueDay||1, daysIn(k)))}` }, { billId:b.id, title:`Pay ${b.name}` });
}

/* ---- settings ---- */
function openSettings(){
  const one = (v='') => `<div class="le one"><input class="inp" value="${esc(v)}" aria-label="Name"><button type="button" class="rm" aria-label="Remove">${ICONS.x}</button></div>`;
  openSheet('Settings', `
    <div class="two"><label class="f">Currency <input id="sCur" maxlength="5" value="${esc(cur())}"></label><label class="f">Savings target (%) <input id="sTgt" inputmode="numeric" value="${esc(cfg().savingsTarget ?? 20)}"></label></div>
    <p class="hint">Your target is the share of income you aim to keep each month. 20% is a solid start; 30%+ builds wealth fast.</p>
    <hr>
    <div class="fl"><span>Spending categories</span><div class="list-edit" id="sExp">${expCats().map(c=>one(c.name)).join('')}</div><button type="button" class="btn ghost" data-add="#sExp">Add category</button></div>
    <div class="fl"><span>Income sources</span><div class="list-edit" id="sInc">${incCats().map(one).join('')}</div><button type="button" class="btn ghost" data-add="#sInc">Add source</button></div>
    <hr>
    <div class="fl"><span>Hidden accounts</span>${accounts(true).filter(a=>a.archived).map(a=>`<button type="button" class="chip" data-unhide="${a.id}">${esc(a.name)} · restore</button>`).join(' ') || '<span class="muted" style="font-size:.9rem">None</span>'}</div>
    <div class="two"><button type="button" class="btn ghost" id="exp">Download CSV</button><button type="button" class="btn ghost" id="imp">Import CSV</button></div>
    <input type="file" id="impFile" accept=".csv,text/csv" hidden>
    <button type="submit" class="btn">Save settings</button>
    <div class="acts" style="align-items:center"><span class="muted" style="flex:1;font-size:.88rem">${esc(state.user?.email||'')}</span><button type="button" class="btn ghost small" id="out" style="width:auto">Sign out</button></div>`, f => {
    f.addEventListener('click', e => {
      if (e.target.closest('.rm')) e.target.closest('.le').remove();
      const add = e.target.closest('[data-add]'); if (add){ $(add.dataset.add,f).insertAdjacentHTML('beforeend', one()); $(add.dataset.add,f).lastElementChild.querySelector('input').focus(); }
      const un = e.target.closest('[data-unhide]'); if (un){ acct(un.dataset.unhide).archived=false; saveCfg(); un.remove(); toast('Account restored'); render(); }
    });
    $('#out',f).addEventListener('click', () => { if (confirm('Sign out on this device?')){ sheet.close(); signOut(auth); } });
    $('#exp',f).addEventListener('click', exportCSV);
    $('#imp',f).addEventListener('click', () => $('#impFile',f).click());
    $('#impFile',f).addEventListener('change', importCSV);
    f.addEventListener('submit', e => {
      e.preventDefault();
      const names = sel => $$(sel+' input',f).map(i=>i.value.trim()).filter(Boolean);
      const exp = names('#sExp'), inc = names('#sInc');
      const old = Object.fromEntries(expCats().map(c=>[c.name,c.budget]));
      cfg().categories = { expense: exp.map(n=>({name:n, budget: old[n]||0})), income: inc };
      cfg().currency = $('#sCur',f).value.trim() || 'TZS';
      cfg().savingsTarget = Math.max(0, Math.min(90, parseInt($('#sTgt',f).value)||20));
      saveCfg(); sheet.close(); render(); toast('Settings saved');
    });
  });
}

/* ---- CSV ---- */
function exportCSV(){
  const all = allEntries().sort((a,b)=>a.date.localeCompare(b.date));
  if (!all.length) return toast('Nothing to download yet.');
  const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const T = {expense:'Expense',income:'Income',transfer:'Transfer',adjust:'Adjustment'};
  const csv = ['Date,Type,Account,To account,Category,Note,Amount,Fee', ...all.map(e=>[e.date,T[e.type],q(acctName(e.accountId)),q(e.toAccountId?acctName(e.toAccountId):''),q(e.type==='adjust'?ADJ_CAT:e.category||''),q(e.note),e.amount,e.fee||''].join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = `money-${TODAY}.csv`; document.body.appendChild(a); a.click(); a.remove();
}
function parseCSV(t){ const rows=[]; let r=[],f='',q=false; for(let i=0;i<t.length;i++){ const c=t[i]; if(q){ if(c==='"'){ if(t[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; } else if(c==='"') q=true; else if(c===','){r.push(f);f='';} else if(c==='\n'||c==='\r'){ if(c==='\r'&&t[i+1]==='\n')i++; r.push(f); rows.push(r); r=[]; f=''; } else f+=c; } if(f||r.length){r.push(f);rows.push(r);} return rows.filter(x=>x.some(y=>y.trim())); }
async function importCSV(e){
  const file = e.target.files[0]; e.target.value=''; if (!file) return;
  const rows = parseCSV(await file.text()); if (rows.length<2) return toast('That file has no rows.');
  const h = rows[0].map(x=>x.trim().toLowerCase()), col = n => h.findIndex(x=>x.startsWith(n));
  const c = { date:col('date'), type:col('type'), acct:col('account'), to:col('to account'), cat:col('category'), note:col('note'), amt:h.findIndex(x=>x.startsWith('amount')), fee:col('fee') };
  if (c.date<0 || c.amt<0) return toast('The file needs Date and Amount columns.');
  const byName = n => accounts(true).find(a=>a.name.toLowerCase()===String(n||'').trim().toLowerCase())?.id || '';
  const key = x => [x.date,x.type,x.amount,x.category||'',x.note||''].join('|'); const seen = new Set(allEntries().map(key));
  const touched = new Set(); let n=0, skip=0;
  rows.slice(1).forEach(r => {
    const t=(r[c.type]||'expense').toLowerCase(); const type = t.startsWith('inc')?'income':t.startsWith('tra')?'transfer':t.startsWith('adj')?'adjust':'expense';
    const date=(r[c.date]||'').trim(), amount=parseAmt(r[c.amt]); if (!isoValid(date) || !amount){ skip++; return; }
    const rec = { id:uid(), type, date, amount: type==='adjust'?amount:Math.abs(amount), accountId: byName(c.acct>=0?r[c.acct]:'') || lastAccount(type), note: c.note>=0?r[c.note].trim():'', createdAt:Date.now() };
    if (type==='transfer'){ rec.toAccountId = byName(r[c.to]); if (!rec.toAccountId){ skip++; return; } const fee=parseAmt(r[c.fee]); if (fee>0) rec.fee=fee; }
    else if (type!=='adjust') rec.category = (c.cat>=0 && r[c.cat].trim()) || 'Other';
    if (seen.has(key(rec))){ skip++; return; } seen.add(key(rec));
    const k = date.slice(0,7); state.ledger[k] = [...entries(k), rec]; touched.add(k); n++;
  });
  touched.forEach(saveMonth); render(); toast(`Imported ${n}${skip?`, skipped ${skip}`:''}.`);
}

/* ================= events ================= */
$$('.tabbar [data-tab]').forEach(b => b.addEventListener('click', () => { state.tab = b.dataset.tab; if (b.dataset.tab!=='activity') state.q=''; render(); scrollTo(0,0); }));
$('#fab').addEventListener('click', () => openTx());
$('#view').addEventListener('click', e => {
  const t = e.target;
  const m = t.closest('[data-m]'); if (m){ const n = shiftMonth(state.month, +m.dataset.m); if (n<=THIS_MONTH){ state.month = n; render(); } return; }
  const g = t.closest('[data-goto]'); if (g){ state.tab = g.dataset.goto; state.month = THIS_MONTH; render(); scrollTo(0,0); return; }
  const a = t.closest('[data-acct]'); if (a) return openAccount(a.dataset.acct);
  const tx = t.closest('[data-tx]'); if (tx){ const e2 = entries(tx.dataset.k).find(x=>x.id===tx.dataset.tx); if (e2) openTx(clone(e2)); return; }
  const p = t.closest('[data-pay]'); if (p) return payBill(p.dataset.pay);
  const gl = t.closest('[data-goal]'); if (gl) return openGoal(gl.dataset.goal);
  const ft = t.closest('[data-ft]'); if (ft){ state.fType = ft.dataset.ft; render(); return; }
  if (t.closest('#openSettings')) return openSettings();
  if (t.closest('#addAcct')) return openAccountEdit();
  if (t.closest('#addGoal')) return openGoal();
  if (t.closest('#editBudgets')) return openBudgets();
  if (t.closest('#editBills')) return openBills();
});
$('#view').addEventListener('change', e => { if (e.target.id==='fAcct'){ state.fAcct = e.target.value; render(); } });
let qT; $('#view').addEventListener('input', e => { if (e.target.id==='q'){ clearTimeout(qT); const v=e.target.value; qT=setTimeout(()=>{ state.q=v.trim(); render(); const s=$('#q'); s.focus(); s.setSelectionRange(s.value.length,s.value.length); }, 250); } });
