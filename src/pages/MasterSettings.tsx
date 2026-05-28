import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useMasterDataContext, MasterData, MasterDataItem } from '../lib/MasterDataContext';
import { Settings, Save, Plus, Trash2, ArrowUp, ArrowDown, Database, Loader2, Info } from 'lucide-react';
import Swal from 'sweetalert2';
import { useToast } from '../lib/ToastContext';
import CompactCompanyHeader from '../components/CompactCompanyHeader';
import { masterDataService } from '../lib/masterDataService';

type CategoryKey = keyof MasterData;

const CATEGORIES: { key: CategoryKey; label: string; desc: string }[] = [
  { key: 'customerGroups', label: 'กลุ่มลูกค้า (Customer Groups)', desc: 'ตัวเลือกกลุ่มลูกค้าแบบต่างๆ เช่น CALLIN, Drop point, Online' },
  { key: 'reportBranchGroups', label: 'กลุ่มสาขารายงาน (Report Branch Groups)', desc: 'กลุ่มการแสดงผลใน Report Center เช่น DC0002, เครือข่าย' },
  { key: 'areaTypes', label: 'ประเภทพื้นที่ (Area Types)', desc: '9 จังหวัด, 68 จังหวัด, ทั่วประเทศ' },
  { key: 'serviceChannels', label: 'ช่องทางบริการ (Service Channels)', desc: 'B2B, B2C' },
  { key: 'reportTypes', label: 'ประเภทรายงาน (Report Types)', desc: 'รายได้หลัก, เครือข่าย, งานเหมา' },
];

