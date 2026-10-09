import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, Handle, Position,
  MarkerType, applyNodeChanges, applyEdgeChanges, getStraightPath, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// --- CONFIGURACIÓN DE RELACIONES ---
const REL_TYPES = {
  marriage: { label: 'Matrimonio', color: '#1e293b', width: 2, type: 'straight' },
  divorce: { label: 'Divorciado', color: '#ef4444', width: 2, type: 'straight', deco: 'slash' },
  separation: { label: 'Separación', color: '#ef4444', width: 2, type: 'straight', dash: '4 4', deco: 'bar' },
  cohabitation: { label: 'Cohabitación', color: '#1e293b', width: 2, dash: '6 4', type: 'straight' },
  parent: { label: 'Filiación', color: '#64748b', width: 1.5, type: 'smoothstep' },
};

const uid = () => crypto.randomUUID();

// --- NODO PERSONA (DIMENSIONES FIJAS 160x160) ---
function PersonNode({ data, selected }) {
  const isFemale = data.gender === 'F';
  
  return (
    <div className={`person-node ${isFemale ? 'female' : 'male'} ${selected ? 'selected' : ''}`}>
      {/* Handles invisibles en los 4 puntos cardinales para conexiones precisas */}
      <Handle type="source" position={Position.Top} id="t" className="handle" />
      <Handle type="source" position={Position.Right} id="r" className="handle" />
      <Handle type="source" position={Position.Bottom} id="b" className="handle" />
      <Handle type="source" position={Position.Left} id="l" className="handle" />
      
      <div className="content">
        <div className="name">{data.name || 'Persona'}</div>
        {data.year && <div className="year">{data.year}</div>}
      </div>
    </div>
  );
}

// --- BORDE PERSONALIZADO (DIVORCIO/SEPARACIÓN CORRECTOS) ---
function CustomEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const type = data?.kind || 'parent';
  const config = REL_TYPES[type] || REL_TYPES.parent;
  
  // Usamos línea recta para parejas, smoothstep para padres-hijos
  const edgeParams = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
  const [edgePath] = config.type === 'smoothstep' 
    ? require('@xyflow/react').getSmoothStepPath(edgeParams)[0] 
    : getStraightPath(edgeParams)[0];
  
  const style = { stroke: config.color, strokeWidth: config.width, strokeDasharray: config.dash };

  // Decoraciones para Divorcio/Separación
  if (config.deco) {
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    
    return (
      <g>
        <path d={edgePath} fill="none" style={style} />
        {config.deco === 'slash' && (
          <>
            <line x1={midX - 6} y1={midY - 6} x2={midX + 6} y2={midY + 6} stroke={config.color} strokeWidth={2} />
            <line x1={midX - 1} y1={midY - 6} x2={midX + 11} y2={midY + 6} stroke={config.color} strokeWidth={2} />
          </>
        )}
        {config.deco === 'bar' && (
          <line x1={midX} y1={midY - 6} x2={midX} y2={midY + 6} stroke={config.color} strokeWidth={2} />
        )}
      </g>
    );
  }

  return <path d={edgePath} fill="none" style={style} />;
}

const nodeTypes = { person: PersonNode };
const edgeTypes = { custom: CustomEdge };

// --- DATOS INICIALES ---
const SAMPLE = {
  nodes: [
    { id: '1', type: 'person', position: { x: 100, y: 100 }, data: { name: 'Hombre', gender: 'M' } },
    { id: '2', type: 'person', position: { x: 400, y: 100 }, data: { name: 'Femenino', gender: 'F' } },
  ],
  edges: [
    { id: 'e1', source: '1', target: '2', type: 'custom', data: { kind: 'marriage' } },
  ]
};

