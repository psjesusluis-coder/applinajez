import {
  useState, useCallback, useMemo, useRef, useEffect, useContext, createContext,
} from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, ViewportPortal, applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PAREJA, FILIACION, EMOCION, GROUPS, ALL, LEGACY } from './relations.js';

const STORAGE_KEY = 'linaje-genograma-v6';
const NODE = 120;
const HALF = 60;
const PAIR_DROP = 30;   // bajada desde la base de cada persona hasta la barra de pareja
const BUS_GAP = 40;     // distancia desde la barra de pareja hasta la línea de hermanos (PDF)
const GEN_GAP = 200;    // distancia vertical entre generaciones
const PAIR_GAP = 190;   // distancia horizontal de centro a centro en pareja
const SIB_GAP = 170;    // distancia horizontal de centro a centro entre hermanos
const LINE = { color: '#000000', width: 2 };   // mismo trazo para toda la estructura familiar
const Ctx = createContext({ act: () => {} });

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const find = (list, id) => list.find((n) => n.id === id);
const byIdMap = (nodes) => Object.fromEntries(nodes.map((n) => [n.id, n]));
const opposite = (gender) => (gender === 'F' ? 'M' : 'F');
const pairKey = (a, b) => [a, b].sort().join('|');

/* ---------- Modelo ---------- */

const mkLink = (type, a, b, kind) => ({ id: uid(), type, a, b, kind });
const withNode = (g, node) => ({ ...g, nodes: [...g.nodes, node] });
const withLink = (g, link) => ({ ...g, links: [...g.links, link] });

const personNode = (id, x, y, data = {}) => ({
  id,
  type: 'person',
  position: { x, y },
  data: { name: '', year: '', gender: 'M', deceased: false, index: false, ...data },
});

const parentIds = (g, id) => g.links.filter((l) => l.type === 'filiacion' && l.b === id).map((l) => l.a);

const spouseIds = (g, id) =>
  g.links
    .filter((l) => l.type === 'pareja' && (l.a === id || l.b === id))
    .map((l) => (l.a === id ? l.b : l.a));

const spouseLinked = (g, a, b) =>
  g.links.some((l) => l.type === 'pareja' && ((l.a === a && l.b === b) || (l.a === b && l.b === a)));

const overlaps = (nodes, x, y) =>
  nodes.some((n) => Math.abs(n.position.x - x) < 150 && Math.abs(n.position.y - y) < 100);

// Busca un lugar libre en la misma fila, avanzando en la dirección indicada (+1 o -1)
const freeXDir = (nodes, x, y, dir) => {
  let nx = x;
  while (overlaps(nodes, nx, y)) nx += 170 * dir;
  return nx;
};

// Lugar para una pareja nueva: el esposo siempre queda a la izquierda, la esposa a la derecha
function spouseSlot(nodes, p, newGender) {
  const dir = newGender === 'M' ? -1 : 1;
  return freeXDir(nodes, p.position.x + dir * PAIR_GAP, p.position.y, dir);
}

// Recentra a los hijos de cada familia bajo el punto medio de sus padres.
// Así la bajada sale del centro de la barra de pareja y cae recta.
function relayoutAll(g) {
  const byId = byIdMap(g.nodes);
  const families = {};

  for (const l of g.links) {
    if (l.type !== 'filiacion') continue;
    const child = byId[l.b];
    if (!child) continue;
    const parents = parentIds(g, child.id).map((id) => byId[id]).filter(Boolean);
    if (!parents.length) continue;
    const key = parents.map((p) => p.id).sort().join('|');
    if (!families[key]) families[key] = { parents, children: new Set() };
    families[key].children.add(child.id);
  }

  const pos = {};
  for (const fam of Object.values(families)) {
    const parents = fam.parents;
    const midCx = parents.reduce((s, p) => s + p.position.x + HALF, 0) / parents.length;
    const y = Math.max(...parents.map((p) => p.position.y)) + GEN_GAP;
    const kids = [...fam.children]
      .map((id) => byId[id])
      .sort((a, b) => a.position.x - b.position.x);
    const n = kids.length;
    kids.forEach((kid, i) => {
      pos[kid.id] = { x: midCx - HALF + (i - (n - 1) / 2) * SIB_GAP, y };
    });
  }

  return {
    ...g,
    nodes: g.nodes.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)),
  };
}

/* ---------- Acciones de los botones ---------- */