export default function MasterSettings() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { masterData, loading, saveMasterData } = useMasterDataContext();
  const [activeTab, setActiveTab] = useState<CategoryKey>('customerGroups');
  
  // Local state for editing
  const [localData, setLocalData] = useState<MasterData | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync localData when masterData loads
  React.useEffect(() => {
    if (!loading && masterData && !localData) {
      setLocalData(JSON.parse(JSON.stringify(masterData))); // deep copy
    }
  }, [loading, masterData, localData]);

  if (loading || !localData) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const handleSave = async () => {
    if (!isAdmin) {
       toast.error('เฉพาะ Admin เท่านั้น');
       return;
    }
    
    setIsSaving(true);
    try {
      // 1. Validation for empty/blank fields
      for (const cat of CATEGORIES) {
        const items = localData[cat.key];
        const blankCheck = masterDataService.validateNotBlank(items);
        if (!blankCheck.isValid) {
          toast.error(`[หมวดหมู่: ${cat.label.split(' ')[0]}] ${blankCheck.message}`);
          setIsSaving(false);
          return;
        }
      }

      // 2. Validation for unique names (uniqueness)
      for (const cat of CATEGORIES) {
        const items = localData[cat.key];
        const dupCheck = masterDataService.validateNoDuplicateNames(items);
        if (!dupCheck.isValid) {
          toast.error(`[หมวดหมู่: ${cat.label.split(' ')[0]}] ${dupCheck.message}`);
          setIsSaving(false);
          return;
        }
      }

      await saveMasterData(localData);
      toast.success('บันทึก Master Data สำเร็จ');
    } catch (error: any) {
      toast.error(error.message || 'บันทึกไม่สำเร็จ');
    }
    setIsSaving(false);
  };

  const updateItem = (catFunc: (items: MasterDataItem[]) => MasterDataItem[]) => {
    setLocalData({
      ...localData,
      [activeTab]: catFunc(localData[activeTab])
    });
  };

  const handleAddItem = () => {
    const newItem: MasterDataItem = {
      id: `${activeTab}_${Date.now()}`,
      label: 'ใหม่',
      aliases: [],
      isActive: true,
      order: localData[activeTab].length + 1
    };
    updateItem(items => [...items, newItem]);
  };

  const handleRemoveItem = async (id: string, label: string) => {
    if (label === 'ไม่ระบุ') {
      toast.warning('ห้ามลบตัวเลือก "ไม่ระบุ" (System Default)');
      return;
    }
    
    let usageCount = 0;
    if (activeTab === 'reportBranchGroups') {
      usageCount = await masterDataService.checkGroupUsageCount(label);
    }

    const warningText = usageCount > 0 
      ? `🚨 คำเตือนความปลอดภัย: กลุ่มสาขานี้กำลังถูกเชื่อมโยงอยู่กับสาขาจำนวน ${usageCount} สาขาในระบบ หากคุณยืนยันที่จะลบ กลุ่มสาขาดังกล่าวจะหลุดออกจากการรวมผล และทำให้รายงานแสดงผลคลาดเคลื่อน คุณแน่ใจหรือไม่ที่จะดำเนินการต่อ? (แนะนำให้ผู้ใช้เปลี่ยนกลุ่มของสาขาเหล่านั้นออกเสียก่อน หรือเลือก "ปิดการใช้งาน" แทนการลบบัญชีกลุ่ม)`
      : `คุณต้องการลบ "${label}" ออกจากระบบหรือไม่? หากลบไปแล้วข้อมูลเก่าที่จับคู่ไว้อาจจะแสดงผลตกหล่น (แนะนำให้ใช้การ ปิดการใช้งาน แทน)`;

    Swal.fire({
      title: usageCount > 0 ? 'ลบกลุ่มสาขาที่ยังทำงานอยู่?' : 'ยืนยันการลบ',
      text: warningText,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: usageCount > 0 ? 'ยืนยันลบข้อมูลกลุ่มสาขาที่ใช้จริง' : 'ลบข้อมูลเป้าหมาย',
      confirmButtonColor: '#e11d48'
    }).then((res) => {
      if (res.isConfirmed) {
        updateItem(items => items.filter(it => it.id !== id));
      }
    });
  };

  const moveItem = (index: number, direction: 'up'|'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === localData[activeTab].length - 1) return;
    
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    updateItem(items => {
      const newItems = [...items];
      [newItems[index], newItems[targetIdx]] = [newItems[targetIdx], newItems[index]];
      // Fix orders safely
      return newItems.map((it, i) => ({ ...it, order: i }));
    });
  };

  return (
    <div className="w-full space-y-6 px-4 py-8">
      <CompactCompanyHeader />
      
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-800 dark:text-gray-200 flex items-center gap-2">
            <Database className="w-6 h-6 text-primary-500" />
            Master Data Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            จัดการตัวเลือก Dropdown ทั้งหมดในระบบ (Report Center, Commission) ให้เชื่อมโยงเป็นข้อมูลชุดเดียวกัน
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !isAdmin}
          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 text-white text-sm font-bold rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          บันทึกการเปลี่ยนแปลงทั้งหมด
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Tabs */}
        <div className="md:col-span-1 space-y-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all font-bold text-sm ${
                activeTab === cat.key 
                  ? 'bg-primary-50 text-primary-700 border border-primary-200' 
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-transparent hover:bg-gray-50 dark:bg-gray-800/50'
              }`}
            >
              <div className="flex flex-col">
                <span>{cat.label.split(' ')[0]}</span>
                <span className={`text-[10px] font-normal ${activeTab === cat.key ? 'text-primary-500' : 'text-gray-400'}`}>
                  {cat.label.includes('(') ? cat.label.split('(')[1].replace(')','') : ''}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="md:col-span-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm overflow-hidden flex flex-col pb-10">
          
          <div className="p-5 border-b border-gray-100 flex justify-between items-start">
             <div>
               <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                 {CATEGORIES.find(c => c.key === activeTab)?.label}
               </h2>
               <p className="text-xs text-gray-500 mt-1">
                 {CATEGORIES.find(c => c.key === activeTab)?.desc}
               </p>
             </div>
             <button
               onClick={handleAddItem}
               className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 border border-gray-200 dark:border-gray-700"
             >
               <Plus className="w-3.5 h-3.5" />
               เพิ่มตัวเลือกใหม่
             </button>
          </div>

          <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-800/50/50 p-2">
            {localData[activeTab].map((item, idx) => (
              <div key={item.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-4 rounded-xl shadow-sm mb-3 flex gap-4 items-start relative group transition-all hover:border-primary-200">
                
                {/* Actions: Reorder */}
                <div className="flex flex-col gap-1 items-center justify-center shrink-0 mt-1 opacity-20 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0} className="p-1 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveItem(idx, 'down')} disabled={idx === localData[activeTab].length - 1} className="p-1 hover:bg-gray-100 rounded text-gray-500 disabled:opacity-30">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Basic Info */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Label (ชื่อตัวเลือกแสดงผล)
                    </label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-primary-100 outline-none"
                      value={item.label}
                      onChange={(e) => {
                        updateItem(items => items.map(it => it.id === item.id ? { ...it, label: e.target.value } : it))
                      }}
                      disabled={item.label === 'ไม่ระบุ'}
                    />
                    {item.label === 'ไม่ระบุ' && (
                       <span className="text-[10px] text-amber-600 mt-1 flex items-center gap-1"><Info className="w-3 h-3"/> System default (แก้ไขชื่อไม่ได้)</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex flex-col justify-between">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Active Status
                      </label>
                      <button
                        onClick={() => {
                          if (item.label === 'ไม่ระบุ') return;
                          updateItem(items => items.map(it => it.id === item.id ? { ...it, isActive: !it.isActive } : it))
                        }}
                        disabled={item.label === 'ไม่ระบุ'}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors w-24 text-center border ${
                          item.isActive 
                            ? 'bg-secondary-50 text-secondary-700 border-secondary-200 hover:bg-secondary-100' 
                            : 'bg-gray-100 text-gray-500 border-gray-200 dark:border-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {item.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </button>
                    </div>

                    <div className="mt-auto pt-2 flex justify-end md:hidden">
                       <button onClick={() => handleRemoveItem(item.id, item.label)} className="text-rose-500 text-xs font-bold flex items-center gap-1"><Trash2 className="w-3.5 h-3.5"/>ลบ</button>
                    </div>
                  </div>

                  {/* Aliases mapping rules */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Normalization Rules / คำค้นหาที่เทียบเท่า (คั่นระบุด้วยจุลภาค ",")
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น call in, call-in, คอลอิน"
                      className="w-full px-3 py-1.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-600 dark:text-gray-400 font-mono focus:bg-white dark:bg-gray-900 focus:ring-2 focus:ring-primary-100 outline-none"
                      value={item.aliases.join(', ')}
                      onChange={(e) => {
                        const newAliases = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                        updateItem(items => items.map(it => it.id === item.id ? { ...it, aliases: newAliases } : it));
                      }}
                      disabled={item.label === 'ไม่ระบุ'}
                    />
                  </div>
                </div>

                {/* Desktop Delete */}
                <div className="hidden md:flex shrink-0 w-12 h-full items-start justify-end mt-1">
                   <button 
                     onClick={() => handleRemoveItem(item.id, item.label)} 
                     disabled={item.label === 'ไม่ระบุ'}
                     className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                   >
                     <Trash2 className="w-4 h-4" />
                   </button>
                </div>

              </div>
            ))}
            
            {localData[activeTab].length === 0 && (
              <div className="text-center p-10 text-gray-400 text-sm font-semibold border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                ไม่มีตัวเลือกในหมวดหมู่นี้
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
