import React from 'react';
import { Shield, Check, X } from 'lucide-react';
import { UserRole } from '../../types';

interface PermissionMatrixProps {
  role: UserRole;
  permissions: string[];
  onChange: (permissions: string[]) => void;
  disabled?: boolean;
}

const ALL_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard', description: 'ดูภาพรวมระบบ' },
  { id: 'import', label: 'Import Excel', description: 'นำเข้าข้อมูลจาก Excel' },
  { id: 'reports', label: 'Report Center', description: 'ดูและส่งออกรายงาน' },
  { id: 'commissions', label: 'Commission', description: 'จัดการค่าคอมมิชชั่น' },
  { id: 'mapping', label: 'Branch Mapping', description: 'จัดการแผนที่สาขา' },
  { id: 'settings', label: 'Master Settings', description: 'ตั้งค่าระบบพื้นฐาน' },
  { id: 'health', label: 'Database Health', description: 'ตรวจสอบสุขภาพฐานข้อมูล' },
  { id: 'users', label: 'User Management', description: 'จัดการผู้ใช้และสิทธิ์' },
];

export const PermissionMatrix: React.FC<PermissionMatrixProps> = ({ role, permissions, onChange, disabled }) => {
  const togglePermission = (id: string) => {
    if (disabled || role === 'admin') return;
    
    if (permissions.includes(id)) {
      onChange(permissions.filter(p => p !== id));
    } else {
      onChange([...permissions, id]);
    }
  };

  const isChecked = (id: string) => {
    if (role === 'admin') return true;
    return permissions.includes(id);
  };

  return (
    <div className="mt-6">
      <div className="flex items-center space-x-2 mb-4 text-gray-700 dark:text-gray-300">
        <Shield size={20} className="text-primary-600" />
        <h3 className="text-lg font-semibold">Permission Matrix</h3>
      </div>
      
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-primary-900 dark:bg-black border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">ฟีเจอร์</th>
              <th className="px-6 py-3 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">คำอธิบาย</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">สิทธิ์เข้าถึง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {ALL_PERMISSIONS.map((perm) => (
              <tr 
                key={perm.id} 
                className={`transition-colors ${disabled || role === 'admin' ? '' : 'hover:bg-primary-900 dark:bg-black cursor-pointer'}`}
                onClick={() => togglePermission(perm.id)}
              >
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{perm.label}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-500">{perm.description}</div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex justify-center">
                    <div 
                      className={`w-6 h-6 rounded border flex items-center justify-center transition-all ${
                        isChecked(perm.id)
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'bg-white dark:bg-gray-900 border-gray-300'
                      }`}
                    >
                      {isChecked(perm.id) ? <Check size={14} /> : null}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {role === 'admin' && (
        <p className="mt-3 text-sm text-amber-600 flex items-center italic">
          <Shield size={14} className="mr-1" />
          ผู้ใช้ที่มีบทบาท Admin จะได้รับสิทธิ์ทั้งหมดโดยอัตโนมัติ
        </p>
      )}
    </div>
  );
};
