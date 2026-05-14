
// ==========================================
// CONFIGURATION
// ==========================================

var CONFIG = {
    APP: {
        NAME: "AdSmart System",
        VERSION: "1.0.0",
        DEBUG: true
    },

    BOT_CONFIG: {
        ADMIN_ID: 123456,
        BOT_NAME: "AdBot"
    },

    LIMITS: {
        MAX_CAMPAIGNS_PER_USER: 10,
        MAX_DAILY_CLICKS: 1000
    },

    AI: {
        MIN_AD_SCORE: 70,
        LOW_USER_THRESHOLD: 30,
        HIGH_RISK_THRESHOLD: 80
    }
};

function log() {
    if (window.CONFIG && CONFIG.APP && CONFIG.APP.DEBUG) {
        console.log.apply(console, arguments);
    }
}

function warn() {
    console.warn.apply(console, arguments);
}

function errorLog() {
    console.error.apply(console, arguments);
}

// ==========================================
// GLOBAL STATE
// ==========================================

var state = {

    user: {
        id: null,
        name: "",
        balance: 0,
        clicks: 0,
        views: 0,
        earnings: 0,
        riskScore: 0
    },

    ui: {
        loading: false,
        currentSection: "home",
        theme: "light"
    },

    system: {
        initialized: false,
        lastUpdate: null
    },

    language: "en"
};


// ==========================================
// HOOK SYSTEM
// ==========================================

var Hooks = {
    onUserUpdate: [],
    onUIUpdate: [],
    onSystemInit: []
};


// ==========================================
// RUN HOOKS
// ==========================================

function runHooks(list, payload) {

    if (!list || !list.length) return;

    for (var i = 0; i < list.length; i++) {

        try {
            list[i](payload);
        } catch (err) {
            console.error("Hook error:", err);
        }
    }
}


// ==========================================
// STATE MANAGEMENT
// ==========================================

// 👤 تحديث المستخدم (FIXED WITHOUT SPREAD)
function updateUser(userData) {

    if (!userData || typeof userData !== "object") return;

    for (var key in userData) {
        state.user[key] = userData[key];
    }

    runHooks(Hooks.onUserUpdate, state.user);

    log("User Updated:", state.user);
}


// 🔹 تحديث حقل واحد
function updateUserField(key, value) {

    if (!key) return;

    state.user[key] = value;

    runHooks(Hooks.onUserUpdate, state.user);

    log("User Field Updated:", key, value);
}


// 🎨 UI STATE UPDATE
function setUI(key, value) {

    if (!key) return;

    state.ui[key] = value;

    runHooks(Hooks.onUIUpdate, state.ui);

    log("UI Updated:", key, value);
}


// 📥 GET STATE SAFE (NO OPTIONAL CHAINING)
function getState(path) {

    if (!path || typeof path !== "string") return null;

    var parts = path.split(".");
    var obj = state;

    for (var i = 0; i < parts.length; i++) {

        if (!obj) return null;

        obj = obj[parts[i]];
    }

    return obj;
}


// ♻️ RESET STATE
function resetState() {

    state.user = {
        id: null,
        name: "",
        balance: 0,
        clicks: 0,
        views: 0,
        earnings: 0,
        riskScore: 0
    };

    state.ui = {
        loading: false,
        currentSection: "home",
        theme: "light"
    };

    log("State Reset");
}


// ==========================================
// METRICS
// ==========================================

function calculateCTR(clicks, views) {

    clicks = clicks || 0;
    views = views || 0;

    if (views === 0) return 0;

    return (clicks / views) * 100;
}

function calculateConversion(actions, clicks) {

    actions = actions || 0;
    clicks = clicks || 0;

    if (clicks === 0) return 0;

    return (actions / clicks) * 100;
}

function calculateRPM(earnings, views) {

    earnings = earnings || 0;
    views = views || 0;

    if (views === 0) return 0;

    return (earnings / views) * 1000;
}


// ==========================================
// HELPERS
// ==========================================

function clamp(value, min, max) {

    min = min || 0;
    max = max || 100;

    if (value < min) return min;
    if (value > max) return max;

    return value;
}


// ==========================================
// LOGGING
// ==========================================

const Utils = {

    log: function() {
        console.log.apply(console, arguments);
    },

    warn: function() {
        console.warn.apply(console, arguments);
    },

    error: function() {
        console.error.apply(console, arguments);
    },

    deepClone: function(obj) {
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return null;
        }
    },

    safeMerge: function(target, source) {
        return Object.assign({}, target || {}, source || {});
    },

    clamp: function(value, min, max) {
        return Math.max(min, Math.min(value, max));
    },

    isNumber: function(val) {
        return typeof val === "number" && !isNaN(val);
    },

    isString: function(val) {
        return typeof val === "string";
    }
};


// ==========================================
// VALIDATION
// ==========================================

function isValidUser(user) {
    return !!(user && user.id);
}

function isNumber(val) {
    return typeof val === "number" && !isNaN(val);
}

function isString(val) {
    return typeof val === "string";
}


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.CONFIG = CONFIG;
window.state = state;

window.Hooks = Hooks;

window.updateUser = updateUser;
window.updateUserField = updateUserField;
window.setUI = setUI;
window.getState = getState;

