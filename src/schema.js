/**
 * VERİ MİMARİSİ
 * -------------
 * Her gözlem (ScoutRecord) = 1 takımın 1 maçtaki kaydı. Kategoriler iç içe nesnelerdir:
 *   match   -> temel maç bilgileri
 *   robot   -> pit / genel robot özellikleri
 *   auto    -> otonom dönemi
 *   teleop  -> sürücü kontrol dönemi
 *   endgame -> oyun sonu
 * Evet/Hayır alanları `null | true | false` tutar: null = "işaretlenmedi" (boş bırakılan
 * alan ile "Hayır" birbirinden ayrılabilsin diye).
 * SCHEMA_VERSION, ileride alan eklendiğinde eski kayıtları migrate() ile yükseltmek için.
 */
export const SCHEMA_VERSION = 1;

export const OPTIONS = {
  alliance: [
    { value: 'red', label: 'Kırmızı' },
    { value: 'blue', label: 'Mavi' },
  ],
  drivetrain: [
    { value: 'mecanum', label: 'Mecanum' },
    { value: 'tank', label: 'Tank (Diferansiyel)' },
    { value: 'swerve', label: 'Swerve' },
    { value: 'other', label: 'Diğer' },
  ],
  intake: [
    { value: 'internal', label: 'Şase İçi' },
    { value: 'external', label: 'Şase Dışı' },
  ],
  autoSuccess: [
    { value: 'success', label: 'Başarılı' },
    { value: 'partial', label: 'Kısmen' },
    { value: 'fail', label: 'Başarısız' },
  ],
  startPosition: [
    { value: 'hive', label: 'Hive Yakını' },
    { value: 'flower', label: 'Flower Yakını' },
    { value: 'middle', label: 'Orta' },
  ],
  pickupSource: [
    { value: 'garden', label: 'Garden' },
    { value: 'flower', label: 'Flower' },
    { value: 'both', label: 'Her İkisi' },
    { value: 'none', label: 'Almıyor' },
  ],
  flowerResult: [
    { value: 'done', label: 'Yaptı' },
    { value: 'failed', label: 'Yapamadı' },
    { value: 'not_attempted', label: 'Denemedi' },
  ],
};

export const ABILITIES = [
  { key: 'hive', label: 'Hive (Kovan) yapabiliyor' },
  { key: 'flower', label: 'Flower (Çiçek) yapabiliyor' },
  { key: 'nectar', label: 'Nektar alabiliyor' },
  { key: 'pollen', label: 'Polen alabiliyor' },
  { key: 'stealFlower', label: 'Rakip Flower çalabiliyor' },
];

export const emptyRecord = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
  schemaVersion: SCHEMA_VERSION,
  createdAt: null,
  updatedAt: null,
  scouter: '',
  match: { teamNumber: '', teamName: '', matchNumber: '', alliance: null, notes: '' },
  robot: {
    drivetrain: null,
    drivetrainOther: '',
    intake: null,
    abilities: { hive: null, flower: null, nectar: null, pollen: null, stealFlower: null },
  },
  auto: {
    hasAuto: null,
    performance: '',
    success: null,
    odometry: null,
    vision: null,
    startPosition: null,
    routeCount: 0,
    pickupSource: null,
    tipCount: 0,
    soloTip: null,
  },
  teleop: {
    autoAim: null,
    driverAssist: null,
    assistDescription: '',
    driverRating: 0,
    carryCapacity: 0,
    tipCount: 0,
    accuracy: 50,
  },
  endgame: { flowerPlanned: null, flowerResult: null },
});

/** Eksik alanları varsayılanlarla doldurur (eski / içe aktarılan kayıtlar için). */
export function migrate(raw) {
  const base = emptyRecord();
  const r = raw || {};
  return {
    ...base,
    ...r,
    schemaVersion: SCHEMA_VERSION,
    match: { ...base.match, ...r.match },
    robot: { ...base.robot, ...r.robot, abilities: { ...base.robot.abilities, ...r.robot?.abilities } },
    auto: { ...base.auto, ...r.auto },
    teleop: { ...base.teleop, ...r.teleop },
    endgame: { ...base.endgame, ...r.endgame },
  };
}

export function validate(rec) {
  const errors = {};
  if (!String(rec.match.teamNumber).trim()) errors.teamNumber = 'Takım numarası zorunlu';
  if (!String(rec.match.matchNumber).trim()) errors.matchNumber = 'Maç numarası zorunlu';
  if (!rec.match.alliance) errors.alliance = 'İttifak rengi seçin';
  return errors;
}

export const labelOf = (group, value) =>
  OPTIONS[group]?.find((o) => o.value === value)?.label ?? '';

const yn = (v) => (v === true ? 'Evet' : v === false ? 'Hayır' : '');

/** CSV sütunları: [başlık, kayıttan değer çıkaran fonksiyon]. Sıra = Excel'deki sıra. */
export const CSV_COLUMNS = [
  ['Takım No', (r) => r.match.teamNumber],
  ['Takım Adı', (r) => r.match.teamName],
  ['Maç No', (r) => r.match.matchNumber],
  ['İttifak', (r) => labelOf('alliance', r.match.alliance)],
  ['Gözlemci', (r) => r.scouter],
  ['Şasi', (r) => (r.robot.drivetrain === 'other' ? `Diğer: ${r.robot.drivetrainOther}` : labelOf('drivetrain', r.robot.drivetrain))],
  ['Intake', (r) => labelOf('intake', r.robot.intake)],
  ...ABILITIES.map((a) => [a.label, (r) => yn(r.robot.abilities[a.key])]),
  ['Otonom Var', (r) => yn(r.auto.hasAuto)],
  ['Otonom Başarı', (r) => labelOf('autoSuccess', r.auto.success)],
  ['Otonom Açıklama', (r) => r.auto.performance],
  ['Odometri', (r) => yn(r.auto.odometry)],
  ['Vision', (r) => yn(r.auto.vision)],
  ['Başlangıç Konumu', (r) => labelOf('startPosition', r.auto.startPosition)],
  ['Otonom Rota Sayısı', (r) => (r.auto.hasAuto ? r.auto.routeCount : '')],
  ['Otonom Top Kaynağı', (r) => labelOf('pickupSource', r.auto.pickupSource)],
  ['Otonom Tip', (r) => (r.auto.hasAuto ? r.auto.tipCount : '')],
  ['Yardımsız Tip', (r) => yn(r.auto.soloTip)],
  ['Oto Hizalama', (r) => yn(r.teleop.autoAim)],
  ['Sürücü Asistanı', (r) => yn(r.teleop.driverAssist)],
  ['Asistan Açıklama', (r) => (r.teleop.driverAssist ? r.teleop.assistDescription : '')],
  ['Sürücü Puanı (1-5)', (r) => r.teleop.driverRating || ''],
  ['Taşıma Kapasitesi', (r) => r.teleop.carryCapacity],
  ['TeleOp Tip', (r) => r.teleop.tipCount],
  ['İsabet %', (r) => r.teleop.accuracy],
  ['EndGame Flower Plan', (r) => yn(r.endgame.flowerPlanned)],
  ['EndGame Flower Sonuç', (r) => labelOf('flowerResult', r.endgame.flowerResult)],
  ['Notlar', (r) => r.match.notes],
  ['Kayıt Zamanı', (r) => r.updatedAt || r.createdAt || ''],
];
