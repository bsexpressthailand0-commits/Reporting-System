import React, { useMemo } from 'react';
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
import { formatNumber, formatCurrency } from '../lib/utils';
import { ComparePeriod, CompareMetrics, GroupCompareRow, CompareDimension } from '../lib/performanceCompareService';

export interface PerformanceCompareExportTemplateProps {
  dimension: CompareDimension;
  periods: { current: ComparePeriod; prior: ComparePeriod };
  selectedTeams: string[];
  selectedSupervisors: string[];
  rows: GroupCompareRow[];
  totalCurrent: CompareMetrics | null;
  totalPrior: CompareMetrics | null;
  totalDiff: CompareMetrics | null;
  totalPercent: CompareMetrics | null;
  focusMetric: keyof CompareMetrics;
  tableMode: 'focus' | 'all';
}

export default function PerformanceCompareExportTemplate({
  dimension,
  periods,
  selectedTeams,
  selectedSupervisors,
  rows,
  totalCurrent,
  totalPrior,
  totalDiff,
  totalPercent,
  focusMetric,
  tableMode
}: PerformanceCompareExportTemplateProps) {

  // Search Filter Rows (take maximum 15 rows for PDF so it fits nicely on a single landscape sheet)
  const exportRows = useMemo(() => {
    return rows.slice(0, 15);
  }, [rows]);

  // Metric Helpers
  const getMetricMetadata = (metric: keyof CompareMetrics) => {
    switch (metric) {
      case 'shippingAmount':
        return { label: 'ยอดค่าขนส่ง', unit: 'บาท', format: formatCurrency, fill: '#dc2626' };
      case 'quantity':
        return { label: 'จำนวนพัสดุ (ชิ้น)', unit: 'ชิ้น', format: (val: number) => formatNumber(val) + ' ชิ้น', fill: '#eab308' };
      case 'codAmount':
        return { label: 'ยอด COD', unit: 'บาท', format: formatCurrency, fill: '#0f172a' };
      case 'profitAmount':
        return { label: 'กำไรสุทธิ', unit: 'บาท', format: formatCurrency, fill: '#10b981' };
      case 'commissionAmount':
        return { label: 'ค่าคอมมิชชั่น', unit: 'บาท', format: formatCurrency, fill: '#6366f1' };
      case 'trackingCount':
      default:
        return { label: 'จำนวน Tracking', unit: 'รายการ', format: (val: number) => formatNumber(val) + ' รายการ', fill: '#64748b' };
    }
  };

  const selectedMeta = getMetricMetadata(focusMetric);

  // Chart data preparing
  const chartData = useMemo(() => {
    return exportRows.slice(0, 8).map(row => ({
      name: row.groupKey,
      'รอบก่อนหน้า': Number(row.prior[focusMetric].toFixed(2)),
      'รอบปัจจุบัน': Number(row.current[focusMetric].toFixed(2)),
    }));
  }, [exportRows, focusMetric]);

  const dimensionLabel = useMemo(() => {
    switch (dimension) {
      case 'team': return 'ตามทีม';
      case 'supervisor': return 'ตามผู้ดูแล';
      case 'branchGroup': return 'ตามกลุ่มสาขา';
      case 'customerGroup': return 'ตามกลุ่มลูกค้า';
      default: return 'ตามทีม';
    }
  }, [dimension]);

  const formatPeriodDate = (period: ComparePeriod) => {
    const format = (dateStr: string) => {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${Number(parts[0]) + 543}`;
    };
    return `${format(period.start)} - ${format(period.end)}`;
  };

  const activeFiltersStr = useMemo(() => {
    const teamText = selectedTeams.includes('all') || selectedTeams.length === 0
      ? 'ทุกทีม (All)'
      : selectedTeams.join(', ');
    const supervisorText = selectedSupervisors.includes('all') || selectedSupervisors.length === 0
      ? 'ผู้ดูแลทั้งหมด (All)'
      : selectedSupervisors.join(', ');
    
    return `ทีม: ${teamText} | ผู้ดูแล: ${supervisorText}`;
  }, [selectedTeams, selectedSupervisors]);

  const statsCardsData = useMemo(() => {
    if (!totalCurrent || !totalPrior || !totalDiff || !totalPercent) return [];
    
    const cardConfigs: { key: keyof CompareMetrics; title: string; isCurrency: boolean }[] = [
      { key: 'quantity', title: 'จำนวนพัสดุสะสม', isCurrency: false },
      { key: 'shippingAmount', title: 'ยอดรวมค่าขนส่ง', isCurrency: true },
      { key: 'codAmount', title: 'ยอดรวม COD', isCurrency: true },
      { key: 'profitAmount', title: 'กำไรสุทธิรวม', isCurrency: true },
      { key: 'commissionAmount', title: 'ค่าคอมมิชชั่นสะสม', isCurrency: true }
    ];

    return cardConfigs.map(c => {
      const isUp = totalDiff[c.key] >= 0;
      const fmt = c.isCurrency ? formatCurrency : (val: number) => formatNumber(val);
      return {
        ...c,
        isUp,
        fmt,
        current: totalCurrent[c.key],
        prior: totalPrior[c.key],
        diff: totalDiff[c.key],
        percent: totalPercent[c.key]
      };
    });
  }, [totalCurrent, totalPrior, totalDiff, totalPercent]);

  return (
    <div className="p-8 bg-white text-gray-900 font-sans w-[1060px]" style={{ width: '1060px', backgroundColor: '#ffffff', color: '#111827' }}>
      {/* Header section */}
      <div className="border-b-2 border-gray-300 pb-3 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none mb-1">
              รายงานเปรียบเทียบผลงานประจำช่วงเวลา (Performance Compare Report)
            </h1>
            <h2 className="text-xs font-semibold text-gray-500 uppercase">
              BS EXPRESS THAILAND
            </h2>
            <div className="text-[10px] text-gray-500 mt-2 space-y-0.5">
              <p><span className="font-bold">รอบปัจจุบัน:</span> {formatPeriodDate(periods.current)}</p>
              <p><span className="font-bold">รอบก่อนหน้า (เปรียบเทียบ):</span> {formatPeriodDate(periods.prior)}</p>
            </div>
          </div>
          
          <div className="text-right flex flex-col items-end">
            <div className="bg-primary-50 border border-primary-200 text-primary-900 px-3 py-1 rounded text-xs font-bold mb-1.5">
              ศูนย์มุมมอง: {dimensionLabel}
            </div>
            <p className="text-[10px] text-gray-500 font-medium">ตัวกรอง: {activeFiltersStr}</p>
            <p className="text-[9px] text-gray-450 mt-1">วันที่สร้างรายงาน: {new Date().toLocaleString('th-TH')}</p>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards Grid-5 */}
      {statsCardsData.length > 0 && (
        <div className="grid grid-cols-5 gap-3 mb-5">
          {statsCardsData.map((card) => (
            <div 
              key={card.key}
              className={`p-3 border rounded-lg shadow-sm ${
                focusMetric === card.key 
                  ? 'border-red-400 bg-red-50/20' 
                  : 'border-gray-200 bg-gray-50/50'
              }`}
            >
              <div className="text-[10px] font-bold text-gray-500 uppercase truncate mb-1">
                {card.title}
              </div>
              <div className="text-sm font-bold font-mono text-gray-900 tracking-tight">
                {card.fmt(card.current)}
              </div>
              <div className="text-[9px] text-gray-450 mb-1 border-b border-gray-150 pb-1">
                ก่อนหน้า: {card.fmt(card.prior)}
              </div>
              <div className="text-[9px] font-bold flex items-center justify-between mt-1">
                <span className="text-gray-450 font-normal">ผลต่าง:</span>
                <span className={card.isUp ? 'text-emerald-600' : 'text-rose-600'}>
                  {card.isUp ? '▲ +' : '▼ '}{card.fmt(card.diff)} ({card.percent.toFixed(1)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Graphical Chart & Target Analysis Row */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        
        {/* Left Chart column */}
        <div className="col-span-2 border border-gray-200 rounded-lg p-3 bg-white">
          <h3 className="text-[11px] font-bold text-gray-700 mb-3 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-650 inline-block"></span>
            วิเคราะห์แนวโน้ม: {selectedMeta.label} ({dimensionLabel})
          </h3>
          <div className="h-[210px] w-full" style={{ width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#4b5563' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: '#4b5563' }} 
                />
                <Bar dataKey="รอบก่อนหน้า" fill="#94a3b8" radius={[2, 2, 0, 0]} maxBarSize={15} />
                <Bar dataKey="รอบปัจจุบัน" fill={selectedMeta.fill} radius={[2, 2, 0, 0]} maxBarSize={15} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Distribution target column */}
        <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 flex flex-col justify-between">
          <div>
            <h3 className="text-[11px] font-bold text-gray-700 pb-1.5 border-b border-gray-200 mb-2">
              เป้าหมายแนวโน้ม {selectedMeta.label}
            </h3>
            
            <div className="space-y-2 mt-2 text-[10px]">
              <div>
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span>ยอดรอบปัจจุบัน</span>
                  <span className="font-bold font-mono text-gray-800">{selectedMeta.format(totalCurrent ? totalCurrent[focusMetric] : 0)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1">
                  <div className="h-1 rounded-full bg-red-600" style={{ width: '100%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-gray-500 mb-0.5">
                  <span>ยอดรอบก่อนหน้า</span>
                  <span className="font-bold font-mono text-gray-600">{selectedMeta.format(totalPrior ? totalPrior[focusMetric] : 0)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1">
                  <div className="bg-gray-400 h-1 rounded-full" style={{ width: `${Math.min(100, (totalPrior && totalCurrent && totalCurrent[focusMetric] > 0 ? (totalPrior[focusMetric] / totalCurrent[focusMetric]) * 100 : 0))}%` }}></div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-2.5 rounded bg-white border border-gray-250 text-[9px] text-gray-600 space-y-1">
              <span className="font-bold text-gray-700 block mb-0.5">💡 สรุปความเปลี่ยนแปลง:</span>
              <div>
                ยอดรวมรอบวิจัยปัจจุบันเท่ากับ <strong>{selectedMeta.format(totalCurrent ? totalCurrent[focusMetric] : 0)}</strong>
              </div>
              {totalDiff && (
                <div>
                  {totalDiff[focusMetric] >= 0 ? (
                    <span>
                      คิดเป็นอัตราเติบโต <strong className="text-emerald-600">+{selectedMeta.format(totalDiff[focusMetric])} (+{totalPercent ? totalPercent[focusMetric].toFixed(1) : 0}%)</strong> ยอดขยายตัวอย่างมีเสถียรภาพ
                    </span>
                  ) : (
                    <span>
                      พบการชะลอตัว <strong className="text-rose-600">{selectedMeta.format(totalDiff[focusMetric])} ({totalPercent ? totalPercent[focusMetric].toFixed(1) : 0}%)</strong> ควรวางนโยบายช่วยผลักดัน
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="text-[9px] text-gray-400 border-t border-gray-200 pt-1 flex justify-between">
            <span>BS Express Compare</span>
            <span>ความเที่ยงตรง 100%</span>
          </div>
        </div>

      </div>

      {/* Comparison Details Table */}
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
        <div className="px-3 py-2 bg-gray-100 border-b border-gray-300">
          <h3 className="text-[10px] font-bold text-gray-800">
            📊 รายละเอียดผลเปรียบเทียบในเป้าหมายเจาะลึก (ตารางสรุปผลสูงสุด 15 แถวแรก)
          </h3>
        </div>

        <table className="w-full text-left text-[9px] border-collapse bg-white">
          {tableMode === 'focus' ? (
            <thead>
              <tr className="bg-gray-50 text-gray-700 font-bold border-b border-gray-300">
                <th className="px-3 py-2 text-left w-[30%]">{dimensionLabel}</th>
                <th className="px-3 py-2 text-right">ยอดรอบหลักก่อนหน้า (Prior)</th>
                <th className="px-3 py-2 text-right">ยอดรอบปัจจุบัน (Current)</th>
                <th className="px-3 py-2 text-right">ผลต่างต่างผลรวม (Diff)</th>
                <th className="px-3 py-2 text-center">% ต่าง</th>
              </tr>
            </thead>
          ) : (
            <thead>
              <tr className="bg-gray-50 text-gray-700 font-bold border-b border-gray-300">
                <th className="px-3 py-1 text-left" rowSpan={2}>{dimensionLabel}</th>
                <th className="px-2 py-1 text-center border-l" colSpan={3}>ยอดค่าขนส่ง (บาท)</th>
                <th className="px-2 py-1 text-center border-l bg-amber-50/20" colSpan={3}>พัสดุ (ชิ้น)</th>
                <th className="px-2 py-1 text-center border-l bg-slate-50/20" colSpan={3}>ยอด COD (บาท)</th>
                <th className="px-2 py-1 text-center border-l bg-emerald-50/20" colSpan={3}>กำไรสุทธิ (บาท)</th>
              </tr>
              <tr className="bg-gray-50 text-gray-500 border-b border-gray-300">
                <th className="px-1 py-1 text-right border-l">ก่อน</th>
                <th className="px-1 py-1 text-right">ปัจจุบัน</th>
                <th className="px-1 py-1 text-center">% ต่าง</th>
                <th className="px-1 py-1 text-right border-l bg-amber-55/10">ก่อน</th>
                <th className="px-1 py-1 text-right bg-amber-55/10">ปัจจุบัน</th>
                <th className="px-1 py-1 text-center bg-amber-55/10">% ต่าง</th>
                <th className="px-1 py-1 text-right border-l bg-slate-55/10">ก่อน</th>
                <th className="px-1 py-1 text-right bg-slate-55/10">ปัจจุบัน</th>
                <th className="px-1 py-1 text-center bg-slate-55/10">% ต่าง</th>
                <th className="px-1 py-1 text-right border-l bg-emerald-55/10">ก่อน</th>
                <th className="px-1 py-1 text-right bg-emerald-55/10">ปัจจุบัน</th>
                <th className="px-1 py-1 text-center bg-emerald-55/10">% ต่าง</th>
              </tr>
            </thead>
          )}

          <tbody className="divide-y divide-gray-200">
            {tableMode === 'focus' ? (
              exportRows.map((row, idx) => {
                const priorVal = row.prior[focusMetric];
                const currVal = row.current[focusMetric];
                const diffVal = row.diff[focusMetric];
                const pctVal = row.percent[focusMetric];
                const isUp = diffVal >= 0;

                return (
                  <tr key={idx} className="hover:bg-gray-50/50 font-medium">
                    <td className="px-3 py-1.5 font-bold text-gray-800">
                      {row.groupKey}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-600">
                      {selectedMeta.format(priorVal)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-900">
                      {selectedMeta.format(currVal)}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono font-bold ${isUp ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isUp ? '+' : ''}{selectedMeta.format(diffVal)}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold ${
                        isUp ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {isUp ? '+' : ''}{pctVal.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              exportRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  <td className="px-3 py-1 font-bold text-gray-800">{row.groupKey}</td>
                  
                  {/* Shipping */}
                  <td className="px-1.5 py-1 text-right font-mono border-l text-gray-500">{formatNumber(row.prior.shippingAmount)}</td>
                  <td className="px-1.5 py-1 text-right font-mono font-bold text-gray-800">{formatNumber(row.current.shippingAmount)}</td>
                  <td className={`px-1 py-1 text-center font-bold ${row.diff.shippingAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.percent.shippingAmount.toFixed(0)}%
                  </td>

                  {/* Quantity */}
                  <td className="px-1.5 py-1 text-right font-mono border-l bg-amber-50/10 text-gray-500">{formatNumber(row.prior.quantity)}</td>
                  <td className="px-1.5 py-1 text-right font-mono bg-amber-50/10 font-bold text-gray-850">{formatNumber(row.current.quantity)}</td>
                  <td className={`px-1 py-1 text-center bg-amber-50/10 font-bold ${row.diff.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.percent.quantity.toFixed(0)}%
                  </td>

                  {/* COD */}
                  <td className="px-1.5 py-1 text-right font-mono border-l bg-slate-50/10 text-gray-500">{formatNumber(row.prior.codAmount)}</td>
                  <td className="px-1.5 py-1 text-right font-mono bg-slate-50/10 font-bold text-gray-850">{formatNumber(row.current.codAmount)}</td>
                  <td className={`px-1 py-1 text-center bg-slate-50/10 font-bold ${row.diff.codAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.percent.codAmount.toFixed(0)}%
                  </td>

                  {/* Profit */}
                  <td className="px-1.5 py-1 text-right font-mono border-l bg-emerald-50/10 text-gray-500">{formatNumber(row.prior.profitAmount)}</td>
                  <td className="px-1.5 py-1 text-right font-mono bg-emerald-50/10 font-bold text-gray-850">{formatNumber(row.current.profitAmount)}</td>
                  <td className={`px-1 py-1 text-center bg-emerald-50/10 font-bold ${row.diff.profitAmount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {row.percent.profitAmount.toFixed(0)}%
                  </td>
                </tr>
              ))
            )}

            {/* GRAND TOTAL ROW */}
            {totalCurrent && totalPrior && totalDiff && totalPercent && (
              <tr className="bg-gray-100 font-bold text-gray-900 border-t-2 border-gray-300">
                <td className="px-3 py-1.5 font-bold text-gray-900">รวมเครือข่ายสุทธิ (Grand Totals)</td>
                {tableMode === 'focus' ? (
                  <>
                    <td className="px-3 py-1.5 text-right font-mono">{selectedMeta.format(totalPrior[focusMetric])}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-900">{selectedMeta.format(totalCurrent[focusMetric])}</td>
                    <td className={`px-3 py-1.5 text-right font-mono font-bold ${totalDiff[focusMetric] >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {totalDiff[focusMetric] >= 0 ? '+' : ''}{selectedMeta.format(totalDiff[focusMetric])}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded font-bold ${
                        totalDiff[focusMetric] >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {totalDiff[focusMetric] >= 0 ? '+' : ''}{totalPercent[focusMetric].toFixed(1)}%
                      </span>
                    </td>
                  </>
                ) : (
                  <>
                    {/* Shipping */}
                    <td className="px-1.5 py-1.5 text-right font-mono border-l">{formatNumber(totalPrior.shippingAmount)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono">{formatNumber(totalCurrent.shippingAmount)}</td>
                    <td className={`px-1 py-1.5 text-center font-bold ${totalDiff.shippingAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.shippingAmount.toFixed(0)}%</td>

                    {/* Quantity */}
                    <td className="px-1.5 py-1.5 text-right font-mono border-l bg-amber-50/10">{formatNumber(totalPrior.quantity)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono bg-amber-50/10">{formatNumber(totalCurrent.quantity)}</td>
                    <td className={`px-1 py-1.5 text-center bg-amber-50/10 font-bold ${totalDiff.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.quantity.toFixed(0)}%</td>

                    {/* COD */}
                    <td className="px-1.5 py-1.5 text-right font-mono border-l bg-slate-50/10">{formatNumber(totalPrior.codAmount)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono bg-slate-50/10">{formatNumber(totalCurrent.codAmount)}</td>
                    <td className={`px-1 py-1.5 text-center bg-slate-50/10 font-bold ${totalDiff.codAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.codAmount.toFixed(0)}%</td>

                    {/* Profit */}
                    <td className="px-1.5 py-1.5 text-right font-mono border-l bg-emerald-50/10">{formatNumber(totalPrior.profitAmount)}</td>
                    <td className="px-1.5 py-1.5 text-right font-mono bg-emerald-50/10">{formatNumber(totalCurrent.profitAmount)}</td>
                    <td className={`px-1 py-1.5 text-center bg-emerald-50/10 font-bold ${totalDiff.profitAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{totalPercent.profitAmount.toFixed(0)}%</td>
                  </>
                )}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 pt-2 border-t border-gray-200 flex justify-between text-[8px] text-gray-400 font-mono">
        <span>BS Express Compare Export Engine</span>
        <span>Generated: {new Date().toLocaleString()}</span>
      </div>
    </div>
  );
}
