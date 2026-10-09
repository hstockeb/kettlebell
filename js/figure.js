// Stick-figure animation engine.
// Poses are described with joint angles (degrees, 0 = up, 90 = facing direction/right, 180 = down)
// and hand targets solved with 2-bone inverse kinematics. The figure always faces right.

const L = { torso: 52, neck: 5, headR: 9, thigh: 40, shin: 40, upper: 27, fore: 26, foot: 11 };
export const FLOOR = 186;
const SW = 7; // limb stroke width

const rad = (d) => (d * Math.PI) / 180;
const dirv = (a) => [Math.sin(rad(a)), -Math.cos(rad(a))];
const step = (p, a, len) => { const d = dirv(a); return [p[0] + d[0] * len, p[1] + d[1] * len]; };
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

function ik(base, rel, bend) {
  let [dx, dy] = rel;
  let d = Math.hypot(dx, dy);
  const l1 = L.upper, l2 = L.fore, max = l1 + l2 - 0.05, min = Math.abs(l1 - l2) + 6;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  if (d < min) { if (d === 0) { dx = 0; dy = min; } else { dx *= min / d; dy *= min / d; } d = min; }
  const a0 = Math.atan2(dy, dx);
  const off = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const a = a0 + bend * off;
  return { e: [base[0] + l1 * Math.cos(a), base[1] + l1 * Math.sin(a)], w: [base[0] + dx, base[1] + dy] };
}

// Interpolate a vector in polar form so straight arms stay straight while swinging.
function polarLerp(a, b, t) {
  const ra = Math.hypot(...a), rb = Math.hypot(...b);
  const aa = Math.atan2(a[1], a[0]);
  let ab = Math.atan2(b[1], b[0]);
  while (ab - aa > Math.PI) ab -= 2 * Math.PI;
  while (ab - aa < -Math.PI) ab += 2 * Math.PI;
  const r = lerp(ra, rb, t), ang = lerp(aa, ab, t);
  return [r * Math.cos(ang), r * Math.sin(ang)];
}

const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

// Fill pose defaults (far limbs mirror near limbs unless given).
function norm(p, ex) {
  const q = { ...p };
  q.hd ??= 0;
  q.th2 ??= q.th; q.sh2 ??= q.sh;
  const footDef = 'foot' in ex ? ex.foot : 90;
  if (!('ft' in p)) q.ft = footDef;
  if (!('ft2' in p)) q.ft2 = p.th2 == null && 'ft' in p ? p.ft : footDef;
  if (!q.arm && !q.armH) q.arm = [0, 52];
  if (!q.arm2 && !q.armH2) { q.arm2 = q.arm; q.armH2 = q.armH; }
  q.bend ??= ex.bend ?? 1;
  q.bend2 ??= ex.bend2 ?? q.bend;
  return q;
}

function footPoint(ankle, ft, shin) {
  if (ft === null) return null;
  const a = ft === 'shin' ? shin - 90 : ft;
  return step(ankle, a, L.foot);
}

function blend(a, b, t, ex) {
  const n = (k) => lerp(a[k], b[k], t);
  const q = { t: n('t'), hd: n('hd'), th: n('th'), sh: n('sh'), th2: n('th2'), sh2: n('sh2') };
  const fl = (x, y) => (typeof x === 'number' && typeof y === 'number' ? lerp(x, y, t) : (t < 0.5 ? x : y));
  q.ft = fl(a.ft, b.ft); q.ft2 = fl(a.ft2, b.ft2);
  q.bend = t < 0.5 ? a.bend : b.bend; q.bend2 = t < 0.5 ? a.bend2 : b.bend2;
  for (const [s, h] of [['arm', 'armH'], ['arm2', 'armH2']]) {
    if (a[s] && b[s]) q[s] = polarLerp(a[s], b[s], t);
    else q[h] = vlerp(handHip(a, s, h), handHip(b, s, h), t);
  }
  q.kb = t < 0.5 ? a.kb : b.kb;
  return q;
}

function handHip(p, s, h) {
  if (p[h]) return p[h];
  const sh = step([0, 0], p.t, L.torso);
  return [sh[0] + p[s][0], sh[1] + p[s][1]];
}

