import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { decodeTransfer, encodeTransfer, parsePart } from '../lib/qrcodec.js';
import { Segmented } from './ui.jsx';

/**
 * İnternetsiz cihazlar arası aktarım.
 *  - Gönder: seçilen kayıtları QR (gerekirse birden çok parça) olarak gösterir.
 *  - Al: kamerayla QR okur, parçaları birleştirir, onImport(kayıtlar) çağırır.
 * Fotoğraflar QR'a sığmayacağı için pit kayıtları fotoğrafsız gönderilir.
 */
export default function QRTransfer({ matchRecords, pitRecords, scouter, onImport }) {
  const [mode, setMode] = useState('send');
  return (
    <section className="card grid gap-3">
      <h2 className="text-lg font-bold">📱 QR ile İnternetsiz Aktarım</h2>
      <Segmented
        options={[
          { value: 'send', label: '📤 QR Göster' },
          { value: 'scan', label: '📷 QR Oku' },
        ]}
        value={mode}
        onChange={(v) => v && setMode(v)}
      />
      {mode === 'send' ? (
        <QRSend matchRecords={matchRecords} pitRecords={pitRecords} scouter={scouter} />
      ) : (
        <QRScan onImport={onImport} />
      )}
    </section>
  );
}

/* ============================ GÖNDER ============================ */
function QRSend({ matchRecords, pitRecords, scouter }) {
  const pending = matchRecords.filter((r) => r._pending);
  const mine = matchRecords.filter((r) => r.scouter === scouter);
  const sets = {
    pending: { label: `Bekleyen (${pending.length})`, list: pending },
    last: { label: 'Son kayıt', list: [...matchRecords].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 1) },
    mine: { label: `Benim (${mine.length})`, list: mine },
    pit: { label: `Pit (${pitRecords.length})`, list: pitRecords.map(({ pit, ...r }) => ({ ...r, pit: { ...pit, photo: undefined } })) },
  };
  const [which, setWhich] = useState(pending.length ? 'pending' : 'last');
  const [codes, setCodes] = useState([]);
  const [idx, setIdx] = useState(0);
  const [auto, setAuto] = useState(true);
  const [err, setErr] = useState('');
  const list = sets[which].list;

  useEffect(() => {
    let alive = true;
    setErr('');
    setCodes([]);
    setIdx(0);
    if (!list.length) return undefined;
    (async () => {
      try {
        const texts = await encodeTransfer(list);
        const imgs = await Promise.all(texts.map((t) => QRCode.toDataURL(t, { errorCorrectionLevel: 'L', margin: 4, width: 720 })));
        if (alive) setCodes(imgs);
      } catch (e) {
        if (alive) setErr('QR oluşturulamadı: ' + e.message);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [which, list.length, list.map((r) => r.id + r.updatedAt).join()]);

  // Birden çok parça varsa otomatik döndür (okuyucu hepsini sırayla yakalar)
  useEffect(() => {
    if (!auto || codes.length < 2) return undefined;
    const t = setInterval(() => setIdx((i) => (i + 1) % codes.length), 1400);
    return () => clearInterval(t);
  }, [auto, codes.length]);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-2">
        {Object.entries(sets).map(([k, s]) => (
          <button
            key={k}
            type="button"
            onClick={() => setWhich(k)}
            className={`btn min-h-[44px] border-2 px-1 text-xs ${which === k ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-raised'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {!list.length && <p className="text-sm text-muted">Bu seçimde gönderilecek kayıt yok.</p>}
      {err && <p className="text-sm text-bad">{err}</p>}
      {codes.length > 0 && (
        <>
          {/* QR her temada beyaz zemin üzerinde – okunabilirlik için */}
          <div className="mx-auto w-full max-w-sm rounded-2xl bg-white p-2">
            <img src={codes[idx]} alt={`QR parça ${idx + 1}/${codes.length}`} className="w-full" style={{ imageRendering: 'pixelated' }} />
          </div>
          <p className="text-center text-sm">
            <b>{list.length}</b> kayıt · parça <b>{idx + 1}/{codes.length}</b>
          </p>
          {codes.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="btn-ghost" onClick={() => (setAuto(false), setIdx((idx - 1 + codes.length) % codes.length))}>◀</button>
              <button type="button" className="btn-ghost text-sm" onClick={() => setAuto(!auto)}>{auto ? '⏸ Durdur' : '▶ Otomatik'}</button>
              <button type="button" className="btn-ghost" onClick={() => (setAuto(false), setIdx((idx + 1) % codes.length))}>▶</button>
            </div>
          )}
          <p className="text-xs text-muted">Ekran parlaklığını artırın. Okuyan cihaz tüm parçaları otomatik toplar; sıra önemli değil.</p>
        </>
      )}
    </div>
  );
}

/* ============================ OKU ============================ */
function QRScan({ onImport }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const partsRef = useRef(new Map()); // tid -> Map(index -> part)
  const doneRef = useRef(new Set()); // tamamlanan aktarımlar (aynı QR tekrar okunmasın)
  const [status, setStatus] = useState('starting');
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const importRef = useRef(onImport);
  importRef.current = onImport;

  useEffect(() => {
    let stream;
    let raf;
    let stopped = false;
    let detector = null;
    let jsQR = null;

    async function handle(text) {
      const p = parsePart(text);
      if (!p || doneRef.current.has(p.tid)) return;
      const m = partsRef.current.get(p.tid) || new Map();
      m.set(p.index, p);
      partsRef.current.set(p.tid, m);
      setProgress({ got: m.size, total: p.total });
      if (m.size === p.total) {
        partsRef.current.delete(p.tid);
        doneRef.current.add(p.tid);
        try {
          const records = await decodeTransfer([...m.values()]);
          if (navigator.vibrate) navigator.vibrate(120);
          const summary = await importRef.current(records);
          setResult(summary);
          setProgress(null);
        } catch (e) {
          setErr('QR verisi çözülemedi: ' + e.message);
        }
      }
    }

    async function loop() {
      if (stopped) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2) {
        try {
          if (detector) {
            for (const c of await detector.detect(v)) await handle(c.rawValue);
          } else if (jsQR) {
            const cv = canvasRef.current;
            const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
            cv.width = Math.round(v.videoWidth * scale);
            cv.height = Math.round(v.videoHeight * scale);
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(v, 0, 0, cv.width, cv.height);
            const img = ctx.getImageData(0, 0, cv.width, cv.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) await handle(code.data);
          }
        } catch { /* tek kare hatası: devam */ }
      }
      raf = setTimeout(loop, 120);
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('Bu tarayıcı kameraya erişemiyor (HTTPS gerekli).');
        setStatus('error');
        return;
      }
      try {
        // Yerleşik okuyucu (Android Chrome) varsa onu, yoksa jsQR'ı kullan
        if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats?.())?.includes('qr_code')) {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } else {
          jsQR = (await import('jsqr')).default;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('scanning');
        loop();
      } catch (e) {
        setErr(e.name === 'NotAllowedError' ? 'Kamera izni verilmedi. Tarayıcı ayarlarından izin verin.' : 'Kamera açılamadı: ' + e.message);
        setStatus('error');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="grid gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
        <div className="pointer-events-none absolute inset-[15%] rounded-2xl border-4 border-accent/80" />
        {status === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-white">Kamera açılıyor…</p>}
      </div>
      <canvas ref={canvasRef} hidden />
      {progress && (
        <div>
          <div className="mb-1 text-sm">Parçalar: <b>{progress.got}/{progress.total}</b></div>
          <div className="h-3 overflow-hidden rounded-full bg-raised">
            <div className="h-full bg-accent" style={{ width: `${(progress.got / progress.total) * 100}%` }} />
          </div>
        </div>
      )}
      {err && <p className="rounded-xl bg-bad/15 p-3 text-sm text-bad">{err}</p>}
      {result && (
        <p className="rounded-xl bg-ok/15 p-3 text-sm">
          ✅ <b>{result.added}</b> yeni, <b>{result.updated}</b> güncellendi, <b>{result.skipped}</b> zaten vardı
          {result.replaced ? `, ${result.replaced} çift kayıt değiştirildi` : ''}. Okumaya devam edebilirsiniz.
        </p>
      )}
      {status === 'scanning' && !progress && !result && <p className="text-sm text-muted">QR kodu çerçevenin içine getirin…</p>}
    </div>
  );
}
