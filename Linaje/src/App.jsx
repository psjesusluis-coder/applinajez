import {
  useState, useCallback, useMemo, useRef, useEffect, useContext, createContext,
} from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, Handle, Position,
  MarkerType, applyNodeChanges, applyEdgeChanges, getSmoothStepPath, getStraightPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { KINDS, PARENT_KINDS, PARTNER_KINDS, LEGACY } from './relations.js';

const STORAGE_KEY = 'linaje-genograma-v4';
const SIDES = ['t', 'b', 'l', 'r'];
const POS = { t: Position.Top, b: Position.Bottom, l: Position.Left, r: Position.Right };
const Ctx = createContext({ act: () => {} });

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ---------- Modelo ---------- */

const find = (nodes, id) => nodes.find((n) => n.id === id);

function sidesFor(a, b, kind) {
  if (PARENT_KINDS.includes(kind)) return ['b', 't'];
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}

function makeEdge(nodes, source, target, kind) {
  const [s, t] = sidesFor(find(nodes, source), find(nodes, target), kind);
  return {
    id: uid(),
    source,
    target,
    sourceHandle: `s-${s}`,
    targetHandle: `s-${t}`,
    data: { kind },
  };
}

function freeX(nodes, x, y) {
  let nx = x;
  while (nodes.some((n) => Math.abs(n.position.x - nx) < 150 && Math.abs(n.position.y - y) < 100)) {
    nx += 170;
  }
  return nx;
}

function personNode(id, x, y, data = {}) {
  return {
    id,
    type: 'person',
    position: { x, y },
    data: { name: '', year: '', gender: 'M', deceased: false, index: false, ...data },
  };
}

const parentsOf = (g, id) =>
  g.edges.filter((e) => PARENT_KINDS.includes(e.data.kind) && e.target === id).map((e) => e.source);

const partnersOf = (g, id) =>
  g.edges
    .filter((e) => PARTNER_KINDS.includes(e.data.kind) && (e.source === id || e.target === id))
    .map((e) => (e.source === id ? e.target : e.source));

const opposite = (gender) => (gender === 'F' ? 'M' : 'F');

function addParent(g, childId) {
  const child = find(g.nodes, childId);
  const existing = parentsOf(g, childId);
  const first = existing.length ? find(g.nodes, existing[0]) : null;
  const y = child.position.y - 200;
  const x = freeX(g.nodes, first ? first.position.x + 180 : child.position.x, y);
  const id = uid();
  const nodes = [
    ...g.nodes,
    personNode(id, x, y, {
      name: 'Nuevo padre/madre',
      gender: first ? opposite(first.data.gender) : 'M',
    }),
  ];
  return { nodes, edges: [...g.edges, makeEdge(nodes, id, childId, 'filiacion')] };
}

function addChild(g, parentId) {
  const parent = find(g.nodes, parentId);
  const partners = partnersOf(g, parentId).map((pid) => find(g.nodes, pid)).filter(Boolean);
  const group = [parent, ...partners];
  const cx = group.reduce((s, n) => s + n.position.x, 0) / group.length;
  const y = parent.position.y + 200;
  const x = freeX(g.nodes, cx, y);
  const id = uid();
  const nodes = [...g.nodes, personNode(id, x, y, { name: 'Nuevo hijo/a' })];
  const parents = [parentId, ...partners.map((p) => p.id)];
  return {
    nodes,
    edges: [...g.edges, ...parents.map((pid) => makeEdge(nodes, pid, id, 'filiacion'))],
  };
}

function addPartner(g, personId) {
  const p = find(g.nodes, personId);
  const x = freeX(g.nodes, p.position.x + 190, p.position.y);
  const id = uid();
  const nodes = [
    ...g.nodes,
    personNode(id, x, p.position.y, { name: 'Nueva pareja', gender: opposite(p.data.gender) }),
  ];
  return { nodes, edges: [...g.edges, makeEdge(nodes, personId, id, 'matrimonio')] };
}

function addSibling(g, personId) {
  let base = g;
  let [pid] = parentsOf(g, personId);
  if (!pid) {
    base = addParent(g, personId);
    pid = base.nodes[base.nodes.length - 1].id;
  }
  return addChild(base, pid);
}

