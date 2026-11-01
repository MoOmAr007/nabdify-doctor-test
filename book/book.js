// صفحة الحجز أونلاين للمرضى: الخدمة ← اليوم ← الساعة ← البيانات، في صفحة واحدة
const FN = 'https://czxtacsibelnrkyzazmj.supabase.co/functions/v1/book';
const slug = new URLSearchParams(location.search).get('c') || '';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = (d) => d.toLocaleDateString('en-CA');
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const hm = (t) => t.split(':').map(Number);
const fmtTime = (t) => { const [h, m] = hm(t); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'م' : 'ص'}`; };
const day = (s, o) => new Date(`${s}T12:00:00`).toLocaleDateString('ar-EG', o);
const initials = (n) => (n || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join(' ');
const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

async function call(action, data = {}) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, slug, ...data }) })
    .catch(() => { throw new Error('مفيش اتصال بالنت'); });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || 'حصلت مشكلة');
  return b;
}

const f = { service: '', date: null, time: null, gender: '' };
let info;
const svcName = () => info.services.find((s) => s.id === f.service)?.name || 'كشف';

async function start() {
  try { info = await call('info'); } catch (e) { $('#bk').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  document.title = `حجز موعد — ${info.clinic}`;
  const today = iso(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const off = (d) => (info.days_off || []).includes(new Date(`${d}T12:00:00`).getDay()) || (info.closed || []).includes(d);
  f.date = days.find((d) => !off(d));
  const last = store.get(`booking:${slug}`);
  $('#hero').innerHTML = `<div class="av">${esc(initials(info.clinic))}</div><div><b>${esc(info.clinic)}</b>
    <span>${[info.address, info.phone ? `<span class="ltr">${esc(info.phone)}</span>` : ''].filter(Boolean).map((x) => (x.startsWith('<') ? x : esc(x))).join(' · ')}</span>
    <span>${info.note ? esc(info.note) : 'احجز ميعادك في أقل من دقيقة'}</span></div>`;
  $('#bk').innerHTML = `
    ${last && last.date >= today ? `<div class="step mine">عندك ميعاد ${day(last.date, { weekday: 'long', day: 'numeric', month: 'long' })} الساعة ${fmtTime(last.time)}
      <button class="link" id="mine">عرض / إلغاء</button></div>` : ''}
    <section class="step" id="s1"><div class="lbl"><i>1</i>الخدمة</div>
      <div class="chips2">${[{ id: '', name: 'كشف / مش متأكد' }, ...info.services.filter((s) => s.name.trim() !== 'كشف')].map((s) => `<button data-s="${s.id}" class="${s.id === f.service ? 'on' : ''}">${esc(s.name)}</button>`).join('')}</div></section>
    <section class="step" id="s2"><div class="lbl"><i>2</i>اليوم</div>
      <div class="days">${days.map((d) => `<button data-d="${d}" ${off(d) ? 'disabled' : ''} class="${d === f.date ? 'on' : ''}">${d === today ? 'النهارده' : day(d, { weekday: 'short' })}<b>${day(d, { day: 'numeric' })}</b></button>`).join('')}</div></section>
    <section class="step" id="s3"><div class="lbl"><i>3</i>الساعة</div><div id="tm"></div></section>
    <section class="step" id="s4"><div class="lbl"><i>4</i>بياناتك</div>
      <label class="fld"><small>الاسم (ثنائي على الأقل) *</small><input id="nm" autocomplete="name" placeholder="مثلاً: أحمد محمد"><em></em></label>
      <label class="fld"><small>رقم الموبايل *</small><input id="ph" class="ltr" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx"><em></em></label>
      <div class="grid2">
        <label class="fld"><small>السن *</small><input id="ag" inputmode="numeric" maxlength="3" placeholder="مثلاً 30"><em></em></label>
        <div><small class="cap2">النوع (اختياري)</small><div class="seg2" id="gd"><button data-g="ذكر">ذكر</button><button data-g="أنثى">أنثى</button></div></div>
      </div>
      <label class="fld"><small>سبب الزيارة (اختياري)</small><input id="nt" maxlength="200" placeholder="مثلاً: وجع في ضرس"></label>
    </section>
    <div class="err" id="er"></div>`;
  $('#bar').hidden = false;
  if ($('#mine')) $('#mine').onclick = () => done(last);
  $$('[data-s]').forEach((b) => (b.onclick = () => { f.service = b.dataset.s; $$('[data-s]').forEach((x) => x.classList.toggle('on', x === b)); slots(); }));
  $$('[data-d]').forEach((b) => (b.onclick = () => { f.date = b.dataset.d; $$('[data-d]').forEach((x) => x.classList.toggle('on', x === b)); slots(); }));
  $$('[data-g]').forEach((b) => (b.onclick = () => { f.gender = f.gender === b.dataset.g ? '' : b.dataset.g; $$('[data-g]').forEach((x) => x.classList.toggle('on', x.dataset.g === f.gender)); }));
  ['nm', 'ph', 'ag'].forEach((id) => { $(`#${id}`).oninput = () => { check(); }; $(`#${id}`).onblur = () => check(true); });
  $('#go').onclick = book;
  slots();
}

