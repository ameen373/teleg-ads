(function () {
  const AdminModule = {
    usersMap: new Map(),

    enableAdminAccess() {
      const adminNavBtn = document.getElementById('nav-admin-btn');
      if (adminNavBtn) {
        adminNavBtn.style.display = 'flex';
      }
    },

    indexUsers(usersList = []) {
      this.usersMap.clear();
      if (!Array.isArray(usersList)) return;
      for (const u of usersList) {
        const key = String(u.telegramId || u.id || u._id || '');
        if (key) {
          this.usersMap.set(key, u);
        }
      }
    },

    resolveUser(userIdOrObj) {
      if (userIdOrObj && typeof userIdOrObj === 'object') {
        const idKey = String(userIdOrObj.telegramId || userIdOrObj.id || '');
        const cached = idKey ? this.usersMap.get(idKey) : null;
        return window.UI.formatUserIdentity({ ...(cached || {}), ...userIdOrObj });
      }
      const key = String(userIdOrObj || '');
      const cached = key ? this.usersMap.get(key) : null;
      return window.UI.formatUserIdentity(cached || { telegramId: key || '---' });
    },

    // واجهة الإدارة مفرغة مبدئياً حسب الطلب وتحتفظ بدوال التعرّف الكامل على المستخدم جاهزة
    async loadDashboard() {}
  };

  window.AdminModule = AdminModule;
})();
