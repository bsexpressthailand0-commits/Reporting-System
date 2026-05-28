import React from 'react';
import { UserAccount, UserRole } from '../../types';
import { Edit2, Ban, CheckCircle2, User as UserIcon, Key, MoreHorizontal } from 'lucide-react';
import ResponsiveTable from '../ResponsiveTable';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface UserTableProps {
  users: any[];
  loading: boolean;
  onEdit: (user: any) => void;
  onToggleStatus: (user: any) => void;
  onResetPassword?: (user: any) => void;
  currentUserId: string;
  isAdmin?: boolean;
}

const roleColors: Record<UserRole, string> = {
  admin: 'bg-primary-100 text-primary-700',
  manager: 'bg-primary-100 text-primary-700',
  staff: 'bg-primary-100 text-primary-700',
  viewer: 'bg-gray-100 text-gray-700 dark:text-gray-300',
};

export const UserTable: React.FC<UserTableProps> = ({ users, loading, onEdit, onToggleStatus, onResetPassword, currentUserId, isAdmin }) => {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="animate-pulse space-y-4 p-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex space-x-4">
              <div className="rounded-full bg-gray-200 h-10 w-10"></div>
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 shadow-sm p-12 text-center">
        <UserIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">ไม่พบข้อมูลผู้ใช้งาน</h3>
        <p className="text-gray-500 mt-2">กรุณาปรับแต่งการค้นหาหรือเพิ่มผู้ใช้งานใหม่</p>
      </div>
    );
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: th });
    } catch (e) {
      return '-';
    }
  };

  return (
    <ResponsiveTable>
      <thead className="bg-primary-900 dark:bg-black border-b border-gray-200 dark:border-gray-700">
        <tr>
          <th className="px-6 py-4 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">ผู้ใช้งาน</th>
          {isAdmin && (
            <>
              <th className="px-6 py-4 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">Username</th>
              <th className="px-6 py-4 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">Password</th>
            </>
          )}
          <th className="px-6 py-4 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">บทบาท</th>
          <th className="px-6 py-4 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">สถานะ</th>
          <th className="px-6 py-4 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">วันที่สร้าง</th>
          <th className="px-6 py-4 text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">ล่าสุด</th>
          <th className="px-6 py-4 text-right text-xs font-semibold text-white dark:text-gray-100 uppercase tracking-wider">จัดการ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
        {users.map((user) => (
          <tr key={user.uid} className="hover:bg-primary-900 dark:bg-black transition-colors">
            <td className="px-6 py-4">
              <div className="flex items-center">
                <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                  <UserIcon size={18} />
                </div>
                <div className="ml-4">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.displayName || user.name || 'ไม่มีชื่อ'}</div>
                  <div className="text-sm text-gray-500">{user.email || user.username}</div>
                </div>
              </div>
            </td>
            {isAdmin && (
              <>
                <td className="px-6 py-4 text-sm font-mono text-gray-700 dark:text-gray-300">
                  {user.username || '-'}
                </td>
                <td className="px-6 py-4 text-sm font-mono text-gray-700 dark:text-gray-300">
                  {user.password || '-'}
                </td>
              </>
            )}
            <td className="px-6 py-4">
              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${roleColors[user.role as UserRole]}`}>
                {user.role}
              </span>
            </td>
            <td className="px-6 py-4">
              <span className={`flex items-center text-sm ${user.status === 'active' ? 'text-secondary-600' : 'text-primary-500'}`}>
                {user.status === 'active' ? (
                  <>
                     <CheckCircle2 size={16} className="mr-1" />
                    Active
                  </>
                ) : (
                  <>
                    <Ban size={16} className="mr-1" />
                    Disabled
                  </>
                )}
              </span>
            </td>
            <td className="px-6 py-4 text-sm text-gray-500">
              {formatDate(user.createdAt)}
            </td>
            <td className="px-6 py-4 text-sm text-gray-500">
              {formatDate(user.lastLoginAt)}
            </td>
            <td className="px-6 py-4 text-right text-sm font-medium">
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => onEdit(user)}
                  className="text-gray-600 dark:text-gray-400 hover:text-primary-600 transition-colors p-1"
                  title="แก้ไข"
                >
                  <Edit2 size={18} />
                </button>
                <button
                  onClick={() => onToggleStatus(user)}
                  disabled={user.uid === currentUserId}
                  className={`transition-colors p-1 ${
                    user.uid === currentUserId 
                      ? 'text-gray-300 cursor-not-allowed' 
                      : user.status === 'active' 
                        ? 'text-primary-400 hover:text-primary-600' 
                        : 'text-secondary-500 hover:text-secondary-700'
                  }`}
                  title={user.status === 'active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                >
                  {user.status === 'active' ? <Ban size={18} /> : <CheckCircle2 size={18} />}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </ResponsiveTable>
  );
};
