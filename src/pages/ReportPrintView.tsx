import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getDynamicConfigs } from '../lib/reportConfigs';
import { useReportBranchGroups, resolveReportBranchGroup } from '../lib/MasterDataContext';
import { formatNumber, formatCurrency } from '../lib/utils';
import { getCachedCompanyInfo } from '../lib/systemSettings';
import { Printer, XCircle, ArrowLeft, Loader2 } from 'lucide-react';
import ReportExportTemplate from '../components/ReportExportTemplate';
import { enrichShipmentWithBranchMapping } from '../lib/branchMapping';
import { aggregateByBranchGroup } from '../lib/reportAggregator';

export default function ReportPrintView() {
  const { reportId } = useParams<{ reportId: string }>();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [companyInfo, setCompanyInfo] = useState({
    companyNameTh: 'บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด',
    companyNameEn: 'BS EXPRESS 2020 CO., LTD.',
    addressLine1: 'สถานีขนส่งสินค้าพุทธมณฑลสาย 5',
    addressLine2: 'ชานชาลาที่ 11 ห้องที่ 16-17',
    addressLine3: '133 หมู่ที่ 1 ถนนบรมราชชนนี ตำบลบางเตย',
    addressLine4: 'อำเภอสามพราน จังหวัดนครปฐม 73210',
    phone: '02-114-8855',
    email: 'info@bsgroupth.com',
    taxId: '073-556-300-2997',
    logoUrl: ''
  });

  // Query parameters
  const startDate = searchParams.get('startDate') || dayjs().format('YYYY-MM-DD');
  const endDate = searchParams.get('endDate') || dayjs().format('YYYY-MM-DD');
  const searchTerm = searchParams.get('searchTerm') || '';
  const sortKey = searchParams.get('sortKey') || 'totalOrder';
  const sortDirection = searchParams.get('sortDirection') || 'desc';
  const exportScope = searchParams.get('exportScope') || 'all';
  const currentPage = parseInt(searchParams.get('currentPage') || '1', 10);
  const itemsPerPage = parseInt(searchParams.get('itemsPerPage') || '50', 10);

  const reportBranchGroups = useReportBranchGroups();
  const currentConfigs = getDynamicConfigs(reportBranchGroups);
  const config = currentConfigs.find(r => r.id === reportId);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        // 1. Fetch Company Settings (Using Cache)
        const cached = await getCachedCompanyInfo();
        if (cached) {
          setCompanyInfo({
            companyNameTh: cached.companyNameTh || 'บริษัท บีเอส เอ็กซ์เพรส 2020 จำกัด',
            companyNameEn: cached.companyNameEn || 'BS EXPRESS 2020 CO., LTD.',
            addressLine1: cached.addressLine1 || 'สถานีขนส่งสินค้าพุทธมณฑลสาย 5',
            addressLine2: cached.addressLine2 || 'ชานชาลาที่ 11 ห้องที่ 16-17',
            addressLine3: cached.addressLine3 || '133 หมู่ที่ 1 ถนนบรมราชชนนี ตำบลบางเตย',
            addressLine4: cached.addressLine4 || 'อำเภอสามพราน จังหวัดนครปฐม 73210',
            phone: cached.phone || '02-114-8855',
            email: cached.email || 'info@bsgroupth.com',
            taxId: cached.taxId || '073-556-300-2997',
            logoUrl: cached.logoUrl || ''
          });
        }

        // 2. Fetch and aggregate report data
        let aggregatedData: any[] = [];
        const shouldUseSummary = (!config?.groupBy || config?.groupBy === 'reportBranchGroup') && config?.id !== 'branch_daily_9' && config?.id !== 'branch_daily_68';
        
        const isDateInRange = (date: any, start: string, end: string) => {
          if (!date) return false;
          const current = new Date(date);
          if (isNaN(current.getTime())) return false;
          current.setHours(0,0,0,0);
          
          const sDate = new Date(start);
          sDate.setHours(0,0,0,0);
          const eDate = new Date(end);
          eDate.setHours(23,59,59,999);

          return current >= sDate && current <= eDate;
        };

        const localApplyFilters = (rows: any[], reportConfig: any) => {
          return rows.filter(row => {
            const rowDate = row.orderDate || row.createdDate || row.reportDate;
            if (!isDateInRange(rowDate, startDate, endDate)) {
              return false;
            }
            return true;
          });
        };

        let summarySnapshot = null;
        if (shouldUseSummary) {
          const q = query(
            collection(db, 'dailyBranchSummaries'),
            where('reportDate', '>=', startDate),
            where('reportDate', '<=', endDate)
          );
          summarySnapshot = await getDocs(q);
        }

        if (summarySnapshot && !summarySnapshot.empty) {
          let rawSummaries = summarySnapshot.docs.map(doc => doc.data());
          
          rawSummaries = rawSummaries.map(s => ({
            ...s,
            reportBranchGroup: resolveReportBranchGroup(s.reportBranchGroup, reportBranchGroups)
          }));

          rawSummaries = localApplyFilters(rawSummaries, config);
          
          if (config?.filters) {
            if (config.filters.isNineProvince !== undefined) {
               rawSummaries = rawSummaries.filter(d => !!d.isNineProvince === !!config.filters?.isNineProvince);
            }
            if (config.filters.lineType) {
               rawSummaries = rawSummaries.filter(d => d.lineType === config.filters?.lineType);
            }
            if (config.filters.branchType) {
               rawSummaries = rawSummaries.filter(d => d.branchType === config.filters?.branchType);
            }
            if (config.filters.branchGroup) {
               rawSummaries = rawSummaries.filter(d => d.reportBranchGroup === config.filters?.branchGroup);
            }
            if (config.filters.isMainRevenue) rawSummaries = rawSummaries.filter((d: any) => d.isMainRevenue);
            if (config.filters.isNetwork) rawSummaries = rawSummaries.filter((d: any) => d.isNetwork);
            if (config.filters.isDropPoint) rawSummaries = rawSummaries.filter((d: any) => d.isDropPoint);
            if (config.filters.isCallin) rawSummaries = rawSummaries.filter((d: any) => d.isCallin);
            if (config.filters.isSaleDriver) rawSummaries = rawSummaries.filter((d: any) => d.isSaleDriver);
            if (config.filters.isOnline) rawSummaries = rawSummaries.filter((d: any) => d.isOnline);
            if (config.filters.isRcPickup) rawSummaries = rawSummaries.filter((d: any) => d.isRcPickup);
            if (config.filters.isFullTruckLoad) rawSummaries = rawSummaries.filter((d: any) => d.isFullTruckLoad);
            if (config.filters.isEcommerce) rawSummaries = rawSummaries.filter((d: any) => d.isEcommerce);
            if (config.filters.is360Truck) rawSummaries = rawSummaries.filter((d: any) => d.is360Truck);
          }
          
          aggregatedData = rawSummaries.map(s => ({
            reportDate: s.reportDate || '-',
            branchGroup: s.reportBranchGroup || 'ไม่ระบุกลุ่มสาขา',
            totalOrder: s.totalOrder || 0,
            prepaidTotal: s.prepaidTotal || 0,
            postpaidTotal: s.postpaidTotal || 0,
            totalCod: s.totalCod || 0,
            totalQuantity: s.totalQuantity || 0,
            totalBills: s.totalBills || 0,
            totalTracking: s.totalTracking || 0
          }));
        } else {
          // Fallback to shipments
          const q = query(
            collection(db, 'shipments'),
            where('orderDate', '>=', startDate),
            where('orderDate', '<=', endDate + 'T23:59:59.999Z')
          );
          const snapshot = await getDocs(q);
          let rawData = snapshot.docs.map(doc => doc.data());

          const mappingsSnapshot = await getDocs(collection(db, 'branchMappings'));
          const branchMappings = mappingsSnapshot.docs.map(d => d.data() as any);

          rawData = rawData.map(d => {
            let enriched = enrichShipmentWithBranchMapping(d, branchMappings);
            return {
              ...enriched,
              reportBranchGroup: resolveReportBranchGroup(enriched.reportBranchGroup || enriched.branchGroup || enriched.branchName, reportBranchGroups),
              branchGroup: resolveReportBranchGroup(enriched.reportBranchGroup || enriched.branchGroup || enriched.branchName, reportBranchGroups)
            };
          });

          rawData = localApplyFilters(rawData, config);
          
          if (config?.id === 'branch_daily_9' || config?.id === 'branch_daily_68') {
            const normalize = (value: any = '') =>
              String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();

            const SPECIAL_REPORT_GROUPS = [
              'CALLIN',
              'ONLINE',
              'DROP POINT',
              'SALEDRIVER',
              'SALE DRIVER',
              'เครือข่าย',
              'NETWORK'
            ];

            const isSpecialReportGroup = (row: any) => {
              const fields = [
                row.reportBranchGroup,
                row.mainBranch,
                row.subBranch,
                row.branchName,
                row.senderName
              ].map(v => normalize(v));

              return fields.some(v =>
                SPECIAL_REPORT_GROUPS.some(g => v.includes(normalize(g)))
              );
            };

            const nineProvincesList = ['กรุงเทพมหานคร', 'ชลบุรี', 'สมุทรปราการ', 'นครปฐม', 'สมุทรสาคร', 'ปทุมธานี', 'ราชบุรี', 'นนทบุรี', 'สมุทรสงคราม'];

            const isIn9Province = (provinceStr: string): boolean => {
              if (!provinceStr) return false;
              const pNorm = normalize(provinceStr);
              return nineProvincesList.some(np => normalize(np) === pNorm);
            };

            // Cache non-empty provinces from shipments to help resolve when province is empty/null
            const branchToProvinceMap = new Map<string, string>();
            const groupToProvinceMap = new Map<string, string>();

            rawData.forEach(row => {
              const prov = row.province;
              if (prov && typeof prov === 'string' && prov.trim() !== '') {
                if (row.branchName) {
                  branchToProvinceMap.set(normalize(row.branchName), prov);
                }
                if (row.reportBranchGroup) {
                  groupToProvinceMap.set(normalize(row.reportBranchGroup), prov);
                }
              }
            });

            const getProvinceFromKeywords = (name: string): string | null => {
              if (!name) return null;
              const n = normalize(name);
              if (n.includes('สมุทรสาคร')) return 'สมุทรสาคร';
              if (n.includes('นครปฐม') || n.includes('พุทธมณฑล') || n.includes('สาย5') || n.includes('สาย3')) return 'นครปฐม';
              if (n.includes('กรุงเทพ') || n.includes('BANGKOK') || n.includes('ใต้ทางด่วน')) return 'กรุงเทพมหานคร';
              if (n.includes('นนทบุรี')) return 'นนทบุรี';
              if (n.includes('ปทุมธานี')) return 'ปทุมธานี';
              if (n.includes('สมุทรปราการ')) return 'สมุทรปราการ';
              if (n.includes('ชลบุรี')) return 'ชลบุรี';
              if (n.includes('ราชบุรี')) return 'ราชบุรี';
              if (n.includes('สมุทรสงคราม')) return 'สมุทรสงคราม';
              
              const allProvinces = [
                'กระบี่', 'กรุงเทพมหานคร', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา', 
                'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 
                'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 
                'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 
                'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'พัทลุง', 'ภูเก็ต', 
                'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 
                'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 
                'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 
                'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อุดรธานี', 'อุทัยธานี', 'อุตรดิตถ์', 'อุบลราชธานี', 'อำนาจเจริญ'
              ];
              for (const prov of allProvinces) {
                if (n.includes(normalize(prov))) {
                  return prov;
                }
              }
              return null;
            };

            const resolveRowProvince = (row: any): string => {
              let prov = row.province || row.provinceGroup;
              if (prov && typeof prov === 'string' && prov.trim() !== '') {
                return prov;
              }
              
              const bNameNorm = normalize(row.branchName);
              if (bNameNorm && branchToProvinceMap.has(bNameNorm)) {
                return branchToProvinceMap.get(bNameNorm)!;
              }
              
              const refGroupNorm = normalize(row.reportBranchGroup);
              if (refGroupNorm && groupToProvinceMap.has(refGroupNorm)) {
                return groupToProvinceMap.get(refGroupNorm)!;
              }

              const keywordProv = getProvinceFromKeywords(row.branchName) || 
                                  getProvinceFromKeywords(row.reportBranchGroup) || 
                                  getProvinceFromKeywords(row.senderName);
              if (keywordProv) {
                return keywordProv;
              }
              
              return '';
            };

            rawData = rawData.filter(row => {
              const rawNormalizedProvince = resolveRowProvince(row);
              const normalizedProvince = normalize(rawNormalizedProvince);
              const is9Province = isIn9Province(normalizedProvince);

              let included = false;
              if (config.id === 'branch_daily_9') {
                included = is9Province === true || isSpecialReportGroup(row) === true;
              } else {
                included = is9Province === false || isSpecialReportGroup(row) === true;
              }

              return included;
            });

            rawData = rawData.map(row => {
              const groupName = row.reportBranchGroup || row.mainBranch || row.subBranch || row.branchName || row.senderName || "ไม่ระบุกลุ่มสาขา";
              return {
                ...row,
                reportBranchGroup: groupName,
                branchGroup: groupName
              };
            });
          } else {
            if (config?.filters) {
              if (config.filters.isNineProvince !== undefined) {
                 const nineProvinces = ['กรุงเทพมหานคร', 'ชลบุรี', 'สมุทรปราการ', 'นครปฐม', 'สมุทรสาคร', 'ปทุมธานี', 'ราชบุรี', 'นนทบุรี', 'สมุทรสงคราม'];
                 const pTrim = (p: any) => String(p || "").trim().replace(/\s+/g, "");
                 if (config.filters.isNineProvince) {
                   rawData = rawData.filter(d => nineProvinces.some(np => pTrim(np) === pTrim(d.province)) || d.provinceGroup === "9_PROVINCES");
                 } else {
                   rawData = rawData.filter(d => (!nineProvinces.some(np => pTrim(np) === pTrim(d.province))) && d.provinceGroup !== "9_PROVINCES");
                 }
              }
              if (config.filters.lineType) {
                 rawData = rawData.filter(d => d.lineType === config.filters?.lineType);
              }
              if (config.filters.branchType) {
                 rawData = rawData.filter(d => d.branchType === config.filters?.branchType);
              }
              if (config.filters.branchGroup) {
                 rawData = rawData.filter(d => d.reportBranchGroup === config.filters?.branchGroup || d.branchGroup === config.filters?.branchGroup);
              }
              if (config.filters.sales) {
                 rawData = rawData.filter(d => (d.sales || '').includes(config.filters?.sales));
              }
              if (config.filters.isMainRevenue) rawData = rawData.filter((d: any) => d.mainBranch === 'รายได้รวมหลัก' || d.isMainRevenue);
              if (config.filters.isNetwork) rawData = rawData.filter((d: any) => d.subBranch === 'เครือข่าย' || d.reportBranchGroup === 'เครือข่าย' || d.isNetwork);
              if (config.filters.isDropPoint) rawData = rawData.filter((d: any) => d.subBranch === 'ตัวแทนสาขาDP' || d.reportBranchGroup === 'Drop Point' || d.isDropPoint);
              if (config.filters.isCallin) rawData = rawData.filter((d: any) => d.isCallin || (d.reportBranchGroup || '').includes('CALLIN'));
              if (config.filters.isSaleDriver) rawData = rawData.filter((d: any) => d.isSaleDriver || (d.reportBranchGroup || '').includes('SaleDriver'));
              if (config.filters.isOnline) rawData = rawData.filter((d: any) => d.isOnline || (d.reportBranchGroup || '').includes('ONLINE'));
              if (config.filters.isRcPickup) rawData = rawData.filter((d: any) => d.isRcPickup || (d.reportBranchGroup || '').includes('งานเข้ารับ'));
              if (config.filters.isFullTruckLoad) rawData = rawData.filter((d: any) => d.reportBranchGroup === 'งานเหมาคัน' || d.isFullTruckLoad);
              if (config.filters.isEcommerce) rawData = rawData.filter((d: any) => d.reportBranchGroup === 'E-COMMERCE' || d.isEcommerce);
              if (config.filters.is360Truck) rawData = rawData.filter((d: any) => d.reportBranchGroup === '360TRUCK' || d.is360Truck);
            }
          }

          aggregatedData = aggregateByBranchGroup(rawData, config?.groupBy);
        }

        let filtered = aggregatedData.filter(item => 
          (item.branchGroup || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
          (item.reportDate || '').toLowerCase().includes(searchTerm.toLowerCase())
        );

        filtered.sort((a, b) => {
          const valA = a[sortKey];
          const valB = b[sortKey];
          if (typeof valA === 'number' && typeof valB === 'number') {
            return sortDirection === 'asc' ? valA - valB : valB - valA;
          }
          const txtA = String(valA || '');
          const txtB = String(valB || '');
          return sortDirection === 'asc' 
            ? txtA.localeCompare(txtB, 'th') 
            : txtB.localeCompare(txtA, 'th');
        });

        if (exportScope === 'current') {
          const startIndex = (currentPage - 1) * itemsPerPage;
          filtered = filtered.slice(startIndex, startIndex + itemsPerPage);
        }

        setData(filtered);
        setLoading(false);

        // Auto trigger window print
        setTimeout(() => {
          window.print();
        }, 1200);

      } catch (err) {
        console.error('Failed to prepare print report payload:', err);
        setLoading(false);
      }
    }
    init();
  }, [reportId, startDate, endDate, searchTerm, sortKey, sortDirection, exportScope, currentPage, itemsPerPage, config]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-800/50 gap-4">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">กำลังจัดเตรียมข้อมูลสำหรับการพิมพ์รายงาน...</div>
        <div className="text-xs text-gray-500">กรุณารอสักครู่ ระบบกำลังจัดฟอร์แมต ตารางข้อมูลและช่วงวันที่</div>
      </div>
    );
  }

  // We split the data into chunks like the image/PDF exporter so it breaks across printed pages nicely
  const ITEMS_PER_PAGE = 30; // 30 items per page max ensures it fits A4 easily
  const chunks: any[][] = [];
  if (data.length === 0) chunks.push([]);
  else {
    for (let i = 0; i < data.length; i += ITEMS_PER_PAGE) {
      chunks.push(data.slice(i, i + ITEMS_PER_PAGE));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans print:bg-white print:p-0">
      
      {/* Dynamic top navigation overlay - hidden inside print */}
      <div className="no-print bg-gray-900 text-white px-6 py-3 border-b flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <Printer className="w-5 h-5 text-primary-400" />
          <div>
            <div className="text-xs font-bold">โหมดพิมพ์บันทึกรายงาน (Print Mode)</div>
            <div className="text-[10px] text-gray-300">กรุณาตั้งค่าขนาดเป็น A4 แนวนอน (Landscape) margins = none หรือ minimal</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs font-bold transition flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> ดำเนินการพิมพ์ (Print)
          </button>
          <button
            onClick={() => window.close()}
            className="px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded text-xs font-bold transition flex items-center gap-1.5"
          >
            <XCircle className="w-3.5 h-3.5" /> ปิดหน้าต่าง (Close)
          </button>
        </div>
      </div>

      <div className="print-container w-full mx-auto" style={{ maxWidth: '1120px' }}>
        {chunks.map((chunk, index) => (
          <div key={index} className="bg-white p-8 mb-8 print:p-0 print:mb-0 print:break-after-page print-scale-fix" style={{ minHeight: '790px' }}>
            <ReportExportTemplate 
              reportName={config?.name || 'รายงานยอดการฝากส่งสะสม'}
              displayGroupLabel={config?.displayGroupLabel || 'กลุ่มสาขา'}
              startDate={startDate}
              endDate={endDate}
              data={chunk}
              companyInfo={companyInfo}
              page={{ current: index + 1, total: chunks.length }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

