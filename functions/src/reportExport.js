const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Since exporting excel from function requires a binary response or bucket upload
// We will return data rows to the client
exports.getExportData = async (options) => {
   const { reportType, startDate, endDate, provinceScope } = options;
   const db = getFirestore(admin.app(), "ai-studio-e0bd6a4d-3d0e-4cd4-a909-9ffd81cb6405");
   
   // Usually we would query dailyBranchSummaries
   let query = db.collection('dailyBranchSummaries')
     .where('reportDate', '>=', startDate)
     .where('reportDate', '<=', endDate);
     
   const snapshot = await query.get();
   const data = snapshot.docs.map(d => d.data());
   
   return { status: 'success', data };
};
