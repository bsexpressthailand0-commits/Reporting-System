import React from 'react';

interface ResponsiveTableProps {
  children: React.ReactNode;
  className?: string;
  tableClassName?: string;
}

export default function ResponsiveTable({ children, className = '', tableClassName = '' }: ResponsiveTableProps) {
  return (
    <div className={`w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900 ${className}`}>
      <table className={`w-full text-left text-sm border-collapse whitespace-nowrap md:whitespace-normal ${tableClassName}`}>
        {children}
      </table>
    </div>
  );
}
