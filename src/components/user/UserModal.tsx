import React, { useState, useEffect } from 'react';
import ResponsiveModal from '../ResponsiveModal';
import { UserRole } from '../../types';
import { PermissionMatrix } from './PermissionMatrix';
import { User, Shield, Lock, AlertCircle } from 'lucide-react';

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: any) => Promise<void>;
  user?: any | null;
  loading: boolean;
}

export const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose, onSave, user, loading }) => {
  const [formData, setFormData] = useState<any>({
    displayName: '',
    username: '',
    role: 'viewer',
    status: 'active',
    permissions: [],
    password: '',
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        displayName: user.name || user.displayName || '',
        username: user.username || '',
        role: user.role || 'viewer',
        status: user.status || 'active',
        permissions: user.permissions || [],
        password: user.password || '',
      });
    } else {
      setFormData({
        displayName: '',
        username: '',
        role: 'viewer',
        status: 'active',
        permissions: [],
        password: '',
      });
    }
    setError(null);
  }, [user, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!formData.displayName || !formData.username || !formData.role) {
      setError('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    if (!formData.password) {
      setError('กรุณากำหนดรหัสผ่าน');
      return;
    }

    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    }
  };

  const footer = (
    <div className="flex justify-end space-x-3">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
      >
        ยกเลิก
      </button>
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
      >
        {loading ? 'กำลังบันทึก...' : user ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน'}
      </button>
    </div>
  );

  return (
    <ResponsiveModal
      isOpen={isOpen}
      onClose={onClose}
      title={user ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งานใหม่'}
      footer={footer}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-primary-50 border border-primary-200 flex items-center text-primary-700 text-sm">
            <AlertCircle size={18} className="mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <User size={16} className="mr-2 text-gray-400" />
              Display Name (ชื่อแสดงผล)
            </label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
              placeholder="เช่น นายสมชาย ใจดี"
            />
          </div>

          {/* Username */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <User size={16} className="mr-2 text-gray-400" />
              Username (ชื่อผู้ใช้งาน)
            </label>
            <input
              type="text"
              value={formData.username}
              disabled={!!user}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className={`w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none ${user ? 'bg-gray-50 dark:bg-gray-800/50' : ''}`}
              placeholder="ชื่อสำหรับล็อกอิน เช่น somchai"
            />
          </div>

          {/* Role */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <Shield size={16} className="mr-2 text-gray-400" />
              Role
            </label>
            <select
              value={formData.role}
              onChange={(e) => {
                const newRole = e.target.value as UserRole;
                setFormData({ 
                  ...formData, 
                  role: newRole,
                  permissions: newRole === 'admin' ? ['all'] : formData.permissions
                });
              }}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none bg-white dark:bg-gray-900"
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <AlertCircle size={16} className="mr-2 text-gray-400" />
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'disabled' })}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none bg-white dark:bg-gray-900"
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          {/* Password (always viewable/editable for admins in this plain text custom setup) */}
          <div className="space-y-1 md:col-span-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <Lock size={16} className="mr-2 text-gray-400" />
              Password (รหัสผ่าน)
            </label>
            <input
              type="text"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
              placeholder="กำหนดรหัสผ่าน"
            />
            <p className="text-xs text-gray-400 mt-1">
              {user ? 'สามารถระบุรหัสผ่านเพื่อเปลี่ยนแปลงรหัสผ่านเดิมของผู้ใช้นี้ได้ทันที' : 'กำหนดรหัสผ่านตั้งต้นเพื่อเปิดใช้เข้าสู่ระบบ'}
            </p>
          </div>
        </div>

        <PermissionMatrix
          role={formData.role as UserRole}
          permissions={formData.permissions || []}
          onChange={(permissions) => setFormData({ ...formData, permissions })}
        />
        
        <div className="p-4 bg-secondary-50 rounded-lg border border-secondary-100 mt-4">
           <p className="text-xs text-secondary-800 leading-relaxed animate-pulse">
            <span className="font-bold">✨ ระบบจัดเก็บเข้าฐานข้อมูลโดยตรง:</span> ข้อมูลจะถูกบันทึกและพร้อมเข้าใช้งานทันทีผ่านชื่อผู้ใช้งาน (Username) และ รหัสผ่าน (Password) ข้างต้น โดยไม่ต้องพึ่งระบบเช็คสิทธิ์ภายนอก
           </p>
        </div>
      </form>
    </ResponsiveModal>
  );
};
