import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Handle,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  getStraightPath,
  getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ============================================================================
// 1. CONFIGURACIÓN DE RELACIONES
// ============================================================================
const REL_TYPES = {
  marriage: { label: 'Matrimonio', color: '#1e293b', width: 2, type: 'straight' },
  divorce: { label: 'Divorcio', color: '#ef4444', width: 2, type: 'straight', deco: 'slash' },
  separation: { label: 'Separación', color: '#f97316', width: 2, type: 'straight', dash: '4 4' },
  cohabitation: { label: 'Unión Libre', color: '#1e293b', width: 2, dash: '6 4', type: 'straight' },
  parent: { label: 'Filiación', color: '#64748b', width: 1.5, type: 'smoothstep' },
  conflict: { label: 'Conflicto', color: '#ef4444', width: 2, dash: '6 4', type: 'straight' },
  close: { label: 'Muy Cercano', color: '#10b981', width: 3, type: 'straight' },
  distant: { label: 'Distante', color: '#9ca3af', width: 1.5, dash: '2 4', type: 'straight' },
};

const uid = () => Math.random().toString(36).substr(2, 9);

// ============================================================================
// 2. COMPONENTE: NODO DE PERSONA (Dimensiones Fijas 160x160)
// ============================================================================
function PersonNode({ data, selected }) {
  const isFemale = data.gender === 'F';
  const isDeceased = data.deceased;

  return (
    <div className={`person-node ${isFemale ? 'female' : 'male'} ${selected ? 'selected' : ''} ${isDeceased ? 'deceased' : ''}`}>
      {/* Handles en 4 direcciones para conexiones precisas */}
      <Handle type="source" position={Position.Top} id="t" className="node-handle" />
      <Handle type="source" position={Position.Right} id="r" className="node-handle" />
      <Handle type="source" position={Position.Bottom} id="b" className="node-handle" />
      <Handle type="source" position={Position.Left} id="l" className="node-handle" />
      
      <div className="person-content">
        <div className="person-name">{data.name || 'Sin nombre'}</div>
        {data.year && <div className="person-year">{data.year}</div>}
      </div>
    </div>
  );
}

// ============================================================================
// 3. COMPONENTE: LÍNEA PERSONALIZADA (Soporta divorcio, separación, etc.)
// ============================================================================
function CustomEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const kind = data?.kind || 'parent';
  const config = REL_TYPES[kind] || REL_TYPES.parent;
  
  const edgeParams = { sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition };
  const [edgePath] = config.type === 'smoothstep' 
    ? getSmoothStepPath(edgeParams)[0] 
    : getStraightPath(edgeParams)[0];
  
  const strokeStyle = {
    stroke: config.color,
    strokeWidth: config.width,
    strokeDasharray: config.dash,
  };

  // Decoración especial para Divorcio (dos barras diagonales)
  if (config.deco === 'slash') {
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    return (
      <g>
        <path d={edgePath} fill="none" style={strokeStyle} />
        <line x1={midX - 6} y1={midY - 6} x2={midX + 6} y2={midY + 6} stroke={config.color} strokeWidth={2.5} />
        <line x1={midX - 1} y1={midY - 6} x2={midX + 11} y2={midY + 6} stroke={config.color} strokeWidth={2.5} />
      </g>
    );
  }

  return <path d={edgePath} fill="none" style={strokeStyle} />;
}

const nodeTypes = { person: PersonNode };
const edgeTypes = { custom: CustomEdge };

// ============================================================================
// 4. DATOS INICIALES
// ============================================================================
const INITIAL_DATA = {
  nodes: [
    { id: '1', type: 'person', position: { x: 100, y: 150 }, data: { name: 'Pedro García', year: '1945-2020', gender: 'M' } },
    { id: '2', type: 'person', position: { x: 450, y: 150 }, data: { name: 'María López', year: '1948-', gender: 'F' } },
    { id: '3', type: 'person', position: { x: 275, y: 400 }, data: { name: 'Juan García', year: '1975-', gender: 'M' } },
  ],
  edges: [
    { id: 'e1', source: '1', target: '2', type: 'custom', data: { kind: 'marriage' } },
    { id: 'e2', source: '1', target: '2', type: 'custom', data: { kind: 'divorce' } }, // Línea roja sobre el matrimonio
    { id: 'e3', source: '1', target: '3', type: 'custom', data: { kind: 'parent' } },
    { id: 'e4', source: '2', target: '3', type: 'custom', data: { kind: 'parent' } },
  ]
};

