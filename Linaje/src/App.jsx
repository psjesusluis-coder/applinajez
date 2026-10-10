import { useState, useCallback, useEffect, useMemo } from 'react';
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
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ============================================================================
// 1. CONFIGURACIÓN DE TIPOS
// ============================================================================
const VINCULOS = {
  matrimonio: { label: 'Matrimonio', color: '#1e293b', width: 2 },
  divorcio: { label: 'Divorcio', color: '#ef4444', width: 2, deco: 'slash' },
  union: { label: 'Unión Libre', color: '#64748b', width: 2, dash: '6 4' },
  filiacion: { label: 'Filiación', color: '#64748b', width: 1.5, type: 'smooth' },
};

const RELACIONES = {
  cercano: { label: 'Cercano', color: '#10b981', width: 2 },
  muy_cercano: { label: 'Muy Cercano', color: '#10b981', width: 3 },
  distante: { label: 'Distante', color: '#9ca3af', width: 1.5, dash: '2 4' },
  conflictivo: { label: 'Conflictivo', color: '#ef4444', width: 2, dash: '6 4' },
  hostil: { label: 'Hostil', color: '#ef4444', width: 2, dash: '2 2' },
  fusionado: { label: 'Fusionado', color: '#7c3aed', width: 3 },
  abuso: { label: 'Abuso', color: '#dc2626', width: 2, dash: '1 3', arrow: true },
};

const ALL_TYPES = { ...VINCULOS, ...RELACIONES };
const uid = () => Math.random().toString(36).substr(2, 9);

// ============================================================================
// 2. COMPONENTE: NODO DE PERSONA (Con botones flotantes integrados)
// ============================================================================
function PersonNode({ data, selected }) {
  const isFemale = data.gender === 'F';
  const isDeceased = data.deceased;

  return (
    <div className={`person ${isFemale ? 'person--f' : 'person--m'} ${selected ? 'is-selected' : ''} ${isDeceased ? 'is-deceased' : ''}`}>
      {/* Handles para Vínculos de Pareja (Izquierda/Derecha) */}
      <Handle type="source" position={Position.Left} id="left" className="handle handle-vinculo" />
      <Handle type="target" position={Position.Right} id="right" className="handle handle-vinculo" />
      
      {/* Handles para Filiación (Arriba/Abajo) */}
      <Handle type="target" position={Position.Top} id="top" className="handle handle-filiacion" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="handle handle-filiacion" />
      
      <div className="person-content">
        <div className="person-name">{data.name || 'Sin nombre'}</div>
        {data.year && <div className="person-year">{data.year}</div>}
      </div>

      {/* BOTONES FLOTANTES (Solo visibles si está seleccionado) */}
      {selected && (
        <>
          <button className="float-btn float-top nodrag" onClick={(e) => e.stopPropagation()}>+ Padre/Madre</button>
          <button className="float-btn float-bottom nodrag" onClick={(e) => e.stopPropagation()}>+ Hijo/a</button>
          <button className="float-btn float-right nodrag" onClick={(e) => e.stopPropagation()}>+ Pareja</button>
          <button className="float-btn float-left nodrag" onClick={(e) => e.stopPropagation()}>+ Hermano/a</button>
        </>
      )}
    </div>
  );
}

