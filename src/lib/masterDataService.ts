import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { MasterData, MasterDataItem } from './MasterDataContext';

/**
 * Validates master data entries for correctness.
 */
export const masterDataService = {
  /**
   * Check for empty/blank values in a list of master data items.
   * Forbids blank labels.
   */
  validateNotBlank(items: MasterDataItem[]): { isValid: boolean; message?: string } {
    for (const item of items) {
      if (!item.label || item.label.trim() === '') {
        return {
          isValid: false,
          message: 'พบชื่อตัวเลือกที่เป็นค่าว่าง กรุณากรอกชื่อตัวเลือกให้ถูกต้อง'
        };
      }
    }
    return { isValid: true };
  },

  /**
   * Check for duplicate names in a list of master data items.
   * Enforces name uniqueness.
   */
  validateNoDuplicateNames(items: MasterDataItem[]): { isValid: boolean; message?: string } {
    const seen = new Set<string>();
    for (const item of items) {
      const normalized = item.label.trim().toLowerCase();
      if (seen.has(normalized)) {
        return {
          isValid: false,
          message: `พบชื่อกลุ่มซ้ำ: "${item.label}" กรุณาแก้ไขไม่ให้ชื่อกลุ่มซ้ำกัน`
        };
      }
      seen.add(normalized);
    }
    return { isValid: true };
  },

  /**
   * Checks if a specified report branch group is currently assigned to any branches in the branchMappings collection.
   * Returns a count of utilizing branches.
   */
  async checkGroupUsageCount(groupLabel: string): Promise<number> {
    try {
      const q = collection(db, 'branchMappings');
      const snap = await getDocs(q);
      let count = 0;
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.reportBranchGroup === groupLabel) {
          count++;
        }
      });
      return count;
    } catch (error) {
      console.warn('Failed to check group usage count:', error);
      return 0;
    }
  },

  /**
   * Log info for debugging and analysis.
   */
  log(event: string, meta?: any) {

  }
};
