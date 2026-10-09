import { EXERCISES, EX, CATEGORIES } from './exercises.js';
import { createFigure } from './figure.js';
import {
  PHASE1_SESSIONS, FOCUS, FOCUS_ORDER, phase1Session, phase2Session, backCareSession,
  flatten, estimateMinutes, prescription,
} from './program.js';

// ---------------- Storage ----------------
const KEY = 'kbCoach.v1';
const DEFAULT = {
  settings: { weightLb: 25, days: [1, 3, 5], sound: true, skipPhase1: false },
  sessions: [],
  daily: {}, // { date: { back, shuffle, focus } }
};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.sessions)) return { ...DEFAULT, ...s, settings: { ...DEFAULT.settings, ...s.settings }, daily: s.daily || {} };
  } catch { /* ignore */ }
  return structuredClone(DEFAULT);
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
}

// ---------------- Helpers ----------------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtTime = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
const fmtDate = (k) => parseDate(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const ytUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
const today = () => dateKey();
const daily = () => (state.daily[today()] ||= {});

const programSessions = () => state.sessions.filter((s) => s.phase >= 1);
const phase1Done = () => state.sessions.filter((s) => s.phase === 1).length;
const phase2Done = () => state.sessions.filter((s) => s.phase === 2).length;
const inPhase1 = () => !state.settings.skipPhase1 && phase1Done() < PHASE1_SESSIONS;

function nextSession() {
  if (inPhase1()) return phase1Session(phase1Done());
  const n = phase2Done();
  const d = daily();
  const focus = d.focus || FOCUS_ORDER[n % FOCUS_ORDER.length];
  const last = programSessions().at(-1);
  const avoid = new Set(last?.exercises || []);
  return phase2Session({ n, focus, seed: `${today()}#${d.shuffle || 0}#${focus}`, avoid });
}

function weekStreak() {
  // Consecutive weeks (Mon-Sun) with at least one session, counting back from this week.
  const weeks = new Set(state.sessions.map((s) => weekKey(parseDate(s.date))));
  let n = 0;
  const d = new Date();
  if (!weeks.has(weekKey(d))) d.setDate(d.getDate() - 7);
  while (weeks.has(weekKey(d))) { n++; d.setDate(d.getDate() - 7); }
  return n;
}
function weekKey(d) {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return dateKey(m);
}

// ---------------- Figures ----------------
const live = new Set();
const io = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? e.target._fig?.play() : e.target._fig?.stop())))
  : null;

function mountFigure(el, id, opts = {}) {
  const fig = createFigure(el, EX[id], opts);
  el._fig = fig;
  live.add(el);
  if (opts.autoplay) fig.play();
  else if (io) io.observe(el);
  return fig;
}
function unmountFigures(root) {
  for (const el of [...live]) {
    if (!root || root.contains(el)) { el._fig?.stop(); io?.unobserve(el); live.delete(el); }
  }
}

// ---------------- Views ----------------
let tab = 'today';
const view = $('#view');

function render() {
  unmountFigures(view);
  $('#bellWeight').textContent = `🔔 ${state.settings.weightLb} lb`;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  ({ today: renderToday, library: renderLibrary, history: renderHistory, settings: renderSettings })[tab]();
  view.querySelectorAll('[data-fig]').forEach((el) => mountFigure(el, el.dataset.fig));
}

function sessionCard(session, { primary = true } = {}) {
  const mins = estimateMinutes(session);
  return `
    <section class="card workout">
      <div class="workout-head">
        <div>
          <div class="eyebrow">${esc(session.subtitle)}</div>
          <h2>${esc(session.title)}</h2>
        </div>
        <div class="pill">≈ ${mins} min</div>
      </div>
      ${session.blocks.map((b) => `
        <div class="block">
          <h3>${esc(b.name)}${b.mode === 'circuit' && b.rounds > 1 ? ` <small>· ${b.rounds} rounds</small>` : ''}</h3>
          <ul class="ex-list">
            ${b.items.map((item) => `
              <li><button class="ex-row" data-detail="${item.ex}">
                <div class="thumb" data-fig="${item.ex}"></div>
                <div class="ex-info">
                  <strong>${esc(EX[item.ex].name)}</strong>
                  <span>${esc(prescription(item))}${item.note ? ` · <em>${esc(item.note)}</em>` : ''}</span>
                </div>
                <span class="chev">›</span>
              </button></li>`).join('')}
          </ul>
        </div>`).join('')}
      <div class="actions">
        <button class="btn ${primary ? 'primary' : ''} big" data-start="${session.key}">▶ Start workout</button>
        <button class="btn ghost" data-quicklog="${session.key}">✓ Log as done</button>
      </div>
    </section>`;
}

