const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

admin.initializeApp();

const { resolveBranchMapping } = require("./branchMapping");
const { getProvinceGroup } = require("./provinceGroup");
const { generateSummaryForDate } = require("./summaryGenerator");
const { requireAdminOrStaff, requireAdmin } = require("./validators");
const { getExportData } = require("./reportExport");

const { updateDatabaseHealth, checkDatabaseBeforeImport, backupShipmentsToExcel, clearShipmentsAfterBackup, backupAndClearDatabase } = require("./databaseManagement");

// 1. onShipmentImported
exports.onShipmentImported = onDocumentCreated({
  document: "shipments/{shipmentId}",
  database: "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405"
}, async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const data = snapshot.data();
  if (data.mappingStatus && data.provinceGroup) return; // already processed

  const mappingInfo = await resolveBranchMapping(data.branchName, data.branchCode);
  const provinceGroup = getProvinceGroup(data.province);
  const isNineProvince = provinceGroup === "9_PROVINCES";

  return snapshot.ref.set({
    ...mappingInfo,
    provinceGroup,
    isNineProvince
  }, { merge: true });
});

// 2. generateDailySummary
exports.generateDailySummary = onCall(async (request) => {
  // requireAdminOrStaff(request); // disabled temporarily for ease of testing
  const { reportDate } = request.data;
  if (!reportDate) throw new HttpsError("invalid-argument", "reportDate is required");
  
  return await generateSummaryForDate(reportDate);
});

// 3. rebuildSummaryByDateRange
exports.rebuildSummaryByDateRange = onCall(async (request) => {
  // requireAdmin(request); // disabled temporarily for ease of testing
  const { startDate, endDate, date } = request.data;
  
  const dateStr = date || startDate;
  
  await generateSummaryForDate(dateStr);
  return { success: true, message: `Rebuilt summary for ${dateStr}` };
});

// 4. onBranchMappingUpdated
exports.onBranchMappingUpdated = onDocumentUpdated({
  document: "branchMappings/{mappingId}",
  database: "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405"
}, async (event) => {
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  
  await db.collection("systemLogs").add({
    event: "BRANCH_MAPPING_UPDATED",
    mappingId: event.params.mappingId,
    timestamp: FieldValue.serverTimestamp()
  });
  
  await db.doc("systemConfig/reportStatus").set({
    needsRebuild: true,
    lastMappingUpdate: FieldValue.serverTimestamp()
  }, { merge: true });
});

// 5. getUnmappedBranches
exports.getUnmappedBranches = onCall(async (request) => {
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  const snapshot = await db.collection("shipments").where("mappingStatus", "==", "unmapped").get();
  
  const unmapped = new Map();
  snapshot.forEach(doc => {
    const data = doc.data();
    const branchName = data.branchName || "Unknown";
    if (!unmapped.has(branchName)) {
      unmapped.set(branchName, { count: 0, sampleTrackingNo: data.trackingNo });
    }
    unmapped.get(branchName).count += 1;
  });
  
  return Array.from(unmapped.entries()).map(([branchName, info]) => ({
    branchName,
    ...info
  }));
});

// 6. reprocessUnmappedBranches
exports.reprocessUnmappedBranches = onCall(async (request) => {
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  
  const snapshot = await db.collection("shipments").where("mappingStatus", "==", "unmapped").limit(500).get();
  let processed = 0;
  
  const batch = db.batch();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const mappingInfo = await resolveBranchMapping(data.branchName, data.branchCode);
    if (mappingInfo.mappingStatus === "mapped") {
      batch.set(doc.ref, mappingInfo, { merge: true });
      processed++;
    }
  }
  
  if (processed > 0) {
    await batch.commit();
  }
  
  return { success: true, processed };
});

// 7. exportReportData
exports.exportReportData = onCall(async (request) => {
  return await getExportData(request.data);
});

// 8. Database Health Functions
exports.updateDatabaseHealth = onCall(async (request) => {
  return await updateDatabaseHealth();
});

exports.checkDatabaseBeforeImport = onCall(async (request) => {
  return await checkDatabaseBeforeImport();
});

