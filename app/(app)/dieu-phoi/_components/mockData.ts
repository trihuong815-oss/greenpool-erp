import type { CoordTask } from './types';

// Today is 2026-06-12 (per environment context); we compute waitingSince by
// subtracting "stuck days" so computeStuckDays remains deterministic in demo.
const TODAY = new Date('2026-06-12T08:00:00+07:00');

function isoMinusDays(days: number): string {
  const d = new Date(TODAY.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export const MOCK_TASKS: CoordTask[] = [
  {
    id: 'dp-0001',
    code: 'DP-2026-0001',
    title: 'Mở lớp hè Linh Đàm',
    type: 'dieu_phoi',
    scope: 'lien_khoi',
    status: 'cho_phe_duyet',
    priority: 'high',
    ownerUid: 'u-tp-dt',
    ownerName: 'TP Đào tạo',
    ownerDeptId: 'DT',
    ownerBlock: 'KD',
    branch: 'LD',
    collaborators: [
      {
        id: 'c-1-1',
        unitName: 'Marketing',
        ownerName: 'TP Marketing',
        supportContent: 'Banner tuyển sinh',
        deliverable: 'Bộ banner',
        deadline: '2026-06-14',
        status: 'dang_thuc_hien',
      },
      {
        id: 'c-1-2',
        unitName: 'QLCS Linh Đàm',
        ownerName: 'QLCS Linh Đàm',
        supportContent: 'Chuẩn bị cơ sở vật chất',
        deliverable: 'Phòng học sẵn sàng',
        deadline: '2026-06-14',
        status: 'dang_thuc_hien',
      },
    ],
    collaboratorUnits: ['MKT', 'QLCS'],
    waitingForPerson: 'TP Marketing',
    waitingForContent: 'Banner tuyển sinh',
    waitingSince: isoMinusDays(2),
    dueDate: '2026-06-15',
    createdAt: isoMinusDays(5),
    createdByName: 'CEO',
  },
  {
    id: 'dp-0002',
    code: 'DP-2026-0002',
    title: 'Tuyển HLV mới',
    type: 'ho_tro',
    scope: 'lien_khoi',
    status: 'dang_xu_ly',
    priority: 'high',
    ownerUid: 'u-tp-ns',
    ownerName: 'TP Nhân sự',
    ownerDeptId: 'NS',
    ownerBlock: 'VP',
    collaborators: [
      {
        id: 'c-2-1',
        unitName: 'Đào tạo',
        ownerName: 'TP Đào tạo',
        supportContent: 'Xác nhận số lượng HLV',
        deliverable: 'Bảng nhu cầu HLV',
        deadline: '2026-06-17',
        status: 'dang_thuc_hien',
      },
    ],
    collaboratorUnits: ['DT'],
    waitingForPerson: 'TP Đào tạo',
    waitingForContent: 'Xác nhận số lượng HLV',
    waitingSince: isoMinusDays(1),
    dueDate: '2026-06-18',
    createdAt: isoMinusDays(4),
    createdByName: 'TP Nhân sự',
  },
  {
    id: 'dp-0003',
    code: 'DP-2026-0003',
    title: 'Duyệt ngân sách Marketing Q3',
    type: 'phe_duyet',
    scope: 'noi_bo_khoi',
    status: 'cho_phe_duyet',
    priority: 'high',
    ownerUid: 'u-tp-mkt',
    ownerName: 'TP Marketing',
    ownerDeptId: 'MKT',
    ownerBlock: 'KD',
    collaborators: [
      {
        id: 'c-3-1',
        unitName: 'Kế toán',
        ownerName: 'TP Kế toán',
        supportContent: 'Kiểm tra số liệu chi phí',
        deliverable: 'Bảng cân đối ngân sách',
        deadline: '2026-06-13',
        status: 'hoan_thanh',
      },
    ],
    collaboratorUnits: ['KE'],
    waitingForPerson: 'GĐ Văn phòng',
    waitingForContent: 'Phê duyệt chi phí',
    waitingSince: isoMinusDays(1),
    dueDate: '2026-06-14',
    createdAt: isoMinusDays(3),
    createdByName: 'TP Marketing',
  },
  {
    id: 'dp-0004',
    code: 'DP-2026-0004',
    title: 'Sửa chữa hệ thống lọc nước',
    type: 'ho_tro',
    scope: 'lien_co_so',
    status: 'dang_phoi_hop',
    priority: 'normal',
    ownerUid: 'u-tp-kt',
    ownerName: 'TP Kỹ thuật',
    ownerDeptId: 'KT',
    ownerBlock: 'KD',
    branch: 'NCT24',
    collaborators: [
      {
        id: 'c-4-1',
        unitName: 'QLCS 24 NCT',
        ownerName: 'QLCS 24 NCT',
        supportContent: 'Báo cáo hiện trạng',
        deliverable: 'Báo cáo kỹ thuật',
        deadline: '2026-06-15',
        status: 'dang_thuc_hien',
      },
    ],
    collaboratorUnits: ['QLCS'],
    waitingForPerson: 'QLCS 24 NCT',
    waitingForContent: 'Báo cáo hiện trạng',
    waitingSince: isoMinusDays(0.5),
    dueDate: '2026-06-16',
    createdAt: isoMinusDays(2),
    createdByName: 'TP Kỹ thuật',
  },
  {
    id: 'dp-0005',
    code: 'DP-2026-0005',
    title: 'Chuẩn bị khai trương Cầu Giấy',
    type: 'dieu_phoi',
    scope: 'du_an',
    status: 'cho_phan_hoi',
    priority: 'high',
    ownerUid: 'u-qlcs-cg',
    ownerName: 'QLCS Cầu Giấy',
    ownerDeptId: 'QLCS',
    ownerBlock: 'KD',
    branch: 'CG',
    collaborators: [
      {
        id: 'c-5-1',
        unitName: 'Marketing',
        ownerName: 'TP Marketing',
        supportContent: 'Kế hoạch truyền thông',
        deliverable: 'Kế hoạch + ngân sách',
        deadline: '2026-06-18',
        status: 'dang_thuc_hien',
      },
      {
        id: 'c-5-2',
        unitName: 'Kỹ thuật',
        ownerName: 'TP Kỹ thuật',
        supportContent: 'Nghiệm thu hệ thống',
        deliverable: 'Biên bản nghiệm thu',
        deadline: '2026-06-19',
        status: 'chua_tiep_nhan',
      },
    ],
    collaboratorUnits: ['MKT', 'KT'],
    waitingForPerson: 'TP Marketing',
    waitingForContent: 'Kế hoạch truyền thông',
    waitingSince: isoMinusDays(1),
    dueDate: '2026-06-20',
    createdAt: isoMinusDays(3),
    createdByName: 'CEO',
  },
  {
    id: 'dp-0006',
    code: 'DP-2026-0006',
    title: 'Banner tuyển sinh',
    type: 'canh_bao',
    scope: 'noi_bo_khoi',
    status: 'cho_phan_hoi',
    priority: 'high',
    ownerUid: 'u-tp-mkt',
    ownerName: 'TP Marketing',
    ownerDeptId: 'MKT',
    ownerBlock: 'KD',
    collaborators: [],
    collaboratorUnits: ['DT'],
    waitingForPerson: 'TP Marketing',
    waitingForContent: 'Banner tuyển sinh',
    waitingSince: isoMinusDays(2.0),
    dueDate: '2026-06-13',
    createdAt: isoMinusDays(4),
    createdByName: 'TP Đào tạo',
  },
  {
    id: 'dp-0007',
    code: 'DP-2026-0007',
    title: 'Báo cáo sửa chữa bể',
    type: 'ho_tro',
    scope: 'noi_bo_phong',
    status: 'cho_phan_hoi',
    priority: 'normal',
    ownerUid: 'u-qlcs-ld',
    ownerName: 'QLCS Linh Đàm',
    ownerDeptId: 'QLCS',
    ownerBlock: 'KD',
    branch: 'LD',
    collaborators: [],
    collaboratorUnits: ['KT'],
    waitingForPerson: 'QLCS Linh Đàm',
    waitingForContent: 'Báo cáo sửa chữa bể',
    waitingSince: isoMinusDays(1.2),
    dueDate: '2026-06-15',
    createdAt: isoMinusDays(3),
    createdByName: 'TP Kỹ thuật',
  },
  {
    id: 'dp-0008',
    code: 'DP-2026-0008',
    title: 'Duyệt chứng từ chi phí',
    type: 'phe_duyet',
    scope: 'noi_bo_phong',
    status: 'cho_phe_duyet',
    priority: 'high',
    ownerUid: 'u-tp-ke',
    ownerName: 'TP Kế toán',
    ownerDeptId: 'KE',
    ownerBlock: 'VP',
    collaborators: [],
    collaboratorUnits: ['KE'],
    waitingForPerson: 'TP Kế toán',
    waitingForContent: 'Duyệt chứng từ chi phí',
    waitingSince: isoMinusDays(3.2),
    dueDate: '2026-06-13',
    createdAt: isoMinusDays(5),
    createdByName: 'GĐ Văn phòng',
  },
  {
    id: 'dp-0009',
    code: 'DP-2026-0009',
    title: 'Xác nhận HLV mới',
    type: 'ho_tro',
    scope: 'noi_bo_khoi',
    status: 'cho_phan_hoi',
    priority: 'normal',
    ownerUid: 'u-tp-ns',
    ownerName: 'TP Nhân sự',
    ownerDeptId: 'NS',
    ownerBlock: 'VP',
    collaborators: [],
    collaboratorUnits: ['DT'],
    waitingForPerson: 'TP Nhân sự',
    waitingForContent: 'Xác nhận HLV mới',
    waitingSince: isoMinusDays(1.8),
    dueDate: '2026-06-15',
    createdAt: isoMinusDays(3),
    createdByName: 'TP Đào tạo',
  },
  {
    id: 'dp-0010',
    code: 'DP-2026-0010',
    title: 'Đồng bộ KPI tháng 6 toàn hệ thống',
    type: 'dieu_phoi',
    scope: 'lien_khoi',
    status: 'dang_phoi_hop',
    priority: 'normal',
    ownerUid: 'u-tp-gs',
    ownerName: 'TP Giám sát',
    ownerDeptId: 'GS',
    ownerBlock: 'VP',
    collaborators: [],
    collaboratorUnits: ['KD', 'VP'],
    waitingForPerson: 'TP Kế toán',
    waitingForContent: 'Số liệu doanh thu',
    waitingSince: isoMinusDays(0.8),
    dueDate: '2026-06-22',
    createdAt: isoMinusDays(2),
    createdByName: 'GĐ Kinh doanh',
  },
  {
    id: 'dp-0011',
    code: 'DP-2026-0011',
    title: 'Triển khai chương trình ưu đãi hè',
    type: 'dieu_phoi',
    scope: 'lien_khoi',
    status: 'dang_xu_ly',
    priority: 'high',
    ownerUid: 'u-tp-mkt',
    ownerName: 'TP Marketing',
    ownerDeptId: 'MKT',
    ownerBlock: 'KD',
    collaborators: [],
    collaboratorUnits: ['DT', 'QLCS'],
    waitingForPerson: 'TP Đào tạo',
    waitingForContent: 'Danh sách lớp ưu đãi',
    waitingSince: isoMinusDays(0.6),
    dueDate: '2026-06-25',
    createdAt: isoMinusDays(2),
    createdByName: 'GĐ Kinh doanh',
  },
  {
    id: 'dp-0012',
    code: 'DP-2026-0012',
    title: 'Họp giao ban tuần liên khối',
    type: 'dieu_phoi',
    scope: 'lien_khoi',
    status: 'tiep_nhan',
    priority: 'normal',
    ownerUid: 'u-ceo',
    ownerName: 'CEO',
    ownerBlock: 'VP',
    collaborators: [],
    collaboratorUnits: ['KD', 'VP'],
    waitingForPerson: 'GĐ Kinh doanh',
    waitingForContent: 'Báo cáo tuần',
    waitingSince: isoMinusDays(0.3),
    dueDate: '2026-06-14',
    createdAt: isoMinusDays(1),
    createdByName: 'CEO',
  },
];

// Today's agenda items
export interface AgendaItem {
  time: string; // HH:MM
  title: string;
  subtitle: string;
  dotColor: 'emerald' | 'amber' | 'violet' | 'sky';
}

export const TODAY_AGENDA: AgendaItem[] = [
  {
    time: '09:00',
    title: 'Họp điều phối mở lớp hè Linh Đàm',
    subtitle: 'TP Đào tạo',
    dotColor: 'emerald',
  },
  {
    time: '10:30',
    title: 'Phê duyệt đề xuất tuyển dụng HLV',
    subtitle: 'TP Nhân sự',
    dotColor: 'amber',
  },
  {
    time: '14:00',
    title: 'Họp kỹ thuật vận hành bể',
    subtitle: 'TP Kỹ thuật',
    dotColor: 'violet',
  },
  {
    time: '15:30',
    title: 'Rà soát ngân sách Marketing Q3',
    subtitle: 'TP Marketing',
    dotColor: 'sky',
  },
];

// Important notifications
export type NotiIconKind = 'alert' | 'check_amber' | 'message' | 'check_emerald';

export interface ImportantNotiItem {
  time: string; // HH:MM
  title: string;
  subtitle: string;
  icon: NotiIconKind;
}

export const IMPORTANT_NOTI: ImportantNotiItem[] = [
  {
    time: '09:15',
    title: 'Mở lớp hè Linh Đàm đang quá hạn 1 ngày',
    subtitle: 'Đang chờ: TP Marketing',
    icon: 'alert',
  },
  {
    time: '10:00',
    title: 'Tuyển HLV mới - cần phê duyệt',
    subtitle: 'Đang chờ: GĐ Văn phòng',
    icon: 'check_amber',
  },
  {
    time: '10:00',
    title: 'TP Đào tạo đã phản hồi',
    subtitle: 'Tuyển đơn gì',
    icon: 'message',
  },
  {
    time: '10:00',
    title: 'QLCS Hoàng Mai đã hoàn thành',
    subtitle: 'Chuẩn bị cơ sở vật chất',
    icon: 'check_emerald',
  },
];

/** Số ngày task đang bị "treo" tính từ waitingSince đến hôm nay. */
export function computeStuckDays(t: CoordTask): number {
  const since = new Date(t.waitingSince).getTime();
  const now = TODAY.getTime();
  const days = (now - since) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.round(days * 10) / 10);
}

/** Quá hạn = dueDate đã qua và task chưa hoàn thành/đóng. */
export function isOverdue(t: CoordTask): boolean {
  if (t.status === 'hoan_thanh' || t.status === 'dong_ho_so') return false;
  const due = new Date(`${t.dueDate}T23:59:59+07:00`).getTime();
  return TODAY.getTime() > due;
}
