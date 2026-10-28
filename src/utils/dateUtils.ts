/**
 * Date & Time Utility for Vier Pet Care
 * Provides standard, accurate date and time formatting for Google Spreadsheet & UI display.
 */

/**
 * Returns formatted registration timestamp containing both date and time:
 * Format: "YYYY-MM-DD HH:mm:ss" (e.g., "2026-09-22 14:35:10")
 * Selalu menggunakan zona waktu Waktu Indonesia Barat (WIB, Asia/Jakarta, UTC+7).
 */
export function getRegistrationTimestamp(date: Date = new Date()): string {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const m: Record<string, string> = {};
  parts.forEach((p) => {
    m[p.type] = p.value;
  });

  return `${m.year}-${m.month}-${m.day} ${m.hour}:${m.minute}:${m.second}`;
}

/**
 * Formats a date string or timestamp for readable Indonesian display:
 * Example: "22/09/2026 14:35 WIB"
 */
export function formatDateTimeDisplay(val?: string | null): string {
  if (!val || typeof val !== 'string' || !val.trim()) return '-';
  const clean = convertAmPmTo24h(val.trim());

  // If already in "YYYY-MM-DD HH:mm:ss" format
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(clean)) {
    const [datePart, timePart] = clean.split(' ');
    const [y, m, d] = datePart.split('-');
    const [hh, mm] = timePart.split(':');
    return `${d}/${m}/${y} ${hh}:${mm} WIB`;
  }

  // If ISO string like "2026-09-22T07:00:00.000Z"
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(parsed);
    const m: Record<string, string> = {};
    parts.forEach((p) => {
      m[p.type] = p.value;
    });
    return `${m.day}/${m.month}/${m.year} ${m.hour}:${m.minute} WIB`;
  }

  return clean;
}

/**
 * Checks if a date string / timestamp belongs to today in WIB (Asia/Jakarta).
 */
export function isToday(val?: string | null): boolean {
  if (!val || typeof val !== 'string' || !val.trim()) return true;
  const clean = val.trim();
  
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayYMD = formatter.format(now);
  const [todayY, todayM, todayD] = todayYMD.split('-').map(Number);

  // Match YYYY-MM-DD
  const matchYMD = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchYMD) {
    const y = parseInt(matchYMD[1], 10);
    const m = parseInt(matchYMD[2], 10);
    const d = parseInt(matchYMD[3], 10);
    return y === todayY && m === todayM && d === todayD;
  }

  // Match DD/MM/YYYY
  const matchDMY = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (matchDMY) {
    const d = parseInt(matchDMY[1], 10);
    const m = parseInt(matchDMY[2], 10);
    const y = parseInt(matchDMY[3], 10);
    return y === todayY && m === todayM && d === todayD;
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const parts = formatter.formatToParts(parsed);
    const m: Record<string, string> = {};
    parts.forEach((p) => {
      m[p.type] = p.value;
    });
    return (
      parseInt(m.year, 10) === todayY &&
      parseInt(m.month, 10) === todayM &&
      parseInt(m.day, 10) === todayD
    );
  }

  return true;
}

/**
 * Extracts just the time portion "HH:mm WIB" from a timestamp string or returns current time in WIB
 */
export function formatTimeOnly(val?: string | null): string {
  if (!val) {
    const now = new Date();
    return (
      now.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }) + ' WIB'
    );
  }

  // Bersihkan dan ubah format AM/PM jika ada ke format 24 jam
  const clean = convertAmPmTo24h(val.trim());

  if (clean.includes('WIB')) {
    const match = clean.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*WIB/);
    if (match) {
      const parts = match[1].split(':');
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')} WIB`;
    }
    return clean;
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')} WIB`;
  }

  if (clean.includes(' ')) {
    const timePart = clean.split(' ')[1];
    if (timePart) {
      const parts = timePart.split(':');
      if (parts.length >= 2) {
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')} WIB`;
      }
    }
  }

  const timeMatch = clean.match(/(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')} WIB`;
  }

  return clean;
}

/**
 * Sanitizes and converts any datetime string containing AM/PM to 24-hour format.
 * E.g., "22/09/2026 02:30:15 PM" -> "22/09/2026 14:30:15"
 */
export function convertAmPmTo24h(val?: string | null): string {
  if (!val || typeof val !== 'string') return val || '';
  const clean = val.trim();
  const upper = clean.toUpperCase();
  if (!upper.includes('AM') && !upper.includes('PM')) {
    return clean;
  }

  const timeRegex = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)/i;
  const match = clean.match(timeRegex);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const second = match[3] || '00';
    const ampm = match[4].toUpperCase();

    if (ampm === 'PM' && hour < 12) {
      hour += 12;
    } else if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }

    const hourStr = String(hour).padStart(2, '0');
    const hasSeconds = !!match[3];
    const newTime = `${hourStr}:${minute}${hasSeconds ? `:${second}` : ''}`;
    
    // Replace the matched time and AM/PM part
    let result = clean.replace(timeRegex, newTime).replace(/\s*(AM|PM)/gi, '').trim();
    // Keep WIB if it was there
    if (upper.includes('WIB') && !result.includes('WIB')) {
      result = `${result} WIB`;
    }
    return result;
  }

  return clean;
}

