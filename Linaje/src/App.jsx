import {
  useState, useCallback, useMemo, useRef, useEffect, useContext, createContext,
} from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, ViewportPortal,
  applyNodeChanges, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toJpeg } from 'html-to-image';
import { PAREJA, FILIACION, EMOCION, GROUPS, ALL, LEGACY } from './relations.js';

const STORAGE_KEY = 'linaje-genograma-v6';
const NODE = 120;
const HALF = 60;
const PAIR_DROP = 30;
const GEN_GAP = 230;
const PAIR_GAP = 190;
const SIB_GAP = 170;
const LINE = { color: '#000000', width: 2 };
const HALO = 90;
const PAD = 40;

const HOUSEHOLD_COLORS = {
  azul: { box: 'rgba(37, 99, 235, 0.12)', border: '#1d4ed8' },
  verde: { box: 'rgba(16, 185, 129, 0.14)', border: '#047857' },
  ambar: { box: 'rgba(245, 158, 11, 0.16)', border: '#b45309' },
  gris: { box: 'rgba(107, 114, 128, 0.12)', border: '#374151' },
};

const REL_OPTIONS = [
  { value: 'padre', label: 'Padre', gender: 'M' },
  { value: 'madre', label: 'Madre', gender: 'F' },
  { value: 'pareja', label: 'Pareja', gender: null },
  { value: 'hijo', label: 'Hijo', gender: 'M' },
  { value: 'hija', label: 'Hija', gender: 'F' },
  { value: 'hermano', label: 'Hermano', gender: 'M' },
  { value: 'hermana', label: 'Hermana', gender: 'F' },
];
const REL_GENDER = Object.fromEntries(REL_OPTIONS.map((o) => [o.value, o.gender]));
const REL_LABEL = Object.fromEntries(REL_OPTIONS.map((o) => [o.value, o.label]));

const Ctx = createContext({ act: () => {}, marks: {}, editPoints: () => {} });

const snap = (v) => Math.round(v);

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const find = (list, id) => list.find((n) => n.id === id);
const byIdMap = (nodes) => Object.fromEntries(nodes.map((n) => [n.id, n]));
const opposite = (gender) => (gender === 'F' ? 'M' : 'F');
const pairKey = (a, b) => [a, b].sort().join('|');
const ageText = (age) => (age ? `${age} años` : '');

/* ---------- Ícono de descarga ---------- */

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

/* ---------- Geometría del hogar (formas rectas) ---------- */

const rectPoints = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

function polyPath(pts) {
  if (pts.length < 3) return '';
  return `M ${pts.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`;
}

function centroid(pts) {
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
}

function bounds(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function convexHull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function fitPoints(household, nodes) {
  const members = household.members.map((id) => find(nodes, id)).filter(Boolean);
  if (!members.length) return household.points;
  const samples = [];
  for (const m of members) {
    const cx = snap(m.position.x) + HALF;
    const cy = snap(m.position.y) + HALF;
    for (let k = 0; k < 12; k++) {
      const a = (2 * Math.PI * k) / 12;
      samples.push({ x: snap(cx + HALO * Math.cos(a)), y: snap(cy + HALO * Math.sin(a)) });
    }
  }
  const hull = convexHull(samples);
  return hull.length >= 3 ? hull : household.points;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

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

const freeXDir = (nodes, x, y, dir) => {
  let nx = x;
  while (overlaps(nodes, nx, y)) nx += 170 * dir;
  return nx;
};

function spouseSlot(nodes, p, newGender) {
  const dir = newGender === 'M' ? -1 : 1;
  return freeXDir(nodes, p.position.x + dir * PAIR_GAP, p.position.y, dir);
}

function relayoutOnce(g, onlyId) {
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
    if (onlyId && !fam.parents.some((p) => p.id === onlyId) && !fam.children.has(onlyId)) continue;

    const centers = fam.parents.map((p) => snap(p.position.x) + HALF);
    const cx = snap(centers.reduce((s, c) => s + c, 0) / centers.length);
    const y = snap(Math.max(...fam.parents.map((p) => snap(p.position.y)))) + GEN_GAP;

    const kids = [...fam.children]
      .map((id) => byId[id])
      .sort((a, b) => a.position.x - b.position.x);
    const n = kids.length;
    kids.forEach((kid, i) => {
      const centerX = cx + (i - (n - 1) / 2) * SIB_GAP;
      pos[kid.id] = { x: snap(centerX - HALF), y };
    });
  }

  return {
    ...g,
    nodes: g.nodes.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)),
  };
}

function relayoutAll(g, onlyId = null) {
  let cur = relayoutOnce(g, onlyId);
  cur = relayoutOnce(cur, null);
  cur = relayoutOnce(cur, null);
  return cur;
}

/* ---------- Acciones de los botones ---------- */

function addSpouse(g, personId, newId) {
  const p = find(g.nodes, personId);
  const gender = opposite(p.data.gender);
  const x = spouseSlot(g.nodes, p, gender);
  const next = withNode(g, personNode(newId, x, p.position.y, { name: 'Nueva pareja', gender }));
  return withLink(next, mkLink('pareja', personId, newId, 'matrimonio'));
}

function addFamily(g, manId, womanId) {
  const x = freeXDir(g.nodes, 300, 150, 1);
  let next = withNode(g, personNode(manId, x, 150, { name: 'Nuevo padre', gender: 'M' }));
  next = withNode(next, personNode(womanId, x + PAIR_GAP, 150, { name: 'Nueva madre', gender: 'F' }));
  next = withLink(next, mkLink('pareja', manId, womanId, 'matrimonio'));
  return relayoutAll(next);
}

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

function addChild(g, parentId, newId) {
  return addChildWithParents(g, [parentId], newId, 'Nuevo hijo/a');
}

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

/* ---------- Armado automático desde el formulario de preguntas ---------- */

