import React, { useEffect, useRef, useState } from 'react';
import { makeTextCode, parseAnyText } from '../lib/textcode.js';
import { Segmented } from './ui.jsx';

/**
 * Hızlı Metin Kodu – QR okunamadığında (parlak ışık, çizik ekran, bozuk kamera) yedek aktarım.
 * Gönder: kayıtlar → tek metin bloğu → Kopyala / Paylaş (Bluetooth, Yakındaki Paylaşım, AirDrop,
 *         mesajlaşma) / .txt indir.
 * Al:     metni yapıştır veya .txt dosyasını aç → QR ile aynı çakışma kontrolüyle birleştir.
 */
export default function TextSync({ matchRecords, pitRecords, session, onImport }) {
  const [mode, setMode] = useState('send');
  return (
    <section className="card grid gap-3">
      <h2 className="text-lg font-bold">📋 Hızlı Metin Kodu</h2>
      <p className="-mt-2 text-xs text-muted">
        QR okunamıyorsa: kodu kopyalayıp mesajla, Bluetooth / Yakındaki Paylaşım ile ya da dosya olarak gönderin.
        {session.type === 'private' ? ' Özel oda: kod oda anahtarıyla şifrelenir.' : ' Ortak oda: kod sıkıştırılır, şifrelenmez.'}
      </p>
      <Segmented
        options={[
          { value: 'send', label: '📤 Kod Oluştur' },
          { value: 'recv', label: '📥 Kodu Birleştir' },
        ]}
        value={mode}
        onChange={(v) => v && setMode(v)}
      />
      {mode === 'send' ? <Send matchRecords={matchRecords} pitRecords={pitRecords} session={session} /> : <Receive session={session} onImport={onImport} />}
    </section>
  );
}

function Send({ matchRecords, pitRecords, session }) {
  const strip = (r) => {
    const { _pending, ...rest } = r;
    return rest;
  };
  const pending = matchRecords.filter((r) => r._pending);
  const mine = matchRecords.filter((r) => r.scouter === session.scouter);
  const [which, setWhich] = useState(pending.length ? 'pending' : 'mine');
  const [photos, setPhotos] = useState(false);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const sets = {
    pending: [`Bekleyen (${pending.length})`, pending],
    mine: [`Benim (${mine.length})`, mine],
    all: [`Tümü (${matchRecords.length + pitRecords.length})`, [...matchRecords, ...pitRecords]],
  };
  const list = sets[which][1];

  useEffect(() => {
    let alive = true;
    setMsg('');
    if (!list.length) return setCode('');
    const recs = list.map(strip).map((r) => (r.kind === 'pit' && !photos ? { ...r, pit: { ...r.pit, photo: undefined } } : r));
    makeTextCode(recs, session).then((c) => alive && setCode(c), (e) => alive && setMsg('Kod oluşturulamadı: ' + e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [which, photos, list.length, list.map((r) => r.id + r.updatedAt).join()]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMsg('✅ Panoya kopyalandı');
    } catch {
      // Eski tarayıcı / izin yok: metni seçili bırak, kullanıcı elle kopyalasın
      document.getElementById('bb-textcode')?.select();
      setMsg('Metin seçildi – Kopyala ile kopyalayın');
    }
  }

  async function share() {
    const name = `biobuzz-${session.roomName.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.txt`;
    const file = new File([code], name, { type: 'text/plain' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Biobuzz Scout verisi' });
      else if (navigator.share) await navigator.share({ text: code, title: 'Biobuzz Scout verisi' });
      else return download(file);
    } catch (e) {
      if (e.name !== 'AbortError') download(file);
    }
  }
  function download(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg('📁 Dosya indirildi');
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(sets).map(([k, [label]]) => (
          <button key={k} type="button" onClick={() => setWhich(k)} className={`btn min-h-[44px] border-2 px-1 text-xs ${which === k ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-raised'}`}>
            {label}
          </button>
        ))}
      </div>
      {which === 'all' && pitRecords.length > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={photos} onChange={(e) => setPhotos(e.target.checked)} /> Pit fotoğraflarını dahil et (kod uzar)
        </label>
      )}
      {!list.length && <p className="text-sm text-muted">Bu seçimde kayıt yok.</p>}
      {code && (
        <>
          <textarea id="bb-textcode" readOnly value={code} onFocus={(e) => e.target.select()} className="input h-28 break-all font-mono text-xs" />
          <p className="text-xs text-muted">{list.length} kayıt · {code.length.toLocaleString('tr-TR')} karakter</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-primary min-h-[52px]" onClick={copy}>📋 Kopyala</button>
            <button className="btn-ghost min-h-[52px]" onClick={share}>📡 Paylaş / Dosya</button>
          </div>
        </>
      )}
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}

function Receive({ session, onImport }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  async function merge(src = text) {
    setBusy(true);
    setResult(null);
    try {
      const { records, errors } = await parseAnyText(src, session);
      const sum = records.length ? await onImport(records) : null;
      setResult({ sum, errors, none: !records.length && !errors.length });
      if (sum) setText('');
    } finally {
      setBusy(false);
    }
  }
  async function paste() {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      if (t) merge(t);
    } catch {
      setResult({ errors: ['Pano okunamadı – metni kutuya uzun basıp yapıştırın'] });
    }
  }
  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const t = await f.text();
    setText(t);
    merge(t);
  }

  return (
    <div className="grid gap-2">
      <textarea className="input h-28 font-mono text-xs" placeholder="BBT1.… kodunu (veya QR metinlerini) buraya yapıştırın" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-ghost min-h-[52px] text-sm" onClick={paste}>📥 Yapıştır</button>
        <button className="btn-ghost min-h-[52px] text-sm" onClick={() => fileRef.current?.click()}>📁 Dosya</button>
        <button className="btn-primary min-h-[52px]" disabled={!text.trim() || busy} onClick={() => merge()}>{busy ? '⏳' : '🔗 Birleştir'}</button>
      </div>
      <input ref={fileRef} type="file" accept=".txt,text/plain" hidden onChange={onFile} />
      {result?.sum && (
        <p className="rounded-xl bg-ok/15 p-3 text-sm">
          ✅ <b>{result.sum.added}</b> yeni, <b>{result.sum.updated}</b> güncellendi, <b>{result.sum.skipped}</b> zaten vardı{result.sum.replaced ? `, ${result.sum.replaced} çift kayıt değiştirildi` : ''}.
        </p>
      )}
      {result?.none && <p className="rounded-xl bg-warn/15 p-3 text-sm">Metinde tanınan bir kod bulunamadı.</p>}
      {result?.errors?.map((e) => (
        <p key={e} className="rounded-xl bg-bad/15 p-3 text-sm text-bad">{e}</p>
      ))}
    </div>
  );
}
