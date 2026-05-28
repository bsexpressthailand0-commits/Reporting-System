import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';

// Note: To run this standalone, you'd need the firebase config. 
// Replace with actual config or run it within the app context.
const firebaseConfig = {
  // requires config if run externally
};

// If run from a web context, we can just export the seed function
export const SEED_MAPPINGS = [
  { branchName: "DC พุทธมณฑลสาย5", branchCode: "DC0002", mainBranch: "รายได้รวมหลัก", subBranch: "-", reportBranchGroup: "DC0002 (DC พุทธมณฑลสาย5)", isDropPoint: false, isNetwork: false },
  { branchName: "สาขาใต้ทางด่วน", branchCode: "DC0003", mainBranch: "รายได้รวมหลัก", subBranch: "-", reportBranchGroup: "DC0003 (สาขาใต้ทางด่วน)", isDropPoint: false, isNetwork: false },
  { branchName: "ศูนย์จันทร์สว่างขนส่ง", branchCode: "DC0007", mainBranch: "-", subBranch: "เครือข่าย", reportBranchGroup: "เครือข่าย", isDropPoint: false, isNetwork: true },
  { branchName: "CALLIN", branchCode: "DC0043", mainBranch: "รายได้รวมหลัก", subBranch: "-", reportBranchGroup: "DC0043 (CALLIN)", isCallin: true },
  { branchName: "SaleDriver", branchCode: "DC0044", mainBranch: "รายได้รวมหลัก", subBranch: "-", reportBranchGroup: "DC0044 (SaleDriver)", isSaleDriver: true },
  { branchName: "ONLINE", branchCode: "DC0046", mainBranch: "รายได้รวมหลัก", subBranch: "-", reportBranchGroup: "DC0046 (ONLINE)", isOnline: true },
  { branchName: "DC สาย5(งานเข้ารับ)", branchCode: "RC0002", mainBranch: "รายได้รวมหลัก", subBranch: "-", reportBranchGroup: "RC0002 (DC สาย5(งานเข้ารับ))", isRcPickup: true },
  { branchName: "Full Truck Load", branchCode: "DC0053", mainBranch: "-", subBranch: "-", reportBranchGroup: "งานเหมาคัน", isFullTruckLoad: true },
  { branchName: "E-COMMERCE", branchCode: "E-COMMERCE", mainBranch: "-", subBranch: "-", reportBranchGroup: "E-COMMERCE", isEcommerce: true },
  { branchName: "360TRUCK", branchCode: "DC0058", mainBranch: "-", subBranch: "-", reportBranchGroup: "360TRUCK", is360Truck: true },
];

export async function seedBranchMappings(db: any) {
  const batch = writeBatch(db);
  const coll = collection(db, 'branchMappings');
  
  SEED_MAPPINGS.forEach(mapping => {
    const ref = doc(coll, mapping.branchCode);
    batch.set(ref, {
      ...mapping,
      isMainRevenue: mapping.mainBranch === 'รายได้รวมหลัก',
      id: mapping.branchCode
    }, { merge: true });
  });
  
  await batch.commit();
  console.log("Seeding completed successfully.");
}
