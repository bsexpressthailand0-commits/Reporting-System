import * as XLSX from 'xlsx';
import { parseThaiDate, formatDateKey } from './thaiDateHelper';

export function parseExcelDate(excelDate: any): { date: string | null, raw: string, key: string } {
  const raw = String(excelDate || '');
  if (!excelDate) return { date: null, raw, key: '' };
  
  if (typeof excelDate === 'number') {
    // Excel date to JS date
    const date = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
    return { date: date.toISOString(), raw, key: formatDateKey(date) };
  }
  
  const parsedMap = parseThaiDate(raw);
  if (parsedMap) {
     return { date: parsedMap.toISOString(), raw, key: formatDateKey(parsedMap) };
  }

  return { date: null, raw, key: '' };
}

export function parseNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
     const parsed = parseFloat(val.replace(/,/g, ''));
     return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

const COLUMN_MAP: Record<string, string> = {
  'Tracking': 'trackingNo',
  'ผู้ให้บริการส่ง': 'carrier',
  'เลขออเดอร์': 'orderNo',
  'ชนิดบริการ': 'serviceType',
  'วันที่ออเดอร์': 'orderDate',
  'วันที่ตัดรอบ': 'cutoffDate',
  'กลุ่มสาขา': 'branchGroup',
  'ที่เก็บปัจจุบัน': 'currentLocation',
  'ประเภท': 'type',
  'Sales': 'sales',
  'สาขา': 'branchName',
  'ผู้ส่ง': 'senderName',
  'เงื่อนไขชำระ': 'paymentCondition',
  'วิธีชำระ': 'paymentMethod',
  'COD': 'codAmount',
  'COD (รับจริง)': 'codReceived',
  'ยอดออเดอร์': 'orderTotal',
  'ยอดใบคุม': 'controlTotal',
  'ยอดปลายทาง': 'destinationTotal',
  'กำไรสุทธิ': 'netProfit',
  'ส่วนลด': 'discountAmount',
  'Loc ปัจจุบัน': 'currentLoc',
  'ผู้รับ': 'receiverName',
  'เบอร์ผู้ส่ง': 'senderPhone',
  'เบอร์ผู้รับ': 'receiverPhone',
  'ที่อยู่ผู้รับ': 'receiverAddress',
  'วันส่งสำเร็จ': 'deliveredDate',
  'ใบคุมล่าสุด': 'latestControlSheet',
  'คนขับล่าสุด': 'latestDriver',
  'จังหวัด': 'province',
  'ภูมิภาค': 'region',
  'Created by': 'createdBy',
  'Created date': 'createdDate',
  'น้ำหนัก': 'weight',
  'จำนวนชิ้น': 'quantity',
  'จำนวน': 'quantity',
};

export async function parseUploadFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];
        
        const mappedData = json.map(row => {
          const item: any = {};
          Object.keys(row).forEach(key => {
             const mappedKey = COLUMN_MAP[key.trim()];
             if (mappedKey) {
                // Formatting specific fields
                if (['orderDate', 'cutoffDate', 'deliveredDate', 'createdDate'].includes(mappedKey)) {
                  const dateInfo = parseExcelDate(row[key]);
                  item[mappedKey] = dateInfo.date;
                  item[`${mappedKey}Raw`] = dateInfo.raw;
                  item[`${mappedKey}Key`] = dateInfo.key;
                } else if (['codAmount', 'codReceived', 'orderTotal', 'controlTotal', 'destinationTotal', 'netProfit', 'discountAmount', 'weight', 'quantity'].includes(mappedKey)) {
                  item[mappedKey] = parseNumber(row[key]);
                } else {
                  item[mappedKey] = String(row[key] || '');
                }
             }
          });
          return item;
        });

        resolve(mappedData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
}
