import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { useAuth } from './AuthContext';
import { clearMasterDataCache } from './customerGroupService';

export interface MasterDataItem {
  id: string;
  label: string;
  aliases: string[]; // For normalization
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

const DEFAULT_MASTER_DATA: MasterData = {
  customerGroups: [
    { id: 'cg_0', label: 'ไม่ระบุ', aliases: [], isActive: true, order: 0 },
    { id: 'cg_1', label: 'CALLIN', aliases: ['call in', 'call-in'], isActive: true, order: 1 },
    { id: 'cg_2', label: 'Drop point', aliases: ['drop_point', 'droppoint'], isActive: true, order: 2 },
    { id: 'cg_3', label: 'Online', aliases: ['ออนไลน์'], isActive: true, order: 3 },
    { id: 'cg_4', label: 'Booking', aliases: ['bs_booking', 'bs booking', 'full_truck_load', 'truck360', 'ecommerce'], isActive: true, order: 4 },
    { id: 'cg_5', label: 'Sale Driver', aliases: ['saledriver', 'sale_driver'], isActive: true, order: 5 },
    { id: 'cg_6', label: 'RC งานเข้ารับ', aliases: ['rcงานเข้ารับ', 'rc_pickup', 'rc pickup'], isActive: true, order: 6 },
    { id: 'cg_7', label: '9 จังหวัด', aliases: [], isActive: true, order: 7 },
    { id: 'cg_8', label: '68 จังหวัด', aliases: [], isActive: true, order: 8 },
    { id: 'cg_9', label: 'ทั่วประเทศ', aliases: [], isActive: true, order: 9 }
  ],
  reportBranchGroups: [
    { id: 'rb_0', label: 'ไม่ระบุ', aliases: [], isActive: true, order: 0 },
    { id: 'rb_1', label: 'DC0002 (DC พุทธมณฑลสาย5)', aliases: [], isActive: true, order: 1 },
    { id: 'rb_2', label: 'DC0003 (สาขาใต้ทางด่วน)', aliases: [], isActive: true, order: 2 },
    { id: 'rb_3', label: 'DC0051 (พุทธมณฑล สาย3)', aliases: [], isActive: true, order: 3 },
    { id: 'rb_4', label: 'เครือข่าย', aliases: [], isActive: true, order: 4 },
    { id: 'rb_5', label: 'งานเหมาคัน', aliases: [], isActive: true, order: 5 },
  ],
  areaTypes: [
    { id: 'at_0', label: 'ไม่ระบุ', aliases: [], isActive: true, order: 0 },
    { id: 'at_1', label: '9 จังหวัด', aliases: ['9_PROVINCES'], isActive: true, order: 1 },
    { id: 'at_2', label: '68 จังหวัด', aliases: ['68_PROVINCES'], isActive: true, order: 2 },
    { id: 'at_3', label: 'ทั่วประเทศ', aliases: ['ALL'], isActive: true, order: 3 },
  ],
  serviceChannels: [
    { id: 'sc_0', label: 'ไม่ระบุ', aliases: [], isActive: true, order: 0 },
    { id: 'sc_1', label: 'B2B', aliases: [], isActive: true, order: 1 },
    { id: 'sc_2', label: 'B2C', aliases: [], isActive: true, order: 2 }
  ],
  reportTypes: [
    { id: 'rt_0', label: 'ไม่ระบุ', aliases: [], isActive: true, order: 0 },
    { id: 'rt_1', label: 'รายได้หลัก', aliases: ['MAIN_REVENUE'], isActive: true, order: 1 },
    { id: 'rt_2', label: 'เครือข่าย', aliases: ['NETWORK'], isActive: true, order: 2 },
    { id: 'rt_3', label: 'งานเหมา', aliases: ['FULL_TRUCK'], isActive: true, order: 3 }
  ]
};

interface MasterDataContextType {
  masterData: MasterData;
  loading: boolean;
  saveMasterData: (newData: MasterData) => Promise<void>;
}

const MasterDataContext = createContext<MasterDataContextType | null>(null);

export function MasterDataProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [masterData, setMasterData] = useState<MasterData>(DEFAULT_MASTER_DATA);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading && !user) setLoading(false);
      return;
    }

    let unsubscribe: () => void;
    
    async function initData() {
      try {
        // Try to load from cache first for immediate UI
        const cacheKey = 'bs_master_data';
        const cacheTimeKey = `${cacheKey}_time`;
        const cached = localStorage.getItem(cacheKey);
        const cachedTime = localStorage.getItem(cacheTimeKey);
        
        // Cache for 24 hours
        const isFresh = cachedTime && (Date.now() - Number(cachedTime)) < 24 * 60 * 60 * 1000;

        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            setMasterData(parsed);

            if (isFresh) {
              setLoading(false);
            }
          } catch (e) {
            localStorage.removeItem(cacheKey);
            localStorage.removeItem(cacheTimeKey);
          }
        }

        const docRef = doc(db, 'systemSettings', 'masterData');
        
        // Real-time listener keeps data dynamic across pages and screens instantly
        unsubscribe = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as MasterData;


            
            setMasterData(data);
            
            // Sync cache
            localStorage.setItem(cacheKey, JSON.stringify(data));
            localStorage.setItem(cacheTimeKey, Date.now().toString());
            
            // Clear cache for other parts
            clearMasterDataCache();
            
            // Invalidate sessionStorage configurations for report center to ensure refetch
            Object.keys(sessionStorage).forEach(key => {
              if (key.startsWith('report_')) {
                sessionStorage.removeItem(key);
              }
            });


          }
          setLoading(false);
        }, (error) => {
          console.warn('[DEBUG] Firestore subscription error:', error);
          setLoading(false);
        });

      } catch (error) {
        console.warn('Failed to fetch master data (silent fallback):', error);
        setLoading(false);
      }
    }
    
    initData();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, authLoading]);

  const saveMasterData = async (newData: MasterData) => {
    try {
      const docRef = doc(db, 'systemSettings', 'masterData');
      await setDoc(docRef, newData);
      
      // Update local state to trigger component re-render in active tabs
      setMasterData(newData);
      
      // Sync cache items
      const cacheKey = 'bs_master_data';
      const cacheTimeKey = `${cacheKey}_time`;
      localStorage.setItem(cacheKey, JSON.stringify(newData));
      localStorage.setItem(cacheTimeKey, Date.now().toString());

      // Clear memoryCache for direct importers/helpers
      clearMasterDataCache();
      
      // Force clear report center query caches
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('report_')) {
          sessionStorage.removeItem(key);
        }
      });


    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'systemSettings/masterData');
    }
  };

  return (
    <MasterDataContext.Provider value={{ masterData, loading, saveMasterData }}>
      {children}
    </MasterDataContext.Provider>
  );
}

