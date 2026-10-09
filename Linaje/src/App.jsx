import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, Handle, Position,
  MarkerType, applyNodeChanges, applyEdgeChanges, getSmoothStepPath, getStraightPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// --- CONFIGURACIÓN DE RELACIONES ---
const REL_TYPES = {
  marriage: { label: 'Matrimonio', color: '#374151', width: 2, type: 'straight' },
  divorce: { label: 'Divorcio / Separación', color: '#ef4444', width: 2, type: 'straight', deco: 'slash' }, // Línea roja con barras
  union: { label: 'Unión Libre', color: '#374151', width: 2, dash: '6 4', type: 'straight' },
  parent: { label: 'Filiación', color: '#6b7280', width: 1.5, type: 'smoothstep' },
  conflict: { label: 'Conflicto', color: '#ef4444', width: 2, dash: '6 4', type: 'straight' },
  close: { label: 'Muy Cercano', color: '#10b981', width: 3, type: 'straight' },
  distant: { label: 'Distante', color: '#9ca3af', width: 1.5, dash: '2 4', type: 'straight' },
};

const uid = () => crypto.randomUUID();

// --- COMPONENTE DE NODO PERSONA ---
function PersonNode({ data, selected }) {
  const isFemale = data.gender === 'F';
  return (
    <div className={`person-node ${isFemale ? 'female' : 'male'} ${selected ? 'selected' : ''}`}>
      {/* Handles para conexiones manuales si se desean */}
      <Handle type="source" position={Position.Top} id="t" className="handle" />
      <Handle type="source" position={Position.Right} id="r" className="handle" />
      <Handle type="source" position={Position.Bottom} id="b" className="handle" />
      <Handle type="source" position={Position.Left} id="l" className="handle" />
      
      <div className="content">
        <div className="name">{data.name || 'Sin Nombre'}</div>
        {data.year && <div className="year">{data.year}</div>}
      </div>
    </div>
  );
}

// --- COMPONENTE DE LÍNEA PERSONALIZADO (Para Divorcio/Decoraciones) ---
function CustomEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }) {
  const type = data?.kind || 'parent';
  const config = REL_TYPES[type] || REL_TYPES.parent;
  
  // Calcular path
  const edgeParams = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
  const [edgePath] = config.type === 'smoothstep' 
    ? getSmoothStepPath(edgeParams) 
    : getStraightPath(edgeParams);

  // Estilo base
  const style = {
    stroke: config.color,
    strokeWidth: config.width,
    strokeDasharray: config.dash,
  };

  // Lógica especial para DIVORCIO: Dibujar línea + barras decorativas
  if (config.deco === 'slash') {
    // Calculamos el punto medio para poner las barras
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    
    return (
      <g>
        <path d={edgePath} fill="none" style={style} markerEnd={markerEnd} />
        {/* Barras de divorcio // */}
        <line x1={midX - 5} y1={midY - 5} x2={midX + 5} y2={midY + 5} stroke={config.color} strokeWidth={2} />
        <line x1={midX + 2} y1={midY - 5} x2={midX + 12} y2={midY + 5} stroke={config.color} strokeWidth={2} />
      </g>
    );
  }

  return <path d={edgePath} fill="none" style={style} markerEnd={markerEnd} />;
}

const nodeTypes = { person: PersonNode };
const edgeTypes = { custom: CustomEdge };

// --- DATOS DE EJEMPLO CORREGIDOS ---
const INITIAL_NODES = [
  { id: '1', type: 'person', position: { x: 100, y: 100 }, data: { name: 'Pedro García', year: '1945-2020', gender: 'M' } },
  { id: '2', type: 'person', position: { x: 400, y: 100 }, data: { name: 'María López', year: '1948-', gender: 'F' } },
];