export default function App() {
  const [graph, setGraph] = useState(() => {
    try {
      const saved = localStorage.getItem('linaje-v6');
      return saved ? JSON.parse(saved) : SAMPLE;
    } catch { return SAMPLE; }
  });
  
  const [selectedId, setSelectedId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, nodeId }
  const reactFlowInstance = useReactFlow();

  // Guardado automático
  useEffect(() => {
    localStorage.setItem('linaje-v6', JSON.stringify(graph));
  }, [graph]);

  // Manejo de cambios en nodos/aristas
  const onNodesChange = useCallback((c) => setGraph(g => ({ ...g, nodes: applyNodeChanges(c, g.nodes) })), []);
  const onEdgesChange = useCallback((c) => setGraph(g => ({ ...g, edges: applyEdgeChanges(c, g.edges) })), []);

  // Acciones del Menú Contextual
  const handleContextMenuAction = (action, targetType = null) => {
    if (!contextMenu?.nodeId) return;
    const currentId = contextMenu.nodeId;
    const currentNode = graph.nodes.find(n => n.id === currentId);

    if (action === 'addParent') {
      const id = uid();
      setGraph(g => ({
        nodes: [...g.nodes, { id, type: 'person', position: { x: currentNode.position.x, y: currentNode.position.y - 250 }, data: { name: 'Padre/Madre', gender: 'M' } }],
        edges: [...g.edges, { id: uid(), source: id, target: currentId, type: 'custom', data: { kind: 'parent' } }]
      }));
    } else if (action === 'addChild') {
      const id = uid();
      setGraph(g => ({
        nodes: [...g.nodes, { id, type: 'person', position: { x: currentNode.position.x, y: currentNode.position.y + 250 }, data: { name: 'Hijo/a', gender: 'M' } }],
        edges: [...g.edges, { id: uid(), source: currentId, target: id, type: 'custom', data: { kind: 'parent' } }]
      }));
    } else if (action === 'addPartner') {
      const id = uid();
      const gender = currentNode.data.gender === 'F' ? 'M' : 'F';
      setGraph(g => ({
        nodes: [...g.nodes, { id, type: 'person', position: { x: currentNode.position.x + 300, y: currentNode.position.y }, data: { name: 'Pareja', gender } }],
        edges: [...g.edges, { id: uid(), source: currentId, target: id, type: 'custom', data: { kind: 'marriage' } }]
      }));
    } else if (action === 'linkExisting') {
      // Abrir modal o lógica para vincular (simplificado aquí: selecciona el primero disponible)
      const other = graph.nodes.find(n => n.id !== currentId);
      if (other) {
        setGraph(g => ({
          ...g,
          edges: [...g.edges, { id: uid(), source: currentId, target: other.id, type: 'custom', data: { kind: targetType || 'marriage' } }]
        }));
      }
    } else if (['male', 'female', 'deceased'].includes(action)) {
      setGraph(g => ({
        ...g,
        nodes: g.nodes.map(n => n.id === currentId ? { 
          ...n, 
          data: { 
            ...n.data, 
            gender: action === 'male' ? 'M' : action === 'female' ? 'F' : n.data.gender,
            deceased: action === 'deceased' ? !n.data.deceased : n.data.deceased 
          } 
        } : n)
      }));
    }
    setContextMenu(null);
  };

  // Actualizar datos de nodo
  const updateNode = (id, patch) => setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n) }));
  const deleteNode = (id) => setGraph(g => ({ nodes: g.nodes.filter(n => n.id !== id), edges: g.edges.filter(e => e.source !== id && e.target !== id) }));

  const selected = graph.nodes.find(n => n.id === selectedId);

  return (
    <div className="app" onClick={() => setContextMenu(null)}>
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
            onNodeContextMenu={(e, node) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
            }}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            fitView deleteKeyCode="Delete"
            onEdgesDelete={(del) => setGraph(g => ({ ...g, edges: g.edges.filter(e => !del.find(d => d.id === e.id)) }))}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls /><MiniMap />
          </ReactFlow>

          {/* MENÚ CONTEXTUAL FLOTANTE */}
          {contextMenu && (
            <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
              <div className="menu-section">
                <div className="menu-title">Atajos</div>
                <button onClick={() => handleContextMenuAction('addParent')}>Agregar padres</button>
                <button onClick={() => handleContextMenuAction('addChild')}>Agregar hijo/a</button>
                <button onClick={() => handleContextMenuAction('addPartner')}>Agregar pareja</button>
              </div>
              
              <div className="menu-section">
                <div className="menu-title">Tipo de persona</div>
                <button onClick={() => handleContextMenuAction('male')}>Hombre</button>
                <button onClick={() => handleContextMenuAction('female')}>Mujer</button>
                <button onClick={() => handleContextMenuAction('deceased')}>Fallecido</button>
              </div>

              <div className="menu-section">
                <div className="menu-title">Vincular a existente...</div>
                <button onClick={() => handleContextMenuAction('linkExisting', 'marriage')}>Matrimonio</button>
                <button onClick={() => handleContextMenuAction('linkExisting', 'divorce')}>Divorciado</button>
                <button onClick={() => handleContextMenuAction('linkExisting', 'separation')}>Separación</button>
                <button onClick={() => handleContextMenuAction('linkExisting', 'cohabitation')}>Cohabitación</button>
              </div>
            </div>
          )}

          {/* LEYENDA */}
          <div className="legend-overlay">
            <strong>Leyenda</strong>
            {Object.entries(REL_TYPES).map(([k, v]) => (
              <div key={k} className="legend-row">
                <span className="swatch" style={{ borderTopColor: v.color, borderTopWidth: v.width, borderStyle: v.dash ? 'dashed' : 'solid' }} />
                {v.label}
              </div>
            ))}
          </div>
        </div>

        {/* PANEL LATERAL DE EDICIÓN */}
        {selected && (
          <aside className="editor">
            <div className="editor-head"><strong>Editar Persona</strong><button className="ghost" onClick={() => setSelectedId(null)}></button></div>
            <label>Nombre<input value={selected.data.name} onChange={e => updateNode(selected.id, { name: e.target.value })} /></label>
            <label>Años<input value={selected.data.year || ''} onChange={e => updateNode(selected.id, { year: e.target.value })} placeholder="1980-" /></label>
            <button className="danger" onClick={() => deleteNode(selected.id)}>Eliminar Persona</button>
          </aside>
        )}
      </div>
    </div>
  );
}
