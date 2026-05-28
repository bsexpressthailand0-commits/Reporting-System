import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronDown, Search, Command, History } from 'lucide-react';
import { cn } from '../../lib/utils';
import { NAVIGATION_CONFIG, NavItem, NavSubItem } from '../../lib/constants/navigation';
import { useAuth } from '../../lib/AuthContext';

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  onOpenCommandPalette: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, setIsCollapsed, onOpenCommandPalette }) => {
  const { user, profile, isAdmin } = useAuth();
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [recentlyUsed, setRecentlyUsed] = useState<{name: string, path: string}[]>([]);

  // Load recently used from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recently_used_menus');
    if (saved) setRecentlyUsed(JSON.parse(saved));
  }, []);

  // Update recently used when location changes
  useEffect(() => {
    const findItem = () => {
      for (const group of NAVIGATION_CONFIG) {
        for (const item of group.items) {
          if (item.path === location.pathname) return { name: item.name, path: item.path };
          const sub = item.subItems?.find(s => s.path === location.pathname);
          if (sub) return { name: sub.name, path: sub.path };
        }
      }
      return null;
    };

    const current = findItem();
    if (current && current.path !== '/') {
      setRecentlyUsed(prev => {
        const filtered = prev.filter(p => p.path !== current.path);
        const updated = [current, ...filtered].slice(0, 3);
        localStorage.setItem('recently_used_menus', JSON.stringify(updated));
        return updated;
      });
    }
  }, [location.pathname]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => 
      prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]
    );
  };

  const isActive = (path?: string) => {
    if (!path) return false;
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const filteredConfig = NAVIGATION_CONFIG.map(group => ({
    ...group,
    items: group.items.filter(item => !item.adminOnly || isAdmin)
  })).filter(group => group.items.length > 0);

  return (
      <aside 
        className={cn(
          "hidden xl:flex flex-col h-screen sticky top-0 bg-black text-gray-300 border-r border-gray-900 transition-all duration-300 ease-in-out z-50",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
      {/* Brand Header */}
      <div className="p-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-primary-900/50">
            BS
          </div>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col"
            >
              <span className="text-sm font-bold text-white tracking-tight leading-none">BS Express</span>
              <span className="text-[10px] text-gray-500 font-medium tracking-wider uppercase mt-1">Report System</span>
            </motion.div>
          )}
        </div>
        {!isCollapsed && (
          <button 
            onClick={() => setIsCollapsed(true)}
            className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
        )}
        {isCollapsed && (
          <button 
            onClick={() => setIsCollapsed(false)}
            className="absolute -right-3 top-12 w-6 h-6 bg-gray-800 border border-gray-700 rounded-full flex items-center justify-center text-gray-400 hover:text-white z-[60] shadow-xl"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Quick Search Trigger */}
      <div className="px-4 mb-4">
        <button 
          onClick={onOpenCommandPalette}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 bg-gray-800/50 hover:bg-gray-800 rounded-lg border border-gray-700/50 transition-all text-gray-400 hover:text-gray-300 group",
            isCollapsed ? "justify-center" : "justify-between"
          )}
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4" />
            {!isCollapsed && <span className="text-xs">Quick search...</span>}
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-0.5 opacity-50 group-hover:opacity-100 transition-opacity">
              <Command className="w-3 h-3" />
              <span className="text-[10px] font-bold">K</span>
            </div>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 space-y-6 pb-6 custom-scrollbar">
        {/* Recently Used */}
        {!isCollapsed && recentlyUsed.length > 0 && (
          <div>
            <h3 className="px-3 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Recently Used
            </h3>
            <div className="space-y-1">
              {recentlyUsed.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-[13px] font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
                >
                  <History className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <span className="truncate">{item.name}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {filteredConfig.map((group) => (
          <div key={group.group}>
            {!isCollapsed && (
              <h3 className="px-3 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {group.group}
              </h3>
            )}
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavItemComponent 
                  key={item.name} 
                  item={item} 
                  isCollapsed={isCollapsed} 
                  isActive={isActive(item.path)}
                  isGroupExpanded={expandedGroups.includes(item.name)}
                  onToggleExpand={() => toggleGroup(item.name)}
                  currentPath={location.pathname}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/50">
        <div className={cn(
          "flex items-center gap-3 px-2 py-1.5 rounded-xl transition-colors",
          isCollapsed ? "justify-center" : ""
        )}>
          <div className="w-9 h-9 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden">
            {(profile as any)?.avatarUrl ? (
              <img src={(profile as any).avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              (user?.email?.charAt(0) || user?.username?.charAt(0) || 'U').toUpperCase()
            )}
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-bold text-white truncate">
                {user?.displayName || user?.email?.split('@')[0]}
              </span>
              <span className="text-[10px] text-gray-500 font-medium truncate uppercase tracking-tighter">
                {profile?.role || 'Viewer'}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};

interface NavItemProps {
  item: NavItem;
  isCollapsed: boolean;
  isActive: boolean;
  isGroupExpanded: boolean;
  onToggleExpand: () => void;
  currentPath: string;
}

const NavItemComponent: React.FC<NavItemProps> = ({ 
  item, 
  isCollapsed, 
  isActive, 
  isGroupExpanded, 
  onToggleExpand,
  currentPath
}) => {
  const hasSubItems = item.subItems && item.subItems.length > 0;
  
  const content = (
    <div className={cn(
      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all relative group",
      isActive && !hasSubItems ? "bg-primary-600 text-white shadow-lg shadow-primary-500/20" : "text-gray-400 hover:text-white hover:bg-gray-800",
      isCollapsed ? "justify-center" : ""
    )}>
      <item.icon className={cn(
        "w-5 h-5 shrink-0 transition-colors",
        isActive && !hasSubItems ? "text-white" : "group-hover:text-primary-400"
      )} />
      {!isCollapsed && (
        <span className="flex-1 truncate">{item.name}</span>
      )}
      {!isCollapsed && hasSubItems && (
        <ChevronRight className={cn(
          "w-4 h-4 transition-transform duration-200",
          isGroupExpanded ? "rotate-90" : ""
        )} />
      )}
      
      {/* Tooltip for collapsed mode */}
      {isCollapsed && (
        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-[10px] rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-[100] border border-gray-700 pointer-events-none">
          {item.name}
        </div>
      )}
    </div>
  );

  if (hasSubItems && !isCollapsed) {
    return (
      <div>
        <button 
          onClick={onToggleExpand}
          className="w-full text-left bg-transparent border-none p-0"
        >
          {content}
        </button>
        <AnimatePresence initial={false}>
          {isGroupExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden bg-gray-800/20 rounded-lg mt-1"
            >
              <div className="py-1 pl-10 pr-2 space-y-1">
                {item.subItems?.map((sub) => (
                  <NavLink
                    key={sub.path}
                    to={sub.path}
                    className={({ isActive: isSubActive }) => cn(
                      "flex items-center py-1.5 px-3 rounded-md text-[13px] font-medium transition-colors",
                      isSubActive 
                        ? "text-primary-400 bg-primary-500/10" 
                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                    )}
                  >
                    {sub.name}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (item.path) {
    return (
      <NavLink to={item.path} end={item.path === '/'}>
        {content}
      </NavLink>
    );
  }

  return content;
};
