export type ReportConfig = {
  id: string;
  name: string;
  groupBy?: string;
  displayGroupLabel?: string;
  filters?: {
    isNineProvince?: boolean;
    isMainRevenue?: boolean;
    isNetwork?: boolean;
    isDropPoint?: boolean;
    isCallin?: boolean;
    isSaleDriver?: boolean;
    isOnline?: boolean;
    isRcPickup?: boolean;
    isFullTruckLoad?: boolean;
    isEcommerce?: boolean;
    is360Truck?: boolean;
    lineType?: string;
    branchType?: string;
    branchGroup?: string;
    sales?: string;
    branchGroupScope?: string;
    reportBranchGroup?: string;
  };
};

export const REPORT_CONFIGS: ReportConfig[] = [
  { id: 'all', name: 'ดูข้อมูลทั้งหมด (ไม่ได้จัดกลุ่ม)' },
  { id: 'summary_all', name: 'สรุปภาพรวมทั้งหมด', groupBy: 'reportBranchGroup' },
  { id: 'branch_daily_9', name: 'รายงานยอดตามกลุ่มสาขาประจำวัน 9 จังหวัด', groupBy: 'reportBranchGroup', displayGroupLabel: 'กลุ่มสาขา', filters: { isNineProvince: true } },
  { id: 'branch_daily_68', name: 'รายงานยอดตามกลุ่มสาขาประจำวัน 68 จังหวัด', groupBy: 'reportBranchGroup', displayGroupLabel: 'กลุ่มสาขา', filters: { isNineProvince: false } },
  { id: 'line5_9', name: 'รายงานยอดตามกลุ่มสาขาสาย 5 ประจำวัน 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { reportBranchGroup: 'DC0002 (DC พุทธมณฑลสาย5)', isNineProvince: true } },
  { id: 'line5_68', name: 'รายงานยอดตามกลุ่มสาขาสาย 5 ประจำวัน 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { reportBranchGroup: 'DC0002 (DC พุทธมณฑลสาย5)', isNineProvince: false } },
  { id: 'line3_9', name: 'รายงานยอดตามกลุ่มสาขาสาย 3 ประจำวัน 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { reportBranchGroup: 'DC0051 (พุทธมณฑล สาย3)', isNineProvince: true } },
  { id: 'line3_68', name: 'รายงานยอดตามกลุ่มสาขาสาย 3 ประจำวัน 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { reportBranchGroup: 'DC0051 (พุทธมณฑล สาย3)', isNineProvince: false } },
  { id: 'highway_9', name: 'รายงานยอดตามกลุ่มสาขาใต้ทางด่วน ประจำวัน 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { reportBranchGroup: 'DC0003 (สาขาใต้ทางด่วน)', isNineProvince: true } },
  { id: 'highway_68', name: 'รายงานยอดตามกลุ่มสาขาใต้ทางด่วน ประจำวัน 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { reportBranchGroup: 'DC0003 (สาขาใต้ทางด่วน)', isNineProvince: false } },
  { id: 'network_9', name: 'รายงานเครือข่าย 9 จังหวัด', groupBy: 'branchName', displayGroupLabel: 'ชื่อสาขา', filters: { isNetwork: true, isNineProvince: true } },
  { id: 'network_68', name: 'รายงานเครือข่าย 68 จังหวัด', groupBy: 'branchName', displayGroupLabel: 'ชื่อสาขา', filters: { isNetwork: true, isNineProvince: false } },
  { id: 'drop_point_9', name: 'รายงาน Drop Point 9 จังหวัด', groupBy: 'branchName', displayGroupLabel: 'ชื่อสาขา', filters: { isDropPoint: true, isNineProvince: true } },
  { id: 'drop_point_68', name: 'รายงาน Drop Point 68 จังหวัด', groupBy: 'branchName', displayGroupLabel: 'ชื่อสาขา', filters: { isDropPoint: true, isNineProvince: false } },
  { id: 'callin_9', name: 'รายงาน CALLIN 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isCallin: true, isNineProvince: true } },
  { id: 'callin_68', name: 'รายงาน CALLIN 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isCallin: true, isNineProvince: false } },
  { id: 'saledriver_9', name: 'รายงาน Sale Driver 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isSaleDriver: true, isNineProvince: true } },
  { id: 'saledriver_68', name: 'รายงาน Sale Driver 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isSaleDriver: true, isNineProvince: false } },
  { id: 'online_9', name: 'รายงาน Online 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isOnline: true, isNineProvince: true } },
  { id: 'online_68', name: 'รายงาน Online 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isOnline: true, isNineProvince: false } },
  { id: 'rc_pickup_9', name: 'รายงาน RC งานเข้ารับ 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isRcPickup: true, isNineProvince: true } },
  { id: 'rc_pickup_68', name: 'รายงาน RC งานเข้ารับ 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isRcPickup: true, isNineProvince: false } },
  { id: 'booking', name: 'รายงาน Booking', groupBy: 'reportBranchGroup', filters: { branchType: 'BOOKING' } },
  { id: 'full_truck_load_9', name: 'รายงานงานเหมาคัน 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isFullTruckLoad: true, isNineProvince: true } },
  { id: 'full_truck_load_68', name: 'รายงานงานเหมาคัน 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isFullTruckLoad: true, isNineProvince: false } },
  { id: 'ecommerce_9', name: 'รายงาน E-COMMERCE 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isEcommerce: true, isNineProvince: true } },
  { id: 'ecommerce_68', name: 'รายงาน E-COMMERCE 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isEcommerce: true, isNineProvince: false } },
  { id: '360truck_9', name: 'รายงาน 360TRUCK 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { is360Truck: true, isNineProvince: true } },
  { id: '360truck_68', name: 'รายงาน 360TRUCK 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { is360Truck: true, isNineProvince: false } },
];

export function getDynamicConfigs(reportBranchGroups: any[]): ReportConfig[] {
  const configs: ReportConfig[] = [
    { id: 'all', name: 'ดูข้อมูลทั้งหมด (ไม่ได้จัดกลุ่ม)' },
    { id: 'summary_all', name: 'สรุปภาพรวมทั้งหมด', groupBy: 'reportBranchGroup' },
    { id: 'branch_daily_9', name: 'รายงานยอดตามกลุ่มสาขาประจำวัน 9 จังหวัด', groupBy: 'reportBranchGroup', displayGroupLabel: 'กลุ่มสาขา', filters: { isNineProvince: true } },
    { id: 'branch_daily_68', name: 'รายงานยอดตามกลุ่มสาขาประจำวัน 68 จังหวัด', groupBy: 'reportBranchGroup', displayGroupLabel: 'กลุ่มสาขา', filters: { isNineProvince: false } },
  ];

  // For each active branch group except "ไม่ระบุ"
  const activeGroups = reportBranchGroups.filter(g => g.isActive && g.label !== 'ไม่ระบุ');
  
  activeGroups.forEach(group => {
    // Dynamic 1: 9 Provinces
    configs.push({
      id: `group_${group.id}_9`,
      name: `รายงานยอดตามกลุ่มสาขา ${group.label} ประจำวัน 9 จังหวัด`,
      groupBy: 'senderName',
      displayGroupLabel: 'ผู้ส่ง',
      filters: { reportBranchGroup: group.label, isNineProvince: true }
    });
    // Dynamic 2: 68 Provinces
    configs.push({
      id: `group_${group.id}_68`,
      name: `รายงานยอดตามกลุ่มสาขา ${group.label} ประจำวัน 68 จังหวัด`,
      groupBy: 'senderName',
      displayGroupLabel: 'ผู้ส่ง',
      filters: { reportBranchGroup: group.label, isNineProvince: false }
    });
  });

  // Add remaining static reports
  configs.push(
    { id: 'network_9', name: 'รายงานเครือข่าย 9 จังหวัด', groupBy: 'branchName', displayGroupLabel: 'ชื่อสาขา', filters: { isNetwork: true, isNineProvince: true } },
    { id: 'network_68', name: 'รายงานเครือข่าย 68 จังหวัด', groupBy: 'branchName', displayGroupLabel: 'ชื่อสาขา', filters: { isNetwork: true, isNineProvince: false } },
    { id: 'drop_point_9', name: 'รายงาน Drop Point 9 จังหวัด', groupBy: 'branchName', displayGroupLabel: 'ชื่อสาขา', filters: { isDropPoint: true, isNineProvince: true } },
    { id: 'drop_point_68', name: 'รายงาน Drop Point 68 จังหวัด', groupBy: 'branchName', displayGroupLabel: 'ชื่อสาขา', filters: { isDropPoint: true, isNineProvince: false } },
    { id: 'callin_9', name: 'รายงาน CALLIN 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isCallin: true, isNineProvince: true } },
    { id: 'callin_68', name: 'รายงาน CALLIN 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isCallin: true, isNineProvince: false } },
    { id: 'saledriver_9', name: 'รายงาน Sale Driver 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isSaleDriver: true, isNineProvince: true } },
    { id: 'saledriver_68', name: 'รายงาน Sale Driver 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isSaleDriver: true, isNineProvince: false } },
    { id: 'online_9', name: 'รายงาน Online 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isOnline: true, isNineProvince: true } },
    { id: 'online_68', name: 'รายงาน Online 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isOnline: true, isNineProvince: false } },
    { id: 'rc_pickup_9', name: 'รายงาน RC งานเข้ารับ 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isRcPickup: true, isNineProvince: true } },
    { id: 'rc_pickup_68', name: 'รายงาน RC งานเข้ารับ 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isRcPickup: true, isNineProvince: false } },
    { id: 'booking', name: 'รายงาน Booking', groupBy: 'reportBranchGroup', filters: { branchType: 'BOOKING' } },
    { id: 'full_truck_load_9', name: 'รายงานงานเหมาคัน 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isFullTruckLoad: true, isNineProvince: true } },
    { id: 'full_truck_load_68', name: 'รายงานงานเหมาคัน 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isFullTruckLoad: true, isNineProvince: false } },
    { id: 'ecommerce_9', name: 'รายงาน E-COMMERCE 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isEcommerce: true, isNineProvince: true } },
    { id: 'ecommerce_68', name: 'รายงาน E-COMMERCE 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { isEcommerce: true, isNineProvince: false } },
    { id: '360truck_9', name: 'รายงาน 360TRUCK 9 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { is360Truck: true, isNineProvince: true } },
    { id: '360truck_68', name: 'รายงาน 360TRUCK 68 จังหวัด', groupBy: 'senderName', displayGroupLabel: 'ผู้ส่ง', filters: { is360Truck: true, isNineProvince: false } }
  );

  return configs;
}