window.calculateCTR = calculateCTR;
window.calculateConversion = calculateConversion;
window.calculateRPM = calculateRPM;
window.clamp = clamp;

window.log = log;
window.warn = warn;
window.errorLog = errorLog;

// ==========================================
// DATA LAYER (SAFE ABSTRACTION)
// IMPORTANT: Frontend layer only, backend must validate everything
// ==========================================

const Database = {

    isFirebase() {
        return typeof db !== "undefined";
    },

    async get(path) {
        try {

            if (this.isFirebase()) {
                const snap = await db.ref(path).once("value");
                return snap.val();
            }

            return null;

        } catch (err) {
            Utils.error("DB GET ERROR:", err);
            return null;
        }
    },

    async set(path, data) {
        try {

            if (this.isFirebase()) {
                await db.ref(path).set(data);
                return true;
            }

            return false;

        } catch (err) {
            Utils.error("DB SET ERROR:", err);
            return false;
        }
    },

    async update(path, data) {
        try {

            if (this.isFirebase()) {
                await db.ref(path).update(data);
                return true;
            }

            return false;

        } catch (err) {
            Utils.error("DB UPDATE ERROR:", err);
            return false;
        }
    }
};


// ==========================================
// USER SERVICE (FRONTEND SAFE LAYER)
// Backend must enforce all rules
// ==========================================

const UserService = {

    getUser: async function(userId) {

        if (!userId) return null;

        return await Database.get(`users/${userId}`);
    },

    createUser: async function(userId, data = {}) {

        if (!userId) return null;

        const user = {
            id: userId,
            name: data.name || "Guest",

            balance: 0,
            clicks: 0,
            views: 0,
            earnings: 0,

            riskScore: 0,

            createdAt: Date.now(),

            // server-controlled fields (frontend suggestion only)
            rewardMultiplier: 1
        };

        await Database.set(`users/${userId}`, user);

        updateUser(user);

        Utils.log("User created");

        return user;
    },

    updateBalance: async function(userId, amount) {

        if (!Validator.isNumber(amount)) return false;

        const user = await UserService.getUser(userId);
        if (!user) return false;

        const newBalance = (user.balance || 0) + amount;

        await Database.update(`users/${userId}`, {
            balance: newBalance,
            lastBalanceUpdate: Date.now()
        });

        updateUser({ balance: newBalance });

        return true;
    }
};


// ==========================================
// CAMPAIGN SERVICE (SAFE VERSION)
// ==========================================

const CampaignService = {

    async createCampaign(userId, data = {}) {

        if (!userId) return { success: false };

        const id = Utils.generateId("cmp");

        const campaign = {
            id,
            userId,

            title: data.title || "Untitled",
            budget: Math.max(0, data.budget || 0),
            bid: Math.max(0.01, data.bid || 0.01),

            status: "active",

            stats: {
                views: 0,
                clicks: 0
            },

            createdAt: Date.now()
        };

        await Database.set(`campaigns/${id}`, campaign);

        return {
            success: true,
            campaign
        };
    },

    async pauseCampaign(id) {
        if (!id) return false;

        return await Database.update(`campaigns/${id}`, {
            status: "paused",
            updatedAt: Date.now()
        });
    },

    async activateCampaign(id) {
        if (!id) return false;

        return await Database.update(`campaigns/${id}`, {
            status: "active",
            updatedAt: Date.now()
        });
    },

    async getAllCampaigns() {
        const data = await Database.get("campaigns");
        return data || {};
    }
};

/* =========================================
   🌍 SMART GLOBAL LANGUAGE SYSTEM
   ========================================= */

