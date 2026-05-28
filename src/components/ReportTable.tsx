import React from 'react';
import { formatNumber, formatCurrency } from '../lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ReportTableProps {
  data: any[];
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  setCurrentPage: (page: number | ((p: number) => number)) => void;
  loading: boolean;
  displayGroupLabel?: string;
  sortConfig?: { key: string; direction: string };
  onSort?: (key: string) => void;
  onViewUnspecifiedSrc?: (date: string, branchGroup: string) => void;
}

const SortIcon = ({ sortKey, currentSort }: { sortKey: string, currentSort?: { key: string; direction: string } }) => {
  if (currentSort?.key !== sortKey) return <span className="opacity-0 group-hover:opacity-30 ml-1">▼</span>;
  return <span className="ml-1 text-primary-600">{currentSort.direction === 'asc' ? '▲' : '▼'}</span>;
};

// Return whether group is unspecified
const isUnspecifiedGroup = (group: string | null | undefined): boolean => {
  if (!group) return true;
  const lower = String(group || "").trim().toLowerCase();
  return (
    lower === "" ||
    lower === "ไม่ระบุ" ||
    lower === "ไม่ระบุกลุ่มสาขา" ||
    lower === "ไม่ระบุสาขา" ||
    lower === "ไม่ระบุผู้ส่ง" ||
    lower === "-" ||
    lower.includes("ไม่ระบุ")
  );
};

export default function ReportTable({ 
  data, 
  currentPage, 
  totalPages, 
  itemsPerPage, 
  setCurrentPage, 
  loading, 
  displayGroupLabel = "กลุ่มสาขา",
  sortConfig,
  onSort,
  onViewUnspecifiedSrc
}: ReportTableProps) {
  const paginatedData = data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const SortableHeader = ({ title, sortKey, align = "text-center" }: { title: string, sortKey: string, align?: string }) => (
    <th 
      onClick={() => onSort && onSort(sortKey)}
      className={`px-2 md:px-3 py-2 md:py-3 ${align} text-[10px] font-bold text-white dark:text-gray-100 uppercase tracking-wider border-b border-primary-800 dark:border-gray-800 cursor-pointer hover:bg-primary-800 dark:hover:bg-gray-900 transition-colors group select-none whitespace-nowrap`}
    >
      <div className={`flex items-center ${align === 'text-right' ? 'justify-end' : align === 'text-center' ? 'justify-center' : 'justify-start'}`}>
        {title}
        <SortIcon sortKey={sortKey} currentSort={sortConfig} />
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="flex-1 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0 bg-white dark:bg-gray-900">
      <div className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-primary-900 dark:bg-black sticky top-0 z-10">
            <tr>
              <th className="px-2 md:px-3 py-2 md:py-3 text-center text-[10px] font-bold text-white dark:text-gray-100 uppercase tracking-wider border-b border-primary-800 dark:border-gray-800 whitespace-nowrap">ลำดับ</th>
              <SortableHeader title="วันที่" sortKey="reportDate" />
              <SortableHeader title={displayGroupLabel} sortKey="branchGroup" />
              <SortableHeader title="ยอดออเดอร์รวม" sortKey="totalOrder" align="text-right" />
              <SortableHeader title="ยอดต้นทาง" sortKey="prepaidTotal" align="text-right" />
              <SortableHeader title="ยอดปลายทาง" sortKey="postpaidTotal" align="text-right" />
              <SortableHeader title="COD" sortKey="totalCod" align="text-right" />
              <SortableHeader title="จำนวนชิ้น" sortKey="totalQuantity" align="text-right" />
              <SortableHeader title="จำนวนบิล" sortKey="totalBills" align="text-right" />
              <SortableHeader title="จำนวน Tracking" sortKey="totalTracking" align="text-right" />
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 font-sans">
            {paginatedData.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:bg-gray-800/50 transition-colors">
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-center text-gray-500 border-r border-gray-50 font-mono">{(currentPage - 1) * itemsPerPage + i + 1}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-center text-gray-900 dark:text-gray-100 border-r border-gray-50 font-mono">{row.reportDate}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400 border-r border-gray-100">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <span className={isUnspecifiedGroup(row.branchGroup) ? "text-rose-650 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-100" : ""}>
                      {row.branchGroup}
                    </span>
                    {isUnspecifiedGroup(row.branchGroup) && onViewUnspecifiedSrc && (
                      <button
                        onClick={() => onViewUnspecifiedSrc(row.reportDate, row.branchGroup)}
                        className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 hover:text-amber-800 text-amber-700 dark:bg-amber-950/45 dark:hover:bg-amber-900 border border-amber-300 dark:border-amber-800 rounded text-[9px] font-extrabold shadow-2xs transition-all cursor-pointer h-[18px]"
                        title="สืบค้นที่มาของข้อมูลที่ไม่ระบุกลุ่มนี้"
                      >
                        🔎 ดูที่มา
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100 text-right font-mono border-r border-gray-50">{formatCurrency(row.totalOrder)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100 text-right font-mono border-r border-gray-50">{formatCurrency(row.prepaidTotal)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100 text-right font-mono border-r border-gray-50">{formatCurrency(row.postpaidTotal)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-amber-600 font-medium text-right font-mono border-r border-gray-50">{formatCurrency(row.totalCod)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100 text-right font-mono border-r border-gray-50">{formatNumber(row.totalQuantity)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-gray-900 dark:text-gray-100 text-right font-mono border-r border-gray-50">{formatNumber(row.totalBills)}</td>
                <td className="px-2 md:px-3 py-1.5 md:py-2 whitespace-nowrap text-xs text-secondary-600 font-medium text-right font-mono">{formatNumber(row.totalTracking)}</td>
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-xs text-gray-500">ไม่พบข้อมูล</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {totalPages > 1 && (
        <div className="p-2 border-t flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 shrink-0">
          <span className="text-[10px] text-gray-500 px-2 font-medium">
            แสดง {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, data.length)} จากทั้งหมด {data.length} รายการ
          </span>
          <div className="flex gap-1">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 rounded bg-white dark:bg-gray-900 border border-gray-300 disabled:opacity-50 text-gray-600 dark:text-gray-400"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 rounded bg-white dark:bg-gray-900 border border-gray-300 disabled:opacity-50 text-gray-600 dark:text-gray-400"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
