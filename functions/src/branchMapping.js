const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

exports.resolveBranchMapping = async (branchName, branchCode) => {
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  const normalizedName = String(branchName || "").trim().replace(/\s+/g, " ").toUpperCase();
  const code = branchCode || (String(branchName || "").match(/^[A-Z0-9]+/) || [])[0] || "";
  
  const mappingsSnapshot = await db.collection("branchMappings").get();
  
  let match = null;
  for (const doc of mappingsSnapshot.docs) {
    const data = doc.data();
    const mapName = String(data.branchName || "").trim().replace(/\s+/g, " ").toUpperCase();
    if (mapName === normalizedName || (data.branchCode && data.branchCode === code)) {
      match = data;
      break;
    }
  }
  
  if (!match) {
    return {
      mappingStatus: "unmapped",
      reportBranchGroup: branchName || "ไม่ระบุกลุ่มสาขา"
    };
  }
  
  return {
    mappedBranchCode: match.branchCode || code,
    mainBranch: match.mainBranch || "",
    subBranch: match.subBranch || "",
    reportBranchGroup: match.reportBranchGroup || match.branchName,
    branchType: match.branchType || "",
    lineType: match.lineType || "",
    isMainRevenue: match.isMainRevenue || false,
    isNetwork: match.isNetwork || false,
    isDropPoint: match.isDropPoint || false,
    isCallin: match.isCallin || false,
    isOnline: match.isOnline || false,
    isSaleDriver: match.isSaleDriver || false,
    isRcPickup: match.isRcPickup || false,
    isFullTruckLoad: match.isFullTruckLoad || false,
    isEcommerce: match.isEcommerce || false,
    is360Truck: match.is360Truck || false,
    mappingStatus: "mapped",
  };
};
