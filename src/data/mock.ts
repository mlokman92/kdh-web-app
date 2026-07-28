/* =====================================================================================
 * KDH One Asset — seeded mock dataset
 * -------------------------------------------------------------------------------------
 * Kejora Development Holding Sdn Bhd (KDH), the corporate arm of Lembaga Kemajuan
 * Johor Tenggara (KEJORA). Everything below is synthetic but internally consistent:
 *
 *   • A single mulberry32 PRNG drives every draw, so the dataset is byte-identical
 *     on every page load (no Math.random anywhere).
 *   • Every date is derived as an offset from NOW, so the demo always looks current.
 *   • Referential integrity is enforced by construction — work orders point at real
 *     assets, leases at real units and tenants, payments at real leases, and the
 *     derived fields (net book value, SLA status, arrears ageing) are computed from
 *     the underlying facts rather than drawn independently.
 *
 * A note on financial scale: MONTHLY_FINANCIALS.revenue is *group* revenue — contracted
 * unit rental plus land lease income, industrial estate charges, tourism operations and
 * service charges. Asset.revenueYtd / opexYtd are apportioned from those same monthly
 * roll-ups so the dashboard and the registry always agree.
 * ===================================================================================== */

import { MAP_BOUNDS, TOWNS, type TownMarker } from '@/lib/geo'
import { formatDate, formatMYR, initials } from '@/lib/format'
import type {
  ArrearsAgeing,
  Asset,
  AssetCategory,
  AssetDocument,
  AssetStatus,
  AppUser,
  AuditEntry,
  BuildingInfo,
  ChecklistItem,
  Condition,
  Criticality,
  Department,
  EsgMetrics,
  InsurancePolicy,
  LandTitle,
  Lease,
  LeaseStatus,
  MaintenanceSchedule,
  MonthlyFinancial,
  Notification,
  NoticeStage,
  OwnershipType,
  PartUsed,
  Payment,
  Priority,
  PropertyUnit,
  SlaStatus,
  Technician,
  Tenant,
  Tenure,
  UnitStatus,
  UnitType,
  Vendor,
  WorkOrder,
  WorkOrderEvent,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
  Zone,
} from '@/lib/types'

/* =====================================================================================
 * 1. Deterministic PRNG + primitive helpers
 * ===================================================================================== */

/** mulberry32 — tiny, fast, fully deterministic. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The one and only entropy source in this file. Seed = "KDH1" in hex. */
const rnd = mulberry32(0x4b444831)

/** Random float in [min, max). */
function rf(min: number, max: number): number {
  return min + rnd() * (max - min)
}

/** Random integer in [min, max] inclusive. */
function ri(min: number, max: number): number {
  return Math.floor(min + rnd() * (max - min + 1))
}

/** Skewed draw — power > 1 clusters towards `min`, power < 1 towards `max`. */
function skew(min: number, max: number, power: number): number {
  return min + Math.pow(rnd(), power) * (max - min)
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]
}

function chance(p: number): boolean {
  return rnd() < p
}

function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length))
}

interface WeightedOption<T> {
  v: T
  w: number
}

