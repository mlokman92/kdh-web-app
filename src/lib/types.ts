/**
 * KDH One Asset — Domain contract.
 *
 * NOTE: tsconfig sets `erasableSyntaxOnly` — do NOT use `enum`.
 * Use the exported `const` arrays + derived union types below.
 */

/* ------------------------------------------------------------------ */
/* Enumerations (as const arrays + derived unions)                     */
/* ------------------------------------------------------------------ */

export const ASSET_CATEGORIES = [
  'Commercial Property',
  'Industrial',
  'Land',
  'Tourism & Hospitality',
  'Infrastructure',
  'Building & Facility',
  'Plant & Equipment',
  'ICT & Digital',
] as const
export type AssetCategory = (typeof ASSET_CATEGORIES)[number]

export const ASSET_STATUSES = [
  'Active',
  'Leased',
  'Vacant',
  'Under Maintenance',
  'Under Construction',
  'Idle',
  'Disposed',
] as const
export type AssetStatus = (typeof ASSET_STATUSES)[number]

export const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor', 'Critical'] as const
export type Condition = (typeof CONDITIONS)[number]

export const CRITICALITIES = ['Critical', 'High', 'Medium', 'Low'] as const
export type Criticality = (typeof CRITICALITIES)[number]

export const OWNERSHIP_TYPES = ['Owned', 'Leased-in', 'Joint Venture', 'Trust / Custodian'] as const
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number]

export const TENURES = ['Freehold', 'Leasehold 99yr', 'Leasehold 66yr', 'Leasehold 30yr'] as const
export type Tenure = (typeof TENURES)[number]

export const WO_TYPES = [
  'Corrective',
  'Preventive',
  'Predictive',
  'Inspection',
  'Statutory Compliance',
  'Emergency',
  'Upgrade / Improvement',
] as const
export type WorkOrderType = (typeof WO_TYPES)[number]

export const WO_STATUSES = [
  'Open',
  'Assigned',
  'In Progress',
  'On Hold',
  'Pending Parts',
  'Pending Verification',
  'Closed',
  'Cancelled',
] as const
export type WorkOrderStatus = (typeof WO_STATUSES)[number]

