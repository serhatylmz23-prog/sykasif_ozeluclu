import React, { useEffect, useState } from 'react';

/*
 * -----------------------------------------------------------------------
 * ADLİ MEDYA DOĞRULAMA — SHA-256 / EXIF / ELA
 * Tamamen tarayıcı içinde çalışır, dış servise ihtiyaç duymaz.
 * Bu panel bir "gerçeklik puanı" ÜRETMEZ; yalnızca ham teknik bulguları
 * gösterir. Yorumu her zaman kullanıcıya/uzmana bırakır.
 * -----------------------------------------------------------------------
 */

interface ExifBulgusu {
  etiket: string;
  deger: string;
}

interface DogrulamaSonucu {
  sha256: string;
  boyutBayt: number;
  mimeTuru: string;
  exif: ExifBulgusu[] | null;
  exifNotu: string;
  elaDataUrl: string | null;
  elaNotu: string;
}

/* ---------------------------- SHA-256 ---------------------------- */

async function dosyaHashi(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/* ---------------------------- EXIF ---------------------------- */

const EXIF_ETIKETLERI: Record<number, string> = {
  0x010f: 'Üretici (Make)',
  0x0110: 'Cihaz Modeli',
  0x0112: 'Yönelim (Orientation)',
  0x0131: 'Düzenleme Yazılımı',
  0x0132: 'Değiştirilme Tarihi',
  0x9003: 'Orijinal Çekim Tarihi',
  0x829a: 'Pozlama Süresi',
  0x829d: 'Diyafram (F-Number)',
  0x8827: 'ISO',
  0x920a: 'Odak Uzaklığı',
};

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function ifdDegeriniOku(
  view: DataView,
  tiffStart: number,
  littleEndian: boolean,
  type: number,
  count: number,
  valueOffsetPos: number
): string {
  const typeSize: Record<number, number> = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8,
    7: 1,
    9: 4,
    10: 8,
  };
  const size = (typeSize[type] || 1) * count;
  const dataPos =
    size <= 4
      ? valueOffsetPos
      : tiffStart + view.getUint32(valueOffsetPos, littleEndian);

  try {
    if (type === 2) {
      return readAscii(view, dataPos, count);
    }
    if (type === 3) {
      return String(view.getUint16(dataPos, littleEndian));
    }
    if (type === 4) {
      return String(view.getUint32(dataPos, littleEndian));
    }
    if (type === 5 && count >= 1) {
      const numerator = view.getUint32(dataPos, littleEndian);
      const denominator = view.getUint32(dataPos + 4, littleEndian);
      return denominator ? (numerator / denominator).toFixed(4) : String(numerator);
    }
    return '(desteklenmeyen alan türü)';
  } catch {
    return '(okunamadı)';
  }
}

/**
 * Minimal, bağımlılıksız EXIF ayrıştırıcı.
 * Yalnızca JPEG dosyalarındaki APP1/Exif segmentini okur.
 * Amaç: yaygın alanları (cihaz, tarih, yazılım) göstermek —
 * profesyonel bir EXIF kütüphanesinin yerini tutmaz.
 */
function jpegExifCikar(buffer: ArrayBuffer): ExifBulgusu[] | null {
  const view = new DataView(buffer);
  if (view.getUint16(0) !== 0xffd8) return null; // JPEG değil

  let offset = 2;
  while (offset < view.byteLength - 1) {
    const marker = view.getUint16(offset);
    if (marker === 0xffe1) {
      const segmentStart = offset + 4;
      const exifHeader = readAscii(view, segmentStart, 4);
      if (exifHeader !== 'Exif') {
        offset += 2 + view.getUint16(offset + 2);
        continue;
      }
      const tiffStart = segmentStart + 6;
      const byteOrder = view.getUint16(tiffStart);
      const littleEndian = byteOrder === 0x4949;
      const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
      const ifdOffset = tiffStart + firstIfdOffset;
      const entryCount = view.getUint16(ifdOffset, littleEndian);

      const bulgular: ExifBulgusu[] = [];
      for (let i = 0; i < entryCount; i += 1) {
        const entryOffset = ifdOffset + 2 + i * 12;
        const tag = view.getUint16(entryOffset, littleEndian);
        const type = view.getUint16(entryOffset + 2, littleEndian);
        const count = view.getUint32(entryOffset + 4, littleEndian);
        const label = EXIF_ETIKETLERI[tag];
        if (!label) continue;
        const deger = ifdDegeriniOku(
          view,
          tiffStart,
          littleEndian,
          type,
          count,
          entryOffset + 8
        );
        if (deger && deger !== '(okunamadı)') {
          bulgular.push({ etiket: label, deger });
        }
      }
      return bulgular.length > 0 ? bulgular : [];
    }
    if ((marker & 0xff00) !== 0xff00) break;
    if (marker === 0xffd8 || marker === 0xffd9) {
      offset += 2;
      continue;
    }
    offset += 2 + view.getUint16(offset + 2);
  }
  return [];
}

/* ---------------------------- ELA ---------------------------- */