function weighted<T>(options: readonly WeightedOption<T>[]): T {
  let total = 0
  for (const o of options) total += o.w
  let r = rnd() * total
  for (const o of options) {
    r -= o.w
    if (r <= 0) return o.v
  }
  return options[options.length - 1].v
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function slugEmail(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(bin|binti|a\/l|a\/p|dato'|datin|datuk|dr\.|hj\.|hjh\.)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join('.')
}

/* =====================================================================================
 * 2. Time anchor — everything is an offset from NOW
 * ===================================================================================== */

/** Single clock reference for the whole dataset. */
export const NOW = new Date()

const MS_HOUR = 3_600_000
const MS_DAY = 86_400_000

function dateHoursFromNow(h: number): Date {
  return new Date(NOW.getTime() + h * MS_HOUR)
}

function dateDaysFromNow(d: number): Date {
  return new Date(NOW.getTime() + d * MS_DAY)
}

/** ISO datetime `n` hours from now (negative = past). */
function isoHoursFromNow(h: number): string {
  return dateHoursFromNow(h).toISOString()
}

/** ISO datetime `n` days from now (negative = past). */
function isoDaysFromNow(d: number): string {
  return dateDaysFromNow(d).toISOString()
}

/** Local calendar date as `YYYY-MM-DD` — avoids UTC drift on date-only fields. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`
}

/** Date-only string `n` days from now. */
function dayFromNow(n: number): string {
  return ymd(dateDaysFromNow(n))
}

/** Date-only string `n` years from now (fractional years allowed). */
function yearFromNow(n: number): string {
  return dayFromNow(n * 365.25)
}

/** First day of the month, `offset` months from the current month. */
function monthStart(offset: number): Date {
  return new Date(NOW.getFullYear(), NOW.getMonth() + offset, 1)
}

/** `YYYY-MM` accounting period. */
function periodOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}`
}

function addMonths(d: Date, months: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + months, d.getDate())
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_DAY)
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/* =====================================================================================
 * 3. Name pools — hand curated so nothing reads as synthetic
 * ===================================================================================== */

const STAFF_NAMES = [
  'Zulkifli bin Rahman',
  'Nurul Aina binti Hassan',
  'Ganesan a/l Muthu',
  'Chong Wei Ming',
  'Siti Zubaidah binti Omar',
  'Ravi a/l Subramaniam',
  'Ng Siew Ling',
  'Amirul Hakim bin Yusof',
  'Faridah binti Ismail',
  'Mohd Syafiq bin Anuar',
  'Tan Boon Hock',
  'Kavitha a/p Nagalingam',
  'Rosnah binti Abu Bakar',
  'Hafiz bin Zainuddin',
  'Sanjay a/l Krishnan',
  'Norhayati binti Salleh',
  'Azman bin Kadir',
  'Wong Mei Fong',
  'Suresh a/l Rajoo',
  'Mohd Faizal bin Daud',
  'Hasnah binti Mokhtar',
  'Lee Kah Wai',
  'Ismail bin Harun',
  'Nor Azlina binti Jaafar',
  'Chandran a/l Perumal',
  'Yap Chee Seng',
  'Rohaizat bin Md Noor',
  'Zainab binti Salim',
  'Teoh Guan Hin',
  'Muthusamy a/l Arumugam',
  'Shahrul Nizam bin Latif',
  'Puteri Sarah binti Zulkarnain',
] as const

const TECHNICIAN_NAMES = [
  'Mohd Rizal bin Karim',
  'Ravi a/l Subramaniam',
  'Lim Chee Keong',
  'Amirul Hakim bin Yusof',
  'Sivakumar a/l Manickam',
  'Tan Wei Jie',
  'Mohd Nazrin bin Salleh',
  'Kumaresan a/l Balan',
  'Chong Wei Ming',
  'Ahmad Syahmi bin Rosli',
  'Loganathan a/l Peruman',
  'Goh Beng Hoe',
  'Mohd Hafizuddin bin Aziz',
  'Vijay a/l Rajendran',
  'Ong Kah Meng',
  'Shamsul Bahri bin Yaakob',
  'Prakash a/l Devan',
  'Yeoh Teik Seng',
  'Mohd Firdaus bin Jamal',
  'Arumugam a/l Krishnan',
  'Lau Chin Wei',
  'Zainal Abidin bin Marzuki',
  'Dinesh a/l Raman',
  'Cheah Wai Loon',
] as const

const TEAMS = [
  'Team Desaru',
  'Team Pengerang',
  'Team Tenggara',
  'Team Bandar Mas',
  'Team Sedili',
  'Team Mersing',
  'Team M&E Pusat',
  'Team Civil & Struktur',
] as const

const SKILL_POOL = [
  'Electrical',
  'HVAC',
  'Plumbing',
  'Genset',
  'Fire Systems',
  'Lift Maintenance',
  'Civil Works',
  'Welding',
  'Painting',
  'Roofing',
  'Water Treatment',
  'CCTV & Access Control',
  'Pump Systems',
  'Cold Room',
] as const

/** [company name, business category] — 96 curated South East Johor SMEs. */
const TENANT_POOL: readonly (readonly [string, string])[] = [
  ['Kedai Runcit Sri Penawar Sdn Bhd', 'Retail — Grocery'],
  ['Restoran Nasi Padang Minang', 'F&B — Restaurant'],
  ['Syarikat Perabot Chin Huat Sdn Bhd', 'Furniture Manufacturing'],
  ['Klinik Desa Murni', 'Healthcare'],
  ['Ganesan Hardware Trading', 'Hardware & Tools'],
  ['Desaru Marine Supplies Sdn Bhd', 'Marine Supplies'],
  ['Pengerang Logistik Sdn Bhd', 'Logistics & Haulage'],
  ['Bengkel Kereta Ah Seng', 'Automotive Workshop'],
  ['Pusat Tuisyen Cemerlang Bandar Mas', 'Education & Tuition'],
  ['Baja & Benih Tenggara Enterprise', 'Agriculture Supplies'],
  ['Butik Warna Warni', 'Textile & Apparel'],
  ['Elektrik Maju Jaya Trading', 'Electrical & Electronics'],
  ['Percetakan Setia Jaya Sdn Bhd', 'Printing & Stationery'],
  ['Salon Cantik Aisyah', 'Beauty & Wellness'],
  ['Mobile Zone Penawar Enterprise', 'Telecommunications'],
  ['Binaan Kota Tinggi Sdn Bhd', 'Construction Services'],
  ['Petro Support Services Sdn Bhd', 'Petrochemical Support'],
  ['Desaru Holiday Travel & Tours', 'Tourism & Travel'],
  ['Roti Canai Pak Din', 'F&B — Stall'],
  ['Kedai Emas Sri Devi', 'Retail — Jewellery'],
  ['Pasaraya Mini Ummi', 'Retail — Grocery'],
  ['Syarikat Ikan Segar Sedili Sdn Bhd', 'Fisheries & Seafood'],
  ['Ladang Sawit Air Tawar Trading', 'Palm Oil Trading'],
  ['Cold Chain Johor Sdn Bhd', 'Cold Storage'],
  ['Farmasi Sihat Bandar Penawar', 'Pharmacy'],
  ['Dobi Express Mersing', 'Laundry Services'],
  ['Studio Gambar Impian', 'Photography & Events'],
  ['Wang Tunai Services Sdn Bhd', 'Money Services'],
  ['Gudang Simpanan Tenggara Sdn Bhd', 'Warehousing'],
  ['Kilang Plastik Hong Leong Sdn Bhd', 'Plastics Manufacturing'],
  ['Restoran Nasi Kandar Ismail', 'F&B — Restaurant'],
  ['Kedai Kopi Ah Lek', 'F&B — Cafe'],
  ['Gerai Nasi Lemak Mak Timah', 'F&B — Stall'],
  ['Ayam Penyet Bang Jali', 'F&B — Stall'],
  ['Muthu Curry House', 'F&B — Restaurant'],
  ['Perniagaan Ikan Kering Sungai Rengit', 'Fisheries & Seafood'],
  ['Syarikat Pengangkutan Lim Bersaudara', 'Logistics & Haulage'],
  ['Kilang Roti Sri Delima Sdn Bhd', 'Bakery & Confectionery'],
  ['Bengkel Motosikal Rahman', 'Automotive Workshop'],
  ['Kedai Basikal Chin Seng', 'Retail — Sports'],
  ['Toko Buku Ilmu Bakti', 'Printing & Stationery'],
  ['Optik Cahaya Mata', 'Healthcare'],
  ['Klinik Pergigian Senyuman', 'Healthcare'],
  ['Syarikat Cat & Hardware Selvam', 'Hardware & Tools'],
  ['Aircond Services Wong Sdn Bhd', 'Facilities Services'],
  ['Pusat Servis Komputer Digital Era', 'ICT Services'],
  ['Perabot Rumah Sri Mawar', 'Retail — Furniture'],
  ['Kedai Bunga Melur', 'Retail — Florist'],
  ['Katering Selera Kampung Sdn Bhd', 'F&B — Catering'],
  ['Sri Ganapathy Textiles', 'Textile & Apparel'],
  ['Butik Muslimah Nur Iman', 'Textile & Apparel'],
  ['Kilang Kayu Perabot Tenggara Sdn Bhd', 'Furniture Manufacturing'],
  ['Syarikat Besi Waja Sdn Bhd', 'Steel Fabrication'],
  ['Pengerang Marine Engineering Sdn Bhd', 'Marine Supplies'],
  ['Bekalan Air Mineral Tirta Sdn Bhd', 'F&B — Manufacturing'],
  ['Ternakan Ayam Sri Tenggara Sdn Bhd', 'Agriculture Supplies'],
  ['Nursery Tanaman Hijau Desaru', 'Agriculture Supplies'],
  ['Kedai Runcit Wan Enterprise', 'Retail — Grocery'],
  ['Pusat Jahitan Kak Ros', 'Textile & Apparel'],
  ['Warung Sate Pak Samad', 'F&B — Stall'],
  ['Gerai Buah Tempatan Hamid', 'F&B — Stall'],
  ['Kedai Ubat Cina Tong Fook', 'Healthcare'],
  ['Syarikat Kontraktor Bina Murni', 'Construction Services'],
  ['Alam Sekitar Waste Management Sdn Bhd', 'Environmental Services'],
  ['Desaru Water Sports Adventure', 'Tourism & Travel'],
  ['Homestay Kampung Sedili Enterprise', 'Tourism & Travel'],
  ['Mersing Island Ferry Services Sdn Bhd', 'Tourism & Travel'],
  ['Syarikat Gas Elpiji Tenggara', 'Retail — Energy'],
  ['Stesen Minyak Bandar Penawar Enterprise', 'Retail — Energy'],
  ['Kilang Ais Sejuk Beku Sdn Bhd', 'Cold Storage'],
  ['Perusahaan Keropok Lekor Endau', 'F&B — Manufacturing'],
  ['Bengkel Kimpalan Ravi', 'Steel Fabrication'],
  ['Perkhidmatan Kebersihan Suci Sdn Bhd', 'Facilities Services'],
  ['Pusat Latihan Memandu Tenggara', 'Education & Tuition'],
  ['Tadika Little Genius', 'Education & Tuition'],
  ['Gym Fitness Kota Tinggi', 'Beauty & Wellness'],
  ['Spa Herba Warisan', 'Beauty & Wellness'],
  ['Kedai Perkakas Rumah Yap', 'Hardware & Tools'],
  ['Syarikat Simen & Batu Bata Johor', 'Construction Services'],
  ['Agensi Pekerjaan Karyawan Sdn Bhd', 'Corporate Services'],
  ['Pejabat Guaman Rahim & Partners', 'Professional Services'],
  ['Firma Akaun Chong & Co', 'Professional Services'],
  ['Ejen Insurans Penawar Enterprise', 'Financial Services'],
  ['Koperasi Kredit Bandar Mas Berhad', 'Financial Services'],
  ['Syarikat Kurier Laju Sdn Bhd', 'Logistics & Haulage'],
  ['Kilang Getah Tenggara Sdn Bhd', 'Rubber Processing'],
  ['Perusahaan Sarung Tangan Latex Sdn Bhd', 'Rubber Processing'],
  ['Syarikat Bekalan Elektrik Amirul', 'Electrical & Electronics'],
  ['Kedai Aksesori Kereta Turbo', 'Automotive Workshop'],
  ['Restoran Tomyam Siam Jaya', 'F&B — Restaurant'],
  ['Gerai Air Tebu Pak Long', 'F&B — Stall'],
  ['Pusat Servis Enjin Marin Sdn Bhd', 'Marine Supplies'],
  ['Peralatan Perubatan Medik Sdn Bhd', 'Healthcare'],
  ['Kilang Pemprosesan Sawit Air Tawar Sdn Bhd', 'Palm Oil Trading'],
  ['Desaru Coast Retail Ventures Sdn Bhd', 'Retail — Grocery'],
  ['Syarikat Papan Lapis Mersing Sdn Bhd', 'Timber & Plywood'],
  ['Bina Sejahtera Engineering Sdn Bhd', 'Construction Services'],
] as const

const VENDOR_POOL: readonly (readonly [string, string])[] = [
  ['Kejuruteraan Penawar Sdn Bhd', 'Mechanical & Electrical'],
  ['Syarikat Elektrik Maju Jaya Sdn Bhd', 'Electrical Systems'],
  ['Chin Huat Aircond & Refrigeration', 'HVAC & Chillers'],
  ['Ganesan Plumbing & Sanitary Works', 'Plumbing & Sanitary'],
  ['Tenggara Fire Protection Sdn Bhd', 'Fire Protection Systems'],
  ['Otis Elevator Malaysia Sdn Bhd', 'Lifts & Escalators'],
  ['Desaru Landscape & Turfing Sdn Bhd', 'Landscaping & Grounds'],
  ['Sri Sedili Cleaning Services Sdn Bhd', 'Cleaning & Janitorial'],
  ['Mersing Marine Engineering Sdn Bhd', 'Marine & Jetty Works'],
  ['Johor Pest Control Services', 'Pest Control'],
  ['Bina Murni Construction Sdn Bhd', 'Civil & Structural'],
  ['Kilat Genset Power Solutions', 'Generators & Standby Power'],
  ['Sekuriti Perdana Guard Services Sdn Bhd', 'Security Services'],
  ['Alam Sekitar Waste Management Sdn Bhd', 'Waste Management'],
  ['Techno Fiber Network Sdn Bhd', 'ICT & Networking'],
  ['Pintar Cat & Renovation Works', 'Painting & Finishes'],
  ['Aqua Treat Water Solutions Sdn Bhd', 'Water Treatment'],
  ['Selvam Roofing & Waterproofing', 'Roofing & Waterproofing'],
] as const

const INSURERS = [
  'MSIG Insurance (Malaysia) Bhd',
  'Etiqa General Insurance Bhd',
  'Allianz General Insurance Company (M) Bhd',
  'Zurich General Insurance Malaysia Bhd',
  'Takaful Ikhlas General Bhd',
  'Lonpac Insurance Bhd',
] as const

const MUKIMS = [
  'Mukim Pantai Timur',
  'Mukim Sedili',
  'Mukim Tenggara',
  'Mukim Pengerang',
  'Mukim Johor Lama',
  'Mukim Kota Tinggi',
  'Mukim Penawar',
  'Mukim Mersing',
  'Mukim Jemaluang',
  'Mukim Padang Endau',
  'Mukim Tanjung Surat',
] as const

const STREETS = [
  'Jalan Utama',
  'Jalan Dagang',
  'Jalan Mawar',
  'Jalan Bunga Raya',
  'Jalan Perdana',
  'Jalan Sentosa',
  'Jalan Bakti',
  'Jalan Kenari',
  'Jalan Melur',
  'Jalan Seri Impian',
] as const

const POSTCODES: Record<string, string> = {
  'Bandar Penawar': '81930',
  Desaru: '81930',
  'Tanjung Balau': '81930',
  'Felda Adela': '81900',
  'Sungai Rengit': '81620',
  Pengerang: '81600',
  'Teluk Ramunia': '81620',
  'Bandar Tenggara': '81440',
  'Bandar Baru Kangkar Pulai': '81300',
  'Felda Taib Andak': '81000',
  'Bandar Mas': '81900',
  'Air Tawar': '81900',
  'Felda Air Tawar 5': '81900',
  'Kota Tinggi': '81900',
  'Sedili Besar': '81907',
  'Sedili Kecil': '81907',
  'Bandar Easter': '81900',
  Mersing: '86800',
  Endau: '86900',
  Jemaluang: '86810',
  Tenglu: '86800',
}

const TAG_POOL = [
  'Income Generating',
  'Strategic Land',
  'Revenue Anchor',
  'High Footfall',
  'Coastal Exposure',
  'Flood Watch',
  'Solar Ready',
  'Statutory Inspection',
  'Zone Flagship',
  'Disposal Candidate',
  'Under Review',
  'Heritage Value',
  'Joint Venture Interest',
  'Community Asset',
  'Tourism Corridor',
  'Industrial Corridor',
] as const

/* =====================================================================================
 * 4. Category configuration
 * ===================================================================================== */

const CATEGORY_CODE: Record<AssetCategory, string> = {
  'Commercial Property': 'CP',
  Industrial: 'IN',
  Land: 'LD',
  'Tourism & Hospitality': 'TH',
  Infrastructure: 'IF',
  'Building & Facility': 'BF',
  'Plant & Equipment': 'PE',
  'ICT & Digital': 'IT',
}

const CATEGORY_DEPARTMENT: Record<AssetCategory, Department> = {
  'Commercial Property': 'Property Management',
  Industrial: 'Industrial Estates',
  Land: 'Land & Development',
  'Tourism & Hospitality': 'Tourism & Recreation',
  Infrastructure: 'Facilities & Maintenance',
  'Building & Facility': 'Facilities & Maintenance',
  'Plant & Equipment': 'Facilities & Maintenance',
  'ICT & Digital': 'Corporate Services',
}

/** Acquisition cost band (RM) + skew, useful life, depreciation method, age band. */
interface CategoryEconomics {
  costMin: number
  costMax: number
  costSkew: number
  usefulLife: number
  reducingBalance: boolean
  ageMin: number
  ageMax: number
  appreciates: boolean
  /** Relative income yield used to apportion group revenue across the portfolio. */
  yieldFactor: number
}

const CATEGORY_ECON: Record<AssetCategory, CategoryEconomics> = {
  'Commercial Property': {
    costMin: 2_400_000, costMax: 21_000_000, costSkew: 1.5, usefulLife: 50,
    reducingBalance: false, ageMin: 3, ageMax: 31, appreciates: true, yieldFactor: 1.0,
  },
  Industrial: {
    costMin: 2_400_000, costMax: 17_000_000, costSkew: 1.4, usefulLife: 40,
    reducingBalance: false, ageMin: 3, ageMax: 28, appreciates: true, yieldFactor: 0.9,
  },
  Land: {
    costMin: 1_200_000, costMax: 21_000_000, costSkew: 1.6, usefulLife: 99,
    reducingBalance: false, ageMin: 6, ageMax: 34, appreciates: true, yieldFactor: 0.18,
  },
  'Tourism & Hospitality': {
    costMin: 3_500_000, costMax: 27_000_000, costSkew: 1.3, usefulLife: 40,
    reducingBalance: false, ageMin: 3, ageMax: 26, appreciates: true, yieldFactor: 1.15,
  },
  Infrastructure: {
    costMin: 900_000, costMax: 17_000_000, costSkew: 1.6, usefulLife: 30,
    reducingBalance: false, ageMin: 4, ageMax: 30, appreciates: false, yieldFactor: 0.12,
  },
  'Building & Facility': {
    costMin: 700_000, costMax: 11_000_000, costSkew: 1.5, usefulLife: 40,
    reducingBalance: false, ageMin: 4, ageMax: 32, appreciates: false, yieldFactor: 0.2,
  },
  'Plant & Equipment': {
    costMin: 120_000, costMax: 3_200_000, costSkew: 1.7, usefulLife: 10,
    reducingBalance: true, ageMin: 1, ageMax: 12, appreciates: false, yieldFactor: 0.1,
  },
  'ICT & Digital': {
    costMin: 60_000, costMax: 2_000_000, costSkew: 1.7, usefulLife: 5,
    reducingBalance: true, ageMin: 1, ageMax: 7, appreciates: false, yieldFactor: 0.05,
  },
}

/** How many assets of each category — 240 in total. */
const CATEGORY_PLAN: readonly (readonly [AssetCategory, number])[] = [
  ['Commercial Property', 58],
  ['Industrial', 30],
  ['Land', 34],
  ['Tourism & Hospitality', 24],
  ['Infrastructure', 26],
  ['Building & Facility', 32],
  ['Plant & Equipment', 24],
  ['ICT & Digital', 12],
]

/* --------------------------------------------------------------------------------- */
/* Asset name blueprints                                                              */
/* --------------------------------------------------------------------------------- */

interface Blueprint {
  sub: string
  make: (town: TownMarker, seq: number) => string
  w: number
  /** Present when the asset is sub-divisible into lettable units. */
  unitType?: UnitType
  unitMin?: number
  unitMax?: number
  hasBuilding: boolean
  hasLand: boolean
}

const FACTORY_TRADES = ['Perabot', 'Plastik', 'Getah', 'Makanan', 'Logam', 'Pemprosesan Sawit'] as const
const SURAU_NAMES = ['Al-Hidayah', 'An-Nur', 'Al-Ikhlas', 'At-Taqwa', 'Al-Falah'] as const
const BLOCK_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

const BLUEPRINTS: Record<AssetCategory, readonly Blueprint[]> = {
  'Commercial Property': [
    { sub: 'Retail Complex', w: 14, unitType: 'Shoplot', unitMin: 6, unitMax: 11, hasBuilding: true, hasLand: true,
      make: (t) => `Kompleks Niaga ${t.name}` },
    { sub: 'Shophouse Row', w: 20, unitType: 'Shoplot', unitMin: 2, unitMax: 4, hasBuilding: true, hasLand: true,
      make: (t) => `Rumah Kedai 2 Tingkat ${pick(STREETS)} ${t.name}` },
    { sub: 'Public Market', w: 12, unitType: 'Market Stall', unitMin: 8, unitMax: 14, hasBuilding: true, hasLand: true,
      make: (t) => `Pasar Awam ${t.name}` },
    { sub: 'Food Court', w: 10, unitType: 'Hawker Stall', unitMin: 5, unitMax: 9, hasBuilding: true, hasLand: true,
      make: (t) => `Medan Selera ${t.name}` },
    { sub: 'Office Tower', w: 6, unitType: 'Office Suite', unitMin: 6, unitMax: 10, hasBuilding: true, hasLand: true,
      make: (t) => `Menara KEJORA ${t.name}` },
    { sub: 'Business Arcade', w: 10, unitType: 'Kiosk', unitMin: 3, unitMax: 6, hasBuilding: true, hasLand: true,
      make: (t) => `Arked Niaga ${t.name}` },
    { sub: 'Commercial Centre', w: 16, unitType: 'Shoplot', unitMin: 5, unitMax: 9, hasBuilding: true, hasLand: true,
      make: (t) => `Pusat Perniagaan ${t.name}` },
    { sub: 'Night Bazaar', w: 8, unitType: 'Kiosk', unitMin: 4, unitMax: 8, hasBuilding: true, hasLand: true,
      make: (t) => `Bazar Karat ${t.name}` },
  ],
  Industrial: [
    { sub: 'Light Industrial Lot', w: 20, unitType: 'Industrial Lot', unitMin: 2, unitMax: 4, hasBuilding: true, hasLand: true,
      make: (t, n) => `Lot Perindustrian PTD ${1200 + n * 7} Kawasan Perindustrian ${t.name}` },
    { sub: 'Factory Building', w: 18, unitType: 'Industrial Lot', unitMin: 1, unitMax: 3, hasBuilding: true, hasLand: true,
      make: (t, n) => `Kilang ${pick(FACTORY_TRADES)} Lot ${8 + (n % 22)} Kawasan Perindustrian ${t.name}` },
    { sub: 'Warehouse', w: 16, unitType: 'Warehouse', unitMin: 1, unitMax: 3, hasBuilding: true, hasLand: true,
      make: (t) => `Gudang Berhawa Dingin ${t.name}` },
    { sub: 'Industrial Estate Parcel', w: 12, unitType: 'Land Parcel', unitMin: 2, unitMax: 5, hasBuilding: false, hasLand: true,
      make: (t, n) => `Kawasan Perindustrian ${t.name} Fasa ${1 + (n % 4)}` },
    { sub: 'Logistics Hub', w: 10, unitType: 'Warehouse', unitMin: 2, unitMax: 5, hasBuilding: true, hasLand: true,
      make: (t) => `Pusat Logistik & Pengedaran ${t.name}` },
    { sub: 'Workshop Block', w: 12, unitType: 'Industrial Lot', unitMin: 1, unitMax: 3, hasBuilding: true, hasLand: true,
      make: (t) => `Blok Bengkel Sederhana ${t.name}` },
  ],
  Land: [
    { sub: 'Oil Palm Estate', w: 22, hasBuilding: false, hasLand: true,
      make: (t, n) => `Ladang Kelapa Sawit ${t.name} Blok ${1 + (n % 9)}` },
    { sub: 'Development Land', w: 20, hasBuilding: false, hasLand: true,
      make: (t, n) => `Tanah Pembangunan ${t.name} Fasa ${1 + (n % 5)}` },
    { sub: 'Agricultural Reserve', w: 14, hasBuilding: false, hasLand: true,
      make: (t, n) => `Tanah Rizab Pertanian ${t.name} Lot ${2100 + n * 11}` },
    { sub: 'Strategic Land Bank', w: 16, hasBuilding: false, hasLand: true,
      make: (t) => `Bank Tanah Strategik ${t.name}` },
    { sub: 'Mixed Development Site', w: 14, hasBuilding: false, hasLand: true,
      make: (t) => `Tapak Pembangunan Bercampur ${t.name}` },
    { sub: 'Rubber Estate', w: 10, hasBuilding: false, hasLand: true,
      make: (t, n) => `Ladang Getah ${t.name} Blok ${1 + (n % 6)}` },
  ],
  'Tourism & Hospitality': [
    { sub: 'Resort Chalets', w: 22, unitType: 'Chalet / Resort Unit', unitMin: 4, unitMax: 8, hasBuilding: true, hasLand: true,
      make: (t, n) => `Chalet Peranginan ${t.name} Blok ${BLOCK_LETTERS[n % BLOCK_LETTERS.length]}` },
    { sub: 'Beach Resort Block', w: 14, unitType: 'Chalet / Resort Unit', unitMin: 5, unitMax: 9, hasBuilding: true, hasLand: true,
      make: (t, n) => `Desaru Coast Chalet Block ${BLOCK_LETTERS[n % BLOCK_LETTERS.length]}` },
    { sub: 'Recreation Centre', w: 14, hasBuilding: true, hasLand: true,
      make: (t) => `Pusat Rekreasi ${t.name}` },
    { sub: 'Tourism Complex', w: 14, unitType: 'Kiosk', unitMin: 3, unitMax: 6, hasBuilding: true, hasLand: true,
      make: (t) => `Kompleks Pelancongan ${t.name}` },
    { sub: 'Homestay Cluster', w: 16, unitType: 'Chalet / Resort Unit', unitMin: 3, unitMax: 6, hasBuilding: true, hasLand: true,
      make: (t) => `Homestay Kampung ${t.name}` },
    { sub: 'Golf & Leisure', w: 8, hasBuilding: true, hasLand: true,
      make: (t) => `Padang Golf & Rekreasi ${t.name}` },
    { sub: 'Marine Tourism Facility', w: 12, hasBuilding: true, hasLand: true,
      make: (t) => `Pusat Pelancongan Marin ${t.name}` },
  ],
  Infrastructure: [
    { sub: 'Fishing Jetty', w: 14, hasBuilding: false, hasLand: true, make: (t) => `Jeti Nelayan ${t.name}` },
    { sub: 'Water Treatment Plant', w: 10, hasBuilding: true, hasLand: true, make: (t) => `Loji Rawatan Air ${t.name}` },
    { sub: 'Industrial Access Road', w: 14, hasBuilding: false, hasLand: true,
      make: (t, n) => `Jalan Perusahaan ${t.name} Fasa ${1 + (n % 4)}` },
    { sub: 'Drainage System', w: 10, hasBuilding: false, hasLand: false, make: (t) => `Sistem Perparitan Utama ${t.name}` },
    { sub: 'Solid Waste Transfer', w: 8, hasBuilding: true, hasLand: true, make: (t) => `Pusat Pemindahan Sisa Pepejal ${t.name}` },
    { sub: 'Bridge', w: 8, hasBuilding: false, hasLand: false, make: (t) => `Jambatan Sungai ${t.name}` },
    { sub: 'Bus Terminal', w: 12, hasBuilding: true, hasLand: true, make: (t) => `Terminal Bas ${t.name}` },
    { sub: 'Telecommunications Tower', w: 12, hasBuilding: false, hasLand: true, make: (t) => `Menara Telekomunikasi ${t.name}` },
    { sub: 'Street Lighting Network', w: 12, hasBuilding: false, hasLand: false,
      make: (t, n) => `Sistem Lampu Jalan ${t.name} Fasa ${1 + (n % 3)}` },
  ],
  'Building & Facility': [
    { sub: 'Community Hall', w: 18, hasBuilding: true, hasLand: true, make: (t) => `Dewan Serbaguna ${t.name}` },
    { sub: 'Surau', w: 12, hasBuilding: true, hasLand: true, make: (t) => `Surau ${pick(SURAU_NAMES)} ${t.name}` },
    { sub: 'Sports Complex', w: 10, hasBuilding: true, hasLand: true, make: (t) => `Kompleks Sukan ${t.name}` },
    { sub: 'Community Centre', w: 12, hasBuilding: true, hasLand: true, make: (t) => `Balai Raya ${t.name}` },
    { sub: 'Zone Office', w: 10, hasBuilding: true, hasLand: true, make: (t) => `Pejabat Zon KEJORA ${t.name}` },
    { sub: 'Staff Quarters', w: 12, hasBuilding: true, hasLand: true, make: (t) => `Rumah Kuarters Pekerja ${t.name}` },
    { sub: 'Public Library', w: 8, hasBuilding: true, hasLand: true, make: (t) => `Perpustakaan Awam ${t.name}` },
    { sub: 'Kindergarten', w: 8, hasBuilding: true, hasLand: true, make: (t) => `Tabika KEMAS ${t.name}` },
    { sub: 'Guard House', w: 6, hasBuilding: true, hasLand: false, make: (t) => `Pondok Pengawal ${t.name}` },
    { sub: 'Public Amenity', w: 8, hasBuilding: true, hasLand: false, make: (t) => `Tandas Awam & Surau Rehat ${t.name}` },
  ],
  'Plant & Equipment': [
    { sub: 'Generator Set', w: 16, hasBuilding: false, hasLand: false, make: (t) => `Set Janakuasa Cummins 500kVA — ${t.name}` },
    { sub: 'Central Chiller Plant', w: 12, hasBuilding: false, hasLand: false, make: (t) => `Sistem Penyaman Udara Berpusat — Kompleks ${t.name}` },
    { sub: 'Passenger Lift', w: 12, hasBuilding: false, hasLand: false, make: (t) => `Lif Penumpang Otis — ${t.name}` },
    { sub: 'Heavy Machinery', w: 12, hasBuilding: false, hasLand: false, make: (t) => `Jentera Pengorek Komatsu PC200 — ${t.name}` },
    { sub: 'Refuse Compactor Truck', w: 12, hasBuilding: false, hasLand: false,
      make: (t, n) => `Lori Sampah Compactor JHK ${4100 + n * 3} — ${t.name}` },
    { sub: 'Water Pump Set', w: 12, hasBuilding: false, hasLand: false, make: (t) => `Pam Air Grundfos — Loji ${t.name}` },
    { sub: 'Fire Alarm System', w: 12, hasBuilding: false, hasLand: false, make: (t) => `Sistem Penggera Kebakaran — ${t.name}` },
    { sub: 'Landscaping Fleet', w: 12, hasBuilding: false, hasLand: false, make: (t) => `Jentera Landskap & Pemotong Rumput — ${t.name}` },
  ],
  'ICT & Digital': [
    { sub: 'Server Infrastructure', w: 14, hasBuilding: false, hasLand: false,
      make: (t, n) => `Pelayan Pusat Data KEJORA — Rak ${pad(1 + (n % 9), 2)}` },
    { sub: 'CCTV & Surveillance', w: 18, hasBuilding: false, hasLand: false, make: (t) => `Sistem CCTV 32-Saluran — ${t.name}` },
    { sub: 'Fibre Network', w: 14, hasBuilding: false, hasLand: false, make: (t) => `Rangkaian Fiber Optik ${t.name}` },
    { sub: 'Access Control', w: 14, hasBuilding: false, hasLand: false, make: (t) => `Sistem Kawalan Akses — ${t.name}` },
    { sub: 'Digital Service Kiosk', w: 14, hasBuilding: false, hasLand: false, make: (t) => `Kiosk Perkhidmatan Digital ${t.name}` },
    { sub: 'Digital Signage', w: 14, hasBuilding: false, hasLand: false, make: (t) => `Papan Tanda Digital LED ${t.name}` },
    { sub: 'Enterprise Software Licence', w: 6, hasBuilding: false, hasLand: false,
      make: () => `Lesen Korporat Sistem Pengurusan Aset One Asset` },
  ],
}

/* =====================================================================================
 * 5. Town weighting + geo placement
 * ===================================================================================== */

const TOWN_WEIGHTS: Record<string, number> = {
  'Bandar Penawar': 16,
  Desaru: 11,
  'Tanjung Balau': 5,
  'Felda Adela': 4,
  'Sungai Rengit': 9,
  Pengerang: 9,
  'Teluk Ramunia': 4,
  'Bandar Tenggara': 9,
  'Bandar Baru Kangkar Pulai': 4,
  'Felda Taib Andak': 3,
  'Bandar Mas': 8,
  'Air Tawar': 5,
  'Felda Air Tawar 5': 3,
  'Kota Tinggi': 7,
  'Sedili Besar': 5,
  'Sedili Kecil': 3,
  'Bandar Easter': 3,
  Mersing: 8,
  Endau: 3,
  Jemaluang: 3,
  Tenglu: 2,
}

const TOWN_OPTIONS: readonly WeightedOption<TownMarker>[] = TOWNS.map((t) => ({
  v: t,
  w: TOWN_WEIGHTS[t.name] ?? 3,
}))

/** Jitter around a town centre, clamped inside MAP_BOUNDS. */
function placeNear(town: TownMarker): { lat: number; lng: number } {
  const m = 0.014
  const lat = clamp(town.lat + rf(-0.02, 0.02), MAP_BOUNDS.minLat + m, MAP_BOUNDS.maxLat - m)
  const lng = clamp(town.lng + rf(-0.02, 0.02), MAP_BOUNDS.minLng + m, MAP_BOUNDS.maxLng - m)
  return { lat: Number(lat.toFixed(5)), lng: Number(lng.toFixed(5)) }
}

/* =====================================================================================
 * 6. ASSETS — 240 records across 8 categories and 6 zones
 * ===================================================================================== */

const CONDITION_BANDS: Record<Condition, readonly [number, number]> = {
  Excellent: [90, 100],
  Good: [75, 89],
  Fair: [60, 74],
  Poor: [40, 59],
  Critical: [22, 39],
}

const CONDITION_OPTIONS: readonly WeightedOption<Condition>[] = [
  { v: 'Excellent', w: 17 },
  { v: 'Good', w: 41 },
  { v: 'Fair', w: 26 },
  { v: 'Poor', w: 11 },
  { v: 'Critical', w: 5 },
]

const CRITICALITY_OPTIONS: readonly WeightedOption<Criticality>[] = [
  { v: 'Critical', w: 9 },
  { v: 'High', w: 26 },
  { v: 'Medium', w: 43 },
  { v: 'Low', w: 22 },
]

const OWNERSHIP_OPTIONS: readonly WeightedOption<OwnershipType>[] = [
  { v: 'Owned', w: 74 },
  { v: 'Joint Venture', w: 12 },
  { v: 'Trust / Custodian', w: 9 },
  { v: 'Leased-in', w: 5 },
]

const TENURE_OPTIONS: readonly WeightedOption<Tenure>[] = [
  { v: 'Freehold', w: 30 },
  { v: 'Leasehold 99yr', w: 42 },
  { v: 'Leasehold 66yr', w: 20 },
  { v: 'Leasehold 30yr', w: 8 },
]

const TENURE_YEARS: Record<Tenure, number> = {
  Freehold: 0,
  'Leasehold 99yr': 99,
  'Leasehold 66yr': 66,
  'Leasehold 30yr': 30,
}

function statusFor(category: AssetCategory): AssetStatus {
  switch (category) {
    case 'Commercial Property':
      return weighted<AssetStatus>([
        { v: 'Leased', w: 58 },
        { v: 'Active', w: 20 },
        { v: 'Vacant', w: 8 },
        { v: 'Under Maintenance', w: 8 },
        { v: 'Under Construction', w: 4 },
        { v: 'Idle', w: 2 },
      ])
    case 'Industrial':
      return weighted<AssetStatus>([
        { v: 'Leased', w: 56 },
        { v: 'Active', w: 22 },
        { v: 'Vacant', w: 10 },
        { v: 'Under Maintenance', w: 6 },
        { v: 'Under Construction', w: 6 },
      ])
    case 'Land':
      return weighted<AssetStatus>([
        { v: 'Active', w: 44 },
        { v: 'Leased', w: 26 },
        { v: 'Idle', w: 22 },
        { v: 'Under Construction', w: 6 },
        { v: 'Disposed', w: 2 },
      ])
    case 'Tourism & Hospitality':
      return weighted<AssetStatus>([
        { v: 'Active', w: 40 },
        { v: 'Leased', w: 34 },
        { v: 'Under Maintenance', w: 12 },
        { v: 'Vacant', w: 8 },
        { v: 'Under Construction', w: 6 },
      ])
    case 'Plant & Equipment':
      return weighted<AssetStatus>([
        { v: 'Active', w: 68 },
        { v: 'Under Maintenance', w: 18 },
        { v: 'Idle', w: 10 },
        { v: 'Disposed', w: 4 },
      ])
    case 'ICT & Digital':
      return weighted<AssetStatus>([
        { v: 'Active', w: 78 },
        { v: 'Under Maintenance', w: 12 },
        { v: 'Idle', w: 8 },
        { v: 'Disposed', w: 2 },
      ])
    default:
      return weighted<AssetStatus>([
        { v: 'Active', w: 70 },
        { v: 'Under Maintenance', w: 14 },
        { v: 'Idle', w: 8 },
        { v: 'Under Construction', w: 6 },
        { v: 'Leased', w: 2 },
      ])
  }
}

const DOC_TEMPLATES: readonly (readonly [AssetDocument['type'], string, number, number])[] = [
  ['Title Deed', 'Geran Hakmilik Tanah', 240, 900],
  ['Valuation Report', 'Laporan Penilaian JPPH', 1200, 5200],
  ['Insurance', 'Polisi Insurans Harta', 320, 980],
  ['Warranty', 'Sijil Waranti Peralatan', 180, 640],
  ['Permit', 'Permit Bomba & Sijil Kelayakan Menduduki', 410, 1500],
  ['Floor Plan', 'Pelan Lantai Berdaftar', 1800, 7400],
  ['Photo', 'Foto Pemeriksaan Tapak', 900, 4200],
  ['Contract', 'Kontrak Penyelenggaraan Tahunan', 260, 1100],
]

function makeDocuments(assetSeq: number, count: number): AssetDocument[] {
  const picks = pickN(DOC_TEMPLATES, count)
  return picks.map((tpl, i) => ({
    id: `doc-${pad(assetSeq, 4)}-${pad(i + 1, 2)}`,
    name: `${tpl[1]} (${2019 + ri(0, 7)})`,
    type: tpl[0],
    uploadedAt: isoDaysFromNow(-ri(20, 1500)),
    sizeKb: ri(tpl[2], tpl[3]),
  }))
}

function makeLandTitle(category: AssetCategory, acqYear: number): LandTitle {
  const tenure = weighted(TENURE_OPTIONS)
  const years = TENURE_YEARS[tenure]
  const grantYear = acqYear - ri(0, 22)
  const areaHectares =
    category === 'Land'
      ? Number(skew(2.4, 420, 1.9).toFixed(2))
      : category === 'Industrial'
        ? Number(skew(0.6, 22, 1.5).toFixed(2))
        : Number(skew(0.08, 6.5, 1.6).toFixed(2))
  const prefix = pick(['GRN', 'HSD', 'PN', 'GM'] as const)
  return {
    titleNo: `${prefix} ${ri(10_000, 89_999)}`,
    lotNo: chance(0.65) ? `PTD ${ri(1200, 9800)}` : `Lot ${ri(120, 4800)}`,
    mukim: pick(MUKIMS),
    tenure,
    leaseExpiry: years === 0 ? undefined : `${grantYear + years}-06-30`,
    areaHectares,
  }
}

function makeBuilding(category: AssetCategory, acqYear: number): BuildingInfo {
  const gross =
    category === 'Commercial Property'
      ? roundTo(skew(4_200, 148_000, 1.6), 100)
      : category === 'Industrial'
        ? roundTo(skew(9_000, 210_000, 1.5), 100)
        : category === 'Tourism & Hospitality'
          ? roundTo(skew(5_000, 96_000, 1.5), 100)
          : roundTo(skew(1_800, 42_000, 1.7), 100)
  return {
    grossFloorAreaSqft: gross,
    lettableAreaSqft: roundTo(gross * rf(0.76, 0.93), 50),
    floors: category === 'Commercial Property' ? ri(1, 8) : ri(1, 3),
    yearBuilt: clamp(acqYear - ri(0, 6), 1978, NOW.getFullYear()),
  }
}

function makeInsurance(seq: number, currentValue: number): InsurancePolicy {
  return {
    policyNo: `KDH/${pick(['FIR', 'IAR', 'PAR', 'MAC'] as const)}/${NOW.getFullYear()}/${pad(seq, 4)}`,
    insurer: pick(INSURERS),
    expiry: dayFromNow(ri(-70, 340)),
    sumInsured: roundTo(currentValue * rf(0.58, 1.02), 10_000),
  }
}

function makeEsg(gross: number): EsgMetrics {
  const energy = roundTo(gross * rf(7, 24), 100)
  return {
    energyKwhPerYear: energy,
    waterM3PerYear: roundTo(gross * rf(0.05, 0.28), 10),
    carbonTonnesPerYear: Number((energy * 0.000585).toFixed(1)),
    solarReady: chance(0.42),
    greenScore: ri(28, 93),
  }
}

interface UnitCapability {
  unitType: UnitType
  min: number
  max: number
}

const unitCapability = new Map<string, UnitCapability>()
const usedAssetNames = new Set<string>()

function uniqueName(base: string): string {
  if (!usedAssetNames.has(base)) {
    usedAssetNames.add(base)
    return base
  }
  for (let phase = 2; phase < 40; phase++) {
    const candidate = `${base} Fasa ${phase}`
    if (!usedAssetNames.has(candidate)) {
      usedAssetNames.add(candidate)
      return candidate
    }
  }
  const fallback = `${base} (${usedAssetNames.size})`
  usedAssetNames.add(fallback)
  return fallback
}

function buildAssets(): Asset[] {
  // Interleave categories so the registry list never looks batched.
  const plan: AssetCategory[] = []
  for (const [cat, count] of CATEGORY_PLAN) {
    for (let i = 0; i < count; i++) plan.push(cat)
  }
  const order = shuffle(plan)

  const catCounter: Record<string, number> = {}
  const out: Asset[] = []

  order.forEach((category, index) => {
    const seq = index + 1
    catCounter[category] = (catCounter[category] ?? 0) + 1
    const code = `KDH-${CATEGORY_CODE[category]}-${pad(catCounter[category], 4)}`
    const id = `ast-${pad(seq, 4)}`

    const town = weighted(TOWN_OPTIONS)
    const point = placeNear(town)
    const bp = weighted(BLUEPRINTS[category].map((b) => ({ v: b, w: b.w })))
    const name = uniqueName(bp.make(town, seq))

    const econ = CATEGORY_ECON[category]
    const ageYears = Number(rf(econ.ageMin, econ.ageMax).toFixed(2))
    const acquisitionDate = yearFromNow(-ageYears)
    const acqYear = Number(acquisitionDate.slice(0, 4))
    const acquisitionCost = roundTo(skew(econ.costMin, econ.costMax, econ.costSkew), 1000)

    const landTitle = bp.hasLand ? makeLandTitle(category, acqYear) : undefined
    const isFreeholdLand = category === 'Land' && landTitle?.tenure === 'Freehold'
    const amortiseYears = category === 'Land' ? TENURE_YEARS[landTitle?.tenure ?? 'Leasehold 99yr'] || 99 : econ.usefulLife

    let accumulated: number
    if (isFreeholdLand) {
      accumulated = 0 // Land held freehold is not depreciated.
    } else if (econ.reducingBalance) {
      accumulated = acquisitionCost * (1 - Math.pow(0.8, ageYears))
    } else {
      accumulated = (acquisitionCost * ageYears) / amortiseYears
    }
    accumulated = roundTo(clamp(accumulated, 0, acquisitionCost * 0.95), 1000)
    const netBookValue = acquisitionCost - accumulated

    let currentValue: number
    if (econ.appreciates) {
      currentValue = clamp(
        acquisitionCost * Math.pow(1 + rf(0.019, 0.055), ageYears),
        acquisitionCost * 0.85,
        acquisitionCost * 3.4,
      )
    } else if (category === 'Plant & Equipment' || category === 'ICT & Digital') {
      currentValue = Math.max(netBookValue * rf(0.85, 1.15), acquisitionCost * 0.05)
    } else {
      currentValue = Math.max(netBookValue, acquisitionCost * rf(0.7, 1.3))
    }
    currentValue = roundTo(currentValue, 1000)

    const condition = weighted(CONDITION_OPTIONS)
    const band = CONDITION_BANDS[condition]
    const conditionScore = ri(band[0], band[1])
    const criticality = weighted(CRITICALITY_OPTIONS)
    const status = statusFor(category)

    const lowQuality = chance(0.15)
    const dataQualityScore = lowQuality ? ri(34, 69) : ri(72, 100)

    const building = bp.hasBuilding && !(lowQuality && chance(0.4)) ? makeBuilding(category, acqYear) : undefined
    const insurance = !lowQuality && chance(0.92) ? makeInsurance(seq, currentValue) : lowQuality && chance(0.35) ? makeInsurance(seq, currentValue) : undefined
    const esg =
      building && !lowQuality && chance(0.72)
        ? makeEsg(building.grossFloorAreaSqft)
        : undefined

    const criticalityRisk: Record<Criticality, number> = { Critical: 22, High: 14, Medium: 7, Low: 2 }
    const riskScore = clamp(
      Math.round(
        (100 - conditionScore) * 0.62 +
          criticalityRisk[criticality] +
          (insurance ? 0 : 9) +
          (dataQualityScore < 70 ? 6 : 0) +
          rf(-5, 5),
      ),
      3,
      99,
    )

    const utilisationRate =
      status === 'Under Construction' || status === 'Disposed'
        ? 0
        : status === 'Idle'
          ? ri(0, 18)
          : status === 'Vacant'
            ? ri(4, 32)
            : category === 'Land'
              ? ri(12, 72)
              : category === 'Commercial Property' || category === 'Industrial'
                ? ri(58, 99)
                : ri(42, 96)

    const tags = pickN(TAG_POOL, ri(2, 4))
    if (status === 'Leased') tags.push('Income Generating')
    if (category === 'Land' && chance(0.4)) tags.push('Strategic Land')

    const hasInspection = !lowQuality || chance(0.4)
    const lastInspection = hasInspection ? dayFromNow(-ri(8, 400)) : undefined
    const nextInspection = hasInspection ? dayFromNow(ri(-25, 320)) : undefined

    const asset: Asset = {
      id,
      code,
      name,
      category,
      subCategory: bp.sub,
      status,
      condition,
      conditionScore,
      criticality,
      location: {
        lat: point.lat,
        lng: point.lng,
        zone: town.zone,
        town: town.name,
        district: town.district,
        address: `${landTitle ? landTitle.lotNo : `No. ${ri(1, 88)}`}, ${pick(STREETS)}, ${POSTCODES[town.name] ?? '81900'} ${town.name}, Johor`,
      },
      acquisitionDate,
      acquisitionCost,
      currentValue,
      accumulatedDepreciation: accumulated,
      netBookValue,
      usefulLifeYears: category === 'Land' ? amortiseYears : econ.usefulLife,
      depreciationMethod: econ.reducingBalance ? 'Reducing Balance' : 'Straight Line',
      custodianDepartment: CATEGORY_DEPARTMENT[category],
      custodianName: pick(STAFF_NAMES),
      ownership: weighted(OWNERSHIP_OPTIONS),
      landTitle,
      building,
      insurance,
      esg,
      qrPayload: `https://oneasset.kdh.com.my/qr/${code}`,
      tags: Array.from(new Set(tags)),
      documents: makeDocuments(seq, lowQuality ? ri(0, 2) : ri(3, 6)),
      lastInspection,
      nextInspection,
      utilisationRate,
      revenueYtd: 0, // apportioned from MONTHLY_FINANCIALS below
      opexYtd: 0,
      riskScore,
      dataQualityScore,
      notes: chance(0.38)
        ? pick([
            'Struktur bumbung dijadualkan untuk pemeriksaan menyeluruh suku berikutnya.',
            'Cadangan naik taraf pendawaian elektrik telah dikemukakan kepada Jawatankuasa Aset.',
            'Kawasan pantai — pemeriksaan kakisan dua kali setahun diwajibkan.',
            'Sebahagian ruang dikhaskan untuk program keusahawanan belia KEJORA.',
            'Perjanjian usaha sama sedang dalam semakan Bahagian Undang-undang.',
            'Data hakmilik menunggu pengesahan Pejabat Tanah Kota Tinggi.',
            'Aset ini disenaraikan dalam Pelan Pembangunan Strategik KEJORA 2026–2030.',
          ])
        : undefined,
      createdAt: isoDaysFromNow(-ri(400, 2200)),
      updatedAt: isoDaysFromNow(-ri(0, 180)),
    }

    if (bp.unitType && status !== 'Under Construction' && status !== 'Disposed') {
      unitCapability.set(id, { unitType: bp.unitType, min: bp.unitMin ?? 1, max: bp.unitMax ?? 3 })
    }

    out.push(asset)
  })

  return out
}

