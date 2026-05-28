import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  BarChart3, 
  TrendingUp, 
  Package, 
  DollarSign, 
  Activity, 
  Coins, 
  Search, 
  Loader2, 
  FileSpreadsheet, 
  Calendar, 
  ArrowUpDown, 
  ChevronRight,
  TrendingDown,
  Info,
  FileText,
  Image
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import * as XLSX from 'xlsx';
import { formatNumber, formatCurrency } from '../lib/utils';
import CompactCompanyHeader from '../components/CompactCompanyHeader';
import { useToast } from '../lib/ToastContext';
import { 
  getComparePeriods, 
  fetchCompareData, 
  ComparePreset, 
  CompareDimension, 
  GroupCompareRow, 
  CompareMetrics,
  ComparePeriod
} from '../lib/performanceCompareService';
import { exportPerformanceCompare } from '../lib/performanceCompareExporter';

export default function PerformanceCompare() {
  const toast = useToast();
  
  // States
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportStatusText, setExportStatusText] = useState('');
  const [preset, setPreset] = useState<ComparePreset>('week');
  const [dimension, setDimension] = useState<CompareDimension>('team');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Custom Date Range (Hidden unless preset is 'custom')
  const [customCurrent, setCustomCurrent] = useState<ComparePeriod>({
    start: new Date().toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  });

  // Dynamic ranges calculated based on preset selection
  const periods = useMemo(() => {
    return getComparePeriods(preset, preset === 'custom' ? customCurrent : undefined);
  }, [preset, customCurrent]);

  const [rows, setRows] = useState<GroupCompareRow[]>([]);
  const [totalCurrent, setTotalCurrent] = useState<CompareMetrics | null>(null);
  const [totalPrior, setTotalPrior] = useState<CompareMetrics | null>(null);
  const [totalDiff, setTotalDiff] = useState<CompareMetrics | null>(null);
  const [totalPercent, setTotalPercent] = useState<CompareMetrics | null>(null);
  const [rawCount, setRawCount] = useState(0);

  // Team Selection Filter States
  const [selectedTeams, setSelectedTeams] = useState<string[]>(['all']);
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);

  // Supervisor Selection Filter States
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>(['all']);
  const [availableSupervisors, setAvailableSupervisors] = useState<string[]>([]);
  const [showSupervisorDropdown, setShowSupervisorDropdown] = useState(false);

  // Selected KPI metric for visualization and focus table view
  // 'shipping' | 'quantity' | 'cod' | 'profit' | 'commission' | 'tracking'
  const [focusMetric, setFocusMetric] = useState<keyof CompareMetrics>('shippingAmount');
  
  // Table View mode: 'focus' (Selected metric comparisons) vs 'all' (Cross-metric comparison grid)
  const [tableMode, setTableMode] = useState<'focus' | 'all'>('focus');

  // Trigger loads when preset, periods or dimension changes
  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchCompareData(periods.current, periods.prior, dimension, selectedTeams, selectedSupervisors);
      setRows(result.rows);
      setTotalCurrent(result.totalCurrent);
      setTotalPrior(result.totalPrior);
      setTotalDiff(result.totalDiff);
      setTotalPercent(result.totalPercent);
      setRawCount(result.rawShipmentsCount);
      setAvailableTeams(result.availableTeams || []);
      setAvailableSupervisors(result.availableSupervisors || []);
    } catch (error: any) {
      console.error(error);
      toast.error('เกิดข้อผิดพลาดในการดึงข้อมูลเปรียบเทียบ: ' + (error.message || String(error)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [preset, periods.current.start, periods.current.end, periods.prior.start, periods.prior.end, dimension, JSON.stringify(selectedTeams), JSON.stringify(selectedSupervisors)]);

  // Search Filter Rows
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(r => r.groupKey.toLowerCase().includes(term));
  }, [rows, searchTerm]);

  // Metric Helpers
  const getMetricMetadata = (metric: keyof CompareMetrics) => {
    switch (metric) {
      case 'shippingAmount':
        return { label: 'ยอดค่าขนส่ง', unit: 'บาท', format: formatCurrency, icon: DollarSign, color: 'text-primary-600', fill: '#dc2626' };
      case 'quantity':
        return { label: 'จำนวนพัสดุ (ชิ้น)', unit: 'ชิ้น', format: (val: number) => formatNumber(val) + ' ชิ้น', icon: Package, color: 'text-amber-600', fill: '#eab308' };
      case 'codAmount':
        return { label: 'ยอด COD', unit: 'บาท', format: formatCurrency, icon: Coins, color: 'text-secondary-600', fill: '#0f172a' };
      case 'profitAmount':
        return { label: 'กำไรสุทธิ', unit: 'บาท', format: formatCurrency, icon: TrendingUp, color: 'text-emerald-600', fill: '#10b981' };
      case 'commissionAmount':
        return { label: 'ค่าคอมมิชชั่น', unit: 'บาท', format: formatCurrency, icon: Activity, color: 'text-indigo-600', fill: '#6366f1' };
      case 'trackingCount':
        default:
        return { label: 'จำนวน Tracking', unit: 'รายการ', format: (val: number) => formatNumber(val) + ' รายการ', icon: ArrowUpDown, color: 'text-slate-600', fill: '#64748b' };
    }
  };

  const selectedMeta = getMetricMetadata(focusMetric);

  // Chart data preparing
  // Top 10 rows for clean chart looks
  const chartData = useMemo(() => {
    return filteredRows.slice(0, 10).map(row => ({
      name: row.groupKey,
      'รอบก่อนหน้า': Number(row.prior[focusMetric].toFixed(2)),
      'รอบปัจจุบัน': Number(row.current[focusMetric].toFixed(2)),
    }));
  }, [filteredRows, focusMetric]);

  const statsCards = useMemo(() => {
    if (!totalCurrent || !totalPrior || !totalDiff || !totalPercent) {
      return [];
    }

    const metricsList: { key: keyof CompareMetrics; title: string; icon: any; isCurrency: boolean }[] = [
      { key: 'quantity', title: 'จำนวนพัสดุสะสม', icon: Package, isCurrency: false },
      { key: 'shippingAmount', title: 'ยอดรวมค่าขนส่ง', icon: DollarSign, isCurrency: true },
      { key: 'codAmount', title: 'ยอดรวม COD สะสม', icon: Coins, isCurrency: true },
      { key: 'profitAmount', title: 'กำไรสุทธิรวม', icon: TrendingUp, isCurrency: true },
      { key: 'commissionAmount', title: 'ค่าคอมมิชชั่นสะสม', icon: Activity, isCurrency: true },
    ];

    return metricsList.map(item => {
      const priorVal = totalPrior[item.key];
      const currVal = totalCurrent[item.key];
      const diffVal = totalDiff[item.key];
      const pctVal = totalPercent[item.key];

      return {
        key: item.key,
        title: item.title,
        icon: item.icon,
        isCurrency: item.isCurrency,
        prior: priorVal,
        current: currVal,
        diff: diffVal,
        percent: pctVal,
      };
    });
  }, [totalCurrent, totalPrior, totalDiff, totalPercent]);

  // Excel Export
  const exportExcel = () => {
    if (rows.length === 0) {
      toast.error('ไม่มีข้อมูลที่จะส่งออก');
      return;
    }

    const exportData = filteredRows.map(r => ({
      'รายการ': r.groupKey,
      
      'ยอดค่าขนส่ง (รอบก่อนหน้า)': r.prior.shippingAmount,
      'ยอดค่าขนส่ง (รอบนี้)': r.current.shippingAmount,
      'ยอดค่าขนส่ง (ผลต่าง)': r.diff.shippingAmount,
      'ยอดค่าขนส่ง (%)': r.percent.shippingAmount,

      'จำนวนพัสดุชิ้น (รอบก่อนหน้า)': r.prior.quantity,
      'จำนวนพัสดุชิ้น (รอบนี้)': r.current.quantity,
      'จำนวนพัสดุชิ้น (ผลต่าง)': r.diff.quantity,
      'จำนวนพัสดุชิ้น (%)': r.percent.quantity,

      'COD (รอบก่อนหน้า)': r.prior.codAmount,
      'COD (รอบนี้)': r.current.codAmount,
      'COD (ผลต่าง)': r.diff.codAmount,
      'COD (%)': r.percent.codAmount,

      'กำไรสุทธิ (รอบก่อนหน้า)': r.prior.profitAmount,
      'กำไรสุทธิ (รอบนี้)': r.current.profitAmount,
      'กำไรสุทธิ (ผลต่าง)': r.diff.profitAmount,
      'กำไรสุทธิ (%)': r.percent.profitAmount,

      'ค่าคอมมิชชั่น (รอบก่อนหน้า)': r.prior.commissionAmount,
      'ค่าคอมมิชชั่น (รอบนี้)': r.current.commissionAmount,
      'ค่าคอมมิชชั่น (ผลต่าง)': r.diff.commissionAmount,
      'ค่าคอมมิชชั่น (%)': r.percent.commissionAmount,

      'จำนวนบิล Tracking (รอบก่อนหน้า)': r.prior.trackingCount,
      'จำนวนบิล Tracking (รอบนี้)': r.current.trackingCount,
      'จำนวนบิล Tracking (ผลต่าง)': r.diff.trackingCount,
      'จำนวนบิล Tracking (%)': r.percent.trackingCount,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Performance Comparison");
    const teamSuffix = selectedTeams.includes('all') || selectedTeams.length === 0
      ? 'All_Teams'
      : `Teams_${selectedTeams.join('_')}`;
    const supervisorSuffix = selectedSupervisors.includes('all') || selectedSupervisors.length === 0
      ? 'All_Supervisors'
      : `Supervisors_${selectedSupervisors.join('_')}`;
    XLSX.writeFile(wb, `Performance_Compare_${dimension}_${teamSuffix}_${supervisorSuffix}_${periods.current.start}_to_${periods.current.end}.xlsx`);
    toast.success('ส่งออกไฟล์ Excel เรียบร้อยแล้ว');
  };

  const handleExport = async (format: 'pdf' | 'png' | 'jpg') => {
    if (rows.length === 0) {
      toast.error('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    try {
      await exportPerformanceCompare({
        dimension,
        periods,
        selectedTeams,
        selectedSupervisors,
        rows: filteredRows,
        totalCurrent,
        totalPrior,
        totalDiff,
        totalPercent,
        focusMetric,
        tableMode,
        format,
        onProgressChange: (isLoad, text) => {
          setExportLoading(isLoad);
          setExportStatusText(text);
        }
      });
      toast.success(`ส่งออกรายงาน ${format.toUpperCase()} สำเร็จแล้ว`);
    } catch (err: any) {
      console.error(err);
      toast.error(`เกิดข้อผิดพลาดในการส่งออกไฟล์: ${err.message || String(err)}`);
    }
  };

  const getDimensionLabel = () => {
    switch (dimension) {
      case 'team': return 'ตามทีม';
      case 'supervisor': return 'ตามผู้ดูแล';
      case 'branchGroup': return 'ตามกลุ่มสาขา';
      case 'customerGroup': return 'ตามกลุ่มลูกค้า';
    }
  };

  const formattedDateRange = (period: ComparePeriod) => {
    const format = (dateStr: string) => {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${Number(parts[0]) + 543}`;
    };
    return `${format(period.start)} - ${format(period.end)}`;
  };

  return (
    <div className="space-y-4 w-full pb-10">
      {/* Dynamic Export Loading Overlay Modal */}
      {exportLoading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-850 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-gray-200 border-t-primary-600 animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-primary-600">
                <BarChart3 className="w-5 h-5 animate-pulse" />
              </div>
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">กำลังดำเนินการ Export เอกสาร</h3>
              <p className="text-[11px] text-gray-550 dark:text-gray-400 line-clamp-2 leading-relaxed h-10 flex items-center justify-center">
                {exportStatusText || 'กรุณารอสักครู่ ระบบกำลังเรนเดอร์เอกสาร...'}
              </p>
            </div>
            <span className="text-[9px] bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-mono px-2 py-0.5 rounded">
              BS Express Reporting Engine
            </span>
          </div>
        </div>
      )}

      <CompactCompanyHeader />

      {/* Controller Block */}
      <div className="bg-white dark:bg-gray-900 border rounded-xl p-4 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary-600" />
              เปรียบเทียบผลงานประจำช่วงเวลา (Performance Compare)
            </h2>
            <p className="text-xs text-gray-500 font-medium mt-1">
              วิเคราะห์และตรวจวัดการเจริญเติบโตรอบปัจจุบันเทียบกับรอบการทำงานก่อนหน้าอย่างแม่นยำ
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 self-start lg:self-auto">
            <button 
              onClick={exportExcel} 
              disabled={loading || rows.length === 0}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              ส่งออก Excel
            </button>
            <button 
              onClick={() => handleExport('pdf')} 
              disabled={loading || rows.length === 0 || exportLoading}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              ส่งออก PDF
            </button>
            <button 
              onClick={() => handleExport('png')} 
              disabled={loading || rows.length === 0 || exportLoading}
              className="px-3.5 py-2 bg-blue-605 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Image className="w-4 h-4" />
              ส่งออกรูปภาพ PNG
            </button>
          </div>
        </div>

        {/* Filters and Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-650 dark:text-gray-400 mb-1.5">
              ช่วงเปรียบเทียบผลงาน
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as ComparePreset)}
              className="w-full border rounded-lg px-3 py-1.5 h-10 text-xs bg-gray-55 font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:border-primary-400 cursor-pointer"
            >
              <option value="today">วันนี้ เทียบ เมื่อวาน</option>
              <option value="yesterday">เมื่อวาน เทียบ วันก่อนหน้า</option>
              <option value="week">สัปดาห์นี้ เทียบ สัปดาห์ก่อน</option>
              <option value="month">เดือนนี้ เทียบ เดือนก่อน</option>
              <option value="custom">ระบุช่วงเวลาเอง (Custom Range)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-655 dark:text-gray-400 mb-1.5">
              เปรียบเทียบตามศูนย์มุมมอง
            </label>
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as CompareDimension)}
              className="w-full border rounded-lg px-3 py-1.5 h-10 text-xs bg-gray-55 font-semibold text-gray-800 dark:text-gray-200 focus:outline-none focus:border-primary-400 cursor-pointer"
            >
              <option value="team">โครงสร้างผลงาน : ตามทีมบัญชี (Team)</option>
              <option value="supervisor">โครงสร้างผลงาน : ตามผู้ดูแล (Supervisor)</option>
              <option value="branchGroup">โครงสร้างผลงาน : ตามกลุ่มสาขา (Branch Group)</option>
              <option value="customerGroup">โครงสร้างผลงาน : ตามกลุ่มลูกค้า (Customer Group)</option>
            </select>
          </div>

          <div className="relative">
            <label className="block text-xs font-bold text-gray-650 dark:text-gray-400 mb-1.5 flex justify-between items-center">
              <span>ตัวกรองทีม (Team Filter)</span>
              {selectedTeams.length > 0 && !selectedTeams.includes('all') && (
                <button 
                  onClick={() => setSelectedTeams(['all'])}
                  className="text-[10px] text-primary-600 hover:underline font-black cursor-pointer"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </label>
            
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTeamDropdown(!showTeamDropdown)}
                className="w-full border rounded-lg px-3 py-1.5 h-10 text-xs bg-gray-55 font-semibold text-gray-800 dark:text-gray-200 flex items-center justify-between focus:outline-none focus:border-primary-400 cursor-pointer"
              >
                <span className="truncate">
                  {selectedTeams.includes('all') || selectedTeams.length === 0
                    ? 'ทุกทีม (All Teams)'
                    : `ทีมที่เลือก (${selectedTeams.length}): ${selectedTeams.map(t => t === 'ไม่ระบุทีม' ? 'ไม่ระบุทีม' : t).join(', ')}`}
                </span>
                <ChevronRight className={`w-4 h-4 text-gray-400 transform transition-transform ${showTeamDropdown ? 'rotate-90' : ''}`} />
              </button>

              {showTeamDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowTeamDropdown(false)}
                  />
                  <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-950 border rounded-lg shadow-xl z-20 p-2 space-y-1">
                    <label className="flex items-center gap-2 p-1.5 hover:bg-gray-55 dark:hover:bg-gray-900 rounded cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={selectedTeams.includes('all') || selectedTeams.length === 0}
                        onChange={() => {
                          setSelectedTeams(['all']);
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="font-bold text-gray-700 dark:text-gray-300">ทุกทีม (All Teams)</span>
                    </label>

                    <div className="h-px bg-gray-100 dark:bg-gray-800 my-1"></div>

                    {availableTeams.length === 0 ? (
                      <div className="text-[10px] text-gray-400 p-1.5 text-center">ไม่มีข้อมูลทีมบัญชี</div>
                    ) : (
                      availableTeams.map((teamName) => {
                        const isChecked = selectedTeams.includes(teamName) && !selectedTeams.includes('all');
                        return (
                          <label 
                            key={teamName} 
                            className="flex items-center gap-2 p-1.5 hover:bg-gray-55 dark:hover:bg-gray-900 rounded cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                let updated: string[];
                                if (selectedTeams.includes('all')) {
                                  updated = [teamName];
                                } else if (selectedTeams.includes(teamName)) {
                                  updated = selectedTeams.filter(t => t !== teamName);
                                  if (updated.length === 0) {
                                    updated = ['all'];
                                  }
                                } else {
                                  updated = [...selectedTeams, teamName];
                                }
                                setSelectedTeams(updated);
                              }}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-gray-700 dark:text-gray-300 font-medium">
                              {teamName === 'ไม่ระบุทีม' ? 'ไม่ระบุทีม (-)' : teamName}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative">
            <label className="block text-xs font-bold text-gray-650 dark:text-gray-400 mb-1.5 flex justify-between items-center">
              <span>ตัวกรองผู้ดูแล (Supervisor Filter)</span>
              {selectedSupervisors.length > 0 && !selectedSupervisors.includes('all') && (
                <button 
                  onClick={() => setSelectedSupervisors(['all'])}
                  className="text-[10px] text-primary-600 hover:underline font-black cursor-pointer"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </label>
            
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSupervisorDropdown(!showSupervisorDropdown)}
                className="w-full border rounded-lg px-3 py-1.5 h-10 text-xs bg-gray-55 font-semibold text-gray-800 dark:text-gray-200 flex items-center justify-between focus:outline-none focus:border-primary-400 cursor-pointer"
              >
                <span className="truncate">
                  {selectedSupervisors.includes('all') || selectedSupervisors.length === 0
                    ? 'ผู้ดูแลทั้งหมด (All)'
                    : `ผู้ดูแลที่เลือก (${selectedSupervisors.length}): ${selectedSupervisors.map(s => s === 'ไม่ระบุผู้ดูแล' ? 'ไม่ระบุผู้ดูแล' : s).join(', ')}`}
                </span>
                <ChevronRight className={`w-4 h-4 text-gray-400 transform transition-transform ${showSupervisorDropdown ? 'rotate-90' : ''}`} />
              </button>

              {showSupervisorDropdown && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowSupervisorDropdown(false)}
                  />
                  <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-950 border rounded-lg shadow-xl z-20 p-2 space-y-1">
                    <label className="flex items-center gap-2 p-1.5 hover:bg-gray-55 dark:hover:bg-gray-900 rounded cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={selectedSupervisors.includes('all') || selectedSupervisors.length === 0}
                        onChange={() => {
                          setSelectedSupervisors(['all']);
                        }}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="font-bold text-gray-700 dark:text-gray-300">ผู้ดูแลทั้งหมด (All)</span>
                    </label>

                    <div className="h-px bg-gray-100 dark:bg-gray-800 my-1"></div>

                    {availableSupervisors.length === 0 ? (
                      <div className="text-[10px] text-gray-400 p-1.5 text-center">ไม่มีข้อมูลผู้ดูแล</div>
                    ) : (
                      availableSupervisors.map((supName) => {
                        const isChecked = selectedSupervisors.includes(supName) && !selectedSupervisors.includes('all');
                        return (
                          <label 
                            key={supName} 
                            className="flex items-center gap-2 p-1.5 hover:bg-gray-55 dark:hover:bg-gray-900 rounded cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                let updated: string[];
                                if (selectedSupervisors.includes('all')) {
                                  updated = [supName];
                                } else if (selectedSupervisors.includes(supName)) {
                                  updated = selectedSupervisors.filter(s => s !== supName);
                                  if (updated.length === 0) {
                                    updated = ['all'];
                                  }
                                } else {
                                  updated = [...selectedSupervisors, supName];
                                }
                                setSelectedSupervisors(updated);
                              }}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <span className="text-gray-700 dark:text-gray-300 font-medium">
                              {supName === 'ไม่ระบุผู้ดูแล' ? 'ไม่ระบุผู้ดูแล' : supName}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {preset === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-650 dark:text-gray-400 mb-1.5">
                  วันที่เริ่มต้นคำนวณ (รอบหลัก)
                </label>
                <input
                  type="date"
                  value={customCurrent.start}
                  onChange={(e) => setCustomCurrent(prev => ({ ...prev, start: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 h-10 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary-400 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-655 dark:text-gray-400 mb-1.5">
                  วันที่สิ้นสุดคำนวณ (รอบหลัก)
                </label>
                <input
                  type="date"
                  value={customCurrent.end}
                  onChange={(e) => setCustomCurrent(prev => ({ ...prev, end: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-1.5 h-10 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:border-primary-400 cursor-pointer"
                />
              </div>
            </>
          )}
        </div>

        {/* Date visual reminder and explanation of prior calculated window */}
        <div className="bg-primary-50/50 border border-primary-200 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-primary-950">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-600 shrink-0" />
            <div className="space-y-0.5">
              <div>
                <span className="font-bold">รอบปัจจุบัน:</span> {formattedDateRange(periods.current)}
              </div>
              <div>
                <span className="font-bold text-gray-500">รอบก่อนหน้า (เปรียบเทียบ):</span> <span className="text-gray-650 font-normal">{formattedDateRange(periods.prior)}</span>
              </div>
            </div>
          </div>
          
          <div className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-primary-500 shrink-0" />
            การสืบค้นข้อมูลครอบคลุมบันทึกนำเข้า {rawCount > 0 ? formatNumber(rawCount) + ' รายการ' : 'ไม่มีรายการ'}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-96 flex flex-col items-center justify-center bg-white dark:bg-gray-900 border rounded-xl shadow-sm">
          <Loader2 className="w-10 h-10 animate-spin text-primary-600 mb-3" />
          <div className="text-sm font-bold text-gray-700 dark:text-gray-300">
            กำลังสืบค้นและประมวลผลข้อมูลเปรียบเทียบข้ามรอบเวลา...
          </div>
          <div className="text-xs text-gray-400 mt-1">กรุณารอสักครู่</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="h-80 flex flex-col items-center justify-center bg-white dark:bg-gray-900 border rounded-xl shadow-sm text-center p-6">
          <BarChart3 className="w-16 h-16 text-gray-300 mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">
            ไม่พบยอดการฝากพัสดุหรือประวัติคำสั่งซื้อ
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
            ในช่วงเวลาที่เลือกทั้งสองช่วง ไม่พบคลิปข้อมูลใดๆ บันทึกในระบบ หรือ shipments บัญชีไม่มีการจับคู่
            กรุณาลองเปลี่ยนช่วงวิเคราะห์ผลงานอื่น หรือนำเข้าไฟล์ Excel ในเมนูหลัก
          </p>
        </div>
      ) : (
        <>
          {/* Summary KPIs cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {statsCards.map((card) => {
              const isUp = card.diff >= 0;
              const format = card.isCurrency ? formatCurrency : (val: number) => formatNumber(val);
              
              return (
                <div 
                  key={card.key}
                  onClick={() => setFocusMetric(card.key)}
                  className={`bg-white dark:bg-gray-900 p-4 border rounded-xl shadow-sm cursor-pointer transition-all hover:shadow relative overflow-hidden flex flex-col justify-center ${
                    focusMetric === card.key 
                      ? 'ring-2 ring-primary-500 border-transparent bg-gradient-to-br from-primary-50/10 to-transparent' 
                      : 'hover:border-primary-100'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-tight truncate max-w-[80%]">
                      {card.title}
                    </div>
                    <div className={`p-1 rounded bg-gray-50 dark:bg-gray-850 ${focusMetric === card.key ? 'text-primary-600 bg-primary-50/50' : 'text-gray-400'}`}>
                      <card.icon className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="text-lg font-mono font-bold tracking-tight text-gray-850 dark:text-gray-100">
                    {format(card.current)}
                  </div>

                  <div className="text-[10px] text-gray-400 mt-1">
                    ก่อนหน้า: {format(card.prior)}
                  </div>

                  <div className="h-px bg-gray-100 my-2"></div>

                  <div className={`text-[10px] font-semibold flex items-center justify-between`}>
                    <span className="text-gray-500">ผลต่าง:</span>
                    <span className={`inline-flex items-center gap-0.5 font-bold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {isUp ? '+' : ''}{format(card.diff)} ({isUp ? '+' : ''}{card.percent.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Graphical comparison block and controller */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            <div className="lg:col-span-2 bg-white dark:bg-gray-900 border rounded-xl p-5 shadow-sm flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary-600"></span>
                    กราฟวิเคราะห์แนวโน้ม: {selectedMeta.label} ({getDimensionLabel()})
                  </h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    แสดงข้อมูลเปรียบเทียบรอบก่อนหน้าเทียบรอบปัจจุบัน (แสดงผลสูงสุด 10 รายการแรก)
                  </p>
                </div>

                <div className="relative border rounded overflow-hidden flex items-center bg-gray-55 h-[28px] shrink-0">
                  <select
                    className="pl-2 pr-6 py-0.5 bg-transparent text-[10px] focus:outline-none text-gray-700 dark:text-gray-300 font-bold cursor-pointer"
                    value={focusMetric}
                    onChange={(e) => setFocusMetric(e.target.value as keyof CompareMetrics)}
                  >
                    <option value="shippingAmount">ยอดเงินค่าขนส่ง</option>
                    <option value="quantity">จำนวนพัสดุสะสม</option>
                    <option value="codAmount">ยอด COD</option>
                    <option value="profitAmount">กำไรสุทธิ</option>
                    <option value="commissionAmount">ค่าคอมมิชชั่น</option>
                    <option value="trackingCount">จำนวน Tracking</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 min-h-[250px] sm:min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 9, fill: '#64748b' }} 
                      dy={10} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: '#64748b' }} 
                    />
                    <ChartTooltip 
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
                    />
                    <Legend 
                      verticalAlign="top" 
                      height={36} 
                      align="right"
                      iconSize={10}
                      formatter={(value) => <span className="text-[10px] text-gray-500 font-semibold">{value}</span>}
                    />
                    <Bar dataKey="รอบก่อนหน้า" fill="#94a3b8" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="รอบปัจจุบัน" fill={selectedMeta.fill} radius={[4, 4, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Micro metrics distribution card column */}
            <div className="bg-white dark:bg-gray-900 border rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-gray-700 dark:text-gray-350 pb-3 border-b">
                  เป้าหมายแนวโน้ม {selectedMeta.label}
                </h3>
                
                <div className="space-y-4 mt-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1 text-gray-500">
                      <span>ยอดสะสมรวมรอบปัจจุบัน</span>
                      <span className="font-mono text-gray-800 dark:text-gray-100">{selectedMeta.format(totalCurrent ? totalCurrent[focusMetric] : 0)}</span>
                    </div>
                    <div className="w-full bg-gray-150 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: selectedMeta.fill }}></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold mb-1 text-gray-500">
                      <span>ยอดสะสมรวมรอบก่อนหน้า</span>
                      <span className="font-mono text-gray-650">{selectedMeta.format(totalPrior ? totalPrior[focusMetric] : 0)}</span>
                    </div>
                    <div className="w-full bg-gray-150 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-gray-400 h-1.5 rounded-full" style={{ width: `${Math.min(100, (totalPrior && totalCurrent && totalCurrent[focusMetric] > 0 ? (totalPrior[focusMetric] / totalCurrent[focusMetric]) * 100 : 0))}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 bg-gray-50 dark:bg-gray-850 p-3 rounded-lg border border-dashed flex flex-col gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <div className="font-bold text-gray-700 dark:text-gray-350">💡 บทวิเคราะห์เชิงตัวเลข:</div>
                  <div>
                    ยอด {selectedMeta.label} รวมรอบปัจจุบันมีค่าเท่ากับ <strong className="text-gray-850 dark:text-gray-100">{selectedMeta.format(totalCurrent ? totalCurrent[focusMetric] : 0)}</strong>
                  </div>
                  {totalDiff && (
                    <div>
                      {totalDiff[focusMetric] >= 0 ? (
                        <span>
                          เพิ่มขึ้นจากช่วงเวลาก่อนหน้า <strong className="text-emerald-600">+{selectedMeta.format(totalDiff[focusMetric])} (+{totalPercent ? totalPercent[focusMetric].toFixed(1) : 0}%)</strong> ถือว่ายอดแนวโน้มเติบโตแบบก้าวกระโดดชี้วัดขีดความสามารถการทำธุรกิจได้ดี
                        </span>
                      ) : (
                        <span>
                          ลดลงจากช่วงเวลาก่อนหน้า <strong className="text-rose-600">{selectedMeta.format(totalDiff[focusMetric])} ({totalPercent ? totalPercent[focusMetric].toFixed(1) : 0}%)</strong> กรุณาวางแผนเร่งผลงานส่งเสริมเพิ่มกลยุทธ์บริการ
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Toggle column detail */}
              <div className="pt-4 border-t mt-4 flex justify-between items-center text-xs">
                <span className="text-gray-400">ผู้สืบค้นข้อมูล: {getDimensionLabel()}</span>
                <span className="font-mono bg-sky-50 dark:bg-sky-950 font-bold text-sky-800 px-2 py-0.5 rounded">
                  BS Express
                </span>
              </div>
            </div>

          </div>

          {/* Table Comparison Center */}
          <div className="bg-white dark:bg-gray-900 border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-850 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-black text-gray-800 dark:text-gray-150">
                  📋 ตารางแสดงรายละเอียดสรุปยอด {getDimensionLabel()}
                </h3>

                <div className="flex bg-gray-200 p-0.5 rounded-lg ml-0 sm:ml-2">
                  <button
                    onClick={() => setTableMode('focus')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                      tableMode === 'focus' 
                        ? 'bg-white text-gray-800 shadow-sm' 
                        : 'text-gray-550 hover:text-gray-700'
                    }`}
                  >
                    มุมมองเฉพาะ: {selectedMeta.label}
                  </button>
                  <button
                    onClick={() => setTableMode('all')}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
                      tableMode === 'all' 
                        ? 'bg-white text-gray-800 shadow-sm' 
                        : 'text-gray-550 hover:text-gray-700'
                    }`}
                  >
                    แสดงตัวชี้วัดทั้งหมด (Cross Metrics Grid)
                  </button>
                </div>
              </div>

              {/* Search Bar inside table controls */}
              <div className="relative border rounded overflow-hidden bg-white dark:bg-gray-950 h-[28px] w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อรายการ..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-2 py-0.5 bg-transparent text-[10px] w-full h-full focus:outline-none"
                />
              </div>
            </div>

            {/* Responsive Table UI */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                
                {/* 1. Header template based on selected viewing mode */}
                {tableMode === 'focus' ? (
                  <thead>
                    <tr className="bg-gray-100 hover:bg-gray-100 text-[10px] font-bold text-gray-600 uppercase tracking-wider border-b">
                      <th className="px-5 py-3 text-left w-[30%]">{getDimensionLabel()}</th>
                      <th className="px-5 py-3 text-right">ยอดรอบหลักก่อนหน้า (Prior)</th>
                      <th className="px-5 py-3 text-right">ยอดรอบปัจจุบัน (Current)</th>
                      <th className="px-5 py-3 text-right">ผลต่างต่างผลรวม (Diff)</th>
                      <th className="px-5 py-3 text-center">เพิ่มขึ้น / ลดลง (%)</th>
                    </tr>
                  </thead>
                ) : (
                  <thead>
                    <tr className="bg-gray-100 text-[9px] font-extrabold text-gray-600 uppercase tracking-normal border-b">
                      <th className="px-4 py-3 text-left min-w-[200px]" rowSpan={2}>{getDimensionLabel()}</th>
                      <th className="px-4 py-1.5 text-center border-l" colSpan={3}>ยอดค่าขนส่ง (บาท)</th>
                      <th className="px-4 py-1.5 text-center border-l bg-amber-50/20" colSpan={3}>จำนวนพัสดุ (ชิ้น)</th>
                      <th className="px-4 py-1.5 text-center border-l bg-secondary-50/20" colSpan={3}>ยอด COD (บาท)</th>
                      <th className="px-4 py-1.5 text-center border-l bg-emerald-50/20" colSpan={3}>กำไรสุทธิ (บาท)</th>
                      <th className="px-4 py-1.5 text-center border-l bg-indigo-50/20" colSpan={3}>ค่าคอมมิชชั่น (บาท)</th>
                    </tr>
                    <tr className="bg-gray-50 text-[8px] font-bold text-gray-500 uppercase tracking-normal border-b">
                      {/* Shipping */}
                      <th className="px-2 py-1.5 text-right border-l">ก่อน</th>
                      <th className="px-2 py-1.5 text-right">ปัจจุบัน</th>
                      <th className="px-2 py-1.5 text-center">% ต่าง</th>
                      {/* Quantity */}
                      <th className="px-2 py-1.5 text-right border-l bg-amber-55/10">ก่อน</th>
                      <th className="px-2 py-1.5 text-right bg-amber-55/10">ปัจจุบัน</th>
                      <th className="px-2 py-1.5 text-center bg-amber-55/10">% ต่าง</th>
                      {/* COD */}
                      <th className="px-2 py-1.5 text-right border-l bg-secondary-55/10">ก่อน</th>
                      <th className="px-2 py-1.5 text-right bg-secondary-55/10">ปัจจุบัน</th>
                      <th className="px-2 py-1.5 text-center bg-secondary-55/10">% ต่าง</th>
                      {/* Profit */}
                      <th className="px-2 py-1.5 text-right border-l bg-emerald-55/10">ก่อน</th>
                      <th className="px-2 py-1.5 text-right bg-emerald-55/10">ปัจจุบัน</th>
                      <th className="px-2 py-1.5 text-center bg-emerald-55/10">% ต่าง</th>
                      {/* Commission */}
                      <th className="px-2 py-1.5 text-right border-l bg-indigo-55/10">ก่อน</th>
                      <th className="px-2 py-1.5 text-right bg-indigo-55/10">ปัจจุบัน</th>
                      <th className="px-2 py-1.5 text-center bg-indigo-55/10">% ต่าง</th>
                    </tr>
                  </thead>
                )}

                {/* 2. Body rendering matching corresponding headers */}
                {tableMode === 'focus' ? (
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((row, idx) => {
                      const priorVal = row.prior[focusMetric];
                      const currVal = row.current[focusMetric];
                      const diffVal = row.diff[focusMetric];
                      const pctVal = row.percent[focusMetric];
                      const isUp = diffVal >= 0;

                      return (
                        <tr key={idx} className="hover:bg-gray-55/35 transition-colors font-medium">
                          <td className="px-5 py-3 font-bold text-gray-800 dark:text-gray-150">
                            {row.groupKey}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-gray-650">
                            {selectedMeta.format(priorVal)}
                          </td>
                          <td className="px-5 py-3 text-right font-mono font-bold text-gray-800 dark:text-gray-100">
                            {selectedMeta.format(currVal)}
                          </td>
                          <td className={`px-5 py-3 text-right font-mono font-bold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {isUp ? '+' : ''}{selectedMeta.format(diffVal)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              isUp 
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-450' 
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-450'
                            }`}>
                              {isUp ? '+' : ''}{pctVal.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Overall grand totals */}
                    {totalCurrent && totalPrior && totalDiff && totalPercent && (
                      <tr className="bg-gray-100 border-t font-black text-gray-900 dark:text-gray-150">
                        <td className="px-4 py-3 font-bold text-gray-900 border-r">ยอดรวมทั้งหมด (Grand Total)</td>
                        <td className="px-4 py-3 text-right font-mono">{selectedMeta.format(totalPrior[focusMetric])}</td>
                        <td className="px-4 py-3 text-right font-mono">{selectedMeta.format(totalCurrent[focusMetric])}</td>
                        <td className={`px-4 py-3 text-right font-mono ${totalDiff[focusMetric] >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {totalDiff[focusMetric] >= 0 ? '+' : ''}{selectedMeta.format(totalDiff[focusMetric])}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-0.5 px-3 py-1 rounded text-xs font-bold leading-normal ${
                            totalDiff[focusMetric] >= 0 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {totalDiff[focusMetric] >= 0 ? '+' : ''}{totalPercent[focusMetric].toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                ) : (
                  <tbody className="divide-y divide-gray-100 text-[10px] font-semibold">
                    {filteredRows.map((row, idx) => {
                      return (
                        <tr key={idx} className="hover:bg-gray-55/35 transition-colors">
                          <td className="px-4 py-2 font-bold text-gray-800 dark:text-gray-200">{row.groupKey}</td>
                          
                          {/* Shipping */}
                          <td className="px-2 py-2 text-right font-mono border-l text-gray-500">{formatNumber(row.prior.shippingAmount)}</td>
                          <td className="px-2 py-2 text-right font-mono text-gray-800 dark:text-gray-100">{formatNumber(row.current.shippingAmount)}</td>
                          <td className={`px-2 py-2 text-center font-bold ${row.diff.shippingAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {row.percent.shippingAmount.toFixed(0)}%
                          </td>

                          {/* Quantity */}
                          <td className="px-2 py-2 text-right font-mono border-l bg-amber-50/10 text-gray-505">{formatNumber(row.prior.quantity)}</td>
                          <td className="px-2 py-2 text-right font-mono bg-amber-50/10 text-gray-800">{formatNumber(row.current.quantity)}</td>
                          <td className={`px-2 py-2 text-center bg-amber-50/10 font-bold ${row.diff.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {row.percent.quantity.toFixed(0)}%
                          </td>

                          {/* COD */}
                          <td className="px-2 py-2 text-right font-mono border-l bg-secondary-50/10 text-gray-505">{formatNumber(row.prior.codAmount)}</td>
                          <td className="px-2 py-2 text-right font-mono bg-secondary-50/10 text-gray-800">{formatNumber(row.current.codAmount)}</td>
                          <td className={`px-2 py-2 text-center bg-secondary-50/10 font-bold ${row.diff.codAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {row.percent.codAmount.toFixed(0)}%
                          </td>

                          {/* Profit */}
                          <td className="px-2 py-2 text-right font-mono border-l bg-emerald-50/10 text-gray-505">{formatNumber(row.prior.profitAmount)}</td>
                          <td className="px-2 py-2 text-right font-mono bg-emerald-50/10 text-gray-850">{formatNumber(row.current.profitAmount)}</td>
                          <td className={`px-2 py-2 text-center bg-emerald-50/10 font-bold ${row.diff.profitAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {row.percent.profitAmount.toFixed(0)}%
                          </td>

                          {/* Commission */}
                          <td className="px-2 py-2 text-right font-mono border-l bg-indigo-50/10 text-gray-505">{formatNumber(row.prior.commissionAmount)}</td>
                          <td className="px-2 py-2 text-right font-mono bg-indigo-50/10 text-gray-850">{formatNumber(row.current.commissionAmount)}</td>
                          <td className={`px-2 py-2 text-center bg-indigo-50/10 font-bold ${row.diff.commissionAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {row.percent.commissionAmount.toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}

                    {/* Overall grand totals */}
                    {totalCurrent && totalPrior && totalDiff && totalPercent && (
                      <tr className="bg-gray-100 font-bold text-gray-900 dark:text-gray-150 border-t-2">
                        <td className="px-4 py-2 border-r font-bold">ยอดสุทธิรวม (All Totals)</td>
                        
                        {/* Shipping */}
                        <td className="px-2 py-2 text-right font-mono border-l">{formatNumber(totalPrior.shippingAmount)}</td>
                        <td className="px-2 py-2 text-right font-mono">{formatNumber(totalCurrent.shippingAmount)}</td>
                        <td className={`px-2 py-2 text-center ${totalDiff.shippingAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.shippingAmount.toFixed(0)}%</td>

                        {/* Quantity */}
                        <td className="px-2 py-2 text-right font-mono border-l bg-amber-50/10">{formatNumber(totalPrior.quantity)}</td>
                        <td className="px-2 py-2 text-right font-mono bg-amber-50/10">{formatNumber(totalCurrent.quantity)}</td>
                        <td className={`px-2 py-2 text-center bg-amber-50/10 ${totalDiff.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.quantity.toFixed(0)}%</td>

                        {/* COD */}
                        <td className="px-2 py-2 text-right font-mono border-l bg-secondary-50/10">{formatNumber(totalPrior.codAmount)}</td>
                        <td className="px-2 py-2 text-right font-mono bg-secondary-50/10">{formatNumber(totalCurrent.codAmount)}</td>
                        <td className={`px-2 py-2 text-center bg-secondary-50/10 ${totalDiff.codAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.codAmount.toFixed(0)}%</td>

                        {/* Profit */}
                        <td className="px-2 py-2 text-right font-mono border-l bg-emerald-50/10">{formatNumber(totalPrior.profitAmount)}</td>
                        <td className="px-2 py-2 text-right font-mono bg-emerald-50/10">{formatNumber(totalCurrent.profitAmount)}</td>
                        <td className={`px-2 py-2 text-center bg-emerald-50/10 ${totalDiff.profitAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.profitAmount.toFixed(0)}%</td>

                        {/* Commission */}
                        <td className="px-2 py-2 text-right font-mono border-l bg-indigo-50/10">{formatNumber(totalPrior.commissionAmount)}</td>
                        <td className="px-2 py-2 text-right font-mono bg-indigo-50/10">{formatNumber(totalCurrent.commissionAmount)}</td>
                        <td className={`px-2 py-2 text-center bg-indigo-50/10 ${totalDiff.commissionAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.commissionAmount.toFixed(0)}%</td>
                      </tr>
                    )}
                  </tbody>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
