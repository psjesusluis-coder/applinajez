// Vínculos: estructura familiar. Relaciones: emociones entre personas.
// group: 'vinculo' | 'emocion'
// dash: patrón de trazo, deco: adorno en el centro, arrow: flecha, smooth: línea en árbol

export const PARENT_KINDS = ['filiacion', 'adopcion'];
export const PARTNER_KINDS = ['matrimonio', 'union'];

export const KINDS = {
  matrimonio: { group: 'vinculo', label: 'Matrimonio', color: '#374151', width: 2 },
  union: { group: 'vinculo', label: 'Unión libre', color: '#374151', width: 2, dash: '6 4' },
  divorcio: { group: 'vinculo', label: 'Divorcio / separación', color: '#374151', width: 2, deco: 'slash' },
  filiacion: { group: 'vinculo', label: 'Filiación (padre/madre → hijo/a)', color: '#6b7280', width: 1.5, smooth: true },
  adopcion: { group: 'vinculo', label: 'Adopción', color: '#6b7280', width: 1.5, dash: '6 4', smooth: true },

  indiferente: { group: 'emocion', label: 'Indiferente / Apático', color: '#1f2937', width: 1.2, dash: '2 3' },
  distante: { group: 'emocion', label: 'Distante / Deficiente', color: '#1f2937', width: 1.5, dash: '6 4' },
  corte: { group: 'emocion', label: 'Corte de relación / Distanciado', color: '#ef4444', width: 2, deco: 'bar' },
  discordia: { group: 'emocion', label: 'Discordia / Conflicto', color: '#ef4444', width: 2, dash: '6 4', deco: 'slash' },
  odio: { group: 'emocion', label: 'Odio', color: '#ef4444', width: 2.5, dash: '2 3' },
  armonia: { group: 'emocion', label: 'Armonía', color: '#10b981', width: 2, deco: 'circle' },
  amistad: { group: 'emocion', label: 'Amistad / Cercano', color: '#10b981', width: 2, dash: '4 3' },
  mejores: { group: 'emocion', label: 'Mejores amigos / Muy cercanos', color: '#10b981', width: 5 },
  amor: { group: 'emocion', label: 'Amor', color: '#10b981', width: 2, deco: 'circle' },
  enamorado: { group: 'emocion', label: 'Enamorado/a', color: '#10b981', width: 2, deco: 'double' },
  hostil: { group: 'emocion', label: 'Hostil', color: '#ef4444', width: 2, dash: '1 3' },
  distante_hostil: { group: 'emocion', label: 'Distante-Hostil', color: '#ef4444', width: 2, dash: '1 2' },
  cercano_hostil: { group: 'emocion', label: 'Cercano-Hostil', color: '#10b981', width: 2, deco: 'double' },
  fusionado: { group: 'emocion', label: 'Fusionado', color: '#ef4444', width: 1.5, deco: 'triple' },
  fusionado_hostil: { group: 'emocion', label: 'Fusionado-Hostil', color: '#1f2937', width: 1.5, deco: 'triple' },
  desconfianza: { group: 'emocion', label: 'Desconfianza', color: '#ef4444', width: 2, dash: '3 2' },
  violencia: { group: 'emocion', label: 'Violencia', color: '#1f2937', width: 2, dash: '3 2', arrow: true },
  violencia_distancia: { group: 'emocion', label: 'Violencia a distancia', color: '#ef4444', width: 2, dash: '3 2' },
  violencia_cercana: { group: 'emocion', label: 'Violencia cercana', color: '#1f2937', width: 2, dash: '2 2' },
  enfocado: { group: 'emocion', label: 'Enfocado en', color: '#1f2937', width: 1.5, arrow: true },
  enfocado_neg: { group: 'emocion', label: 'Enfocado negativamente en', color: '#ef4444', width: 1.5, arrow: true, dash: '3 2' },
  abuso_sexual: { group: 'emocion', label: 'Abuso sexual', color: '#1f2937', width: 2, dash: '1 3' },
  abuso_fisico: { group: 'emocion', label: 'Abuso físico', color: '#ef4444', width: 2, dash: '3 3', arrow: true },
  abuso_emocional: { group: 'emocion', label: 'Abuso emocional', color: '#1f2937', width: 1.5, arrow: true, deco: 'box' },
  manipulador: { group: 'emocion', label: 'Manipulador/a', color: '#1f2937', width: 2, deco: 'x' },
  controlador: { group: 'emocion', label: 'Controlador/a', color: '#ef4444', width: 1.5, deco: 'box' },
  fan: { group: 'emocion', label: 'Fan / Admirador(a)', color: '#1f2937', width: 1.5, arrow: true, deco: 'double' },
};

// Nombres de la primera versión, para importar archivos antiguos
export const LEGACY = {
  parent: 'filiacion',
  marriage: 'matrimonio',
  conflict: 'discordia',
  close: 'mejores',
  distant: 'distante',
};
