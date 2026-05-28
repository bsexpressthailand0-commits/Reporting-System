import React, { useState } from 'react';
import dayjs from 'dayjs';
import { UploadCloud, CheckCircle, AlertCircle, Loader2, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import CompactCompanyHeader from '../components/CompactCompanyHeader';
import { parseUploadFile } from '../lib/excelParser';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useToast } from '../lib/ToastContext';
import { collection, writeBatch, doc, serverTimestamp, setDoc, getDocs, getDoc, query, where, documentId } from 'firebase/firestore';
import { getBranchCode, enrichShipmentWithBranchMapping } from '../lib/branchMapping';
import { enrichShipmentWithCommissionMapping } from '../lib/commissionMapping';
import { getDailyQuota, trackQuotaUsage, QUOTA_LIMITS } from '../lib/quotaService';

export default function ImportExcel() {
  const { user, isStaff } = useAuth();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'idle' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });
  const [progress, setProgress] = useState(0);

  // Duplicate states
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateList, setDuplicateList] = useState<string[]>([]);
  const [duplicateOption, setDuplicateOption] = useState<'skip' | 'update'>('skip');
  const [duplicateCounts, setDuplicateCounts] = useState({
    total: 0,
    newCount: 0,
    duplicateCount: 0,
    errorCount: 0
  });

  if (!isStaff) {
    return <div className="p-4 text-primary-600">You do not have permission to access this page.</div>;
  }

  // Duplicate checker helper
  const checkDuplicateTrackings = async (trackingNos: string[]) => {
    const duplicates: string[] = [];
    const chunkSize = 30; // Firestore limit for 'in' operator is 30
    const uniqueTrackings = Array.from(new Set(trackingNos)).filter(Boolean);

    let queryCount = 0;
    // Load sequentially to prevent "Write stream exhausted maximum allowed queued writes" / concurrent stream limits
    for (let i = 0; i < uniqueTrackings.length; i += chunkSize) {
      const chunk = uniqueTrackings.slice(i, i + chunkSize);
      const q = query(
        collection(db, "shipments"),
        where(documentId(), "in", chunk)
      );
      
      try {
        const snapshot = await getDocs(q);
        queryCount++;
        snapshot.forEach(docSnap => {
          duplicates.push(docSnap.id);
        });
      } catch (err) {
        console.error("Error fetching duplicate chunk:", err);
      }
    }

    // Minimum 1 read per query, plus 1 per document returned
    await trackQuotaUsage('reads', duplicates.length + queryCount);

    return duplicates;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setStatus({ type: 'idle', message: '' });
    setCheckingDuplicates(true);
    setDuplicateList([]);
    setPreviewData([]);

    try {
      const data = await parseUploadFile(selected);
      // Validate trackingNo
      const validData = data.filter(d => d.trackingNo);
      const invalidCount = data.length - validData.length;

      const trackingNos = validData.map(d => String(d.trackingNo));
      const duplicates = await checkDuplicateTrackings(trackingNos);

      const duplicateSet = new Set(duplicates);
      const newItemsCount = validData.filter(d => !duplicateSet.has(String(d.trackingNo))).length;

      setDuplicateList(duplicates);
      setPreviewData(validData);

      setDuplicateCounts({
        total: data.length,
        newCount: newItemsCount,
        duplicateCount: duplicates.length,
        errorCount: invalidCount
      });
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'ไม่สามารถอ่านไฟล์ Excel หรือตรวจสอบรหัส Tracking ได้ กรุณาตรวจสอบรูปแบบไฟล์' });
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    setPreviewData([]);
    setDuplicateList([]);
    setDuplicateCounts({
      total: 0,
      newCount: 0,
      duplicateCount: 0,
      errorCount: 0
    });
    setStatus({ type: 'idle', message: '' });

    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleImport = async () => {
    if (previewData.length === 0) return;

    setUploading(true);
    setStatus({ type: 'idle', message: 'กำลังตรวจสอบสถานะความจุฐานข้อมูล...' });

    // Check database limits first
    try {
      const quota = await getDailyQuota();
      // Calculate expected writes (items + unmapped + batches approx)
      let expectedWrites = previewData.length + 5; // safe margin
      if (duplicateOption === 'skip') {
         expectedWrites = previewData.filter(item => !duplicateList.includes(String(item.trackingNo))).length + 5;
      }
      
      if (quota.writes + expectedWrites >= QUOTA_LIMITS.writes) {
          setStatus({ 
            type: 'error', 
            message: `ล้มเหลว: โควต้า Writes รายวันเกินกำหนด (${quota.writes.toLocaleString()} + ${expectedWrites.toLocaleString()} ≥ ${QUOTA_LIMITS.writes.toLocaleString()})\nระบบบล็อกการ Import กรุณารอรีเซ็ตโควต้าวันพรุ่งนี้` 
          });
          setUploading(false);
          return;
      }

      if (quota.writes + expectedWrites >= QUOTA_LIMITS.writes * 0.8) {
          toast.warning(`คำเตือน: โควต้า Writes ของคุณใกล้จะเต็มแล้ว (${((quota.writes + expectedWrites)/QUOTA_LIMITS.writes * 100).toFixed(1)}%)`);
      }

      const docRef = doc(db, 'systemStats', 'databaseHealth');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.healthStatus === 'critical' || data.totalShipments >= (data.criticalLimitRows || 100000)) {
          setStatus({ type: 'error', message: 'พื้นที่ Database เต็มหรือใกล้เต็มตาม Limits กรุณาไปที่เมนู Database Health เพื่อสำรองข้อมูลก่อนทำรายการต่อ' });
          setUploading(false);
          return;
        }
        if (data.healthStatus === 'warning' || data.totalShipments >= (data.warningLimitRows || 80000)) {
          toast.warning('คำเตือน: รูปแบบเดิม: ฐานข้อมูลใกล้เต็ม ควรสำรองข้อมูลโดยเร็ว');
        }
      }
    } catch (e) {
      console.error("Health check failed", e);
    }

    setStatus({ type: 'idle', message: 'กำลังประมวลผลจัดเตรียมสาขา...' });
    setProgress(0);

    const batchId = doc(collection(db, 'importBatches')).id;

    try {
      // Fetch current branch mappings
      const mappingsSnapshot = await getDocs(collection(db, 'branchMappings'));
      const branchMappings = mappingsSnapshot.docs.map(d => d.data() as any);
      const unmappedBranchesMap = new Map();

      // Fetch commission mappings
      const commSnapshot = await getDocs(collection(db, 'commissionMappings'));
      const commissionMappings = commSnapshot.docs.map(d => d.data() as any);

      // Track reads from maps
      await trackQuotaUsage('reads', mappingsSnapshot.docs.length + commSnapshot.docs.length + 2);

      // Enrich shipments with branch info & commission info
      const enrichedData = previewData.map(item => {
        let enrichedItem = enrichShipmentWithBranchMapping(item, branchMappings);
        enrichedItem = enrichShipmentWithCommissionMapping(enrichedItem, commissionMappings);
        
        if (enrichedItem.mappingStatus === 'unmapped') {
          const branchName = enrichedItem.branchName || 'Unknown';
          const code = getBranchCode(branchName);
          const key = code || branchName;
          if (!unmappedBranchesMap.has(key)) {
            unmappedBranchesMap.set(key, { count: 0, branchName, branchCode: code, sampleTrackingNo: enrichedItem.trackingNo });
          }
          unmappedBranchesMap.get(key).count += 1;
        }
        return enrichedItem;
      });

      // Filter rows based on matching duplicates choice
      let itemsToImport = [];
      const dupCount = duplicateList.length;
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      if (duplicateOption === 'skip') {
        const duplicateSet = new Set(duplicateList);
        itemsToImport = enrichedData.filter(item => !duplicateSet.has(String(item.trackingNo)));
        importedCount = itemsToImport.length;
        skippedCount = dupCount;
      } else {
        itemsToImport = enrichedData;
        updatedCount = dupCount;
        importedCount = enrichedData.length - dupCount;
      }

      // Create import batch record object
      const batchData = {
        id: batchId,
        fileName: file?.name || 'unknown',
        totalRows: duplicateCounts.total,
        importedRows: importedCount,
        duplicateRows: dupCount,
        updatedRows: updatedCount,
        skippedRows: skippedCount,
        failedRows: 0,
        importedBy: user?.uid || 'unknown',
        importedEmail: user?.email || 'unknown',
        importedAt: serverTimestamp(),
        status: 'processing'
      };

      await setDoc(doc(db, 'importBatches', batchId), batchData);

      setStatus({ type: 'idle', message: `กำลังทยอยนำเข้าพัสดุจำนวน ${itemsToImport.length} รายการเข้าสู่ระบบ...` });

      const batchSize = 400; // Firestore limit 500
      let successCount = 0;

      const chunks = [];
      for (let i = 0; i < itemsToImport.length; i += batchSize) {
        chunks.push(itemsToImport.slice(i, i + batchSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const firestoreBatch = writeBatch(db);

        chunk.forEach(item => {
          const id = String(item.trackingNo);
          const docRef = doc(db, 'shipments', id);
          firestoreBatch.set(docRef, {
            ...item,
            importBatchId: batchId,
            importedAt: serverTimestamp(),
            weight: item.weight || 0,
            quantity: item.quantity || 1,
            codAmount: item.codAmount || 0,
            orderTotal: item.orderTotal || 0,
            netProfit: item.netProfit || 0
          }, { merge: true });
        });

        await firestoreBatch.commit();
        successCount += chunk.length;
        setProgress(Math.round((successCount / itemsToImport.length) * 100));
      }

      // Save unmapped branches seen
      if (unmappedBranchesMap.size > 0) {
        let unmappedBatch = writeBatch(db);
        let uCount = 0;
        let uKeys = Array.from(unmappedBranchesMap.keys());
        
        for (const key of uKeys) {
          if (!key) continue;
          const data = unmappedBranchesMap.get(key);
          const ref = doc(db, 'unmappedBranches', key);
          unmappedBatch.set(ref, {
            branchName: data.branchName,
            branchCode: data.branchCode,
            count: data.count,
            sampleTrackingNo: data.sampleTrackingNo,
            lastSeenAt: serverTimestamp(),
            status: 'unmapped'
          }, { merge: true });
          
          uCount++;
          if (uCount >= 400) {
            await unmappedBatch.commit().catch(console.error);
            unmappedBatch = writeBatch(db);
            uCount = 0;
          }
        }
        
        if (uCount > 0) {
          await unmappedBatch.commit().catch(console.error);
        }
      }

      // Update batch record
      await setDoc(doc(db, 'importBatches', batchId), {
        status: 'completed',
        importedAt: serverTimestamp(),
      }, { merge: true });

      // Track all writes performed
      const totalWrites = itemsToImport.length + unmappedBranchesMap.size + 2; 
      await trackQuotaUsage('writes', totalWrites);

      setStatus({
        type: 'success',
        message: `นำเข้าพัสดุเรียบร้อยแล้ว!\n` +
                 `- นำเข้าข้อมูลใหม่เรียบร้อย (Imported Success): ${importedCount.toLocaleString()} รายการ\n` +
                 `- อัปเดตข้อมูลทับรายการเดิม (Updated): ${updatedCount.toLocaleString()} รายการ\n` +
                 `- ข้ามรหัส Tracking ซ้ำ (Duplicate Skipped): ${skippedCount.toLocaleString()} รายการ\n` +
                 `- ข้อมูลล้มเหลว (Failed): 0 รายการ`
      });

      setPreviewData([]);
      setFile(null);
      setDuplicateList([]);
      
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error(error);
      try {
        await setDoc(doc(db, 'importBatches', batchId), {
          status: 'failed',
          failedRows: previewData.length
        }, { merge: true });
      } catch (e) {
        // ignore
      }
      setStatus({ type: 'error', message: 'เกิดข้อผิดพลาดระหว่างกระบวนการอัปโหลดข้อมูลพัสดุ' });
      handleFirestoreError(error, OperationType.WRITE, 'shipments');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 w-full pb-20">
      <CompactCompanyHeader />
      <div className="bg-white dark:bg-gray-900 p-4 border rounded-lg flex flex-col shadow-sm">
        <h2 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-4">นำเข้าข้อมูล (Import Excel)</h2>

        <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 dark:bg-gray-800/50 transition-colors">
          <input
            id="file-upload"
            type="file"
            accept=".xlsx, .xls, .csv"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading || checkingDuplicates}
          />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
            <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
            <span className="text-xs font-medium text-primary-600 hover:text-primary-500">
              อัปโหลดไฟล์ (Upload File)
            </span>
            <span className="text-[10px] text-gray-500 mt-1">อัปโหลดไฟล์ XLSX, XLS หรือ CSV ไม่เกิน 10MB</span>
          </label>
        </div>

        {file && (
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800/50 border rounded flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="w-4 h-4 text-secondary-600" />
              <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{file.name}</span>
              <span className="text-[10px] text-gray-500">({previewData.length} แถวที่ถูกต้อง)</span>
            </div>
            {!uploading && !checkingDuplicates && status.type !== 'success' && previewData.length > 0 && (
              <button
                onClick={handleImport}
                className="px-3 py-1 bg-primary-600 text-white text-[10px] font-medium rounded hover:bg-primary-700 transition"
              >
                เริ่มนำเข้าข้อมูล (Start Import)
              </button>
            )}
          </div>
        )}

        {checkingDuplicates && (
          <div className="mt-4 p-6 bg-gray-50 dark:bg-gray-800/50 border rounded-lg text-center flex flex-col items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary-600 animate-spin mb-2" />
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">กำลังสแกนหาข้อมูล Tracking ซ้ำซ้อน...</p>
            <p className="text-[10px] text-gray-500 mt-1">กรุณารอสักครู่ ระบบกำลังจับคู่ฐานข้อมูลเพื่อความถูกต้องแม่นยำ</p>
          </div>
        )}

        {/* Dashboard of Duplicates */}
        {!checkingDuplicates && previewData.length > 0 && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-105 rounded-lg shadow-sm">
                <span className="text-[10px] uppercase font-bold text-gray-500 block">จำนวนทั้งหมด</span>
                <span className="text-lg font-bold text-gray-800 dark:text-gray-200 font-mono">{(duplicateCounts.total).toLocaleString()}</span>
                <span className="text-[9px] text-gray-500 block mt-0.5">รายการทึ่อยู่ในไฟล์</span>
              </div>
              <div className="p-3 bg-secondary-50 border border-secondary-100 rounded-lg shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase font-bold text-secondary-700 block">จำนวนใหม่ (เขียว)</span>
                  <span className="w-2 h-2 rounded-full bg-secondary-500"></span>
                </div>
                <span className="text-lg font-bold text-secondary-800 font-mono">{(duplicateCounts.newCount).toLocaleString()}</span>
                <span className="text-[9px] text-secondary-600 block mt-0.5">สถานะบันทึกใหม่</span>
              </div>
              <div className={`p-3 rounded-lg shadow-sm border ${duplicateCounts.duplicateCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100'}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] uppercase font-bold block ${duplicateCounts.duplicateCount > 0 ? 'text-amber-700' : 'text-gray-500'}`}>จำนวนซ้ำ (เหลือง)</span>
                  {duplicateCounts.duplicateCount > 0 && <span className="w-2 h-2 rounded-full bg-amber-500"></span>}
                </div>
                <span className={`text-lg font-bold font-mono ${duplicateCounts.duplicateCount > 0 ? 'text-amber-800' : 'text-gray-800 dark:text-gray-200'}`}>{(duplicateCounts.duplicateCount).toLocaleString()}</span>
                <span className={`text-[9px] block mt-0.5 ${duplicateCounts.duplicateCount > 0 ? 'text-amber-600' : 'text-gray-500'}`}>มีอยู่เดิมในระบบ</span>
              </div>
              <div className={`p-3 rounded-lg shadow-sm border ${duplicateCounts.errorCount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100'}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-[10px] uppercase font-bold block ${duplicateCounts.errorCount > 0 ? 'text-rose-700' : 'text-gray-500'}`}>จำนวน error (แดง)</span>
                  {duplicateCounts.errorCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500"></span>}
                </div>
                <span className={`text-lg font-bold font-mono ${duplicateCounts.errorCount > 0 ? 'text-rose-800' : 'text-gray-800 dark:text-gray-200'}`}>{(duplicateCounts.errorCount).toLocaleString()}</span>
                <span className={`text-[9px] block mt-0.5 ${duplicateCounts.errorCount > 0 ? 'text-rose-600' : 'text-gray-500'}`}>ไม่มีรหัส Tracking</span>
              </div>
            </div>

            {duplicateList.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <span className="text-xs font-bold text-amber-800 block">⚠️ ตรวจพบรหัส Tracking ซ้ำซ้อน ({duplicateList.length} รายการ):</span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-2 bg-white dark:bg-gray-900 border border-amber-100 rounded">
                  {duplicateList.slice(0, 50).map((track, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-amber-100 text-[10px] font-mono text-amber-800 rounded">{track}</span>
                  ))}
                  {duplicateList.length > 50 && (
                    <span className="text-[10px] text-amber-500 self-center pl-1 font-medium">และอีก {duplicateList.length - 50} รายการ...</span>
                  )}
                </div>
              </div>
            )}

            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 block">ตัวเลือกการจัดการข้อมูลซ้ำซ้อน (Duplicate Handlers)</span>
                <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-gray-600 dark:text-gray-400 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="duplicateOption"
                      value="skip"
                      checked={duplicateOption === 'skip'}
                      onChange={() => setDuplicateOption('skip')}
                      className="text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 border-gray-300"
                    />
                    <span>ข้ามรายการที่ซ้ำ (Skip duplicates - ค่าเริ่มต้น)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="duplicateOption"
                      value="update"
                      checked={duplicateOption === 'update'}
                      onChange={() => setDuplicateOption('update')}
                      className="text-primary-600 focus:ring-primary-500 h-3.5 w-3.5 border-gray-300"
                    />
                    <span>อัปเดตข้อมูลเดิม (Update existing)</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs font-semibold hover:bg-gray-100 transition whitespace-nowrap"
                >
                  ยกเลิกนำเข้า (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={uploading}
                  className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded text-xs font-semibold shadow-sm transition flex items-center gap-1 whitespace-nowrap"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      กำลังนำเข้า... ({progress}%)
                    </>
                  ) : (
                    'เริ่มจัดเก็บข้อมูล (Start Save)'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {uploading && !previewData.length && (
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-gray-600 dark:text-gray-400 mb-1">
              <span>กำลังประมวลผลข้อมูล...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-primary-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        {status.message && (
          <div className={`mt-3 p-3 rounded border flex items-start gap-2 whitespace-pre-line ${
            status.type === 'success' ? 'bg-secondary-50 text-secondary-700 border-secondary-100' : 'bg-primary-50 text-primary-700 border-primary-100'
          }`}>
            {status.type === 'success' ? (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span className="text-xs font-medium">{status.message}</span>
          </div>
        )}
      </div>

      {previewData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border rounded-lg flex flex-col overflow-hidden shadow-sm">
          <div className="bg-gray-50 dark:bg-gray-800/50 border-b px-4 py-2 flex items-center justify-between shrink-0">
            <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300">แสดงตัวอย่างข้อมูล (Data Preview)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b">Tracking</th>
                  <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b">Branch</th>
                  <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b">Order Date</th>
                  <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b text-right">COD</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 text-xs">
                {previewData.slice(0, 5).map((row, i) => {
                  const isDup = duplicateList.includes(row.trackingNo);
                  return (
                    <tr key={i} className={`hover:bg-gray-50 dark:bg-gray-800/50 transition-colors ${isDup ? 'bg-amber-50/40' : ''}`}>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300 font-mono tracking-tight flex items-center gap-1.5">
                        {row.trackingNo}
                        {isDup && (
                          <span className="px-1 bg-amber-100 text-amber-800 text-[8px] font-bold rounded">ซ้ำ</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{row.branchName}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {row.orderDate ? dayjs(row.orderDate).format('DD/MM/YYYY') : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-amber-600 font-mono text-right font-medium">
                        {row.codAmount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {previewData.length > 5 && (
              <div className="p-2 border-t flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 shrink-0">
                <span className="text-[10px] text-gray-500 font-medium">
                  แสดง 5 จากทั้งหมด {previewData.length} รายการ
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