function buildFromAnswers({ person, members }) {
  const idxGender = person.sexo === 'F' ? 'F' : 'M';
  const idxName = person.nombre.trim() || 'Persona índice';
  const idxId = uid();
  const nodes = [
    personNode(idxId, 0, 150, {
      name: idxName,
      year: ageText(person.edad),
      gender: idxGender,
      index: true,
    }),
  ];
  const links = [];
  const tableIds = [];

  const rows = members.filter((m) => m.vinculo && (m.nombre.trim() || m.edad));
  const rowName = (r) => r.nombre.trim() || REL_LABEL[r.vinculo] || 'Persona';
  const pick = (v) => rows.find((r) => r.vinculo === v);
  const padreRow = pick('padre');
  const madreRow = pick('madre');
  const parejaRow = pick('pareja');
  const hijos = rows.filter((r) => r.vinculo === 'hijo' || r.vinculo === 'hija');
  const hermanos = rows.filter((r) => r.vinculo === 'hermano' || r.vinculo === 'hermana');

  const addPerson = (name, age, gender, x, y, inTable) => {
    const id = uid();
    nodes.push(personNode(id, x, y, { name, year: ageText(age), gender }));
    if (inTable) tableIds.push(id);
    return id;
  };

  const hasParents = Boolean(padreRow || madreRow || hermanos.length);
  if (hasParents) {
    const paId = addPerson(
      padreRow ? rowName(padreRow) : 'Padre',
      padreRow?.edad,
      'M',
      0,
      -80,
      Boolean(padreRow)
    );
    const maId = addPerson(
      madreRow ? rowName(madreRow) : 'Madre',
      madreRow?.edad,
      'F',
      PAIR_GAP,
      -80,
      Boolean(madreRow)
    );
    links.push(mkLink('pareja', paId, maId, 'matrimonio'));
    links.push(mkLink('filiacion', paId, idxId, 'biologico'));
    links.push(mkLink('filiacion', maId, idxId, 'biologico'));

    hermanos.forEach((h, i) => {
      const id = addPerson(rowName(h), h.edad, REL_GENDER[h.vinculo] ?? opposite(idxGender), (i + 1) * SIB_GAP, 150, true);
      links.push(mkLink('filiacion', paId, id, 'biologico'));
      links.push(mkLink('filiacion', maId, id, 'biologico'));
    });
  }

  let partnerId = null;
  if (parejaRow || hijos.length) {
    partnerId = addPerson(
      parejaRow ? rowName(parejaRow) : 'Pareja',
      parejaRow?.edad,
      opposite(idxGender),
      PAIR_GAP,
      150,
      Boolean(parejaRow)
    );
    links.push(mkLink('pareja', idxId, partnerId, 'matrimonio'));
  }

  const kidParents = partnerId ? [idxId, partnerId] : [idxId];
  hijos.forEach((h, i) => {
    const id = addPerson(rowName(h), h.edad, REL_GENDER[h.vinculo] ?? opposite(idxGender), i * SIB_GAP, 350, true);
    kidParents.forEach((p) => links.push(mkLink('filiacion', p, id, 'biologico')));
  });

  let g = relayoutAll({ nodes, links, households: [] });

  if (partnerId) {
    const idx = find(g.nodes, idxId);
    const others = g.nodes.filter((n) => n.id !== partnerId);
    const x = freeXDir(others, idx.position.x + PAIR_GAP, idx.position.y, 1);
    g = {
      ...g,
      nodes: g.nodes.map((n) => (n.id === partnerId ? { ...n, position: { x, y: idx.position.y } } : n)),
    };
    g = relayoutAll(g);
  }

  const household = {
    id: uid(),
    label: `Hogar de ${idxName}`,
    color: 'azul',
    members: [idxId, ...tableIds],
    points: rectPoints(0, 0, 10, 10),
  };
  household.points = fitPoints(household, g.nodes);

  return { ...g, households: [household] };
}

/* ---------- Formulario de preguntas ---------- */

const emptyRow = () => ({ key: uid(), nombre: '', edad: '', vinculo: 'hijo' });

