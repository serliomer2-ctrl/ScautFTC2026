/**
 * İstemci tarafı fotoğraf sıkıştırma.
 * Hedef: JPEG data URL ≤ maxChars (varsayılan 18 000 karakter ≈ 13 KB).
 * Bu sınır, fotoğraflı pit kaydının şifreli özel odalarda bile senkronizasyon sınırının
 * (Worker: kayıt başına 32 KB) altında kalmasını sağlar. Önce kaliteyi, sonra boyutu düşürür.
 */
export async function compressImage(file, { maxDim = 640, maxChars = 18000 } = {}) {
  const bmp = await loadBitmap(file);
  let dim = maxDim;
  for (let round = 0; round < 6; round++) {
    const scale = Math.min(1, dim / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    for (const q of [0.75, 0.62, 0.5, 0.4]) {
      const url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= maxChars) return { dataUrl: url, width: w, height: h, bytes: Math.round((url.length * 3) / 4) };
    }
    dim = Math.round(dim * 0.75);
  }
  throw new Error('Fotoğraf yeterince küçültülemedi');
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* eski tarayıcı: <img> ile dene */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
