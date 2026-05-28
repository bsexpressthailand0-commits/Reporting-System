import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';
import { getCachedCommissionMappings } from './commissionMapping';
import { normalizeCustomerGroup } from './customerGroupService';
import dayjs from 'dayjs';

export interface CompareMetrics {
  trackingCount: number;
  quantity: number;
  shippingAmount: number;
  codAmount: number;
  profitAmount: number;
  commissionAmount: number;
}

export interface GroupCompareRow {
  groupKey: string;
  current: CompareMetrics;
  prior: CompareMetrics;
  diff: CompareMetrics;
  percent: CompareMetrics;
}

export type ComparePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';
export type CompareDimension = 'team' | 'supervisor' | 'branchGroup' | 'customerGroup';

export interface ComparePeriod {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export function getComparePeriods(preset: ComparePreset, customCurrent?: ComparePeriod): { current: ComparePeriod; prior: ComparePeriod } {
  const todayVal = dayjs();
  
  let current: ComparePeriod = { start: '', end: '' };
  let prior: ComparePeriod = { start: '', end: '' };

  switch (preset) {
    case 'today':
      current = {
        start: todayVal.format('YYYY-MM-DD'),
        end: todayVal.format('YYYY-MM-DD'),
      };
      prior = {
        start: todayVal.subtract(1, 'day').format('YYYY-MM-DD'),
        end: todayVal.subtract(1, 'day').format('YYYY-MM-DD'),
      };
      break;

    case 'yesterday':
      current = {
        start: todayVal.subtract(1, 'day').format('YYYY-MM-DD'),
        end: todayVal.subtract(1, 'day').format('YYYY-MM-DD'),
      };
      prior = {
        start: todayVal.subtract(2, 'day').format('YYYY-MM-DD'),
        end: todayVal.subtract(2, 'day').format('YYYY-MM-DD'),
      };
      break;

    case 'week': {
      // Monday of this week
      let startOfThisWeek = todayVal.day(1);
      if (todayVal.day() === 0) {
        startOfThisWeek = todayVal.subtract(6, 'day');
      }
      current = {
        start: startOfThisWeek.format('YYYY-MM-DD'),
        end: todayVal.format('YYYY-MM-DD'),
      };
      
      const startOfPriorWeek = startOfThisWeek.subtract(7, 'day');
      prior = {
        start: startOfPriorWeek.format('YYYY-MM-DD'),
        end: startOfPriorWeek.add(6, 'day').format('YYYY-MM-DD'),
      };
      break;
    }

    case 'month':
      current = {
        start: todayVal.startOf('month').format('YYYY-MM-DD'),
        end: todayVal.endOf('month').format('YYYY-MM-DD'),
      };
      prior = {
        start: todayVal.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
        end: todayVal.subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
      };
      break;

    case 'custom':
      if (customCurrent) {
        current = { ...customCurrent };
        const s1 = dayjs(customCurrent.start);
        const e1 = dayjs(customCurrent.end);
        const diffDays = e1.diff(s1, 'day') + 1;
        
        // Prior is the identical duration period preceding current start
        prior = {
          start: s1.subtract(diffDays, 'day').format('YYYY-MM-DD'),
          end: s1.subtract(1, 'day').format('YYYY-MM-DD'),
        };
      } else {
        // Fallback or default
        current = {
          start: todayVal.startOf('month').format('YYYY-MM-DD'),
          end: todayVal.format('YYYY-MM-DD'),
        };
        const s1 = dayjs(current.start);
        const e1 = dayjs(current.end);
        const diffDays = e1.diff(s1, 'day') + 1;
        prior = {
          start: s1.subtract(diffDays, 'day').format('YYYY-MM-DD'),
          end: s1.subtract(1, 'day').format('YYYY-MM-DD'),
        };
      }
      break;
  }

  return { current, prior };
}

export function calculateChangePercent(current: number, prior: number): number {
  if (prior === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - prior) / prior) * 100;
}

export function createZeroMetrics(): CompareMetrics {
  return {
    trackingCount: 0,
    quantity: 0,
    shippingAmount: 0,
    codAmount: 0,
    profitAmount: 0,
    commissionAmount: 0,
  };
}

export function getShipmentSupervisor(s: any): string {
  const val = (s.supervisor || s.sales || s.createdBy || s.owner || s.saleOwner || s.accountOwner || s.staffName || '').trim();
  return (val === '' || val === '-' || val === 'ไม่ระบุ') ? 'ไม่ระบุผู้ดูแล' : val;
}