const AppI18n = {

    // =====================================
    // اللغة الحالية
    // =====================================

    current: "en",

    // =====================================
    // لغات RTL
    // =====================================

    rtlLanguages: ["ar", "fa", "ur", "he"],

    // =====================================
    // الترجمات
    // =====================================

    translations: {

        // =====================================
        // العربية
        // =====================================

        ar: {

            // Bottom Navigation
            nav_home: "الرئيسية",
            nav_advertiser: "المعلن",
            nav_publisher: "الناشر",
            nav_referral: "الإحالة",
            nav_admin: "الإدارة",
            nav_profile: "الملف",

            // General
            home: "الرئيسية",
            profile: "الملف",
            referrals: "الإحالة",
            publisher: "الناشر",
            advertiser: "المعلن",
            admin: "الإدارة",
            welcome: "مرحبًا",
            balance: "الرصيد",

            // Admin
            admin_title: "لوحة الإدارة",
            overview: "نظرة عامة",
            users: "المستخدمين",
            campaigns: "الحملات",
            channels: "القنوات",
            finance: "المالية",
            analytics: "التحليلات",
            security: "الأمان",
            notifications: "الإشعارات",
            settings: "الإعدادات",

            total_users: "المستخدمين",
            total_campaigns: "الحملات",
            total_channels: "القنوات",
            total_revenue: "الأرباح",
            top_performance: "الأفضل أداءً",
            live_activity: "النشاط المباشر",

            // Profile
            profile_stats: "إحصائياتي",
            views: "المشاهدات",
            clicks: "النقرات",
            ctr: "معدل CTR",
            earnings: "الأرباح",
            wallet: "المحفظة",
            deposit: "شحن",
            withdraw: "سحب",
            referral: "الإحالة",
            my_channels: "قنواتي",
            account_security: "الأمان",
            save_changes: "حفظ التعديلات",

            // Placeholders
            ph_amount: "أدخل المبلغ",
            ph_tx_hash: "أدخل TX Hash"
        },

        // =====================================
        // الإنجليزية
        // =====================================

        en: {

            // Bottom Navigation
            nav_home: "Home",
            nav_advertiser: "Advertiser",
            nav_publisher: "Publisher",
            nav_referral: "Referrals",
            nav_admin: "Admin",
            nav_profile: "Profile",

            // General
            home: "Home",
            profile: "Profile",
            referrals: "Referrals",
            publisher: "Publisher",
            advertiser: "Advertiser",
            admin: "Admin",
            welcome: "Welcome",
            balance: "Balance",

            // Admin
            admin_title: "Admin Panel",
            overview: "Overview",
            users: "Users",
            campaigns: "Campaigns",
            channels: "Channels",
            finance: "Finance",
            analytics: "Analytics",
            security: "Security",
            notifications: "Notifications",
            settings: "Settings",

            total_users: "Users",
            total_campaigns: "Campaigns",
            total_channels: "Channels",
            total_revenue: "Revenue",
            top_performance: "Top Performance",
            live_activity: "Live Activity",

            // Profile
            profile_stats: "My Statistics",
            views: "Views",
            clicks: "Clicks",
            ctr: "CTR",
            earnings: "Earnings",
            wallet: "Wallet",
            deposit: "Deposit",
            withdraw: "Withdraw",
            referral: "Referral",
            my_channels: "My Channels",
            account_security: "Security",
            save_changes: "Save Changes",

            // Placeholders
            ph_amount: "Enter amount",
            ph_tx_hash: "Enter TX Hash"
        }
    },

    // =====================================
    // اكتشاف اللغة تلقائياً
    // =====================================

    detect: function () {

        try {

            let lang = "en";

            // Telegram Language
            if (
                window.Telegram &&
                Telegram.WebApp &&
                Telegram.WebApp.initDataUnsafe &&
                Telegram.WebApp.initDataUnsafe.user &&
                Telegram.WebApp.initDataUnsafe.user.language_code
            ) {

                lang =
                    Telegram.WebApp
                    .initDataUnsafe
                    .user
                    .language_code;
            }

            // Browser Language
            else {

                lang =
                    navigator.language || "en";
            }

            lang =
                lang
                .toLowerCase()
                .split("-")[0];

            // fallback
            if (!this.translations[lang]) {

                lang = "en";
            }

            this.current = lang;

            return lang;

        } catch (e) {

            console.error(
                "LANG DETECT ERROR:",
                e
            );

            this.current = "en";

            return "en";
        }
    },

    // =====================================
    // تغيير اللغة
    // =====================================

    setLanguage: function (lang) {

        if (!this.translations[lang]) return;

        this.current = lang;

        this.apply();
    },

    // =====================================
    // تطبيق الاتجاه RTL/LTR
    // =====================================

    applyDirection: function () {

        const isRTL =
            this.rtlLanguages.includes(
                this.current
            );

        document.documentElement.dir =
            isRTL ? "rtl" : "ltr";

        document.documentElement.lang =
            this.current;
    },

    // =====================================
    // جلب النص المترجم
    // =====================================

    t: function (key) {

        return (
            this.translations[this.current]?.[key] ||
            this.translations.en?.[key] ||
            key
        );
    },

    // =====================================
    // تطبيق الترجمة على الصفحة
    // =====================================

    apply: function () {

        // النصوص
        const elements =
            document.querySelectorAll(
                "[data-i18n]"
            );

        for (let el of elements) {

            const key =
                el.getAttribute(
                    "data-i18n"
                );

            el.innerHTML =
                this.t(key);
        }

        // placeholders
        const placeholders =
            document.querySelectorAll(
                "[data-i18n-placeholder]"
            );

        for (let el of placeholders) {

            const key =
                el.getAttribute(
                    "data-i18n-placeholder"
                );

            el.placeholder =
                this.t(key);
        }

        // اتجاه الصفحة
        this.applyDirection();
    },

    // =====================================
    // تشغيل النظام
    // =====================================

    init: function () {

        this.detect();

        this.apply();

        console.log(
            "🌍 Language Loaded:",
            this.current
        );
    }
};

// =====================================
// GLOBAL ACCESS
// =====================================

window.AppI18n = AppI18n;

// ==========================================
// SAFE SERVICE EXPORTS
// ==========================================

window.Database = Database;
window.UserService = UserService;
window.CampaignService = CampaignService;


// ==========================================
// UI CORE
// ==========================================

var UI = {

    showAlert: function(message, type, duration) {

        message = message || "";
        type = type || "info";
        duration = duration || 3000;

        var el = document.createElement("div");

        el.className = "app-alert " + type;
        el.textContent = message;

        document.body.appendChild(el);

        setTimeout(function() {
            el.classList.add("show");
        }, 50);

        setTimeout(function() {

            el.classList.remove("show");

            setTimeout(function() {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }, 300);

        }, duration);

        log("Alert:", message);
    },


    showToast: function(message, duration) {

        message = message || "";
        duration = duration || 2000;

        var el = document.createElement("div");

        el.className = "app-toast";
        el.textContent = message;

        document.body.appendChild(el);

        setTimeout(function() {
            el.classList.add("show");
        }, 50);

        setTimeout(function() {

            el.classList.remove("show");

            setTimeout(function() {
                if (el && el.parentNode) {
                    el.parentNode.removeChild(el);
                }
            }, 300);

        }, duration);
    },


    setLoading: function(show) {

        var loader = document.getElementById("app-loader");

        if (!loader) {

            loader = document.createElement("div");
            loader.id = "app-loader";
            loader.innerHTML = "<div class='spinner'></div>";
            document.body.appendChild(loader);
        }

        loader.style.display = show ? "flex" : "none";
    }
};


