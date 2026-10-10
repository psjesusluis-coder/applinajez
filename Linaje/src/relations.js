// Tipos de vínculo y relación, según el PDF "Los Símbolos Básicos del Genograma".
// color, width, dash: trazo | deco: adorno sobre la barra | pattern: forma del trazo

export const PAREJA = {
  matrimonio: { label: 'Matrimonio', color: '#000000', width: 2 },
  union: { label: 'Viven juntos (LT)', color: '#000000', width: 2, dash: '4 4' },
  separacion: { label: 'Separación conyugal', color: '#000000', width: 2, deco: 'slash' },
  union_separada: { label: 'Unión de hecho separada', color: '#000000', width: 2, dash: '4 4', deco: 'slash' },
  divorcio: { label: 'Divorcio', color: '#000000', width: 2, deco: 'slash2' },
  nuevo_matrimonio: { label: 'Se unieron después del divorcio', color: '#000000', width: 2, deco: 'cross' },
};

export const FILIACION = {
  biologico: { label: 'Hijo/a biológico/a', color: '#000000', width: 1.5 },
  adopcion: { label: 'Hijo/a adoptado/a', color: '#000000', width: 1.5, dash: '2 3' },
  hijastro: { label: 'Hijo/a sustituto/a', color: '#000000', width: 1.5, dash: '6 4' },
};

export const EMOCION = {
  indiferente: { label: 'Indiferente / Apático', color: '#1f2937', width: 1.5, dash: '2 3' },
  distante: { label: 'Distante', color: '#1f2937', width: 1.5, dash: '4 4' },
  corte: { label: 'Cortado', color: '#374151', width: 2, deco: 'cut' },
  discordia: { label: 'Discordia / Conflicto', color: '#ef4444', width: 2, dash: '8 4', deco: 'slash2' },
  odio: { label: 'Odio', color: '#ef4444', width: 2, dash: '2 3' },
  armonia: { label: 'Armonía', color: '#10b981', width: 2, deco: 'circle' },
  amistad: { label: 'Amistad / Cercano', color: '#10b981', width: 2, dash: '6 4' },
  mejores: { label: 'Mejores amigos / Muy cercanos', color: '#10b981', width: 6, pattern: 'band' },
  amor: { label: 'Amor', color: '#10b981', width: 2, deco: 'circle' },
  enamorado: { label: 'Enamorado/a', color: '#10b981', width: 2, deco: 'double-circle' },
  cercano: { label: 'Cercano', color: '#374151', width: 2.5, pattern: 'double' },
  hostil: { label: 'Hostil', color: '#ef4444', width: 2, pattern: 'zigzag', amp: 4, step: 6 },
  distante_hostil: { label: 'Distante-Hostil', color: '#ef4444', width: 2, pattern: 'zigzag', amp: 4, step: 6, dash: '3 3' },
  cercano_hostil: { label: 'Cercano-Hostil', color: '#ef4444', width: 1.5, pattern: 'triple-zig' },
  fusionado: { label: 'Fusionado', color: '#374151', width: 1.5, pattern: 'triple' },
  fusionado_hostil: { label: 'Fusionado-Hostil', color: '#ef4444', width: 1.5, pattern: 'triple-zig' },
  desconfianza: { label: 'Desconfianza', color: '#ef4444', width: 2, pattern: 'zigzag', amp: 2, step: 4 },
  violencia: { label: 'Violencia', color: '#1f2937', width: 2, pattern: 'zigzag', amp: 5, step: 10, arrow: true },
  violencia_distancia: { label: 'Violencia a distancia', color: '#ef4444', width: 2, pattern: 'zigzag', amp: 5, step: 10 },
  violencia_cercana: { label: 'Violencia cercana', color: '#1f2937', width: 2, pattern: 'zigzag', amp: 3, step: 6 },
  enfocado: { label: 'Enfocado en', color: '#1f2937', width: 1.5, arrow: true },
  enfocado_neg: { label: 'Enfocado negativamente en', color: '#ef4444', width: 1.5, arrow: true },
  abuso_sexual: { label: 'Abuso sexual', color: '#1f2937', width: 2, pattern: 'zigzag', amp: 4, step: 6, arrow: true },
  abuso_fisico: { label: 'Abuso físico', color: '#1f2937', width: 2, pattern: 'zigzag', amp: 2, step: 4, arrow: true },
  abuso_emocional: { label: 'Abuso emocional', color: '#1f2937', width: 1.5, arrow: true, deco: 'box-x' },
  manipulador: { label: 'Manipulador/a', color: '#1f2937', width: 2, pattern: 'zigzag', amp: 3, step: 6, deco: 'x-end' },
  controlador: { label: 'Controlador/a', color: '#ef4444', width: 1.5, deco: 'box-x' },
  fan: { label: 'Fan / Admirador(a)', color: '#1f2937', width: 1.5, arrow: true, deco: 'double-circle' },
};

export const ALL = { ...PAREJA, ...FILIACION, ...EMOCION };

export const GROUPS = [
  { type: 'pareja', title: 'Pareja', defs: PAREJA },
  { type: 'filiacion', title: 'Filiación', defs: FILIACION },
  { type: 'emocion', title: 'Relaciones emocionales', defs: EMOCION },
];

// Nombres de versiones anteriores, para importar archivos viejos
export const LEGACY = {
  parent: 'biologico',
  filiacion: 'biologico',
  marriage: 'matrimonio',
  conflict: 'discordia',
  close: 'mejores',
  distant: 'distante',
};