const ACTIONS = { padre: addParent, hijo: addChild, pareja: addPartner, hermano: addSibling };

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
  edges: [
    { id: 'e1', source: 'abuelo', target: 'abuela', data: { kind: 'matrimonio' } },
    { id: 'e2', source: 'abuelo', target: 'padre', data: { kind: 'filiacion' } },
    { id: 'e3', source: 'abuela', target: 'padre', data: { kind: 'filiacion' } },
    { id: 'e4', source: 'padre', target: 'madre', data: { kind: 'matrimonio' } },
    { id: 'e5', source: 'padre', target: 'hijo1', data: { kind: 'filiacion' } },
    { id: 'e6', source: 'madre', target: 'hijo1', data: { kind: 'filiacion' } },
    { id: 'e7', source: 'padre', target: 'hija1', data: { kind: 'filiacion' } },
    { id: 'e8', source: 'madre', target: 'hija1', data: { kind: 'filiacion' } },
    { id: 'e9', source: 'padre', target: 'hijo2', data: { kind: 'filiacion' } },
    { id: 'e10', source: 'madre', target: 'hijo2', data: { kind: 'filiacion' } },
    { id: 'e11', source: 'padre', target: 'abuelo', data: { kind: 'discordia' } },
    { id: 'e12', source: 'madre', target: 'hija1', data: { kind: 'amor' } },
    { id: 'e13', source: 'hijo1', target: 'hijo2', data: { kind: 'distante' } },
  ],
};

function normalize(data) {
  const nodes = data.nodes.map((n) =>
    personNode(String(n.id), n.position?.x ?? 0, n.position?.y ?? 0, n.data)
  );
  const ids = new Set(nodes.map((n) => n.id));
  const edges = data.edges
    .filter((e) => ids.has(String(e.source)) && ids.has(String(e.target)))
    .map((e) => {
      const raw = LEGACY[e.data?.kind] ?? e.data?.kind;
      const kind = KINDS[raw] ? raw : 'filiacion';
      return { ...makeEdge(nodes, String(e.source), String(e.target), kind), id: e.id ?? uid() };
    });
  return { nodes, edges };
}

function serialize(g) {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    edges: g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: { kind: e.data.kind } })),
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
    data.deceased && 'is-dead',
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
      {SIDES.map((s) => (
        <Handle key={s} id={`s-${s}`} type="source" position={POS[s]} />
      ))}

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

/* ---------- Arista ---------- */

function Deco({ type, color }) {
  const box = { fill: '#fafaf9', stroke: color, strokeWidth: 1.5 };
  switch (type) {
    case 'slash':
      return <path d="M-5 4 L1 -4 M1 4 L7 -4" stroke={color} strokeWidth={1.5} fill="none" />;
    case 'bar':
      return <path d="M-3 -6 V6 M3 -6 V6" stroke={color} strokeWidth={1.5} fill="none" />;
    case 'circle':
      return <circle r={4} {...box} />;
    case 'double':
      return (
        <>
          <circle cx={-4} r={3.5} {...box} />
          <circle cx={4} r={3.5} {...box} />
        </>
      );
    case 'box':
      return (
        <>
          <rect x={-5} y={-5} width={10} height={10} {...box} />
          <path d="M-5 -5 L5 5 M5 -5 L-5 5" stroke={color} strokeWidth={1} fill="none" />
        </>
      );
    case 'x':
      return <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke={color} strokeWidth={2} fill="none" />;
    default:
      return null;
  }
}

function RelationEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd,
}) {
  const def = KINDS[data?.kind] ?? KINDS.filiacion;
  const p = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };

  let d;
  if (PARENT_KINDS.includes(data?.kind) && data?.bus) {
    // Bajada desde la pareja, línea horizontal compartida y bajada al hijo
    const { bx, cy, by } = data.bus;
    d = `M ${bx} ${cy} L ${bx} ${by} L ${targetX} ${by} L ${targetX} ${targetY}`;
  } else {
    const [path] = def.smooth ? getSmoothStepPath({ ...p, borderRadius: 0 }) : getStraightPath(p);
    d = path;
  }

  const mx = (sourceX + targetX) / 2;
  const my = (sourceY + targetY) / 2;
  const angle = (Math.atan2(targetY - sourceY, targetX - sourceX) * 180) / Math.PI;
  const style = { stroke: def.color, strokeWidth: def.width, strokeDasharray: def.dash };

  return (
    <g>
      <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
      {def.deco === 'triple' ? (
        [-3, 0, 3].map((o) => (
          <path key={o} d={d} fill="none" style={style} transform={`translate(0,${o})`} />
        ))
      ) : (
        <path d={d} fill="none" style={style} markerEnd={markerEnd} />
      )}
      {def.deco && def.deco !== 'triple' && (
        <g transform={`translate(${mx},${my}) rotate(${angle})`}>
          <Deco type={def.deco} color={def.color} />
        </g>
      )}
    </g>
  );
}

