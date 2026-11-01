// أبلكيشن الدكتور: عرض بس، بيقرا من السيرفر اللي بيتزامن مع برنامج العيادة
const FN = 'https://czxtacsibelnrkyzazmj.supabase.co/functions/v1/mobile';
const DEMO = new URLSearchParams(location.search).has('demo');
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString('ar-EG');
const money = (n) => `${num(Math.round(n))} ج.م`;
const iso = (d) => d.toLocaleDateString('en-CA');
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const fmtDate = (s, o = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(`${s}T12:00:00`).toLocaleDateString('ar-EG', o);
const fmtTime = (t) => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`; };
const ampm = (t) => (t && Number(t.split(':')[0]) >= 12 ? 'م' : 'ص');
const initials = (n) => (n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join(' ');
const STATUS = { booked: 'محجوز', waiting: 'منتظر', inside: 'جوه', done: 'خلص', no_show: 'ما حضرش' };
const METHODS = { cash: 'كاش', card: 'فيزا', instapay: 'إنستاباي', vodafone_cash: 'فودافون كاش' };
const T_STATUS = { planned: 'مخطط', in_progress: 'شغالين فيه', done: 'خلص' };

const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};
// أكتر من عيادة: كل عيادة ليها دخول لوحدها، والدكتور بيبدّل بينهم من "حسابي"
const ACC = {
  list: () => { const l = store.get('sessions'); if (Array.isArray(l)) return l; const old = store.get('session'); return old ? [old] : []; },
  save: (l) => { store.set('sessions', l); store.del('session'); },
  // الحساب بيتعرف برقم العيادة ورقم المستخدم (مش بالاسم)، عشان عيادتين أو دكتورين بنفس الاسم ما يتلخبطوش
  key: (x) => { const id = ACC.ids(x); return id ? `${id.c}:${id.u}` : `name:${x.clinic}|${x.name}`; },
  ids: (x) => {
    if (x?.clinic_id && x?.user_id) return { c: x.clinic_id, u: x.user_id };
    try { const p = JSON.parse(atob(x.token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); return p.c && p.u ? { c: p.c, u: p.u } : null; } catch { return null; }
  },
  oldKey: (x) => `${x.clinic}|${x.name}`,
};
// ترقية: الكاش القديم كان متفصّل بالاسم، فبيتمسح كله. البصمة والإشعارات بتتنقل للمفتاح الجديد
if (!store.get('acc_v2')) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('cache:')).forEach((k) => localStorage.removeItem(k));
    for (const x of ACC.list()) for (const p of ['lock:', 'push:', 'notif_seen:']) {
      const v = store.get(p + ACC.oldKey(x));
      if (v != null && store.get(p + ACC.key(x)) == null) store.set(p + ACC.key(x), v);
    }
    for (const x of ACC.list()) for (const p of ['lock:', 'push:', 'notif_seen:']) store.del(p + ACC.oldKey(x));
  } catch {}
  store.set('acc_v2', 1);
}
const S = { session: ACC.list()[store.get('current') || 0] || ACC.list()[0] || null, tab: 'day', date: today(), q: '', patient: null, ptab: 'plan', range: 'day' };
function useSession(sess) {
  const l = ACC.list().filter((x) => ACC.key(x) !== ACC.key(sess)); l.unshift(sess); ACC.save(l); store.set('current', 0);
  S.session = sess; S.patient = null; S.tab = 'day'; SYNC.at = null; SYNC.checked = 0;
}

// القراية بس بتتحفظ على الموبايل، فلو النت قطع بنعرضها ومعاها تاريخها.
// أي تعديل (حجز، جلسة، مريض جديد…) لازم يوصل السيرفر، وإلا بيرجع غلط وما بنعرضش نجاح قديم
const CACHED = new Set(['day', 'search', 'patient', 'money', 'me', 'followups', 'notifications', 'files', 'summary', 'slots', 'meta']);
const cachePrefix = (sess) => `cache2:${ACC.key(sess || {})}:`;
async function api(action, data = {}) {
  if (DEMO) return demo(action, data);
  const cacheable = CACHED.has(action) && S.session;
  const key = cacheable && cachePrefix(S.session) + `${action}:${JSON.stringify(data)}`;
  let r;
  try {
    r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(S.session ? { Authorization: `Bearer ${S.session.token}` } : {}) },
      body: JSON.stringify({ action, ...data }) });
  } catch {
    setOffline(true);
    const cached = cacheable && store.get(key);
    if (cached?.body) { SYNC.cachedAt = cached.at; drawSync(); return { ...cached.body, _cachedAt: cached.at }; }
    throw new Error(cacheable ? 'مفيش اتصال بالنت' : 'مفيش اتصال بالنت، وما اتحفظش حاجة. جرّب تاني لما النت يرجع');
  }
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 && body.error === 'relogin') { logout(); throw new Error('سجّل دخول تاني'); }
  if (!r.ok) throw new Error(body.error || 'حصلت مشكلة');
  setOffline(false);
  if (cacheable) store.set(key, { at: Date.now(), body });
  return body;
}
// خروج من العيادة الحالية بس (لو فيه عيادة تانية بنرجعلها)
function logout() {
  const cur = S.session;
  try { if (cur) Object.keys(localStorage).filter((k) => k.startsWith(cachePrefix(cur))).forEach((k) => localStorage.removeItem(k)); } catch {}
  const rest = ACC.list().filter((x) => !cur || ACC.key(x) !== ACC.key(cur)); ACC.save(rest); store.set('current', 0);
  S.session = rest[0] || null; S.patient = null; S.tab = 'day';
  render();
}

// ---------- الوضع: تلقائي / نهاري / ليلي ----------
const THEMES = { light: 'نهاري', dark: 'ليلي' };
// أول مرة بس بناخد وضع الموبايل، وبعدها اختيار الدكتور
const theme = () => (THEMES[store.get('theme')] ? store.get('theme') : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
const themeIcon = (t) => IC[`th_${t}`];
function applyTheme(t = theme()) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = t === 'light' ? '#f4f8f6' : '#041f19';
}
applyTheme();

// ---------- علامة المزامنة ----------
const SYNC = { at: null, checked: 0, offline: false, cachedAt: null };
function setOffline(v) { if (!v) SYNC.cachedAt = null; if (SYNC.offline !== v) { SYNC.offline = v; drawSync(); } }
function drawSync(busy) {
  const el = $('#syncchip'); if (!el) return;
  let txt = '…', cls = '';
  if (SYNC.offline) { txt = SYNC.cachedAt ? `أوفلاين · نسخة محفوظة من ${new Date(SYNC.cachedAt).toLocaleString('ar-EG')}` : 'أوفلاين'; cls = 'off'; }
  else if (SYNC.at) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(SYNC.at)) / 6e4));
    txt = mins < 2 ? 'متزامن دلوقتي' : mins < 60 ? `من ${num(mins)} د` : mins < 1440 ? `من ${num(Math.round(mins / 60))} س` : `من ${num(Math.round(mins / 1440))} يوم`;
    if (mins > 30) cls = 'old';
  }
  el.className = `iconbtn sync ${cls} ${busy ? 'busy' : ''}`;
  el.innerHTML = `<span class="dot"></span>مزامنة`;
  el.setAttribute('aria-label', txt);
  el.title = SYNC.at ? `${txt} · آخر مزامنة: ${new Date(SYNC.at).toLocaleString('ar-EG')}` : txt;
}
async function refreshSync(force) {
  drawSync(true);
  if (force || Date.now() - SYNC.checked > 60e3) {
    try { SYNC.at = (await api('me')).last_sync; SYNC.checked = Date.now(); } catch {}
  }
  drawSync();
}

// ---------- أيقونات (خطوط رفيعة) ----------
const svg = (d) => `<svg viewBox="0 0 24 24">${d}</svg>`;
const IC = {
  day: svg('<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 3v3M16 3v3"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/>'),
  patients: svg('<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>'),
  money: svg('<path d="M3 17l5.5-5.5 4 4L21 7"/><path d="M15 7h6v6"/>'),
  me: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.2 4-6.5 8-6.5s7.2 2.3 8 6.5"/>'),
  next: svg('<path d="M15 6l-6 6 6 6"/>'), prev: svg('<path d="M9 6l6 6-6 6"/>'),
  back: svg('<path d="M9 6l6 6-6 6"/>'),
  alert: svg('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
  pill: svg('<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.5 8.5l7 7"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  finger: svg('<path d="M12 11v3a6 6 0 0 1-1 3.5M8.5 8.5A4 4 0 0 1 16 11v1.5M6 12v-1a6 6 0 0 1 11.6-2.2M18 14.5a13 13 0 0 1-1 4.5M9 15a10 10 0 0 1-1.5 4M5.5 16.5A10 10 0 0 0 6 13"/>'),
  spark: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>'),
  call: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  sync: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>'),
  th_light: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>'),
  th_dark: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
  chat: svg('<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/>'),
};

// ---------- الدخول ----------
function renderLogin() {
  const last = S.adding ? {} : store.get('last_login') || {};
  // نصحّي السيرفر وهو بيكتب البيانات، عشان أول دخول ما ياخدش وقت
  if (!DEMO) fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"ping"}' }).catch(() => {});
  $('#app').innerHTML = `<div class="login fade">
    <img class="wordmark wm-dark" src="logo-white.svg" alt="Nabdify"><img class="wordmark wm-light" src="logo-dark-text.svg" alt="Nabdify">
    <div class="tag">${S.adding ? 'إضافة عيادة تانية' : 'نبض كل عيادة'}</div>
    <form class="glass" id="lf">
      <label>إيميل العيادة</label><input name="email" type="email" class="ltr" autocomplete="username" value="${esc(last.email || '')}" required>
      <label>اسم المستخدم</label><input name="username" class="ltr" autocapitalize="off" value="${esc(last.username || '')}" required>
      <label>كلمة السر</label><input name="password" type="password" autocomplete="current-password" required>
      <button class="btn" id="lb">دخول</button>
      <div class="err" id="le"></div>
    </form>
    <div class="note">للدكاترة بس، بنفس يوزر وباسورد البرنامج<br>بتفضل داخل 7 أيام (ومع البصمة على طول)</div>
    ${S.adding ? '<button class="btn soft" id="lf-back" style="margin-top:6px">رجوع</button>' : ''}</div>`;
  if ($('#lf-back')) $('#lf-back').onclick = () => { S.adding = false; render(); };
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    $('#lb').disabled = true; $('#lb').textContent = 'بيدخل…'; $('#le').textContent = '';
    try {
      const r = await api('login', f);
      useSession({ token: r.token, name: r.name, clinic: r.clinic, clinic_id: r.clinic_id, user_id: r.user_id, at: Date.now() });
      store.set('last_login', { email: f.email, username: f.username });
      S.adding = false;
      render();
    } catch (err) { $('#le').textContent = err.message; $('#lb').disabled = false; $('#lb').textContent = 'دخول'; }
  };
}

// ---------- الإطار ----------
const TABS = { day: 'النهارده', patients: 'المرضى', money: 'الفلوس', me: 'حسابي' };
function shell(top, main) {
  $('#app').innerHTML = `<header class="top"><div class="brandmark"><img class="wm-dark" src="logo-white.svg" alt="Nabdify"><img class="wm-light" src="logo-dark-text.svg" alt="Nabdify"></div><div class="tools"><button class="iconbtn" id="bellbtn" aria-label="الإشعارات">${IC.bell}<i class="badge" hidden></i></button><button class="iconbtn" id="themebtn"></button><button class="iconbtn sync" id="syncchip" aria-label="تحديث"></button></div>${top}</header>
    <main class="main" id="main">${SYNC.offline ? '<div class="offline">مفيش نت · بتشوف آخر بيانات اتحملت</div>' : ''}${main}</main>
    <nav class="nav">${Object.entries(TABS).map(([k, t]) => `<button data-tab="${k}" class="${S.tab === k && !S.patient ? 'on' : ''}">${IC[k]}${t}</button>`).join('')}</nav>`;
  $$('[data-tab]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; S.patient = null; window.scrollTo(0, 0); render(); }));
  // زرار الوضع: نهاري ↔ ليلي
  const drawTheme = () => { const t = theme(); $('#themebtn').innerHTML = themeIcon(t); $('#themebtn').setAttribute('aria-label', `الوضع: ${THEMES[t]}`); $('#themebtn').title = THEMES[t]; };
  drawTheme();
  $('#themebtn').onclick = () => {
    const t = theme() === 'light' ? 'dark' : 'light';
    store.set('theme', t); applyTheme(t); drawTheme();
    if (S.tab === 'me' && !S.patient) renderMe();
  };
  $('#bellbtn').onclick = notifSheet;
  NOTIF.badge();
  // الضغط على علامة المزامنة = تحديث الشاشة
  $('#syncchip').onclick = () => { refreshSync(true); render(); };
  refreshSync();
}
// تحديث تلقائي كل دقيقة لشاشة النهارده (لما الأبلكيشن قدامك بس)
setInterval(() => { if (S.session && S.tab === 'day' && !S.patient && document.visibilityState === 'visible') { refreshSync(true); renderDay(true); } }, 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.session) { refreshSync(true); NOTIF.checked = 0; render(); } });
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data === 'push' && S.session) { NOTIF.badge(true); if (S.tab === 'day' && !S.patient) renderDay(true); } });
const loading = (n = 4) => Array.from({ length: n }, () => '<div class="skel"></div>').join('');
const failed = (e) => `<div class="empty">${esc(e.message)}<br><br><button class="btn small retry">جرّب تاني</button></div>`;
const flag = (t) => (t ? `<div><span class="flag">${IC.alert}${esc(t.replace(/^⚠\s*/, ''))}</span></div>` : '');

function render() {
  if (!S.session || S.adding) return renderLogin();
  if (LOCK.enabled() && !LOCK.open) return renderLock();
  if (S.patient) return renderPatient();
  ({ day: renderDay, patients: renderPatients, money: renderMoney, me: renderMe })[S.tab]();
}

// ---------- النهارده ----------
// quiet: تحديث في الخلفية من غير ما الشاشة ترمش
async function renderDay(quiet) {
  const h = new Date().getHours();
  const label = S.date === today() ? 'النهارده' : S.date === addDays(today(), 1) ? 'بكرة' : S.date === addDays(today(), -1) ? 'امبارح' : fmtDate(S.date, { weekday: 'long' });
  if (!quiet || !$('#d-prev')) {
    shell(`<div class="eyebrow">${h < 12 ? 'صباح الخير' : 'مساء الخير'}</div><h1>${esc(S.session.name)}</h1>
      <div class="datebar glass"><button id="d-prev" aria-label="اليوم اللي فات">${IC.prev}</button>
        <div class="mid"><small>${label}</small><b>${fmtDate(S.date, { day: 'numeric', month: 'long', year: 'numeric' })}</b>
          <input type="date" id="d-pick" value="${S.date}" aria-label="اختار يوم"></div>
        <button id="d-next" aria-label="اليوم الجاي">${IC.next}</button></div>`, loading());
    $('#d-prev').onclick = () => { S.date = addDays(S.date, -1); renderDay(); };
    $('#d-next').onclick = () => { S.date = addDays(S.date, 1); renderDay(); };
    $('#d-pick').onchange = (e) => { if (e.target.value) { S.date = e.target.value; renderDay(); } };
  }
  try {
    const date = S.date;
    const { items: all } = await api('day', { date });
    if (date !== S.date || S.tab !== 'day' || S.patient) return;
    // لو فيه أكتر من دكتور في اليوم، نقدر نفلتر
    const doctors = [...new Set(all.map((a) => a.doctor).filter(Boolean))];
    if (S.doc && !doctors.includes(S.doc)) S.doc = null;
    const items = S.doc ? all.filter((a) => a.doctor === S.doc) : all;
    const c = (st) => items.filter((a) => a.status === st).length;
    $('#main').innerHTML = `${SYNC.offline ? '<div class="offline">مفيش نت · بتشوف آخر بيانات اتحملت</div>' : ''}
      ${doctors.length > 1 ? `<div class="filters"><button data-doc="" class="${S.doc ? '' : 'on'}">كل الدكاترة</button>${doctors.map((d) => `<button data-doc="${esc(d)}" class="${S.doc === d ? 'on' : ''}">${esc(d)}</button>`).join('')}</div>` : ''}
      <div class="stats"><div class="stat glass hl"><b>${num(items.length)}</b><span>موعد</span></div><div class="stat glass"><b>${num(c('waiting'))}</b><span>منتظر</span></div>
        <div class="stat glass"><b>${num(c('inside'))}</b><span>جوه</span></div><div class="stat glass"><b>${num(c('done'))}</b><span>خلص</span></div></div>
      ${date === today() ? '<div id="summary"></div>' : ''}
      <button class="btn small" id="d-book" style="align-self:flex-start">+ حجز موعد</button>
      ${items.length ? `<div class="timeline">${items.map((a) => `<button class="slot s-${a.status}" data-a="${esc(a.id)}">
        <div class="tm">${fmtTime(a.time)} <span class="muted">${ampm(a.time)}</span><small>${esc(a.chair || '')}</small></div><div class="rail"><i></i></div>
        <div class="box glass"><div class="who"><b>${esc(a.patient)}</b><span>${esc([a.service, doctors.length > 1 && !S.doc ? a.doctor : ''].filter(Boolean).join(' · '))}</span>${flag(a.alert)}</div>
          <span class="st st-${a.status}">${STATUS[a.status] || a.status}</span></div></button>`).join('')}</div>`
        : `<div class="empty">${S.doc ? 'مفيش مواعيد للدكتور ده في اليوم ده' : 'مفيش مواعيد في اليوم ده'}</div>`}`;
    $$('[data-a]').forEach((b) => (b.onclick = () => apptSheet(all.find((a) => a.id === b.dataset.a))));
    $('#d-book').onclick = () => bookSheet({ date: S.date });
    if (!quiet) morningCard();
    $$('[data-doc]').forEach((b) => (b.onclick = () => { S.doc = b.dataset.doc || null; renderDay(true); }));
  } catch (e) { if (!quiet) $('#main').innerHTML = failed(e); }
}

// ---------- المرضى ----------
async function renderPatients() {
  if (S.pview === 'follow') return renderFollowups();
  shell(`<div class="eyebrow">المرضى</div><h1>ملفات المرضى</h1>`,
    `${patientsSeg()}<div class="searchbox">${IC.search}<input id="q" type="search" placeholder="الاسم أو التليفون أو رقم الملف" value="${esc(S.q)}"></div><div id="res"></div>`);
  bindPatientsSeg();
  let t;
  const run = async () => {
    const q = S.q;
    $('#res').innerHTML = loading(5);
    try {
      const { items } = await api('search', { q });
      if (q !== S.q || !$('#res')) return;
      // من غير بحث: آخر المرضى اللي جم
      $('#res').innerHTML = items.length ? `<div class="section fade"><span>${q ? `${num(items.length)} نتيجة` : 'آخر المرضى'}</span></div>
        <div class="list glass fade" style="margin-top:10px">${items.map((p) => `<button class="prow" data-p="${esc(p.id)}">
          <div class="av">${esc(initials(p.name))}</div><div class="who"><b>${esc(p.name)}</b><span class="ltr">${esc(p.phone || '')}</span>${flag(p.alert)}</div>
          <div class="side">#${esc(p.file_no)}${!q && p.last_visit ? `<br>${fmtDate(p.last_visit, { day: 'numeric', month: 'short' })}` : ''}</div></button>`).join('')}</div>`
        : `<div class="empty">${q ? 'مفيش نتايج' : 'لسه مفيش مرضى'}</div>`;
      $$('[data-p]').forEach((b) => (b.onclick = () => openPatient(b.dataset.p)));
    } catch (e) { $('#res').innerHTML = failed(e); }
  };
  $('#q').oninput = (e) => { S.q = e.target.value.trim(); clearTimeout(t); t = setTimeout(run, 300); };
  run();
}

function openPatient(id) { S.patient = id; S.ptab = 'plan'; window.scrollTo(0, 0); render(); }

async function renderPatient() {
  const backBtn = `<button class="back" id="pb">${IC.back}رجوع</button>`;
  shell(`${backBtn}<div class="hero"><div class="av"></div><div><h1>…</h1></div></div>`, loading());
  const bindBack = () => ($('#pb').onclick = () => { S.patient = null; render(); });
  bindBack();
  try {
    const d = await api('patient', { id: S.patient });
    const p = d.patient;
    const upcoming = d.appointments.filter((a) => a.date >= today() && ['booked', 'waiting'].includes(a.status)).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time))[0];
    $('.top').innerHTML = `${backBtn}<div class="hero fade"><div class="av">${esc(initials(p.name))}</div>
      <div><h1>${esc(p.name)}</h1><div class="meta">ملف #${esc(p.file_no)}${p.age ? ` · ${num(p.age)} سنة` : ''}${p.phone ? ` · <span class="ltr">${esc(p.phone)}</span>` : ''}</div></div></div>`;
    bindBack();
    const tabs = { plan: 'الخطة', sessions: 'الجلسات', rx: 'الروشتات', files: 'الأشعات', visits: 'المواعيد' };
    const date = (s) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric' });
    const body = {
      plan: () => (d.treatments.length ? d.treatments.map((t) => `<div class="tr"><div><b>${esc(t.description)}${t.tooth ? ` <span class="muted">· سنة ${esc(t.tooth)}</span>` : ''}</b>
          <div class="prog"><i style="width:${Math.min(100, (100 * (t.done || 0)) / (t.total || 1))}%"></i></div></div>
          <span class="${t.status === 'done' ? 'st st-done' : 'frac'}">${t.status === 'done' ? 'خلص' : `${num(t.done)} / ${num(t.total)}`}</span></div>`).join('')
        : '<div class="empty">مفيش خطة علاج</div>'),
      sessions: () => (d.sessions.length ? d.sessions.map((s) => `<div class="item"><div class="d">${date(s.date)}${s.tooth ? ` · سنة ${esc(s.tooth)}` : ''}</div>
          ${s.diagnosis ? `<div><span class="muted">التشخيص</span> ${esc(s.diagnosis)}</div>` : ''}${s.procedure ? `<div><span class="muted">اللي اتعمل</span> ${esc(s.procedure)}</div>` : ''}
          ${s.next_step ? `<div><span class="muted">الخطوة الجاية</span> ${esc(s.next_step)}</div>` : ''}</div>`).join('') : '<div class="empty">مفيش جلسات متسجلة</div>'),
      rx: () => (d.prescriptions.length ? d.prescriptions.map((r) => `<div class="item"><div class="d">${date(r.date)}</div>
          ${(r.items || []).map((x) => `<div class="rx">${IC.pill}<div><b>${esc(x.name)}</b> <span class="muted">${esc([x.dose, x.frequency, x.duration].filter(Boolean).join(' · '))}</span></div></div>`).join('')}
          ${r.instructions ? `<div class="muted" style="white-space:pre-line;margin-top:4px">${esc(r.instructions)}</div>` : ''}</div>`).join('') : '<div class="empty">مفيش روشتات</div>'),
      files: () => '<div id="files-body"></div>',
      visits: () => (d.appointments.length ? d.appointments.slice(0, 30).map((a) => `<div class="tr"><div><b>${date(a.date)}</b>
          <div class="muted">${fmtTime(a.time)} ${ampm(a.time)}${a.service ? ` · ${esc(a.service)}` : ''}</div></div><span class="st st-${a.status}">${STATUS[a.status] || 'ملغي'}</span></div>`).join('') : '<div class="empty">مفيش مواعيد</div>'),
    };
    const draw = () => {
      // الأرقام المصرية 01xxxxxxxxx بتتحول لـ 201xxxxxxxxx في رابط الواتساب
      const wa = (p.phone || '').replace(/\D/g, '').replace(/^0/, '20');
      $('#main').innerHTML = `
        ${p.phone ? `<div class="actions"><a class="act glass" href="tel:${esc(p.phone)}">${IC.call}اتصال</a>
          <button class="act glass" id="p-wa">${IC.chat}واتساب</button></div>` : ''}
        ${p.alert ? `<div class="alertbox glass fade">${IC.alert}<div><b>تنبيهات طبية</b>${esc(p.alert.replace(/^⚠\s*/, ''))}${p.medications ? `<br>بياخد: ${esc(p.medications)}` : ''}</div></div>` : ''}
        <div class="glass card fade"><div class="tr"><span class="lbl">الموعد الجاي</span><b>${upcoming ? `${fmtDate(upcoming.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${fmtTime(upcoming.time)} ${ampm(upcoming.time)}` : '—'}</b></div>
          <div class="tr"><span class="lbl">عليه</span><b class="${d.balance > 0.001 ? 'owe' : ''}">${d.balance > 0.001 ? money(d.balance) : 'مفيش'}</b></div></div>
        <div class="actions"><button class="act glass" id="p-book">${IC.day}حجز</button><button class="act glass" id="p-sess">${IC.plus}جلسة</button><button class="act glass" id="p-rx">${IC.pill}روشتة</button></div>
        <div class="tabs glass">${Object.entries(tabs).map(([k, v]) => `<button data-pt="${k}" class="${S.ptab === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div class="glass card fade" id="pt-body">${body[S.ptab]()}</div>
        ${p.notes ? `<div class="glass card"><span class="muted">ملاحظات</span><div style="margin-top:4px">${esc(p.notes)}</div></div>` : ''}`;
      $$('[data-pt]').forEach((b) => (b.onclick = () => { S.ptab = b.dataset.pt; draw(); }));
      $('#p-book').onclick = () => bookSheet({ patient: { id: S.patient, name: p.name } });
      if ($('#p-wa')) $('#p-wa').onclick = () => waSheet(p.name, p.phone, upcoming);
      if (S.ptab === 'files') filesBody($('#files-body'), S.patient);
      $('#p-sess').onclick = () => sessionSheet(S.patient, d.treatments.filter((t) => t.status !== 'done'));
      $('#p-rx').onclick = () => rxSheet(S.patient);
    };
    draw();
  } catch (e) { $('#main').innerHTML = failed(e); }
}

// ---------- الفلوس ----------
async function renderMoney() {
  const RANGES = { day: 'النهارده', week: 'الأسبوع', month: 'الشهر' };
  shell(`<div class="eyebrow">الفلوس</div><h1>الإيراد</h1>` + `<button class="btn small soft" id="m-ask" style="margin-top:8px">${IC.spark}اسأل عيادتك</button>`,
    `<div class="seg glass">${Object.entries(RANGES).map(([k, v]) => `<button data-r="${k}" class="${S.range === k ? 'on' : ''}">${v}</button>`).join('')}</div><div id="mm" style="display:contents">${loading(2)}</div>`);
  $$('[data-r]').forEach((b) => (b.onclick = () => { S.range = b.dataset.r; renderMoney(); }));
  $('#m-ask').onclick = askSheet;
  const to = today();
  const from = S.range === 'day' ? to : S.range === 'week' ? addDays(to, -6) : `${to.slice(0, 8)}01`;
  const chartFrom = S.range === 'month' ? from : addDays(to, -6);
  try {
    const range = S.range;
    const d = await api('money', { from: chartFrom < from ? chartFrom : from, to });
    if (range !== S.range || S.tab !== 'money') return;
    const days = []; for (let x = chartFrom; x <= to; x = addDays(x, 1)) days.push(x);
    const inRange = Object.entries(d.by_day).filter(([k]) => k >= from).reduce((s, [, v]) => s + Number(v), 0);
    const spent = Object.entries(d.exp_by_day || {}).filter(([k]) => k >= from).reduce((s, [, v]) => s + Number(v), 0);
    const max = Math.max(1, ...days.map((x) => Number(d.by_day[x] || 0)));
    const methods = range === 'day' ? Object.entries(d.by_method).filter(([, v]) => v > 0).map(([k, v]) => `<span>${METHODS[k] || k} ${num(Math.round(v))}</span>`).join('') : '';
    $('#mm').innerHTML = `
      <div class="glass card fade"><div class="muted">اتحصّل ${RANGES[range]}</div><div class="big">${num(Math.round(inRange))}<small>ج.م</small></div>
        <div class="net"><div><span>المصروفات</span><b>${num(Math.round(spent))}</b></div><div><span>الصافي</span><b style="color:${inRange - spent < 0 ? 'var(--red)' : 'var(--a)'}">${num(Math.round(inRange - spent))}</b></div></div>
        ${methods ? `<div class="chips">${methods}</div>` : ''}
        <div class="chart">${days.map((x) => `<i class="${x === to ? 'today' : ''}" style="height:${(100 * Number(d.by_day[x] || 0)) / max}%"></i>`).join('')}</div>
        <div class="days">${days.map((x) => `<span>${days.length > 10 ? (Number(x.slice(8)) % 5 === 1 ? num(Number(x.slice(8))) : '') : fmtDate(x, { weekday: 'narrow' })}</span>`).join('')}</div></div>
      <div class="section"><span>المديونيات</span><b class="owe">${money(d.debt_total)}</b></div>
      ${d.debtors.length ? `<div class="list glass fade">${d.debtors.map((x) => `<button class="prow" data-p="${esc(x.id)}"><div class="av">${esc(initials(x.name))}</div>
          <div class="who"><b>${esc(x.name)}</b><span>${x.last_pay ? `آخر دفعة ${fmtDate(x.last_pay, { day: 'numeric', month: 'short' })}` : 'ما دفعش لسه'}</span></div>
          <span class="owe">${num(Math.round(x.balance))}</span></button>`).join('')}</div>` : '<div class="empty">مفيش مديونيات</div>'}`;
    $$('[data-p]').forEach((b) => (b.onclick = () => openPatient(b.dataset.p)));
  } catch (e) { $('#mm').innerHTML = failed(e); }
}

// ---------- حسابي ----------
function renderMe() {
  shell(`<div class="eyebrow">حسابي</div><h1>${esc(S.session.name)}</h1>`, `
    <div class="glass card fade"><div class="tr"><span class="lbl">العيادة</span><b>${esc(S.session.clinic)}</b></div>
      <div class="tr"><span class="lbl">آخر مزامنة من العيادة</span><b>${SYNC.at ? new Date(SYNC.at).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'}</b></div></div>
    <div class="section"><span>العيادات</span></div>
    <div class="list glass">${ACC.list().map((x, i) => `<button class="prow" data-acc="${i}"><div class="av">${esc(initials(x.clinic))}</div>
      <div class="who"><b>${esc(x.clinic)}</b><span>${esc(x.name)}</span></div>${ACC.key(x) === ACC.key(S.session) ? `<span class="st st-done">الحالية</span>` : ''}</button>`).join('')}
      <button class="prow" id="acc-add"><div class="av">+</div><div class="who"><b>إضافة عيادة تانية</b><span>لو بتشتغل في أكتر من عيادة</span></div></button></div>
    <div class="section"><span>الأمان والتنبيهات</span></div>
    <div class="glass card">
      ${LOCK.supported() ? `<div class="tr"><span>${IC.finger} القفل بالبصمة أو الوش</span><button class="btn small ${LOCK.enabled() ? 'soft' : ''}" id="t-lock">${LOCK.enabled() ? 'شغال — إيقاف' : 'تشغيل'}</button></div>` : ''}
      ${PUSH.supported() ? `<div class="tr"><span>${IC.bell} إشعارات (مريض وصل، حجز، إلغاء)</span><button class="btn small ${PUSH.on() ? 'soft' : ''}" id="t-push">${PUSH.on() ? 'شغالة — إيقاف' : 'تشغيل'}</button></div>`
        : '<div class="muted">الإشعارات محتاجة تثبّت الأبلكيشن على الشاشة الرئيسية الأول (وعلى الآيفون iOS 16.4 أو أحدث).</div>'}</div>
    <div class="section"><span>الشكل</span></div>
    <div class="seg glass">${Object.entries(THEMES).map(([k, v]) => `<button data-th="${k}" class="${theme() === k ? 'on' : ''}" aria-label="${v}" title="${v}">${themeIcon(k)}</button>`).join('')}</div>
    <div class="glass card note">الأبلكيشن بيعرض آخر بيانات وصلت من برنامج العيادة. لو الكمبيوتر مقفول أو مفيش نت في العيادة، هتشوف آخر تحديث بس.<br>
      لتثبيته: من قايمة المتصفح اختار "إضافة للشاشة الرئيسية".</div>
    <button class="btn ghost" id="lo">تسجيل خروج</button>`);
  // تأكيد بضغطة تانية (نوافذ confirm مش بتشتغل في كل المتصفحات وأبلكيشنات الشاشة الرئيسية)
  $('#lo').onclick = (e) => {
    const b = e.currentTarget;
    if (b.dataset.sure) return logout();
    b.dataset.sure = '1'; b.textContent = 'دوس تاني للتأكيد';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.sure; b.textContent = 'تسجيل خروج'; } }, 4000);
  };
  $$('[data-th]').forEach((b) => (b.onclick = () => { store.set('theme', b.dataset.th); applyTheme(b.dataset.th); renderMe(); }));
  $$('[data-acc]').forEach((b) => (b.onclick = () => { useSession(ACC.list()[+b.dataset.acc]); LOCK.open = false; render(); }));
  $('#acc-add').onclick = () => { S.adding = true; render(); };
  if ($('#t-lock')) $('#t-lock').onclick = async () => {
    try { if (LOCK.enabled()) { LOCK.disable(); toast('القفل اتشال'); } else { await LOCK.enable(); toast('القفل اشتغل — الأبلكيشن هيفتح بالبصمة'); } renderMe(); }
    catch { toast('الموبايل ما وافقش على البصمة', true); }
  };
  if ($('#t-push')) $('#t-push').onclick = async (e) => {
    e.target.disabled = true;
    try { if (PUSH.on()) { await PUSH.disable(); toast('الإشعارات اتقفلت'); } else { await PUSH.enable(); toast('الإشعارات اشتغلت'); } renderMe(); }
    catch (ex) { e.target.disabled = false; toast(ex.message, true); }
  };
}

// ---------- الكتابة من الموبايل (المرحلة التانية) ----------
// شيت من تحت: بيقفل بالضغط برّه أو بزرار ✕
function sheet(title, body) {
  closeSheet();
  const el = document.createElement('div');
  el.className = 'sheet-wrap';
  el.innerHTML = `<div class="sheet glass"><div class="sheet-head"><b>${title}</b><button class="iconbtn" data-x aria-label="إغلاق">${IC.x}</button></div><div class="sheet-body">${body}</div></div>`;
  document.body.appendChild(el);
  el.onclick = (e) => { if (e.target === el || e.target.closest('[data-x]')) closeSheet(); };
  return el;
}
function closeSheet() { $('.sheet-wrap')?.remove(); }
let toastT;
function toast(msg, bad) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = bad ? 'show bad' : 'show';
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), 2600);
}
async function write(op, data) { return api('write', { op, data }); }
// بعد أي تعديل: نحدّث الشاشة اللي قدامنا
const afterWrite = (msg) => { closeSheet(); toast(msg); SYNC.checked = 0; render(); };

// إجراءات الموعد من شاشة النهارده
const NEXT = { booked: ['waiting', 'وصل العيادة'], waiting: ['inside', 'دخل للدكتور'], inside: ['done', 'خلص'] };
function apptSheet(a) {
  const next = NEXT[a.status];
  const el = sheet(`${esc(a.patient)} · ${fmtTime(a.time)} ${ampm(a.time)}`, `
    ${a.alert ? flag(a.alert) : ''}
    <div class="muted" style="margin:6px 0 12px">${esc([a.service, a.chair, a.doctor].filter(Boolean).join(' · '))} · <span class="st st-${a.status}">${STATUS[a.status]}</span></div>
    ${next ? `<button class="btn" data-st="${next[0]}">${next[1]}</button>` : ''}
    <div class="grid2">
      ${a.status === 'booked' ? '<button class="btn soft" data-st="no_show">ما حضرش</button>' : ''}
      ${['booked', 'waiting'].includes(a.status) ? '<button class="btn soft" id="as-move">تأجيل</button>' : ''}
      ${a.status === 'inside' || a.status === 'done' ? '<button class="btn soft" id="as-sess">تسجيل جلسة</button>' : ''}
      <button class="btn soft" id="as-file">ملف المريض</button>
      ${a.phone ? '<button class="btn soft" id="as-wa">واتساب</button>' : ''}
      ${['booked', 'waiting'].includes(a.status) ? '<button class="btn soft danger" data-st="cancelled">إلغاء الموعد</button>' : ''}
    </div>`);
  $$('[data-st]', el).forEach((b) => (b.onclick = async () => {
    if (b.dataset.st === 'cancelled' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'دوس تاني للتأكيد'; return; }
    b.disabled = true;
    try { await write('status', { id: a.id, status: b.dataset.st }); afterWrite(`${a.patient}: ${STATUS[b.dataset.st] || 'اتلغى'}`); }
    catch (e) { b.disabled = false; toast(e.message, true); }
  }));
  if ($('#as-move', el)) $('#as-move', el).onclick = () => bookSheet({ move: a, date: a.date });
  if ($('#as-sess', el)) $('#as-sess', el).onclick = async () => {
    const d = await api('patient', { id: a.patient_id });
    sessionSheet(a.patient_id, d.treatments.filter((t) => t.status !== 'done'), a.id);
  };
  $('#as-file', el).onclick = () => { closeSheet(); openPatient(a.patient_id); };
  if ($('#as-wa', el)) $('#as-wa', el).onclick = () => waSheet(a.patient, a.phone, a);
}

// الحجز والتأجيل: مريض ← خدمة ← يوم ← ساعة فاضية
async function bookSheet({ patient, move, date }) {
  const meta = await api('meta');
  const f = { patient: patient || (move ? { id: move.patient_id, name: move.patient } : null), service: null, date: date || today(),
    doctor: meta.doctors.find((d) => d.me)?.id || null, time: null, chair: null };
  const el = sheet(move ? `تأجيل موعد ${esc(move.patient)}` : 'حجز موعد', `
    <div id="bk-p"></div>
    ${move ? '' : `<label class="lbl2">الخدمة</label><div class="filters wrap" id="bk-s">${meta.services.map((x) => `<button data-s="${x.id}">${esc(x.name)}</button>`).join('')}</div>`}
    ${meta.doctors.length > 1 ? `<label class="lbl2">الدكتور</label><div class="filters wrap" id="bk-d">${meta.doctors.map((x) => `<button data-d="${x.id}" class="${x.id === f.doctor ? 'on' : ''}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    <label class="lbl2">اليوم</label>
    <div class="datebar glass" style="margin:0"><button id="bk-prev">${IC.prev}</button><div class="mid"><b id="bk-date"></b><input type="date" id="bk-pick"></div><button id="bk-next">${IC.next}</button></div>
    <label class="lbl2">الساعة</label><div class="slots" id="bk-slots"></div>
    <input id="bk-notes" placeholder="ملاحظة (اختياري)" style="margin-top:10px">
    <button class="btn" id="bk-go" disabled>${move ? 'تأكيد التأجيل' : 'احجز'}</button>`);
  const drawPatient = () => {
    $('#bk-p', el).innerHTML = f.patient ? `<div class="prow glass" style="border-radius:14px"><div class="av">${esc(initials(f.patient.name))}</div><div class="who"><b>${esc(f.patient.name)}</b></div>
      ${patient || move ? '' : '<button class="btn small soft" id="bk-chg">تغيير</button>'}</div>`
      : `<div class="searchbox">${IC.search}<input id="bk-q" placeholder="اسم المريض أو تليفونه"></div><div id="bk-res" class="list glass" style="margin-top:6px"></div>
        <button class="btn small soft" id="bk-new" style="margin-top:6px">+ مريض جديد</button>`;
    if ($('#bk-chg', el)) $('#bk-chg', el).onclick = () => { f.patient = null; drawPatient(); };
    if ($('#bk-new', el)) $('#bk-new', el).onclick = () => {
      $('#bk-p', el).innerHTML = `<div class="glass rx-row"><input id="np-n" placeholder="اسم المريض"><div class="grid2" style="margin-top:6px">
        <input id="np-p" class="ltr" placeholder="الموبايل" inputmode="tel"><input id="np-a" placeholder="السن" inputmode="numeric"></div>
        <button class="btn small" id="np-go" style="margin-top:8px">تسجيل</button></div>`;
      $('#np-go', el).onclick = async () => {
        try {
          const name = $('#np-n', el).value.trim();
          const r = await api('patient_new', { name, phone: $('#np-p', el).value, age: $('#np-a', el).value });
          f.patient = { id: r.id, name }; drawPatient(); check();
        } catch (e) { toast(e.message, true); }
      };
    };
    if ($('#bk-q', el)) {
      let t;
      $('#bk-q', el).oninput = (e) => { clearTimeout(t); t = setTimeout(async () => {
        const q = e.target.value.trim(); if (!q) return ($('#bk-res', el).innerHTML = '');
        const { items } = await api('search', { q });
        $('#bk-res', el).innerHTML = items.slice(0, 6).map((x) => `<button class="prow" data-pp="${x.id}"><div class="av">${esc(initials(x.name))}</div><div class="who"><b>${esc(x.name)}</b><span class="ltr">${esc(x.phone || '')}</span></div></button>`).join('') || '<div class="empty" style="padding:12px">مفيش نتايج</div>';
        $$('[data-pp]', el).forEach((b) => (b.onclick = () => { f.patient = items.find((x) => x.id === b.dataset.pp); drawPatient(); check(); }));
      }, 300); };
    }
  };
  const check = () => ($('#bk-go', el).disabled = !(f.patient && f.time));
  const loadSlots = async () => {
    $('#bk-date', el).textContent = fmtDate(f.date, { weekday: 'long', day: 'numeric', month: 'long' });
    $('#bk-pick', el).value = f.date;
    $('#bk-slots', el).innerHTML = '<div class="muted">بيحمّل…</div>';
    f.time = null; check();
    const dur = move ? move.duration || 30 : meta.services.find((x) => x.id === f.service)?.duration || 30;
    const r = await api('slots', { date: f.date, duration: dur, doctor_id: f.doctor });
    const free = r.slots.filter((x) => x.free);
    $('#bk-slots', el).innerHTML = r.closed ? `<div class="muted">العيادة مقفولة اليوم ده (${esc(r.reason || 'أجازة')})</div>`
      : free.length ? free.map((x) => `<button data-t="${x.time}" data-c="${x.chair_id}">${fmtTime(x.time)} ${ampm(x.time)}</button>`).join('') : '<div class="muted">مفيش مواعيد فاضية</div>';
    $$('[data-t]', el).forEach((b) => (b.onclick = () => { f.time = b.dataset.t; f.chair = b.dataset.c; $$('[data-t]', el).forEach((x) => x.classList.toggle('on', x === b)); check(); }));
  };
  drawPatient(); loadSlots();
  $$('[data-s]', el).forEach((b) => (b.onclick = () => { f.service = f.service === b.dataset.s ? null : b.dataset.s; $$('[data-s]', el).forEach((x) => x.classList.toggle('on', x.dataset.s === f.service)); loadSlots(); }));
  $$('[data-d]', el).forEach((b) => (b.onclick = () => { f.doctor = b.dataset.d; $$('[data-d]', el).forEach((x) => x.classList.toggle('on', x === b)); loadSlots(); }));
  $('#bk-prev', el).onclick = () => { if (f.date > today()) { f.date = addDays(f.date, -1); loadSlots(); } };
  $('#bk-next', el).onclick = () => { f.date = addDays(f.date, 1); loadSlots(); };
  $('#bk-pick', el).onchange = (e) => { if (e.target.value >= today()) { f.date = e.target.value; loadSlots(); } };
  $('#bk-go', el).onclick = async (e) => {
    e.target.disabled = true;
    try {
      if (move) await write('move', { id: move.id, date: f.date, time: f.time });
      else await write('book', { patient_id: f.patient.id, service_id: f.service, doctor_id: f.doctor, chair_id: f.chair, date: f.date, time: f.time, notes: $('#bk-notes', el).value });
      S.date = f.date;
      afterWrite(`${move ? 'اتأجل' : 'اتحجز'}: ${f.patient.name} — ${fmtDate(f.date, { weekday: 'short', day: 'numeric', month: 'short' })} ${fmtTime(f.time)} ${ampm(f.time)}`);
    } catch (ex) { e.target.disabled = false; toast(ex.message, true); }
  };
}

// تسجيل جلسة بعد الكشف
function sessionSheet(patientId, treatments, appointmentId) {
  const el = sheet('تسجيل جلسة', `
    ${treatments.length ? `<label class="lbl2">العلاج (اختياري)</label><div class="filters wrap" id="ss-t">${treatments.map((t) => `<button data-t="${t.id}">${esc(t.description)}${t.tooth ? ` · ${esc(t.tooth)}` : ''} (${num(t.done)}/${num(t.total)})</button>`).join('')}</div>` : ''}
    <label class="lbl2">الشكوى</label><input id="ss-c">
    <label class="lbl2">التشخيص</label><input id="ss-d">
    <label class="lbl2">اللي اتعمل</label><textarea id="ss-p" rows="2"></textarea>
    <label class="lbl2">الخطوة الجاية</label><input id="ss-n">
    <button class="btn" id="ss-go">حفظ الجلسة</button>`);
  dictateButton($('.sheet-body', el));
  let tid = null;
  $$('[data-t]', el).forEach((b) => (b.onclick = () => { tid = tid === b.dataset.t ? null : b.dataset.t; $$('[data-t]', el).forEach((x) => x.classList.toggle('on', x.dataset.t === tid)); }));
  $('#ss-go', el).onclick = async (e) => {
    const data = { patient_id: patientId, treatment_id: tid, appointment_id: appointmentId || null, complaint: $('#ss-c', el).value, diagnosis: $('#ss-d', el).value, procedure: $('#ss-p', el).value, next_step: $('#ss-n', el).value };
    if (!tid && ![data.complaint, data.diagnosis, data.procedure, data.next_step].some((x) => x.trim())) return toast('اكتب حاجة عن الجلسة أو اختار العلاج', true);
    e.target.disabled = true;
    try { await write('session', data); S.ptab = 'sessions'; afterWrite('اتسجلت الجلسة'); } catch (ex) { e.target.disabled = false; toast(ex.message, true); }
  };
}

// روشتة سريعة (الطباعة من البرنامج على الكمبيوتر)
function rxSheet(patientId) {
  const items = [{}];
  const el = sheet('روشتة', `<div id="rx-items"></div><button class="btn small soft" id="rx-more">+ دوا</button>
    <label class="lbl2">تعليمات</label><textarea id="rx-ins" rows="3"></textarea>
    <div class="muted" style="font-size:12px">الروشتة هتظهر في البرنامج وتتطبع من هناك.</div>
    <button class="btn" id="rx-go">حفظ الروشتة</button>`);
  const read = () => $$('.rx-row', el).forEach((r, i) => ['name', 'dose', 'frequency', 'duration'].forEach((k) => (items[i][k] = $(`[data-k=${k}]`, r).value.trim())));
  const draw = () => {
    $('#rx-items', el).innerHTML = items.map((x, i) => `<div class="rx-row glass">
      <input data-k="name" placeholder="اسم الدوا" value="${esc(x.name || '')}">
      <div class="grid3"><input data-k="dose" placeholder="الجرعة" value="${esc(x.dose || '')}"><input data-k="frequency" placeholder="كل قد إيه" value="${esc(x.frequency || '')}"><input data-k="duration" placeholder="المدة" value="${esc(x.duration || '')}"></div>
      ${items.length > 1 ? `<button class="link" data-rm="${i}">مسح</button>` : ''}</div>`).join('');
    $$('[data-rm]', el).forEach((b) => (b.onclick = () => { read(); items.splice(+b.dataset.rm, 1); draw(); }));
  };
  draw();
  $('#rx-more', el).onclick = () => { read(); items.push({}); draw(); };
  $('#rx-go', el).onclick = async (e) => {
    read();
    e.target.disabled = true;
    try { await write('rx', { patient_id: patientId, items: items.filter((x) => x.name), instructions: $('#rx-ins', el).value }); S.ptab = 'rx'; afterWrite('اتحفظت الروشتة'); }
    catch (ex) { e.target.disabled = false; toast(ex.message, true); }
  };
}

// ---------- المتابعة (جوه شاشة المرضى) ----------
const patientsSeg = () => `<div class="seg glass"><button data-pv="list" class="${S.pview !== 'follow' ? 'on' : ''}">المرضى</button><button data-pv="follow" class="${S.pview === 'follow' ? 'on' : ''}">المتابعة</button></div>`;
const bindPatientsSeg = () => $$('[data-pv]').forEach((b) => (b.onclick = () => { S.pview = b.dataset.pv; render(); }));
async function renderFollowups() {
  shell(`<div class="eyebrow">المرضى</div><h1>المتابعة</h1>`, `${patientsSeg()}<div id="fu">${loading(4)}</div>`);
  bindPatientsSeg();
  try {
    const d = await api('followups');
    if (S.pview !== 'follow' || S.tab !== 'patients') return;
    const row = (x, sub) => `<div class="prow"><button class="who" data-p="${x.patient_id}" style="text-align:right"><b>${esc(x.name)}</b><span>${esc(sub)}</span></button>
      ${x.phone ? `<a class="iconbtn" href="https://wa.me/${(x.phone || '').replace(/\D/g, '').replace(/^0/, '20')}" target="_blank" rel="noopener">${IC.chat}</a>` : ''}
      <button class="iconbtn" data-done="${x.patient_id}" title="اتواصلنا">${IC.check}</button></div>`;
    $('#fu').innerHTML = `
      <div class="section"><span>علاج ما خلصش ومفيش ميعاد جاي</span><b>${num(d.unfinished.length)}</b></div>
      ${d.unfinished.length ? `<div class="list glass">${d.unfinished.map((x) => row(x, x.detail)).join('')}</div>` : '<div class="empty" style="padding:20px">مفيش 👌</div>'}
      <div class="section"><span>ما حضروش (آخر شهرين)</span><b>${num(d.no_shows.length)}</b></div>
      ${d.no_shows.length ? `<div class="list glass">${d.no_shows.map((x) => row(x, `فاته ميعاد ${fmtDate(x.date, { day: 'numeric', month: 'short' })}`)).join('')}</div>` : '<div class="empty" style="padding:20px">مفيش 👌</div>'}
      <div class="muted" style="font-size:12px;text-align:center">✓ "اتواصلنا" بتخفي المريض أسبوعين</div>`;
    $$('[data-p]').forEach((b) => (b.onclick = () => openPatient(b.dataset.p)));
    $$('[data-done]').forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await write('contacted', { patient_id: b.dataset.done }); toast('اتسجل'); renderFollowups(); } catch (e) { b.disabled = false; toast(e.message, true); }
    }));
  } catch (e) { $('#fu').innerHTML = failed(e); }
}

// ---------- القفل بالبصمة أو بالوش ----------
// البصمة بتفتح الأبلكيشن على الموبايل ده، ومع كل فتحة التوكن بيتجدد، فالدكتور ما يكتبش الباسورد تاني
const LOCK = {
  open: false,
  enabled: () => !!store.get(`lock:${ACC.key(S.session)}`),
  supported: () => !!(window.PublicKeyCredential && navigator.credentials),
  rand: (n = 32) => crypto.getRandomValues(new Uint8Array(n)),
  async enable() {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: LOCK.rand(), rp: { name: 'Nabdify' },
      user: { id: LOCK.rand(16), name: S.session.name, displayName: S.session.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
    store.set(`lock:${ACC.key(S.session)}`, btoa(String.fromCharCode(...new Uint8Array(cred.rawId))));
    LOCK.open = true;
  },
  async unlock() {
    const id = Uint8Array.from(atob(store.get(`lock:${ACC.key(S.session)}`)), (c) => c.charCodeAt(0));
    await navigator.credentials.get({ publicKey: { challenge: LOCK.rand(), allowCredentials: [{ type: 'public-key', id }], userVerification: 'required', timeout: 60000 } });
    LOCK.open = true;
    // تجديد التوكن (صالح 7 أيام من دلوقتي)
    try { const r = await api('refresh'); useSession({ ...S.session, token: r.token, at: Date.now() }); } catch {}
  },
  disable: () => { store.del(`lock:${ACC.key(S.session)}`); },
};
function renderLock() {
  $('#app').innerHTML = `<div class="login fade" style="text-align:center">
    <img class="wordmark wm-dark" src="logo-white.svg" alt="Nabdify"><img class="wordmark wm-light" src="logo-dark-text.svg" alt="Nabdify">
    <div class="tag">${esc(S.session.name)} · ${esc(S.session.clinic)}</div>
    <button class="btn" id="lk-go">${IC.finger}افتح بالبصمة</button>
    <div class="err" id="lk-err"></div>
    <button class="btn soft" id="lk-pass">دخول بالباسورد بدل كده</button></div>`;
  const go = async () => {
    try { await LOCK.unlock(); render(); } catch { $('#lk-err').textContent = 'ما اتفتحش — جرب تاني'; }
  };
  $('#lk-go').onclick = go;
  $('#lk-pass').onclick = () => { LOCK.disable(); logout(); };
  go();
}

// ---------- جرس الإشعارات جوه الأبلكيشن ----------
// نفس الإشعارات اللي بتوصل على الموبايل، محفوظة آخر 7 أيام، والجديد عليه علامة
const NOTIF = {
  items: [], checked: 0,
  seenKey: () => `notif_seen:${ACC.key(S.session)}`,
  unread: () => NOTIF.items.filter((n) => n.id > (store.get(NOTIF.seenKey()) || 0)).length,
  async load(force) {
    if (!force && Date.now() - NOTIF.checked < 60e3) return;
    try { NOTIF.items = (await api('notifications')).items || []; NOTIF.checked = Date.now(); } catch {}
  },
  async badge(force) {
    await NOTIF.load(force);
    const b = $('#bellbtn .badge'); if (!b) return;
    const n = NOTIF.unread();
    b.hidden = !n; b.textContent = n > 9 ? '9+' : n || '';
  },
};
async function notifSheet() {
  await NOTIF.load(true);
  const seen = store.get(NOTIF.seenKey()) || 0;
  const ago = (t) => { const m = Math.round((Date.now() - new Date(t)) / 6e4); return m < 1 ? 'دلوقتي' : m < 60 ? `من ${num(m)} د` : m < 1440 ? `من ${num(Math.round(m / 60))} س` : fmtDate(new Date(t).toLocaleDateString('en-CA'), { weekday: 'short', day: 'numeric', month: 'short' }); };
  const el = sheet('الإشعارات', NOTIF.items.length ? `<div class="list glass">${NOTIF.items.map((n) => `<button class="prow notif ${n.id > seen ? 'new' : ''}" data-nd="${esc(n.date || '')}">
      <div class="av">${IC.bell}</div><div class="who"><b>${esc(n.title)}</b><span>${esc(n.body)}</span></div><span class="muted" style="white-space:nowrap">${ago(n.at)}</span></button>`).join('')}</div>`
    : `<div class="empty">مفيش إشعارات في آخر أسبوع</div>${PUSH.supported() && !PUSH.on() ? '<div class="muted" style="text-align:center">شغّل الإشعارات من "حسابي" عشان توصلك على الموبايل كمان</div>' : ''}`);
  if (NOTIF.items.length) store.set(NOTIF.seenKey(), NOTIF.items[0].id);
  NOTIF.badge();
  $$('[data-nd]', el).forEach((b) => (b.onclick = () => {
    closeSheet();
    if (b.dataset.nd) { S.date = b.dataset.nd; S.tab = 'day'; S.patient = null; render(); }
  }));
}

// ---------- ملخص الصبح (فوق شاشة النهارده) ----------
async function morningCard() {
  const el = $('#summary'); if (!el) return;
  try {
    const d = await api('summary', { date: S.date });
    if (!$('#summary') || !d.count) return;
    const lines = [];
    lines.push(`<b>${num(d.count)} مريض</b>${d.first ? ` من ${fmtTime(d.first)} ${ampm(d.first)} لـ ${fmtTime(d.last)} ${ampm(d.last)}` : ''}`);
    for (const a of d.alerts.slice(0, 4)) lines.push(`<span class="flag">${IC.alert}${esc(a.name)} (${fmtTime(a.time)}): ${esc(a.alert.replace(/^⚠\s*/, ''))}</span>`);
    if (d.risky.length) lines.push(`احتمال ما يجوش (غابوا قبل كده): ${d.risky.map((r) => `<b>${esc(r.name)}</b>`).join('، ')} — أكّدوا معاهم`);
    if (d.owing.length) lines.push(`عليهم فلوس: ${d.owing.slice(0, 3).map((o) => `${esc(o.name)} ${num(Math.round(o.balance))}`).join('، ')}`);
    if (d.labs_due) lines.push(`${num(d.labs_due)} شغل معمل معاده جه`);
    if (d.yesterday_no_show) lines.push(`${num(d.yesterday_no_show)} ما جوش امبارح`);
    el.innerHTML = `<div class="glass card summary fade"><div class="lbl2" style="margin-bottom:6px">☀️ ملخص اليوم</div>${lines.map((l) => `<div>${l}</div>`).join('')}</div>`;
  } catch {}
}

// ---------- رسايل واتساب للمريض ----------
const WA_TEMPLATES = [
  ['تذكير بالموعد', (n, a) => `أهلاً ${n}، معاك ${S.session.clinic}. بنفكّرك بميعادك ${a ? `${fmtDate(a.date || S.date, { weekday: 'long' })} الساعة ${fmtTime(a.time)} ${ampm(a.time)}` : ''}. مستنيينك 🌿`],
  ['الدكتور هيتأخر شوية', (n) => `أهلاً ${n}، معاك ${S.session.clinic}. الدكتور هيتأخر حوالي نص ساعة النهارده، نعتذر جداً. لو تحب نأجل الميعاد كلّمنا.`],
  ['جاهزين نستقبلك', (n) => `أهلاً ${n}، الدكتور جاهز دلوقتي، اتفضل على العيادة 🙏`],
  ['بعد الجلسة', (n) => `أهلاً ${n}، نتمنى تكون بخير بعد الجلسة. لو حسيت بأي ألم أو حاجة مش طبيعية كلّمنا على طول.`],
  ['متابعة علاج', (n) => `أهلاً ${n}، معاك ${S.session.clinic}. علاجك لسه ما خلصش، تحب نحجزلك الجلسة الجاية؟`],
];
const waLink = (phone, text) => `https://wa.me/${(phone || '').replace(/\D/g, '').replace(/^0/, '20')}?text=${encodeURIComponent(text)}`;
function waSheet(name, phone, appt) {
  const el = sheet(`رسالة واتساب لـ ${esc(name)}`, `
    ${WA_TEMPLATES.map(([t], i) => `<a class="btn soft" data-wt="${i}" target="_blank" rel="noopener">${t}</a>`).join('')}
    <button class="btn soft" id="wa-ai">${IC.spark}رسالة مخصوصة بالذكاء الاصطناعي</button>`);
  $$('[data-wt]', el).forEach((a) => (a.href = waLink(phone, WA_TEMPLATES[+a.dataset.wt][1](name, appt))));
  $('#wa-ai', el).onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('ai', { kind: 'followup_msg', name, reason: appt ? `موعد ${appt.service || ''}` : 'متابعة' });
      window.open(waLink(phone, r.text), '_blank');
    } catch (ex) { toast(aiError(ex), true); } finally { e.target.disabled = false; }
  };
}
const aiError = (e) => (/ai_off/.test(e.message) ? 'الذكاء الاصطناعي لسه مش متفعّل — محتاج مفتاح من صاحب البرنامج' : e.message);

// ---------- الإشعارات ----------
const PUSH = {
  supported: () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  on: () => !!store.get(`push:${ACC.key(S.session)}`),
  async enable() {
    if (await Notification.requestPermission() !== 'granted') throw new Error('لازم توافق على الإشعارات من الموبايل');
    const { key } = await api('push_key');
    if (!key) throw new Error('الإشعارات لسه مش جاهزة على السيرفر');
    const reg = await navigator.serviceWorker.ready;
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((key.length + 3) % 4)), (c) => c.charCodeAt(0));
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    await api('push_sub', { sub: sub.toJSON() });
    store.set(`push:${ACC.key(S.session)}`, sub.endpoint);
  },
  async disable() {
    const endpoint = store.get(`push:${ACC.key(S.session)}`);
    if (endpoint) await api('push_unsub', { endpoint }).catch(() => {});
    store.del(`push:${ACC.key(S.session)}`);
  },
};

// ---------- الأشعات والملفات (من السحابة) ----------
const FILE_KIND = { xray: 'أشعة', photo: 'صورة', report: 'تقرير', other: 'ملف' };
async function filesBody(el, patientId) {
  el.innerHTML = loading(2);
  try {
    const { items } = await api('files', { patient_id: patientId });
    el.innerHTML = items.length ? items.map((f) => `<button class="tr" data-f="${esc(f.cloud || '')}" style="width:100%;text-align:right">
        <div><b>${esc(f.title || FILE_KIND[f.kind] || 'ملف')}</b><div class="muted">${FILE_KIND[f.kind] || ''} · ${fmtDate(f.date, { day: 'numeric', month: 'short', year: 'numeric' })}${f.tooth ? ` · سنة ${esc(f.tooth)}` : ''}</div></div>
        <span class="muted">${f.cloud ? 'فتح' : 'لسه بيترفع'}</span></button>`).join('')
      : '<div class="empty">مفيش أشعات أو ملفات</div>';
    $$('[data-f]', el).forEach((b) => (b.onclick = async () => {
      if (!b.dataset.f) return toast('الملف لسه ما اترفعش من البرنامج — هيتنقل مع المزامنة الجاية', true);
      try { const { url } = await api('file_url', { path: b.dataset.f }); window.open(url, '_blank'); } catch (e) { toast(e.message, true); }
    }));
  } catch (e) { el.innerHTML = failed(e); }
}

// ---------- اسأل عيادتك ----------
function askSheet() {
  const el = sheet('اسأل عيادتك', `
    <div class="muted">مثلاً: كام دخلنا الشهر ده مقارنة باللي فات؟ أكتر خدمة جابت فلوس؟ كام مريض جديد؟</div>
    <textarea id="ask-q" rows="2" placeholder="اكتب سؤالك…"></textarea>
    <button class="btn" id="ask-go">${IC.spark}اسأل</button>
    <div id="ask-a" class="glass card" style="display:none;white-space:pre-line;line-height:1.8"></div>`);
  $('#ask-go', el).onclick = async (e) => {
    const q = $('#ask-q', el).value.trim(); if (!q) return;
    e.target.disabled = true; $('#ask-a', el).style.display = 'block'; $('#ask-a', el).textContent = 'بيفكر…';
    try { $('#ask-a', el).textContent = (await api('ai', { kind: 'ask', question: q })).answer; }
    catch (ex) { $('#ask-a', el).textContent = aiError(ex); } finally { e.target.disabled = false; }
  };
}

// ---------- الإملاء بالصوت (في تسجيل الجلسة) ----------
// تحويل الصوت لكلام من الموبايل نفسه (مجاني)، والترتيب في خانات بالذكاء الاصطناعي لو متفعّل
function dictateButton(box) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  const btn = document.createElement('button');
  btn.className = 'btn soft'; btn.innerHTML = `${IC.mic}املي بصوتك`;
  box.prepend(btn);
  let rec = null, text = '';
  btn.onclick = async () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'ar-EG'; rec.continuous = true; rec.interimResults = false;
    text = ''; btn.innerHTML = `${IC.mic}بيسمع… دوس تاني لما تخلص`; btn.classList.add('rec');
    rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += `${e.results[i][0].transcript} `; };
    rec.onend = async () => {
      rec = null; btn.classList.remove('rec'); btn.innerHTML = `${IC.mic}املي بصوتك`;
      if (!text.trim()) return;
      $('#ss-p', box).value = [$('#ss-p', box).value, text.trim()].filter(Boolean).join('\n');
      try {
        btn.innerHTML = `${IC.spark}بيرتب الكلام…`;
        const { fields } = await api('ai', { kind: 'dictate', text });
        if (fields.complaint) $('#ss-c', box).value = fields.complaint;
        if (fields.diagnosis) $('#ss-d', box).value = fields.diagnosis;
        if (fields.procedure) $('#ss-p', box).value = fields.procedure;
        if (fields.next_step) $('#ss-n', box).value = fields.next_step;
        if (fields.rx?.length) toast(`الدكتور ذكر ${fields.rx.length} دوا — اكتبهم في الروشتة`);
      } catch (e) { if (!/ai_off/.test(e.message)) toast(e.message, true); }
      btn.innerHTML = `${IC.mic}املي بصوتك`;
    };
    rec.start();
  };
}

