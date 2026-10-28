/**
 * Utilitas Generator ID Berurut (Sequential Auto-Increment)
 * Meneruskan urutan ID yang sudah ada di database (Google Spreadsheet / Local)
 */

export function generateSequentialId(
  defaultPrefix: string,
  existingIds: (string | undefined | null)[],
  options: { defaultDigits?: number; defaultStart?: number } = {}
): string {
  const { defaultDigits = 3, defaultStart = 1 } = options;
  const validIds = existingIds.filter((id): id is string => Boolean(id && String(id).trim()));

  if (validIds.length === 0) {
    return `${defaultPrefix}-${String(defaultStart).padStart(defaultDigits, '0')}`;
  }

  let detectedPrefix = `${defaultPrefix}-`;
  let maxNumber = 0;
  let maxDigits = defaultDigits;

  for (const rawId of validIds) {
    const id = String(rawId).trim();
    // Cari bagian angka di akhir ID (misal: "own-005", "pet-12", "OWN_100", "q-1", "soap-001")
    const match = id.match(/^(.*?)(\d+)$/);
    if (match) {
      const prefixPart = match[1];
      const numberStr = match[2];
      const num = parseInt(numberStr, 10);
      if (!isNaN(num) && num >= maxNumber) {
        maxNumber = num;
        if (prefixPart) {
          detectedPrefix = prefixPart;
        }
        maxDigits = Math.max(maxDigits, numberStr.length);
      }
    }
  }

  const nextNumber = maxNumber > 0 ? maxNumber + 1 : defaultStart;

  // Bila nomor urut masih dalam digit standar (< 1.000.000), gunakan zero padding yang sesuai
  if (nextNumber < 1000000) {
    return `${detectedPrefix}${String(nextNumber).padStart(maxDigits, '0')}`;
  }

  return `${detectedPrefix}${nextNumber}`;
}

/**
 * Generator nomor tiket antrean harian berurut (misal: A-01, A-02, REG-01)
 */
export function generateNextTicketNumber(
  prefix: 'A' | 'REG' | 'G' | 'H',
  existingTickets: string[]
): string {
  const prefixPattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  let maxNum = 0;

  existingTickets.forEach((t) => {
    const match = String(t || '').trim().match(prefixPattern);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });

  const nextNum = maxNum + 1;
  return `${prefix}-${String(nextNum).padStart(2, '0')}`;
}
