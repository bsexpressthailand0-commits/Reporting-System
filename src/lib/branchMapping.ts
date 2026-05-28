export function getBranchCode(branchName: string): string {
  const match = String(branchName || "").match(/^[A-Z0-9]+/);
  return match ? match[0] : "";
}

export function normalizeBranchName(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export interface BranchMapping {
  id?: string;
  branchName: string;
  branchCode: string;
  mainBranch: string;
  subBranch: string;
  reportBranchGroup: string;
  branchType?: string;
  lineType?: string;
  isMainRevenue: boolean;
  isNetwork: boolean;
  isDropPoint: boolean;
  isCallin: boolean;
  isOnline: boolean;
  isSaleDriver: boolean;
  isRcPickup: boolean;
  isFullTruckLoad: boolean;
  isEcommerce: boolean;
  is360Truck: boolean;
}

export function enrichShipmentWithBranchMapping(shipment: any, branchMappings: BranchMapping[]) {
  const branchName = shipment.branchName || "";
  const branchCode = getBranchCode(branchName);
  const normalizedName = normalizeBranchName(branchName);

  const mapping =
    branchMappings.find(m => normalizeBranchName(m.branchName) === normalizedName) ||
    branchMappings.find(m => m.branchCode === branchCode);

  if (!mapping) {
    let fallbackGroup = shipment.branchGroup || shipment.branchName || "ไม่ระบุกลุ่มสาขา";
    
    // Auto-detect Drop Point fallback if branchCode starts with DP and not mapped yet
    if (branchCode.startsWith('DP') || branchCode.startsWith('DPN') || branchCode.startsWith('DPS') || branchCode.startsWith('DPB')) {
      fallbackGroup = "Drop Point";
    }

    return {
      ...shipment,
      reportBranchGroup: fallbackGroup,
      mappingStatus: "unmapped"
    };
  }

  return {
    ...shipment,
    reportBranchGroup: mapping.reportBranchGroup || mapping.branchName,
    mainBranch: mapping.mainBranch || "",
    subBranch: mapping.subBranch || "",
    branchType: mapping.branchType || "",
    lineType: mapping.lineType || "",
    isMainRevenue: mapping.isMainRevenue || false,
    isNetwork: mapping.isNetwork || false,
    isDropPoint: mapping.isDropPoint || false,
    isCallin: mapping.isCallin || false,
    isOnline: mapping.isOnline || false,
    isSaleDriver: mapping.isSaleDriver || false,
    isRcPickup: mapping.isRcPickup || false,
    isFullTruckLoad: mapping.isFullTruckLoad || false,
    isEcommerce: mapping.isEcommerce || false,
    is360Truck: mapping.is360Truck || false,
    mappingStatus: "mapped"
  };
}
