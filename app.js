import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
         signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
         doc, collection, onSnapshot, setDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = s => document.querySelector(s);
const show = id => ['setup','auth','app'].forEach(x => $('#'+x).hidden = x !== id);

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(()=>{}));

/* ---------- constants & helpers ---------- */
const DEFAULT_METHODS = ["Cash","M-Pesa","Mixx by Yas","Airtel Money","Bank","Card"];
const DEFAULTS = {
  currency:'TZS',
  expenseCategories:["Rent","Water bill","Electricity bill","School fees","Furniture","Interior decor","Home items","Car maintenance","Transport","Meals","Food"].map(n=>({name:n,budget:0})),
  incomeSources:["Salary","Business","Other"], methods:DEFAULT_METHODS, bills:[], goals:[]
};
const pad = n => String(n).padStart(2,'0');
const now = new Date();
const todayISO = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
const thisMonth = todayISO.slice(0,7);

const state = { user:null, settings:null, months:{}, cur:thisMonth, filter:'all', q:'', editing:null, draft:{}, type:'expense', unsubs:[] };

const S = () => state.settings;
const cur = () => (S() && S().currency) || 'TZS';
const num = n => Math.round(n).toLocaleString('en-US');
const money = n => (n < 0 ? '−' : '') + cur() + ' ' + num(Math.abs(n));
const short = n => { const a=Math.abs(n); return a>=1e6 ? (n/1e6).toFixed(a>=1e7?0:1).replace(/\.0$/,'')+'M' : a>=1e3 ? Math.round(n/1e3)+'k' : String(Math.round(n)); };
const parseAmt = s => { const v = parseFloat(String(s).replace(/[^0-9.]/g,'')); return isFinite(v) ? v : NaN; };
const monthLabel = (k, opts={month:'long',year:'numeric'}) => { const [y,m]=k.split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString('en-GB',opts); };
const shiftMonth = (k, d) => { const [y,m]=k.split('-').map(Number); const dt=new Date(y,m-1+d,1); return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}`; };
const daysIn = k => { const [y,m]=k.split('-').map(Number); return new Date(y,m,0).getDate(); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT; const toast = msg => { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2800); };
const entries = k => state.months[k] || [];
const allEntries = () => Object.values(state.months).flat();
const sum = (list, type) => list.filter(e=>e.type===type).reduce((a,e)=>a+(+e.amount||0),0);
const methods = () => (S().methods && S().methods.length) ? S().methods : DEFAULT_METHODS;
const bills = () => S().bills || [];
const goals = () => S().goals || [];
const isoValid = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d));

/* ---------- Firebase ---------- */
if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('PASTE')) {
  show('setup');
  throw new Error('Firebase config missing — see README.md');
}
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const userDoc = (...p) => doc(db, 'users', state.user.uid, ...p);

function writeErr(e){ console.error(e); toast(e && e.code === 'permission-denied' ? 'Not allowed to save. Check your Firestore rules.' : 'Couldn’t save. It will retry when you’re back online.'); }
function persistMonth(k){ setDoc(userDoc('months', k), { entries: entries(k), updatedAt: new Date().toISOString() }).catch(writeErr); }
function persistSettings(){ setDoc(userDoc('config','settings'), clone(state.settings)).catch(writeErr); }

function startData(){
  let gotSettings = false;
  state.unsubs.push(onSnapshot(userDoc('config','settings'), { includeMetadataChanges:true }, s => {
    if (s.exists()) state.settings = clone(s.data());
    else if (!s.metadata.fromCache) { state.settings = clone(DEFAULTS); persistSettings(); }
    else if (!state.settings) state.settings = clone(DEFAULTS);
    gotSettings = true; render();
  }, e => { console.error(e); toast('Couldn’t load your settings.'); }));
  state.unsubs.push(onSnapshot(collection(db, 'users', state.user.uid, 'months'), { includeMetadataChanges:true }, snap => {
    const m = {}; snap.docs.forEach(d => { m[d.id] = clone((d.data()||{}).entries || []); });
    state.months = m;
    $('#offlineTag').hidden = !snap.metadata.fromCache || navigator.onLine;
    if (gotSettings) render();
  }, e => { console.error(e); toast('Couldn’t load your entries.'); }));
}
function stopData(){ state.unsubs.forEach(u => u()); state.unsubs = []; state.settings = null; state.months = {}; }
addEventListener('online', () => $('#offlineTag').hidden = true);
addEventListener('offline', () => $('#offlineTag').hidden = false);

onAuthStateChanged(auth, user => {
  stopData();
  state.user = user;
  if (user){ show('app'); $('#whoEmail').textContent = user.email || 'Signed in'; render(); startData(); }
  else show('auth');
});
getRedirectResult(auth).catch(e => authError(e));

/* ---------- auth UI ---------- */
function authError(e){
  const map = {
    'auth/invalid-credential':'Email or password is wrong.', 'auth/wrong-password':'Email or password is wrong.',
    'auth/user-not-found':'No account with that email. Tap “Create account”.', 'auth/email-already-in-use':'That email already has an account. Sign in instead.',
    'auth/weak-password':'Use a password of at least 6 characters.', 'auth/invalid-email':'Enter a valid email address.',
    'auth/popup-closed-by-user':'', 'auth/cancelled-popup-request':'', 'auth/network-request-failed':'No connection. Check your internet and try again.',
    'auth/unauthorized-domain':'This web address isn’t allowed yet. Add it under Authentication → Settings → Authorized domains in Firebase.',
    'auth/operation-not-allowed':'This sign-in method is off. Turn it on in Firebase → Authentication → Sign-in method.'
  };
  const msg = e && (e.code in map ? map[e.code] : (e.message || 'Sign-in failed.'));
  if (!msg) return;
  $('#aErr').textContent = msg; $('#aErr').hidden = false;
}
const creds = () => { $('#aErr').hidden = true; return [$('#aEmail').value.trim(), $('#aPass').value]; };
$('#authForm').addEventListener('submit', e => { e.preventDefault(); const [em,pw]=creds(); signInWithEmailAndPassword(auth, em, pw).catch(authError); });
$('#signUpBtn').addEventListener('click', () => { const [em,pw]=creds(); createUserWithEmailAndPassword(auth, em, pw).catch(authError); });
$('#resetBtn').addEventListener('click', () => {
  const em = $('#aEmail').value.trim();
  if (!em){ $('#aErr').textContent = 'Type your email above first.'; $('#aErr').hidden = false; return; }
  sendPasswordResetEmail(auth, em).then(()=>toast('Reset link sent. Check your email.')).catch(authError);
});
$('#googleBtn').addEventListener('click', async () => {
  $('#aErr').hidden = true;
  const provider = new GoogleAuthProvider();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  try { if (standalone) await signInWithRedirect(auth, provider); else await signInWithPopup(auth, provider); }
  catch(e){ if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') signInWithRedirect(auth, provider).catch(authError); else authError(e); }
});
$('#signOutBtn').addEventListener('click', () => { if (confirm('Sign out on this device?')) { $('#setDlg').close(); signOut(auth); } });

/* ---------- month maths ---------- */
function billStatus(k){
  const list = entries(k);
  return bills().map(b => {
    const paidEntry = list.find(e => e.billId === b.id);
    const due = Math.min(+b.dueDay || 1, daysIn(k));
    const late = !paidEntry && k === thisMonth && due < now.getDate();
    return { ...b, paid: !!paidEntry, paidAmount: paidEntry ? +paidEntry.amount : 0, due, late };
  }).sort((a,b) => (a.paid-b.paid) || (a.due-b.due));
}
const goalSaved = g => (+g.start||0) + allEntries().filter(e=>e.type==='saving' && e.goalId===g.id).reduce((a,e)=>a+(+e.amount||0),0);
function goalPace(g){
  let t=0; for (let i=0;i<3;i++){ const k=shiftMonth(thisMonth,-i); t += entries(k).filter(e=>e.type==='saving'&&e.goalId===g.id).reduce((a,e)=>a+(+e.amount||0),0); }
  return t/3;
}

/* ---------- rendering ---------- */
function render(){
  const k = state.cur;
  $('#monthLabel').textContent = monthLabel(k);
  $('#todayBtn').hidden = k === thisMonth;
  if (!S()){ $('#heroBig').textContent='Loading…'; return; }

  const list = entries(k);
  const inc = sum(list,'income'), exp = sum(list,'expense'), sav = sum(list,'saving');
  const left = inc - exp - sav;
  const bs = billStatus(k);
  const unpaid = k >= thisMonth ? bs.filter(b=>!b.paid).reduce((a,b)=>a+(+b.amount||0),0) : 0;
  const safe = left - unpaid, isPast = k < thisMonth;

  const big = $('#heroBig'), shown = isPast ? left : safe;
  big.innerHTML = `<span class="cur">${esc(cur())}</span>${shown<0?'−':''}${num(Math.abs(shown))}`;
  big.classList.toggle('neg', shown<0);
  $('#heroLabel').textContent = isPast ? (left<0 ? 'Overspent that month' : 'Left over that month') : (safe<0 ? 'Short this month' : 'Safe to spend');
  const nUnpaid = bs.filter(b=>!b.paid).length;
  $('#heroSub').textContent = isPast ? `${money(exp)} spent, ${money(sav)} saved.`
    : inc===0 ? 'Add this month’s income to see what’s safe to spend.'
    : nUnpaid ? `After setting aside ${money(unpaid)} for ${nUnpaid} bill${nUnpaid>1?'s':''} still due.`
    : bills().length ? 'All bills paid this month.' : 'Income minus spending and savings.';

  const total = Math.max(inc, exp+sav+unpaid, 1), free = Math.max(0, inc-exp-sav-unpaid);
  const seg = (cls,v) => v>0 ? `<i class="${cls}" style="flex-basis:${v/total*100}%"></i>` : '';
  $('#flow').innerHTML = seg('s-exp',exp)+seg('s-sav',sav)+seg('s-bill',unpaid)+seg('s-free',free);
  const lg = (c,l,v) => `<span><span class="dot" style="background:var(${c})"></span>${l} <b>${esc(short(v))}</b></span>`;
  $('#legend').innerHTML = lg('--expense','Spent',exp) + lg('--save','Saved',sav) + (unpaid?lg('--warn','Bills due',unpaid):'') + lg('--income','Free',free);

  $('#stIncome').textContent = money(inc);
  $('#stSaved').textContent = money(sav);
  if (k === thisMonth){
    const daysLeft = daysIn(k) - now.getDate() + 1;
    $('#stDailyLabel').textContent = `Safe per day · ${daysLeft} day${daysLeft>1?'s':''} left`;
    $('#stDaily').textContent = money(Math.max(0, safe)/daysLeft);
  } else { $('#stDailyLabel').textContent = 'Entries'; $('#stDaily').textContent = String(list.length); }
  let overall = 0; for (const [mk, l] of Object.entries(state.months)) if (mk <= k) overall += sum(l,'income') - sum(l,'expense') - sum(l,'saving');
  $('#stOverall').textContent = money(overall);

  renderBills(bs, k); renderTx(list); renderGoals(); renderCats(list); renderChart();
}

function renderBills(bs, k){
  const box = $('#bills');
  if (!bills().length){
    $('#billsSum').textContent = '';
    box.innerHTML = `<p class="empty-note">Add rent, school fees, water and other regular bills once, and tick them off each month.<br><button class="btn ghost" data-open-settings>Set up bills</button></p>`;
    return;
  }
  $('#billsSum').textContent = `${bs.filter(b=>b.paid).length} of ${bs.length} paid`;
  const mon = esc(monthLabel(k,{month:'short'}));
  box.innerHTML = bs.map(b => {
    const dueTxt = b.paid ? `Paid ${esc(money(b.paidAmount))}` : b.late ? `Overdue · was due ${b.due} ${mon}` : `Due ${b.due} ${mon}`;
    return `<div class="bill ${b.paid?'paid':''}">
      <span class="tick">${b.paid?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg>':''}</span>
      <span class="what"><b>${esc(b.name)}</b><small class="${b.late?'late':''}">${dueTxt}</small></span>
      ${b.paid ? '' : `<span class="amt">${esc(num(b.amount))}</span><button class="small-btn" data-pay="${esc(b.id)}">Mark paid</button>`}
    </div>`;
  }).join('');
}

function txHTML(items, showYear){
  const groups = {};
  items.forEach(e => (groups[e.date] ||= []).push(e));
  return Object.entries(groups).map(([d, its]) => {
    const [y,m,dd] = d.split('-').map(Number);
    const lbl = new Date(y,m-1,dd).toLocaleDateString('en-GB', showYear ? {day:'numeric',month:'short',year:'numeric'} : {weekday:'short',day:'numeric',month:'short'});
    return `<div class="day"><h3>${d===todayISO?'Today':esc(lbl)}</h3>` + its.map(e => {
      const sign = e.type==='income' ? '+' : e.type==='saving' ? '→' : '−';
      const sub = [e.note, e.method].filter(Boolean).join(' · ');
      return `<button class="tx ${e.type}" data-id="${esc(e.id)}" data-k="${esc(e.date.slice(0,7))}">
        <span class="mark"></span>
        <span class="what"><b>${esc(e.category||'Other')}</b>${sub?`<small>${esc(sub)}</small>`:''}</span>
        <span class="amt">${sign}${esc(num(e.amount))}</span>
      </button>`; }).join('') + `</div>`;
  }).join('');
}
function renderTx(list){
  const box = $('#txList');
  const byFilter = e => state.filter==='all' || e.type===state.filter;
  const sorter = (a,b)=> b.date.localeCompare(a.date) || (b.createdAt||0)-(a.createdAt||0);
  if (state.q){
    const q = state.q.toLowerCase();
    const hits = allEntries().filter(byFilter).filter(e => [e.category,e.note,e.method,String(e.amount)].join(' ').toLowerCase().includes(q)).sort(sorter);
    const net = hits.reduce((a,e)=>a+(e.type==='income'?1:-1)*(+e.amount||0),0);
    box.innerHTML = hits.length ? `<p class="empty-note" style="padding-top:0">${hits.length} match${hits.length>1?'es':''} · net ${esc(money(net))}</p>` + txHTML(hits.slice(0,200), true)
      : `<p class="empty-note">Nothing matches “${esc(state.q)}”.</p>`;
    return;
  }
  const shown = list.filter(byFilter).sort(sorter);
  if (!shown.length){
    const what = {income:'income',expense:'spending',saving:'savings'}[state.filter] || 'entries';
    box.innerHTML = `<p class="empty-note">No ${what} in ${esc(monthLabel(state.cur,{month:'long'}))} yet.</p>`;
    return;
  }
  box.innerHTML = txHTML(shown, false);
}

function renderGoals(){
  const box = $('#goals');
  if (!goals().length){ box.innerHTML = `<p class="empty-note">Saving for something — an emergency fund, a plot, next year’s school fees? Add a goal and watch it fill up.<br><button class="btn ghost" data-open-settings>Add a goal</button></p>`; return; }
  box.innerHTML = goals().map(g => {
    const saved = goalSaved(g), target = +g.target||0, p = target ? saved/target : 0, rest = Math.max(0,target-saved), pace = goalPace(g);
    const months = pace>0 ? Math.ceil(rest/pace) : 0;
    const eta = p>=1 ? 'Goal reached 🎉' : pace>0 ? `At your pace, about ${months} month${months>1?'s':''} to go` : `${money(rest)} to go`;
    return `<div class="cat"><div class="cat-row"><b>${esc(g.name)}</b><span>${esc(short(saved))} of ${esc(short(target))}</span></div>
      <div class="meter" role="progressbar" aria-label="${esc(g.name)} progress" aria-valuenow="${Math.round(Math.min(1,p)*100)}" aria-valuemin="0" aria-valuemax="100"><i class="goal" style="width:${Math.min(100,p*100)}%"></i></div>
      <div class="goal-foot"><span>${esc(eta)}</span><button class="small-btn" data-save-goal="${esc(g.id)}">Add savings</button></div></div>`;
  }).join('');
}

function renderCats(list){
  const spentBy = {};
  list.filter(e=>e.type==='expense').forEach(e => spentBy[e.category||'Other'] = (spentBy[e.category||'Other']||0) + (+e.amount||0));
  const cats = (S().expenseCategories||[]).map(c=>({name:c.name, budget:+c.budget||0}));
  Object.keys(spentBy).forEach(n => { if (!cats.some(c=>c.name===n)) cats.push({name:n,budget:0}); });
  const rows = cats.filter(c => c.budget>0 || spentBy[c.name]);
  if (!rows.length){ $('#cats').innerHTML = `<p class="empty-note">Nothing spent yet this month. Set monthly budgets in Settings to track each category here.</p>`; return; }
  rows.sort((a,b)=>(spentBy[b.name]||0)-(spentBy[a.name]||0));
  $('#cats').innerHTML = rows.map(c => {
    const s = spentBy[c.name]||0;
    if (!c.budget) return `<div class="cat"><div class="cat-row"><b>${esc(c.name)}</b><span>${esc(money(s))} · no budget</span></div></div>`;
    const p = s/c.budget, cls = p>1?'over':p>.85?'near':'';
    const note = p>1 ? `<span class="over">${esc(money(s-c.budget))} over</span>` : `<span>${esc(short(s))} of ${esc(short(c.budget))}</span>`;
    return `<div class="cat"><div class="cat-row"><b>${esc(c.name)}</b>${note}</div><div class="meter" role="progressbar" aria-label="${esc(c.name)} budget used" aria-valuenow="${Math.round(p*100)}" aria-valuemin="0" aria-valuemax="100"><i class="${cls}" style="width:${Math.min(100,p*100)}%"></i></div></div>`;
  }).join('');
}

function renderChart(){
  const keys = []; for (let i=5;i>=0;i--) keys.push(shiftMonth(state.cur,-i));
  const data = keys.map(k => ({k, inc:sum(entries(k),'income'), exp:sum(entries(k),'expense')}));
  const max = Math.max(1, ...data.flatMap(d=>[d.inc,d.exp]));
  const W=600,H=190,base=160,top=12, slot=W/6, bw=26, h = v => (v/max)*(base-top);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and spending for the last six months"><line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="var(--line)"/>`;
  data.forEach((d,i) => {
    const cx = slot*i + slot/2, sel = d.k===state.cur;
    svg += `<g class="bar" data-month="${d.k}" tabindex="0" role="button" aria-label="${esc(monthLabel(d.k))}: income ${esc(money(d.inc))}, spent ${esc(money(d.exp))}">
      <rect x="${slot*i+4}" y="0" width="${slot-8}" height="${H}" fill="${sel?'var(--track)':'transparent'}" rx="10" opacity="${sel?.6:1}"/>
      <rect x="${cx-bw-2}" y="${base-h(d.inc)}" width="${bw}" height="${h(d.inc)}" rx="4" fill="var(--income)"/>
      <rect x="${cx+2}" y="${base-h(d.exp)}" width="${bw}" height="${h(d.exp)}" rx="4" fill="var(--expense)"/>
      <text x="${cx}" y="${base+20}" text-anchor="middle" class="${sel?'cur':''}">${esc(monthLabel(d.k,{month:'short'}))}</text></g>`;
  });
  $('#chart').innerHTML = svg + '</svg>';
}