function solve(p, ex) {
  const hip = [0, 0];
  const sh = step(hip, p.t, L.torso);
  const ha = p.t + p.hd;
  const head = step(step(sh, ha, L.neck), ha, L.headR);
  const k = step(hip, p.th, L.thigh), a = step(k, p.sh, L.shin);
  const k2 = step(hip, p.th2, L.thigh), a2 = step(k2, p.sh2, L.shin);
  const toe = footPoint(a, p.ft, p.sh), toe2 = footPoint(a2, p.ft2, p.sh2);
  const rel = (s, h) => (p[s] ? p[s] : [p[h][0] - sh[0], p[h][1] - sh[1]]);
  const A = ik(sh, rel('arm', 'armH'), p.bend);
  const A2 = ik(sh, rel('arm2', 'armH2'), p.bend2);
  const pts = { hip, sh, head, k, a, k2, a2, toe, toe2, e: A.e, w: A.w, e2: A2.e, w2: A2.w };

  // Kettlebell placement
  const kbSpec = p.kb !== undefined ? p.kb : ex.kb;
  let kb = null;
  if (kbSpec === 'hang') kb = { ring: A.w, c: [A.w[0], A.w[1] + 11] };
  else if (kbSpec === 'line') {
    const dx = A.w[0] - A.e[0], dy = A.w[1] - A.e[1], d = Math.hypot(dx, dy) || 1;
    kb = { ring: A.w, c: [A.w[0] + (dx / d) * 11, A.w[1] + (dy / d) * 11] };
  } else if (kbSpec && kbSpec.at) {
    const base = pts[kbSpec.at];
    const c = [base[0] + kbSpec.off[0], base[1] + kbSpec.off[1]];
    kb = { ring: [c[0], c[1] - 9], c };
  }

  // Shift: x anchor joint, y so the lowest body point rests on the floor
  const anc = ex.anchor || { j: 'a', x: 100 };
  const dx = anc.x - pts[anc.j][0];
  let maxY = head[1] + L.headR + 1.5 - SW / 2;
  for (const key of ['hip', 'sh', 'k', 'a', 'k2', 'a2', 'toe', 'toe2', 'e', 'w', 'e2', 'w2']) {
    if (pts[key]) maxY = Math.max(maxY, pts[key][1]);
  }
  const dy = anc.y != null ? anc.y - pts[anc.j][1] : FLOOR - SW / 2 - maxY;
  const mv = (q) => (q ? [q[0] + dx, q[1] + dy] : null);
  const out = {};
  for (const key in pts) out[key] = mv(pts[key]);
  if (kb) out.kb = { ring: mv(kb.ring), c: mv(kb.c) };
  return out;
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  parent && parent.appendChild(n);
  return n;
};
const pl = (...ps) => ps.filter(Boolean).map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

// Build an animated figure into a container element.
export function createFigure(container, ex, { onCue } = {}) {
  const anim = ex.anim;
  const svg = el('svg', { viewBox: '-4 -18 208 210', class: 'fig', role: 'img', 'aria-label': ex.name + ' animation' });
  el('line', { x1: 8, y1: FLOOR, x2: 192, y2: FLOOR, class: 'fig-floor' }, svg);
  const common = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': SW };
  const farLeg = el('polyline', { ...common, class: 'fig-far' }, svg);
  const farArm = el('polyline', { ...common, class: 'fig-far' }, svg);
  const torso = el('polyline', { ...common, class: 'fig-body' }, svg);
  const head = el('circle', { r: L.headR, class: 'fig-head' }, svg);
  const nearLeg = el('polyline', { ...common, class: 'fig-body' }, svg);
  const kbRing = el('circle', { r: 4.5, class: 'fig-kb-ring', fill: 'none', 'stroke-width': 3 }, svg);
  const kbBody = el('circle', { r: 8.5, class: 'fig-kb' }, svg);
  const nearArm = el('polyline', { ...common, class: 'fig-body' }, svg);
  container.appendChild(svg);

  const poses = anim.poses.map((p) => norm(p, anim));
  let seq = poses.map((_, i) => i);
  if (!anim.loop && poses.length > 2) seq = seq.concat(seq.slice(1, -1).reverse());

  function draw(pose) {
    const P = solve(pose, anim);
    farLeg.setAttribute('points', pl(P.hip, P.k2, P.a2, P.toe2));
    farArm.setAttribute('points', pl(P.sh, P.e2, P.w2));
    torso.setAttribute('points', pl(P.hip, P.sh));
    head.setAttribute('cx', P.head[0]); head.setAttribute('cy', P.head[1]);
    nearLeg.setAttribute('points', pl(P.hip, P.k, P.a, P.toe));
    nearArm.setAttribute('points', pl(P.sh, P.e, P.w));
    const show = P.kb ? '' : 'none';
    kbRing.style.display = kbBody.style.display = show;
    if (P.kb) {
      kbRing.setAttribute('cx', P.kb.ring[0]); kbRing.setAttribute('cy', P.kb.ring[1]);
      kbBody.setAttribute('cx', P.kb.c[0]); kbBody.setAttribute('cy', P.kb.c[1]);
    }
  }

  const move = anim.move ?? 900, hold = anim.hold ?? 350;
  const segDur = (to) => (poses[to].move ?? move) + (poses[to].hold ?? hold);
  let idx = 0, segStart = 0, raf = 0, playing = false, lastCue = -1;

  function frame(now) {
    if (!segStart) segStart = now;
    let to = seq[(idx + 1) % seq.length];
    while (now - segStart > segDur(to)) {
      segStart += segDur(to);
      idx = (idx + 1) % seq.length;
      to = seq[(idx + 1) % seq.length];
    }
    const from = seq[idx];
    const m = poses[to].move ?? move;
    const t = Math.min(1, (now - segStart) / m);
    draw(blend(poses[from], poses[to], ease(t), anim));
    const cueIdx = t >= 1 ? to : from;
    if (onCue && cueIdx !== lastCue && poses[cueIdx].cue) { lastCue = cueIdx; onCue(poses[cueIdx].cue); }
    if (playing) raf = requestAnimationFrame(frame);
  }

  const api = {
    svg,
    play() {
      if (playing) return;
      playing = true; segStart = 0; raf = requestAnimationFrame(frame);
    },
    stop() { playing = false; cancelAnimationFrame(raf); },
    show(i = anim.poster ?? poses.length - 1) { api.stop(); draw(poses[i]); },
  };
  api.show();
  return api;
}
