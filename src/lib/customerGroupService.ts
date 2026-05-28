import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface MasterDataItem {
  id: string;
  label: string;
  aliases: string[];
  isActive: boolean;
  order: number;
}

export interface MasterData {
  customerGroups: MasterDataItem[];
  reportBranchGroups: MasterDataItem[];
  areaTypes: MasterDataItem[];
  serviceChannels: MasterDataItem[];
  reportTypes: MasterDataItem[];
}

const DEFAULT_CUSTOMER_GROUPS = [
  "ไม่ระบุ",
  "CALLIN",
  "Drop point",
  "Online",
  "Booking",
  "Sale Driver",
  "RC งานเข้ารับ",
  "9 จังหวัด",
  "68 จังหวัด",
  "ทั่วประเทศ"
];

// Fallback for immediate UI render if not loaded yet
export function getCustomerGroupOptions(): string[] {
  try {
    const cached = localStorage.getItem('bs_master_data');
    if (cached) {
      const parsed = JSON.parse(cached) as MasterData;
      if (parsed.customerGroups) {
        return parsed.customerGroups.filter(g => g.isActive).sort((a,b) => a.order - b.order).map(g => g.label);
      }
    }
  } catch (e) {}
  return [...DEFAULT_CUSTOMER_GROUPS];
}

export function getFilterCustomerGroupOptions(): string[] {
  return ["ทั้งหมด", ...getCustomerGroupOptions()];
}

// In-memory cache for fast sync loops 
let memoryCache: MasterData | null = null;

export function clearMasterDataCache() {
  memoryCache = null;
}

function ensureMemoryCache(): MasterData | null {
  if (memoryCache) return memoryCache;
  const cached = localStorage.getItem('bs_master_data');
  if (cached) {
    try {
      memoryCache = JSON.parse(cached) as MasterData;
      return memoryCache;
    } catch (e) {}
  }
  return null;
}

export async function fetchMasterData(): Promise<MasterData> {
  const cached = ensureMemoryCache();
  if (cached) return cached;
  try {
    const docSnap = await getDoc(doc(db, 'systemSettings', 'masterData'));
    if (docSnap.exists()) {
      const data = docSnap.data() as MasterData;
      localStorage.setItem('bs_master_data', JSON.stringify(data));
      memoryCache = data;
      return data;
    }
  } catch(e) {}
  return { customerGroups: [], reportBranchGroups: [], areaTypes: [], serviceChannels: [], reportTypes: [] };
}

export function normalizeCustomerGroup(group?: string | null): string {
  if (!group || group.trim() === "") return "ไม่ระบุ";
  const trimmed = group.trim();
  const lower = trimmed.toLowerCase();
  
  ensureMemoryCache();
  // Use memory cache if available for aliases
  if (memoryCache && memoryCache.customerGroups) {
    for (const item of memoryCache.customerGroups) {
      if (item.label.toLowerCase() === lower || item.aliases.some(a => a.toLowerCase() === lower)) {
        return item.label;
      }
    }
    // Strict fallback to existing label
    const exact = memoryCache.customerGroups.find(g => g.label.toLowerCase() === lower);
    if (exact) return exact.label;
  }

  // Hardcoded fallback if no memory cache
  if (lower === "callin") return "CALLIN";
  if (lower === "drop point" || lower === "drop_point" || lower === "droppoint" || lower === "dp") return "Drop point";
  if (lower === "online") return "Online";
  if (lower === "booking" || lower === "bs_booking" || lower === "bs booking" || lower === "full_truck_load" || lower === "truck360" || lower === "ecommerce") return "Booking";
  if (lower === "sale driver" || lower === "saledriver" || lower === "sale_driver") return "Sale Driver";
  if (lower === "rc งานเข้ารับ" || lower === "rcงานเข้ารับ" || lower === "rc_pickup" || lower === "rc pickup") return "RC งานเข้ารับ";
  
  const existing = DEFAULT_CUSTOMER_GROUPS.find(g => g.toLowerCase() === lower);
  if (existing) return existing;

  return trimmed;
}

export function validateCustomerGroup(group: string): boolean {
  ensureMemoryCache();
  if (memoryCache && memoryCache.customerGroups) {
    // Also support checking active groups or all groups - usually we should check if they exist either active or inactive,
    // or both. Let's look at if they exist in the master list.
    return memoryCache.customerGroups.some(g => g.label === group);
  }
  return DEFAULT_CUSTOMER_GROUPS.includes(group);
}