export function useMasterDataContext() {
  const context = useContext(MasterDataContext);
  if (!context) {
    throw new Error('useMasterDataContext must be used within MasterDataProvider');
  }
  return context;
}

// Helper Hooks
export function useCustomerGroups() {
  const { masterData } = useMasterDataContext();
  return useMemo(() => {
    return masterData.customerGroups.filter(g => g.isActive).sort((a,b) => a.order - b.order);
  }, [masterData.customerGroups]);
}

export function useReportBranchGroups() {
  const { masterData } = useMasterDataContext();
  return useMemo(() => {
    return masterData.reportBranchGroups.filter(g => g.isActive).sort((a,b) => a.order - b.order);
  }, [masterData.reportBranchGroups]);
}

// Added Hooks for direct clean consumption
export function useMasterData() {
  const { masterData, loading } = useMasterDataContext();
  return { masterData, loading };
}

export function useBranchGroups() {
  const { masterData } = useMasterDataContext();
  return useMemo(() => {
    return masterData.reportBranchGroups.filter(g => g.isActive).sort((a,b) => a.order - b.order);
  }, [masterData.reportBranchGroups]);
}

// Normalization function decoupled from hook for non-hook usage (e.g., import script)
// Note: for server/background scripts it might need fresh fetch, but in UI we can rely on context
export function resolveReportBranchGroup(rawValue: string | undefined | null, list: MasterDataItem[]): string {
  if (!rawValue) return 'ไม่ระบุ';
  const trimmed = rawValue.trim().replace(/\s+/g, ' ');
  const lower = trimmed.toLowerCase();

  for (const item of list) {
    if (item.label.trim().replace(/\s+/g, ' ').toLowerCase() === lower) {

      return item.label;
    }
    const matchedAlias = item.aliases.find(a => a.trim().replace(/\s+/g, ' ').toLowerCase() === lower);
    if (matchedAlias) {

      return item.label;
    }
  }


  return rawValue;
}

export function normalizeWithMasterData(value: string | undefined | null, list: MasterDataItem[], fallback = 'ไม่ระบุ') {
  if (!value || value.trim() === '') return fallback;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  // Try exact match or alias
  for (const item of list) {
    if (item.label.toLowerCase() === lower || item.aliases.some(a => a.toLowerCase() === lower)) {
      return item.label; // return canonical label
    }
  }

  // Fallback to exact match just in case
  const existing = list.find(g => g.label.toLowerCase() === lower);
  if (existing) return existing.label;

  return trimmed;
}
