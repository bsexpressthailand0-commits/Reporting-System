import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import { getDynamicConfigs, ReportConfig } from '../lib/reportConfigs';
import { useReportBranchGroups } from '../lib/MasterDataContext';

function normalizeDate(date: any) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function isDateInRange(date: any, startDate: string, endDate: string) {
  const current = normalizeDate(date);
  if (!current) return false;

  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);

  if (start && current < start) {
    return false;
  }

  if (end) {
    const endOfDay = new Date(end);
    endOfDay.setHours(23, 59, 59, 999);
    if (current > endOfDay) {
      return false;
    }
  }

  return true;
}

function applyReportFilter(rows: any[], reportConfig: any, filters: any) {
  return rows.filter(row => {
    const rowDate = row.orderDate || row.createdDate || row.reportDate;

    // date filter
    if (filters.startDate && filters.endDate && !isDateInRange(rowDate, filters.startDate, filters.endDate)) {
      return false;
    }

    if (!reportConfig?.filters) return true;

    // Add other existing rules...
    return true;
  });
}

import { collection, query, getDocs, where, Timestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatNumber, formatCurrency } from '../lib/utils';
import * as XLSX from 'xlsx';
import { Download, Printer, Search, FileText, Loader2, CheckSquare, X, Check } from 'lucide-react';
import { aggregateByBranchGroup } from '../lib/reportAggregator';
import ReportTable from '../components/ReportTable';
import ReportSummary from '../components/ReportSummary';
import { exportReportToPdf } from '../lib/reportPdfExporter';
import { downloadReportImages, downloadAllReportImages, exportReportToImageChunks, ImageExportOptions } from '../lib/reportImageExporter';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getCachedCompanyInfo } from '../lib/systemSettings';
import Swal from 'sweetalert2';
import CompactCompanyHeader from '../components/CompactCompanyHeader';
import { useToast } from '../lib/ToastContext';
import { resolveReportBranchGroup } from '../lib/MasterDataContext';
import UnspecifiedTraceModal from '../components/UnspecifiedTraceModal';
import { enrichShipmentWithBranchMapping } from '../lib/branchMapping';

