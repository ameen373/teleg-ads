document.addEventListener('DOMContentLoaded', async () => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  const initData = tg?.initData || '';
  const accessDeniedEl = document.getElementById('access-denied');
  const adminContentEl = document.getElementById('admin-content');

  try {
    const response = await fetch('/api/admin/verify', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-init-data': initData
      }
    });

    const result = await response.json();

    if (response.ok && result.success) {
      // المستخدم أدمن مصرح له
      accessDeniedEl.style.display = 'none';
      adminContentEl.style.display = 'block';
      
      // تحميل بيانات اللوحة
      loadAdminDashboard(initData);
    } else {
      // مستخدم غير أدمن أو فشل التحقق
      showAccessDenied(result.error || 'عذراً، هذا القسم مخصص للإدارة فقط.');
    }
  } catch (err) {
    console.error('Error verifying admin access:', err);
    showAccessDenied('حدث خطأ في الاتصال بالخادم.');
  }
});

function showAccessDenied(message) {
  const accessDeniedEl = document.getElementById('access-denied');
  const adminContentEl = document.getElementById('admin-content');
  
  adminContentEl.style.display = 'none';
  accessDeniedEl.style.display = 'flex';
  document.getElementById('access-denied-message').innerText = message;
}

async function loadAdminDashboard(initData) {
  // يمكنك تنفيذ طلبات جلب البيانات المحمية هنا بنفس الترويسة
}