// ============================================================================
// 3. COMPONENTE: EDGE PERSONALIZADO (Soporta barras de divorcio)
// ============================================================================
function CustomEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }) {
  const kind = data?.kind;
  const config = ALL_TYPES[kind] || VINCULOS.filiacion;
  
  const isSmooth = config.type === 'smooth';
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  // Path de la línea
  const path = isSmooth
    ? `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`
    : `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={config.color}
        strokeWidth={config.width}
        strokeDasharray={config.dash}
        markerEnd={config.arrow ? { type: MarkerType.ArrowClosed, color: config.color } : undefined}
      />
      {/* Barras diagonales para Divorcio */}
      {config.deco === 'slash' && (
        <>
          <line x1={midX - 8} y1={midY - 8} x2={midX + 8} y2={midY + 8} stroke={config.color} strokeWidth={2.5} />
          <line x1={midX - 2} y1={midY - 8} x2={midX + 14} y2={midY + 8} stroke={config.color} strokeWidth={2.5} />
        </>
      )}
    </g>
  );
}

const nodeTypes = { person: PersonNode };
const edgeTypes = { custom: CustomEdge };

// ============================================================================
// 4. DATOS INICIALES
// ============================================================================
const INITIAL_DATA = {
  nodes: [
    { id: '1', type: 'person', position: { x: 100, y: 100 }, data: { name: 'Pedro', year: '1945-2020', gender: 'M' } },
    { id: '2', type: 'person', position: { x: 350, y: 100 }, data: { name: 'María', year: '1948-', gender: 'F' } },
    { id: '3', type: 'person', position: { x: 225, y: 280 }, data: { name: 'Juan', year: '1975-', gender: 'M' } },
  ],
  edges: [
    { id: 'e1', source: '1', target: '2', sourceHandle: 'left', targetHandle: 'right', type: 'custom', data: { kind: 'matrimonio' } },
    { id: 'e2', source: '1', target: '3', sourceHandle: 'bottom', targetHandle: 'top', type: 'custom', data: { kind: 'filiacion' } },
    { id: 'e3', source: '2', target: '3', sourceHandle: 'bottom', targetHandle: 'top', type: 'custom', data: { kind: 'filiacion' } },
  ]
};

// ============================================================================
// 5. APP PRINCIPAL
// ============================================================================
export default function App() {
  const [nodes, setNodes] = useState(INITIAL_DATA.nodes);
  const [edges, setEdges] = useState(INITIAL_DATA.edges);
  const [selectedId, setSelectedId] = useState(null);
  const [relTarget, setRelTarget] = useState('');
  const [relType, setRelType] = useState('cercano');

  // Persistencia
  useEffect(() => {
    try {
      const saved = localStorage.getItem('linaje-final-v2');
      if (saved) {
        const data = JSON.parse(saved);
        setNodes(data.nodes || INITIAL_DATA.nodes);
        setEdges(data.edges || INITIAL_DATA.edges);
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    localStorage.setItem('linaje-final-v2', JSON.stringify({ nodes, edges }));
  }, [nodes, edges]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  // Conectar manualmente (arrastrar desde handles)
  const onConnect = useCallback((params) => {
    const sourceHandle = params.sourceHandle;
    let kind = 'matrimonio';
    
    if (sourceHandle === 'bottom' || sourceHandle === 'top') {
      kind = 'filiacion';
    }
    
    const newEdge = { ...params, id: uid(), type: 'custom', data: { kind } };
    setEdges((eds) => [...eds, newEdge]);
  }, []);

  // --- ACCIONES DE BOTONES FLOTANTES ---
  const addParent = useCallback(() => {
    if (!selectedId) return;
    const node = nodes.find(n => n.id === selectedId);
    const id = uid();
    setNodes((nds) => [...nds, { id, type: 'person', position: { x: node.position.x, y: node.position.y - 200 }, data: { name: 'Nuevo Padre/Madre', gender: 'M' } }]);
    setEdges((eds) => [...eds, { id: uid(), source: id, target: selectedId, sourceHandle: 'bottom', targetHandle: 'top', type: 'custom', data: { kind: 'filiacion' } }]);
  }, [selectedId, nodes]);

  const addChild = useCallback(() => {
    if (!selectedId) return;
    const node = nodes.find(n => n.id === selectedId);
    const id = uid();
    setNodes((nds) => [...nds, { id, type: 'person', position: { x: node.position.x, y: node.position.y + 200 }, data: { name: 'Nuevo Hijo/a', gender: 'M' } }]);
    setEdges((eds) => [...eds, { id: uid(), source: selectedId, target: id, sourceHandle: 'bottom', targetHandle: 'top', type: 'custom', data: { kind: 'filiacion' } }]);
  }, [selectedId, nodes]);

  const addPartner = useCallback(() => {
    if (!selectedId) return;
    const node = nodes.find(n => n.id === selectedId);
    const id = uid();
    const gender = node.data.gender === 'F' ? 'M' : 'F';
    setNodes((nds) => [...nds, { id, type: 'person', position: { x: node.position.x + 250, y: node.position.y }, data: { name: 'Nueva Pareja', gender } }]);
    setEdges((eds) => [...eds, { id: uid(), source: selectedId, target: id, sourceHandle: 'left', targetHandle: 'right', type: 'custom', data: { kind: 'matrimonio' } }]);
  }, [selectedId, nodes]);

  const addSibling = useCallback(() => {
    if (!selectedId) return;
    const node = nodes.find(n => n.id === selectedId);
    const parentEdges = edges.filter(e => e.target === selectedId && e.data?.kind === 'filiacion');
    const id = uid();
    setNodes((nds) => [...nds, { id, type: 'person', position: { x: node.position.x + 180, y: node.position.y }, data: { name: 'Nuevo Hermano/a', gender: 'M' } }]);
    const newEdges = parentEdges.map(e => ({ id: uid(), source: e.source, target: id, sourceHandle: 'bottom', targetHandle: 'top', type: 'custom', data: { kind: 'filiacion' } }));
    setEdges((eds) => [...eds, ...newEdges]);
  }, [selectedId, nodes, edges]);

  // --- ACCIONES DEL PANEL LATERAL ---
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
      id: uid(), source: selectedId, target: relTarget,
      sourceHandle: 'left', targetHandle: 'right',
      type: 'custom', data: { kind: relType },
    };
    setEdges((eds) => [...eds, newEdge]);
    setRelTarget('');
  }, [selectedId, relTarget, relType]);

  const removeEdge = useCallback((edgeId) => setEdges((eds) => eds.filter((e) => e.id !== edgeId)), []);

  // --- HERRAMIENTAS ---
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'genograma.json'; a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges]);

  const importJson = useCallback((e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setNodes(data.nodes || []); setEdges(data.edges || []);
      } catch { alert('Archivo inválido'); }
    };
    reader.readAsText(file);
  }, []);

  const newGenogram = useCallback(() => {
    if (confirm('¿Crear nuevo genograma? Se perderán los datos actuales.')) {
      setNodes([]); setEdges([]); setSelectedId(null);
    }
  }, []);

  // --- LEYENDA DINÁMICA ---
  const usedKinds = useMemo(() => {
    const kinds = new Set(edges.map(e => e.data?.kind).filter(Boolean));
    return Array.from(kinds).map(k => ({ key: k, config: ALL_TYPES[k] })).filter(item => item.config);
  }, [edges]);

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const otherNodes = nodes.filter((n) => n.id !== selectedId);

  // Asignar eventos a los botones flotantes (truco para que funcionen dentro del nodo)
  const nodeWithActions = useMemo(() => {
    if (!selectedNode) return null;
    return {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        onAddParent: addParent,
        onAddChild: addChild,
        onAddPartner: addPartner,
        onAddSibling: addSibling,
      }
    };
  }, [selectedNode, addParent, addChild, addPartner, addSibling]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Linaje</h1>
        <div className="toolbar">
          <button onClick={newGenogram}>Nuevo</button>
          <button onClick={exportJson}>Exportar</button>
          <label className="import-btn">Importar<input type="file" accept=".json" onChange={importJson} hidden /></label>
        </div>
      </header>

      <div className="body">
        <div className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap />
          </ReactFlow>

          {/* Leyenda Dinámica */}
          {usedKinds.length > 0 && (
            <div className="legend">
              <strong>Leyenda</strong>
              {usedKinds.map(({ key, config }) => (
                <div key={key} className="legend-row">
                  <span className="swatch" style={{ borderTopColor: config.color, borderTopWidth: config.width, borderStyle: config.dash ? 'dashed' : 'solid' }} />
                  {config.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panel Lateral */}
        {selectedNode && (
          <aside className="editor">
            <div className="editor-head">
              <strong>Editar Persona</strong>
              <button className="ghost" onClick={() => setSelectedId(null)}>✕</button>
            </div>

            <label>Nombre<input value={selectedNode.data.name} onChange={(e) => updateNodeData(selectedNode.id, { name: e.target.value })} /></label>
            <label>Años<input value={selectedNode.data.year || ''} onChange={(e) => updateNodeData(selectedNode.id, { year: e.target.value })} placeholder="1950-2010" /></label>
            <label>Género
              <select value={selectedNode.data.gender} onChange={(e) => updateNodeData(selectedNode.id, { gender: e.target.value })}>
                <option value="M">Masculino (Cuadrado)</option>
                <option value="F">Femenino (Círculo)</option>
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={selectedNode.data.deceased || false} onChange={(e) => updateNodeData(selectedNode.id, { deceased: e.target.checked })} />
              Fallecido/a
            </label>

            <div className="section-title">Agregar Relación Emocional</div>
            <select value={relTarget} onChange={(e) => setRelTarget(e.target.value)}>
              <option value="">Seleccionar persona...</option>
              {otherNodes.map((n) => <option key={n.id} value={n.id}>{n.data.name || n.id}</option>)}
            </select>
            <select value={relType} onChange={(e) => setRelType(e.target.value)}>
              {Object.entries(RELACIONES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="primary full" onClick={addRelationship} disabled={!relTarget}>Conectar Relación</button>

            <div className="section-title">Vínculos y Relaciones</div>
            <div className="rel-list">
              {edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).map((edge) => {
                const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                const otherNode = nodes.find((n) => n.id === otherId);
                const config = ALL_TYPES[edge.data?.kind] || { label: edge.data?.kind };
                return (
                  <div key={edge.id} className="rel-item">
                    <span>{config.label} ↔ {otherNode?.data.name || '???'}</span>
                    <button className="ghost small" onClick={() => removeEdge(edge.id)}>🗑️</button>
                  </div>
                );
              })}
            </div>

            <button className="danger" onClick={() => deleteNode(selectedNode.id)}>Eliminar Persona</button>
          </aside>
        )}
      </div>
    </div>
  );
}
