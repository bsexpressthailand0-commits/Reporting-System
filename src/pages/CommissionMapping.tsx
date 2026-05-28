import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useMasterDataContext } from '../lib/MasterDataContext';
import { db } from '../lib/firebase';
import CompactCompanyHeader from '../components/CompactCompanyHeader';
import { CommissionRateInput, CommissionPreviewCard, MappingValidation } from '../components/commission/SharedCommissionComponents';
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch, serverTimestamp, query, limit, orderBy, startAfter, deleteField, getCountFromServer, where } from 'firebase/firestore';
import { Search, Plus, Edit2, Trash2, Save, X, RefreshCw, Upload, FileSignature, PlayCircle, AlertCircle, CheckCircle, Info, HelpCircle, Activity, Archive, Copy, Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileDown, Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { OperationType, handleFirestoreError } from '../lib/firebase';
import type { CommissionMapping } from '../lib/commissionMapping';
import { 
  normalizeText, 
  enrichShipmentWithCommissionMapping, 
  getCachedCommissionMappings, 
  clearCommissionMappingCache, 
  resolveReportType, 
  parsePercentageRate,
  parseCommissionRate,
  triggerReprocessCommission,
  formatCommissionRate,
  createAuditLog,
  recalculateAllMappingUsages
} from '../lib/commissionMapping';
import { getCustomerGroupOptions, getFilterCustomerGroupOptions, validateCustomerGroup } from '../lib/customerGroupService';

export interface CommissionMappingForm {
  id?: string;
  branchCode: string;
  senderNameInput: string;
  senderNames?: string[];
  senderNameText?: string;
  areaType: 'ALL' | '9_PROVINCES' | '68_PROVINCES';
  commissionRate9?: number;
  commissionRate68?: number;
  commissionRate9Raw: string;
  commissionRate68Raw: string;
  reportType: string;
  supervisor: string;
  customerGroup: string;
  deliveryLine: string;
  team: string;
  area: string;
  accountingTeam: string;
  bsBookingReferral: string;
  commissionRateRaw?: string;
}

const isValueEmpty = (val: any) => {
  return val === undefined || val === null || String(val).trim() === '';
};

// Beautiful styling colors for report type badges
function getReportTypeBadge(type: string) {
  const norm = String(type || "").trim().toUpperCase();
  if (norm === "DROP_POINT") {
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200 uppercase tracking-wider">Drop Point</span>;
  }
  if (norm === "CALLIN") {
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200 uppercase tracking-wider">CALLIN</span>;
  }
  if (norm === "RC_PICKUP" || norm === "RC งานเข้ารับ") {
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 uppercase tracking-wider">RC งานเข้ารับ</span>;
  }
  if (norm === "ONLINE") {
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-secondary-50 text-secondary-700 border border-secondary-200 uppercase tracking-wider">ONLINE</span>;
  }
  if (norm === "SALE_DRIVER" || norm === "SALE DRIVER") {
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">SALE DRIVER</span>;
  }
  if (norm === "FULL_TRUCK_LOAD") {
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200 uppercase tracking-wider">Full Truck Load</span>;
  }
  if (norm === "ECOMMERCE") {
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-50 text-pink-700 border border-pink-200 uppercase tracking-wider">E-Commerce</span>;
  }
  if (norm === "TRUCK360") {
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 uppercase tracking-wider">Truck 360</span>;
  }
  return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">{type || '-'}</span>;
}

// Function to compute duplicate statuses and shipment match counts
const computeMappingStatuses = (mappingsList: any[], shipmentsList: any[]) => {
  const branchCodeCounts: Record<string, number> = {};
  mappingsList.forEach(m => {
    const code = normalizeText(m.branchCode);
    if (code) {
      branchCodeCounts[code] = (branchCodeCounts[code] || 0) + 1;
    }
  });

  const mappingMatchCounts: Record<string, number> = {};
  const mappingLastUsedDate: Record<string, string> = {};

  // Map representation of mapping records for optimized fast indexing
  const mappingKeys = mappingsList.map(m => {
    const names = [...(m.senderNames || [])];
    if (m.senderName && !names.includes(m.senderName)) names.push(m.senderName);
    
    return {
      id: m.id,
      branchCodeNorm: normalizeText(m.branchCode),
      senderNamesNorm: names.map((n: string) => normalizeText(n))
    };
  });

  shipmentsList.forEach(s => {
    const sSenderName = normalizeText(s.senderName);
    const sBranchName = normalizeText(s.branchName);
    const sMappedBranchCode = normalizeText(s.mappedBranchCode);
    const sBranchCode = normalizeText(s.branchCode);

    let matchedId = "";

    // 1) Match primarily by branchCode
    const matchedByCode = mappingKeys.find(mk => 
      mk.branchCodeNorm && (mk.branchCodeNorm === sMappedBranchCode || mk.branchCodeNorm === sBranchCode)
    );

    if (matchedByCode) {
      // If branch matches, verify sender names if restricted
      if (matchedByCode.senderNamesNorm.length === 0) {
        matchedId = matchedByCode.id;
      } else {
        const isSenderMatched = matchedByCode.senderNamesNorm.some(name => 
          name === sSenderName || name === sBranchName
        );
        if (isSenderMatched) {
          matchedId = matchedByCode.id;
        }
      }
    }

    if (!matchedId) {
      // 2) Fallback to searching all mappings for senderName
      const matchedByName = mappingKeys.find(mk => 
        mk.senderNamesNorm.some(name => 
          name === sSenderName || name === sBranchName
        )
      );
      if (matchedByName) {
        matchedId = matchedByName.id;
      }
    }

    if (matchedId) {
      mappingMatchCounts[matchedId] = (mappingMatchCounts[matchedId] || 0) + 1;

      const rawDate = s.orderDate || s.createdDate || s.shipmentDate || s.importDate || s.date || '';
      if (rawDate) {
        let dateStr = "";
        if (typeof rawDate === 'string') {
          dateStr = rawDate.slice(0, 10);
        } else if (rawDate && typeof rawDate.toDate === 'function') {
          dateStr = rawDate.toDate().toISOString().slice(0, 10);
        } else {
          dateStr = String(rawDate).slice(0, 10);
        }

        if (dateStr) {
          const currentLast = mappingLastUsedDate[matchedId] || '';
          if (!currentLast || dateStr > currentLast) {
            mappingLastUsedDate[matchedId] = dateStr;
          }
        }
      }
    }
  });

  return mappingsList.map(m => {
    const mapId = m.id;
    const count = mappingMatchCounts[mapId] || 0;
    const lastUsed = mappingLastUsedDate[mapId] || '';

    const extCode = normalizeText(m.branchCode);
    const isDup = extCode ? (branchCodeCounts[extCode] > 1) : false;

    let status = "unused"; // 🟡 Default to Unused
    if (isDup) {
      status = "duplicate"; // 🔴 Duplicate
    } else if (count > 0) {
      status = "active";    // 🟢 Active
    }

    return {
      ...m,
      matchedCount: count,
      status,
      lastUsedDate: lastUsed
    };
  });
};

function validateRateFormat(rawVal: any): { valid: boolean; value: number } {
  if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
    return { valid: true, value: 0 };
  }
  const text = String(rawVal).trim();
  let cleanText = text;
  if (text.endsWith('%')) {
    cleanText = text.slice(0, -1).trim();
  }
  
  if (cleanText.includes('%')) {
    return { valid: false, value: 0 };
  }

  const num = Number(cleanText.replace(/,/g, ""));
  if (isNaN(num)) {
    return { valid: false, value: 0 };
  }

  if (num < 0 || num > 100) {
    return { valid: false, value: 0 };
  }

  // Reject the old fraction formats like 0.006, 0.01
  if (num > 0 && num < 0.05) {
    return { valid: false, value: 0 };
  }

  return { valid: true, value: num };
}

