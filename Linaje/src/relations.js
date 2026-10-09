export const PARENT_KINDS = ['filiacion', 'adopcion'];
export const PARTNER_KINDS = ['matrimonio', 'union'];

export const STRUCTURAL = {
  matrimonio: { label: 'Matrimonio', color: '#374151', width: 2 },
  union: { label: 'Unión libre', color: '#374151', width: 2, dash: '6 4' },
  divorcio: { label: 'Divorcio / separación', color: '#374151', width: 2, deco: 'slash' },
  filiacion: { label: 'Filiación (padre/madre → hijo/a)', color: '#6b7280', width: 1.5, smooth: true },
  adopcion: { label: 'Adopción', color: '#6b7280', width: 1.5, dash: '6 4', smooth: true },
};

export const EMOTIONAL = {
  indiferente: { label: 'Indiferente / Apático', color: '#1f2937', width: 1.2, dash: '2 3' },
  distante: { label: 'Distante / Deficiente', color: '#1f2937', width: 1.5, dash: '6 4' },
  corte: { label: 'Corte de relación / Distanciado', color: '#ef4444', width: 2, deco: 'bar' },
  discordia: { label: 'Discordia / Conflicto', color: '#ef4444', width: 2, dash: '6 4', deco: 'slash' },
  odio: { label: 'Odio', color: '#ef4444', width: 2.5, dash: '2 3' },
  armonia: { label: 'Armonía', color: '#10b981', width: 2, deco: 'circle' },
  amistad: { label: 'Amistad / Cercano', color: '#10b981', width: 2, dash: '4 3' },
  mejores: { label: 'Mejores amigos / Muy cercanos', color: '#10b981', width: 5 },
  amor: { label: 'Amor', color: '#10b981', width: 2, deco: 'circle' },
  enamorado: { label: 'Enamorado/a', color: '#10b981', width: 2, deco: 'double' },
  hostil: { label: 'Hostil', color: '#ef4444', width: 2, dash: '1 3' },
  distante_hostil: { label: 'Distante-Hostil', color: '#ef4444', width: 2, dash: '1 2' },
  cercano_hostil: { label: 'Cercano-Hostil', color: '#10b981', width: 2, deco: 'double' },
  fusionado: { label: 'Fusionado', color: '#ef4444', width: 1.5, deco: 'triple' },
  fusionado_hostil: { label: 'Fusionado-Hostil', color: '#1f2937', width: 1.5, deco: 'triple' },
  desconfianza: { label: 'Desconfianza', color: '#ef4444', width: 2, dash: '3 2' },
  violencia: { label: 'Violencia', color: '#1f2937', width: 2, dash: '3 2', arrow: true },
  violencia_distancia: { label: 'Violencia a distancia', color: '#ef4444', width: 2, dash: '3 2' },
  violencia_cercana: { label: 'Violencia cercana', color: '#1f2937', width: 2, dash: '2 2' },
  enfocado: { label: 'Enfocado en', color: '#1f2937', width: 1.5, arrow: true },
  enfocado_neg: { label: 'Enfocado negativamente en', color: '#ef4444', width: 1.5, arrow: true, dash: '3 2' },
  abuso_sexual: { label: 'Abuso sexual', color: '#1f2937', width: 2, dash: '1 3' },
  abuso_fisico: { label: 'Abuso físico', color: '#ef4444', width: 2, dash: '3 3', arrow: true },
  abuso_emocional: { label: 'Abuso emocional', color: '#1f2937', width: 1.5, arrow: true, deco: 'box' },
  manipulador: { label: 'Manipulador/a', color: '#1f2937', width: 2, deco: 'x' },
  controlador: { label: 'Controlador/a', color: '#ef4444', width: 1.5, deco: 'box' },
  fan: { label: 'Fan / Admirador(a)', color: '#1f2937', width: 1.5, arrow: true, deco: 'double' },
};

export const ALL_KINDS = { ...STRUCTURAL, ...EMOTIONAL };

// Nombres usados por la primera versión
export const LEGACY = {
  parent: 'filiacion',
  marriage: 'matrimonio',
  conflict: 'discordia',
  close: 'mejores',
  distant: 'distante',
};