// ---------- وضع العرض التجريبي (?demo) — بيانات وهمية من غير سيرفر ----------
function demo(action, data) {
  const pts = [['p1', 'أحمد محمود', '01012345678', null], ['p2', 'منى السيد', '01198765432', '⚠ بنسلين · ضغط عالي'], ['p3', 'كريم عادل', '01022223333', null],
    ['p4', 'سارة علي', '01277788899', 'سكر'], ['p5', 'عمر سمير', '01055566677', null]];
  const P = (id) => pts.find((p) => p[0] === id) || pts[0];
  const r = {
    meta: () => ({ services: [{ id: 's1', name: 'كشف', duration: 15 }, { id: 's2', name: 'حشو عادي', duration: 30 }, { id: 's3', name: 'خلع', duration: 30 }], doctors: [{ id: 'd1', name: 'د. أحمد سعيد', me: true }] }),
    slots: () => ({ closed: false, slots: ['10:00', '10:30', '11:00', '12:00', '13:30', '17:00', '18:15'].map((time) => ({ time, free: true, chair_id: 'c1' })) }),
    write: () => ({ ok: true }),
    notifications: () => ({ items: [{ id: 3, title: 'المريض وصل', body: 'منى السيد وصل العيادة (ميعاده 10:30)', at: new Date(Date.now() - 4 * 6e4).toISOString(), date: today() },
      { id: 2, title: 'حجز أونلاين جديد', body: 'سارة علي — ' + addDays(today(), 1) + ' 11:30', at: new Date(Date.now() - 50 * 6e4).toISOString(), date: addDays(today(), 1) },
      { id: 1, title: 'موعد اتلغى', body: 'كريم عادل — ' + today() + ' 11:00', at: new Date(Date.now() - 26 * 36e5).toISOString(), date: today() }] }),
    summary: () => ({ count: 5, first: '10:00', last: '12:15', alerts: [{ name: 'منى السيد', time: '10:30', alert: '⚠ بنسلين · ضغط عالي' }],
      risky: [{ name: 'كريم عادل', time: '11:00', missed: 2 }], owing: [{ name: 'منى السيد', balance: 950 }], labs_due: 1, yesterday_no_show: 1 }),
    files: () => ({ items: [{ id: 'f1', title: 'بانوراما', kind: 'xray', date: addDays(today(), -10), cloud: 'x/f1' }, { id: 'f2', kind: 'photo', date: addDays(today(), -3), cloud: null }] }),
    file_url: () => ({ url: 'icon-512.png' }),
    patient_new: () => ({ id: 'p9' }),
    refresh: () => ({ token: 'demo' }),
    push_key: () => ({ key: null }),
    ai: () => Promise.reject(new Error('ai_off')),
    followups: () => ({ unfinished: [{ patient_id: 'p2', name: 'منى السيد', phone: '01198765432', detail: 'حشو عصب 2/3' }], no_shows: [{ patient_id: 'p3', name: 'كريم عادل', phone: '01022223333', date: addDays(today(), -5) }] }),
    login: () => ({ token: 'demo', name: 'د. أحمد سعيد', clinic: 'عيادة تجريبية' }),
    me: () => ({ last_sync: new Date(Date.now() - 120000).toISOString() }),
    day: () => ({ items: [['10:00', 'p1', 'done', 'حشو عصب', 'كرسي 1'], ['10:30', 'p2', 'inside', 'خلع', 'كرسي 2'], ['11:00', 'p3', 'waiting', 'كشف', 'كرسي 1'],
      ['11:30', 'p4', 'booked', 'تنظيف جير', 'كرسي 2'], ['12:15', 'p5', 'booked', 'تركيب طربوش', 'كرسي 1']]
      .map(([time, id, status, service, chair], i) => ({ id: `a${i}`, time, status, service, chair, patient_id: id, patient: P(id)[1], phone: P(id)[2], alert: P(id)[3], doctor: 'د. أحمد سعيد' })) }),
    search: () => ({ items: pts.filter((p) => p[1].includes(data.q) || p[2].includes(data.q)).map(([id, name, phone, alert], i) => ({ id, name, phone, alert, file_no: 40 + i })) }),
    patient: () => { const [, name, phone, alert] = P(data.id); return { patient: { name, phone, alert, file_no: 48, age: 34, medications: alert ? 'سيولة' : null }, balance: 950,
      treatments: [{ id: 't1', description: 'حشو عصب', tooth: '36', done: 2, total: 3, status: 'in_progress' }, { description: 'طربوش بورسلين', tooth: '36', done: 0, total: 1, status: 'planned' }, { description: 'تنظيف جير', done: 1, total: 1, status: 'done' }],
      sessions: [{ date: addDays(today(), -7), tooth: '36', diagnosis: 'التهاب عصب', procedure: 'فتح وتنظيف القنوات', next_step: 'حشو القنوات' }],
      prescriptions: [{ date: addDays(today(), -7), items: [{ name: 'أموكسيسيلين', dose: '500 مجم', frequency: 'كل 8 ساعات', duration: '5 أيام' }], instructions: 'بعد الأكل' }],
      appointments: [{ date: addDays(today(), 3), time: '11:00', status: 'booked', service: 'حشو عصب' }, { date: addDays(today(), -7), time: '10:00', status: 'done', service: 'حشو عصب' }] }; },
    money: () => { const by_day = {}; for (let i = 0; i < 31; i++) by_day[addDays(today(), -i)] = [4250, 2600, 1200, 3900, 2100, 800, 3300][i % 7];
      return { by_day, exp_by_day: { [today()]: 600, [addDays(today(), -3)]: 1500 }, by_method: { cash: 3000, instapay: 1250 }, debt_total: 12400, debtors: [{ id: 'p2', name: 'منى السيد', balance: 950, last_pay: addDays(today(), -12) },
        { id: 'p5', name: 'عمر سمير', balance: 3500, last_pay: null }, { id: 'p3', name: 'كريم عادل', balance: 600, last_pay: addDays(today(), -30) }] }; },
  };
  return new Promise((res) => setTimeout(() => res(r[action]()), 150));
}

if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('click', (e) => { if (e.target.closest('.retry')) render(); });
render();
