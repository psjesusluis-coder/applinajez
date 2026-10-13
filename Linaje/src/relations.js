// Tipos de vínculo y relación según las guías de símbolos del programa.
// color, width, dash: trazo | pattern: 'double' (doble línea) | deco: adorno sobre la línea
// slashes: número de barras de separación | house: casa de convivencia | arrow, step, amp: zigzag

const BLACK = '#111111';
const MAROON = '#7f1d1d';
const BLUE = '#1d4ed8';
const PINK = '#f472b6';
const RED = '#dc2626';
const GREEN = '#16a34a';
const GREY = '#6b7280';

export const PAREJA = {
  matrimonio: { label: 'Matrimonio', color: BLACK, width: 2 },
  separacion_hecho: { label: 'Separación de hecho', color: BLACK, width: 2, slashes: 1 },
  separacion_legal: { label: 'Separación legal', color: MAROON, width: 2, slashes: 1 },
  divorcio: { label: 'Divorcio', color: MAROON, width: 2, slashes: 2 },
  nulidad: { label: 'Nulidad', color: MAROON, width: 2, slashes: 3 },
  viudez: { label: 'Viudez', color: BLACK, width: 2, deco: 'cross' },

  compromiso: { label: 'Compromiso', color: BLUE, width: 1.8, dash: '2 3' },
  compromiso_convivencia: { label: 'Compromiso y convivencia', color: BLUE, width: 1.8, dash: '2 3', house: true },
  compromiso_separacion: { label: 'Compromiso y separación', color: BLUE, width: 1.8, dash: '2 3', slashes: 1 },

  convivencia_legal: { label: 'Convivencia legal', color: BLUE, width: 1.8, dash: '4 3', house: true },
  convivencia_legal_separacion_hecho: {
    label: 'Convivencia legal y separación de hecho', color: BLUE, width: 1.8, dash: '4 3', house: true, slashes: 1,
  },
  convivencia_legal_separacion_oficial: {
    label: 'Convivencia legal y separación oficial (legal)', color: BLUE, width: 1.8, dash: '4 3', house: true, slashes: 2,
  },
  convivencia: { label: 'Convivencia', color: BLUE, width: 1.8, dash: '1 3', house: true },
  convivencia_separacion: { label: 'Convivencia y separación', color: BLUE, width: 1.8, dash: '1 3', slashes: 1 },
  convivencia_no_sentimental: { label: 'Convivencia no sentimental', color: BLUE, width: 1.8, dash: '1 2', house: true },
  convivencia_no_sentimental_separacion: {
    label: 'Convivencia no sentimental y separación', color: BLUE, width: 1.8, dash: '1 2', house: true, slashes: 1,
  },

  relacion_compromiso: { label: 'Relación de compromiso', color: BLUE, width: 2.5, pattern: 'double' },
  relacion_compromiso_separacion: {
    label: 'Relación de compromiso y separación', color: BLUE, width: 2, pattern: 'double', slashes: 1,
  },
  casual: { label: 'Relación casual o citas (corto plazo)', color: BLUE, width: 1.8, dash: '1 2' },
  casual_separacion: { label: 'Relación casual y separación', color: BLUE, width: 1.8, dash: '1 2', slashes: 1 },
  temporal: { label: 'Relación temporal / una noche de sexo', color: BLUE, width: 1.8, dash: '1 2', deco: 'cut' },

  aventura: { label: 'Aventura amorosa', color: PINK, width: 2, dash: '3 3' },
  aventura_separacion: { label: 'Aventura amorosa y separación', color: PINK, width: 2, dash: '3 3', slashes: 1 },
  violacion: { label: 'Violación / relación forzada', color: RED, width: 2.5, dash: '1 2' },
  otro_pareja: { label: 'Otro o desconocido', color: GREY, width: 1.5, dash: '1 3' },
};

export const FILIACION = {
  biologico: { label: 'Hijo/a biológico/a', color: BLACK, width: 2 },
  adopcion: { label: 'Hijo/a adoptado/a', color: BLACK, width: 2, dash: '2 3' },
  hijastro: { label: 'Hijo/a sustituto/a', color: BLACK, width: 2, dash: '6 4' },
};

