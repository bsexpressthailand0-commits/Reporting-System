import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface UserStatsCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

export const UserStatsCard: React.FC<UserStatsCardProps> = ({ title, value, icon: Icon, color }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 p-6 flex items-center space-x-4"
    >
      <div className={`p-3 rounded-full ${color} bg-opacity-10`}>
        <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      </div>
    </motion.div>
  );
};