function QuestionsModal({ onClose, onBuild }) {
  const [person, setPerson] = useState({ nombre: '', sexo: 'M', edad: '' });
  const [members, setMembers] = useState([]);

  const field = {
    width: '100%',
    boxSizing: 'border-box',
    padding: 8,
    border: '1px solid #d6d3d1',
    borderRadius: 6,
    font: 'inherit',
    fontSize: 14,
    background: '#fff',
  };
  const label = { fontSize: 12, color: '#57534e', display: 'flex', flexDirection: 'column', gap: 4 };
  const btn = {
    font: 'inherit',
    fontSize: 13,
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid #d6d3d1',
    background: '#fff',
    cursor: 'pointer',
  };

  const setRow = (key, patch) =>
    setMembers((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const removeRow = (key) => setMembers((ms) => ms.filter((m) => m.key !== key));

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: 20,
          width: 'min(580px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 17 }}>Preguntas para armar el genograma</strong>
          <button style={{ ...btn, border: 'none', background: 'transparent' }} onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
            Persona principal
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
            <label style={label}>
              Nombre
              <input
                style={field}
                value={person.nombre}
                onChange={(e) => setPerson({ ...person, nombre: e.target.value })}
              />
            </label>
            <label style={label}>
              Sexo
              <select style={field} value={person.sexo} onChange={(e) => setPerson({ ...person, sexo: e.target.value })}>
                <option value="M">Hombre</option>
                <option value="F">Mujer</option>
              </select>
            </label>
            <label style={label}>
              Edad
              <input
                style={field}
                type="number"
                min="0"
                value={person.edad}
                onChange={(e) => setPerson({ ...person, edad: e.target.value })}
              />
            </label>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Personas con las que vive</div>
          <div style={{ fontSize: 12, color: '#78716c', margin: '4px 0 10px' }}>
            Agrega a su familia y a quienes viven con ella. Con esto se arma el genograma y el hogar.
          </div>

          {members.map((m) => (
            <div
              key={m.key}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 0.7fr 1.1fr auto',
                gap: 8,
                alignItems: 'end',
                marginBottom: 8,
              }}
            >
              <label style={label}>
                Nombre
                <input style={field} value={m.nombre} onChange={(e) => setRow(m.key, { nombre: e.target.value })} />
              </label>
              <label style={label}>
                Edad
                <input
                  style={field}
                  type="number"
                  min="0"
                  value={m.edad}
                  onChange={(e) => setRow(m.key, { edad: e.target.value })}
                />
              </label>
              <label style={label}>
                Vínculo
                <select style={field} value={m.vinculo} onChange={(e) => setRow(m.key, { vinculo: e.target.value })}>
                  {REL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <button style={btn} onClick={() => removeRow(m.key)} aria-label="Quitar persona">✕</button>
            </div>
          ))}

          <button style={btn} onClick={() => setMembers((ms) => [...ms, emptyRow()])}>
            + Agregar persona
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button style={btn} onClick={onClose}>Cancelar</button>
          <button
            style={{ ...btn, color: '#fff', background: '#2563eb', borderColor: '#2563eb' }}
            onClick={() => onBuild({ person, members })}
          >
            Armar genograma
          </button>
        </div>
      </div>
    </div>
  );
}

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
  households: [
    {
      id: 'hogar1',
      label: 'Hogar Juan y Ana',
      color: 'azul',
      members: ['padre', 'madre', 'hijo1', 'hija1', 'hijo2'],
      points: rectPoints(90, 170, 620, 420),
    },
  ],
};

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

  const households = (Array.isArray(data.households) ? data.households : []).map((h) => {
    const points =
      Array.isArray(h.points) && h.points.length >= 3
        ? h.points.map((p) => ({ x: snap(p.x), y: snap(p.y) }))
        : rectPoints(snap(h.x ?? 60), snap(h.y ?? 60), snap(h.width ?? 340), snap(h.height ?? 260));
    return {
      id: String(h.id ?? uid()),
      label: h.label ?? 'Hogar',
      color: HOUSEHOLD_COLORS[h.color] ? h.color : 'azul',
      members: (h.members ?? []).map(String).filter((id) => ids.has(id)),
      points,
    };
  });

  return relayoutAll({ nodes, links, households });
}

function serialize(g) {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    links: g.links.map((l) => ({ id: l.id, type: l.type, a: l.a, b: l.b, kind: l.kind })),
    households: g.households.map((h) => ({
      id: h.id,
      label: h.label,
      color: h.color,
      members: h.members,
      points: h.points,
    })),
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

function downloadUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- Nodo de persona ---------- */

function PersonNode({ id, data, selected }) {
  const { act, marks } = useContext(Ctx);
  const mark = marks[id];
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
      {mark && (
        <span
          title="Miembro de un hogar"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: mark,
            border: '1px solid #ffffff',
          }}
        />
      )}
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

function HouseholdFill({ data }) {
  const c = HOUSEHOLD_COLORS[data.color] ?? HOUSEHOLD_COLORS.azul;
  return (
    <svg width={data.w} height={data.h} style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <path
        d={polyPath(data.points)}
        fill={c.box}
        stroke={c.border}
        strokeWidth={data.selected ? 2.5 : 1.5}
        strokeDasharray={data.selected ? undefined : '6 4'}
        strokeLinejoin="miter"
      />
      <text x={8} y={18} fontSize={12} fontWeight={600} fill="#374151">
        {data.label}
      </text>
    </svg>
  );
}

const nodeTypes = { person: PersonNode, household: HouseholdFill };

/* ---------- Controles del hogar: encima, se arrastran con el dedo ---------- */

function useNativeDown(ref, handler) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fn = (e) => {
      e.stopPropagation();
      e.preventDefault();
      handler(e);
    };
    el.addEventListener('pointerdown', fn);
    return () => el.removeEventListener('pointerdown', fn);
  }, [ref, handler]);
}

function Grip({ kind, x, y, onDown }) {
  const ref = useRef(null);
  useNativeDown(ref, onDown);
  const style = { pointerEvents: 'auto', touchAction: 'none' };

  if (kind === 'square') {
    return (
      <rect
        ref={ref}
        x={x - 10}
        y={y - 10}
        width={20}
        height={20}
        rx={3}
        fill="#ffffff"
        stroke="#374151"
        strokeWidth={2}
        style={{ ...style, cursor: 'move' }}
      />
    );
  }
  if (kind === 'mid') {
    return (
      <circle
        ref={ref}
        cx={x}
        cy={y}
        r={8}
        fill="#2563eb"
        stroke="#ffffff"
        strokeWidth={2}
        style={{ ...style, cursor: 'copy' }}
      />
    );
  }
  return (
    <circle
      ref={ref}
      cx={x}
      cy={y}
      r={12}
      fill="#374151"
      stroke="#ffffff"
      strokeWidth={2}
      style={{ ...style, cursor: 'move' }}
    />
  );
}

