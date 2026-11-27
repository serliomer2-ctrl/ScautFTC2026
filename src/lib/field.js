/**
 * Saha haritası yapılandırması – public/field.png (640×640, 6×6 karo) üzerinden PİKSELLE ölçüldü.
 * Koordinatlar 0–1 normalize (x: soldan sağa, y: yukarıdan aşağı). Sahanın üstü = Mavi ittifak tarafı.
 * Dokunma alanları görseldeki öğelerden biraz geniş tutuldu (eldivenle / hızlı dokunuşta ıskalamasın).
 *
 *   Hive (Mavi)    sağ üst açık dikdörtgen      px x 428–532, y 0–52
 *   Hive (Kırmızı) sol alt açık dikdörtgen      px x 108–212, y 588–640
 *   Flower (Mavi)  merkez üst taç yapraklı yapı px x 234–432, y 216–304
 *   Flower (Kırmızı) merkez alt yapı           px x 208–406, y 333–423
 *   Garden         4 kenar ortasındaki tekli altıgen parçalar
 *   Yükleme        köşe şeritleri + 4'lü altıgen yığınları
 * Adlandırma görselden çıkarıldı; kural kitabıyla farklıysa yalnızca `label` alanlarını değiştirin.
 * (id'ler kayıtlarda saklanır – değiştirmeyin.)
 */
export const FIELD_IMAGE = 'field.png';

export const FIELD_ZONES = [
  { id: 'hive-blue', label: 'Hive (M)', x: 0.655, y: 0.0, w: 0.19, h: 0.11, tone: 'blue' },
  { id: 'hive-red', label: 'Hive (K)', x: 0.155, y: 0.89, w: 0.19, h: 0.11, tone: 'red' },
  { id: 'flower-1', label: 'Flower (M)', x: 0.35, y: 0.32, w: 0.34, h: 0.175, tone: 'blue' },
  { id: 'flower-2', label: 'Flower (K)', x: 0.31, y: 0.505, w: 0.34, h: 0.175, tone: 'red' },
  { id: 'load-blue', label: 'Yükleme (M)', x: 0.0, y: 0.0, w: 0.07, h: 0.18, tone: 'blue' },
  { id: 'load-red', label: 'Yükleme (K)', x: 0.93, y: 0.82, w: 0.07, h: 0.18, tone: 'red' },
  { id: 'garden', label: 'Garden', x: 0.29, y: 0.0, w: 0.09, h: 0.08, tone: 'neutral' }, // üst
  { id: 'garden', label: 'Garden', x: 0.92, y: 0.29, w: 0.08, h: 0.09, tone: 'neutral' }, // sağ
  { id: 'garden', label: 'Garden', x: 0.0, y: 0.62, w: 0.08, h: 0.09, tone: 'neutral' }, // sol
  { id: 'garden', label: 'Garden', x: 0.62, y: 0.92, w: 0.09, h: 0.08, tone: 'neutral' }, // alt
];

export function zoneAt(x, y) {
  return FIELD_ZONES.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h)?.id || null;
}

export const ZONE_LABEL = Object.fromEntries(FIELD_ZONES.map((z) => [z.id, z.label]));
