import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';
import { UserRole } from '../types';

export interface CustomUser {
  uid: string;
  username: string;
  name: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  active: boolean;
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
}

interface AuthContextType {
  user: CustomUser | null;
  profile: CustomUser | null;
  loading: boolean;
  login: (username: string, pass: string) => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>; // Alias for backwards compat
  forgotPassword: (email: string) => Promise<void>;
  logout: (confirm?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [profile, setProfile] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize and check for default admin user
  const initDefaultAdmin = async () => {
    try {
      const q = query(collection(db, 'users'), where('username', '==', 'admin'), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        await setDoc(doc(db, 'users', 'admin'), {
          username: 'admin',
          password: 'admin123',
          name: 'Bs Express',
          role: 'admin',
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        console.log('Default admin created inside AuthProvider initiation.');
      }
    } catch (e) {
      console.warn('Silent warning setting up default admin:', e);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      // 1. Setup default admin if needed
      await initDefaultAdmin();

      // 2. Load user session from localStorage
      const cached = localStorage.getItem('bs_express_auth_user');
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as CustomUser;
          setUser(parsed);
          setProfile(parsed);
        } catch (e) {
          localStorage.removeItem('bs_express_auth_user');
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, pass: string) => {
    if (!username || !pass) {
      throw new Error('กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน');
    }

    try {
      // Find user by username
      const q = query(collection(db, 'users'), where('username', '==', username), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) {
        throw new Error('ไม่พบชื่อผู้ใช้งานนี้ในระบบ');
      }

      const userDoc = snap.docs[0];
      const data = userDoc.data();

      // Check password
      if (data.password !== pass) {
        throw new Error('รหัสผ่านไม่ถูกต้อง');
      }

      // Check active status (supports active as boolean or status string)
      const isActive = data.active === true || data.status === 'active';
      if (!isActive) {
        throw new Error('บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
      }

      const now = new Date().toISOString();
      const sessionUser: CustomUser = {
        uid: userDoc.id,
        username: data.username,
        name: data.name || data.displayName || data.username,
        displayName: data.name || data.displayName || data.username,
        email: data.username, // Using username as email for compatibility
        role: data.role as UserRole,
        active: true,
        status: 'active',
        permissions: data.role === 'admin' ? ['all'] : data.permissions || [],
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        lastLoginAt: now
      };

      // Try to update lastLoginAt in Firestore
      try {
        await setDoc(doc(db, 'users', userDoc.id), { lastLoginAt: now }, { merge: true });
      } catch (err) {
        console.warn('Could not update lastLoginAt in Firestore:', err);
      }

      // Save to localStorage
      localStorage.setItem('bs_express_auth_user', JSON.stringify(sessionUser));
      setUser(sessionUser);
      setProfile(sessionUser);

    } catch (error: any) {
      throw new Error(error.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    // Alias to login using username (since we changed the email input to username input)
    return login(email, pass);
  };

  const forgotPassword = async (email: string) => {
    throw new Error('ระบบล็อกอินนี้ไม่ผ่านอีเมลภายนอก กรุณาติดต่อผู้ดูแลระบบของคุณเพื่อขอสิทธิ์การเปลี่ยนรหัสผ่าน');
  };

  const refreshUser = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const isActive = data.active === true || data.status === 'active';
        if (!isActive) {
          await logout(false);
          return;
        }

        const refreshed: CustomUser = {
          ...user,
          username: data.username,
          name: data.name || data.displayName || data.username,
          displayName: data.name || data.displayName || data.username,
          role: data.role as UserRole,
          status: isActive ? 'active' : 'disabled',
          active: isActive,
          permissions: data.role === 'admin' ? ['all'] : data.permissions || [],
          updatedAt: data.updatedAt || user.updatedAt,
          lastLoginAt: data.lastLoginAt || user.lastLoginAt
        };

        localStorage.setItem('bs_express_auth_user', JSON.stringify(refreshed));
        setUser(refreshed);
        setProfile(refreshed);
      }
    } catch (error) {
      console.warn('Failed to refresh user:', error);
    }
  };

  const logout = async (confirm: boolean = true) => {
    const doLogout = async () => {
      localStorage.removeItem('bs_express_auth_user');
      setUser(null);
      setProfile(null);
      sessionStorage.clear();
      window.location.replace('/login');
    };

    if (confirm) {
      const { default: Swal } = await import('sweetalert2');
      await Swal.fire({
        title: 'ออกจากระบบ',
        text: 'คุณต้องการออกจากระบบใช่หรือไม่?',
        icon: 'warning',
        iconColor: '#facc15',
        showCancelButton: true,
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก',
        customClass: {
          popup: 'rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900',
          title: 'text-xl font-bold text-gray-900 dark:text-white',
          htmlContainer: 'text-sm text-gray-600 dark:text-gray-400',
          actions: 'gap-3 w-full px-6 pb-6',
          confirmButton: 'rounded-xl px-5 py-2.5 font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-500/20 active:scale-95 transition-all outline-none',
          cancelButton: 'rounded-xl px-5 py-2.5 font-bold text-gray-700 dark:text-white bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 shadow-sm active:scale-95 transition-all outline-none',
        },
        buttonsStyling: false,
        preConfirm: async () => {
          await doLogout();
        }
      });
    } else {
      await doLogout();
    }
  };

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const isStaff = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'staff';

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      login,
      loginWithEmail, 
      forgotPassword, 
      logout, 
      refreshUser,
      isAdmin, 
      isManager, 
      isStaff 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
