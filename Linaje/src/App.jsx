import { useState, useCallback, useMemo, useRef, useEffect, createContext, useContext } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, Handle, Position,
  MarkerType, applyNodeChanges, applyEdgeChanges, getSmoothStepPath, getStraightPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// --- CONFIGURACIÓN DE RELACIONES ---
const REL_TYPES = {
  marriage: { label: 'Matrimonio', color: '#374151', width: 2, type: 'straight' },
  divorce: { label: 'Divorcio / Separación', color: '#ef4444', width: 2, type: 'straight', deco: 'slash' },
  union: { label: 'Unión Libre', color: '#374151', width: 2, dash: '6 4', type: 'straight' },
  parent: { label: 'Filiación', color: '#6b7280', width: 1.5, type: 'smoothstep' },
  conflict: { label: 'Conflicto', color: '#ef4444', width: 2, dash: '6 4', type: 'straight' },
  close: { label: 'Muy Cercano', color: '#10b981', width: 3, type: 'straight' },
  distant: { label: 'Distante', color: '#9ca3af', width: 1.5, dash: '2 4', type: 'straight' },
  abuse: { label: 'Abuso', color: '#7f1d1d', width: 2, dash: '2 2', arrow: true, type: 'straight' },
};

const uid = () => crypto.randomUUID();
const Ctx = createContext({ act: () => {} });

// --- LÓGICA DE AGREGADO INTUITIVO ---
function addParent(graph, childId) {
  const c = graph.nodes.find((n) => n.id === childId);
  const id = uid();
  const existingParents = graph.edges.filter(e => e.target === childId && e.data?.kind === 'parent').length;
  return {
    nodes: [...graph.nodes, { id, type: 'person', position: { x: c.position.x + (existingParents * 200), y: c.position.y - 220 }, data: { name: 'Nuevo Padre/Madre', gender: 'M' } }],
    edges: [...graph.edges, { id: uid(), source: id, target: childId, type: 'custom', data: { kind: 'parent' } }]
  };
}

function addChild(graph, parentId) {
  const p = graph.nodes.find((n) => n.id === parentId);
  const id = uid();
  // Buscar pareja para conectar al hijo también con ella
  const partnerEdge = graph.edges.find(e => 
    (e.source === parentId || e.target === parentId) && 
    (e.data?.kind === 'marriage' || e.data?.kind === 'union')
  );
  const partnerId = partnerEdge ? (partnerEdge.source === parentId ? partnerEdge.target : partnerEdge.source) : null;
  
  const existingChildren = graph.edges.filter(e => e.source === parentId && e.data?.kind === 'parent').length;
  
  let newEdges = [{ id: uid(), source: parentId, target: id, type: 'custom', data: { kind: 'parent' } }];
  if (partnerId) {
    newEdges.push({ id: uid(), source: partnerId, target: id, type: 'custom', data: { kind: 'parent' } });
  }

  return {
    nodes: [...graph.nodes, { id, type: 'person', position: { x: p.position.x + (existingChildren * 180), y: p.position.y + 220 }, data: { name: 'Nuevo Hijo/a', gender: 'M' } }],
    edges: [...graph.edges, ...newEdges]
  };
}

function addPartner(graph, personId) {
  const p = graph.nodes.find((n) => n.id === personId);
  const id = uid();
  const existingPartners = graph.edges.filter(e => 
    (e.source === personId || e.target === personId) && 
    (e.data?.kind === 'marriage' || e.data?.kind === 'union')
  ).length;

  return {
    nodes: [...graph.nodes, { id, type: 'person', position: { x: p.position.x + 240 * (existingPartners + 1), y: p.position.y }, data: { name: 'Nueva Pareja', gender: p.data.gender === 'F' ? 'M' : 'F' } }],
    edges: [...graph.edges, { id: uid(), source: personId, target: id, type: 'custom', data: { kind: 'marriage' } }]
  };
}

const ACTIONS = { padre: addParent, hijo: addChild, pareja: addPartner };

