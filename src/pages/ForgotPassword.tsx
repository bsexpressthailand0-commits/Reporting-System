import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '../lib/AuthContext';

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await forgotPassword(email);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการส่งอีเมลรีเซ็ตรหัสผ่าน');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <Link 
          to="/login" 
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-800 dark:text-gray-200 transition-colors mb-8"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to Login
        </Link>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8 md:p-10">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Forgot Password?</h1>
            <p className="text-gray-500">ไม่ต้องกังวล เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่อีเมลของคุณ</p>
          </div>

          {success ? (
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-secondary-50 border border-secondary-100 rounded-xl p-6 text-center"
            >
              <div className="w-12 h-12 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={24} className="text-secondary-600" />
              </div>
              <h3 className="text-secondary-900 font-semibold mb-2">ส่งอีเมลเรียบร้อยแล้ว</h3>
              <p className="text-secondary-700 text-sm mb-6">
                กรุณาตรวจสอบกล่องจดหมายของคุณ (หากไม่พบ กรุณาตรวจสอบใน Junk/Spam)
              </p>
              <Link 
                to="/login" 
                className="block w-full bg-secondary-600 hover:bg-secondary-700 text-white font-medium py-2.5 rounded-lg transition-colors"
              >
                Back to Login
              </Link>
            </motion.div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-primary-50 border border-primary-100 rounded-lg p-3 flex items-start space-x-3 text-primary-600 text-sm">
                  <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -trangray-y-1/2 text-gray-400" size={18} />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                    placeholder="name@email.com"
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-primary-500/25 transition-all disabled:opacity-50"
              >
                {loading ? 'กำลังส่งอีเมล...' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