/* ---------- entry dialog ---------- */
const dlg = $('#entryDlg');
function catOptions(t){
  if (t==='saving') return goals().map(g=>g.name);
  const o = t==='income' ? [...(S().incomeSources||[])] : (S().expenseCategories||[]).map(c=>c.name);
  if (!o.includes('Other')) o.push('Other');
  return o;
}
function setType(t){
  state.type = t;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t===t)));
  $('#fCatLabel').textContent = t==='income' ? 'Source' : t==='saving' ? 'Goal' : 'Category';
  $('#fMethodLabel').textContent = t==='income' ? 'Received via' : t==='saving' ? 'Moved from' : 'Paid with';
  const opts = catOptions(t), sel = $('#fCat'), prev = sel.value;
  sel.innerHTML = opts.length ? opts.map(o=>`<option>${esc(o)}</option>`).join('') : '<option value="">Add a goal in Settings first</option>';
  if (opts.includes(prev)) sel.value = prev;
}
function openEntry(type, entry, meta={}){
  if (!S()) return;
  state.editing = entry && entry.id ? entry : null;
  state.draft = meta;
  const e = entry || {};
  $('#entryTitle').textContent = state.editing ? 'Edit entry' : meta.title || ({income:'Add income',saving:'Add savings',expense:'Add expense'}[type]);
  setType(e.type || type);
  $('#fMethod').innerHTML = `<option value="">—</option>` + methods().map(m=>`<option>${esc(m)}</option>`).join('');
  if (e.method && ![...$('#fMethod').options].some(o=>o.value===e.method)) $('#fMethod').insertAdjacentHTML('beforeend',`<option>${esc(e.method)}</option>`);
  $('#fMethod').value = e.method || '';
  $('#fAmount').value = e.amount ? num(e.amount) : '';
  $('#fDate').value = e.date || (state.cur===thisMonth ? todayISO : state.cur + '-01');
  if (e.category){ const sel=$('#fCat'); if (![...sel.options].some(o=>o.value===e.category)) sel.insertAdjacentHTML('beforeend',`<option>${esc(e.category)}</option>`); sel.value = e.category; }
  $('#fNote').value = e.note || '';
  $('#fDelete').hidden = !state.editing;
  $('#fErr').hidden = true;
  dlg.showModal();
  setTimeout(()=>$('#fAmount').focus(), 30);
}
$('#fAmount').addEventListener('input', e => {
  const raw = e.target.value.replace(/[^0-9.]/g,''); if (!raw) return;
  const [i,d] = raw.split('.'); e.target.value = Number(i||0).toLocaleString('en-US') + (d!==undefined ? '.'+d.slice(0,2) : '');
});
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setType(b.dataset.t)));
$('#fCancel').addEventListener('click', () => dlg.close());
$('#entryForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseAmt($('#fAmount').value), date = $('#fDate').value, category = $('#fCat').value;
  const err = !(amount>0) ? 'Enter an amount greater than 0.' : !isoValid(date) ? 'Pick a date.' : !category ? 'Add a savings goal in Settings first.' : '';
  if (err){ $('#fErr').textContent = err; $('#fErr').hidden = false; return; }
  const k = date.slice(0,7), prev = state.editing || {};
  const rec = { id: prev.id || uid(), type: state.type, date, category, method: $('#fMethod').value, note: $('#fNote').value.trim(), amount, createdAt: prev.createdAt || Date.now() };
  const billId = prev.billId || state.draft.billId; if (billId && rec.type==='expense') rec.billId = billId;
  if (rec.type==='saving'){ const g = goals().find(g=>g.name===category); if (g) rec.goalId = g.id; }
  if (state.editing){
    const oldK = prev.date.slice(0,7);
    state.months[oldK] = entries(oldK).filter(x => x.id !== rec.id);
    if (oldK !== k) persistMonth(oldK);
  }
  state.months[k] = [...entries(k).filter(x=>x.id!==rec.id), rec];
  persistMonth(k);
  dlg.close();
  if (!state.q && k !== state.cur) state.cur = k;
  render();
  toast(state.editing ? 'Entry updated' : ({income:'Income added',saving:'Savings added',expense:'Expense added'}[rec.type]));
});
$('#fDelete').addEventListener('click', () => {
  const e = state.editing; if (!e || !confirm('Delete this entry?')) return;
  const k = e.date.slice(0,7);
  state.months[k] = entries(k).filter(x=>x.id!==e.id);
  persistMonth(k); dlg.close(); render(); toast('Entry deleted');
});

