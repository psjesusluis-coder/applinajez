import { useState, useCallback, useMemo } from 'react';
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
// CONFIGURACIÓN DE RELACIONES (Estándar Genogramas)
// ============================================================================
const REL_TYPES = {
  marriage: { label: 'Matrimonio', color: '#1e293b', width: 2, type: 'straight' },
  divorce: { label: 'Divorciado', color: '#ef4444', width: 2, type: 'straight', deco: 'slash' },
  separation: { label: 'Separación', color: '#f97316', width: 2, type: 'straight', dash: '4 4' },
  cohabitation: { label: 'Unión Libre', color: '#1e293b', width: 2, dash: '6 4', type: 'straight' },
  parent: { label: 'Filiación', color: '#64748b', width: 1.5, type: 'smoothstep' },
  conflict: { label: 'Conflicto', color: '#ef4444', width: 2, dash: '6 4', type: 'straight' },
  close: { label: 'Muy Cercano', color: '#10b981', width: 3, type: 'straight' },
  distant: { label: 'Distante', color: '#9ca3af', width: 1.5, dash: '2 4', type: 'straight' },
};

// ============================================================================
// UTILIDADES
// ============================================================================
const uid = () => Math.random().toString(36).substr(2, 9);

// ============================================================================
// COMPONENTE: NODO DE PERSONA (Dimensiones Fijas 160x160)
// ============================================================================
function PersonNode({ data, selected }) {
  const isFemale = data.gender === 'F';
  const isDeceased = data.deceased;

  return (
    <div className={`person-node ${isFemale ? 'female' : 'male'} ${selected ? 'selected' : ''} ${isDeceased ? 'deceased' : ''}`}>
      {/* Handles en 4 direcciones para conexiones */}
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
// COMPONENTE: LÍNEA PERSONALIZADA (Soporta divorcio, separación, etc.)
// ============================================================================
function CustomEdge({ 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition, 
  targetPosition, 
  data 
}) {
  const kind = data?.kind || 'parent';
  const config = REL_TYPES[kind] || REL_TYPES.parent;
  
  // Calcular path
  const edgeParams = { 
    sourceX, 
    sourceY, 
    sourcePosition, 
    targetX, 
    targetY, 
    targetPosition 
  };
  
  const [edgePath] = config.type === 'smoothstep' 
    ? getSmoothStepPath(edgeParams) 
    : getStraightPath(edgeParams);
  
  // Estilo base
  const strokeStyle = {
    stroke: config.color,
    strokeWidth: config.width,
    strokeDasharray: config.dash,
  };

  // Renderizar línea con decoraciones especiales
  if (config.deco === 'slash') {
    // Divorcio: línea con dos barras diagonales
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    
    return (
      <g>
        <path d={edgePath} fill="none" style={strokeStyle} />
        <line 
          x1={midX - 6} y1={midY - 6} 
          x2={midX + 6} y2={midY + 6} 
          stroke={config.color} 
          strokeWidth={2.5} 
        />
        <line 
          x1={midX - 1} y1={midY - 6} 
          x2={midX + 11} y2={midY + 6} 
          stroke={config.color} 
          strokeWidth={2.5} 
        />
      </g>
    );
  }

  return <path d={edgePath} fill="none" style={strokeStyle} />;
}

// ============================================================================
// COMPONENTE PRINCIPAL: APP
// ============================================================================
const nodeTypes = { person: PersonNode };
const edgeTypes = { custom: CustomEdge };

// Datos iniciales de ejemplo
const INITIAL_DATA = {
  nodes: [
    { 
      id: '1', 
      type: 'person', 
      position: { x: 100, y: 150 }, 
      data: { name: 'Pedro García', year: '1945-2020', gender: 'M' } 
    },
    { 
      id: '2', 
      type: 'person', 
      position: { x: 450, y: 150 }, 
      data: { name: 'María López', year: '1948-', gender: 'F' } 
    },
  ],
  edges: [
    { 
      id: 'e1', 
      source: '1', 
      target: '2', 
      type: 'custom', 
      data: { kind: 'marriage' } 
    },
  ]
};

export default function App() {
  // Estado principal
  const [nodes, setNodes] = useState(INITIAL_DATA.nodes);
  const [edges, setEdges] = useState(INITIAL_DATA.edges);
  
  // Estado para menú contextual
  const [contextMenu, setContextMenu] = useState(null);
  
  // Estado para nodo seleccionado
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // Cargar datos guardados
  useState(() => {
    try {
      const saved = localStorage.getItem('linaje-genograma');
      if (saved) {
        const data = JSON.parse(saved);
        setNodes(data.nodes || INITIAL_DATA.nodes);
        setEdges(data.edges || INITIAL_DATA.edges);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
    }
  });

  // Guardar automáticamente
  useState(() => {
    try {
      localStorage.setItem('linaje-genograma', JSON.stringify({ nodes, edges }));
    } catch (error) {
      console.error('Error guardando datos:', error);
    }
  });

  // Handlers de cambios
  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // ============================================================================
  // ACCIONES DEL MENÚ CONTEXTUAL (Estilo GenoPro)
  // ============================================================================
  
  const addParent = useCallback((childId) => {
    const child = nodes.find(n => n.id === childId);
    if (!child) return;
    
    const parentId = uid();
    const newParent = {
      id: parentId,
      type: 'person',
      position: { x: child.position.x, y: child.position.y - 250 },
      data: { name: 'Nuevo Padre/Madre', gender: 'M' },
    };
    
    const newEdge = {
      id: uid(),
      source: parentId,
      target: childId,
      type: 'custom',
      data: { kind: 'parent' },
    };
    
    setNodes((nds) => [...nds, newParent]);
    setEdges((eds) => [...eds, newEdge]);
    setContextMenu(null);
  }, [nodes]);

  const addChild = useCallback((parentId) => {
    const parent = nodes.find(n => n.id === parentId);
    if (!parent) return;
    
    const childId = uid();
    const newChild = {
      id: childId,
      type: 'person',
      position: { x: parent.position.x, y: parent.position.y + 250 },
      data: { name: 'Nuevo Hijo/a', gender: 'M' },
    };
    
    const newEdge = {
      id: uid(),
      source: parentId,
      target: childId,
      type: 'custom',
      data: { kind: 'parent' },
    };
    
    setNodes((nds) => [...nds, newChild]);
    setEdges((eds) => [...eds, newEdge]);
    setContextMenu(null);
  }, [nodes]);

  const addPartner = useCallback((personId) => {
    const person = nodes.find(n => n.id === personId);
    if (!person) return;
    
    const partnerId = uid();
    const partnerGender = person.data.gender === 'F' ? 'M' : 'F';
    
    const newPartner = {
      id: partnerId,
      type: 'person',
      position: { x: person.position.x + 300, y: person.position.y },
      data: { name: 'Nueva Pareja', gender: partnerGender },
    };
    
    const newEdge = {
      id: uid(),
      source: personId,
      target: partnerId,
      type: 'custom',
      data: { kind: 'marriage' },
    };
    
    setNodes((nds) => [...nds, newPartner]);
    setEdges((eds) => [...eds, newEdge]);
    setContextMenu(null);
  }, [nodes]);

  const linkToExisting = useCallback((personId, relationshipType) => {
    const person = nodes.find(n => n.id === personId);
    if (!person) return;
    
    // Buscar otra persona para vincular (la primera que encuentre que no sea la misma)
    const target = nodes.find(n => n.id !== personId);
    if (!target) {
      alert('No hay otras personas en el genograma para vincular.');
      return;
    }
    
    const newEdge = {
      id: uid(),
      source: personId,
      target: target.id,
      type: 'custom',
      data: { kind: relationshipType },
    };
    
    setEdges((eds) => [...eds, newEdge]);
    setContextMenu(null);
  }, [nodes]);

  const changeGender = useCallback((personId, gender) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === personId
          ? { ...n, data: { ...n.data, gender } }
          : n
      )
    );
    setContextMenu(null);
  }, []);

  const toggleDeceased = useCallback((personId) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === personId
          ? { ...n, data: { ...n.data, deceased: !n.data.deceased } }
          : n
      )
    );
    setContextMenu(null);
  }, []);

  const deleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setContextMenu(null);
    setSelectedNodeId(null);
  }, []);

  // ============================================================================
  // MANEJO DEL MENÚ CONTEXTUAL
  // ============================================================================
  
  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    event.stopPropagation();
    
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  }, []);

  const handlePaneClick = useCallback(() => {
    setContextMenu(null);
    setSelectedNodeId(null);
  }, []);

  // ============================================================================
  // ACTUALIZAR DATOS DE NODO
  // ============================================================================
  
  const updateNodeData = useCallback((nodeId, newData) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n
      )
    );
  }, []);

  // ============================================================================
  // RENDERIZADO
  // ============================================================================
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="app" onClick={handlePaneClick}>
      {/* Barra Superior */}
      <header className="topbar">
        <h1>Linaje - Genograma</h1>
        <div className="toolbar">
          <button 
            className="primary" 
            onClick={() => {
              setNodes(INITIAL_DATA.nodes);
              setEdges(INITIAL_DATA.edges);
            }}
          >
            Restablecer Ejemplo
          </button>
        </div>
      </header>

      {/* Área Principal */}
      <div className="body">
        <div className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onNodeContextMenu={handleNodeContextMenu}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            deleteKeyCode={['Delete', 'Backspace']}
            onEdgesDelete={(deleted) => {
              setEdges((eds) => eds.filter((e) => !deleted.find((d) => d.id === e.id)));
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d6d3d1" />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>

          {/* MENÚ CONTEXTUAL (Estilo GenoPro) */}
          {contextMenu && (
            <div 
              className="context-menu"
              style={{ 
                top: contextMenu.y, 
                left: contextMenu.x,
                position: 'fixed',
                zIndex: 1000,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="menu-section">
                <div className="menu-title">Agregar</div>
                <button onClick={() => addParent(contextMenu.nodeId)}>Padres</button>
                <button onClick={() => addChild(contextMenu.nodeId)}>Hijo/a</button>
                <button onClick={() => addPartner(contextMenu.nodeId)}>Pareja</button>
              </div>

              <div className="menu-section">
                <div className="menu-title">Tipo de Persona</div>
                <button onClick={() => changeGender(contextMenu.nodeId, 'M')}>Hombre</button>
                <button onClick={() => changeGender(contextMenu.nodeId, 'F')}>Mujer</button>
                <button onClick={() => toggleDeceased(contextMenu.nodeId)}>
                  {nodes.find(n => n.id === contextMenu.nodeId)?.data.deceased ? '✓ Vivo' : 'Fallecido'}
                </button>
              </div>

              <div className="menu-section">
                <div className="menu-title">Vincular a Existente</div>
                <button onClick={() => linkToExisting(contextMenu.nodeId, 'marriage')}>
                  Matrimonio
                </button>
                <button onClick={() => linkToExisting(contextMenu.nodeId, 'divorce')}>
                  Divorciado
                </button>
                <button onClick={() => linkToExisting(contextMenu.nodeId, 'separation')}>
                  Separación
                </button>
                <button onClick={() => linkToExisting(contextMenu.nodeId, 'cohabitation')}>
                  Unión Libre
                </button>
                <button onClick={() => linkToExisting(contextMenu.nodeId, 'conflict')}>
                  Conflicto
                </button>
              </div>

              <div className="menu-section">
                <div className="menu-title">Acciones</div>
                <button 
                  className="danger"
                  onClick={() => deleteNode(contextMenu.nodeId)}
                >
                  Eliminar Persona
                </button>
              </div>
            </div>
          )}

          {/* Leyenda */}
          <div className="legend">
            <strong>Leyenda</strong>
            {Object.entries(REL_TYPES).map(([key, value]) => (
              <div key={key} className="legend-row">
                <span
                  className="swatch"
                  style={{
                    borderTopColor: value.color,
                    borderTopWidth: value.width,
                    borderTopStyle: value.dash ? 'dashed' : 'solid',
                  }}
                />
                {value.label}
              </div>
            ))}
          </div>
        </div>

        {/* Panel Lateral de Edición */}
        {selectedNode && (
          <aside className="editor">
            <div className="editor-head">
              <strong>Editar Persona</strong>
              <button className="ghost" onClick={() => setSelectedNodeId(null)}>
                ✕
              </button>
            </div>

            <label>
              Nombre
              <input
                value={selectedNode.data.name}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, { name: e.target.value })
                }
                placeholder="Nombre completo"
              />
            </label>

            <label>
              Años de vida
              <input
                value={selectedNode.data.year || ''}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, { year: e.target.value })
                }
                placeholder="1950-2010"
              />
            </label>

            <label>
              Género
              <select
                value={selectedNode.data.gender}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, { gender: e.target.value })
                }
              >
                <option value="M">Masculino (Cuadrado)</option>
                <option value="F">Femenino (Círculo)</option>
              </select>
            </label>

            <div className="section-title">Relaciones Activas</div>
            <div className="rel-list">
              {edges
                .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                .map((edge) => {
                  const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                  const otherNode = nodes.find((n) => n.id === otherId);
                  const relType = REL_TYPES[edge.data?.kind]?.label || edge.data?.kind;
                  
                  return (
                    <div key={edge.id} className="rel-item">
                      <span>
                        {relType} con <strong>{otherNode?.data.name || '???'}</strong>
                      </span>
                    </div>
                  );
                })}
              {edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                .length === 0 && (
                <p className="hint">Sin relaciones activas</p>
              )}
            </div>

            <p className="hint">
              💡 Tip: Haz <strong>clic derecho</strong> en una persona para acceder al menú rápido
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
