import React, { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { FileClock, RefreshCw, Trash2, Calendar, FileSpreadsheet, Layers, User, CheckCircle, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import CompactCompanyHeader from '../components/CompactCompanyHeader';
import { useToast } from '../lib/ToastContext';

export default function ImportHistory() {
  const { isStaff } = useAuth();
  const toast = useToast();
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isStaff) {
    return <div className="p-4 text-primary-600">You do not have permission to access this page.</div>;
  }

  const fetchHistory = async () => {
    setLoading(true);
    setError('');
    try {
      const snapshot = await getDocs(collection(db, 'importBatches'));
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })).sort((a: any, b: any) => {
        const timeA = a.importedAt?.toDate ? a.importedAt.toDate().getTime() : 0;
        const timeB = b.importedAt?.toDate ? b.importedAt.toDate().getTime() : 0;
        return timeB - timeA;
      });
      setBatches(list);
    } catch (err: any) {
      console.error(err);
      setError('ไม่สามารถดึงข้อมูลประวัติการนำเข้าได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('คุณต้องการลบประวัตินำเข้ารายการนี้ใช่หรือไม่? (จะไม่กระทบกับข้อมูลพัสดุที่ถูกเพิ่มเข้าไปแล้ว)')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'importBatches', id));
      setBatches(prev => prev.filter(b => b.id !== id));
      toast.success('ลบประวัติการนำเข้าเสร็จสิ้น');
    } catch (err) {
      console.error(err);
      toast.error('ไม่สามารถลบประวัติได้');
    }
  };

  return (
    <div className="space-y-4 w-full">
      <CompactCompanyHeader />
      
      <div className="bg-white dark:bg-gray-900 p-4 border rounded-lg flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <FileClock className="w-5 h-5 text-primary-600" />
          <div>
            <h2 className="text-xs font-bold text-gray-700 dark:text-gray-300">ประวัติการนำเข้าข้อมูล (Import History)</h2>
            <p className="text-[10px] text-gray-500 mt-0.5">บันทึกประวัติการอัปโหลดความเคลื่อนไหวข้อมูลด้วยไฟล์ Excel</p>
          </div>
        </div>
        <button
          onClick={fetchHistory}
          disabled={loading}
          className="p-1.5 hover:bg-gray-100 rounded border border-gray-200 dark:border-gray-700 transition-colors flex items-center justify-center text-gray-600 dark:text-gray-400"
          title="รีเฟรชข้อมูล"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-primary-50 border border-primary-100 text-primary-700 rounded text-xs font-medium">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border rounded-lg overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center">
            <RefreshCw className="w-8 h-8 text-primary-500 animate-spin mb-2" />
            <span className="text-xs font-medium">กำลังโหลดประวัติการนำเข้า...</span>
          </div>
        ) : batches.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <span className="text-xs font-medium">ยังไม่มีประวัติการนำเข้ารายการข้อมูลพัสดุในระบบ</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 border-b">วันที่นำเข้า</th>
                  <th className="px-4 py-3 border-b">ชื่อไฟล์ Excel</th>
                  <th className="px-4 py-3 border-b">จำนวนทั้งหมด</th>
                  <th className="px-4 py-3 border-b text-secondary-600">ใหม่ (เขียว)</th>
                  <th className="px-4 py-3 border-b text-amber-600">ซ้ำ (เหลือง)</th>
                  <th className="px-4 py-3 border-b text-primary-600">อัปเดต (ฟ้า)</th>
                  <th className="px-4 py-3 border-b text-gray-500">ข้าม (ส้ม)</th>
                  <th className="px-4 py-3 border-b text-primary-600">ล้มเหลว (แดง)</th>
                  <th className="px-4 py-3 border-b">สถานะ</th>
                  <th className="px-4 py-3 border-b">ผู้จัดทำ</th>
                  <th className="px-4 py-3 border-b text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 text-xs text-gray-700 dark:text-gray-300">
                {batches.map((batch) => {
                  const dateStr = batch.importedAt?.toDate 
                    ? dayjs(batch.importedAt.toDate()).format('DD/MM/YYYY HH:mm')
                    : batch.createdAt?.toDate ? dayjs(batch.createdAt.toDate()).format('DD/MM/YYYY HH:mm') : '-';
                  
                  const isMapping = batch.type === 'REPROCESS' || batch.type === 'COMMISSION_MAPPING';
                  
                  return (
                    <tr key={batch.id} className="hover:bg-gray-50 dark:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-600 dark:text-gray-400">{dateStr}</td>
                      <td className="px-4 py-3 font-medium max-w-[200px] truncate">
                        {isMapping ? (
                           <span className="text-primary-600 flex items-center"><Layers className="w-3 h-3 mr-1"/>{batch.message || (batch.type === 'REPROCESS' ? 'คำนวณค่าคอมใหม่' : 'นำเข้า Mapping')}</span>
                        ) : (
                           <span title={batch.fileName}>{batch.fileName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold font-mono text-gray-800 dark:text-gray-200">
                        {isMapping ? (batch.processedRows || 0).toLocaleString() : (batch.totalRows || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {isMapping ? (
                          <span className="px-1.5 py-0.5 bg-secondary-50 text-secondary-800 border border-secondary-100 font-bold font-mono rounded text-[10px]">
                             Mapped: {(batch.mappedRows || 0).toLocaleString()}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-secondary-50 text-secondary-800 border border-secondary-100 font-bold font-mono rounded text-[10px]">
                            {(batch.importedRows ?? batch.successRows ?? 0).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isMapping ? (
                           <span className="px-1.5 py-0.5 bg-rose-50 text-rose-800 border border-rose-100 font-bold font-mono rounded text-[10px]">
                             Unmapped: {(batch.unmappedRows || 0).toLocaleString()}
                           </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-100 font-bold font-mono rounded text-[10px]">
                            {(batch.duplicateRows || 0).toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-primary-900 dark:bg-black text-white dark:text-gray-100 border border-primary-100 font-bold font-mono rounded text-[10px]">
                          {(batch.updatedRows || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                         {isMapping ? (
                            <span className="text-xs text-gray-400">-</span>
                         ) : (
                            <span className="px-1.5 py-0.5 bg-orange-50 text-orange-850 border border-orange-100 font-bold font-mono rounded text-[10px]">
                              {(batch.skippedRows || 0).toLocaleString()}
                            </span>
                         )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-primary-50 text-primary-800 border border-primary-100 font-bold font-mono rounded text-[10px]">
                          {(batch.failedRows || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {batch.status === 'completed' ? (
                          <span className="flex items-center gap-1 text-[10px] text-secondary-700 font-semibold bg-secondary-50 border border-secondary-100 px-1.5 py-0.5 rounded-full w-max">
                            <CheckCircle className="w-3 h-3" /> สำเร็จ
                          </span>
                        ) : batch.status === 'processing' ? (
                          <span className="flex items-center gap-1 text-[10px] text-primary-700 font-semibold bg-primary-900 dark:bg-black border border-primary-100 px-1.5 py-0.5 rounded-full w-max animate-pulse">
                            กำลังทำ...
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-primary-700 font-semibold bg-primary-50 border border-primary-100 px-1.5 py-0.5 rounded-full w-max">
                            <XCircle className="w-3 h-3" /> ล้มเหลว
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 truncate max-w-[150px] font-mono" title={batch.importedEmail || batch.importedBy}>
                        {batch.importedEmail || batch.importedBy || 'ระบบ'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleDelete(batch.id)}
                          className="p-1 hover:bg-rose-50 text-rose-500 hover:text-rose-600 rounded transition-colors"
                          title="ลบประวัติ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