const edgeTypes = { rel: RelationEdge };

/* ---------- Paneles ---------- */

function KindOptions() {
  const entries = Object.entries(KINDS);
  return (
    <>
      <optgroup label="Vínculos">
        {entries.filter(([, d]) => d.group === 'vinculo').map(([k, d]) => (
          <option key={k} value={k}>{d.label}</option>
        ))}
      </optgroup>
      <optgroup label="Emocionales">
        {entries.filter(([, d]) => d.group === 'emocion').map(([k, d]) => (
          <option key={k} value={k}>{d.label}</option>
        ))}
      </optgroup>
    </>
  );
}

function Editor({ node, graph, onChange, onDelete, onClose, onEdgeKind, onRemoveEdge, onAddRel }) {
  const { name = '', year = '', gender = 'M', deceased = false, index = false } = node.data;
  const [other, setOther] = useState('');
  const [kind, setKind] = useState('amistad');
  const [role, setRole] = useState('padre');

  const rels = graph.edges.filter((e) => e.source === node.id || e.target === node.id);
  const nameOf = (id) => find(graph.nodes, id)?.data.name || 'Sin nombre';
  const isParent = PARENT_KINDS.includes(kind);

  function submit() {
    if (!other) return;
    if (isParent && role === 'hijo') onAddRel(other, node.id, kind);
    else onAddRel(node.id, other, kind);
    setOther('');
  }

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

      <div className="section-title">Relaciones</div>
      {rels.length === 0 && <p className="hint">Sin relaciones todavía.</p>}
      {rels.map((e) => {
        const otherId = e.source === node.id ? e.target : e.source;
        return (
          <div key={e.id} className="rel-row">
            <div className="rel-info">
              <small>con {nameOf(otherId)}</small>
              <select value={e.data.kind} onChange={(ev) => onEdgeKind(e.id, ev.target.value)}>
                <KindOptions />
              </select>
            </div>
            <button className="ghost" onClick={() => onRemoveEdge(e.id)} title="Quitar" aria-label="Quitar">✕</button>
          </div>
        );
      })}

      <div className="add-rel">
        <div className="section-title">Agregar relación</div>
        <select value={other} onChange={(e) => setOther(e.target.value)}>
          <option value="">Elegir persona…</option>
          {graph.nodes.filter((n) => n.id !== node.id).map((n) => (
            <option key={n.id} value={n.id}>{n.data.name || 'Sin nombre'}</option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <KindOptions />
        </select>
        {isParent && (
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="padre">Esta persona es padre/madre de la otra</option>
            <option value="hijo">Esta persona es hijo/a de la otra</option>
          </select>
        )}
        <button className="primary" onClick={submit} disabled={!other}>Conectar</button>
      </div>

      <p className="hint">Para quitar una línea del diagrama, selecciónala y pulsa Supr.</p>
      <button className="danger" onClick={onDelete}>Eliminar persona</button>
    </aside>
  );
}

function Legend({ used, onClose }) {
  const items = Object.entries(KINDS).filter(([k]) => used.includes(k));
  return (
    <div className="legend">
      <div className="editor-head">
        <strong>Leyenda</strong>
        <button className="ghost" onClick={onClose} aria-label="Ocultar">✕</button>
      </div>
      {items.length === 0 && <p className="hint">Aún no hay relaciones.</p>}
      {items.map(([k, d]) => (
        <div key={k} className="legend-row">
          <span
            className="swatch"
            style={{ borderTop: `${d.width}px ${d.dash ? 'dashed' : 'solid'} ${d.color}` }}
          />
          {d.label}
        </div>
      ))}
    </div>
  );
}

/* ---------- App ---------- */

export default function App() {
  const [graph, setGraph] = useState(loadInitial);
  const [selectedId, setSelectedId] = useState(null);
  const [drawKind, setDrawKind] = useState('matrimonio');
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
        return { nodes, edges: g.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
      }),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setGraph((g) => ({ ...g, edges: applyEdgeChanges(changes, g.edges) })),
    []
  );

  const onConnect = useCallback(
    (params) =>
      setGraph((g) => {
        if (params.source === params.target) return g;
        let source = params.source;
        let target = params.target;
        let srcSide = (params.sourceHandle ?? 's-r').slice(2);
        let tgtSide = (params.targetHandle ?? 's-l').slice(2);
        const vertical = ['t', 'b'].includes(srcSide) || ['t', 'b'].includes(tgtSide);
        let kind;

        if (vertical) {
          kind = drawKind === 'adopcion' ? 'adopcion' : 'filiacion';
          if (srcSide === 't' || tgtSide === 'b') {
            [source, target] = [target, source];
            [srcSide, tgtSide] = [tgtSide, srcSide];
          }
        } else {
          kind = PARENT_KINDS.includes(drawKind) ? 'matrimonio' : drawKind;
        }

        return {
          ...g,
          edges: [
            ...g.edges,
            {
              id: uid(),
              source,
              target,
              sourceHandle: `s-${srcSide}`,
              targetHandle: `s-${tgtSide}`,
              data: { kind },
            },
          ],
        };
      }),
    [drawKind]
  );

  const act = useCallback((type, id) => setGraph((g) => ACTIONS[type](g, id)), []);
  const ctx = useMemo(() => ({ act }), [act]);

  // Calcula la estructura de pareja: bajada desde el punto medio, horizontal compartida
  const viewEdges = useMemo(() => {
    const pos = (id) => find(graph.nodes, id)?.position;
    return graph.edges.map((e) => {
      const def = KINDS[e.data?.kind] ?? KINDS.filiacion;
      let bus;

      if (PARENT_KINDS.includes(e.data?.kind)) {
        const child = pos(e.target);
        const pts = parentsOf(graph, e.target).map(pos).filter(Boolean);
        let bx;
        let cy;
        if (pts.length >= 2) {
          bx = (pts[0].x + pts[1].x) / 2 + 60;
          cy = pts[0].y + 60;
        } else {
          const p = pos(e.source);
          bx = p.x + 60;
          cy = p.y + 120;
        }
        if (child) bus = { bx, cy, by: (cy + child.y) / 2 };
      }

      return {
        ...e,
        type: 'rel',
        data: { ...e.data, bus },
        markerEnd: def.arrow ? { type: MarkerType.ArrowClosed, color: def.color } : undefined,
      };
    });
  }, [graph]);

  const usedKinds = useMemo(
    () => [...new Set(graph.edges.map((e) => e.data?.kind).filter(Boolean))],
    [graph.edges]
  );

  const selected = find(graph.nodes, selectedId);

  function addFree() {
    const id = uid();
    setGraph((g) => {
      const x = freeX(g.nodes, 300, 150);
      return { ...g, nodes: [...g.nodes, personNode(id, x, 150, { name: 'Nueva persona' })] };
    });
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
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.source !== id && e.target !== id),
    }));
    setSelectedId(null);
  }

  function removeEdge(id) {
    setGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== id) }));
  }

  function changeEdgeKind(id, kind) {
    setGraph((g) => ({
      ...g,
      edges: g.edges.map((e) => (e.id === id ? { ...e, data: { ...e.data, kind } } : e)),
    }));
  }

  function addRel(a, b, kind) {
    setGraph((g) => ({ ...g, edges: [...g.edges, makeEdge(g.nodes, a, b, kind)] }));
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
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw new Error('formato');
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
    setGraph({ nodes: [personNode(uid(), 300, 150, { name: 'Persona índice', index: true })], edges: [] });
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
            <label className="kind">
              Tipo al arrastrar (horizontal)
              <select value={drawKind} onChange={(e) => setDrawKind(e.target.value)}>
                <KindOptions />
              </select>
            </label>
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
              edges={viewEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              connectionMode="loose"
              connectionRadius={40}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              deleteKeyCode={['Backspace', 'Delete']}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d6d3d1" />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
            {showLegend && <Legend used={usedKinds} onClose={() => setShowLegend(false)} />}
          </div>

          {selected && (
            <Editor
              key={selected.id}
              node={selected}
              graph={graph}
              onChange={(patch) => updateNode(selected.id, patch)}
              onDelete={() => deleteNode(selected.id)}
              onClose={() => setSelectedId(null)}
              onEdgeKind={changeEdgeKind}
              onRemoveEdge={removeEdge}
              onAddRel={addRel}
            />
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}