// ============================================================================
// 5. COMPONENTE PRINCIPAL: APP
// ============================================================================
export default function App() {
  const [nodes, setNodes] = useState(INITIAL_DATA.nodes);
  const [edges, setEdges] = useState(INITIAL_DATA.edges);
  const [selectedId, setSelectedId] = useState(null);
  
  // Estado para el panel de relaciones
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState('marriage');

  // Cargar y guardar en localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('linaje-genograma-v7');
      if (saved) {
        const data = JSON.parse(saved);
        setNodes(data.nodes || INITIAL_DATA.nodes);
        setEdges(data.edges || INITIAL_DATA.edges);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    localStorage.setItem('linaje-genograma-v7', JSON.stringify({ nodes, edges }));
  }, [nodes, edges]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  // --- Acciones del Panel Lateral ---
  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n));
  }, []);

  const deleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId(null);
  }, []);

  const addRelationship = useCallback(() => {
    if (!selectedId || !relTarget) return;
    const newEdge = {
      id: uid(),
      source: selectedId,
      target: relTarget,
      type: 'custom',
      data: { kind: relType },
    };
    setEdges((eds) => [...eds, newEdge]);
    setRelTarget(''); // Resetear selección
  }, [selectedId, relTarget, relType]);

  const removeEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((e) => e.id !== edgeId));
  }, []);

  const addNewPerson = useCallback(() => {
    const id = uid();
    setNodes((nds) => [
      ...nds,
      { id, type: 'person', position: { x: 300, y: 300 }, data: { name: 'Nueva Persona', gender: 'M' } }
    ]);
    setSelectedId(id);
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const otherNodes = nodes.filter((n) => n.id !== selectedId);

  return (
    <div className="app" onClick={() => setSelectedId(null)}>
      <header className="topbar">
        <h1>Linaje - Genograma</h1>
        <div className="toolbar">
          <button className="primary" onClick={addNewPerson}>+ Nueva Persona</button>
          <button onClick={() => { setNodes(INITIAL_DATA.nodes); setEdges(INITIAL_DATA.edges); setSelectedId(null); }}>
            Restablecer Ejemplo
          </button>
        </div>
      </header>

      <div className="body">
        <div className="canvas" onClick={(e) => e.stopPropagation()}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => { setSelectedId(node.id); }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            deleteKeyCode={['Delete', 'Backspace']}
            onEdgesDelete={(deleted) => setEdges((eds) => eds.filter((e) => !deleted.find((d) => d.id === e.id)))}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d6d3d1" />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>

          {/* Leyenda */}
          <div className="legend">
            <strong>Leyenda</strong>
            {Object.entries(REL_TYPES).map(([key, value]) => (
              <div key={key} className="legend-row">
                <span className="swatch" style={{ borderTopColor: value.color, borderTopWidth: value.width, borderTopStyle: value.dash ? 'dashed' : 'solid' }} />
                {value.label}
              </div>
            ))}
          </div>
        </div>

        {/* ========================================================================
            PANEL LATERAL DE EDICIÓN (Restaurado y Completo)
            ======================================================================== */}
        {selectedNode && (
          <aside className="editor" onClick={(e) => e.stopPropagation()}>
            <div className="editor-head">
              <strong>Editar Persona</strong>
              <button className="ghost" onClick={() => setSelectedId(null)}>✕</button>
            </div>

            <label>
              Nombre
              <input
                value={selectedNode.data.name}
                onChange={(e) => updateNodeData(selectedNode.id, { name: e.target.value })}
                placeholder="Nombre completo"
              />
            </label>

            <label>
              Años de vida
              <input
                value={selectedNode.data.year || ''}
                onChange={(e) => updateNodeData(selectedNode.id, { year: e.target.value })}
                placeholder="1950-2010"
              />
            </label>

            <label>
              Género
              <select
                value={selectedNode.data.gender}
                onChange={(e) => updateNodeData(selectedNode.id, { gender: e.target.value })}
              >
                <option value="M">Masculino (Cuadrado)</option>
                <option value="F">Femenino (Círculo)</option>
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={selectedNode.data.deceased || false}
                onChange={(e) => updateNodeData(selectedNode.id, { deceased: e.target.checked })}
              />
              Fallecido/a
            </label>

            <div className="section-title">Agregar Relación</div>
            <select value={relTarget} onChange={(e) => setRelTarget(e.target.value)}>
              <option value="">Seleccionar persona...</option>
              {otherNodes.map((n) => (
                <option key={n.id} value={n.id}>{n.data.name || n.id}</option>
              ))}
            </select>
            
            <select value={relType} onChange={(e) => setRelType(e.target.value)}>
              {Object.entries(REL_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            
            <button className="primary full" onClick={addRelationship} disabled={!relTarget}>
              Conectar Vínculo
            </button>

            <div className="section-title">Vínculos Activos</div>
            <div className="rel-list">
              {edges
                .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                .map((edge) => {
                  const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                  const otherNode = nodes.find((n) => n.id === otherId);
                  const relLabel = REL_TYPES[edge.data?.kind]?.label || edge.data?.kind;
                  
                  return (
                    <div key={edge.id} className="rel-item">
                      <span>{relLabel} ↔ {otherNode?.data.name || '???'}</span>
                      <button className="ghost small" onClick={() => removeEdge(edge.id)} title="Eliminar relación">🗑️</button>
                    </div>
                  );
                })}
              {edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length === 0 && (
                <p className="hint">Sin relaciones activas</p>
              )}
            </div>

            <button className="danger" onClick={() => deleteNode(selectedNode.id)}>
              Eliminar Persona
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