// ==========================================
// DOM ENGINE
// ==========================================

var DOM = {

    get: function(selector) {
        return document.querySelector(selector);
    },

    getAll: function(selector) {
        return document.querySelectorAll(selector);
    },

    on: function(event, selector, handler) {

        document.addEventListener(event, function(e) {

            var target = e.target;

            while (target && target !== document) {

                if (target.matches && target.matches(selector)) {
                    handler(target, e);
                    return;
                }

                target = target.parentElement;
            }

        });
    },

    setText: function(selector, text) {

        var el = this.get(selector);

        if (el) el.textContent = text;
    }
};


// ==========================================
// UI BINDINGS
// ==========================================

var UIBindings = {

    updateUserUI: function(user) {

        if (!user) return;

        DOM.setText("#user-name", user.name || "Guest");
        DOM.setText("#user-balance", user.balance || 0);
    },


    updateRouteUI: function(ui) {

        if (!ui) return;

        var sections = DOM.getAll("[data-section]");

        for (var i = 0; i < sections.length; i++) {

            sections[i].classList.remove("active");

            if (sections[i].dataset.section === ui.currentSection) {
                sections[i].classList.add("active");
            }
        }
    }
};


// ==========================================
// SAFE HOOK SYSTEM (FIXED)
// ==========================================

// حماية من undefined
if (!window.Hooks) {
    window.Hooks = {
        onUserUpdate: [],
        onUIUpdate: [],
        onSystemInit: []
    };
}

// 🔥 ربط آمن بدون push على undefined
function registerHook(name, fn) {

    if (!Hooks[name]) {
        Hooks[name] = [];
    }

    Hooks[name].push(fn);
}


// ==========================================
// HOOK INTEGRATION (FIXED)
// ==========================================

registerHook("onUserUpdate", function(user) {
    UIBindings.updateUserUI(user);
});

registerHook("onUIUpdate", function(ui) {
    UIBindings.updateRouteUI(ui);
    if (UIBindings.updateLoading) {
        UIBindings.updateLoading(ui);
    }
});


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.UI = UI;
window.DOM = DOM;
window.UIBindings = UIBindings;
window.registerHook = registerHook;


// ==========================================
// GLOBAL HELPERS
// ==========================================

window.showAlert = function(msg, type) {
    UI.showAlert(msg, type);
};

window.showToast = function(msg) {
    UI.showToast(msg);
};

// ==========================================
// APP ENGINE
// ==========================================

var AppEngine = {

    init: async function() {

        try {

            log("Initializing App...");

            setUI("loading", true);

          
            // =========================
            // TELEGRAM
            // =========================
            var tg = (window.Telegram && window.Telegram.WebApp)
                ? window.Telegram.WebApp
                : null;

            var userId = CONFIG.BOT_CONFIG.ADMIN_ID;
            var userName = "Guest";

            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
                userId = tg.initDataUnsafe.user.id || userId;
                userName = tg.initDataUnsafe.user.first_name || userName;
            }

            // =========================
            // USER INIT
            // =========================
            var user = null;

try {
    if (window.UserService && typeof UserService.getUser === "function") {
        user = await UserService.getUser(userId);
    } else {
        console.warn("UserService not ready");
    }
} catch (e) {
    console.warn("User load failed, using fallback");
    user = null;
} 

            // =========================
            // TELEGRAM READY
            // =========================
            if (tg) {
                try {
                    tg.ready && tg.ready();
                    tg.expand && tg.expand();
                } catch (e) {
                    warn("Telegram init failed");
                }
            }

            setUI("loading", false);

            // =========================
            // SYSTEM HOOK (FIXED)
            // =========================
            if (Hooks && Hooks.onSystemInit) {
                runHooks(Hooks.onSystemInit, state);
            }

            log("App Ready");

            return true;

        } catch (err) {

            errorLog("App Init Error:", err);

            setUI("loading", false);

            return false;
        }
    }
};


// ==========================================
// ROUTER SYSTEM
// ==========================================

var AppRouter = {

    routes: {
        home: true,
        promo: true,
        publisher: true,
        referrals: true,
        profile: true,
        admin: true
    },

    navigateTo: function(routeName) {

        if (!this.routes[routeName]) {
            warn("Route not found:", routeName);
            return false;
        }

        // إخفاء كل الصفحات
        document.querySelectorAll(".page").forEach(page => {
            page.style.display = "none";
        });

        // إظهار الصفحة المطلوبة
        const targetPage =
            document.getElementById(routeName + "-page");

        if (targetPage) {
            targetPage.style.display = "block";
        }

        setUI("currentSection", routeName);

        log("Navigate:", routeName);

        return true;
    }
};
   
