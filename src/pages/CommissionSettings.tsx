import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Settings, Plus, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import dayjs from 'dayjs';

export default function CommissionSettings() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [isCustomCustGroup, setIsCustomCustGroup] = useState(false);

  const handleStartEdit = (rule: any) => {
    setEditingRule(rule);
    const presetGroups = ["CALLIN", "Drop point", "Online", "Booking", "Sale Driver", "RC งานเข้ารับ"];
    const isCustom = rule.customerGroup ? !presetGroups.includes(rule.customerGroup) : false;
    setIsCustomCustGroup(isCustom);
  };

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'commissionRules')));
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
      setRules(list);
    } catch (e) {
      console.error(e);
      toast.error('โหลดข้อมูลผิดพลาด');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    
    try {
      setLoading(true);
      const dataToSave = {
        ruleName: editingRule.ruleName || '',
        reportType: editingRule.reportType || '',
        branchCode: editingRule.branchCode || '',
        branchName: editingRule.branchName || '',
        customerGroup: editingRule.customerGroup || '',
        provinceGroup: editingRule.provinceGroup || '',
        serviceType: editingRule.serviceType || '',
        rateType: editingRule.rateType || 'PERCENT',
        rateValue: Number(editingRule.rateValue || 0),
        minAmount: Number(editingRule.minAmount || 0),
        maxAmount: Number(editingRule.maxAmount || 0),
        priority: Number(editingRule.priority || 0),
        isActive: editingRule.isActive ?? true,
        updatedAt: new Date().toISOString(),
      };

      const isEditing = !!editingRule.id;

      if (isEditing) {
        await setDoc(doc(db, 'commissionRules', editingRule.id), dataToSave, { merge: true });
        toast.success("บันทึกการแก้ไขแล้ว");
      } else {
        await addDoc(collection(db, 'commissionRules'), {
          ...dataToSave,
          createdAt: new Date().toISOString()
        });
        toast.success("เพิ่มข้อมูลสำเร็จ");
      }
      setEditingRule(null);
      await loadRules();
    } catch (error) {
      console.error(error);
      toast.error('บันทึกผิดพลาด');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm("ยืนยันที่จะลบ Rule นี้?")) return;
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'commissionRules', id));
      toast.success("ลบข้อมูลแล้ว");
      await loadRules();
    } catch(e) {
      console.error(e);
      toast.error('ลบผิดพลาด');
      setLoading(false);
    }
  }

  const openNewForm = () => {
    setEditingRule({
      ruleName: '',
      reportType: '',
      rateType: 'PERCENT',
      rateValue: 10,
      priority: 10,
      isActive: true
    });
    setIsCustomCustGroup(false);
  };

  return (
    <div className="w-full space-y-4 pb-10">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-50 rounded-lg flex items-center justify-center text-primary-600">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-800 dark:text-gray-200">ตั้งค่าสูตรคอมมิชชั่น</h1>
            <p className="text-xs text-gray-500">จัดการเงื่อนไขการคำนวณค่าคอมมิชชั่นสำหรับ Dashboard</p>
          </div>
        </div>
        
        {isAdmin && (
          <button onClick={openNewForm} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg flex items-center gap-2 text-sm font-bold shadow-sm transition-colors">
            <Plus className="w-4 h-4" /> เพิ่ม Rule ใหม่
          </button>
        )}
      </div>

      {editingRule && (
        <form onSubmit={handleSave} className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-primary-200 shadow-md">
          <h2 className="font-bold text-lg text-primary-900 mb-4">{editingRule.id ? 'แก้ไข Rule' : 'เพิ่ม Rule ใหม่'}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">ชื่อ Rule <span className="text-rose-500">*</span></label>
              <input required type="text" value={editingRule.ruleName} onChange={e=>setEditingRule({...editingRule, ruleName: e.target.value})} className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500" placeholder="เช่น Drop Point 10%"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Report Type</label>
              <input type="text" value={editingRule.reportType} onChange={e=>setEditingRule({...editingRule, reportType: e.target.value})} className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500" placeholder="เช่น DROP_POINT, RC_PICKUP"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Customer Group</label>
              {!isCustomCustGroup ? (
                <select
                  className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500 bg-white dark:bg-gray-900 cursor-pointer font-semibold text-gray-700 dark:text-gray-300"
                  value={editingRule.customerGroup || ""}
                  onChange={e => {
                    if (e.target.value === "CUSTOM") {
                      setIsCustomCustGroup(true);
                      setEditingRule({...editingRule, customerGroup: ""});
                    } else {
                      setEditingRule({...editingRule, customerGroup: e.target.value});
                    }
                  }}
                >
                  <option value="">-- ไม่ระบุ --</option>
                  <option value="CALLIN">CALLIN</option>
                  <option value="Drop point">Drop point</option>
                  <option value="Online">Online</option>
                  <option value="Booking">Booking</option>
                  <option value="Sale Driver">Sale Driver</option>
                  <option value="RC งานเข้ารับ">RC งานเข้ารับ</option>
                  {editingRule.customerGroup && !["CALLIN", "Drop point", "Online", "Booking", "Sale Driver", "RC งานเข้ารับ"].includes(editingRule.customerGroup) && (
                    <option value={editingRule.customerGroup}>{editingRule.customerGroup}</option>
                  )}
                  <option value="CUSTOM">-- ระบุเอง --</option>
                </select>
              ) : (
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    className="flex-1 w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500 font-semibold text-gray-700 dark:text-gray-300"
                    placeholder="ระบุเอง"
                    value={editingRule.customerGroup || ""}
                    onChange={e => setEditingRule({...editingRule, customerGroup: e.target.value})}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCustGroup(false);
                      setEditingRule({...editingRule, customerGroup: ""});
                    }}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 dark:text-gray-400 rounded text-xs font-bold border border-gray-200 dark:border-gray-700"
                  >
                    เลือก
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Branch Code (เฉพาะเจาะจง)</label>
              <input type="text" value={editingRule.branchCode} onChange={e=>setEditingRule({...editingRule, branchCode: e.target.value})} className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500" placeholder="เช่น BKK001"/>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Province Group (เฉพาะเจาะจง)</label>
              <input type="text" value={editingRule.provinceGroup} onChange={e=>setEditingRule({...editingRule, provinceGroup: e.target.value})} className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500" placeholder="เช่น 9 จังหวัด"/>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Service Type</label>
              <input type="text" value={editingRule.serviceType} onChange={e=>setEditingRule({...editingRule, serviceType: e.target.value})} className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500" placeholder="เช่น EXPRESS"/>
            </div>
            
             <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">ความสำคัญ (Priority) - มากไปน้อย</label>
              <input type="number" value={editingRule.priority} onChange={e=>setEditingRule({...editingRule, priority: e.target.value})} className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500"/>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">รูปแบบจ่าย <span className="text-rose-500">*</span></label>
              <select required value={editingRule.rateType} onChange={e=>setEditingRule({...editingRule, rateType: e.target.value})} className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500">
                <option value="PERCENT">PERCENT (%) จากค่าขนส่ง</option>
                <option value="FIXED_PER_BILL">FIXED_PER_BILL (บาท) ต่อบิล</option>
                <option value="FIXED_PER_PARCEL">FIXED_PER_PARCEL (บาท) ต่อชิ้น</option>
                <option value="TIER_PERCENT">TIER_PERCENT (ขั้นบันได)</option>
                <option value="CUSTOM">CUSTOM (สูตรพิเศษ)</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">มูลค่า / Rate Value <span className="text-rose-500">*</span></label>
               <input required type="number" step="0.01" value={editingRule.rateValue} onChange={e=>setEditingRule({...editingRule, rateValue: e.target.value})} className="w-full border rounded py-1.5 px-3 text-sm focus:outline-primary-500"/>
            </div>
            
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="isActive" checked={editingRule.isActive} onChange={e=>setEditingRule({...editingRule, isActive: e.target.checked})} className="w-4 h-4 text-primary-600 focus:ring-primary-500"/>
              <label htmlFor="isActive" className="text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer">เปิดใช้งาน (Active)</label>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <button type="button" onClick={()=>setEditingRule(null)} className="px-4 py-2 border rounded-lg text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-800/50">
              ยกเลิก
            </button>
            <button type="submit" disabled={loading} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700 disabled:opacity-50">
              {loading ? 'กำลังบันทึก...' : 'บันทึกสูตร'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-gray-900 border rounded-xl shadow-sm overflow-hidden text-sm">
        <table className="w-full text-left">
          <thead className="bg-gray-50 dark:bg-gray-800/50 border-b text-gray-500 font-bold text-xs uppercase tracking-wider">
            <tr>
              <th className="p-3">Priority</th>
              <th className="p-3">ชื่อ Rule</th>
              <th className="p-3">เงื่อนไขจับคู่</th>
              <th className="p-3">รูปแบบจ่าย</th>
              <th className="p-3">Rate</th>
              <th className="p-3">สถานะ</th>
              <th className="p-3 text-right">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rules.map((rule, i) => (
              <tr key={rule.id} className="hover:bg-gray-50 dark:bg-gray-800/50">
                <td className="p-3 font-bold text-primary-600">#{rule.priority}</td>
                <td className="p-3 font-bold text-gray-700 dark:text-gray-300">{rule.ruleName}</td>
                <td className="p-3">
                  <div className="text-xs space-y-1">
                    {rule.reportType && <div><span className="text-gray-400">Report:</span> {rule.reportType}</div>}
                    {rule.branchCode && <div><span className="text-gray-400">Branch:</span> {rule.branchCode}</div>}
                    {rule.provinceGroup && <div><span className="text-gray-400">ProvGroup:</span> {rule.provinceGroup}</div>}
                    {rule.serviceType && <div><span className="text-gray-400">Service:</span> {rule.serviceType}</div>}
                    {!rule.reportType && !rule.branchCode && !rule.provinceGroup && !rule.serviceType && <span className="text-gray-400">Any (ทั้งหมด)</span>}
                  </div>
                </td>
                <td className="p-3">
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 dark:text-gray-400 rounded text-xs font-bold">{rule.rateType}</span>
                </td>
                <td className="p-3 font-bold text-gray-700 dark:text-gray-300">{rule.rateValue}</td>
                <td className="p-3">
                  {rule.isActive 
                    ? <span className="flex items-center gap-1 text-secondary-600 text-xs font-bold"><CheckCircle className="w-3.5 h-3.5"/> เปิด</span>
                    : <span className="flex items-center gap-1 text-rose-600 text-xs font-bold"><XCircle className="w-3.5 h-3.5"/> ปิด</span>
                  }
                </td>
                <td className="p-3 text-right">
                  {isAdmin && (
                    <div className="flex justify-end gap-2">
                       <button onClick={()=>handleStartEdit(rule)} className="p-1.5 text-gray-400 hover:bg-primary-50 hover:text-primary-600 rounded transition-colors" title="แก้ไข">
                         <Edit className="w-4 h-4" />
                       </button>
                       <button onClick={()=>handleDelete(rule.id)} className="p-1.5 text-gray-400 hover:bg-rose-50 hover:text-rose-600 rounded transition-colors" title="ลบ">
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rules.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-400 bg-gray-50 dark:bg-gray-800/50">
                  <p>ยังไม่มีสูตรการคำนวณคอมมิชชั่น</p>
                  <p className="text-xs mt-1">สูตรจะถูกนำไปใช้ในหน้า Commission Dashboard</p>
                </td>
              </tr>
            )}
             {loading && rules.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-gray-400">กำลังโหลด...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