let shownSessions = {};

function renderToday() {
  const t = today();
  const d = daily();
  const doneToday = state.sessions.filter((s) => s.date === t);
  const p1 = inPhase1();
  const session = nextSession();
  const care = backCareSession();
  shownSessions = { [session.key]: session, [care.key]: care };
  const isTrainingDay = !p1 || state.settings.days.includes(new Date().getDay());

  const p1n = phase1Done();
  const progress = p1
    ? `<div class="progress"><div class="bar"><i style="width:${(p1n / PHASE1_SESSIONS) * 100}%"></i></div>
       <span>Phase 1: ${p1n} / ${PHASE1_SESSIONS} sessions · then daily 20-min workouts</span></div>`
    : `<div class="progress"><span>Phase 2 · ${phase2Done()} daily sessions done</span></div>`;

  const backQ = `
    <section class="card checkin">
      <h3>How does your lower back feel today?</h3>
      <div class="chips">
        ${[['good', '😀 Good'], ['stiff', '😐 A bit stiff'], ['pain', '😣 Painful']].map(([v, l]) =>
          `<button class="chip ${d.back === v ? 'on' : ''}" data-back="${v}">${l}</button>`).join('')}
      </div>
      ${d.back === 'stiff' ? `<p class="note warn">Take it easy today. The <b>Back Care</b> session below is a great choice — gentle movement usually helps stiffness. If you train normally, skip swings and stop anything that hurts.</p>` : ''}
      ${d.back === 'pain' ? `<p class="note danger">Skip the workout today. Gentle walking is fine. If the pain is sharp, goes down your leg, or you feel numbness or tingling, please see a doctor or physiotherapist before training again.</p>` : ''}
    </section>`;

  let main = '';
  if (doneToday.length) {
    main += `<section class="card done"><h2>✅ Done for today!</h2>
      <p>${doneToday.map((s) => esc(s.title)).join(', ')}</p>
      <p class="muted">${p1 ? 'Rest tomorrow and let your muscles recover.' : 'Great work. See you tomorrow!'}</p></section>`;
  }
  if (d.back === 'pain') {
    main += sessionCard(care, { primary: false });
  } else if (d.back === 'stiff') {
    main += sessionCard(care) + `<h3 class="section-title">Or your regular workout</h3>` + sessionCard(session, { primary: false });
  } else if (!isTrainingDay && !doneToday.length) {
    const next = nextTrainingDay();
    main += `<section class="card rest"><h2>😴 Rest day</h2>
      <p>Your training days are <b>${state.settings.days.map((x) => DAY_NAMES[x]).join(', ')}</b>. Next workout: <b>${next}</b>.</p>
      <p class="muted">Recovery is when you get stronger. Optional: a gentle 10-minute back care session.</p></section>`
      + sessionCard(care, { primary: false })
      + `<details class="card"><summary>Train anyway — show next workout</summary>${sessionCard(session)}</details>`;
  } else {
    main += sessionCard(session, { primary: !doneToday.length });
    if (!p1) {
      main += `<section class="card"><h3>Change today's workout</h3>
        <div class="chips">${FOCUS_ORDER.map((f) => `<button class="chip ${session.focus === f ? 'on' : ''}" data-focus="${f}">${FOCUS[f].icon} ${FOCUS[f].name}</button>`).join('')}</div>
        <button class="btn ghost" data-shuffle>🔀 Shuffle exercises</button></section>`;
    }
  }

  view.innerHTML = `
    <div class="hello"><h1>${greeting()}</h1>${progress}</div>
    ${backQ}
    ${main}
    ${p1 && phase1Done() === 0 ? tipsCard() : ''}`;
}

function nextTrainingDay() {
  const d = new Date();
  for (let i = 1; i <= 7; i++) {
    d.setDate(d.getDate() + 1);
    if (state.settings.days.includes(d.getDay())) return i === 1 ? 'tomorrow' : DAY_NAMES[d.getDay()];
  }
  return '—';
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning 💪' : h < 18 ? 'Good afternoon 💪' : 'Good evening 💪';
}

