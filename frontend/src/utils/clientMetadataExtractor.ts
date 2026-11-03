export interface ClientExtractedMetadata {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  formattedText: string;
  sourceTag: string;
}

const EXIF_REGEX = /(\d{4})[:\-/](\d{2})[:\-/](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

const formatFullDateTime = (
  y: number,
  m: number,
  d: number,
  h: number,
  min: number,
  sec: number
): string => {
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const hh = String(h).padStart(2, '0');
  const mi = String(min).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return `${dd}.${mm}.${String(y)}, godz. ${hh}:${mi}:${ss}`;
};

const parseExifString = (
  raw: string,
  sourceTag: string
): ClientExtractedMetadata | null => {
  const match = EXIF_REGEX.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1800 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    formattedText: formatFullDateTime(year, month, day, hour, minute, second),
    sourceTag,
  };
};

const readAsciiFromView = (
  view: DataView,
  start: number,
  maxLength: number
): string => {
  let out = '';
  const limit = Math.min(view.byteLength, start + maxLength);
  for (let i = start; i < limit; i++) {
    const code = view.getUint8(i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
};

const parseAllTiffSegmentDates = (
  view: DataView,
  tiffStart: number,
  tiffLength: number
): ClientExtractedMetadata[] => {
  const results: ClientExtractedMetadata[] = [];
  if (tiffStart + 8 > view.byteLength || tiffLength < 8) return results;
  const b0 = view.getUint8(tiffStart);
  const b1 = view.getUint8(tiffStart + 1);
  const littleEndian = b0 === 0x49 && b1 === 0x49;
  const bigEndian = b0 === 0x4d && b1 === 0x4d;
  if (!littleEndian && !bigEndian) return results;

  const isLe = littleEndian;
  const firstIfdOffset = view.getUint32(tiffStart + 4, isLe);
  const ifdPos = tiffStart + firstIfdOffset;
  if (ifdPos + 2 > view.byteLength) return results;

  let dateTimeOriginal: string | null = null;
  let dateTimeDigitized: string | null = null;
  let dateTimeModify: string | null = null;
  let exifSubIfdOffset = -1;

  const entriesCount = view.getUint16(ifdPos, isLe);
  for (let i = 0; i < entriesCount; i++) {
    const entryPos = ifdPos + 2 + i * 12;
    if (entryPos + 12 > view.byteLength) break;
    const tag = view.getUint16(entryPos, isLe);
    const valOffset = view.getUint32(entryPos + 8, isLe);

    if (tag === 0x8769) {
      exifSubIfdOffset = valOffset;
    } else if (tag === 0x9003) {
      dateTimeOriginal = readAsciiFromView(view, tiffStart + valOffset, 20);
    } else if (tag === 0x9004) {
      dateTimeDigitized = readAsciiFromView(view, tiffStart + valOffset, 20);
    } else if (tag === 0x0132) {
      dateTimeModify = readAsciiFromView(view, tiffStart + valOffset, 20);
    }
  }

  if (exifSubIfdOffset > 0 && tiffStart + exifSubIfdOffset + 2 <= view.byteLength) {
    const subPos = tiffStart + exifSubIfdOffset;
    const subCount = view.getUint16(subPos, isLe);
    for (let i = 0; i < subCount; i++) {
      const entryPos = subPos + 2 + i * 12;
      if (entryPos + 12 > view.byteLength) break;
      const tag = view.getUint16(entryPos, isLe);
      const valOffset = view.getUint32(entryPos + 8, isLe);
      if (tag === 0x9003) {
        dateTimeOriginal = readAsciiFromView(view, tiffStart + valOffset, 20);
      } else if (tag === 0x9004) {
        dateTimeDigitized = readAsciiFromView(view, tiffStart + valOffset, 20);
      } else if (tag === 0x0132) {
        dateTimeModify = readAsciiFromView(view, tiffStart + valOffset, 20);
      }
    }
  }

  if (dateTimeOriginal) {
    const parsed = parseExifString(
      dateTimeOriginal,
      'EXIF: Original Date Time (DateTimeOriginal – data wykonania)'
    );
    if (parsed) results.push(parsed);
  }
  if (dateTimeDigitized) {
    const parsed = parseExifString(
      dateTimeDigitized,
      'EXIF: Digitized Date Time (DateTimeDigitized – data digitalizacji)'
    );
    if (parsed) results.push(parsed);
  }
  if (dateTimeModify) {
    const parsed = parseExifString(
      dateTimeModify,
      'EXIF: Image Date Time (DateTime – data obrazu)'
    );
    if (parsed) results.push(parsed);
  }
  return results;
};

export const extractAllClientFileMetadata = async (
  file: File
): Promise<ClientExtractedMetadata[]> => {
  const options: ClientExtractedMetadata[] = [];

  try {
    if (typeof file.slice === 'function') {
      const slice = file.slice(0, 65536);
      if (typeof slice.arrayBuffer === 'function') {
        const buffer = await slice.arrayBuffer();
        const view = new DataView(buffer);

        if (
          view.byteLength > 14 &&
          view.getUint8(0) === 0xff &&
          view.getUint8(1) === 0xd8
        ) {
          let offset = 2;
          while (offset + 4 < view.byteLength) {
            if (view.getUint8(offset) !== 0xff) break;
            const marker = view.getUint8(offset + 1);
            if (marker === 0xda || marker === 0xd9) break;
            const segLen = view.getUint16(offset + 2, false);
            if (segLen < 2 || offset + 2 + segLen > view.byteLength) break;

            if (marker === 0xe1 && segLen >= 14) {
              const hdr = readAsciiFromView(view, offset + 4, 4);
              if (hdr === 'Exif') {
                const parsedList = parseAllTiffSegmentDates(view, offset + 10, segLen - 8);
                for (const p of parsedList) {
                  options.push(p);
                }
                if (options.length > 0) break;
              }
            }
            offset += 2 + segLen;
          }
        }

        if (options.length === 0) {
          const uint8 = new Uint8Array(buffer);
          let rawAscii = '';
          const scanLen = Math.min(uint8.length, 16384);
          for (let i = 0; i < scanLen; i++) {
            rawAscii += String.fromCharCode(uint8[i]);
          }
          const scanned = parseExifString(
            rawAscii,
            'EXIF: Original Date Time (osadzona w nagłówku)'
          );
          if (scanned) options.push(scanned);
        }
      }
    }
  } catch {
    // Fallback to file.lastModified below
  }

  if (file.lastModified && file.lastModified > 0) {
    const dt = new Date(file.lastModified);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    const d = dt.getDate();
    const h = dt.getHours();
    const min = dt.getMinutes();
    const sec = dt.getSeconds();
    options.push({
      year: y,
      month: m,
      day: d,
      hour: h,
      minute: min,
      second: sec,
      formattedText: formatFullDateTime(y, m, d, h, min, sec),
      sourceTag: 'Plik: Data modyfikacji (lastModified)',
    });
  }

  return options;
};

export const extractClientFileMetadata = async (
  file: File
): Promise<ClientExtractedMetadata | null> => {
  const all = await extractAllClientFileMetadata(file);
  return all[0] ?? null;
};