function HouseholdControls({ households, selectedId, onSelect, marking }) {
  const { screenToFlowPosition } = useReactFlow();
  const { editPoints } = useContext(Ctx);

  function beginDrag(e, hid, mode) {
    const h = find(households, hid);
    if (!h) return;
    const start = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const orig = h.points;
    let idx = mode.idx;

    if (mode.type === 'mid') {
      const n = orig.length;
      const a = orig[mode.idx];
      const b = orig[(mode.idx + 1) % n];
      const m = { x: snap((a.x + b.x) / 2), y: snap((a.y + b.y) / 2) };
      editPoints(hid, (pts) => [...pts.slice(0, mode.idx + 1), m, ...pts.slice(mode.idx + 1)]);
      idx = mode.idx + 1;
    }

    const move = (ev) => {
      const p = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      if (mode.type === 'move') {
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        editPoints(hid, () => orig.map((q) => ({ x: snap(q.x + dx), y: snap(q.y + dy) })));
      } else {
        editPoints(hid, (pts) =>
          pts.map((q, i) => (i === idx ? { x: snap(p.x), y: snap(p.y) } : q))
        );
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <svg className="hh-front">
      {households.map((h) => {
        const sel = h.id === selectedId;
        const cen = centroid(h.points);
        return (
          <g key={h.id}>
            <path
              d={polyPath(h.points)}
              fill="none"
              stroke="transparent"
              strokeWidth={24}
              style={{ pointerEvents: marking ? 'none' : 'stroke', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                if (!marking) onSelect(h.id);
              }}
            />
            {sel && !marking && (
              <>
                {h.points.map((p, i) => {
                  const q = h.points[(i + 1) % h.points.length];
                  return (
                    <Grip
                      key={`m${i}`}
                      kind="mid"
                      x={(p.x + q.x) / 2}
                      y={(p.y + q.y) / 2}
                      onDown={(e) => beginDrag(e, h.id, { type: 'mid', idx: i })}
                    />
                  );
                })}
                {h.points.map((p, i) => (
                  <Grip
                    key={`v${i}`}
                    kind="square"
                    x={p.x}
                    y={p.y}
                    onDown={(e) => beginDrag(e, h.id, { type: 'vertex', idx: i })}
                  />
                ))}
                <Grip
                  kind="move"
                  x={cen.x}
                  y={cen.y}
                  onDown={(e) => beginDrag(e, h.id, { type: 'move' })}
                />
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Trazos ---------- */

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

function clipBetween(A, B) {
  const dx = B.cx - A.cx;
  const dy = B.cy - A.cy;
  const d = Math.hypot(dx, dy);
  if (d < 1) return null;
  const scaleOf = (n) =>
    n.gender === 'F' ? HALF / d : HALF / Math.max(Math.abs(dx), Math.abs(dy), 1);
  const sa = scaleOf(A);
  const sb = scaleOf(B);
  if (sa + sb >= 1) return null;
  return {
    x1: A.cx + dx * sa,
    y1: A.cy + dy * sa,
    x2: B.cx - dx * sb,
    y2: B.cy - dy * sb,
  };
}

/* ---------- Dibujo de estructura y relaciones ---------- */

function Drawings({ graph }) {
  const byId = byIdMap(graph.nodes);
  const box = (n) => {
    const x = snap(n.position.x);
    const y = snap(n.position.y);
    return {
      id: n.id,
      gender: n.data.gender,
      left: x,
      right: x + NODE,
      cx: x + HALF,
      cy: y + HALF,
      top: y,
      bottom: y + NODE,
    };
  };
  const out = [];
  const parentLine = {};

  graph.links.forEach((l) => {
    if (l.type !== 'pareja') return;
    const A = byId[l.a];
    const B = byId[l.b];
    if (!A || !B) return;

    const [L, R] = [box(A), box(B)].sort((p, q) => {
      const mp = p.gender === 'M' ? 0 : 1;
      const mq = q.gender === 'M' ? 0 : 1;
      return mp - mq || p.cx - q.cx;
    });
    const yU = snap(Math.max(L.bottom, R.bottom) + PAIR_DROP);
    const def = PAREJA[l.kind] ?? PAREJA.matrimonio;
    const stemDef = { ...def, deco: undefined };

    out.push(<Segment key={`pl${l.id}`} def={stemDef} x1={L.cx} y1={L.bottom} x2={L.cx} y2={yU} />);
    out.push(<Segment key={`pr${l.id}`} def={stemDef} x1={R.cx} y1={R.bottom} x2={R.cx} y2={yU} />);
    out.push(<Segment key={`ph${l.id}`} def={def} x1={L.cx} y1={yU} x2={R.cx} y2={yU} />);

    parentLine[pairKey(l.a, l.b)] = { xL: L.cx, xR: R.cx, y: yU, def };
  });

  graph.links.forEach((l) => {
    if (l.type !== 'emocion') return;
    const A = byId[l.a];
    const B = byId[l.b];
    if (!A || !B) return;
    const s = clipBetween(box(A), box(B));
    if (!s) return;
    out.push(<Segment key={`e${l.id}`} def={EMOCION[l.kind] ?? EMOCION.indiferente} {...s} />);
  });

  const fam = {};
  for (const l of graph.links) {
    if (l.type !== 'filiacion') continue;
    const child = byId[l.b];
    if (!child) continue;
    const parents = parentIds(graph, child.id).map((id) => byId[id]).filter(Boolean);
    if (!parents.length) continue;

    const famKey = parents.map((p) => p.id).sort().join('|');
    if (!fam[famKey]) {
      const pl =
        parents.length === 2 && spouseLinked(graph, parents[0].id, parents[1].id)
          ? parentLine[pairKey(parents[0].id, parents[1].id)]
          : null;

      if (pl) {
        fam[famKey] = { type: 'pair', xL: pl.xL, xR: pl.xR, y: pl.y, def: pl.def, children: {} };
      } else {
        const pb = box(parents[0]);
        fam[famKey] = { type: 'single', x: pb.cx, y: pb.bottom, def: LINE, children: {} };
      }
    }

    if (!fam[famKey].children[child.id]) {
      const cb = box(child);
      fam[famKey].children[child.id] = { cx: cb.cx, top: cb.top, kind: l.kind };
    }
  }

  Object.entries(fam).forEach(([famKey, f], i) => {
    const kids = Object.entries(f.children);
    if (!kids.length) return;

    const solid = [];
    const dashed = [];

    if (f.type === 'pair') {
      const cxs = kids.map(([, c]) => c.cx);
      const xmin = Math.min(...cxs);
      const xmax = Math.max(...cxs);
      if (xmin < f.xL) {
        out.push(
          <Segment key={`ext1${i}${famKey}`} def={{ ...f.def, deco: undefined }} x1={xmin} y1={f.y} x2={f.xL} y2={f.y} />
        );
      }
      if (xmax > f.xR) {
        out.push(
          <Segment key={`ext2${i}${famKey}`} def={{ ...f.def, deco: undefined }} x1={f.xR} y1={f.y} x2={xmax} y2={f.y} />
        );
      }
      kids.forEach(([cid, c]) => {
        const drop = `M ${c.cx} ${f.y} L ${c.cx} ${c.top}`;
        if (FILIACION[c.kind]?.dash) dashed.push({ cid, drop, dash: FILIACION[c.kind].dash });
        else solid.push(drop);
      });
    } else {
      const yLine = f.y + PAIR_DROP;
      solid.push(`M ${f.x} ${f.y} L ${f.x} ${yLine}`);
      const cxs = kids.map(([, c]) => c.cx);
      const xmin = Math.min(...cxs, f.x);
      const xmax = Math.max(...cxs, f.x);
      if (xmax > xmin) solid.push(`M ${xmin} ${yLine} L ${xmax} ${yLine}`);
      kids.forEach(([cid, c]) => {
        const drop = `M ${c.cx} ${yLine} L ${c.cx} ${c.top}`;
        if (FILIACION[c.kind]?.dash) dashed.push({ cid, drop, dash: FILIACION[c.kind].dash });
        else solid.push(drop);
      });
    }

    if (solid.length) {
      out.push(
        <path
          key={`fam${i}${famKey}`}
          d={solid.join(' ')}
          fill="none"
          stroke={LINE.color}
          strokeWidth={LINE.width}
          strokeLinejoin="miter"
          strokeLinecap="butt"
          shapeRendering="crispEdges"
        />
      );
    }

    dashed.forEach(({ cid, drop, dash }) =>
      out.push(
        <path
          key={`fd${i}${famKey}${cid}`}
          d={drop}
          fill="none"
          stroke={LINE.color}
          strokeWidth={LINE.width}
          strokeDasharray={dash}
          shapeRendering="crispEdges"
        />
      )
    );
  });

  return (
    <svg className="drawings">
      <g>{out}</g>
    </svg>
  );
}

/* ---------- Paneles ---------- */

function KindSelect({ options, value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(options).map(([k, d]) => (
        <option key={k} value={k}>{d.label}</option>
      ))}
    </select>
  );
}

function Editor({
  node, graph, onChange, onDelete, onClose, onSetKind, onRemoveLink, onAddEmotion,
}) {
  const { name = '', year = '', gender = 'M', deceased = false, index = false } = node.data;
  const byId = byIdMap(graph.nodes);
  const nameOf = (id) => byId[id]?.data.name || 'Sin nombre';

  const pareja = graph.links.filter((l) => l.type === 'pareja' && (l.a === node.id || l.b === node.id));
  const padres = graph.links.filter((l) => l.type === 'filiacion' && l.b === node.id);
  const hijos = graph.links.filter((l) => l.type === 'filiacion' && l.a === node.id).map((l) => nameOf(l.b));
  const emo = graph.links.filter((l) => l.type === 'emocion' && (l.a === node.id || l.b === node.id));
  const hogares = graph.households.filter((h) => h.members.includes(node.id)).map((h) => h.label);

  const [other, setOther] = useState('');
  const [kind, setKind] = useState('amistad');
  const others = graph.nodes.filter((n) => n.id !== node.id);

  return (
    <aside className="editor">
      <div className="editor-head">
        <strong>Editar persona</strong>
        <button className="ghost" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>

      <label>
        Nombre
        <input value={name} onChange={(e) => onChange({ name: e.target.value })} />
      </label>
      <label>
        Años de vida
        <input value={year} placeholder="1950–2010" onChange={(e) => onChange({ year: e.target.value })} />
      </label>
      <label>
        Sexo
        <select value={gender} onChange={(e) => onChange({ gender: e.target.value })}>
          <option value="M">Hombre (cuadrado)</option>
          <option value="F">Mujer (círculo)</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={deceased} onChange={(e) => onChange({ deceased: e.target.checked })} />
        Fallecido/a
      </label>
      <label className="check">
        <input type="checkbox" checked={index} onChange={(e) => onChange({ index: e.target.checked })} />
        Persona índice (doble borde)
      </label>

      <div className="section-title">Hogar</div>
      <p className="hint">{hogares.length ? hogares.join(', ') : 'No pertenece a ningún hogar.'}</p>

      <div className="section-title">Pareja</div>
      {pareja.length === 0 && <p className="hint">Sin pareja. Usa "+ Pareja" sobre la persona.</p>}
      {pareja.map((l) => (
        <div key={l.id} className="rel-row">
          <div className="rel-info">
            <small>con {nameOf(l.a === node.id ? l.b : l.a)}</small>
            <KindSelect options={PAREJA} value={l.kind} onChange={(k) => onSetKind(l.id, k)} />
          </div>
          <button className="ghost" onClick={() => onRemoveLink(l.id)} aria-label="Quitar">✕</button>
        </div>
      ))}

      <div className="section-title">Padres</div>
      {padres.length === 0 && <p className="hint">Sin padres registrados.</p>}
      {padres.map((l) => (
        <div key={l.id} className="rel-row">
          <div className="rel-info">
            <small>{nameOf(l.a)}</small>
            <KindSelect options={FILIACION} value={l.kind} onChange={(k) => onSetKind(l.id, k)} />
          </div>
          <button className="ghost" onClick={() => onRemoveLink(l.id)} aria-label="Quitar">✕</button>
        </div>
      ))}

      <div className="section-title">Hijos</div>
      <p className="hint">{hijos.length ? hijos.join(', ') : 'Sin hijos registrados.'}</p>

      <div className="section-title">Relaciones emocionales</div>
      {emo.length === 0 && <p className="hint">Sin relaciones emocionales.</p>}
      {emo.map((l) => (
        <div key={l.id} className="rel-row">
          <div className="rel-info">
            <small>con {nameOf(l.a === node.id ? l.b : l.a)}</small>
            <KindSelect options={EMOCION} value={l.kind} onChange={(k) => onSetKind(l.id, k)} />
          </div>
          <button className="ghost" onClick={() => onRemoveLink(l.id)} aria-label="Quitar">✕</button>
        </div>
      ))}

      <div className="add-rel">
        <div className="section-title">Agregar relación emocional</div>
        <select value={other} onChange={(e) => setOther(e.target.value)}>
          <option value="">Elegir persona…</option>
          {others.map((n) => (
            <option key={n.id} value={n.id}>{n.data.name || 'Sin nombre'}</option>
          ))}
        </select>
        <KindSelect options={EMOCION} value={kind} onChange={setKind} />
        <button
          className="primary"
          disabled={!other}
          onClick={() => {
            onAddEmotion(node.id, other, kind);
            setOther('');
          }}
        >
          Agregar relación
        </button>
      </div>

      <button className="danger" onClick={onDelete}>Eliminar persona</button>
    </aside>
  );
}

function HouseholdEditor({
  household, graph, onChange, onMark, onFit, onRemoveCorner,
  onCapture, onRemoveMember, onAddMember, onDelete, onClose,
}) {
  const byId = byIdMap(graph.nodes);
  const members = household.members.map((id) => byId[id]).filter(Boolean);
  const available = graph.nodes.filter((n) => !household.members.includes(n.id));
  const [pick, setPick] = useState('');

  return (
    <aside className="editor">
      <div className="editor-head">
        <strong>Editar hogar</strong>
        <button className="ghost" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>

      <label>
        Nombre del hogar
        <input value={household.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>

      <label>
        Color
        <select value={household.color} onChange={(e) => onChange({ color: e.target.value })}>
          <option value="azul">Azul</option>
          <option value="verde">Verde</option>
          <option value="ambar">Ámbar</option>
          <option value="gris">Gris</option>
        </select>
      </label>

      <p className="hint">
        Mueve los cuadrados de las esquinas para moldear la forma. Los puntos azules entre esquinas agregan una esquina nueva.
        El punto oscuro mueve toda la forma sin mover a sus miembros.
      </p>

      <button className="primary" onClick={onFit}>Ajustar al contorno de miembros</button>
      <button onClick={onMark}>Marcar miembros tocando personas</button>
      <button onClick={onCapture}>Capturar personas dentro de la forma</button>
      <button onClick={onRemoveCorner}>Quitar última esquina</button>

      <div className="section-title">Miembros</div>
      {members.length === 0 && <p className="hint">Este hogar no tiene miembros todavía.</p>}
      {members.map((m) => (
        <div key={m.id} className="rel-row">
          <div className="rel-info">
            <small>{m.data.name || 'Sin nombre'}</small>
          </div>
          <button className="ghost" onClick={() => onRemoveMember(m.id)} aria-label="Quitar del hogar">✕</button>
        </div>
      ))}

      <div className="add-rel">
        <div className="section-title">Agregar miembro</div>
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Elegir persona…</option>
          {available.map((n) => (
            <option key={n.id} value={n.id}>{n.data.name || 'Sin nombre'}</option>
          ))}
        </select>
        <button
          className="primary"
          disabled={!pick}
          onClick={() => {
            onAddMember(pick);
            setPick('');
          }}
        >
          Agregar
        </button>
      </div>

      <button className="danger" onClick={onDelete}>Eliminar hogar</button>
    </aside>
  );
}

function Legend({ graph, onClose }) {
  const used = new Set(graph.links.map((l) => l.kind));
  return (
    <div className="legend">
      <div className="editor-head">
        <strong>Leyenda</strong>
        <button className="ghost" onClick={onClose} aria-label="Ocultar">✕</button>
      </div>
      {graph.links.length === 0 && <p className="hint">Aún no hay relaciones.</p>}
      {GROUPS.map((gr) => {
        const items = Object.entries(gr.defs).filter(([k]) => used.has(k));
        if (items.length === 0) return null;
        return (
          <div key={gr.type}>
            <div className="legend-title">{gr.title}</div>
            {items.map(([k, d]) => (
              <div key={k} className="legend-row">
                <svg width="44" height="14" className="glyph">
                  <Segment def={d} x1={2} y1={7} x2={42} y2={7} />
                </svg>
                <span>{d.label}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- App ---------- */

function flowNodes(g, selectedId) {
  const fills = g.households.map((h) => {
    const bb = bounds(h.points);
    const ox = bb.minX - PAD;
    const oy = bb.minY - PAD;
    const w = bb.maxX - bb.minX + PAD * 2;
    const hgt = bb.maxY - bb.minY + PAD * 2;
    return {
      id: `hh-${h.id}`,
      type: 'household',
      position: { x: ox, y: oy },
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
      zIndex: -1,
      style: { width: w, height: hgt, background: 'none', border: 'none', padding: 0, pointerEvents: 'none' },
      data: {
        points: h.points.map((p) => ({ x: p.x - ox, y: p.y - oy })),
        label: h.label,
        color: h.color,
        selected: h.id === selectedId,
        w,
        h: hgt,
      },
    };
  });
  return [...fills, ...g.nodes];
}

export default function App() {
  const [graph, setGraph] = useState(loadInitial);
  const [selectedId, setSelectedId] = useState(null);
  const [marking, setMarking] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showQuestions, setShowQuestions] = useState(false);
  const fileRef = useRef(null);
  const canvasRef = useRef(null);
  const rfRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(graph)));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }, [graph]);

  const marks = useMemo(() => {
    const out = {};
    for (const h of graph.households) {
      const c = HOUSEHOLD_COLORS[h.color] ?? HOUSEHOLD_COLORS.azul;
      for (const pid of h.members) {
        if (!out[pid]) out[pid] = c.border;
      }
    }
    return out;
  }, [graph.households]);

  const onNodesChange = useCallback(
    (changes) =>
      setGraph((g) => {
        const nodes = applyNodeChanges(changes, g.nodes);
        const ids = new Set(nodes.map((n) => n.id));
        return { ...g, nodes, links: g.links.filter((l) => ids.has(l.a) && ids.has(l.b)) };
      }),
    []
  );

  const onNodeDragStop = useCallback((_, node) => {
    setGraph((g) => relayoutAll(g, node.id));
  }, []);

  const editPoints = useCallback((id, fn) => {
    setGraph((g) => ({
      ...g,
      households: g.households.map((h) => (h.id === id ? { ...h, points: fn(h.points) } : h)),
    }));
  }, []);

  const act = useCallback((type, id) => {
    const newId = uid();
    setGraph((g) => relayoutAll(ACTIONS[type](g, id, newId)));
  }, []);
  const ctx = useMemo(() => ({ act, marks, editPoints }), [act, marks, editPoints]);

  const selected = find(graph.nodes, selectedId);
  const selectedHousehold = find(graph.households, selectedId);

  const onNodeClick = useCallback(
    (_, n) => {
      if (marking) {
        setGraph((g) => ({
          ...g,
          households: g.households.map((h) => {
            if (h.id !== marking) return h;
            const has = h.members.includes(n.id);
            return {
              ...h,
              members: has ? h.members.filter((m) => m !== n.id) : [...h.members, n.id],
            };
          }),
        }));
        return;
      }
      setSelectedId(n.id);
    },
    [marking]
  );

  function selectHousehold(id) {
    if (!marking) setSelectedId(id);
  }

  function startMarking() {
    if (!selectedHousehold) return;
    setMarking(selectedHousehold.id);
    setSelectedId(null);
  }

  function stopMarking() {
    setMarking(null);
  }

  function addFree() {
    const id = uid();
    setGraph((g) => withNode(g, personNode(id, freeXDir(g.nodes, 300, 150, 1), 150, { name: 'Nueva persona' })));
    setSelectedId(id);
  }

  function addFamilyUnit() {
    const manId = uid();
    const womanId = uid();
    setGraph((g) => addFamily(g, manId, womanId));
    setSelectedId(manId);
  }

  function addHousehold() {
    const id = uid();
    const off = 60 + graph.households.length * 30;
    setGraph((g) => ({
      ...g,
      households: [
        ...g.households,
        {
          id,
          label: 'Hogar',
          color: 'azul',
          members: [],
          points: rectPoints(off, off, 340, 260),
        },
      ],
    }));
    setSelectedId(id);
  }

  function applyAnswers(answers) {
    if (graph.nodes.length && !confirm('¿Armar un genograma nuevo? Reemplaza el actual.')) return;
    setGraph(buildFromAnswers(answers));
    setSelectedId(null);
    setMarking(null);
    setShowQuestions(false);
  }

  function updateNode(id, patch) {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    }));
  }

  function deleteNode(id) {
    setGraph((g) =>
      relayoutAll({
        ...g,
        nodes: g.nodes.filter((n) => n.id !== id),
        links: g.links.filter((l) => l.a !== id && l.b !== id),
        households: g.households.map((h) => ({ ...h, members: h.members.filter((m) => m !== id) })),
      })
    );
    setSelectedId(null);
  }

  function removeLink(id) {
    setGraph((g) => relayoutAll({ ...g, links: g.links.filter((l) => l.id !== id) }));
  }

  function setLinkKind(id, kind) {
    setGraph((g) => ({
      ...g,
      links: g.links.map((l) => (l.id === id ? { ...l, kind } : l)),
    }));
  }

  function addEmotion(a, b, kind) {
    setGraph((g) => withLink(g, mkLink('emocion', a, b, kind)));
  }

  function updateHousehold(id, patch) {
    setGraph((g) => ({
      ...g,
      households: g.households.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));
  }

  function fitHousehold(id) {
    setGraph((g) => ({
      ...g,
      households: g.households.map((h) => (h.id === id ? { ...h, points: fitPoints(h, g.nodes) } : h)),
    }));
  }

  function removeCorner(id) {
    setGraph((g) => ({
      ...g,
      households: g.households.map((h) =>
        h.id === id && h.points.length > 3 ? { ...h, points: h.points.slice(0, -1) } : h
      ),
    }));
  }

  function captureMembers(id) {
    setGraph((g) => {
      const h = find(g.households, id);
      if (!h) return g;
      const inside = g.nodes
        .filter((n) => pointInPoly(snap(n.position.x) + HALF, snap(n.position.y) + HALF, h.points))
        .map((n) => n.id);
      return {
        ...g,
        households: g.households.map((x) => (x.id === id ? { ...x, members: inside } : x)),
      };
    });
  }

  function removeHouseholdMember(hid, pid) {
    setGraph((g) => ({
      ...g,
      households: g.households.map((h) =>
        h.id === hid ? { ...h, members: h.members.filter((m) => m !== pid) } : h
      ),
    }));
  }

  function addHouseholdMember(hid, pid) {
    setGraph((g) => ({
      ...g,
      households: g.households.map((h) =>
        h.id === hid && !h.members.includes(pid) ? { ...h, members: [...h.members, pid] } : h
      ),
    }));
  }

  function deleteHousehold(id) {
    setGraph((g) => ({ ...g, households: g.households.filter((h) => h.id !== id) }));
    setSelectedId(null);
  }

  function saveGenogram() {
    const name = (prompt('Nombre del archivo', 'genograma') || '').trim() || 'genograma';
    const blob = new Blob([JSON.stringify(serialize(graph), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    downloadUrl(url, `${name}.json`);
    URL.revokeObjectURL(url);
  }

  // Guardar JPG: encuadra todo el genograma, oculta controles y guarda una imagen con fondo blanco
  async function saveJpg() {
    const name = (prompt('Nombre del archivo', 'genograma') || '').trim() || 'genograma';
    const flow = canvasRef.current?.querySelector('.react-flow');
    if (!flow) {
      alert('No se encontró el genograma para guardar.');
      return;
    }

    rfRef.current?.fitView({ padding: 0.12, duration: 0 });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    try {
      const dataUrl = await toJpeg(flow, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
        filter: (node) => {
          if (!node.classList) return true;
          return !(
            node.classList.contains('react-flow__controls') ||
            node.classList.contains('react-flow__minimap') ||
            node.classList.contains('react-flow__attribution') ||
            node.classList.contains('react-flow__panel')
          );
        },
      });
      downloadUrl(dataUrl, `${name}.jpg`);
    } catch (err) {
      console.error('Error al guardar JPG:', err);
      alert('No se pudo guardar la imagen. Revisa la consola (F12) para ver el detalle.');
    }
  }

  function importJson(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.nodes)) throw new Error('formato');
        setGraph(normalize(data));
        setSelectedId(null);
        setMarking(null);
      } catch {
        alert('El archivo no es un genograma válido.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function newGenogram() {
    if (!confirm('¿Crear un genograma nuevo? Se perderá el actual.')) return;
    setGraph({
      nodes: [personNode(uid(), 300, 150, { name: 'Persona índice', index: true })],
      links: [],
      households: [],
    });
    setSelectedId(null);
    setMarking(null);
  }

  function resetSample() {
    if (!confirm('¿Restablecer el ejemplo? Se perderán los cambios actuales.')) return;
    setGraph(normalize(SAMPLE));
    setSelectedId(null);
    setMarking(null);
  }

  const markingHousehold = marking ? find(graph.households, marking) : null;

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <h1>Linaje</h1>
          <div className="toolbar">
            <button className="primary" onClick={() => setShowQuestions(true)}>❓ Preguntas</button>
            <button onClick={addFamilyUnit}>+ Familia</button>
            <button onClick={addFree}>+ Persona</button>
            <button onClick={addHousehold}>+ Hogar</button>
            {selectedHousehold && !marking && (
              <button onClick={startMarking}>Marcar miembros</button>
            )}
            <button onClick={() => setShowLegend((v) => !v)}>Leyenda</button>
            <button onClick={saveGenogram}>Guardar</button>
            <button
              onClick={saveJpg}
              title="Guardar como imagen JPG"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <DownloadIcon />
              Guardar JPG
            </button>
            <button onClick={() => fileRef.current?.click()}>Importar</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
            <button className="ghost" onClick={newGenogram}>Nuevo</button>
            <button className="ghost" onClick={resetSample}>Ejemplo</button>
          </div>
        </header>

        {markingHousehold && (
          <div className="marking-bar">
            <span>
              Marcando "{markingHousehold.label}": toca las personas que viven aquí para marcarlas.
            </span>
            <button className="primary" onClick={stopMarking}>Listo</button>
          </div>
        )}

        <div className="body">
          <div className="canvas" ref={canvasRef}>
            <ReactFlow
              nodes={flowNodes(graph, selectedId)}
              edges={[]}
              onInit={(inst) => {
                rfRef.current = inst;
              }}
              onNodesChange={onNodesChange}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              nodesConnectable={false}
              nodeTypes={nodeTypes}
              onPaneClick={() => setSelectedId(null)}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d6d3d1" />
              <Controls />
              <MiniMap pannable zoomable />
              <ViewportPortal>
                <HouseholdControls
                  households={graph.households}
                  selectedId={selectedId}
                  onSelect={selectHousehold}
                  marking={marking}
                />
                <Drawings graph={graph} />
              </ViewportPortal>
            </ReactFlow>
            {showLegend && <Legend graph={graph} onClose={() => setShowLegend(false)} />}
          </div>

          {selectedHousehold && !marking && (
            <HouseholdEditor
              key={selectedHousehold.id}
              household={selectedHousehold}
              graph={graph}
              onChange={(patch) => updateHousehold(selectedHousehold.id, patch)}
              onMark={startMarking}
              onFit={() => fitHousehold(selectedHousehold.id)}
              onRemoveCorner={() => removeCorner(selectedHousehold.id)}
              onCapture={() => captureMembers(selectedHousehold.id)}
              onRemoveMember={(pid) => removeHouseholdMember(selectedHousehold.id, pid)}
              onAddMember={(pid) => addHouseholdMember(selectedHousehold.id, pid)}
              onDelete={() => deleteHousehold(selectedHousehold.id)}
              onClose={() => setSelectedId(null)}
            />
          )}

          {selected && !selectedHousehold && !marking && (
            <Editor
              key={selected.id}
              node={selected}
              graph={graph}
              onChange={(patch) => updateNode(selected.id, patch)}
              onDelete={() => deleteNode(selected.id)}
              onClose={() => setSelectedId(null)}
              onSetKind={setLinkKind}
              onRemoveLink={removeLink}
              onAddEmotion={addEmotion}
            />
          )}
        </div>
      </div>

      {showQuestions && (
        <QuestionsModal onClose={() => setShowQuestions(false)} onBuild={applyAnswers} />
      )}
    </Ctx.Provider>
  );
}
