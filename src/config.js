/**
 * Depo ayarları. GitHub Pages'te çalışırken owner/repo adresten otomatik bulunur
 * (https://<owner>.github.io/<repo>/). Giriş ekranındaki "Senkronizasyon Ayarları"ndan değiştirilebilir.
 * branch boş = deponun varsayılan dalı.
 */
function detectRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return m && repo ? { owner: m[1], repo } : null;
}

export const DEFAULT_REPO = {
  owner: 'serliomer2-ctrl',
  repo: 'ScautFTC2026',
  branch: '',
  path: 'scouting_data.json',
  ...detectRepo(),
};

/**
 * Puan modeli (Maç Simülatörü + İttifak Seçimi). Biobuzz kural kitabındaki gerçek değerlerle
 * güncelleyin – Simülatör sekmesinden de değiştirilebilir (cihazda saklanır).
 */
export const DEFAULT_SCORING = {
  autoTip: 10, // otonomdaki 1 Tip kaç puan
  teleTip: 5, // TeleOp'taki 1 Tip kaç puan
  endFlower: 15, // End Game Flower başarılı olursa
  autoBonus: 5, // otonomu "Başarılı" tamamlarsa (park / görev bonusu varsayımı)
};

export const SYNC_INTERVAL_MS = 45_000;
