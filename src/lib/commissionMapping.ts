import { normalizeCustomerGroup } from './customerGroupService';

export interface CommissionMapping {
  id?: string;
  branchCode: string;
  senderNames: string[];
  senderNameText: string;
  senderName?: string;
  areaType?: "9_PROVINCES" | "68_PROVINCES" | "ALL";
  commissionRate9?: number;
  commissionRate68?: number;
  customerGroup?: string;
  accountingTeam?: string;
  supervisor?: string;
  deliveryLine?: string;
  team?: string; 
  isActive?: boolean;
  bsBookingReferral?: string;
  mappingStatus?: string;
  reportType?: string;
  area?: string;
  bookingReferral?: string;
  isArchived?: boolean;
  archivedAt?: any;
  archivedBy?: string;
}

export const NINE_PROVINCES = [
  "กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี", "สมุทรปราการ", 
  "สมุทรสาคร", "นครปฐม", "สมุทรสงคราม", "พระนครศรีอยุธยา", "ฉะเชิงเทรา"
];

export function isNineProvince(province: string): boolean {
  if (!province) return false;
  const p = normalizeText(province);
  return NINE_PROVINCES.some(np => normalizeText(np) === p);
}

export async function getCachedCommissionMappings() {
  const cacheKey = 'bs_commission_mappings';
  const cached = localStorage.getItem(cacheKey);
  const cacheTime = localStorage.getItem(cacheKey + '_time');
  
  // Cache for 1 hour to aggressively save quota
  const isFresh = cacheTime && (Date.now() - Number(cacheTime)) < 60 * 60 * 1000;

  if (cached && isFresh) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      localStorage.removeItem(cacheKey);
    }
  }

  try {
    const { db } = await import('./firebase');
    const { collection, getDocs } = await import('firebase/firestore');
    const q = collection(db, 'commissionMappings');
    const snap = await getDocs(q);
    const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(cacheKey + '_time', Date.now().toString());
    return data;
  } catch (error: any) {
    console.error('Failed to fetch commission mappings', error);
    // If quota exceeded, return stale cache if available
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return [];
      }
    }
  }
  return [];
}

export function clearCommissionMappingCache() {
  localStorage.removeItem('bs_commission_mappings');
  localStorage.removeItem('bs_commission_mappings_time');
}

export function normalizeText(value: any) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizeReportType(type: string): string {
  if (!type) return "";
  const lower = type.trim().toLowerCase();
  if (lower === "drop point" || lower === "drop_point" || lower === "droppoint" || lower === "dp" || lower === "drop_point_only") {
    return "DROP_POINT";
  }
  if (lower === "rc_pickup" || lower === "rc งานเข้ารับ" || lower === "rc pickup" || lower === "rc_work_pickup") {
    return "RC_PICKUP";
  }
  if (lower === "callin" || lower === "call_in") {
    return "CALLIN";
  }
  if (lower === "sale_driver" || lower === "sale driver" || lower === "saledriver") {
    return "SALE_DRIVER";
  }
  if (lower === "online" || lower === "online_delivery") {
    return "ONLINE";
  }
  if (lower === "full_truck_load" || lower === "full truck load" || lower === "ftl" || lower === "booking") {
    return "FULL_TRUCK_LOAD";
  }
  if (lower === "ecommerce" || lower === "e-commerce") {
    return "ECOMMERCE";
  }
  if (lower === "truck360" || lower === "truck 360" || lower === "360truck") {
    return "TRUCK360";
  }
  return type.toUpperCase().replace(/\s+/g, '_');
}

export function resolveReportType(row: any): string {
  if (!row) return "";
  const raw = row.reportType || 
              (row.isDropPoint ? "DROP_POINT" : "") || 
              (row.isRcPickup ? "RC_PICKUP" : "") || 
              (row.isCallin ? "CALLIN" : "") || 
              (row.isSaleDriver ? "SALE_DRIVER" : "") || 
              (row.isOnline ? "ONLINE" : "") || 
              (row.isFullTruckLoad ? "FULL_TRUCK_LOAD" : "") || 
              (row.isEcommerce ? "ECOMMERCE" : "") || 
              (row.is360Truck || row.isTruck360 ? "TRUCK360" : "");
  return normalizeReportType(raw);
}