/* ---------- settings ---------- */
const sdlg = $('#setDlg');
const rmBtn = `<button type="button" class="rm" aria-label="Remove">✕</button>`;
const catRow = (c={name:'',budget:''}) => `<div class="row"><input aria-label="Category name" value="${esc(c.name)}" placeholder="Category"><input aria-label="Monthly budget" inputmode="decimal" value="${c.budget?esc(num(c.budget)):''}" placeholder="0">${rmBtn}</div>`;
const oneRow = (v='', label='Name') => `<div class="row single"><input aria-label="${label}" value="${esc(v)}" placeholder="${label}">${rmBtn}</div>`;
const goalRow = (g={}) => `<div class="row goal" data-id="${esc(g.id||'')}"><input class="name" aria-label="Goal name" value="${esc(g.name||'')}" placeholder="e.g. Emergency fund"><input aria-label="Target amount" inputmode="decimal" value="${g.target?esc(num(g.target)):''}" placeholder="Target"><input aria-label="Already saved" inputmode="decimal" value="${g.start?esc(num(g.start)):''}" placeholder="Saved">${rmBtn}</div>`;
const billRow = (b={}) => {
  const cats = catOptions('expense'), c = b.category || '';
  return `<div class="row bill-row" data-id="${esc(b.id||'')}"><input class="name" aria-label="Bill name" value="${esc(b.name||'')}" placeholder="e.g. Rent">${rmBtn}
    <select aria-label="Category">${cats.map(o=>`<option ${o===c?'selected':''}>${esc(o)}</option>`).join('')}</select>
    <input aria-label="Usual amount" inputmode="decimal" value="${b.amount?esc(num(b.amount)):''}" placeholder="Amount">
    <input aria-label="Due day of month" inputmode="numeric" value="${esc(b.dueDay||'')}" placeholder="Day"></div>`;
};
function openSettings(){
  if (!S()) return;
  $('#sCur').value = cur();
  $('#sCats').innerHTML = (S().expenseCategories||[]).map(catRow).join('');
  $('#sSrc').innerHTML = (S().incomeSources||[]).map(v=>oneRow(v,'Income source')).join('');
  $('#sMeth').innerHTML = methods().map(v=>oneRow(v,'Payment method')).join('');
  $('#sGoals').innerHTML = goals().map(goalRow).join('');
  $('#sBills').innerHTML = bills().map(billRow).join('');
  $('#sErr').hidden = true;
  sdlg.showModal();
}
sdlg.addEventListener('click', e => { if (e.target.classList.contains('rm')) e.target.closest('.row').remove(); });
const addRow = (box, html) => { $(box).insertAdjacentHTML('beforeend', html); $(box).lastElementChild.querySelector('input').focus(); };
$('#sAddCat').addEventListener('click', () => addRow('#sCats', catRow()));
$('#sAddSrc').addEventListener('click', () => addRow('#sSrc', oneRow('','Income source')));
$('#sAddMeth').addEventListener('click', () => addRow('#sMeth', oneRow('','Payment method')));
$('#sAddGoal').addEventListener('click', () => addRow('#sGoals', goalRow()));
$('#sAddBill').addEventListener('click', () => addRow('#sBills', billRow()));
$('#sCancel').addEventListener('click', () => sdlg.close());
$('#setForm').addEventListener('submit', e => {
  e.preventDefault();
  const fail = m => { $('#sErr').textContent = m; $('#sErr').hidden = false; };
  const cats = [...$('#sCats').children].map(r => { const [n,b] = r.querySelectorAll('input'); return {name:n.value.trim(), budget: parseAmt(b.value)||0}; }).filter(c=>c.name);
  const list = box => [...$(box).children].map(r => r.querySelector('input').value.trim()).filter(Boolean);
  const srcs = list('#sSrc'), meths = list('#sMeth');
  const gls = [...$('#sGoals').children].map(r => { const [n,t,s] = r.querySelectorAll('input'); return {id:r.dataset.id||uid(), name:n.value.trim(), target:parseAmt(t.value)||0, start:parseAmt(s.value)||0}; }).filter(g=>g.name);
  const bls = [...$('#sBills').children].map(r => { const [n,a,d] = r.querySelectorAll('input'); return {id:r.dataset.id||uid(), name:n.value.trim(), category:r.querySelector('select').value, amount:parseAmt(a.value)||0, dueDay:Math.min(31,Math.max(1,parseInt(d.value)||1))}; }).filter(b=>b.name);
  const dup = arr => new Set(arr.map(x=>x.toLowerCase())).size !== arr.length;
  if (dup(cats.map(c=>c.name))) return fail('Two categories have the same name. Rename or remove one.');
  if (dup(gls.map(g=>g.name))) return fail('Two goals have the same name. Rename or remove one.');
  if (gls.some(g=>!g.target)) return fail('Give each goal a target amount.');
  state.settings = { currency: $('#sCur').value.trim() || 'TZS', expenseCategories: cats, incomeSources: srcs, methods: meths.length?meths:DEFAULT_METHODS, goals: gls, bills: bls };
  persistSettings(); sdlg.close(); render(); toast('Settings saved');
});

