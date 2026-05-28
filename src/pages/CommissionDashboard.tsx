import React, { useState, useEffect, useMemo } from 'react';
import { toPng, toJpeg } from 'html-to-image';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, getDoc, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Package, Truck, DollarSign, Activity, FileSpreadsheet, Search, Loader2, Filter, Calculator, PlayCircle, AlertCircle, HelpCircle } from 'lucide-react';
import { formatNumber, formatCurrency } from '../lib/utils';
import { getCachedCompanyInfo } from '../lib/systemSettings';
import { getCachedCommissionMappings } from '../lib/commissionMapping';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { NotoSansThaiRegular } from '../lib/fonts/NotoSansThai-Regular-normal';
import { NotoSansThaiBold } from '../lib/fonts/NotoSansThai-Bold-normal';
import { enrichShipmentWithCommissionMapping, triggerReprocessCommission, parseMoney, resolveReportType } from '../lib/commissionMapping';
import { normalizeCustomerGroup, getCustomerGroupOptions, getFilterCustomerGroupOptions } from '../lib/customerGroupService';
import { REPORT_CONFIGS } from '../lib/reportConfigs';
import Swal from 'sweetalert2';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import CompactCompanyHeader from '../components/CompactCompanyHeader';

function toDateOnly(value: any) {
  if (!value) return "";
  if (value.toDate) {
    return value.toDate().toISOString().slice(0, 10);
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

function isInDateRange(row: any, startDate: string, endDate: string) {
  const dateKey = row.orderDateKey || row.createdDateKey || toDateOnly(row.orderDate || row.createdDate);
  if (!dateKey) return false;
  return dateKey >= startDate && dateKey <= endDate;
}

function isCommissionReportType(row: any) {
  if (!row) return false;
  if (typeof row === 'object') {
    if (
      row.commissionMappingStatus === 'mapped' ||
      (row.commissionRate !== undefined && row.commissionRate !== null && Number(row.commissionRate) > 0) ||
      (row.commissionNet !== undefined && row.commissionNet !== null && Number(row.commissionNet) > 0)
    ) {
      return true;
    }
  }
  const type = typeof row === 'string' ? row : resolveReportType(row);
  return [
    "DROP_POINT",
    "RC_PICKUP",
    "CALLIN",
    "SALE_DRIVER",
    "ONLINE",
    "FULL_TRUCK_LOAD",
    "ECOMMERCE",
    "TRUCK360"
  ].includes(type);
}

function applyReportViewFilter(rows: any[], reportId: string) {
  const config = REPORT_CONFIGS.find(r => r.id === reportId);
  if (!config || !config.filters) return rows;
  
  let filtered = [...rows];
  const filters = config.filters;
  
  if (filters.isNineProvince !== undefined) {
     const nineProvinces = ['กรุงเทพมหานคร', 'ชลบุรี', 'สมุทรปราการ', 'นครปฐม', 'สมุทรสาคร', 'ปทุมธานี', 'ราชบุรี', 'นนทบุรี', 'สมุทรสงคราม'];
     const pTrim = (p: any) => String(p || "").trim().replace(/\s+/g, "");
     if (filters.isNineProvince) {
       filtered = filtered.filter(d => nineProvinces.some(np => pTrim(np) === pTrim(d.province)) || d.provinceGroup === "9_PROVINCES");
     } else {
       filtered = filtered.filter(d => (!nineProvinces.some(np => pTrim(np) === pTrim(d.province))) && d.provinceGroup !== "9_PROVINCES");
     }
  }
  
  if (filters.lineType) {
     filtered = filtered.filter(d => d.lineType === filters.lineType);
  }
  if (filters.branchType) {
     filtered = filtered.filter(d => d.branchType === filters.branchType);
  }
  if (filters.branchGroup) {
     filtered = filtered.filter(d => d.reportBranchGroup === filters.branchGroup || d.branchGroup === filters.branchGroup);
  }
  if (filters.sales) {
     filtered = filtered.filter(d => (d.sales || '').includes(filters.sales!));
  }
  if (filters.isMainRevenue) filtered = filtered.filter((d: any) => d.mainBranch === 'รายได้รวมหลัก' || d.isMainRevenue);
  if (filters.isNetwork) filtered = filtered.filter((d: any) => d.subBranch === 'เครือข่าย' || d.reportBranchGroup === 'เครือข่าย' || d.isNetwork);
  if (filters.isDropPoint) filtered = filtered.filter((d: any) => d.subBranch === 'ตัวแทนสาขาDP' || d.reportBranchGroup === 'Drop Point' || d.isDropPoint);
  if (filters.isCallin) filtered = filtered.filter((d: any) => d.isCallin || (d.reportBranchGroup || '').includes('CALLIN'));
  if (filters.isSaleDriver) filtered = filtered.filter((d: any) => d.isSaleDriver || (d.reportBranchGroup || '').includes('SaleDriver'));
  if (filters.isOnline) filtered = filtered.filter((d: any) => d.isOnline || (d.reportBranchGroup || '').includes('ONLINE'));
  if (filters.isRcPickup) filtered = filtered.filter((d: any) => d.isRcPickup || (d.reportBranchGroup || '').includes('งานเข้ารับ'));
  if (filters.isFullTruckLoad) filtered = filtered.filter((d: any) => d.reportBranchGroup === 'งานเหมาคัน' || d.isFullTruckLoad);
  if (filters.isEcommerce) filtered = filtered.filter((d: any) => d.reportBranchGroup === 'E-COMMERCE' || d.isEcommerce);
  if (filters.is360Truck) filtered = filtered.filter((d: any) => d.reportBranchGroup === '360TRUCK' || d.is360Truck);
  
  if (filters.reportBranchGroup) {
     filtered = filtered.filter(d => d.reportBranchGroup === filters.reportBranchGroup);
  }
  
  return filtered;
}

export default function CommissionDashboard() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [activeReport, setActiveReport] = useState<string>('all');
  const [dateRange, setDateRange] = useState({
    start: dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
    end: dayjs().format('YYYY-MM-DD')
  });

  const [allShipments, setAllShipments] = useState<any[]>([]);
  const [activeMappingIds, setActiveMappingIds] = useState<Set<string>>(new Set());
  const [companyInfo, setCompanyInfo] = useState<any>({});
  
  const [debugInfo, setDebugInfo] = useState<any>({});

  // Cascading Filter States ("ทั้งหมด" default values)
  const [filterTeam, setFilterTeam] = useState('ทั้งหมด');
  const [filterSupervisor, setFilterSupervisor] = useState('ทั้งหมด');
  const [filterProvince, setFilterProvince] = useState('ทั้งหมด');
  const [filterCustomerGroup, setFilterCustomerGroup] = useState('ทั้งหมด');
  const [filterServiceProvider, setFilterServiceProvider] = useState('ทั้งหมด');
  const [filterBranchName, setFilterBranchName] = useState('ทั้งหมด');
  const [searchTerm, setSearchTerm] = useState('');
  const [debugMode, setDebugMode] = useState(false);

  const [sortBy, setSortBy] = useState('shipping');
  const [sortOrder, setSortOrder] = useState('desc');

  useEffect(() => {
    async function init() {
      const info = await getCachedCompanyInfo();
      if (info) setCompanyInfo(info);
    }
    init();
  }, []);

  async function loadData() {
    if (loading) return;
    
    const cacheKey = `shipments_v5_${dateRange.start}_${dateRange.end}_${activeReport}`;
    const cachedData = sessionStorage.getItem(cacheKey);
    
    if (cachedData) {
      try {
        const { shipments, mappingIds, debugInfo: cachedDebug } = JSON.parse(cachedData);
        setAllShipments(shipments);
        setActiveMappingIds(new Set(mappingIds));
        setDebugInfo(cachedDebug);
        return;
      } catch (e) {
        sessionStorage.removeItem(cacheKey);
      }
    }

    setLoading(true);
    try {
      const q = query(
        collection(db, "shipments"),
        where("orderDateKey", ">=", dateRange.start),
        where("orderDateKey", "<=", dateRange.end),
        limit(5000)
      );
      
      const shipmentsSnap = await getDocs(q).catch(async (err) => {
        if (err.code === 'resource-exhausted' || String(err).includes('quota')) {
          throw new Error('Firestore Quota Exceeded');
        }
        console.warn("Retrying with createdDateKey...");
        const q2 = query(
          collection(db, "shipments"),
          where("createdDateKey", ">=", dateRange.start),
          where("createdDateKey", "<=", dateRange.end),
          limit(5000)
        );
        return getDocs(q2);
      });

      const mappings = await getCachedCommissionMappings();
      const activeMappingIdsSet = new Set<string>(
        mappings
          .filter((m: any) => m.isActive !== false)
          .map((m: any) => m.id)
      );
      setActiveMappingIds(activeMappingIdsSet);

      const allFetched = shipmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      const dateFiltered = allFetched.filter(row =>
        isInDateRange(row, dateRange.start, dateRange.end)
      );

      const reportConfigFiltered = applyReportViewFilter(dateFiltered, activeReport);

      // Single source of truth: immediately enrich loaded rows using local commission mappings
      const enrichedAll = reportConfigFiltered.map((s: any) => enrichShipmentWithCommissionMapping(s, mappings));

      const totalInReportCount = enrichedAll.length;
      const mappedInReport = enrichedAll.filter(s => 
        s.commissionMatched === true && 
        s.commissionMappingId != null &&
        activeMappingIdsSet.has(s.commissionMappingId)
      );
      const unmappedInReportCount = totalInReportCount - mappedInReport.length;
      const mappedPct = totalInReportCount > 0 ? (mappedInReport.length / totalInReportCount) * 100 : 0;

      const newDebugInfo = {
        totalShipments: allFetched.length,
        totalMappings: mappings.length,
        dateFiltered: dateFiltered.length,
        activeReport: activeReport,
        reportConfigFiltered: totalInReportCount,
        commissionRows: mappedInReport.length,
        mappedRows: mappedInReport.filter(r => r.commissionMappingStatus === "mapped").length,
        unmappedRows: totalInReportCount - mappedInReport.length,
        totalShipmentsBeforeFilter: totalInReportCount,
        afterFilter: mappedInReport.length,
        queriedAt: new Date().toLocaleTimeString()
      };

      setAllShipments(enrichedAll);
      setDebugInfo(newDebugInfo);

      sessionStorage.setItem(cacheKey, JSON.stringify({
        shipments: enrichedAll,
        mappingIds: Array.from(activeMappingIdsSet),
        debugInfo: newDebugInfo
      }));
    } catch (e: any) {
      console.error(e);
      if (typeof e === 'object' && e.message && e.message.includes('Quota')) {
        Swal.fire({
          title: 'โควต้าเต็ม (Quota Exceeded)',
          text: 'ระบบใช้งานโควต้าเสร็จสิ้นรายวันของเครื่องเซิร์ฟเวอร์ฐานข้อมูลจำกัดแล้ว กรุณาลดช่วงวันที่ลง หรือลองใหม่อีกครั้งในวันถัดไป',
          icon: 'error',
          confirmButtonText: 'ตกลง'
        });
      } else {
        toast.error('ล้มเหลวในการเชื่อมต่อข้อมูลข้อมูล: ' + String(e));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [dateRange.start, dateRange.end, activeReport]);

  const handleReprocess = async () => {
    if (isReprocessing) return;
    
    const confirm = await Swal.fire({
      title: "คำนวณค่าคอมมิชชั่นใหม่?",
      text: "ระบบจะดำเนินการประมวลผลคำนวณค่าคอมมิชชั่นใหม่จากข้อมูลแผนผังจัดคู่ประกบที่มีทั้งหมดในปัจจุบัน",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: '#0f766e',
      confirmButtonText: "เริ่มคำนวณ",
      cancelButtonText: "ยกเลิก"
    });

    if (!confirm.isConfirmed) return;
    
    setIsReprocessing(true);
    toast.info("ระบบกำลังเตรียมพัสดุและเริ่มการประมวลผลคำนวณใหม่ กรุณารอสักครู่...");

    try {
      const res = await triggerReprocessCommission();
      toast.success(
        "ประมวลผลใหม่สำเร็จ",
        `อัปเดตข้อมูลทั้งหมด: ${res.processedRows || 0} รายการ, สำเร็จ: ${res.mappedRows || 0}, ไม่สำเร็จ: ${res.unmappedRows || 0}`
      );
      
      // Clear storage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('shipments_')) {
          sessionStorage.removeItem(key);
          i--;
        }
      }

      await loadData();
    } catch (e: any) {
      console.error(e);
      toast.error("ประมวลผลข้อผิดพลาด", e.message || "ล้มเหลวในการคำนวณค่าจัดคู่อัปเดต");
    } finally {
      setIsReprocessing(false);
    }
  };

  const normalizeText = (val: any) => {
    if (!val) return '';
    return String(val).trim().toLowerCase();
  };

  // Case-Insensitive, trimmed, and normalized cascading verification
  const checkShipmentMatchesFilters = (s: any, excludeField?: string) => {
    if (excludeField !== 'team' && filterTeam !== 'ทั้งหมด') {
      const rowTeam = (s.team || s.accountingTeam || "").trim();
      const isUnspecified = !rowTeam || rowTeam === '-' || rowTeam === 'ไม่ระบุ';
      if (filterTeam === 'ไม่ระบุทีม') {
        if (!isUnspecified) return false;
      } else {
        if (isUnspecified || rowTeam.toLowerCase() !== filterTeam.toLowerCase()) return false;
      }
    }

    if (excludeField !== 'supervisor' && filterSupervisor !== 'ทั้งหมด') {
      const rowSuper = (s.supervisor || s.owner || s.createdBy || "").trim();
      const isUnspecified = !rowSuper || rowSuper === '-' || rowSuper === 'ไม่ระบุ';
      if (filterSupervisor === 'ไม่ระบุผู้ดูแล') {
        if (!isUnspecified) return false;
      } else {
        if (isUnspecified || rowSuper.toLowerCase() !== filterSupervisor.toLowerCase()) return false;
      }
    }

    if (excludeField !== 'province' && filterProvince !== 'ทั้งหมด') {
      const rowProvince = (s.toProvince || s.receiverProvince || s.province || "").trim();
      const isUnspecified = !rowProvince || rowProvince === '-' || rowProvince === 'ไม่ระบุ';
      if (filterProvince === 'ไม่ระบุจังหวัด') {
        if (!isUnspecified) return false;
      } else {
        if (isUnspecified || rowProvince.toLowerCase() !== filterProvince.toLowerCase()) return false;
      }
    }

    if (excludeField !== 'customerGroup' && filterCustomerGroup !== 'ทั้งหมด') {
      const rowCG = normalizeCustomerGroup(s.customerGroup || s.reportType || "");
      const isUnspecified = !rowCG || rowCG === '-' || rowCG === 'ไม่ระบุ';
      if (filterCustomerGroup === 'ไม่ระบุกลุ่มลูกค้า') {
        if (!isUnspecified) return false;
      } else {
        if (isUnspecified || rowCG.toLowerCase() !== filterCustomerGroup.toLowerCase()) return false;
      }
    }

    if (excludeField !== 'serviceProvider' && filterServiceProvider !== 'ทั้งหมด') {
      const rowServ = (s.serviceType || s.carrier || "").trim();
      const isUnspecified = !rowServ || rowServ === '-' || rowServ === 'ไม่ระบุ';
      if (filterServiceProvider === 'ไม่ระบุบริษัทบริการ') {
        if (!isUnspecified) return false;
      } else {
        if (isUnspecified || rowServ.toLowerCase() !== filterServiceProvider.toLowerCase()) return false;
      }
    }

    if (excludeField !== 'branchName' && filterBranchName !== 'ทั้งหมด') {
      const rowBranch = (s.branchName || "").trim();
      const isUnspecified = !rowBranch || rowBranch === '-' || rowBranch === 'ไม่ระบุ';
      if (filterBranchName === 'ไม่ระบุสาขา') {
        if (!isUnspecified) return false;
      } else {
        if (isUnspecified || rowBranch.toLowerCase() !== filterBranchName.toLowerCase()) return false;
      }
    }

    if (excludeField !== 'searchTerm' && searchTerm.trim()) {
      const q = normalizeText(searchTerm);
      const bName = normalizeText(s.branchName);
      const sName = normalizeText(s.senderName);
      const bCode = normalizeText(s.branchCode || s.mappedBranchCode || s.commissionBranchCode);
      const tNo = normalizeText(s.trackingNo || s.orderNo);
      const teamName = normalizeText(s.team || s.accountingTeam);
      const superName = normalizeText(s.supervisor || s.owner || s.createdBy);
      const provName = normalizeText(s.toProvince || s.receiverProvince || s.province);

      const matchSearch = bName.includes(q) || 
                          sName.includes(q) || 
                          bCode.includes(q) || 
                          tNo.includes(q) ||
                          teamName.includes(q) ||
                          superName.includes(q) ||
                          provName.includes(q);
      
      if (!matchSearch) return false;
    }

    return true;
  };

  const resetFilters = () => {
    setFilterTeam('ทั้งหมด');
    setFilterSupervisor('ทั้งหมด');
    setFilterProvince('ทั้งหมด');
    setFilterCustomerGroup('ทั้งหมด');
    setFilterServiceProvider('ทั้งหมด');
    setFilterBranchName('ทั้งหมด');
    setSearchTerm('');
  };

  const hasAnyActiveFilter = useMemo(() => {
    return filterTeam !== 'ทั้งหมด' ||
           filterSupervisor !== 'ทั้งหมด' ||
           filterProvince !== 'ทั้งหมด' ||
           filterCustomerGroup !== 'ทั้งหมด' ||
           filterServiceProvider !== 'ทั้งหมด' ||
           filterBranchName !== 'ทั้งหมด' ||
           searchTerm.trim() !== '';
  }, [filterTeam, filterSupervisor, filterProvince, filterCustomerGroup, filterServiceProvider, filterBranchName, searchTerm]);

  // Dependent Options Selectors based on Cascade Logic
  const teamOptions = useMemo(() => {
    const set = new Set<string>();
    allShipments.forEach(s => {
      if (checkShipmentMatchesFilters(s, 'team')) {
        const val = (s.team || s.accountingTeam || "").trim();
        if (val && val !== "-" && val !== "ไม่ระบุ") set.add(val);
      }
    });
    return Array.from(set).sort();
  }, [allShipments, filterSupervisor, filterProvince, filterCustomerGroup, filterServiceProvider, filterBranchName, searchTerm]);

  const supervisorOptions = useMemo(() => {
    const set = new Set<string>();
    allShipments.forEach(s => {
      if (checkShipmentMatchesFilters(s, 'supervisor')) {
        const val = (s.supervisor || s.owner || s.createdBy || "").trim();
        if (val && val !== "-" && val !== "ไม่ระบุ") set.add(val);
      }
    });
    return Array.from(set).sort();
  }, [allShipments, filterTeam, filterProvince, filterCustomerGroup, filterServiceProvider, filterBranchName, searchTerm]);

  const provinceOptions = useMemo(() => {
    const set = new Set<string>();
    allShipments.forEach(s => {
      if (checkShipmentMatchesFilters(s, 'province')) {
        const val = (s.toProvince || s.receiverProvince || s.province || "").trim();
        if (val && val !== "-" && val !== "ไม่ระบุ") set.add(val);
      }
    });
    return Array.from(set).sort();
  }, [allShipments, filterTeam, filterSupervisor, filterCustomerGroup, filterServiceProvider, filterBranchName, searchTerm]);

  const customerGroupOptions = useMemo(() => {
    const set = new Set<string>();
    allShipments.forEach(s => {
      if (checkShipmentMatchesFilters(s, 'customerGroup')) {
        const val = normalizeCustomerGroup(s.customerGroup || s.reportType || "");
        if (val && val !== "-" && val !== "ไม่ระบุ") set.add(val);
      }
    });
    return Array.from(set).sort();
  }, [allShipments, filterTeam, filterSupervisor, filterProvince, filterServiceProvider, filterBranchName, searchTerm]);

  const serviceProviderOptions = useMemo(() => {
    const set = new Set<string>();
    allShipments.forEach(s => {
      if (checkShipmentMatchesFilters(s, 'serviceProvider')) {
        const val = (s.serviceType || s.carrier || "").trim();
        if (val && val !== "-" && val !== "ไม่ระบุ") set.add(val);
      }
    });
    return Array.from(set).sort();
  }, [allShipments, filterTeam, filterSupervisor, filterProvince, filterCustomerGroup, filterBranchName, searchTerm]);

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    allShipments.forEach(s => {
      if (checkShipmentMatchesFilters(s, 'branchName')) {
        const val = (s.branchName || "").trim();
        if (val && val !== "-" && val !== "ไม่ระบุ") set.add(val);
      }
    });
    return Array.from(set).sort();
  }, [allShipments, filterTeam, filterSupervisor, filterProvince, filterCustomerGroup, filterServiceProvider, searchTerm]);

  const hasUnspecifiedTeam = useMemo(() => {
    return allShipments.some(s => {
      if (checkShipmentMatchesFilters(s, 'team')) {
        const val = (s.team || s.accountingTeam || "").trim();
        return !val || val === "-" || val === "ไม่ระบุ";
      }
      return false;
    });
  }, [allShipments, filterSupervisor, filterProvince, filterCustomerGroup, filterServiceProvider, filterBranchName, searchTerm]);

  const hasUnspecifiedSupervisor = useMemo(() => {
    return allShipments.some(s => {
      if (checkShipmentMatchesFilters(s, 'supervisor')) {
        const val = (s.supervisor || s.owner || s.createdBy || "").trim();
        return !val || val === "-" || val === "ไม่ระบุ";
      }
      return false;
    });
  }, [allShipments, filterTeam, filterProvince, filterCustomerGroup, filterServiceProvider, filterBranchName, searchTerm]);

  const hasUnspecifiedProvince = useMemo(() => {
    return allShipments.some(s => {
      if (checkShipmentMatchesFilters(s, 'province')) {
        const val = (s.toProvince || s.receiverProvince || s.province || "").trim();
        return !val || val === "-" || val === "ไม่ระบุ";
      }
      return false;
    });
  }, [allShipments, filterTeam, filterSupervisor, filterCustomerGroup, filterServiceProvider, filterBranchName, searchTerm]);

  const hasUnspecifiedCustomerGroup = useMemo(() => {
    return allShipments.some(s => {
      if (checkShipmentMatchesFilters(s, 'customerGroup')) {
        const val = normalizeCustomerGroup(s.customerGroup || s.reportType || "");
        return !val || val === "-" || val === "ไม่ระบุ";
      }
      return false;
    });
  }, [allShipments, filterTeam, filterSupervisor, filterProvince, filterServiceProvider, filterBranchName, searchTerm]);

  const hasUnspecifiedServiceProvider = useMemo(() => {
    return allShipments.some(s => {
      if (checkShipmentMatchesFilters(s, 'serviceProvider')) {
        const val = (s.serviceType || s.carrier || "").trim();
        return !val || val === "-" || val === "ไม่ระบุ";
      }
      return false;
    });
  }, [allShipments, filterTeam, filterSupervisor, filterProvince, filterCustomerGroup, filterBranchName, searchTerm]);

  const hasUnspecifiedBranch = useMemo(() => {
    return allShipments.some(s => {
      if (checkShipmentMatchesFilters(s, 'branchName')) {
        const val = (s.branchName || "").trim();
        return !val || val === "-" || val === "ไม่ระบุ";
      }
      return false;
    });
  }, [allShipments, filterTeam, filterSupervisor, filterProvince, filterCustomerGroup, filterServiceProvider, searchTerm]);

  // Main reactive selections
  const filteredAllShipments = useMemo(() => {
    return allShipments.filter(s => checkShipmentMatchesFilters(s));
  }, [allShipments, filterTeam, filterSupervisor, filterProvince, filterCustomerGroup, filterServiceProvider, filterBranchName, searchTerm]);

  const filteredMappedShipments = useMemo(() => {
    return filteredAllShipments.filter(s => 
      s.commissionMatched === true && 
      s.commissionMappingId != null &&
      activeMappingIds.has(s.commissionMappingId)
    );
  }, [filteredAllShipments, activeMappingIds]);

  const filteredUnmappedShipments = useMemo(() => {
    return filteredAllShipments.filter(s => 
      !(s.commissionMatched === true && 
        s.commissionMappingId != null &&
        activeMappingIds.has(s.commissionMappingId))
    );
  }, [filteredAllShipments, activeMappingIds]);

  const totalShipmentsFiltered = filteredAllShipments.length;
  const mappedCountFiltered = filteredMappedShipments.length;
  const unmappedCountFiltered = filteredUnmappedShipments.length;
  const mappedPercentFiltered = totalShipmentsFiltered > 0 ? (mappedCountFiltered / totalShipmentsFiltered) * 100 : 0;

  const uniqueCustomersCount = useMemo(() => {
    const list = new Set<string>();
    filteredAllShipments.forEach(s => {
      if (s.senderName) list.add(normalizeText(s.senderName));
    });
    return list.size;
  }, [filteredAllShipments]);

  // Clean, complete stats calculated directly from filtered dataset to prevent divergence
  const stats = useMemo(() => {
    let orderSet = new Set();
    let totalQty = 0;
    let totalShippingFee = 0;
    let totalCommission = 0;
    
    const byCustGroup: Record<string, any> = {};
    const byCarrier: Record<string, any> = {};
    const byArea: Record<string, any> = {};
    const byAccTeam: Record<string, any> = {};
    const bySuper: Record<string, any> = {};
    const byBranchName: Record<string, any> = {};
    const bySenderName: Record<string, any> = {};
    const byBranchCode: Record<string, any> = {};

    filteredMappedShipments.forEach(s => {
      const custGroup = normalizeCustomerGroup(s.customerGroup || s.reportType || '-');
      const bCode = s.commissionBranchCode || s.mappedBranchCode || s.branchCode || '-';
      const area = s.area || s.provinceGroup || '-';
      const accTeam = s.team || s.accountingTeam || '-';
      const supervisor = s.supervisor || s.owner || s.createdBy || 'ไม่ระบุ';
      const carrier = s.serviceType || s.carrier || '-';

      const orderNo = s.orderNo || s.trackingNo;
      if (orderNo) orderSet.add(orderNo);
      
      const qty = Number(s.quantity) || 1;
      const shipping = parseMoney(s.orderTotal);
      const commission = parseMoney(s.commissionNet) || (shipping * (Number(s.commissionRate || 0) / 100));
      
      totalQty += qty;
      totalShippingFee += shipping;
      totalCommission += commission;

      const aggregate = (map: any, key: string, label?: string) => {
        if (!key) key = 'ไม่มีข้อมูล';
        if (!map[key]) map[key] = { key, billsSet: new Set(), qty: 0, shipping: 0, comm: 0, branchCode: bCode, label };
        if (orderNo) map[key].billsSet.add(orderNo);
        map[key].qty += qty;
        map[key].shipping += shipping;
        map[key].comm += commission;
      };

      aggregate(byCustGroup, custGroup);
      aggregate(byCarrier, carrier);
      aggregate(byArea, area);
      aggregate(byAccTeam, accTeam);
      aggregate(bySuper, supervisor);
      aggregate(byBranchName, s.branchName || '-');
      aggregate(bySenderName, s.senderName || '-');
      aggregate(byBranchCode, bCode);
    });

    const formatAgg = (map: any) => Object.values(map).map((v: any) => ({
      ...v,
      bills: v.billsSet.size,
      billsSet: undefined
    })).sort((a: any, b: any) => {
      let valA = a[sortBy] || 0;
      let valB = b[sortBy] || 0;
      if (typeof valA === 'string') valA = valA.trim().toLowerCase();
      if (typeof valB === 'string') valB = valB.trim().toLowerCase();
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return {
       totalBills: orderSet.size,
       totalQty,
       totalShippingFee,
       totalCommission,
       custGroups: formatAgg(byCustGroup),
       carriers: formatAgg(byCarrier),
       areas: formatAgg(byArea),
       accTeams: formatAgg(byAccTeam),
       supervisors: formatAgg(bySuper),
       branches: formatAgg(byBranchName),
       customers: formatAgg(bySenderName),
       branchCodes: formatAgg(byBranchCode)
    };
  }, [filteredMappedShipments, sortBy, sortOrder]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const addSheet = (name: string, data: any[], mappings: Record<string, string>) => {
      const formatted = data.map(row => {
        const out: any = {};
        for (const [key, label] of Object.entries(mappings)) {
          out[label] = row[key];
        }
        return out;
      });
      const ws = XLSX.utils.json_to_sheet(formatted);
      XxlsxAppendBookSheet(wb, ws, name);
    };

    function XxlsxAppendBookSheet(wb: any, ws: any, name: string) {
      XLSX.utils.book_append_sheet(wb, ws, name);
    }

    addSheet("กลุ่มลูกค้า", stats.custGroups, { key: "กลุ่มลูกค้า", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่ง", comm: "ค่าคอมมิชชั่นสุทธิ" });
    addSheet("บริษัทบริการ", stats.carriers, { key: "บริษัทบริการ", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่ง", comm: "ค่าคอมมิชชั่นสุทธิ" });
    addSheet("พื้นที่จัดส่ง", stats.areas, { key: "พื้นที่จัดส่ง", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่ง", comm: "ค่าคอมมิชชั่นสุทธิ" });
    addSheet("ลงบัญชีทีม", stats.accTeams, { key: "ลงบัญชีทีม", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่ง", comm: "ค่าคอมมิชชั่นสุทธิ" });
    addSheet("ผู้ดูแล (Supervisor)", stats.supervisors, { key: "ผู้ดูแล", branchCode: "รหัสสาขาตัวอย่าง", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่ง", comm: "ค่าคอมมิชชั่นสุทธิ" });
    addSheet("สาขาต้นทาง", stats.branches, { key: "สาขาต้นทาง", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่ง", comm: "ค่าคอมมิชชั่นสุทธิ" });
    addSheet("ลูกค้าผู้ส่ง", stats.customers, { key: "ลูกค้าผู้ส่ง", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่ง", comm: "ค่าคอมมิชชั่นสุทธิ" });
    addSheet("รหัสสาขา", stats.branchCodes, { key: "รหัสสาขา", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่ง", comm: "ค่าคอมมิชชั่นสุทธิ" });

    // Export raw filtered matched details alongside sheets
    const formattedRaw = filteredMappedShipments.map(s => ({
      "รหัสใบสั่งซื้อ/พัสดุ": s.orderNo || s.trackingNo || "-",
      "รหัสสาขา": s.commissionBranchCode || "-",
      "ชื่อผู้ส่ง": s.senderName || "-",
      "กลุ่มลูกค้า": s.customerGroup || "-",
      "ลงบัญชีทีม": s.team || "-",
      "ผู้ดูแล (Supervisor)": s.supervisor || "-",
      "จังหวัดปลายทาง": s.toProvince || s.receiverProvince || "-",
      "ค่าขนส่ง": parseMoney(s.orderTotal),
      "อัตราคอม (%)": s.commissionRateRaw || "0",
      "ค่าคอมมิชชั่นสุทธิ": s.commissionNet || 0,
      "วันที่สั่งซื้อ": s.orderDateKey || "-"
    }));
    const rawWs = XLSX.utils.json_to_sheet(formattedRaw);
    XLSX.utils.book_append_sheet(wb, rawWs, "รายละเอียดดีเทลพัสดุ");

    XLSX.writeFile(wb, `Commission_Dashboard_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`);
    toast.success("ส่งออกเอกสาร Excel เรียบร้อย!");
  };

  const exportToPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.addFileToVFS('NotoSansThai-Regular.ttf', NotoSansThaiRegular);
    doc.addFileToVFS('NotoSansThai-Bold.ttf', NotoSansThaiBold);
    doc.addFont('NotoSansThai-Regular.ttf', 'NotoSansThai', 'normal');
    doc.addFont('NotoSansThai-Bold.ttf', 'NotoSansThai', 'bold');
    
    doc.setFont('NotoSansThai', 'bold');
    doc.setFontSize(14);
    doc.text(companyInfo.companyNameTh || 'ระบบรายงานบัญชีค่าคอมมิชชั่น BS Express', 142, 10, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('NotoSansThai', 'normal');
    doc.text(`ช่วงวันดึงรายงาน: ${dayjs(dateRange.start).format('DD/MM/YYYY')} - ${dayjs(dateRange.end).format('DD/MM/YYYY')} | รายงาน: ${REPORT_CONFIGS.find(r => r.id === activeReport)?.name || 'ทั้งหมด'}`, 142, 16, { align: 'center' });
    doc.text(`ฟอยล์เตอร์เสริม: [ทีม: ${filterTeam}] [ผู้ดูแล: ${filterSupervisor}] [จังหวัด: ${filterProvince}] [ลูกค้า: ${filterCustomerGroup}]`, 142, 22, { align: 'center' });

    let currentY = 28;

    const generateTable = (title: string, data: any[], mappings: Record<string, string>) => {
      if (currentY > 165) {
        doc.addPage();
        currentY = 15;
      }

      doc.setFont('NotoSansThai', 'bold');
      doc.setFontSize(11);
      doc.text(title, 14, currentY);
      
      const head = [Object.values(mappings)];
      const body = data.map(item => Object.keys(mappings).map(key => {
         const val = item[key];
         if (typeof val === 'number') return Number.isInteger(val) ? formatNumber(val) : formatCurrency(val);
         return val?.toString() || '-';
      }));

      autoTable(doc, {
        startY: currentY + 3,
        head,
        body,
        styles: { font: 'NotoSansThai', fontSize: 8.5, cellPadding: 1.5 },
        headStyles: { fillColor: [13, 148, 136] }
      });
      
      currentY = (doc as any).lastAutoTable.finalY + 12;
    };

    generateTable("1. สรุปกลุ่มลูกค้าที่พบคู่แผนผัง", stats.custGroups, { key: "กลุ่มลูกค้า", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่งสะสม", comm: "ยอดคอมมิชชั่นรวม" });
    generateTable("2. ตารางแจกแจงตามบริษัทผู้เสนอบริการ", stats.carriers, { key: "บริษัทบริการ", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่งสะสม", comm: "ยอดคอมมิชชั่นรวม" });
    generateTable("3. วิเคราะห์พื้นที่จัดส่ง (9 และ 68 จังหวัด)", stats.areas, { key: "พื้นที่", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่งสะสม", comm: "ยอดคอมมิชชั่นรวม" });
    generateTable("4. จัดกลุ่มรับผิดชอบรายทีมลงบัญชี", stats.accTeams, { key: "ลงบัญชีทีม", bills: "จำนวนบิล", qty: "จำนวนชิ้น", shipping: "ค่าขนส่งสะสม", comm: "ยอดคอมมิชชั่นรวม" });
    generateTable("5. สรุปผลงานรายผู้ดูแลสังกัด (Supervisor)", stats.supervisors, { key: "ผู้ดูแล", branchCode: "สาขาตัวอย่าง", bills: "จำนวนบิลส่ง", qty: "จำนวนชิ้นรวม", shipping: "ค่าขนส่งสะสม", comm: "ยอดคอมมิชชั่นรวม" });
    generateTable("6. ตารางแยกแยกแบ่งรายสาขา", stats.branches, { key: "สาขา", bills: "จำนวนบิลส่ง", qty: "จำนวนชิ้นรวม", shipping: "ค่าขนส่งสะสม", comm: "ยอดคอมมิชชั่นรวม" });
    generateTable("7. รายงานแจงตามชื่อลูกค้ารายใหญ่", stats.customers, { key: "ชื่อลูกค้า", bills: "จำนวนบิลส่ง", qty: "จำนวนชิ้นรวม", shipping: "ค่าขนส่งสะสม", comm: "ยอดคอมมิชชั่นรวม" });

    doc.save(`Commission_Dashboard_${dayjs().format('YYYYMMDD_HHmm')}.pdf`);
    toast.success("พิมพ์ลงเอกสาร PDF สมบูรณ์!");
  };

  const exportToImage = async (format: 'png' | 'jpeg') => {
    const node = document.getElementById('commission-dashboard-content');
    if (!node) {
      toast.error('ไม่พบองค์ประกอบที่จะถ่ายภาพ');
      return;
    }
    toast.info(`กำลังจับสแนปชอตหน้าจอด็อกบอร์ดเป็น ${format.toUpperCase()} คุณภาพสูง...`);
    try {
      const opts = {
        backgroundColor: '#ffffff',
        style: {
          padding: '24px',
          borderRadius: '12px'
        },
        pixelRatio: 2
      };
      let dataUrl = '';
      if (format === 'jpeg') {
        dataUrl = await toJpeg(node, opts);
      } else {
        dataUrl = await toPng(node, opts);
      }
      const link = document.createElement('a');
      link.download = `Commission_Dashboard_${dayjs().format('YYYYMMDD_HHmm')}.${format}`;
      link.href = dataUrl;
      link.click();
      toast.success('ดาวน์โหลดสแนปภาพรวมเรียบร้อย!');
    } catch (err: any) {
      console.error(err);
      toast.error('บันทึกรูปภาพขัดข้อง: ' + String(err));
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 w-full pb-10 font-sans">
        <CompactCompanyHeader />
        
        {/* Shimmer loading skeletons */}
        <div className="bg-white dark:bg-gray-900 border rounded-xl p-5 animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            <div className="h-10 bg-gray-150 dark:bg-gray-800 rounded"></div>
            <div className="h-10 bg-gray-150 dark:bg-gray-800 rounded"></div>
            <div className="h-10 bg-gray-150 dark:bg-gray-800 rounded"></div>
            <div className="h-10 bg-gray-150 dark:bg-gray-800 rounded"></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-900 border p-5 rounded-xl shadow-sm animate-pulse space-y-2.5">
              <div className="h-3.5 bg-gray-150 dark:bg-gray-800 rounded w-2/3"></div>
              <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-1/2"></div>
              <div className="h-3 bg-gray-150 dark:bg-gray-800 rounded w-4/5"></div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="bg-white dark:bg-gray-900 border rounded-xl animate-pulse p-4 h-64 space-y-3">
              <div className="h-4.5 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
              <div className="space-y-2">
                <div className="h-3.5 bg-gray-150 dark:bg-gray-800 rounded w-full"></div>
                <div className="h-3.5 bg-gray-150 dark:bg-gray-800 rounded w-full"></div>
                <div className="h-3.5 bg-gray-150 dark:bg-gray-800 rounded w-full"></div>
                <div className="h-3.5 bg-gray-150 dark:bg-gray-800 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full pb-10 font-sans" id="commission-dashboard-content">
      
      <CompactCompanyHeader />

      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-center md:text-left">
          <h2 className="text-lg font-black text-slate-850 dark:text-slate-155">กระดานประสิทธิภาพและค่าคอมมิชชั่นเชิงลึก (Dashboard)</h2>
          <p className="text-xs text-gray-500 font-medium">จัดการกรองข้อมูล ตรวจสอบยอดจัดกลุ่มคอมมิชชั่นแบบเรียลไทม์ได้อย่างสมบูรณ์</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto justify-center md:justify-end">
           <button onClick={handleReprocess} disabled={isReprocessing || loading} className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold shadow-xs ${isReprocessing ? 'bg-amber-50 text-amber-500 border border-amber-200' : 'bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-100'}`}>
             <PlayCircle className={`w-3.5 h-3.5 ${isReprocessing ? 'animate-pulse' : ''}`} /> คำนวณใหม่
           </button>
           <button onClick={exportToPDF} className="px-3 py-2 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg hover:bg-rose-100 transition-colors flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer">
             <FileSpreadsheet className="w-3.5 h-3.5" /> PDF
           </button>
           <button onClick={exportToExcel} className="px-3 py-2 bg-teal-50 text-teal-700 border border-teal-100 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer">
             <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
           </button>
           <button onClick={() => exportToImage('png')} className="px-3 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer">
             <Activity className="w-3.5 h-3.5" /> PNG
           </button>
           <button onClick={() => exportToImage('jpeg')} className="px-3 py-2 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer">
             <Activity className="w-3.5 h-3.5" /> JPG
           </button>
        </div>
      </div>
      
      {isAdmin && ((import.meta as any).env?.DEV || process.env.NODE_ENV !== 'production') && (
        <div className="bg-slate-900 text-gray-200 rounded-xl p-4 text-[11px] font-mono shadow-inner border-y border-teal-500/20 space-y-1.5 overflow-x-auto">
           <div className="flex items-center gap-2 mb-1.5 text-teal-400 font-bold text-xs border-b border-gray-805 pb-1">
             <AlertCircle className="w-3.5 h-3.5" /> Admin Performance Diagnostics
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 min-w-[max-content]">
             <div>Total DB Shipments Loaded: <span className="text-white font-bold">{debugInfo.totalShipments}</span></div>
             <div>Total Mappings cache: <span className="text-white font-bold">{debugInfo.totalMappings}</span></div>
             <div>Date filtered: <span className="text-white font-bold">{debugInfo.dateFiltered}</span></div>
             <div>Active config filter: <span className="text-teal-400 font-bold">{debugInfo.reportConfigFiltered || 0}</span> ({debugInfo.activeReport})</div>
             <div>Currently after filter: <span className="text-teal-400 font-bold">{totalShipmentsFiltered}</span> (Matched: {mappedCountFiltered} / Unmapped: {unmappedCountFiltered})</div>
             <div>Precision Match percentage: <span className="text-teal-400 font-bold">{mappedPercentFiltered.toFixed(1)}%</span></div>
             <div>Query timestamp: <span className="text-gray-400">{debugInfo.queriedAt}</span></div>
           </div>
        </div>
      )}

      {/* Advanced Cascading Filtering Control Desk */}
      <div className="bg-white dark:bg-gray-900 border border-slate-200 rounded-xl shadow-xs p-5 text-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-600" /> แผงควบคุมกลุ่มตัวกรองสัมพันธ์ (Cascade Filters System)
          </span>
          <button onClick={resetFilters} className="text-xs text-gray-500 hover:text-rose-600 flex items-center gap-1 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-rose-220 hover:bg-rose-50/20 transition-all font-bold cursor-pointer">
            รีเซ็ตตัวกรองทั้งหมด
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-550 mb-1.5">วันที่เริ่มต้นข้อมูล (Start Date)</label>
            <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({...prev, start: e.target.value}))} className="w-full border rounded-lg p-2 h-10 bg-white text-xs outline-none focus:border-teal-500 shadow-2xs font-semibold text-slate-800" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-550 mb-1.5">วันที่สิ้นสุดข้อมูล (End Date)</label>
            <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({...prev, end: e.target.value}))} className="w-full border rounded-lg p-2 h-10 bg-white text-xs outline-none focus:border-teal-500 shadow-2xs font-semibold text-slate-800" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-teal-700 mb-1.5 flex items-center gap-1">
              <Activity className="w-3 h-3 text-teal-500 animate-pulse" /> เงื่อนไขประเภทรายงานหลัก
            </label>
            <select
              className="w-full border rounded-lg p-2 h-10 bg-teal-50/30 font-bold text-teal-950 border-teal-200 focus:ring-teal-505 focus:border-teal-500 text-xs shadow-2xs"
              value={activeReport}
              onChange={e => setActiveReport(e.target.value)}
            >
              {REPORT_CONFIGS.map(cfg => (
                <option key={cfg.id} value={cfg.id}>
                  {cfg.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">ลงบัญชีทีม (Accounting Team)</label>
            <select 
              className={`w-full border rounded-lg p-2 h-10 text-xs shadow-2xs font-semibold ${filterTeam !== 'ทั้งหมด' ? 'bg-teal-50 text-teal-955 border-teal-350 font-bold' : 'bg-white text-slate-800'}`} 
              value={filterTeam} 
              onChange={e=>setFilterTeam(e.target.value)}
            >
               <option value="ทั้งหมด">ทั้งหมด (All Teams)</option>
               {hasUnspecifiedTeam && <option value="ไม่ระบุทีม">ไม่ระบุทีม (Unspecified)</option>}
               {teamOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">ผู้ดูแล (Supervisor / Owner)</label>
            <select 
              className={`w-full border rounded-lg p-2 h-10 text-xs shadow-2xs font-semibold ${filterSupervisor !== 'ทั้งหมด' ? 'bg-teal-50 text-teal-955 border-teal-350 font-bold' : 'bg-white text-slate-800'}`} 
              value={filterSupervisor} 
              onChange={e=>setFilterSupervisor(e.target.value)}
            >
               <option value="ทั้งหมด">ทั้งหมด (All Supervisors)</option>
               {hasUnspecifiedSupervisor && <option value="ไม่ระบุผู้ดูแล">ไม่ระบุผู้ดูแล (Unspecified)</option>}
               {supervisorOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">จังหวัดจัดส่งปลายทาง (Province)</label>
            <select 
              className={`w-full border rounded-lg p-2 h-10 text-xs shadow-2xs font-semibold ${filterProvince !== 'ทั้งหมด' ? 'bg-teal-50 text-teal-955 border-teal-350 font-bold' : 'bg-white text-slate-800'}`} 
              value={filterProvince} 
              onChange={e=>setFilterProvince(e.target.value)}
            >
               <option value="ทั้งหมด">ทั้งหมด (All Provinces)</option>
               {hasUnspecifiedProvince && <option value="ไม่ระบุจังหวัด">ไม่ระบุจังหวัด (Unspecified)</option>}
               {provinceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">จัดแผนกลุ่มลูกค้า (Customer Group)</label>
            <select 
              className={`w-full border rounded-lg p-2 h-10 text-xs shadow-2xs font-semibold ${filterCustomerGroup !== 'ทั้งหมด' ? 'bg-teal-50 text-teal-955 border-teal-350 font-bold' : 'bg-white text-slate-800'}`} 
              value={filterCustomerGroup} 
              onChange={e=>setFilterCustomerGroup(e.target.value)}
            >
               <option value="ทั้งหมด">ทั้งหมด (All Groups)</option>
               {hasUnspecifiedCustomerGroup && <option value="ไม่ระบุกลุ่มลูกค้า">ไม่ระบุกลุ่มลูกค้า (Unspecified)</option>}
               {customerGroupOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">บริษัทรับงานขนส่ง (Carrier)</label>
            <select 
              className={`w-full border rounded-lg p-2 h-10 text-xs shadow-2xs font-semibold ${filterServiceProvider !== 'ทั้งหมด' ? 'bg-teal-50 text-teal-955 border-teal-350 font-bold' : 'bg-white text-slate-800'}`} 
              value={filterServiceProvider} 
              onChange={e=>setFilterServiceProvider(e.target.value)}
            >
               <option value="ทั้งหมด">ทั้งหมด (All Carriers)</option>
               {hasUnspecifiedServiceProvider && <option value="ไม่ระบุบริษัทบริการ">ไม่ระบุบริษัทบริการ (Unspecified)</option>}
               {serviceProviderOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">สาขาผู้จัดส่ง (Sender Branch Name)</label>
            <select 
              className={`w-full border rounded-lg p-2 h-10 text-xs shadow-2xs font-semibold ${filterBranchName !== 'ทั้งหมด' ? 'bg-teal-50 text-teal-955 border-teal-350 font-bold' : 'bg-white text-slate-800'}`} 
              value={filterBranchName} 
              onChange={e=>setFilterBranchName(e.target.value)}
            >
               <option value="ทั้งหมด">ทั้งหมด (All Branches)</option>
               {hasUnspecifiedBranch && <option value="ไม่ระบุสาขา">ไม่ระบุสาขา (Unspecified)</option>}
               {branchOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">พิมพ์ค้นหาอัจฉริยะ (ค้นรหัสพัสดุ / ชื่อคนส่ง / รหัสสาขา )</label>
            <div className="relative">
              <input 
                type="text" 
                value={searchTerm} 
                onChange={e=>setSearchTerm(e.target.value)} 
                placeholder="พิมพ์ส่วนที่ต้องการค้นหาด่วน..." 
                className="w-full border border-gray-250 rounded-lg pl-9 pr-4 h-10 text-xs shadow-2xs text-slate-800 font-bold outline-none focus:border-teal-600"
              />
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3.5" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 mb-1.5">เรียงลำดับตารางแจกแจง</label>
            <div className="flex gap-1.5">
              <select className="border border-gray-200 rounded-lg p-2 h-10 bg-white text-xs select-none flex-1 font-bold shadow-2xs focus:border-teal-600" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
                <option value="shipping">ยอดรวมค่าขนส่ง</option>
                <option value="comm">ยอดจัดคอมรวมสุทธิ</option>
                <option value="bills">ตัวเลขจำนวนบิล</option>
                <option value="qty">ตัวเลขจำนวนชิ้น</option>
              </select>
              <select className="border border-gray-200 rounded-lg p-2 h-10 bg-white text-xs font-bold shadow-2xs focus:border-teal-600" value={sortOrder} onChange={e=>setSortOrder(e.target.value as 'asc' | 'desc')}>
                <option value="desc">มาก → น้อย</option>
                <option value="asc">น้อย → มาก</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {hasAnyActiveFilter && (
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 border p-3 rounded-xl text-xs font-bold text-slate-600">
          <span className="font-bold text-slate-400 mr-1">ตัวกรองแอคทีฟสะสม:</span>
          {filterTeam !== 'ทั้งหมด' && (
            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full text-[10px]">
              ทีม: {filterTeam}
              <button onClick={() => setFilterTeam('ทั้งหมด')} className="hover:text-teal-950 font-bold ml-1 cursor-pointer">×</button>
            </span>
          )}
          {filterSupervisor !== 'ทั้งหมด' && (
            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full text-[10px]">
              ผู้ดูแล: {filterSupervisor}
              <button onClick={() => setFilterSupervisor('ทั้งหมด')} className="hover:text-teal-950 font-bold ml-1 cursor-pointer">×</button>
            </span>
          )}
          {filterProvince !== 'ทั้งหมด' && (
            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full text-[10px]">
              จังหวัด: {filterProvince}
              <button onClick={() => setFilterProvince('ทั้งหมด')} className="hover:text-teal-950 font-bold ml-1 cursor-pointer">×</button>
            </span>
          )}
          {filterCustomerGroup !== 'ทั้งหมด' && (
            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full text-[10px]">
              กลุ่มลูกค้า: {filterCustomerGroup}
              <button onClick={() => setFilterCustomerGroup('ทั้งหมด')} className="hover:text-teal-950 font-bold ml-1 cursor-pointer">×</button>
            </span>
          )}
          {filterServiceProvider !== 'ทั้งหมด' && (
            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full text-[10px]">
              บริษัทบริการ: {filterServiceProvider}
              <button onClick={() => setFilterServiceProvider('ทั้งหมด')} className="hover:text-teal-950 font-bold ml-1 cursor-pointer">×</button>
            </span>
          )}
          {filterBranchName !== 'ทั้งหมด' && (
            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full text-[10px]">
              สาขา: {filterBranchName}
              <button onClick={() => setFilterBranchName('ทั้งหมด')} className="hover:text-teal-950 font-bold ml-1 cursor-pointer">×</button>
            </span>
          )}
          {searchTerm.trim() !== '' && (
            <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2.5 py-1 rounded-full text-[10px]">
              ค้นหา: "{searchTerm}"
              <button onClick={() => setSearchTerm('')} className="hover:text-teal-950 font-bold ml-1 cursor-pointer">×</button>
            </span>
          )}
          <button onClick={resetFilters} className="text-rose-600 hover:text-rose-800 font-bold ml-auto px-2 py-0.5 border border-dashed border-rose-350 rounded text-[10px] bg-white transition-all hover:bg-rose-50 cursor-pointer">
            ล้างตัวกรองทั้งหมด
          </button>
        </div>
      )}

      {allShipments.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl text-gray-500 p-8 text-center shadow-2xs">
           <Calculator className="w-14 h-14 text-teal-300 mb-4 animate-bounce" />
           <h3 className="text-lg font-black text-slate-800 dark:text-slate-200 mb-2">ยังไม่มีข้อมูลในวันและรายงานหลักที่คุณกำลังกรอง</h3>
           <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
             ในช่วงวันที่ <strong>{dateRange.start}</strong> ถึง <strong>{dateRange.end}</strong> ยังไม่มีข้อมูลนำเข้าใดๆ หรือพัสดุในชื่อรายงาน <strong>{REPORT_CONFIGS.find(r => r.id === activeReport)?.name}</strong>
           </p>
           <div className="mt-5 flex gap-3">
             <button
               onClick={handleReprocess}
               className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer active:scale-95 animate-pulse"
             >
               ลองคำนวณค่าคอมใหม่
             </button>
             <button
               onClick={() => navigate('/import')}
               className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-gray-700 font-bold rounded-xl text-xs transition-all border border-gray-200 shadow-2xs cursor-pointer"
             >
               ไปหน้านำเข้าข้อมูล
             </button>
           </div>
        </div>
      ) : filteredAllShipments.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center bg-white dark:bg-gray-900 border border-gray-200 rounded-xl text-gray-500 p-6 text-center shadow-2xs">
           <Filter className="w-12 h-12 text-slate-300 mb-3 animate-pulse" />
           <h3 className="text-base font-bold text-slate-705 mb-1">ไม่พบผลลัพธ์ที่ตรงตามการกรอง</h3>
           <p className="text-xs max-w-sm text-gray-500">ทดลองคลายเงื่อนไขต่าง ๆ หรือเลือกช่องตัวกรองด้านบนกลับเป็น “ทั้งหมด” เพื่อคำนวณใหม่</p>
           <button onClick={resetFilters} className="mt-4 px-4 py-2 bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold rounded-xl text-xs transition-all cursor-pointer">
             ล้างตัวกรองทั้งหมด
           </button>
        </div>
      ) : (
        <>
          <div className="bg-teal-50/50 border border-teal-100/50 rounded-xl p-3 flex items-center gap-2 text-xs text-teal-950 font-semibold leading-relaxed">
            <HelpCircle className="w-4 h-4 text-teal-600 shrink-0" />
            <span>แสดงข้อมูลที่ผ่านการกรอง (Filter) ปัจจุบัน: ตัวเลข และสถิติตารางย่อยทั้งหมดเป็นข้อมูล<strong>ในชุดเดียวกันและมีเงื่อนไขสัมพันธ์กันอย่างเป็นหนึ่งเดียว</strong></span>
          </div>

          {/* Core Reacting KPI Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-white dark:bg-gray-900 p-4 border rounded-xl shadow-2xs">
               <div className="text-[11px] font-bold text-slate-404 uppercase tracking-wider">จับคู่สำเร็จรวม (Mapped Rows)</div>
               <div className="text-xl font-black text-emerald-600 mt-1.5 flex items-baseline gap-1.5">
                 <span>{formatNumber(mappedCountFiltered)}</span>
                 <span className="text-xs font-semibold text-slate-400">/ {formatNumber(totalShipmentsFiltered)} พัสดุ</span>
               </div>
               <div className="text-[10px] text-slate-400 mt-1 font-semibold">อัตราจับแต่งคู่รอบพัสดุ: {mappedPercentFiltered.toFixed(1)}%</div>
            </div>

            <div 
              onClick={() => navigate('/unmapped-commission')}
              className="bg-white dark:bg-gray-900 p-4 border rounded-xl shadow-2xs hover:border-rose-400 cursor-pointer transition-all bg-gradient-to-br from-rose-50/10 to-white group"
            >
               <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider flex items-center gap-1 justify-between">
                 <span>ต้องระบุแผนผังเพิ่ม (Unmapped)</span>
                 <span className="text-[9px] bg-rose-100 text-rose-800 font-black px-1.5 py-0.5 rounded-full">รออัปเดต</span>
               </div>
               <div className="text-xl font-black text-rose-650 mt-1.5 flex items-baseline justify-between">
                 <span>{formatNumber(unmappedCountFiltered)} รายการ</span>
                 <span className="text-[10px] text-rose-505 font-bold group-hover:underline">ประกบหน้านี้ →</span>
               </div>
               <div className="text-[10px] text-slate-400 mt-1 font-semibold">คิดเป็น {(100 - mappedPercentFiltered).toFixed(1)}% ในเงื่อนไขตัวกรอง</div>
            </div>

            <div className="bg-white dark:bg-gray-900 p-4 border rounded-xl shadow-2xs">
               <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">อัตราประกบคู่รวมหลังกรอง (Match Rate)</div>
               <div className="text-xl font-black text-teal-600 mt-1.5">
                 {mappedPercentFiltered.toFixed(1)} %
               </div>
               <div className="w-full bg-slate-150 rounded-full h-1.5 mt-2.5 overflow-hidden">
                 <div className="bg-teal-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${mappedPercentFiltered}%` }}></div>
               </div>
            </div>

            <div className="bg-white dark:bg-gray-900 p-4 border rounded-xl shadow-2xs bg-gradient-to-br from-teal-50/20 to-white border-teal-100 relative group">
               <div className="text-[11px] font-bold text-teal-700 uppercase tracking-wider flex items-center gap-1 justify-between">
                 <span>ยอดคอมมิชชั่นสะสมสุทธิ</span>
                 <div className="relative">
                   <HelpCircle className="w-3.5 h-3.5 text-teal-400 hover:text-teal-600 cursor-help" />
                   <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block whitespace-nowrap bg-slate-900 text-white text-[10px] rounded py-1 px-2 z-50 shadow-md">
                     คำนวณรวมเฉพาะรายการที่พบคู่สำเร็จเท่านั้น
                   </div>
                 </div>
               </div>
               <div className="text-xl font-black text-teal-905 mt-1.5">{formatCurrency(stats.totalCommission)}</div>
               <div className="text-[10px] text-slate-400 mt-1.5">จากค่าขนส่งรวมสุทธิ {formatCurrency(stats.totalShippingFee)} (ลูกค้า: {formatNumber(uniqueCustomersCount)} ราย / บิล: {formatNumber(stats.totalBills)})</div>
            </div>

          </div>

          {/* Sub-aggregation Small Tables Block - Perfect responsive grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {stats.custGroups && stats.custGroups.length > 0 && (
              <SmallTable title="1. สรุปผลสรุปจำแนกกลุ่มลูกค้าค่าคอมมิชชั่น" records={stats.custGroups} columns={[{k:'key', l:'กลุ่มลูกค้า'}, {k:'bills', l:'จำนวนบิล', type:'number'}, {k:'qty', l:'จำนวนชิ้น', type:'number'}, {k:'shipping', l:'ค่าขนส่งรวม', type:'currency'}, {k:'comm', l:'ค่าคอมสุทธิ', type:'currency', color:'teal'}]} />
            )}
            
            {stats.carriers && stats.carriers.length > 0 && (
              <SmallTable title="2. สรุปวิเคราะห์ผลแจกแจงบริษัทขนส่งจัดส่ง" records={stats.carriers} columns={[{k:'key', l:'บริษัทบริการ'}, {k:'bills', l:'จำนวนบิล', type:'number'}, {k:'qty', l:'จำนวนชิ้น', type:'number'}, {k:'shipping', l:'ค่าขนส่งรวม', type:'currency'}, {k:'comm', l:'ค่าคอมสุทธิ', type:'currency', color:'teal'}]} />
            )}
            
            {stats.areas && stats.areas.length > 0 && (
              <SmallTable title="3. จำแนกเขตจัดส่งกรุงเทพปริมณฑล และ 68 จังหวัด" records={stats.areas} columns={[{k:'key', l:'กรุ๊ปพื้นที่จัดส่ง'}, {k:'bills', l:'จำนวนบิล', type:'number'}, {k:'qty', l:'จำนวนชิ้น', type:'number'}, {k:'shipping', l:'ค่าขนส่งรวม', type:'currency'}, {k:'comm', l:'ค่าคอมสุทธิ', type:'currency', color:'teal'}]} />
            )}
            
            {stats.accTeams && stats.accTeams.length > 0 && (
              <SmallTable title="4. การกระจายส่วนยอดสังกัดรายสายทีมนักบัญชี" records={stats.accTeams} columns={[{k:'key', l:'ทีมนักบัญชีรับผิดชอบ'}, {k:'bills', l:'จำนวนบิล', type:'number'}, {k:'qty', l:'จำนวนชิ้น', type:'number'}, {k:'shipping', l:'ค่าขนส่งรวม', type:'currency'}, {k:'comm', l:'ค่าคอมสุทธิ', type:'currency', color:'teal'}]} />
            )}
            
            {stats.supervisors && stats.supervisors.length > 0 && (
              <div className="md:col-span-2">
                <SmallTable title="5. บอร์ดจำกัดแยกรายผู้ดูแลพนักงานขายผู้แนะนำ (Supervisor)" records={stats.supervisors} columns={[
                  {k:'key', l:'ผู้ดูแลหลัก (Supervisor / Owner)'}, {k:'branchCode', l:'รหัสสาขาตัวอย่าง'}, {k:'bills', l:'จำนวนบิลส่ง', type:'number'}, {k:'qty', l:'จำนวนชิ้นรวม', type:'number'}, {k:'shipping', l:'ค่าขนส่งรวมสสะสม', type:'currency'}, {k:'comm', l:'ยอดคอมมิชชั่นรวม', type:'currency', color:'teal'}
                ]} />
              </div>
            )}

            {stats.branches && stats.branches.length > 0 && (
              <SmallTable title="6. ยอดสะสมจำแนกรายชื่อสาขาจัดส่ง" records={stats.branches} columns={[
                {k:'key', l:'ชื่อสาขา'}, {k:'bills', l:'บิลสะสม', type:'number'}, {k:'qty', l:'ชิ้นสะสม', type:'number'}, {k:'shipping', l:'ค่าขนส่งรวมต์', type:'currency'}, {k:'comm', l:'ค่าคอมสุทธิ', type:'currency', color:'teal'}
              ]} />
            )}
            
            {stats.customers && stats.customers.length > 0 && (
              <SmallTable title="7. การจำแนกรายชื่อลูกค้ารวม" records={stats.customers} columns={[
                {k:'key', l:'ชื่อลูกค้าผู้ส่ง'}, {k:'bills', l:'บิลสะสม', type:'number'}, {k:'qty', l:'ชิ้นสะสม', type:'number'}, {k:'shipping', l:'ค่าขนส่งรวมต์', type:'currency'}, {k:'comm', l:'ค่าคอมสุทธิ', type:'currency', color:'teal'}
              ]} />
            )}
            
            {stats.branchCodes && stats.branchCodes.length > 0 && (
              <SmallTable title="8. การเปรียบเทียบบทวิเคราะห์รหัสสาขา" records={stats.branchCodes} columns={[
                {k:'key', l:'รหัสสาขารับงาน'}, {k:'bills', l:'บิลสะสม', type:'number'}, {k:'qty', l:'ชิ้นสะสม', type:'number'}, {k:'shipping', l:'ค่าขนส่งรวมต์', type:'currency'}, {k:'comm', l:'ค่าคอมสุทธิ', type:'currency', color:'teal'}
              ]} />
            )}
          </div>

          {/* Interactive Unmatched Shipments Debug Section (E.5 & C.5) */}
          <div className="bg-white dark:bg-gray-900 border border-slate-200 rounded-xl shadow-xs p-4.5 mt-4">
            <div className="flex flex-col sm:flex-row items-center justify-between border-b border-gray-150 pb-3 mb-4 gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
                <div>
                  <h3 className="text-sm font-black text-slate-800">ระบบช่วยเหลือวิเคราะห์สิทธิ์และสาเหตุประกบคู่ไม่สำเร็จ (Debug Mode)</h3>
                  <p className="text-[11px] text-gray-500 font-semibold">แสดงพัสดุที่ไม่พบคู่แผนผัง {filteredUnmappedShipments.length} รายการหลังกรอง พร้อมแสดงเหตุผลที่เครื่องคำนวณตรวจสอบแบบเรียลไทม์</p>
                </div>
              </div>
              <button 
                onClick={() => setDebugMode(!debugMode)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-bold shadow-2xs transition-all cursor-pointer ${debugMode ? 'bg-teal-100 border-teal-350 text-teal-800' : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'}`}
              >
                {debugMode ? '🔒 ปิดเครื่องมือช่วยเหลือวิเคราะห์' : '🔍 เปิดเครื่องมือวิเคราะห์ทางบัญชี'}
              </button>
            </div>
            
            {debugMode && (
              <div className="overflow-x-auto max-h-[350px] border border-gray-100 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 font-bold text-gray-500 border-b sticky top-0 bg-slate-50">
                    <tr>
                      <th className="p-2.5">รหัสพัสดุ/ใบสั่งซื้อ</th>
                      <th className="p-2.5">รหัสสาขา</th>
                      <th className="p-2.5">ชื่อลูกค้าผู้ส่ง</th>
                      <th className="p-2.5">จังหวัดปลายทาง</th>
                      <th className="p-2.5">ประเภทรายงาน</th>
                      <th className="p-2.5 text-rose-600">วิเคราะห์สาเหตุเชิงลึกเชิงโครงสร้างเงื่อนไข</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUnmappedShipments.slice(0, 100).map((s, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/20 font-medium">
                        <td className="p-2.5 font-mono text-slate-850 font-bold">{s.orderNo || s.trackingNo || '-'}</td>
                        <td className="p-2.5 text-slate-700 font-semibold">{s.branchCode || s.mappedBranchCode || '-'}</td>
                        <td className="p-2.5 text-slate-700 font-medium">{s.senderName || s.branchName || '-'}</td>
                        <td className="p-2.5 text-slate-500">{s.toProvince || s.receiverProvince || '-'}</td>
                        <td className="p-2.5"><span className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[9px] font-bold">{s.reportType || '-'}</span></td>
                        <td className="p-2.5 text-rose-500 font-bold leading-relaxed">{s.unmatchedReason || "รหัสผู้ส่ง/ชื่อร้านไม่พบคู่ประกบกับแผนผังที่มีในฐานระบบข้อมูลสาขา"}</td>
                      </tr>
                    ))}
                    {filteredUnmappedShipments.length > 100 && (
                      <tr>
                        <td colSpan={6} className="p-3 text-center text-[11px] text-teal-600 font-bold bg-slate-50">
                          แสดงเฉพาะ 100 รายการแรกจากทั้งหมด {filteredUnmappedShipments.length} รายการ กรุณากรอกช่องกรองเพื่อวิเคราะห์เจาะจงเฉพาะกลุ่มสาขา
                        </td>
                      </tr>
                    )}
                    {filteredUnmappedShipments.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-teal-600 font-bold">ประกบคู่สำเร็จครบสมบูรณ์ทุกรายการแล้ว ไม่มีข้อมูลผิดพลาดหลังกรอง!</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SmallTable({ title, records, columns }: any) {
  const [sortCol, setSortCol] = useState(columns.length > 1 ? columns[1].k : columns[0].k);
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = [...records].sort((a, b) => {
    let valA = a[sortCol] || 0;
    let valB = b[sortCol] || 0;
    if (typeof valA === 'string') valA = (valA as string).toLowerCase();
    if (typeof valB === 'string') valB = (valB as string).toLowerCase();
    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200/80 rounded-xl shadow-2xs overflow-hidden flex flex-col max-h-[380px]">
       <div className="bg-slate-50 dark:bg-gray-800/50 border-b border-gray-150 px-4 py-3 font-extrabold text-slate-800 dark:text-gray-200 text-[12px] uppercase tracking-wide">
         {title}
       </div>
       <div className="overflow-auto flex-1">
         <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-white sticky top-0 border-b shadow-2xs z-10 text-slate-400 font-bold">
              <tr>
                {columns.map((c: any) => (
                  <th 
                    key={c.k} 
                    className="p-2.5 cursor-pointer hover:bg-slate-50 select-none whitespace-nowrap bg-white font-bold text-[11px]"
                    onClick={() => {
                      setSortCol(c.k);
                      setSortDesc(prev => sortCol === c.k ? !prev : true);
                    }}
                  >
                    {c.l} {sortCol === c.k && (sortDesc ? '▼' : '▲')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-semibold text-slate-800">
              {sorted.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/50 font-medium">
                  {columns.map((c: any) => (
                    <td key={c.k} className={`p-2.5 ${c.color === 'teal' ? `text-teal-600 font-extrabold` : 'text-slate-700'}`}>
                      {c.type === 'currency' ? formatCurrency(r[c.k]) : c.type === 'number' ? formatNumber(r[c.k]) : r[c.k]}
                    </td>
                  ))}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="p-4 text-center text-gray-400 font-bold">ไม่มีข้อมูลตามเงื่อนไขปัจจุบัน</td>
                </tr>
              )}
            </tbody>
         </table>
       </div>
    </div>
  );
}