// ==========================================
// EVENT SYSTEM
// ==========================================

var AppEvents = {

    handle: async function(action, payload) {

        payload = payload || {};

        try {

            switch (action) {

                // =====================================
                // NAVIGATION
                // =====================================

                case "NAVIGATE":

                    AppRouter.navigateTo(payload.route);

                    break;


                // =====================================
                // CREATE CAMPAIGN BOX
                // =====================================

                case "SHOW_CREATE_CAMPAIGN":

                    document.getElementById("create-campaign-box").style.display = "block";

                    document.getElementById("my-campaigns-box").style.display = "none";

                    break;


                // =====================================
                // MY CAMPAIGNS BOX
                // =====================================

                case "SHOW_MY_CAMPAIGNS":

                    document.getElementById("create-campaign-box").style.display = "none";

                    document.getElementById("my-campaigns-box").style.display = "block";

                    break;


                // =====================================
                // ADD CHANNEL BOX
                // =====================================

                case "SHOW_ADD_CHANNEL":

                    document.getElementById("add-channel-box").style.display = "block";

                    document.getElementById("my-channels-box").style.display = "none";

                    break;


                // =====================================
                // MY CHANNELS BOX
                // =====================================

                case "SHOW_MY_CHANNELS":

                    document.getElementById("add-channel-box").style.display = "none";

                    document.getElementById("my-channels-box").style.display = "block";

                    break;


                // =====================================
                // CREATE CAMPAIGN
                // =====================================

                case "CREATE_CAMPAIGN":

                    var result = await createCampaign(
                        state.user.id,
                        payload.data
                    );

                    if (result && result.success) {

                        showAlert("Campaign Created", "success");

                    } else {

                        showAlert("Failed", "error");
                    }

                    break;


                // =====================================
                // PAUSE CAMPAIGN
                // =====================================

                case "PAUSE_CAMPAIGN":

                    await pauseCampaign(payload.id);

                    showAlert("Campaign Paused", "info");

                    break;


                // =====================================
                // ACTIVATE CAMPAIGN
                // =====================================

                case "ACTIVATE_CAMPAIGN":

                    await activateCampaign(payload.id);

                    showAlert("Campaign Activated", "success");

                    break;


                // =====================================
                // ADD BALANCE
                // =====================================

                case "ADD_BALANCE":

                    await UserService.updateBalance(
                        state.user.id,
                        payload.amount || 0
                    );

                    showAlert("Balance Updated", "success");

                    break;


                // =====================================
                // REFRESH UI
                // =====================================

                case "REFRESH_UI":

                    if (typeof refreshUI === "function") {

                        refreshUI();
                    }

                    break;


                // =====================================
                // UNKNOWN
                // =====================================

                default:

    warn("Unknown action:", action);
}

} catch (err) {

    errorLog("Action Error:", err);

    showAlert("System Error", "error");
}
}
};

document.addEventListener("click", function(e) {

    const routeEl = e.target.closest("[data-route]");
    if (routeEl && window.AppRouter) {
        AppRouter.navigateTo(routeEl.dataset.route);
        return;
    }

    const actionEl = e.target.closest("[data-action]");
    if (actionEl && window.AppEvents) {

        let action = actionEl.dataset.action;
        let payload = {};

        try {
            payload = JSON.parse(actionEl.dataset.payload || "{}");
        } catch (e) {}

        AppEvents.handle(action, payload);
    }
});
    


// ==========================================
// SAFE HOOKS (CRITICAL FIX)
// ==========================================

// ضمان وجود النظام
if (!window.Hooks) {
    window.Hooks = {};
}

if (!Hooks.onSystemInit) {
    Hooks.onSystemInit = [];
}


// ==========================================
// SYSTEM HOOK SAFE REGISTER
// ==========================================

function registerHook(name, fn) {

    if (!Hooks[name]) {
        Hooks[name] = [];
    }

    Hooks[name].push(fn);
}


// ==========================================
// SAFE HOOK INTEGRATION
// ==========================================

registerHook("onSystemInit", function() {
    log("System Initialized Hook Fired");
});


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.AppEngine = AppEngine;
window.AppRouter = AppRouter;
window.AppEvents = AppEvents;

// ==========================================
// SAFE HOOK SYSTEM GUARD (CRITICAL FIX)
// ==========================================

if (!window.Hooks) {
    window.Hooks = {};
}

function safePushHook(name, fn) {

    if (!Hooks[name]) {
        Hooks[name] = [];
    }

    Hooks[name].push(fn);
}


// ==========================================
// ANTI-FRAUD ENGINE
// ==========================================

var AntiFraud = {

    calculateRiskScore: function(user) {

        user = user || {};

        var score = 0;

        var ctr = calculateCTR(user.clicks, user.views);

        if (ctr > 70) score += 40;
        if (ctr > 90) score += 60;

        if (user.lastActions && user.lastActions.length > 20) {
            score += 20;
        }

        if ((user.ipChanges || 0) > 3) {
            score += 25;
        }

        if ((user.referrals || 0) > 50) {
            score += 30;
        }

        if (user.createdAt && (user.withdrawals || 0) > 0) {

            var age = Date.now() - user.createdAt;

            if (age < 24 * 60 * 60 * 1000) {
                score += 50;
            }
        }

        return clamp(score, 0, 100);
    },


    classify: function(score) {

        if (score >= CONFIG.AI.HIGH_RISK_THRESHOLD) {
            return "HIGH_RISK";
        }

        if (score >= 50) {
            return "MEDIUM_RISK";
        }

        return "SAFE";
    },


    shouldBlock: function(score) {
        return score >= 85;
    },


    analyze: function(user) {

        var score = this.calculateRiskScore(user);

        return {
            score: score,
            level: this.classify(score),
            blocked: this.shouldBlock(score),
            safeToServeAds: score < 60
        };
    }
};