/** 240 assets — the factual backbone of the whole application. */
export const ASSETS: Asset[] = buildAssets()

export const ASSET_BY_ID: Map<string, Asset> = new Map(ASSETS.map((a) => [a.id, a]))

/* =====================================================================================
 * 7. MONTHLY_FINANCIALS — 24 months ending with the current month
 * ===================================================================================== */

function buildMonthlyFinancials(): MonthlyFinancial[] {
  const out: MonthlyFinancial[] = []
  // Seasonal wobble by calendar month — festive trading (Ramadan/Raya, year-end) lifts
  // retail turnover rent; the north-east monsoon (Nov–Jan) softens tourism.
  const seasonal = [0.97, 1.03, 1.06, 1.04, 0.99, 1.01, 1.02, 0.98, 1.0, 1.03, 0.95, 0.94]

  for (let i = 23; i >= 0; i--) {
    const d = monthStart(-i)
    const t = 23 - i
    const trend = 2_780_000 * Math.pow(1.0135, t)
    const revenue = roundTo(trend * seasonal[d.getMonth()] * rf(0.975, 1.03), 1000)
    const target = roundTo(trend * 1.025, 5000)
    const collections = roundTo(revenue * rf(0.902, 0.994), 1000)
    const opex = roundTo(revenue * rf(0.355, 0.452), 1000)
    const maintenanceSpend = roundTo(revenue * rf(0.098, 0.163), 1000)
    const maintenanceBudget = roundTo(trend * 0.132, 5000)

    out.push({
      period: periodOf(d),
      label: MONTH_SHORT[d.getMonth()],
      revenue,
      target,
      collections,
      opex,
      maintenanceSpend,
      maintenanceBudget,
    })
  }
  return out
}

