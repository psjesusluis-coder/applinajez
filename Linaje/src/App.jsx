import {
  useState, useCallback, useMemo, useRef, useEffect, useContext, createContext,
} from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, Handle, Position,
  MarkerType, applyNodeChanges, applyEdgeChanges, getSmoothStepPath, getStraightPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ALL_KINDS, STRUCTURAL, EMOTIONAL, PARENT_KINDS, PARTNER_KINDS, LEGACY,
} from './relations.js';

const STORAGE_KEY = 'linaje-genograma-v3';
const uid = () => crypto.randomUUID();
const SIDES = { t: Position.Top, b: Position.Bottom, l: Position.Left, r: Position.Right };
const Ctx = createContext({ act: () => {} });

/* ---------- Modelo ---------- */

function pickSides(a, b, kind) {
  if (PARENT_KINDS.includes(kind)) return ['b', 't'];
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}

function makeEdge(nodes, source, target, kind) {
  const a = nodes.find((n) => n.id === source);
  const b = nodes.find((n) => n.id === target);
  const [s, t] = pickSides(a, b, kind);
  return {
    id: uid(),
    source,
    target,
    sourceHandle: `s-${s}`,
    targetHandle: `t-${t}`,
    data: { kind },
  };
}

function personNode(id, x, y, data = {}) {
  return {
    id,
    type: 'person',
    position: { x, y },
    data: { name: '', year: '', gender: 'M', deceased: false, ...data },
  };
}

function parentsOf(g, id) {
  return g.edges
    .filter((e) => PARENT_KINDS.includes(e.data?.kind) && e.target === id)
    .map((e) => e.source);
}

function partnersOf(g, id) {
  return g.edges
    .filter((e) => PARTNER_KINDS.includes(e.data?.kind) && (e.source === id || e.target === id))
    .map((e) => (e.source === id ? e.target : e.source));
}

function addParent(g, childId) {
  const c = g.nodes.find((n) => n.id === childId);
  const id = uid();
  const idx = parentsOf(g, childId).length;
  const nodes = [
    ...g.nodes,
    personNode(id, c.position.x + idx * 200, c.position.y - 220, { name: 'Nuevo padre' }),
  ];
  return { nodes, edges: [...g.edges, makeEdge(nodes, id, childId, 'filiacion')] };
}

function addChild(g, parentId) {
  const p = g.nodes.find((n) => n.id === parentId);
  const id = uid();
  const idx = g.edges.filter((e) => PARENT_KINDS.includes(e.data?.kind) && e.source === parentId).length;
  const nodes = [
    ...g.nodes,
    personNode(id, p.position.x + idx * 200, p.position.y + 220, { name: 'Nuevo hijo/a' }),
  ];
  const parents = [parentId, ...partnersOf(g, parentId)];
  const edges = [...g.edges, ...parents.map((pid) => makeEdge(nodes, pid, id, 'filiacion'))];
  return { nodes, edges };
}

