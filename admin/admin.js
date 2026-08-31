/**
 * Enterprise Admin Panel Management Engine
 * Telega.ads Platform Architecture
 */

const API_BASE = window.location.protocol.startsWith('file') 
  ? 'http://localhost:3000' 
  : window.location.origin;

let authToken = localStorage.getItem('authToken') || localStorage.getItem('user_token');
let isUserAdmin = false;
const tg = window.Telegram?.WebApp;

// ==================================================
// 1. استخراج آيدي المستخدم من Telegram أو URL أو LocalStorage
// ==================================================
function getTargetUserId() {
  // أ) من Telegram Mini App
  const tgUserId = tg?.initDataUnsafe?.user?.id;
  if (tgUserId) return Number(tgUserId);

  // ب) من معلمات الـ URL (للتجربة عبر المتصفح)
  const urlParams = new URLSearchParams(window.location.search);
  const urlAdminId = urlParams.get('userId') || urlParams.get('admin_id') || urlParams.get('telegram_id');
  if (urlAdminId) return Number(urlAdminId);

  // ج) من LocalStorage كملاذ أخير
  const localId = localStorage.getItem("user_id") || localStorage.getItem("telegram_id");
  if (localId) return Number(localId);

  return null;
}

const currentTgUserId = getTargetUserId();

