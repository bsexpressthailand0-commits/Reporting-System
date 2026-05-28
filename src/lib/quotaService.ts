import { db } from './firebase';
import { doc, getDoc, setDoc, increment, serverTimestamp } from 'firebase/firestore';
import dayjs from 'dayjs';

export const QUOTA_LIMITS = {
  reads: 50000,
  writes: 20000,
  deletes: 20000,
  storageMb: 1024 // 1GB
};

export interface QuotaData {
  date: string;
  reads: number;
  writes: number;
  deletes: number;
}

export async function getDailyQuota(): Promise<QuotaData> {
  const todayDate = dayjs().format('YYYY-MM-DD');
  const docRef = doc(db, 'systemStats', 'quota_' + todayDate);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as QuotaData;
    } else {
      const defaultData = {
        date: todayDate,
        reads: 0,
        writes: 0,
        deletes: 0,
        updatedAt: serverTimestamp()
      };
      await setDoc(docRef, defaultData);
      return defaultData as QuotaData;
    }
  } catch (e) {
    console.warn("Failed to get quota document", e);
    return {
      date: todayDate,
      reads: 0,
      writes: 0,
      deletes: 0
    };
  }
}

export async function trackQuotaUsage(type: 'reads' | 'writes' | 'deletes', count: number) {
  if (count <= 0) return;
  const todayDate = dayjs().format('YYYY-MM-DD');
  const docRef = doc(db, 'systemStats', 'quota_' + todayDate);
  try {
    const updateData: any = { updatedAt: serverTimestamp() };
    updateData[type] = increment(count);
    // Use merge to update or create
    await setDoc(docRef, updateData, { merge: true });
  } catch (e) {
    console.warn("Failed to track quota usage", e);
  }
}