// التحقق: الرسالة بتظهر تحت الخانة بعد ما يسيبها، والزرار ما يشتغلش غير لما كله تمام
const rules = {
  nm: (v) => (v.trim().split(/\s+/).filter(Boolean).length >= 2 ? '' : 'اكتب اسمك الثنائي على الأقل'),
  ph: (v) => (/^01\d{9}$/.test(v.replace(/\D/g, '')) ? '' : 'رقم موبايل من 11 رقم يبدأ بـ 01'),
  ag: (v) => (/^\d{1,3}$/.test(v.trim()) && +v >= 1 && +v <= 110 ? '' : 'اكتب السن'),
};
function check(show) {
  let ok = !!(f.date && f.time);
  for (const [id, rule] of Object.entries(rules)) {
    const el = $(`#${id}`), msg = rule(el.value);
    if (msg) ok = false;
    if (show || el.closest('.fld').classList.contains('bad')) { el.closest('.fld').classList.toggle('bad', !!msg && !!el.value); $('em', el.closest('.fld')).textContent = el.value ? msg : ''; }
  }
  $('#go').disabled = !ok;
  $('#go').textContent = !f.time ? 'اختار الساعة' : ok ? 'تأكيد الحجز' : 'كمّل بياناتك';
  $('#sum').innerHTML = f.time ? `${day(f.date, { weekday: 'long', day: 'numeric', month: 'long' })} · <b>${fmtTime(f.time)}</b> · ${esc(svcName())}` : '';
  return ok;
}

async function slots() {
  f.time = null; check();
  $('#tm').innerHTML = '<div class="muted">بيحمّل…</div>';
  try {
    const r = await call('slots', { date: f.date, service_id: f.service || null });
    if (r.closed) { $('#tm').innerHTML = '<div class="muted">العيادة أجازة اليوم ده</div>'; return; }
    if (!r.times.length) { $('#tm').innerHTML = '<div class="muted">مفيش مواعيد فاضية — جرب يوم تاني</div>'; return; }
    const am = r.times.filter((t) => hm(t)[0] < 15), pm = r.times.filter((t) => hm(t)[0] >= 15);
    const grid = (l) => `<div class="slots">${l.map((t) => `<button data-t="${t}">${fmtTime(t).replace(/ [صم]$/, '')}</button>`).join('')}</div>`;
    $('#tm').innerHTML = (am.length ? `<div class="part">☀ صباحي</div>${grid(am)}` : '') + (pm.length ? `<div class="part">🌙 مسائي</div>${grid(pm)}` : '');
    $$('[data-t]').forEach((b) => (b.onclick = () => {
      f.time = b.dataset.t; $$('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); check();
      $('#s4').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  } catch (e) { $('#tm').innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
}

async function book() {
  if (!check(true)) return;
  $('#go').disabled = true; $('#go').textContent = 'بيحجز…'; $('#er').textContent = '';
  try {
    const r = await call('book', { name: $('#nm').value.trim(), phone: $('#ph').value.replace(/\D/g, ''), age: $('#ag').value.trim(), gender: f.gender || null,
      service_id: f.service || null, date: f.date, time: f.time, notes: $('#nt').value });
    const b = { date: f.date, time: f.time, service: svcName(), pending: r.pending, cancel: r.cancel };
    store.set(`booking:${slug}`, b);
    done(b);
  } catch (e) { $('#er').textContent = e.message; check(); if (/اتحجز/.test(e.message)) slots(); }
}

// شاشة التأكيد: تقويم، اتصال، إلغاء (بالكود اللي اتحفظ على الموبايل ده بس)
function done(b) {
  $('#bar').hidden = true;
  const [h, m] = hm(b.time);
  const start = `${b.date.replace(/-/g, '')}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
  const end = `${b.date.replace(/-/g, '')}T${String(h + (m >= 30 ? 1 : 0)).padStart(2, '0')}${String((m + 30) % 60).padStart(2, '0')}00`;
  const cal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`ميعاد ${b.service} — ${info.clinic}`)}&dates=${start}/${end}&ctz=Africa/Cairo&location=${encodeURIComponent(info.address || '')}`;
  $('#bk').innerHTML = `<div class="ok">
    <div class="tick">${b.pending ? '⏳' : '✓'}</div>
    <h2>${b.pending ? 'استلمنا طلب الحجز' : 'اتحجز ميعادك'}</h2>
    <div class="when"><b>${day(b.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtTime(b.time)}</b><span>${esc(b.service)} · ${esc(info.clinic)}</span></div>
    ${b.pending ? '<div class="muted">العيادة هتأكد معاك الميعاد على الواتساب قريب.</div>' : ''}
    <a class="btn" href="${cal}" target="_blank" rel="noopener">📅 إضافة للتقويم</a>
    ${info.phone ? `<a class="btn2" href="tel:${esc(info.phone)}">📞 اتصل بالعيادة</a>` : ''}
    ${b.cancel ? '<button class="btn2 danger" id="cx">إلغاء الحجز</button>' : ''}
    <div class="err" id="cxe"></div>
    <div class="muted">${b.cancel ? 'الإلغاء متاح لحد 3 ساعات قبل الميعاد. ' : ''}لو عايز تغيّر الميعاد كلّم العيادة.</div>
    <button class="link" id="again">حجز ميعاد تاني</button></div>`;
  if ($('#cx')) $('#cx').onclick = async (e) => {
    if (!e.target.dataset.sure) { e.target.dataset.sure = 1; e.target.textContent = 'دوس تاني لتأكيد الإلغاء'; return; }
    e.target.disabled = true;
    try {
      await call('cancel', { token: b.cancel });
      store.set(`booking:${slug}`, null);
      $('#bk').innerHTML = '<div class="ok"><div class="tick">✕</div><h2>اتلغى الميعاد</h2><div class="muted">العيادة وصلها إن الميعاد اتلغى.</div><button class="btn" id="again">حجز ميعاد جديد</button></div>';
      $('#again').onclick = () => location.reload();
    } catch (ex) { $('#cxe').textContent = ex.message; e.target.disabled = false; }
  };
  $('#again').onclick = () => location.reload();
}

start();