// ==================================================
// 2. الفحص المباشر للصلاحيات عند فتح الصفحة
// ==================================================
document.addEventListener("DOMContentLoaded", async () => {
  if (tg) {
    tg.ready();
    tg.expand();
  }

  showLoadingState();

  const userId = getTargetUserId();
  console.log("🔍 [Client Log] Detected userId:", userId);

  if (!userId) {
    console.error("❌ [Client Log] Could not find any userId!");
    showForbiddenView("لم يتم العثور على ID للمستخدم. يرجى فتح الصفحة من تليجرام أو إضافة ?userId=YOUR_ID للرابط.", null);
    return;
  }

  try {
    // إرسال الطلب المباشر لـ /api/admin/verify
    const res = await fetch(`${API_BASE}/api/admin/verify`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-telegram-id': String(userId)
      },
      body: JSON.stringify({ userId: userId, telegramId: userId })
    });

    let data;
    if (!res.ok && res.status !== 403 && res.status !== 401) {
      // تجربة البديل POST /api/admin/check في حال لم يعالج السيرفر endpoint الأول
      const fallbackRes = await fetch(`${API_BASE}/api/admin/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId })
      });
      data = await fallbackRes.json();
    } else {
      data = await res.json();
    }

    console.log("📩 [Client Log] Server Response:", data);

    // التحقق من الاستجابة (دعم authorized أو isAdmin)
    if (data && (data.authorized === true || data.isAdmin === true)) {
      console.log("✅ Access Granted!");
      isUserAdmin = true;
      showAdminView();
      loadAdminData();
    } else {
      console.warn("⛔ Access Denied!");
      const reasonMsg = data?.message || data?.error || "عذراً، هذا الحساب غير مصرح له بالدخول إلى لوحة التحكم.";
      showForbiddenView(reasonMsg, userId);
    }
  } catch (err) {
    console.error("💥 [Client Log] Fetch Verification Error:", err);
    showForbiddenView("حدث خطأ في الاتصال بالسيرفر للتحقق من الصلاحيات.", userId);
  }
});

// ==================================================
// 3. دالّة المساعدة والأمان
// ==================================================
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function triggerHaptic(style = 'light') {
  try {
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1') && tg.HapticFeedback) {
      tg.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {}
}

function showToast(msg) {
  triggerHaptic('medium');
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 3000);
}

function setButtonLoading(btnId, isLoading, originalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (isLoading) {
    btn.disabled = true;
    btn.dataset.oldContent = btn.innerHTML;
    btn.innerHTML = `<div class="spinner"></div>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = originalText || btn.dataset.oldContent || '';
  }
}

async function safeFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  
  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }
  
  if (tg?.initData) {
    options.headers['x-telegram-init-data'] = tg.initData;
  }
  if (currentTgUserId && !isNaN(currentTgUserId)) {
    options.headers['x-telegram-id'] = String(currentTgUserId);
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const targetUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${cleanEndpoint}`;

  try {
    const response = await fetch(targetUrl, options);
    
    if (response.status === 403 || response.status === 401) {
      showForbiddenView("جلسة غير مصرح بها.", currentTgUserId);
      return null;
    }

    return response;
  } catch (err) {
    console.error("Fetch Network Error:", err);
    showToast("Network error. Please try again.");
    return null;
  }
}

// ==================================================
// 4. التحكم بحالات العرض (Views Handler)
// ==================================================
function showLoadingState() {
  const loadingView = document.getElementById('loading') || document.getElementById('admin-loading');
  const adminContent = document.getElementById('admin-dashboard') || document.getElementById('admin-content');
  const forbiddenView = document.getElementById('access-denied') || document.getElementById('admin-forbidden');

  if (loadingView) loadingView.style.display = 'block';
  if (adminContent) adminContent.style.display = 'none';
  if (forbiddenView) forbiddenView.style.display = 'none';
}

function showAdminView() {
  const loadingView = document.getElementById('loading') || document.getElementById('admin-loading');
  const adminContent = document.getElementById('admin-dashboard') || document.getElementById('admin-content');
  const forbiddenView = document.getElementById('access-denied') || document.getElementById('admin-forbidden');

  if (loadingView) loadingView.style.display = 'none';
  if (forbiddenView) forbiddenView.style.display = 'none';
  if (adminContent) adminContent.style.display = 'block';
}

function showForbiddenView(customMessage, userId = null) {
  isUserAdmin = false;
  const loadingView = document.getElementById('loading') || document.getElementById('admin-loading');
  const adminContent = document.getElementById('admin-dashboard') || document.getElementById('admin-content');
  const forbiddenView = document.getElementById('access-denied') || document.getElementById('admin-forbidden');
  const errorMsgEl = document.getElementById('admin-error-message');
  const debugUserIdEl = document.getElementById('debug-user-id');

  if (loadingView) loadingView.style.display = 'none';
  if (adminContent) adminContent.style.display = 'none';
  if (forbiddenView) forbiddenView.style.display = 'block';

  if (errorMsgEl && customMessage) {
    errorMsgEl.innerText = customMessage;
  }

  if (debugUserIdEl) {
    if (userId) {
      debugUserIdEl.innerText = `الآيدي الخاص بك هو (${userId}) وهو غير مدرج في قائمة المديرين.`;
      debugUserIdEl.style.display = 'block';
    } else {
      debugUserIdEl.innerText = customMessage || "لم يتم العثور على آيدي المستخدم.";
      debugUserIdEl.style.display = 'block';
    }
  }
}

// ==================================================
// 5. جلب بيانات اللوحة والعمليات
// ==================================================
async function loadAdminData() {
  if (!isUserAdmin) return;
  try {
    const res = await safeFetch('/api/admin/dashboard-data');
    if (!res) return;
    const data = await res.json();
    if (data.error) return showToast(data.error);

    if (document.getElementById('admin-total-users')) {
      document.getElementById('admin-total-users').innerText = data.stats?.totalUsers || 0;
    }
    if (document.getElementById('admin-total-pending')) {
      document.getElementById('admin-total-pending').innerText = `$${(data.stats?.totalPending || 0).toFixed(2)}`;
    }

    // قائمة طلبات الإيداع
    const dList = document.getElementById('admin-deposits-list');
    if (dList) {
      if (!data.deposits || data.deposits.length === 0) {
        dList.innerHTML = '<div style="color:var(--text-muted); padding:10px;">لا يوجد طلبات إيداع معلقة.</div>';
      } else {
        dList.innerHTML = data.deposits.map(d => `
          <div style="background:#0d1527; padding:10px; margin-bottom:8px; border-radius:6px; border: 1px solid var(--border-color, #1e293b);">
            المستخدم: <b>${escapeHTML(d.advertiserId?.username || d.advertiserId?.telegramId || 'غير معروف')}</b><br>
            المبلغ: <b style="color:var(--success, #10b981);">$${parseFloat(d.amount || 0).toFixed(2)}</b> | الشبكة: <code>${escapeHTML(d.network || d.paymentMethod || 'N/A')}</code><br>
            معرف العملية (TxID): <code style="color: var(--warning, #f59e0b); word-break: break-all;">${escapeHTML(d.txid || d.txHash || 'N/A')}</code><br>
            <div style="margin-top: 8px; display: flex; gap: 6px;">
              <button class="btn-small btn-success" style="flex:1;" onclick="handleAdminDeposit('${d._id}', 'approved')">موافقة</button>
              <button class="btn-small btn-danger" style="flex:1;" onclick="handleAdminDeposit('${d._id}', 'rejected')">رفض</button>
            </div>
          </div>
        `).join('');
      }
    }

    // قائمة طلبات السحب
    const wList = document.getElementById('admin-withdraws-list');
    if (wList) {
      if (!data.withdraws || data.withdraws.length === 0) {
        wList.innerHTML = '<div style="color:var(--text-muted); padding:10px;">لا يوجد طلبات سحب معلقة.</div>';
      } else {
        wList.innerHTML = data.withdraws.map(w => `
          <div style="background:#0d1527; padding:10px; margin-bottom:8px; border-radius:6px; border: 1px solid var(--border-color, #1e293b);">
            المستخدم: <b>${escapeHTML(w.userId?.username || w.userId?.telegramId || 'غير معروف')}</b><br>
            المبلغ الكلي: <b style="color:var(--success, #10b981);">$${parseFloat(w.amount || 0).toFixed(2)}</b> | الصافي: <b>$${parseFloat(w.netAmount || 0).toFixed(2)}</b><br>
            المحفظة: <code style="word-break: break-all;">${escapeHTML(w.walletAddress)}</code><br>
            <div style="margin-top: 8px; display: flex; gap: 6px;">
              <button class="btn-small btn-success" style="flex:1;" onclick="handleAdminWithdraw('${w._id}', 'approved')">موافقة</button>
              <button class="btn-small btn-danger" style="flex:1;" onclick="handleAdminWithdraw('${w._id}', 'rejected')">رفض</button>
            </div>
          </div>
        `).join('');
      }
    }

    // قائمة المستخدمين
    const uList = document.getElementById('admin-users-list');
    if (uList) {
      if (!data.users || data.users.length === 0) {
        uList.innerHTML = '<div style="color:var(--text-muted); padding:10px;">لا يوجد مستخدمين.</div>';
      } else {
        uList.innerHTML = data.users.map(u => `
          <div style="background:#0d1527; padding:10px; margin-bottom:8px; border-radius:6px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${u.isBanned ? 'var(--danger, #ef4444)' : 'var(--success, #10b981)'};">
            <div>
              <b>${escapeHTML(u.username || 'بدون اسم')}</b> (<code>${escapeHTML(String(u.telegramId || ''))}</code>)<br>
              <span style="color: var(--text-muted, #94a3b8); font-size: 0.85rem;">المتاح: $${(u.availableBalance || 0).toFixed(2)} | المعلق: $${(u.pendingBalance || 0).toFixed(2)}</span>
            </div>
            <button class="btn-small ${u.isBanned ? 'btn-warning' : 'btn-danger'}" onclick="toggleUserBan('${u._id}')">
              ${u.isBanned ? 'إلغاء الحظر' : 'حظر'}
            </button>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    showToast("فشل تحميل بيانات لوحة التحكم");
  }
}