// ==========================================
// DECISION ENGINE
// ==========================================

var DecisionEngine = {

    scoreUser: function(user) {

        user = user || {};

        var score = 0;

        var ctr = calculateCTR(user.clicks, user.views);

        if (ctr >= 10) score += 30;
        if (ctr >= 30) score += 50;

        if (user.riskScore) {
            score -= user.riskScore * 0.5;
        }

        if ((user.views || 0) > 100) score += 20;
        if ((user.clicks || 0) > 50) score += 20;
        if ((user.earnings || 0) > 50) score += 15;

        return clamp(score, 0, 100);
    },


    shouldServeAd: function(user) {
        return this.scoreUser(user) >= CONFIG.AI.MIN_AD_SCORE;
    },


    systemDecision: function(data) {

        data = data || {};

        var user = data.user || {};
        var campaigns = data.campaigns || [];

        return {
            allowAd: this.shouldServeAd(user),
            risk: user.riskScore || 0
        };
    }
};


// ==========================================
// SAFE HOOK INTEGRATION (FIXED)
// ==========================================

// 🔥 لا نستخدم push مباشرة بدون تحقق

safePushHook("onUserUpdate", function(user) {

    var analysis = AntiFraud.analyze(user);

    updateUser({
        riskScore: analysis.score,
        riskLevel: analysis.level
    });

    // ad score update safely
    updateUserField("adScore", DecisionEngine.scoreUser(user));
});

// ==========================================
// SAFE HOOK SYSTEM GUARD
// ==========================================

if (!window.Hooks) {
    window.Hooks = {};
}

function safePushHook(name, fn) {

    if (!Hooks[name]) {
        Hooks[name] = [];
    }

    Hooks[name].push(fn);
}


// ==========================================
// AI OPTIMIZER
// ==========================================

var AIOptimizer = {

    analyzeCampaign: function(campaign) {

        campaign = campaign || {};

        var stats = campaign.stats || {};

        var views = stats.views || 0;
        var clicks = stats.clicks || 0;

        var ctr = calculateCTR(clicks, views);

        var score = ctr;

        if ((campaign.budget || 0) > 100) score += 10;
        if ((campaign.budget || 0) < 10) score -= 10;

        if (ctr < 1) score -= 20;
        if (ctr > 20) score += 30;

        return {
            ctr: ctr,
            score: clamp(score, 0, 100)
        };
    },


    adjustRate: function(baseRate, performanceScore) {

        baseRate = baseRate || 0.01;
        performanceScore = performanceScore || 0;

        var multiplier = 1;

        if (performanceScore > 70) {
            multiplier = 1.5;
        } else if (performanceScore > 40) {
            multiplier = 1.1;
        } else {
            multiplier = 0.7;
        }

        return +(baseRate * multiplier).toFixed(4);
    },


    async optimizeCampaigns() {

        try {

            var campaigns = await Database.get("campaigns") || {};
            var updates = [];

            for (var id in campaigns) {

                var campaign = campaigns[id];

                var analysis = this.analyzeCampaign(campaign);

                var newBid = this.adjustRate(
                    campaign.bid || 0.01,
                    analysis.score
                );

                updates.push(
                    Database.update("campaigns/" + id, {
                        bid: newBid,
                        performanceScore: analysis.score,
                        lastOptimized: Date.now()
                    })
                );
            }

            await Promise.all(updates);

            log("Campaigns Optimized");

            return true;

        } catch (err) {

            errorLog("Optimization Error:", err);
            return false;
        }
    },


    async optimizeUsers() {

        try {

            var users = await Database.get("users") || {};
            var updates = [];

            for (var id in users) {

                var user = users[id];

                var ctr = calculateCTR(user.clicks, user.views);

                var rewardMultiplier = 1;

                if (ctr > 10) rewardMultiplier = 1.2;
                if (ctr < 1) rewardMultiplier = 0.8;
                if ((user.riskScore || 0) > 70) rewardMultiplier = 0.5;

                updates.push(
                    Database.update("users/" + id, {
                        rewardMultiplier: rewardMultiplier,
                        lastOptimized: Date.now()
                    })
                );
            }

            await Promise.all(updates);

            log("Users Optimized");

            return true;

        } catch (err) {

            errorLog("User Optimization Error:", err);
            return false;
        }
    },


    runFullOptimization: async function() {

        var c = await this.optimizeCampaigns();
        var u = await this.optimizeUsers();

        return {
            campaignsOptimized: c,
            usersOptimized: u,
            timestamp: Date.now()
        };
    }
};


// ==========================================
// SELF LEARNING SYSTEM
// ==========================================