const ELA_MAX_BOYUT = 1200;
const ELA_KALITE = 0.9;
const ELA_YOGUNLUK_CARPANI = 12;

function imgYukle(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel yüklenemedi.'));
    img.src = src;
  });
}

/**
 * Error Level Analysis: görseli belirli bir JPEG kalitesinde yeniden
 * sıkıştırıp orijinaliyle piksel farkını abartarak görselleştirir.
 * Farklı sıkıştırma izi taşıyan bölgeler (örn. sonradan eklenmiş/
 * düzenlenmiş alanlar) daha parlak görünme eğilimindedir.
 * Bu KESİN bir sahtecilik kanıtı DEĞİLDİR, yalnızca dikkat çekici
 * bölgeleri işaret eden bir ön inceleme aracıdır.
 */
async function elaUret(dataUri: string): Promise<string> {
  const original = await imgYukle(dataUri);
  const scale = Math.min(1, ELA_MAX_BOYUT / Math.max(original.width, original.height));
  const width = Math.max(1, Math.round(original.width * scale));
  const height = Math.max(1, Math.round(original.height * scale));

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = width;
  baseCanvas.height = height;
  const baseCtx = baseCanvas.getContext('2d');
  if (!baseCtx) throw new Error('Canvas oluşturulamadı.');
  baseCtx.drawImage(original, 0, 0, width, height);
  const baseImageData = baseCtx.getImageData(0, 0, width, height);

  const recompressedDataUri = baseCanvas.toDataURL('image/jpeg', ELA_KALITE);
  const recompressed = await imgYukle(recompressedDataUri);

  const compCanvas = document.createElement('canvas');
  compCanvas.width = width;
  compCanvas.height = height;
  const compCtx = compCanvas.getContext('2d');
  if (!compCtx) throw new Error('Canvas oluşturulamadı.');
  compCtx.drawImage(recompressed, 0, 0, width, height);
  const compImageData = compCtx.getImageData(0, 0, width, height);

  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = width;
  resultCanvas.height = height;
  const resultCtx = resultCanvas.getContext('2d');
  if (!resultCtx) throw new Error('Canvas oluşturulamadı.');
  const resultImageData = resultCtx.createImageData(width, height);

  const a = baseImageData.data;
  const b = compImageData.data;
  const out = resultImageData.data;
  for (let i = 0; i < a.length; i += 4) {
    out[i] = Math.min(255, Math.abs(a[i] - b[i]) * ELA_YOGUNLUK_CARPANI);
    out[i + 1] = Math.min(255, Math.abs(a[i + 1] - b[i + 1]) * ELA_YOGUNLUK_CARPANI);
    out[i + 2] = Math.min(255, Math.abs(a[i + 2] - b[i + 2]) * ELA_YOGUNLUK_CARPANI);
    out[i + 3] = 255;
  }
  resultCtx.putImageData(resultImageData, 0, 0);
  return resultCanvas.toDataURL('image/png');
}

/* ---------------------------- ANA BİLEŞEN ---------------------------- */

