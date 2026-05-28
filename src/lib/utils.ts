import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num || 0);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0) + ' บาท';
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function calculateReportSummary(data: any[]) {
  const sumOrder = data.reduce((sum, item) => sum + (item.totalOrder || 0), 0);
  const sumPrepaid = data.reduce((sum, item) => sum + (item.prepaidTotal || 0), 0);
  const sumPostpaid = data.reduce((sum, item) => sum + (item.postpaidTotal || 0), 0);
  const sumCod = data.reduce((sum, item) => sum + (item.totalCod || 0), 0);
  const sumQty = data.reduce((sum, item) => sum + (item.totalQuantity || 0), 0);
  const sumBills = data.reduce((sum, item) => sum + (item.totalBills || 0), 0);
  const sumTracking = data.reduce((sum, item) => sum + (item.totalTracking || 0), 0);

  const avgOrderPerBill = sumBills > 0 ? sumOrder / sumBills : 0;
  const avgCodPerBill = sumBills > 0 ? sumCod / sumBills : 0;
  const avgQtyPerBill = sumBills > 0 ? sumQty / sumBills : 0;
  const avgPrepaidPerBill = sumBills > 0 ? sumPrepaid / sumBills : 0;
  const avgPostpaidPerBill = sumBills > 0 ? sumPostpaid / sumBills : 0;

  return {
    sumOrder,
    sumPrepaid,
    sumPostpaid,
    sumCod,
    sumQty,
    sumBills,
    sumTracking,
    avgOrderPerBill,
    avgCodPerBill,
    avgQtyPerBill,
    avgPrepaidPerBill,
    avgPostpaidPerBill
  };
}