var AILearning = {

    memory: {
        users: {},
        campaigns: {}
    },


    trackUser: function(user) {

        user = user || {};

        if (!user.id) return;

        this.memory.users[user.id] = {
            ctr: calculateCTR(user.clicks, user.views),
            risk: user.riskScore || 0,
            adScore: user.adScore || 0,
            lastSeen: Date.now()
        };
    },


    trackCampaign: function(campaign) {

        campaign = campaign || {};

        if (!campaign.id) return;

        var stats = campaign.stats || {};

        this.memory.campaigns[campaign.id] = {
            ctr: calculateCTR(stats.clicks, stats.views),
            lastSeen: Date.now()
        };
    },


    getInsights: function() {

        return {
            users: Object.keys(this.memory.users).length,
            campaigns: Object.keys(this.memory.campaigns).length
        };
    },


    cleanOldData: function(maxAge) {

        maxAge = maxAge || (24 * 60 * 60 * 1000);

        var now = Date.now();

        for (var u in this.memory.users) {
            if (now - this.memory.users[u].lastSeen > maxAge) {
                delete this.memory.users[u];
            }
        }

        for (var c in this.memory.campaigns) {
            if (now - this.memory.campaigns[c].lastSeen > maxAge) {
                delete this.memory.campaigns[c];
            }
        }

        log("Learning memory cleaned");
    }
};


// ==========================================
// SAFE HOOK INTEGRATION (FIXED)
// ==========================================

// بدلاً من Hooks.onUserUpdate.push
safePushHook("onUserUpdate", function(user) {
    AILearning.trackUser(user);
});


// ==========================================
// SYSTEM INIT HOOK SAFE
// ==========================================

safePushHook("onSystemInit", function() {
    AILearning.cleanOldData();
});


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.AIOptimizer = AIOptimizer;
window.AILearning = AILearning;
window.safePushHook = safePushHook;

// ==========================================
// SCHEDULER CONFIG
// ==========================================

const SCHEDULER_CONFIG = Object.freeze({

    optimizationInterval: 5 * 60 * 1000,
    heartbeatInterval: 60 * 1000,
    healthCheckInterval: 2 * 60 * 1000
});


// ==========================================
// SCHEDULER STATE
// ==========================================

const SchedulerState = {

    running: false,

    timers: {
        optimization: null,
        heartbeat: null,
        health: null
    },

    stats: {
        lastOptimization: 0,
        lastHeartbeat: 0,
        lastHealthCheck: 0,
        totalOptimizations: 0
    }
};


// ==========================================
// SAFE SCHEDULER ENGINE
// ==========================================

const AIScheduler = {

    start() {

        if (SchedulerState.running) return;

        SchedulerState.running = true;

        Utils.log("Scheduler started");

        this._startOptimizationLoop();
        this._startHeartbeat();
        this._startHealthCheck();
    },


    _startOptimizationLoop() {

        SchedulerState.timers.optimization = setInterval(async () => {

            try {

                const result = await AIOptimizer.runFullOptimization();

                SchedulerState.stats.lastOptimization = Date.now();
                SchedulerState.stats.totalOptimizations++;

                Utils.log("Optimization done", result);

            } catch (err) {

                Utils.error("Optimization error:", err);
            }

        }, SCHEDULER_CONFIG.optimizationInterval);
    },


    _startHeartbeat() {

        SchedulerState.timers.heartbeat = setInterval(() => {

            SchedulerState.stats.lastHeartbeat = Date.now();

            Utils.log("Heartbeat OK");

        }, SCHEDULER_CONFIG.heartbeatInterval);
    },


    _startHealthCheck() {

        SchedulerState.timers.health = setInterval(() => {

            const now = Date.now();

            const last = SchedulerState.stats.lastOptimization;

            if (last && now - last > 10 * 60 * 1000) {
                Utils.error("Optimization delayed");
            }

            SchedulerState.stats.lastHealthCheck = now;

        }, SCHEDULER_CONFIG.healthCheckInterval);
    },


    stop() {

        Object.values(SchedulerState.timers).forEach(timer => {
            if (timer) clearInterval(timer);
        });

        SchedulerState.running = false;

        Utils.log("Scheduler stopped");
    },


    getStatus() {

        return {
            ...SchedulerState.stats,
            running: SchedulerState.running
        };
    }
};


// ==========================================
// BACKGROUND ENGINE (TASK MANAGER)
// ==========================================

const BackgroundEngine = {

    tasks: new Map(),


    addTask(name, fn, interval) {

        if (this.tasks.has(name)) return;

        const timer = setInterval(async () => {

            try {

                await fn();

            } catch (err) {

                Utils.error(`Task error [${name}]`, err);
            }

        }, interval);

        this.tasks.set(name, timer);

        Utils.log("Task added:", name);
    },


    removeTask(name) {

        const timer = this.tasks.get(name);

        if (timer) {
            clearInterval(timer);
            this.tasks.delete(name);
        }
    },


    clearAll() {

        for (const [name, timer] of this.tasks) {
            clearInterval(timer);
        }

        this.tasks.clear();

        Utils.log("All tasks cleared");
    }
};


// ==========================================
// VISIBILITY SAFETY (IMPORTANT FOR MOBILE)
// ==========================================

document.addEventListener("visibilitychange", () => {

    if (document.hidden) {

        Utils.log("Tab hidden → pausing non-critical tasks");

    } else {

        Utils.log("Tab active → resuming tasks");
    }
});


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.AIScheduler = AIScheduler;
window.BackgroundEngine = BackgroundEngine;