function tipsCard() {
  return `<section class="card tips"><h3>Before your first workout</h3><ul>
    <li><b>Learn the hip hinge</b> — tap any exercise to see an animation, steps and a video link.</li>
    <li><b>Protect your back:</b> flat back on every rep, brace your belly, and stop if something feels sharp.</li>
    <li>Start slow. The first week is about learning the movements, not getting tired.</li>
    <li>Use a mat, wear flat shoes or go barefoot, and clear space around you.</li>
  </ul></section>`;
}

function renderLibrary() {
  view.innerHTML = `<h1>Exercises</h1>
    <p class="muted">Tap an exercise to see how to do it. Grey limbs are the far side of the body; the orange ball is the kettlebell.</p>
    ${Object.entries(CATEGORIES).map(([cat, name]) => `
      <h3 class="section-title">${name}</h3>
      <div class="grid">
        ${EXERCISES.filter((e) => e.category === cat).map((e) => `
          <button class="ex-card" data-detail="${e.id}">
            <div class="fig-box" data-fig="${e.id}"></div>
            <strong>${esc(e.name)}</strong>
            <span>${esc(e.equipment)}</span>
          </button>`).join('')}
      </div>`).join('')}
    <section class="card tips"><h3>⚠️ Left out on purpose</h3>
      <p class="muted">Because of your disc history, this app avoids sit-ups/crunches, Russian twists, windmills, jefferson curls and overhead ("American") swings. These load the spine in flexion or rotation.</p></section>`;
}

function renderHistory() {
  const s = state.sessions;
  const minutes = Math.round(s.reduce((a, x) => a + (x.durationSec || 0), 0) / 60);
  const wk = weekKey(new Date());
  const thisWeek = s.filter((x) => weekKey(parseDate(x.date)) === wk).length;
  view.innerHTML = `<h1>History</h1>
    <div class="stats">
      <div class="stat"><b>${s.length}</b><span>workouts</span></div>
      <div class="stat"><b>${thisWeek}</b><span>this week</span></div>
      <div class="stat"><b>${weekStreak()}</b><span>week streak</span></div>
      <div class="stat"><b>${minutes}</b><span>minutes</span></div>
    </div>
    <section class="card"><h3>Last 12 weeks</h3>${heatmap()}</section>
    <section class="card"><h3>Sessions</h3>
      ${s.length ? `<ul class="log">${[...s].reverse().map((x) => `
        <li>
          <div><strong>${esc(x.title)}</strong>
          <span class="muted">${fmtDate(x.date)} · ${x.durationSec ? fmtTime(x.durationSec) : 'logged'}${x.effort ? ' · ' + esc(x.effort) : ''}${x.back ? ' · back: ' + esc(x.back) : ''}</span></div>
          <button class="icon-btn" title="Delete" data-del="${x.id}">🗑</button>
        </li>`).join('')}</ul>` : '<p class="muted">No workouts yet. Your first one is waiting on the Today tab!</p>'}
    </section>`;
}

function heatmap() {
  const counts = {};
  state.sessions.forEach((x) => { counts[x.date] = (counts[x.date] || 0) + 1; });
  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * 11);
  let cells = '';
  for (let w = 0; w < 12; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      const k = dateKey(day);
      const future = day > new Date();
      cells += `<i class="${counts[k] ? 'on' : ''} ${future ? 'future' : ''} ${k === today() ? 'today' : ''}" title="${k}" style="grid-column:${w + 1};grid-row:${d + 1}"></i>`;
    }
  }
  return `<div class="heat-wrap"><div class="heat-days">${['M', '', 'W', '', 'F', '', 'S'].map((x) => `<span>${x}</span>`).join('')}</div><div class="heat">${cells}</div></div>`;
}

