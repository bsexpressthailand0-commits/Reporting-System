import React, { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Building2, Save, CheckCircle2, ShieldAlert, Loader2 } from 'lucide-react';
import { getCachedCompanyInfo, clearCompanyInfoCache } from '../lib/systemSettings';
import CompactCompanyHeader from '../components/CompactCompanyHeader';

export default function CompanySettings() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [form, setForm] = useState({
    companyNameTh: 'บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด',
    companyNameEn: 'BS EXPRESS 2020 CO., LTD.',
    addressLine1: 'สถานีขนส่งสินค้าพุทธมณฑลสาย 5',
    addressLine2: 'ชานชาลาที่ 11 ห้องที่ 16-17',
    addressLine3: '133 หมู่ที่ 1 ถนนบรมราชชนนี ตำบลบางเตย',
    addressLine4: 'อำเภอสามพราน จังหวัดนครปฐม 73210',
    phone: '02-114-8855',
    email: 'info@bsgroupth.com',
    taxId: '073-556-300-2997'
  });

  useEffect(() => {
    async function loadCompanyData() {
      setLoading(true);
      try {
        const data = await getCachedCompanyInfo();
        if (data) {
          setForm({
            companyNameTh: data.companyNameTh || 'บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด',
            companyNameEn: data.companyNameEn || 'BS EXPRESS 2020 CO., LTD.',
            addressLine1: data.addressLine1 || 'สถานีขนส่งสินค้าพุทธมณฑลสาย 5',
            addressLine2: data.addressLine2 || 'ชานชาลาที่ 11 ห้องที่ 16-17',
            addressLine3: data.addressLine3 || '133 หมู่ที่ 1 ถนนบรมราชชนนี ตำบลบางเตย',
            addressLine4: data.addressLine4 || 'อำเภอสามพราน จังหวัดนครปฐม 73210',
            phone: data.phone || '02-114-8855',
            email: data.email || 'info@bsgroupth.com',
            taxId: data.taxId || '073-556-300-2997'
          });
        }
      } catch (err: any) {
        console.error('Error fetching company settings:', err);
        setErrorMessage('ไม่สามารถโหลดข้อมูลผู้รับสิทธิ์ได้: ' + (err.message || ''));
      } finally {
        setLoading(false);
      }
    }
    loadCompanyData();
  }, [isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMessage('สิทธิ์ใช้งานไม่เพียงพอ: เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่บันทึกข้อมูลได้');
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage('');

    try {
      await setDoc(doc(db, 'systemSettings', 'company'), {
        ...form,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      clearCompanyInfoCache();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error saving company settings:', err);
      setErrorMessage('เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center bg-white dark:bg-gray-900 rounded-lg border p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
          <span className="text-xs text-gray-500">กำลังดาวน์โหลดข้อมูลการตั้งค่าบริษัท...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-10">
      <CompactCompanyHeader />
      
      {/* Page header area description */}
      {!isAdmin && (
        <div className="bg-white dark:bg-gray-900 p-4 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm flex items-center justify-between">
           <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100">โหมดอ่านอย่างเดียว</h1>
              <p className="text-xs text-gray-500">คุณสามารถดูข้อมูลได้เท่านั้น เฉพาะ Admin ที่สามารถแก้ไขได้</p>
            </div>
          </div>
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 border rounded-xl shadow-sm p-6 space-y-6">
        {errorMessage && (
          <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg text-xs leading-relaxed text-primary-700 font-medium">
            ⚠️ {errorMessage}
          </div>
        )}

        {saveSuccess && (
          <div className="p-4 bg-secondary-50 border border-secondary-200 rounded-lg text-xs leading-relaxed text-secondary-800 font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-secondary-600 shrink-0" />
            <span>ปรับปรุงการตั้งค่าข้อมูลบริษัทเรียบร้อยแล้ว ข้อมูลจะอัปเดตบนหัวรายงาน ใบเสร็จ และไฟล์ PDF ทันที</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              ชื่อบริษัท (ภาษาไทย) <span className="text-primary-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={!isAdmin || saving}
              value={form.companyNameTh}
              onChange={e => setForm(prev => ({ ...prev, companyNameTh: e.target.value }))}
              placeholder="บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด"
              className="w-full border rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50 disabled:text-gray-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              ชื่อบริษัท (ภาษาอังกฤษ) <span className="text-primary-500">*</span>
            </label>
            <input
              type="text"
              required
              disabled={!isAdmin || saving}
              value={form.companyNameEn}
              onChange={e => setForm(prev => ({ ...prev, companyNameEn: e.target.value }))}
              placeholder="BS EXPRESS 2020 CO., LTD."
              className="w-full border rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50 disabled:text-gray-500"
            />
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            <label className="block text-xs font-bold text-gray-800 dark:text-gray-200">
              รายละเอียดที่อยู่สำนักงานใหญ่ (Address Lines)
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">ที่อยู่ บรรทัดที่ 1</label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin || saving}
                  value={form.addressLine1}
                  onChange={e => setForm(prev => ({ ...prev, addressLine1: e.target.value }))}
                  placeholder="สถานีขนส่งสินค้าพุทธมณฑลสาย 5"
                  className="w-full border rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">ที่อยู่ บรรทัดที่ 2</label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin || saving}
                  value={form.addressLine2}
                  onChange={e => setForm(prev => ({ ...prev, addressLine2: e.target.value }))}
                  placeholder="ชานชาลาที่ 11 ห้องที่ 16-17"
                  className="w-full border rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">ที่อยู่ บรรทัดที่ 3</label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin || saving}
                  value={form.addressLine3}
                  onChange={e => setForm(prev => ({ ...prev, addressLine3: e.target.value }))}
                  placeholder="133 หมู่ที่ 1 ถนนบรมราชชนนี ตำบลบางเตย"
                  className="w-full border rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-1">ที่อยู่ บรรทัดที่ 4 (อำเภอ, จังหวัด, รหัสไปรษณีย์)</label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin || saving}
                  value={form.addressLine4}
                  onChange={e => setForm(prev => ({ ...prev, addressLine4: e.target.value }))}
                  placeholder="อำเภอสามพราน จังหวัดนครปฐม 73210"
                  className="w-full border rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">เลขประจำตัวผู้เสียภาษี</label>
              <input
                type="text"
                required
                disabled={!isAdmin || saving}
                value={form.taxId}
                onChange={e => setForm(prev => ({ ...prev, taxId: e.target.value }))}
                placeholder="073-556-300-2997"
                className="w-full border rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">เบอร์โทรศัพท์ติดต่อ</label>
              <input
                type="text"
                required
                disabled={!isAdmin || saving}
                value={form.phone}
                onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="02-114-8855"
                className="w-full border rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">อีเมลทางการ</label>
              <input
                type="email"
                required
                disabled={!isAdmin || saving}
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="info@bsgroupth.com"
                className="w-full border rounded px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 dark:bg-gray-800/50"
              />
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-end border-t border-gray-100 pt-4 shrink-0">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded text-xs flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังบันทึก...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> บันทึกข้อมูลบริษัท
                </>
              )}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