async function handleAdminDeposit(depositId, action) {
  let reason = '';
  if (action === 'rejected') {
    reason = prompt("سبب الرفض (سيظهر للمستخدم):");
    if (reason === null) return;
  }

  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/deposit/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositId, action, reason })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast("تم تحديث حالة طلب الإيداع");
      loadAdminData();
    }
  } catch (e) {
    showToast("فشلت عملية الإيداع");
  }
}

async function handleAdminWithdraw(withdrawId, action) {
  let reason = '';
  if (action === 'rejected') {
    reason = prompt("سبب الرفض (سيظهر للمستخدم):");
    if (reason === null) return;
  }

  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/withdraw/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ withdrawId, action, reason })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast("تم تحديث حالة طلب السحب");
      loadAdminData();
    }
  } catch (e) {
    showToast("فشلت العملية");
  }
}

async function toggleUserBan(userId) {
  triggerHaptic('medium');
  try {
    const res = await safeFetch('/api/admin/user/toggle-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(data.isBanned ? "تم حظر المستخدم" : "تم إلغاء حظر المستخدم");
      loadAdminData();
    }
  } catch (e) {
    showToast("خطأ أثناء تغيير حالة الحظر");
  }
}

async function distributeRevenue() {
  const totalRevenue = document.getElementById('revenue-amount')?.value;
  if (!totalRevenue || totalRevenue <= 0) return showToast("أدخل مبلغاً صالحاً");

  triggerHaptic('medium');
  setButtonLoading('btn-distribute-rev', true);

  try {
    const res = await safeFetch('/api/admin/distribute-revenue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalRevenue })
    });
    if (!res) return;
    const data = await res.json();
    if (data.error) showToast(data.error);
    else {
      showToast(data.message || "تم توزيع الأرباح بنجاح");
      if (document.getElementById('revenue-amount')) document.getElementById('revenue-amount').value = '';
    }
  } catch (e) {
    showToast("خطأ أثناء توزيع الأرباح");
  } finally {
    setButtonLoading('btn-distribute-rev', false, 'توزيع الأرباح على الرابط');
  }
}