export const EMOCION = {
  normal: { label: 'Simple / Normal', color: BLACK, width: 1.5 },
  indiferente: { label: 'Indiferente / Apático', color: BLACK, width: 1.5, dash: '1 3' },
  distante: { label: 'Distante / Pobre', color: BLACK, width: 1.5, dash: '6 4' },
  alejamiento: { label: 'Rompimiento / Alejamiento', color: RED, width: 2, dash: '6 3', deco: 'slash2' },
  rompimiento_reparado: { label: 'Rompimiento reparado', color: GREEN, width: 2, dash: '6 3', deco: 'slash2' },
  discordia: { label: 'Discordia / Conflicto', color: RED, width: 1.5, dash: '5 3' },
  odio: { label: 'Odio', color: RED, width: 1.5, pattern: 'double', dash: '3 2' },
  armonia: { label: 'Armonía', color: GREEN, width: 1.5 },
  amistad: { label: 'Amistad / Cercana', color: GREEN, width: 1.5, dash: '6 4' },
  mejores: { label: 'Buenos amigos(as) / Muy cercana', color: GREEN, width: 6, pattern: 'band' },
  amor: { label: 'Amor', color: GREEN, width: 1.5, deco: 'circle' },
  enamorado: { label: 'Enamorado(a)', color: GREEN, width: 1.5, deco: 'double-circle' },
  conexion: { label: 'Conexión emocional / Relación espiritual', color: GREEN, width: 1.5, deco: 'chain' },
  fusionado: { label: 'Fusionado(a)', color: RED, width: 1.5, pattern: 'triple' },
  desconfianza: { label: 'Desconfianza', color: RED, width: 1.5, pattern: 'double', dash: '1 2' },
  hostil: { label: 'Hostil', color: RED, width: 1.5, pattern: 'zigzag', amp: 4, step: 6 },
  distante_hostil: { label: 'Distante-Hostil', color: RED, width: 1.5, pattern: 'zigzag', amp: 4, step: 6, dash: '3 3' },
  cercano_hostil: { label: 'Cercano-Hostil', color: RED, width: 1.5, pattern: 'triple-zig', amp: 4, step: 6 },
  fusionado_hostil: { label: 'Fusionado(a)-Hostil', color: RED, width: 1.5, pattern: 'triple-zig', amp: 5, step: 8 },
  violencia: { label: 'Violencia', color: RED, width: 2, pattern: 'zigzag', amp: 5, step: 8, arrow: true },
  distante_violencia: { label: 'Distante-Violencia', color: BLUE, width: 2, pattern: 'zigzag', amp: 5, step: 8, dash: '3 3' },
  cercano_violencia: { label: 'Cercano-Violencia', color: RED, width: 2, pattern: 'triple-zig', amp: 5, step: 8 },
  fusionado_violencia: { label: 'Fusionado(a)-Violencia', color: RED, width: 1.5, pattern: 'triple-zig', amp: 5, step: 8 },
  abuso: { label: 'Abuso', color: BLUE, width: 2, pattern: 'zigzag', amp: 5, step: 8, arrow: true },
  abuso_fisico: { label: 'Abuso físico', color: BLUE, width: 2, pattern: 'zigzag', amp: 3, step: 5, arrow: true },
  abuso_emocional: { label: 'Abuso emocional', color: BLUE, width: 2, pattern: 'zigzag', amp: 5, step: 8, deco: 'box-x' },
  abuso_sexual: { label: 'Abuso sexual', color: BLUE, width: 2, pattern: 'zigzag', amp: 4, step: 7, arrow: true },
  negligencia: { label: 'Negligencia (abuso)', color: BLUE, width: 1.5, dash: '4 3' },
  manipulador: { label: 'Manipulativo(a)', color: RED, width: 1.5, deco: 'box-x' },
  controlador: { label: 'Controlador(a)', color: RED, width: 1.5, deco: 'box-x', dash: '6 3' },
  celoso: { label: 'Celoso(a)', color: RED, width: 1.5, deco: 'diamond' },
  concentrado: { label: 'Concentrado(a) en', color: BLACK, width: 1.5, pattern: 'zigzag', amp: 4, step: 8, arrow: true },
  concentrado_neg: { label: 'Concentrado(a) negativamente en', color: BLACK, width: 2, pattern: 'zigzag', amp: 6, step: 8, arrow: true },
  fan: { label: 'Fan / Admirador(a)', color: BLACK, width: 1.5, deco: 'circle', arrow: true },
  limerencia: { label: 'Limerencia (en las nubes / totalmente enamorado(a))', color: BLACK, width: 1.5, deco: 'double-circle' },
  nunca_conocieron: { label: 'Nunca se conocieron', color: BLACK, width: 1.5, deco: 'xcircle' },
  otro: { label: 'Otro', color: BLACK, width: 1.5, deco: 'question' },
};

export const PARENT_KINDS = ['biologico', 'adopcion', 'hijastro'];
export const PARTNER_KINDS = ['matrimonio', 'convivencia', 'compromiso'];

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
  union: 'convivencia',
  separacion: 'separacion_hecho',
  union_separada: 'convivencia_separacion',
  nuevo_matrimonio: 'matrimonio',
};