export default function CommissionMapping() {
  const { isAdmin, isStaff, user } = useAuth();
  const { masterData } = useMasterDataContext();
  const [mappings, setMappings] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [usageStats, setUsageStats] = useState<Record<string, { usageCount: number; lastUsedAt: string | null }>>({});
  const [totalMappedShipments, setTotalMappedShipments] = useState(0);
  const [totalUnmappedShipments, setTotalUnmappedShipments] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearConfirmationText, setClearConfirmationText] = useState("");
  const [isClearing, setIsClearing] = useState(false);
  const [clearProgress, setClearProgress] = useState({ current: 0, total: 0 });
  
  // Filtering States
  const [searchTerm, setSearchTerm] = useState(() => {
    return new URLSearchParams(window.location.search).get('search') || '';
  });
  const [filterStatus, setFilterStatus] = useState('active_only');
  const [filterReportType, setFilterReportType] = useState('all');

  // Form Modal Edit / Add
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CommissionMappingForm>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [testShipping, setTestShipping] = useState<number>(1000);
  const [isCustomCustGroup, setIsCustomCustGroup] = useState(false);
  
  // Reprocessing Statuses
  const [isImporting, setIsImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    isOpen: boolean;
    allData: any[];
    newCount: number;
    duplicateCount: number;
    errorCount: number;
    duplicateList: any[];
  }>({
    isOpen: false,
    allData: [],
    newCount: 0,
    duplicateCount: 0,
    errorCount: 0,
    duplicateList: []
  });

  const [importStatus, setImportStatus] = useState({
    isOpen: false,
    step: '',
    progress: 0,
    totalRows: 0,
    processedRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as { row: number; msg: string }[]
  });

  const updateImportStatus = (patch: Partial<typeof importStatus>) => {
    setImportStatus(prev => ({ ...prev, ...patch }));
  };

  const [migrationState, setMigrationState] = useState<{
    isOpen: boolean;
    legacyRecords: any[];
    isMigrating: boolean;
    logs: string[];
  }>({
    isOpen: false,
    legacyRecords: [],
    isMigrating: false,
    logs: []
  });

  const checkLegacyData = () => {
    if (!isAdmin) {
      Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะ Admin เท่านั้นที่ตรวจแบบ Migrate ได้", "error");
      return;
    }
    const legacy = mappings.filter(m => {
      // Check if old keys are present
      const hasOldKeys = m.commissionRate9Provinces !== undefined || m.commissionRate68Provinces !== undefined || m.baseMultiplier !== undefined || m.actualMultiplier !== undefined || m.baseRateMultiplier !== undefined;
      
      // Check if rates in commissionRate9 / commissionRate68 are in old decimal representation (e.g. 0.01 instead of 1)
      const r9 = Number(m.commissionRate9 !== undefined ? m.commissionRate9 : (m.commissionRate9Provinces || 0));
      const r68 = Number(m.commissionRate68 !== undefined ? m.commissionRate68 : (m.commissionRate68Provinces || 0));
      const looksDecimal = (r9 > 0 && r9 <= 0.05) || (r68 > 0 && r68 <= 0.05); // usually anything 0.01, 0.006 are old decimals!
      
      return hasOldKeys || looksDecimal;
    });
    setMigrationState(prev => ({
      ...prev,
      isOpen: true,
      legacyRecords: legacy,
      logs: []
    }));
  };

  const runMigration = async () => {
    if (!isAdmin) {
      Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะ Admin เท่านั้นที่ตรวจแบบ Migrate ได้", "error");
      return;
    }
    setMigrationState(prev => ({ ...prev, isMigrating: true, logs: ["Starting migration..."] }));
    try {
      const batch = writeBatch(db);
      let count = 0;
      for (const m of migrationState.legacyRecords) {
        let r9 = m.commissionRate9 !== undefined ? Number(m.commissionRate9) : Number(m.commissionRate9Provinces || 0);
        let r68 = m.commissionRate68 !== undefined ? Number(m.commissionRate68) : Number(m.commissionRate68Provinces || 0);
        
        // Convert old decimal fraction format to percentตรง if needed
        if (r9 > 0 && r9 <= 0.05) {
          r9 = r9 * 100;
        }
        if (r68 > 0 && r68 <= 0.05) {
          r68 = r68 * 100;
        }

        const logMsg = `Migrating ID: ${m.id} | Rates 9,68: (${r9}%, ${r68}%)`;
        setMigrationState(prev => ({ ...prev, logs: [...prev.logs, logMsg] }));
        
        const ref = doc(db, 'commissionMappings', m.id);
        batch.update(ref, {
          commissionRate9: r9,
          commissionRate68: r68,
          commissionRate: r9, // backwards compatibility
          commissionRateRaw: String(r9), // backwards compatibility
          commissionRate9Provinces: deleteField(),
          commissionRate68Provinces: deleteField(),
          baseMultiplier: deleteField(),
          actualMultiplier: deleteField(),
          baseRateMultiplier: deleteField(),
          migrationNote: `Migrated to direct percentage format at ${new Date().toISOString()}`
        });
        count++;
      }
      
      if (count > 0) {
        await batch.commit();
        setMigrationState(prev => ({ ...prev, logs: [...prev.logs, `Successfully migrated ${count} records.`] }));
        
        await createAuditLog('RUN_MIGRATION_DECIMAL_FIX', { migratedCount: count }, user?.email);
        
        Swal.fire("Migration Success", `Migrated ${count} records. Please reprocess shipments to update commission calculations.`, "success");
        loadAllData();
      } else {
        setMigrationState(prev => ({ ...prev, logs: [...prev.logs, "No records to migrate."] }));
      }
    } catch (err: any) {
      console.error(err);
      setMigrationState(prev => ({ ...prev, logs: [...prev.logs, `Error: ${err.message}`] }));
      Swal.fire("Migration Error", err.message, "error");
    } finally {
      setMigrationState(prev => ({ ...prev, isMigrating: false }));
    }
  };

  const handleClearAllMappings = async () => {
    if (!isAdmin) {
      Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะ Admin เท่านั้นที่ล้างข้อมูลทั้งหมดได้", "error");
      return;
    }
    if (clearConfirmationText !== "ลบข้อมูล") {
      Swal.fire("ข้อผิดพลาด", "กรุณาพิมพ์คำว่า 'ลบข้อมูล' ให้ถูกต้องเพื่อยืนยัน", "error");
      return;
    }

    setIsClearing(true);
    setClearProgress({ current: 0, total: 0 });

    try {
      const snap = await getDocs(collection(db, 'commissionMappings'));
      const total = snap.docs.length;
      
      if (total === 0) {
        Swal.fire("ข้อมูลว่างเปล่า", "ไม่พบข้อมูลที่ต้องลบ", "info");
        setIsClearModalOpen(false);
        return;
      }

      setClearProgress({ current: 0, total });
      
      let processed = 0;
      let batch = writeBatch(db);
      let opCount = 0;
      
      for (const docSnap of snap.docs) {
        batch.delete(docSnap.ref);
        opCount++;
        processed++;
        
        if (opCount >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          opCount = 0;
          setClearProgress(prev => ({ ...prev, current: processed }));
        }
      }
      
      if (opCount > 0) {
        await batch.commit();
        setClearProgress(prev => ({ ...prev, current: processed }));
      }

      clearCommissionMappingCache();

      await createAuditLog('CLEAR_ALL_COMMISSION_MAPPINGS', { deletedCount: processed }, user?.email);

      await Swal.fire({
        title: "ลบข้อมูลสำเร็จ",
        text: `ลบ Commission Mapping ทั้งหมด ${processed} รายการเรียบร้อยแล้ว`,
        icon: "success"
      });

      setIsClearModalOpen(false);
      setClearConfirmationText("");
      setCurrentPage(1);
      loadAllData();
    } catch (err: any) {
      console.error("Failed to clear mappings", err);
      handleFirestoreError(err, OperationType.DELETE, 'commissionMappings');
      Swal.fire("เกิดข้อผิดพลาด", err.message || "ไม่สามารถลบข้อมูลได้", "error");
    } finally {
      setIsClearing(false);
    }
  };

  const [isReprocessing, setIsReprocessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    clearCommissionMappingCache();
    loadAllData();
  }, []);

  const loadAllData = async (forceRefresh = false) => {
    const shouldRefresh = forceRefresh === true || (typeof forceRefresh === 'object' && forceRefresh !== null);
    setLoading(true);
    if (shouldRefresh) setIsRefreshing(true);
    
    try {
      // 1. Fetch commission mappings (Using Cache or Refresh)
      if (shouldRefresh) {
        clearCommissionMappingCache();
        try {
          await recalculateAllMappingUsages();
        } catch (recalcErr) {
          console.warn("Failed to recalculate mapping usages in background:", recalcErr);
        }
      }
      
      const mappingsList = await getCachedCommissionMappings();
      setMappings(mappingsList);

      // 2. Fetch commission mapping usage from summarized collection
      const usageSnapshot = await getDocs(collection(db, 'commissionMappingUsage')).catch(err => {
        console.warn("Could not fetch commissionMappingUsage summary:", err);
        return { docs: [] } as any;
      });
      const usageMap: Record<string, { usageCount: number; lastUsedAt: string | null }> = {};
      usageSnapshot.docs.forEach((docSnap: any) => {
        const d = docSnap.data();
        if (d.mappingId) {
          usageMap[d.mappingId] = {
            usageCount: d.usageCount || 0,
            lastUsedAt: d.lastUsedAt || null
          };
        }
      });
      setUsageStats(usageMap);

      // 3. Fetch server-side counted total mapped and unmapped shipment stats (highly scalable!)
      try {
        const mappedSnap = await getCountFromServer(query(collection(db, 'shipments'), where('commissionMatched', '==', true)));
        setTotalMappedShipments(mappedSnap.data().count);

        const unmappedSnap = await getCountFromServer(query(collection(db, 'shipments'), where('commissionMatched', '==', false)));
        setTotalUnmappedShipments(unmappedSnap.data().count);
      } catch (countError) {
        console.warn("Failed to retrieve server counted results:", countError);
        const totalMappedSum = Object.values(usageMap).reduce((sum, item) => sum + item.usageCount, 0);
        setTotalMappedShipments(totalMappedSum);
        setTotalUnmappedShipments(0);
      }

    } catch (err) {
      console.error("Failed to load initial data", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Compute final elements
  const computedMappings = React.useMemo(() => {
    const branchCodeCounts: Record<string, number> = {};
    mappings.forEach(m => {
      const code = normalizeText(m.branchCode);
      if (code) {
        branchCodeCounts[code] = (branchCodeCounts[code] || 0) + 1;
      }
    });

    return mappings.map(m => {
      const mapId = m.id;
      const statsObj = usageStats[mapId] || { usageCount: 0, lastUsedAt: null };
      
      const extCode = normalizeText(m.branchCode);
      const isDup = extCode ? (branchCodeCounts[extCode] > 1) : false;

      let status = "unused";
      if (isDup) {
        status = "duplicate";
      } else if (statsObj.usageCount > 0) {
        status = "active";
      }

      return {
        ...m,
        matchedCount: statsObj.usageCount,
        status,
        lastUsedDate: statsObj.lastUsedAt || ''
      };
    });
  }, [mappings, usageStats]);

  // Stats memo has been moved after filteredMappings declaration to comply with block scope requirements

  // Reprocess all shipments in the database from current mapping masters
  const handleReprocess = async () => {
    if (!isStaff) {
      await Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะทาง Staff หรือ Admin เท่านั้นที่สั่งรีโมตประมวลผลได้", "error");
      return;
    }
    if (isReprocessing) return;
    
    const confirm = await Swal.fire({
      title: "คำนวณค่าคอมใหม่ทั้งหมด?",
      text: "ระบบจะดำเนินการจับคู่และคำนวณเงินค่าคอมมิชชั่นของทุกบิลใหม่อัตโนมัติ",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "เริ่มประมวลผล",
      cancelButtonText: "ยกเลิก"
    });

    if (!confirm.isConfirmed) return;
    
    setIsReprocessing(true);
    setProgress({ current: 0, total: 0 });
    setError("");
    setResult(null);

    Swal.fire({
      title: "กำลังคำนวณ...",
      text: "ระบบกำลังทำงานในโปรเซสความเร็วสูงด้วย Pagination ละเอียด กรุณาห้ามปิดหน้านี้",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const res = await triggerReprocessCommission((curr, tot) => {
        setProgress({ current: curr, total: tot });
      });
      
      setResult(res);

      await createAuditLog('REPROCESS_COMMISSIONS_ALL', {
        processedCount: res.processedRows || 0,
        mappedCount: res.mappedRows || 0
      }, user?.email);

      await Swal.fire({
        title: "คำนวณค่าคอมใหม่สำเร็จ",
        html: `
          <div style="text-align:left; font-size: 14px;">
            <p>ประมวลผลทั้งหมด: <b>${res.processedRows || 0}</b> รายการ</p>
            <p>จับคู่สำเร็จ: <b>${res.mappedRows || 0}</b> รายการ</p>
            <p>ยังไม่ได้คู่ (Unmapped): <b>${res.unmappedRows || 0}</b> รายการ</p>
            <p>อัปเดตลงเซิร์ฟเวอร์เรียบร้อย: <b>${res.updatedRows || 0}</b> รายการ</p>
          </div>
        `,
        icon: "success",
        confirmButtonText: "ตกลง"
      });

      loadAllData();
    } catch (e: any) {
      console.error("Batch reprocess error:", e);
      setError(e.message || "เกิดข้อผิดพลาด");
      await Swal.fire({
        title: "คำนวณค่าคอมไม่สำเร็จ",
        text: e.message || "กรุณาลองใหม่อีกครั้ง",
        icon: "error"
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  // Reprocess individual mapping matching shipments under this single mapping rule
  const handleReprocessSingleMapping = async (m: any) => {
    if (!isStaff) {
      await Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะ Staff หรือ Admin เท่านั้นที่สั่งปุ่มนี้ได้", "error");
      return;
    }
    setIsReprocessing(true);
    setProgress({ current: 0, total: 0 });
    try {
      Swal.fire({
        title: "กำลังตรวจสอบจับคู่เดี่ยว...",
        text: "กรุณารอระบบคำนวณเจาะลึกเฉพาะบิลที่สอดคล้องตามเงื่อนไขนี้สักครู่",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const PAGE_SIZE = 500;
      let lastDoc = null;
      let hasMore = true;
      let count = 0;
      let totalProcessed = 0;
      let singleLastUsedAt: string | null = null;

      while (hasMore) {
        let currentQuery = query(collection(db, 'shipments'), orderBy('__name__'), limit(PAGE_SIZE));
        if (lastDoc) {
          currentQuery = query(collection(db, 'shipments'), orderBy('__name__'), startAfter(lastDoc), limit(PAGE_SIZE));
        }

        const snapShip = await getDocs(currentQuery);
        if (snapShip.empty) {
          hasMore = false;
          break;
        }

        lastDoc = snapShip.docs[snapShip.docs.length - 1];
        const shipmentsBatch = snapShip.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

        let batch = writeBatch(db);
        let opCount = 0;

        for (const shipment of shipmentsBatch) {
          totalProcessed++;
          const sSenderName = normalizeText(shipment.senderName);
          const sBranchName = normalizeText(shipment.branchName);
          const sMappedBranchCode = normalizeText(shipment.mappedBranchCode);
          const sBranchCode = normalizeText(shipment.branchCode);

          const matchByCode = m.branchCode && (normalizeText(m.branchCode) === sMappedBranchCode || normalizeText(m.branchCode) === sBranchCode);
          
          let matchByName = false;
          const senderNames = m.senderNames || [];
          if (m.senderName && !senderNames.includes(m.senderName)) {
            senderNames.push(m.senderName);
          }
          
          if (senderNames.length > 0) {
            matchByName = senderNames.some((name: string) => {
              const n = normalizeText(name);
              return n === sSenderName || n === sBranchName;
            });
          }

          if (matchByCode || matchByName) {
            const enriched = enrichShipmentWithCommissionMapping(shipment, [m]);
            const dataToUpdate = { ...enriched };
            delete dataToUpdate.id;

            batch.update(doc(db, "shipments", shipment.id), dataToUpdate);
            count++;
            opCount++;

            // Track lastUsedAt for this single mapping
            const rawDate = shipment.orderDate || shipment.createdDate || shipment.shipmentDate || shipment.importDate || shipment.date || null;
            if (rawDate) {
              let dateStr = "";
              if (typeof rawDate === 'string') {
                dateStr = rawDate.slice(0, 10);
              } else if (rawDate && typeof rawDate.toDate === 'function') {
                dateStr = rawDate.toDate().toISOString().slice(0, 10);
              } else {
                dateStr = String(rawDate).slice(0, 10);
              }
              if (dateStr && (!singleLastUsedAt || dateStr > singleLastUsedAt)) {
                singleLastUsedAt = dateStr;
              }
            }

            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
        }

        if (opCount > 0) {
          await batch.commit();
        }

        setProgress({ current: totalProcessed, total: totalProcessed + (snapShip.docs.length < PAGE_SIZE ? 0 : PAGE_SIZE) });

        if (snapShip.docs.length < PAGE_SIZE) {
          hasMore = false;
        }
      }

      // Save stats to commissionMappingUsage collection!
      await setDoc(doc(db, 'commissionMappingUsage', m.id), {
        mappingId: m.id,
        usageCount: count,
        lastUsedAt: singleLastUsedAt,
        updatedAt: new Date()
      }, { merge: true });

      await createAuditLog('REPROCESS_COMMISSION_SINGLE', {
        mappingId: m.id,
        branchCode: m.branchCode,
        matchedCount: count
      }, user?.email);

      await Swal.fire({
        title: "อัปเดตเฉพาะรายการนี้สำเร็จ",
        text: `จับคู่ย้อนหลังและคำนวณค่าคอมสำหรับ Shipment ในฐานข้อมูลเรียบร้อยทั้งหมด ${count} รายการ (ตรวจสอบทั้งหมด ${totalProcessed} รายการ)`,
        icon: "success"
      });

      await loadAllData();
    } catch (e: any) {
      console.error(e);
      await Swal.fire({
        title: "อัปเดตล้มเหลว",
        text: e.message || "เกิดข้อผิดพลาดในการประมวลผลย้อนหลังรายทาง",
        icon: "error"
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  // Download Excel Template for Master Commission Mapping
  const downloadTemplate = () => {
    const data = [
      {
        'รหัสสาขา (BRANCH CODE)': 'BKK01',
        'ชื่อลูกค้า / ผู้ส่ง (SENDER NAME)': 'บริษัท ตัวอย่าง จำกัด',
        'หมวดประเภทรายงาน (REPORT TYPE)': 'Drop Point',
        'พื้นที่บริการ (AREA TYPE)': 'ALL',
        'ค่าคอม 9 จังหวัด (%)': '1.0',
        'ค่าคอม 68 จังหวัด (%)': '0.6',
        'ผู้ดูแล (SUPERVISOR)': 'คุณเอ',
        'กลุ่มลูกค้า (CUSTOMER GROUP)': 'กลุ่มลูกค้าอื่น',
        'สายส่ง (DELIVERY LINE)': 'สายกลาง',
        'ทีม (TEAM)': 'Team A',
        'ลงบัญชีทีม (ACCOUNTING TEAM)': 'บัญชีแยกย่อย',
        'ผู้แนะนำระบบ (BOOKING REFERRAL)': 'นายหน้า A'
      }
    ];

    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Master Commission Mapping");
      XLSX.writeFile(wb, "commission_mapping_template.xlsx");
    });
  };

  // Import mappings from Excel file with dry-run/preview
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isStaff) {
      await Swal.fire("สิทธิ์ไม่ถูกต้อง", "คุณไม่มีสิทธิ์นำเข้าข้อมูล (ต้องการระดับ Staff หรือ Admin)", "error");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus({
      isOpen: false, // Close progress if any was open
      step: 'กำลังวิเคราะห์ไฟล์...',
      progress: 0,
      totalRows: 0,
      processedRows: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    });

    try {
      const data = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

      const totalRows = json.length;
      
      // Load current mappings for comparison
      const snap = await getDocs(collection(db, 'commissionMappings'));
      const currentMappings = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      let preparedData: any[] = [];
      let newCount = 0;
      let duplicateCount = 0;
      let errorCount = 0;
      let duplicateList: any[] = [];
      let importErrors: { row: number; msg: string }[] = [];

      for (let i = 0; i < json.length; i++) {
        const row = json[i];
        const rowNum = i + 2;

        const rawSenderName = row['ชื่อลูกค้า / ผู้ส่ง (SENDER NAME)'] || row['ชื่อลูกค้า / สาขา (SENDER NAME)'] || '';
        const rawBranchCode = row['รหัสสาขา (BRANCH CODE)'];
        const rate9Raw = row['ค่าคอม 9 จังหวัด (%)'] || row['คอมเรตหลัก (COMMISSION RATE RAW / RAW)'];
        const rate68Raw = row['ค่าคอม 68 จังหวัด (%)'] || row['คอมเรตหลัก (COMMISSION RATE RAW / RAW)'];

        const branchCodeEmpty = isValueEmpty(rawBranchCode);

        if (branchCodeEmpty) {
          errorCount++;
          importErrors.push({ row: rowNum, msg: 'ไม่มี รหัสสาขา (BRANCH CODE)' });
          continue;
        }

        // Parse multiple sender names
        const namesSplit = String(rawSenderName)
          .split(/[,\/\n;]/)
          .map(n => n.trim())
          .filter(n => n !== "");
        
        const branchCode = String(rawBranchCode || '').trim();
        const areaType = String(row['พื้นที่บริการ (AREA TYPE)'] || 'ALL').trim().toUpperCase() as any;

        try {
          const val9 = validateRateFormat(rate9Raw);
          const val68 = validateRateFormat(rate68Raw);

          if (!val9.valid) {
            errorCount++;
            importErrors.push({ row: rowNum, msg: `ราคาสาขา 9 จังหวัด (${rate9Raw}) ไม่ถูกต้อง คาดหวังเปอร์เซ็นต์ตรงในช่วง 0-100 (เช่น 1 หรือ 1% หรือ 0.6 หรือ 0.6%) และปฏิเสธรูปแบบทศนิยมยกร้อยเดิม` });
            continue;
          }
          if (!val68.valid) {
            errorCount++;
            importErrors.push({ row: rowNum, msg: `ราคาสาขา 68 จังหวัด (${rate68Raw}) ไม่ถูกต้อง คาดหวังเปอร์เซ็นต์ตรงในช่วง 0-100 (เช่น 1 หรือ 1% หรือ 0.6 หรือ 0.6%) และปฏิเสธรูปแบบทศนิยมยกร้อยเดิม` });
            continue;
          }

          const parsedRate9 = val9.value;
          const parsedRate68 = val68.value;
          const rType = String(row['หมวดประเภทรายงาน (REPORT TYPE)'] || '').trim();
          
          // Duplicate check is based on branchCode and reportType!
          const existing = currentMappings.find(m => 
            normalizeText(m.branchCode) === normalizeText(branchCode) &&
            (m.reportType || '') === rType
          );

          const isDuplicate = !!existing;
          const id = rType ? `${branchCode}_${rType}` : branchCode;

          // Merge names if duplicate
          let finalNames = namesSplit;
          if (isDuplicate) {
             const existingNames = existing.senderNames || [];
             if (existing.senderName && !existingNames.includes(existing.senderName)) {
               existingNames.push(existing.senderName);
             }
             const combined = [...existingNames, ...namesSplit];
             finalNames = Array.from(new Set(combined.map(n => n.trim()).filter(n => n !== "")));
          }
          
          const mappingData: any = {
            id,
            isDuplicate,
            senderNames: finalNames,
            senderNameText: finalNames.join(', '),
            branchCode: branchCode,
            areaType: areaType,
            commissionRate9: parsedRate9,
            commissionRate68: parsedRate68,
            commissionRate: parsedRate9, // backwards compatibility
            commissionRateRaw: String(parsedRate9), // backwards compatibility
            reportType: rType,
            supervisor: String(row['ผู้ดูแล (SUPERVISOR)'] || '').trim(),
            customerGroup: String(row['กลุ่มลูกค้า (CUSTOMER GROUP)'] || '').trim(),
            deliveryLine: String(row['สายส่ง (DELIVERY LINE)'] || '').trim(),
            team: String(row['ทีม (TEAM)'] || '').trim(),
            accountingTeam: String(row['ลงบัญชีทีม (ACCOUNTING TEAM)'] || '').trim(),
            bsBookingReferral: String(row['ผู้แนะนำระบบ (BOOKING REFERRAL)'] || '').trim(),
          };

          preparedData.push(mappingData);
          if (isDuplicate) {
            duplicateCount++;
            if (duplicateList.length < 10) duplicateList.push(mappingData);
          } else {
            newCount++;
          }
        } catch (err: any) {
          errorCount++;
          importErrors.push({ row: rowNum, msg: err.message });
        }
      }

      setImportPreview({
        isOpen: true,
        allData: preparedData,
        newCount,
        duplicateCount,
        errorCount,
        duplicateList
      });

      // Update the detailed status errors as well for the UI
      updateImportStatus({ 
        totalRows, 
        errors: importErrors 
      });

    } catch (err: any) {
      console.error(err);
      Swal.fire("ข้อผิดพลาด", err.message || "ไม่สามารถประมวลผลไฟล์ได้", "error");
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const executeFinalImport = async (handling: 'update' | 'skip') => {
    if (!isStaff) {
      await Swal.fire("สิทธิ์ไม่ถูกต้อง", "คุณไม่มีสิทธิ์นำเข้าข้อมูล (ต้องการระดับ Staff หรือ Admin)", "error");
      return;
    }
    setImportPreview(prev => ({ ...prev, isOpen: false }));
    setIsImporting(true);
    setImportStatus({
      isOpen: true,
      step: 'เริ่มบันทึกข้อมูล...',
      progress: 0,
      totalRows: importPreview.allData.length,
      processedRows: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: importStatus.errors
    });

    try {
      const dataToImport = importPreview.allData.filter(d => {
        if (!d.isDuplicate) return true;
        return handling === 'update';
      });

      const skippedCount = importPreview.errorCount + (importPreview.duplicateCount > 0 && handling === 'skip' ? importPreview.duplicateCount : 0);

      const totalToImport = dataToImport.length;
      let created = 0;
      let updated = 0;

      for (let i = 0; i < totalToImport; i++) {
        const item = dataToImport[i];
        const progressPercent = Math.round(((i + 1) / totalToImport) * 100);

        updateImportStatus({
          step: `กำลังบันทึก ${i + 1} / ${totalToImport}`,
          progress: progressPercent,
          processedRows: i + 1,
          skipped: skippedCount
        });

        const mappingData = { ...item, updatedAt: serverTimestamp() };
        if (!item.isDuplicate) {
          mappingData.createdAt = serverTimestamp();
          created++;
        } else {
          updated++;
        }

        // Remove helper flags before saving
        const finalId = item.id;
        delete mappingData.id;
        delete mappingData.isDuplicate;

        await setDoc(doc(db, 'commissionMappings', finalId), mappingData, { merge: true });
        updateImportStatus({ created, updated });
      }

      await createAuditLog('IMPORT_EXCEL', {
        createdCount: created,
        updatedCount: updated,
        skippedCount
      }, user?.email);

      updateImportStatus({ step: 'บันทึกสำเร็จ กำลังรีโหลด...', progress: 100 });
      await loadAllData();
      updateImportStatus({ step: 'นำเข้าข้อมูล Excel เสร็จสิ้น' });
    } catch (err: any) {
      console.error(err);
      updateImportStatus({ step: `เกิดข้อผิดพลาด: ${err.message}` });
    } finally {
      setIsImporting(false);
    }
  };

  const handleEdit = (item: any) => {
    if (!isAdmin) {
      Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะทาง Admin เท่านั้นที่แก้ไขข้อมูลเงื่อนไขได้", "error");
      return;
    }
    setEditingId(item.id);
    setIsAdding(false);
    setEditForm({
      ...item,
      senderNameInput: item.senderNames?.join(', ') || item.senderName || '',
      commissionRate9Raw: String(item.commissionRate9 !== undefined ? item.commissionRate9 : (item.commissionRate9Provinces !== undefined ? item.commissionRate9Provinces : 0)),
      commissionRate68Raw: String(item.commissionRate68 !== undefined ? item.commissionRate68 : (item.commissionRate68Provinces !== undefined ? item.commissionRate68Provinces : 0))
    });
    const isCustom = false; // We use shared options now
    setIsCustomCustGroup(isCustom);
    setTestShipping(1000);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    if (!isAdmin) {
      Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะทาง Admin เท่านั้นที่เพิ่มข้อมูลเงื่อนไขใหม่ได้", "error");
      return;
    }
    setEditingId('new');
    setIsAdding(true);
    setEditForm({
      senderNameInput: '',
      senderNames: [],
      senderNameText: '',
      branchCode: '',
      areaType: 'ALL',
      commissionRate9: 0,
      commissionRate68: 0,
      commissionRate9Raw: '0',
      commissionRate68Raw: '0',
      supervisor: '',
      customerGroup: '',
      deliveryLine: '',
      team: '',
      accountingTeam: '',
      bsBookingReferral: '',
      reportType: ''
    });
    setIsCustomCustGroup(false);
    setTestShipping(1000);
    setIsModalOpen(true);
  };

  // Save changes to Firestore mapped records with automatic checks
  const handleSave = async () => {
    if (!isAdmin) {
      await Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะ Admin เท่านั้นที่บันทึกข้อมูลและประมวลผลตรงนี้ได้", "error");
      return;
    }

    // 1. Validation Branch Code requirement
    const trimmedCode = editForm.branchCode?.trim() || "";
    if (!trimmedCode) {
      await Swal.fire({
        title: "ข้อมูลไม่สมบูรณ์",
        text: "กรุณากรอก รหัสสาขา (Branch Code)",
        icon: "warning"
      });
      return;
    }

    const rate9 = parseCommissionRate(editForm.commissionRate9Raw);
    const rate68 = parseCommissionRate(editForm.commissionRate68Raw);
    const targetReportType = editForm.reportType || "";
    
    // 2. Validation unique branchCode + reportType
    const isDuplicate = mappings.some(m => 
      m.id !== editingId && 
      normalizeText(m.branchCode) === normalizeText(trimmedCode) &&
      (m.reportType || "") === targetReportType
    );
    if (isDuplicate) {
      await Swal.fire({
        title: "ค่าคอนฟิกซ้ำกัน",
        text: `มีเงื่อนไขสำหรับรหัสสาขา "${trimmedCode}" ${targetReportType ? `และกลุ่มรายงาน "${targetReportType}"` : ""} อยู่ในระบบแล้ว`,
        icon: "error"
      });
      return;
    }

    // 4. Validation bounds
    if (rate9 < 0 || rate68 < 0) {
      await Swal.fire({
        title: "ค่าคอมเรทติดลบ",
        text: "อัตราค่าคอมมิชชั่นห้ามต่ำกว่า 0%",
        icon: "error"
      });
      return;
    }
    if (rate9 > 100.0 || rate68 > 100.0) {
      await Swal.fire({
        title: "ค่าคอมเรทเกินกำหนด",
        text: "อัตราค่าคอมมิชชั่นห้ามเกิน 100%",
        icon: "error"
      });
      return;
    }

    if (editForm.customerGroup && !validateCustomerGroup(editForm.customerGroup)) {
      await Swal.fire({
        title: "กลุ่มลูกค้าไม่ถูกต้อง",
        text: `กลุ่มลูกค้า "${editForm.customerGroup}" ไม่ได้อยู่ในรายชื่อ Master Data`,
        icon: "error"
      });
      return;
    }

    try {
      const id = targetReportType ? `${trimmedCode}_${targetReportType}` : trimmedCode;
      const isEdit = editingId && editingId !== 'new';
      const isIdChanged = isEdit && editingId !== id;
      
      // Parse names from input
      const senderNames = (editForm.senderNameInput || "")
        .split(/[,\/\n;]/)
        .map((n: string) => n.trim())
        .filter((n: string) => n !== "");
      
      const senderNameText = senderNames.join(', ');

      const mappingDataToSave = {
        ...editForm,
        branchCode: trimmedCode,
        senderNames: senderNames,
        senderNameText: senderNameText,
        commissionRate9: rate9,
        commissionRate68: rate68,
        commissionRate: rate9, // backward compatibility
        commissionRateRaw: String(rate9), // backward compatibility
        updatedAt: serverTimestamp()
      };
      
      // Cleanup UI-only and old fields
      delete (mappingDataToSave as any).commissionRate9Raw;
      delete (mappingDataToSave as any).commissionRate68Raw;
      delete (mappingDataToSave as any).commissionRate9Provinces;
      delete (mappingDataToSave as any).commissionRate68Provinces;
      delete (mappingDataToSave as any).senderNameInput;

      const ref = doc(db, 'commissionMappings', id);
      await setDoc(ref, mappingDataToSave, { merge: true });

      if (isIdChanged && editingId) {
        await deleteDoc(doc(db, 'commissionMappings', editingId));
      }

      clearCommissionMappingCache();

      await createAuditLog(isEdit ? 'EDIT_MAPPING' : 'ADD_MAPPING', {
        id,
        branchCode: trimmedCode,
        commissionRate9: rate9,
        commissionRate68: rate68,
        reportType: targetReportType
      }, user?.email);

      // Auto Reprocess shipments for this single mapping instantly to keep sync high and accurate
      Swal.fire({
        title: "บันทึกและประมวลผลย้อนหลังทันที...",
        text: "ระบบกำลังทำงานปรับ Shipment และคำนวณรายคู่ด้วย Pagination เพื่อความเสถียรที่สุด",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      let matchCount = 0;
      let totalProcessed = 0;
      let lastDoc = null;
      let hasMore = true;
      let singleLastUsedAt: string | null = null;
      const PAGE_SIZE = 500;

      while (hasMore) {
        let currentQuery = query(collection(db, 'shipments'), orderBy('__name__'), limit(PAGE_SIZE));
        if (lastDoc) {
          currentQuery = query(collection(db, 'shipments'), orderBy('__name__'), startAfter(lastDoc), limit(PAGE_SIZE));
        }

        const snapShip = await getDocs(currentQuery);
        if (snapShip.empty) {
          hasMore = false;
          break;
        }

        lastDoc = snapShip.docs[snapShip.docs.length - 1];
        const shipmentsBatch = snapShip.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

        let batch = writeBatch(db);
        let opCount = 0;

        for (const shipment of shipmentsBatch) {
          totalProcessed++;
          const sSenderName = normalizeText(shipment.senderName);
          const sBranchName = normalizeText(shipment.branchName);
          const sMappedBranchCode = normalizeText(shipment.mappedBranchCode);
          const sBranchCode = normalizeText(shipment.branchCode);

          const matchByCode = trimmedCode && (normalizeText(trimmedCode) === sMappedBranchCode || normalizeText(trimmedCode) === sBranchCode);
          
          let matchByName = false;
          if (mappingDataToSave.senderNames && mappingDataToSave.senderNames.length > 0) {
            matchByName = mappingDataToSave.senderNames.some((name: string) => {
              const n = normalizeText(name);
              return n === sSenderName || n === sBranchName;
            });
          }

          if (matchByCode || matchByName) {
            const enriched = enrichShipmentWithCommissionMapping(shipment, [mappingDataToSave]);
            const dataToUpdate = { ...enriched };
            delete dataToUpdate.id;
            
            batch.update(doc(db, "shipments", shipment.id), dataToUpdate);
            matchCount++;
            opCount++;

            // Track lastUsedAt for this single mapping
            const rawDate = shipment.orderDate || shipment.createdDate || shipment.shipmentDate || shipment.importDate || shipment.date || null;
            if (rawDate) {
              let dateStr = "";
              if (typeof rawDate === 'string') {
                dateStr = rawDate.slice(0, 10);
              } else if (rawDate && typeof rawDate.toDate === 'function') {
                dateStr = rawDate.toDate().toISOString().slice(0, 10);
              } else {
                dateStr = String(rawDate).slice(0, 10);
              }
              if (dateStr && (!singleLastUsedAt || dateStr > singleLastUsedAt)) {
                singleLastUsedAt = dateStr;
              }
            }

            if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
        }

        if (opCount > 0) {
          await batch.commit();
        }

        if (snapShip.docs.length < PAGE_SIZE) {
          hasMore = false;
        }
      }

      // Save stats to commissionMappingUsage collection!
      await setDoc(doc(db, 'commissionMappingUsage', id), {
        mappingId: id,
        usageCount: matchCount,
        lastUsedAt: singleLastUsedAt,
        updatedAt: new Date()
      }, { merge: true });

      // If mapping ID changed, delete old usage record
      if (isIdChanged && editingId) {
        await deleteDoc(doc(db, 'commissionMappingUsage', editingId));
      }

      await Swal.fire({
        title: "อัปเดตข้อมูลสำเร็จ",
        text: `จับคู่และคำนวณ Shipment ใหม่เสร็จสิ้นทั้งหมด ${matchCount} รายการ`,
        icon: "success",
        timer: 1500,
        showConfirmButton: false
      });

      setIsModalOpen(false);
      await loadAllData();
    } catch (error: any) {
      console.error(error);
      await Swal.fire({
        title: "ผิดพลาดในการเขียนข้อมูล",
        text: error.message || "กรุณาติดต่อผู้พัฒนาระบบซอฟต์แวร์",
        icon: "error"
      });
    }
  };

  const handleDelete = async (id: string) => {
    const showToast = (icon: 'success' | 'error' | 'warning' | 'info', title: string) => {
      Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 4000,
        timerProgressBar: true
      }).fire({
        icon,
        title
      });
    };

    if (!isAdmin) {
      showToast('error', 'permission denied: เฉพาะ Admin เท่านั้นที่ลบหรือปิดใช้งานข้อมูลได้');
      await Swal.fire("สิทธิ์ไม่ถูกต้อง", "เฉพาะ Admin เท่านั้นที่กระทำการลบหรือปิดใช้งานข้อมูลนี้ได้", "error");
      return;
    }

    const mapping = computedMappings.find(m => m.id === id);
    if (!mapping) {
      showToast('error', 'delete failed: ไม่พบข้อมูลเงื่อนไขในระบบ');
      return;
    }

    const isUsed = (mapping.matchedCount || 0) > 0;

    if (isUsed) {
      // mapping in use: Prevent hard delete, display toast and prompt for Archiving instead
      showToast('error', 'mapping in use: เงื่อนไขกำลังถูกใช้งานอยู่');
      
      const confirm = await Swal.fire({
        title: "คุณต้องการปิดใช้งาน Mapping นี้หรือไม่",
        text: `เงื่อนไขดีลนี้ถูกใช้งานไปแล้วในประวัติการคำนวณ ${mapping.matchedCount} บิล จึงไม่สามารถลบแบบถาวรได้ (เพื่อป้องกันปัญหา Dangling Reference) คุณต้องการเปลี่ยนสถานะเป็นปิดใช้งาน (Archive) เพื่อปิดการจับคู่บิลใหม่แทนหรือไม่?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: '#dc2626', // primary
        confirmButtonText: "ใช่, ยืนยันปิดใช้งาน (Archive)",
        cancelButtonText: "ยกเลิก"
      });

      if (!confirm.isConfirmed) return;

      try {
        const mappingRef = doc(db, 'commissionMappings', id);
        // Exclude UI calculated properties from saved object
        const recordToSave = { ...mapping };
        delete recordToSave.id;
        delete recordToSave.matchedCount;
        delete recordToSave.status;
        delete recordToSave.lastUsedDate;

        await setDoc(mappingRef, {
          ...recordToSave,
          isArchived: true,
          isActive: false, // deactivate
          archivedAt: serverTimestamp(),
          archivedBy: user?.email || 'admin@system.com'
        }, { merge: true });

        clearCommissionMappingCache();
        await createAuditLog('ARCHIVE_MAPPING', { id }, user?.email);

        await Swal.fire({
          title: "ปิดใช้งานสำเร็จ",
          text: "เปลี่ยนสถานะของเงื่อนไขนี้เป็นปิดใช้งาน (Archive) เรียบร้อยแล้ว",
          icon: "success",
          timer: 1500,
          showConfirmButton: false
        });
        loadAllData();
      } catch (error: any) {
        console.error("Error archiving mapping", error);
        showToast('error', `delete failed: ${error.message || 'การปิดใช้งานล้มเหลว'}`);
        Swal.fire("ข้อผิดพลาด", error.message || "ไม่สามารถปิดใช้งานเงื่อนไขได้", "error");
      }
    } else {
      // Unused - can either archive or hard delete
      const result = await Swal.fire({
        title: "คุณต้องการปิดใช้งาน Mapping นี้หรือไม่",
        text: "เนื่องจากเงื่อนไขนี้ยังไม่เคยผ่านการใช้งานจริงในระบบ คุณสามารถเลือก 'ปิดใช้งาน (Archive)' หรือทำการ 'ลบออกอย่างถาวร (Hard Delete)' ตามต้องการ",
        icon: "question",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonColor: '#dc2626', // primary
        denyButtonColor: '#e11d48', // rose
        confirmButtonText: "ปิดใช้งาน (Archive)",
        denyButtonText: "ลบถาวร (Hard Delete)",
        cancelButtonText: "ยกเลิก"
      });

      if (result.isConfirmed) {
        // Archive
        try {
          const mappingRef = doc(db, 'commissionMappings', id);
          const recordToSave = { ...mapping };
          delete recordToSave.id;
          delete recordToSave.matchedCount;
          delete recordToSave.status;
          delete recordToSave.lastUsedDate;

          await setDoc(mappingRef, {
            ...recordToSave,
            isArchived: true,
            isActive: false,
            archivedAt: serverTimestamp(),
            archivedBy: user?.email || 'admin@system.com'
          }, { merge: true });

          clearCommissionMappingCache();
          await createAuditLog('ARCHIVE_MAPPING', { id }, user?.email);

          await Swal.fire({
            title: "ปิดใช้งานสำเร็จ",
            text: "เปลี่ยนสถานะของเงื่อนไขเป็นปิดใช้งาน (Archive) เรียบร้อยแล้ว",
            icon: "success",
            timer: 1500,
            showConfirmButton: false
          });
          loadAllData();
        } catch (error: any) {
          console.error("Error archiving unused mapping", error);
          showToast('error', `delete failed: ${error.message || 'การปิดใช้งานล้มเหลว'}`);
          Swal.fire("ข้อผิดพลาด", error.message || "ไม่สามารถปิดใช้งานเงื่อนไขได้", "error");
        }
      } else if (result.isDenied) {
        // Hard Delete
        try {
          await deleteDoc(doc(db, 'commissionMappings', id));
          await deleteDoc(doc(db, 'commissionMappingUsage', id)).catch(e => console.warn(e));
          clearCommissionMappingCache();
          
          await createAuditLog('DELETE_MAPPING', { id }, user?.email);
          
          await Swal.fire({
            title: "ลบสำเร็จ",
            text: "ลบเงื่อนไขการคำนวณค่าคอมมิชชั่นออกจากระบบเรียบร้อย",
            icon: "success",
            timer: 1500,
            showConfirmButton: false
          });
          loadAllData();
        } catch (error: any) {
          console.error("Error deleting mapping", error);
          showToast('error', `delete failed: ${error.message || 'การลบข้อมูลล้มเหลว'}`);
          Swal.fire("ข้อผิดพลาด", error.message || "ไม่สามารถลบลำดับเงื่อนไขออกจากระบบได้", "error");
        }
      }
    }
  };

  // Perform full search logic based on user input states
  const filteredMappings = computedMappings.filter(m => {
    const matchSearch = !searchTerm || 
      (m.senderNameText || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (m.senderNames || []).some((n: string) => n.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (m.branchCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.supervisor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.customerGroup || '').toLowerCase().includes(searchTerm.toLowerCase());

    let matchStatus = true;
    if (filterStatus === 'used') {
      matchStatus = m.matchedCount > 0 && m.isArchived !== true;
    } else if (filterStatus === 'unused') {
      matchStatus = (!m.matchedCount || m.matchedCount === 0) && m.isArchived !== true;
    } else if (filterStatus === 'active_only') {
      matchStatus = m.isActive !== false && m.isArchived !== true;
    } else if (filterStatus === 'archived_only') {
      matchStatus = m.isArchived === true;
    } else if (filterStatus === 'duplicate') {
      matchStatus = m.status === 'duplicate' && m.isArchived !== true;
    } else if (filterStatus !== 'all') {
      matchStatus = m.status === filterStatus && m.isArchived !== true;
    }

    const mReportType = String(m.reportType || '').trim().toUpperCase();
    const matchReportType = filterReportType === 'all' || mReportType === filterReportType;

    return matchSearch && matchStatus && matchReportType;
  });

  // Statistics summaries
  const stats = React.useMemo(() => {
    const activeMappings = filteredMappings.filter(m => m.isArchived !== true);
    const total = activeMappings.length;
    const active = activeMappings.filter(m => m.isActive !== false && m.matchedCount > 0).length;
    const unused = activeMappings.filter(m => m.isActive !== false && (!m.matchedCount || m.matchedCount === 0)).length;
    const duplicate = activeMappings.filter(m => m.isActive !== false && m.status === 'duplicate').length;
 
    const shipmentMapped = activeMappings.reduce((sum, m) => sum + (m.matchedCount || 0), 0);
    const shipmentUnmapped = totalUnmappedShipments;

    const legacyMappings = activeMappings.filter(m => {
      const r9 = Number(m.commissionRate9 !== undefined ? m.commissionRate9 : ((m as any).commissionRate9Provinces || 0));
      const r68 = Number(m.commissionRate68 !== undefined ? m.commissionRate68 : ((m as any).commissionRate68Provinces || 0));
      const looksDecimal = (r9 > 0 && r9 <= 0.05) || (r68 > 0 && r68 <= 0.05);
      return (m as any).commissionRate9Provinces !== undefined || (m as any).commissionRate68Provinces !== undefined || (m as any).baseMultiplier !== undefined || (m as any).actualMultiplier !== undefined || m.isLegacy === true || looksDecimal;
    });

    const autoMappings = activeMappings.filter(m => 
      m.isAuto === true || m.isAutomated === true || m.isAutoMapped === true || String(m.id || "").toLowerCase().includes("auto")
    );

    const manualMappings = activeMappings.filter(m => {
      const isLegacyDef = (m as any).commissionRate9Provinces !== undefined || (m as any).commissionRate68Provinces !== undefined || (m as any).baseMultiplier !== undefined || (m as any).actualMultiplier !== undefined || m.isLegacy === true;
      const r9 = Number(m.commissionRate9 !== undefined ? m.commissionRate9 : ((m as any).commissionRate9Provinces || 0));
      const r68 = Number(m.commissionRate68 !== undefined ? m.commissionRate68 : ((m as any).commissionRate68Provinces || 0));
      const looksDecimal = (r9 > 0 && r9 <= 0.05) || (r68 > 0 && r68 <= 0.05);
      const isAuto = m.isAuto === true || m.isAutomated === true || m.isAutoMapped === true || String(m.id || "").toLowerCase().includes("auto");
      return !isLegacyDef && !looksDecimal && !isAuto;
    });

    const shipmentMappedManual = manualMappings.reduce((sum, m) => sum + (m.matchedCount || 0), 0);
    const shipmentMappedAuto = autoMappings.reduce((sum, m) => sum + (m.matchedCount || 0), 0);
    const shipmentMappedLegacy = legacyMappings.reduce((sum, m) => sum + (m.matchedCount || 0), 0);
 
    return { 
      total, 
      active, 
      unused, 
      duplicate, 
      shipmentMapped, 
      shipmentUnmapped,
      shipmentMappedManual,
      shipmentMappedAuto,
      shipmentMappedLegacy
    };
  }, [filteredMappings, totalUnmappedShipments]);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // When search/filter changes, reset page to 1
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterReportType]);

  const totalPages = Math.ceil(filteredMappings.length / pageSize) || 1;

  // Adjust page if total pages shrinks below currentPage
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [filteredMappings.length, pageSize, totalPages, currentPage]);

  const paginatedMappings = React.useMemo(() => {
    return filteredMappings.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredMappings, currentPage, pageSize]);

  return (
    <div className="w-full space-y-6 flex flex-col p-4 md:p-6 pb-20">
      <CompactCompanyHeader />
      
      {/* Upper Control Bar Header Section */}
      <div className="bg-white dark:bg-gray-900 p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600 border border-primary-100">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-800 dark:text-gray-200 tracking-tight">Commission Mapping Settings</h1>
            <p className="text-sm text-gray-500 mt-1">ระบบฐานข้อมูลหลัก (Master Data) สำหรับประมวลผลคำนวณและแจกจ่ายค่าคอมมิชชั่น</p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2.5">
           <button 
             onClick={handleReprocess} 
             disabled={isReprocessing || loading} 
             className={`px-4 py-2.5 text-xs font-bold rounded-xl border flex items-center shadow-xs transition-all tracking-wide ${
               isReprocessing ? 'bg-amber-50 text-amber-500 border-amber-200 cursor-not-allowed' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 cursor-pointer active:scale-95'
             }`}
           >
             <PlayCircle className={`w-4 h-4 mr-1.5 ${isReprocessing ? 'animate-pulse' : ''}`} />
             {isReprocessing ? 'กำลังทำการคำนวณเวิลด์วายด์...' : 'คำนวณค่าคอมบิลค้างใหม่'}
           </button>

           <button 
             onClick={downloadTemplate}
             className="px-4 py-2.5 text-xs font-bold bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:bg-gray-800/50 flex items-center shadow-xs cursor-pointer active:scale-95 transition-all"
           >
             <FileDown className="w-4 h-4 mr-1.5 text-primary-500" />
             ดาวน์โหลดเทมเพลต Excel
           </button>

           <label className="px-4 py-2.5 text-xs font-bold bg-secondary-50 text-secondary-700 rounded-xl border border-secondary-200 hover:bg-secondary-100 flex items-center shadow-xs cursor-pointer active:scale-95 transition-all">
             <Upload className="w-4 h-4 mr-1.5" />
             นำเข้า Excel
             <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} disabled={isImporting || isReprocessing} />
           </label>

           <button onClick={() => loadAllData()} disabled={isReprocessing || loading} className="px-4 py-2.5 text-xs font-bold bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-100 flex items-center active:scale-95 transition-all">
             <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
             รีเฟรชฐานข้อมูล
           </button>
           <button onClick={checkLegacyData} className="px-4 py-2.5 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 flex items-center active:scale-95 transition-all">
             <Activity className="w-4 h-4 mr-1.5" />
             ตรวจสอบข้อมูลเดิม (Migrate)
           </button>
           <button onClick={handleAdd} disabled={isReprocessing} className="px-4 py-2.5 text-xs font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 flex items-center shadow-md active:scale-95 transition-all hover:shadow-primary-200">
             <Plus className="w-4 h-4 mr-1.5" />
             เพิ่มเงื่อนไขใหม่
           </button>
           
           {isAdmin && (
             <button 
               onClick={() => setIsClearModalOpen(true)} 
               disabled={isReprocessing || loading || isClearing} 
               className="px-4 py-2.5 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded-xl hover:bg-rose-100 flex items-center active:scale-95 transition-all"
             >
               <Trash2 className="w-4 h-4 mr-1.5" />
               เคลียร์ข้อมูล Mapping
             </button>
           )}
        </div>
      </div>

      {/* Migration Modal */}
      {migrationState.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Activity className="text-amber-500" />
                Data Migration (Legacy Decimal Fix)
              </h2>
              <button 
                onClick={() => setMigrationState(prev => ({ ...prev, isOpen: false }))}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-auto space-y-4">
              <div className="bg-primary-900 dark:bg-black border border-primary-200 p-4 rounded-xl text-sm text-white dark:text-gray-100">
                <p className="font-bold mb-1">รายละเอียดการ Migration:</p>
                <p>ระบบจะค้นหาข้อมูลที่มีค่า commissionRate อยู่ในรูปแบบ decimal (เช่น 0.01) และทำการแปลงเป็น percentage (เช่น 1.00) เพื่อให้สอดคล้องกับระบบใหม่</p>
                <p className="mt-2 text-xs opacity-80">* ระบบจะตรวจสอบเฉพาะค่าที่ {">"} 0 และ {"<="} 1.0</p>
              </div>

              <div className="space-y-2">
                <h3 className="font-bold text-gray-700 dark:text-gray-300">ตรวจพบ {migrationState.legacyRecords.length} รายการ:</h3>
                <div className="border rounded-xl max-h-40 overflow-auto text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                      <tr>
                        <th className="p-2 border-b">ID / Branch Code</th>
                        <th className="p-2 border-b">Current Rate</th>
                        <th className="p-2 border-b">New Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {migrationState.legacyRecords.map(m => (
                        <tr key={m.id}>
                          <td className="p-2">{m.id}</td>
                          <td className="p-2 text-rose-500 font-bold">{m.commissionRate}</td>
                          <td className="p-2 text-secondary-600 font-bold">{(m.commissionRate * 100).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {migrationState.logs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-bold text-gray-700 dark:text-gray-300">Logs:</h3>
                  <div className="bg-gray-900 text-gray-300 p-3 rounded-xl font-mono text-[10px] h-32 overflow-auto">
                    {migrationState.logs.map((log, i) => (
                      <div key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3">
              <button 
                onClick={() => setMigrationState(prev => ({ ...prev, isOpen: false }))}
                className="px-6 py-2 border rounded-xl hover:bg-white dark:bg-gray-900 transition-all font-bold text-gray-600 dark:text-gray-400"
              >
                Cancel
              </button>
              <button 
                disabled={migrationState.legacyRecords.length === 0 || migrationState.isMigrating}
                onClick={runMigration}
                className={`px-8 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all ${
                  migrationState.legacyRecords.length === 0 || migrationState.isMigrating
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700 active:scale-95'
                }`}
              >
                {migrationState.isMigrating && <Loader2 className="w-4 h-4 animate-spin" />}
                {migrationState.isMigrating ? 'Migrating...' : 'Start Migration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Data Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden border border-rose-100">
            <div className="p-6 border-b border-rose-50 flex items-center justify-between bg-rose-50/30">
              <div className="flex items-center gap-3 text-rose-600">
                <AlertCircle className="w-6 h-6" />
                <h2 className="text-lg font-bold">ยืนยันการเคลียร์ข้อมูล</h2>
              </div>
              <button 
                onClick={() => !isClearing && setIsClearModalOpen(false)} 
                className="text-gray-400 hover:bg-rose-100 p-2 rounded-full transition-all"
                disabled={isClearing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                <p className="text-sm text-rose-800 font-medium leading-relaxed uppercase tracking-tight">
                  <strong className="block text-rose-600 mb-1">คำเตือน:</strong>
                  การเคลียร์ข้อมูลจะลบ <strong className="underline">Commission Mapping ทั้งหมด</strong> ออกจากฐานข้อมูลถาวร และไม่สามารถเรียกคืนได้
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                  พิมพ์คำว่า <span className="text-rose-600">"ลบข้อมูล"</span> เพื่อยืนยัน
                </label>
                <input 
                  type="text" 
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-500 outline-none transition-all font-bold text-gray-700 dark:text-gray-300"
                  placeholder="พิมพ์ ลบข้อมูล"
                  value={clearConfirmationText}
                  onChange={e => setClearConfirmationText(e.target.value)}
                  disabled={isClearing}
                />
              </div>

              {isClearing && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <span>กำลังลบข้อมูล...</span>
                    <span>{clearProgress.current} / {clearProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-rose-500 h-full transition-all duration-300"
                      style={{ width: `${(clearProgress.current / clearProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-50 bg-gray-50 dark:bg-gray-800/50/50 flex gap-3 justify-end">
              <button 
                onClick={() => setIsClearModalOpen(false)}
                className="px-6 py-2.5 text-xs font-bold text-gray-500 hover:bg-white dark:bg-gray-900 rounded-xl transition-all"
                disabled={isClearing}
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleClearAllMappings}
                disabled={clearConfirmationText !== "ลบข้อมูล" || isClearing}
                className={`px-8 py-2.5 text-xs font-bold text-white rounded-xl shadow-lg transition-all flex items-center gap-2 ${
                  clearConfirmationText === "ลบข้อมูล" && !isClearing 
                    ? 'bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-rose-100' 
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                {isClearing && <Loader2 className="w-4 h-4 animate-spin" />}
                ยืนยันการลบทั้งหมด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {importPreview.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/20">
             <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary-100">
                    <Archive className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-gray-800 dark:text-gray-200">ตรวจสอบความถูกต้องก่อนนำเข้า</h2>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">MASTER COMMISSION DATA PREVIEW</p>
                  </div>
                </div>
                <button onClick={() => setImportPreview(prev => ({ ...prev, isOpen: false }))} className="text-gray-400 hover:bg-gray-100 p-2.5 rounded-xl transition-all">✕</button>
             </div>
             
             <div className="overflow-auto p-6 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                   <div className="p-4 bg-secondary-50 border border-secondary-100 rounded-2xl text-center">
                      <p className="text-[10px] uppercase font-bold text-secondary-600 mb-1">รายการใหม่</p>
                      <p className="text-2xl font-black text-secondary-700">{importPreview.newCount}</p>
                   </div>
                   <div className="p-4 bg-primary-50 border border-primary-100 rounded-2xl text-center">
                      <p className="text-[10px] uppercase font-bold text-primary-600 mb-1">ข้อมูลซ้ำ/เดิม</p>
                      <p className="text-2xl font-black text-primary-700">{importPreview.duplicateCount}</p>
                   </div>
                   <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-center">
                      <p className="text-[10px] uppercase font-bold text-rose-600 mb-1">ผิดพลาด</p>
                      <p className="text-2xl font-black text-rose-700">{importPreview.errorCount}</p>
                   </div>
                </div>

                {importPreview.duplicateCount > 0 && (
                   <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <h4 className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                           <AlertCircle className="w-4 h-4 text-amber-500" />
                           ตัวอย่างข้อมูลที่ตรวจพบว่าซ้ำ ({importPreview.duplicateCount} รายการ)
                         </h4>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                         <table className="w-full text-left text-[10px]">
                            <thead className="bg-gray-100 text-gray-500 font-bold uppercase">
                               <tr>
                                  <th className="px-4 py-2">ชื่อลูกค้า / สาขา</th>
                                  <th className="px-4 py-2">รหัสสาขา</th>
                                  <th className="px-4 py-2">กลุ่มลูกค้า</th>
                               </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                               {importPreview.duplicateList.map((row, idx) => (
                                  <tr key={idx} className="bg-white dark:bg-gray-900/50">
                                     <td className="px-4 py-2 font-bold text-gray-700 dark:text-gray-300">{row.senderName}</td>
                                     <td className="px-4 py-2">{row.branchCode || '-'}</td>
                                     <td className="px-4 py-2">{row.customerGroup || '-'}</td>
                                  </tr>
                               ))}
                            </tbody>
                         </table>
                         {importPreview.duplicateCount > 10 && (
                            <div className="p-2 text-center text-[10px] text-gray-400 font-bold bg-white dark:bg-gray-900/30 italic">
                               และรายการอื่นอีก {importPreview.duplicateCount - 10} รายการ...
                            </div>
                         )}
                      </div>
                   </div>
                )}

                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
                   <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                   <div>
                      <p className="text-xs font-bold text-amber-900 leading-relaxed">กรุณาเลือกวิธีการดำเนินการเมื่อพบข้อมูลซ้ำ:</p>
                      <ul className="text-[11px] text-amber-800 list-disc ml-4 mt-2 space-y-1 font-medium">
                         <li><strong>อัปเดตข้อมูลเดิม:</strong> เขียนทับข้อมูลการตั้งค่าด้วยข้อมูลจากไฟล์ Excel นี้</li>
                         <li><strong>ข้ามรายการซ้ำ:</strong> จะนำเข้าเฉพาะรายการที่ยังไม่มีอยู่ในระบบเท่านั้น</li>
                      </ul>
                   </div>
                </div>
             </div>
             
             <div className="p-6 border-t border-gray-100 bg-gray-50 dark:bg-gray-800/50/50 flex flex-wrap gap-3 justify-end items-center">
                <button 
                  onClick={() => setImportPreview(prev => ({ ...prev, isOpen: false }))} 
                  className="px-6 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-100 transition-all"
                >
                  ยกเลิกการนำเข้า
                </button>
                <div className="flex gap-2">
                   {importPreview.duplicateCount > 0 && (
                      <button 
                         onClick={() => executeFinalImport('skip')}
                         className="px-6 py-2.5 text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-600 hover:text-white transition-all active:scale-95"
                      >
                         ข้ามรายการซ้ำ
                      </button>
                   )}
                   {(importPreview.newCount > 0 || importPreview.duplicateCount > 0) && (
                      <button 
                         onClick={() => executeFinalImport('update')}
                         className="px-8 py-2.5 text-xs font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-100 transition-all active:scale-95"
                      >
                         {importPreview.duplicateCount > 0 ? 'อัปเดตและนำเข้าทั้งหมด' : 'เริ่มนำเข้าข้อมูล'}
                      </button>
                   )}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Excel Import Progress and Status UI */}
      {importStatus.isOpen && (
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-primary-200 shadow-lg transition-all animate-fadeIn relative overflow-hidden">
          <button 
            onClick={() => setImportStatus(prev => ({ ...prev, isOpen: false }))}
            className="absolute top-4 right-4 text-gray-400 hover:bg-gray-100 p-1.5 rounded-lg transition-colors z-10"
            title="ปิดหน้าต่างสถานะ"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${importStatus.progress === 100 ? 'bg-secondary-50 text-secondary-600 border border-secondary-100' : 'bg-primary-50 text-primary-600 border border-primary-100'}`}>
              {isImporting ? <RefreshCw className="w-5 h-5 animate-spin" /> : (importStatus.progress === 100 ? <CheckCircle className="w-5 h-5" /> : <Upload className="w-5 h-5" />)}
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-800 dark:text-gray-200">{importStatus.step}</h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Excel Import Dashboard</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="p-3 bg-secondary-50 border border-secondary-100 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-secondary-600 mb-1 tracking-tighter">เพิ่มใหม่</p>
              <p className="text-lg font-black text-secondary-700">{importStatus.created}</p>
            </div>
            <div className="p-3 bg-primary-900 dark:bg-black border border-primary-100 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-primary-600 mb-1 tracking-tighter">อัปเดต</p>
              <p className="text-lg font-black text-primary-700">{importStatus.updated}</p>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-amber-600 mb-1 tracking-tighter">ข้าม</p>
              <p className="text-lg font-black text-amber-700">{importStatus.skipped}</p>
            </div>
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-rose-600 mb-1 tracking-tighter">ผิดพลาด</p>
              <p className="text-lg font-black text-rose-700">{importStatus.errors.length}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-400">
              <span>ความคืบหน้า</span>
              <span>{importStatus.progress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden border border-gray-200 dark:border-gray-700/50">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${importStatus.progress === 100 ? 'bg-secondary-500' : 'bg-primary-500'}`} 
                style={{ width: `${importStatus.progress}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-center text-gray-400 font-bold mt-2">
              ประมวลผลแล้ว {importStatus.processedRows} จากทั้งหมด {importStatus.totalRows} แถว
            </p>
          </div>

          {importStatus.errors.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  รายละเอียดข้อผิดพลาด
                </p>
                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-2 py-0.5 rounded-full">
                  {importStatus.errors.length} รายการ
                </span>
              </div>
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-3 max-h-40 overflow-y-auto custom-scrollbar text-[10px] font-mono text-rose-700 space-y-1.5">
                {importStatus.errors.map((err, idx) => (
                  <div key={idx} className="flex gap-2 border-b border-rose-100/50 pb-1 last:border-0 last:pb-0">
                    <span className="font-bold opacity-50 shrink-0">แถว {err.row}:</span>
                    <span>{err.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Realtime progress tracker bar */}
      {isReprocessing && (
        <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-amber-200 shadow-sm transition-all animate-fadeIn">
           <div className="flex justify-between items-center text-xs font-extrabold text-amber-800 mb-2">
             <span className="flex items-center gap-1.5">
               <Activity className="w-4 h-4 text-amber-500 animate-pulse" />
               กำลังประมวลผลคำนวณค่าคอมมิชชั่นกับ Shipment ทั้งหมด... โปรดอย่าปิดหน้าเว็บหรือเปิดแท็บใหม่
             </span>
             <span>{progress.current} / {progress.total} ({(progress.total > 0 ? (progress.current / progress.total) * 100 : 0).toFixed(0)}%)</span>
           </div>
           <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
             <div className="bg-gradient-to-r from-amber-400 to-amber-600 h-3 rounded-full transition-all duration-300" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}></div>
           </div>
        </div>
      )}

      {/* Metrics Summary Rows */}
      <div className="space-y-4">
        {/* Row 1: Mapping Configurations Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gray-100 text-gray-600 dark:text-gray-400"><Archive className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">กฎ Mapping ทั้งหมด</p>
              <h3 className="text-lg font-extrabold text-gray-800 dark:text-gray-200 mt-0.5">{stats.total}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">ตามการกรองและการค้นหา</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-secondary-50 text-secondary-600 border border-secondary-100"><CheckCircle className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Active Mapping</p>
              <h3 className="text-lg font-extrabold text-secondary-700 mt-0.5">{stats.active}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">มีบิลขนส่งเข้ากฎตามที่แสดง</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-100"><Info className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Unused Mapping</p>
              <h3 className="text-lg font-extrabold text-amber-700 mt-0.5">{stats.unused}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">ยังไม่มีบิลวิ่งเข้าตามกฎตอนนี้</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3">
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-100"><AlertCircle className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Dup Mapping</p>
              <h3 className="text-lg font-extrabold text-rose-700 mt-0.5">{stats.duplicate}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">มีการตั้งค่าเรตรวมที่ซ้ำซ้อนกัน</p>
            </div>
          </div>
        </div>

        {/* Row 2: Shipment Matching Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3 col-span-1" title="นับจาก shipment ที่ match กับ mapping config ปัจจุบัน">
            <div className="p-3 rounded-xl bg-primary-50 text-primary-600 border border-primary-100"><FileSignature className="w-5 h-5" /></div>
            <div>
              <div className="flex items-center gap-1">
                <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Shipment Mapped</p>
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
              </div>
              <h3 className="text-lg font-extrabold text-primary-700 mt-0.5">{stats.shipmentMapped}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">นับตรงกับตารางตามการกรอง</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3 col-span-1" title="บิลที่ match ผ่านกฎ Mapping แบบสร้างด้วยตนเอง">
            <div className="p-3 rounded-xl bg-sky-50 text-sky-600 border border-sky-100"><FileSignature className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Manual Mapped</p>
              <h3 className="text-lg font-extrabold text-sky-700 mt-0.5">{stats.shipmentMappedManual}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">กฎเงื่อนไขตั้งค่าปกติเอง</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3 col-span-1" title="บิลที่ match ผ่านระบบ Auto-Mapping">
            <div className="p-3 rounded-xl bg-teal-50 text-teal-600 border border-teal-100"><FileSignature className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Auto Mapped</p>
              <h3 className="text-lg font-extrabold text-teal-700 mt-0.5">{stats.shipmentMappedAuto}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">ระบบวิเคราะห์คู่ตรงอัตโนมัติ</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3 col-span-1" title="บิลที่ match ผ่านกฎ legacy ย้ายระบบ">
            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100"><FileSignature className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Legacy Mapped</p>
              <h3 className="text-lg font-extrabold text-indigo-700 mt-0.5">{stats.shipmentMappedLegacy}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">กฎกรณีพิเศษ/ย้ายระบบดั้งเดิม</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs flex items-center gap-3 col-span-1" title="บิลทั้งหมดที่ยังไม่มีการตั้งค่าจับคู่หรือคิดคำนวณสำเร็จในระบบ">
            <div className="p-3 rounded-xl bg-gray-100 text-gray-500 border border-gray-200 dark:border-gray-700"><AlertCircle className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Shipment Unmapped</p>
              <h3 className="text-lg font-extrabold text-gray-700 dark:text-gray-300 mt-0.5">{stats.shipmentUnmapped}</h3>
              <p className="text-[9px] text-gray-400 mt-0.5 leading-tight font-medium">บิลคงเหลือยังไม่คำนวณทั้งหมด</p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Filter and Multi-search Section Bar */}
      <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative w-full md:w-1/3">
          <Search className="absolute text-gray-400 left-3 top-1/2 -trangray-y-1/2 w-4 h-4" />
          <input 
            type="text"
            placeholder="ค้นหาชื่อลูกค้า, รหัสสาขา, ผู้ดูแล, กลุ่มลูกค้า..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary-500 focus:bg-white dark:bg-gray-900 transition-all text-gray-700 dark:text-gray-300 placeholder-gray-400"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full md:w-2/3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 shrink-0">สถานะ:</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl py-1.5 px-3 text-xs bg-gray-50 dark:bg-gray-800/50 focus:bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold cursor-pointer outline-none"
            >
              <option value="active_only">🟢 Active (เปิดใช้งาน)</option>
              <option value="archived_only">📁 Archived (อาร์ไคฟ์/ปิดใช้งาน)</option>
              <option value="used">📥 Used (ใช้งานแล้ว)</option>
              <option value="unused">🟡 Unused (ยังไม่มีการใช้งาน)</option>
              <option value="all">🌐 ทั้งหมด (รวมที่อาร์ไคฟ์)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 shrink-0">หมวดรายการ:</span>
            <select
              value={filterReportType}
              onChange={e => setFilterReportType(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl py-1.5 px-3 text-xs bg-gray-50 dark:bg-gray-800/50 focus:bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold cursor-pointer outline-none"
            >
              <option value="all">ประเภทรายงานทั้งหมด</option>
              {masterData?.reportTypes.filter(t => t.isActive).map(t => (
                <option key={t.id} value={t.aliases[0] || t.label.toUpperCase().replace(/\s+/g, '_')}>{t.label}</option>
              ))}
              {!masterData?.reportTypes.length && (
                <>
                  <option value="DROP_POINT">Drop Point Only</option>
                  <option value="CALLIN">CALLIN</option>
                  <option value="RC_PICKUP">RC งานเข้ารับ</option>
                  <option value="ONLINE">ONLINE</option>
                  <option value="SALE_DRIVER">SALE DRIVER</option>
                  <option value="FULL_TRUCK_LOAD">Full Truck Load</option>
                  <option value="ECOMMERCE">E-Commerce</option>
                  <option value="TRUCK360">Truck 360</option>
                </>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Main Table view of configuration mappings */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden min-h-[300px]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">รหัสสาขา / ผู้ส่ง (Sender)</th>
                <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">หมวดรายงาน</th>
                <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">ผู้ดูแล / กลุ่มลูกค้า</th>
                <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">ค่าคอม 9 จังหวัด (%)</th>
                <th className="px-4 py-3 text-left text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">ค่าคอม 68 จังหวัด (%)</th>
                <th className="px-4 py-3 text-center text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Shipment Matched</th>
                <th className="px-4 py-3 text-center text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">Last Used Date</th>
                <th className="px-4 py-3 text-center text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">สถานะ</th>
                <th className="px-4 py-3 text-right text-[10px] font-extrabold text-gray-500 uppercase tracking-wider">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900 text-xs">
              {paginatedMappings.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 dark:bg-gray-800/50/50 transition-colors">
                  <td className="px-4 py-3.5 whitespace-nowrap font-bold text-gray-800 dark:text-gray-200">
                    <div className="flex flex-col max-w-xs overflow-hidden">
                      <span className="font-mono text-primary-600 truncate">{row.branchCode}</span>
                      <span className="text-[11px] text-gray-500 font-normal truncate" title={row.senderNameText || row.senderName}>
                        {row.senderNameText || row.senderName || '-'}
                      </span>
                      {row.bsBookingReferral && <span className="text-[10px] font-normal text-gray-400 mt-0.5">Ref: {row.bsBookingReferral}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">{getReportTypeBadge(row.reportType)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-gray-600 dark:text-gray-400">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-700 dark:text-gray-300">{row.supervisor || '-'}</span>
                      <span className="text-[10px] text-gray-400 mt-0.5">{row.customerGroup || '-'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-extrabold text-secondary-600">
                    {formatCommissionRate(row.commissionRate9 !== undefined ? row.commissionRate9 : row.commissionRate9Provinces)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap font-extrabold text-primary-600">
                    {formatCommissionRate(row.commissionRate68 !== undefined ? row.commissionRate68 : row.commissionRate68Provinces)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-center">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold font-mono ${row.matchedCount > 0 ? 'bg-primary-50 text-primary-700 border border-primary-100' : 'bg-gray-100 text-gray-400 border border-gray-200 dark:border-gray-700'}`}>
                      {row.matchedCount} บิล
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-center text-gray-500 font-mono text-[11px]">
                    <div className="flex items-center justify-center gap-1">
                      {row.lastUsedDate ? (
                        <>
                          <Calendar className="w-3" />
                          <span>{row.lastUsedDate}</span>
                        </>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-center">
                    {row.isActive === false ? (
                      <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-100 text-gray-500 border border-gray-300">📁 Archived</span>
                    ) : row.matchedCount > 0 ? (
                      <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-secondary-50 text-secondary-700 border border-secondary-200">
                        ใช้งานแล้ว {row.matchedCount} รายการ
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                        ยังไม่มีการใช้งาน
                      </span>
                    )}
                    {row.status === 'duplicate' && (
                      <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-rose-50 text-rose-700 border border-rose-200 ml-1">Duplicate</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-right">
                    <div className="flex gap-1.5 justify-end items-center">
                      <button
                        onClick={() => handleReprocessSingleMapping(row)}
                        disabled={isReprocessing}
                        className="px-2 py-1.5 text-[10px] font-bold tracking-wide rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
                        title="คำนวณส่วนกลางเฉพาะรหัสนี้"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Reprocess
                      </button>
                      <button 
                        onClick={() => handleEdit(row)} 
                        disabled={isReprocessing}
                        className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-all active:scale-90"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(row.id)} 
                        disabled={isReprocessing}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all active:scale-90"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredMappings.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-500 font-bold bg-white dark:bg-gray-900">
                    <Archive className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    ไม่พบข้อมูลกฎเงื่อนไข Commission Mapping ที่ตรงใจคุณ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Total Matched Footer Banner */}
        <div className="bg-primary-50/25 dark:bg-primary-950/20 px-5 py-3 border-t border-gray-150 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-primary-700 dark:text-primary-300 font-bold select-none">
            <Activity className="w-4 h-4 text-primary-500 animate-pulse" />
            <span>รวม shipment matched จากรายการตั้งค่าที่แสดงด้านบน:</span>
            <span className="px-3 py-1.5 rounded-xl bg-primary-100/70 dark:bg-primary-900 border border-primary-200 text-primary-800 dark:text-primary-200 font-black text-sm transition-all shadow-inner tracking-wider">
              {stats.shipmentMapped.toLocaleString()} รายการ
            </span>
          </div>
          <div className="text-[11px] text-gray-450 dark:text-gray-400 select-none">
            * คำนวณตามการกรอง กรองสถานะ และคำค้นหากฎบนหน้าเพจปัจจุบันของคุณ
          </div>
        </div>

        {/* Pagination Control UI */}
        <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-gray-500 font-medium font-sans">
            แสดง <span className="font-extrabold text-gray-700 dark:text-gray-300">{filteredMappings.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> ถึง{" "}
            <span className="font-extrabold text-gray-700 dark:text-gray-300">{Math.min(currentPage * pageSize, filteredMappings.length)}</span> จากทั้งหมด{" "}
            <span className="font-extrabold text-gray-700 dark:text-gray-300">{filteredMappings.length}</span> รายการ
            {searchTerm || filterStatus !== 'all' || filterReportType !== 'all' ? (
              <span className="text-gray-400"> (กรองจากทั้งหมด {mappings.length} รายการ)</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Page Size Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 shrink-0">แสดงต่อหน้า:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-gray-200 dark:border-gray-700 rounded-lg py-1 px-2.5 text-xs bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 font-semibold cursor-pointer outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1 px-2 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:hover:bg-white dark:bg-gray-900 transition-all flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                title="หน้าแรก"
              >
                <ChevronsLeft className="w-4 h-4" />
                <span className="hidden sm:inline">หน้าแรก</span>
              </button>
              
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1 px-2 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:hover:bg-white dark:bg-gray-900 transition-all flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                title="ก่อนหน้า"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">ก่อนหน้า</span>
              </button>

              <span className="px-3 py-1.5 text-xs font-extrabold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 min-w-[70px] text-center">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1 px-2 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:hover:bg-white dark:bg-gray-900 transition-all flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                title="ถัดไป"
              >
                <span className="hidden sm:inline">ถัดไป</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1 px-2 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:hover:bg-white dark:bg-gray-900 transition-all flex items-center justify-center gap-1 cursor-pointer disabled:cursor-not-allowed"
                title="หน้าสุดท้าย"
              >
                <span className="hidden sm:inline">หน้าสุดท้าย</span>
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modern High-Fidelity Add/Edit Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs z-50 flex items-center justify-center md:p-4 overflow-hidden animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 rounded-none md:rounded-2xl shadow-xl border-0 md:border border-gray-200 dark:border-gray-700 max-w-2xl w-full h-full md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden transform transition-all animate-scaleUp">
            
            {/* Modal Header */}
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-primary-600" />
                <h2 className="text-base font-extrabold text-gray-800 dark:text-gray-200">
                  {isAdding ? "เพิ่มเงื่อนไข Master Commission Mapping ใหม่" : "แก้ไขเงื่อนไข Master Commission Mapping"}
                </h2>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); setIsAdding(false); }} 
                className="p-1 h-8 w-8 flex items-center justify-center hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-700 dark:text-gray-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 font-sans">รหัสสาขา (Branch Code) <span className="text-primary-500">*</span></label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all font-mono font-bold text-primary-600"
                    placeholder="เช่น BKK01"
                    value={editForm.branchCode || ""}
                    onChange={e => setEditForm({...editForm, branchCode: e.target.value})}
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">ใช้เป็น Unique Key ในการจับคู่หลัก</span>
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ชื่อลูกค้า / ผู้ส่ง (Sender Name)</label>
                  <textarea 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all font-semibold min-h-[80px]"
                    placeholder="ใส่รายชื่อผู้ส่ง คั่นด้วยเครื่องหมายคอมม่า (,) หรือขึ้นบรรทัดใหม่"
                    value={editForm.senderNameInput || ""}
                    onChange={e => setEditForm({...editForm, senderNameInput: e.target.value})}
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block italic">รองรับการใส่หลายชื่อเพื่อใช้ในการจับคู่ (คั่นด้วย , / ; หรือขึ้นบรรทัดใหม่)</span>
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">พื้นที่บริการ (Area Type)</label>
                  <select 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all text-gray-700 dark:text-gray-300 font-semibold bg-white dark:bg-gray-900 cursor-pointer"
                    value={editForm.areaType || "ALL"}
                    onChange={e => setEditForm({...editForm, areaType: e.target.value as 'ALL' | '9_PROVINCES' | '68_PROVINCES'})}
                  >
                    {masterData?.areaTypes.filter(t => t.isActive).map(t => (
                      <option key={t.id} value={t.aliases[0] || t.id}>{t.label}</option>
                    ))}
                    {!masterData?.areaTypes.length && (
                      <>
                        <option value="ALL">ทั้งหมด (Apply Both Rates)</option>
                        <option value="9_PROVINCES">เฉพาะ 9 จังหวัด</option>
                        <option value="68_PROVINCES">เฉพาะ 68 จังหวัด</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="col-span-2 md:col-span-1">
                  <CommissionRateInput
                    label="ค่าคอม 9 จังหวัด (% ตรง)"
                    value={editForm.commissionRate9Raw || ""}
                    onChange={val => setEditForm({...editForm, commissionRate9Raw: val})}
                    accentColor="secondary"
                    placeholder="เช่น 0.6 หรือ 1.0"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <CommissionRateInput
                    label="ค่าคอม 68 จังหวัด (% ตรง)"
                    value={editForm.commissionRate68Raw || ""}
                    onChange={val => setEditForm({...editForm, commissionRate68Raw: val})}
                    accentColor="primary"
                    placeholder="เช่น 0.6 หรือ 1.0"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">หมวดประเภทรายงาน (Report Type)</label>
                  <select 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all text-gray-700 dark:text-gray-300 font-semibold bg-white dark:bg-gray-900 cursor-pointer"
                    value={editForm.reportType || ""}
                    onChange={e => setEditForm({...editForm, reportType: e.target.value})}
                  >
                    <option value="">-- ไม่ระบุ --</option>
                    {masterData?.reportTypes.filter(t => t.isActive).map(t => (
                      <option key={t.id} value={t.aliases[0] || t.label.toUpperCase().replace(/\s+/g, '_')}>{t.label}</option>
                    ))}
                    {!masterData?.reportTypes.length && (
                      <>
                        <option value="DROP_POINT">Drop Point</option>
                        <option value="CALLIN">CALLIN</option>
                        <option value="RC_PICKUP">RC งานเข้ารับ</option>
                        <option value="ONLINE">ONLINE</option>
                        <option value="SALE_DRIVER">SALE DRIVER</option>
                        <option value="FULL_TRUCK_LOAD">Full Truck Load (FULL_TRUCK_LOAD)</option>
                        <option value="ECOMMERCE">E-Commerce (ECOMMERCE)</option>
                        <option value="TRUCK360">Truck 360 (TRUCK360)</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ผู้ดูแล (Supervisor)</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all text-gray-700 dark:text-gray-300"
                    placeholder="ระบุชื่อผู้ดูแล"
                    value={editForm.supervisor || ""}
                    onChange={e => setEditForm({...editForm, supervisor: e.target.value})}
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">กลุ่มลูกค้า (Customer Group)</label>
                    <select
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all text-gray-700 dark:text-gray-300 font-semibold bg-white dark:bg-gray-900 cursor-pointer"
                      value={editForm.customerGroup || ""}
                      onChange={e => {
                          setEditForm({...editForm, customerGroup: e.target.value});
                      }}
                    >
                      <option value="">-- ไม่ระบุ --</option>
                      {getCustomerGroupOptions().filter(opt => opt !== "ไม่ระบุ").map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">สายส่ง (Delivery Line)</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all"
                    placeholder="ระบุสายส่ง"
                    value={editForm.deliveryLine || ""}
                    onChange={e => setEditForm({...editForm, deliveryLine: e.target.value})}
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ทีม (Team)</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all"
                    value={editForm.team || ""}
                    onChange={e => setEditForm({...editForm, team: e.target.value})}
                    placeholder="เช่น Team A, Express B"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">พื้นที่ (Area)</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all"
                    value={editForm.area || ""}
                    onChange={e => setEditForm({...editForm, area: e.target.value})}
                    placeholder="ระบุพื้นที่ เช่น ภาคกลาง, ตะวันออก"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ลงบัญชีทีม (Accounting Team)</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all"
                    value={editForm.accountingTeam || ""}
                    onChange={e => setEditForm({...editForm, accountingTeam: e.target.value})}
                    placeholder="เช่น บัญชีแยกย่อย, สำนักงานใหญ่"
                  />
                </div>

                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">ผู้แนะนำระบบ (Booking Referral)</label>
                  <input 
                    type="text" 
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 md:py-2 text-xs focus:ring-2 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all"
                    value={editForm.bsBookingReferral || ""}
                    onChange={e => setEditForm({...editForm, bsBookingReferral: e.target.value})}
                    placeholder="ชื่อผู้แนะนำให้ค่าคอมพิเศษ"
                  />
                </div>
              </div>

              {/* Universal Validation and Simulation Preview Card */}
              <div className="col-span-2 space-y-3.5">
                <MappingValidation
                  commissionRate9={editForm.commissionRate9Raw || ""}
                  commissionRate68={editForm.commissionRate68Raw || ""}
                />
                
                <CommissionPreviewCard
                  commissionRate9={editForm.commissionRate9Raw || ""}
                  commissionRate68={editForm.commissionRate68Raw || ""}
                  shippingAmount={testShipping}
                />

                <div className="bg-white dark:bg-gray-900/85 p-3 rounded-xl border border-gray-150 flex items-center justify-between text-xs font-semibold">
                  <span className="text-gray-500">ปรับยอดสัญญาทดสอบจำลองด้านบน (บาท):</span>
                  <input 
                    type="number" 
                    className="w-28 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg py-1 px-2.5 text-xs font-mono font-black text-gray-700 dark:text-gray-300 text-right outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500" 
                    value={testShipping}
                    onChange={e => setTestShipping(Number(e.target.value || 0))}
                  />
                </div>
              </div>



            </div>

            {/* Modal Bottom Buttons Footer */}
            <div className="border-t border-gray-100 px-6 py-4 flex flex-col md:flex-row items-center justify-end gap-2 bg-gray-50 dark:bg-gray-800/50 mt-auto shrink-0 z-10 sticky bottom-0">
              <button 
                onClick={() => { setIsModalOpen(false); setIsAdding(false); }} 
                className="px-4 py-2.5 md:py-2 text-xs font-bold text-gray-500 rounded-lg hover:bg-gray-200 w-full md:w-auto text-center"
              >
                ย้อนกลับ / ปฏิเสธ
              </button>
              <button 
                onClick={handleSave} 
                className="px-5 py-2.5 md:py-2 text-xs font-bold bg-primary-600 hover:bg-primary-700 text-white rounded-lg flex items-center justify-center shadow-md shadow-primary-100 w-full md:w-auto"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                บันทึกและประมวลผลทันที
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