export const PRIORITIES = ['P1 - Critical', 'P2 - High', 'P3 - Medium', 'P4 - Low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const SLA_STATUSES = ['Met', 'On Track', 'At Risk', 'Breached'] as const
export type SlaStatus = (typeof SLA_STATUSES)[number]

export const WO_SOURCES = [
  'QR Scan',
  'Tenant Portal',
  'Call Centre',
  'IoT Sensor',
  'Scheduled PM',
  'WhatsApp Bot',
  'Inspection Finding',
] as const
export type WorkOrderSource = (typeof WO_SOURCES)[number]

export const UNIT_TYPES = [
  'Shoplot',
  'Office Suite',
  'Kiosk',
  'Market Stall',
  'Warehouse',
  'Industrial Lot',
  'Land Parcel',
  'Chalet / Resort Unit',
  'Hawker Stall',
] as const
export type UnitType = (typeof UNIT_TYPES)[number]

export const UNIT_STATUSES = [
  'Occupied',
  'Vacant',
  'Under Renovation',
  'Reserved',
  'Legal Action',
] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

export const LEASE_STATUSES = [
  'Active',
  'Expiring Soon',
  'Expired',
  'Renewal In Progress',
  'Terminated',
  'Draft',
] as const
export type LeaseStatus = (typeof LEASE_STATUSES)[number]

export const NOTICE_STAGES = [
  'None',
  'Reminder Sent',
  '1st Notice',
  'Final Notice',
  'Legal Action',
] as const
export type NoticeStage = (typeof NOTICE_STAGES)[number]

export const ROLES = [
  'Group CEO',
  'Asset Manager',
  'Property & Leasing Manager',
  'Facilities Manager',
  'Finance Controller',
  'Technician',
] as const
export type Role = (typeof ROLES)[number]

/** KEJORA operational zones across South East Johor. */
export const ZONES = [
  'Zon Desaru–Penawar',
  'Zon Pengerang–Sungai Rengit',
  'Zon Bandar Tenggara',
  'Zon Bandar Mas–Air Tawar',
  'Zon Sedili–Kota Tinggi',
  'Zon Mersing',
] as const
export type Zone = (typeof ZONES)[number]

export const DEPARTMENTS = [
  'Property Management',
  'Facilities & Maintenance',
  'Land & Development',
  'Tourism & Recreation',
  'Industrial Estates',
  'Corporate Services',
  'Finance',
] as const
export type Department = (typeof DEPARTMENTS)[number]

/* ------------------------------------------------------------------ */
/* Core entities                                                       */
/* ------------------------------------------------------------------ */

export interface GeoPoint {
  lat: number
  lng: number
}

export interface AssetLocation extends GeoPoint {
  zone: Zone
  town: string
  district: string
  address: string
}

export interface LandTitle {
  titleNo: string
  lotNo: string
  mukim: string
  tenure: Tenure
  /** ISO date; undefined for freehold. */
  leaseExpiry?: string
  areaHectares: number
}

export interface BuildingInfo {
  grossFloorAreaSqft: number
  lettableAreaSqft: number
  floors: number
  yearBuilt: number
}

export interface InsurancePolicy {
  policyNo: string
  insurer: string
  /** ISO date */
  expiry: string
  sumInsured: number
}

export interface EsgMetrics {
  energyKwhPerYear: number
  waterM3PerYear: number
  carbonTonnesPerYear: number
  solarReady: boolean
  /** 0–100 */
  greenScore: number
}

export interface AssetDocument {
  id: string
  name: string
  type: 'Title Deed' | 'Valuation Report' | 'Insurance' | 'Warranty' | 'Permit' | 'Floor Plan' | 'Photo' | 'Contract'
  /** ISO date */
  uploadedAt: string
  sizeKb: number
}

export interface Asset {
  id: string
  /** Human readable, e.g. KDH-CP-0042 */
  code: string
  name: string
  category: AssetCategory
  subCategory: string
  status: AssetStatus
  condition: Condition
  /** 0–100 */
  conditionScore: number
  criticality: Criticality
  location: AssetLocation
  /** ISO date */
  acquisitionDate: string
  acquisitionCost: number
  currentValue: number
  accumulatedDepreciation: number
  netBookValue: number
  usefulLifeYears: number
  depreciationMethod: 'Straight Line' | 'Reducing Balance'
  custodianDepartment: Department
  custodianName: string
  ownership: OwnershipType
  landTitle?: LandTitle
  building?: BuildingInfo
  insurance?: InsurancePolicy
  esg?: EsgMetrics
  /** Payload encoded in the printed QR label. */
  qrPayload: string
  tags: string[]
  documents: AssetDocument[]
  /** ISO date */
  lastInspection?: string
  /** ISO date */
  nextInspection?: string
  /** 0–100 utilisation/occupancy of this asset */
  utilisationRate: number
  revenueYtd: number
  opexYtd: number
  /** 0–100, higher = riskier */
  riskScore: number
  /** 0–100 completeness of the record — powers the Data Quality feature. */
  dataQualityScore: number
  notes?: string
  /** ISO datetime */
  createdAt: string
  updatedAt: string
  /** True for records the demo user added during the session. */
  isUserAdded?: boolean
}

export interface WorkOrderEvent {
  /** ISO datetime */
  at: string
  actor: string
  action: string
  note?: string
}

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export interface PartUsed {
  name: string
  qty: number
  unitCost: number
}

export interface WorkOrder {
  id: string
  /** e.g. WO-2026-0148 */
  code: string
  assetId: string
  assetName: string
  assetCode: string
  zone: Zone
  title: string
  description: string
  type: WorkOrderType
  priority: Priority
  status: WorkOrderStatus
  source: WorkOrderSource
  raisedBy: string
  /** ISO datetime */
  raisedAt: string
  assignedTo: string
  team: string
  vendorId?: string
  slaHours: number
  /** ISO datetime */
  slaDueAt: string
  /** ISO datetime */
  respondedAt?: string
  /** ISO datetime */
  completedAt?: string
  slaStatus: SlaStatus
  estimatedCost: number
  actualCost?: number
  downtimeHours: number
  checklist: ChecklistItem[]
  parts: PartUsed[]
  rootCause?: string
  failureCode?: string
  history: WorkOrderEvent[]
  isUserAdded?: boolean
}

export interface PropertyUnit {
  id: string
  code: string
  /** Parent asset (the building / estate). */
  assetId: string
  propertyName: string
  unitNo: string
  type: UnitType
  lettableAreaSqft: number
  floor: string
  status: UnitStatus
  zone: Zone
  town: string
  /** Market rate for benchmarking (RM per sqft per month). */
  marketRatePsf: number
}

export interface Tenant {
  id: string
  name: string
  /** SSM company registration no. */
  ssmNo: string
  contactPerson: string
  phone: string
  email: string
  businessCategory: string
  creditRating: 'A' | 'B' | 'C' | 'D'
  tenantSinceYear: number
}

export interface ArrearsAgeing {
  current: number
  d30: number
  d60: number
  d90: number
  d90plus: number
}

export interface Lease {
  id: string
  /** e.g. LSE-2026-031 */
  code: string
  unitId: string
  unitNo: string
  propertyName: string
  assetId: string
  tenantId: string
  tenantName: string
  businessType: string
  zone: Zone
  /** ISO date */
  startDate: string
  /** ISO date */
  endDate: string
  tenureMonths: number
  monthlyRent: number
  ratePsf: number
  deposit: number
  serviceCharge: number
  status: LeaseStatus
  hasRenewalOption: boolean
  escalationPct: number
  outstandingAmount: number
  daysOverdue: number
  ageing: ArrearsAgeing
  /** ISO date */
  lastPaymentDate?: string
  noticeStage: NoticeStage
  isUserAdded?: boolean
}

export interface Payment {
  id: string
  leaseId: string
  /** YYYY-MM */
  period: string
  amountDue: number
  amountPaid: number
  /** ISO date */
  dueDate: string
  /** ISO date */
  paidDate?: string
  status: 'Paid' | 'Partial' | 'Outstanding' | 'Overdue'
  method?: 'FPX' | 'Cheque' | 'Bank Transfer' | 'Cash' | 'Standing Instruction'
}

export interface Vendor {
  id: string
  name: string
  specialisation: string
  phone: string
  /** 0–5 */
  rating: number
  /** 0–100 */
  slaCompliance: number
  activeWorkOrders: number
  contractExpiry: string
}

export interface Technician {
  id: string
  name: string
  team: string
  zone: Zone
  skills: string[]
  openJobs: number
  /** 0–100 */
  utilisation: number
  avatarInitials: string
}

export interface MaintenanceSchedule {
  id: string
  assetId: string
  assetName: string
  task: string
  frequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Annually'
  /** ISO date */
  nextDue: string
  lastDone?: string
  assignedTeam: string
  isStatutory: boolean
}

export interface AppUser {
  id: string
  name: string
  role: Role
  email: string
  department: Department
  avatarInitials: string
  /** Zones this user may see — drives the RBAC demo. */
  zoneScope: Zone[] | 'all'
}

export interface Notification {
  id: string
  title: string
  body: string
  /** ISO datetime */
  at: string
  severity: 'info' | 'warning' | 'critical' | 'success'
  read: boolean
  /** Route to open when clicked. */
  link?: string
}

export interface AuditEntry {
  id: string
  /** ISO datetime */
  at: string
  actor: string
  action: string
  entity: string
  entityId: string
  detail: string
}

/** Monthly financial roll-up used by dashboard + property charts. */
export interface MonthlyFinancial {
  /** YYYY-MM */
  period: string
  /** Short label e.g. "Jan" */
  label: string
  revenue: number
  target: number
  collections: number
  opex: number
  maintenanceSpend: number
  maintenanceBudget: number
}
