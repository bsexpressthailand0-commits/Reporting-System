import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { Sidebar } from './navigation/Sidebar';
import { TopBar } from './navigation/TopBar';
import { CommandPalette } from './navigation/CommandPalette';
import { MobileNav } from './navigation/MobileNav';
import { motion, AnimatePresence } from 'motion/react';
import { X, LayoutDashboard, FileSpreadsheet, BadgeDollarSign, PieChart, History, Globe, Settings, Building2, Server, ShieldCheck, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { NAVIGATION_CONFIG } from '../lib/constants/navigation';
import { NavLink } from 'react-router-dom';

export default function Layout() {
  const { user, profile, isAdmin, logout } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-800/50 font-sans selection:bg-primary-100 selection:text-primary-700">
      
      {/* Search / Command Palette */}
      <CommandPalette 
        isOpen={commandPaletteOpen} 
        setIsOpen={setCommandPaletteOpen} 
      />

      {/* Main Sidebar (Desktop) */}
      <Sidebar 
        isCollapsed={sidebarCollapsed} 
        setIsCollapsed={setSidebarCollapsed}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[60] xl:hidden"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-[280px] bg-gray-900 text-gray-300 z-[70] xl:hidden flex flex-col p-6 overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold">BS</div>
                  <span className="text-xl font-bold text-white tracking-tight">BS Express</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="p-2 text-gray-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-8 flex-1">
                {NAVIGATION_CONFIG.map(group => (
                  <div key={group.group}>
                    <h3 className="px-3 mb-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">{group.group}</h3>
                    <div className="space-y-1">
                      {group.items.filter(item => !item.adminOnly || isAdmin).map(item => (
                        <div key={item.name}>
                          {item.path ? (
                            <NavLink
                              to={item.path}
                              end={item.path === '/'}
                              className={({ isActive }) => cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                                isActive ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "text-gray-400"
                              )}
                            >
                              <item.icon className="w-5 h-5" />
                              {item.name}
                            </NavLink>
                          ) : (
                            <div className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-gray-300">
                              <item.icon className="w-5 h-5 opacity-50" />
                              {item.name}
                            </div>
                          )}
                          {item.subItems && (
                            <div className="pl-10 space-y-1 mt-1">
                              {item.subItems.map(sub => (
                                <NavLink
                                  key={sub.path}
                                  to={sub.path}
                                  className={({ isActive }) => cn(
                                    "block py-2 text-sm transition-colors",
                                    isActive ? "text-primary-400 font-bold" : "text-gray-500 hover:text-gray-300"
                                  )}
                                >
                                  {sub.name}
                                </NavLink>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Mobile Drawer Logout */}
              <div className="mt-8 pt-4 border-t border-gray-800">
                <button 
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-800/50 hover:bg-primary-500/10 text-gray-400 hover:text-primary-500 transition-colors font-medium text-sm"
                >
                  <LogOut className="w-5 h-5" />
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <TopBar 
          onOpenSidebar={() => setMobileMenuOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />

        {/* Content Wrapper */}
        <main className="flex-1 flex flex-col pt-0 pb-32 xl:pb-6 overflow-x-hidden">
          <div className="w-full px-4 md:px-6 xl:px-10 py-6">
            <Outlet />
          </div>
        </main>

        {/* Mobile Bottom Nav */}
        <MobileNav onOpenDrawer={() => setMobileMenuOpen(true)} />

        {/* Status Footer (Desktop) */}
        <footer className="hidden xl:flex h-12 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 items-center justify-between text-[11px] text-gray-500 shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-bold text-gray-900 dark:text-gray-100">BS EXPRESS REPORT SYSTEM</span>
            <span className="text-gray-300">|</span>
            <span>© 2026 BS Express Thailand. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-secondary-500 rounded-full animate-pulse" />
              <span className="font-medium">Direct Cloud Connection</span>
            </div>
            <div className="flex items-center gap-4 border-l border-gray-100 pl-4 ml-2">
               <div className="px-2 py-1 bg-gray-100 rounded text-[9px] font-bold text-gray-400 uppercase tracking-tighter">v2.4.0 Stable</div>
               <div className="flex items-center gap-1.5 text-gray-400 hover:text-primary-600 transition-colors cursor-help">
                 <Server className="w-3.5 h-3.5" />
                 <span>Nodes: 3</span>
               </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

