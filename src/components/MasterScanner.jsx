import React, { useEffect, useRef, useState } from 'react';
import { decodeMatch, isCompact } from '../lib/compactProtocol.js';
import { decodeTransfer, parsePart } from '../lib/qrcodec.js';
import { beep } from '../lib/feedback.js';

/**
 * Master (Strateji Masası) – SÜREKLİ QR tarayıcı.
 * Kamera açık kalır; her okunan QR bip + titreşim + yeşil çerçeve ile onaylanır ve listeye eklenir.
 * Kompakt maç QR'ları (BZ2) tek karede, toplu QR'lar (BB1) parça parça toplanır.
 * Aynı QR kamerada kalmaya devam etse de 4 sn içinde tekrar işlenmez; veri katmanı ayrıca
 * id + takım/maç bazında çift kayıt kontrolü yapar (onImport → importScanned).
 */
export default function MasterScanner({ onImport }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const importRef = useRef(onImport);
  importRef.current = onImport;
  const seenRef = useRef(new Map()); // QR metni → son işlenme zamanı
  const partsRef = useRef(new Map());
  const [running, setRunning] = useState(true);
  const [status, setStatus] = useState('starting');
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState(null); // 'ok' | 'dup' | 'err'
  const [log, setLog] = useState([]);
  const [partial, setPartial] = useState(null);

  useEffect(() => {
    if (!running) return undefined;
    let stream;
    let timer;
    let stopped = false;
    let detector = null;
    let jsQR = null;
    let busy = false;

    const show = (kind) => {
      setFlash(kind);
      setTimeout(() => setFlash(null), 650);
      beep(kind);
    };

    async function handle(text) {
      const now = Date.now();
      if (now - (seenRef.current.get(text) || 0) < 4000) return;
      seenRef.current.set(text, now);
      try {
        let records;
        if (isCompact(text)) records = [await decodeMatch(text)];
        else {
          const p = parsePart(text);
          if (!p) return;
          const m = partsRef.current.get(p.tid) || new Map();
          m.set(p.index, p);
          partsRef.current.set(p.tid, m);
          setPartial({ got: m.size, total: p.total });
          if (m.size < p.total) return beep('dup');
          partsRef.current.delete(p.tid);
          setPartial(null);
          records = await decodeTransfer([...m.values()]);
        }
        const sum = await importRef.current(records, { quiet: true });
        const fresh = sum.added + sum.updated > 0;
        show(fresh ? 'ok' : 'dup');
        setLog((l) => [
          ...records.map((r) => ({
            key: `${r.id}-${now}`,
            at: now,
            label: r.kind === 'pit' ? `Pit #${r.team?.number}` : `#${r.match.teamNumber} · ${r.match.matchNumber}`,
            alliance: r.match?.alliance,
            scouter: r.scouter,
            fresh,
          })),
          ...l,
        ].slice(0, 60));
      } catch (e) {
        show('err');
        setErr('QR çözülemedi: ' + e.message);
      }
    }

    async function loop() {
      if (stopped) return;
      const v = videoRef.current;
      if (!busy && v && v.readyState >= 2) {
        busy = true;
        try {
          if (detector) {
            for (const c of await detector.detect(v)) await handle(c.rawValue);
          } else if (jsQR) {
            const cv = canvasRef.current;
            const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
            cv.width = Math.round(v.videoWidth * scale);
            cv.height = Math.round(v.videoHeight * scale);
            const g = cv.getContext('2d', { willReadFrequently: true });
            g.drawImage(v, 0, 0, cv.width, cv.height);
            const img = g.getImageData(0, 0, cv.width, cv.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
            if (code?.data) await handle(code.data);
          }
        } catch { /* tek kare hatası */ }
        busy = false;
      }
      timer = setTimeout(loop, 90);
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('Kameraya erişilemiyor (HTTPS gerekli).');
        setStatus('error');
        return;
      }
      try {
        if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats?.())?.includes('qr_code')) {
          detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        } else jsQR = (await import('jsqr')).default;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('scanning');
        setErr('');
        loop();
      } catch (e) {
        setErr(e.name === 'NotAllowedError' ? 'Kamera izni verilmedi – tarayıcı ayarlarından izin verin.' : 'Kamera açılamadı: ' + e.message);
        setStatus('error');
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [running]);

  const ring = flash === 'ok' ? 'border-ok' : flash === 'dup' ? 'border-warn' : flash === 'err' ? 'border-bad' : 'border-white/40';
  const freshCount = log.filter((l) => l.fresh).length;

  return (
    <section className="card grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">📷 Sürekli QR Tarayıcı</h2>
        <button className="btn-ghost min-h-[40px] px-3 text-sm" onClick={() => setRunning(!running)}>
          {running ? '⏸ Kamerayı Durdur' : '▶ Kamerayı Aç'}
        </button>
      </div>
      {running && (
        <div className="relative overflow-hidden rounded-2xl bg-black">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" playsInline muted />
          <div className={`pointer-events-none absolute inset-[10%] rounded-2xl border-[6px] transition-colors ${ring}`} />
          {flash === 'ok' && <div className="pointer-events-none absolute inset-0 bg-ok/25" />}
          {flash && (
            <div className="absolute inset-x-0 bottom-3 text-center text-2xl font-extrabold text-white drop-shadow">
              {flash === 'ok' ? '✓ Eklendi' : flash === 'dup' ? partial ? `Parça ${partial.got}/${partial.total}` : '↺ Zaten var' : '✕ Okunamadı'}
            </div>
          )}
          {status === 'starting' && <p className="absolute inset-0 flex items-center justify-center text-white">Kamera açılıyor…</p>}
        </div>
      )}
      <canvas ref={canvasRef} hidden />
      {err && <p className="rounded-xl bg-bad/15 p-3 text-sm text-bad">{err}</p>}
      <div className="flex items-center justify-between text-sm">
        <span>Bu oturumda <b className="text-ok">{freshCount}</b> yeni kayıt</span>
        {log.length > 0 && <button className="text-muted underline" onClick={() => setLog([])}>Listeyi temizle</button>}
      </div>
      <ul className="grid max-h-72 gap-1 overflow-y-auto">
        {log.map((l) => (
          <li key={l.key} className={`flex items-center gap-2 rounded-lg border-l-4 bg-raised px-3 py-2 text-sm ${l.alliance === 'blue' ? 'border-blue-alliance' : l.alliance === 'red' ? 'border-red-alliance' : 'border-line'}`}>
            <span className={l.fresh ? 'text-ok' : 'text-warn'}>{l.fresh ? '✓' : '↺'}</span>
            <b>{l.label}</b>
            <span className="ml-auto text-xs text-muted">{l.scouter} · {new Date(l.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          </li>
        ))}
        {!log.length && <li className="text-sm text-muted">Scouter telefonlarındaki QR'ları sırayla kameraya gösterin – kamera açık kalır.</li>}
      </ul>
    </section>
  );
}