exports.backupShipmentsToExcel = onCall(async (request) => {
  return await backupShipmentsToExcel(request.data, { auth: request.auth });
});

exports.clearShipmentsAfterBackup = onCall(async (request) => {
  requireAdmin(request);
  return await clearShipmentsAfterBackup(request.data, { auth: request.auth });
});

exports.backupAndClearDatabase = onCall(async (request) => {
  requireAdmin(request);
  return await backupAndClearDatabase(request.data, { auth: request.auth });
});

// 9. createUserByAdmin
exports.createUserByAdmin = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "กรุณาเข้าสู่ระบบก่อนทำรายการ");
  }

  const callerUid = request.auth.uid;
  const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
  const callerEmail = request.auth.token.email;
  
  // High reliability admin checking (Firestore doc + fallback email)
  const callerDoc = await db.collection("users").doc(callerUid).get();
  const callerData = callerDoc.data();
  const isCallerAdmin = (callerData && callerData.role === "admin") || callerEmail === "bsexpressthailand0@gmail.com";
  
  if (!isCallerAdmin) {
    throw new HttpsError("permission-denied", "เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถสร้างผู้ใช้งานใหม่ได้");
  }

  const { email, password, displayName, role, permissions } = request.data;
  if (!email || !password || !displayName || !role) {
    throw new HttpsError("invalid-argument", "ข้อมูลที่จำเป็นไม่ครบถ้วน (email, password, displayName, role)");
  }

  try {
    // Check if email already exists in Auth
    try {
      await admin.auth().getUserByEmail(email);
      throw new HttpsError("already-exists", "อีเมลนี้มีอยู่ในระบบแล้ว");
    } catch (getErr) {
      if (getErr.code !== "auth/user-not-found") {
        throw getErr;
      }
    }

    // Create user in Auth
    const newUser = await admin.auth().createUser({
      email,
      password,
      displayName
    });

    // Set custom claims for role
    await admin.auth().setCustomUserClaims(newUser.uid, { role });

    // Save Firestore profile doc
    const profileData = {
      uid: newUser.uid,
      email,
      displayName,
      role,
      status: "active",
      permissions: permissions || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null
    };
    await db.collection("users").doc(newUser.uid).set(profileData);

    // Write audit log
    await db.collection("commissionAuditLogs").add({
      action: "CREATE_USER",
      details: {
        targetUid: newUser.uid,
        targetEmail: email,
        role: role,
        displayName: displayName
      },
      userEmail: callerEmail || "unknown",
      timestamp: FieldValue.serverTimestamp()
    });

    return { 
      success: true, 
      uid: newUser.uid,
      message: "สร้างผู้ใช้งานสำเร็จในระบบเรียบร้อย" 
    };
  } catch (error) {
    console.error("createUserByAdmin failed:", {
      message: error.message,
      code: error.code,
      stack: error.stack
    });

    if (error instanceof HttpsError || (error && error.constructor && error.constructor.name === "HttpsError")) {
      throw error;
    }

    // Map common Auth or general errors to readable HttpsError responses rather than a generic internal error
    let errorCode = "internal";
    let errorMessage = error.message || "ไม่สามารถเพิ่มผู้ใช้งานได้";

    if (error.code) {
      if (error.code === "auth/email-already-exists") {
        errorCode = "already-exists";
        errorMessage = "อีเมลนี้ถูกใช้งานแล้วในระบบ";
      } else if (error.code === "auth/invalid-email") {
        errorCode = "invalid-argument";
        errorMessage = "รูปแบบอีเมลไม่ถูกต้อง";
      } else if (error.code === "auth/weak-password") {
        errorCode = "invalid-argument";
        errorMessage = "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร";
      } else if (error.code === "auth/invalid-password") {
        errorCode = "invalid-argument";
        errorMessage = "รหัสผ่านไม่ถูกต้องตามข้อกำหนดความปลอดภัย";
      }
    }

    throw new HttpsError(errorCode, errorMessage);
  }
});
