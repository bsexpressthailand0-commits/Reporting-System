import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, doc, setDoc, serverTimestamp, getDoc, writeBatch } from 'firebase/firestore';
import { FileQuestion, Search, FileDown, Plus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckCircle2, SlidersHorizontal, AlertCircle, RefreshCw, Layers, Sparkles, Edit3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { useToast } from '../lib/ToastContext';
import { triggerReprocessCommission, resolveReportType, parsePercentageRate, getCachedCommissionMappings, createAuditLog, clearCommissionMappingCache } from '../lib/commissionMapping';
import { normalizeCustomerGroup, getCustomerGroupOptions } from '../lib/customerGroupService';
import { useMasterDataContext } from '../lib/MasterDataContext';
import { useAuth } from '../lib/AuthContext';
import { CommissionRateInput, CommissionPreviewCard, MappingValidation } from '../components/commission/SharedCommissionComponents';
import CompactCompanyHeader from '../components/CompactCompanyHeader';

export default function UnmappedCommission() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { masterData } = useMasterDataContext();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters state
  const [filterProvince, setFilterProvince] = useState('');
  const [filterAreaType, setFilterAreaType] = useState('ALL'); // 'ALL', '9_PROVINCES', '68_PROVINCES'
  const [filterMappingStatus, setFilterMappingStatus] = useState('UNMAPPED_ONLY'); // 'ALL', 'UNMAPPED_ONLY', 'MAPPED_PENDING'
  const [allProvinces, setAllProvinces] = useState<string[]>([]);

  // Selection state
  const [selectedRows, setSelectedRows] = useState<any[]>([]);

  // Modal control
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>(null);

  // Bulk modal control
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState<any>({
    reportBranchGroup: '',
    commissionRate9: '',
    commissionRate68: ''
  });

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    fetchUnmapped();
  }, []);

  const fetchUnmapped = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'shipments'),
        where('commissionMappingStatus', '==', 'unmapped')
      );
      const snap = await getDocs(q);
      
      const unmappedAgg: Record<string, any> = {};
      const provincesSet = new Set<string>();

      snap.docs.forEach(doc => {
        const d = doc.data();
        const bCode = d.mappedBranchCode || d.branchCode || '-';
        const bName = d.branchName || '-';
        const sName = d.senderName || '-';
        const rType = d.reportType || resolveReportType(d);
        const cGroup = normalizeCustomerGroup(
          (d.customerGroup && d.customerGroup !== "ไม่ระบุ" && d.customerGroup !== "")
            ? d.customerGroup
            : rType
        );
        const key = `${bCode}-${sName}-${bName}-${cGroup}`;
        
        const toProvince = d.toProvince || d.receiverProvince || '';
        if (toProvince && toProvince !== '-' && toProvince !== 'ไม่ระบุ') {
          provincesSet.add(toProvince);
        }
        
        const isNine = (toProvince && ["กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี", "สมุทรปราการ", "สมุทรสาคร", "นครปฐม", "สมุทรสงคราม", "พระนครศรีอยุธยา", "ฉะเชิงเทรา"].includes(toProvince.trim()));
        
        if (!unmappedAgg[key]) {
          unmappedAgg[key] = {
            branchCode: bCode,
            branchName: bName,
            senderName: sName,
            customerGroup: cGroup,
            reportType: rType,
            totalBills: 0,
            totalShippingFee: 0,
            nineProvinceBills: 0,
            sixtyEightProvinceBills: 0,
            provinces: new Set<string>()
          };
        }
        
        unmappedAgg[key].totalBills += 1;
        unmappedAgg[key].totalShippingFee += Number(d.orderTotal || 0);
        
        if (isNine) {
          unmappedAgg[key].nineProvinceBills += 1;
        } else {
          unmappedAgg[key].sixtyEightProvinceBills += 1;
        }
        if (toProvince) {
          unmappedAgg[key].provinces.add(toProvince);
        }
      });
      
      // Determine existing mapping status
      const masterMappings = await getCachedCommissionMappings();
      
      const arr = Object.values(unmappedAgg).map((row: any) => {
        const uBranchCode = String(row.branchCode).trim().toUpperCase();
        const uSenderName = String(row.senderName).trim().toUpperCase();
        
        const matched = masterMappings.some((m: any) => {
          const mBranchCode = String(m.branchCode || "").trim().toUpperCase();
          const mSenderNames = m.senderNames || [];
          const mSenderText = String(m.senderNameText || "").trim().toUpperCase();
          
          if (uBranchCode && uBranchCode !== '-' && mBranchCode === uBranchCode) {
            return true;
          }
          if (uSenderName && uSenderName !== '-') {
            if (mSenderNames.some((sn: string) => String(sn).trim().toUpperCase() === uSenderName)) return true;
            if (mSenderText.includes(uSenderName)) return true;
          }
          return false;
        });
        
        return {
          ...row,
          hasMapping: matched,
          provincesList: Array.from(row.provinces)
        };
      }).sort((a, b) => b.totalShippingFee - a.totalShippingFee);
      
      setData(arr);
      setAllProvinces(Array.from(provincesSet).sort());

    } catch (e) {
      console.error(e);
      toast.error('ไม่สามารถดึงข้อมูลรายการที่ไม่พบ Mapping ได้');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return data.filter(d => {
      // 1. Search term (case-insensitive)
      const matchesSearch = 
        d.branchCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
        d.branchName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        d.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.customerGroup || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchesSearch) return false;
      
      // 2. Province filter
      if (filterProvince) {
        const hasProvince = d.provincesList && d.provincesList.some((p: string) => p === filterProvince);
        if (!hasProvince) return false;
      }
      
      // 3. Area type filter (9 provinces or 68 provinces)
      if (filterAreaType === '9_PROVINCES') {
        if (d.nineProvinceBills === 0) return false;
      } else if (filterAreaType === '68_PROVINCES') {
        if (d.sixtyEightProvinceBills === 0) return false;
      }
      
      // 4. Mapping status filter (UNMAPPED_ONLY = never mapped, MAPPED_PENDING = has mapping, ALL = everything)
      if (filterMappingStatus === 'UNMAPPED_ONLY') {
        if (d.hasMapping) return false;
      } else if (filterMappingStatus === 'MAPPED_PENDING') {
        if (!d.hasMapping) return false;
      }
      
      return true;
    });
  }, [data, searchTerm, filterProvince, filterAreaType, filterMappingStatus]);

  // When search/filters change, reset page to 1 and clear selections to prevent processing invisible rows
  useEffect(() => {
    setCurrentPage(1);
    setSelectedRows([]);
  }, [searchTerm, filterProvince, filterAreaType, filterMappingStatus]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalItems, pageSize, totalPages, currentPage]);

  const paginatedUnmappedItems = useMemo(() => {
    return filtered.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filtered, currentPage, pageSize]);

  // Single creation trigger
  const openModal = (rowData: any) => {
    let prefilledName = '';
    const group = rowData.customerGroup;
    if (["CALLIN", "Online", "Sale Driver"].includes(group)) {
      prefilledName = rowData.senderName !== '-' ? rowData.senderName : '';
    } else {
      prefilledName = rowData.branchName !== '-' ? rowData.branchName : (rowData.senderName !== '-' ? rowData.senderName : '');
    }

    setForm({
      branchCode: rowData.branchCode !== '-' ? rowData.branchCode : '',
      branchName: prefilledName,
      reportBranchGroup: group !== '-' ? group : '',
      commissionRate9: '',
      commissionRate68: '',
      reportType: rowData.reportType || '',
      originalRow: rowData
    });
    setShowModal(true);
  };

  // Single creation handler
  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const bCodeClean = (form.branchCode || "").trim();
      const bNameClean = (form.branchName || "").trim();
      const targetReportType = (form.reportType || "").trim();
      
      const baseId = bCodeClean || bNameClean;
      const id = targetReportType ? `${baseId}_${targetReportType}` : baseId;
      
      if (!id) {
        toast.error('กรุณากรอก รหัสสาขา หรือ ชื่อสาขา/ผู้ส่ง');
        return;
      }
      
      // Validation for rate 9
      const parsedRate9 = Number(form.commissionRate9);
      if (isNaN(parsedRate9) || parsedRate9 < 0 || parsedRate9 > 100 || form.commissionRate9.trim() === '') {
        toast.error('เรตค่าคอม 9 จังหวัด ต้องเป็นตัวเลขระหว่าง 0 ถึง 100');
        return;
      }

      // Validation for rate 68
      const parsedRate68 = Number(form.commissionRate68);
      if (isNaN(parsedRate68) || parsedRate68 < 0 || parsedRate68 > 100 || form.commissionRate68.trim() === '') {
        toast.error('เรตค่าคอม 68 จังหวัด ต้องเป็นตัวเลขระหว่าง 0 ถึง 100');
        return;
      }

      if ((parsedRate9 > 0 && parsedRate9 < 0.05) || (parsedRate68 > 0 && parsedRate68 < 0.05)) {
        toast.error('กรุณากรอกแบบ เปอร์เซ็นต์ตรง เช่น 0.6 แทน 0.006 หรือ 1 แทน 0.01');
        return;
      }

      let resolvedCustomerGroup = normalizeCustomerGroup(form.reportBranchGroup);
      if (!getCustomerGroupOptions().includes(resolvedCustomerGroup)) {
        resolvedCustomerGroup = "ไม่ระบุ";
      }

      const docRef = doc(db, "commissionMappings", id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const confirm = await Swal.fire({
          title: 'พบข้อมูลที่ซ้ำกัน',
          text: `มีการตั้งค่า Mapping '${id}' อยู่แล้ว ต้องการเขียนทับหรือไม่?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'เขียนทับ',
          cancelButtonText: 'ยกเลิก'
        });
        if (!confirm.isConfirmed) return;
      }

      const mapping = {
        branchCode: bCodeClean,
        branchName: bNameClean,
        senderOrBranchName: bNameClean || bCodeClean,
        senderNameText: bNameClean,
        senderNames: bNameClean ? [bNameClean] : [],
        reportBranchGroup: form.reportBranchGroup,
        reportType: targetReportType,
        customerGroup: resolvedCustomerGroup,
        commissionRate9: parsedRate9,
        commissionRate68: parsedRate68,
        commissionRate: parsedRate9, // backward compatibility
        commissionRateRaw: String(parsedRate9), // backward compatibility
        areaType: 'ALL',
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(docRef, mapping, { merge: true });
      clearCommissionMappingCache();
      setShowModal(false);

      // Audit Log: single mapping creation
      await createAuditLog('CREATE_MAPPING_FROM_UNMAPPED', {
        id,
        mapping
      }, user?.email);
      
      toast.info('กำลังบันทึกและประมวลผลระบบคำนวณสูตรยอดขนส่ง...');
      
      // Reprocess shipments
      await triggerReprocessCommission();

      // Audit Log: reprocessing completion
      await createAuditLog('REPROCESS_UNMAPPED_COMMISSION', {
        message: 'Reprocessed shipments after single mapping creation from unmapped',
        reprocessedMapKey: id
      }, user?.email);
      
      toast.success('สร้าง Mapping และคำนวณ Commission ใหม่สำเร็จ');
      
      fetchUnmapped();
      
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'ไม่สามารถสร้าง mapping ได้');
    }
  };

  // Bulk creation handler
  const handleBulkSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRows.length === 0) {
      toast.warning('กรุณาเลือกอย่างน้อย 1 รายการเพื่อดำเนินการ');
      return;
    }

    try {
      // Rates validation
      const parsedRate9 = Number(bulkForm.commissionRate9);
      if (isNaN(parsedRate9) || parsedRate9 < 0 || parsedRate9 > 100 || bulkForm.commissionRate9.trim() === '') {
        toast.error('เรตค่าคอม 9 จังหวัด ต้องเป็นตัวเลขระหว่าง 0 ถึง 100');
        return;
      }

      const parsedRate68 = Number(bulkForm.commissionRate68);
      if (isNaN(parsedRate68) || parsedRate68 < 0 || parsedRate68 > 100 || bulkForm.commissionRate68.trim() === '') {
        toast.error('เรตค่าคอม 68 จังหวัด ต้องเป็นตัวเลขระหว่าง 0 ถึง 100');
        return;
      }

      if ((parsedRate9 > 0 && parsedRate9 < 0.05) || (parsedRate68 > 0 && parsedRate68 < 0.05)) {
        toast.error('กรุณากรอกแบบ เปอร์เซ็นต์ตรง เช่น 0.6 แทน 0.006 หรือ 1 แทน 0.01');
        return;
      }

      toast.info(`กำลังเขียนข้อมูลแบบกลุ่ม... จำนวน ${selectedRows.length} รายการ`);

      let resolvedBulkCustomerGroup = normalizeCustomerGroup(bulkForm.reportBranchGroup);
      if (!getCustomerGroupOptions().includes(resolvedBulkCustomerGroup)) {
        resolvedBulkCustomerGroup = "ไม่ระบุ";
      }

      const batch = writeBatch(db);
      const createdIds: string[] = [];

      selectedRows.forEach(row => {
        const docBCode = String(row.branchCode || "").trim();
        const docBName = String(row.branchName || "").trim();
        const docSName = String(row.senderName || "").trim();
        const docRType = row.reportType || '';

        // Determine matching / mapping document ID
        // Use branchCode if present, otherwise fallback to senderName
        const finalBCode = docBCode !== '-' ? docBCode : '';
        const finalBName = docBName !== '-' ? docBName : (docSName !== '-' ? docSName : '');
        const baseId = finalBCode || finalBName;
        const id = docRType ? `${baseId}_${docRType}` : baseId;

        if (id) {
          const ref = doc(db, 'commissionMappings', id);
          const mapping = {
            branchCode: finalBCode,
            branchName: finalBName,
            senderOrBranchName: finalBName || finalBCode,
            senderNameText: docSName !== '-' ? docSName : finalBName,
            senderNames: docSName !== '-' ? [docSName] : [],
            reportBranchGroup: bulkForm.reportBranchGroup,
            reportType: docRType,
            customerGroup: resolvedBulkCustomerGroup,
            commissionRate9: parsedRate9,
            commissionRate68: parsedRate68,
            commissionRate: parsedRate9,
            commissionRateRaw: String(parsedRate9),
            areaType: 'ALL',
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          batch.set(ref, mapping, { merge: true });
          createdIds.push(id);
        }
      });

      await batch.commit();
      clearCommissionMappingCache();

      // Audit Log: bulk creation
      await createAuditLog('BULK_CREATE_MAPPINGS', {
        ids: createdIds,
        count: createdIds.length,
        commonRates: {
          commissionRate9: parsedRate9,
          commissionRate68: parsedRate68,
          reportBranchGroup: bulkForm.reportBranchGroup
        }
      }, user?.email);

      toast.info('ระบบกำลังทบทวนยอดขนส่ง (ยอดขาย × เรต / 100) ทุกรายการ...');

      // Reprocess
      await triggerReprocessCommission();

      // Audit Log: reprocessing complete
      await createAuditLog('REPROCESS_UNMAPPED_COMMISSION', {
        message: 'Reprocessed shipments after bulk mappings creation from unmapped',
        reprocessedKeysCount: createdIds.length
      }, user?.email);

      setShowBulkModal(false);
      setSelectedRows([]);

      toast.success(`สร้าง Mapping แบบกลุ่มสำเร็จ (${createdIds.length} รายการ)`);

      fetchUnmapped();

    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'ไม่สามารถบันทึกแบบกลุ่มได้');
    }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(d => ({
      'รหัสสาขา': d.branchCode,
      'ชื่อสาขา': d.branchName,
      'ผู้ส่ง/ชื่อลูกค้า': d.senderName,
      'กลุ่มลูกค้า': d.customerGroup,
      'จำนวนบิล': d.totalBills,
      'ยอดค่าขนส่ง': d.totalShippingFee,
      'สถานะการแมปปิ้ง': d.hasMapping ? 'พบ Mapping ในระบบรอคำนวณใหม่' : 'ยังไม่มี Mapping'
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Unmapped");
    XLSX.writeFile(wb, "Unmapped_Commission.xlsx");
  };

  return (
    <div className="w-full space-y-4 pb-24 px-4 sm:px-6">
      <CompactCompanyHeader />
      
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600 shadow-inner shrink-0">
            <FileQuestion className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200">Unmapped Commission</h1>
            <p className="text-xs text-gray-500 mt-0.5">จับคู่รายการบิลที่ไม่ตรงตารางตั้งค่าเปอร์เซ็นต์ค่าแนะนำตรง</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedRows.length > 0 && (
            <button
              onClick={() => {
                setBulkForm({
                  reportBranchGroup: '',
                  commissionRate9: '',
                  commissionRate68: ''
                });
                setShowBulkModal(true);
              }}
              className="px-3.5 py-2 text-xs font-black bg-primary-600 text-white rounded-lg hover:bg-primary-700 shadow-md shadow-primary-150 inline-flex items-center transition-all active:scale-95 animate-pulse"
            >
              <Layers className="w-4 h-4 mr-1.5" />
              สร้างกลุ่ม ({selectedRows.length}) รายการ
            </button>
          )}

          <button 
            onClick={exportExcel} 
            disabled={filtered.length === 0}
            className="px-4 py-2 text-xs font-bold bg-secondary-50 text-secondary-700 rounded-lg border border-secondary-100 hover:bg-secondary-600 hover:text-white hover:border-secondary-600 flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <FileDown className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
            ดาวน์โหลด Excel ({filtered.length})
          </button>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 gap-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-end shadow-sm">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Search className="w-3.5 h-3.5 text-gray-400" /> ค้นหาคำหลัก
          </label>
          <input 
            type="text"
            placeholder="ค้นหารหัสสาขา/ชื่อสาขา/ผู้ส่ง..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg py-2.5 md:py-1.5 px-3 text-xs outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-semibold text-gray-700 dark:text-gray-300"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" /> ประเภทพื้นที่บริการ
          </label>
          <select
            value={filterAreaType}
            onChange={e => setFilterAreaType(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg py-2.5 md:py-1.5 px-3 text-xs outline-none focus:ring-2 focus:ring-primary-500/20 text-gray-700 dark:text-gray-300 font-bold cursor-pointer"
          >
            {masterData?.areaTypes.filter(t => t.isActive).sort((a,b) => a.order - b.order).map(t => (
               <option key={t.id} value={t.aliases[0] || t.id}>{t.label}</option>
            ))}
            {!masterData?.areaTypes.length && (
              <>
                <option value="ALL">พื้นที่ทั้งหมด (9 และ 68 จังหวัด)</option>
                <option value="9_PROVINCES">มีรายการส่งไป 9 จังหวัด</option>
                <option value="68_PROVINCES">มีรายการส่งไป 68 จังหวัด</option>
              </>
            )}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" /> จังหวัดปลายทาง
          </label>
          <select
            value={filterProvince}
            onChange={e => setFilterProvince(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg py-2.5 md:py-1.5 px-3 text-xs outline-none focus:ring-2 focus:ring-primary-500/20 text-gray-700 dark:text-gray-300 font-bold cursor-pointer"
          >
            <option value="">จังหวัดทั้งหมด ({allProvinces.length})</option>
            {allProvinces.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" /> สถานะการตั้งค่าแมปปิ้ง
          </label>
          <select
            value={filterMappingStatus}
            onChange={e => setFilterMappingStatus(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg py-2.5 md:py-1.5 px-3 text-xs outline-none focus:ring-2 focus:ring-primary-500/20 text-gray-700 dark:text-gray-300 font-bold cursor-pointer"
          >
            <option value="UNMAPPED_ONLY">กรองเฉพาะรายการที่ยังไม่มี mapping (แนะนำ)</option>
            <option value="MAPPED_PENDING">พบแมปปิ้งในระบบแล้ว (รออัปเดตยอดคำนวณ)</option>
            <option value="ALL">แสดงบิลที่ยังไม่ได้คำนวณทั้งหมด</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-gray-50 dark:bg-gray-800/50 pb-2 border-b border-gray-200 dark:border-gray-700 text-gray-500 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-4 font-extrabold text-center w-12">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 text-primary-600 rounded cursor-pointer accent-primary-600 focus:ring-transparent"
                    checked={paginatedUnmappedItems.length > 0 && paginatedUnmappedItems.every(item => selectedRows.some(r => r.branchCode === item.branchCode && r.senderName === item.senderName && r.customerGroup === item.customerGroup))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const toAdd = paginatedUnmappedItems.filter(item => !selectedRows.some(r => r.branchCode === item.branchCode && r.senderName === item.senderName && r.customerGroup === item.customerGroup));
                        setSelectedRows([...selectedRows, ...toAdd]);
                      } else {
                        const keysToRemove = paginatedUnmappedItems.map(item => `${item.branchCode}-${item.senderName}-${item.customerGroup}`);
                        setSelectedRows(selectedRows.filter(r => !keysToRemove.includes(`${r.branchCode}-${r.senderName}-${r.customerGroup}`)));
                      }
                    }}
                  />
                </th>
                <th className="px-5 py-4 font-extrabold">รหัสสาขา</th>
                <th className="px-5 py-4 font-extrabold">ชื่อสาขาที่ได้</th>
                <th className="px-5 py-4 font-extrabold">ผู้ส่ง / ชื่อลูกค้า</th>
                <th className="px-5 py-4 font-extrabold">กลุ่มคำนวณเดิม</th>
                <th className="px-5 py-4 font-extrabold text-right">จำนวนส่งรวม</th>
                <th className="px-5 py-4 font-extrabold text-right">ยอดขนส่ง (บ.)</th>
                <th className="px-5 py-4 font-extrabold text-center">ปลายทาง</th>
                <th className="px-5 py-4 font-extrabold text-center">แมปปิ้ง</th>
                <th className="px-5 py-4 font-extrabold text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedUnmappedItems.map(row => {
                const isSelected = selectedRows.some(r => r.branchCode === row.branchCode && r.senderName === row.senderName && r.customerGroup === row.customerGroup);
                return (
                  <tr key={`${row.branchCode}-${row.senderName}-${row.customerGroup}`} className={`hover:bg-gray-55/40 transition-colors ${isSelected ? 'bg-primary-50/20' : ''}`}>
                    <td className="px-5 py-4 text-center">
                      <input 
                        type="checkbox"
                        className="w-4 h-4 text-primary-600 rounded cursor-pointer accent-primary-600 focus:ring-transparent"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows([...selectedRows, row]);
                          } else {
                            setSelectedRows(selectedRows.filter(r => !(r.branchCode === row.branchCode && r.senderName === row.senderName && r.customerGroup === row.customerGroup)));
                          }
                        }}
                      />
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-gray-700 dark:text-gray-300">{row.branchCode}</td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-400 font-medium">{row.branchName}</td>
                    <td className="px-5 py-4 font-extrabold text-gray-900 dark:text-gray-100">{row.senderName}</td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-gray-100 text-gray-650 border border-gray-200 dark:border-gray-700">
                        {row.customerGroup}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-gray-600 dark:text-gray-400 font-bold">{row.totalBills.toLocaleString()} บิล</td>
                    <td className="px-5 py-4 text-right font-black text-gray-900 dark:text-gray-100">{row.totalShippingFee.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[10px] text-secondary-600 font-bold font-mono">9 จว.: {row.nineProvinceBills}</span>
                        <span className="text-[10px] text-primary-600 font-bold font-mono">68 จว.: {row.sixtyEightProvinceBills}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {row.hasMapping ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                          มีแล้ว (รอรีคำนวณ)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-600 border border-rose-100">
                          ยังไม่มี
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button 
                          onClick={() => openModal(row)} 
                          className="text-primary-600 hover:bg-primary-600 hover:text-white font-bold px-3 py-1.5 bg-primary-50 rounded-lg inline-flex items-center text-[11px] transition-all active:scale-95 shadow-sm cursor-pointer"
                          title="สร้างแบบฟอร์มด่วน (Quick Create)"
                        >
                          <Plus className="w-3.5 h-3.5 mr-0.5" /> สร้างด่วน
                        </button>
                        <button 
                          onClick={() => navigate(`/commission-mapping?search=${encodeURIComponent(row.senderBranchCode || row.senderBranch || '')}`)}
                          className="text-primary-700 hover:bg-primary-50 hover:text-primary-800 font-extrabold px-2 py-1.5 bg-primary-50/50 rounded-lg inline-flex items-center text-[10px] transition-all active:scale-95 border border-primary-200/50 cursor-pointer"
                          title="ไปหน้าแก้ไขขั้นสูง (Advanced Editor)"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-20 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800/50 rounded-full flex items-center justify-center mb-4">
                        <Search className="w-8 h-8 opacity-20" />
                      </div>
                      <p className="text-sm font-bold text-gray-500">ไม่พบข้อมูล Unmapped</p>
                      <p className="text-xs text-gray-400 mt-1">ลองเปลี่ยนคำค้นหาหรือเลือกสถานะการตั้งค่าแมปปิ้งเป็น "แสดงทั้งหมด"</p>
                    </div>
                  </td>
                </tr>
              )}
              
              {loading && (
                <tr>
                  <td colSpan={10} className="px-5 py-20 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-primary-600">
                      <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2.5 h-2.5 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2.5 h-2.5 bg-primary-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-xs font-bold tracking-widest uppercase text-primary-600">กำลังโหลดคำนวณ...</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination UI */}
        <div className="bg-gray-50 dark:bg-gray-800/50/80 border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider order-2 md:order-1">
            แสดง <span className="text-gray-900 dark:text-gray-100 font-extrabold">{filtered.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> ถึง{" "}
            <span className="text-gray-900 dark:text-gray-100 font-extrabold">{Math.min(currentPage * pageSize, filtered.length)}</span> จากทั้งหมด{" "}
            <span className="text-gray-900 dark:text-gray-100 font-extrabold">{filtered.length}</span> รายการ
          </div>

          <div className="flex flex-wrap items-center gap-6 order-1 md:order-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">ต่อหน้า:</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="border border-gray-200 dark:border-gray-700 rounded-lg py-1 px-2.5 text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-bold outline-none cursor-pointer focus:ring-2 focus:ring-primary-505"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 disabled:opacity-20 hover:bg-gray-50 dark:bg-gray-800/50 transition-all active:scale-95"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 disabled:opacity-20 hover:bg-gray-50 dark:bg-gray-800/50 transition-all active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="px-3 h-8 flex items-center justify-center text-xs font-extrabold text-primary-700 bg-white dark:bg-gray-900 rounded-lg border border-primary-100 min-w-[70px]">
                {currentPage} / {totalPages}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 disabled:opacity-20 hover:bg-gray-50 dark:bg-gray-800/50 transition-all active:scale-95"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 disabled:opacity-20 hover:bg-gray-50 dark:bg-gray-800/50 transition-all active:scale-95"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SINGLE MAPPING CREATION MODAL */}
      {showModal && form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm md:p-4">
          <div className="bg-white dark:bg-gray-900 w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg rounded-none md:rounded-2xl shadow-2xl flex flex-col">
             <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-base font-black text-gray-800 dark:text-gray-200">สร้าง Commission Mapping</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">จับคู่เรตเปอร์เซ็นต์ค่าแนะนำตรง (สูตรปัจจุบัน: ยอดขนส่ง × เรต%)</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:bg-gray-150 p-2 rounded-lg font-bold">✕</button>
             </div>
             
             <form onSubmit={handleSaveMapping} className="overflow-auto p-5 space-y-4 flex-1">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3.5 border border-gray-105 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500 block">บิลในระบบรอค้างคำนวณ:</span>
                    <strong className="text-gray-800 dark:text-gray-200 font-extrabold">{form.originalRow.totalBills} บิล</strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block">ยอดขนส่งสะสม:</span>
                    <strong className="text-rose-600 font-black">{form.originalRow.totalShippingFee.toLocaleString()} บาท</strong>
                  </div>
                </div>
                
                <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-650 mb-1">รหัสสาขา (Branch Code) <span className="text-rose-500">*</span></label>
                      <input 
                        required 
                        type="text" 
                        placeholder="กรอกรหัสสาขาเพื่อจับคู่ระบบ"
                        className="w-full border border-gray-250 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:ring-2 focus:ring-primary-500 text-gray-800 dark:text-gray-200 font-semibold focus:outline-none" 
                        value={form.branchCode} 
                        onChange={e => setForm({...form, branchCode: e.target.value})} 
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-gray-650 mb-1">ชื่อสาขา/ผู้ส่ง (Branch Name) <span className="text-rose-500">*</span></label>
                      <input 
                        required 
                        type="text" 
                        placeholder="กรอกชื่อลูกค้าเดิมเพื่อแสดงแสดงผล"
                        className="w-full border border-gray-250 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:ring-2 focus:ring-primary-500 text-gray-800 dark:text-gray-200 font-semibold focus:outline-none" 
                        value={form.branchName} 
                        onChange={e => setForm({...form, branchName: e.target.value})} 
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-650 mb-1">กลุ่มรายงานสาขา (Report Branch Group) <span className="text-rose-500">*</span></label>
                      <input 
                        required 
                        type="text" 
                        placeholder="เช่น DC0002 (DC พุทธมณฑลสาย5), Drop point, CALLIN"
                        className="w-full border border-gray-250 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:ring-2 focus:ring-primary-500 text-gray-800 dark:text-gray-200 font-bold focus:outline-none bg-gray-50 dark:bg-gray-800/50" 
                        value={form.reportBranchGroup} 
                        onChange={e => setForm({...form, reportBranchGroup: e.target.value})} 
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-1">
                      <CommissionRateInput
                        label="ค่าคอม 9 จังหวัด (% ตรง)"
                        value={form.commissionRate9}
                        onChange={val => setForm({...form, commissionRate9: val})}
                        accentColor="secondary"
                        placeholder="เช่น 0.6 หรือ 1.0"
                      />

                      <CommissionRateInput
                        label="ค่าคอม 68 จังหวัด (% ตรง)"
                        value={form.commissionRate68}
                        onChange={val => setForm({...form, commissionRate68: val})}
                        accentColor="primary"
                        placeholder="เช่น 0.6 หรือ 1.0"
                      />
                    </div>
                </div>

                {/* Universal Validation and Simulation Previews */}
                <div className="space-y-3 pt-1">
                  <MappingValidation
                    commissionRate9={form.commissionRate9}
                    commissionRate68={form.commissionRate68}
                  />
                  <CommissionPreviewCard
                    commissionRate9={form.commissionRate9}
                    commissionRate68={form.commissionRate68}
                    shippingAmount={form.originalRow.totalShippingFee > 0 ? Math.round(form.originalRow.totalShippingFee) : 1000}
                  />
                </div>
                
                <div className="pt-4 border-t border-gray-105 flex flex-col md:flex-row md:justify-end gap-2 bg-gray-50 dark:bg-gray-800/50/50 -mx-5 -mb-5 p-4 rounded-b-2xl mt-auto sticky bottom-0 z-10 shrink-0">
                   <button 
                     type="button" 
                     onClick={() => {
                       setShowModal(false);
                       navigate(`/commission-mapping?search=${encodeURIComponent(form.branchCode || form.branchName)}`);
                     }} 
                     className="px-3.5 py-2.5 md:py-2 text-xs font-black text-primary-700 bg-primary-55 hover:bg-primary-100 border border-primary-200 rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer w-full md:w-auto"
                   >
                     <Edit3 className="w-3.5 h-3.5" />
                     แก้ไขขั้นสูง (Advanced)
                   </button>
                   <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2.5 md:py-2 text-xs font-bold text-gray-600 dark:text-gray-400 bg-gray-100 hover:bg-gray-200 rounded-lg w-full md:w-auto">ยกเลิก</button>
                   <button type="submit" className="px-4 py-2.5 md:py-2 text-xs font-extrabold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-md shadow-primary-100 transition-all active:scale-95 w-full md:w-auto">ตรวจสอบและบันทึก</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* BULK MAPPING CREATION MODAL */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm md:p-4">
          <div className="bg-white dark:bg-gray-900 w-full h-full md:h-auto md:max-h-[90vh] md:max-w-lg rounded-none md:rounded-2xl shadow-2xl flex flex-col">
             <div className="p-5 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-base font-black text-gray-800 dark:text-gray-200">สร้างกลุ่มแบบ Bulk ({selectedRows.length} รายการ)</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">ระบบจะบันทึก Mapping ทุกตัวแยกตามรหัสและประมวลผลคำนวณยอดด้วยเรตเดียวกัน</p>
                </div>
                <button onClick={() => setShowBulkModal(false)} className="text-gray-400 hover:bg-gray-150 p-2 rounded-lg font-bold">✕</button>
             </div>
             
             <form onSubmit={handleBulkSaveMapping} className="overflow-auto p-5 space-y-4 flex-1">
                <div className="bg-primary-50/60 rounded-xl p-3 text-xs border border-primary-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-primary-600 shrink-0" />
                  <span className="font-bold text-primary-900 leading-relaxed">
                    คุณกำลังสร้างค่านายหน้าแบบกลุ่มให้กับสาขา/รายชื่อ {selectedRows.length} รายการที่เลือกไว้พร้อมกัน
                  </span>
                </div>

                <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-650 mb-1">กลุ่มรายงานสาขาปลายทาง (Common Group) <span className="text-rose-500">*</span></label>
                      <input 
                        required 
                        type="text" 
                        placeholder="เช่น DC0002 (DC พุทธมณฑลสาย5), Drop point, CALLIN"
                        className="w-full border border-gray-250 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:ring-2 focus:ring-primary-500 text-gray-800 dark:text-gray-200 font-bold focus:outline-none" 
                        value={bulkForm.reportBranchGroup} 
                        onChange={e => setBulkForm({...bulkForm, reportBranchGroup: e.target.value})} 
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <CommissionRateInput
                        label="ค่าคอม 9 จังหวัด (% ตรง)"
                        value={bulkForm.commissionRate9}
                        onChange={val => setBulkForm({...bulkForm, commissionRate9: val})}
                        accentColor="secondary"
                        placeholder="เช่น 0.6 หรือ 1.0"
                      />

                      <CommissionRateInput
                        label="ค่าคอม 68 จังหวัด (% ตรง)"
                        value={bulkForm.commissionRate68}
                        onChange={val => setBulkForm({...bulkForm, commissionRate68: val})}
                        accentColor="primary"
                        placeholder="เช่น 0.6 หรือ 1.0"
                      />
                    </div>
                </div>

                {/* Universal Validation and Simulation Previews */}
                <div className="space-y-3 pt-1">
                  <MappingValidation
                    commissionRate9={bulkForm.commissionRate9}
                    commissionRate68={bulkForm.commissionRate68}
                  />
                  <CommissionPreviewCard
                    commissionRate9={bulkForm.commissionRate9}
                    commissionRate68={bulkForm.commissionRate68}
                    shippingAmount={1000}
                  />
                </div>

                <div className="pt-4 border-t border-gray-100 flex flex-col md:flex-row md:justify-end gap-2.5 mt-auto sticky bottom-0 bg-white dark:bg-gray-900 z-10 shrink-0">
                   <button type="button" onClick={() => setShowBulkModal(false)} className="px-4 py-2.5 md:py-2 text-xs font-bold text-gray-600 dark:text-gray-400 bg-gray-100 hover:bg-gray-200 rounded-lg w-full md:w-auto">ยกเลิก</button>
                   <button type="submit" className="px-4 py-2.5 md:py-2 text-xs font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-md w-full md:w-auto">ยืนยันบันทึกทั้งกลุ่มและคำนวณใหม่</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
