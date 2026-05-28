import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  ShieldCheck, 
  UserCheck, 
  UserMinus,
  RefreshCw,
} from 'lucide-react';
import { motion } from 'motion/react';
import { 
  collection, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  setDoc,
  addDoc,
  where,
  getDocs
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { UserRole, AuditLog } from '../types';
import { UserStatsCard } from '../components/user/UserStatsCard';
import { UserTable } from '../components/user/UserTable';
import { UserModal } from '../components/user/UserModal';

export default function UserManagement() {
  const { profile, isAdmin, isManager } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search state & Debouncing
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  
  // Filters
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'disabled' | 'all'>('all');
  
  // Sorting
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Debouncing Search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchUsers = async () => {
    if (!isManager) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const usersData: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        usersData.push({
          uid: doc.id,
          username: data.username || '',
          password: data.password || '',
          name: data.name || '',
          displayName: data.name || data.displayName || data.username || '',
          email: data.username || '',
          role: data.role || 'viewer',
          status: data.active === true || data.status === 'active' ? 'active' : 'disabled',
          active: data.active ?? true,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          lastLoginAt: data.lastLoginAt || null,
        });
      });
      setUsers(usersData);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [isManager]);

  // Apply Sorting
  const sortedUsers = useMemo(() => {
    const sorted = [...users];
    sorted.sort((a, b) => {
      let valA = a[sortBy] ?? '';
      let valB = b[sortBy] ?? '';
      
      if (typeof valA === 'string') valA = valA.trim().toLowerCase();
      if (typeof valB === 'string') valB = valB.trim().toLowerCase();
      
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [users, sortBy, sortOrder]);

  // Apply Filtering
  const filteredUsers = useMemo(() => {
    return sortedUsers.filter(user => {
      const name = user.displayName || user.name || '';
      const email = user.email || user.username || '';
      const matchesSearch = name.toLowerCase().includes(search.toLowerCase()) || 
                           email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
      
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [sortedUsers, search, roleFilter, statusFilter]);

  // Sliced Paginated items
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredUsers.length / pageSize) || 1;
  }, [filteredUsers, pageSize]);

  const stats = useMemo(() => {
    return {
      total: users.length,
      active: users.filter(u => u.status === 'active' || u.active === true).length,
      disabled: users.filter(u => u.status === 'disabled' || u.active === false).length,
      admins: users.filter(u => u.role === 'admin').length,
    };
  }, [users]);

  const recordAuditLog = async (log: Omit<AuditLog, 'id' | 'createdAt'>) => {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        ...log,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to record audit log', err);
    }
  };

  const handleSaveUser = async (userData: any) => {
    if (!profile) return;
    setModalLoading(true);
    
    try {
      const now = new Date().toISOString();
      
      if (selectedUser) {
        // Edit existing user in Firestore
        const userRef = doc(db, 'users', selectedUser.uid);
        const updates = {
          name: userData.displayName,
          role: userData.role,
          active: userData.status === 'active',
          password: userData.password,
          updatedAt: now,
        };
        
        await updateDoc(userRef, updates);
        
        // Refresh local state
        setUsers(prev => prev.map(u => u.uid === selectedUser.uid ? { 
          ...u, 
          name: userData.displayName,
          displayName: userData.displayName,
          role: userData.role,
          status: userData.status,
          active: userData.status === 'active',
          password: userData.password,
          updatedAt: now 
        } : u));
        
        // Audit log in App db
        await recordAuditLog({
          action: 'update_user',
          targetUserId: selectedUser.uid,
          performedBy: profile.uid,
          performedByEmail: profile.email || profile.username || 'unknown',
          changes: updates,
        });

        toast.success('แก้ไขข้อมูลผู้ใช้งานเรียบร้อยแล้ว');
      } else {
        // Create new user directly in Firestore
        // Check if username already exists
        const qCheck = query(collection(db, 'users'), where('username', '==', userData.username));
        const checkSnap = await getDocs(qCheck);
        if (!checkSnap.empty) {
          throw new Error('ชื่อผู้ใช้งานนี้ถูกใช้โดยผู้อื่นแล้ว กรุณาระบุชื่อผู้ใช้งานอื่น');
        }

        const newUserRef = doc(collection(db, 'users'));
        const newUid = newUserRef.id;
        
        const profileData = {
          username: userData.username,
          password: userData.password,
          name: userData.displayName,
          role: userData.role,
          active: userData.status === 'active',
          createdAt: now,
          updatedAt: now,
          lastLoginAt: null
        };

        await setDoc(newUserRef, profileData);

        const newLocalUser: any = {
          uid: newUid,
          username: userData.username,
          password: userData.password,
          name: userData.displayName,
          displayName: userData.displayName,
          email: userData.username,
          role: userData.role,
          status: userData.status,
          active: userData.status === 'active',
          permissions: userData.role === 'admin' ? ['all'] : userData.permissions || [],
          createdAt: now,
          updatedAt: now,
          lastLoginAt: null,
        };

        setUsers(prev => [newLocalUser, ...prev]);

        // Audit Log
        await recordAuditLog({
          action: 'create_user',
          targetUserId: newUid,
          performedBy: profile.uid,
          performedByEmail: profile.email || profile.username || 'unknown',
          changes: profileData,
        });

        toast.success(`สร้างบัญชีสำหรับ ${userData.displayName} สำเร็จเรียบร้อย`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'ไม่สามารถทำการเพิ่ม/แก้ไขผู้ใช้งานได้');
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleStatus = async (user: any) => {
    if (!profile || !isAdmin) return;
    if (user.uid === profile.uid) return; // Can't disable yourself

    const isDisabling = user.status === 'active';
    const confirmResult = await Swal.fire({
      title: isDisabling ? 'ระงับบัญชีผู้ใช้?' : 'เปิดใช้งานบัญชีผู้ใช้?',
      text: `คุณต้องการ ${isDisabling ? 'ระงับ' : 'เปิด'} บัญชีผู้ใช้นี้: ${user.displayName || user.username}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: isDisabling ? '#ef4444' : '#10b981',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: isDisabling ? 'ใช่, ระงับบัญชี' : 'ใช่, เปิดใช้งาน',
      cancelButtonText: 'ยกเลิก',
    });

    if (!confirmResult.isConfirmed) return;

    try {
      const newStatus = isDisabling ? 'disabled' : 'active';
      const userRef = doc(db, 'users', user.uid);
      const now = new Date().toISOString();
      
      await updateDoc(userRef, {
        active: !isDisabling,
        updatedAt: now,
      });

      // Refresh local state
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, status: newStatus, active: !isDisabling, updatedAt: now } : u));

      await recordAuditLog({
        action: newStatus === 'active' ? 'enable_user' : 'disable_user',
        targetUserId: user.uid,
        performedBy: profile.uid,
        performedByEmail: profile.email || profile.username || 'unknown',
        changes: { active: !isDisabling },
      });

      toast.success('ปรับสถานะผู้ใช้งานสำเร็จเรียบร้อยแล้ว');
    } catch (err: any) {
      console.error('Failed to toggle status', err);
      toast.error(err.message || 'ไม่สามารถปรับปรุงสถานะผู้ใช้นี้ได้');
    }
  };

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <ShieldCheck size={64} className="text-primary-100 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-md italic">
          คุณไม่มีสิทธิ์เข้าถึงหน้านี้ เฉพาะผู้ดูแลระบบ (Admin/Manager) เท่านั้นที่สามารถจัดการผู้ใช้งานได้
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 md:p-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-200 tracking-tight">User Management</h1>
          <p className="text-gray-500 mt-1">จัดการผู้ใช้งาน กำหนดบทบาท และสิทธิ์ในระบบ</p>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => {
              setRefreshing(true);
              fetchUsers();
            }}
            disabled={loading || refreshing}
            className="p-2.5 text-gray-500 hover:text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:bg-gray-800/50 transition-all disabled:opacity-50"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => {
              setSelectedUser(null);
              setIsModalOpen(true);
            }}
            className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl shadow-sm transition-all font-medium text-sm"
          >
            <UserPlus size={18} />
            <span>เพิ่มผู้ใช้งาน</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UserStatsCard title="ผู้ใช้ทั้งหมด" value={stats.total} icon={Users} color="bg-primary-600" />
        <UserStatsCard title="ใช้งานอยู่" value={stats.active} icon={UserCheck} color="bg-secondary-600" />
        <UserStatsCard title="ปิดใช้งาน" value={stats.disabled} icon={UserMinus} color="bg-primary-500" />
        <UserStatsCard title="ผู้ดูแลระบบ" value={stats.admins} icon={ShieldCheck} color="bg-primary-600" />
      </div>

      {/* Filters & Sorting */}
      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="ค้นหาชื่อหรือชื่อผู้ใช้งาน..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm appearance-none bg-white dark:bg-gray-900 cursor-pointer min-w-[140px]"
              >
                <option value="all">ทุกบทบาท</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="staff">Staff</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm appearance-none bg-white dark:bg-gray-900 cursor-pointer min-w-[120px]"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            {/* Dynamic Sorting Selection Dropdown */}
            <div className="relative">
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-');
                  setSortBy(field);
                  setSortOrder(order as 'asc' | 'desc');
                }}
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-primary-500 outline-none text-sm appearance-none bg-white dark:bg-gray-900 cursor-pointer min-w-[200px]"
              >
                <option value="createdAt-desc">{"ลงทะเบียน: ใหม่สุด -> เก่าสุด"}</option>
                <option value="createdAt-asc">{"ลงทะเบียน: เก่าสุด -> ใหม่สุด"}</option>
                <option value="displayName-asc">ชื่อผู้ใช้งาน: ก-ฮ (A-Z)</option>
                <option value="displayName-desc">ชื่อผู้ใช้งาน: ฮ-ก (Z-A)</option>
                <option value="lastLoginAt-desc">เข้าสู่ระบบ: ล่าสุด</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <UserTable
          users={paginatedUsers}
          loading={loading}
          currentUserId={profile?.uid || ''}
          isAdmin={isAdmin}
          onEdit={(user) => {
            setSelectedUser(user);
            setIsModalOpen(true);
          }}
          onToggleStatus={handleToggleStatus}
        />
      </motion.div>

      {/* Pagination Footer */}
      {!loading && filteredUsers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-gray-900 px-6 py-4 rounded-xl border border-gray-100 shadow-sm mt-4">
          <div className="text-sm text-gray-500">
            แสดง <span className="font-semibold">{(currentPage - 1) * pageSize + 1}</span> ถึง{' '}
            <span className="font-semibold">{Math.min(currentPage * pageSize, filteredUsers.length)}</span> จากทั้งหมด{' '}
            <span className="font-semibold">{filteredUsers.length}</span> ผู้ใช้งาน
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-800/50 disabled:opacity-50 transition"
            >
              ก่อนหน้า
            </button>
            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              หน้า {currentPage} จาก {totalPages}
            </div>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-800/50 disabled:opacity-50 transition"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <UserModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        user={selectedUser}
        loading={modalLoading}
        onSave={handleSaveUser}
      />
    </div>
  );
}

