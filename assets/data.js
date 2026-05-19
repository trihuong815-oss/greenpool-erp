// ============================================
// Green Pool ERP — Mock Data
// Dữ liệu thực T1-T5/2026 cho 5 cơ sở
// ============================================

const GP_DATA = {

  facilities: [
    { id: 'HM',  name: 'Hoàng Mai',         color: '#1F3A5F', address: '123 Hoàng Mai, Hà Nội' },
    { id: 'TK',  name: 'Thuỵ Khuê',         color: '#C9A227', address: '456 Thuỵ Khuê, Hà Nội' },
    { id: 'CTT', name: 'Cung Thể Thao Dưới Nước', color: '#2E8B8B', address: 'Mỹ Đình, Hà Nội' },
    { id: '24',  name: '24 Nguyễn Cơ Thạch', color: '#5B9BD5', address: '24 NCT, Hà Nội' },
    { id: 'TT',  name: 'Thanh Trì',          color: '#E07A5F', address: 'Thanh Trì, Hà Nội' },
  ],

  revenue: {
    // Period C: tổng 1.1 - 15.5/2026 (Triệu VND)
    facilities: [
      { id: 'HM',  total: 11342, kinh_doanh: 10309, ve_le: 695, ban_hang: 314, khac: 24,  phi_pos: 5,  target: 7850 },
      { id: 'CTT', total: 9410,  kinh_doanh: 7490,  ve_le: 904, ban_hang: 369, khac: 646, phi_pos: 16, target: 6150 },
      { id: '24',  total: 5974,  kinh_doanh: 5842,  ve_le: 7,   ban_hang: 96,  khac: 29,  phi_pos: 20, target: 4650 },
      { id: 'TT',  total: 5910,  kinh_doanh: 4882,  ve_le: 583, ban_hang: 436, khac: 10,  phi_pos: 3,  target: 4500 },
      { id: 'TK',  total: 5229,  kinh_doanh: 5085,  ve_le: 30,  ban_hang: 81,  khac: 34,  phi_pos: 16, target: 4050 },
    ],
    cluster: {
      total: 37865, kinh_doanh: 33607, ve_le: 2218, ban_hang: 1297, khac: 743, phi_pos: 61,
      target: 27200, percent_target: 124.6
    },
    monthly: {
      labels: ['T1', 'T2', 'T3', 'T4', 'T5(15d)'],
      target:    [800, 1000, 1600, 2300, 2150],
      achieved:  [869, 1100, 1983, 3862, 2741],
    }
  },

  // ============================================
  // 40 GÓI DỊCH VỤ × 8 NHÓM (từ CRM)
  // Doanh thu Triệu VND, lũy kế 1.1 - 15.5/2026
  // QUAN TRỌNG: Nhóm PT và Member Fitness CHỈ có tại 24 NCT
  // ============================================
  servicePackages: {
    groups: [
      {
        id: 'member', name: 'Nhóm Thẻ Member', icon: '💳', color: '#1F3A5F',
        description: 'Thẻ thành viên theo thời hạn — gói chủ lực',
        packages: [
          { name: 'Thẻ 1 tháng',  HM: 95,  TK: 35,  CTT: 105, '24': 25,  TT: 60  },
          { name: 'Thẻ 2 tháng',  HM: 50,  TK: 22,  CTT: 60,  '24': 18,  TT: 40  },
          { name: 'Thẻ 3 tháng',  HM: 160, TK: 70,  CTT: 180, '24': 50,  TT: 90  },
          { name: 'Thẻ 6 tháng',  HM: 110, TK: 60,  CTT: 130, '24': 35,  TT: 70  },
          { name: 'Thẻ 1 năm',    HM: 1850,TK: 1180,CTT: 1280,'24': 580, TT: 680 },
          { name: 'Thẻ 2 năm',    HM: 35,  TK: 22,  CTT: 28,  '24': 20,  TT: 25  },
          { name: 'Thẻ 3 năm',    HM: 15,  TK: 8,   CTT: 10,  '24': 8,   TT: 12  },
          { name: 'Thẻ 5 năm',    HM: 5,   TK: 3,   CTT: 7,   '24': 4,   TT: 3   },
        ]
      },
      {
        id: 'swim', name: 'Nhóm Học bơi', icon: '🏊', color: '#2E8B8B',
        description: 'Các khóa học bơi cơ bản và chuyên sâu',
        packages: [
          { name: 'Học bơi cơ bản Trẻ em',         HM: 1380,TK: 380, CTT: 580, '24': 320, TT: 720 },
          { name: 'Học bơi cơ bản Người lớn',      HM: 1620,TK: 650, CTT: 820, '24': 580, TT: 1080},
          { name: 'Học bơi chất lượng cao',        HM: 0,   TK: 0,   CTT: 230, '24': 0,   TT: 90  },
          { name: 'Học bơi PT (1 kèm 1)',          HM: 250, TK: 180, CTT: 380, '24': 220, TT: 200 },
          { name: 'Học bơi nâng cao TE (Thăng Long Kid)', HM: 180, TK: 30, CTT: 220, '24': 35, TT: 70 },
          { name: 'Học bơi nâng cao NL (Thăng Long Aqua)',HM: 90,  TK: 0,  CTT: 160, '24': 20, TT: 0  },
          { name: 'Học lặn',                       HM: 30,  TK: 0,   CTT: 680, '24': 0,   TT: 0   },
        ]
      },
      {
        id: 'tichluot', name: 'Nhóm Thẻ tích lượt', icon: '🎫', color: '#C9A227',
        description: 'Thẻ tích lượt theo số buổi sử dụng',
        packages: [
          { name: 'Thẻ tích 15 lượt',  HM: 180, TK: 110, CTT: 220, '24': 95,  TT: 130 },
          { name: 'Thẻ tích 30 lượt',  HM: 580, TK: 320, CTT: 480, '24': 220, TT: 380 },
          { name: 'Thẻ tích 50 lượt',  HM: 320, TK: 180, CTT: 280, '24': 130, TT: 220 },
          { name: 'Thẻ tích 60 lượt',  HM: 380, TK: 200, CTT: 320, '24': 150, TT: 280 },
          { name: 'Thẻ tích 100 lượt', HM: 980, TK: 580, CTT: 780, '24': 280, TT: 280 },
          { name: 'Thẻ tích 120 lượt', HM: 1280,TK: 720, CTT: 880, '24': 380, TT: 380 },
          { name: 'Thẻ tích 240 lượt', HM: 280, TK: 140, CTT: 180, '24': 80,  TT: 120 },
        ]
      },
      {
        id: 'doanthe', name: 'Nhóm Học bơi đoàn thể', icon: '🏫', color: '#7B6CDB',
        description: 'Hợp đồng đào tạo trường học, công ty',
        packages: [
          { name: 'Học bơi phổ cập (trường học)', HM: 290, TK: 80, CTT: 280, '24': 95, TT: 80 },
        ]
      },
      {
        id: 'vele', name: 'Nhóm Vé lẻ', icon: '🎟️', color: '#5B9BD5',
        description: 'Vé bơi lẻ theo buổi cho khách walk-in',
        packages: [
          { name: 'Vé lẻ',  HM: 695, TK: 30, CTT: 904, '24': 7, TT: 583 },
        ]
      },
      {
        id: 'tienich', name: 'Nhóm Dịch vụ tiện ích', icon: '🛍️', color: '#E07A5F',
        description: 'Bán đồ bơi/đồ tập + căng tin',
        packages: [
          { name: 'Đồ bơi, đồ lặn, đồ tập gym', HM: 280, TK: 75, CTT: 340, '24': 85, TT: 410 },
          { name: 'Căng tin',                    HM: 34,  TK: 6,  CTT: 29,  '24': 11, TT: 26  },
        ]
      },
      // ⭐ HAI NHÓM SAU CHỈ CÓ TẠI 24 NCT
      {
        id: 'pt', name: 'Nhóm Học PT (chỉ tại 24 NCT)', icon: '💪', color: '#B23A48',
        description: '⚠️ Dịch vụ riêng của cơ sở 24 NCT — Personal Training',
        exclusive: '24',
        packages: [
          { name: 'Gói tập 12ss',   HM: 0, TK: 0, CTT: 0, '24': 80,  TT: 0 },
          { name: 'Gói tập 24ss',   HM: 0, TK: 0, CTT: 0, '24': 180, TT: 0 },
          { name: 'Gói tập 36ss',   HM: 0, TK: 0, CTT: 0, '24': 240, TT: 0 },
          { name: 'Gói tập 48ss',   HM: 0, TK: 0, CTT: 0, '24': 320, TT: 0 },
          { name: 'Gói tập 72ss',   HM: 0, TK: 0, CTT: 0, '24': 480, TT: 0 },
          { name: 'Gói tập 100ss',  HM: 0, TK: 0, CTT: 0, '24': 120, TT: 0 },
          { name: 'Gói tập 120ss',  HM: 0, TK: 0, CTT: 0, '24': 60,  TT: 0 },
          { name: 'Gói tập 200ss',  HM: 0, TK: 0, CTT: 0, '24': 30,  TT: 0 },
        ]
      },
      {
        id: 'fitness', name: 'Nhóm Member Fitness (chỉ tại 24 NCT)', icon: '🏋️', color: '#2D6A4F',
        description: '⚠️ Thẻ thành viên Gym/Fitness — chỉ vận hành tại 24 NCT',
        exclusive: '24',
        packages: [
          { name: 'Fitness 1 tháng',  HM: 0, TK: 0, CTT: 0, '24': 95,  TT: 0 },
          { name: 'Fitness 3 tháng',  HM: 0, TK: 0, CTT: 0, '24': 180, TT: 0 },
          { name: 'Fitness 6 tháng',  HM: 0, TK: 0, CTT: 0, '24': 240, TT: 0 },
          { name: 'Fitness 1 năm',    HM: 0, TK: 0, CTT: 0, '24': 380, TT: 0 },
          { name: 'Fitness 2 năm',    HM: 0, TK: 0, CTT: 0, '24': 85,  TT: 0 },
          { name: 'Fitness 3 năm',    HM: 0, TK: 0, CTT: 0, '24': 18,  TT: 0 },
        ]
      },
    ],
  },

  // 17 distinct role codes used in this prototype (subset of 42)
  roles: {
    CEO:       { name: 'CEO / Chủ đầu tư',         tier: 1, scope: 'all',  color: '#1F3A5F' },
    GD_KD:     { name: 'GĐ Khối Kinh doanh',       tier: 2, scope: 'kd',   color: '#1F3A5F' },
    GD_VP:     { name: 'GĐ Khối Văn phòng',        tier: 2, scope: 'vp',   color: '#1F3A5F' },
    QLCS_HM:   { name: 'Quản lý CS Hoàng Mai',     tier: 3, scope: 'HM',   color: '#2E8B8B' },
    QLCS_TK:   { name: 'Quản lý CS Thuỵ Khuê',     tier: 3, scope: 'TK',   color: '#2E8B8B' },
    QLCS_CTT:  { name: 'Quản lý CS Cung Thể Thao', tier: 3, scope: 'CTT',  color: '#2E8B8B' },
    QLCS_24NCT:{ name: 'Quản lý CS 24 NCT',         tier: 3, scope: '24',   color: '#2E8B8B' },
    QLCS_TT:   { name: 'Quản lý CS Thanh Trì',     tier: 3, scope: 'TT',   color: '#2E8B8B' },
    TP_KT:     { name: 'TP Kỹ thuật',              tier: 3, scope: 'kt',   color: '#5B9BD5' },
    TP_DT:     { name: 'TP Đào tạo',               tier: 3, scope: 'dt',   color: '#5B9BD5' },
    TP_MKT:    { name: 'TP Marketing',             tier: 3, scope: 'mkt',  color: '#5B9BD5' },
    TIBAN_TT:  { name: 'Tiểu ban Truyền thông NB', tier: 3, scope: 'ttnb', color: '#C9A227' },
    TP_GS:     { name: 'TP Giám sát',              tier: 3, scope: 'gs',   color: '#5B9BD5' },
    TP_KE:     { name: 'TP Kế toán',               tier: 3, scope: 'ke',   color: '#5B9BD5' },
    TP_NS:     { name: 'TP Nhân sự',               tier: 3, scope: 'ns',   color: '#5B9BD5' },
    TT_DT:     { name: 'Tổ trưởng Đào tạo CS',     tier: 4, scope: 'self', color: '#E07A5F' },
    GV_CB:     { name: 'Giáo viên cơ bản',         tier: 5, scope: 'self', color: '#6C757D' },
    NV_SALE:   { name: 'NV Kinh doanh / Sale',     tier: 5, scope: 'self', color: '#6C757D' },
    NV_CH:     { name: 'NV Cứu hộ',                tier: 5, scope: 'self', color: '#6C757D' },
  },

  // Mock employees với target/conversion để tính hiệu suất Sale
  employees: [
    { name: 'Nguyễn Văn A', role: 'CEO',       email: 'ceo@greenpool.vn',  facility: '-' },
    { name: 'Lê Thị B',     role: 'GD_KD',     email: 'gd.kd@greenpool.vn',facility: '-' },
    { name: 'Phạm Văn C',   role: 'GD_VP',     email: 'gd.vp@greenpool.vn',facility: '-' },
    { name: 'Trần Thị D',   role: 'QLCS_HM',   email: 'ql.hm@greenpool.vn',facility: 'HM' },
    { name: 'Hoàng Văn E',  role: 'QLCS_TK',   email: 'ql.tk@greenpool.vn',facility: 'TK' },
    { name: 'Đặng Văn F',   role: 'QLCS_CTT',  email: 'ql.ctt@greenpool.vn',facility: 'CTT' },
    { name: 'Vũ Thị G',     role: 'QLCS_24NCT',email: 'ql.24@greenpool.vn',facility: '24' },
    { name: 'Bùi Văn H',    role: 'QLCS_TT',   email: 'ql.tt@greenpool.vn',facility: 'TT' },
    // Sale Hoàng Mai
    { name: 'Quỳnh Hoa',  role: 'NV_SALE', email: 'qh@greenpool.vn',   facility: 'HM', revenue: 2061, target: 1500, leadsContacted: 920, dealsClosed: 612 },
    { name: 'Ngọc Linh',  role: 'NV_SALE', email: 'nl@greenpool.vn',   facility: 'HM', revenue: 1582, target: 1500, leadsContacted: 850, dealsClosed: 545 },
    { name: 'Mai Thuý',   role: 'NV_SALE', email: 'mt@greenpool.vn',   facility: 'HM', revenue: 1351, target: 1500, leadsContacted: 780, dealsClosed: 465 },
    { name: 'Công Duy',   role: 'NV_SALE', email: 'cd@greenpool.vn',   facility: 'HM', revenue: 1413, target: 1500, leadsContacted: 810, dealsClosed: 498 },
    { name: 'Phương Nam', role: 'NV_SALE', email: 'pn@greenpool.vn',   facility: 'HM', revenue: 1407, target: 1500, leadsContacted: 1297,dealsClosed: 1379 }, // bao gồm Renew
    // Sale Thuỵ Khuê (84% chốt — tỷ lệ cao)
    { name: 'Hà My',      role: 'NV_SALE', email: 'hm@greenpool.vn',   facility: 'TK', revenue: 1820, target: 1500, leadsContacted: 720, dealsClosed: 605 },
    { name: 'Hồng Vân',   role: 'NV_SALE', email: 'hv@greenpool.vn',   facility: 'TK', revenue: 1750, target: 1500, leadsContacted: 680, dealsClosed: 571 },
    { name: 'Khánh Linh', role: 'NV_SALE', email: 'kl@greenpool.vn',   facility: 'TK', revenue: 1515, target: 1500, leadsContacted: 523, dealsClosed: 441 },
    // Sale CTT
    { name: 'Anh Tuấn',   role: 'NV_SALE', email: 'at@greenpool.vn',   facility: 'CTT', revenue: 2100, target: 1700, leadsContacted: 1320, dealsClosed: 720 },
    { name: 'Thu Hằng',   role: 'NV_SALE', email: 'th@greenpool.vn',   facility: 'CTT', revenue: 1980, target: 1700, leadsContacted: 1180, dealsClosed: 645 },
    { name: 'Minh Đức',   role: 'NV_SALE', email: 'md@greenpool.vn',   facility: 'CTT', revenue: 1850, target: 1700, leadsContacted: 1235, dealsClosed: 620 },
    { name: 'Lan Anh',    role: 'NV_SALE', email: 'la@greenpool.vn',   facility: 'CTT', revenue: 1560, target: 1700, leadsContacted: 1156, dealsClosed: 644 },
    // Sale 24 NCT (76% chốt)
    { name: 'Văn Đạt',    role: 'NV_SALE', email: 'vd@greenpool.vn',   facility: '24', revenue: 2200, target: 1800, leadsContacted: 680, dealsClosed: 522 },
    { name: 'Hồng Nhung', role: 'NV_SALE', email: 'hn@greenpool.vn',   facility: '24', revenue: 2050, target: 1800, leadsContacted: 620, dealsClosed: 478 },
    { name: 'Quốc Bảo',   role: 'NV_SALE', email: 'qb@greenpool.vn',   facility: '24', revenue: 1730, target: 1800, leadsContacted: 551, dealsClosed: 414 },
    // Sale Thanh Trì
    { name: 'Phương Anh', role: 'NV_SALE', email: 'pa@greenpool.vn',   facility: 'TT', revenue: 1820, target: 1500, leadsContacted: 1180, dealsClosed: 730 },
    { name: 'Tuấn Kiệt',  role: 'NV_SALE', email: 'tk@greenpool.vn',   facility: 'TT', revenue: 1670, target: 1500, leadsContacted: 1090, dealsClosed: 671 },
    { name: 'Thanh Trúc', role: 'NV_SALE', email: 'tt@greenpool.vn',   facility: 'TT', revenue: 1395, target: 1500, leadsContacted: 1273, dealsClosed: 786 },
  ],

  // Target năm 2026 theo cơ sở (Triệu VND)
  annualTargets: {
    HM:  24000,  // 24 Tỷ
    CTT: 20000,
    '24':13500,
    TT:  12500,
    TK:  11500,
  },

  // Tiến độ doanh số từng tháng (Triệu VND) — QLCS hoặc GĐ KD nhập
  // T1-T5 là dữ liệu thật; T6-T12 là mục tiêu
  monthlyProgress: {
    HM: [
      { month: 1, target: 1200, actual: 1850 },
      { month: 2, target: 1500, actual: 2100 },
      { month: 3, target: 2000, actual: 2380 },
      { month: 4, target: 2500, actual: 2850 },
      { month: 5, target: 2900, actual: 2162 },  // chốt 15/5
      { month: 6, target: 3200, actual: 0 },
      { month: 7, target: 3000, actual: 0 },
      { month: 8, target: 2400, actual: 0 },
      { month: 9, target: 2000, actual: 0 },
      { month: 10,target: 1700, actual: 0 },
      { month: 11,target: 1400, actual: 0 },
      { month: 12,target: 1200, actual: 0 },
    ],
    CTT: [
      { month: 1, target: 1000, actual: 1580 },
      { month: 2, target: 1200, actual: 1750 },
      { month: 3, target: 1500, actual: 1890 },
      { month: 4, target: 1700, actual: 2105 },
      { month: 5, target: 2000, actual: 2085 },
      { month: 6, target: 2800, actual: 0 },
      { month: 7, target: 2700, actual: 0 },
      { month: 8, target: 2100, actual: 0 },
      { month: 9, target: 1800, actual: 0 },
      { month: 10,target: 1500, actual: 0 },
      { month: 11,target: 1200, actual: 0 },
      { month: 12,target: 1000, actual: 0 },
    ],
    '24': [
      { month: 1, target: 700, actual: 1020 },
      { month: 2, target: 850, actual: 1180 },
      { month: 3, target: 1000,actual: 1290 },
      { month: 4, target: 1100,actual: 1390 },
      { month: 5, target: 1200,actual: 1094 },
      { month: 6, target: 1850,actual: 0 },
      { month: 7, target: 1800,actual: 0 },
      { month: 8, target: 1400,actual: 0 },
      { month: 9, target: 1200,actual: 0 },
      { month: 10,target: 1000,actual: 0 },
      { month: 11,target: 800, actual: 0 },
      { month: 12,target: 600, actual: 0 },
    ],
    TT: [
      { month: 1, target: 650, actual: 985  },
      { month: 2, target: 800, actual: 1120 },
      { month: 3, target: 950, actual: 1280 },
      { month: 4, target: 1050,actual: 1430 },
      { month: 5, target: 1150,actual: 1095 },
      { month: 6, target: 1700,actual: 0 },
      { month: 7, target: 1700,actual: 0 },
      { month: 8, target: 1300,actual: 0 },
      { month: 9, target: 1100,actual: 0 },
      { month: 10,target: 900, actual: 0 },
      { month: 11,target: 750, actual: 0 },
      { month: 12,target: 600, actual: 0 },
    ],
    TK: [
      { month: 1, target: 600, actual: 855  },
      { month: 2, target: 750, actual: 980  },
      { month: 3, target: 900, actual: 1095 },
      { month: 4, target: 1000,actual: 1230 },
      { month: 5, target: 1100,actual: 1069 },
      { month: 6, target: 1600,actual: 0 },
      { month: 7, target: 1500,actual: 0 },
      { month: 8, target: 1200,actual: 0 },
      { month: 9, target: 1000,actual: 0 },
      { month: 10,target: 850, actual: 0 },
      { month: 11,target: 700, actual: 0 },
      { month: 12,target: 550, actual: 0 },
    ],
  },

  sources: {
    cluster: [
      { name: 'Renew',      leads: 5189, chot: 4362, rate: 84.1 },
      { name: 'Refer',      leads: 3653, chot: 3191, rate: 87.4 },
      { name: 'Face',       leads: 3429, chot: 607,  rate: 17.7 },
      { name: 'Thị Trường', leads: 1562, chot: 515,  rate: 33.0 },
      { name: 'Walk-in',    leads: 1503, chot: 932,  rate: 62.0 },
      { name: 'Hotline',    leads: 925,  chot: 174,  rate: 18.8 },
    ],
    byFacility: {
      HM:  { leads: 5657, chot: 3499, rate: 61.9 },
      TK:  { leads: 1923, chot: 1617, rate: 84.1 },
      CTT: { leads: 4891, chot: 2629, rate: 53.8 },
      '24':{ leads: 1851, chot: 1414, rate: 76.4 },
      TT:  { leads: 3543, chot: 2187, rate: 61.7 },
    }
  },

  // Học viên theo dịch vụ
  students: {
    services: ['HBCB Trẻ em', 'HBCB Người lớn', 'Tích lượt KID', 'TL Aqua', 'CLC', 'PT', 'Lặn'],
    // Số học viên đang học (current enrollment)
    byFacility: {
      HM:  [638, 759, 454, 27, 0,  13, 6],
      TK:  [167, 287, 13,  0,  0,  0,  0],
      '24':[185, 398, 5,   1,  0,  3,  0],
      CTT: [239, 347, 223, 47, 23, 17, 54],
      TT:  [363, 644, 72,  0,  8,  13, 0],
    },
    totals: [1592, 2435, 767, 75, 31, 46, 60],
    grandTotal: 5006,

    // Số học viên đã tốt nghiệp YTD (1/1 - 15/5/2026) — chỉ áp dụng cho gói có khóa học hoàn chỉnh
    // null = N/A (gói tích lượt/PT không có khái niệm tốt nghiệp)
    graduatedYTD: {
      HM:  [361, 525, null, null, null, null, 4],
      TK:  [95,  198, null, null, null, null, null],
      '24':[105, 275, null, null, null, null, null],
      CTT: [135, 240, null, null, 15,   null, 32],
      TT:  [205, 445, null, null, 5,    null, null],
    },
    graduatedTotals: [901, 1683, null, null, 20, null, 36],
    graduatedGrandTotal: 2640,

    // Có khóa học → có tốt nghiệp
    hasGraduation: [true, true, false, false, true, false, true],
  },

  // Tổng kết riêng nhóm Học bơi (cho dashboard summary)
  swimSummary: {
    packages: ['HBCB Trẻ em', 'HBCB Người lớn', 'CLC', 'Lặn'],
    enrolled:   [1592, 2435, 31, 60],    // đang học
    graduated:  [901,  1683, 20, 36],    // đã TN YTD
    totalHandled: [2493, 4118, 51, 96],  // = đang học + đã TN
    completionRate: function() {
      const e = this.enrolled.reduce((a,b)=>a+b,0);
      const g = this.graduated.reduce((a,b)=>a+b,0);
      return (g / (e + g) * 100).toFixed(1);
    }
  },

  // Checklist templates — GĐ Khối có thể tùy chỉnh (lưu localStorage)
  // Mỗi template gắn với 1 khối (KD hoặc VP) để GĐ phù hợp có thể sửa
  checklistTemplates: {
    'NV Cứu hộ': { block: 'KD', items: [
      'Test nồng độ Clo nước bể (sáng + chiều)',
      'Kiểm tra độ trong của nước',
      'Kiểm tra phao cứu sinh + thiết bị an toàn',
      'Tuần tra khu vực bể 30 phút/lần',
      'Báo cáo sự cố (nếu có) cho Tổ trưởng An sinh',
    ]},
    'NV Lễ tân': { block: 'KD', items: [
      'Mở quầy đúng 6:00 sáng',
      'Kiểm tra danh sách khách dự kiến hôm nay',
      'Xử lý đăng ký mới (nếu có)',
      'Báo cáo doanh thu vé lẻ + đồ bơi cuối ngày',
      'Kiểm tra điện, nước, điều hoà khu vực sảnh',
    ]},
    'NV Kỹ thuật': { block: 'KD', items: [
      'Kiểm tra máy bơm tuần hoàn',
      'Kiểm tra hệ thống lọc cát',
      'Đo lưu lượng nước',
      'Vệ sinh thiết bị phòng tập gym',
      'Báo cáo bảo trì cho Tổ trưởng An sinh + Phó phòng KT',
    ]},
    'Giáo viên': { block: 'KD', items: [
      'Đến cơ sở trước giờ học 15 phút',
      'Kiểm tra sĩ số lớp',
      'Theo giáo án chuẩn của Phòng Đào tạo',
      'Ghi nhận tiến độ học viên',
      'Báo cáo cuối ca cho Tổ trưởng Đào tạo',
    ]},
    'NV Kế toán': { block: 'VP', items: [
      'Soát chứng từ thu/chi trong ngày',
      'Đối chiếu sao kê ngân hàng',
      'Lập báo cáo dòng tiền tuần',
      'Kiểm tra hợp đồng mới phát sinh',
    ]},
    'NV Nhân sự': { block: 'VP', items: [
      'Chấm công đầu ngày toàn hệ thống',
      'Xử lý đơn nghỉ phép',
      'Theo dõi lịch phỏng vấn ứng viên',
      'Cập nhật bảng lương dự kiến tháng',
    ]},
    'NV Giám sát': { block: 'VP', items: [
      'Đi audit ngẫu nhiên 1 cơ sở/ngày',
      'Soát checklist các phòng đã hoàn thành',
      'Ghi nhận vấn đề + báo TP Giám sát',
      'Kiểm tra CCTV vận hành',
    ]},
    'NV Marketing': { block: 'KD', items: [
      'Theo dõi performance Facebook Ads buổi sáng',
      'Đăng bài content theo lịch tháng',
      'Phản hồi inbox/comment trong vòng 30 phút',
      'Theo dõi CPL + tỷ lệ chuyển đổi',
      'Báo cáo cuối ngày cho Tổ trưởng Content/Thiết kế/Editor',
    ]},
    'NV Truyền thông Nội bộ': { block: 'KD', items: [
      'Cập nhật tin nội bộ trên fanpage NV / Zalo group',
      'Tổ chức sự kiện sinh nhật / liên hoan nội bộ tháng',
      'Khảo sát mức độ hài lòng nhân viên định kỳ',
      'Cập nhật bảng tin hiệu suất hệ thống',
    ]},
  },

  // ============================================
  // QUY TRÌNH HOẠT ĐỘNG (Standard Operating Procedures - SOP)
  // Mỗi phòng có quy trình riêng, TP phòng quản lý
  // ============================================
  procedures: {
    KT: { // Phòng Kỹ thuật
      name: 'Phòng Kỹ thuật',
      block: 'KD',
      list: [
        { id: 'qt-kt-1', title: 'Quy trình xử lý nước hồ bơi hàng tuần', steps: [
          'Sáng thứ 2: Test nồng độ Clo, độ pH, độ trong của nước',
          'Ghi nhận kết quả vào sổ test',
          'Báo cáo TP KT và Phó phòng KT Xử lý nước',
          'Châm thêm Clo, hóa chất theo công thức chuẩn',
          'Bật hệ thống lọc 4 tiếng, quan sát độ trong sau lọc',
          'Test lại sau khi xử lý — đảm bảo đạt chuẩn QCVN 41:2011',
          'Lưu kết quả vào hệ thống, gửi thông báo cho QLCS',
        ], updatedAt: '2026-05-10', updatedBy: 'TP_KT' },
        { id: 'qt-kt-2', title: 'Quy trình kiểm tra máy bơm tuần hoàn', steps: [
          'Kiểm tra trực quan máy bơm hàng ngày: tiếng ồn, rung, rò rỉ',
          'Đo amperage 2 lần/tuần — so với chuẩn',
          'Vệ sinh bình lọc cát mỗi 2 tuần',
          'Thay cát lọc mỗi 6 tháng (hoặc sớm hơn nếu áp suất cao)',
          'Ghi log bảo trì + báo cáo Phó phòng KT Hệ thống',
        ], updatedAt: '2026-04-22', updatedBy: 'TP_KT' },
        { id: 'qt-kt-3', title: 'Quy trình xử lý sự cố hệ thống điện', steps: [
          'Phát hiện sự cố: thông báo QLCS ngay',
          'Cô lập khu vực để đảm bảo an toàn',
          'Đánh giá mức độ: nhỏ (NV KT xử lý) / vừa (Phó phòng) / lớn (TP KT + thuê ngoài)',
          'Thực hiện sửa chữa theo phân cấp',
          'Nghiệm thu sau sửa chữa',
          'Báo cáo bằng văn bản cho QLCS + GĐ KD',
        ], updatedAt: '2026-05-05', updatedBy: 'TP_KT' },
      ]
    },
    DT: { // Phòng Đào tạo
      name: 'Phòng Đào tạo',
      block: 'KD',
      list: [
        { id: 'qt-dt-1', title: 'Quy trình tuyển dụng & đào tạo giáo viên mới', steps: [
          'Đăng tin tuyển dụng + phối hợp với Phòng Nhân sự',
          'Sàng lọc CV: ưu tiên có chứng chỉ HLV bơi',
          'Phỏng vấn vòng 1: TP Đào tạo + Phó phòng Chuyên môn',
          'Test thực hành: dạy thử 1 buổi (có học viên thật)',
          'Phỏng vấn vòng 2: GĐ KD',
          'Ký hợp đồng thử việc 2 tháng',
          'Đào tạo nội bộ: 5 buổi (giáo án, kỹ năng giao tiếp, an toàn)',
          'Theo dõi + đánh giá hàng tuần bởi Tổ trưởng ĐT CS',
          'Cuối tháng thử việc thứ 2: đánh giá chính thức/không chính thức',
        ], updatedAt: '2026-05-12', updatedBy: 'TP_DT' },
        { id: 'qt-dt-2', title: 'Quy trình kiểm tra & cập nhật giáo án', steps: [
          'Mỗi đầu mùa (Q1, Q3): rà soát giáo án theo phản hồi học viên',
          'Phó phòng Chuyên môn cập nhật giáo án + duyệt nội bộ',
          'TP Đào tạo phê duyệt cuối cùng',
          'Tổ trưởng ĐT CS phổ biến cho giáo viên trong 7 ngày',
          'Quay video mẫu cho các bài khó',
        ], updatedAt: '2026-03-15', updatedBy: 'TP_DT' },
        { id: 'qt-dt-3', title: 'Quy trình tổ chức khóa thi cấp chứng chỉ bơi', steps: [
          'Lập danh sách học viên đủ điều kiện thi',
          'Phối hợp QLCS chuẩn bị bể bơi + giám thị',
          'Tổ chức thi theo barem chuẩn',
          'Chấm thi 2 vòng (giáo viên + Phó phòng CM)',
          'Cấp chứng chỉ cho học viên đạt',
          'Cập nhật vào App Đào tạo',
        ], updatedAt: '2026-04-30', updatedBy: 'TP_DT' },
      ]
    },
    MKT: { // Phòng Marketing
      name: 'Phòng Marketing',
      block: 'KD',
      list: [
        { id: 'qt-mkt-1', title: 'Quy trình lên kế hoạch chiến dịch tháng', steps: [
          'Ngày 25 hàng tháng: họp tổng kết tháng + lên kế hoạch tháng sau',
          'TP MKT phân tích dữ liệu lead, chi phí, ROI từ CRM',
          'Đề xuất ngân sách + KPI tháng',
          'Phân công: Tổ Content viết bài, Tổ Thiết kế làm visual, Tổ Editor làm video',
          'Phó phòng MKT lập timeline cụ thể',
          'TP MKT phê duyệt nội dung trước khi đăng',
        ], updatedAt: '2026-05-01', updatedBy: 'TP_MKT' },
        { id: 'qt-mkt-2', title: 'Quy trình A/B test quảng cáo Facebook Ads', steps: [
          'Tổ Content tạo 2-3 phiên bản nội dung',
          'Tổ Thiết kế làm 2-3 phiên bản visual',
          'Chạy thử với ngân sách nhỏ 3-5 ngày',
          'Phân tích CPL, CTR, lead chất lượng',
          'Chốt phiên bản tốt nhất + scale ngân sách',
          'Báo cáo TP MKT hàng tuần',
        ], updatedAt: '2026-04-18', updatedBy: 'TP_MKT' },
      ]
    },
    GS: { // Phòng Giám sát
      name: 'Phòng Giám sát',
      block: 'VP',
      list: [
        { id: 'qt-gs-1', title: 'Quy trình audit định kỳ cơ sở', steps: [
          'Lập lịch audit hàng tuần: 5 cơ sở luân phiên',
          'Đi audit không báo trước trong khung 9h-17h',
          'Checklist: vệ sinh, an toàn, dịch vụ KH, vận hành thiết bị, lưu trữ hồ sơ',
          'Ghi nhận vấn đề + chấm điểm tuân thủ',
          'Gửi báo cáo audit cho QLCS + GĐ KD trong 24h',
          'Theo dõi việc khắc phục vấn đề (deadline 7 ngày)',
        ], updatedAt: '2026-05-08', updatedBy: 'TP_GS' },
      ]
    },
    KE: { // Phòng Kế toán
      name: 'Phòng Kế toán',
      block: 'VP',
      list: [
        { id: 'qt-ke-1', title: 'Quy trình thu/chi hàng ngày', steps: [
          'Sáng: Tổ trưởng Lễ tân các CS nộp tiền mặt + sao kê POS',
          'NV Kế toán kiểm đếm + đối chiếu chứng từ',
          'Hạch toán vào phần mềm kế toán',
          'Cuối ngày: lập báo cáo doanh thu hợp nhất gửi GĐ KD',
          'Nộp ngân hàng vào sáng hôm sau',
        ], updatedAt: '2026-05-03', updatedBy: 'TP_KE' },
        { id: 'qt-ke-2', title: 'Quy trình lập báo cáo tháng', steps: [
          'Ngày 1-5 đầu tháng: khóa sổ tháng trước',
          'Đối chiếu doanh thu CRM với sổ kế toán',
          'Lập báo cáo P&L theo cơ sở + tổng cụm',
          'TP Kế toán phê duyệt',
          'Gửi cho CEO + Chủ đầu tư trước ngày 10',
        ], updatedAt: '2026-04-25', updatedBy: 'TP_KE' },
      ]
    },
    NS: { // Phòng Nhân sự
      name: 'Phòng Nhân sự',
      block: 'VP',
      list: [
        { id: 'qt-ns-1', title: 'Quy trình tuyển dụng tập trung', steps: [
          'Nhận yêu cầu tuyển từ các phòng/CS',
          'Đăng tuyển trên các kênh: TopCV, VietnamWorks, FB',
          'Sàng lọc CV trong 5 ngày',
          'Sắp lịch phỏng vấn vòng 1 (NV Nhân sự + TP)',
          'Phối hợp phòng yêu cầu phỏng vấn vòng 2',
          'Đàm phán lương + ký hợp đồng thử việc',
          'Onboarding: đào tạo nhập môn + giới thiệu hệ thống',
        ], updatedAt: '2026-05-06', updatedBy: 'TP_NS' },
        { id: 'qt-ns-2', title: 'Quy trình tính lương 3P hàng tháng', steps: [
          'Ngày 25: chốt số liệu KPI từ tất cả phòng',
          'Tính P1 (cố định) + P2 (năng lực) + P3 (KPI biến đổi)',
          'Soát lại với từng QLCS/TP',
          'TP Nhân sự + TP Kế toán duyệt cuối',
          'Lập danh sách lương gửi Kế toán chi',
          'Trả lương trước ngày 5 tháng sau',
        ], updatedAt: '2026-04-28', updatedBy: 'TP_NS' },
      ]
    }
  },

  // Tasks (giao việc / nhiệm vụ)
  // facility: cơ sở liên quan (null = liên quan toàn cụm)
  // dept: phòng liên quan (KT/DT/MKT/GS/KE/NS, null = không phải task chuyên môn)
  tasks: [
    { id: 1, title: 'Chuẩn bị event "Mùa hè rực rỡ 2026"', assignee: 'QLCS_HM', from: 'GD_KD', facility: 'HM', dept: null, deadline: '2026-06-01', status: 'in_progress', priority: 'high' },
    { id: 2, title: 'Báo cáo doanh thu tháng 5 chuẩn', assignee: 'QLCS_24NCT', from: 'GD_KD', facility: '24', dept: null, deadline: '2026-05-20', status: 'pending', priority: 'high' },
    { id: 3, title: 'Sửa hệ thống lọc bể to Hoàng Mai', assignee: 'TP_KT', from: 'QLCS_HM', facility: 'HM', dept: 'KT', deadline: '2026-05-25', status: 'in_progress', priority: 'medium' },
    { id: 4, title: 'Đào tạo 6 giáo viên phổ cập P. Hoàng Mai', assignee: 'TP_DT', from: 'GD_KD', facility: 'HM', dept: 'DT', deadline: '2026-06-15', status: 'pending', priority: 'medium' },
    { id: 5, title: 'A/B test Facebook Ads cho 24 NCT', assignee: 'TP_MKT', from: 'GD_KD', facility: '24', dept: 'MKT', deadline: '2026-05-30', status: 'pending', priority: 'medium' },
    { id: 6, title: 'Khảo sát điểm dã ngoại Hoà Bình', assignee: 'TP_DT', from: 'GD_KD', facility: null, dept: 'DT', deadline: '2026-06-10', status: 'in_progress', priority: 'low' },
    { id: 7, title: 'Test nước hồ ngoài trời CTT', assignee: 'TP_KT', from: 'QLCS_CTT', facility: 'CTT', dept: 'KT', deadline: '2026-05-20', status: 'completed', priority: 'high' },
    { id: 8, title: 'Tuyển 5 cứu hộ cho mùa hè', assignee: 'TP_NS', from: 'GD_KD', facility: null, dept: 'NS', deadline: '2026-05-31', status: 'in_progress', priority: 'high' },
    { id: 9, title: 'Kiểm tra chất lượng nước bể trẻ em CTT', assignee: 'TP_KT', from: 'QLCS_CTT', facility: 'CTT', dept: 'KT', deadline: '2026-05-22', status: 'pending', priority: 'medium' },
    { id: 10,title: 'Sắp xếp lịch dạy mùa hè Thanh Trì', assignee: 'TP_DT', from: 'QLCS_TT', facility: 'TT', dept: 'DT', deadline: '2026-05-28', status: 'in_progress', priority: 'medium' },
    { id: 11,title: 'Tổng kết KPI sale Q1 Hoàng Mai', assignee: 'NV_SALE', from: 'QLCS_HM', facility: 'HM', dept: null, deadline: '2026-05-25', status: 'in_progress', priority: 'medium' },
    { id: 12,title: 'Tổng vệ sinh sảnh Thuỵ Khuê cuối tuần', assignee: 'NV_CH', from: 'QLCS_TK', facility: 'TK', dept: null, deadline: '2026-05-21', status: 'pending', priority: 'low' },
  ],

  // Mapping role → khối (KD = Kinh doanh, VP = Văn phòng)
  roleBlock: {
    CEO: 'all', GD_KD: 'KD', GD_VP: 'VP',
    QLCS_HM:'KD', QLCS_TK:'KD', QLCS_CTT:'KD', QLCS_24NCT:'KD', QLCS_TT:'KD',
    TP_KT:'KD', TP_DT:'KD', TP_MKT:'KD', TIBAN_TT:'KD',
    TP_GS:'VP', TP_KE:'VP', TP_NS:'VP',
    TT_DT:'KD', GV_CB:'KD', NV_SALE:'KD', NV_CH:'KD',
  },

  // Mapping role → cơ sở chính (nếu là vai trò gắn cơ sở)
  roleFacility: {
    QLCS_HM: 'HM', QLCS_TK: 'TK', QLCS_CTT: 'CTT', QLCS_24NCT: '24', QLCS_TT: 'TT',
    // Cấp dưới mặc định gắn HM (demo)
    TT_DT: 'HM', GV_CB: 'HM', NV_SALE: 'HM', NV_CH: 'HM',
  },

  // Thông báo (notifications) — sẽ phát sinh tự động khi có việc/đề xuất/duyệt
  notifications: [
    { id: 'n1', to: 'QLCS_HM', type: 'task_assigned', title: 'Nhiệm vụ mới: Chuẩn bị event "Mùa hè rực rỡ 2026"', from: 'GD_KD', date: '2026-05-18 09:30', read: false, link: 'giao-viec', tab: 'nhiem-vu' },
    { id: 'n2', to: 'TP_KT',   type: 'proposal_received', title: 'Đề xuất ngang cấp: QLCS HM đề xuất nâng cấp bình lọc bể to', from: 'QLCS_HM', date: '2026-05-18 08:15', read: false, link: 'giao-viec', tab: 'de-xuat' },
    { id: 'n3', to: 'QLCS_HM', type: 'proposal_approved', title: '✓ Đề xuất nâng cấp bình lọc bể to đã được TP Kỹ thuật duyệt', from: 'TP_KT', date: '2026-05-17 14:20', read: false, link: 'giao-viec', tab: 'de-xuat' },
    { id: 'n4', to: 'TP_MKT',  type: 'task_assigned', title: 'Nhiệm vụ mới: A/B test Facebook Ads cho 24 NCT', from: 'GD_KD', date: '2026-05-17 10:00', read: true, link: 'giao-viec', tab: 'nhiem-vu' },
    { id: 'n5', to: 'GD_KD',   type: 'proposal_needs_approval', title: 'Cần duyệt: TP MKT đề xuất tăng ngân sách FB Ads', from: 'TP_MKT', date: '2026-05-15 16:45', read: false, link: 'giao-viec', tab: 'de-xuat' },
    { id: 'n6', to: 'GD_VP',   type: 'proposal_needs_approval', title: 'Cần duyệt (chéo khối): Team Building Khối KD — đã qua GĐ KD', from: 'GD_KD', date: '2026-05-16 11:00', read: false, link: 'giao-viec', tab: 'de-xuat' },
    { id: 'n7', to: 'TP_NS',   type: 'task_assigned', title: 'Triển khai Team Building Khối KD — sau khi 2 GĐ duyệt', from: 'GD_VP', date: '2026-05-13 17:00', read: true, link: 'giao-viec', tab: 'nhiem-vu' },
    { id: 'n8', to: 'TP_KE',   type: 'task_assigned', title: 'Soát 54 hợp đồng học Lặn CTT — đề xuất từ TP Đào tạo', from: 'GD_VP', date: '2026-05-13 09:30', read: true, link: 'giao-viec', tab: 'nhiem-vu' },
    { id: 'n9', to: 'QLCS_HM', type: 'task_completed', title: 'Cấp dưới đã báo cáo: Test nước hồ — hoàn thành', from: 'TP_KT', date: '2026-05-18 11:00', read: false, link: 'giao-viec', tab: 'giao-viec' },
    { id: 'n10',to: 'CEO',     type: 'system', title: 'Báo cáo doanh thu tuần đã sẵn sàng', from: 'system', date: '2026-05-19 06:00', read: false, link: 'bao-cao', tab: null },
  ],

  // Đề xuất (Proposals) — phân biệt với Tasks
  // type: 'up' (lên cấp trên) | 'peer' (ngang cấp) | 'cross-bloc' (sang khối khác — cần 2 GĐ duyệt)
  proposals: [
    {
      id: 'p1',
      title: 'Đề xuất tăng ngân sách Facebook Ads Q3 lên 50 Tr/tháng',
      description: 'Hiện chi 30 Tr/tháng, đề xuất tăng 67% để boost lead trước mùa cao điểm. Dự kiến CPL giảm 15%.',
      from: 'TP_MKT',
      facility: null,
      dept: 'MKT',
      type: 'up',
      directApprover: 'GD_KD',
      approvalChain: [
        { role: 'GD_KD', status: 'pending', date: null, note: '' }
      ],
      status: 'pending',
      priority: 'high',
      createdAt: '2026-05-15',
      finalAssignee: null,
    },
    {
      id: 'p2',
      title: 'Đề xuất tổ chức Team Building khối KD — Hoà Bình',
      description: '~50 người, 2N1Đ, ngân sách dự kiến 150 Tr. Cần Khối VP (Nhân sự + Kế toán) phối hợp triển khai.',
      from: 'QLCS_HM',
      facility: 'HM',
      dept: null,
      type: 'cross-bloc',
      crossDirection: 'KD->VP',
      approvalChain: [
        { role: 'GD_KD', status: 'approved', date: '2026-05-16', note: 'Đồng ý chủ trương, ngân sách OK' },
        { role: 'GD_VP', status: 'pending',  date: null, note: '' }
      ],
      status: 'in_approval',
      priority: 'medium',
      createdAt: '2026-05-14',
      finalAssignee: 'TP_NS', // sau khi 2 GĐ duyệt sẽ giao cho TP NS triển khai
    },
    {
      id: 'p3',
      title: 'Đề xuất Kế toán soát lại 54 hợp đồng học Lặn CTT — chênh lệch doanh thu',
      description: 'Số chứng chỉ Lặn YTD = 32 nhưng doanh thu Lặn = 680 Tr. Tỷ lệ doanh thu/chứng chỉ cao bất thường. Đề nghị Kế toán rà soát.',
      from: 'TP_DT',
      facility: 'CTT',
      dept: 'DT',
      type: 'cross-bloc',
      crossDirection: 'KD->VP',
      approvalChain: [
        { role: 'GD_KD', status: 'approved', date: '2026-05-12', note: 'Cần xác minh sớm' },
        { role: 'GD_VP', status: 'approved', date: '2026-05-13', note: 'Giao TP Kế toán xử lý trong tuần' }
      ],
      status: 'in_execution',
      priority: 'high',
      createdAt: '2026-05-11',
      finalAssignee: 'TP_KE',
    },
    {
      id: 'p4',
      title: 'Đề xuất nâng cấp bình lọc bể to Hoàng Mai (đề xuất ngang cấp gửi TP KT)',
      description: 'Bình lọc hiện không đủ công suất cho 638 HV trẻ em. Đề nghị TP KT khảo sát và lập kế hoạch nâng cấp.',
      from: 'QLCS_HM',
      facility: 'HM',
      dept: 'KT',
      type: 'peer',
      directApprover: 'TP_KT',
      approvalChain: [
        { role: 'TP_KT', status: 'approved', date: '2026-05-13', note: 'Đã lên kế hoạch, dự kiến T6 thực hiện' }
      ],
      status: 'approved',
      priority: 'medium',
      createdAt: '2026-05-10',
      finalAssignee: null,
    },
    {
      id: 'p5',
      title: 'Đề xuất tăng lương đội Sale Hoàng Mai theo KPI vượt trội',
      description: '5 sale Hoàng Mai đều vượt KPI Q1. Đề xuất tăng P2 (lương năng lực) 15% và thưởng vượt KPI 20 Tr/người.',
      from: 'QLCS_HM',
      facility: 'HM',
      dept: null,
      type: 'cross-bloc',
      crossDirection: 'KD->VP',
      approvalChain: [
        { role: 'GD_KD', status: 'pending', date: null, note: '' },
        { role: 'GD_VP', status: 'pending', date: null, note: '' }
      ],
      status: 'pending',
      priority: 'medium',
      createdAt: '2026-05-17',
      finalAssignee: 'TP_KE',
    },
    {
      id: 'p6',
      title: 'Đề xuất TP Đào tạo phối hợp tổ chức Workshop cứu hộ tại 24 NCT',
      description: 'Mời chuyên gia về dạy 3 buổi cho NV Cứu hộ + Tổ trưởng An sinh. Tổng kinh phí 8 Tr.',
      from: 'QLCS_24NCT',
      facility: '24',
      dept: 'DT',
      type: 'peer',
      directApprover: 'TP_DT',
      approvalChain: [
        { role: 'TP_DT', status: 'pending', date: null, note: '' }
      ],
      status: 'pending',
      priority: 'low',
      createdAt: '2026-05-18',
      finalAssignee: null,
    },
  ],

  // Lương 3P sample
  salary: {
    'NV_SALE': { p1: 6000000, p2: 2000000, p3_base: 4000000 },
    'GV_CB':   { p1: 5000000, p2: 1500000, p3_base: 3000000 },
    'NV_CH':   { p1: 5500000, p2: 1000000, p3_base: 2000000 },
    'TT_DT':   { p1: 8000000, p2: 3000000, p3_base: 5000000 },
    'QLCS_HM': { p1: 18000000, p2: 6000000, p3_base: 12000000 },
  },

  // KPI 3 tầng cho NV Sale
  kpi3Layers: {
    outcome: [
      { name: 'Doanh thu tháng', target: 1500, actual: 1850, unit: 'Triệu', weight: 50 },
      { name: 'Số hợp đồng chốt', target: 80, actual: 95, unit: 'HĐ', weight: 30 },
    ],
    process: [
      { name: 'Tỷ lệ chốt leads', target: 60, actual: 62, unit: '%', weight: 10 },
      { name: 'Thời gian phản hồi lead', target: 30, actual: 25, unit: 'phút', weight: 5 },
    ],
    input: [
      { name: 'Số leads tiếp cận', target: 150, actual: 168, unit: 'leads', weight: 3 },
      { name: 'Số cuộc gặp khách', target: 40, actual: 45, unit: 'cuộc', weight: 2 },
    ]
  }
};
