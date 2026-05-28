import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, doc, setDoc, writeBatch, deleteDoc, updateDoc } from 'firebase/firestore';
import { useReportBranchGroups, resolveReportBranchGroup } from '../lib/MasterDataContext';
import { useToast } from '../lib/ToastContext';
import ResponsiveModal from './ResponsiveModal';
import { Loader2, Download, Plus, Save, X, Edit, AlertCircle, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatNumber, formatCurrency } from '../lib/utils';
import { getBranchCode, normalizeBranchName } from '../lib/branchMapping';

interface UnspecifiedTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  singleDate?: string; // If targeting a specific day in the report
  onMappingSuccess?: () => void;
}

// Extract field value trying multiple candidate keys
function getFieldValue(row: any, candidates: string[], fallback = ""): string {
  for (const field of candidates) {
    if (row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== "") {
      return String(row[field]).trim();
    }
  }
  return fallback;
}

function getProvinceGroupClient(province: string): string {
  const nineProvinces = ['กรุงเทพมหานคร', 'ชลบุรี', 'สมุทรปราการ', 'นครปฐม', 'สมุทรสาคร', 'ปทุมธานี', 'ราชบุรี', 'นนทบุรี', 'สมุทรสงคราม'];
  const pTrim = (p: any) => String(p || "").trim().replace(/\s+/g, "");
  return nineProvinces.some(np => pTrim(np) === pTrim(province)) ? "9_PROVINCES" : "68_PROVINCES";
}

// 1. Trace source data helper
export function traceBranchGroupSource(record: any) {
  const branchCode = getFieldValue(record, ['branchCode', 'branchId', 'originBranchCode', 'serviceBranchCode']) || getBranchCode(getFieldValue(record, ['branchName', 'branch', 'originBranch', 'serviceBranch']));
  const branchName = getFieldValue(record, ['branchName', 'branch', 'originBranch', 'serviceBranch']);
  const senderCode = getFieldValue(record, ['senderCode', 'senderId', 'customerCode', 'custCode']);
  const senderName = getFieldValue(record, ['senderName', 'sender', 'ผู้ส่ง', 'customerName', 'custName']);
  const trackingNo = getFieldValue(record, ['trackingNo', 'tracking', 'trackNo', 'orderNo', 'shipmentId']);
  const customerName = getFieldValue(record, ['customerName', 'customer', 'ผู้รับ', 'receiverName', 'recipientName']);
  const shipmentDate = getFieldValue(record, ['orderDate', 'createdDate', 'shipmentDate', 'date', 'reportDate']);
  const quantity = Number(record.quantity || record.totalQuantity || record.shipmentCount || 1);
  const amount = Number(record.orderTotal || record.totalOrder || record.amount || 0);
  const province = getFieldValue(record, ['province', 'provinceGroup', 'area', 'region', 'areaType']);

  return {
    branchCode,
    branchName,
    senderCode,
    senderName,
    trackingNo,
    customerName,
    shipmentDate,
    quantity,
    amount,
    province
  };
}

// 2. Identify mismatch reason
export function getUnspecifiedBranchGroupReason(record: any, branchMappings: any[] = []): string {
  const t = traceBranchGroupSource(record);
  const category = record.category || record.type || "";
  const owner = record.owner || record.team || record.sales || "";

  // Check if branch field is empty
  if (!t.branchName && !t.branchCode) {
    return "field สาขาว่าง";
  }

  // Check if province empty
  if (!t.province) {
    return "province ไม่ระบุ";
  }

  // Check branch mappings database
  if (branchMappings.length > 0) {
    const normalizedName = normalizeBranchName(t.branchName);
    const mapping = branchMappings.find(m => 
      normalizeBranchName(m.branchName) === normalizedName || 
      (m.branchCode && t.branchCode && m.branchCode === t.branchCode)
    );
    
    if (!mapping) {
      return "ไม่พบ branch code ใน Branch Mapping";
    }

    if (!mapping.reportBranchGroup || mapping.reportBranchGroup === "ไม่ระบุ" || mapping.reportBranchGroup === "ไม่ระบุกลุ่มสาขา") {
      if (!mapping.subBranch && !mapping.mainBranch && !owner) {
        return "owner/team ไม่ระบุ";
      }
      return "ไม่พบกลุ่มสาขาใน Mapping Config";
    }
  } else {
    // If mappings aren't loaded, rely on raw status
    if (record.mappingStatus === "unmapped") {
      return "ไม่พบ branch code ใน Branch Mapping";
    }
  }

  if (category && (category.includes("unmatched") || category.includes("unknown"))) {
    return "category ไม่ตรง";
  }

  // Check sender code
  if (!t.senderCode) {
    return "ไม่พบ senderCode ใน Mapping Config";
  }

  return "ไม่ระบุกลุ่มสาขาในระบบ";
}

