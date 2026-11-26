/**
 * Saha haritası yapılandırması (şematik).
 * Koordinatlar 0–1 arası normalize (x: soldan sağa, y: yukarıdan aşağı), sahanın üstü = Mavi ittifak tarafı.
 * Biobuzz resmi saha düzeni kural kitabına göre buradan güncellenebilir. FIELD_IMAGE'a public/ altındaki
 * bir görselin adı yazılırsa (örn. 'field.png'), şematik bölgeler yerine arka planda o görsel kullanılır;
 * bölgeler yine de dokunma algılaması için geçerlidir.
 */
export const FIELD_IMAGE = '';

export const FIELD_ZONES = [
  { id: 'hive-red', label: 'Hive (K)', x: 0.04, y: 0.62, w: 0.22, h: 0.34, tone: 'red' },
  { id: 'hive-blue', label: 'Hive (M)', x: 0.74, y: 0.04, w: 0.22, h: 0.34, tone: 'blue' },
  { id: 'flower-1', label: 'Flower', x: 0.38, y: 0.06, w: 0.24, h: 0.18, tone: 'neutral' },
  { id: 'flower-2', label: 'Flower', x: 0.38, y: 0.76, w: 0.24, h: 0.18, tone: 'neutral' },
  { id: 'garden', label: 'Garden', x: 0.34, y: 0.36, w: 0.32, h: 0.28, tone: 'neutral' },
];

export function zoneAt(x, y) {
  return FIELD_ZONES.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h)?.id || null;
}

export const ZONE_LABEL = Object.fromEntries(FIELD_ZONES.map((z) => [z.id, z.label]));