function renderSettings() {
  const st = state.settings;
  view.innerHTML = `<h1>Settings</h1>
    <section class="card">
      <label class="field">Kettlebell weight (lb)
        <input type="number" id="weight" min="5" max="100" step="5" value="${st.weightLb}">
      </label>
      <div class="field">Phase 1 training days (pick 3, with rest days between)
        <div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="chip ${st.days.includes(d) ? 'on' : ''}" data-day="${d}">${DAY_NAMES[d]}</button>`).join('')}</div>
      </div>
      <label class="switch"><input type="checkbox" id="sound" ${st.sound ? 'checked' : ''}> Beeps during timers</label>
    </section>
    <section class="card">
      <h3>Program</h3>
      <p class="muted">${inPhase1() ? `You are in Phase 1 (${phase1Done()}/${PHASE1_SESSIONS} sessions).` : 'You are in Phase 2 (daily 20-minute workouts).'}</p>
      ${inPhase1() ? '<button class="btn ghost" data-act="skip">Skip to Phase 2 (daily)</button>' : ''}
      ${st.skipPhase1 ? '<button class="btn ghost" data-act="unskip">Go back to Phase 1</button>' : ''}
      <p class="muted small">When the workouts feel easy for 2+ weeks, consider a 35 lb (16 kg) bell for squats, deadlifts and swings.</p>
    </section>
    <section class="card">
      <h3>Your data</h3>
      <p class="muted small">Workouts are saved only in this browser. Export a backup now and then — especially before clearing browser data or switching phones.</p>
      <div class="actions">
        <button class="btn ghost" data-act="export">⬇ Export backup</button>
        <label class="btn ghost">⬆ Import backup<input type="file" id="importFile" accept="application/json" hidden></label>
        <button class="btn danger" data-act="reset">Reset everything</button>
      </div>
    </section>
    <section class="card tips">
      <h3>Back safety</h3>
      <ul>
        <li>Keep a <b>flat, neutral back</b> on every rep; the hips do the work.</li>
        <li><b>Brace</b> your belly lightly before each rep and breathe out on the effort.</li>
        <li>Avoid heavy bending and twisting first thing in the morning — discs are more sensitive right after waking up.</li>
        <li>Stop if you feel sharp pain, pain running down the leg, numbness or tingling, and see a professional.</li>
      </ul>
      <p class="muted small">This app gives general fitness guidance, not medical advice.</p>
    </section>`;
}

// ---------------- Exercise detail ----------------
const modal = $('#modal');
function openDetail(id) {
  const e = EX[id];
  unmountFigures(modal);
  modal.innerHTML = `
    <div class="modal-inner">
      <button class="close" data-close aria-label="Close">✕</button>
      <h2>${esc(e.name)}</h2>
      <div class="fig-big" id="detailFig"></div>
      <p class="cue" id="detailCue">&nbsp;</p>
      <a class="btn ghost yt" href="${ytUrl(e.yt)}" target="_blank" rel="noopener">▶ Watch video examples on YouTube</a>
      <h3>How to do it</h3>
      <ol>${e.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <h3>Common mistakes</h3>
      <ul>${e.mistakes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <p class="note back">🛡️ <b>Back tip:</b> ${esc(e.back)}</p>
    </div>`;
  mountFigure($('#detailFig', modal), id, { autoplay: true, onCue: (c) => { $('#detailCue', modal).textContent = c; } });
  modal.showModal();
}
modal.addEventListener('close', () => unmountFigures(modal));
modal.addEventListener('click', (ev) => {
  if (ev.target === modal || ev.target.closest('[data-close]')) modal.close();
});

// ---------------- Player ----------------
const player = $('#player');
let P = null; // player state

let audio;
function beep(freq = 880, dur = 0.12) {
  if (!state.settings.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(audio.destination);
    g.gain.setValueAtTime(0.25, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
    o.start(); o.stop(audio.currentTime + dur);
  } catch { /* no audio */ }
}

async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) P.lock = await navigator.wakeLock.request('screen');
    else if (!on && P?.lock) { await P.lock.release(); P.lock = null; }
  } catch { /* not allowed */ }
}

function startPlayer(session) {
  const steps = flatten(session);
  P = { session, steps, i: 0, phase: 'work', left: 0, paused: false, started: Date.now(), timer: 0, lastTick: 0, done: new Set() };
  beep(660, 0.05);
  player.hidden = false;
  document.body.classList.add('playing');
  keepAwake(true);
  enterStep(0);
  P.timer = setInterval(tick, 250);
}

function enterStep(i, phase = 'work') {
  P.i = i;
  P.phase = phase;
  const st = P.steps[i];
  P.left = phase === 'rest' ? st.rest : st.secs || 0;
  P.lastTick = Date.now();
  drawPlayer();
}

function advance() {
  const st = P.steps[P.i];
  if (P.phase === 'work') {
    P.done.add(P.i);
    if (P.i === P.steps.length - 1) return finishPlayer();
    if (st.rest > 0) { beep(520, 0.2); return enterStep(P.i, 'rest'); }
  }
  beep(880, 0.2);
  enterStep(P.i + 1, 'work');
}

function tick() {
  if (!P || P.paused || P.phase === 'finish') return;
  const now = Date.now();
  const dt = (now - P.lastTick) / 1000;
  P.lastTick = now;
  $('#elapsed', player) && ($('#elapsed', player).textContent = fmtTime((now - P.started) / 1000));
  const timed = P.phase === 'rest' || P.steps[P.i].secs;
  if (!timed) return;
  const before = Math.ceil(P.left);
  P.left -= dt;
  const after = Math.ceil(P.left);
  if (after !== before && after <= 3 && after > 0) beep(740, 0.08);
  if (P.left <= 0) return advance();
  const c = $('#count', player);
  if (c) c.textContent = fmtTime(Math.max(0, P.left));
  const ring = $('#ring', player);
  if (ring) {
    const st = P.steps[P.i];
    const total = P.phase === 'rest' ? st.rest : st.secs;
    ring.style.strokeDashoffset = String(283 * (1 - Math.max(0, P.left) / total));
  }
}

function drawPlayer() {
  unmountFigures(player);
  const st = P.steps[P.i];
  const ex = EX[st.ex];
  const rest = P.phase === 'rest';
  const next = rest ? P.steps[P.i + 1] : null;
  const showEx = rest ? EX[next.ex] : ex;
  const showSt = rest ? next : st;
  const timed = rest || st.secs;
  const total = rest ? st.rest : st.secs;
  const pct = ((P.i + (rest ? 1 : 0)) / P.steps.length) * 100;
  player.innerHTML = `
    <div class="pl-top">
      <button class="icon-btn" data-pl="quit" aria-label="Close">✕</button>
      <div class="pl-progress"><div class="bar"><i style="width:${pct}%"></i></div>
        <span>${esc(st.block)} · Step ${P.i + 1} of ${P.steps.length}</span></div>
      <span class="pl-elapsed" id="elapsed">${fmtTime((Date.now() - P.started) / 1000)}</span>
    </div>
    <div class="pl-body ${rest ? 'is-rest' : ''}">
      <div class="eyebrow">${rest ? 'Rest · next up' : esc(st.label || st.block)}</div>
      <h2>${esc(showEx.name)}</h2>
      <div class="pl-fig" id="plFig"></div>
      <p class="cue" id="plCue">&nbsp;</p>
      ${rest ? `<p class="pl-presc">${esc(showSt.label || '')} ${esc(prescription({ ...showSt, sets: 1 }))}</p>` : ''}
      ${timed ? `
        <div class="timer">
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" class="ring-bg"/><circle id="ring" cx="50" cy="50" r="45" class="ring ${rest ? 'rest' : ''}" style="stroke-dashoffset:${283 * (1 - P.left / total)}"/></svg>
          <div class="count" id="count">${fmtTime(P.left)}</div>
        </div>` : `
        <div class="reps"><b>${st.reps}</b><span>reps${ex.perSide ? ' each side' : ''}</span></div>`}
      ${!rest ? `<p class="pl-presc">${st.secs && ex.perSide && !st.note && !/side/i.test(st.label) ? 'Per side · ' : ''}${esc(st.note || '')}</p>` : ''}
    </div>
    <div class="pl-controls">
      <button class="btn ghost" data-pl="prev" ${P.i === 0 && !rest ? 'disabled' : ''}>⏮</button>
      ${timed
        ? `<button class="btn primary big" data-pl="pause">${P.paused ? '▶ Resume' : '⏸ Pause'}</button>`
        : `<button class="btn primary big" data-pl="done">✓ Done</button>`}
      <button class="btn ghost" data-pl="skip">${rest ? 'Skip rest' : '⏭'}</button>
    </div>
    ${rest ? '<button class="btn ghost small add" data-pl="add">+15 s</button>' : ''}
    <button class="btn ghost small how" data-detail="${showEx.id}">How to do it</button>`;
  mountFigure($('#plFig', player), showEx.id, { autoplay: true, onCue: (c) => { const e = $('#plCue', player); if (e) e.textContent = c; } });
}

function finishPlayer() {
  clearInterval(P.timer);
  P.phase = 'finish';
  P.duration = Math.round((Date.now() - P.started) / 1000);
  beep(988, 0.35);
  unmountFigures(player);
  player.innerHTML = `
    <div class="pl-finish">
      <div class="big-emoji">🎉</div>
      <h2>Workout complete!</h2>
      <p>${esc(P.session.title)} · ${fmtTime(P.duration)}</p>
      <h3>How did it feel?</h3>
      <div class="chips center">
        ${['😌 Easy', '🙂 Just right', '🥵 Hard'].map((x) => `<button class="chip" data-effort="${x}">${x}</button>`).join('')}
      </div>
      <p class="muted small">If it felt easy, next time slow down the lowering part of each rep. If hard, take longer rests.</p>
      <button class="btn primary big" data-pl="save">Save workout</button>
    </div>`;
}

function logSession(session, extra = {}) {
  const exIds = [...new Set(session.blocks.filter((b) => b.name !== 'Warm-up').flatMap((b) => b.items.map((i) => i.ex)))];
  state.sessions.push({
    id: Date.now().toString(36),
    date: today(),
    phase: session.phase,
    key: session.key,
    title: session.title,
    focus: session.focus,
    exercises: exIds,
    back: daily().back,
    ...extra,
  });
  delete daily().focus;
  delete daily().shuffle;
  save();
}

function closePlayer() {
  clearInterval(P?.timer);
  keepAwake(false);
  unmountFigures(player);
  player.hidden = true;
  player.innerHTML = '';
  document.body.classList.remove('playing');
  P = null;
  render();
}

player.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-pl],[data-effort],[data-detail]');
  if (!b || !P) return;
  if (b.dataset.detail) return openDetail(b.dataset.detail);
  if (b.dataset.effort) {
    P.effort = b.dataset.effort;
    player.querySelectorAll('[data-effort]').forEach((x) => x.classList.toggle('on', x === b));
    return;
  }
  const act = b.dataset.pl;
  if (act === 'done' || act === 'skip') advance();
  else if (act === 'pause') { P.paused = !P.paused; P.lastTick = Date.now(); b.textContent = P.paused ? '▶ Resume' : '⏸ Pause'; }
  else if (act === 'add') { P.left += 15; }
  else if (act === 'prev') {
    if (P.phase === 'rest') enterStep(P.i, 'work');
    else if (P.i > 0) enterStep(P.i - 1, 'work');
  } else if (act === 'save') {
    logSession(P.session, { durationSec: P.duration, effort: P.effort });
    closePlayer();
  } else if (act === 'quit') {
    const done = P.done.size;
    if (done >= P.steps.length * 0.6 && confirm(`You finished ${done} of ${P.steps.length} steps. Save this workout as done?`)) {
      logSession(P.session, { durationSec: Math.round((Date.now() - P.started) / 1000), effort: 'Partial' });
      closePlayer();
    } else if (confirm('Quit this workout?')) closePlayer();
  }
});

// ---------------- Events ----------------
document.querySelector('.tabs').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  render();
  window.scrollTo(0, 0);
});

view.addEventListener('click', (ev) => {
  const t = ev.target.closest('button,[data-detail]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.detail) return openDetail(ds.detail);
  if (ds.start) return startPlayer(shownSessions[ds.start]);
  if (ds.quicklog) {
    if (confirm('Log this workout as done without the timer?')) { logSession(shownSessions[ds.quicklog]); render(); }
    return;
  }
  if (ds.back) { daily().back = daily().back === ds.back ? undefined : ds.back; save(); return render(); }
  if (ds.focus) { daily().focus = ds.focus; daily().shuffle = 0; save(); return render(); }
  if ('shuffle' in ds) { daily().shuffle = (daily().shuffle || 0) + 1; save(); return render(); }
  if (ds.day) {
    const d = Number(ds.day);
    const days = state.settings.days;
    state.settings.days = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    save(); return render();
  }
  if (ds.del) {
    if (confirm('Delete this workout from your history?')) { state.sessions = state.sessions.filter((s) => s.id !== ds.del); save(); render(); }
    return;
  }
  if (ds.act === 'skip') { state.settings.skipPhase1 = true; save(); render(); }
  if (ds.act === 'unskip') { state.settings.skipPhase1 = false; save(); render(); }
  if (ds.act === 'export') exportData();
  if (ds.act === 'reset' && confirm('Delete ALL workouts and settings? This cannot be undone.')) {
    state = structuredClone(DEFAULT); save(); render();
  }
});

view.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.id === 'weight') { state.settings.weightLb = Math.max(1, Number(t.value) || 25); save(); render(); }
  if (t.id === 'sound') { state.settings.sound = t.checked; save(); }
  if (t.id === 'importFile' && t.files[0]) importData(t.files[0]);
});

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kettlebell-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.sessions)) throw new Error('bad file');
    if (!confirm(`Import ${data.sessions.length} workouts? This replaces your current data.`)) return;
    state = { ...structuredClone(DEFAULT), ...data, settings: { ...DEFAULT.settings, ...data.settings } };
    save(); render();
  } catch {
    alert('That file does not look like a Kettlebell Coach backup.');
  }
}

// Re-render when the day changes while the app is open.
let lastDay = today();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && today() !== lastDay && !P) { lastDay = today(); render(); }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
