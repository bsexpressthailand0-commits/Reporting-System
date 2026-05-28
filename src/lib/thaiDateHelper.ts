export function parseThaiDate(value: any): Date | null {
  if (!value) return null;

  // If it's a Firestore Timestamp or Date object
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();

  const text = String(value).trim();

  // Match DD/MM/YYYY or DD-MM-YYYY
  const match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);

  if (match) {
    let day = Number(match[1]);
    let month = Number(match[2]);
    let year = Number(match[3]);

    // Convert Buddhist Era to Christian Era
    if (year > 2400) {
      year = year - 543;
    }

    return new Date(year, month - 1, day);
  }

  // Fallback to JS Date parsing
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d;
  }

  return null;
}

export function formatDateKey(value: any): string {
  const d = parseThaiDate(value);

  if (!d) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export async function reprocessThaiDatesInFirestore(onProgress?: (current: number, total: number) => void) {
  const { db } = await import('./firebase');
  const { collection, getDocs, doc, writeBatch, query, limit } = await import('firebase/firestore');

  const qShip = query(collection(db, 'shipments'), limit(1000));
  const snapShip = await getDocs(qShip);
  const shipmentsData = snapShip.docs.map(d => ({ id: d.id, ...d.data() }));

  if (onProgress) onProgress(0, shipmentsData.length);

  const BATCH_SIZE = 400;
  let batch = writeBatch(db);
  let opCount = 0;
  let currentIdx = 0;
  let updatedRows = 0;

  for (const s of shipmentsData as any[]) {
    let needsUpdate = false;
    let up: any = {};

    // check orderDate
    if (s.orderDateRaw) {
      const d = parseThaiDate(s.orderDateRaw);
      if (d && formatDateKey(s.orderDateRaw) !== s.orderDateKey) {
        up.orderDate = d;
        up.orderDateKey = formatDateKey(d);
        needsUpdate = true;
      }
    } else if (typeof s.orderDate === 'string' && s.orderDate.match(/\d{4}/)) {
      // old format might be a string with BE year
      const d = parseThaiDate(s.orderDate);
      if (d) {
        up.orderDateRaw = s.orderDate;
        up.orderDate = d;
        up.orderDateKey = formatDateKey(d);
        needsUpdate = true;
      }
    }

    // check createdDate
    if (s.createdDateRaw) {
      const d = parseThaiDate(s.createdDateRaw);
      if (d && formatDateKey(s.createdDateRaw) !== s.createdDateKey) {
        up.createdDate = d;
        up.createdDateKey = formatDateKey(d);
        needsUpdate = true;
      }
    } else if (typeof s.createdDate === 'string' && s.createdDate.match(/\d{4}/)) {
      const d = parseThaiDate(s.createdDate);
      if (d) {
        up.createdDateRaw = s.createdDate;
        up.createdDate = d;
        up.createdDateKey = formatDateKey(d);
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      batch.update(doc(db, 'shipments', s.id), up);
      opCount++;
      updatedRows++;
    }

    currentIdx++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
      if (onProgress) onProgress(currentIdx, shipmentsData.length);
    }
  }

  if (opCount > 0) {
    await batch.commit();
    if (onProgress) onProgress(currentIdx, shipmentsData.length);
  }

  return updatedRows;
}
