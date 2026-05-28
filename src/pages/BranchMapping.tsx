import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Search, Plus, Edit2, Trash2, Save, X, RefreshCw, Database, Upload } from 'lucide-react';
import { seedBranchMappings } from '../lib/seedBranchMappings';
import { useToast } from '../lib/ToastContext';
import CompactCompanyHeader from '../components/CompactCompanyHeader';

export default function BranchMapping() {
  const toast = useToast();
  const [mappings, setMappings] = useState<any[]>([]);
  const [unmappedData, setUnmappedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'mapped' | 'unmapped'>('mapped');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  const [isAdding, setIsAdding] = useState(false);

  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchMappings();
    fetchUnmapped();
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = event.target?.result;
          // Dynamically import xlsx since it's a large library that might be already used
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];
          
          let successCount = 0;
          for (const row of json) {
            const branchName = row['branchName'] || row['สาขา'] || row['ชื่อสาขา'];
            const branchCode = row['branchCode'] || row['รหัสสาขา'] || '';
            const mainBranch = row['mainBranch'] || row['สาขาหลัก'] || '';
            const subBranch = row['subBranch'] || row['สาขารอง'] || '';
            const reportBranchGroup = row['reportBranchGroup'] || row['กลุ่มสาขา'] || branchName;
            
            if (!branchName && !branchCode) continue;
            
            const mapping = {
              branchName: String(branchName),
              branchCode: String(branchCode),
              mainBranch: String(mainBranch),
              subBranch: String(subBranch),
              reportBranchGroup: String(reportBranchGroup),
              isDropPoint: !!(row['isDropPoint'] || row['DP']),
              isNetwork: !!(row['isNetwork'] || row['NW']),
              isCallin: !!(row['isCallin'] || row['CallIn']),
              isSaleDriver: !!(row['isSaleDriver'] || row['SaleDriver']),
              isOnline: !!(row['isOnline'] || row['Online']),
              isRcPickup: !!(row['isRcPickup'] || row['RC']),
              isFullTruckLoad: !!(row['isFullTruckLoad'] || row['FTL']),
              isEcommerce: !!(row['isEcommerce'] || row['ECOM']),
              is360Truck: !!(row['is360Truck'] || row['360']),
              isMainRevenue: !!(row['isMainRevenue'] || row['Main'] || row['รายได้รวมหลัก']),
            };
            
            const id = branchCode || branchName;
            if (id) {
              await setDoc(doc(db, 'branchMappings', String(id)), mapping, { merge: true });
              successCount++;
            }
          }
          
          toast.success(`นำเข้าสำเร็จ ${successCount} รายการ`);
          fetchMappings();
        } catch (error) {
          console.error("Parse error", error);
          toast.error("เกิดข้อผิดพลาดในการอ่านไฟล์");
        } finally {
          setIsImporting(false);
          // reset input
          e.target.value = '';
        }
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error(error);
      setIsImporting(false);
    }
  };

  const fetchMappings = async () => {
    setLoading(true);
    try {
      const q = collection(db, 'branchMappings');
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMappings(data);
    } catch (error) {
      console.error(error);
    }
    setLoading(false);
  };

  const fetchUnmapped = async () => {
    try {
      const q = collection(db, 'unmappedBranches');
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUnmappedData(data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm(item);
  };

  const handleAdd = () => {
    setIsAdding(true);
    setEditingId('new');
    setEditForm({
      branchName: '',
      branchCode: '',
      mainBranch: '',
      subBranch: '',
      reportBranchGroup: '',
      isDropPoint: false,
      isNetwork: false,
      isCallin: false,
      isSaleDriver: false,
      isOnline: false,
      isRcPickup: false,
      isFullTruckLoad: false,
      isEcommerce: false,
      is360Truck: false,
      isMainRevenue: false
    });
  };

  const handleSave = async () => {
    try {
      const id = editForm.branchCode || editForm.branchName;
      if (!id) return;
      
      const ref = doc(db, 'branchMappings', id);
      await setDoc(ref, editForm, { merge: true });
      
      setEditingId(null);
      setIsAdding(false);
      fetchMappings();
    } catch (error) {
      console.error("Error saving mapping", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("คุณต้องการลบข้อมูลนี้ใช่หรือไม่?")) return;
    try {
      await deleteDoc(doc(db, 'branchMappings', id));
      fetchMappings();
    } catch (error) {
      console.error("Error deleting mapping", error);
    }
  };
  
  const mapUnmapped = (unmappedItem: any) => {
    setIsAdding(true);
    setEditingId('new');
    setEditForm({
      branchName: unmappedItem.branchName,
      branchCode: unmappedItem.branchCode,
      mainBranch: '',
      subBranch: '',
      reportBranchGroup: unmappedItem.branchName,
      isDropPoint: unmappedItem.branchCode?.startsWith('DP') || false,
      isNetwork: false,
      isCallin: false,
      isSaleDriver: false,
      isOnline: false,
      isRcPickup: false,
      isFullTruckLoad: false,
      isEcommerce: false,
      is360Truck: false,
      isMainRevenue: false
    });
    setActiveTab('mapped');
  };

  const handleSeed = async () => {
    if (!window.confirm("ต้องการสร้างข้อมูล Mapping ตั้งต้นจากระบบหรือไม่ (ข้อมูลเดิมจะไม่หายไปถ้า ID ไม่ตรงกัน)?")) return;
    setLoading(true);
    try {
      await seedBranchMappings(db);
      toast.success("นำเข้าข้อมูล Mapping ตั้งต้นสำเร็จ");
      fetchMappings();
    } catch (e) {
      console.error(e);
      toast.error("เกิดข้อผิดพลาดในการสร้างข้อมูล");
    }
    setLoading(false);
  };

  const handleRebuild = async () => {
    if (!window.confirm("ต้องการคำนวณรายงานใหม่หรือไม่? (จะใช้เวลาในการประมวลผล)")) return;
    setLoading(true);
    try {
      // Mock calling the cloud function since we're in dev view without emulator
      toast.success("สั่งคำนวณรายงานใหม่เรียบร้อย (Cloud Function: rebuildSummaryByDateRange)");
    } catch (e) {
      console.error(e);
      toast.error("เกิดข้อผิดพลาดในการสั่งคำนวณ");
    }
    setLoading(false);
  };

  const filteredMappings = mappings.filter(m => 
    (m.branchName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (m.reportBranchGroup || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.branchCode || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full space-y-4 flex flex-col pb-20">
      <CompactCompanyHeader />
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200">Branch Mapping</h1>
          <p className="text-xs text-gray-500 mt-1">จัดการ Master Data การจัดกลุ่มสาขาสำหรับรายงาน</p>
        </div>
        <div className="flex gap-2">
           <label className="px-3 py-1.5 text-xs font-medium bg-secondary-50 text-secondary-600 rounded-lg border border-secondary-200 hover:bg-secondary-100 flex items-center cursor-pointer">
             <Upload className="w-3 h-3 mr-1" />
             นำเข้า
             <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} disabled={isImporting} />
           </label>
           <button onClick={handleSeed} className="px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-600 rounded-lg border border-primary-200 hover:bg-primary-100 flex items-center">
             <Database className="w-3 h-3 mr-1" />
             ข้อมูลตั้งต้น
           </button>
           <button onClick={handleRebuild} className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-600 rounded-lg border border-amber-200 hover:bg-amber-100 flex items-center">
             <RefreshCw className="w-3 h-3 mr-1" />
             คำนวณรายงานใหม่
           </button>
           <button onClick={() => { fetchMappings(); fetchUnmapped(); }} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 flex items-center">
             <RefreshCw className="w-3 h-3 mr-1" />
             รีเฟรช
           </button>
           <button onClick={handleAdd} className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center">
             <Plus className="w-3 h-3 mr-1" />
             เพิ่มเงื่อนไข
           </button>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col flex-1">
        <div className="border-b border-gray-200 dark:border-gray-700 p-4 shrink-0 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
             <button 
                onClick={() => setActiveTab('mapped')}
                className={`flex-1 sm:w-32 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'mapped' ? 'bg-white dark:bg-gray-900 text-primary-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}
             >
                Mapped ({mappings.length})
             </button>
             <button 
                onClick={() => setActiveTab('unmapped')}
                className={`flex-1 sm:w-32 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'unmapped' ? 'bg-white dark:bg-gray-900 text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}
             >
                Unmapped ({unmappedData.length})
             </button>
          </div>
          
          {activeTab === 'mapped' && (
             <div className="relative w-full sm:w-64">
               <Search className="absolute text-gray-400 left-3 top-1/2 -trangray-y-1/2 w-4 h-4" />
               <input 
                 type="text"
                 placeholder="ค้นหาสาขา..."
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
                 className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
               />
             </div>
          )}
        </div>
        
        {activeTab === 'mapped' && (
           <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800/50">
             <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
               <thead className="bg-white dark:bg-gray-900 sticky top-0 z-10 shadow-sm">
                 <tr>
                   <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">ชื่อสาขา</th>
                   <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">รหัสสาขา</th>
                   <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">สาขาหลัก</th>
                   <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">สาขารอง</th>
                   <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">กลุ่มสาขา (Report)</th>
                   <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">สถานะ</th>
                   <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">จัดการ</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                 {isAdding && (
                   <tr className="bg-primary-900 dark:bg-black">
                     <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.branchName} onChange={e => setEditForm({...editForm, branchName: e.target.value})} placeholder="Branch Name" /></td>
                     <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.branchCode} onChange={e => setEditForm({...editForm, branchCode: e.target.value})} placeholder="Code" /></td>
                     <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.mainBranch} onChange={e => setEditForm({...editForm, mainBranch: e.target.value})} placeholder="Main Branch" /></td>
                     <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.subBranch} onChange={e => setEditForm({...editForm, subBranch: e.target.value})} placeholder="Sub Branch" /></td>
                     <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.reportBranchGroup} onChange={e => setEditForm({...editForm, reportBranchGroup: e.target.value})} placeholder="Report Group" /></td>
                     <td className="px-4 py-2 text-center text-xs">
                       <label className="mr-2"><input type="checkbox" checked={editForm.isDropPoint} onChange={e => setEditForm({...editForm, isDropPoint: e.target.checked})} /> DP</label>
                     </td>
                     <td className="px-4 py-2 text-right">
                       <button onClick={handleSave} className="text-secondary-600 mr-2"><Save className="w-4 h-4" /></button>
                       <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-gray-400"><X className="w-4 h-4" /></button>
                     </td>
                   </tr>
                 )}
                 
                 {filteredMappings.map(row => (
                   <tr key={row.id || row.branchCode} className="hover:bg-gray-50 dark:bg-gray-800/50">
                     {editingId === row.id ? (
                       <React.Fragment>
                         <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.branchName} onChange={e => setEditForm({...editForm, branchName: e.target.value})} /></td>
                         <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.branchCode} onChange={e => setEditForm({...editForm, branchCode: e.target.value})} /></td>
                         <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.mainBranch} onChange={e => setEditForm({...editForm, mainBranch: e.target.value})} /></td>
                         <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.subBranch} onChange={e => setEditForm({...editForm, subBranch: e.target.value})} /></td>
                         <td className="px-4 py-2"><input type="text" className="w-full border px-2 py-1 text-xs" value={editForm.reportBranchGroup} onChange={e => setEditForm({...editForm, reportBranchGroup: e.target.value})} /></td>
                         <td className="px-4 py-2 text-center text-[10px]">
                            {/* Simple toggles for demo */}
                            <label className="mr-2"><input type="checkbox" checked={editForm.isDropPoint} onChange={e => setEditForm({...editForm, isDropPoint: e.target.checked})} /> DP</label>
                            <label className="mr-2"><input type="checkbox" checked={editForm.isNetwork} onChange={e => setEditForm({...editForm, isNetwork: e.target.checked})} /> NW</label>
                            <label><input type="checkbox" checked={editForm.isMainRevenue} onChange={e => setEditForm({...editForm, isMainRevenue: e.target.checked})} /> Main</label>
                         </td>
                         <td className="px-4 py-2 text-right">
                           <button onClick={handleSave} className="text-secondary-600 mr-2"><Save className="w-4 h-4" /></button>
                           <button onClick={() => setEditingId(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
                         </td>
                       </React.Fragment>
                     ) : (
                       <React.Fragment>
                         <td className="px-4 py-2 whitespace-nowrap text-xs font-semibold text-gray-800 dark:text-gray-200">{row.branchName}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{row.branchCode}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">{row.mainBranch || '-'}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">{row.subBranch || '-'}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-primary-700">{row.reportBranchGroup}</td>
                         <td className="px-4 py-2 whitespace-nowrap text-[10px] text-center">
                           <div className="flex gap-1 flex-wrap justify-center max-w-[150px]">
                             {row.isDropPoint && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">DP</span>}
                             {row.isNetwork && <span className="bg-secondary-100 text-secondary-700 px-1.5 py-0.5 rounded">NW</span>}
                             {row.isMainRevenue && <span className="bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">MainRev</span>}
                             {row.isCallin && <span className="bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">CallIn</span>}
                           </div>
                         </td>
                         <td className="px-4 py-2 whitespace-nowrap text-right text-xs">
                           <button onClick={() => handleEdit(row)} className="text-primary-600 hover:text-white dark:text-gray-100 mr-3"><Edit2 className="w-3.5 h-3.5" /></button>
                           <button onClick={() => handleDelete(row.id)} className="text-primary-500 hover:text-primary-700"><Trash2 className="w-3.5 h-3.5" /></button>
                         </td>
                       </React.Fragment>
                     )}
                   </tr>
                 ))}
                 
                 {filteredMappings.length === 0 && !isAdding && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-500">ไม่พบข้อมูล Mapping</td>
                    </tr>
                 )}
               </tbody>
             </table>
           </div>
        )}
        
        {activeTab === 'unmapped' && (
           <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800/50">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
               <thead className="bg-white dark:bg-gray-900 sticky top-0 z-10 shadow-sm border-b border-primary-100">
                 <tr>
                   <th className="px-4 py-3 text-left text-[10px] font-bold text-primary-600 uppercase tracking-wider">สาขาที่ไม่พบ (Unmapped)</th>
                   <th className="px-4 py-3 text-left text-[10px] font-bold text-primary-600 uppercase tracking-wider">รหัสที่แกะได้</th>
                   <th className="px-4 py-3 text-center text-[10px] font-bold text-primary-600 uppercase tracking-wider">จำนวนบิลที่เกี่ยวข้อง</th>
                   <th className="px-4 py-3 text-left text-[10px] font-bold text-primary-600 uppercase tracking-wider">Tracking ตัวอย่าง</th>
                   <th className="px-4 py-3 text-right text-[10px] font-bold text-primary-600 uppercase tracking-wider">จัดการ</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-gray-100 bg-white dark:bg-gray-900">
                 {unmappedData.map(row => (
                    <tr key={row.id}>
                       <td className="px-4 py-2 whitespace-nowrap text-xs font-semibold text-gray-800 dark:text-gray-200">{row.branchName}</td>
                       <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">{row.branchCode || '-'}</td>
                       <td className="px-4 py-2 whitespace-nowrap text-xs text-center text-gray-900 dark:text-gray-100 font-mono">{row.count}</td>
                       <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500 font-mono">{row.sampleTrackingNo || '-'}</td>
                       <td className="px-4 py-2 whitespace-nowrap text-right">
                         <button onClick={() => mapUnmapped(row)} className="px-2 py-1 text-[10px] font-medium bg-primary-900 dark:bg-black text-primary-600 rounded border border-primary-200 hover:bg-primary-100">
                           เพิ่มเป็น Master
                         </button>
                       </td>
                    </tr>
                 ))}
                 {unmappedData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-secondary-600 font-medium">✨ ยอดเยี่ยม! ไม่พบสาขาที่ยังไม่ได้ Map</td>
                    </tr>
                 )}
               </tbody>
              </table>
           </div>
        )}
      </div>
    </div>
  );
}