export default function ReportCenter() {
  const toast = useToast();
  const reportBranchGroups = useReportBranchGroups();
  const currentConfigs = getDynamicConfigs(reportBranchGroups);
  const [activeReport, setActiveReport] = useState<string>('all');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'totalOrder', direction: 'desc' });
  const [filters, setFilters] = useState({
    startDate: dayjs().format("YYYY-MM-DD"),
    endDate: dayjs().format("YYYY-MM-DD")
  });
  const [companyInfo, setCompanyInfo] = useState<any>({
    companyNameTh: 'บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด',
    companyNameEn: 'BS EXPRESS 2020 CO., LTD.',
    addressLine1: 'สถานีขนส่งสินค้าพุทธมณฑลสาย 5',
    addressLine2: 'ชานชาลาที่ 11 ห้องที่ 16-17',
    addressLine3: '133 หมู่ที่ 1 ถนนบรมราชชนนี ตำบลบางเตย',
    addressLine4: 'อำเภอสามพราน จังหวัดนครปฐม 73210',
    phone: '02-114-8855',
    email: 'info@bsgroupth.com',
    taxId: '073-556-300-2997'
  });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // PDF & Print Settings state
  const [exportScope, setExportScope] = useState<'all' | 'current'>('all');
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfStatusMessage, setPdfStatusMessage] = useState('');

  // Image Export State
  const [imageFormat, setImageFormat] = useState<'png' | 'jpg'>('png');
  const [imageQuality, setImageQuality] = useState<1 | 2>(2);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageStatusMessage, setImageStatusMessage] = useState('');

  // Image Export Selection Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [exportModalSearch, setExportModalSearch] = useState('');

  // Trace unspecified items modal state
  const [isTraceModalOpen, setIsTraceModalOpen] = useState(false);
  const [traceTargetDate, setTraceTargetDate] = useState<string | undefined>(undefined);

  const handleMappingSuccess = () => {
    // Clear all report sessionStorage caches immediately
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('report_')) {
        sessionStorage.removeItem(key);
      }
    });
    // Reload active configurations
    fetchReportData(activeReport, filters.startDate, filters.endDate);
  };

  useEffect(() => {
    async function loadCompany() {
      const cached = await getCachedCompanyInfo();
      if (cached) {
        setCompanyInfo(cached);
      }
    }
    loadCompany();
  }, []);

  useEffect(() => {

    fetchReportData(activeReport);
  }, [activeReport, filters.startDate, filters.endDate, reportBranchGroups]);

  const getReportDataByConfigId = async (reportId: string, customStartDate?: string, customEndDate?: string) => {
    const start = customStartDate !== undefined ? customStartDate : filters.startDate;
    const end = customEndDate !== undefined ? customEndDate : filters.endDate;
    
    const config = currentConfigs.find(r => r.id === reportId);
    let aggregatedData: any[] = [];
    
    // Always use shipments as the single source of truth to avoid mismatch
    let q = query(collection(db, 'shipments'));
    if (start && end) {
       q = query(
         collection(db, 'shipments'),
         where('orderDate', '>=', start),
         where('orderDate', '<=', end + 'T23:59:59.999Z')
       );
    }
    const snapshot = await getDocs(q);
    let rawData = snapshot.docs.map(doc => doc.data());
    
    const mappingsSnapshot = await getDocs(collection(db, 'branchMappings'));
    const branchMappings = mappingsSnapshot.docs.map(d => d.data() as any);

    const nineProvinces = ['กรุงเทพมหานคร', 'ชลบุรี', 'สมุทรปราการ', 'นครปฐม', 'สมุทรสาคร', 'ปทุมธานี', 'ราชบุรี', 'นนทบุรี', 'สมุทรสงคราม'];
    const pTrim = (p: any) => String(p || "").trim().replace(/\s+/g, "");

    rawData = rawData.map(d => {
      let enriched = enrichShipmentWithBranchMapping(d, branchMappings);
      return {
        ...enriched,
        reportBranchGroup: resolveReportBranchGroup(enriched.reportBranchGroup || enriched.branchGroup || enriched.branchName, reportBranchGroups),
        branchGroup: resolveReportBranchGroup(enriched.reportBranchGroup || enriched.branchGroup || enriched.branchName, reportBranchGroups)
      };
    });

    if (config?.filters) {
      if (config.filters.isNineProvince !== undefined) {
         if (config.filters.isNineProvince) {
           rawData = rawData.filter(d => nineProvinces.some(np => pTrim(np) === pTrim(d.province)) || d.provinceGroup === "9_PROVINCES");
         } else {
           rawData = rawData.filter(d => (!nineProvinces.some(np => pTrim(np) === pTrim(d.province))) && d.provinceGroup !== "9_PROVINCES");
         }
      }
      if (config.filters.lineType) {
         rawData = rawData.filter(d => d.lineType === config.filters?.lineType);
      }
      if (config.filters.branchType) {
         rawData = rawData.filter(d => d.branchType === config.filters?.branchType);
      }
      if (config.filters.branchGroup) {
         rawData = rawData.filter(d => d.reportBranchGroup === config.filters?.branchGroup || d.branchGroup === config.filters?.branchGroup);
      }
      if (config.filters.reportBranchGroup) {
         rawData = rawData.filter(d => d.reportBranchGroup === config.filters!.reportBranchGroup);
      }
      if (config.filters.sales) {
         rawData = rawData.filter(d => (d.sales || '').includes(config.filters?.sales));
      }
      if (config.filters.isMainRevenue) rawData = rawData.filter((d: any) => d.isMainRevenue || d.mainBranch === 'รายได้รวมหลัก');
      if (config.filters.isNetwork) rawData = rawData.filter((d: any) => d.isNetwork || d.subBranch === 'เครือข่าย' || d.reportBranchGroup === 'เครือข่าย');
      if (config.filters.isDropPoint) rawData = rawData.filter((d: any) => d.isDropPoint || (d.reportBranchGroup || '').includes('Drop Point') || d.subBranch === 'ตัวแทนสาขาDP');
      if (config.filters.isCallin) rawData = rawData.filter((d: any) => d.isCallin || (d.reportBranchGroup || '').includes('CALLIN'));
      if (config.filters.isSaleDriver) rawData = rawData.filter((d: any) => d.isSaleDriver || (d.reportBranchGroup || '').toUpperCase().includes('SALE DRIVER') || (d.reportBranchGroup || '').toUpperCase().includes('SALEDRIVER'));
      if (config.filters.isOnline) rawData = rawData.filter((d: any) => d.isOnline || (d.reportBranchGroup || '').includes('ONLINE'));
      if (config.filters.isRcPickup) rawData = rawData.filter((d: any) => d.isRcPickup || (d.reportBranchGroup || '').includes('งานเข้ารับ'));
      if (config.filters.isFullTruckLoad) rawData = rawData.filter((d: any) => d.isFullTruckLoad);
      if (config.filters.isEcommerce) rawData = rawData.filter((d: any) => d.isEcommerce);
      if (config.filters.is360Truck) rawData = rawData.filter((d: any) => d.is360Truck);
    }

    aggregatedData = aggregateByBranchGroup(rawData, config?.groupBy);
    
    // Validation: Check if sums match
    const rawTotal = rawData.reduce((acc, row) => acc + (Number(row.orderTotal) || 0), 0);
    const aggTotal = aggregatedData.reduce((acc, row) => acc + (Number(row.totalOrder) || 0), 0);
    if (Math.abs(rawTotal - aggTotal) > 0.01) {
      console.warn(`[Validation Error] Report ${reportId} calculation mismatch: Raw=${rawTotal}, Aggregated=${aggTotal}`);
    } else {
      console.log(`[Validation OK] Report ${reportId} total: ${aggTotal}`);
    }

    aggregatedData.sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.branchGroup.localeCompare(b.branchGroup));
    return aggregatedData;
  };

  const fetchReportData = async (reportId: string, customStartDate?: string, customEndDate?: string) => {
    if (loading) return;
    
    const start = customStartDate !== undefined ? customStartDate : filters.startDate;
    const end = customEndDate !== undefined ? customEndDate : filters.endDate;
    
    // Attempt session cache recovery
    const cacheKey = `report_${reportId}_${start}_${end}`;
    const cachedData = sessionStorage.getItem(cacheKey);
    
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setData(parsed);
        setCurrentPage(1);
        return;
      } catch (e) {
        sessionStorage.removeItem(cacheKey);
      }
    }

    setLoading(true);
    try {
      const data = await getReportDataByConfigId(reportId, customStartDate, customEndDate);
      setData(data);
      setCurrentPage(1);
      
      // Save to session cache
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (error: any) {
      console.error(error);
      if (error.code === 'resource-exhausted' || String(error).includes('quota')) {
        Swal.fire({
          title: 'โควต้าเต็ม (Quota Exceeded)',
          text: 'ระบบใช้งานเครื่องเซิร์ฟเวอร์ฐานข้อมูลโควต้าฟรีครบกำหนดของวันนี้แล้ว กรุณาลองใหม่ในวันถัดไป หรือลดช่วงวันที่ในการค้นหาลง',
          icon: 'error',
          confirmButtonText: 'ตกลง'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const currentConfig = currentConfigs.find(r => r.id === activeReport);

  const handleSearchDate = () => {
    fetchReportData(activeReport);
  };

  const resetDate = () => {
    const today = dayjs().format("YYYY-MM-DD");
    setFilters({ startDate: today, endDate: today });
  };

  const setToday = () => {
    const today = dayjs().format("YYYY-MM-DD");
    setFilters({ startDate: today, endDate: today });
  };

  const setYesterday = () => {
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");
    setFilters({ startDate: yesterday, endDate: yesterday });
  };

  const setLast7Days = () => {
    const start = dayjs().subtract(6, "day").format("YYYY-MM-DD");
    const end = dayjs().format("YYYY-MM-DD");
    setFilters({ startDate: start, endDate: end });
  };
  
  const setThisMonth = () => {
    const start = dayjs().startOf('month').format("YYYY-MM-DD");
    const end = dayjs().format("YYYY-MM-DD");
    setFilters({ startDate: start, endDate: end });
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc"
        };
      }
      return {
        key,
        direction: "desc"
      };
    });
  };

  // Filter local data
  const filteredData = data.filter(item => 
     (item.branchGroup || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
     (item.reportDate || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedData = [...filteredData].sort((a, b) => {
    const valueA = a[sortConfig.key];
    const valueB = b[sortConfig.key];

    if (typeof valueA === "number" && typeof valueB === "number") {
      return sortConfig.direction === "asc"
        ? valueA - valueB
        : valueB - valueA;
    }

    const textA = String(valueA || "");
    const textB = String(valueB || "");

    return sortConfig.direction === "asc"
      ? textA.localeCompare(textB, "th")
      : textB.localeCompare(textA, "th");
  });

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);

  const exportExcel = () => {
    const headerLabel = currentConfig?.displayGroupLabel || "กลุ่มสาขา";
    const mappedData = sortedData.map(item => ({
       'วันที่': item.reportDate,
       [headerLabel]: item.branchGroup,
       'ยอดออเดอร์รวม': item.totalOrder,
       'ยอดต้นทาง': item.prepaidTotal,
       'ยอดปลายทาง': item.postpaidTotal,
       'COD': item.totalCod,
       'จำนวนชิ้น': item.totalQuantity,
       'จำนวนบิล': item.totalBills,
       'จำนวน Tracking': item.totalTracking
    }));
    const ws = XLSX.utils.json_to_sheet(mappedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${currentConfig?.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportPdf = async () => {
    setPdfGenerating(true);
    setPdfStatusMessage('กำลังโหลดข้อมูลการตั้งค่าชื่อบริษัทจากฐานข้อมูล...');
    try {
      const companySnap = await getDoc(doc(db, 'systemSettings', 'company'));
      const companyInfo = companySnap.exists() ? companySnap.data() : undefined;

      await exportReportToPdf({
        reportName: currentConfig?.name || 'รายงานยอดการฝากส่งสะสม',
        displayGroupLabel: currentConfig?.displayGroupLabel || 'กลุ่มสาขา',
        startDate: filters.startDate,
        endDate: filters.endDate,
        data: sortedData,
        companyInfo,
        exportScope,
        currentPage,
        itemsPerPage
      }, (loading, text) => {
        setPdfGenerating(loading);
        setPdfStatusMessage(text);
      });
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการประมวลผล PDF');
      setPdfGenerating(false);
    }
  };

  const exportImage = async () => {
    setImageGenerating(true);
    setImageStatusMessage('กำลังเตรียมสร้างภาพรายงาน...');
    try {
      const companySnap = await getDoc(doc(db, 'systemSettings', 'company'));
      const company = companySnap.exists() ? companySnap.data() : companyInfo;

      const options: ImageExportOptions = {
        reportName: currentConfig?.name || 'รายงาน',
        displayGroupLabel: currentConfig?.displayGroupLabel || 'กลุ่มสาขา',
        startDate: filters.startDate,
        endDate: filters.endDate,
        data: sortedData,
        companyInfo: company,
        quality: imageQuality,
        format: imageFormat,
      };

      await downloadReportImages(options, (loading, msg) => {
        setImageGenerating(loading);
        setImageStatusMessage(msg);
      });
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการประมวลผลไฟล์ภาพ');
      setImageGenerating(false);
    }
  };

  const exportAllImages = async () => {
    setImageGenerating(true);
    setImageStatusMessage('กำลังรวบรวมรายงานทั้งหมด...');
    try {
      const companySnap = await getDoc(doc(db, 'systemSettings', 'company'));
      const company = companySnap.exists() ? companySnap.data() : companyInfo;

      const dateStr = filters.startDate === filters.endDate ? filters.startDate : `${filters.startDate}_${filters.endDate}`;
      
      const reportsData: { reportName: string; options: ImageExportOptions }[] = [];
      
      for (let i = 0; i < currentConfigs.length; i++) {
        const _config = currentConfigs[i];
        if (i % 3 === 0) setImageStatusMessage(`กำลังดึงข้อมูล ${i+1}/${currentConfigs.length}...`);
        
        let reportDataByConfig = await getReportDataByConfigId(_config.id, filters.startDate, filters.endDate);
        
        reportsData.push({
          reportName: _config.name,
          options: {
            reportName: _config.name,
            displayGroupLabel: _config.displayGroupLabel || 'กลุ่มสาขา',
            startDate: filters.startDate,
            endDate: filters.endDate,
            data: reportDataByConfig,
            companyInfo: company,
            quality: imageQuality,
            format: imageFormat,
          }
        });
      }

      setImageStatusMessage('กำลังเริ่มสร้างไฟล์ภาพรวม...');
      await downloadAllReportImages(reportsData, dateStr, (loading, msg) => {
        setImageGenerating(loading);
        setImageStatusMessage(msg);
      });

    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการสร้างไฟล์ภาพรวมทั้งหมด');
      setImageGenerating(false);
    }
  };

  const getExportFileName = (configId: string, name: string, dateStr: string, format: string): string => {
    if (configId === 'branch_daily_9') {
      return `report-9-provinces-${dateStr}.${format}`;
    }
    if (configId === 'branch_daily_68') {
      return `report-68-provinces-${dateStr}.${format}`;
    }
    if (configId === 'summary_all') {
      return `report-summary-${dateStr}.${format}`;
    }
    
    // Clean and normalize name for fallback English/Thai filenames
    const cleanName = String(name)
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[()]/g, '')
      .toLowerCase();
    
    return `report-${cleanName}-${dateStr}.${format}`;
  };

  const exportSelectedImages = async () => {
    if (selectedReportIds.length === 0) {
      toast.error('กรุณาเลือกรายงานที่ต้องการดาวน์โหลด');
      return;
    }

    setImageGenerating(true);
    setImageStatusMessage('กำลังเริ่มดึงข้อมูลรายงานที่เลือก...');
    setIsExportModalOpen(false);

    try {
      const companySnap = await getDoc(doc(db, 'systemSettings', 'company'));
      const company = companySnap.exists() ? companySnap.data() : companyInfo;

      const dateStr = filters.startDate === filters.endDate ? filters.startDate : `${filters.startDate}_${filters.endDate}`;
      
      const selectedConfigs = currentConfigs.filter(cfg => selectedReportIds.includes(cfg.id));
      
      const zip = new JSZip();
      
      if (selectedConfigs.length === 1) {
        const _config = selectedConfigs[0];
        setImageStatusMessage(`กำลังดึงข้อมูล ${_config.name}...`);
        const reportDataByConfig = await getReportDataByConfigId(_config.id, filters.startDate, filters.endDate);
        
        const options: ImageExportOptions = {
          reportName: _config.name,
          displayGroupLabel: _config.displayGroupLabel || 'กลุ่มสาขา',
          startDate: filters.startDate,
          endDate: filters.endDate,
          data: reportDataByConfig,
          companyInfo: company,
          quality: imageQuality,
          format: imageFormat,
        };
        
        setImageStatusMessage(`กำลังสร้างภาพ ${_config.name}...`);
        const images = await exportReportToImageChunks(options, undefined);
        
        images.forEach((blob, idx) => {
          const suffix = images.length > 1 ? `_page${idx + 1}` : '';
          const filename = getExportFileName(_config.id, _config.name, dateStr, imageFormat);
          const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
          saveAs(blob, `${nameWithoutExt}${suffix}.${imageFormat}`);
        });
      } else {
        // Multiple reports -> pack them inside a ZIP
        for (let i = 0; i < selectedConfigs.length; i++) {
          const _config = selectedConfigs[i];
          setImageStatusMessage(`กำลังดึงข้อมูล ${i + 1}/${selectedConfigs.length}: ${_config.name}...`);
          
          let reportDataByConfig = await getReportDataByConfigId(_config.id, filters.startDate, filters.endDate);
          
          const options: ImageExportOptions = {
            reportName: _config.name,
            displayGroupLabel: _config.displayGroupLabel || 'กลุ่มสาขา',
            startDate: filters.startDate,
            endDate: filters.endDate,
            data: reportDataByConfig,
            companyInfo: company,
            quality: imageQuality,
            format: imageFormat,
          };
          
          setImageStatusMessage(`กำลังวาดภาพ ${i + 1}/${selectedConfigs.length}: ${_config.name}...`);
          const images = await exportReportToImageChunks(options, undefined);
          
          images.forEach((blob, idx) => {
            const suffix = images.length > 1 ? `_page${idx + 1}` : '';
            const filename = getExportFileName(_config.id, _config.name, dateStr, imageFormat);
            const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
            zip.file(`${nameWithoutExt}${suffix}.${imageFormat}`, blob);
          });
        }
        
        setImageStatusMessage('กำลังบีบอัดไฟล์ ZIP...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `report-selected_${dateStr}.zip`);
      }
      
      setImageGenerating(false);
      toast.success('ดาวน์โหลดรายงานเรียบร้อยแล้ว');
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการสร้างไฟล์ภาพรายงานที่เลือก');
      setImageGenerating(false);
    }
  };

  const handlePrintReport = () => {
    const params = new URLSearchParams();
    params.set('startDate', filters.startDate);
    params.set('endDate', filters.endDate);
    params.set('searchTerm', searchTerm);
    params.set('sortKey', sortConfig.key);
    params.set('sortDirection', sortConfig.direction);
    params.set('exportScope', exportScope);
    params.set('currentPage', String(currentPage));
    params.set('itemsPerPage', String(itemsPerPage));

    window.open(`/print/report/${activeReport}?${params.toString()}`, '_blank');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Export Loading Overlay */}
      {(pdfGenerating || imageGenerating) && (
        <div className="absolute inset-0 z-50 bg-white dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-4 border border-gray-200 dark:border-gray-700">
            <Loader2 className={`w-10 h-10 animate-spin ${imageGenerating ? 'text-secondary-500' : 'text-primary-500'}`} />
            <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
              {imageGenerating ? imageStatusMessage : pdfStatusMessage}
            </div>
          </div>
        </div>
      )}

      <CompactCompanyHeader />

      <div className="bg-white dark:bg-gray-900 border rounded-lg flex-1 flex flex-col overflow-hidden shadow-sm">
        {/* Date Filter Bar */}
        <div className="bg-white dark:bg-gray-900 border-b px-4 py-3 flex flex-col gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                className="border rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-300 h-[28px] focus:outline-none focus:border-primary-400"
              />
              <span className="text-xs text-gray-500">ถึง</span>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                className="border rounded px-2 py-1 text-xs text-gray-700 dark:text-gray-300 h-[28px] focus:outline-none focus:border-primary-400"
              />
            </div>
            <button onClick={handleSearchDate} className="px-3 h-[28px] bg-primary-600 hover:bg-primary-700 text-white rounded text-xs font-medium transition-colors">
              ค้นหา
            </button>
            <button onClick={resetDate} className="px-3 h-[28px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 rounded text-xs font-medium transition-colors">
              รีเซ็ต
            </button>
            
            <div className="h-4 w-px bg-gray-200 mx-1"></div>
            
            <div className="flex gap-1">
              <button onClick={setToday} className="px-2 h-[28px] bg-gray-100 hover:bg-gray-200 text-gray-600 dark:text-gray-400 rounded text-xs transition-colors">วันนี้</button>
              <button onClick={setYesterday} className="px-2 h-[28px] bg-gray-100 hover:bg-gray-200 text-gray-600 dark:text-gray-400 rounded text-xs transition-colors">เมื่อวาน</button>
              <button onClick={setLast7Days} className="px-2 h-[28px] bg-gray-100 hover:bg-gray-200 text-gray-600 dark:text-gray-400 rounded text-xs transition-colors">7 วันล่าสุด</button>
              <button onClick={setThisMonth} className="px-2 h-[28px] bg-gray-100 hover:bg-gray-200 text-gray-600 dark:text-gray-400 rounded text-xs transition-colors">เดือนนี้</button>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 border-b px-4 py-2 flex flex-col xl:flex-row xl:items-center justify-between gap-3 shrink-0">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-300 flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-2">
              <span>📌 ศูนย์รวมรายงานด่วน (Report Center)</span>
              <span className="text-[10px] bg-gray-200 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">
                {currentConfig?.name}
              </span>
            </div>
            <div className="text-[10px] text-primary-600 font-medium xl:ml-5">
              วันที่ {filters.startDate === filters.endDate ? filters.startDate : `${filters.startDate} ถึง ${filters.endDate}`}
            </div>
          </div>
          <div className="flex overflow-x-auto xl:flex-wrap gap-2 text-[10px] pb-1 xl:pb-0 scrollbar-hide xl:justify-end w-full">
             <div className="relative border rounded overflow-hidden flex items-center bg-white dark:bg-gray-900 h-[24px] shrink-0">
               <select
                 className="pl-2 pr-6 py-1 bg-white dark:bg-gray-900 text-[10px] focus:outline-none focus:bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 h-full appearance-none font-medium cursor-pointer"
                 value={sortConfig.key}
                 onChange={(e) => {
                   setSortConfig(prev => ({ ...prev, key: e.target.value }));
                   setCurrentPage(1);
                 }}
               >
                 <option value="totalOrder">เรียงตาม ยอดออเดอร์รวม</option>
                 <option value="totalTracking">เรียงตาม จำนวน Tracking</option>
                 <option value="totalBills">เรียงตาม จำนวนบิล</option>
                 <option value="totalQuantity">เรียงตาม จำนวนชิ้น</option>
                 <option value="totalCod">เรียงตาม COD</option>
                 <option value="reportDate">เรียงตาม วันที่</option>
                 <option value="branchGroup">เรียงตาม กลุ่มสาขา</option>
               </select>
               <div className="absolute right-1 top-1/2 -trangray-y-1/2 pointer-events-none text-gray-400">
                 ▼
               </div>
             </div>
             <div className="relative border rounded overflow-hidden flex items-center bg-white dark:bg-gray-900 h-[24px] shrink-0">
               <select
                 className="pl-2 pr-6 py-1 bg-white dark:bg-gray-900 text-[10px] focus:outline-none focus:bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 h-full appearance-none font-medium cursor-pointer"
                 value={sortConfig.direction}
                 onChange={(e) => {
                   setSortConfig(prev => ({ ...prev, direction: e.target.value }));
                   setCurrentPage(1);
                 }}
               >
                 <option value="desc">มากไปน้อย</option>
                 <option value="asc">น้อยไปมาก</option>
               </select>
               <div className="absolute right-1 top-1/2 -trangray-y-1/2 pointer-events-none text-gray-400">
                 ▼
               </div>
             </div>

            <div className="relative border rounded overflow-hidden h-[24px] shrink-0">
               <Search className="absolute left-2 top-1/2 -trangray-y-1/2 w-3 h-3 text-gray-400" />
               <input
                 type="text"
                 placeholder="ค้นหากลุ่มสาขา หรือ วันที่..."
                 value={searchTerm}
                 onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                 className="pl-7 pr-2 py-1 bg-white dark:bg-gray-900 text-[10px] w-48 focus:outline-none focus:bg-gray-50 dark:bg-gray-800/50 h-full"
                />
             </div>
             
              <div className="flex items-center gap-1.5 border rounded px-2 h-[24px] bg-gray-50 dark:bg-gray-800/50 text-[10px] text-gray-600 dark:text-gray-400 font-medium shrink-0">
               <span className="font-bold text-gray-700 dark:text-gray-300">ขอบเขต:</span>
               <label className="flex items-center gap-1 cursor-pointer">
                 <input
                   type="radio"
                   name="exportScope"
                   value="all"
                   checked={exportScope === 'all'}
                   onChange={() => setExportScope('all')}
                   className="h-2.5 w-2.5 text-primary-600 cursor-pointer"
                   disabled={pdfGenerating || imageGenerating}
                 />
                 <span className="whitespace-nowrap">ทั้งหมด</span>
               </label>
               <label className="flex items-center gap-1 cursor-pointer">
                 <input
                   type="radio"
                   name="exportScope"
                   value="current"
                   checked={exportScope === 'current'}
                   onChange={() => setExportScope('current')}
                   className="h-2.5 w-2.5 text-primary-600 cursor-pointer"
                   disabled={pdfGenerating || imageGenerating}
                 />
                 <span className="whitespace-nowrap">หน้า {currentPage}</span>
               </label>
             </div>
             
             <div className="flex items-center gap-1.5 border rounded px-2 h-[24px] bg-gray-50 dark:bg-gray-800/50 text-[10px] text-gray-600 dark:text-gray-400 font-medium shrink-0">
               <span className="font-bold text-gray-700 dark:text-gray-300">ภาพ:</span>
               <select
                 className="bg-transparent outline-none cursor-pointer"
                 value={imageFormat}
                 onChange={e => setImageFormat(e.target.value as 'png' | 'jpg')}
                 disabled={pdfGenerating || imageGenerating}
               >
                 <option value="png">PNG</option>
                 <option value="jpg">JPG</option>
               </select>
               <select
                 className="bg-transparent outline-none cursor-pointer border-l-2 pl-1 ml-1"
                 value={imageQuality}
                 onChange={e => setImageQuality(Number(e.target.value) as 1 | 2)}
                 disabled={pdfGenerating || imageGenerating}
               >
                 <option value={1}>1x</option>
                 <option value={2}>2x</option>
               </select>
             </div>

             {/* Desktop Export Buttons */}
             <button 
               onClick={() => { setTraceTargetDate(undefined); setIsTraceModalOpen(true); }} 
               className="px-3 h-[24px] bg-amber-500 hover:bg-amber-600 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors relative cursor-pointer mr-1"
               title="สืบค้นวิเคราะห์ และจัดการประวัติรายการไม่ระบุทั้งหมดในช่วงนี้"
             >
               ⚠️ จัดการรายการไม่ระบุ
             </button>
             <div className="hidden xl:flex items-center gap-2 shrink-0">
               <button onClick={exportImage} disabled={pdfGenerating || imageGenerating} className="px-3 h-[24px] bg-secondary-600 hover:bg-secondary-700 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition-colors disabled:bg-secondary-400">
                 {imageGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                 ดาวน์โหลดภาพ
               </button>
               <button 
                 onClick={() => { setSelectedReportIds([activeReport]); setIsExportModalOpen(true); }} 
                 disabled={pdfGenerating || imageGenerating} 
                 className="px-3 h-[24px] bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition-colors disabled:bg-emerald-400 cursor-pointer"
               >
                 <CheckSquare className="w-3 h-3" />
                 เลือกดาวน์โหลดภาพรายงาน
               </button>
               <button onClick={exportAllImages} disabled={pdfGenerating || imageGenerating} className="px-3 h-[24px] bg-secondary-600 hover:bg-secondary-700 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition-colors disabled:bg-secondary-400">
                 {imageGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                 ภาพทั้งหมด (ZIP)
               </button>
               <button onClick={exportExcel} disabled={pdfGenerating || imageGenerating} className="px-3 h-[24px] bg-white dark:bg-gray-900 hover:bg-gray-100 border rounded text-[10px] font-medium flex items-center gap-1 text-gray-600 dark:text-gray-400 transition-colors disabled:opacity-50">
                <FileText className="w-3 h-3" /> Excel
               </button>
               <button onClick={exportPdf} disabled={pdfGenerating || imageGenerating} className="px-3 h-[24px] bg-primary-600 hover:bg-primary-700 text-white rounded text-[10px] font-semibold flex items-center gap-1 transition-colors disabled:bg-primary-400">
                 {pdfGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> ...</> : <><Download className="w-3 h-3" /> PDF</>}
               </button>
               <button onClick={handlePrintReport} disabled={pdfGenerating || imageGenerating} className="px-3 h-[24px] bg-white dark:bg-gray-900 hover:bg-gray-100 border rounded text-[10px] font-medium flex items-center gap-1 text-gray-600 dark:text-gray-400 transition-colors disabled:opacity-50">
                 <Printer className="w-3 h-3" /> Print
               </button>
             </div>
          </div>
        </div>

        {/* Mobile Sticky Export Bar */}
        <button 
          onClick={() => { setTraceTargetDate(undefined); setIsTraceModalOpen(true); }} 
          className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
          title="จัดการประวัติรายการไม่ระบุ"
        >
          ⚠️ ไม่ระบุ
        </button>
        <div className="xl:hidden border-b bg-white dark:bg-gray-900 p-2 flex overflow-x-auto gap-2 sticky top-[138px] sm:top-[124px] z-20 shadow-sm scrollbar-hide shrink-0">
               <button onClick={exportImage} disabled={pdfGenerating || imageGenerating} className="shrink-0 px-3 py-1.5 bg-secondary-600 hover:bg-secondary-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:bg-secondary-400">
                 {imageGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                 ภาพ
               </button>
               <button 
                 onClick={() => { setSelectedReportIds([activeReport]); setIsExportModalOpen(true); }} 
                 disabled={pdfGenerating || imageGenerating} 
                 className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:bg-emerald-400 cursor-pointer"
               >
                 <CheckSquare className="w-3.5 h-3.5" />
                 เลือกรายงาน
               </button>
               <button onClick={exportAllImages} disabled={pdfGenerating || imageGenerating} className="shrink-0 px-3 py-1.5 bg-secondary-600 hover:bg-secondary-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:bg-secondary-400">
                 {imageGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                 ZIP
               </button>
               <button onClick={exportExcel} disabled={pdfGenerating || imageGenerating} className="shrink-0 px-3 py-1.5 bg-white dark:bg-gray-900 hover:bg-gray-100 border rounded text-xs font-medium flex items-center gap-1 text-gray-600 dark:text-gray-400 transition-colors disabled:opacity-50">
                 <FileText className="w-3.5 h-3.5" /> Excel
               </button>
               <button onClick={exportPdf} disabled={pdfGenerating || imageGenerating} className="shrink-0 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs font-semibold flex items-center gap-1 transition-colors disabled:bg-primary-400">
                 {pdfGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                 PDF
               </button>
               <button onClick={handlePrintReport} disabled={pdfGenerating || imageGenerating} className="shrink-0 px-3 py-1.5 bg-white dark:bg-gray-900 hover:bg-gray-100 border rounded text-xs font-medium flex items-center gap-1 text-gray-600 dark:text-gray-400 transition-colors disabled:opacity-50">
                 <Printer className="w-3.5 h-3.5" /> Print
               </button>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
           {/* Sidebar Reports List (Horizontal on mobile, vertical on desktop) */}
           <div className="border md:border-gray-200 dark:border-gray-700 flex flex-col bg-gray-50 dark:bg-gray-800/50 md:w-[280px] shrink-0 rounded-lg overflow-hidden md:sticky md:top-20 md:h-[calc(100vh-140px)]">
             {/* Header - Fixed on Desktop */}
             <div className="hidden md:block p-4 border-b bg-gray-100/50 shrink-0">
               <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">รายการรายงาน</h3>
               <p className="text-[10px] text-gray-500 font-medium mt-1">เลือกประเภทรายงานที่ต้องการ</p>
             </div>

             {/* Menu List - Scrollable */}
             <div className="flex md:flex-col overflow-x-auto md:overflow-y-auto p-2 gap-1 scrollbar-hide flex-1 min-h-0">
               {currentConfigs.map(report => (
                 <button
                   key={report.id}
                   onClick={() => setActiveReport(report.id)}
                   className={`text-left p-2.5 border md:w-full transition-colors whitespace-nowrap md:whitespace-normal shrink-0 rounded-lg md:rounded-md flex flex-col gap-0.5 ${
                     activeReport === report.id
                       ? 'bg-primary-50 border-primary-200 text-primary-700 shadow-sm'
                       : 'bg-white dark:bg-gray-900 border-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 hover:border-gray-200 dark:border-gray-700'
                   }`}
                 >
                   <div className="text-[10px] md:text-xs font-bold leading-tight">{report.name}</div>
                   {activeReport === report.id && (
                     <div className="hidden md:block text-[9px] text-primary-500 font-medium">กำลังแสดงผล</div>
                   )}
                 </button>
               ))}
             </div>
           </div>

           {/* Table Area */}
           <div className="flex flex-col flex-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
             <ReportTable 
               data={sortedData}
               currentPage={currentPage}
               totalPages={totalPages}
               itemsPerPage={itemsPerPage}
               setCurrentPage={setCurrentPage}
               loading={loading}
               displayGroupLabel={currentConfig?.displayGroupLabel}
               sortConfig={sortConfig}
               onSort={handleSort}
               onViewUnspecifiedSrc={(date, group) => {
                 setTraceTargetDate(date);
                 setIsTraceModalOpen(true);
               }}
             />
             {!loading && sortedData.length > 0 && <ReportSummary data={sortedData} />}
              {/* Export Selection Modal */}
              {isExportModalOpen && (
                <div id="export-selection-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
                  <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-150">
                    {/* Modal Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center gap-2">
                        <CheckSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                          เลือกรายงานที่ต้องการดาวน์โหลดภาพ
                        </h3>
                      </div>
                      <button 
                        onClick={() => { setIsExportModalOpen(false); setExportModalSearch(''); }}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Filter and Controls Header */}
                    <div className="p-4 bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800 space-y-3 shrink-0">
                      {/* Search Bar */}
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          placeholder="ค้นหารายงานข่าวสาร..."
                          value={exportModalSearch}
                          onChange={(e) => setExportModalSearch(e.target.value)}
                          className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                        />
                      </div>

                      {/* Select/Deselect buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              // If search filter is active, only select the active visible ones
                              if (exportModalSearch.trim() !== '') {
                                const visibleIds = currentConfigs
                                  .filter(cfg => cfg.name.toLowerCase().includes(exportModalSearch.toLowerCase()) || cfg.id.toLowerCase().includes(exportModalSearch.toLowerCase()))
                                  .map(cfg => cfg.id);
                                setSelectedReportIds(Array.from(new Set([...selectedReportIds, ...visibleIds])));
                              } else {
                                setSelectedReportIds(currentConfigs.map(c => c.id));
                              }
                            }}
                            className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/45 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            เลือกทั้งหมด{exportModalSearch ? 'ที่ค้นพบ' : ''}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (exportModalSearch.trim() !== '') {
                                const visibleIds = currentConfigs
                                  .filter(cfg => cfg.name.toLowerCase().includes(exportModalSearch.toLowerCase()) || cfg.id.toLowerCase().includes(exportModalSearch.toLowerCase()))
                                  .map(cfg => cfg.id);
                                setSelectedReportIds(selectedReportIds.filter(id => !visibleIds.includes(id)));
                              } else {
                                setSelectedReportIds([]);
                              }
                            }}
                            className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold border border-gray-250 dark:border-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                          >
                            ยกเลิกทั้งหมด{exportModalSearch ? 'ที่ค้นพบ' : ''}
                          </button>
                        </div>
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          เลือกอยู่ <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedReportIds.length}</span> จาก <span className="font-bold">{currentConfigs.length}</span> รายงาน
                        </div>
                      </div>
                    </div>

                    {/* Scrollable Checklist Body */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 bg-gray-50/20 dark:bg-gray-950/20">
                      {currentConfigs
                        .filter(cfg => {
                          if (!exportModalSearch.trim()) return true;
                          const query = exportModalSearch.toLowerCase();
                          return cfg.name.toLowerCase().includes(query) || cfg.id.toLowerCase().includes(query);
                        })
                        .map((cfg) => {
                          const isSelected = selectedReportIds.includes(cfg.id);
                          return (
                            <label
                              key={cfg.id}
                              style={{ display: 'flex' }}
                              className={`items-center gap-3.5 p-3 rounded-lg border cursor-pointer select-none transition-all ${
                                isSelected
                                  ? 'bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-300 dark:border-emerald-900 shadow-xs'
                                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                              }`}
                            >
                              <div className="flex items-center justify-center shrink-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      setSelectedReportIds(selectedReportIds.filter(id => id !== cfg.id));
                                    } else {
                                      setSelectedReportIds([...selectedReportIds, cfg.id]);
                                    }
                                  }}
                                  className="w-4.5 h-4.5 text-emerald-600 focus:ring-emerald-500 dark:focus:ring-emerald-600 dark:ring-offset-gray-900 border-gray-300 dark:border-gray-700 rounded cursor-pointer"
                                />
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate pr-2">
                                  {cfg.name}
                                </span>
                                <span className="text-[10px] text-gray-400 font-medium">
                                  ID: {cfg.id} {cfg.groupBy ? `| จัดกลุ่มตาม: ${cfg.groupBy}` : ''}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      {currentConfigs.filter(cfg => {
                        if (!exportModalSearch.trim()) return true;
                        const query = exportModalSearch.toLowerCase();
                        return cfg.name.toLowerCase().includes(query) || cfg.id.toLowerCase().includes(query);
                      }).length === 0 && (
                        <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-600">
                          ไม่พบรายงานที่ค้นหา
                        </div>
                      )}
                    </div>

                    {/* Modal Actions Footer */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 flex items-center justify-between gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">ภาพ:</span>
                        <select
                          className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                          value={imageFormat}
                          onChange={e => setImageFormat(e.target.value as 'png' | 'jpg')}
                        >
                          <option value="png">PNG</option>
                          <option value="jpg">JPG</option>
                        </select>
                        <select
                          className="text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded px-1.5 py-0.5 outline-none cursor-pointer"
                          value={imageQuality}
                          onChange={e => setImageQuality(Number(e.target.value) as 1 | 2)}
                        >
                          <option value={1}>1x</option>
                          <option value={2}>2x</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { setIsExportModalOpen(false); setExportModalSearch(''); }}
                          className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          ปิด
                        </button>
                        <button
                          type="button"
                          onClick={exportSelectedImages}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          ดาวน์โหลด ({selectedReportIds.length})
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

             <UnspecifiedTraceModal
               isOpen={isTraceModalOpen}
               onClose={() => setIsTraceModalOpen(false)}
               startDate={filters.startDate}
               endDate={filters.endDate}
               singleDate={traceTargetDate}
               onMappingSuccess={handleMappingSuccess}
             />
           </div>
        </div>
      </div>
    </div>
  );
}