const INITIAL_EDGES = [
  // Matrimonio base
  { id: 'e1', source: '1', target: '2', type: 'custom', data: { kind: 'marriage' } },
  // Divorcio superpuesto (mismo origen/destino que el matrimonio)
  { id: 'e2', source: '1', target: '2', type: 'custom', data: { kind: 'divorce' } }, 
];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useState(INITIAL_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  
  // Estado para el panel de relaciones
  const [relTargetId, setRelTargetId] = useState('');
  const [relType, setRelType] = useState('marriage');

  // Guardado automático
  useEffect(() => {
    localStorage.setItem('linaje-v4', JSON.stringify({ nodes, edges }));
  }, [nodes, edges]);

  // Cargar datos
  useEffect(() => {
    const saved = localStorage.getItem('linaje-v4');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setNodes(parsed.nodes || INITIAL_NODES);
        setEdges(parsed.edges || INITIAL_EDGES);
      } catch (e) { console.error("Error cargando datos", e); }
    }
  }, []);

  // Acciones
  const addPerson = () => {
    const id = uid();
    const newNode = {
      id, type: 'person',
      position: { x: 250 + Math.random() * 100, y: 250 + Math.random() * 100 },
      data: { name: 'Nuevo', gender: 'M' }
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  };

  const updateNodeData = (id, newData) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...newData } } : n));
  };

  const deleteNode = (id) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedNodeId(null);
  };

  // AGREGAR RELACIÓN INTUITIVA
  const addRelationship = () => {
    if (!selectedNodeId || !relTargetId) return;
    
    // Evitar duplicados exactos del mismo tipo
    const exists = edges.find(e => 
      (e.source === selectedNodeId && e.target === relTargetId) ||
      (e.source === relTargetId && e.target === selectedNodeId)
    );

    // Si es divorcio, aseguramos que exista un matrimonio primero o lo creamos implícitamente visualmente
    // Aquí simplemente añadimos la arista. El componente CustomEdge se encarga de dibujarla encima si es divorcio.
    
    const newEdge = {
      id: uid(),
      source: selectedNodeId,
      target: relTargetId,
      type: 'custom',
      data: { kind: relType }
    };
    
    setEdges((eds) => [...eds, newEdge]);
    setRelTargetId(''); // Resetear selección
  };

  const removeEdge = (id) => {
    setEdges((eds) => eds.filter((e) => e.id !== id));
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const otherNodes = nodes.filter(n => n.id !== selectedNodeId);

  return (
    <div className="app-container">
      <header className="top-bar">
        <h1>Linaje Forense</h1>
        <div className="actions">
          <button onClick={addPerson} className="btn-primary">+ Persona</button>
          <button onClick={() => { setNodes(INITIAL_NODES); setEdges(INITIAL_EDGES); }} className="btn-secondary">Reset Ejemplo</button>
        </div>
      </header>

      <div className="main-area">
        <div className="canvas-wrapper">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            deleteKeyCode="Delete"
            onEdgesDelete={(deleted) => deleted.forEach(e => removeEdge(e.id))}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap />
          </ReactFlow>
          
          {/* Leyenda Flotante */}
          <div className="legend-overlay">
            <strong>Leyenda</strong>
            {Object.entries(REL_TYPES).map(([k, v]) => (
              <div key={k} className="legend-item">
                <span className="swatch" style={{ borderColor: v.color, borderTopWidth: v.width, borderStyle: v.dash ? 'dashed' : 'solid' }}></span>
                {v.label}
              </div>
            ))}
          </div>
        </div>

        {/* PANEL LATERAL DE EDICIÓN */}
        {selectedNode && (
          <aside className="side-panel">
            <div className="panel-header">
              <h3>Editar Nodo</h3>
              <button onClick={() => setSelectedNodeId(null)}>✕</button>
            </div>
            
            <div className="form-group">
              <label>Nombre</label>
              <input value={selectedNode.data.name} onChange={(e) => updateNodeData(selectedNode.id, { name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Años (ej: 1980-)</label>
              <input value={selectedNode.data.year || ''} onChange={(e) => updateNodeData(selectedNode.id, { year: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Género</label>
              <select value={selectedNode.data.gender} onChange={(e) => updateNodeData(selectedNode.id, { gender: e.target.value })}>
                <option value="M">Masculino (Cuadrado)</option>
                <option value="F">Femenino (Círculo)</option>
              </select>
            </div>

            <hr />
            
            <div className="section-title">Agregar Relación</div>
            <div className="form-group">
              <label>Conectar con:</label>
              <select value={relTargetId} onChange={(e) => setRelTargetId(e.target.value)}>
                <option value="">Seleccionar persona...</option>
                {otherNodes.map(n => (
                  <option key={n.id} value={n.id}>{n.data.name || n.id}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Tipo de vínculo:</label>
              <select value={relType} onChange={(e) => setRelType(e.target.value)}>
                {Object.entries(REL_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <button onClick={addRelationship} className="btn-block" disabled={!relTargetId}>
              Conectar
            </button>

            <hr />
            <div className="section-title">Relaciones Existentes</div>
            <div className="rel-list">
              {edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).map(e => {
                const isSource = e.source === selectedNode.id;
                const otherId = isSource ? e.target : e.source;
                const otherName = nodes.find(n => n.id === otherId)?.data.name || 'Desconocido';
                const rType = REL_TYPES[e.data?.kind]?.label || e.data?.kind;
                
                return (
                  <div key={e.id} className="rel-item">
                    <span>{rType} con {otherName}</span>
                    <button onClick={() => removeEdge(e.id)} className="btn-icon">🗑️</button>
                  </div>
                );
              })}
              {edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id).length === 0 && (
                <p className="empty-msg">Sin relaciones activas.</p>
              )}
            </div>

            <button onClick={() => deleteNode(selectedNode.id)} className="btn-danger">Eliminar Persona</button>
          </aside>
        )}
      </div>
    </div>
  );
}