export const SyMediaVerificationCore: React.FC<{
  medyaUrl?: string | null;
}> = ({ medyaUrl }) => {
  const [durum, setDurum] = useState<'BEKLIYOR' | 'ISLENIYOR' | 'TAMAMLANDI' | 'HATA'>(
    'BEKLIYOR'
  );
  const [sonuc, setSonuc] = useState<DogrulamaSonucu | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    let iptalEdildi = false;
    if (!medyaUrl) {
      setDurum('BEKLIYOR');
      setSonuc(null);
      setHata(null);
      return;
    }

    (async () => {
      setDurum('ISLENIYOR');
      setHata(null);
      try {
        const response = await fetch(medyaUrl);
        const blob = await response.blob();
        const isVideo = blob.type.startsWith('video/');
        const isJpeg = blob.type === 'image/jpeg' || blob.type === 'image/jpg';

        const sha256 = await dosyaHashi(blob);

        let exif: ExifBulgusu[] | null = null;
        let exifNotu = '';
        let elaDataUrl: string | null = null;
        let elaNotu = '';

        if (isVideo) {
          exifNotu = 'Video dosyaları için EXIF ayrıştırma bu sürümde desteklenmiyor.';
          elaNotu = 'ELA analizi yalnızca durağan görseller için uygulanabilir.';
        } else if (isJpeg) {
          const buffer = await blob.arrayBuffer();
          exif = jpegExifCikar(buffer);
          exifNotu =
            exif && exif.length > 0
              ? `${exif.length} EXIF alanı bulundu. Not: EXIF verisi kolayca düzenlenebilir/silinebilir; tek başına orijinallik kanıtı değildir.`
              : 'Bu dosyada okunabilir EXIF alanı bulunamadı (silinmiş, mobil uygulama tarafından temizlenmiş veya orijinalinde hiç olmamış olabilir).';

          try {
            const dataUri = await readBlobAsDataUri(blob);
            elaDataUrl = await elaUret(dataUri);
            elaNotu =
              'Parlak/farklı görünen bölgeler, farklı sıkıştırma geçmişine işaret edebilir. Bu KESİN bir sahtecilik kanıtı değildir — yalnızca daha yakından incelenmesi gereken alanları işaret eden bir ön tarama aracıdır.';
          } catch {
            elaNotu = 'ELA analizi bu görsel için oluşturulamadı.';
          }
        } else {
          exifNotu = 'EXIF ayrıştırma şu an yalnızca JPEG dosyaları için destekleniyor.';
          try {
            const dataUri = await readBlobAsDataUri(blob);
            elaDataUrl = await elaUret(dataUri);
            elaNotu =
              'Bu dosya JPEG olmadığı için (örn. PNG) ELA daha az anlamlı olabilir; PNG kayıpsız olduğundan farklar daha az güvenilirdir.';
          } catch {
            elaNotu = 'ELA analizi bu dosya türü için oluşturulamadı.';
          }
        }

        if (iptalEdildi) return;
        setSonuc({
          sha256,
          boyutBayt: blob.size,
          mimeTuru: blob.type || 'bilinmiyor',
          exif,
          exifNotu,
          elaDataUrl,
          elaNotu,
        });
        setDurum('TAMAMLANDI');
      } catch (error) {
        if (iptalEdildi) return;
        setHata(
          error instanceof Error ? error.message : 'Doğrulama sırasında bilinmeyen hata oluştu.'
        );
        setDurum('HATA');
      }
    })();

    return () => {
      iptalEdildi = true;
    };
  }, [medyaUrl]);

  return (
    <div
      style={{
        backgroundColor: '#070e1c',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '12px',
        color: '#fff',
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        marginTop: '10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          borderBottom: '1px solid #1e293b',
          paddingBottom: '6px',
          marginBottom: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '1rem' }}>🛡️</span>
          <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>
            ADLİ MEDYA DOĞRULAMA (SHA-256 / EXIF / ELA)
          </span>
        </div>
        {durum === 'ISLENIYOR' && (
          <span style={{ color: '#fbbf24' }}>İşleniyor...</span>
        )}
      </div>

      {!medyaUrl && (
        <div style={{ color: '#64748b', textAlign: 'center', padding: '8px' }}>
          Doğrulama için medya yükleyin.
        </div>
      )}

      {hata && (
        <div
          style={{
            padding: '9px',
            color: '#fca5a5',
            backgroundColor: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: '6px',
            lineHeight: 1.5,
          }}
        >
          {hata}
        </div>
      )}

      {sonuc && durum === 'TAMAMLANDI' && (
        <div style={{ display: 'grid', gap: '10px' }}>
          {/* DOSYA KİMLİĞİ */}
          <div
            style={{
              padding: '8px',
              backgroundColor: 'rgba(56,189,248,0.06)',
              border: '1px solid rgba(56,189,248,0.2)',
              borderRadius: '6px',
            }}
          >
            <div style={{ color: '#94a3b8', marginBottom: '4px' }}>DOSYA KİMLİĞİ</div>
            <div style={{ wordBreak: 'break-all', color: '#e2e8f0' }}>
              SHA-256: {sonuc.sha256}
            </div>
            <div style={{ color: '#94a3b8', marginTop: '4px' }}>
              Tür: {sonuc.mimeTuru} • Boyut: {(sonuc.boyutBayt / 1024).toFixed(1)} KB
            </div>
          </div>

          {/* EXIF */}
          <div
            style={{
              padding: '8px',
              backgroundColor: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: '6px',
            }}
          >
            <div style={{ color: '#fbbf24', marginBottom: '4px', fontWeight: 'bold' }}>
              EXIF META VERİSİ
            </div>
            {sonuc.exif && sonuc.exif.length > 0 ? (
              <div style={{ display: 'grid', gap: '2px' }}>
                {sonuc.exif.map((item) => (
                  <div key={item.etiket} style={{ color: '#e2e8f0' }}>
                    <strong style={{ color: '#cbd5e1' }}>{item.etiket}:</strong> {item.deger}
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ color: '#94a3b8', marginTop: '6px', lineHeight: 1.5 }}>
              {sonuc.exifNotu}
            </div>
          </div>

          {/* ELA */}
          <div
            style={{
              padding: '8px',
              backgroundColor: 'rgba(168,85,247,0.06)',
              border: '1px solid rgba(168,85,247,0.25)',
              borderRadius: '6px',
            }}
          >
            <div style={{ color: '#c084fc', marginBottom: '6px', fontWeight: 'bold' }}>
              ELA — HATA SEVİYESİ ANALİZİ
            </div>
            {sonuc.elaDataUrl ? (
              <img
                src={sonuc.elaDataUrl}
                alt="ELA analiz görüntüsü"
                style={{
                  width: '100%',
                  maxHeight: '260px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  backgroundColor: '#000',
                }}
              />
            ) : null}
            <div style={{ color: '#94a3b8', marginTop: '6px', lineHeight: 1.5 }}>
              {sonuc.elaNotu}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function readBlobAsDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Medya okunamadı.'));
    reader.onerror = () => reject(new Error('Medya okunamadı.'));
    reader.readAsDataURL(blob);
  });
}