export default function UnspecifiedTraceModal({
  isOpen,
  onClose,
  startDate,
  endDate,
  singleDate,
  onMappingSuccess
}: UnspecifiedTraceModalProps) {
  const toast = useToast();
  const reportBranchGroups = useReportBranchGroups();

  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState<any[]>([]);
  const [branchMappings, setBranchMappings] = useState<any[]>([]);
  
  // Quick editor state
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [mappedForm, setMappedForm] = useState<any>({
    branchName: '',
    branchCode: '',
    reportBranchGroup: '',
    mainBranch: '',
    subBranch: '',
    isMainRevenue: false,
    isNetwork: false,
    isDropPoint: false,
    isCallin: false,
    isOnline: false,
    isSaleDriver: false,
    isRcPickup: false,
    isFullTruckLoad: false,
    isEcommerce: false,
    is360Truck: false
  });
  const [savingMapping, setSavingMapping] = useState(false);
  const [reprocessingStatus, setReprocessingStatus] = useState<string>('');

  // Active dates for display/query
  const queryStart = singleDate || startDate;
  const queryEnd = singleDate || endDate;

  // Load raw unmapped data & mappings
  const reloadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch branch mappings
      const mSnap = await getDocs(collection(db, 'branchMappings'));
      const mappingsList = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBranchMappings(mappingsList);

      // 2. Fetch shipments
      const sRef = collection(db, 'shipments');
      const q = query(
        sRef,
        where('orderDate', '>=', queryStart),
        where('orderDate', '<=', queryEnd + 'T23:59:59.999Z')
      );
      const sSnap = await getDocs(q);
      const allShipments = sSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as any);

      // Filter unspecified shipments only
      const unspecifiedList = allShipments.filter(row => {
        // Evaluate resolving group label
        const group = resolveReportBranchGroup(row.reportBranchGroup || row.branchGroup, reportBranchGroups);
        const lower = String(group || "").trim().toLowerCase();
        
        const isUnspecified = 
          lower === "" || 
          lower === "ไม่ระบุ" || 
          lower === "ไม่ระบุกลุ่มสาขา" || 
          lower === "ไม่ระบุสาขา" || 
          lower === "ไม่ระบุผู้ส่ง" ||
          lower === "-" || 
          lower.includes("ไม่ระบุ") ||
          row.mappingStatus === "unmapped";

        return isUnspecified;
      });

      setShipments(unspecifiedList);
    } catch (error) {
      console.error("Failed to load trace records", error);
      toast.error("ดึงข้อมูลที่มาของไม่ระบุไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      reloadData();
      setEditTarget(null);
    }
  }, [isOpen, startDate, endDate, singleDate, reportBranchGroups]);

  // Compiled table rows
  const tracedRows = useMemo(() => {
    return shipments.map(record => {
      const trace = traceBranchGroupSource(record);
      const reason = getUnspecifiedBranchGroupReason(record, branchMappings);
      return {
        ...record,
        trace,
        reason
      };
    });
  }, [shipments, branchMappings]);

  // Aggregate statistics
  const stats = useMemo(() => {
    if (tracedRows.length === 0) return { count: 0, uniqueSenders: 0, uniqueBranches: 0, totalAmount: 0, topReason: 'N/A' };

    const senders = new Set<string>();
    const branches = new Set<string>();
    let total = 0;
    const reasonCounts: Record<string, number> = {};

    tracedRows.forEach(r => {
      if (r.trace.senderCode) senders.add(r.trace.senderCode);
      if (r.trace.branchCode) branches.add(r.trace.branchCode);
      if (r.trace.branchName && !r.trace.branchCode) branches.add(r.trace.branchName);
      total += r.trace.amount;

      reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + 1;
    });

    let topReason = '';
    let maxCount = -1;
    Object.entries(reasonCounts).forEach(([r, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topReason = r;
      }
    });

    return {
      count: tracedRows.length,
      uniqueSenders: senders.size,
      uniqueBranches: branches.size,
      totalAmount: total,
      topReason
    };
  }, [tracedRows]);

  // Handle opening mapping config form
  const handleOpenMappingForm = (row: any) => {
    const t = row.trace;
    const branchCode = t.branchCode || getBranchCode(t.branchName) || "BM_" + Math.random().toString(36).substring(2, 7).toUpperCase();
    
    // Find matching branchMapping if any to prefill
    const existing = branchMappings.find(m => m.branchCode === branchCode || normalizeBranchName(m.branchName) === normalizeBranchName(t.branchName));

    setEditTarget(row);
    setMappedForm({
      branchName: t.branchName || existing?.branchName || '',
      branchCode: branchCode || existing?.branchCode || '',
      reportBranchGroup: existing?.reportBranchGroup || '',
      mainBranch: existing?.mainBranch || '',
      subBranch: existing?.subBranch || '',
      isMainRevenue: existing?.isMainRevenue || false,
      isNetwork: existing?.isNetwork || false,
      isDropPoint: existing?.isDropPoint || (branchCode.startsWith('DP') || branchCode.startsWith('DPN') || branchCode.startsWith('DPS') || branchCode.startsWith('DPB')) || false,
      isCallin: existing?.isCallin || false,
      isOnline: existing?.isOnline || false,
      isSaleDriver: existing?.isSaleDriver || false,
      isRcPickup: existing?.isRcPickup || false,
      isFullTruckLoad: existing?.isFullTruckLoad || false,
      isEcommerce: existing?.isEcommerce || false,
      is360Truck: existing?.is360Truck || false
    });
  };

  // Save Branch Mapping and Reprocess Shipments + Summaries on the fly
  const handleSaveMapping = async () => {
    if (!mappedForm.branchName) {
      toast.error("กรุณาระบุชื่อสาขา");
      return;
    }
    if (!mappedForm.reportBranchGroup) {
      toast.error("กรุณาเลือกกลุ่มสาขารายงาน");
      return;
    }

    setSavingMapping(true);
    setReprocessingStatus("กำลังบันทึกข้อมูลการจับคู่สาขา...");
    try {
      const id = mappedForm.branchCode || mappedForm.branchName;
      const ref = doc(db, 'branchMappings', id);
      
      const payload = {
        ...mappedForm,
        // Auto flags based on chosen reportBranchGroup if needed, or stick to form values
        isMainRevenue: mappedForm.isMainRevenue || mappedForm.reportBranchGroup.includes('DC') || false,
        isNetwork: mappedForm.isNetwork || mappedForm.reportBranchGroup === 'เครือข่าย',
        isDropPoint: mappedForm.isDropPoint || mappedForm.reportBranchGroup === 'Drop Point',
        isCallin: mappedForm.isCallin || mappedForm.reportBranchGroup.includes('CALLIN'),
        isOnline: mappedForm.isOnline || mappedForm.reportBranchGroup.includes('ONLINE'),
        isSaleDriver: mappedForm.isSaleDriver || mappedForm.reportBranchGroup.includes('SaleDriver'),
        isRcPickup: mappedForm.isRcPickup || mappedForm.reportBranchGroup.includes('งานเข้ารับ'),
        isFullTruckLoad: mappedForm.isFullTruckLoad || mappedForm.reportBranchGroup === 'งานเหมาคัน',
        isEcommerce: mappedForm.isEcommerce || mappedForm.reportBranchGroup === 'E-COMMERCE',
        is360Truck: mappedForm.is360Truck || mappedForm.reportBranchGroup === '360TRUCK'
      };

      // 1. Save branch mapping config
      await setDoc(ref, payload, { merge: true });
      
      // 2. Query and reprocess matched shipments in the date range
      setReprocessingStatus("กำลังตรวจสอบรายการพัสดุและจัดเก็บกลุ่มใหม่...");
      const sRef = collection(db, 'shipments');
      const qRange = query(
        sRef,
        where('orderDate', '>=', queryStart),
        where('orderDate', '<=', queryEnd + 'T23:59:59.999Z')
      );
      const sSnap = await getDocs(qRange);
      const allRangeShipments = sSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any);

      // Filter shipments matching the mapped branch name or code
      const targetNameNormalized = normalizeBranchName(mappedForm.branchName);
      const targetCode = String(mappedForm.branchCode || "").trim().toUpperCase();

      const matchedShipments = allRangeShipments.filter((item: any) => {
        const itemBranchNameNormalized = normalizeBranchName(item.branchName || item.branch);
        const itemBranchCode = String(item.branchCode || item.branchId || "").trim().toUpperCase();
        
        return (
          itemBranchNameNormalized === targetNameNormalized ||
          (targetCode !== "" && itemBranchCode === targetCode)
        );
      });

      if (matchedShipments.length > 0) {
        setReprocessingStatus(`กำลังอัปเดตกลุ่มสาขาพัสดุ ${matchedShipments.length} รายการในฐานข้อมูล...`);
        
        // Write updates in batches of up to 400
        const updateBatchesCount = Math.ceil(matchedShipments.length / 400);
        for (let batchIdx = 0; batchIdx < updateBatchesCount; batchIdx++) {
          const chunk = matchedShipments.slice(batchIdx * 400, (batchIdx + 1) * 400);
          const chunkBatch = writeBatch(db);
          
          chunk.forEach((shipment: any) => {
            const shipmentDocRef = doc(db, 'shipments', shipment.id);
            chunkBatch.update(shipmentDocRef, {
              mappedBranchCode: payload.branchCode,
              mainBranch: payload.mainBranch || "",
              subBranch: payload.subBranch || "",
              reportBranchGroup: payload.reportBranchGroup,
              branchGroup: payload.reportBranchGroup,
              isMainRevenue: payload.isMainRevenue,
              isNetwork: payload.isNetwork,
              isDropPoint: payload.isDropPoint,
              isCallin: payload.isCallin,
              isOnline: payload.isOnline,
              isSaleDriver: payload.isSaleDriver,
              isRcPickup: payload.isRcPickup,
              isFullTruckLoad: payload.isFullTruckLoad,
              isEcommerce: payload.isEcommerce,
              is360Truck: payload.is360Truck,
              mappingStatus: "mapped"
            });
          });
          
          await chunkBatch.commit();
        }

        // 3. Re-aggregate summaries for affected dates
        const uniqueDates = Array.from(new Set(matchedShipments.map((s: any) => {
          const rawDate = s.orderDate || s.createdDate || s.shipmentDate || s.date;
          return rawDate ? String(rawDate).split('T')[0] : '';
        }).filter(Boolean))) as string[];

        for (const date of uniqueDates) {
          setReprocessingStatus(`กำลังตรวจสอบคำนวณและปรับยอดรายงานประจำวันที่ ${date}...`);
          
          // Re-fetch all shipments of this date to do clean totals aggregation
          const dayQuery = query(
            collection(db, 'shipments'),
            where('orderDate', '>=', date),
            where('orderDate', '<=', date + 'T23:59:59.999Z')
          );
          const daySnap = await getDocs(dayQuery);
          const dayShipments = daySnap.docs.map(d => d.data() as any);

          const groups = new Map();

          dayShipments.forEach((data: any) => {
            const resolvedGroup = resolveReportBranchGroup(data.reportBranchGroup || data.branchGroup, reportBranchGroups) || "ไม่ระบุกลุ่มสาขา";

            if (!groups.has(resolvedGroup)) {
              groups.set(resolvedGroup, {
                reportDate: date,
                reportBranchGroup: resolvedGroup,
                mainBranch: data.mainBranch || "",
                subBranch: data.subBranch || "",
                reportType: data.reportType || "",
                provinceGroup: getProvinceGroupClient(data.province),
                isNineProvince: getProvinceGroupClient(data.province) === "9_PROVINCES",
                totalOrder: 0,
                prepaidTotal: 0,
                postpaidTotal: 0,
                totalCod: 0,
                totalQuantity: 0,
                totalBills: 0,
                trackingSet: new Set(),
                orderNoSet: new Set(),
                
                isMainRevenue: data.isMainRevenue || false,
                isNetwork: data.isNetwork || false,
                isDropPoint: data.isDropPoint || false,
                isCallin: data.isCallin || false,
                isOnline: data.isOnline || false,
                isSaleDriver: data.isSaleDriver || false,
                isRcPickup: data.isRcPickup || false,
                isFullTruckLoad: data.isFullTruckLoad || false,
                isEcommerce: data.isEcommerce || false,
                is360Truck: data.is360Truck || false,
                lineType: data.lineType || "",
                branchType: data.branchType || ""
              });
            }

            const stat = groups.get(resolvedGroup);
            const orderTotal = Number(data.orderTotal) || 0;
            stat.totalOrder += orderTotal;

            if (String(data.type || "").includes('ต้นทาง')) {
              stat.prepaidTotal += orderTotal;
            } else if (String(data.type || "").includes('ปลายทาง')) {
              stat.postpaidTotal += orderTotal;
            }

            stat.totalCod += (Number(data.codAmount) || 0);
            stat.totalQuantity += (Number(data.quantity) || 0);

            if (data.orderNo) stat.orderNoSet.add(data.orderNo);
            if (data.trackingNo) stat.trackingSet.add(data.trackingNo);
          });

          // Write recalculated summaries and clean old unspecified summaries for this date
          let summaryBatch = writeBatch(db);
          let sumCount = 0;

          const legacyUnspecifiedKeys = ['ไม่ระบุ', 'ไม่ระบุกลุ่มสาขา', 'UNMAPPED', '-', 'ไม่ระบุสาขา', 'ไม่ระบุผู้ส่ง'];
          for (const k of legacyUnspecifiedKeys) {
            const safeKey = k.replace(/[\/\\]/g, '-').replace(/\s+/g, '_');
            const docId = `${date}_${safeKey}`;
            summaryBatch.delete(doc(db, 'dailyBranchSummaries', docId));
            sumCount++;
          }

          for (const [groupKey, stat] of groups.entries()) {
            stat.totalTracking = stat.trackingSet.size;
            stat.totalBills = stat.orderNoSet.size;
            delete stat.trackingSet;
            delete stat.orderNoSet;

            const safeKey = groupKey.replace(/[\/\\]/g, '-').replace(/\s+/g, '_');
            const docId = `${date}_${safeKey}`;
            summaryBatch.set(doc(db, 'dailyBranchSummaries', docId), stat, { merge: true });
            
            sumCount++;
            if (sumCount >= 400) {
              await summaryBatch.commit();
              summaryBatch = writeBatch(db);
              sumCount = 0;
            }
          }

          if (sumCount > 0) {
            await summaryBatch.commit();
          }
        }
      }

      toast.success("บันทึกการจับคู่สาขา พร้อมประมวลผลข้อมูลใหม่สำเร็จ!");
      setEditTarget(null);
      
      // Invalidate session configs to trigger reload
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('report_')) {
          sessionStorage.removeItem(key);
        }
      });

      // Reload local trace modal shipments to see decreased count
      reloadData();

      if (onMappingSuccess) {
        onMappingSuccess();
      }
    } catch (err) {
      console.error(err);
      toast.error("เกิดข้อผิดพลาดในการประมวลผลข้อมูลรายงานใหม่");
    } finally {
      setSavingMapping(false);
      setReprocessingStatus('');
    }
  };

  // Excel Exporter for Unspecified
  const handleExportExcel = () => {
    if (tracedRows.length === 0) {
      toast.error("ไม่มีข้อมูลที่จะส่งออก");
      return;
    }

    const mappedData = tracedRows.map((row, index) => ({
      'ลำดับ': index + 1,
      'วันที่': row.trace.shipmentDate || '-',
      'รหัสสาขา': row.trace.branchCode || '-',
      'ชื่อสาขา': row.trace.branchName || '-',
      'รหัสผู้ส่ง (senderCode)': row.trace.senderCode || '-',
      'ชื่อผู้ส่ง (senderName)': row.trace.senderName || '-',
      'หมายเลขพัสดุ (trackingNo)': row.trace.trackingNo || '-',
      'ชื่อผู้รับ (customerName)': row.trace.customerName || '-',
      'จังหวัด/พื้นที่': row.trace.province || '-',
      'จำนวน shipment': row.trace.quantity,
      'ยอดเงินรวม': row.trace.amount,
      'สาเหตุที่ไม่ระบุกลุ่ม': row.reason
    }));

    const ws = XLSX.utils.json_to_sheet(mappedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Unmapped_Report");
    XLSX.writeFile(wb, `รายการไม่ระบุกุมสาขา_${queryStart}_ถึง_${queryEnd}.xlsx`);
    toast.success("ดาวน์โหลด Excel สำเร็จ!");
  };

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={`🔍 ที่มาและรายการไม่ระบุกลุ่มสาขา (${queryStart === queryEnd ? queryStart : `${queryStart} ถึง ${queryEnd}`})`}
      maxWidth="7xl"
    >
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
          <span className="text-xs text-gray-500 font-medium">กำลังสืบค้นที่มาและวิเคราะห์สาเหตุเชิงลึก...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Unspecified stats summary panel */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">จำนวนรายการไม่ระบุ</span>
              <span className="text-xl font-extrabold text-amber-800 dark:text-amber-300 font-mono">{formatNumber(stats.count)}</span>
              <span className="text-[9px] text-gray-500">shipments</span>
            </div>
            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/50 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-orange-600 dark:text-orange-400 font-bold font-sans">จำนวนผู้ฝากส่งไม่ซ้ำ</span>
              <span className="text-xl font-extrabold text-orange-800 dark:text-orange-300 font-mono">{formatNumber(stats.uniqueSenders)}</span>
              <span className="text-[9px] text-gray-500">senderCode</span>
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">จำนวนสาขาที่ไม่ซ้ำ</span>
              <span className="text-xl font-extrabold text-blue-800 dark:text-blue-300 font-mono">{formatNumber(stats.uniqueBranches)}</span>
              <span className="text-[9px] text-gray-500">สาขาที่พบในบิล</span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold font-sans">ยอดเงินรวม</span>
              <span className="text-xl font-extrabold text-emerald-800 dark:text-emerald-300 font-mono">{formatCurrency(stats.totalAmount)}</span>
              <span className="text-[9px] text-gray-500">บาท</span>
            </div>
            <div className="col-span-2 md:col-span-1 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 p-3 rounded-xl flex flex-col gap-0.5">
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">สาเหตุหลักที่พบบ่อยสุด</span>
              <span className="text-xs font-bold text-rose-800 dark:text-rose-300 leading-tight mt-1">{stats.topReason}</span>
              <span className="text-[9px] text-gray-500">ต้องการการแก้ไขด่วน</span>
            </div>
          </div>

          {/* Edit mapping panel inline if target is active */}
          {editTarget && (
            <div className="bg-white dark:bg-gray-800 border-2 border-primary-500 rounded-xl p-4 shadow-md flex flex-col gap-3 relative animate-in fade-in slide-in-from-top-4 duration-200">
              <button onClick={() => setEditTarget(null)} className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
              
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-5 h-5 text-primary-600 shrink-0" />
                <h3 className="text-xs font-extrabold text-gray-800 dark:text-gray-200">
                  🛠️ แก้ไข / กำหนด Branch Mapping สำหรับสาขา: <span className="text-primary-700 bg-primary-50 px-2 py-0.5 rounded font-mono">{editTarget.trace.branchName} ({editTarget.trace.branchCode || 'ไม่มีรหัส'})</span>
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-gray-600 dark:text-gray-400">ชื่อสาขา (ข้อมูลสั่งส่ง)</span>
                  <input
                    type="text"
                    value={mappedForm.branchName}
                    onChange={e => setMappedForm((p: any) => ({ ...p, branchName: e.target.value }))}
                    className="border rounded px-2.5 py-1.5 bg-gray-50 focus:outline-none focus:border-primary-400"
                    placeholder="ใส่ชื่อสาขา"
                    readOnly
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-gray-600 dark:text-gray-400 font-sans">รหัสสาขา (Branch Code)</span>
                  <input
                    type="text"
                    value={mappedForm.branchCode}
                    disabled={savingMapping}
                    onChange={e => setMappedForm((p: any) => ({ ...p, branchCode: e.target.value }))}
                    className="border rounded px-2.5 py-1.5 focus:outline-none focus:border-primary-400 disabled:opacity-55"
                    placeholder="รหัสสาขา"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-bold text-amber-700 dark:text-amber-400 font-extrabold">กลุ่มสาขาที่จะจัดลงรายงาน *</span>
                  <select
                    value={mappedForm.reportBranchGroup}
                    disabled={savingMapping}
                    onChange={e => setMappedForm((p: any) => ({ ...p, reportBranchGroup: e.target.value }))}
                    className="border-2 border-amber-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-primary-400 bg-amber-50 font-bold text-gray-700 disabled:opacity-55"
                  >
                    <option value="">-- เลือกกลุ่มสาขา --</option>
                    {reportBranchGroups.filter(g => g.label !== "ไม่ระบุ").map(g => (
                      <option key={g.id} value={g.label}>{g.label}</option>
                    ))}
                  </select>
                </div>
                
                {reprocessingStatus && (
                  <div className="md:col-span-4 bg-amber-50 dark:bg-amber-950/45 text-amber-800 dark:text-amber-300 border border-amber-20px p-2.5 rounded-lg text-[11px] font-bold flex items-center gap-2 animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{reprocessingStatus}</span>
                  </div>
                )}
                
                <div className="flex flex-md-row gap-2 md:items-end">
                  <button
                    onClick={handleSaveMapping}
                    disabled={savingMapping}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold h-[34px] flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    {savingMapping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    บันทึก Mapping
                  </button>
                  <button
                    onClick={() => setEditTarget(null)}
                    disabled={savingMapping}
                    className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded font-medium h-[34px] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toolbar actions */}
          <div className="flex items-center justify-between shrink-0 bg-gray-100/50 dark:bg-gray-800/30 p-2.5 rounded-lg">
            <div className="text-[10px] text-gray-500 font-semibold">
              แสดงพัสดุที่ไม่ระบุกลุ่มสาขา {tracedRows.length} รายการ
            </div>
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border rounded text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              Export รายการไม่ระบุ
            </button>
          </div>

          {/* Shipments Details Table */}
          <div className="border rounded-lg overflow-x-auto bg-white dark:bg-gray-950 max-h-[45vh] shadow-inner">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 text-left">
              <thead className="bg-gray-50 dark:bg-black sticky top-0 z-10 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-center w-12">#</th>
                  <th className="px-3 py-2">วันที่สั่ง</th>
                  <th className="px-3 py-2">ชื่อสาขา (ข้อมูลดิบ)</th>
                  <th className="px-3 py-2">รหัสสาขา</th>
                  <th className="px-3 py-2">ผู้ส่ง (senderName/Code)</th>
                  <th className="px-3 py-2">เลขพัสดุ (tracking)</th>
                  <th className="px-3 py-2">ผู้รับ (customer)</th>
                  <th className="px-3 py-2 text-right">ยอดเงิน</th>
                  <th className="px-3 py-2">วิเคราะห์สาเหตุที่ไม่ระบุกลุ่ม</th>
                  <th className="px-3 py-2 text-center w-24">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-[11px] text-gray-600 dark:text-gray-300">
                {tracedRows.map((row, i) => (
                  <tr key={row.id || i} className="hover:bg-amber-50/40 dark:hover:bg-amber-950/10 transition-colors">
                    <td className="px-3 py-2 text-center font-mono text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{row.trace.shipmentDate || '-'}</td>
                    <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-100">{row.trace.branchName || '-'}</td>
                    <td className="px-3 py-2 font-mono">{row.trace.branchCode || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-700 dark:text-gray-200">{row.trace.senderName || '-'}</div>
                      <div className="text-[9px] text-gray-400 font-mono">{row.trace.senderCode || '-'}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-primary-600 dark:text-primary-400 select-all font-semibold">{row.trace.trackingNo || '-'}</td>
                    <td className="px-3 py-2 whitespace-nowrap max-w-[120px] truncate" title={row.trace.customerName}>{row.trace.customerName || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">{formatCurrency(row.trace.amount)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                        ⚠️ {row.reason}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleOpenMappingForm(row)}
                        className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded text-[9px] flex items-center gap-1 transition-colors mx-auto cursor-pointer"
                        title="คลิกเพื่อสร้างหรือปรับการแมปสาขานี้"
                      >
                        <Plus className="w-2.5 h-2.5" /> แก้ Mapping
                      </button>
                    </td>
                  </tr>
                ))}
                {tracedRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-xs text-gray-500 font-bold">
                      🎉 เยี่ยมมาก! ไม่พบรายการที่ไม่ระบุในช่วงวันที่นี้เลย ข้อมูลจับคู่กลุ่มสาขาครบถูกต้องสมบูรณ์
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