// + Pareja: el esposo a la izquierda, la esposa a la derecha, a la misma altura
function addSpouse(g, personId, newId) {
  const p = find(g.nodes, personId);
  const gender = opposite(p.data.gender);
  const x = spouseSlot(g.nodes, p, gender);
  const next = withNode(g, personNode(newId, x, p.position.y, { name: 'Nueva pareja', gender }));
  return withLink(next, mkLink('pareja', personId, newId, 'matrimonio'));
}

// + Padre/Madre
// - Si el hijo tiene un padre, el nuevo es su pareja del sexo opuesto.
// - Si no tiene padres, se crean los dos (un padre y su pareja).
function addParent(g, childId, newId) {
  const parents = parentIds(g, childId).map((id) => find(g.nodes, id)).filter(Boolean);
  if (parents.length >= 2) return g;

  if (parents.length === 1) {
    const next = addSpouse(g, parents[0].id, newId);
    return withLink(next, mkLink('filiacion', newId, childId, 'biologico'));
  }

  const child = find(g.nodes, childId);
  const y = child.position.y - GEN_GAP;
  let next = withNode(g, personNode(newId, child.position.x, y, { name: 'Nuevo padre', gender: 'M' }));
  const sp = uid();
  next = addSpouse(next, newId, sp);
  next = withLink(next, mkLink('filiacion', newId, childId, 'biologico'));
  return withLink(next, mkLink('filiacion', sp, childId, 'biologico'));
}

// Agrega un hijo a los padres indicados. Si solo hay un padre, crea su pareja del sexo opuesto.
function addChildWithParents(g, parents, newId, name) {
  let base = g;
  const pids = [...parents];

  if (pids.length === 1) {
    const existing = spouseIds(base, pids[0]);
    if (existing.length) {
      pids.push(existing[0]);
    } else {
      const sp = uid();
      base = addSpouse(base, pids[0], sp);
      pids.push(sp);
    }
  }

  let next = withNode(base, personNode(newId, 0, 0, { name }));
  for (const pid of pids) next = withLink(next, mkLink('filiacion', pid, newId, 'biologico'));
  return next;
}

// + Hijo/a
function addChild(g, parentId, newId) {
  return addChildWithParents(g, [parentId], newId, 'Nuevo hijo/a');
}

// + Hermano/a: mismos padres, centrado con los demás hermanos
function addSibling(g, personId, newId) {
  let base = g;
  let parents = parentIds(g, personId);
  if (parents.length === 0) {
    const pid = uid();
    base = addParent(g, personId, pid);
    parents = parentIds(base, personId);
  }
  return addChildWithParents(base, parents, newId, 'Nuevo hermano/a');
}

const ACTIONS = { padre: addParent, hijo: addChild, pareja: addSpouse, hermano: addSibling };

/* ---------- Persistencia ---------- */

const SAMPLE = {
  nodes: [
    { id: 'abuelo', position: { x: 100, y: 0 }, data: { name: 'Pedro García', year: '1945–2020', gender: 'M', deceased: true } },
    { id: 'abuela', position: { x: 340, y: 0 }, data: { name: 'María López', year: '1948–', gender: 'F' } },
    { id: 'padre', position: { x: 220, y: 200 }, data: { name: 'Juan García', year: '1975–', gender: 'M', index: true } },
    { id: 'madre', position: { x: 460, y: 200 }, data: { name: 'Ana Martínez', year: '1978–', gender: 'F' } },
    { id: 'hijo1', position: { x: 120, y: 400 }, data: { name: 'Carlos García', year: '2005–', gender: 'M' } },
    { id: 'hija1', position: { x: 340, y: 400 }, data: { name: 'Sofía García', year: '2008–', gender: 'F' } },
    { id: 'hijo2', position: { x: 560, y: 400 }, data: { name: 'Luis García', year: '2012–', gender: 'M' } },
  ],
  links: [
    { id: 'l1', type: 'pareja', a: 'abuelo', b: 'abuela', kind: 'matrimonio' },
    { id: 'l2', type: 'filiacion', a: 'abuelo', b: 'padre', kind: 'biologico' },
    { id: 'l3', type: 'filiacion', a: 'abuela', b: 'padre', kind: 'biologico' },
    { id: 'l4', type: 'pareja', a: 'padre', b: 'madre', kind: 'matrimonio' },
    { id: 'l5', type: 'filiacion', a: 'padre', b: 'hijo1', kind: 'biologico' },
    { id: 'l6', type: 'filiacion', a: 'madre', b: 'hijo1', kind: 'biologico' },
    { id: 'l7', type: 'filiacion', a: 'padre', b: 'hija1', kind: 'biologico' },
    { id: 'l8', type: 'filiacion', a: 'madre', b: 'hija1', kind: 'biologico' },
    { id: 'l9', type: 'filiacion', a: 'padre', b: 'hijo2', kind: 'biologico' },
    { id: 'l10', type: 'filiacion', a: 'madre', b: 'hijo2', kind: 'biologico' },
    { id: 'l11', type: 'emocion', a: 'padre', b: 'abuelo', kind: 'discordia' },
    { id: 'l12', type: 'emocion', a: 'madre', b: 'hija1', kind: 'amor' },
    { id: 'l13', type: 'emocion', a: 'hijo1', b: 'hijo2', kind: 'distante' },
  ],
};

