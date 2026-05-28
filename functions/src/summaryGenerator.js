const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getProvinceGroup } = require('./provinceGroup');

exports.generateSummaryForDate = async (reportDate) => {
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  const shipmentsSnapshot = await db.collection('shipments')
    .where('date', '==', reportDate)
    .get();

  const groups = new Map();

  shipmentsSnapshot.forEach(doc => {
    const data = doc.data();
    const groupKey = data.reportBranchGroup || "UNMAPPED";
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        reportDate,
        reportBranchGroup: groupKey,
        mainBranch: data.mainBranch || "",
        subBranch: data.subBranch || "",
        reportType: data.reportType || "",
        provinceGroup: getProvinceGroup(data.province),
        isNineProvince: getProvinceGroup(data.province) === "9_PROVINCES",
        totalOrder: 0,
        prepaidTotal: 0,
        postpaidTotal: 0,
        totalCod: 0,
        totalQuantity: 0,
        totalBills: 0,
        trackingSet: new Set(),
        orderNoSet: new Set(),
        
        // aggregate flags for quick filtering later
        isMainRevenue: data.isMainRevenue || false,
        isNetwork: data.isNetwork || false,
        isDropPoint: data.isDropPoint || false,
        isCallin: data.isCallin || false,
        isOnline: data.isOnline || false,
        isSaleDriver: data.isSaleDriver || false,
        isRcPickup: data.isRcPickup || false,
        isFullTruckLoad: data.isFullTruckLoad || false,
        isEcommerce: data.isEcommerce || false,
        is360Truck: data.is360Truck || false,
        lineType: data.lineType || "",
        branchType: data.branchType || "",
        
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    const stat = groups.get(groupKey);
    
    const orderTotal = Number(data.orderTotal) || 0;
    stat.totalOrder += orderTotal;
    
    if (String(data.type || "").includes('ต้นทาง')) {
       stat.prepaidTotal += orderTotal;
    } else if (String(data.type || "").includes('ปลายทาง')) {
       stat.postpaidTotal += orderTotal;
    }
    
    stat.totalCod += (Number(data.codAmount) || 0);
    stat.totalQuantity += (Number(data.quantity) || 0);
    
    if (data.orderNo) stat.orderNoSet.add(data.orderNo);
    if (data.trackingNo) stat.trackingSet.add(data.trackingNo);
  });

  const batch = db.batch();
  for (const [groupKey, stat] of groups.entries()) {
    stat.totalTracking = stat.trackingSet.size;
    stat.totalBills = stat.orderNoSet.size;
    delete stat.trackingSet;
    delete stat.orderNoSet;
    
    // safe doc ID
    const safeKey = groupKey.replace(/[\/\\]/g, '-').replace(/\s+/g, '_');
    const docId = `${reportDate}_${safeKey}`;
    const ref = db.collection('dailyBranchSummaries').doc(docId);
    batch.set(ref, stat, { merge: true });
  }

  if (groups.size > 0) {
    const batches = [];
    let currentBatch = db.batch();
    let count = 0;
    
    for (const [groupKey, stat] of groups.entries()) {
      if (count === 500) {
         batches.push(currentBatch);
         currentBatch = db.batch();
         count = 0;
      }
      const safeKey = groupKey.replace(/[\/\\]/g, '-').replace(/\s+/g, '_');
      const docId = `${reportDate}_${safeKey}`;
      const ref = db.collection('dailyBranchSummaries').doc(docId);
      currentBatch.set(ref, stat, { merge: true });
      count++;
    }
    if (count > 0) batches.push(currentBatch);
    
    for (const b of batches) {
      await b.commit();
    }
  }

  return { success: true, groupsGenerated: groups.size };
};
