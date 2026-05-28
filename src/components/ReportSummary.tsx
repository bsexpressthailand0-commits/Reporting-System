import React from 'react';
import { formatNumber, formatCurrency, calculateReportSummary } from '../lib/utils';

interface ReportSummaryProps {
  data: any[];
}

export default function ReportSummary({ data }: ReportSummaryProps) {
  const summary = calculateReportSummary(data);

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 p-4 shrink-0 flex flex-col gap-4">
      <div>
        <h4 className="text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-2">ผลรวมทั้งหมด (Grand Total)</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <SummaryCard label="ยอดออเดอร์รวมทั้งหมด" value={formatCurrency(summary.sumOrder)} />
          <SummaryCard label="ยอดต้นทางทั้งหมด" value={formatCurrency(summary.sumPrepaid)} />
          <SummaryCard label="ยอดปลายทางทั้งหมด" value={formatCurrency(summary.sumPostpaid)} />
          <SummaryCard label="COD รวมทั้งหมด" value={formatCurrency(summary.sumCod)} />
          <SummaryCard label="จำนวนชิ้นทั้งหมด" value={formatNumber(summary.sumQty)} />
          <SummaryCard label="จำนวนบิลทั้งหมด" value={formatNumber(summary.sumBills)} />
          <SummaryCard label="จำนวน Tracking ทั้งหมด" value={formatNumber(summary.sumTracking)} />
        </div>
      </div>
      
      <div>
        <h4 className="text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-2">ค่าเฉลี่ยต่อบิล (Averages)</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard label="เฉลี่ยยอดออเดอร์ / บิล" value={formatCurrency(summary.avgOrderPerBill)} highlight />
          <SummaryCard label="เฉลี่ย COD / บิล" value={formatCurrency(summary.avgCodPerBill)} highlight />
          <SummaryCard label="เฉลี่ยจำนวนชิ้น / บิล" value={formatNumber(summary.avgQtyPerBill)} highlight />
          <SummaryCard label="เฉลี่ยยอดต้นทาง / บิล" value={formatCurrency(summary.avgPrepaidPerBill)} highlight />
          <SummaryCard label="เฉลี่ยยอดปลายทาง / บิล" value={formatCurrency(summary.avgPostpaidPerBill)} highlight />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  if (highlight) {
    return (
      <div className="p-2 rounded flex flex-col items-end shadow-sm" style={{ backgroundColor: '#fff7cc', border: '1px solid #facc15' }}>
        <span className="text-[10px] font-medium mb-1" style={{ color: '#374151' }}>{label}</span>
        <span className="text-xs font-bold font-mono tracking-tight" style={{ color: '#991b1b' }}>{value}</span>
      </div>
    );
  }

  return (
    <div className="p-2 rounded flex flex-col items-end shadow-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      <span className="text-[10px] text-gray-500 font-medium mb-1">{label}</span>
      <span className="text-xs font-bold font-mono tracking-tight text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}
