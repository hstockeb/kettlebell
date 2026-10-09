// Training program: Phase 1 (3x/week foundation, 3 weeks) then Phase 2 (daily 20-minute rotation).
import { EX } from './exercises.js';

export const PHASE1_SESSIONS = 9;

const it = (ex, o) => ({ ex, ...o });

function warmup() {
  return {
    name: 'Warm-up',
    mode: 'circuit', rounds: 1, rest: 10,
    items: [
      it('hinge', { reps: 8 }),
      it('birddog', { reps: 4, note: 'Hold each rep 5 seconds' }),
      it('deadbug', { reps: 5 }),
      it('bridge', { reps: 10, note: 'No weight yet' }),
      it('halo', { reps: 5, note: '5 each direction' }),
    ],
  };
}

function cooldown() {
  return { name: 'Cool-down', mode: 'sets', items: [it('hipflexor', { sets: 1, secs: 30, rest: 5 })] };
}

const P1_WEEK = {
  1: { sets: 2, rest: 75, add: 0, hold: 0 },
  2: { sets: 3, rest: 60, add: 0, hold: 5 },
  3: { sets: 3, rest: 45, add: 2, hold: 10 },
};

function workoutA(w) {
  const p = P1_WEEK[w];
  const s = { sets: p.sets, rest: p.rest };
  const items = [
    it('deadlift', { ...s, reps: 10 + p.add }),
    it('gobletsquat', { ...s, reps: 8 + p.add }),
    it('row', { ...s, reps: 8 + p.add }),
  ];
  if (w >= 2) items.push(it('swing', { ...s, reps: w === 2 ? 10 : 15, note: 'Only if your deadlift feels solid. Otherwise do deadlifts.' }));
  items.push(it('bridge', { ...s, reps: 12, note: 'Kettlebell on your hips' }));
  items.push(it('sideplank', { ...s, secs: 15 + p.hold, rest: 30 }));
  return { title: 'Workout A · Hinge & Squat', blocks: [warmup(), { name: 'Strength', mode: 'sets', items }, cooldown()] };
}

function workoutB(w) {
  const p = P1_WEEK[w];
  const s = { sets: p.sets, rest: p.rest };
  const items = [
    it('lunge', { ...s, reps: 6 + p.add }),
    it('floorpress', { ...s, reps: 8 + p.add }),
    it('press', { ...s, reps: [5, 6, 8][w - 1] }),
    it('pullover', { ...s, reps: 10 }),
  ];
  if (w === 3) items.push(it('swing', { ...s, reps: 12 }));
  items.push(it('carry', { ...s, secs: w === 3 ? 40 : 30, rest: 30 }));
  items.push(it('plank', { ...s, secs: 20 + p.hold, rest: 30 }));
  return { title: 'Workout B · Push, Pull & Carry', blocks: [warmup(), { name: 'Strength', mode: 'sets', items }, cooldown()] };
}

const P1_ORDER = ['A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A'];

export function phase1Session(i) {
  const week = Math.floor(i / 3) + 1;
  const kind = P1_ORDER[i];
  const s = kind === 'A' ? workoutA(week) : workoutB(week);
  return {
    phase: 1,
    key: `p1-${i + 1}`,
    title: s.title,
    subtitle: `Phase 1 · Week ${week} · Session ${(i % 3) + 1} of 3`,
    blocks: s.blocks,
  };
}

// ---------- Phase 2 ----------

export const FOCUS = {
  lower: { name: 'Lower Body & Core', icon: '🦵' },
  upper: { name: 'Upper Body & Core', icon: '💪' },
  swing: { name: 'Swing Conditioning', icon: '🔥' },
  full: { name: 'Full-Body Circuit', icon: '⚡' },
  mobility: { name: 'Mobility & Back Care', icon: '🧘' },
};
export const FOCUS_ORDER = ['lower', 'upper', 'swing', 'full', 'mobility'];

const POOLS = {
  lower: ['deadlift', 'gobletsquat', 'lunge', 'kickstand', 'bridge', 'swing'],
  upper: ['row', 'press', 'floorpress', 'pullover', 'pushup', 'halo'],
  core: ['plank', 'sideplank', 'carry', 'deadbug', 'birddog'],
  warm: ['birddog', 'deadbug', 'bridge', 'halo'],
  mobility: ['birddog', 'deadbug', 'bridge', 'hipflexor', 'halo', 'sideplank', 'hinge'],
};

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Pick k exercises, preferring ones not done in the previous session.
function pick(pool, k, avoid, rand) {
  const shuffled = [...pool].sort(() => rand() - 0.5);
  const fresh = shuffled.filter((x) => !avoid.has(x));
  const old = shuffled.filter((x) => avoid.has(x));
  return [...fresh, ...old].slice(0, k);
}

export function level(n) {
  if (n < 10) return { work: 30, rest: 30, swings: 10, label: 'Level 1 · 30 s on / 30 s off' };
  if (n < 20) return { work: 40, rest: 20, swings: 15, label: 'Level 2 · 40 s on / 20 s off' };
  return { work: 45, rest: 15, swings: 20, label: 'Level 3 · 45 s on / 15 s off' };
}

const sideNote = (id) => (EX[id].perSide ? 'Switch sides halfway' : undefined);