// ==========================================
// SAFE GLOBAL HELPERS
// ==========================================

window.startScheduler = () => AIScheduler.start();
window.stopScheduler = () => AIScheduler.stop();
window.getSchedulerStatus = () => AIScheduler.getStatus();

// ==========================================
// SAFE HOOK GUARD
// ==========================================

if (!window.Hooks) {
    window.Hooks = {};
}

function safePushHook(name, fn) {

    if (!Hooks[name]) {
        Hooks[name] = [];
    }

    Hooks[name].push(fn);
}



// ==========================================
// MAIN SYSTEM CONTROLLER
// ==========================================

const AppSystem = {

    initialized: false,

    start: async function () {

        if (this.initialized) {
            warn("System already started");
            return;
        }

        try {

            log("SYSTEM BOOTING...");

            // ✅ هذا مسموح فقط داخل async function
            var appReady = await AppEngine.init();

            if (!appReady) {
                throw new Error("App initialization failed");
            }

            if (window.AppRouter && typeof AppRouter.bindEvents === "function") {
                AppRouter.bindEvents();
            }

            if (window.AppEvents && typeof AppEvents.bind === "function") {
                AppEvents.bind();
            }

            if (typeof refreshUI === "function") {
                refreshUI();
            }

            if (window.AppRouter && typeof AppRouter.navigateTo === "function") {
                AppRouter.navigateTo("home");
            }

            this.startBackgroundTasks();

            this.initialized = true;

            log("SYSTEM READY");

        } catch (err) {

            errorLog("SYSTEM FAILURE:", err);

            if (window.UI && UI.showAlert) {
                UI.showAlert("System failed to start", "error");
            }
        }
    },

    startBackgroundTasks: function () {

        if (!window.BackgroundEngine) return;

        BackgroundEngine.addTask(
            "ui_refresh",
            function () {
                if (typeof refreshUI === "function") {
                    refreshUI();
                }
            },
            10000
        );

        BackgroundEngine.addTask(
            "user_tracking",
            function () {
                if (state && state.user && state.user.id) {
                    if (window.AILearning) {
                        AILearning.trackUser(state.user);
                    }
                }
            },
            15000
        );
    }
};


// ==========================================
// GLOBAL ERROR HANDLING
// ==========================================

window.addEventListener("error", function(e) {
    errorLog("Global Error:", e.message);
});

window.addEventListener("unhandledrejection", function(e) {
    errorLog("Promise Error:", e.reason);
});


// ==========================================
// TELEGRAM SAFE INIT
// ==========================================

function initTelegramSafety() {

    var tg = window.Telegram && window.Telegram.WebApp;

    if (!tg) return;

    try {
        tg.ready && tg.ready();
        tg.expand && tg.expand();
    } catch (err) {
        warn("Telegram init failed");
    }
}


// ==========================================
// APP ENTRY POINT (MAIN BOOTSTRAP)
// ==========================================

function initApp() {

    try {

        console.log("🚀 SYSTEM BOOTING...");

        // ==========================================
        // TELEGRAM INIT
        // ==========================================
        if (window.Telegram?.WebApp) {

            try {

                Telegram.WebApp.ready();
                Telegram.WebApp.expand();

            } catch (e) {

                console.warn("Telegram init failed");
            }
        }

        // ==========================================
        // SMART LANGUAGE SYSTEM
        // ==========================================
        if (window.IntlService) {

            try {

                IntlService.applyLanguage();

            } catch (e) {

                console.warn("Language init failed");
            }
        }

        // ==========================================
        // APP SYSTEM
        // ==========================================
        if (window.AppSystem && typeof AppSystem.start === "function") {

            AppSystem.start();

        } else {

            console.warn("AppSystem not found");
        }

        // ==========================================
        // AI SCHEDULER
        // ==========================================
        if (window.startAIScheduler &&
            typeof startAIScheduler === "function") {

            startAIScheduler();
        }

        console.log("✅ SYSTEM READY");

    } catch (e) {

        console.error("❌ SYSTEM INIT ERROR:", e);
    }
}

// ==========================================
// AUTO START
// ==========================================

document.addEventListener("DOMContentLoaded", function () {

    try {

        // 🌍 تشغيل الترجمة
        if (window.AppI18n) {

            AppI18n.init();
        }

        // 🛡 Telegram Safety
        if (typeof initTelegramSafety === "function") {

            initTelegramSafety();
        }

        // 🚀 تشغيل التطبيق
        if (typeof initApp === "function") {

            initApp();
        }

    } catch (e) {

        console.error("DOM INIT ERROR:", e);
    }

});

// ==========================================
// DEBUG TOOLS
// ==========================================

window.AppDebug = {

    restart: function() {
        location.reload();
    },

    state: function() {
        return state;
    },

    scheduler: function() {
        return getSchedulerStatus ? getSchedulerStatus() : null;
    },

    stopAI: function() {
        stopAIScheduler && stopAIScheduler();
    },

    startAI: function() {
        startAIScheduler && startAIScheduler();
    }
};


// ==========================================
// SYSTEM INIT HOOK SAFE
// ==========================================

safePushHook("onSystemInit", function() {
    log("System Init Hook Triggered");
});