/**
 * Formats an expiration date string (e.g. "2027-06-30" or ISO string) to readable Indonesian format.
 * Example: "2027-06-30" or "2027-06-30T07:00:00.000Z" -> "30 Juni 2027"
 */
export function formatExpirationDate(val?: string | null): string {
  if (!val || typeof val !== 'string' || !val.trim()) return '-';
  const clean = val.trim();

  // If already in YYYY-MM-DD or containing it
  const matchYMD = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchYMD) {
    const y = matchYMD[1];
    const m = matchYMD[2];
    const d = parseInt(matchYMD[3], 10);
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const mIdx = parseInt(m, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${d} ${months[mIdx]} ${y}`;
    }
  }

  // Fallback for full ISO string
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const d = parsed.getDate();
    const mIdx = parsed.getMonth();
    const y = parsed.getFullYear();
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    if (mIdx >= 0 && mIdx < 12) {
      return `${d} ${months[mIdx]} ${y}`;
    }
  }

  return clean;
}

/**
 * Sanitizes any ISO date string to local "YYYY-MM-DD HH:mm:ss" format.
 * E.g., "2026-09-23T20:16:43.000Z" -> "2026-09-23 20:16:43" (local timezone)
 */
export function sanitizeIsoToLocalString(val?: any): any {
  if (typeof val !== 'string' || !val.trim()) return val;
  const clean = val.trim();

  // Check if it's a full ISO string (contains T and Z, or T and offset)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(clean)) {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      const hours = String(parsed.getHours()).padStart(2, '0');
      const minutes = String(parsed.getMinutes()).padStart(2, '0');
      const seconds = String(parsed.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
  }

  return val;
}

/**
 * Utility to parse any date string or ID timestamp into a numeric timestamp.
 */
export function parseDateToTimestamp(dateStr?: string | null, idStr?: string | null): number {
  if (dateStr) {
    const trimmed = String(dateStr).trim();
    // Native Date check
    const parsed = new Date(trimmed).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;

    // DD/MM/YYYY format parsing
    const dmY = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmY) {
      const day = parseInt(dmY[1], 10);
      const month = parseInt(dmY[2], 10) - 1;
      const year = parseInt(dmY[3], 10);
      const hours = dmY[4] ? parseInt(dmY[4], 10) : 0;
      const mins = dmY[5] ? parseInt(dmY[5], 10) : 0;
      const secs = dmY[6] ? parseInt(dmY[6], 10) : 0;
      const dt = new Date(year, month, day, hours, mins, secs).getTime();
      if (!isNaN(dt) && dt > 0) return dt;
    }
  }

  if (idStr) {
    const idMatch = String(idStr).match(/\d{10,13}/);
    if (idMatch) {
      const ts = parseInt(idMatch[0], 10);
      if (!isNaN(ts) && ts > 1000000000) return ts;
    }
  }

  return 0;
}

/**
 * Sort owners in descending order by registration date (Newest First).
 */
export function sortOwnersNewestFirst<T extends { registeredAt?: string; createdAt?: string; id?: string }>(owners: T[]): T[] {
  return [...owners].sort((a, b) => {
    const tA = parseDateToTimestamp(a.registeredAt || a.createdAt, a.id);
    const tB = parseDateToTimestamp(b.registeredAt || b.createdAt, b.id);
    return tB - tA;
  });
}

/**
 * Sort pets in descending order by registration date (Newest First).
 */
export function sortPetsNewestFirst<T extends { registeredAt?: string; createdAt?: string; id?: string }>(pets: T[]): T[] {
  return [...pets].sort((a, b) => {
    const tA = parseDateToTimestamp(a.registeredAt || a.createdAt, a.id);
    const tB = parseDateToTimestamp(b.registeredAt || b.createdAt, b.id);
    return tB - tA;
  });
}

/**
 * Sort medical records / SOAP in descending order by date (Newest First).
 */
export function sortSoapNewestFirst<T extends { date?: string; createdAt?: string; id?: string }>(soaps: T[]): T[] {
  return [...soaps].sort((a, b) => {
    const tA = parseDateToTimestamp(a.date || a.createdAt, a.id);
    const tB = parseDateToTimestamp(b.date || b.createdAt, b.id);
    return tB - tA;
  });
}