/** 24 monthly roll-ups, oldest first, ending with the current month. */
export const MONTHLY_FINANCIALS: MonthlyFinancial[] = buildMonthlyFinancials()

/* --- Apportion year-to-date revenue / opex across the portfolio ------------------- */
{
  const year = String(NOW.getFullYear())
  const ytd = MONTHLY_FINANCIALS.filter((m) => m.period.startsWith(year))
  const ytdRevenue = ytd.reduce((s, m) => s + m.revenue, 0)
  const ytdOpex = ytd.reduce((s, m) => s + m.opex + m.maintenanceSpend, 0)

  const weights = ASSETS.map((a) => {
    if (a.status === 'Under Construction' || a.status === 'Disposed') return 0
    const yieldFactor = CATEGORY_ECON[a.category].yieldFactor
    return (a.currentValue / 1_000_000) * yieldFactor * (0.35 + a.utilisationRate / 100)
  })
  const totalWeight = weights.reduce((s, w) => s + w, 0)

  let revAllocated = 0
  let opexAllocated = 0
  let largestIndex = 0
  ASSETS.forEach((a, i) => {
    const share = totalWeight > 0 ? weights[i] / totalWeight : 0
    a.revenueYtd = roundTo(ytdRevenue * share, 100)
    // Every asset carries some opex, even the ones that earn nothing.
    a.opexYtd = roundTo(ytdOpex * (share * 0.82 + (1 / ASSETS.length) * 0.18), 100)
    revAllocated += a.revenueYtd
    opexAllocated += a.opexYtd
    if (weights[i] > weights[largestIndex]) largestIndex = i
  })
  // Absorb rounding drift so the registry totals reconcile with the dashboard.
  ASSETS[largestIndex].revenueYtd += ytdRevenue - revAllocated
  ASSETS[largestIndex].opexYtd += ytdOpex - opexAllocated
}

/* =====================================================================================
 * 8. PROPERTY UNITS — 260 lettable units inside the property-type assets
 * ===================================================================================== */

interface UnitSpec {
  areaMin: number
  areaMax: number
  areaSkew: number
  psfMin: number
  psfMax: number
  floors: readonly string[]
}

