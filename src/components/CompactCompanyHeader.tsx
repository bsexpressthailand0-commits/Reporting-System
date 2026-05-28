import React, { useEffect, useState } from 'react';
import { Building2, Phone, Mail, Info, ChevronRight, MapPin, Hash } from 'lucide-react';
import { getCachedCompanyInfo } from '../lib/systemSettings';
import ResponsiveModal from './ResponsiveModal';

const DEFAULT_COMPANY = {
  companyNameTh: 'บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด',
  companyNameEn: 'BS EXPRESS 2020 CO., LTD.',
  addressLine1: 'สถานีขนส่งสินค้าพุทธมณฑลสาย 5',
  addressLine2: 'ชานชาลาที่ 11 ห้องที่ 16-17',
  addressLine3: '133 หมู่ที่ 1 ถนนบรมราชชนนี ตำบลบางเตย',
  addressLine4: 'อำเภอสามพราน จังหวัดนครปฐม 73210',
  phone: '02-114-8855',
  email: 'info@bsgroupth.com',
  taxId: '073-556-300-2997'
};

export default function CompactCompanyHeader() {
  const [companyInfo, setCompanyInfo] = useState<any>(DEFAULT_COMPANY);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    async function loadCompany() {
      const cached = await getCachedCompanyInfo();
      if (cached) {
        setCompanyInfo(cached);
      }
    }
    loadCompany();
  }, []);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 md:px-6 md:py-4 shadow-sm font-sans shrink-0">
      <div className="flex items-center justify-between gap-4">
        {/* Main Info */}
        <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
          <div className="hidden sm:flex w-10 h-10 md:w-12 md:h-12 bg-primary-50 text-primary-600 rounded-xl items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div className="overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-baseline md:gap-2 overflow-hidden">
              <h1 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                {companyInfo.companyNameTh}
              </h1>
              <h2 className="text-[10px] md:text-xs font-semibold text-gray-400 truncate">
                {companyInfo.companyNameEn}
              </h2>
            </div>
            
            {/* Desktop Quick Info */}
            <div className="hidden md:flex items-center gap-4 mt-1 text-[11px] text-gray-500 font-medium">
              <div className="flex items-center gap-1">
                <Hash className="w-3 h-3 text-gray-400" />
                <span>Tax ID: {companyInfo.taxId}</span>
              </div>
              <div className="flex items-center gap-1">
                <Phone className="w-3 h-3 text-gray-400" />
                <span>{companyInfo.phone}</span>
              </div>
              <div className="flex items-center gap-1">
                <Mail className="w-3 h-3 text-gray-400" />
                <span>{companyInfo.email}</span>
              </div>
            </div>

            {/* Mobile/Tablet Simple Info */}
            <div className="md:hidden flex items-center gap-2 mt-0.5 text-[10px] text-gray-400 font-medium">
               <span>Tax: {companyInfo.taxId}</span>
               <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
               <span>{companyInfo.phone}</span>
            </div>
          </div>
        </div>

        {/* View Details Button */}
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 md:px-3 md:py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] md:text-xs font-bold text-gray-600 dark:text-gray-400 transition-colors shrink-0"
        >
          <Info className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">ดูข้อมูลบริษัท</span>
          <ChevronRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-gray-400" />
        </button>
      </div>

      {/* Full Details Modal */}
      <ResponsiveModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="ข้อมูลผู้รับสิทธิ์ / ข้อมูลบริษัท"
        maxWidth="max-w-md"
      >
        <div className="space-y-6">
          <div className="flex flex-col items-center text-center gap-2">
             <div className="w-16 h-16 bg-primary-50 text-primary-600 rounded-2xl flex items-center justify-center mb-1">
               <Building2 className="w-8 h-8" />
             </div>
             <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{companyInfo.companyNameTh}</h3>
             <p className="text-xs font-semibold text-gray-500 uppercase">{companyInfo.companyNameEn}</p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100">
               <div className="flex items-start gap-3">
                 <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                 <div className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400 font-medium">
                   <p>{companyInfo.addressLine1}</p>
                   <p>{companyInfo.addressLine2}</p>
                   <p>{companyInfo.addressLine3}</p>
                   <p>{companyInfo.addressLine4}</p>
                 </div>
               </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
               <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-primary-500" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">เลขประจำตัวผู้เสียภาษี</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-600 dark:text-gray-400">{companyInfo.taxId}</span>
               </div>
               
               <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-secondary-500" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">เบอร์โทรศัพท์</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-600 dark:text-gray-400">{companyInfo.phone}</span>
               </div>

               <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">อีเมล</span>
                  </div>
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-400">{companyInfo.email}</span>
               </div>
            </div>
          </div>

          <div className="pt-2">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="w-full py-2.5 bg-gray-900 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-gray-800 transition-colors"
            >
              รับทราบ
            </button>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
}