export function parseMoney(value: any): number {
  if (value === null || value === undefined || value === "") return 0;

  const text = String(value)
    .replace(/,/g, "")
    .replace(/บาท/g, "")
    .trim();

  const num = Number(text);

  return isNaN(num) ? 0 : num;
}

export async function createAuditLog(action: string, details: any, userEmail: string | null) {
  try {
    const { db } = await import('./firebase');
    const { collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    await addDoc(collection(db, 'commissionAuditLogs'), {
      action,
      details,
      userEmail: userEmail || 'unknown',
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

export function parsePercentageRate(value: any): number {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return value;
  }

  const text = String(value)
    .trim()
    .replace(/%/g, "")
    .replace(/,/g, "")
    .trim();

  const num = Number(text);
  return isNaN(num) ? 0 : num;
}

export function parseCommissionRate(value: any): number {
  return parsePercentageRate(value);
}

export function formatCommissionRate(value: any): string {
  const num = Number(value || 0);
  return `${num.toFixed(2)}%`;
}

export function calculateCommission(shippingAmount: number, rate: number): number {
  return Number(shippingAmount || 0) * (Number(rate || 0) / 100);
}

export async function triggerReprocessCommission(onProgress?: (current: number, total: number) => void) {
  const { db } = await import('./firebase');
  const { collection, getDocs, doc, setDoc, writeBatch, query, limit, orderBy, startAfter } = await import('firebase/firestore');

  // 1. Fetch mappings
  const qMap = collection(db, 'commissionMappings');
  const snapMap = await getDocs(qMap);
  const masterMappings = snapMap.docs.map(d => ({ id: d.id, ...d.data() as any }));

  let lastDoc = null;
  let hasMore = true;
  let processedRows = 0;
  let mappedRows = 0;
  let unmappedRows = 0;
  let updatedRows = 0;

  const PAGE_SIZE = 500;

  // Track mapping usage stats dynamically in memory
  const usageMap: Record<string, { usageCount: number; lastUsedAt: string | null }> = {};
  masterMappings.forEach(m => {
    usageMap[m.id] = { usageCount: 0, lastUsedAt: null };
  });

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

    for (const s of shipmentsBatch) {
      processedRows++;
      const enriched = enrichShipmentWithCommissionMapping(s, masterMappings);

      if (enriched.commissionMappingStatus === "mapped") {
        mappedRows++;
        if (enriched.commissionMappingId) {
          const mId = enriched.commissionMappingId;
          if (!usageMap[mId]) {
            usageMap[mId] = { usageCount: 0, lastUsedAt: null };
          }
          usageMap[mId].usageCount += 1;

          const rawDate = s.orderDate || s.createdDate || s.shipmentDate || s.importDate || s.date || null;
          if (rawDate) {
            let dateStr = "";
            if (typeof rawDate === 'string') {
              dateStr = rawDate.slice(0, 10);
            } else if (rawDate && typeof rawDate.toDate === 'function') {
              dateStr = rawDate.toDate().toISOString().slice(0, 10);
            } else {
              dateStr = String(rawDate).slice(0, 10);
            }
            if (dateStr && (!usageMap[mId].lastUsedAt || dateStr > usageMap[mId].lastUsedAt)) {
              usageMap[mId].lastUsedAt = dateStr;
            }
          }
        }
      } else {
        unmappedRows++;
      }

      const dataToUpdate = { ...enriched };
      delete dataToUpdate.id;

      const docRef = doc(db, 'shipments', s.id);
      batch.update(docRef, dataToUpdate);

      opCount++;
      updatedRows++;

      if (opCount >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    if (onProgress) {
      // Provide active status updates using processedRows
      onProgress(processedRows, processedRows + (snapShip.docs.length < PAGE_SIZE ? 0 : PAGE_SIZE));
    }

    if (snapShip.docs.length < PAGE_SIZE) {
      hasMore = false;
    }
  }

  // Write usage statistical outputs to commissionMappingUsage summary collection
  let usageBatch = writeBatch(db);
  let usageOpCount = 0;

  for (const mappingId of Object.keys(usageMap)) {
    const statsObj = usageMap[mappingId];
    const uRef = doc(db, 'commissionMappingUsage', mappingId);

    usageBatch.set(uRef, {
      mappingId,
      usageCount: statsObj.usageCount,
      lastUsedAt: statsObj.lastUsedAt,
      updatedAt: new Date()
    }, { merge: true });

    usageOpCount++;
    if (usageOpCount >= 400) {
      await usageBatch.commit();
      usageBatch = writeBatch(db);
      usageOpCount = 0;
    }
  }

  if (usageOpCount > 0) {
    await usageBatch.commit();
  }

  await setDoc(doc(collection(db, 'importBatches')), {
    type: 'REPROCESS',
    message: 'คำนวณค่าคอมใหม่',
    processedRows,
    mappedRows,
    unmappedRows,
    updatedRows,
    createdAt: new Date(),
    importedAt: new Date()
  });

  return { processedRows, mappedRows, unmappedRows, updatedRows };
}

export async function recalculateAllMappingUsages() {
  const { db } = await import('./firebase');
  const { collection, getDocs, doc, setDoc, query, where, writeBatch, orderBy, limit } = await import('firebase/firestore');
  const { getCountFromServer } = await import('firebase/firestore');

  const mappingsSnap = await getDocs(collection(db, 'commissionMappings'));
  const mappings = mappingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let batch = writeBatch(db);
  let opCount = 0;

  for (const m of mappings) {
    const qShipRef = query(collection(db, 'shipments'), where('commissionMappingId', '==', m.id));
    const countSnap = await getCountFromServer(qShipRef);
    const count = countSnap.data().count;

    let lastUsedAt: string | null = null;
    try {
      const lastDocSnap = await getDocs(query(
        collection(db, 'shipments'),
        where('commissionMappingId', '==', m.id),
        orderBy('orderDate', 'desc'),
        limit(1)
      ));
      if (!lastDocSnap.empty) {
        const d = lastDocSnap.docs[0].data();
        const rawDate = d.orderDate || d.createdDate || d.shipmentDate || d.importDate || d.date;
        if (rawDate) {
          lastUsedAt = String(rawDate).slice(0, 10);
        }
      }
    } catch (err) {
      // Fallback query if index is not deployed yet or has issue
      const fallbackSnap = await getDocs(query(
        collection(db, 'shipments'),
        where('commissionMappingId', '==', m.id),
        limit(30)
      ));
      let maxDate = '';
      fallbackSnap.forEach(docSnap => {
        const d = docSnap.data();
        const rawDate = d.orderDate || d.createdDate || d.shipmentDate || d.importDate || d.date;
        if (rawDate) {
          const ds = String(rawDate).slice(0, 10);
          if (ds > maxDate) maxDate = ds;
        }
      });
      if (maxDate) lastUsedAt = maxDate;
    }

    const usageRef = doc(db, 'commissionMappingUsage', m.id);
    batch.set(usageRef, {
      mappingId: m.id,
      usageCount: count,
      lastUsedAt: lastUsedAt,
      updatedAt: new Date()
    }, { merge: true });

    opCount++;
    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }
}

export function getFriendlyCustomerGroup(reportType: string): string {
  if (!reportType) return "ไม่ระบุ";
  return normalizeCustomerGroup(reportType);
}

export function getSingleMappingMatch(shipment: any, commissionMappings: CommissionMapping[]): { mapping: CommissionMapping | null, unmatchedReason: string } {
  const activeMappings = commissionMappings.filter(m => m.isActive !== false && m.isArchived !== true);
  
  if (activeMappings.length === 0) {
    return { mapping: null, unmatchedReason: 'ไม่มีข้อมูลแผนผังจัดกลุ่มค่าคอมมิชชั่นในระบบ' };
  }

  const sSenderName = normalizeText(shipment.senderName);
  const sBranchName = normalizeText(shipment.branchName);
  let sMappedBranchCode = normalizeText(shipment.mappedBranchCode);
  let sBranchCode = normalizeText(shipment.branchCode);
  let sSenderCode = normalizeText(shipment.senderCode);

  // Extract branchCode from branchName if empty, '-' or 'N/A'
  const regMatch = String(shipment.branchName || "").match(/^[A-Z0-9]+/);
  const extractedCode = regMatch ? regMatch[0] : "";

  if ((!sMappedBranchCode || sMappedBranchCode === "N/A" || sMappedBranchCode === "-") && extractedCode) {
    sMappedBranchCode = extractedCode.toUpperCase();
  }
  if ((!sBranchCode || sBranchCode === "N/A" || sBranchCode === "-") && extractedCode) {
    sBranchCode = extractedCode.toUpperCase();
  }
  if ((!sSenderCode || sSenderCode === "N/A" || sSenderCode === "-") && extractedCode) {
    sSenderCode = extractedCode.toUpperCase();
  }

  const getMappingSenders = (m: CommissionMapping): string[] => {
    const list: string[] = [];
    if (m.senderNames && Array.isArray(m.senderNames)) {
      m.senderNames.forEach(n => { if (n) list.push(normalizeText(n)); });
    }
    if (m.senderName) {
      list.push(normalizeText(m.senderName));
    }
    if (m.senderNameText) {
      m.senderNameText.split(/[,\n]/).forEach(n => {
        if (n.trim()) list.push(normalizeText(n));
      });
    }
    return Array.from(new Set(list));
  };

  // Find mappings where branchCode matches ANY of our shipment code fields
  const branchMatches = activeMappings.filter(m => {
    const mBranchCode = normalizeText(m.branchCode);
    return mBranchCode && (
      mBranchCode === sMappedBranchCode || 
      mBranchCode === sBranchCode || 
      mBranchCode === sSenderCode
    );
  });

  // 1. SPECIFIC MATCH: Branch code matches AND sender name matches restricted senders
  if (branchMatches.length > 0) {
    const codeAndSenderMatch = branchMatches.find(m => {
      const senders = getMappingSenders(m);
      if (senders.length === 0) return false;
      return senders.some(name => name === sSenderName || name === sBranchName);
    });
    if (codeAndSenderMatch) {
      return { mapping: codeAndSenderMatch, unmatchedReason: '' };
    }

    // 2. GENERAL MATCH: Branch code matches AND mapping has NO sender restrictions
    const codeOnlyMatch = branchMatches.find(m => {
      const senders = getMappingSenders(m);
      return senders.length === 0;
    });
    if (codeOnlyMatch) {
      return { mapping: codeOnlyMatch, unmatchedReason: '' };
    }

    // Since we have branch matches but none succeeded (all had other restrictions), report sender name mismatch
    return { 
      mapping: null, 
      unmatchedReason: `รหัสสาขาตรง (${branchMatches.map(m => m.branchCode).join(', ')}) แต่ชื่อผู้ส่ง (${shipment.senderName || sBranchName || 'ไม่ระบุ'}) ไม่ตรงตามข้อจำกัดผู้ส่งในแผนผัง` 
    };
  }

  // 3. FALLBACK MATCH: Search all active mappings for a senderName match (where mapping branch code is empty/unused)
  const senderOnlyMatch = activeMappings.find(m => {
    // If it has a branch code, we generally expect branch code matching, but let's check sender match as fallback
    const senders = getMappingSenders(m);
    if (senders.length === 0) return false;
    return senders.some(name => name === sSenderName || name === sBranchName);
  });

  if (senderOnlyMatch) {
    return { mapping: senderOnlyMatch, unmatchedReason: '' };
  }

  // No matches found at all
  return { 
    mapping: null, 
    unmatchedReason: `ไม่พบแผนผังจับคู่ที่ตรงกับรหัสสาขา (${sMappedBranchCode || sBranchCode || sSenderCode || 'ไม่มี'}) หรือชื่อคนส่ง (${shipment.senderName || sBranchName || 'ไม่มี'}) ในระบบ` 
  };
}

export function enrichShipmentWithCommissionMapping(shipment: any, commissionMappings: CommissionMapping[]) {
  const orderTotal = parseMoney(shipment.orderTotal);
  const rType = shipment.reportType || resolveReportType(shipment);
  
  const { mapping, unmatchedReason } = getSingleMappingMatch(shipment, commissionMappings);

  if (mapping) {
    // Determine which rate to use based on province
    const toProvince = shipment.toProvince || shipment.receiverProvince || "";
    const isNine = isNineProvince(toProvince);
    
    let rate = 0;
    if (isNine) {
      const rateVal = mapping.commissionRate9 !== undefined ? mapping.commissionRate9 : (mapping as any).commissionRate9Provinces;
      rate = parsePercentageRate(rateVal);
    } else {
      const rateVal = mapping.commissionRate68 !== undefined ? mapping.commissionRate68 : (mapping as any).commissionRate68Provinces;
      rate = parsePercentageRate(rateVal);
    }

    const commissionNet = calculateCommission(orderTotal, rate);
    const resolvedGroup = normalizeCustomerGroup(
      (mapping.customerGroup && mapping.customerGroup !== "ไม่ระบุ" && mapping.customerGroup !== "")
        ? mapping.customerGroup 
        : getFriendlyCustomerGroup(rType)
    );

    return {
      ...shipment,
      supervisor: mapping.supervisor || 'ไม่ระบุ',
      forwardedFromWarehouse: shipment.forwardedFromWarehouse || 'ไม่ระบุ',
      commissionBranchCode: mapping.branchCode || shipment.mappedBranchCode || shipment.branchCode || '-',
      customerGroup: resolvedGroup,
      deliveryLine: mapping.deliveryLine || 'ไม่ระบุ',
      team: mapping.team || 'ไม่ระบุ',
      commissionRateRaw: String(rate),
      commissionRate: rate,
      commissionRate9: mapping.commissionRate9 !== undefined ? mapping.commissionRate9 : ((mapping as any).commissionRate9Provinces || 0),
      commissionRate68: mapping.commissionRate68 !== undefined ? mapping.commissionRate68 : ((mapping as any).commissionRate68Provinces || 0),
      isNineProvince: isNine,
      commissionRatePercent: rate,
      area: isNine ? '9 จังหวัด' : '68 จังหวัด',
      areaType: mapping.areaType || 'ALL',
      accountingTeam: mapping.accountingTeam || 'ไม่ระบุ',
      bsBookingReferrer: mapping.bsBookingReferral || 'ไม่ระบุ',
      reportBranchGroup: (mapping as any).reportBranchGroup || shipment.reportBranchGroup || 'ไม่ระบุ',
      commissionNet: commissionNet,
      commissionMappingStatus: "mapped",
      commissionMappingId: mapping.id || null,
      commissionMatched: true,
      commissionProcessedAt: new Date(),
      unmatchedReason: "",
      reportType: rType
    };
  }

  // Not mapped
  const resolvedGroup = normalizeCustomerGroup(
    (shipment.customerGroup && shipment.customerGroup !== "ไม่ระบุ" && shipment.customerGroup !== "")
      ? shipment.customerGroup
      : getFriendlyCustomerGroup(rType)
  );

  let defaultAccountingTeam = 'ไม่ระบุ';
  let defaultTeam = 'ไม่ระบุ';

  if (resolvedGroup === 'Drop point') {
    defaultAccountingTeam = 'ทีม 1';
    defaultTeam = 'ทีม 1';
  } else if (resolvedGroup === 'CALLIN') {
    defaultAccountingTeam = 'ทีม 1';
    defaultTeam = 'ทีม 1';
  } else if (resolvedGroup === 'DC') {
    defaultAccountingTeam = 'ทีม 2';
    defaultTeam = 'ทีม 2';
  } else if (resolvedGroup === 'Sale Driver') {
    defaultAccountingTeam = 'ทีม 1';
    defaultTeam = 'ทีม 1';
  } else if (resolvedGroup === 'Online') {
    defaultAccountingTeam = 'ทีม 1';
    defaultTeam = 'ทีม 1';
  }

  return {
    ...shipment,
    supervisor: 'ไม่ระบุ',
    forwardedFromWarehouse: shipment.forwardedFromWarehouse || 'ไม่ระบุ',
    commissionBranchCode: shipment.mappedBranchCode || shipment.branchCode || '-',
    customerGroup: resolvedGroup,
    deliveryLine: 'ไม่ระบุ',
    team: defaultTeam,
    commissionRateRaw: '0',
    commissionRate: 0,
    commissionRatePercent: 0,
    area: 'ไม่ระบุ',
    accountingTeam: defaultAccountingTeam,
    bsBookingReferrer: 'ไม่ระบุ',
    commissionNet: 0,
    commissionMappingStatus: "unmapped",
    unmatchedReason: unmatchedReason || "ไม่พบแผนผังจับคู่",
    commissionMappingId: null,
    commissionMatched: false,
    commissionProcessedAt: new Date(),
    reportType: rType
  };
}

