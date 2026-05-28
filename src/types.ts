export interface Shipment {
  trackingNo: string;
  carrier: string;
  orderNo: string;
  serviceType: string;
  orderDate: string; // ISO string
  cutoffDate: string; // ISO string
  branchGroup: string;
  currentLocation: string;
  type: string;
  referenceNo: string;
  sales: string;
  branchName: string;
  senderName: string;
  paymentCondition: string;
  paymentMethod: string;
  bsBankAccount: string;
  bsBank: string;
  parcelDetail: string;
  weight: number;
  width: number;
  length: number;
  height: number;
  quantity: number;
  unitPrice: number;
  unit: string;
  codAmount: number;
  codReceived: number;
  commissionRate: number;
  orderTotal: number;
  controlTotal: number;
  destinationTotal: number;
  netProfit: number;
  discountAmount: number;
  currentLoc: string;
  receiverName: string;
  senderPhone: string;
  receiverPhone: string;
  shortAddress: string;
  receiverAddress: string;
  lockedByControlSheet: string;
  deliveredDate: string | null;
  latestControlSheet: string;
  latestDriver: string;
  latestDriverPhone: string;
  networkRemark: string;
  province: string;
  region: string;
  createdBy: string;
  createdDate: string; // ISO string
  importedAt: string; // ISO string
  importBatchId: string;
}

export interface ImportBatch {
  id: string;
  fileName: string;
  fileUrl?: string;
  totalRows: number;
  successRows: number;
  duplicateRows: number;
  errorRows: number;
  importedBy: string;
  importedAt: string; // ISO string
  status: 'processing' | 'completed' | 'failed';
}

export type UserRole = 'admin' | 'manager' | 'staff' | 'viewer';

export interface UserAccount {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  status: 'active' | 'disabled';
  permissions: string[];
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastLoginAt: string | null; // ISO string
  avatarUrl?: string;
}

export interface AuditLog {
  id: string;
  action: 'create_user' | 'update_user' | 'disable_user' | 'enable_user' | 'reset_password_invite';
  targetUserId: string;
  performedBy: string; // user UID
  performedByEmail: string;
  changes: Record<string, any>;
  createdAt: string; // ISO string
}

export interface DailyBranchSummary {
  reportDate: string; // YYYY-MM-DD
  branchCode?: string;
  branchName: string;
  province: string;
  region: string;
  branchGroup: string;
  branchType: string;
  lineType: string;
  isNineProvince: boolean;
  totalTracking: number;
  totalOrders: number;
  totalQuantity: number;
  totalWeight: number;
  totalCod: number;
  totalCodReceived: number;
  totalOrderTotal: number;
  totalControlTotal: number;
  totalDestinationTotal: number;
  totalNetProfit: number;
  totalDiscount: number;
}