// Convierte el formato de versiones anteriores (edges) a links
function fromLegacy(edges) {
  const out = [];
  for (const e of edges) {
    const k = LEGACY[e.data?.kind] ?? e.data?.kind;
    const a = String(e.source);
    const b = String(e.target);
    if (FILIACION[k]) out.push({ type: 'filiacion', a, b, kind: k });
    else if (PAREJA[k]) out.push({ type: 'pareja', a, b, kind: k });
    else if (EMOCION[k]) out.push({ type: 'emocion', a, b, kind: k });
  }
  return out;
}

function normalize(data) {
  const nodes = data.nodes.map((n) =>
    personNode(String(n.id), n.position?.x ?? 0, n.position?.y ?? 0, n.data)
  );
  const ids = new Set(nodes.map((n) => n.id));
  const raw = Array.isArray(data.links)
    ? data.links.map((l) => ({ type: l.type, a: String(l.a), b: String(l.b), kind: l.kind }))
    : fromLegacy(data.edges ?? []);
  const types = ['pareja', 'filiacion', 'emocion'];
  const links = raw
    .filter((l) => types.includes(l.type) && ids.has(l.a) && ids.has(l.b) && ALL[l.kind])
    .map((l) => ({ id: uid(), ...l }));
  return relayoutAll({ nodes, links });
}

function serialize(g) {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    links: g.links.map((l) => ({ id: l.id, type: l.type, a: l.a, b: l.b, kind: l.kind })),
  };
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* dañado o sin almacenamiento: usar ejemplo */
  }
  return normalize(SAMPLE);
}

/* ---------- Nodo ---------- */

function PersonNode({ id, data, selected }) {
  const { act } = useContext(Ctx);
  const cls = [
    'person',
    data.gender === 'F' ? 'person--f' : 'person--m',
    selected && 'is-selected',
    data.index && 'is-index',
  ]
    .filter(Boolean)
    .join(' ');

  const q = (type) => (e) => {
    e.stopPropagation();
    act(type, id);
  };

  return (
    <div className={cls}>
      {data.deceased && (
        <svg className="dead-line" viewBox="0 0 120 120" aria-hidden="true">
          <line x1="0" y1="120" x2="120" y2="0" stroke="#1f2937" strokeWidth="2" />
        </svg>
      )}
      <div className="person-name">{data.name || 'Sin nombre'}</div>
      {data.year && <div className="person-year">{data.year}</div>}

      {selected && (
        <>
          <button className="quick nodrag q-top" onClick={q('padre')}>+ Padre/Madre</button>
          <button className="quick nodrag q-bottom" onClick={q('hijo')}>+ Hijo/a</button>
          <button className="quick nodrag q-right" onClick={q('pareja')}>+ Pareja</button>
          <button className="quick nodrag q-left" onClick={q('hermano')}>+ Hermano/a</button>
        </>
      )}
    </div>
  );
}

const nodeTypes = { person: PersonNode };

/* ---------- Trazos ---------- */