// --- COMPONENTE NODO CON BOTONES RÁPIDOS ---
function PersonNode({ id, data, selected }) {
  const { act } = useContext(Ctx);
  const isFemale = data.gender === 'F';
  
  const quickAction = (type) => (e) => {
    e.stopPropagation();
    act(type, id);
  };

  return (
    <div className={`person-node ${isFemale ? 'female' : 'male'} ${selected ? 'selected' : ''}`}>
      <Handle type="source" position={Position.Top} id="t" className="handle" />
      <Handle type="source" position={Position.Right} id="r" className="handle" />
      <Handle type="source" position={Position.Bottom} id="b" className="handle" />
      <Handle type="source" position={Position.Left} id="l" className="handle" />
      
      <div className="content">
        <div className="name">{data.name || 'Sin Nombre'}</div>
        {data.year && <div className="year">{data.year}</div>}
      </div>

      {/* BOTONES RÁPIDOS INTUITIVOS */}
      {selected && (
        <>
          <button className="quick-btn q-top nodrag" onClick={quickAction('padre')}>+ Padre/Madre</button>
          <button className="quick-btn q-bottom nodrag" onClick={quickAction('hijo')}>+ Hijo/a</button>
          <button className="quick-btn q-right nodrag" onClick={quickAction('pareja')}>+ Pareja</button>
        </>
      )}
    </div>
  );
}

// --- BORDE PERSONALIZADO PARA DIVORCIO ---
function CustomEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }) {
  const type = data?.kind || 'parent';
  const config = REL_TYPES[type] || REL_TYPES.parent;
  
  const edgeParams = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
  const [edgePath] = config.type === 'smoothstep' ? getSmoothStepPath(edgeParams) : getStraightPath(edgeParams);
  
  const style = { stroke: config.color, strokeWidth: config.width, strokeDasharray: config.dash };

  if (config.deco === 'slash') {
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    return (
      <g>
        <path d={edgePath} fill="none" style={style} markerEnd={markerEnd} />
        <line x1={midX - 6} y1={midY - 6} x2={midX + 6} y2={midY + 6} stroke={config.color} strokeWidth={2.5} />
        <line x1={midX - 1} y1={midY - 6} x2={midX + 11} y2={midY + 6} stroke={config.color} strokeWidth={2.5} />
      </g>
    );
  }

  return <path d={edgePath} fill="none" style={style} markerEnd={markerEnd} />;
}

const nodeTypes = { person: PersonNode };
const edgeTypes = { custom: CustomEdge };

// --- DATOS INICIALES ---
const SAMPLE = {
  nodes: [
    { id: '1', type: 'person', position: { x: 100, y: 100 }, data: { name: 'Pedro García', year: '1945-2020', gender: 'M' } },
    { id: '2', type: 'person', position: { x: 400, y: 100 }, data: { name: 'María López', year: '1948-', gender: 'F' } },
  ],
  edges: [
    { id: 'e1', source: '1', target: '2', type: 'custom', data: { kind: 'marriage' } },
    { id: 'e2', source: '1', target: '2', type: 'custom', data: { kind: 'divorce' } },
  ]
};

