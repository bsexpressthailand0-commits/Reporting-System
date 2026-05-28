import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, getDocs, collection, writeBatch, serverTimestamp } from 'firebase/firestore';
import { getCountFromServer } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../lib/AuthContext';
import { Server, Database, Save, HardDrive, RefreshCw, AlertTriangle, ShieldAlert, Download, Trash2, CalendarClock, Activity } from 'lucide-react';
import CompactCompanyHeader from '../components/CompactCompanyHeader';
import Swal from 'sweetalert2';
import { useToast } from '../lib/ToastContext';
import { reprocessThaiDatesInFirestore } from '../lib/thaiDateHelper';
import { getDailyQuota, trackQuotaUsage, QUOTA_LIMITS, QuotaData } from '../lib/quotaService';

export default function DatabaseHealth() {
  const { isStaff, isAdmin } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState<any>({});
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleReprocessDates = async () => {
    const confirm = await Swal.fire({
      title: "แก้ไขวันที่ พ.ศ. เป็น ค.ศ.?",
      text: "ระบบจะแปลงวันที่ที่มีปี พ.ศ. (เช่น 2569) ให้เป็น ค.ศ. บนข้อมูล Shipment ทั้งหมด การดำเนินการนี้ใช้เวลาสักครู่",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "เริ่มแก้ไข",
      cancelButtonText: "ยกเลิก"
    });

    if (!confirm.isConfirmed) return;

    setActionLoading(true);
    let progressInterval: any;
    try {
      Swal.fire({
        title: "กำลังตรวจสอบและแก้ไขวันที่...",
        text: "กรุณารอสักครู่ (0%)",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const updatedCount = await reprocessThaiDatesInFirestore((curr, tot) => {
         const pct = tot > 0 ? Math.round((curr / tot) * 100) : 0;
         const content = Swal.getHtmlContainer();
         if (content) {
            content.textContent = `กำลังตรวจสอบ... ${pct}% (${curr}/${tot})`;
         }
      });

      await Swal.fire({
        title: "แก้ไขวันที่เรียบร้อยแล้ว",
        text: `อัปเดตข้อมูลทั้งหมด ${updatedCount} รายการ สำเร็จ`,
        icon: "success",
        confirmButtonText: "ตกลง"
      });
      await fetchStats();
      
    } catch (e: any) {
      console.error(e);
      Swal.fire("ไม่สามารถแก้ไขวันที่ได้", e.message || "เกิดข้อผิดพลาด", "error");
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setActionLoading(false);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'systemStats', 'databaseHealth');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setStats(docSnap.data());
      } else {
        // Fetch from cloud function or default
        setStats({
          totalShipments: 0,
          totalImportBatches: 0,
          totalSummaries: 0,
          estimatedSizeMb: 0,
          healthStatus: 'normal'
        });
      }
      
      const q = await getDailyQuota();
      setQuota(q);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleUpdateHealth = async () => {
    setActionLoading(true);
    try {
       try {
         const functions = getFunctions();
         const updateHealth = httpsCallable(functions, 'updateDatabaseHealth');
         await updateHealth();
         toast.success("อัปเดตข้อมูล Health สำเร็จ (Cloud Function)");
       } catch (funcErr) {
         console.warn("Cloud function failed, falling back to client-side", funcErr);
         
         const shipCountSnap = await getCountFromServer(collection(db, 'shipments'));
         const batchCountSnap = await getCountFromServer(collection(db, 'importBatches'));
         const summaryCountSnap = await getCountFromServer(collection(db, 'dailyBranchSummaries'));

         const totalShipments = shipCountSnap.data().count;
         const totalImportBatches = batchCountSnap.data().count;
         const totalSummaries = summaryCountSnap.data().count;
         
         await trackQuotaUsage('reads', 3);

         const DATABASE_WARNING_LIMIT_ROWS = 80000;
         const DATABASE_CRITICAL_LIMIT_ROWS = 100000;

         const estimatedSizeMb = (totalShipments * 1.2 + totalSummaries * 0.5) / 1024;
         let healthStatus = 'normal';
         if (totalShipments >= DATABASE_CRITICAL_LIMIT_ROWS) {
           healthStatus = 'critical';
         } else if (totalShipments >= DATABASE_WARNING_LIMIT_ROWS) {
           healthStatus = 'warning';
         }

         await setDoc(doc(db, 'systemStats', 'databaseHealth'), {
           totalShipments,
           totalImportBatches,
           totalSummaries,
           estimatedSizeMb: parseFloat(estimatedSizeMb.toFixed(2)),
           warningLimitRows: DATABASE_WARNING_LIMIT_ROWS,
           criticalLimitRows: DATABASE_CRITICAL_LIMIT_ROWS,
           healthStatus,
           updatedAt: serverTimestamp()
         }, { merge: true });
         
         toast.success("อัปเดตข้อมูล Health สำเร็จ (Client-side Fallback)");
       }
       await fetchStats();
    } catch (e) {
       console.error(e);
       toast.error("อัปเดตข้อมูลล้มเหลว");
    }
    setActionLoading(false);
  };

  const handleBackup = async () => {
    setActionLoading(true);
    try {
       try {
         const functions = getFunctions();
         const fetchBackup = httpsCallable(functions, 'backupShipmentsToExcel');
         const result = await fetchBackup();
         toast.success("สั่งสำรองข้อมูลผ่าน Cloud Function สำเร็จ");
         if ((result.data as any)?.downloadUrl) {
            window.open((result.data as any).downloadUrl, '_blank');
         }
       } catch (funcErr) {
         console.warn("Cloud function failed, falling back to client-side", funcErr);
         const XLSX = await import('xlsx');
         
         const snapshot = await getDocs(collection(db, 'shipments'));
         const rows: any[] = [];
         snapshot.forEach(doc => {
            rows.push(doc.data());
         });
         
         await trackQuotaUsage('reads', snapshot.docs.length);

         if (rows.length === 0) {
            toast.warning('ไม่พบข้อมูลที่จะสำรอง');
            setActionLoading(false);
            return;
         }

         const worksheet = XLSX.utils.json_to_sheet(rows);
         const workbook = XLSX.utils.book_new();
         XLSX.utils.book_append_sheet(workbook, worksheet, 'Shipments');

         const timestamp = new Date().toISOString().replace(/[:\.\-]/g, '').slice(0, 15);
         const fileName = `backup_shipments_${timestamp}.xlsx`;
         XLSX.writeFile(workbook, fileName);

         // Add backup log
         const backupId = doc(collection(db, 'backupLogs')).id;
         await setDoc(doc(db, 'backupLogs', backupId), {
            backupId,
            fileName,
            fileUrl: '', // since we let user download directly, no URL
            rowCount: rows.length,
            createdBy: 'system',
            createdAt: serverTimestamp(),
            status: 'SUCCESS',
            backupType: 'MANUAL_CLIENT'
         });

         await setDoc(doc(db, 'systemStats', 'databaseHealth'), {
            latestBackupAt: serverTimestamp()
         }, { merge: true });

         toast.success("ทำการสำรองเป็นไฟล์ Excel ลงเครื่องคอมพิวเตอร์ของคุณแล้ว (Client-side Fallback)");
       }
       await fetchStats();
    } catch (e) {
       console.error(e);
       toast.error("สำรองข้อมูลล้มเหลว");
    }
    setActionLoading(false);
  };

  const handleClearDatabase = async () => {
    if (confirmText !== 'CONFIRM_CLEAR_DATABASE') {
       toast.warning("กรุณาพิมพ์ยืนยันให้ถูกต้อง");
       return;
    }
    
    setActionLoading(true);
    try {
       try {
         const functions = getFunctions();
         const clearData = httpsCallable(functions, 'clearShipmentsAfterBackup');
         await clearData({ confirmText: 'CONFIRM_CLEAR_DATABASE' });
         toast.success("ล้างฐานข้อมูลผ่าน Cloud Function สำเร็จ");
       } catch (funcErr) {
         console.warn("Cloud function failed, falling back to client-side", funcErr);
         
         // Delete shipments
         const shipmentsSnap = await getDocs(collection(db, 'shipments'));
         let batch = writeBatch(db);
         let count = 0;
         for (const doc of shipmentsSnap.docs) {
            batch.delete(doc.ref);
            count++;
            if (count % 400 === 0) {
               await batch.commit();
               batch = writeBatch(db);
            }
         }
         if (count % 400 !== 0) await batch.commit();

         // Delete Summaries
         const summarySnap = await getDocs(collection(db, 'dailyBranchSummaries'));
         batch = writeBatch(db);
         count = 0;
         for (const doc of summarySnap.docs) {
            batch.delete(doc.ref);
            count++;
            if (count % 400 === 0) {
               await batch.commit();
               batch = writeBatch(db);
            }
         }
         if (count % 400 !== 0) await batch.commit();
         
         await setDoc(doc(db, 'systemStats', 'databaseHealth'), {
            totalShipments: 0,
            totalSummaries: 0,
            estimatedSizeMb: 0,
            healthStatus: 'normal',
            updatedAt: serverTimestamp()
         }, { merge: true });

         // Track quotas
         const totalDeletes = shipmentsSnap.docs.length + summarySnap.docs.length;
         await trackQuotaUsage('reads', totalDeletes);
         await trackQuotaUsage('deletes', totalDeletes);
         await trackQuotaUsage('writes', 1);

         toast.success("ทำการล้างข้อมูลสำเร็จ (Client-side Fallback)");
       }
       setShowClearConfirm(false);
       setConfirmText('');
       await fetchStats();
    } catch (e) {
       console.error(e);
       toast.error("เกิดข้อผิดพลาดในการล้างข้อมูล (หรือยังไม่ได้สำรองข้อมูล)");
    }
    setActionLoading(false);
  };

  const getStatusColor = (status: string) => {
     switch (status) {
        case 'critical': return 'text-primary-600 bg-primary-100 border-primary-200';
        case 'warning': return 'text-amber-600 bg-amber-100 border-amber-200';
        default: return 'text-secondary-600 bg-secondary-100 border-secondary-200';
     }
  };

  const getStatusText = (status: string) => {
     switch (status) {
        case 'critical': return 'วิกฤต (ควรเคลียร์ข้อมูล)';
        case 'warning': return 'ใกล้เต็ม (ควรสำรองข้อมูล)';
        default: return 'ปกติ';
     }
  };

  const getQuotaStatus = (current: number, max: number) => {
     const pct = (current / max) * 100;
     if (pct >= 95) return 'critical';
     if (pct >= 80) return 'warning';
     return 'normal';
  };

  const getProgressBarClass = (status: string) => {
     if (status === 'critical') return 'bg-primary-600';
     if (status === 'warning') return 'bg-amber-500';
     return 'bg-secondary-500';
  };

  const storageStatus = getQuotaStatus(stats.estimatedSizeMb || 0, QUOTA_LIMITS.storageMb);

  return (
    <div className="w-full space-y-6 pb-20">
      <CompactCompanyHeader />
      <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200 flex items-center">
            <Server className="w-6 h-6 mr-2 text-primary-600" />
            Database Health
          </h1>
          <p className="text-sm text-gray-500 mt-1">ระบบตรวจสอบและจัดการพื้นที่ฐานข้อมูล</p>
        </div>
        <button 
           onClick={handleUpdateHealth}
           disabled={actionLoading || loading}
           className="px-4 py-2 bg-gray-100 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 flex items-center text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${actionLoading ? 'animate-spin' : ''}`} />
          ตรวจสอบข้อมูลล่าสุด
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
             <div className="p-2 bg-primary-50 rounded-lg text-primary-600"><Database className="w-5 h-5" /></div>
             <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${getStatusColor(stats.healthStatus)}`}>
               {getStatusText(stats.healthStatus)}
             </span>
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">ข้อมูลจัดส่งทั้งหมด</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-200">{stats.totalShipments?.toLocaleString() || 0}</p>
          <p className="text-xs text-gray-400 mt-2">จากจำกัด {(stats.criticalLimitRows || 100000).toLocaleString()}</p>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
             <div className="p-2 bg-primary-50 rounded-lg text-primary-600"><Server className="w-5 h-5" /></div>
             <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${getStatusColor(storageStatus)}`}>
                {((stats.estimatedSizeMb || 0) / QUOTA_LIMITS.storageMb * 100).toFixed(1)}%
             </span>
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">พื้นที่ประมาณการ {QUOTA_LIMITS.storageMb / 1024} GB</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-200">{stats.estimatedSizeMb || 0} <span className="text-lg text-gray-500 font-medium">MB</span></p>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-3">
            <div className={`h-1.5 rounded-full ${getProgressBarClass(storageStatus)}`} style={{ width: `${Math.min(100, (stats.estimatedSizeMb || 0) / QUOTA_LIMITS.storageMb * 100)}%` }}></div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
             <div className="p-2 bg-secondary-50 rounded-lg text-secondary-600"><Activity className="w-5 h-5" /></div>
             {quota && (
               <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${getStatusColor(getQuotaStatus(quota.reads, QUOTA_LIMITS.reads))}`}>
                  {((quota.reads / QUOTA_LIMITS.reads) * 100).toFixed(1)}%
               </span>
             )}
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">Reads (ต่อวัน)</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-200">{quota?.reads.toLocaleString() || 0} <span className="text-lg text-gray-500 font-medium">/ {(QUOTA_LIMITS.reads / 1000).toLocaleString()}K</span></p>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-3">
            <div className={`h-1.5 rounded-full ${getProgressBarClass(getQuotaStatus(quota?.reads || 0, QUOTA_LIMITS.reads))}`} style={{ width: `${Math.min(100, ((quota?.reads || 0) / QUOTA_LIMITS.reads) * 100)}%` }}></div>
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between mb-3">
             <div className="p-2 bg-primary-50 rounded-lg text-primary-600"><Save className="w-5 h-5" /></div>
             {quota && (
               <span className={`px-2.5 py-1 text-xs font-bold rounded-full border ${getStatusColor(getQuotaStatus(quota.writes, QUOTA_LIMITS.writes))}`}>
                  {((quota.writes / QUOTA_LIMITS.writes) * 100).toFixed(1)}%
               </span>
             )}
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">Writes (ต่อวัน)</h3>
          <p className="text-3xl font-bold text-gray-800 dark:text-gray-200">{quota?.writes.toLocaleString() || 0} <span className="text-lg text-gray-500 font-medium">/ {(QUOTA_LIMITS.writes / 1000).toLocaleString()}K</span></p>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-3">
            <div className={`h-1.5 rounded-full ${getProgressBarClass(getQuotaStatus(quota?.writes || 0, QUOTA_LIMITS.writes))}`} style={{ width: `${Math.min(100, ((quota?.writes || 0) / QUOTA_LIMITS.writes) * 100)}%` }}></div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
         <div className="border-b border-gray-100 p-5 bg-gray-50 dark:bg-gray-800/50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">เครื่องมือจัดการพื้นที่</h2>
              <p className="text-sm text-gray-500">สำรองข้อมูลเป็น Excel ก่อนลบข้อมูลเก่า</p>
            </div>
            
            {(stats.healthStatus === 'critical' || stats.healthStatus === 'warning') && (
               <div className={`flex items-center px-3 py-2 rounded-lg text-sm border ${stats.healthStatus === 'critical' ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                 <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
                 <span>ควรสำรองข้อมูลแล้วเคลียร์ฐานข้อมูลด่วน!</span>
               </div>
            )}
         </div>
         
         <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
               <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center"><Download className="w-4 h-4 mr-1 text-primary-600" /> 1. การสำรองข้อมูล (Backup)</h3>
               <p className="text-xs text-gray-500">สำรองข้อมูล Shipments ทั้งหมดเก็บไว้เป็นไฟล์ Excel (.xlsx) ไว้ในระบบ Cloud Storage เพื่อความปลอดภัย</p>
               
               <button 
                  onClick={handleBackup}
                  disabled={actionLoading || !isStaff}
                  className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center"
               >
                 <Download className="w-4 h-4 mr-2" />
                 สร้างไฟล์สำรองข้อมูล (Excel)
               </button>
            </div>
            
            <div className="space-y-4">
               <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center"><Trash2 className="w-4 h-4 mr-1 text-primary-600" /> 2. การล้างข้อมูล (Clear Data)</h3>
               <p className="text-xs text-gray-500">ลบข้อมูล Shipments และ Summaries ออกจากฐานข้อมูล *ระวัง! ต้องมั่นใจว่าทำการสำรองข้อมูลแล้ว</p>
               
               <button 
                  onClick={() => setShowClearConfirm(true)}
                  disabled={actionLoading || !isAdmin}
                  className="w-full py-2.5 bg-primary-50 text-primary-600 hover:bg-primary-100 border border-primary-200 disabled:opacity-50 text-sm font-bold rounded-lg transition-colors flex items-center justify-center"
               >
                 <ShieldAlert className="w-4 h-4 mr-2" />
                 เคลียร์ฐานข้อมูล
               </button>
            </div>
         </div>
      </div>
      
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mt-6">
         <div className="border-b border-gray-100 p-5 bg-gray-50 dark:bg-gray-800/50/50">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-200">เครื่องมือซ่อมแซมข้อมูล (Data Fix Tools)</h2>
            <p className="text-sm text-gray-500">สำหรับแก้ไขรูปแบบข้อมูลเก่าที่ผิดปกติให้กลับมาทำงานบนระบบใหม่ได้</p>
         </div>
         
         <div className="p-5 grid grid-cols-1 gap-6">
            <div className="space-y-4">
               <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center"><CalendarClock className="w-4 h-4 mr-1 text-secondary-600" /> แก้ไขปัญหาปี พ.ศ. ให้เป็น ค.ศ. (Thai Date Fix)</h3>
               <p className="text-xs text-gray-500">เปลี่ยนวันที่ที่ถูก Import เข้ามาในรูปแบบปี พ.ศ. (เช่น 2569) ให้กลายเป็น ค.ศ. (2026) เพื่อให้ Dashboard และหน้ารายงานสามารถกรองช่วงวันที่ได้ถูกต้อง</p>
               
               <button 
                  onClick={handleReprocessDates}
                  disabled={actionLoading}
                  className="w-full md:w-auto px-6 py-2.5 bg-secondary-50 text-secondary-700 hover:bg-secondary-100 border border-secondary-200 disabled:opacity-50 text-sm font-bold rounded-lg transition-colors flex items-center justify-center"
               >
                 <CalendarClock className="w-4 h-4 mr-2" />
                 ตรวจสอบและแก้ไขวันที่ พ.ศ. เป็น ค.ศ.
               </button>
            </div>
         </div>
      </div>

      {showClearConfirm && (
         <div className="fixed inset-0 z-50 bg-gray-900/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
               <div className="bg-primary-600 p-5 text-white flex items-start gap-4">
                 <ShieldAlert className="w-8 h-8 shrink-0" />
                 <div>
                    <h2 className="text-lg font-bold">ยืนยันการเคลียร์ฐานข้อมูล</h2>
                    <p className="text-sm text-primary-100 mt-1">การลบข้อมูลนี้แล้วจะไม่สามารถกู้คืนได้ และควรลบเมื่อดาวน์โหลด Backup เก็บไว้แล้ว</p>
                 </div>
               </div>
               <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">พิมพ์คำว่า <span className="select-all font-mono font-bold text-primary-600 bg-primary-50 px-1 py-0.5 rounded">CONFIRM_CLEAR_DATABASE</span> เพื่อยืนยัน</label>
                    <input 
                       type="text"
                       value={confirmText}
                       onChange={e => setConfirmText(e.target.value)}
                       className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm font-mono"
                       placeholder="CONFIRM_CLEAR_DATABASE"
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                     <button 
                        onClick={() => { setShowClearConfirm(false); setConfirmText(''); }}
                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-200"
                     >
                       ยกเลิก
                     </button>
                     <button 
                        onClick={handleClearDatabase}
                        disabled={confirmText !== 'CONFIRM_CLEAR_DATABASE'}
                        className="flex-1 px-4 py-2 bg-primary-600 disabled:opacity-50 text-white font-bold rounded-lg hover:bg-primary-700"
                     >
                       ยืนยันการลบ
                     </button>
                  </div>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
