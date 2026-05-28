import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileSpreadsheet, BadgeDollarSign, PieChart, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MobileNavProps {
  onOpenDrawer: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ onOpenDrawer }) => {
  const location = useLocation();

  const primaryItems = [
    { name: 'Home', path: '/', icon: LayoutDashboard },
    { name: 'Import', path: '/import', icon: FileSpreadsheet },
    { name: 'Commission', path: '/commission', icon: BadgeDollarSign },
    { name: 'Reports', path: '/report-center', icon: PieChart },
  ];

  return (
    <nav className="xl:hidden fixed bottom-6 left-1/2 -trangray-x-1/2 w-[90%] max-w-[400px] bg-gray-900/90 backdrop-blur-lg border border-gray-700/50 rounded-2xl shadow-2xl z-[45] px-2 py-2">
      <div className="flex items-center justify-around">
        {primaryItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => cn(
              "flex flex-col items-center gap-1 p-2 rounded-xl transition-all",
              isActive 
                ? "text-primary-400 scale-110" 
                : "text-gray-500 active:bg-gray-800"
            )}
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.name}</span>
          </NavLink>
        ))}
        
        <button 
          onClick={onOpenDrawer}
          className="flex flex-col items-center gap-1 p-2 text-gray-500 active:bg-gray-800 rounded-xl transition-all"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-bold uppercase tracking-tighter">More</span>
        </button>
      </div>
    </nav>
  );
};
