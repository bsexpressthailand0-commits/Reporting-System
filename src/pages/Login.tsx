import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Truck, CheckCircle2, BarChart3, Database, ShieldCheck, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { LoginForm } from '../components/auth/LoginForm';

const FeatureItem = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
  <div className="flex items-start space-x-4">
    <div className="flex-shrink-0 w-10 h-10 bg-white dark:bg-gray-900/10 rounded-lg flex items-center justify-center backdrop-blur-md border border-white/20">
      <Icon className="w-5 h-5 text-primary-200" />
    </div>
    <div>
      <h3 className="text-white font-semibold">{title}</h3>
      <p className="text-primary-100/70 text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);

export default function Login() {
  const { user } = useAuth();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  if (user) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col md:flex-row">
      {/* Left Section - Branding & Features */}
      <div className="hidden md:flex md:w-1/2 lg:w-[60%] bg-black relative overflow-hidden flex-col justify-between p-12 lg:p-20">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary-600/20 rounded-full blur-[120px] -trangray-y-1/2 trangray-x-1/4"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-primary-600/10 rounded-full blur-[100px] trangray-y-1/4 -trangray-x-1/4"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]"></div>

        <div className="relative z-10">
          <div className="flex items-center space-x-3 mb-16">
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/30">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight leading-none">BS EXPRESS</h2>
              <span className="text-[10px] text-primary-400 font-bold uppercase tracking-widest">Reporting System</span>
            </div>
          </div>

          <div className="max-w-md">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl lg:text-5xl font-bold text-white leading-[1.1] mb-6"
            >
              Enterprise Logistics & <br />
              <span className="text-primary-500">Reporting Platform.</span>
            </motion.h1>
            <p className="text-gray-400 text-lg mb-12">
              ยกระดับการจัดการขนส่งและรายงานค่าเสนอแนะอย่างมืออาชีพ ด้วยระบบที่ออกแบบมาเพื่อความเร็วและความแม่นยำ
            </p>

            <div className="space-y-8">
              <FeatureItem 
                icon={BarChart3} 
                title="Real-time Analytics" 
                description="ติดตามผลการดำเนินงานและค่าคอมมิชชั่นได้แบบเรียลไทม์ พร้อมสรุปข้อมูลรายวัน" 
              />
              <FeatureItem 
                icon={Database} 
                title="Centralized Database" 
                description="จัดการข้อมูลสาขาและลูกค้ากลุ่มใหญ่ได้อย่างเป็นระบบ ป้องกันข้อมูลซ้ำซ้อน" 
              />
              <FeatureItem 
                icon={ShieldCheck} 
                title="Enterprise Security" 
                description="กำหนดสิทธิ์การเข้าถึงข้อมูลตามบทบาทของผู้ใช้ (RBAC) เพื่อความปลอดภัยสูงสุด" 
              />
            </div>
          </div>
        </div>

        <div className="relative z-10 flex justify-between items-end border-t border-white/5 pt-8">
          <div className="text-gray-500 text-sm">
             © {new Date().getFullYear()} BS EXPRESS 2020 CO., LTD.
          </div>
          <div className="flex space-x-6 text-sm text-gray-500">
            <a href="#" className="hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </div>

      {/* Right Section - Login Form */}
      <div className="flex-1 flex flex-col justify-center p-6 sm:p-12 lg:p-20 bg-white dark:bg-gray-900">
        <div className="w-full max-w-[400px] mx-auto">
          {/* Mobile Logo */}
          <div className="md:hidden flex items-center space-x-2 mb-10">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" size={16} />
            </div>
            <span className="font-bold text-gray-900 dark:text-gray-100">BS EXPRESS</span>
          </div>

          <div className="mb-10">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Welcome Back</h2>
            <p className="text-gray-500">กรุณาเข้าสู่ระบบเพื่อจัดการรายงานและข้อมูลของคุณ</p>
          </div>

          <LoginForm onSuccess={() => {}} />

          <div className="mt-12 pt-8 border-t border-gray-100">
            <div className="flex flex-col space-y-4">
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-4">Official Information</p>
              </div>
              <div className="grid grid-cols-1 gap-2 text-center md:text-left">
                <p className="text-xs text-gray-600 dark:text-gray-400 font-bold">บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด</p>
                <p className="text-[10px] text-gray-400 leading-relaxed max-w-xs mx-auto md:mx-0">
                  133 หมู่ที่ 1 ถนนบรมราชชนนี ตำบลบางเตย อำเภอสามพราน จังหวัดนครปฐม 73210
                </p>
                <div className="flex flex-wrap justify-center md:justify-start gap-x-4 gap-y-1 pt-2">
                  <span className="text-[10px] text-gray-500 font-medium">โทร. 02-114-8855</span>
                  <span className="text-[10px] text-gray-500 font-medium">info@bsgroupth.com</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
