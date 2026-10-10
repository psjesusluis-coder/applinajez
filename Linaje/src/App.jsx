import {
  useState, useCallback, useMemo, useRef, useEffect, useContext, createContext,
} from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, ViewportPortal, applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PAREJA, FILIACION, EMOCION, GROUPS, ALL, LEGACY } from './relations.js';

const STORAGE_KEY = 'linaje-genograma-v5';
const NODE = 120;
const HALF = 60;
const BUS_GAP = 40;     // distancia de la base de los padres a la línea de hermanos
const GEN_GAP = 200;    // distancia vertical entre generaciones
const PAIR_GAP = 190;   // distancia horizontal entre pareja
const SIB_GAP = 170;    // distancia horizontal entre hermanos
const Ctx = createContext({ act: () => {} });

const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const find = (list, id) => list.find((n) => n.id === id);
const byIdMap = (nodes) => Object.fromEntries(nodes.map((n) => [n.id, n]));
const opposite = (gender) => (gender === 'F' ? 'M' : 'F');

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

// Padres de una persona: links de filiación donde ella es el hijo (b)
const parentIds = (g, id) => g.links.filter((l) => l.type === 'filiacion' && l.b === id).map((l) => l.a);

const spouseIds = (g, id) =>
  g.links
    .filter((l) => l.type === 'pareja' && (l.a === id || l.b === id))
    .map((l) => (l.a === id ? l.b : l.a));

const spouseLinked = (g, a, b) =>
  g.links.some((l) => l.type === 'pareja' && ((l.a === a && l.b === b) || (l.a === b && l.b === a)));

// Busca un lugar libre en la misma fila para que no se encimen personas
const overlaps = (nodes, x, y) =>
  nodes.some((n) => Math.abs(n.position.x - x) < 150 && Math.abs(n.position.y - y) < 100);

const freeX = (nodes, x, y) => {
  let nx = x;
  while (overlaps(nodes, nx, y)) nx += 170;
  return nx;
};

/* ---------- Acciones de los botones ---------- */

// + Padre/Madre: si el hijo ya tiene un padre, el nuevo se une a él como pareja
function addParent(g, childId, newId) {
  const child = find(g.nodes, childId);
  const parents = parentIds(g, childId).map((id) => find(g.nodes, id)).filter(Boolean);

  if (parents.length === 1) {
    const p = parents[0];
    const x = freeX(g.nodes, p.position.x + PAIR_GAP, p.position.y);
    let next = withNode(
      g,
      personNode(newId, x, p.position.y, { name: 'Nuevo padre/madre', gender: opposite(p.data.gender) })
    );
    next = withLink(next, mkLink('pareja', p.id, newId, 'matrimonio'));
    return withLink(next, mkLink('filiacion', newId, childId, 'biologico'));
  }

  const y = child.position.y - GEN_GAP;
  const x = freeX(g.nodes, child.position.x, y);
  const next = withNode(g, personNode(newId, x, y, { name: 'Nuevo padre/madre' }));
  return withLink(next, mkLink('filiacion', newId, childId, 'biologico'));
}

// + Hijo/a: debajo de la persona y de su pareja, centrado
function addChild(g, parentId, newId) {
  const parent = find(g.nodes, parentId);
  const members = [parent, ...spouseIds(g, parentId).map((id) => find(g.nodes, id)).filter(Boolean)];
  const cx = members.reduce((s, n) => s + n.position.x + HALF, 0) / members.length;
  const y = parent.position.y + GEN_GAP;
  const x = freeX(g.nodes, cx - HALF, y);
  let next = withNode(g, personNode(newId, x, y, { name: 'Nuevo hijo/a' }));
  for (const m of members) next = withLink(next, mkLink('filiacion', m.id, newId, 'biologico'));
  return next;
}

// + Pareja: a la derecha, a la misma altura
function addSpouse(g, personId, newId) {
  const p = find(g.nodes, personId);
  const x = freeX(g.nodes, p.position.x + PAIR_GAP, p.position.y);
  const next = withNode(
    g,
    personNode(newId, x, p.position.y, { name: 'Nueva pareja', gender: opposite(p.data.gender) })
  );
  return withLink(next, mkLink('pareja', personId, newId, 'matrimonio'));
}

