import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { 
  Search, 
  FileSpreadsheet, 
  Settings, 
  LayoutDashboard, 
  FileBarChart, 
  History,
  BadgeDollarSign,
  PieChart,
  Globe,
  Plus,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NAVIGATION_CONFIG } from '../../lib/constants/navigation';

interface CommandPaletteProps {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, setIsOpen }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(!isOpen);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [isOpen, setIsOpen]);

  const runCommand = (command: () => void) => {
    setIsOpen(false);
    command();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="relative w-full max-w-[600px] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700"
          >
            <Command label="Global Command Palette" className="flex flex-col">
              <div className="flex items-center border-b border-gray-100 p-4 gap-3">
                <Search className="w-5 h-5 text-gray-400" />
                <Command.Input 
                  placeholder="Type a command or search..." 
                  className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 font-medium"
                  value={search}
                  onValueChange={setSearch}
                  autoFocus
                />
                <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded text-[10px] font-bold text-gray-500">
                  ESC
                </div>
              </div>

              <Command.List className="max-h-[350px] overflow-y-auto p-2 scroll-smooth custom-scrollbar">
                <Command.Empty className="p-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <Search className="w-8 h-8 text-gray-200" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium font-sans">No results found for "{search}"</p>
                </Command.Empty>

                <Command.Group heading="Navigation" className="p-2">
                  {NAVIGATION_CONFIG.flatMap(group => 
                    group.items.flatMap(item => {
                      const items: any[] = [];
                      if (item.path) {
                        items.push(
                          <CommandItem 
                            key={item.path} 
                            onSelect={() => runCommand(() => navigate(item.path!))}
                            icon={item.icon}
                            label={item.name}
                            shortcut={group.group}
                          />
                        );
                      }
                      item.subItems?.forEach(sub => {
                        items.push(
                          <CommandItem 
                            key={sub.path} 
                            onSelect={() => runCommand(() => navigate(sub.path))}
                            icon={item.icon}
                            label={sub.name}
                            shortcut={`${item.name}`}
                          />
                        );
                      });
                      return items;
                    })
                  )}
                </Command.Group>

                <Command.Group heading="Quick Actions" className="p-2 border-t border-gray-50 mt-2">
                  <CommandItem 
                    onSelect={() => runCommand(() => navigate('/import'))}
                    icon={Plus}
                    label="Import New Excel"
                    shortcut="Action"
                  />
                  <CommandItem 
                    onSelect={() => runCommand(() => navigate('/report-center'))}
                    icon={FileBarChart}
                    label="View Recent Reports"
                    shortcut="Action"
                  />
                  <CommandItem 
                    onSelect={() => runCommand(() => navigate('/settings'))}
                    icon={Settings}
                    label="System Settings"
                    shortcut="Admin"
                  />
                </Command.Group>
              </Command.List>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50/50 border-t border-gray-100 px-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">↑↓</kbd>
                    <span>Navigate</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-medium">
                    <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">⏎</kbd>
                    <span>Select</span>
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">
                  Global Search
                </div>
              </div>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const CommandItem = ({ onSelect, icon: Icon, label, shortcut }: any) => {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-default text-gray-700 dark:text-gray-300 aria-selected:bg-primary-50 aria-selected:text-primary-700 transition-colors group"
    >
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center group-aria-selected:bg-primary-100 group-aria-selected:text-primary-600 shrink-0 transition-colors">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 font-medium text-sm">
        {label}
      </div>
      {shortcut && (
        <span className="text-[10px] font-bold text-gray-400 group-aria-selected:text-primary-300 uppercase tracking-wider">
          {shortcut}
        </span>
      )}
      <ArrowRight className="w-3.5 h-3.5 opacity-0 group-aria-selected:opacity-100 transition-opacity trangray-x-[-4px] group-aria-selected:trangray-x-0" />
    </Command.Item>
  );
};