export async function fetchCompareData(
  currentPeriod: ComparePeriod,
  priorPeriod: ComparePeriod,
  dimension: CompareDimension,
  selectedTeams?: string[],
  selectedSupervisors?: string[],
  limitCap: number = 8000
): Promise<{
  rows: GroupCompareRow[];
  totalCurrent: CompareMetrics;
  totalPrior: CompareMetrics;
  totalDiff: CompareMetrics;
  totalPercent: CompareMetrics;
  rawShipmentsCount: number;
  availableTeams: string[];
  availableSupervisors: string[];
}> {
  // Query all shipments that spanning BOTH periods to query once and categorize in-mem
  // min date is prior start, max date is current end
  const startDate = priorPeriod.start < currentPeriod.start ? priorPeriod.start : currentPeriod.start;
  const endDate = priorPeriod.end > currentPeriod.end ? priorPeriod.end : currentPeriod.end;

  // Query Firestore
  let shipmentsSnap;
  try {
    const q1 = query(
      collection(db, "shipments"),
      where("orderDateKey", ">=", startDate),
      where("orderDateKey", "<=", endDate),
      limit(limitCap)
    );
    shipmentsSnap = await getDocs(q1);
  } catch (err) {
    console.warn("Retrying with createdDateKey fallback for range comparison...", err);
    const q2 = query(
      collection(db, "shipments"),
      where("createdDateKey", ">=", startDate),
      where("createdDateKey", "<=", endDate),
      limit(limitCap)
    );
    shipmentsSnap = await getDocs(q2);
  }

  const mappings = await getCachedCommissionMappings();
  const activeMappingIds = new Set(
    mappings.filter((m: any) => m.isActive !== false).map((m: any) => m.id)
  );
  
  const rawShipments = shipmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

  // Extract all unique teams and supervisors from indeed all rawShipments
  const teamsSet = new Set<string>();
  const supervisorsSet = new Set<string>();
  rawShipments.forEach(s => {
    const t = s.team || s.accountingTeam || 'ไม่ระบุทีม';
    teamsSet.add(t);
    const sup = getShipmentSupervisor(s);
    supervisorsSet.add(sup);
  });
  const availableTeams = Array.from(teamsSet).sort((a, b) => {
    if (a === 'ไม่ระบุทีม') return 1;
    if (b === 'ไม่ระบุทีม') return -1;
    return a.localeCompare(b, 'th');
  });
  const availableSupervisors = Array.from(supervisorsSet).sort((a, b) => {
    if (a === 'ไม่ระบุผู้ดูแล') return 1;
    if (b === 'ไม่ระบุผู้ดูแล') return -1;
    return a.localeCompare(b, 'th');
  });

  const hasTeamFilter = selectedTeams && selectedTeams.length > 0 && !selectedTeams.includes('all');
  const hasSupervisorFilter = selectedSupervisors && selectedSupervisors.length > 0 && !selectedSupervisors.includes('all');

  // Partition groups
  const groups: Record<string, { current: CompareMetrics; prior: CompareMetrics }> = {};

  const ensureGroupExist = (key: string) => {
    const k = key || 'ไม่ระบุ';
    if (!groups[k]) {
      groups[k] = {
        current: createZeroMetrics(),
        prior: createZeroMetrics(),
      };
    }
    return k;
  };

  rawShipments.forEach(s => {
    // Determine which range this shipment belongs to
    const dateKey = s.orderDateKey || s.createdDateKey || (s.orderDate || s.createdDate || '').slice(0, 10);
    
    const isCurrent = dateKey >= currentPeriod.start && dateKey <= currentPeriod.end;
    const isPrior = dateKey >= priorPeriod.start && dateKey <= priorPeriod.end;

    if (!isCurrent && !isPrior) return; // out of both ranges

    // Check team filter
    if (hasTeamFilter) {
      const t = s.team || s.accountingTeam || 'ไม่ระบุทีม';
      if (!selectedTeams!.includes(t)) {
        return; // Filter out
      }
    }

    // Check supervisor filter
    if (hasSupervisorFilter) {
      const sup = getShipmentSupervisor(s);
      if (!selectedSupervisors!.includes(sup)) {
        return; // Filter out
      }
    }

    // Resolve Dimension Key
    let rawKey = '';
    if (dimension === 'team') {
      rawKey = s.team || s.accountingTeam || 'ไม่ระบุทีม';
    } else if (dimension === 'supervisor') {
      rawKey = getShipmentSupervisor(s);
    } else if (dimension === 'branchGroup') {
      rawKey = s.reportBranchGroup || s.branchGroup || 'ไม่ระบุ';
    } else if (dimension === 'customerGroup') {
      rawKey = normalizeCustomerGroup(s.customerGroup || s.reportType || 'ไม่ระบุ');
    }

    const key = ensureGroupExist(rawKey);

    const qty = Number(s.quantity) || 1;
    const shipping = Number(s.orderTotal) || 0;
    const cod = Number(s.codAmount) || 0;
    const profit = Number(s.netProfit) || 0;
    
    // Calculate Commission Net
    let isCommissionMapped = s.commissionMatched === true && s.commissionMappingId != null && activeMappingIds.has(s.commissionMappingId);
    let commission = 0;
    if (isCommissionMapped) {
      commission = Number(s.commissionNet) || 0;
    } else if (Number(s.commissionRate) > 0) {
      commission = shipping * (Number(s.commissionRate) / 100);
    }

    const target = isCurrent ? groups[key].current : groups[key].prior;
    
    target.trackingCount += 1;
    target.quantity += qty;
    target.shippingAmount += shipping;
    target.codAmount += cod;
    target.profitAmount += profit;
    target.commissionAmount += commission;
  });

  // Calculate row list
  const rows: GroupCompareRow[] = Object.entries(groups).map(([groupKey, data]) => {
    const diff: CompareMetrics = {
      trackingCount: data.current.trackingCount - data.prior.trackingCount,
      quantity: data.current.quantity - data.prior.quantity,
      shippingAmount: data.current.shippingAmount - data.prior.shippingAmount,
      codAmount: data.current.codAmount - data.prior.codAmount,
      profitAmount: data.current.profitAmount - data.prior.profitAmount,
      commissionAmount: data.current.commissionAmount - data.prior.commissionAmount,
    };

    const percent: CompareMetrics = {
      trackingCount: calculateChangePercent(data.current.trackingCount, data.prior.trackingCount),
      quantity: calculateChangePercent(data.current.quantity, data.prior.quantity),
      shippingAmount: calculateChangePercent(data.current.shippingAmount, data.prior.shippingAmount),
      codAmount: calculateChangePercent(data.current.codAmount, data.prior.codAmount),
      profitAmount: calculateChangePercent(data.current.profitAmount, data.prior.profitAmount),
      commissionAmount: calculateChangePercent(data.current.commissionAmount, data.prior.commissionAmount),
    };

    return {
      groupKey,
      current: data.current,
      prior: data.prior,
      diff,
      percent,
    };
  });

  // Sort rows by Current period's shippingAmount descended
  rows.sort((a, b) => b.current.shippingAmount - a.current.shippingAmount);

  // Calculate Overall totals
  const totalCurrent = createZeroMetrics();
  const totalPrior = createZeroMetrics();

  rows.forEach(r => {
    totalCurrent.trackingCount += r.current.trackingCount;
    totalCurrent.quantity += r.current.quantity;
    totalCurrent.shippingAmount += r.current.shippingAmount;
    totalCurrent.codAmount += r.current.codAmount;
    totalCurrent.profitAmount += r.current.profitAmount;
    totalCurrent.commissionAmount += r.current.commissionAmount;

    totalPrior.trackingCount += r.prior.trackingCount;
    totalPrior.quantity += r.prior.quantity;
    totalPrior.shippingAmount += r.prior.shippingAmount;
    totalPrior.codAmount += r.prior.codAmount;
    totalPrior.profitAmount += r.prior.profitAmount;
    totalPrior.commissionAmount += r.prior.commissionAmount;
  });

  const totalDiff: CompareMetrics = {
    trackingCount: totalCurrent.trackingCount - totalPrior.trackingCount,
    quantity: totalCurrent.quantity - totalPrior.quantity,
    shippingAmount: totalCurrent.shippingAmount - totalPrior.shippingAmount,
    codAmount: totalCurrent.codAmount - totalPrior.codAmount,
    profitAmount: totalCurrent.profitAmount - totalPrior.profitAmount,
    commissionAmount: totalCurrent.commissionAmount - totalPrior.commissionAmount,
  };

  const totalPercent: CompareMetrics = {
    trackingCount: calculateChangePercent(totalCurrent.trackingCount, totalPrior.trackingCount),
    quantity: calculateChangePercent(totalCurrent.quantity, totalPrior.quantity),
    shippingAmount: calculateChangePercent(totalCurrent.shippingAmount, totalPrior.shippingAmount),
    codAmount: calculateChangePercent(totalCurrent.codAmount, totalPrior.codAmount),
    profitAmount: calculateChangePercent(totalCurrent.profitAmount, totalPrior.profitAmount),
    commissionAmount: calculateChangePercent(totalCurrent.commissionAmount, totalPrior.commissionAmount),
  };

  return {
    rows,
    totalCurrent,
    totalPrior,
    totalDiff,
    totalPercent,
    rawShipmentsCount: rawShipments.length,
    availableTeams,
    availableSupervisors,
  };
}