export default function App() {
  const [graph, setGraph] = useState(() => {
    try {
      const saved = localStorage.getItem('linaje-v5');
      return saved ? JSON.parse(saved) : SAMPLE;
    } catch { return SAMPLE; }
  });
  
  const [selectedId, setSelectedId] = useState(null);
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState('conflict');

  useEffect(() => {
    localStorage.setItem('linaje-v5', JSON.stringify(graph));
  }, [graph]);

  const onNodesChange = useCallback((c) => setGraph(g => ({ ...g, nodes: applyNodeChanges(c, g.nodes) })), []);
  const onEdgesChange = useCallback((c) => setGraph(g => ({ ...g, edges: applyEdgeChanges(c, g.edges) })), []);
  
  const act = useCallback((type, id) => setGraph(g => ACTIONS[type](g, id)), []);
  const ctx = useMemo(() => ({ act }), [act]);

  const addManualRel = () => {
    if (!selectedId || !relTarget) return;
    setGraph(g => ({
      ...g,
      edges: [...g.edges, { id: uid(), source: selectedId, target: relTarget, type: 'custom', data: { kind: relType } }]
    }));
    setRelTarget('');
  };

  const updateNode = (id, patch) => setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n) }));
  const deleteNode = (id) => setGraph(g => ({ nodes: g.nodes.filter(n => n.id !== id), edges: g.edges.filter(e => e.source !== id && e.target !== id) }));
  const removeEdge = (id) => setGraph(g => ({ ...g, edges: g.edges.filter(e => e.id !== id) }));

  const selected = graph.nodes.find(n => n.id === selectedId);
  const others = graph.nodes.filter(n => n.id !== selectedId);

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <h1>Linaje Forense</h1>
          <div className="toolbar">
            <button className="primary" onClick={() => setGraph(SAMPLE)}>Reset Ejemplo</button>
          </div>
        </header>

        <div className="body">
          <div className="canvas">
            <ReactFlow
              nodes={graph.nodes} edges={graph.edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes} edgeTypes={edgeTypes}
              fitView deleteKeyCode="Delete"
              onEdgesDelete={(del) => del.forEach(e => removeEdge(e.id))}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Controls /><MiniMap />
              
              <div className="legend-overlay">
                <strong>Leyenda</strong>
                {Object.entries(REL_TYPES).map(([k, v]) => (
                  <div key={k} className="legend-row">
                    <span className="swatch" style={{ borderTopColor: v.color, borderTopWidth: v.width, borderStyle: v.dash ? 'dashed' : 'solid' }} />
                    {v.label}
                  </div>
                ))}
              </div>
            </ReactFlow>
          </div>

          {selected && (
            <aside className="editor">
              <div className="editor-head"><strong>Editar Persona</strong><button className="ghost" onClick={() => setSelectedId(null)}></button></div>
              
              <label>Nombre<input value={selected.data.name} onChange={e => updateNode(selected.id, { name: e.target.value })} /></label>
              <label>Años<input value={selected.data.year || ''} onChange={e => updateNode(selected.id, { year: e.target.value })} placeholder="1980-" /></label>
              <label>Género
                <select value={selected.data.gender} onChange={e => updateNode(selected.id, { gender: e.target.value })}>
                  <option value="M">Masculino (Cuadrado)</option>
                  <option value="F">Femenino (Círculo)</option>
                </select>
              </label>

              <div className="section-title">Agregar Relación Especial</div>
              <select value={relTarget} onChange={e => setRelTarget(e.target.value)}>
                <option value="">Seleccionar persona...</option>
                {others.map(n => <option key={n.id} value={n.id}>{n.data.name || n.id}</option>)}
              </select>
              <select value={relType} onChange={e => setRelType(e.target.value)}>
                {Object.entries(REL_TYPES).filter(([k]) => !['marriage','parent','divorce'].includes(k)).map(([k,v]) => 
                  <option key={k} value={k}>{v.label}</option>
                )}
              </select>
              <button className="primary full" onClick={addManualRel} disabled={!relTarget}>Conectar Vínculo</button>

              <div className="section-title">Vínculos Activos</div>
              <div className="rel-list">
                {graph.edges.filter(e => e.source === selected.id || e.target === selected.id).map(e => {
                  const otherId = e.source === selected.id ? e.target : e.source;
                  const otherName = graph.nodes.find(n => n.id === otherId)?.data.name || '?';
                  return (
                    <div key={e.id} className="rel-item">
                      <span>{REL_TYPES[e.data?.kind]?.label || e.data?.kind} ↔ {otherName}</span>
                      <button className="ghost" onClick={() => removeEdge(e.id)}>✕</button>
                    </div>
                  );
                })}
              </div>
              
              <button className="danger" onClick={() => deleteNode(selected.id)}>Eliminar Persona</button>
            </aside>
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}