export function phase2Session({ n, focus, seed, avoid = new Set() }) {
  const rand = rng(seed);
  const lv = level(n);
  const warmIds = ['hinge', ...pick(POOLS.warm, 2, new Set(), rand)];
  const warm = {
    name: 'Warm-up', mode: 'circuit', rounds: 1, rest: 10,
    items: warmIds.map((id) => it(id, { secs: 40, note: sideNote(id) })),
  };
  const coreAvoid = new Set([...avoid, ...warmIds]);
  const core = (k = 2) => ({
    name: 'Core Finisher', mode: 'circuit', rounds: 2, rest: 15,
    items: pick(POOLS.core, k, coreAvoid, rand).map((id) => it(id, { secs: 30, note: sideNote(id) })),
  });
  const circuit = (ids, rounds = 3) => ({
    name: 'Main Circuit', mode: 'circuit', rounds, rest: lv.rest,
    items: ids.map((id) => it(id, { secs: lv.work, note: sideNote(id) })),
  });

  let blocks;
  if (focus === 'lower') blocks = [warm, circuit(pick(POOLS.lower, 4, avoid, rand)), core()];
  else if (focus === 'upper') blocks = [warm, circuit(pick(POOLS.upper, 4, avoid, rand)), core()];
  else if (focus === 'full') {
    const ids = [...pick(POOLS.lower.filter((x) => x !== 'swing'), 2, avoid, rand), ...pick(POOLS.upper, 2, avoid, rand), 'swing'];
    blocks = [warm, circuit(ids), core(1)];
  } else if (focus === 'swing') {
    const alt = pick(['gobletsquat', 'deadlift', 'pushup', 'row'], 1, avoid, rand)[0];
    const altReps = { gobletsquat: 6, deadlift: 8, pushup: 6, row: 5 }[alt];
    blocks = [
      warm,
      {
        name: 'EMOM · Every Minute On the Minute', mode: 'circuit', rounds: 5, rest: 0,
        items: [
          it('swing', { secs: 60, note: `Do ${lv.swings} swings, rest the rest of the minute` }),
          it(alt, { secs: 60, note: `Do ${altReps}${EX[alt].perSide ? ' per side' : ''}, rest the rest of the minute` }),
        ],
      },
      core(),
    ];
  } else {
    blocks = [
      {
        name: 'Mobility Flow', mode: 'circuit', rounds: 2, rest: 15,
        items: pick(POOLS.mobility, 6, new Set(), rand).map((id) => it(id, { secs: 45, note: sideNote(id) })),
      },
    ];
  }
  return {
    phase: 2,
    key: `p2-${focus}`,
    focus,
    title: `${FOCUS[focus].icon} ${FOCUS[focus].name}`,
    subtitle: `Phase 2 · Day ${n + 1} · ${lv.label}`,
    blocks,
  };
}

export function backCareSession() {
  return {
    phase: 0,
    key: 'care',
    title: '🧘 Back Care (10 min)',
    subtitle: 'Gentle session — does not count toward your program',
    blocks: [
      {
        name: 'Back Care Circuit', mode: 'circuit', rounds: 2, rest: 15,
        items: [
          it('hinge', { reps: 8 }),
          it('birddog', { reps: 5, note: 'Hold each rep 5 seconds' }),
          it('deadbug', { reps: 6 }),
          it('bridge', { reps: 12 }),
          it('sideplank', { secs: 15, note: 'Switch sides halfway — or do it from the knees' }),
          it('hipflexor', { secs: 40, note: 'Switch sides halfway' }),
        ],
      },
    ],
  };
}

// Flatten blocks into player steps.
export function flatten(session) {
  const steps = [];
  for (const b of session.blocks) {
    if (b.mode === 'circuit') {
      for (let r = 1; r <= b.rounds; r++) {
        b.items.forEach((item) => {
          steps.push({ ...item, block: b.name, label: b.rounds > 1 ? `Round ${r} of ${b.rounds}` : '', rest: b.rest });
        });
      }
    } else {
      for (const item of b.items) {
        const sides = item.secs && EX[item.ex].perSide ? ['Left side', 'Right side'] : [null];
        for (let s = 1; s <= (item.sets || 1); s++) {
          sides.forEach((side, i) => {
            const label = [item.sets > 1 ? `Set ${s} of ${item.sets}` : '', side].filter(Boolean).join(' · ');
            steps.push({ ...item, block: b.name, label, rest: side && i === 0 ? 5 : item.rest ?? 60 });
          });
        }
      }
    }
  }
  if (steps.length) steps[steps.length - 1].rest = 0;
  return steps;
}

export function stepSeconds(st) {
  const work = st.secs || st.reps * 4 * (EX[st.ex].perSide ? 2 : 1);
  return work + (st.rest || 0);
}

export function estimateMinutes(session) {
  return Math.max(5, Math.round(flatten(session).reduce((a, s) => a + stepSeconds(s), 0) / 60));
}

export function prescription(item) {
  const per = EX[item.ex].perSide;
  let s = item.secs ? `${item.secs} s` : `${item.reps} reps`;
  if (per && !(item.secs && item.note)) s += ' / side';
  if (item.sets > 1) s = `${item.sets} × ${s}`;
  return s;
}
