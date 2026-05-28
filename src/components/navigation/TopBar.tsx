import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home, Bell, Search, Command, Menu, Settings, LogOut, User, Sun, Moon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { NAVIGATION_CONFIG } from '../../lib/constants/navigation';
import { useAuth } from '../../lib/AuthContext';
import { useTheme } from '../../lib/ThemeContext';

interface TopBarProps {
  onOpenSidebar: () => void;
  onOpenCommandPalette: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenSidebar, onOpenCommandPalette }) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  // Simple breadcrumb generator
  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'Home', path: '/', icon: Home }];
    
    let currentPath = '';
    paths.forEach((path) => {
      currentPath += `/${path}`;
      
      // Find matching name from nav config or beautify the segment
      let name = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');
      
      NAVIGATION_CONFIG.forEach(group => {
        group.items.forEach(item => {
          if (item.path === currentPath) name = item.name;
          item.subItems?.forEach(sub => {
            if (sub.path === currentPath) name = sub.name;
          });
        });
      });

      breadcrumbs.push({ name, path: currentPath, icon: null });
    });

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="h-16 bg-white dark:bg-gray-900/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40 px-4 flex items-center justify-between transition-colors duration-200">
      <div className="flex items-center gap-4 min-w-0">
        <button 
          onClick={onOpenSidebar}
          className="xl:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Breadcrumbs */}
        <nav className="hidden md:flex items-center gap-1.5 text-[13px] font-medium text-gray-500 overflow-hidden">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.path}>
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 dark:text-gray-400 shrink-0" />}
              <Link 
                to={crumb.path}
                className={cn(
                  "flex items-center gap-1.5 hover:text-primary-600 dark:hover:text-primary-400 transition-colors whitespace-nowrap",
                  idx === breadcrumbs.length - 1 ? "text-gray-900 dark:text-gray-100 font-bold pointer-events-none" : ""
                )}
              >
                {crumb.icon && <crumb.icon className="w-3.5 h-3.5" />}
                {crumb.name}
              </Link>
            </React.Fragment>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Date Display */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 rounded-full border border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <div className="w-1.5 h-1.5 bg-secondary-500 rounded-full animate-pulse" />
          {new Date().toLocaleDateString('th-TH', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            weekday: 'short'
          })}
        </div>

        {/* Action Icons */}
        <div className="flex items-center gap-1 sm:gap-2">
          <button 
            onClick={onOpenCommandPalette}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
            title="Search (Ctrl+K)"
          >
            <Search className="w-5 h-5" />
          </button>
          
          <button 
            onClick={toggleTheme}
            className="p-2 text-gray-400 hover:text-secondary-500 dark:hover:text-secondary-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 transition-transform duration-500 rotate-0 scale-100" /> : <Moon className="w-5 h-5 transition-transform duration-500 rotate-0 scale-100" />}
          </button>
          
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary-500 border-2 border-white dark:border-gray-900 rounded-full"></span>
          </button>
        </div>

        <div className="h-6 w-[1px] bg-gray-200 dark:bg-gray-700 mx-1 hidden sm:block" />

        {/* User Mini Menu */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right">
             <span className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-none">
              {user?.displayName || user?.email?.split('@')[0]}
             </span>
             <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-1">Admin</span>
          </div>
          <button onClick={() => logout()} className="p-2 text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition-all" title="Sign Out">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};
