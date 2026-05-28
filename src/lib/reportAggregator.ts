import { formatDate } from './utils';

export function getPaymentSide(row: any) {
  const type = String(row.type || "");
  if (type.includes("ต้นทาง")) return "prepaid";
  if (type.includes("ปลายทาง")) return "postpaid";
  return "unknown";
}

export function aggregateByBranchGroup(shipments: any[], groupByLabel: string = "reportBranchGroup") {
  const map = new Map();

  shipments.forEach(row => {
    const rawDate = row.orderDate || row.createdDate;
    const date = rawDate ? formatDate(rawDate) : '-';
    
    let group = "";
    if (groupByLabel === "branchName") {
      group = row.branchName || "ไม่ระบุสาขา";
    } else if (groupByLabel === "senderName") {
      group = row.senderName || row['ผู้ส่ง'] || "ไม่ระบุผู้ส่ง";
    } else if (groupByLabel === "reportBranchGroup") {
      group = row.reportBranchGroup || "ไม่ระบุกลุ่มสาขา";
    } else {
      group = row[groupByLabel] || "ไม่ระบุ";
    }

    const key = `${date}_${group}`;

    if (!map.has(key)) {
      map.set(key, {
        reportDate: date,
        branchGroup: group,
        totalOrder: 0,
        prepaidTotal: 0,
        postpaidTotal: 0,
        totalCod: 0,
        totalQuantity: 0,
        totalBillsSet: new Set(),
        totalTracking: 0
      });
    }

    const item = map.get(key);
    const orderTotal = Number(row.orderTotal || 0);
    const codAmount = Number(row.codAmount || 0);
    const quantity = Number(row.quantity || 0);

    item.totalOrder += orderTotal;
    item.totalCod += codAmount;
    item.totalQuantity += quantity;
    item.totalTracking += 1;

    if (row.orderNo) {
      item.totalBillsSet.add(row.orderNo);
    }

    const paymentSide = getPaymentSide(row);

    if (paymentSide === "prepaid") {
      item.prepaidTotal += orderTotal;
    }

    if (paymentSide === "postpaid") {
      item.postpaidTotal += orderTotal;
    }
  });

  return Array.from(map.values()).map(item => ({
    ...item,
    totalBills: item.totalBillsSet.size,
    totalBillsSet: undefined // remove Set from final output
  }));
}
