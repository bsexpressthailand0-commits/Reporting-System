const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const XLSX = require('xlsx');

const DATABASE_WARNING_LIMIT_ROWS = 80000;
const DATABASE_CRITICAL_LIMIT_ROWS = 100000;

exports.updateDatabaseHealth = async () => {
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  
  const shipmentsSnapshot = await db.collection('shipments').count().get();
  const totalShipments = shipmentsSnapshot.data().count;

  const batchesSnapshot = await db.collection('importBatches').count().get();
  const totalImportBatches = batchesSnapshot.data().count;

  const summariesSnapshot = await db.collection('dailyBranchSummaries').count().get();
  const totalSummaries = summariesSnapshot.data().count;

  const estimatedSizeMb = (totalShipments * 1.2 + totalSummaries * 0.5) / 1024;

  let healthStatus = 'normal';
  if (totalShipments >= DATABASE_CRITICAL_LIMIT_ROWS) {
    healthStatus = 'critical';
  } else if (totalShipments >= DATABASE_WARNING_LIMIT_ROWS) {
    healthStatus = 'warning';
  }

  await db.collection('systemStats').doc('databaseHealth').set({
    totalShipments,
    totalImportBatches,
    totalSummaries,
    estimatedSizeMb: parseFloat(estimatedSizeMb.toFixed(2)),
    warningLimitRows: DATABASE_WARNING_LIMIT_ROWS,
    criticalLimitRows: DATABASE_CRITICAL_LIMIT_ROWS,
    healthStatus,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { totalShipments, healthStatus };
};

exports.checkDatabaseBeforeImport = async () => {
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  const doc = await db.collection('systemStats').doc('databaseHealth').get();
  const data = doc.data() || {};
  const totalShipments = data.totalShipments || 0;

  if (totalShipments >= DATABASE_CRITICAL_LIMIT_ROWS) {
    return {
      allowImport: false,
      message: "ฐานข้อมูลเต็มหรือใกล้เต็ม กรุณาสำรองข้อมูลก่อนนำเข้าใหม่"
    };
  } else if (totalShipments >= DATABASE_WARNING_LIMIT_ROWS) {
    return {
      allowImport: true,
      warning: "ฐานข้อมูลใกล้เต็ม ควรสำรองข้อมูล",
      message: "ฐานข้อมูลใกล้เต็ม ควรสำรองข้อมูลนำเข้าได้ปกติ"
    };
  }
  
  return { allowImport: true };
};

exports.backupShipmentsToExcel = async (options, context) => {
  const { dateFrom, dateTo, backupType } = options;
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  const bucket = getStorage().bucket();

  const shipmentsRef = db.collection('shipments');
  let query = shipmentsRef;
  if (dateFrom) query = query.where('date', '>=', dateFrom);
  if (dateTo) query = query.where('date', '<=', dateTo);
  
  const snapshot = await query.get();
  const rows = [];
  snapshot.forEach(doc => {
    rows.push(doc.data());
  });

  if (rows.length === 0) {
    throw new Error('No shipments found to backup.');
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Shipments');

  const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const timestamp = new Date().toISOString().replace(/[:\.\-]/g, '').slice(0, 15);
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `backups/shipments/${dateStr}/backup_shipments_${timestamp}.xlsx`;
  
  const file = bucket.file(fileName);
  await file.save(excelBuffer, {
    metadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  });

  const [downloadUrl] = await file.getSignedUrl({
    action: 'read',
    expires: '03-09-2491'
  });

  const backupDocRef = db.collection('backupLogs').doc();
  const backupId = backupDocRef.id;

  await backupDocRef.set({
    backupId,
    fileName,
    fileUrl: downloadUrl,
    rowCount: rows.length,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    createdBy: context.auth ? context.auth.uid : 'system',
    createdAt: FieldValue.serverTimestamp(),
    status: 'SUCCESS',
    backupType: backupType || 'MANUAL'
  });

  const healthDoc = await db.collection('systemStats').doc('databaseHealth').get();
  if (healthDoc.exists) {
     await db.collection('systemStats').doc('databaseHealth').update({
       latestBackupAt: FieldValue.serverTimestamp()
     });
  }

  return { downloadUrl, backupId, rowCount: rows.length };
};

exports.clearShipmentsAfterBackup = async (options, context) => {
  const { backupId, confirmText } = options;
  if (confirmText !== 'CONFIRM_CLEAR_DATABASE') {
    throw new Error('Invalid confirmation text.');
  }

  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  
  if (backupId) {
    const backupLog = await db.collection('backupLogs').doc(backupId).get();
    if (!backupLog.exists || backupLog.data().status !== 'SUCCESS') {
      throw new Error('Valid successful backup is required before clearing.');
    }
  }

  await deleteCollection(db, 'shipments', 500);
  await deleteCollection(db, 'dailyBranchSummaries', 500);
  // Optional if you have province summaries
  // await deleteCollection(db, 'dailyProvinceSummaries', 500);

  await exports.updateDatabaseHealth();

  return { success: true, message: 'Database cleared successfully.' };
};

async function deleteCollection(db, collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

exports.backupAndClearDatabase = async (options, context) => {
  const backupResult = await exports.backupShipmentsToExcel(options, context);
  await exports.clearShipmentsAfterBackup({
    backupId: backupResult.backupId,
    confirmText: 'CONFIRM_CLEAR_DATABASE'
  }, context);
  
  return { 
    success: true, 
    message: 'Backup and clear completed successfully.',
    downloadUrl: backupResult.downloadUrl 
  };
};