// + Hermano/a: a la derecha, a la misma altura, con los mismos padres
function addSibling(g, personId, newId) {
  let base = g;
  let parents = parentIds(g, personId);
  if (parents.length === 0) {
    const pid = uid();
    base = addParent(g, personId, pid);
    parents = [pid];
  }
  const node = find(base.nodes, personId);
  const x = freeX(base.nodes, node.position.x + SIB_GAP, node.position.y);
  let next = withNode(base, personNode(newId, x, node.position.y, { name: 'Nuevo hermano/a' }));
  for (const pid of parents) next = withLink(next, mkLink('filiacion', pid, newId, 'biologico'));
  return next;
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
    const raw = e.data?.kind;
    const k = LEGACY[raw] ?? raw;
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
  return { nodes, links };
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

// Dibuja un segmento recto entre dos puntos con su patrón, adorno y punta
function Segment({ def, x1, y1, x2, y2 }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  // Punto a distancia t sobre el segmento, desplazado o lateralmente
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
        <path key={key()} d={line(P(0), P(len))} {...base} strokeWidth={6} strokeDasharray={undefined} />
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

  // Adornos sobre el punto medio
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

  // Punta de flecha al final
  if (def.arrow) {
    const b1 = P(len - 9, 4.5);
    const b2 = P(len - 9, -4.5);
    parts.push(
      <polygon key={key()} points={`${x2},${y2} ${b1[0]},${b1[1]} ${b2[0]},${b2[1]}`} fill={def.color} />
    );
  }

  return <g>{parts}</g>;
}

// Punto de salida y llegada en el borde de cada figura (cuadrado o círculo)
function clipBetween(A, B) {
  const dx = B.cx - A.cx;
  const dy = B.cy - A.cy;
  const d = Math.hypot(dx, dy);
  if (d < 1) return null;
  const scale = (n) => (n.gender === 'F' ? HALF / d : HALF / Math.max(Math.abs(dx), Math.abs(dy)));
  const sa = scale(A);
  const sb = scale(B);
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
  const box = (n) => ({
    id: n.id,
    gender: n.data.gender,
    left: n.position.x,
    right: n.position.x + NODE,
    cx: n.position.x + HALF,
    cy: n.position.y + HALF,
    top: n.position.y,
    bottom: n.position.y + NODE,
  });
  const out = [];

  // 1. Pareja: línea horizontal recta entre los dos, a la altura de su centro
  graph.links.forEach((l) => {
    if (l.type !== 'pareja') return;
    const A = byId[l.a];
    const B = byId[l.b];
    if (!A || !B) return;
    const [L, R] = [box(A), box(B)].sort((p, q) => p.cx - q.cx);
    out.push(
      <Segment key={`p${l.id}`} def={PAREJA[l.kind] ?? PAREJA.matrimonio} x1={L.right} y1={L.cy} x2={R.left} y2={R.cy} />
    );
  });

  // 2. Relaciones emocionales: diagonal de individuo a individuo
  graph.links.forEach((l) => {
    if (l.type !== 'emocion') return;
    const A = byId[l.a];
    const B = byId[l.b];
    if (!A || !B) return;
    const s = clipBetween(box(A), box(B));
    if (!s) return;
    out.push(<Segment key={`e${l.id}`} def={EMOCION[l.kind] ?? EMOCION.indiferente} {...s} />);
  });

  // 3. Filiación: se agrupa por familia (pareja o padre/madre único)
  const fam = {};
  graph.links.forEach((l) => {
    if (l.type !== 'filiacion') return;
    const child = byId[l.b];
    const par = byId[l.a];
    if (!child || !par) return;

    const ps = parentIds(graph, child.id).map((id) => byId[id]).filter(Boolean);
    let key;
    let ox;
    let oy;
    let bottom;

    if (ps.length === 2 && spouseLinked(graph, ps[0].id, ps[1].id)) {
      // Pareja: la bajada sale del punto medio de la línea de pareja
      const [L, R] = ps.map(box).sort((p, q) => p.cx - q.cx);
      key = ps.map((p) => p.id).sort().join('|');
      ox = (L.right + R.left) / 2;
      oy = (L.cy + R.cy) / 2;
      bottom = Math.max(L.bottom, R.bottom);
    } else {
      // Un solo padre o madre: la bajada sale de su parte inferior
      const pb = box(par);
      key = par.id;
      ox = pb.cx;
      oy = pb.bottom;
      bottom = pb.bottom;
    }

    if (!fam[key]) fam[key] = { ox, oy, bottom, children: {} };
    if (!fam[key].children[child.id]) {
      const cb = box(child);
      fam[key].children[child.id] = { cx: cb.cx, top: cb.top, kind: l.kind };
    }
  });

  Object.entries(fam).forEach(([key, f], i) => {
    const busY = f.bottom + BUS_GAP;
    const cxs = Object.values(f.children).map((c) => c.cx);
    const xmin = Math.min(f.ox, ...cxs);
    const xmax = Math.max(f.ox, ...cxs);

    // Bajada desde los padres
    out.push(<Segment key={`fo${i}${key}`} def={FILIACION.biologico} x1={f.ox} y1={f.oy} x2={f.ox} y2={busY} />);
    // Línea de hermanos
    out.push(<Segment key={`fb${i}${key}`} def={FILIACION.biologico} x1={xmin} y1={busY} x2={xmax} y2={busY} />);
    // Bajada a cada hijo, centrada
    Object.entries(f.children).forEach(([cid, c]) =>
      out.push(
        <Segment
          key={`fc${i}${key}${cid}`}
          def={FILIACION[c.kind] ?? FILIACION.biologico}
          x1={c.cx}
          y1={busY}
          x2={c.cx}
          y2={c.top}
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

export default function App() {
  const [graph, setGraph] = useState(loadInitial);
  const [selectedId, setSelectedId] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const fileRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(graph)));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }, [graph]);

  const onNodesChange = useCallback(
    (changes) =>
      setGraph((g) => {
        const nodes = applyNodeChanges(changes, g.nodes);
        const ids = new Set(nodes.map((n) => n.id));
        return { ...g, nodes, links: g.links.filter((l) => ids.has(l.a) && ids.has(l.b)) };
      }),
    []
  );

  const act = useCallback((type, id) => {
    const newId = uid();
    setGraph((g) => ACTIONS[type](g, id, newId));
  }, []);
  const ctx = useMemo(() => ({ act }), [act]);

  const selected = find(graph.nodes, selectedId);

  function addFree() {
    const id = uid();
    setGraph((g) => withNode(g, personNode(id, freeX(g.nodes, 300, 150), 150, { name: 'Nueva persona' })));
    setSelectedId(id);
  }

  function updateNode(id, patch) {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    }));
  }

  function deleteNode(id) {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.filter((n) => n.id !== id),
      links: g.links.filter((l) => l.a !== id && l.b !== id),
    }));
    setSelectedId(null);
  }

  function removeLink(id) {
    setGraph((g) => ({ ...g, links: g.links.filter((l) => l.id !== id) }));
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

  function exportJson() {
    const blob = new Blob([JSON.stringify(serialize(graph), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'genograma.json';
    a.click();
    URL.revokeObjectURL(url);
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
    });
    setSelectedId(null);
  }

  function resetSample() {
    if (!confirm('¿Restablecer el ejemplo? Se perderán los cambios actuales.')) return;
    setGraph(normalize(SAMPLE));
    setSelectedId(null);
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <h1>Linaje</h1>
          <div className="toolbar">
            <button className="primary" onClick={addFree}>+ Persona</button>
            <button onClick={() => setShowLegend((v) => !v)}>Leyenda</button>
            <button onClick={exportJson}>Exportar</button>
            <button onClick={() => fileRef.current?.click()}>Importar</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
            <button className="ghost" onClick={newGenogram}>Nuevo</button>
            <button className="ghost" onClick={resetSample}>Ejemplo</button>
          </div>
        </header>

        <div className="body">
          <div className="canvas">
            <ReactFlow
              nodes={graph.nodes}
              edges={[]}
              onNodesChange={onNodesChange}
              nodesConnectable={false}
              nodeTypes={nodeTypes}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d6d3d1" />
              <Controls />
              <MiniMap pannable zoomable />
              <ViewportPortal>
                <Drawings graph={graph} />
              </ViewportPortal>
            </ReactFlow>
            {showLegend && <Legend graph={graph} onClose={() => setShowLegend(false)} />}
          </div>

          {selected && (
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
    </Ctx.Provider>
  );
}
