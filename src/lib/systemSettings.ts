import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function getCachedCompanyInfo() {
  const cacheKey = 'bs_company_info';
  const cached = localStorage.getItem(cacheKey);
  
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      localStorage.removeItem(cacheKey);
    }
  }

  try {
    const docSnap = await getDoc(doc(db, 'systemSettings', 'company'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    }
  } catch (error) {
    console.error('Failed to fetch company info from Firestore', error);
  }
  return null;
}

export function clearCompanyInfoCache() {
  localStorage.removeItem('bs_company_info');
}
