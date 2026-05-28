import { 
  LayoutDashboard, 
  FileSpreadsheet, 
  FileBarChart, 
  Database, 
  FileClock, 
  Users, 
  Server, 
  Settings, 
  BadgeDollarSign, 
  FileSignature, 
  FileQuestion, 
  BarChart3,
  Globe,
  ArrowUpDown,
  History,
  ShieldCheck,
  Building2,
  PieChart
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export interface NavSubItem {
  name: string;
  path: string;
  adminOnly?: boolean;
}

export interface NavItem {
  name: string;
  path?: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  subItems?: NavSubItem[];
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAVIGATION_CONFIG: NavGroup[] = [
  {
    group: 'Overview',
    items: [
      { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    ],
  },
  {
    group: 'Operations',
    items: [
      { name: 'Import Excel', path: '/import', icon: FileSpreadsheet },
      { name: 'Import History', path: '/history', icon: History },
    ],
  },
  {
    group: 'Commissions',
    items: [
      { 
        name: 'Commission Management', 
        icon: BadgeDollarSign,
        subItems: [
          { name: 'Dashboard', path: '/commission' },
          { name: 'Summary', path: '/commission-summary' },
          { name: 'Unmapped', path: '/unmapped-commission' },
          { name: 'Mapping Config', path: '/commission-mapping' },
        ]
      },
    ],
  },
  {
    group: 'Reports',
    items: [
      { name: 'Report Center', path: '/report-center', icon: PieChart },
      { name: 'เปรียบเทียบยอด', path: '/performance-compare', icon: BarChart3 },
    ],
  },
  {
    group: 'Master Data',
    items: [
      { name: 'Branch Mapping', path: '/branch-mapping', icon: Globe },
      { name: 'Master Settings', path: '/master-settings', icon: Settings },
    ],
  },
  {
    group: 'Administration',
    items: [
      { name: 'Company Settings', path: '/settings', icon: Building2, adminOnly: true },
      { name: 'Database Health', path: '/database-health', icon: Server, adminOnly: true },
      { name: 'User Management', path: '/users', icon: ShieldCheck, adminOnly: true },
    ],
  },
];
