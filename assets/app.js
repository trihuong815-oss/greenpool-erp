// ============================================
// Green Pool ERP — App logic
// ============================================

let currentUser = null;
let currentRoute = 'dashboard';
const chartInstances = {};

// ===== Service Packages persistence (localStorage) =====
const PACKAGES_STORAGE_KEY = 'greenpool_service_packages_v1';

function loadPackagesFromStorage() {
  try {
    const raw = localStorage.getItem(PACKAGES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('Failed to load packages:', e); }
  return null;
}

function savePackagesToStorage(groups) {
  try {
    localStorage.setItem(PACKAGES_STORAGE_KEY, JSON.stringify(groups));
    return true;
  } catch (e) {
    console.error('Failed to save packages:', e);
    return false;
  }
}

function resetPackagesToDefault() {
  localStorage.removeItem(PACKAGES_STORAGE_KEY);
}

// Returns currently active package data (from storage or default)
function getActivePackages() {
  const stored = loadPackagesFromStorage();
  return stored || GP_DATA.servicePackages.groups;
}

// ===== PERMISSION HELPERS =====

// Ma trận menu — vai trò nào thấy module nào trên sidebar
const MENU_PERMISSIONS = {
  // Lãnh đạo - thấy tất cả
  CEO:       ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  GD_KD:     ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  GD_VP:     ['dashboard',         'checklist','quy-trinh','giao-viec','sodo','luong','bao-cao'],

  // QLCS - thấy tất cả module nhưng dữ liệu chỉ cơ sở mình
  QLCS_HM:   ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  QLCS_TK:   ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  QLCS_CTT:  ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  QLCS_24NCT:['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],
  QLCS_TT:   ['dashboard','doanh-so','checklist','quy-trinh','giao-viec','sodo','luong','bao-cao','daotao','mkt','settings-packages'],

  // TP chuyên môn KD: KHÔNG có doanh số, không có quản lý gói. Có quy trình phòng mình.
  TP_KT:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao'],
  TP_DT:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','daotao'],
  TP_MKT:    ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','mkt'],
  TIBAN_TT:  ['dashboard','checklist','quy-trinh','giao-viec','bao-cao'],

  // TP Khối VP
  TP_GS:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','sodo'],
  TP_KE:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','luong'],
  TP_NS:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao','luong','sodo'],

  // Cấp dưới - chỉ xem quy trình phòng mình
  TT_DT:     ['dashboard','checklist','quy-trinh','giao-viec','bao-cao'],
  GV_CB:     ['dashboard','checklist','quy-trinh','giao-viec'],
  NV_SALE:   ['dashboard','checklist','giao-viec'],
  NV_CH:     ['dashboard','checklist','giao-viec'],
};

// Mapping role → phòng (department) cho module Quy trình
const ROLE_DEPT = {
  TP_KT: 'KT', TP_DT: 'DT', TP_MKT: 'MKT', TIBAN_TT: 'MKT',
  TP_GS: 'GS', TP_KE: 'KE', TP_NS: 'NS',
  TT_DT: 'DT', GV_CB: 'DT',
};

function canAccessRoute(route) {
  if (!currentUser) return false;
  const allowed = MENU_PERMISSIONS[currentUser.roleCode] || [];
  return allowed.includes(route);
}

function applyMenuPermissions() {
  if (!currentUser) return;
  const allowed = MENU_PERMISSIONS[currentUser.roleCode] || ['dashboard'];
  document.querySelectorAll('.nav-item').forEach(el => {
    const route = el.dataset.route;
    if (!route) return;
    el.style.display = allowed.includes(route) ? '' : 'none';
  });
}

// "Cơ sở nào, cơ sở đó nhìn; phòng nào, phòng đó nhìn checklist; doanh số tương tự"

// Trả về danh sách cơ sở mà user hiện tại có quyền xem
function getVisibleFacilities() {
  const code = currentUser?.roleCode;
  if (!code) return [];
  // CEO + 2 GĐ Khối: xem tất cả
  if (code === 'CEO' || code === 'GD_KD' || code === 'GD_VP') return ['HM','TK','CTT','24','TT'];
  // QLCS: chỉ cơ sở mình
  if (code.startsWith('QLCS_')) return [currentUser.roleData.scope];
  // TP chuyên môn (KT, ĐT, MKT): xem tất cả 5 CS (xuyên ngang) nhưng chỉ phần phòng mình
  if (code === 'TP_KT' || code === 'TP_DT' || code === 'TP_MKT') return ['HM','TK','CTT','24','TT'];
  // TP Khối VP: xem tất cả
  if (code === 'TP_GS' || code === 'TP_KE' || code === 'TP_NS') return ['HM','TK','CTT','24','TT'];
  // Tổ trưởng & nhân viên: chỉ cơ sở chính của mình
  const fac = GP_DATA.roleFacility?.[code];
  return fac ? [fac] : [];
}

function canSeeAllFacilities() {
  const code = currentUser?.roleCode;
  return code === 'CEO' || code === 'GD_KD' || code === 'GD_VP';
}

function isQLCS() {
  return currentUser?.roleCode?.startsWith('QLCS_');
}

function isTPChuyenMon() {
  return ['TP_KT','TP_DT','TP_MKT'].includes(currentUser?.roleCode);
}

function getMyFacilityId() {
  const code = currentUser?.roleCode;
  if (code?.startsWith('QLCS_')) return currentUser.roleData.scope;
  return GP_DATA.roleFacility?.[code] || null;
}

// Tasks/Proposals user có thể xem (phân quyền chặt theo cơ sở)
function getAccessibleTasks() {
  const code = currentUser?.roleCode;
  if (!code) return [];
  const visibleFacs = getVisibleFacilities();
  return GP_DATA.tasks.filter(t => {
    // Direct involvement (always visible)
    if (t.assignee === code || t.from === code) return true;
    // CEO/GĐ Khối: nhìn theo phạm vi
    if (canSeeAllFacilities()) return true;
    // Có facility → chỉ thấy nếu facility thuộc phạm vi
    if (t.facility) return visibleFacs.includes(t.facility);
    // QLCS: thấy task tại CS mình
    if (isQLCS()) return t.facility === currentUser.roleData.scope;
    // TP chuyên môn: thấy task của phòng mình xuyên CS
    if (isTPChuyenMon()) {
      const myDept = code === 'TP_KT' ? 'KT' : code === 'TP_DT' ? 'DT' : code === 'TP_MKT' ? 'MKT' : null;
      return t.dept === myDept;
    }
    return false;
  });
}

function getAccessibleProposals() {
  const code = currentUser?.roleCode;
  if (!code) return [];
  const visibleFacs = getVisibleFacilities();
  return GP_DATA.proposals.filter(p => {
    // Direct involvement
    if (p.from === code) return true;
    if (p.approvalChain?.some(s => s.role === code)) return true;
    if (p.finalAssignee === code) return true;
    if (canSeeAllFacilities()) return true;
    if (p.facility) return visibleFacs.includes(p.facility);
    if (isQLCS()) return p.facility === currentUser.roleData.scope;
    if (isTPChuyenMon()) {
      const myDept = code === 'TP_KT' ? 'KT' : code === 'TP_DT' ? 'DT' : code === 'TP_MKT' ? 'MKT' : null;
      return p.dept === myDept;
    }
    return false;
  });
}

// ===== NOTIFICATIONS =====
function getMyNotifications() {
  if (!currentUser) return [];
  return GP_DATA.notifications.filter(n => n.to === currentUser.roleCode);
}

function getUnreadCount() {
  return getMyNotifications().filter(n => !n.read).length;
}

function toggleNotifications() {
  const dd = document.getElementById('notif-dropdown');
  dd.classList.toggle('hidden');
  if (!dd.classList.contains('hidden')) renderNotifications();
}

function renderNotifications() {
  const notifs = getMyNotifications().sort((a,b) => b.date.localeCompare(a.date));
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (notifs.length === 0) {
    list.innerHTML = '<div class="p-6 text-center text-slate-500 text-sm">Chưa có thông báo nào</div>';
    return;
  }
  const icons = {
    task_assigned: '📥', proposal_received: '📤', proposal_approved: '✅',
    proposal_needs_approval: '⏳', task_completed: '✓', system: '🔔', proposal_rejected: '❌'
  };
  list.innerHTML = notifs.map(n => `
    <div onclick="openNotification('${n.id}')" class="p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${!n.read ? 'bg-blue-50/40' : ''}">
      <div class="flex items-start gap-2">
        <div class="text-xl flex-shrink-0">${icons[n.type] || '🔔'}</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-slate-800 ${!n.read ? '' : 'opacity-70'}">${n.title}</div>
          <div class="text-xs text-slate-500 mt-1 flex items-center gap-2">
            <span>${n.from === 'system' ? 'Hệ thống' : GP_DATA.roles[n.from]?.name || n.from}</span>
            <span>·</span>
            <span>${n.date}</span>
            ${!n.read ? '<span class="ml-auto w-2 h-2 bg-blue-500 rounded-full"></span>' : ''}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function openNotification(id) {
  const n = GP_DATA.notifications.find(x => x.id === id);
  if (!n) return;
  n.read = true;
  document.getElementById('notif-dropdown').classList.add('hidden');
  if (n.tab) workflowTab = n.tab;
  navigate(n.link);
  updateNotificationBadge();
}

function markAllNotificationsRead() {
  getMyNotifications().forEach(n => n.read = true);
  renderNotifications();
  updateNotificationBadge();
}

function updateNotificationBadge() {
  const count = getUnreadCount();
  const badge = document.getElementById('notif-count');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Close notifications when clicking outside
document.addEventListener('click', (e) => {
  const dd = document.getElementById('notif-dropdown');
  if (!dd || dd.classList.contains('hidden')) return;
  if (!e.target.closest('#notif-dropdown') && !e.target.closest('button[onclick="toggleNotifications()"]')) {
    dd.classList.add('hidden');
  }
});

function login() {
  const email = document.getElementById('email').value;
  const roleCode = document.getElementById('role-selector').value;
  const role = GP_DATA.roles[roleCode];
  if (!role) return alert('Vui lòng chọn vai trò');

  // Find employee or create one
  let employee = GP_DATA.employees.find(e => e.role === roleCode);
  if (!employee) {
    employee = { name: 'User Demo', role: roleCode, email, facility: '-' };
  }

  currentUser = { ...employee, roleData: role, roleCode };

  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Update user info in sidebar
  const initials = currentUser.name.split(' ').map(w => w[0]).slice(-2).join('');
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = currentUser.name;
  document.getElementById('user-role').textContent = role.name;

  // Today's date
  const today = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.getElementById('today-date').textContent = today;

  // Update notification badge
  updateNotificationBadge();

  // Áp dụng menu phân quyền — ẩn module user không có quyền truy cập
  applyMenuPermissions();

  navigate('dashboard');
}

function logout() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  currentUser = null;
}

function navigate(route) {
  // PERMISSION GUARD: chặn navigate tới module user không có quyền
  if (currentUser && !canAccessRoute(route)) {
    const content = document.getElementById('page-content');
    document.getElementById('page-title').textContent = 'Không có quyền truy cập';
    document.getElementById('page-subtitle').textContent = '';
    content.innerHTML = `<div class="card text-center py-16">
      <div class="text-5xl mb-4">🔒</div>
      <div class="font-bold text-slate-800 text-lg mb-2">Bạn không có quyền truy cập module này</div>
      <div class="text-sm text-slate-500 mb-4">Vai trò "${currentUser.roleData.name}" không bao gồm quyền với module "${route}".</div>
      <button onclick="navigate('dashboard')" class="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm">← Quay lại Dashboard</button>
    </div>`;
    return;
  }
  currentRoute = route;
  // Destroy old chart instances
  Object.values(chartInstances).forEach(c => c.destroy());
  Object.keys(chartInstances).forEach(k => delete chartInstances[k]);

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === route);
  });

  const content = document.getElementById('page-content');
  const titles = {
    dashboard: ['Dashboard', `Tổng quan ${currentUser.roleData.name}`],
    'doanh-so': ['Doanh số', 'Tổng hợp doanh thu · Hiệu suất sale · Tiến độ tháng'],
    'checklist': ['Checklist vận hành', 'Theo dõi công việc hàng ngày'],
    'quy-trinh': ['Quy trình vận hành phòng ban', 'Tài liệu vận hành chính thức — có upload file + quản lý phiên bản'],
    'giao-viec': ['Giao việc & Đề xuất', 'Workflow nội bộ'],
    'sodo': ['Sơ đồ tổ chức', '42 vai trò × 5 tầng'],
    'luong': ['Lương 3P & KPI', 'Mô hình lương thưởng'],
    'bao-cao': ['Báo cáo tự động', 'Xuất file Word/Excel'],
    'daotao': ['Quản lý Đào tạo', 'Tích hợp API app học viên'],
    'mkt': ['Quản lý Marketing', 'Tích hợp API app MKT'],
    'settings-packages': ['Quản lý gói dịch vụ', 'Thêm/sửa/xóa gói — Thay đổi tự lưu trong trình duyệt'],
  };
  const [title, subtitle] = titles[route] || ['Trang không tồn tại', ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = subtitle;

  // Render content
  const renderers = {
    dashboard: renderDashboard,
    'doanh-so': renderDoanhSo,
    'checklist': renderChecklist,
    'quy-trinh': renderQuyTrinh,
    'giao-viec': renderGiaoViec,
    'sodo': renderSoDo,
    'luong': renderLuong,
    'bao-cao': renderBaoCao,
    'daotao': renderDaoTao,
    'mkt': renderMKT,
    'settings-packages': renderSettingsPackages,
  };
  content.innerHTML = '';
  if (renderers[route]) renderers[route](content);
}

// ====================== DASHBOARD ======================
function renderDashboard(el) {
  const role = currentUser.roleCode;
  // Different dashboards for different roles
  if (role === 'CEO' || role === 'GD_KD' || role === 'GD_VP') {
    renderDashboardExecutive(el);
  } else if (role.startsWith('QLCS_')) {
    renderDashboardQLCS(el);
  } else if (role.startsWith('TP_') || role === 'TIBAN_TT') {
    renderDashboardTP(el);
  } else {
    renderDashboardNV(el);
  }
}

function renderDashboardExecutive(el) {
  const r = GP_DATA.revenue.cluster;
  el.innerHTML = `
    <!-- KPI Row -->
    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="kpi-card border-l-4 border-blue-700">
        <div class="kpi-label">Tổng Doanh thu (1.1-15.5)</div>
        <div class="kpi-value">${(r.total/1000).toFixed(2)} <span class="text-lg text-slate-500">Tỷ</span></div>
        <div class="kpi-sub">5 cơ sở · 4,5 tháng</div>
        <span class="kpi-trend up">+${(r.percent_target - 100).toFixed(1)}% vs Target</span>
      </div>
      <div class="kpi-card border-l-4 border-emerald-700">
        <div class="kpi-label">Tổng Hợp đồng</div>
        <div class="kpi-value">10.985</div>
        <div class="kpi-sub">61,5% chốt từ 17.863 leads</div>
      </div>
      <div class="kpi-card border-l-4 border-amber-600">
        <div class="kpi-label">Học viên đang theo học</div>
        <div class="kpi-value">5.006</div>
        <div class="kpi-sub">7 chương trình × 5 cơ sở</div>
      </div>
      <div class="kpi-card border-l-4 border-rose-700">
        <div class="kpi-label">Nhịp tăng B vs A</div>
        <div class="kpi-value">+109<span class="text-lg">%</span></div>
        <div class="kpi-sub">Khởi động mùa cao điểm</div>
      </div>
    </div>

    <!-- Charts row -->
    <div class="grid grid-cols-3 gap-4 mb-4">
      <div class="card col-span-2">
        <div class="card-title">Doanh thu vs Target — 5 cơ sở</div>
        <div style="height: 280px"><canvas id="chartFacility"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Cơ cấu doanh thu</div>
        <div style="height: 280px"><canvas id="chartComp"></canvas></div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 mb-4">
      <div class="card">
        <div class="card-title">Tỷ lệ chốt theo cơ sở</div>
        <div style="height: 240px"><canvas id="chartConv"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Việc cần xử lý hôm nay</div>
        ${renderTaskList(GP_DATA.tasks.filter(t => t.status !== 'completed').slice(0, 5))}
      </div>
    </div>

    ${renderTaskBreakdownByFacility()}
    ${renderProposalBreakdownByDept()}
  `;

  // Charts
  const facs = GP_DATA.revenue.facilities;
  chartInstances.facility = new Chart(document.getElementById('chartFacility'), {
    type: 'bar',
    data: {
      labels: facs.map(f => GP_DATA.facilities.find(x => x.id === f.id).name),
      datasets: [
        { label: 'Target', data: facs.map(f => f.target/1000), backgroundColor: '#1F3A5F', borderRadius: 4 },
        { label: 'Đạt',    data: facs.map(f => f.total/1000),  backgroundColor: '#C9A227', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { ticks: { callback: v => v + ' Tỷ' } } }
    }
  });

  chartInstances.comp = new Chart(document.getElementById('chartComp'), {
    type: 'doughnut',
    data: {
      labels: ['Kinh doanh','Vé lẻ','Bán hàng','Khác'],
      datasets: [{
        data: [r.kinh_doanh, r.ve_le, r.ban_hang, r.khac],
        backgroundColor: ['#1F3A5F','#2E8B8B','#C9A227','#E07A5F'],
        borderColor: 'white', borderWidth: 2
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '55%' }
  });

  chartInstances.conv = new Chart(document.getElementById('chartConv'), {
    type: 'bar',
    data: {
      labels: ['Thuỵ Khuê','24 NCT','Hoàng Mai','Thanh Trì','CTT'],
      datasets: [{
        label: 'Tỷ lệ chốt (%)',
        data: [84.1, 76.4, 61.9, 61.7, 53.8],
        backgroundColor: ['#2d6a4f','#5b8c5a','#C9A227','#C9A227','#E07A5F'],
        borderRadius: 4
      }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { max: 100, ticks: { callback: v => v + '%' } } } }
  });
}

function renderDashboardQLCS(el) {
  const facilityId = currentUser.roleData.scope;
  const facility = GP_DATA.facilities.find(f => f.id === facilityId);
  const r = GP_DATA.revenue.facilities.find(f => f.id === facilityId);
  const conv = GP_DATA.sources.byFacility[facilityId];
  // Tất cả task/đề xuất tại cơ sở mình
  const facilityTasks = GP_DATA.tasks.filter(t => t.facility === facilityId);
  const facilityProposals = GP_DATA.proposals.filter(p => p.facility === facilityId);
  const myTasks = GP_DATA.tasks.filter(t => t.assignee === currentUser.roleCode || t.from === currentUser.roleCode);

  el.innerHTML = `
    <div class="mb-4 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold" style="background:${facility.color}">${facility.id}</div>
        <div>
          <div class="text-sm text-slate-500">Bạn đang quản lý</div>
          <div class="text-xl font-bold text-slate-800">Cơ sở ${facility.name}</div>
          <div class="text-xs text-slate-500">${facility.address}</div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="kpi-card border-l-4" style="border-color:${facility.color}">
        <div class="kpi-label">Doanh thu cơ sở</div>
        <div class="kpi-value">${(r.total/1000).toFixed(2)} <span class="text-lg text-slate-500">Tỷ</span></div>
        <div class="kpi-sub">Target ${(r.target/1000).toFixed(2)} Tỷ</div>
        <span class="kpi-trend up">+${((r.total - r.target)/r.target * 100).toFixed(1)}%</span>
      </div>
      <div class="kpi-card border-l-4 border-emerald-700">
        <div class="kpi-label">Tỷ lệ chốt</div>
        <div class="kpi-value">${conv.rate}<span class="text-lg">%</span></div>
        <div class="kpi-sub">${conv.chot}/${conv.leads} leads</div>
      </div>
      <div class="kpi-card border-l-4 border-amber-600">
        <div class="kpi-label">Việc đang giao</div>
        <div class="kpi-value">${myTasks.filter(t => t.status === 'in_progress').length}</div>
        <div class="kpi-sub">Tổng ${myTasks.length} việc</div>
      </div>
      <div class="kpi-card border-l-4 border-rose-700">
        <div class="kpi-label">Nhân sự CS</div>
        <div class="kpi-value">~${Math.round(60 + Math.random()*15)}</div>
        <div class="kpi-sub">5 tổ chính</div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 mb-4">
      <div class="card">
        <div class="card-title">Cơ cấu doanh thu — ${facility.name}</div>
        <div style="height: 260px"><canvas id="chartFCB"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Học viên theo dịch vụ</div>
        <div style="height: 260px"><canvas id="chartStudents"></canvas></div>
      </div>
    </div>

    <!-- Tổng quan task/đề xuất tại CS -->
    <div class="grid grid-cols-4 gap-3 mb-4">
      <div class="kpi-card border-l-4 border-blue-700">
        <div class="kpi-label">Việc tại CS</div>
        <div class="kpi-value">${facilityTasks.length}</div>
        <div class="kpi-sub">${facilityTasks.filter(t => t.status === 'in_progress').length} đang xử lý</div>
      </div>
      <div class="kpi-card border-l-4 border-amber-600">
        <div class="kpi-label">Đề xuất tại CS</div>
        <div class="kpi-value">${facilityProposals.length}</div>
        <div class="kpi-sub">${facilityProposals.filter(p => p.status === 'pending' || p.status === 'in_approval').length} chờ duyệt</div>
      </div>
      <div class="kpi-card border-l-4 border-rose-700">
        <div class="kpi-label">Việc khẩn</div>
        <div class="kpi-value">${facilityTasks.filter(t => t.priority === 'high' && t.status !== 'completed').length}</div>
        <div class="kpi-sub">Ưu tiên cao</div>
      </div>
      <div class="kpi-card border-l-4 border-emerald-700">
        <div class="kpi-label">Hoàn thành tuần này</div>
        <div class="kpi-value">${facilityTasks.filter(t => t.status === 'completed').length}</div>
        <div class="kpi-sub">Đã xong</div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="card">
        <div class="card-title">Việc tại cơ sở ${facility.name}</div>
        ${renderTaskList(facilityTasks.slice(0, 5))}
        ${facilityTasks.length > 5 ? `<div class="mt-2 text-xs text-blue-700 hover:underline cursor-pointer" onclick="navigate('giao-viec')">Xem tất cả ${facilityTasks.length} việc →</div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">Đề xuất tại cơ sở</div>
        ${facilityProposals.length === 0 ? '<div class="text-sm text-slate-500 italic py-4 text-center">Không có đề xuất</div>' : `<div class="space-y-2">${facilityProposals.slice(0, 4).map(p => `
          <div class="p-2 hover:bg-slate-50 rounded text-sm">
            <div class="font-medium text-slate-800 mb-0.5">${p.title}</div>
            <div class="text-xs text-slate-500">Từ: ${GP_DATA.roles[p.from]?.name || p.from} · ${p.status === 'pending' ? '⏳ Chờ duyệt' : p.status === 'in_approval' ? '🔄 Đang qua duyệt' : '✓ Đã duyệt'}</div>
          </div>
        `).join('')}</div>`}
      </div>
    </div>
  `;

  chartInstances.fcb = new Chart(document.getElementById('chartFCB'), {
    type: 'doughnut',
    data: {
      labels: ['Kinh doanh','Vé lẻ','Bán hàng','Khác'],
      datasets: [{
        data: [r.kinh_doanh, r.ve_le, r.ban_hang, r.khac],
        backgroundColor: ['#1F3A5F','#2E8B8B','#C9A227','#E07A5F'],
        borderColor: 'white', borderWidth: 2
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  const students = GP_DATA.students.byFacility[facilityId];
  chartInstances.stu = new Chart(document.getElementById('chartStudents'), {
    type: 'bar',
    data: {
      labels: GP_DATA.students.services,
      datasets: [{ label: 'Số học viên', data: students, backgroundColor: facility.color, borderRadius: 4 }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

function renderDashboardTP(el) {
  const code = currentUser.roleCode;
  const myDept = code === 'TP_KT' ? 'KT' : code === 'TP_DT' ? 'DT' : code === 'TP_MKT' ? 'MKT' : code === 'TP_GS' ? 'GS' : code === 'TP_KE' ? 'KE' : code === 'TP_NS' ? 'NS' : null;
  const FACS = ['HM','TK','CTT','24','TT'];
  const facNames = { HM:'Hoàng Mai', TK:'Thuỵ Khuê', CTT:'CTT', '24':'24 NCT', TT:'Thanh Trì' };

  // Task/đề xuất thuộc phòng mình (xuyên 5 CS)
  const deptTasks = GP_DATA.tasks.filter(t => t.dept === myDept);
  const deptProposals = GP_DATA.proposals.filter(p => p.dept === myDept || p.approvalChain?.some(s => s.role === code));
  const proposalsToApprove = GP_DATA.proposals.filter(p => p.approvalChain?.some(s => s.role === code && s.status === 'pending'));

  // Breakdown task theo cơ sở (xem phòng mình hoạt động tại CS nào)
  const taskByFac = FACS.map(f => ({
    id: f,
    name: facNames[f],
    count: deptTasks.filter(t => t.facility === f).length,
  })).filter(x => x.count > 0);

  el.innerHTML = `
    <div class="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <div class="font-semibold text-slate-800">Phòng ${currentUser.roleData.name}</div>
      <div class="text-sm text-slate-700 mt-1">📍 Phụ trách chuyên môn xuyên 5 cơ sở. Bạn nhìn thấy việc/đề xuất thuộc phòng mình tại mọi cơ sở.</div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="kpi-card border-l-4 border-blue-700">
        <div class="kpi-label">Tổng việc phòng</div>
        <div class="kpi-value">${deptTasks.length}</div>
        <div class="kpi-sub">${deptTasks.filter(t => t.status === 'in_progress').length} đang xử lý</div>
      </div>
      <div class="kpi-card border-l-4 border-emerald-700">
        <div class="kpi-label">Đề xuất phòng</div>
        <div class="kpi-value">${deptProposals.length}</div>
        <div class="kpi-sub">${deptProposals.filter(p => p.status === 'in_execution' || p.status === 'approved').length} đã duyệt</div>
      </div>
      <div class="kpi-card border-l-4 border-amber-600">
        <div class="kpi-label">Đề xuất chờ tôi duyệt</div>
        <div class="kpi-value">${proposalsToApprove.length}</div>
        <div class="kpi-sub">Cần phản hồi</div>
      </div>
      <div class="kpi-card border-l-4 border-purple-700">
        <div class="kpi-label">KPI tháng</div>
        <div class="kpi-value">87<span class="text-lg">%</span></div>
        <div class="kpi-sub">Đạt mục tiêu</div>
      </div>
    </div>

    ${taskByFac.length > 0 ? `<div class="card mb-4">
      <div class="card-title">Việc của phòng phân bổ theo cơ sở</div>
      <div class="grid grid-cols-5 gap-3">
        ${taskByFac.map(f => `
          <div class="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div class="text-xs text-slate-500">${f.name}</div>
            <div class="text-2xl font-bold text-slate-800 mt-1">${f.count}</div>
            <div class="text-xs text-slate-400">việc</div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <div class="grid grid-cols-2 gap-4">
      <div class="card">
        <div class="card-title">Việc thuộc phòng</div>
        ${renderTaskList(deptTasks.slice(0, 5))}
        ${deptTasks.length > 5 ? `<div class="mt-2 text-xs text-blue-700 hover:underline cursor-pointer" onclick="navigate('giao-viec')">Xem tất cả ${deptTasks.length} →</div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">Đề xuất ${proposalsToApprove.length > 0 ? `<span class="ml-2 text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">${proposalsToApprove.length} chờ duyệt</span>` : ''}</div>
        ${deptProposals.length === 0 ? '<div class="text-sm text-slate-500 italic py-4 text-center">Không có đề xuất</div>' : `<div class="space-y-2">${deptProposals.slice(0, 4).map(p => `
          <div class="p-2 hover:bg-slate-50 rounded text-sm">
            <div class="font-medium text-slate-800 mb-0.5">${p.title}</div>
            <div class="text-xs text-slate-500">Từ: ${GP_DATA.roles[p.from]?.name || p.from} · ${p.status === 'pending' ? '⏳ Chờ duyệt' : p.status === 'in_approval' ? '🔄 Đang qua duyệt' : p.status === 'approved' ? '✓ Đã duyệt' : '🚀 Đang triển khai'}</div>
          </div>
        `).join('')}</div>`}
      </div>
    </div>
  `;
}

function renderDashboardNV(el) {
  const tasks = GP_DATA.tasks.slice(0, 3);
  const checklist = GP_DATA.checklistTemplates['NV Cứu hộ'] || [];
  el.innerHTML = `
    <div class="mb-4 p-4 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-200 rounded-xl">
      <div class="font-semibold text-slate-800">Chào ${currentUser.name}! 👋</div>
      <div class="text-sm text-slate-600 mt-1">Hôm nay bạn có ${checklist.length} mục checklist và ${tasks.length} công việc cần xử lý.</div>
    </div>

    <div class="grid grid-cols-3 gap-4 mb-4">
      <div class="kpi-card border-l-4 border-blue-700">
        <div class="kpi-label">Lương dự kiến tháng này</div>
        <div class="kpi-value">9,8 <span class="text-lg">Tr</span></div>
        <div class="kpi-sub">P1 + P2 + P3 (95% KPI)</div>
      </div>
      <div class="kpi-card border-l-4 border-emerald-700">
        <div class="kpi-label">Checklist hôm nay</div>
        <div class="kpi-value">0<span class="text-lg">/${checklist.length}</span></div>
        <div class="kpi-sub">Chưa bắt đầu</div>
      </div>
      <div class="kpi-card border-l-4 border-amber-600">
        <div class="kpi-label">Việc được giao</div>
        <div class="kpi-value">${tasks.length}</div>
        <div class="kpi-sub">Cần xử lý</div>
      </div>
    </div>

    <div class="card mb-4">
      <div class="card-title">Checklist hôm nay</div>
      ${checklist.map((c, i) => `
        <label class="flex items-center gap-3 py-2 hover:bg-slate-50 px-2 rounded cursor-pointer">
          <input type="checkbox" class="w-4 h-4 text-blue-600 rounded">
          <span class="text-sm text-slate-700">${i+1}. ${c}</span>
        </label>
      `).join('')}
    </div>

    <div class="card">
      <div class="card-title">Việc được giao</div>
      ${renderTaskList(tasks)}
    </div>
  `;
}

// Widget: tổng quan task theo cơ sở (cho CEO/GĐ dashboard)
function renderTaskBreakdownByFacility() {
  const tasks = GP_DATA.tasks.filter(t => t.status !== 'completed');
  const proposals = GP_DATA.proposals.filter(p => p.status !== 'approved' && p.status !== 'in_execution');
  const FACS = ['HM','TK','CTT','24','TT'];
  const facNames = { HM:'Hoàng Mai', TK:'Thuỵ Khuê', CTT:'CTT', '24':'24 NCT', TT:'Thanh Trì' };
  const facColors = { HM:'#1F3A5F', TK:'#C9A227', CTT:'#2E8B8B', '24':'#5B9BD5', TT:'#E07A5F' };

  const byFac = FACS.map(f => {
    const facTasks = tasks.filter(t => t.facility === f);
    const facProps = proposals.filter(p => p.facility === f);
    return {
      id: f,
      name: facNames[f],
      color: facColors[f],
      tasks: facTasks.length,
      proposals: facProps.length,
      highPriority: facTasks.filter(t => t.priority === 'high').length,
    };
  });

  return `<div class="card mb-4">
    <div class="card-title">Việc & Đề xuất theo cơ sở</div>
    <div class="grid grid-cols-5 gap-3">
      ${byFac.map(f => `
        <div class="border-2 rounded-lg p-3" style="border-color:${f.color}30">
          <div class="flex items-center gap-2 mb-2">
            <div class="w-3 h-3 rounded-full" style="background:${f.color}"></div>
            <div class="font-semibold text-sm text-slate-700 truncate">${f.name}</div>
          </div>
          <div class="space-y-1.5">
            <div class="flex justify-between items-baseline">
              <span class="text-xs text-slate-500">Việc đang xử lý</span>
              <span class="font-bold" style="color:${f.color}">${f.tasks}</span>
            </div>
            <div class="flex justify-between items-baseline">
              <span class="text-xs text-slate-500">Đề xuất chờ</span>
              <span class="font-bold text-amber-700">${f.proposals}</span>
            </div>
            ${f.highPriority > 0 ? `<div class="text-xs text-rose-700 font-semibold">🔴 ${f.highPriority} việc khẩn</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

// Widget: tổng quan đề xuất theo phòng (cho CEO/GĐ dashboard)
function renderProposalBreakdownByDept() {
  const proposals = GP_DATA.proposals;
  const depts = [
    { id: 'KT', name: 'Kỹ thuật', color: '#5B9BD5' },
    { id: 'DT', name: 'Đào tạo', color: '#7B6CDB' },
    { id: 'MKT', name: 'Marketing', color: '#E07A5F' },
    { id: 'NS', name: 'Nhân sự', color: '#2E8B8B' },
    { id: 'KE', name: 'Kế toán', color: '#C9A227' },
    { id: 'GS', name: 'Giám sát', color: '#B23A48' },
  ];
  const byDept = depts.map(d => {
    const items = proposals.filter(p => p.dept === d.id);
    return {
      ...d,
      total: items.length,
      pending: items.filter(p => p.status === 'pending' || p.status === 'in_approval').length,
      approved: items.filter(p => p.status === 'approved' || p.status === 'in_execution').length,
    };
  }).filter(d => d.total > 0);

  if (byDept.length === 0) return '';

  return `<div class="card">
    <div class="card-title">Đề xuất theo phòng chuyên môn</div>
    <div class="grid grid-cols-${Math.min(byDept.length, 4)} gap-3">
      ${byDept.map(d => `
        <div class="border-l-4 rounded-lg p-3 bg-slate-50" style="border-color:${d.color}">
          <div class="font-semibold text-sm" style="color:${d.color}">Phòng ${d.name}</div>
          <div class="mt-2 grid grid-cols-3 gap-1 text-xs">
            <div>
              <div class="text-slate-500">Tổng</div>
              <div class="font-bold text-slate-800 text-base">${d.total}</div>
            </div>
            <div>
              <div class="text-slate-500">Đang xử lý</div>
              <div class="font-bold text-amber-700 text-base">${d.pending}</div>
            </div>
            <div>
              <div class="text-slate-500">Đã duyệt</div>
              <div class="font-bold text-emerald-700 text-base">${d.approved}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

function renderTaskList(tasks) {
  if (!tasks.length) return '<div class="text-sm text-slate-500 italic py-4 text-center">Không có việc</div>';
  return `<div class="space-y-2">${tasks.map(t => `
    <div class="flex items-center gap-3 p-2 hover:bg-slate-50 rounded">
      <div class="flex-1">
        <div class="text-sm font-medium text-slate-800">${t.title}</div>
        <div class="text-xs text-slate-500 mt-0.5">
          Từ: ${GP_DATA.roles[t.from]?.name || t.from} → Đến: ${GP_DATA.roles[t.assignee]?.name || t.assignee} · Deadline ${t.deadline}
        </div>
      </div>
      <span class="status-pill priority-${t.priority}">${t.priority === 'high' ? 'Khẩn' : t.priority === 'medium' ? 'TB' : 'Thấp'}</span>
      <span class="status-pill status-${t.status}">
        ${t.status === 'pending' ? 'Chờ' : t.status === 'in_progress' ? 'Đang xử lý' : 'Xong'}
      </span>
    </div>
  `).join('')}</div>`;
}

// ====================== DOANH SỐ ======================
function renderDoanhSo(el) {
  const groups = getActivePackages();
  const isCustomized = !!loadPackagesFromStorage();
  // PERMISSION: chỉ hiện các cơ sở user có quyền xem
  const FACS = getVisibleFacilities();
  const facNames = { HM:'Hoàng Mai', TK:'Thuỵ Khuê', CTT:'CTT Dưới Nước', '24':'24 NCT', TT:'Thanh Trì' };
  const scopeLabel = canSeeAllFacilities() ? 'Toàn cụm 5 cơ sở' : (isQLCS() ? `Cơ sở ${facNames[FACS[0]]}` : `Phạm vi: ${FACS.map(f => facNames[f]).join(', ')}`);

  // Compute totals per group per facility
  const groupTotals = groups.map(g => {
    const totals = { HM:0, TK:0, CTT:0, '24':0, TT:0 };
    g.packages.forEach(p => FACS.forEach(f => totals[f] += p[f]));
    const sum = FACS.reduce((a,f) => a + totals[f], 0);
    return { ...g, totals, sum };
  });

  // Grand total per facility
  const facilityTotals = { HM:0, TK:0, CTT:0, '24':0, TT:0 };
  groupTotals.forEach(g => FACS.forEach(f => facilityTotals[f] += g.totals[f]));
  const grandTotal = FACS.reduce((a,f) => a + facilityTotals[f], 0);

  // Top 10 packages
  const allPackages = [];
  groups.forEach(g => g.packages.forEach(p => {
    const sum = FACS.reduce((a,f) => a + p[f], 0);
    allPackages.push({ name: p.name, group: g.name, groupColor: g.color, sum, ...p });
  }));
  const top10 = [...allPackages].sort((a,b) => b.sum - a.sum).slice(0, 10);

  el.innerHTML = `
    <div class="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
      <div>
        <div class="font-semibold text-slate-800">Module 2 — Doanh số theo gói dịch vụ</div>
        <div class="text-sm text-slate-600 mt-1">📍 Phạm vi: <strong>${scopeLabel}</strong> · Dữ liệu real-time từ CRM</div>
      </div>
      <div class="flex items-center gap-2">
        <div class="inline-flex items-center gap-2 text-xs bg-white border border-blue-200 px-2 py-1 rounded">
          <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span class="text-slate-600">Sync CRM: 3 phút trước</span>
        </div>
        <button onclick="navigate('settings-packages')" class="px-3 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800">⚙️ Quản lý gói</button>
        <button class="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium">📊 Xuất Excel</button>
      </div>
    </div>
    ${isCustomized ? `<div class="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
      ✓ Đang hiển thị dữ liệu gói tùy chỉnh (đã lưu trong trình duyệt). <button onclick="if(confirm('Khôi phục về dữ liệu mặc định?')) { resetPackagesToDefault(); navigate(\\'doanh-so\\'); }" class="underline ml-2">Khôi phục mặc định</button>
    </div>` : ''}

    <!-- KPI cards (thích nghi theo phạm vi user) -->
    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="kpi-card border-l-4 border-blue-700">
        <div class="kpi-label">${canSeeAllFacilities() ? 'Tổng doanh thu cụm' : 'Doanh thu cơ sở'}</div>
        <div class="kpi-value">${(grandTotal/1000).toFixed(2)} <span class="text-lg">Tỷ</span></div>
        <div class="kpi-sub">${canSeeAllFacilities() ? 'vs target 27,2 Tỷ' : '1.1 - 15.5/2026'}</div>
        ${canSeeAllFacilities() ? `<span class="kpi-trend up">+${((grandTotal - 27200) / 27200 * 100).toFixed(1)}% vs target</span>` : ''}
      </div>
      <div class="kpi-card border-l-4 border-emerald-700">
        <div class="kpi-label">Số gói đang bán</div>
        <div class="kpi-value">${groups.reduce((a, g) => a + g.packages.filter(p => FACS.some(f => p[f] > 0)).length, 0)}</div>
        <div class="kpi-sub">${groups.filter(g => g.packages.some(p => FACS.some(f => p[f] > 0))).length} nhóm dịch vụ</div>
      </div>
      <div class="kpi-card border-l-4 border-amber-600">
        <div class="kpi-label">Top gói${isQLCS() ? ' tại CS' : ''}</div>
        <div class="kpi-value text-lg">${top10[0].name.length > 18 ? top10[0].name.substring(0, 16) + '...' : top10[0].name}</div>
        <div class="kpi-sub">${(top10[0].sum/1000).toFixed(2)} Tỷ — ${(top10[0].sum/grandTotal*100).toFixed(1)}%</div>
      </div>
      ${canSeeAllFacilities() ? `<div class="kpi-card border-l-4 border-rose-700">
        <div class="kpi-label">Cơ sở dẫn đầu</div>
        <div class="kpi-value text-lg">Hoàng Mai</div>
        <div class="kpi-sub">${(facilityTotals.HM/1000).toFixed(2)} Tỷ — ${(facilityTotals.HM/grandTotal*100).toFixed(1)}%</div>
      </div>` : `<div class="kpi-card border-l-4 border-rose-700">
        <div class="kpi-label">% Target</div>
        <div class="kpi-value">${(() => {
          const myFac = FACS[0];
          const t = GP_DATA.revenue.facilities.find(f => f.id === myFac);
          return t ? ((grandTotal / t.target) * 100).toFixed(0) + '%' : '—';
        })()}</div>
        <div class="kpi-sub">Mục tiêu cơ sở</div>
      </div>`}
    </div>

    <!-- Group summary cards — ẩn nhóm độc quyền không thuộc phạm vi -->
    <div class="card mb-4">
      <div class="card-title">Tổng quan các nhóm dịch vụ ${isQLCS() ? `tại ${facNames[FACS[0]]}` : ''}</div>
      <div class="grid grid-cols-4 gap-3">
        ${groupTotals.filter(g => g.sum > 0 || canSeeAllFacilities()).map(g => `
          <div class="border-2 rounded-lg p-3 hover:shadow-md transition cursor-pointer" style="border-color:${g.color}30">
            <div class="flex items-center gap-2 mb-2">
              <div class="text-2xl">${g.icon}</div>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-xs text-slate-700 truncate">${g.name.replace('Nhóm ','').replace(' (chỉ tại 24 NCT)','')}</div>
                ${g.exclusive ? '<div class="text-[10px] text-rose-600 font-bold">⚠️ CHỈ TẠI 24 NCT</div>' : `<div class="text-[10px] text-slate-500">${g.packages.length} gói</div>`}
              </div>
            </div>
            <div class="text-xl font-bold" style="color:${g.color}">${(g.sum/1000).toFixed(2)} Tỷ</div>
            <div class="text-xs text-slate-500 mt-1">${(g.sum/grandTotal*100).toFixed(1)}% tổng cụm</div>
            <div class="mt-2 bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div style="width:${g.sum/grandTotal*100}%; background:${g.color}" class="h-full"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- ⭐ Annual target vs achievement (horizontal bar) -->
    <div class="card mb-4">
      <div class="card-title">Doanh số mục tiêu năm 2026 vs Thực đạt YTD (1.1 - 15.5)</div>
      <div style="height: ${Math.max(280, FACS.length * 70 + 80)}px"><canvas id="chartAnnualTarget"></canvas></div>
      <div class="mt-3 text-xs text-slate-500">📊 Đơn vị: Triệu VND · Số % hiển thị ở cuối mỗi cặp bar = % hoàn thành mục tiêu năm.</div>
    </div>

    <!-- ⭐ Tiến độ doanh số từng tháng (editable) -->
    ${renderMonthlyProgress(FACS, facNames)}

    <!-- ⭐ Hiệu suất nhân sự kinh doanh -->
    ${renderSalesPerformance(FACS, facNames)}

    <!-- Top 10 chart -->
    <div class="card mb-4">
      <div class="card-title">Top 10 gói doanh thu cao nhất ${isQLCS() ? `tại ${facNames[FACS[0]]}` : '— Toàn cụm'}</div>
      <div style="height: 360px"><canvas id="chartTop10"></canvas></div>
    </div>

    <!-- Detailed table by group -->
    <div class="card mb-4">
      <div class="card-title flex items-center justify-between">
        <span>Chi tiết doanh thu theo gói × cơ sở</span>
        <div class="text-xs font-normal text-slate-500">Đơn vị: Triệu VND</div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-100 sticky top-0">
            <tr>
              <th class="text-left p-2 min-w-[280px]">Gói dịch vụ</th>
              ${FACS.map(f => `<th class="text-right p-2 min-w-[80px]">${facNames[f]}</th>`).join('')}
              <th class="text-right p-2 min-w-[90px] bg-amber-100">Tổng</th>
              <th class="text-right p-2 min-w-[60px]">% cụm</th>
            </tr>
          </thead>
          <tbody>
            ${groupTotals.map(g => `
              <!-- Group header row -->
              <tr style="background:${g.color}15">
                <td class="p-2 font-bold" style="color:${g.color}">
                  <span class="text-lg">${g.icon}</span> ${g.name}
                  ${g.exclusive ? '<span class="ml-2 text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">CHỈ 24 NCT</span>' : ''}
                </td>
                ${FACS.map(f => `<td class="p-2 text-right font-bold" style="color:${g.color}">${g.totals[f] > 0 ? g.totals[f].toLocaleString() : '—'}</td>`).join('')}
                <td class="p-2 text-right font-bold bg-amber-50" style="color:${g.color}">${g.sum.toLocaleString()}</td>
                <td class="p-2 text-right font-bold" style="color:${g.color}">${(g.sum/grandTotal*100).toFixed(1)}%</td>
              </tr>
              <!-- Package rows -->
              ${g.packages.map(p => {
                const sum = FACS.reduce((a,f) => a + p[f], 0);
                return `<tr class="border-b border-slate-100 hover:bg-slate-50">
                  <td class="p-2 pl-10 text-slate-700">${p.name}</td>
                  ${FACS.map(f => {
                    const v = p[f];
                    if (v === 0) return '<td class="p-2 text-right text-slate-300">—</td>';
                    return `<td class="p-2 text-right text-slate-700">${v.toLocaleString()}</td>`;
                  }).join('')}
                  <td class="p-2 text-right font-semibold bg-amber-50/50">${sum.toLocaleString()}</td>
                  <td class="p-2 text-right text-slate-500">${(sum/grandTotal*100).toFixed(2)}%</td>
                </tr>`;
              }).join('')}
            `).join('')}
            <!-- Grand total -->
            <tr class="bg-amber-100 font-bold border-t-2 border-amber-400">
              <td class="p-3 text-slate-900">TỔNG CỘNG</td>
              ${FACS.map(f => `<td class="p-3 text-right text-slate-900">${facilityTotals[f].toLocaleString()}</td>`).join('')}
              <td class="p-3 text-right text-slate-900 bg-amber-200">${grandTotal.toLocaleString()}</td>
              <td class="p-3 text-right text-slate-900">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Notes -->
    <div class="p-4 bg-rose-50 border border-rose-200 rounded-xl">
      <div class="font-semibold text-slate-800 text-sm mb-2">⚠️ Lưu ý quan trọng về cấu trúc dịch vụ:</div>
      <ul class="text-sm text-slate-700 space-y-1 list-disc list-inside">
        <li><strong>Nhóm Học PT</strong> (8 gói) và <strong>Nhóm Member Fitness</strong> (6 gói) chỉ vận hành tại cơ sở <strong>24 Nguyễn Cơ Thạch</strong> — các cơ sở khác hiển thị "—".</li>
        <li><strong>Nhóm Học bơi chất lượng cao</strong> hiện chỉ có tại <strong>CTT Dưới Nước</strong> và <strong>Thanh Trì</strong>.</li>
        <li><strong>Học lặn</strong> chủ yếu tại <strong>CTT Dưới Nước</strong> (chiếm 96% doanh thu Lặn toàn cụm).</li>
        <li>Doanh thu <strong>Vé lẻ</strong> tại 24 NCT rất thấp (7 Tr) do mô hình vận hành tập trung gói dài hạn.</li>
      </ul>
    </div>
  `;

  // Annual target chart — Horizontal bar với số liệu hiển thị
  const annualLabels = FACS.map(f => facNames[f]);
  const annualTargetData = FACS.map(f => GP_DATA.annualTargets[f]);
  const annualActualData = FACS.map(f => facilityTotals[f]);
  const maxValue = Math.max(...annualTargetData, ...annualActualData);
  chartInstances.annualTarget = new Chart(document.getElementById('chartAnnualTarget'), {
    type: 'bar',
    data: {
      labels: annualLabels,
      datasets: [
        { label: 'Mục tiêu năm', data: annualTargetData, backgroundColor: '#1F3A5F', borderRadius: 6, barPercentage: 0.85, categoryPercentage: 0.7 },
        { label: 'Thực đạt YTD', data: annualActualData, backgroundColor: '#C9A227', borderRadius: 6, barPercentage: 0.85, categoryPercentage: 0.7 }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 110 } }, // chừa chỗ cho label số ở cuối bar
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 14, padding: 12 } },
        tooltip: { backgroundColor: '#1F3A5F', padding: 10, callbacks: { label: c => c.dataset.label + ': ' + c.parsed.x.toLocaleString() + ' Triệu VND' } },
      },
      scales: {
        x: { beginAtZero: true, max: maxValue * 1.15, grid: { color: '#f0f2f5' }, ticks: { callback: v => (v/1000).toFixed(0) + ' Tỷ' } },
        y: { grid: { display: false }, ticks: { font: { weight: 'bold', size: 12 } } }
      },
      animation: { duration: 600 }
    },
    plugins: [{
      id: 'numericLabels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const targetMeta = chart.getDatasetMeta(0);
        const actualMeta = chart.getDatasetMeta(1);

        targetMeta.data.forEach((bar, i) => {
          const target = annualTargetData[i];
          const actual = annualActualData[i];
          const actualBar = actualMeta.data[i];
          const pct = target > 0 ? (actual / target * 100) : 0;

          // 1) Số ở CUỐI bar "Mục tiêu năm" (xanh đậm)
          ctx.save();
          ctx.fillStyle = '#1F3A5F';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(target.toLocaleString() + ' Tr', bar.x + 5, bar.y);
          ctx.restore();

          // 2) Số ở CUỐI bar "Thực đạt" (vàng)
          ctx.save();
          ctx.fillStyle = '#8B6E14';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(actual.toLocaleString() + ' Tr', actualBar.x + 5, actualBar.y);
          ctx.restore();

          // 3) % ở cuối, sau cả 2 bar (badge màu theo % đạt)
          const pctColor = pct >= 100 ? '#2D6A4F' : pct >= 60 ? '#C9A227' : '#B23A48';
          const maxX = Math.max(bar.x, actualBar.x) + 70;
          const yCenter = (bar.y + actualBar.y) / 2;
          ctx.save();
          // Badge background
          const text = pct.toFixed(1) + '%';
          ctx.font = 'bold 13px sans-serif';
          const tw = ctx.measureText(text).width;
          ctx.fillStyle = pctColor;
          ctx.beginPath();
          ctx.roundRect(maxX, yCenter - 12, tw + 16, 24, 12);
          ctx.fill();
          // Badge text
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, maxX + (tw + 16)/2, yCenter);
          ctx.restore();
        });
      }
    }]
  });

  // Monthly progress chart
  const mpData = getActiveMonthlyProgress();
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const monthlyTargets = months.map(m => FACS.reduce((a,f) => a + (mpData[f]?.find(r => r.month===m)?.target||0), 0));
  const monthlyActuals = months.map(m => FACS.reduce((a,f) => a + (mpData[f]?.find(r => r.month===m)?.actual||0), 0));
  const mpEl = document.getElementById('chartMonthlyProgress');
  if (mpEl) {
    chartInstances.monthly = new Chart(mpEl, {
      type: 'bar',
      data: {
        labels: months.map(m => 'T' + m),
        datasets: [
          { label: 'Mục tiêu', data: monthlyTargets, backgroundColor: '#1F3A5F', borderRadius: 4, barPercentage: 0.7 },
          { label: 'Thực đạt', data: monthlyActuals, backgroundColor: '#C9A227', borderRadius: 4, barPercentage: 0.7 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 14, padding: 12 } } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: '#f0f2f5' }, ticks: { callback: v => v.toLocaleString() + ' Tr' } }
        }
      }
    });
  }

  // Top 10 chart
  chartInstances.top10 = new Chart(document.getElementById('chartTop10'), {
    type: 'bar',
    data: {
      labels: top10.map(p => p.name.length > 30 ? p.name.substring(0,28) + '…' : p.name),
      datasets: [{
        label: 'Doanh thu (Triệu VND)',
        data: top10.map(p => p.sum),
        backgroundColor: top10.map(p => p.groupColor),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.parsed.x.toLocaleString() + ' Tr (' + (c.parsed.x/grandTotal*100).toFixed(1) + '% cụm)' } } },
      scales: { x: { ticks: { callback: v => v.toLocaleString() + ' Tr' } } }
    }
  });
}

// ====================== MONTHLY PROGRESS (editable) ======================
const MONTHLY_PROGRESS_STORAGE_KEY = 'greenpool_monthly_progress_v1';

function getActiveMonthlyProgress() {
  try {
    const stored = localStorage.getItem(MONTHLY_PROGRESS_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return JSON.parse(JSON.stringify(GP_DATA.monthlyProgress));
}

function saveMonthlyProgress(data) {
  try {
    localStorage.setItem(MONTHLY_PROGRESS_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

function resetMonthlyProgress() {
  localStorage.removeItem(MONTHLY_PROGRESS_STORAGE_KEY);
}

function renderMonthlyProgress(FACS, facNames) {
  const data = getActiveMonthlyProgress();
  // Quyền sửa: QLCS sửa cơ sở mình, GĐ KD sửa tất cả
  const canEditAll = currentUser.roleCode === 'GD_KD' || currentUser.roleCode === 'CEO';
  const editableFac = canEditAll ? FACS : (isQLCS() ? [currentUser.roleData.scope] : []);
  const canEdit = editableFac.length > 0;

  // Compute monthly cluster totals (for chart)
  const months = [1,2,3,4,5,6,7,8,9,10,11,12];
  const monthlyTotals = months.map(m => {
    let target = 0, actual = 0;
    FACS.forEach(f => {
      const row = data[f]?.find(r => r.month === m);
      if (row) { target += row.target; actual += row.actual; }
    });
    return { month: m, target, actual };
  });

  return `<div class="card mb-4">
    <div class="card-title flex items-center justify-between">
      <span>Tiến độ doanh số từng tháng — ${isQLCS() ? facNames[FACS[0]] : 'Toàn cụm'}</span>
      <div class="flex items-center gap-2">
        ${canEdit ? '<span class="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full">⚙️ Bạn có quyền nhập số liệu</span>' : '<span class="text-xs text-slate-500">Chế độ xem</span>'}
      </div>
    </div>

    <!-- Chart -->
    <div style="height: 280px"><canvas id="chartMonthlyProgress"></canvas></div>

    <!-- Editable table -->
    <div class="mt-4 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-100">
          <tr>
            <th class="text-left p-2">Cơ sở</th>
            <th class="text-center p-2">Loại</th>
            ${months.map(m => `<th class="text-right p-2 w-16">T${m}</th>`).join('')}
            <th class="text-right p-2 bg-amber-100">Tổng năm</th>
          </tr>
        </thead>
        <tbody>
          ${FACS.map(f => {
            const fdata = data[f] || [];
            const totalTarget = fdata.reduce((a,r) => a+r.target, 0);
            const totalActual = fdata.reduce((a,r) => a+r.actual, 0);
            const isEditable = editableFac.includes(f);
            return `
              <tr class="border-t bg-blue-50/40">
                <td rowspan="2" class="p-2 font-semibold text-slate-800">${facNames[f]}</td>
                <td class="p-2 text-center text-xs font-bold text-blue-900">Mục tiêu</td>
                ${months.map((m, i) => `<td class="p-1 text-right">
                  ${isEditable ? `<input type="number" min="0" value="${fdata[i]?.target||0}" onblur="updateMonthlyProgress('${f}', ${i}, 'target', this.value)"
                       class="w-full px-1 py-0.5 text-right text-xs border border-transparent rounded hover:border-slate-200 focus:border-blue-400 focus:outline-none">`
                   : `<span class="text-xs">${(fdata[i]?.target||0).toLocaleString()}</span>`}
                </td>`).join('')}
                <td class="p-2 text-right font-bold text-blue-900 bg-amber-50">${totalTarget.toLocaleString()}</td>
              </tr>
              <tr class="border-b">
                <td class="p-2 text-center text-xs font-bold text-emerald-700">Thực đạt</td>
                ${months.map((m, i) => {
                  const t = fdata[i]?.target||0;
                  const a = fdata[i]?.actual||0;
                  const pct = t > 0 ? (a/t*100) : 0;
                  const color = a === 0 ? '' : (pct >= 100 ? 'text-emerald-700 font-bold' : pct >= 80 ? 'text-amber-700' : 'text-rose-700');
                  return `<td class="p-1 text-right">
                    ${isEditable ? `<input type="number" min="0" value="${a}" onblur="updateMonthlyProgress('${f}', ${i}, 'actual', this.value)"
                         class="w-full px-1 py-0.5 text-right text-xs ${color} border border-transparent rounded hover:border-slate-200 focus:border-blue-400 focus:outline-none">`
                     : `<span class="text-xs ${color}">${a > 0 ? a.toLocaleString() : '—'}</span>`}
                  </td>`;
                }).join('')}
                <td class="p-2 text-right font-bold text-emerald-700 bg-amber-50">${totalActual.toLocaleString()}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    ${canEdit ? `<div class="mt-3 flex items-center justify-between text-xs">
      <span class="text-slate-500">💾 Thay đổi tự lưu trong trình duyệt</span>
      <button onclick="if(confirm('Khôi phục về số liệu mặc định?')) { resetMonthlyProgress(); navigate('doanh-so'); }" class="text-rose-700 hover:underline">↻ Khôi phục mặc định</button>
    </div>` : ''}
  </div>`;
}

function updateMonthlyProgress(facId, idx, field, value) {
  const data = getActiveMonthlyProgress();
  if (!data[facId] || !data[facId][idx]) return;
  data[facId][idx][field] = parseInt(value) || 0;
  saveMonthlyProgress(data);
}

// ====================== SALES PERFORMANCE ======================
function renderSalesPerformance(FACS, facNames) {
  const allSales = GP_DATA.employees.filter(e => e.role === 'NV_SALE' && FACS.includes(e.facility));
  if (allSales.length === 0) return '';

  // Group by facility
  const grouped = {};
  FACS.forEach(f => {
    grouped[f] = allSales.filter(s => s.facility === f);
  });

  return `<div class="card mb-4">
    <div class="card-title">Hiệu suất nhân sự kinh doanh ${isQLCS() ? `tại ${facNames[FACS[0]]}` : '— ' + allSales.length + ' Sale × ' + FACS.length + ' cơ sở'}</div>

    <div class="space-y-4">
      ${FACS.filter(f => grouped[f].length > 0).map(f => {
        const sales = grouped[f].sort((a,b) => b.revenue - a.revenue);
        const totalRev = sales.reduce((a,s) => a+s.revenue, 0);
        const totalTarget = sales.reduce((a,s) => a+s.target, 0);
        const totalLeads = sales.reduce((a,s) => a+s.leadsContacted, 0);
        const totalDeals = sales.reduce((a,s) => a+s.dealsClosed, 0);
        const avgConv = totalLeads > 0 ? (totalDeals/totalLeads*100).toFixed(1) : 0;
        return `<div class="border border-slate-200 rounded-lg overflow-hidden">
          <div class="p-3 bg-slate-50 border-b flex items-center justify-between">
            <div class="font-semibold text-slate-800">${facNames[f]} <span class="text-xs text-slate-500 font-normal">(${sales.length} sale)</span></div>
            <div class="flex items-center gap-4 text-xs">
              <span>DT: <strong class="text-slate-900">${totalRev.toLocaleString()} Tr</strong></span>
              <span>Target: <strong class="text-slate-900">${totalTarget.toLocaleString()} Tr</strong></span>
              <span>% đạt: <strong class="${totalRev >= totalTarget ? 'text-emerald-700' : 'text-rose-700'}">${(totalRev/totalTarget*100).toFixed(1)}%</strong></span>
              <span>Tỷ lệ chốt TB: <strong class="text-amber-700">${avgConv}%</strong></span>
            </div>
          </div>
          <table class="w-full text-sm">
            <thead class="bg-white">
              <tr class="text-xs text-slate-500 border-b">
                <th class="text-left p-2 w-10">#</th>
                <th class="text-left p-2">Sale</th>
                <th class="text-right p-2">Doanh số (Tr)</th>
                <th class="text-right p-2">Target (Tr)</th>
                <th class="text-right p-2">% Target</th>
                <th class="text-right p-2">Leads</th>
                <th class="text-right p-2">Chốt</th>
                <th class="text-right p-2">Tỷ lệ chốt</th>
                <th class="text-left p-2 w-32">Đánh giá</th>
              </tr>
            </thead>
            <tbody>
              ${sales.map((s, i) => {
                const pctTarget = (s.revenue / s.target * 100);
                const convRate = s.leadsContacted > 0 ? (s.dealsClosed / s.leadsContacted * 100) : 0;
                const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1);
                const evalLabel = pctTarget >= 130 ? ['Xuất sắc','text-emerald-700 bg-emerald-50'] :
                                  pctTarget >= 100 ? ['Đạt','text-blue-700 bg-blue-50'] :
                                  pctTarget >= 80 ?  ['Cần cố gắng','text-amber-700 bg-amber-50'] :
                                  ['Yếu','text-rose-700 bg-rose-50'];
                return `<tr class="border-b border-slate-100 hover:bg-slate-50">
                  <td class="p-2 text-center">${rank}</td>
                  <td class="p-2 font-medium">${s.name}</td>
                  <td class="p-2 text-right font-semibold text-slate-900">${s.revenue.toLocaleString()}</td>
                  <td class="p-2 text-right text-slate-600">${s.target.toLocaleString()}</td>
                  <td class="p-2 text-right">
                    <span class="${pctTarget >= 100 ? 'text-emerald-700 font-bold' : pctTarget >= 80 ? 'text-amber-700 font-bold' : 'text-rose-700 font-bold'}">${pctTarget.toFixed(1)}%</span>
                  </td>
                  <td class="p-2 text-right text-slate-600">${s.leadsContacted.toLocaleString()}</td>
                  <td class="p-2 text-right text-slate-600">${s.dealsClosed.toLocaleString()}</td>
                  <td class="p-2 text-right">
                    <span class="${convRate >= 70 ? 'text-emerald-700 font-bold' : convRate >= 50 ? 'text-amber-700 font-bold' : 'text-rose-700 font-bold'}">${convRate.toFixed(1)}%</span>
                  </td>
                  <td class="p-2"><span class="px-2 py-0.5 rounded text-xs font-semibold ${evalLabel[1]}">${evalLabel[0]}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ====================== CHECKLIST ======================
const CHECKLIST_STORAGE_KEY = 'greenpool_checklist_templates_v1';

function getActiveChecklistTemplates() {
  try {
    const stored = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return JSON.parse(JSON.stringify(GP_DATA.checklistTemplates));
}

function saveChecklistTemplates(templates) {
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch (e) { return false; }
}

function resetChecklistTemplates() {
  localStorage.removeItem(CHECKLIST_STORAGE_KEY);
}

function renderChecklist(el) {
  const templates = getActiveChecklistTemplates();
  const code = currentUser.roleCode;
  const visibleFacilities = getVisibleFacilities();
  const facNames = { HM:'Hoàng Mai', TK:'Thuỵ Khuê', CTT:'CTT', '24':'24 NCT', TT:'Thanh Trì' };

  // GĐ Khối có quyền tùy chỉnh checklist của khối mình
  const isGDKD = code === 'GD_KD';
  const isGDVP = code === 'GD_VP';
  const canEditChecklists = isGDKD || isGDVP;
  const editableBlock = isGDKD ? 'KD' : isGDVP ? 'VP' : null;

  // Phòng/vai trò nào sẽ hiển thị checklist tương ứng:
  // QUY TẮC: mỗi phòng chỉ thấy checklist phòng mình. CEO/TP GS thấy tất cả (audit).
  let visibleTemplates;
  if (code === 'CEO' || code === 'TP_GS') {
    visibleTemplates = templates;
  } else if (isGDKD) {
    visibleTemplates = Object.fromEntries(Object.entries(templates).filter(([k,v]) => v.block === 'KD'));
  } else if (isGDVP) {
    visibleTemplates = Object.fromEntries(Object.entries(templates).filter(([k,v]) => v.block === 'VP'));
  } else if (isQLCS()) {
    // QLCS thấy tất cả checklist khối KD vận hành tại cơ sở mình
    visibleTemplates = Object.fromEntries(Object.entries(templates).filter(([k,v]) => v.block === 'KD'));
  } else if (code === 'TP_DT' || code === 'TT_DT' || code === 'GV_CB') {
    visibleTemplates = { 'Giáo viên': templates['Giáo viên'] };
  } else if (code === 'TP_KT') {
    visibleTemplates = { 'NV Kỹ thuật': templates['NV Kỹ thuật'] };
  } else if (code === 'TP_MKT') {
    // ⭐ TP MKT chỉ thấy checklist Marketing — không thấy phòng khác
    visibleTemplates = { 'NV Marketing': templates['NV Marketing'] };
  } else if (code === 'TIBAN_TT') {
    visibleTemplates = { 'NV Truyền thông Nội bộ': templates['NV Truyền thông Nội bộ'] };
  } else if (code === 'NV_CH') {
    visibleTemplates = { 'NV Cứu hộ': templates['NV Cứu hộ'] };
  } else if (code === 'TP_KE') {
    visibleTemplates = { 'NV Kế toán': templates['NV Kế toán'] };
  } else if (code === 'TP_NS') {
    visibleTemplates = { 'NV Nhân sự': templates['NV Nhân sự'] };
  } else {
    visibleTemplates = templates;
  }
  // Bỏ template undefined nếu có
  visibleTemplates = Object.fromEntries(Object.entries(visibleTemplates).filter(([k,v]) => !!v));

  const scopeLabel = canSeeAllFacilities() ? `Toàn cụm 5 cơ sở${canEditChecklists ? ` — Khối ${editableBlock}` : ''}` : (isQLCS() ? `Cơ sở ${facNames[visibleFacilities[0]]}` : `Phòng ${currentUser.roleData.name}`);

  el.innerHTML = `
    <div class="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
      <div>
        <div class="font-semibold text-slate-800">Module 3 — Checklist vận hành${canEditChecklists ? ' <span class="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">⚙️ Chế độ chỉnh sửa</span>' : ''}</div>
        <div class="text-sm text-slate-600 mt-1">📍 Phạm vi: <strong>${scopeLabel}</strong> · ${Object.keys(visibleTemplates).length} mẫu checklist${canEditChecklists ? ' · Bạn có thể tùy chỉnh checklist khối mình' : ''}</div>
      </div>
      ${canEditChecklists ? `<button onclick="checklistAddTemplate()" class="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800">+ Tạo checklist mới</button>` : ''}
    </div>

    <div class="grid grid-cols-2 gap-4">
      ${Object.entries(visibleTemplates).map(([role, t]) => {
        const items = t.items;
        const block = t.block;
        const canEditThis = canEditChecklists && block === editableBlock;
        return `<div class="card">
          <div class="card-title flex items-center justify-between">
            <span>${role} — Hôm nay (${new Date().toLocaleDateString('vi-VN')})</span>
            ${canEditThis ? `<button onclick="checklistDeleteTemplate('${role.replace(/'/g, '\\\\\\\'')}')" class="text-rose-600 hover:bg-rose-50 p-1 rounded text-xs" title="Xóa cả mẫu checklist này">🗑️</button>` : ''}
          </div>
          <div class="space-y-1">
            ${items.map((item, i) => {
              const done = Math.random() > 0.4;
              return `<div class="flex items-center gap-2 p-2 hover:bg-slate-50 rounded group">
                <input type="checkbox" ${done ? 'checked' : ''} class="w-4 h-4 text-blue-600 rounded flex-shrink-0" ${canEditThis ? 'disabled' : ''}>
                ${canEditThis ? `<input type="text" value="${item.replace(/"/g, '&quot;')}" onblur="checklistUpdateItem('${role.replace(/'/g, '\\\\\\\'')}', ${i}, this.value)"
                       class="flex-1 px-2 py-1 text-sm border border-transparent rounded hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent">
                <button onclick="checklistDeleteItem('${role.replace(/'/g, '\\\\\\\'')}', ${i})" class="opacity-0 group-hover:opacity-100 text-rose-500 hover:bg-rose-50 px-1.5 rounded text-xs" title="Xóa">✕</button>`
                : `<span class="flex-1 text-sm ${done ? 'text-slate-500 line-through' : 'text-slate-700'}">${item}</span>`}
              </div>`;
            }).join('')}
            ${canEditThis ? `<button onclick="checklistAddItem('${role.replace(/'/g, '\\\\\\\'')}')" class="w-full mt-1 py-1.5 border border-dashed border-slate-300 text-slate-500 text-xs rounded hover:bg-slate-50">+ Thêm mục</button>` : ''}
          </div>
          <div class="mt-3 pt-3 border-t flex items-center justify-between">
            <div class="text-xs text-slate-500">3/${items.length} hoàn thành${canEditThis ? ' · 💾 Thay đổi tự lưu' : ''}</div>
            ${!canEditThis ? `<button class="text-xs text-blue-700 font-medium hover:underline">Xem lịch sử →</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>

    ${canEditChecklists ? `<div class="mt-4 p-3 bg-slate-100 rounded-lg flex items-center justify-between">
      <div class="text-sm text-slate-600">Muốn khôi phục checklist gốc?</div>
      <button onclick="if(confirm('Khôi phục về checklist mặc định?')) { resetChecklistTemplates(); navigate('checklist'); }" class="px-3 py-1.5 text-sm text-rose-700 border border-rose-300 rounded hover:bg-rose-50">↻ Khôi phục mặc định</button>
    </div>` : ''}

    ${(canSeeAllFacilities() || isQLCS()) && !canEditChecklists ? `<div class="mt-4 card">
      <div class="card-title">Tỷ lệ tuân thủ checklist — ${canSeeAllFacilities() ? '5 cơ sở' : 'Cơ sở của bạn'} (tuần này)</div>
      <table class="w-full text-sm">
        <thead class="bg-slate-100">
          <tr><th class="text-left p-2">Cơ sở</th><th class="text-center p-2">Cứu hộ</th><th class="text-center p-2">Lễ tân</th><th class="text-center p-2">Kỹ thuật</th><th class="text-center p-2">Giáo viên</th><th class="text-center p-2">TB tuần</th></tr>
        </thead>
        <tbody>
          ${GP_DATA.facilities.filter(f => visibleFacilities.includes(f.id)).map(f => {
            const vals = [85+Math.random()*15, 80+Math.random()*20, 75+Math.random()*25, 90+Math.random()*10];
            const avg = vals.reduce((a,b) => a+b, 0) / 4;
            return `<tr class="border-b">
              <td class="p-2 font-medium">${f.name}</td>
              ${vals.map(v => {
                const c = v > 90 ? 'text-emerald-700 bg-emerald-50' : v > 80 ? 'text-amber-700 bg-amber-50' : 'text-rose-700 bg-rose-50';
                return `<td class="p-2 text-center"><span class="${c} px-2 py-0.5 rounded font-semibold">${v.toFixed(0)}%</span></td>`;
              }).join('')}
              <td class="p-2 text-center font-bold">${avg.toFixed(0)}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : ''}
  `;
}

// ====================== QUY TRÌNH HOẠT ĐỘNG ======================
const PROCEDURES_STORAGE_KEY = 'greenpool_procedures_v1';

function getActiveProcedures() {
  try {
    const stored = localStorage.getItem(PROCEDURES_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch (e) {}
  return JSON.parse(JSON.stringify(GP_DATA.procedures));
}

function saveProcedures(p) {
  try {
    localStorage.setItem(PROCEDURES_STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch (e) { return false; }
}

function resetProcedures() {
  localStorage.removeItem(PROCEDURES_STORAGE_KEY);
}

// Trả về danh sách phòng user có thể xem
function getVisibleDepartments() {
  const code = currentUser?.roleCode;
  if (!code) return [];
  // CEO + QLCS: xem tất cả phòng (đọc)
  if (code === 'CEO' || isQLCS()) return ['KT','DT','MKT','GS','KE','NS'];
  // GĐ KD: xem phòng KD
  if (code === 'GD_KD') return ['KT','DT','MKT'];
  // GĐ VP: xem phòng VP
  if (code === 'GD_VP') return ['GS','KE','NS'];
  // TP/Tổ trưởng/NV: chỉ phòng mình
  return ROLE_DEPT[code] ? [ROLE_DEPT[code]] : [];
}

function canEditProcedure(deptId) {
  const code = currentUser?.roleCode;
  if (!code) return false;
  // CEO không sửa (chỉ TP/GĐ Khối sửa)
  if (code === 'CEO') return false;
  // GĐ Khối: sửa các phòng khối mình
  if (code === 'GD_KD') return ['KT','DT','MKT'].includes(deptId);
  if (code === 'GD_VP') return ['GS','KE','NS'].includes(deptId);
  // TP: chỉ sửa phòng mình
  return ROLE_DEPT[code] === deptId && code.startsWith('TP_') || (code === 'TIBAN_TT' && deptId === 'MKT');
}

function renderQuyTrinh(el) {
  const procedures = getActiveProcedures();
  const visibleDepts = getVisibleDepartments();
  const code = currentUser.roleCode;

  if (visibleDepts.length === 0) {
    el.innerHTML = `<div class="card text-center py-16">
      <div class="text-5xl mb-4">📋</div>
      <div class="font-bold text-slate-800">Bạn chưa thuộc phòng nào có quy trình.</div>
      <div class="text-sm text-slate-500 mt-2">Vai trò "${currentUser.roleData.name}" không liên kết với phòng chuyên môn.</div>
    </div>`;
    return;
  }

  // Tổ chức theo Khối → Phòng
  const blockMeta = {
    KD: { name: 'Khối Kinh doanh', color: '#1F3A5F', bg: '#1F3A5F08', icon: '💼' },
    VP: { name: 'Khối Văn phòng',   color: '#7B6CDB', bg: '#7B6CDB08', icon: '🏢' },
  };
  const groupedByBlock = { KD: [], VP: [] };
  visibleDepts.forEach(deptId => {
    const dept = procedures[deptId];
    if (!dept) return;
    groupedByBlock[dept.block].push(deptId);
  });
  const visibleBlocks = Object.keys(groupedByBlock).filter(b => groupedByBlock[b].length > 0);

  const scopeLabel = visibleDepts.length === 6 ? 'Tất cả 6 phòng / 2 khối' :
                     visibleDepts.length > 1 ? `${visibleDepts.length} phòng — ${visibleBlocks.map(b => blockMeta[b].name).join(' + ')}` :
                     `Phòng ${procedures[visibleDepts[0]]?.name} (Khối ${procedures[visibleDepts[0]]?.block === 'KD' ? 'Kinh doanh' : 'Văn phòng'})`;

  // Tổng số quy trình
  const totalProcedures = visibleDepts.reduce((a, d) => a + (procedures[d]?.list?.length || 0), 0);
  const totalVersions = visibleDepts.reduce((a, d) => a + (procedures[d]?.list?.reduce((b, qt) => b + (qt.versions?.length || 0), 0) || 0), 0);

  el.innerHTML = `
    <div class="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
      <div class="font-semibold text-slate-800">Module — Quy trình vận hành phòng ban</div>
      <div class="text-sm text-slate-600 mt-1">📍 Phạm vi: <strong>${scopeLabel}</strong></div>
      <div class="mt-2 flex items-center gap-3 text-xs">
        <span class="px-2 py-1 bg-white border border-slate-200 rounded">📋 Tổng <strong>${totalProcedures}</strong> quy trình</span>
        <span class="px-2 py-1 bg-white border border-slate-200 rounded">📎 <strong>${totalVersions}</strong> file đã upload</span>
        <span class="px-2 py-1 bg-white border border-slate-200 rounded">🏢 <strong>${visibleDepts.length}</strong> phòng / <strong>${visibleBlocks.length}</strong> khối</span>
      </div>
    </div>

    ${visibleBlocks.map(blockId => {
      const meta = blockMeta[blockId];
      const blockDepts = groupedByBlock[blockId];
      const blockProcs = blockDepts.reduce((a, d) => a + (procedures[d]?.list?.length || 0), 0);
      return `<div class="mb-6">
        <!-- Section header Khối -->
        <div class="flex items-center gap-3 mb-3 pb-2 border-b-2" style="border-color:${meta.color}40">
          <div class="text-3xl">${meta.icon}</div>
          <div class="flex-1">
            <div class="text-xs uppercase tracking-wider text-slate-500 font-semibold">Khối</div>
            <div class="text-lg font-bold" style="color:${meta.color}">${meta.name}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-500">${blockDepts.length} phòng · ${blockProcs} quy trình</div>
          </div>
        </div>

        <!-- Cards cho từng phòng trong khối -->
        <div class="space-y-4">
          ${blockDepts.map(deptId => {
            const dept = procedures[deptId];
            const canEdit = canEditProcedure(deptId);
            return `<div class="card" style="border-left: 4px solid ${meta.color}">
              <div class="flex items-center justify-between pb-3 border-b mb-3">
                <div class="flex-1">
                  <!-- Block + Phòng badges -->
                  <div class="flex items-center gap-2 mb-1">
                    <span class="px-2 py-0.5 text-xs rounded font-bold" style="background:${meta.color};color:white">${meta.name}</span>
                    <span class="px-2 py-0.5 text-xs rounded font-bold border" style="border-color:${meta.color};color:${meta.color}">${dept.name}</span>
                  </div>
                  <div class="font-bold text-slate-800 text-base flex items-center gap-2">${dept.name}</div>
                  <div class="text-xs text-slate-500 mt-0.5">${dept.list.length} quy trình · ${dept.list.reduce((a,qt) => a + (qt.versions?.length||0), 0)} file đã upload</div>
                </div>
                ${canEdit ? `<button onclick="procedureAdd('${deptId}')" class="px-3 py-1.5 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800">+ Thêm quy trình</button>` : ''}
              </div>

              ${dept.list.length === 0 ? `<div class="text-center py-6 text-slate-400 text-sm italic">Chưa có quy trình nào — ${canEdit ? 'bấm "+ Thêm quy trình" để bắt đầu' : 'TP phòng chưa tạo'}</div>` : `<div class="space-y-3">${dept.list.map((qt, idx) => renderProcedureItem(deptId, idx, qt, canEdit, dept.name, meta)).join('')}</div>`}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}

    ${(code === 'GD_KD' || code === 'GD_VP' || code.startsWith('TP_') || code === 'TIBAN_TT') ? `<div class="mt-4 p-3 bg-slate-100 rounded-lg flex items-center justify-between">
      <div class="text-sm text-slate-600">Khôi phục quy trình về dữ liệu gốc?</div>
      <button onclick="if(confirm('Khôi phục về quy trình mặc định?')) { resetProcedures(); navigate('quy-trinh'); }" class="px-3 py-1.5 text-sm text-rose-700 border border-rose-300 rounded hover:bg-rose-50">↻ Khôi phục mặc định</button>
    </div>` : ''}
  `;
}

function renderProcedureItem(deptId, idx, qt, canEdit, deptName, blockMeta) {
  const versions = qt.versions || [];
  const currentVer = versions.length > 0 ? versions[versions.length - 1] : null;
  const fileIcon = currentVer ? (currentVer.fileName.match(/\.pdf$/i) ? '📕' : currentVer.fileName.match(/\.(docx?|doc)$/i) ? '📘' : currentVer.fileName.match(/\.(xlsx?|xls)$/i) ? '📗' : currentVer.fileName.match(/\.(jpg|jpeg|png|gif)$/i) ? '🖼️' : '📄') : '';
  const fileSizeKB = currentVer ? (currentVer.fileSize / 1024).toFixed(0) : 0;
  // Fallback nếu deptName/blockMeta không truyền (giữ tương thích ngược)
  const _meta = blockMeta || { name: '', color: '#6c757d' };
  const _deptName = deptName || '';

  return `<div class="border border-slate-200 rounded-lg overflow-hidden">
    <div class="flex items-center justify-between p-3 bg-slate-50">
      <div class="flex-1">
        <!-- Mỗi quy trình hiển thị rõ thuộc bộ phận/khối -->
        ${_deptName ? `<div class="flex items-center gap-1.5 mb-1.5">
          <span class="px-1.5 py-0.5 text-[10px] rounded font-bold uppercase tracking-wider" style="background:${_meta.color};color:white">${_meta.name}</span>
          <span class="px-1.5 py-0.5 text-[10px] rounded font-bold border" style="border-color:${_meta.color};color:${_meta.color}">📂 ${_deptName}</span>
        </div>` : ''}
        ${canEdit ? `<input type="text" value="${qt.title.replace(/"/g, '&quot;')}" onblur="procedureUpdateTitle('${deptId}', ${idx}, this.value)"
               class="w-full font-semibold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none">` : `<div class="font-semibold text-slate-800">${qt.title}</div>`}
        <div class="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
          <span>Cập nhật ${qt.updatedAt} bởi ${GP_DATA.roles[qt.updatedBy]?.name || qt.updatedBy}</span>
          ${versions.length > 0 ? `<span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">v${currentVer.version}</span>` : '<span class="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">Chưa upload file</span>'}
        </div>
      </div>
      <div class="flex items-center gap-1">
        <button onclick="this.closest('.border').querySelector('.body-preview').classList.toggle('hidden')" class="px-2 py-1 text-xs text-blue-700 hover:bg-blue-50 rounded">📑 Xem chi tiết ▼</button>
        ${canEdit ? `<button onclick="procedureDelete('${deptId}', ${idx})" class="text-rose-500 hover:bg-rose-50 p-1.5 rounded" title="Xóa quy trình">🗑️</button>` : ''}
      </div>
    </div>

    ${currentVer ? `<div class="px-3 py-2 bg-emerald-50 border-t border-emerald-200 flex items-center justify-between">
      <div class="flex items-center gap-2 text-sm">
        <span class="text-xl">${fileIcon}</span>
        <div>
          <div class="font-medium text-slate-800">${currentVer.fileName}</div>
          <div class="text-xs text-slate-500">${fileSizeKB} KB · Upload ${currentVer.uploadedAt} bởi ${GP_DATA.roles[currentVer.uploadedBy]?.name || currentVer.uploadedBy}${currentVer.changeNote ? ' · "' + currentVer.changeNote + '"' : ''}</div>
        </div>
      </div>
      <button onclick="procedureDownload('${deptId}', ${idx}, ${currentVer.version})" class="px-3 py-1.5 bg-emerald-700 text-white rounded text-xs font-semibold hover:bg-emerald-800">⬇️ Tải xuống</button>
    </div>` : ''}

    <div class="body-preview hidden p-3 bg-white">
      <!-- Steps preview -->
      ${qt.steps && qt.steps.length > 0 ? `<div class="mb-3">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-2">Tóm tắt các bước</div>
        <ol class="space-y-2">
          ${qt.steps.map((step, sIdx) => `<li class="flex items-start gap-3 group">
            <span class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">${sIdx+1}</span>
            ${canEdit ? `<input type="text" value="${step.replace(/"/g, '&quot;')}" onblur="procedureUpdateStep('${deptId}', ${idx}, ${sIdx}, this.value)"
                   class="flex-1 text-sm text-slate-700 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none">
              <button onclick="procedureDeleteStep('${deptId}', ${idx}, ${sIdx})" class="opacity-0 group-hover:opacity-100 text-rose-500 hover:bg-rose-50 px-1.5 rounded text-xs">✕</button>` : `<span class="flex-1 text-sm text-slate-700">${step}</span>`}
          </li>`).join('')}
        </ol>
        ${canEdit ? `<button onclick="procedureAddStep('${deptId}', ${idx})" class="w-full mt-2 py-1.5 border border-dashed border-slate-300 text-slate-500 text-xs rounded hover:bg-slate-50">+ Thêm bước</button>` : ''}
      </div>` : ''}

      <!-- Version history -->
      ${versions.length > 0 ? `<div class="${qt.steps && qt.steps.length > 0 ? 'pt-3 border-t' : ''}">
        <div class="text-xs font-semibold text-slate-500 uppercase mb-2">Lịch sử phiên bản (${versions.length})</div>
        <div class="space-y-1">
          ${[...versions].reverse().map(v => `<div class="flex items-center justify-between p-2 ${v.version === currentVer.version ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'} rounded text-xs">
            <div class="flex items-center gap-2">
              <span class="px-1.5 py-0.5 ${v.version === currentVer.version ? 'bg-emerald-700 text-white' : 'bg-slate-300 text-slate-700'} rounded font-bold">v${v.version}</span>
              <span class="font-medium">${v.fileName}</span>
              <span class="text-slate-500">${(v.fileSize/1024).toFixed(0)} KB</span>
              <span class="text-slate-400">·</span>
              <span class="text-slate-500">${v.uploadedAt} bởi ${GP_DATA.roles[v.uploadedBy]?.name || v.uploadedBy}</span>
              ${v.changeNote ? `<span class="text-slate-500 italic">— "${v.changeNote}"</span>` : ''}
            </div>
            <button onclick="procedureDownload('${deptId}', ${idx}, ${v.version})" class="text-blue-700 hover:underline px-1">⬇️</button>
          </div>`).join('')}
        </div>
      </div>` : ''}

      <!-- Upload new version (edit mode only) -->
      ${canEdit ? `<div class="mt-3 pt-3 border-t">
        <label class="block">
          <span class="text-xs font-semibold text-slate-500 uppercase mb-2 block">📤 Tải lên phiên bản mới (v${versions.length + 1})</span>
          <input type="file" id="upload-${deptId}-${idx}" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onchange="procedureUploadFile('${deptId}', ${idx}, this)"
                 class="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer">
          <div class="text-xs text-slate-400 mt-1">PDF, Word, Excel, Ảnh. Tối đa 2 MB/file.</div>
        </label>
      </div>` : ''}
    </div>
  </div>`;
}

function procedureUploadFile(deptId, idx, input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    alert('File quá lớn! Trong prototype này chỉ chấp nhận file < 2 MB. App thật sẽ dùng cloud storage (Supabase) không giới hạn.');
    input.value = '';
    return;
  }
  const changeNote = prompt('Ghi chú thay đổi (gì khác so với phiên bản trước?):', '');
  if (changeNote === null) { input.value = ''; return; }

  const reader = new FileReader();
  reader.onload = function(e) {
    const p = getActiveProcedures();
    const qt = p[deptId].list[idx];
    if (!qt.versions) qt.versions = [];
    const newVer = qt.versions.length + 1;
    qt.versions.push({
      version: newVer,
      fileName: file.name,
      fileSize: file.size,
      fileData: e.target.result,
      uploadedAt: new Date().toISOString().slice(0,10),
      uploadedBy: currentUser.roleCode,
      changeNote: changeNote.trim() || (newVer === 1 ? 'Phiên bản đầu tiên' : 'Cập nhật'),
    });
    qt.updatedAt = new Date().toISOString().slice(0,10);
    qt.updatedBy = currentUser.roleCode;
    if (saveProcedures(p)) {
      alert(`✓ Đã upload thành công "${file.name}" làm phiên bản v${newVer}.\nGhi chú: ${qt.versions[qt.versions.length-1].changeNote}`);
      navigate('quy-trinh');
    } else {
      alert('⚠️ Lưu thất bại. Có thể bộ nhớ trình duyệt đã đầy. Hãy xóa các phiên bản cũ hoặc khôi phục mặc định.');
    }
  };
  reader.readAsDataURL(file);
}

function procedureDownload(deptId, idx, version) {
  const p = getActiveProcedures();
  const qt = p[deptId].list[idx];
  const v = qt.versions.find(x => x.version === version);
  if (!v) return alert('Không tìm thấy phiên bản này.');
  const a = document.createElement('a');
  a.href = v.fileData;
  a.download = v.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// CRUD operations
function procedureUpdateTitle(deptId, idx, value) {
  const p = getActiveProcedures();
  p[deptId].list[idx].title = value;
  p[deptId].list[idx].updatedAt = new Date().toISOString().slice(0,10);
  p[deptId].list[idx].updatedBy = currentUser.roleCode;
  saveProcedures(p);
}

function procedureUpdateStep(deptId, idx, sIdx, value) {
  const p = getActiveProcedures();
  p[deptId].list[idx].steps[sIdx] = value;
  p[deptId].list[idx].updatedAt = new Date().toISOString().slice(0,10);
  p[deptId].list[idx].updatedBy = currentUser.roleCode;
  saveProcedures(p);
}

function procedureAddStep(deptId, idx) {
  const step = prompt('Nội dung bước mới:');
  if (!step || !step.trim()) return;
  const p = getActiveProcedures();
  p[deptId].list[idx].steps.push(step.trim());
  p[deptId].list[idx].updatedAt = new Date().toISOString().slice(0,10);
  p[deptId].list[idx].updatedBy = currentUser.roleCode;
  saveProcedures(p);
  navigate('quy-trinh');
}

function procedureDeleteStep(deptId, idx, sIdx) {
  const p = getActiveProcedures();
  if (!confirm(`Xóa bước: "${p[deptId].list[idx].steps[sIdx]}"?`)) return;
  p[deptId].list[idx].steps.splice(sIdx, 1);
  p[deptId].list[idx].updatedAt = new Date().toISOString().slice(0,10);
  p[deptId].list[idx].updatedBy = currentUser.roleCode;
  saveProcedures(p);
  navigate('quy-trinh');
}

function procedureAdd(deptId) {
  const title = prompt(`Tên quy trình mới cho phòng ${getActiveProcedures()[deptId].name}:`);
  if (!title || !title.trim()) return;
  const p = getActiveProcedures();
  p[deptId].list.push({
    id: 'qt-' + deptId.toLowerCase() + '-' + Date.now(),
    title: title.trim(),
    steps: [],
    updatedAt: new Date().toISOString().slice(0,10),
    updatedBy: currentUser.roleCode,
  });
  saveProcedures(p);
  navigate('quy-trinh');
}

function procedureDelete(deptId, idx) {
  const p = getActiveProcedures();
  if (!confirm(`Xóa quy trình "${p[deptId].list[idx].title}"?`)) return;
  p[deptId].list.splice(idx, 1);
  saveProcedures(p);
  navigate('quy-trinh');
}

// ===== Checklist editor actions (GĐ Khối) =====
function checklistUpdateItem(role, idx, value) {
  const t = getActiveChecklistTemplates();
  if (!t[role]) return;
  t[role].items[idx] = value;
  saveChecklistTemplates(t);
}

function checklistDeleteItem(role, idx) {
  const t = getActiveChecklistTemplates();
  if (!confirm(`Xóa mục "${t[role].items[idx]}"?`)) return;
  t[role].items.splice(idx, 1);
  saveChecklistTemplates(t);
  navigate('checklist');
}

function checklistAddItem(role) {
  const item = prompt(`Thêm mục checklist mới cho "${role}":`);
  if (!item || !item.trim()) return;
  const t = getActiveChecklistTemplates();
  if (!t[role]) return;
  t[role].items.push(item.trim());
  saveChecklistTemplates(t);
  navigate('checklist');
}

function checklistAddTemplate() {
  const code = currentUser.roleCode;
  const block = code === 'GD_KD' ? 'KD' : code === 'GD_VP' ? 'VP' : null;
  if (!block) return alert('Bạn không có quyền tạo checklist.');
  const name = prompt(`Tên vai trò/phòng cho checklist mới (khối ${block}):`);
  if (!name || !name.trim()) return;
  const t = getActiveChecklistTemplates();
  if (t[name]) return alert(`Checklist cho "${name}" đã tồn tại.`);
  t[name] = { block, items: [] };
  saveChecklistTemplates(t);
  navigate('checklist');
}

function checklistDeleteTemplate(role) {
  if (!confirm(`Xóa toàn bộ checklist của "${role}"?`)) return;
  const t = getActiveChecklistTemplates();
  delete t[role];
  saveChecklistTemplates(t);
  navigate('checklist');
}

// ====================== ĐỀ XUẤT · NHIỆM VỤ · GIAO VIỆC ======================
let workflowTab = 'de-xuat';  // de-xuat | nhiem-vu | giao-viec

function renderGiaoViec(el) {
  const role = currentUser.roleCode;
  const isCEO = role === 'CEO';
  const allTasks = GP_DATA.tasks;
  const allProposals = GP_DATA.proposals;

  // Tasks I receive (nhiệm vụ) — assigned TO me
  const myTasks = allTasks.filter(t => t.assignee === role);
  // Tasks I assigned (giao việc) — assigned BY me
  const myAssignments = allTasks.filter(t => t.from === role);
  // Proposals I sent
  const myProposals = allProposals.filter(p => p.from === role);
  // Proposals awaiting my approval
  const proposalsToApprove = allProposals.filter(p => {
    return p.approvalChain.some(step => step.role === role && step.status === 'pending');
  });

  el.innerHTML = `
    <div class="mb-4 flex items-center justify-between">
      <div>
        <div class="font-semibold text-slate-800">Module 5 — Đề xuất · Nhiệm vụ · Giao việc</div>
        <div class="text-sm text-slate-600">${isCEO ? 'Vai trò CEO/Tổng giám đốc — Xem mọi đề xuất, giao việc cho tất cả cấp.' : 'Workflow 3 chiều: gửi đề xuất ↑↔, nhận nhiệm vụ ↓, giao việc ↓.'}</div>
      </div>
    </div>

    <!-- Tab navigation -->
    <div class="flex items-center gap-1 mb-4 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
      <button onclick="setWorkflowTab('de-xuat')" class="px-4 py-2 rounded-lg text-sm font-medium transition ${workflowTab === 'de-xuat' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'}">
        📤 Đề xuất
        ${(myProposals.length + proposalsToApprove.length) > 0 ? `<span class="ml-1 inline-block px-1.5 py-0.5 text-xs rounded-full ${workflowTab === 'de-xuat' ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-700'}">${myProposals.length + proposalsToApprove.length}</span>` : ''}
      </button>
      ${!isCEO ? `<button onclick="setWorkflowTab('nhiem-vu')" class="px-4 py-2 rounded-lg text-sm font-medium transition ${workflowTab === 'nhiem-vu' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'}">
        📥 Nhiệm vụ
        ${myTasks.length > 0 ? `<span class="ml-1 inline-block px-1.5 py-0.5 text-xs rounded-full ${workflowTab === 'nhiem-vu' ? 'bg-white text-blue-700' : 'bg-amber-100 text-amber-700'}">${myTasks.length}</span>` : ''}
      </button>` : ''}
      <button onclick="setWorkflowTab('giao-viec')" class="px-4 py-2 rounded-lg text-sm font-medium transition ${workflowTab === 'giao-viec' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-100'}">
        ➡️ Giao việc
        ${myAssignments.length > 0 ? `<span class="ml-1 inline-block px-1.5 py-0.5 text-xs rounded-full ${workflowTab === 'giao-viec' ? 'bg-white text-blue-700' : 'bg-emerald-100 text-emerald-700'}">${myAssignments.length}</span>` : ''}
      </button>
    </div>

    <!-- Tab content -->
    <div id="workflow-content"></div>
  `;

  document.getElementById('workflow-content').innerHTML = renderWorkflowTab(workflowTab, role, isCEO, myProposals, proposalsToApprove, myTasks, myAssignments);
}

function setWorkflowTab(tab) {
  workflowTab = tab;
  navigate('giao-viec');
}

function renderWorkflowTab(tab, role, isCEO, myProposals, proposalsToApprove, myTasks, myAssignments) {
  if (tab === 'de-xuat') return renderTabDeXuat(role, isCEO, myProposals, proposalsToApprove);
  if (tab === 'nhiem-vu') return renderTabNhiemVu(myTasks);
  if (tab === 'giao-viec') return renderTabGiaoViec(myAssignments);
  return '';
}

// === Tab 1: Đề xuất ===
function renderTabDeXuat(role, isCEO, myProposals, proposalsToApprove) {
  return `
    <!-- Approvals awaiting -->
    ${proposalsToApprove.length > 0 ? `<div class="mb-4 p-4 bg-amber-50 border-2 border-amber-300 rounded-xl">
      <div class="font-bold text-amber-900 mb-3">⏳ ${proposalsToApprove.length} đề xuất đang chờ bạn phê duyệt</div>
      <div class="space-y-2">
        ${proposalsToApprove.map(p => renderProposalCardWithApprove(p, role)).join('')}
      </div>
    </div>` : ''}

    <div class="flex items-center justify-between mb-3">
      <div class="font-semibold text-slate-800">📤 Đề xuất tôi đã gửi (${myProposals.length})</div>
      <button onclick="alert('Form tạo đề xuất mới sẽ mở ra với các trường: Tiêu đề, Nội dung, Loại (lên cấp trên / ngang cấp / sang khối khác), Mức độ ưu tiên, Người duyệt, File đính kèm.')" class="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800">
        + Tạo đề xuất mới
      </button>
    </div>

    ${myProposals.length === 0 ? '<div class="card text-center text-slate-500 py-8">Bạn chưa gửi đề xuất nào.</div>' : `<div class="space-y-3">${myProposals.map(renderProposalCard).join('')}</div>`}

    <!-- Workflow info box -->
    <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
      <div class="font-semibold text-slate-800 text-sm mb-2">💡 Quy tắc đề xuất & giao việc tại Green Pool</div>
      <div class="grid grid-cols-3 gap-3 text-xs text-slate-700">
        <div class="bg-white p-3 rounded border border-emerald-200">
          <div class="font-bold text-emerald-700">✓ Trong cơ sở</div>
          <div class="mt-1">Đề xuất / giao việc giữa các vai trò <strong>trong cùng cơ sở</strong> → <strong>đi thẳng đến người nhận</strong>, không cần duyệt.</div>
        </div>
        <div class="bg-white p-3 rounded border border-emerald-200">
          <div class="font-bold text-emerald-700">✓ Trong cùng khối</div>
          <div class="mt-1">Đề xuất / giao việc giữa các phòng/cơ sở <strong>trong cùng khối</strong> (KD↔KD hoặc VP↔VP) → đi thẳng, không cần duyệt.</div>
        </div>
        <div class="bg-white p-3 rounded border border-rose-200 bg-rose-50/40">
          <div class="font-bold text-rose-700">⚠️ Chéo khối (KD ↔ VP)</div>
          <div class="mt-1">Chỉ trường hợp này cần <strong>2 GĐ Khối phê duyệt</strong> trước khi giao xuống nhân viên thực hiện.</div>
        </div>
      </div>
      <div class="mt-3 text-xs text-slate-600">📨 <strong>Tất cả đề xuất/việc</strong> đều tạo thông báo đến app của người nhận (biểu tượng 🔔 góc trên phải) — kèm khi đề xuất được phê duyệt cũng có tin nhắn.</div>
    </div>
  `;
}

function renderProposalCard(p) {
  const typeBadge = {
    'up': '<span class="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-semibold">↑ Lên cấp trên</span>',
    'peer': '<span class="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded-full font-semibold">↔ Ngang cấp</span>',
    'cross-bloc': '<span class="px-2 py-0.5 text-xs bg-rose-100 text-rose-700 rounded-full font-semibold">⇄ Chéo khối</span>',
  };
  const statusBadge = {
    'pending': '<span class="status-pill status-pending">Chờ duyệt</span>',
    'in_approval': '<span class="status-pill status-in_progress">Đang qua quy trình duyệt</span>',
    'approved': '<span class="status-pill status-completed">Đã duyệt</span>',
    'in_execution': '<span class="status-pill" style="background:#e9d5ff;color:#6b21a8">Đang triển khai</span>',
    'rejected': '<span class="status-pill" style="background:#fee2e2;color:#991b1b">Bị từ chối</span>',
  };

  return `<div class="card border-l-4" style="border-color: ${p.priority === 'high' ? '#B23A48' : p.priority === 'medium' ? '#C9A227' : '#5B9BD5'}">
    <div class="flex items-start justify-between gap-3 mb-2">
      <div class="flex-1">
        <div class="font-semibold text-slate-800">${p.title}</div>
        <div class="text-xs text-slate-500 mt-1">Tạo: ${p.createdAt} · ID: ${p.id}</div>
      </div>
      <div class="flex flex-col items-end gap-1">
        ${typeBadge[p.type]}
        ${statusBadge[p.status]}
      </div>
    </div>
    <div class="text-sm text-slate-700 mb-3">${p.description}</div>
    ${renderApprovalChain(p)}
  </div>`;
}

function renderProposalCardWithApprove(p, role) {
  return `<div class="bg-white p-3 rounded-lg border border-amber-300 shadow-sm">
    <div class="flex items-start justify-between gap-3 mb-2">
      <div class="flex-1">
        <div class="font-bold text-slate-800">${p.title}</div>
        <div class="text-xs text-slate-500">Từ: ${GP_DATA.roles[p.from]?.name || p.from} · ${p.createdAt}</div>
      </div>
      <div class="flex gap-2">
        <button onclick="alert('Đã phê duyệt đề xuất: ' + ${JSON.stringify(p.title)})" class="px-3 py-1.5 bg-emerald-700 text-white rounded text-xs font-semibold hover:bg-emerald-800">✓ Phê duyệt</button>
        <button onclick="alert('Đã từ chối đề xuất')" class="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-300 rounded text-xs font-semibold hover:bg-rose-100">✕ Từ chối</button>
      </div>
    </div>
    <div class="text-sm text-slate-700 mb-2">${p.description}</div>
    ${renderApprovalChain(p)}
  </div>`;
}

function renderApprovalChain(p) {
  if (!p.approvalChain || p.approvalChain.length === 0) return '';
  return `<div class="mt-3 pt-3 border-t border-slate-200">
    <div class="text-xs text-slate-500 mb-2 font-semibold">Quy trình phê duyệt:</div>
    <div class="flex items-center gap-1 flex-wrap">
      <div class="px-2 py-1 bg-slate-100 rounded text-xs">
        <span class="font-bold text-slate-700">${GP_DATA.roles[p.from]?.name || p.from}</span>
        <div class="text-[10px] text-slate-500">Người gửi</div>
      </div>
      ${p.approvalChain.map((step, i) => {
        const statusColor = step.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : step.status === 'rejected' ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-amber-50 text-amber-800 border-amber-300';
        const statusIcon = step.status === 'approved' ? '✓' : step.status === 'rejected' ? '✕' : '⏳';
        return `<span class="text-slate-400">→</span>
                <div class="px-2 py-1 rounded text-xs border ${statusColor}">
                  <span class="font-bold">${statusIcon} ${GP_DATA.roles[step.role]?.name || step.role}</span>
                  <div class="text-[10px]">${step.status === 'approved' ? 'Đã duyệt ' + (step.date||'') : step.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}</div>
                  ${step.note ? `<div class="text-[10px] italic mt-0.5">"${step.note}"</div>` : ''}
                </div>`;
      }).join('')}
      ${p.finalAssignee ? `<span class="text-slate-400">→</span>
        <div class="px-2 py-1 bg-purple-100 border border-purple-300 rounded text-xs">
          <span class="font-bold text-purple-800">📌 ${GP_DATA.roles[p.finalAssignee]?.name || p.finalAssignee}</span>
          <div class="text-[10px] text-purple-600">Người thực hiện</div>
        </div>` : ''}
    </div>
  </div>`;
}

// === Tab 2: Nhiệm vụ (việc cấp trên giao xuống) ===
function renderTabNhiemVu(myTasks) {
  if (myTasks.length === 0) {
    return `<div class="card text-center text-slate-500 py-8">
      <div class="text-2xl mb-2">📥</div>
      <div>Hiện chưa có nhiệm vụ nào từ cấp trên.</div>
    </div>`;
  }

  const grouped = {
    pending: myTasks.filter(t => t.status === 'pending'),
    in_progress: myTasks.filter(t => t.status === 'in_progress'),
    completed: myTasks.filter(t => t.status === 'completed'),
  };

  return `
    <div class="mb-3 text-sm text-slate-600">Nhiệm vụ cấp trên giao cho bạn — bạn cần báo cáo tiến độ và hoàn thành đúng deadline.</div>
    <div class="grid grid-cols-3 gap-4">
      <div>
        <div class="flex items-center gap-2 mb-3"><span class="w-2 h-2 rounded-full bg-amber-500"></span><h3 class="font-semibold text-slate-700">Chờ nhận (${grouped.pending.length})</h3></div>
        ${grouped.pending.map(t => renderTaskCardWithActions(t, 'receive')).join('')}
      </div>
      <div>
        <div class="flex items-center gap-2 mb-3"><span class="w-2 h-2 rounded-full bg-blue-500"></span><h3 class="font-semibold text-slate-700">Đang làm (${grouped.in_progress.length})</h3></div>
        ${grouped.in_progress.map(t => renderTaskCardWithActions(t, 'progress')).join('')}
      </div>
      <div>
        <div class="flex items-center gap-2 mb-3"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><h3 class="font-semibold text-slate-700">Đã hoàn thành (${grouped.completed.length})</h3></div>
        ${grouped.completed.map(t => renderTaskCardWithActions(t, 'done')).join('')}
      </div>
    </div>
  `;
}

// === Tab 3: Giao việc (việc tôi giao xuống) ===
function renderTabGiaoViec(myAssignments) {
  return `
    <div class="flex items-center justify-between mb-3">
      <div class="font-semibold text-slate-800">➡️ Việc tôi đã giao cho cấp dưới (${myAssignments.length})</div>
      <button onclick="alert('Form giao việc mới sẽ mở: Tiêu đề, Nội dung, Người nhận (chọn từ cấp dưới), Deadline, Mức độ, File.')" class="px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-medium hover:bg-blue-800">+ Giao việc mới</button>
    </div>

    ${myAssignments.length === 0 ? '<div class="card text-center text-slate-500 py-8">Bạn chưa giao việc nào cho cấp dưới.</div>' : `
      <div class="grid grid-cols-3 gap-4">
        <div>
          <div class="flex items-center gap-2 mb-3"><span class="w-2 h-2 rounded-full bg-amber-500"></span><h3 class="font-semibold text-slate-700">Chờ xử lý (${myAssignments.filter(t => t.status==='pending').length})</h3></div>
          ${myAssignments.filter(t => t.status === 'pending').map(t => renderTaskCardWithActions(t, 'monitor')).join('')}
        </div>
        <div>
          <div class="flex items-center gap-2 mb-3"><span class="w-2 h-2 rounded-full bg-blue-500"></span><h3 class="font-semibold text-slate-700">Đang xử lý (${myAssignments.filter(t => t.status==='in_progress').length})</h3></div>
          ${myAssignments.filter(t => t.status === 'in_progress').map(t => renderTaskCardWithActions(t, 'monitor')).join('')}
        </div>
        <div>
          <div class="flex items-center gap-2 mb-3"><span class="w-2 h-2 rounded-full bg-emerald-500"></span><h3 class="font-semibold text-slate-700">Đã xong (${myAssignments.filter(t => t.status==='completed').length})</h3></div>
          ${myAssignments.filter(t => t.status === 'completed').map(t => renderTaskCardWithActions(t, 'monitor')).join('')}
        </div>
      </div>
    `}
  `;
}

function renderTaskCardWithActions(t, viewMode) {
  const priorityColors = { high: 'border-rose-400 bg-rose-50/30', medium: 'border-amber-400 bg-amber-50/30', low: 'border-blue-400 bg-blue-50/30' };
  let actions = '';
  if (viewMode === 'receive') {
    actions = `<div class="mt-2 flex gap-2">
      <button onclick="alert('Đã nhận việc — chuyển trạng thái sang Đang làm')" class="px-2.5 py-1 bg-blue-700 text-white rounded text-xs font-semibold">Bắt đầu làm</button>
    </div>`;
  } else if (viewMode === 'progress') {
    actions = `<div class="mt-2 flex gap-2">
      <button onclick="alert('Mở dialog báo cáo tiến độ với % hoàn thành và ghi chú')" class="px-2.5 py-1 bg-blue-700 text-white rounded text-xs font-semibold">Báo cáo tiến độ</button>
      <button onclick="alert('Đánh dấu hoàn thành — sẽ chờ cấp trên xác nhận')" class="px-2.5 py-1 bg-emerald-700 text-white rounded text-xs font-semibold">Hoàn thành</button>
    </div>`;
  } else if (viewMode === 'monitor') {
    actions = `<div class="mt-2 flex gap-2">
      <button onclick="alert('Xem chi tiết tiến độ + comment với người thực hiện')" class="px-2.5 py-1 bg-slate-200 text-slate-700 rounded text-xs font-semibold">Xem chi tiết</button>
      ${t.status === 'completed' ? '<button onclick="alert(\'Đã xác nhận hoàn thành\')" class="px-2.5 py-1 bg-emerald-700 text-white rounded text-xs font-semibold">✓ Xác nhận xong</button>' : ''}
    </div>`;
  } else {
    actions = '';
  }

  return `<div class="card mb-2 border-l-4 ${priorityColors[t.priority]}">
    <div class="font-medium text-sm text-slate-800 mb-2">${t.title}</div>
    <div class="text-xs text-slate-600 space-y-0.5">
      ${viewMode === 'monitor' ? `<div>👤 Người làm: ${GP_DATA.roles[t.assignee]?.name || t.assignee}</div>` : `<div>📨 Từ: ${GP_DATA.roles[t.from]?.name || t.from}</div>`}
      <div>📅 Deadline: ${t.deadline}</div>
    </div>
    <div class="flex items-center gap-1 mt-2">
      <span class="status-pill priority-${t.priority}">${t.priority === 'high' ? 'Khẩn' : t.priority === 'medium' ? 'TB' : 'Thấp'}</span>
    </div>
    ${actions}
  </div>`;
}

// Legacy: kept for dashboard compatibility
function renderTaskCard(t) {
  const priorityColors = { high: 'border-rose-400 bg-rose-50', medium: 'border-amber-400 bg-amber-50', low: 'border-blue-400 bg-blue-50' };
  return `<div class="card mb-2 border-l-4 ${priorityColors[t.priority]}">
    <div class="font-medium text-sm text-slate-800 mb-2">${t.title}</div>
    <div class="text-xs text-slate-600 space-y-1">
      <div>👤 ${GP_DATA.roles[t.assignee]?.name || t.assignee}</div>
      <div>📅 Deadline: ${t.deadline}</div>
      <div>📨 Từ: ${GP_DATA.roles[t.from]?.name || t.from}</div>
    </div>
  </div>`;
}

// ====================== SƠ ĐỒ TỔ CHỨC ======================
function renderSoDo(el) {
  el.innerHTML = `
    <div class="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
      <div class="font-semibold text-slate-800">Sơ đồ tổ chức Green Pool — 5 tầng / 42 vai trò</div>
      <div class="text-sm text-slate-600 mt-1">Click vào từng vai trò để xem danh sách nhân sự thuộc vai trò đó.</div>
    </div>

    <div class="card">
      <!-- Tier 1 -->
      <div class="text-center mb-6">
        <div class="text-xs uppercase tracking-wider text-slate-500 mb-2">Tầng 1</div>
        <div class="inline-block bg-gradient-to-br from-slate-700 to-slate-900 text-white px-6 py-3 rounded-xl shadow-lg cursor-pointer hover:shadow-xl transition">
          <div class="font-bold">CEO / Chủ đầu tư</div>
          <div class="text-xs text-slate-300">1 người</div>
        </div>
      </div>

      <!-- Tier 2 -->
      <div class="text-xs uppercase tracking-wider text-slate-500 mb-2 text-center">Tầng 2 — Giám đốc Khối</div>
      <div class="grid grid-cols-2 gap-4 max-w-2xl mx-auto mb-6">
        <div class="bg-gradient-to-br from-blue-700 to-blue-900 text-white p-4 rounded-xl shadow cursor-pointer hover:shadow-lg transition">
          <div class="font-bold">GĐ Khối Kinh doanh</div>
          <div class="text-xs text-blue-200">Quản lý 5 QLCS + 3 TP + Tiểu ban TTNB</div>
        </div>
        <div class="bg-gradient-to-br from-blue-700 to-blue-900 text-white p-4 rounded-xl shadow cursor-pointer hover:shadow-lg transition">
          <div class="font-bold">GĐ Khối Văn phòng</div>
          <div class="text-xs text-blue-200">Quản lý 3 TP (Giám sát, Kế toán, Nhân sự)</div>
        </div>
      </div>

      <!-- Tier 3 -->
      <div class="text-xs uppercase tracking-wider text-slate-500 mb-2 text-center">Tầng 3 — Trưởng phòng & Quản lý cơ sở</div>
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div class="text-xs font-semibold text-slate-600 mb-2">Trực thuộc GĐ Kinh doanh</div>
          <div class="space-y-2">
            ${['QLCS Hoàng Mai','QLCS Thuỵ Khuê','QLCS Cung Thể Thao','QLCS 24 NCT','QLCS Thanh Trì','TP Kỹ thuật','TP Đào tạo','TP Marketing'].map(n => `
              <div class="bg-teal-50 border border-teal-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-teal-100 transition text-sm">${n}</div>
            `).join('')}
            <div class="bg-amber-50 border-2 border-amber-300 px-3 py-2 rounded-lg cursor-pointer hover:bg-amber-100 transition text-sm font-medium">
              🟡 Tiểu ban Truyền thông Nội bộ (trung lập, báo cáo trực tiếp GĐ KD)
            </div>
          </div>
        </div>
        <div>
          <div class="text-xs font-semibold text-slate-600 mb-2">Trực thuộc GĐ Văn phòng</div>
          <div class="space-y-2">
            ${['TP Giám sát','TP Kế toán','TP Nhân sự'].map(n => `
              <div class="bg-teal-50 border border-teal-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-teal-100 transition text-sm">${n}</div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Tier 4 -->
      <div class="text-xs uppercase tracking-wider text-slate-500 mb-2 text-center">Tầng 4 — Phó phòng & Tổ trưởng</div>
      <div class="grid grid-cols-4 gap-2 mb-6">
        ${['PP MKT','PP ĐT Chuyên môn','PP ĐT TC-TNKH','PP KT Xử lý nước','PP KT Hệ thống','TT Content','TT Thiết kế','TT Editor','TT Đào tạo CS','TT An sinh','TT Lễ tân'].map(n => `
          <div class="bg-sky-50 border border-sky-200 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-sky-100">${n}</div>
        `).join('')}
      </div>

      <!-- Tier 5 -->
      <div class="text-xs uppercase tracking-wider text-slate-500 mb-2 text-center">Tầng 5 — Nhân viên (Tại cơ sở + Văn phòng)</div>
      <div class="grid grid-cols-4 gap-2">
        ${['NV Kinh doanh','NV Cứu hộ','NV Tạp vụ','NV Lễ tân','NV KT Xử lý nước','NV KT Hệ thống','Giáo viên cơ bản','Giáo viên nâng cao','Trợ giảng','NV Content','NV Thiết kế','NV Editor','NV Giám sát','NV Kế toán','NV Nhân sự','NV TT Nội bộ'].map(n => `
          <div class="bg-slate-50 border border-slate-200 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-slate-100">${n}</div>
        `).join('')}
      </div>

      <div class="mt-6 pt-4 border-t flex items-center justify-center gap-6 text-xs">
        <div class="flex items-center gap-2"><span class="w-3 h-3 bg-slate-700 rounded"></span>Tầng 1: 1 vai trò</div>
        <div class="flex items-center gap-2"><span class="w-3 h-3 bg-blue-700 rounded"></span>Tầng 2: 2</div>
        <div class="flex items-center gap-2"><span class="w-3 h-3 bg-teal-500 rounded"></span>Tầng 3: 12</div>
        <div class="flex items-center gap-2"><span class="w-3 h-3 bg-sky-400 rounded"></span>Tầng 4: 11</div>
        <div class="flex items-center gap-2"><span class="w-3 h-3 bg-slate-400 rounded"></span>Tầng 5: 16</div>
      </div>
    </div>
  `;
}

// ====================== LƯƠNG 3P ======================
function renderLuong(el) {
  const sample = GP_DATA.salary['NV_SALE'];
  const kpi = GP_DATA.kpi3Layers;

  // Calculate KPI score
  function kpiScore(layer) {
    return layer.reduce((sum, k) => {
      const ratio = Math.min(k.actual / k.target, 1.5); // cap at 150%
      return sum + ratio * k.weight;
    }, 0);
  }
  const oScore = kpiScore(kpi.outcome);
  const pScore = kpiScore(kpi.process);
  const iScore = kpiScore(kpi.input);
  const totalScore = oScore + pScore + iScore;
  const p3 = sample.p3_base * (totalScore / 100);
  const totalSalary = sample.p1 + sample.p2 + p3;

  el.innerHTML = `
    <div class="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
      <div class="font-semibold text-slate-800">Module 9 — Lương 3P + KPI 3 tầng</div>
      <div class="text-sm text-slate-600 mt-1">Demo cho vai trò NV Sale. P1 = lương vị trí (cố định), P2 = năng lực (theo cấp bậc), P3 = KPI (biến đổi).</div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="kpi-card border-l-4 border-blue-700"><div class="kpi-label">P1 — Lương vị trí</div><div class="kpi-value">${(sample.p1/1e6).toFixed(1)} <span class="text-lg">Tr</span></div><div class="kpi-sub">Cố định theo chức danh</div></div>
      <div class="kpi-card border-l-4 border-teal-700"><div class="kpi-label">P2 — Lương năng lực</div><div class="kpi-value">${(sample.p2/1e6).toFixed(1)} <span class="text-lg">Tr</span></div><div class="kpi-sub">Theo cấp bậc / kinh nghiệm</div></div>
      <div class="kpi-card border-l-4 border-amber-600"><div class="kpi-label">P3 — Lương KPI</div><div class="kpi-value">${(p3/1e6).toFixed(1)} <span class="text-lg">Tr</span></div><div class="kpi-sub">${totalScore.toFixed(0)}% mục tiêu</div></div>
      <div class="kpi-card border-l-4 border-emerald-700"><div class="kpi-label">Tổng lương</div><div class="kpi-value">${(totalSalary/1e6).toFixed(1)} <span class="text-lg">Tr</span></div><div class="kpi-sub">Tháng này (dự kiến)</div></div>
    </div>

    <div class="grid grid-cols-3 gap-4 mb-4">
      ${['outcome','process','input'].map((layer, idx) => {
        const items = kpi[layer];
        const score = kpiScore(items);
        const titles = { outcome: 'Tầng Outcome (Kết quả)', process: 'Tầng Process (Quy trình)', input: 'Tầng Input (Đầu vào)' };
        const colors = { outcome: 'border-emerald-500', process: 'border-blue-500', input: 'border-amber-500' };
        return `<div class="card ${colors[layer]} border-l-4">
          <div class="card-title">${titles[layer]} — ${score.toFixed(0)}%</div>
          <div class="space-y-3">
            ${items.map(k => {
              const ratio = Math.min(k.actual / k.target, 1.5);
              const pctW = ratio * 100;
              const color = ratio >= 1 ? '#10b981' : ratio >= 0.8 ? '#f59e0b' : '#ef4444';
              return `<div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="font-medium text-slate-700">${k.name}</span>
                  <span class="font-bold">${k.actual}/${k.target} ${k.unit}</span>
                </div>
                <div class="bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div style="width:${Math.min(pctW, 100)}%; background:${color}" class="h-full rounded-full"></div>
                </div>
                <div class="text-xs text-slate-500 mt-1">Trọng số ${k.weight}% · ${(ratio*100).toFixed(0)}% đạt</div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="card">
      <div class="card-title">Công thức tính lương 3P</div>
      <div class="bg-slate-50 p-4 rounded-lg font-mono text-sm">
        <div class="mb-2"><span class="text-blue-700 font-bold">Tổng lương</span> = <span class="text-blue-600">P1</span> + <span class="text-teal-600">P2</span> + (<span class="text-amber-600">P3_base</span> × KPI%)</div>
        <div class="text-slate-600 text-xs">KPI% = Σ (actual_i / target_i × weight_i), capped at 150% mỗi chỉ tiêu</div>
        <div class="mt-3 text-xs text-slate-500">Ví dụ NV Sale: ${(sample.p1/1e6).toFixed(0)} + ${(sample.p2/1e6).toFixed(0)} + (${(sample.p3_base/1e6).toFixed(0)} × ${totalScore.toFixed(0)}%) = ${(totalSalary/1e6).toFixed(1)} Triệu</div>
      </div>
    </div>
  `;
}

// ====================== BÁO CÁO ======================
function renderBaoCao(el) {
  const templates = [
    { name: 'Báo cáo doanh thu tuần', schedule: 'Thứ 2 hàng tuần', recipient: 'CEO, GĐ KD, 5 QLCS', format: 'Excel' },
    { name: 'Báo cáo doanh thu tháng', schedule: '1/đầu tháng', recipient: 'CEO, Chủ đầu tư', format: 'Word + Excel' },
    { name: 'Báo cáo KPI nhân sự tháng', schedule: '5/đầu tháng', recipient: 'GĐ KD, GĐ VP, TP NS', format: 'Excel' },
    { name: 'Báo cáo lương 3P tháng', schedule: '7/đầu tháng', recipient: 'TP Kế toán, TP NS', format: 'Excel' },
    { name: 'Báo cáo quý cho Chủ đầu tư', schedule: '1/đầu quý', recipient: 'Chủ đầu tư', format: 'Word + PDF' },
    { name: 'Báo cáo checklist tuần', schedule: 'Thứ 2 hàng tuần', recipient: 'TP Giám sát, GĐ KD', format: 'Excel' },
  ];
  el.innerHTML = `
    <div class="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl">
      <div class="font-semibold text-slate-800">Module 6 — Báo cáo tự động</div>
      <div class="text-sm text-slate-600 mt-1">Hệ thống tự động xuất báo cáo Word/Excel theo lịch hoặc theo yêu cầu. Anh có thể custom template, gửi email, ký số.</div>
    </div>

    <div class="grid grid-cols-3 gap-4 mb-4">
      <div class="kpi-card border-l-4 border-blue-700"><div class="kpi-label">Báo cáo đã gửi tháng này</div><div class="kpi-value">14</div></div>
      <div class="kpi-card border-l-4 border-emerald-700"><div class="kpi-label">Báo cáo đã lên lịch</div><div class="kpi-value">${templates.length}</div></div>
      <div class="kpi-card border-l-4 border-amber-600"><div class="kpi-label">Template tuỳ biến</div><div class="kpi-value">8</div></div>
    </div>

    <div class="card">
      <div class="card-title flex items-center justify-between"><span>Lịch xuất báo cáo tự động</span>
        <button class="text-xs px-3 py-1 bg-blue-700 text-white rounded-lg">+ Tạo lịch mới</button>
      </div>
      <table class="w-full text-sm">
        <thead class="bg-slate-50">
          <tr><th class="text-left p-2">Tên báo cáo</th><th class="text-left p-2">Lịch</th><th class="text-left p-2">Người nhận</th><th class="text-left p-2">Định dạng</th><th class="text-center p-2">Thao tác</th></tr>
        </thead>
        <tbody>
          ${templates.map(t => `<tr class="border-b">
            <td class="p-2 font-medium">${t.name}</td>
            <td class="p-2 text-slate-600">${t.schedule}</td>
            <td class="p-2 text-slate-600">${t.recipient}</td>
            <td class="p-2"><span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-semibold">${t.format}</span></td>
            <td class="p-2 text-center"><button class="text-blue-700 hover:underline text-xs">Chạy ngay</button> · <button class="text-slate-600 hover:underline text-xs">Sửa</button></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ====================== ĐÀO TẠO (API) ======================
function renderDaoTao(el) {
  const swim = GP_DATA.swimSummary;
  const facNames = { HM:'Hoàng Mai', TK:'Thuỵ Khuê', CTT:'CTT', '24':'24 NCT', TT:'Thanh Trì' };
  // PERMISSION: chỉ thấy học viên thuộc cơ sở/phạm vi của user
  const visibleFacilities = getVisibleFacilities();
  const isAllVisible = canSeeAllFacilities() || isTPChuyenMon();

  // Recompute enrolled/graduated for visible scope only
  const SWIM_IDX = [0, 1, 4, 6]; // HBCB TE, HBCB NL, CLC, Lặn
  let totalEnrolled = 0, totalGraduated = 0;
  visibleFacilities.forEach(f => {
    SWIM_IDX.forEach(i => {
      totalEnrolled += GP_DATA.students.byFacility[f][i] || 0;
      totalGraduated += GP_DATA.students.graduatedYTD[f][i] || 0;
    });
  });
  const totalHandled = totalEnrolled + totalGraduated;
  const completionRate = totalHandled > 0 ? (totalGraduated / totalHandled * 100).toFixed(1) : '0.0';

  // Recompute totals for KPI top
  let totalStudents = 0;
  visibleFacilities.forEach(f => {
    GP_DATA.students.byFacility[f].forEach(v => totalStudents += (v || 0));
  });

  // Recompute per-package for swim summary (only visible facilities)
  const swimPackages = ['HBCB Trẻ em','HBCB Người lớn','CLC','Lặn'];
  const swimByPkg = SWIM_IDX.map(i => {
    let enrolled = 0, graduated = 0;
    visibleFacilities.forEach(f => {
      enrolled += GP_DATA.students.byFacility[f][i] || 0;
      graduated += GP_DATA.students.graduatedYTD[f][i] || 0;
    });
    return { enrolled, graduated, total: enrolled + graduated };
  });

  const scopeLabel = isAllVisible ? 'Toàn cụm 5 cơ sở' : (isQLCS() ? `Cơ sở ${facNames[visibleFacilities[0]]}` : `Cơ sở ${facNames[visibleFacilities[0]] || 'của bạn'}`);

  // Estimate teachers/classes scaled to facility count
  const facCount = visibleFacilities.length;
  const teachers = Math.round(85 * (totalStudents / 5006)) || Math.round(85 * facCount / 5);
  const classes = Math.round(412 * (totalStudents / 5006)) || Math.round(412 * facCount / 5);

  el.innerHTML = `
    <div class="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
      <div class="font-semibold text-slate-800">Module 7 — Quản lý Đào tạo (Tích hợp API)</div>
      <div class="text-sm text-slate-600 mt-1">📍 Phạm vi: <strong>${scopeLabel}</strong> · Dữ liệu lấy real-time từ App quản lý học viên + App giáo viên (chỉ đọc).</div>
      <div class="mt-2 inline-flex items-center gap-2 text-xs bg-white border border-purple-200 px-2 py-1 rounded">
        <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
        <span class="text-slate-600">Đồng bộ API: 5 phút trước</span>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="kpi-card"><div class="kpi-label">Tổng học viên đang học</div><div class="kpi-value">${totalStudents.toLocaleString()}</div><div class="kpi-sub">${isAllVisible ? '7 dịch vụ × 5 cơ sở' : `7 dịch vụ — ${facCount} cơ sở`}</div></div>
      <div class="kpi-card"><div class="kpi-label">Giáo viên</div><div class="kpi-value">~${teachers}</div><div class="kpi-sub">Đang giảng dạy</div></div>
      <div class="kpi-card"><div class="kpi-label">Lớp đang dạy</div><div class="kpi-value">${classes}</div><div class="kpi-sub">Mở mới + đang chạy</div></div>
      <div class="kpi-card"><div class="kpi-label">NPS học viên</div><div class="kpi-value">8.4<span class="text-lg">/10</span></div><div class="kpi-sub">Khảo sát T5</div></div>
    </div>

    <!-- =========== TỔNG KẾT NHÓM HỌC BƠI =========== -->
    <div class="mb-4 p-5 bg-gradient-to-br from-cyan-50 to-blue-50 border-2 border-cyan-300 rounded-xl">
      <div class="flex items-center gap-2 mb-3">
        <div class="text-2xl">🏊</div>
        <div>
          <div class="font-bold text-slate-800 text-base">TỔNG KẾT CÁC GÓI HỌC BƠI (4 gói có khóa học hoàn chỉnh)</div>
          <div class="text-xs text-slate-600">HBCB Trẻ em · HBCB Người lớn · CLC · Lặn — Số tốt nghiệp lũy kế năm 2026 (đến 15/05)</div>
        </div>
      </div>
      <div class="grid grid-cols-4 gap-3 mt-3">
        <div class="bg-white rounded-lg p-3 border border-cyan-200">
          <div class="text-xs text-slate-500 font-semibold uppercase">Tổng tiếp nhận YTD</div>
          <div class="text-2xl font-bold text-slate-800 mt-1">${totalHandled.toLocaleString()}</div>
          <div class="text-xs text-slate-500 mt-0.5">= đang học + đã TN</div>
        </div>
        <div class="bg-white rounded-lg p-3 border border-cyan-200">
          <div class="text-xs text-slate-500 font-semibold uppercase">Đang học</div>
          <div class="text-2xl font-bold text-blue-700 mt-1">${totalEnrolled.toLocaleString()}</div>
          <div class="text-xs text-slate-500 mt-0.5">${(totalEnrolled/totalHandled*100).toFixed(1)}% còn trong khóa</div>
        </div>
        <div class="bg-white rounded-lg p-3 border border-emerald-200">
          <div class="text-xs text-slate-500 font-semibold uppercase">Đã tốt nghiệp</div>
          <div class="text-2xl font-bold text-emerald-700 mt-1">${totalGraduated.toLocaleString()}</div>
          <div class="text-xs text-slate-500 mt-0.5">YTD năm 2026</div>
        </div>
        <div class="bg-white rounded-lg p-3 border border-amber-200">
          <div class="text-xs text-slate-500 font-semibold uppercase">Tỷ lệ tốt nghiệp</div>
          <div class="text-2xl font-bold text-amber-700 mt-1">${completionRate}<span class="text-base">%</span></div>
          <div class="text-xs text-slate-500 mt-0.5">Trên tổng tiếp nhận</div>
        </div>
      </div>

      <!-- Per-package breakdown -->
      <div class="grid grid-cols-4 gap-3 mt-3">
        ${swimPackages.map((name, i) => {
          const e = swimByPkg[i].enrolled;
          const g = swimByPkg[i].graduated;
          const t = swimByPkg[i].total;
          const rate = t > 0 ? (g / t * 100).toFixed(1) : '0.0';
          return `<div class="bg-white rounded-lg p-3 border border-slate-200">
            <div class="text-xs font-semibold text-slate-700 mb-2">${name}</div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-500">Đang học</span>
              <span class="font-bold text-blue-700">${e.toLocaleString()}</span>
            </div>
            <div class="flex justify-between text-xs mb-1">
              <span class="text-slate-500">Đã TN YTD</span>
              <span class="font-bold text-emerald-700">${g.toLocaleString()}</span>
            </div>
            <div class="mt-2 pt-2 border-t flex justify-between text-xs">
              <span class="text-slate-500">Tỷ lệ TN</span>
              <span class="font-bold text-amber-700">${rate}%</span>
            </div>
            <div class="bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div style="width:${rate}%" class="h-full bg-gradient-to-r from-emerald-500 to-emerald-600"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- =========== BẢNG CHI TIẾT (chỉ hiện cơ sở user có quyền) =========== -->
    <div class="card mb-4">
      <div class="card-title">Học viên đang học theo dịch vụ ${isAllVisible ? '× cơ sở' : `tại ${facNames[visibleFacilities[0]]}`}</div>
      <table class="w-full text-sm">
        <thead class="bg-slate-100">
          <tr>
            <th class="text-left p-2">Dịch vụ</th>
            ${visibleFacilities.map(f => `<th class="text-center p-2">${f}</th>`).join('')}
            <th class="text-center p-2 bg-slate-200">${isAllVisible ? 'Đang học toàn cụm' : 'Đang học'}</th>
            <th class="text-center p-2 bg-emerald-100">TN YTD</th>
            <th class="text-center p-2 bg-amber-100">Tỷ lệ TN</th>
          </tr>
        </thead>
        <tbody>
          ${GP_DATA.students.services.map((s, i) => {
            const enrolled = visibleFacilities.reduce((a,f) => a + (GP_DATA.students.byFacility[f][i] || 0), 0);
            const graduated = visibleFacilities.reduce((a,f) => a + (GP_DATA.students.graduatedYTD[f][i] || 0), 0);
            const hasGrad = GP_DATA.students.hasGraduation[i] && graduated > 0;
            const rate = hasGrad ? (graduated / (enrolled + graduated) * 100).toFixed(1) + '%' : '—';
            return `<tr class="border-b hover:bg-slate-50">
              <td class="p-2 font-medium ${hasGrad ? 'text-blue-900' : 'text-slate-700'}">${s}${hasGrad ? ' <span class="text-xs text-emerald-600">●</span>' : ''}</td>
              ${visibleFacilities.map(f => `<td class="p-2 text-center">${GP_DATA.students.byFacility[f][i] || '—'}</td>`).join('')}
              <td class="p-2 text-center font-bold bg-slate-50">${enrolled.toLocaleString()}</td>
              <td class="p-2 text-center bg-emerald-50 ${hasGrad ? 'font-bold text-emerald-700' : 'text-slate-400'}">${hasGrad ? graduated.toLocaleString() : '—'}</td>
              <td class="p-2 text-center bg-amber-50 ${hasGrad ? 'font-bold text-amber-700' : 'text-slate-400'}">${rate}</td>
            </tr>`;
          }).join('')}
          <tr class="bg-amber-50 font-bold">
            <td class="p-2">Tổng cộng</td>
            ${visibleFacilities.map(f => `<td class="p-2 text-center">${GP_DATA.students.byFacility[f].reduce((a,b) => a+b, 0)}</td>`).join('')}
            <td class="p-2 text-center">${totalStudents.toLocaleString()}</td>
            <td class="p-2 text-center text-emerald-700">${visibleFacilities.reduce((a,f) => a + GP_DATA.students.graduatedYTD[f].reduce((b,v) => b + (v||0), 0), 0).toLocaleString()}</td>
            <td class="p-2 text-center text-amber-700">${completionRate}%</td>
          </tr>
        </tbody>
      </table>
      <div class="mt-3 text-xs text-slate-500 flex items-center gap-3">
        <span><span class="text-emerald-600">●</span> = Gói có khóa học hoàn chỉnh (có khái niệm tốt nghiệp)</span>
        <span class="text-slate-400">— = Gói tích lượt/PT (không có "tốt nghiệp" cụ thể)</span>
      </div>
    </div>

    <!-- =========== BIỂU ĐỒ (chỉ hiện cơ sở user có quyền) =========== -->
    <div class="grid grid-cols-2 gap-4">
      <div class="card">
        <div class="card-title">Học viên tốt nghiệp YTD ${isAllVisible ? 'theo cơ sở' : ''}</div>
        <div style="height: 280px"><canvas id="chartGradByFac"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Funnel học bơi — Tổng tiếp nhận → Tốt nghiệp</div>
        <div style="height: 280px"><canvas id="chartFunnel"></canvas></div>
      </div>
    </div>
  `;

  // Chart: graduates by facility (chỉ hiện cơ sở visible)
  const gradServices = GP_DATA.students.services.map((s, i) => GP_DATA.students.hasGraduation[i] ? s : null).filter(Boolean);
  const gradColors = { 'HBCB Trẻ em': '#1F3A5F', 'HBCB Người lớn': '#2E8B8B', 'CLC': '#C9A227', 'Lặn': '#7B6CDB' };
  const datasets = gradServices.map(s => {
    const idx = GP_DATA.students.services.indexOf(s);
    return {
      label: s,
      data: visibleFacilities.map(f => GP_DATA.students.graduatedYTD[f][idx] || 0),
      backgroundColor: gradColors[s] || '#999',
      borderRadius: 3
    };
  });

  chartInstances.gradByFac = new Chart(document.getElementById('chartGradByFac'), {
    type: 'bar',
    data: { labels: visibleFacilities.map(f => facNames[f]), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true } }
    }
  });

  // Funnel chart — dùng số đã filter theo visibleFacilities
  chartInstances.funnel = new Chart(document.getElementById('chartFunnel'), {
    type: 'bar',
    data: {
      labels: swimPackages,
      datasets: [
        { label: 'Đang học', data: swimByPkg.map(s => s.enrolled), backgroundColor: '#1F3A5F', borderRadius: 4 },
        { label: 'Đã tốt nghiệp YTD', data: swimByPkg.map(s => s.graduated), backgroundColor: '#2D6A4F', borderRadius: 4 }
      ]
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
      scales: { x: { grid: { color: '#f0f2f5' } }, y: { grid: { display: false } } }
    }
  });
}

// ====================== MKT (API) ======================
function renderMKT(el) {
  const facNames = { HM:'Hoàng Mai', TK:'Thuỵ Khuê', CTT:'CTT', '24':'24 NCT', TT:'Thanh Trì' };
  const visibleFacs = getVisibleFacilities();
  const isAllScope = canSeeAllFacilities() || isTPChuyenMon();
  const scopeLabel = isAllScope ? 'Toàn cụm 5 cơ sở' : (isQLCS() ? `Cơ sở ${facNames[visibleFacs[0]]}` : 'Phạm vi của bạn');

  // Tính tổng leads + chốt theo phạm vi user
  let totalLeads = 0, totalChot = 0;
  visibleFacs.forEach(f => {
    const data = GP_DATA.sources.byFacility[f];
    if (data) {
      totalLeads += data.leads;
      totalChot += data.chot;
    }
  });
  const convRate = totalLeads > 0 ? (totalChot / totalLeads * 100).toFixed(1) : 0;

  // Mock estimate cho campaigns / cost / CPL theo phạm vi
  const facCount = visibleFacs.length;
  const campaigns = Math.max(2, Math.round(12 * facCount / 5));
  const adsCost = Math.round(85 * facCount / 5);
  const cpl = totalLeads > 0 ? Math.round(adsCost * 1_000_000 / totalLeads / 1000) : 26;

  // Nếu QLCS: dữ liệu chỉ của CS mình (per-source breakdown chỉ có ở HM trong mock data hiện tại)
  // Với QLCS không phải HM, hiển thị tổng leads/chốt của CS mình + estimate per-source
  let sourcesData;
  if (isAllScope) {
    sourcesData = GP_DATA.sources.cluster;
  } else if (isQLCS()) {
    const facId = visibleFacs[0];
    // Mock per-source cho từng CS (dùng tổng leads/chốt CS chia theo tỷ trọng tương đối)
    const facData = GP_DATA.sources.byFacility[facId];
    if (facId === 'HM') {
      sourcesData = GP_DATA.sources.cluster.map(s => ({...s})); // Dùng cluster level vì HM có sẵn breakdown
      // Tỷ lệ HM trong cluster
      const ratio = facData.leads / GP_DATA.sources.cluster.reduce((a,s) => a+s.leads, 0);
      sourcesData = sourcesData.map(s => ({
        name: s.name,
        leads: Math.round(s.leads * ratio),
        chot: Math.round(s.chot * ratio),
        rate: s.rate,
      }));
    } else {
      // Mock theo tỷ lệ
      const totalClusterLeads = GP_DATA.sources.cluster.reduce((a,s) => a+s.leads, 0);
      const totalClusterChot = GP_DATA.sources.cluster.reduce((a,s) => a+s.chot, 0);
      sourcesData = GP_DATA.sources.cluster.map(s => ({
        name: s.name,
        leads: Math.round(s.leads * facData.leads / totalClusterLeads),
        chot: Math.round(s.chot * facData.chot / totalClusterChot),
        rate: s.rate,
      }));
    }
  } else {
    sourcesData = GP_DATA.sources.cluster;
  }

  el.innerHTML = `
    <div class="mb-4 p-4 bg-pink-50 border border-pink-200 rounded-xl">
      <div class="font-semibold text-slate-800">Module 8 — Quản lý Marketing (Tích hợp API)</div>
      <div class="text-sm text-slate-600 mt-1">📍 Phạm vi: <strong>${scopeLabel}</strong> · Dữ liệu lấy từ App MKT + CRM. Phòng MKT vận hành campaign trên tool gốc.</div>
      <div class="mt-2 inline-flex items-center gap-2 text-xs bg-white border border-pink-200 px-2 py-1 rounded">
        <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
        <span class="text-slate-600">Đồng bộ API: 5 phút trước</span>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-4">
      <div class="kpi-card"><div class="kpi-label">Tổng Leads</div><div class="kpi-value">${totalLeads.toLocaleString()}</div><div class="kpi-sub">${isAllScope ? '5 cơ sở' : facNames[visibleFacs[0]] || ''}</div></div>
      <div class="kpi-card"><div class="kpi-label">Tỷ lệ chốt</div><div class="kpi-value">${convRate}<span class="text-lg">%</span></div><div class="kpi-sub">${totalChot.toLocaleString()} chốt từ ${totalLeads.toLocaleString()}</div></div>
      <div class="kpi-card"><div class="kpi-label">Chiến dịch chạy</div><div class="kpi-value">${campaigns}</div><div class="kpi-sub">Ads + organic</div></div>
      <div class="kpi-card"><div class="kpi-label">CPL TB</div><div class="kpi-value">${cpl} <span class="text-lg">K</span></div><div class="kpi-sub">Chi phí ~${adsCost} Tr/tháng</div></div>
    </div>

    <div class="card">
      <div class="card-title">Nguồn leads ${isAllScope ? '— Toàn cụm' : `tại ${facNames[visibleFacs[0]]}`}</div>
      <div style="height: 320px"><canvas id="chartSources"></canvas></div>
    </div>
  `;

  chartInstances.sources = new Chart(document.getElementById('chartSources'), {
    type: 'bar',
    data: {
      labels: sourcesData.map(s => s.name),
      datasets: [
        { label: 'Tổng Leads', data: sourcesData.map(s => s.leads), backgroundColor: '#1F3A5F80', borderRadius: 4 },
        { label: 'Đã chốt',   data: sourcesData.map(s => s.chot),   backgroundColor: '#C9A227',   borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' }, tooltip: { backgroundColor: '#1F3A5F' } },
      scales: { y: { beginAtZero: true, grid: { color: '#f0f2f5' } }, x: { grid: { display: false } } }
    }
  });
}

// ====================== QUẢN LÝ GÓI DỊCH VỤ ======================
let editingGroups = null;  // working copy in memory

function renderSettingsPackages(el) {
  // Deep clone current data into editing buffer
  if (!editingGroups) {
    editingGroups = JSON.parse(JSON.stringify(getActivePackages()));
  }

  // PERMISSION: chỉ hiện cột cơ sở user có quyền quản lý
  // - CEO/GĐ: tất cả 5 CS
  // - QLCS: chỉ cơ sở mình
  // - Khác: chỉ xem (không nên truy cập trang này, nhưng demo cho phép xem)
  const ALL_FACS = ['HM','TK','CTT','24','TT'];
  const FACS = canSeeAllFacilities() ? ALL_FACS : getVisibleFacilities();
  const editableFacs = canSeeAllFacilities() ? ALL_FACS : (isQLCS() ? [currentUser.roleData.scope] : []);
  const isReadOnly = editableFacs.length === 0;
  const facNames = { HM:'Hoàng Mai', TK:'Thuỵ Khuê', CTT:'CTT', '24':'24 NCT', TT:'Thanh Trì' };
  const iconOptions = ['💳','🏊','🎫','🏫','🎟️','🛍️','💪','🏋️','🏆','⛹️','📚','🎯','💎','🌟','🔥','✨','🎨','🎭','🎪'];
  const colorOptions = ['#1F3A5F','#2E8B8B','#C9A227','#7B6CDB','#5B9BD5','#E07A5F','#B23A48','#2D6A4F','#0E7490','#9333EA','#DC2626','#16A34A'];

  // Compute totals
  const totals = { HM:0, TK:0, CTT:0, '24':0, TT:0 };
  editingGroups.forEach(g => g.packages.forEach(p => FACS.forEach(f => totals[f] += (p[f] || 0))));
  const grand = FACS.reduce((a,f) => a + totals[f], 0);

  const isModified = JSON.stringify(editingGroups) !== JSON.stringify(getActivePackages());

  const scopeLabel = canSeeAllFacilities() ? 'Toàn bộ 5 cơ sở' : (isQLCS() ? `Chỉ cột ${facNames[editableFacs[0]]} (cơ sở của bạn)` : 'Chế độ xem');
  el.innerHTML = `
    <div class="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
      <div>
        <div class="font-semibold text-slate-800">⚙️ Quản lý cấu trúc gói dịch vụ</div>
        <div class="text-sm text-slate-600 mt-1">📍 Phạm vi sửa: <strong>${scopeLabel}</strong>${isQLCS() ? '. Cột cơ sở khác chỉ xem.' : ''}</div>
      </div>
      <div class="flex items-center gap-2">
        ${isModified ? '<span class="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">● Có thay đổi chưa lưu</span>' : ''}
        <button onclick="settingsCancel()" class="px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300">Hủy</button>
        ${!isReadOnly ? `<button onclick="settingsSave()" class="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800">💾 Lưu thay đổi</button>` : ''}
      </div>
    </div>

    <!-- Summary -->
    <div class="grid grid-cols-4 gap-3 mb-4">
      <div class="kpi-card border-l-4 border-blue-700"><div class="kpi-label">Tổng nhóm</div><div class="kpi-value">${editingGroups.length}</div></div>
      <div class="kpi-card border-l-4 border-emerald-700"><div class="kpi-label">Tổng gói</div><div class="kpi-value">${editingGroups.reduce((a,g) => a+g.packages.length, 0)}</div></div>
      <div class="kpi-card border-l-4 border-amber-600"><div class="kpi-label">Tổng doanh thu</div><div class="kpi-value">${(grand/1000).toFixed(2)} <span class="text-base">Tỷ</span></div></div>
      <div class="kpi-card border-l-4 border-rose-700"><div class="kpi-label">Nhóm độc quyền</div><div class="kpi-value">${editingGroups.filter(g => g.exclusive).length}</div><div class="kpi-sub">Chỉ tại 1 cơ sở</div></div>
    </div>

    <!-- Add new group button (chỉ CEO/GĐ) -->
    ${canSeeAllFacilities() ? `<div class="mb-4">
      <button onclick="settingsAddGroup()" class="w-full p-3 border-2 border-dashed border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 font-medium text-sm">
        + Thêm nhóm dịch vụ mới
      </button>
    </div>` : ''}

    <!-- Groups -->
    <div class="space-y-4">
      ${editingGroups.map((g, gIdx) => renderGroupEditor(g, gIdx, FACS, editableFacs, facNames, iconOptions, colorOptions, isReadOnly)).join('')}
    </div>

    <!-- Reset to default -->
    <div class="mt-6 p-4 bg-slate-100 rounded-lg flex items-center justify-between">
      <div class="text-sm text-slate-600">Muốn quay về dữ liệu gốc?</div>
      <button onclick="settingsResetDefault()" class="px-3 py-1.5 text-sm text-rose-700 border border-rose-300 rounded hover:bg-rose-50">↻ Khôi phục dữ liệu mặc định</button>
    </div>
  `;
}

function renderGroupEditor(g, gIdx, FACS, editableFacs, facNames, iconOptions, colorOptions, isReadOnly) {
  const groupSum = g.packages.reduce((a, p) => a + FACS.reduce((b,f) => b + (p[f]||0), 0), 0);
  const canEditGroupMeta = !isReadOnly && (editableFacs.length === 5); // Chỉ CEO/GĐ sửa được meta nhóm
  return `
    <div class="card" style="border-left: 4px solid ${g.color}">
      <!-- Group header -->
      <div class="flex items-start gap-3 mb-3">
        <div class="text-3xl flex-shrink-0">
          ${canEditGroupMeta ? `<select onchange="settingsUpdateGroup(${gIdx}, 'icon', this.value)" class="text-3xl bg-transparent cursor-pointer border-none focus:outline-none">
            ${iconOptions.map(ic => `<option value="${ic}" ${ic === g.icon ? 'selected' : ''}>${ic}</option>`).join('')}
          </select>` : `<span>${g.icon}</span>`}
        </div>
        <div class="flex-1">
          ${canEditGroupMeta ? `<input type="text" value="${g.name}" onblur="settingsUpdateGroup(${gIdx}, 'name', this.value)"
                 class="w-full font-bold text-base border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none bg-transparent">
          <input type="text" value="${g.description || ''}" placeholder="Mô tả nhóm..." onblur="settingsUpdateGroup(${gIdx}, 'description', this.value)"
                 class="w-full text-xs text-slate-500 border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent mt-1">` : `<div class="font-bold text-base">${g.name}</div>
          <div class="text-xs text-slate-500">${g.description || ''}</div>`}
        </div>
        ${canEditGroupMeta ? `<div class="flex items-center gap-2 flex-shrink-0">
          <label class="text-xs text-slate-500">Màu:</label>
          <select onchange="settingsUpdateGroup(${gIdx}, 'color', this.value)" class="text-xs border border-slate-300 rounded px-1 py-1">
            ${colorOptions.map(c => `<option value="${c}" ${c === g.color ? 'selected' : ''} style="background:${c}; color:white">${c}</option>`).join('')}
          </select>
          <label class="text-xs text-slate-500 ml-2">Độc quyền:</label>
          <select onchange="settingsUpdateGroup(${gIdx}, 'exclusive', this.value || null)" class="text-xs border border-slate-300 rounded px-1 py-1">
            <option value="" ${!g.exclusive ? 'selected' : ''}>Không</option>
            ${FACS.map(f => `<option value="${f}" ${g.exclusive === f ? 'selected' : ''}>${facNames[f]}</option>`).join('')}
          </select>
          <button onclick="settingsDeleteGroup(${gIdx})" class="text-rose-600 hover:bg-rose-50 p-1.5 rounded text-sm" title="Xóa nhóm">🗑️</button>
        </div>` : ''}
      </div>

      <!-- Group total -->
      <div class="mb-3 p-2 rounded text-sm flex justify-between" style="background:${g.color}15">
        <span class="font-semibold" style="color:${g.color}">Tổng nhóm: ${groupSum.toLocaleString()} Triệu (${g.packages.length} gói)</span>
        ${g.exclusive ? `<span class="text-xs font-bold text-rose-700">⚠️ CHỈ TẠI ${facNames[g.exclusive].toUpperCase()}</span>` : ''}
      </div>

      <!-- Packages table -->
      <table class="w-full text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="text-left p-1.5 w-1/3">Tên gói</th>
            ${FACS.map(f => `<th class="text-right p-1.5 w-20">${facNames[f]}</th>`).join('')}
            <th class="text-right p-1.5 w-20">Tổng</th>
            <th class="w-10"></th>
          </tr>
        </thead>
        <tbody>
          ${g.packages.map((p, pIdx) => {
            const pkgSum = FACS.reduce((a,f) => a + (p[f]||0), 0);
            return `<tr class="border-b border-slate-100 hover:bg-slate-50">
              <td class="p-1">
                ${canEditGroupMeta ? `<input type="text" value="${p.name}" onblur="settingsUpdatePackage(${gIdx}, ${pIdx}, 'name', this.value)"
                       class="w-full px-2 py-1 border border-transparent rounded hover:border-slate-200 focus:border-blue-400 focus:outline-none">`
                  : `<span class="px-2 py-1 text-slate-700">${p.name}</span>`}
              </td>
              ${FACS.map(f => {
                const isFacExclusiveMismatch = g.exclusive && g.exclusive !== f;
                const canEditCell = !isReadOnly && !isFacExclusiveMismatch && editableFacs.includes(f);
                return `<td class="p-1">
                  <input type="number" min="0" value="${p[f] || 0}" ${canEditCell ? `onblur="settingsUpdatePackage(${gIdx}, ${pIdx}, '${f}', parseInt(this.value)||0)"` : 'disabled'}
                         ${!canEditCell ? 'style="background:#f1f5f9;color:#64748b;cursor:not-allowed"' : ''}
                         class="w-full px-2 py-1 text-right border border-transparent rounded hover:border-slate-200 focus:border-blue-400 focus:outline-none"
                         title="${canEditCell ? '' : (isFacExclusiveMismatch ? 'Cơ sở này không có gói này' : 'Bạn không có quyền sửa cột này')}">
                </td>`;
              }).join('')}
              <td class="p-1 text-right font-semibold">${pkgSum.toLocaleString()}</td>
              <td class="p-1 text-center">
                ${canEditGroupMeta ? `<button onclick="settingsDeletePackage(${gIdx}, ${pIdx})" class="text-rose-500 hover:bg-rose-50 p-1 rounded text-xs" title="Xóa">✕</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      ${canEditGroupMeta ? `<button onclick="settingsAddPackage(${gIdx})" class="mt-2 w-full py-1.5 border border-dashed border-slate-300 text-slate-600 text-xs rounded hover:bg-slate-50">
        + Thêm gói trong nhóm này
      </button>` : ''}
    </div>
  `;
}

// ===== Settings actions =====
function settingsUpdateGroup(gIdx, field, value) {
  editingGroups[gIdx][field] = value;
  if (field === 'icon' || field === 'color' || field === 'exclusive') navigate('settings-packages');
}

function settingsUpdatePackage(gIdx, pIdx, field, value) {
  editingGroups[gIdx].packages[pIdx][field] = value;
  // Re-render the affected group total
  navigate('settings-packages');
}

function settingsAddGroup() {
  const name = prompt('Tên nhóm mới:');
  if (!name) return;
  editingGroups.push({
    id: 'custom_' + Date.now(),
    name, icon: '✨', color: '#5B9BD5', description: '', packages: []
  });
  navigate('settings-packages');
}

function settingsDeleteGroup(gIdx) {
  if (!confirm(`Xóa nhóm "${editingGroups[gIdx].name}" và ${editingGroups[gIdx].packages.length} gói bên trong?`)) return;
  editingGroups.splice(gIdx, 1);
  navigate('settings-packages');
}

function settingsAddPackage(gIdx) {
  const name = prompt('Tên gói mới:');
  if (!name) return;
  editingGroups[gIdx].packages.push({ name, HM: 0, TK: 0, CTT: 0, '24': 0, TT: 0 });
  navigate('settings-packages');
}

function settingsDeletePackage(gIdx, pIdx) {
  if (!confirm(`Xóa gói "${editingGroups[gIdx].packages[pIdx].name}"?`)) return;
  editingGroups[gIdx].packages.splice(pIdx, 1);
  navigate('settings-packages');
}

function settingsSave() {
  if (savePackagesToStorage(editingGroups)) {
    alert('✓ Đã lưu thay đổi thành công.\n\nTrang Doanh số sẽ hiển thị dữ liệu mới ngay.');
    navigate('doanh-so');
  } else {
    alert('⚠️ Lưu thất bại. Có thể trình duyệt đã đầy bộ nhớ.');
  }
}

function settingsCancel() {
  if (!confirm('Hủy tất cả thay đổi chưa lưu?')) return;
  editingGroups = null;
  navigate('doanh-so');
}

function settingsResetDefault() {
  if (!confirm('Khôi phục về dữ liệu gốc? Mọi tùy chỉnh sẽ bị mất.')) return;
  resetPackagesToDefault();
  editingGroups = null;
  navigate('settings-packages');
}