const UNIT_SPECS: Record<UnitType, UnitSpec> = {
  Shoplot: { areaMin: 780, areaMax: 2400, areaSkew: 1.25, psfMin: 1.5, psfMax: 3.1, floors: ['Ground', 'Level 1'] },
  'Office Suite': { areaMin: 480, areaMax: 2800, areaSkew: 1.25, psfMin: 2.1, psfMax: 3.8, floors: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'] },
  Kiosk: { areaMin: 90, areaMax: 280, areaSkew: 1.2, psfMin: 4.8, psfMax: 10, floors: ['Ground', 'Mezzanine'] },
  'Market Stall': { areaMin: 90, areaMax: 320, areaSkew: 1.2, psfMin: 3.2, psfMax: 6.5, floors: ['Ground'] },
  Warehouse: { areaMin: 6000, areaMax: 26_000, areaSkew: 1.3, psfMin: 0.95, psfMax: 1.7, floors: ['Ground'] },
  'Industrial Lot': { areaMin: 15_000, areaMax: 70_000, areaSkew: 1.15, psfMin: 0.55, psfMax: 1.15, floors: ['Ground'] },
  'Land Parcel': { areaMin: 55_000, areaMax: 300_000, areaSkew: 1.25, psfMin: 0.07, psfMax: 0.2, floors: ['Ground'] },
  'Chalet / Resort Unit': { areaMin: 460, areaMax: 1600, areaSkew: 1.25, psfMin: 2.6, psfMax: 5.2, floors: ['Ground', 'Level 1'] },
  'Hawker Stall': { areaMin: 110, areaMax: 280, areaSkew: 1.2, psfMin: 3.0, psfMax: 6.0, floors: ['Ground'] },
}

function unitNumberFor(type: UnitType, k: number, blockSeed: number): { unitNo: string; floor: string } {
  const spec = UNIT_SPECS[type]
  switch (type) {
    case 'Office Suite': {
      const level = 1 + Math.floor((k - 1) / 4)
      return { unitNo: `${pad(level, 2)}-${pad(((k - 1) % 4) + 1, 2)}`, floor: `Level ${level}` }
    }
    case 'Industrial Lot':
      return { unitNo: `Lot ${1 + (blockSeed % 40)}-${pad(k, 2)}`, floor: 'Ground' }
    case 'Land Parcel':
      return { unitNo: `Parcel ${BLOCK_LETTERS[blockSeed % 6]}${pad(k, 2)}`, floor: 'Ground' }
    case 'Warehouse':
      return { unitNo: `W-${pad(k, 2)}`, floor: 'Ground' }
    case 'Market Stall':
      return { unitNo: `G-${pad(k, 2)}`, floor: 'Ground' }
    case 'Hawker Stall':
      return { unitNo: `MS-${pad(k, 2)}`, floor: 'Ground' }
    case 'Kiosk':
      return { unitNo: `K-${pad(k, 2)}`, floor: pick(spec.floors) }
    case 'Chalet / Resort Unit':
      return { unitNo: `${BLOCK_LETTERS[blockSeed % 6]}-${pad(k, 2)}`, floor: k % 3 === 0 ? 'Level 1' : 'Ground' }
    default: {
      const block = BLOCK_LETTERS[blockSeed % 3]
      return { unitNo: `${block}-${pad(k, 2)}`, floor: pick(spec.floors) }
    }
  }
}

const UNIT_TARGET = 260

function buildUnits(): PropertyUnit[] {
  const capable = ASSETS.filter((a) => unitCapability.has(a.id))
  // Fill the scarce stock first (industrial estates, resorts, office towers) so the
  // unit mix stays representative once the 260-unit budget is exhausted.
  const industrial = shuffle(capable.filter((a) => a.category === 'Industrial'))
  const tourism = shuffle(capable.filter((a) => a.category === 'Tourism & Hospitality'))
  const commercial = shuffle(capable.filter((a) => a.category === 'Commercial Property'))
  const offices = commercial.filter((a) => unitCapability.get(a.id)?.unitType === 'Office Suite')
  const otherCommercial = commercial.filter((a) => unitCapability.get(a.id)?.unitType !== 'Office Suite')
  const parents = [...industrial, ...tourism, ...offices, ...otherCommercial]

  const out: PropertyUnit[] = []
  let seq = 0

  for (const parent of parents) {
    if (out.length >= UNIT_TARGET) break
    const cap = unitCapability.get(parent.id)
    if (!cap) continue
    const wanted = Math.min(ri(cap.min, cap.max), UNIT_TARGET - out.length)
    const spec = UNIT_SPECS[cap.unitType]
    const blockSeed = ri(1, 999)

    for (let k = 1; k <= wanted; k++) {
      seq += 1
      const { unitNo, floor } = unitNumberFor(cap.unitType, k, blockSeed)
      out.push({
        id: `unt-${pad(seq, 4)}`,
        code: `${parent.code}-U${pad(k, 2)}`,
        assetId: parent.id,
        propertyName: parent.name,
        unitNo,
        type: cap.unitType,
        lettableAreaSqft: roundTo(skew(spec.areaMin, spec.areaMax, spec.areaSkew), 10),
        floor,
        status: 'Vacant', // assigned below in controlled proportions
        zone: parent.location.zone,
        town: parent.location.town,
        marketRatePsf: Number(rf(spec.psfMin, spec.psfMax).toFixed(2)),
      })
    }
  }

  // Deterministic occupancy mix: 75% occupied, 4.6% in legal action, the rest idle.
  const statusPlan: UnitStatus[] = []
  const mix: readonly (readonly [UnitStatus, number])[] = [
    ['Occupied', 196],
    ['Vacant', 30],
    ['Under Renovation', 14],
    ['Reserved', 8],
    ['Legal Action', 12],
  ]
  for (const [s, n] of mix) for (let i = 0; i < n; i++) statusPlan.push(s)
  while (statusPlan.length < out.length) statusPlan.push('Vacant')
  const shuffled = shuffle(statusPlan).slice(0, out.length)
  out.forEach((u, i) => {
    u.status = shuffled[i]
  })

  return out
}

/** 260 lettable units belonging to the commercial, industrial and tourism assets. */
export const UNITS: PropertyUnit[] = buildUnits()

export const UNIT_BY_ID: Map<string, PropertyUnit> = new Map(UNITS.map((u) => [u.id, u]))

/* =====================================================================================
 * 9. TENANTS — 96 South East Johor SMEs
 * ===================================================================================== */

const CREDIT_OPTIONS: readonly WeightedOption<Tenant['creditRating']>[] = [
  { v: 'A', w: 24 },
  { v: 'B', w: 45 },
  { v: 'C', w: 23 },
  { v: 'D', w: 8 },
]

function phoneNumber(): string {
  return chance(0.62)
    ? `+60 1${ri(0, 9)}-${ri(200, 999)} ${ri(1000, 9999)}`
    : `+60 7-${ri(200, 899)} ${ri(1000, 9999)}`
}

function buildTenants(): Tenant[] {
  return TENANT_POOL.map((entry, i) => {
    const name = entry[0]
    const isCompany = /Sdn Bhd|Berhad|& Co|Partners/.test(name)
    const contact = pick(STAFF_NAMES)
    const domain = isCompany
      ? `${name
          .toLowerCase()
          .replace(/\b(sdn|bhd|berhad|enterprise|trading|&|co|partners)\b/g, '')
          .replace(/[^a-z0-9]+/g, '')
          .slice(0, 14)}.com.my`
      : 'gmail.com'
    const regYear = ri(1998, 2024)
    return {
      id: `tnt-${pad(i + 1, 3)}`,
      name,
      ssmNo: `${regYear}${pad(ri(1, 12), 2)}${pad(ri(1, 99), 2)}${pad(ri(1, 9999), 4)} (${ri(200_000, 1_499_999)}-${pick(['A', 'D', 'K', 'M', 'P', 'T', 'U', 'W', 'X'] as const)})`,
      contactPerson: contact,
      phone: phoneNumber(),
      email: `${slugEmail(contact)}@${domain}`,
      businessCategory: entry[1],
      creditRating: weighted(CREDIT_OPTIONS),
      tenantSinceYear: ri(2006, NOW.getFullYear()),
    }
  })
}

/** 96 tenants — small businesses, traders and industrial operators. */
export const TENANTS: Tenant[] = buildTenants()

export const TENANT_BY_ID: Map<string, Tenant> = new Map(TENANTS.map((t) => [t.id, t]))

/* =====================================================================================
 * 10. LEASES + PAYMENTS
 * ===================================================================================== */

const TENURE_MONTH_OPTIONS: readonly WeightedOption<number>[] = [
  { v: 12, w: 34 },
  { v: 24, w: 30 },
  { v: 36, w: 26 },
  { v: 60, w: 10 },
]

const PAYMENT_METHODS: readonly WeightedOption<NonNullable<Payment['method']>>[] = [
  { v: 'FPX', w: 34 },
  { v: 'Standing Instruction', w: 24 },
  { v: 'Bank Transfer', w: 22 },
  { v: 'Cheque', w: 13 },
  { v: 'Cash', w: 7 },
]

function noticeStageFor(daysOverdue: number): NoticeStage {
  if (daysOverdue <= 0) return 'None'
  if (daysOverdue <= 21) return 'Reminder Sent'
  if (daysOverdue <= 55) return '1st Notice'
  if (daysOverdue <= 150) return 'Final Notice'
  return 'Legal Action'
}

const ARREARS_OPTIONS: readonly WeightedOption<number>[] = [
  { v: 0, w: 62 },
  { v: 1, w: 15 },
  { v: 2, w: 10 },
  { v: 3, w: 7 },
  { v: 4, w: 6 },
]

interface LeaseBuild {
  leases: Lease[]
  payments: Payment[]
}

function buildLeasesAndPayments(): LeaseBuild {
  const leases: Lease[] = []
  const payments: Payment[] = []
  let leaseSeq = 0
  let paySeq = 0

  const tenantOrder = shuffle(TENANTS)
  let tenantCursor = 0
  const nextTenant = (): Tenant => {
    const t = tenantOrder[tenantCursor % tenantOrder.length]
    tenantCursor += 1
    return t
  }

  const makeCode = (start: Date): string => {
    leaseSeq += 1
    return `LSE-${start.getFullYear()}-${pad(leaseSeq, 3)}`
  }

  const emptyAgeing = (): ArrearsAgeing => ({ current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 })

  /** Build a lease shell — rent is derived from the unit's own area and market rate. */
  function shell(unit: PropertyUnit, tenant: Tenant, startDate: Date, endDate: Date, tenureMonths: number, status: LeaseStatus): Lease {
    const psf = Number((unit.marketRatePsf * rf(0.84, 1.14)).toFixed(2))
    const rawRent = unit.lettableAreaSqft * psf
    const monthlyRent = clamp(roundTo(rawRent, 10), 850, 45_000)
    const ratePsf = Number((monthlyRent / unit.lettableAreaSqft).toFixed(3))
    const id = `lse-${pad(leaseSeq + 1, 4)}`
    const code = makeCode(startDate)
    return {
      id,
      code,
      unitId: unit.id,
      unitNo: unit.unitNo,
      propertyName: unit.propertyName,
      assetId: unit.assetId,
      tenantId: tenant.id,
      tenantName: tenant.name,
      businessType: tenant.businessCategory,
      zone: unit.zone,
      startDate: ymd(startDate),
      endDate: ymd(endDate),
      tenureMonths,
      monthlyRent,
      ratePsf,
      deposit: roundTo(monthlyRent * (chance(0.5) ? 2 : 3), 10),
      serviceCharge: roundTo(monthlyRent * rf(0.04, 0.12), 10),
      status,
      hasRenewalOption: chance(0.68),
      escalationPct: pick([0, 0, 3, 3, 5, 5, 7.5] as const),
      outstandingAmount: 0,
      daysOverdue: 0,
      ageing: emptyAgeing(),
      lastPaymentDate: undefined,
      noticeStage: 'None',
    }
  }

  /** Pick a tenure long enough that the lease actually started in the past. */
  function tenureCovering(remainingDays: number): number {
    const needed = Math.ceil(remainingDays / 30) + 1
    const viable = TENURE_MONTH_OPTIONS.filter((o) => o.v >= needed)
    return viable.length > 0 ? weighted(viable) : 60
  }

  /** Generate up to 12 monthly invoices and fold the results back into the lease. */
  function attachPayments(lease: Lease, arrearsMonths: number): void {
    const start = new Date(lease.startDate)
    const rowDue = lease.monthlyRent + lease.serviceCharge
    const periods: { period: string; due: Date }[] = []
    for (let k = -11; k <= 0; k++) {
      const d = new Date(NOW.getFullYear(), NOW.getMonth() + k, 5)
      if (d.getTime() > NOW.getTime()) continue
      if (d.getTime() < start.getTime()) continue
      periods.push({ period: periodOf(d), due: d })
    }
    if (periods.length === 0) return

    const unpaidCount = Math.min(arrearsMonths, periods.length)
    const firstUnpaidIdx = periods.length - unpaidCount
    const ageing = emptyAgeing()
    let outstanding = 0
    let lastPaid: Date | undefined
    let oldestUnpaid: Date | undefined

    periods.forEach((p, idx) => {
      paySeq += 1
      const id = `pay-${pad(paySeq, 5)}`
      const isUnpaid = idx >= firstUnpaidIdx
      if (!isUnpaid) {
        const paidDate = new Date(p.due.getTime() + ri(-4, 11) * MS_DAY)
        const settled = paidDate.getTime() > NOW.getTime() ? new Date(NOW.getTime() - MS_DAY) : paidDate
        if (!lastPaid || settled.getTime() > lastPaid.getTime()) lastPaid = settled
        payments.push({
          id,
          leaseId: lease.id,
          period: p.period,
          amountDue: rowDue,
          amountPaid: rowDue,
          dueDate: ymd(p.due),
          paidDate: ymd(settled),
          status: 'Paid',
          method: weighted(PAYMENT_METHODS),
        })
        return
      }

      const partial = chance(0.16)
      const amountPaid = partial ? roundTo(rowDue * rf(0.28, 0.62), 10) : 0
      const shortfall = rowDue - amountPaid
      const age = daysBetween(p.due, NOW)
      if (age <= 30) ageing.current += shortfall
      else if (age <= 60) ageing.d30 += shortfall
      else if (age <= 90) ageing.d60 += shortfall
      else if (age <= 120) ageing.d90 += shortfall
      else ageing.d90plus += shortfall
      outstanding += shortfall
      if (!oldestUnpaid || p.due.getTime() < oldestUnpaid.getTime()) oldestUnpaid = p.due
      if (partial) {
        const partialDate = new Date(p.due.getTime() + ri(2, 18) * MS_DAY)
        const settled = partialDate.getTime() > NOW.getTime() ? new Date(NOW.getTime() - MS_DAY) : partialDate
        if (!lastPaid || settled.getTime() > lastPaid.getTime()) lastPaid = settled
        payments.push({
          id,
          leaseId: lease.id,
          period: p.period,
          amountDue: rowDue,
          amountPaid,
          dueDate: ymd(p.due),
          paidDate: ymd(settled),
          status: 'Partial',
          method: weighted(PAYMENT_METHODS),
        })
      } else {
        payments.push({
          id,
          leaseId: lease.id,
          period: p.period,
          amountDue: rowDue,
          amountPaid: 0,
          dueDate: ymd(p.due),
          paidDate: undefined,
          status: age > 7 ? 'Overdue' : 'Outstanding',
          method: undefined,
        })
      }
    })

    lease.outstandingAmount = Math.round(outstanding)
    lease.ageing = {
      current: Math.round(ageing.current),
      d30: Math.round(ageing.d30),
      d60: Math.round(ageing.d60),
      d90: Math.round(ageing.d90),
      d90plus: Math.round(ageing.d90plus),
    }
    // Guarantee the buckets sum exactly to the outstanding balance after rounding.
    const bucketSum =
      lease.ageing.current + lease.ageing.d30 + lease.ageing.d60 + lease.ageing.d90 + lease.ageing.d90plus
    if (bucketSum !== lease.outstandingAmount) {
      lease.ageing.current += lease.outstandingAmount - bucketSum
    }
    lease.daysOverdue = oldestUnpaid ? Math.max(0, daysBetween(oldestUnpaid, NOW)) : 0
    lease.noticeStage = noticeStageFor(lease.daysOverdue)
    lease.lastPaymentDate = lastPaid ? ymd(lastPaid) : undefined
  }

  /* --- Current leases: one per Occupied and Legal Action unit --------------------- */
  for (const unit of UNITS) {
    if (unit.status !== 'Occupied' && unit.status !== 'Legal Action') continue
    const tenant = nextTenant()
    const remainingDays = weighted<number>([
      { v: ri(5, 90), w: 18 },
      { v: ri(91, 365), w: 40 },
      { v: ri(366, 780), w: 42 },
    ])
    const tenureMonths = tenureCovering(remainingDays)
    const endDate = dateDaysFromNow(remainingDays)
    const startDate = addMonths(endDate, -tenureMonths)
    let status: LeaseStatus = 'Active'
    if (remainingDays <= 90) status = chance(0.42) ? 'Renewal In Progress' : 'Expiring Soon'
    else if (remainingDays <= 150 && chance(0.25)) status = 'Renewal In Progress'

    const lease = shell(unit, tenant, startDate, endDate, tenureMonths, status)
    const arrears = unit.status === 'Legal Action' ? ri(5, 9) : weighted(ARREARS_OPTIONS)
    attachPayments(lease, arrears)
    leases.push(lease)
  }

  /* --- Draft leases on Reserved units --------------------------------------------- */
  for (const unit of UNITS) {
    if (unit.status !== 'Reserved') continue
    const tenant = nextTenant()
    const tenureMonths = weighted(TENURE_MONTH_OPTIONS)
    const startDate = dateDaysFromNow(ri(14, 90))
    const endDate = addMonths(startDate, tenureMonths)
    leases.push(shell(unit, tenant, startDate, endDate, tenureMonths, 'Draft'))
  }

  /* --- Historical leases on units currently between tenants ------------------------ */
  for (const unit of UNITS) {
    if (unit.status !== 'Under Renovation') continue
    const tenant = nextTenant()
    const tenureMonths = weighted(TENURE_MONTH_OPTIONS)
    const endDate = dateDaysFromNow(-ri(20, 420))
    const startDate = addMonths(endDate, -tenureMonths)
    leases.push(shell(unit, tenant, startDate, endDate, tenureMonths, chance(0.55) ? 'Expired' : 'Terminated'))
  }

  /* --- Prior tenancies on occupied units (renewal history for the timeline) -------- */
  const occupied = UNITS.filter((u) => u.status === 'Occupied')
  for (const unit of pickN(occupied, 24)) {
    const tenant = nextTenant()
    const tenureMonths = weighted(TENURE_MONTH_OPTIONS)
    const endDate = dateDaysFromNow(-ri(400, 1400))
    const startDate = addMonths(endDate, -tenureMonths)
    leases.push(shell(unit, tenant, startDate, endDate, tenureMonths, chance(0.7) ? 'Expired' : 'Terminated'))
  }

  return { leases, payments }
}

const leaseBuild = buildLeasesAndPayments()

/** Every lease references a real unit and a real tenant. */
export const LEASES: Lease[] = leaseBuild.leases

/** Twelve months of rent invoices for every current lease. */
export const PAYMENTS: Payment[] = leaseBuild.payments

export const LEASE_BY_ID: Map<string, Lease> = new Map(LEASES.map((l) => [l.id, l]))

export const PAYMENTS_BY_LEASE: Map<string, Payment[]> = (() => {
  const map = new Map<string, Payment[]>()
  for (const p of PAYMENTS) {
    const list = map.get(p.leaseId)
    if (list) list.push(p)
    else map.set(p.leaseId, [p])
  }
  return map
})()

/* =====================================================================================
 * 11. VENDORS + TECHNICIANS
 * ===================================================================================== */

function buildVendors(): Vendor[] {
  return VENDOR_POOL.map((entry, i) => ({
    id: `ven-${pad(i + 1, 2)}`,
    name: entry[0],
    specialisation: entry[1],
    phone: `+60 7-${ri(200, 899)} ${ri(1000, 9999)}`,
    rating: Number(rf(3.1, 4.9).toFixed(1)),
    slaCompliance: ri(68, 99),
    activeWorkOrders: 0, // recomputed from WORK_ORDERS below
    contractExpiry: dayFromNow(ri(-45, 520)),
  }))
}

/** 18 panel contractors. */
export const VENDORS: Vendor[] = buildVendors()

const ZONE_TEAM: Record<Zone, string> = {
  'Zon Desaru–Penawar': 'Team Desaru',
  'Zon Pengerang–Sungai Rengit': 'Team Pengerang',
  'Zon Bandar Tenggara': 'Team Tenggara',
  'Zon Bandar Mas–Air Tawar': 'Team Bandar Mas',
  'Zon Sedili–Kota Tinggi': 'Team Sedili',
  'Zon Mersing': 'Team Mersing',
}

const ALL_ZONES: readonly Zone[] = [
  'Zon Desaru–Penawar',
  'Zon Pengerang–Sungai Rengit',
  'Zon Bandar Tenggara',
  'Zon Bandar Mas–Air Tawar',
  'Zon Sedili–Kota Tinggi',
  'Zon Mersing',
]

function buildTechnicians(): Technician[] {
  return TECHNICIAN_NAMES.map((name, i) => {
    const zone = ALL_ZONES[i % ALL_ZONES.length]
    return {
      id: `tec-${pad(i + 1, 2)}`,
      name,
      team: chance(0.78) ? ZONE_TEAM[zone] : pick(TEAMS),
      zone,
      skills: pickN(SKILL_POOL, ri(2, 4)),
      openJobs: 0, // recomputed from WORK_ORDERS below
      utilisation: 0,
      avatarInitials: initials(name),
    }
  })
}

/** 24 in-house technicians spread across the six zones. */
export const TECHNICIANS: Technician[] = buildTechnicians()

/* =====================================================================================
 * 12. WORK ORDERS — 190 records with computed SLA state
 * ===================================================================================== */

const WO_TITLES: Record<WorkOrderType, readonly string[]> = {
  Corrective: [
    'Air-conditioning unit not cooling',
    'Water leakage at ground floor toilet',
    'Lift stuck between floors',
    'Faulty street lighting at car park',
    'Broken drainage cover at loading bay',
    'Ceiling board collapse after heavy rain',
    'Water pump tripping intermittently',
    'Fire alarm panel showing fault',
    'Roof leakage above lettable unit',
    'Signage lighting not working',
    'CCTV camera offline at main entrance',
    'Clogged grease trap at hawker stalls',
    'Pothole on internal access road',
    'Damaged perimeter fencing',
    'Toilet door lock jammed',
    'Electrical trip at main switchboard',
    'Compressor noisy and vibrating',
    'Sliding gate motor not responding',
  ],
  Preventive: [
    'Quarterly HVAC servicing',
    'Monthly genset load test',
    'Half-yearly fire extinguisher inspection',
    'Annual lift servicing and lubrication',
    'Water tank cleaning and chlorination',
    'Roof gutter and downpipe cleaning',
    'Pump room preventive maintenance',
    'Switchboard thermography scan',
    'Landscape and grounds upkeep round',
    'Pest control treatment cycle',
  ],
  Predictive: [
    'Vibration analysis on chiller pump',
    'Thermal imaging of main switchboard',
    'IoT sensor anomaly follow-up',
    'Oil sample analysis on generator set',
    'Power quality logging at incoming supply',
  ],
  Inspection: [
    'Building condition inspection',
    'Structural crack monitoring survey',
    'Jetty timber decking inspection',
    'Roof and gutter condition survey',
    'Asset verification and QR label check',
  ],
  'Statutory Compliance': [
    'DOSH lift certificate renewal inspection',
    'BOMBA fire certificate renewal',
    'Suruhanjaya Tenaga installation inspection',
    'Water tank certification and testing',
    'Lightning protection system test',
  ],
  Emergency: [
    'Power outage affecting entire block',
    'Burst water main at main access road',
    'Flooding at ground floor car park',
    'Fallen tree blocking access road',
    'Sewage overflow at market rear',
  ],
  'Upgrade / Improvement': [
    'LED lighting retrofit',
    'Solar PV readiness upgrade',
    'CCTV system upgrade to IP cameras',
    'Car park resurfacing and line marking',
    'Accessibility ramp installation',
    'Rainwater harvesting installation',
  ],
}

/**
 * Some asset classes need their own vocabulary — a "genset load test" must never be
 * raised against a CCTV system. Titles are bucketed so they stay type-appropriate.
 */
type TitleBucket = 'fix' | 'plan' | 'upgrade'

function titleBucket(type: WorkOrderType): TitleBucket {
  if (type === 'Corrective' || type === 'Emergency') return 'fix'
  if (type === 'Upgrade / Improvement') return 'upgrade'
  return 'plan'
}

const CATEGORY_TITLES: Partial<Record<AssetCategory, Record<TitleBucket, readonly string[]>>> = {
  'ICT & Digital': {
    fix: [
      'Network switch offline',
      'CCTV camera offline at main entrance',
      'Access control reader rejecting valid cards',
      'Server rack high-temperature alarm',
      'Digital signage panel blank',
      'Fibre link degraded — packet loss detected',
    ],
    plan: [
      'Quarterly firmware and security patching',
      'UPS battery health check',
      'Backup restore verification test',
      'Network cabinet inspection and labelling',
      'CCTV recording retention audit',
    ],
    upgrade: [
      'CCTV system upgrade to IP cameras',
      'Switch replacement and VLAN re-segmentation',
      'Storage capacity expansion for video retention',
    ],
  },
  'Plant & Equipment': {
    fix: [
      'Generator failed auto-start during test',
      'Chiller compressor tripping on high pressure',
      'Lift stuck between floors',
      'Pump mechanical seal leaking in pump room',
      'Excavator hydraulic hose burst',
      'Compactor truck hydraulic fault',
      'Fire alarm panel showing fault',
    ],
    plan: [
      'Monthly genset load test',
      'Annual lift servicing and lubrication',
      'Chiller water treatment and tube cleaning',
      'Vibration analysis on rotating equipment',
      'Oil sample analysis on generator set',
      'DOSH lift certificate renewal inspection',
    ],
    upgrade: [
      'Genset controller upgrade to remote monitoring',
      'Variable speed drive retrofit on pump set',
      'Lift car interior refurbishment',
    ],
  },
  Land: {
    fix: [
      'Boundary fencing damaged',
      'Illegal dumping reported on vacant parcel',
      'Access track washed out after heavy rain',
      'Encroachment reported by neighbouring lot',
    ],
    plan: [
      'Boundary peg and survey verification',
      'Undergrowth clearing and firebreak upkeep',
      'Quarterly land parcel condition inspection',
      'Title and quit rent compliance check',
    ],
    upgrade: [
      'Perimeter fencing and signage installation',
      'Site levelling and drainage improvement',
    ],
  },
  Infrastructure: {
    fix: [
      'Street lighting outage along access road',
      'Jetty timber decking rotted',
      'Drain blockage causing ponding',
      'Pothole on internal access road',
      'Bridge expansion joint damaged',
      'Water treatment dosing pump fault',
      'Bus terminal roof leaking',
    ],
    plan: [
      'Quarterly jetty and marine structure inspection',
      'Drainage desilting and clearing round',
      'Water quality sampling and testing',
      'Telecommunications tower earthing test',
      'Road marking and signage condition survey',
    ],
    upgrade: [
      'LED street lighting retrofit',
      'Road resurfacing and line marking',
      'Jetty decking replacement with composite boards',
    ],
  },
}

const WO_TYPE_OPTIONS: readonly WeightedOption<WorkOrderType>[] = [
  { v: 'Corrective', w: 38 },
  { v: 'Preventive', w: 24 },
  { v: 'Inspection', w: 10 },
  { v: 'Statutory Compliance', w: 8 },
  { v: 'Emergency', w: 7 },
  { v: 'Upgrade / Improvement', w: 8 },
  { v: 'Predictive', w: 5 },
]

const WO_SOURCE_OPTIONS: readonly WeightedOption<WorkOrderSource>[] = [
  { v: 'QR Scan', w: 18 },
  { v: 'Tenant Portal', w: 20 },
  { v: 'Call Centre', w: 17 },
  { v: 'Scheduled PM', w: 22 },
  { v: 'WhatsApp Bot', w: 9 },
  { v: 'Inspection Finding', w: 9 },
  { v: 'IoT Sensor', w: 5 },
]

const PRIORITY_BY_TYPE: Record<WorkOrderType, readonly WeightedOption<Priority>[]> = {
  Emergency: [
    { v: 'P1 - Critical', w: 78 },
    { v: 'P2 - High', w: 22 },
  ],
  Corrective: [
    { v: 'P1 - Critical', w: 8 },
    { v: 'P2 - High', w: 32 },
    { v: 'P3 - Medium', w: 44 },
    { v: 'P4 - Low', w: 16 },
  ],
  Preventive: [
    { v: 'P2 - High', w: 12 },
    { v: 'P3 - Medium', w: 52 },
    { v: 'P4 - Low', w: 36 },
  ],
  Predictive: [
    { v: 'P2 - High', w: 20 },
    { v: 'P3 - Medium', w: 55 },
    { v: 'P4 - Low', w: 25 },
  ],
  Inspection: [
    { v: 'P3 - Medium', w: 55 },
    { v: 'P4 - Low', w: 45 },
  ],
  'Statutory Compliance': [
    { v: 'P2 - High', w: 46 },
    { v: 'P3 - Medium', w: 44 },
    { v: 'P4 - Low', w: 10 },
  ],
  'Upgrade / Improvement': [
    { v: 'P3 - Medium', w: 42 },
    { v: 'P4 - Low', w: 58 },
  ],
}

const SLA_HOURS: Record<Priority, readonly number[]> = {
  'P1 - Critical': [4, 4, 8],
  'P2 - High': [8, 12, 24],
  'P3 - Medium': [48, 72],
  'P4 - Low': [120, 168],
}

const ROOT_CAUSES = [
  'Normal wear and tear',
  'Component reached end of life',
  'Poor previous workmanship',
  'Water ingress through failed sealant',
  'Power surge from incoming supply',
  'Lack of preventive maintenance',
  'Vandalism / third-party damage',
  'Corrosion from coastal exposure',
  'System overloading beyond design capacity',
  'Manufacturing defect within warranty',
] as const

const FAILURE_CODES = ['FC-ELE-04', 'FC-HVA-11', 'FC-PLB-02', 'FC-STR-07', 'FC-FIR-03', 'FC-LFT-09', 'FC-CIV-05', 'FC-MEC-08'] as const

const PART_POOL: readonly (readonly [string, number, number])[] = [
  ['Contactor 240V', 85, 320],
  ['Compressor 3HP', 1200, 3800],
  ['PVC pipe 4in (per length)', 28, 95],
  ['LED floodlight 100W', 120, 420],
  ['Ball bearing set', 60, 260],
  ['Circuit breaker 63A', 180, 640],
  ['Water pump seal kit', 140, 520],
  ['Ceiling board 4x8', 35, 90],
  ['Door lockset heavy duty', 95, 380],
  ['Fire extinguisher ABC 9kg', 180, 340],
  ['Cable 2.5mm (per roll)', 210, 520],
  ['Roof sealant 5L', 95, 260],
  ['Lift door roller', 260, 880],
  ['Genset fuel filter', 70, 240],
]

const CHECKLIST_BY_TYPE: Record<WorkOrderType, readonly string[]> = {
  Corrective: ['Isolate and make safe', 'Diagnose fault', 'Replace faulty component', 'Function test', 'Housekeeping and handover'],
  Preventive: ['Visual inspection', 'Clean and lubricate', 'Tighten terminations', 'Record readings', 'Update service tag'],
  Predictive: ['Attach measurement device', 'Capture baseline readings', 'Compare against trend', 'Issue findings report'],
  Inspection: ['Site walkthrough', 'Photograph defects', 'Update condition score', 'Log findings in register'],
  'Statutory Compliance': ['Notify appointed competent person', 'Witness statutory test', 'Collect certificate', 'File to compliance register'],
  Emergency: ['Secure area and isolate', 'Restore temporary service', 'Notify zone manager', 'Complete permanent repair'],
  'Upgrade / Improvement': ['Confirm scope with custodian', 'Procure materials', 'Execute installation', 'Commission and test', 'Handover and training'],
}

function computeSlaStatus(raisedAt: Date, slaDueAt: Date, completedAt?: Date): SlaStatus {
  if (completedAt) return completedAt.getTime() <= slaDueAt.getTime() ? 'Met' : 'Breached'
  const now = NOW.getTime()
  if (now > slaDueAt.getTime()) return 'Breached'
  const windowMs = Math.max(1, slaDueAt.getTime() - raisedAt.getTime())
  return slaDueAt.getTime() - now < windowMs * 0.25 ? 'At Risk' : 'On Track'
}

const WO_STATUS_PLAN: readonly (readonly [WorkOrderStatus, number])[] = [
  ['Open', 18],
  ['Assigned', 24],
  ['In Progress', 26],
  ['On Hold', 8],
  ['Pending Parts', 10],
  ['Pending Verification', 12],
  ['Closed', 82],
  ['Cancelled', 10],
]

function buildWorkOrders(): WorkOrder[] {
  const statuses: WorkOrderStatus[] = []
  for (const [s, n] of WO_STATUS_PLAN) for (let i = 0; i < n; i++) statuses.push(s)
  const plan = shuffle(statuses)

  // Work orders land on things that can actually break.
  const candidates = ASSETS.filter((a) => a.status !== 'Disposed')
  const woAssetOptions: readonly WeightedOption<Asset>[] = candidates.map((a) => ({
    v: a,
    w:
      a.category === 'Land'
        ? 0.4
        : a.category === 'Commercial Property'
          ? 3.2
          : a.category === 'Building & Facility'
            ? 2.6
            : a.category === 'Plant & Equipment'
              ? 2.4
              : a.category === 'Infrastructure'
                ? 2.0
                : a.category === 'Tourism & Hospitality'
                  ? 1.8
                  : a.category === 'Industrial'
                    ? 1.5
                    : 1.0,
  }))

  const drafts: {
    asset: Asset
    type: WorkOrderType
    priority: Priority
    status: WorkOrderStatus
    source: WorkOrderSource
    slaHours: number
    raisedAt: Date
    slaDueAt: Date
    completedAt?: Date
    respondedAt?: Date
    title: string
  }[] = []

  for (const status of plan) {
    const asset = weighted(woAssetOptions)
    const type = weighted(WO_TYPE_OPTIONS)
    const priority = weighted(PRIORITY_BY_TYPE[type])
    const slaHours = pick(SLA_HOURS[priority])
    // Planned work comes from the scheduler; faults come from people and sensors.
    const source =
      type === 'Preventive' || type === 'Predictive'
        ? weighted<WorkOrderSource>([
            { v: 'Scheduled PM', w: 74 },
            { v: 'Inspection Finding', w: 16 },
            { v: 'IoT Sensor', w: 10 },
          ])
        : type === 'Inspection' || type === 'Statutory Compliance'
          ? weighted<WorkOrderSource>([
              { v: 'Scheduled PM', w: 52 },
              { v: 'Inspection Finding', w: 38 },
              { v: 'QR Scan', w: 10 },
            ])
          : type === 'Emergency'
            ? weighted<WorkOrderSource>([
                { v: 'Call Centre', w: 44 },
                { v: 'Tenant Portal', w: 24 },
                { v: 'IoT Sensor', w: 18 },
                { v: 'WhatsApp Bot', w: 14 },
              ])
            : type === 'Upgrade / Improvement'
              ? weighted<WorkOrderSource>([
                  { v: 'Inspection Finding', w: 46 },
                  { v: 'Call Centre', w: 22 },
                  { v: 'Tenant Portal', w: 22 },
                  { v: 'QR Scan', w: 10 },
                ])
              : weighted<WorkOrderSource>([
                  { v: 'Tenant Portal', w: 30 },
                  { v: 'Call Centre', w: 24 },
                  { v: 'QR Scan', w: 20 },
                  { v: 'WhatsApp Bot', w: 13 },
                  { v: 'Inspection Finding', w: 9 },
                  { v: 'IoT Sensor', w: 4 },
                ])
    const override = CATEGORY_TITLES[asset.category]
    const title = override ? pick(override[titleBucket(type)]) : pick(WO_TITLES[type])

    let raisedAt: Date
    let completedAt: Date | undefined

    if (status === 'Closed') {
      raisedAt = dateDaysFromNow(-ri(12, 210))
      const slaDue = new Date(raisedAt.getTime() + slaHours * MS_HOUR)
      const met = chance(0.85)
      const done = met
        ? new Date(raisedAt.getTime() + slaHours * rf(0.15, 0.9) * MS_HOUR)
        : new Date(slaDue.getTime() + rf(3, 110) * MS_HOUR)
      completedAt = new Date(Math.min(done.getTime(), NOW.getTime() - 2 * MS_HOUR))
    } else if (status === 'Cancelled') {
      raisedAt = dateDaysFromNow(-ri(6, 160))
      const done = new Date(raisedAt.getTime() + rf(2, 90) * MS_HOUR)
      completedAt = new Date(Math.min(done.getTime(), NOW.getTime() - MS_HOUR))
    } else if (status === 'Open') {
      // Freshly raised, not yet triaged — these are the "3 hours ago" tickets.
      raisedAt = dateHoursFromNow(-slaHours * rf(0.02, 0.6))
    } else {
      const profile = weighted<'breached' | 'risk' | 'ontrack'>([
        { v: 'breached', w: 22 },
        { v: 'risk', w: 22 },
        { v: 'ontrack', w: 56 },
      ])
      const factor = profile === 'breached' ? rf(1.05, 4) : profile === 'risk' ? rf(0.78, 0.98) : rf(0.05, 0.65)
      raisedAt = dateHoursFromNow(-slaHours * factor)
    }

    const slaDueAt = new Date(raisedAt.getTime() + slaHours * MS_HOUR)
    // Response must sit between the raise and the completion (or now, if still open).
    const responseCeiling = (completedAt ? completedAt.getTime() : NOW.getTime()) - 5 * 60_000
    const respondedAt =
      status === 'Open'
        ? undefined
        : new Date(
            Math.max(
              raisedAt.getTime() + 60_000,
              Math.min(raisedAt.getTime() + slaHours * rf(0.05, 0.4) * MS_HOUR, responseCeiling),
            ),
          )

    drafts.push({ asset, type, priority, status, source, slaHours, raisedAt, slaDueAt, completedAt, respondedAt, title })
  }

  drafts.sort((a, b) => a.raisedAt.getTime() - b.raisedAt.getTime())

  const yearCounters: Record<string, number> = {}
  const out: WorkOrder[] = []

  drafts.forEach((d, i) => {
    const year = d.raisedAt.getFullYear()
    yearCounters[year] = (yearCounters[year] ?? 0) + 1
    const code = `WO-${year}-${pad(yearCounters[year], 4)}`
    const id = `wo-${pad(i + 1, 4)}`

    const zoneTechs = TECHNICIANS.filter((t) => t.zone === d.asset.location.zone)
    const tech = zoneTechs.length > 0 ? pick(zoneTechs) : pick(TECHNICIANS)
    const isOpen = d.status === 'Open'
    const vendor = chance(0.34) ? pick(VENDORS) : undefined

    const slaStatus = computeSlaStatus(d.raisedAt, d.slaDueAt, d.completedAt)

    const doneRatio =
      d.status === 'Closed' || d.status === 'Pending Verification'
        ? 1
        : d.status === 'In Progress'
          ? 0.6
          : d.status === 'Cancelled'
            ? 0.3
            : d.status === 'Pending Parts' || d.status === 'On Hold'
              ? 0.35
              : d.status === 'Assigned'
                ? 0.1
                : 0

    const labels = CHECKLIST_BY_TYPE[d.type]
    const checklist: ChecklistItem[] = labels.map((label, k) => ({
      id: `chk-${pad(i + 1, 4)}-${pad(k + 1, 2)}`,
      label,
      done: k < Math.round(labels.length * doneRatio),
    }))

    const usesParts = (d.type === 'Corrective' || d.type === 'Emergency' || d.type === 'Upgrade / Improvement') && chance(0.7)
    const parts: PartUsed[] = usesParts
      ? pickN(PART_POOL, ri(1, 3)).map((p) => ({
          name: p[0],
          qty: ri(1, 4),
          unitCost: roundTo(rf(p[1], p[2]), 5),
        }))
      : []
    const partsCost = parts.reduce((s, p) => s + p.qty * p.unitCost, 0)

    const baseCost =
      d.priority === 'P1 - Critical'
        ? rf(1800, 26_000)
        : d.priority === 'P2 - High'
          ? rf(900, 14_000)
          : d.priority === 'P3 - Medium'
            ? rf(350, 6500)
            : rf(150, 2800)
    const estimatedCost = roundTo(baseCost + partsCost, 10)
    const actualCost = d.completedAt ? roundTo(estimatedCost * rf(0.82, 1.28), 10) : undefined

    const downtimeHours = Number(
      (d.type === 'Emergency'
        ? rf(1, 26)
        : d.type === 'Corrective'
          ? rf(0.5, 14)
          : rf(0, 5)
      ).toFixed(1),
    )

    const raiserBySource: Record<WorkOrderSource, string> = {
      'QR Scan': tech.name,
      'Tenant Portal': pick(TENANTS).contactPerson,
      'Call Centre': 'Pusat Panggilan KDH',
      'IoT Sensor': 'Sensor IoT — Auto Ticket',
      'Scheduled PM': 'Sistem Penjadualan PM',
      'WhatsApp Bot': pick(TENANTS).contactPerson,
      'Inspection Finding': pick(STAFF_NAMES),
    }

    // Intermediate events can never overtake completion (or the present moment).
    const eventCeiling = (d.completedAt ? d.completedAt.getTime() : NOW.getTime()) - 60_000
    const stamp = (ms: number): string => new Date(Math.min(ms, eventCeiling)).toISOString()

    const history: WorkOrderEvent[] = [
      {
        at: d.raisedAt.toISOString(),
        actor: raiserBySource[d.source],
        action: 'Work order raised',
        note: `Dilaporkan melalui ${d.source}.`,
      },
    ]
    if (!isOpen && d.respondedAt) {
      history.push({
        at: stamp(d.respondedAt.getTime()),
        actor: 'Zulkifli bin Rahman',
        action: 'Assigned to technician',
        note: `Ditugaskan kepada ${tech.name} (${tech.team}).`,
      })
      if (d.status !== 'Assigned') {
        history.push({
          at: stamp(d.respondedAt.getTime() + rf(0.5, 6) * MS_HOUR),
          actor: tech.name,
          action: 'Attended site',
          note: 'Pemeriksaan awal di tapak selesai.',
        })
      }
      if (d.status === 'Pending Parts') {
        history.push({
          at: stamp(d.respondedAt.getTime() + rf(6, 20) * MS_HOUR),
          actor: tech.name,
          action: 'Awaiting parts',
          note: 'Alat ganti dipesan daripada pembekal panel.',
        })
      }
      if (d.status === 'On Hold') {
        history.push({
          at: stamp(d.respondedAt.getTime() + rf(4, 24) * MS_HOUR),
          actor: 'Ng Siew Ling',
          action: 'Placed on hold',
          note: 'Menunggu kelulusan peruntukan tambahan.',
        })
      }
    }
    if (d.completedAt) {
      history.push({
        at: d.completedAt.toISOString(),
        actor: d.status === 'Cancelled' ? 'Ng Siew Ling' : tech.name,
        action: d.status === 'Cancelled' ? 'Work order cancelled' : 'Work completed and closed',
        note:
          d.status === 'Cancelled'
            ? 'Dibatalkan — laporan bertindih dengan tiket sedia ada.'
            : 'Kerja disiapkan dan disahkan oleh penyelia zon.',
      })
    }

    out.push({
      id,
      code,
      assetId: d.asset.id,
      assetName: d.asset.name,
      assetCode: d.asset.code,
      zone: d.asset.location.zone,
      title: `${d.title} — ${d.asset.location.town}`,
      description: `${d.title} dilaporkan di ${d.asset.name} (${d.asset.code}), ${d.asset.location.town}, ${d.asset.location.zone}. Keutamaan ${d.priority} dengan SLA ${d.slaHours} jam. Sumber laporan: ${d.source}.`,
      type: d.type,
      priority: d.priority,
      status: d.status,
      source: d.source,
      raisedBy: raiserBySource[d.source],
      raisedAt: d.raisedAt.toISOString(),
      assignedTo: isOpen ? 'Unassigned' : tech.name,
      team: isOpen ? 'Pending Triage' : tech.team,
      vendorId: vendor?.id,
      slaHours: d.slaHours,
      slaDueAt: d.slaDueAt.toISOString(),
      respondedAt: d.respondedAt?.toISOString(),
      completedAt: d.completedAt?.toISOString(),
      slaStatus,
      estimatedCost,
      actualCost,
      downtimeHours,
      checklist,
      parts,
      rootCause: d.completedAt && (d.type === 'Corrective' || d.type === 'Emergency') ? pick(ROOT_CAUSES) : undefined,
      failureCode: d.completedAt && (d.type === 'Corrective' || d.type === 'Emergency') ? pick(FAILURE_CODES) : undefined,
      history,
    })
  })

  return out
}

/** 190 work orders — every one bound to a real asset with a computed SLA state. */
export const WORK_ORDERS: WorkOrder[] = buildWorkOrders()

/* --- Reconcile vendor / technician workload counters ------------------------------ */
{
  const openStatuses = new Set<WorkOrderStatus>(['Open', 'Assigned', 'In Progress', 'On Hold', 'Pending Parts', 'Pending Verification'])
  for (const v of VENDORS) {
    v.activeWorkOrders = WORK_ORDERS.filter((w) => w.vendorId === v.id && openStatuses.has(w.status)).length
  }
  for (const t of TECHNICIANS) {
    t.openJobs = WORK_ORDERS.filter((w) => w.assignedTo === t.name && openStatuses.has(w.status)).length
    t.utilisation = clamp(Math.round(38 + t.openJobs * 9 + rf(-6, 8)), 22, 98)
  }
}

/* =====================================================================================
 * 13. MAINTENANCE SCHEDULES — 70 planned tasks
 * ===================================================================================== */

const SCHEDULE_TASKS: readonly (readonly [string, MaintenanceSchedule['frequency'], boolean])[] = [
  ['Pemeriksaan sistem penggera kebakaran', 'Quarterly', true],
  ['Servis penyaman udara berpusat', 'Quarterly', false],
  ['Ujian beban set janakuasa', 'Monthly', false],
  ['Pembersihan tangki air dan pengklorinan', 'Half-Yearly', true],
  ['Pemeriksaan lif oleh JKKP (DOSH)', 'Annually', true],
  ['Servis pam air dan bilik pam', 'Quarterly', false],
  ['Pemeriksaan sistem pencegah kilat', 'Annually', true],
  ['Kawalan serangga dan perosak', 'Monthly', false],
  ['Pembersihan longkang dan perangkap minyak', 'Monthly', false],
  ['Pemeriksaan struktur bumbung dan talang', 'Half-Yearly', false],
  ['Imbasan terma papan suis utama', 'Half-Yearly', false],
  ['Penyelenggaraan landskap dan pemotongan rumput', 'Weekly', false],
  ['Pemeriksaan alat pemadam api portable', 'Half-Yearly', true],
  ['Kalibrasi sistem CCTV dan kawalan akses', 'Quarterly', false],
  ['Pemeriksaan jeti dan struktur marin', 'Quarterly', true],
  ['Sijil pepasangan elektrik Suruhanjaya Tenaga', 'Annually', true],
  ['Servis lori sampah compactor', 'Monthly', false],
  ['Pemeriksaan tandas awam dan kelengkapan', 'Weekly', false],
  ['Ujian kualiti air loji rawatan', 'Monthly', true],
  ['Pemeriksaan pagar dan sempadan tanah', 'Quarterly', false],
]

const FREQ_DAYS: Record<MaintenanceSchedule['frequency'], number> = {
  Weekly: 7,
  Monthly: 30,
  Quarterly: 91,
  'Half-Yearly': 182,
  Annually: 365,
}

function buildSchedules(): MaintenanceSchedule[] {
  const pool = ASSETS.filter((a) => a.status !== 'Disposed' && a.category !== 'Land')
  const out: MaintenanceSchedule[] = []
  for (let i = 0; i < 70; i++) {
    const asset = pick(pool)
    const tpl = pick(SCHEDULE_TASKS)
    const freq = tpl[1]
    // ~16% of the plan is already overdue — that is the point of the compliance view.
    const nextDueOffset = chance(0.16) ? -ri(1, 45) : ri(1, 170)
    const lastDone = dayFromNow(nextDueOffset - FREQ_DAYS[freq] - ri(0, 6))
    out.push({
      id: `sch-${pad(i + 1, 3)}`,
      assetId: asset.id,
      assetName: asset.name,
      task: tpl[0],
      frequency: freq,
      nextDue: dayFromNow(nextDueOffset),
      lastDone,
      assignedTeam: chance(0.62) ? ZONE_TEAM[asset.location.zone] : pick(VENDORS).name,
      isStatutory: tpl[2],
    })
  }
  return out
}

/** 70 recurring maintenance obligations, statutory ones flagged. */
export const SCHEDULES: MaintenanceSchedule[] = buildSchedules()

/* =====================================================================================
 * 14. USERS — exactly one per role, with RBAC zone scope
 * ===================================================================================== */

/** Six demo personas — the role switcher drives the RBAC story. */
export const USERS: AppUser[] = [
  {
    id: 'usr-1',
    name: 'Tn. Hj. Abidullah',
    role: 'Group CEO',
    email: 'ceo@kdh.com.my',
    department: 'Corporate Services',
    avatarInitials: initials('Tn. Hj. Abidullah'),
    zoneScope: 'all',
  },
  {
    id: 'usr-2',
    name: 'Nurul Aina binti Hassan',
    role: 'Asset Manager',
    email: 'nurul.aina@kdh.com.my',
    department: 'Land & Development',
    avatarInitials: initials('Nurul Aina binti Hassan'),
    zoneScope: 'all',
  },
  {
    id: 'usr-3',
    name: 'Ng Siew Ling',
    role: 'Property & Leasing Manager',
    email: 'siewling.ng@kdh.com.my',
    department: 'Property Management',
    avatarInitials: initials('Ng Siew Ling'),
    zoneScope: ['Zon Desaru–Penawar', 'Zon Pengerang–Sungai Rengit', 'Zon Bandar Mas–Air Tawar'],
  },
  {
    id: 'usr-4',
    name: 'Zulkifli bin Rahman',
    role: 'Facilities Manager',
    email: 'zulkifli.rahman@kdh.com.my',
    department: 'Facilities & Maintenance',
    avatarInitials: initials('Zulkifli bin Rahman'),
    zoneScope: ['Zon Desaru–Penawar', 'Zon Bandar Tenggara', 'Zon Sedili–Kota Tinggi', 'Zon Mersing'],
  },
  {
    id: 'usr-5',
    name: 'Kavitha a/p Nagalingam',
    role: 'Finance Controller',
    email: 'kavitha.nagalingam@kdh.com.my',
    department: 'Finance',
    avatarInitials: initials('Kavitha a/p Nagalingam'),
    zoneScope: 'all',
  },
  {
    id: 'usr-6',
    name: 'Ravi a/l Subramaniam',
    role: 'Technician',
    email: 'ravi.subramaniam@kdh.com.my',
    department: 'Facilities & Maintenance',
    avatarInitials: initials('Ravi a/l Subramaniam'),
    zoneScope: ['Zon Desaru–Penawar', 'Zon Pengerang–Sungai Rengit'],
  },
]

/* =====================================================================================
 * 15. NOTIFICATIONS — derived from the real records above
 * ===================================================================================== */

function buildNotifications(): Notification[] {
  const breached = WORK_ORDERS.filter((w) => w.slaStatus === 'Breached' && w.status !== 'Closed' && w.status !== 'Cancelled')
  const atRisk = WORK_ORDERS.filter((w) => w.slaStatus === 'At Risk')
  const p1 = WORK_ORDERS.filter((w) => w.priority === 'P1 - Critical' && w.status !== 'Closed')
  const worstArrears = LEASES.slice().sort((a, b) => b.outstandingAmount - a.outstandingAmount)[0]
  const expiring = LEASES.filter((l) => l.status === 'Expiring Soon').slice().sort((a, b) => a.endDate.localeCompare(b.endDate))
  const legal = LEASES.filter((l) => l.noticeStage === 'Legal Action')
  const overdueSchedules = SCHEDULES.filter((s) => new Date(s.nextDue).getTime() < NOW.getTime())
  const expiringInsurance = ASSETS.filter((a) => a.insurance && new Date(a.insurance.expiry).getTime() < NOW.getTime() + 30 * MS_DAY)
  const lowQuality = ASSETS.filter((a) => a.dataQualityScore < 70)
  const critical = ASSETS.filter((a) => a.condition === 'Critical')

  const rm = (n: number) => formatMYR(n)

  const list: Notification[] = [
    {
      id: 'ntf-01',
      title: `${breached.length} work orders have breached SLA`,
      body: `Zon dengan pelanggaran tertinggi memerlukan tindakan segera daripada pengurus fasiliti. Jumlah tiket terbuka melebihi SLA: ${breached.length}.`,
      at: isoHoursFromNow(-1.5),
      severity: 'critical',
      read: false,
      link: '/work-orders?sla=Breached',
    },
    {
      id: 'ntf-02',
      title: p1.length > 0 ? `P1 emergency open: ${p1[0].title}` : 'No P1 emergencies outstanding',
      body: p1.length > 0 ? `${p1[0].code} di ${p1[0].assetName}. SLA ${p1[0].slaHours} jam.` : 'Semua tiket keutamaan P1 telah ditutup.',
      at: isoHoursFromNow(-3),
      severity: p1.length > 0 ? 'critical' : 'success',
      read: false,
      link: p1.length > 0 ? `/work-orders/${p1[0].id}` : '/work-orders',
    },
    {
      id: 'ntf-03',
      title: `Arrears escalation — ${worstArrears?.tenantName ?? 'tenant'}`,
      body: `Tunggakan ${rm(worstArrears?.outstandingAmount ?? 0)} pada ${worstArrears?.propertyName ?? ''} (${worstArrears?.unitNo ?? ''}), ${worstArrears?.daysOverdue ?? 0} hari tertunggak.`,
      at: isoHoursFromNow(-7),
      severity: 'warning',
      read: false,
      link: worstArrears ? `/leases/${worstArrears.id}` : '/leases',
    },
    {
      id: 'ntf-04',
      title: `${expiring.length} leases expiring within 90 days`,
      body: expiring[0]
        ? `Paling awal: ${expiring[0].tenantName} di ${expiring[0].propertyName} (${expiring[0].unitNo}) tamat ${expiring[0].endDate}.`
        : 'Tiada pajakan tamat dalam tempoh 90 hari.',
      at: isoHoursFromNow(-11),
      severity: 'warning',
      read: false,
      link: '/leases?status=Expiring+Soon',
    },
    {
      id: 'ntf-05',
      title: `${overdueSchedules.length} statutory / planned tasks overdue`,
      body: 'Jadual penyelenggaraan berkanun yang tertunggak menjejaskan pematuhan BOMBA dan JKKP.',
      at: isoHoursFromNow(-20),
      severity: 'warning',
      read: false,
      link: '/maintenance?filter=overdue',
    },
    {
      id: 'ntf-06',
      title: `${expiringInsurance.length} insurance policies expiring in 30 days`,
      body: 'Bahagian Kewangan perlu memulakan proses pembaharuan polisi insurans harta.',
      at: isoDaysFromNow(-1.4),
      severity: 'warning',
      read: true,
      link: '/assets?filter=insurance-expiring',
    },
    {
      id: 'ntf-07',
      title: `${legal.length} tenants at Legal Action stage`,
      body: 'Fail telah dirujuk kepada Bahagian Undang-undang untuk tindakan notis tuntutan.',
      at: isoDaysFromNow(-1.9),
      severity: 'critical',
      read: true,
      link: '/leases?notice=Legal+Action',
    },
    {
      id: 'ntf-08',
      title: `Data quality: ${lowQuality.length} asset records below 70%`,
      body: 'Rekod tanpa hakmilik, insurans atau tarikh pemeriksaan menjejaskan ketepatan penilaian portfolio.',
      at: isoDaysFromNow(-2.6),
      severity: 'info',
      read: true,
      link: '/assets?filter=data-quality',
    },
    {
      id: 'ntf-09',
      title: `${critical.length} assets in Critical condition`,
      body: 'Cadangan pemulihan modal perlu dibentangkan kepada Jawatankuasa Aset Kumpulan.',
      at: isoDaysFromNow(-3.2),
      severity: 'critical',
      read: true,
      link: '/assets?condition=Critical',
    },
    {
      id: 'ntf-10',
      title: 'Monthly collection report is ready',
      body: `Kutipan bulan ${MONTHLY_FINANCIALS[MONTHLY_FINANCIALS.length - 1].label} telah dijana dan sedia untuk semakan Pengawal Kewangan.`,
      at: isoDaysFromNow(-4.1),
      severity: 'success',
      read: true,
      link: '/finance',
    },
    {
      id: 'ntf-11',
      title: `${atRisk.length} work orders approaching SLA deadline`,
      body: 'Kurang daripada 25% tempoh SLA berbaki. Pertimbangkan penugasan semula kontraktor panel.',
      at: isoDaysFromNow(-4.8),
      severity: 'warning',
      read: true,
      link: '/work-orders?sla=At+Risk',
    },
    {
      id: 'ntf-12',
      title: 'New asset registered from field QR scan',
      body: 'Aset baharu didaftarkan melalui imbasan QR di lapangan dan menunggu pengesahan kustodian.',
      at: isoDaysFromNow(-5.5),
      severity: 'info',
      read: true,
      link: '/assets',
    },
    {
      id: 'ntf-13',
      title: 'Vendor contract renewal due',
      body: `Kontrak ${VENDORS[0].name} akan tamat pada ${formatDate(VENDORS[0].contractExpiry)}. Penilaian prestasi diperlukan.`,
      at: isoDaysFromNow(-6.3),
      severity: 'info',
      read: true,
      link: '/vendors',
    },
    {
      id: 'ntf-14',
      title: 'GIS layer updated — zone boundaries',
      body: 'Lapisan sempadan zon KEJORA telah dikemas kini mengikut pelan warta terkini.',
      at: isoDaysFromNow(-8.2),
      severity: 'info',
      read: true,
      link: '/gis',
    },
  ]

  return list
}

/** 14 notifications, all derived from the live dataset. */
export const NOTIFICATIONS: Notification[] = buildNotifications()

/* =====================================================================================
 * 16. AUDIT LOG — 45 entries
 * ===================================================================================== */

const AUDIT_ACTIONS: readonly (readonly [string, string])[] = [
  ['Created work order', 'WorkOrder'],
  ['Closed work order', 'WorkOrder'],
  ['Assigned technician', 'WorkOrder'],
  ['Updated asset valuation', 'Asset'],
  ['Updated asset condition score', 'Asset'],
  ['Uploaded document', 'Asset'],
  ['Registered new asset', 'Asset'],
  ['Approved lease renewal', 'Lease'],
  ['Issued final notice', 'Lease'],
  ['Amended rent escalation', 'Lease'],
  ['Recorded payment receipt', 'Payment'],
  ['Exported arrears report', 'Lease'],
  ['Changed user role', 'User'],
  ['Scanned QR label on site', 'Asset'],
  ['Rescheduled preventive task', 'MaintenanceSchedule'],
  ['Updated vendor SLA rating', 'Vendor'],
]

function buildAuditLog(): AuditEntry[] {
  const out: AuditEntry[] = []
  for (let i = 0; i < 45; i++) {
    const [action, entity] = pick(AUDIT_ACTIONS)
    const actor = pick(USERS).name
    let entityId = ''
    let detail = ''
    switch (entity) {
      case 'WorkOrder': {
        const w = pick(WORK_ORDERS)
        entityId = w.code
        detail = `${w.title} — ${w.assetCode} (${w.zone})`
        break
      }
      case 'Asset': {
        const a = pick(ASSETS)
        entityId = a.code
        detail = `${a.name} — ${a.location.town}, ${a.location.zone}`
        break
      }
      case 'Lease': {
        const l = pick(LEASES)
        entityId = l.code
        detail = `${l.tenantName} — ${l.propertyName} ${l.unitNo}`
        break
      }
      case 'Payment': {
        const p = pick(PAYMENTS)
        const l = LEASE_BY_ID.get(p.leaseId)
        entityId = p.id.toUpperCase()
        detail = `${l?.tenantName ?? 'Tenant'} — tempoh ${p.period}, ${formatMYR(p.amountDue)}`
        break
      }
      case 'MaintenanceSchedule': {
        const s = pick(SCHEDULES)
        entityId = s.id.toUpperCase()
        detail = `${s.task} — ${s.assetName}`
        break
      }
      case 'Vendor': {
        const v = pick(VENDORS)
        entityId = v.id.toUpperCase()
        detail = `${v.name} — ${v.specialisation}`
        break
      }
      default: {
        const u = pick(USERS)
        entityId = u.id.toUpperCase()
        detail = `${u.name} — ${u.role}`
        break
      }
    }
    out.push({
      id: `aud-${pad(i + 1, 3)}`,
      at: isoHoursFromNow(-rf(0.5, 720)),
      actor,
      action,
      entity,
      entityId,
      detail,
    })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/** 45 audit entries, newest first. */
export const AUDIT_LOG: AuditEntry[] = buildAuditLog()

/* =====================================================================================
 * 17. Convenience roll-ups
 * ===================================================================================== */

/** Total market value of the portfolio (sum of Asset.currentValue). */
export const PORTFOLIO_VALUE: number = ASSETS.reduce((s, a) => s + a.currentValue, 0)

/** Total net book value carried in the fixed asset register. */
export const PORTFOLIO_NBV: number = ASSETS.reduce((s, a) => s + a.netBookValue, 0)

/** Contracted monthly rent across all current leases. */
export const CONTRACTED_MONTHLY_RENT: number = LEASES.filter(
  (l) => l.status === 'Active' || l.status === 'Expiring Soon' || l.status === 'Renewal In Progress',
).reduce((s, l) => s + l.monthlyRent, 0)

/** Total arrears outstanding across the lease book. */
export const TOTAL_ARREARS: number = LEASES.reduce((s, l) => s + l.outstandingAmount, 0)