/* ---------- CSV export / import ---------- */
const TN = {income:'Income',expense:'Expense',saving:'Savings'};
$('#exportBtn').addEventListener('click', () => {
  const all = allEntries().sort((a,b)=>a.date.localeCompare(b.date));
  if (!all.length){ toast('No entries to download yet.'); return; }
  const q = v => `"${String(v??'').replace(/"/g,'""')}"`;
  const csv = ['Date,Type,Category,Payment method,Note,Amount (' + cur() + ')', ...all.map(e=>[e.date, TN[e.type], q(e.category), q(e.method), q(e.note), e.amount].join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = `budget-entries-${todayISO}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
});
function parseCSV(text){
  const rows = []; let row = [], f = '', q = false;
  for (let i=0;i<text.length;i++){
    const c = text[i];
    if (q){ if (c==='"'){ if (text[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
    else if (c==='"') q = true;
    else if (c===','){ row.push(f); f=''; }
    else if (c==='\n' || c==='\r'){ if (c==='\r' && text[i+1]==='\n') i++; row.push(f); rows.push(row); row=[]; f=''; }
    else f += c;
  }
  if (f || row.length){ row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const rows = parseCSV(await file.text());
  if (rows.length < 2){ toast('That file has no entries.'); return; }
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = name => head.findIndex(h => h.startsWith(name));
  const ci = { date:col('date'), type:col('type'), cat:col('category'), method:col('payment'), note:col('note'), amount:col('amount') };
  if (ci.date<0 || ci.amount<0){ toast('Needs at least Date and Amount columns.'); return; }
  const key = e => [e.date,e.type,e.category,+e.amount,e.note||''].join('|');
  const seen = new Set(allEntries().map(key));
  const touched = new Set(); let added = 0, skipped = 0;
  rows.slice(1).forEach(r => {
    const t = (r[ci.type]||'expense').trim().toLowerCase();
    const type = t.startsWith('inc') ? 'income' : t.startsWith('sav') ? 'saving' : 'expense';
    const date = (r[ci.date]||'').trim(), amount = parseAmt(r[ci.amount]);
    if (!isoValid(date) || !(amount>0)) { skipped++; return; }
    const rec = { id: uid(), type, date, category: (ci.cat>=0 && r[ci.cat].trim()) || 'Other', method: ci.method>=0 ? r[ci.method].trim() : '', note: ci.note>=0 ? r[ci.note].trim() : '', amount, createdAt: Date.now() };
    if (type==='saving'){ const g = goals().find(g=>g.name===rec.category); if (g) rec.goalId = g.id; }
    if (seen.has(key(rec))) { skipped++; return; }
    seen.add(key(rec));
    const k = date.slice(0,7); state.months[k] = [...entries(k), rec]; touched.add(k); added++;
  });
  touched.forEach(persistMonth);
  render();
  toast(`Imported ${added} entr${added===1?'y':'ies'}${skipped?`, skipped ${skipped} (duplicates or unreadable)`:''}.`);
});

/* ---------- global events ---------- */
$('#prev').addEventListener('click', () => { state.cur = shiftMonth(state.cur,-1); render(); });
$('#next').addEventListener('click', () => { state.cur = shiftMonth(state.cur,1); render(); });
$('#todayBtn').addEventListener('click', () => { state.cur = thisMonth; render(); });
$('#settingsBtn').addEventListener('click', openSettings);
$('#addExp').addEventListener('click', () => openEntry('expense'));
$('#addInc').addEventListener('click', () => openEntry('income'));
let st; $('#search').addEventListener('input', e => { clearTimeout(st); st = setTimeout(()=>{ state.q = e.target.value.trim(); render(); }, 150); });
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  state.filter = c.dataset.f; document.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed', String(x===c))); render();
}));
document.body.addEventListener('click', e => {
  if (e.target.closest('[data-open-settings]')) return openSettings();
  const pay = e.target.closest('[data-pay]');
  if (pay){ const b = bills().find(x=>x.id===pay.dataset.pay); if (!b) return;
    const date = state.cur===thisMonth ? todayISO : `${state.cur}-${pad(Math.min(+b.dueDay||1, daysIn(state.cur)))}`;
    return openEntry('expense', {type:'expense', amount:+b.amount||0, category:b.category||'Other', note:b.name, date}, {billId:b.id, title:`Pay ${b.name}`}); }
  const sg = e.target.closest('[data-save-goal]');
  if (sg){ const g = goals().find(x=>x.id===sg.dataset.saveGoal); if (g) return openEntry('saving', {type:'saving', category:g.name}); }
  const t = e.target.closest('.tx');
  if (t){ const found = entries(t.dataset.k).find(x=>x.id===t.dataset.id); if (found) openEntry(found.type, clone(found)); }
});
const chartGo = e => { const g = e.target.closest('.bar'); if (g){ state.cur = g.dataset.month; render(); } };
$('#chart').addEventListener('click', chartGo);
$('#chart').addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){ e.preventDefault(); chartGo(e); } });
