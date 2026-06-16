/**
 * =========================================================================
 * Telegram Mini App - Core Engine with Firebase (Version 1.2.5)
 * =========================================================================
 */

// 1. دبابيس مشروعك الحقيقية مأخوذة من صورتك مباشرة 🎯
const firebaseConfig = {
    apiKey: "AIzaSyB9wJ3RKL9Sc0VqIg0z3HIL6PAZMK1GZos",
    authDomain: "telega-io.firebaseapp.com",
    databaseURL: "https://telega-io-default-rtdb.firebaseio.com",
    projectId: "telega-io",
    storageBucket: "telega-io.appspot.com",
    messagingSenderId: "413242252888",
    appId: "1:413242252888:web:6055aaa7fcdd256910b42d",
    measurementId: "G-H7D702XSXY"
};

// تهيئة تواصل Firebase بأمان
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// التشغيل الفوري عند تحميل مستند الـ DOM
document.addEventListener("DOMContentLoaded", () => {
    AppEngine.init();
});

// =========================================================================
// المحرك الرئيسي للتطبيق (App Engine)
// =========================================================================
const AppEngine = {
    userState: {
        telegramId: "549686235", // معرف الحساب الظاهر في سيرفرك
        username: "الملكي",
        balance: 0.00,
        viewsCollected: 0,
        totalEarned: 0.00,
        totalSpent: 0.00,
        isAdmin: true // تفعيل ميزات الإدارة للتجربة والتحكم الكامل
    },

    async init() {
        this.setupTelegramSDK();
        this.initTheme();
        
        // جلب البيانات مع تأمين الشاشة ضد التجميد
        try {
            await this.syncUserWithFirebase();
        } catch (e) {
            console.error("خطأ أثناء مزامنة البيانات السحابية:", e);
        }
        
        this.bindForms();

        // 🚀 الأمان ضد التجمد: إخفاء شاشة التحميل (Loader) وإظهار الواجهة مهما حدث
        const loader = document.getElementById("app-loader");
        const container = document.querySelector(".app-container");
        if (loader) loader.style.display = "none";
        if (container) container.style.display = "flex";
    },

    setupTelegramSDK() {
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.ready();
            tg.expand();
            if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                this.userState.telegramId = String(tg.initDataUnsafe.user.id);
                this.userState.username = tg.initDataUnsafe.user.username || tg.initDataUnsafe.user.first_name || "User";
            }
        }
    },

    initTheme() {
        const themeBtn = document.getElementById("theme-toggle");
        if (!themeBtn) return;

        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) {
            document.body.classList.add("dark-theme");
            themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }

        themeBtn.addEventListener("click", () => {
            const isDark = document.body.classList.toggle("dark-theme");
            themeBtn.innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
        });
    },

    // 🔄 مزامنة البيانات وقراءتها حياً من مجموعة (users) بـ Firebase
    async syncUserWithFirebase() {
        const userId = this.userState.telegramId;
        const userRef = db.collection("users").doc(userId);

        const doc = await userRef.get();
        if (doc.exists) {
            const data = doc.data();
            // دمج الحقول الحقيقية والتأكد من تحويلها لأرقام منعا للمشاكل الحسابية
            this.userState.balance = Number(data.balance || 0);
            this.userState.viewsCollected = Number(data.viewsCollected || 0);
            this.userState.totalEarned = Number(data.totalEarned || 0);
            this.userState.totalSpent = Number(data.totalSpent || 0);
            if (data.userName) this.userState.username = data.userName;
        } else {
            // إذا لم يكن له مستند، ننشئه فوراً بقيم افتراضية (مع 10$ رصيد هدية للتجربة)
            this.userState.balance = 10.00;
            await userRef.set({
                userId: this.userState.telegramId,
                userName: this.userState.username,
                balance: this.userState.balance,
                viewsCollected: 0,
                totalEarned: 0.00,
                totalSpent: 0.00
            });
        }
        
        this.renderUserData();
        this.loadUserChannels();
        this.loadUserCampaigns();
    },

    async updateUserInServer() {
        const userId = this.userState.telegramId;
        try {
            await db.collection("users").doc(userId).set({
                userId: this.userState.telegramId,
                userName: this.userState.username,
                balance: this.userState.balance,
                viewsCollected: this.userState.viewsCollected,
                totalEarned: this.userState.totalEarned,
                totalSpent: this.userState.totalSpent
            }, { merge: true });
        } catch (error) {
            console.error("خطأ تحديث قاعدة البيانات:", error);
        }
    },

    renderUserData() {
        // فحص وجود المعرف بالـ HTML أولاً لتلافي خطأ innerText من الـ Console
        const elBalance = document.getElementById("user-balance");
        if (elBalance) elBalance.innerHTML = `${this.userState.balance.toFixed(2)} <small>$</small>`;

        const elViews = document.getElementById("stat-views");
        if (elViews) elViews.innerText = this.userState.viewsCollected.toLocaleString();

        const elEarned = document.getElementById("stat-earned");
        if (elEarned) elEarned.innerText = this.userState.totalEarned.toFixed(2);

        const elSpent = document.getElementById("stat-spent");
        if (elSpent) elSpent.innerText = this.userState.totalSpent.toFixed(2);

        const elRefLink = document.getElementById("ref-link-input");
        if (elRefLink) elRefLink.value = `https://t.me/Ads_telegabot?start=${this.userState.telegramId}`;

        if (this.userState.isAdmin) {
            const adminBadge = document.getElementById("admin-badge");
            const adminNavBtn = document.getElementById("admin-nav-btn");
            if (adminBadge) adminBadge.style.display = "block";
            if (adminNavBtn) adminNavBtn.style.display = "flex";
        }
    },

    bindForms() {
        const campForm = document.getElementById("campaign-form");
        if (campForm) {
            campForm.addEventListener("submit", async (e) => {
                e.preventDefault();
                
                const text = document.getElementById("camp-text").value;
                const views = parseInt(document.getElementById("camp-views").value);
                const cpm = parseFloat(document.getElementById("camp-cpm").value);
                const cost = (views / 1000) * cpm;

                if (cost > this.userState.balance) {
                    alert(`رصيدك الحالي لا يكفي! التكلفة ${cost.toFixed(2)}$ ورصيدك هو ${this.userState.balance.toFixed(2)}$`);
                    return;
                }

                this.userState.balance -= cost;
                this.userState.totalSpent += cost;
                
                // 📝 حفظ الحملة في مجموعة "ads" لتطابق سيرفرك تماماً
                await db.collection("ads").add({
                    userId: this.userState.telegramId,
                    userName: this.userState.username,
                    title: text.substring(0, 20) + "...", 
                    content: text,
                    targetViews: views,
                    status: "pending",
                    createdAt: new Date()
                });

                await this.updateUserInServer();
                this.renderUserData();
                
                closeModal("campaign-modal");
                campForm.reset();
                toggleModalBtnFields(false);
                
                alert("🚀 تم إطلاق الحملة وحفظها سحابياً في الـ Firebase بنجاح!");
                this.loadUserCampaigns();
            });
        }
    },

    // جلب الإعلانات وعرضها حياً من مجموعة ads
    async loadUserCampaigns() {
        const container = document.getElementById("my-campaigns-list");
        if (!container) return;

        try {
            const snapshot = await db.collection("ads")
                                   .where("userId", "==", this.userState.telegramId)
                                   .get();

            if (snapshot.empty) {
                container.innerHTML = '<div class="empty-state"><p>لا توجد حملات نشطة حالياً.</p></div>';
                return;
            }

            container.innerHTML = snapshot.docs.map(doc => {
                const data = doc.data();
                return `
                    <div class="data-item-card" style="margin-bottom:10px; padding:12px; background:var(--card-bg); border-radius:8px;">
                        <strong>${data.title || 'إعلان بدون عنوان'}</strong>
                        <p style="font-size:0.8rem; color:var(--text-muted); margin: 5px 0;">${data.content || ''}</p>
                        <span class="admin-badge" style="background:var(--warning-color); font-size:0.7rem; display:inline-block;">
                            ${data.status === 'pending' ? 'قيد الانتظار' : 'نشط'}
                        </span>
                    </div>`;
            }).join('');
        } catch (err) {
            console.error("خطأ جلب الإعلانات:", err);
        }
    },

    // جلب القنوات المربوطة من السيرفر
    async loadUserChannels() {
        const container = document.getElementById("channels-list");
        if (!container) return;

        try {
            const snapshot = await db.collection("channels")
                                   .where("userId", "==", this.userState.telegramId)
                                   .get();
            
            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-folder-minus"></i>
                        <p>لم تقم بإضافة أي قناة حتى الآن!</p>
                    </div>`;
                return;
            }

            container.innerHTML = snapshot.docs.map(doc => {
                const data = doc.data();
                return `
                    <div class="data-item-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                        <div>
                            <strong>${data.channelUsername}</strong>
                            <p style="font-size:0.75rem; color:var(--success-color);">متصلة وتستقبل الإعلانات الحية</p>
                        </div>
                    </div>`;
            }).join('');
        } catch (error) {
            console.error(error);
        }
    }
};

// =========================================================================
// واجهات التحكم والـ Modals العامة المربوطة بالـ HTML
// =========================================================================
window.switchTab = function(tabId, navBtnElement = null) {
    const sections = document.querySelectorAll(".tab-section");
    sections.forEach(sec => sec.classList.remove("active"));

    const targetSection = document.getElementById(`tab-${tabId}`);
    if (targetSection) targetSection.classList.add("active");

    if (navBtnElement) {
        const navItems = document.querySelectorAll(".nav-item");
        navItems.forEach(item => item.classList.remove("active"));
        navBtnElement.classList.add("active");
    }
};

window.openCampaignModal = function() { document.getElementById("campaign-modal")?.classList.add("open"); };
window.closeModal = function(modalId) { document.getElementById(modalId)?.classList.remove("open"); };
window.toggleModalBtnFields = function(isChecked) {
    const fields = document.getElementById("modal-btn-fields");
    if (fields) fields.style.display = isChecked ? "block" : "none";
};

window.openGeneralModal = function(title, bodyHtml) {
    const modal = document.getElementById("general-modal");
    const mTitle = document.getElementById("gen-modal-title");
    const mBody = document.getElementById("gen-modal-body");
    if (modal && mTitle && mBody) {
        mTitle.innerText = title;
        mBody.innerHTML = bodyHtml;
        modal.classList.add("open");
    }
};

window.openAddChannelModal = function() {
    const html = `
        <div class="form-group">
            <label>معرّف القناة العام 📢</label>
            <input type="text" id="new-channel-input" placeholder="مثال: @my_channel" required>
        </div>
        <button class="btn btn-primary w-100" onclick="submitAddChannelServer()">توثيق وربط القناة</button>
    `;
    openGeneralModal("ربط قناة جديدة", html);
};

window.submitAddChannelServer = async function() {
    const input = document.getElementById("new-channel-input");
    if (!input || !input.value.trim()) { alert("يرجى إدخال معرف القناة!"); return; }

    await db.collection("channels").add({
        userId: AppEngine.userState.telegramId,
        channelUsername: input.value.trim(),
        createdAt: new Date()
    });

    closeModal("general-modal");
    alert("✅ تم تفعيل وحفظ القناة بالسيرفر سحابياً!");
    AppEngine.loadUserChannels();
};

window.openPromoModal = function() {
    const html = `
        <div class="form-group">
            <label>أدخل كود الهدية أو الكود الترويجي 🎁</label>
            <input type="text" id="promo-code-input" placeholder="مثال: TELEGA2026">
        </div>
        <button class="btn btn-success w-100" onclick="submitPromoCode()">تفعيل المكافأة</button>
    `;
    openGeneralModal("تفعيل كود ترويجي", html);
};

window.submitPromoCode = function() {
    const code = document.getElementById("promo-code-input").value;
    if (code.trim().toUpperCase() === "TELEGA2026") {
        AppEngine.userState.balance += 5.00;
        AppEngine.updateUserInServer();
        AppEngine.renderUserData();
        closeModal("general-modal");
        alert("🎉 تم تفعيل الكود بنجاح وإضافة 5.00$ سحابياً!");
    } else {
        alert("❌ كود خاطئ أو منتهي الصلاحية.");
    }
};

window.openDepositModal = function() {
    const html = `
        <p style="font-size:0.85rem; margin-bottom:12px;">عنوان محفظة الإيداع التجريبي بشبكة (TRC-20):</p>
        <div class="form-group"><input type="text" readonly value="TY2r8P4mXm8K3VnS9jHq9B5zZpXwRE9999" style="text-align:center;"></div>
        <button class="btn btn-success w-100" onclick="simulateDeposit()">محاكاة إيداع 10$ حياً</button>
    `;
    openGeneralModal("شحن الرصيد (USDT)", html);
};

window.simulateDeposit = function() {
    AppEngine.userState.balance += 10.00;
    AppEngine.updateUserInServer();
    AppEngine.renderUserData();
    closeModal("general-modal");
    alert("💰 تمت المحاكاة بنجاح، وتم حفظ الرصيد الجديد في خادم Firebase الخاص بك!");
};

window.copyRefLink = function() {
    const input = document.getElementById("ref-link-input");
    if (input) {
        input.select();
        navigator.clipboard.writeText(input.value);
        alert("📋 تم نسخ الرابط!");
    }
};

window.openAdminFundModal = function(isDeposit) {
    if (isDeposit) AppEngine.userState.balance += 50.00;
    else AppEngine.userState.balance = Math.max(0, AppEngine.userState.balance - 10.00);
    AppEngine.updateUserInServer();
    AppEngine.renderUserData();
};
window.openAdminReviewChannels = function() { alert("لا يوجد طلبات معلقة."); };
window.openAdminPromoModal = function() { alert("سيتم ربطها مستقبلاً لتوليد الأكواد تلقائياً."); };
window.saveAsTemplateAction = function() { alert("تم حفظ المسودة."); };