// Dibuja un segmento recto con su patrón, adorno y punta
function Segment({ def, x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const P = (t, o = 0) => [x1 + ux * t + nx * o, y1 + uy * t + ny * o];
  const line = (a, b) => `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
  const base = {
    fill: 'none',
    stroke: def.color,
    strokeWidth: def.width,
    strokeDasharray: def.dash,
    strokeLinejoin: 'round',
  };

  const parts = [];
  let k = 0;
  const key = () => k++;

  const straight = (o, extra = {}) =>
    parts.push(<path key={key()} d={line(P(0, o), P(len, o))} {...base} {...extra} />);

  const zig = (o, extra = {}) => {
    const step = def.step ?? 6;
    const amp = def.amp ?? 4;
    const n = Math.max(2, Math.round(len / step));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const off = i === 0 || i === n ? 0 : i % 2 ? amp : -amp;
      pts.push(P((len * i) / n, o + off));
    }
    parts.push(
      <path key={key()} d={`M ${pts.map((p) => p.join(' ')).join(' L ')}`} {...base} {...extra} />
    );
  };

  switch (def.pattern) {
    case 'zigzag':
      zig(0);
      break;
    case 'double':
      straight(-1.5);
      straight(1.5);
      break;
    case 'triple':
      [-3, 0, 3].forEach((o) => straight(o, { strokeWidth: 1.5 }));
      break;
    case 'triple-zig':
      straight(-3, { strokeWidth: 1.5 });
      straight(3, { strokeWidth: 1.5 });
      zig(0, { strokeWidth: 1.5 });
      break;
    case 'band':
      parts.push(
        <path key={key()} d={line(P(0), P(len))} fill="none" stroke={def.color} strokeWidth={6} />
      );
      parts.push(
        <path
          key={key()}
          d={line(P(0), P(len))}
          fill="none"
          stroke="#ffffff"
          strokeWidth={6}
          strokeDasharray="2 4"
          opacity={0.35}
        />
      );
      break;
    default:
      straight(0);
  }

  const m = len / 2;
  const slashAt = (t) =>
    parts.push(
      <path key={key()} d={line(P(t - 4, -6), P(t + 4, 6))} fill="none" stroke={def.color} strokeWidth={1.5} />
    );

  if (def.deco === 'slash') slashAt(m);
  if (def.deco === 'slash2') {
    slashAt(m - 3);
    slashAt(m + 3);
  }
  if (def.deco === 'cross') {
    const [cx, cy] = P(m);
    parts.push(
      <path
        key={key()}
        d={`M ${cx - 6} ${cy - 6} L ${cx + 6} ${cy + 6} M ${cx + 6} ${cy - 6} L ${cx - 6} ${cy + 6}`}
        fill="none"
        stroke={def.color}
        strokeWidth={1.5}
      />
    );
  }
  if (def.deco === 'cut') {
    parts.push(
      <path key={key()} d={line(P(m, -8), P(m, 8))} fill="none" stroke={def.color} strokeWidth={3} />
    );
  }
  if (def.deco === 'circle') {
    const [cx, cy] = P(m);
    parts.push(
      <circle key={key()} cx={cx} cy={cy} r={4} fill="#ffffff" stroke={def.color} strokeWidth={1.5} />
    );
  }
  if (def.deco === 'double-circle') {
    [P(m - 4), P(m + 4)].forEach(([cx, cy]) =>
      parts.push(
        <circle key={key()} cx={cx} cy={cy} r={3.5} fill="#ffffff" stroke={def.color} strokeWidth={1.5} />
      )
    );
  }
  if (def.deco === 'box-x') {
    const [cx, cy] = P(m);
    parts.push(
      <rect key={key()} x={cx - 5} y={cy - 5} width={10} height={10} fill="#ffffff" stroke={def.color} strokeWidth={1.2} />
    );
    parts.push(
      <path
        key={key()}
        d={`M ${cx - 5} ${cy - 5} L ${cx + 5} ${cy + 5} M ${cx + 5} ${cy - 5} L ${cx - 5} ${cy + 5}`}
        fill="none"
        stroke={def.color}
        strokeWidth={1}
      />
    );
  }
  if (def.deco === 'x-end') {
    const a = 6;
    const d1 = [(ux + nx) * a, (uy + ny) * a];
    const d2 = [(ux - nx) * a, (uy - ny) * a];
    parts.push(
      <path
        key={key()}
        d={`M ${x2 - d1[0]} ${y2 - d1[1]} L ${x2 + d1[0]} ${y2 + d1[1]} M ${x2 - d2[0]} ${y2 - d2[1]} L ${x2 + d2[0]} ${y2 + d2[1]}`}
        fill="none"
        stroke="#ef4444"
        strokeWidth={2}
      />
    );
  }

  if (def.arrow) {
    const b1 = P(len - 9, 4.5);
    const b2 = P(len - 9, -4.5);
    parts.push(
      <polygon key={key()} points={`${x2},${y2} ${b1[0]},${b1[1]} ${b2[0]},${b2[1]}`} fill={def.color} />
    );
  }

  return <g>{parts}</g>;
}

// Punto de salida y llegada en el borde de la figura, para relaciones emocionales
function clipBetween(A, B) {
  const dx = B.cx - A.cx;
  const dy = B.cy - A.cy;
  const d = Math.hypot(dx, dy);
  if (d < 1)