function addPartner(g, personId) {
  const p = g.nodes.find((n) => n.id === personId);
  const id = uid();
  const n = partnersOf(g, personId).length;
  const nodes = [
    ...g.nodes,
    personNode(id, p.position.x + 240 * (n + 1), p.position.y, {
      name: 'Nueva pareja',
      gender: p.data.gender === 'F' ? 'M' : 'F',
    }),
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
    { id: 'padre', position: { x: 220, y: 200 }, data: { name: 'Juan García', year: '1975–', gender: 'M' } },
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
  const nodes = data.nodes.map((n) => ({
    id: n.id,
    type: 'person',
    position: n.position,
    data: { name: '', year: '', gender: 'M', deceased: false, ...n.data },
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = data.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => {
      const kind = LEGACY[e.data?.kind] ?? e.data?.kind ?? 'filiacion';
      return { ...makeEdge(nodes, e.source, e.target, kind), id: e.id ?? uid() };
    });
  return { nodes, edges };
}

function serialize(g) {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, position: n.position, data: n.data })),
    edges: g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data })),
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
  const cls = data.gender === 'F' ? 'person--f' : 'person--m';
  const quick = (type) => (e) => {
    e.stopPropagation();
    act(type, id);
  };
  return (
    <div className={`person ${cls} ${selected ? 'is-selected' : ''} ${data.deceased ? 'is-dead' : ''}`}>
      {Object.entries(SIDES).map(([s, pos]) => (
        <Handle key={`s-${s}`} id={`s-${s}`} type="source" position={pos} />
      ))}
      {Object.entries(SIDES).map(([s, pos]) => (
        <Handle key={`t-${s}`} id={`t-${s}`} type="target" position={pos} />
      ))}

      <div className="person-name">{data.name || 'Sin nombre'}</div>
      {data.year && <div className="person-year">{data.year}</div>}

      {selected && (
        <>
          <div className="quick nodrag q-top">
            <button onClick={quick('padre')}>+ Padre/Madre</button>
          </div>
          <div className="quick nodrag q-bottom">
            <button onClick={quick('hijo')}>+ Hijo/a</button>
          </div>
          <div className="quick nodrag q-right">
            <button onClick={quick('pareja')}>+ Pareja</button>
          </div>
          <div className="quick nodrag q-left">
            <button onClick={quick('hermano')}>+ Hermano/a</button>
          </div>
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
  const def = ALL_KINDS[data?.kind] ?? ALL_KINDS.filiacion;
  const params = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
  const [path] = def.smooth ? getSmoothStepPath(params) : getStraightPath(params);
  const mx = (sourceX + targetX) / 2;
  const my = (sourceY + targetY) / 2;
  const angle = (Math.atan2(targetY - sourceY, targetX - sourceX) * 180) / Math.PI;
  const style = { stroke: def.color, strokeWidth: def.width, strokeDasharray: def.dash };

  if (def.deco === 'triple') {
    return (
      <g>
        {[-3, 0, 3].map((o) => (
          <path key={o} d={path} fill="none" style={style} transform={`translate(0,${o})`} />
        ))}
      </g>
    );
  }

  return (
    <g>
      <path d={path} fill="none" style={style} markerEnd={markerEnd} />
      {def.deco && (
        <g transform={`translate(${mx},${my}) rotate(${angle})`}>
          <Deco type={def.deco} color={def.color} />
        </g>
      )}
    </g>
  );
}

const edgeTypes = { rel: RelationEdge };

/* ---------- Paneles ---------- */

function Editor({ node, graph, onChange, onDelete, onClose, onRemoveEdge, onAddRel }) {
  const { name = '', year = '', gender = 'M', deceased = false } = node.data;
  const [other, setOther] = useState('');
  const [kind, setKind] = useState('amistad');
  const [role, setRole] = useState('padre');

  const rels = graph.edges.filter((e) => e.source === node.id || e.target === node.id);
  const nameOf = (id) => graph.nodes.find((n) => n.id === id)?.data.name || 'Sin nombre';
  const others = graph.nodes.filter((n) => n.id !== node.id);

  function submit() {
    if (!other) return;
    if (PARENT_KINDS.includes(kind)) {
      if (role === 'padre') onAddRel(node.id, other, kind);
      else onAddRel(other, node.id, kind);
    } else {
      onAddRel(node.id, other, kind);
    }
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

      <div className="section-title">Relaciones</div>
      {rels.length === 0 && <p className="hint">Sin relaciones todavía.</p>}
      {rels.map((e) => {
        const otherId = e.source === node.id ? e.target : e.source;
        return (
          <div key={e.id} className="rel-row">
            <span>
              {ALL_KINDS[e.data?.kind]?.label ?? e.data?.kind}
              <small> con {nameOf(otherId)}</small>
            </span>
            <button className="ghost" onClick={() => onRemoveEdge(e.id)} title="Quitar">✕</button>
          </div>
        );
      })}

      <div className="add-rel">
        <div className="section-title">Agregar relación</div>
        <select value={other} onChange={(e) => setOther(e.target.value)}>
          <option value="">Elegir persona…</option>
          {others.map((n) => (
            <option key={n.id} value={n.id}>{n.data.name || 'Sin nombre'}</option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <optgroup label="Estructura">
            {Object.entries(STRUCTURAL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </optgroup>
          <optgroup label="Emocional">
            {Object.entries(EMOTIONAL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </optgroup>
        </select>
        {PARENT_KINDS.includes(kind) && (
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="padre">Esta persona es padre/madre de</option>
            <option value="hijo">Esta persona es hijo/a de</option>
          </select>
        )}
        <button className="primary" onClick={submit} disabled={!other}>Conectar</button>
      </div>

      <p className="hint">Para quitar una línea del diagrama, selecciónala y pulsa Supr.</p>
      <button className="danger" onClick={onDelete}>Eliminar persona</button>
    </aside>
  );
}

function Legend({ onClose }) {
  return (
    <div className="legend">
      <div className="editor-head">
        <strong>Leyenda</strong>
        <button className="ghost" onClick={onClose} aria-label="Ocultar">✕</button>
      </div>
      {[['Estructura', STRUCTURAL], ['Emocional', EMOTIONAL]].map(([title, obj]) => (
        <div key={title}>
          <div className="legend-title">{title}</div>
          {Object.entries(obj).map(([k, d]) => (
            <div key={k} className="legend-row">
              <span
                className="swatch"
                style={{
                  borderTopColor: d.color,
                  borderTopWidth: d.width,
                  borderTopStyle: d.dash ? 'dashed' : 'solid',
                }}
              />
              {d.label}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------- App ---------- */

export default function App() {
  const [graph, setGraph] = useState(loadInitial);
  const [selectedId, setSelectedId] = useState(null);
  const [newKind, setNewKind] = useState('amistad');
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
    (changes) => setGraph((g) => ({ ...g, nodes: applyNodeChanges(changes, g.nodes) })),
    []
  );
  const onEdgesChange = useCallback(
    (changes) => setGraph((g) => ({ ...g, edges: applyEdgeChanges(changes, g.edges) })),
    []
  );
  const onConnect = useCallback(
    (params) =>
      setGraph((g) => ({
        ...g,
        edges: [
          ...g.edges,
          {
            id: uid(),
            source: params.source,
            target: params.target,
            sourceHandle: params.sourceHandle,
            targetHandle: params.targetHandle,
            data: { kind: newKind },
          },
        ],
      })),
    [newKind]
  );

  const act = useCallback((type, id) => setGraph((g) => ACTIONS[type](g, id)), []);
  const ctx = useMemo(() => ({ act }), [act]);

  const viewEdges = useMemo(
    () =>
      graph.edges.map((e) => {
        const def = ALL_KINDS[e.data?.kind] ?? ALL_KINDS.filiacion;
        return {
          ...e,
          type: 'rel',
          markerEnd: def.arrow ? { type: MarkerType.ArrowClosed, color: def.color } : undefined,
        };
      }),
    [graph.edges]
  );

  const selected = graph.nodes.find((n) => n.id === selectedId);

  function addFree() {
    const id = uid();
    setGraph((g) => ({
      ...g,
      nodes: [...g.nodes, personNode(id, 200 + Math.random() * 200, 150 + Math.random() * 150, { name: 'Nueva persona' })],
    }));
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
              Al arrastrar entre puntos:
              <select value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                {Object.entries(ALL_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <button onClick={() => setShowLegend((v) => !v)}>Leyenda</button>
            <button onClick={exportJson}>Exportar</button>
            <button onClick={() => fileRef.current?.click()}>Importar</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJson} />
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
            {showLegend && <Legend onClose={() => setShowLegend(false)} />}
          </div>

          {selected && (
            <Editor
              key={selected.id}
              node={selected}
              graph={graph}
              onChange={(patch) => updateNode(selected.id, patch)}
              onDelete={() => deleteNode(selected.id)}
              onClose={() => setSelectedId(null)}
              onRemoveEdge={removeEdge}
              onAddRel={addRel}
            />
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}