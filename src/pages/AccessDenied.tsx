import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 shadow-xl shadow-gray-200/50 p-8 text-center gap-6 flex flex-col items-center">
        <div className="w-16 h-16 bg-primary-50 text-primary-500 rounded-2xl flex items-center justify-center border border-primary-100">
          <ShieldAlert className="w-8 h-8" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">ปฏิเสธการเข้าถึง (Access Denied)</h1>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
            คุณไม่มีสิทธิ์ในการเข้าถึงหน้านี้ หากเชื่อว่าเป็นความผิดพลาด กรุณาติดต่อผู้ดูแลระบบเพื่อปรับปรุงสิทธิ์การใช้งาน
          </p>
        </div>

        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-medium text-sm rounded-xl transition-colors shadow-lg shadow-gray-900/10 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          กลับไปที่หน้าหลัก
        </button>
      </div>
    </div>
  );
}
