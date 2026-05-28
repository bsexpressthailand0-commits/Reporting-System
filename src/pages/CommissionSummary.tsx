import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, CheckCircle, XCircle, DollarSign, PlayCircle, AlertTriangle, AlertCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import { useToast } from '../lib/ToastContext';
import { triggerReprocessCommission, parseMoney, resolveReportType } from '../lib/commissionMapping';
import { useAuth } from '../lib/AuthContext';
import CompactCompanyHeader from '../components/CompactCompanyHeader';

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

export default function CommissionSummary() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState({
    mapped: 0,
    unmapped: 0,
    totalComm: 0,
    totalShipping: 0
  });

  const [debug, setDebug] = useState({
    mappedRows: 0,
    rowsWithCommissionRate: 0,
    rowsWithOrderTotal: 0,
    rowsWithCommissionNet: 0,
    totalOrderTotal: 0,
    totalCommissionNet: 0
  });

  const [loading, setLoading] = useState(true);
  const [isReprocessing, setIsReprocessing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'shipments'));
      const snap = await getDocs(q);
      
      let mapped = 0;
      let unmapped = 0;
      let totalComm = 0;
      let totalShipping = 0;

      let mappedRows = 0;
      let rowsWithCommissionRate = 0;
      let rowsWithOrderTotal = 0;
      let rowsWithCommissionNet = 0;
      let totalOrderTotal = 0;
      let totalCommissionNet = 0;
      
      snap.docs.forEach(d => {
        const data = d.data();
        
        // Filter only shipments related to commission
        if (!isCommissionReportType(data)) {
          return;
        }

        const isMapped = data.commissionMappingStatus === 'mapped';
        const orderTotal = parseMoney(data.orderTotal);
        const commissionRate = Number(data.commissionRate || 0);

        // Calculate commissionNet with fallback: SUM(orderTotal * commissionRate)
        const commNet = parseMoney(data.commissionNet) || (orderTotal * commissionRate);

        if (isMapped) {
          mapped++;
          mappedRows++;
          if (commissionRate > 0) rowsWithCommissionRate++;
          if (orderTotal > 0) rowsWithOrderTotal++;
          if (commNet > 0) rowsWithCommissionNet++;
        } else {
          unmapped++;
        }

        totalComm += commNet;
        totalCommissionNet += commNet;
        totalShipping += orderTotal;
        totalOrderTotal += orderTotal;
      });
      
      setStats({ mapped, unmapped, totalComm, totalShipping });
      setDebug({
        mappedRows,
        rowsWithCommissionRate,
        rowsWithOrderTotal,
        rowsWithCommissionNet,
        totalOrderTotal,
        totalCommissionNet
      });
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleReprocess = async () => {
    if (isReprocessing) return;

    const confirm = await Swal.fire({
      title: "คำนวณค่าคอมใหม่?",
      text: "ระบบจะคำนวณค่าคอมจาก Commission Mapping ล่าสุด",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "เริ่มคำนวณ",
      cancelButtonText: "ยกเลิก"
    });

    if (!confirm.isConfirmed) return;

    setIsReprocessing(true);

    toast.info("ระบบกำลังเริ่มขั้นตอนการประมวลผลคำนวณค่าคอมค่าขนส่ง...");

    try {
      const res = await triggerReprocessCommission();
      toast.success(
        "คำนวณค่าคอมใหม่สำเร็จ",
        `ประมวลผล: ${res.processedRows || 0} รายการ, สำเร็จ: ${res.mappedRows || 0}, ไม่มี Mapping: ${res.unmappedRows || 0}`
      );

      await fetchStats();
    } catch (e: any) {
      console.error(e);
      toast.error("คำนวณค่าคอมไม่สำเร็จ", e.message || "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsReprocessing(false);
    }
  };

  const data = [
    { name: 'Mapped', value: stats.mapped, color: '#10b981' },
    { name: 'Unmapped', value: stats.unmapped, color: '#f43f5e' }
  ];

  const showWarning = debug.rowsWithCommissionRate > 0 && debug.rowsWithCommissionNet === 0;

  return (
    <div className="w-full space-y-6">
       <CompactCompanyHeader />
       
       <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600">
                <BarChart3 className="w-6 h-6" />
             </div>
             <div>
               <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200">Commission Summary</h1>
               <p className="text-sm text-gray-500">ภาพรวมการคำนวณและจับคู่ค่าคอมมิชชั่นของบิลทั้งหมดในระบบ</p>
             </div>
          </div>
          <button 
             onClick={handleReprocess} 
             disabled={isReprocessing || loading} 
             className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center gap-2 text-xs font-bold shadow-sm disabled:opacity-50 inline-flex"
          >
             <PlayCircle className={`w-4 h-4 ${isReprocessing ? 'animate-pulse' : ''}`} />
             คำนวณค่าคอมใหม่
          </button>
       </div>

       {isAdmin && (
         <div className="bg-gray-800 text-gray-200 rounded-xl p-4 text-xs font-mono shadow-inner border-y-4 border-primary-500 space-y-3">
            <div className="flex items-center gap-2 text-primary-300 font-bold text-sm">
              <AlertCircle className="w-4 h-4" /> Admin Debug Box
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>Mapped Rows: <span className="text-white font-bold">{debug.mappedRows}</span></div>
              <div>Rows with Comm. Rate &gt; 0: <span className="text-white font-bold">{debug.rowsWithCommissionRate}</span></div>
              <div>Rows with Order Total &gt; 0: <span className="text-white font-bold">{debug.rowsWithOrderTotal}</span></div>
              <div>Rows with Comm. Net &gt; 0: <span className="text-white font-bold">{debug.rowsWithCommissionNet}</span></div>
              <div>Total Order Total: <span className="text-white font-bold">{debug.totalOrderTotal.toLocaleString()}</span></div>
              <div>Total Commission Net: <span className="text-secondary-400 font-bold">{debug.totalCommissionNet.toLocaleString()}</span></div>
            </div>
            {showWarning && (
              <div className="bg-amber-950/50 border border-amber-500/50 rounded-lg p-3 text-amber-300 flex items-start gap-2 mt-2">
                 <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                 <div>
                    <strong>คำเตือน:</strong> พบ Mapping แล้ว แต่ยังไม่ได้คำนวณค่าคอม
                 </div>
              </div>
            )}
         </div>
       )}

       {loading ? (
          <div className="p-10 text-center animate-pulse text-gray-500">กำลังโหลด...</div>
       ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
             <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border shadow-sm flex flex-col justify-center items-center text-center">
                <CheckCircle className="w-8 h-8 text-secondary-500 mb-2" />
                <div className="text-sm font-bold text-gray-500">บิลที่จับคู่แล้ว (Mapped)</div>
                <div className="text-3xl font-black text-secondary-600 mt-1">{stats.mapped.toLocaleString()}</div>
             </div>
             
             <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border shadow-sm flex flex-col justify-center items-center text-center">
                <XCircle className="w-8 h-8 text-rose-500 mb-2" />
                <div className="text-sm font-bold text-gray-500">บิลที่ยังไม่จับคู่ (Unmapped)</div>
                <div className="text-3xl font-black text-rose-600 mt-1">{stats.unmapped.toLocaleString()}</div>
             </div>

             <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border shadow-sm flex flex-col justify-center items-center text-center">
                <DollarSign className="w-8 h-8 text-gray-500 mb-2" />
                <div className="text-sm font-bold text-gray-500">ยอดค่าขนส่งรวม (จากบิลทั้งหมด)</div>
                <div className="text-3xl font-black text-gray-800 dark:text-gray-200 mt-1">{stats.totalShipping.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
             </div>

             <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border shadow-sm flex flex-col justify-center items-center text-center">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-600 mb-2">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-gray-500">ค่าคอมมิชชั่นสุทธิรวม</div>
                <div className="text-3xl font-black text-primary-700 mt-1">{stats.totalComm.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
             </div>
          </div>
       )}

       {!loading && (stats.mapped > 0 || stats.unmapped > 0) && (
         <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border shadow-sm h-80">
            <h2 className="text-sm font-bold text-gray-600 dark:text-gray-400 mb-4 text-center">สัดส่วนการจับคู่ (Mapped vs Unmapped)</h2>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(val: number) => val.toLocaleString() + ' บิล'} />
              </PieChart>
            </ResponsiveContainer>
         </div>
       )}
    </div>
  )
}
