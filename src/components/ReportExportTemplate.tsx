import React from 'react';
import { formatNumber, formatCurrency, calculateReportSummary } from '../lib/utils';
import dayjs from 'dayjs';

export interface ReportExportTemplateProps {
  reportName: string;
  displayGroupLabel: string;
  startDate: string;
  endDate: string;
  data: any[];
  companyInfo: any;
  page?: { current: number; total: number };
}

export default function ReportExportTemplate({
  reportName,
  displayGroupLabel,
  startDate,
  endDate,
  data,
  companyInfo,
  page
}: ReportExportTemplateProps) {
  const summary = calculateReportSummary(data);
  const isLastPage = !page || page.current === page.total;
  
  const cNameTh = companyInfo?.companyNameTh || 'บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด';
  const cNameEn = companyInfo?.companyNameEn || 'BS EXPRESS 2020 CO., LTD.';
  const addr1 = (companyInfo?.addressLine1 || '') + ' ' + (companyInfo?.addressLine2 || '');
  const addr3 = (companyInfo?.addressLine3 || '') + ' ' + (companyInfo?.addressLine4 || '');
  const phone = companyInfo?.phone || '02-114-8855';
  const taxId = companyInfo?.taxId || '073-556-300-2997';
  
  const dateRangeStr = startDate === endDate 
    ? `ประจำวันที่: ${dayjs(startDate).format('DD/MM/YYYY')}`
    : `ตั้งแต่: ${dayjs(startDate).format('DD/MM/YYYY')} ถึง ${dayjs(endDate).format('DD/MM/YYYY')}`;

  return (
    <div className="report-export-page bg-white font-sans text-gray-900 w-full" style={{ width: '100%', backgroundColor: '#fff', color: '#111827' }}>
      {/* Compact Header */}
      <div className="report-export-header border-b border-gray-300 pb-2 mb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none mb-1">{cNameTh}</h1>
            <h2 className="text-xs font-semibold text-gray-600 uppercase mb-1">{cNameEn}</h2>
            <div className="text-[10px] text-gray-500 leading-tight">
              <p>{addr1} {addr3}</p>
              <div className="flex gap-2 mt-0.5">
                <p><span className="font-semibold">TAX ID:</span> {taxId}</p>
                <p><span className="font-semibold">TEL:</span> {phone}</p>
              </div>
            </div>
          </div>
          
          <div className="text-right flex flex-col items-end">
            <div className="bg-gray-100 text-gray-800 px-3 py-1 rounded text-sm font-bold border border-gray-200 shadow-sm mb-1">
              {reportName}
            </div>
            <p className="text-[10px] text-gray-500 font-medium">{dateRangeStr}</p>
            {page && page.total > 1 && (
              <p className="text-[10px] text-gray-400 mt-0.5 font-bold">
                หน้า {page.current} / {page.total}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Modern Compact Table */}
      <div className="report-export-table overflow-hidden border border-gray-300 rounded mb-4">
        <table className="w-full text-left text-[11px] border-collapse bg-white">
          <thead className="bg-[#f1f5f9] text-gray-700">
            <tr>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300 text-center w-8">#</th>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300 w-16 text-center">วันที่</th>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300">{displayGroupLabel}</th>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300 text-right">ยอดออเดอร์รวม</th>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300 text-right">ยอดต้นทาง</th>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300 text-right">ยอดปลายทาง</th>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300 text-right">COD</th>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300 text-right w-12">จำนวนชิ้น</th>
              <th className="px-2 py-1.5 font-bold border-r border-gray-300 text-right w-12">Tracking</th>
              <th className="px-2 py-1.5 font-bold text-right w-12">จำนวนบิล</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-2 py-1.5 border-r border-gray-200 text-center text-gray-500">
                  {((page?.current || 1) - 1) * (data.length) + idx + 1}
                </td>
                <td className="px-2 py-1.5 border-r border-gray-200 text-center">
                  {row.reportDate}
                </td>
                <td className="px-2 py-1.5 border-r border-gray-200 font-semibold text-gray-800 break-words">
                  {row.branchGroup}
                </td>
                <td className="px-2 py-1.5 border-r border-gray-200 text-right font-mono font-bold text-primary-600">
                  {formatCurrency(row.totalOrder)}
                </td>
                <td className="px-2 py-1.5 border-r border-gray-200 text-right font-mono font-bold text-gray-900">
                  {formatCurrency(row.prepaidTotal)}
                </td>
                <td className="px-2 py-1.5 border-r border-gray-200 text-right font-mono font-bold text-secondary-600">
                  {formatCurrency(row.postpaidTotal)}
                </td>
                <td className="px-2 py-1.5 border-r border-gray-200 text-right font-mono font-bold text-primary-700">
                  {formatCurrency(row.totalCod)}
                </td>
                <td className="px-2 py-1.5 border-r border-gray-200 text-right font-mono text-gray-700">
                  {formatNumber(row.totalQuantity)}
                </td>
                <td className="px-2 py-1.5 border-r border-gray-200 text-right font-mono text-gray-700">
                  {formatNumber(row.totalTracking)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-700">
                  {formatNumber(row.totalBills)}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">ไม่มีข้อมูล</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isLastPage && data.length > 0 && (
        <div className="report-export-summary space-y-3">
          {/* Main Totals */}
          <div>
            <div className="grid grid-cols-7 gap-1">
              <SummaryBox label="ออเดอร์รวม" value={formatCurrency(summary.sumOrder)} valueColor="text-primary-700" />
              <SummaryBox label="ต้นทางทั้งหมด" value={formatCurrency(summary.sumPrepaid)} valueColor="text-gray-900" />
              <SummaryBox label="ปลายทางทั้งหมด" value={formatCurrency(summary.sumPostpaid)} valueColor="text-secondary-700" />
              <SummaryBox label="COD ทั้งหมด" value={formatCurrency(summary.sumCod)} valueColor="text-primary-700" />
              <SummaryBox label="รวมชิ้น" value={formatNumber(summary.sumQty)} />
              <SummaryBox label="รวม Tracking" value={formatNumber(summary.sumTracking)} />
              <SummaryBox label="รวมบิล" value={formatNumber(summary.sumBills)} />
            </div>
          </div>
          
          {/* Averages */}
          <div className="report-export-average-card p-2 rounded border border-secondary-400 bg-[#fffbeb]">
            <h4 className="text-[10px] font-bold text-gray-800 mb-1 border-b border-secondary-200 pb-0.5">ค่าเฉลี่ยต่อบิล</h4>
            <div className="grid grid-cols-5 gap-2">
              <AverageBox label="ยอดออเดอร์" value={formatCurrency(summary.avgOrderPerBill)} />
              <AverageBox label="COD" value={formatCurrency(summary.avgCodPerBill)} />
              <AverageBox label="ยอดต้นทาง" value={formatCurrency(summary.avgPrepaidPerBill)} />
              <AverageBox label="ยอดปลายทาง" value={formatCurrency(summary.avgPostpaidPerBill)} />
              <AverageBox label="จำนวนชิ้น" value={formatNumber(summary.avgQtyPerBill)} />
            </div>
          </div>
        </div>
      )}
      
      <div className="mt-4 pt-2 border-t border-gray-200 flex justify-between text-[8px] text-gray-400 font-mono">
        <span>BS Express Reporting System</span>
        <span>Generated: {dayjs().format('DD/MM/YYYY HH:mm:ss')}</span>
      </div>
    </div>
  );
}

function SummaryBox({ label, value, valueColor = "text-gray-800" }: { label: string, value: string, valueColor?: string }) {
  return (
    <div className="px-2 py-1.5 border border-gray-200 bg-gray-50 rounded">
      <div className="text-[9px] text-gray-500 font-semibold">{label}</div>
      <div className={`text-xs font-bold font-mono ${valueColor}`}>{value}</div>
    </div>
  );
}

function AverageBox({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <div className="text-[9px] text-gray-600 font-medium">{label}</div>
      <div className="text-[11px] font-bold font-mono text-primary-800">{value}</div>
    </div>
  );
}
