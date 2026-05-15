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


// ==========================================
// LOGGER
// ==========================================

function log() {

    if (
        typeof window !== "undefined" &&
        window.CONFIG &&
        CONFIG.APP &&
        CONFIG.APP.DEBUG
    ) {

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
        riskScore: 0,
        adScore: 0,
        riskLevel: "SAFE"
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

    if (!Array.isArray(list) || list.length === 0) {
        return;
    }

    for (var i = 0; i < list.length; i++) {

        try {

            if (typeof list[i] === "function") {
                list[i](payload);
            }

        } catch (err) {

            console.error("Hook error:", err);
        }
    }
}


// ==========================================
// STATE MANAGEMENT
// ==========================================

// 👤 تحديث المستخدم
function updateUser(userData, skipHooks) {

    if (!userData || typeof userData !== "object") {
        return;
    }

    skipHooks = !!skipHooks;

    for (var key in userData) {

        if (Object.prototype.hasOwnProperty.call(userData, key)) {
            state.user[key] = userData[key];
        }
    }

    state.system.lastUpdate = Date.now();

    if (!skipHooks) {
        runHooks(Hooks.onUserUpdate, state.user);
    }

    log("User Updated:", state.user);
}


// 🔹 تحديث حقل واحد
function updateUserField(key, value, skipHooks) {

    if (!key) {
        return;
    }

    skipHooks = !!skipHooks;

    state.user[key] = value;

    state.system.lastUpdate = Date.now();

    if (!skipHooks) {
        runHooks(Hooks.onUserUpdate, state.user);
    }

    log("User Field Updated:", key, value);
}


// 🎨 UI STATE UPDATE
function setUI(key, value) {

    if (!key) {
        return;
    }

    state.ui[key] = value;

    state.system.lastUpdate = Date.now();

    runHooks(Hooks.onUIUpdate, state.ui);

    log("UI Updated:", key, value);
}


// 📥 GET STATE SAFE
function getState(path) {

    if (!path || typeof path !== "string") {
        return null;
    }

    var parts = path.split(".");
    var obj = state;

    for (var i = 0; i < parts.length; i++) {

        if (
            obj === null ||
            typeof obj === "undefined"
        ) {

            return null;
        }

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
        riskScore: 0,
        adScore: 0,
        riskLevel: "SAFE"
    };

    state.ui = {
        loading: false,
        currentSection: "home",
        theme: "light"
    };

    state.system = {
        initialized: false,
        lastUpdate: Date.now()
    };

    log("State Reset");
}


// ==========================================
// METRICS
// ==========================================

function calculateCTR(clicks, views) {

    clicks = Number(clicks) || 0;
    views = Number(views) || 0;

    if (views <= 0) {
        return 0;
    }

    return (clicks / views) * 100;
}

function calculateConversion(actions, clicks) {

    actions = Number(actions) || 0;
    clicks = Number(clicks) || 0;

    if (clicks <= 0) {
        return 0;
    }

    return (actions / clicks) * 100;
}

function calculateRPM(earnings, views) {

    earnings = Number(earnings) || 0;
    views = Number(views) || 0;

    if (views <= 0) {
        return 0;
    }

    return (earnings / views) * 1000;
}


// ==========================================
// HELPERS
// ==========================================

function clamp(value, min, max) {

    value = Number(value) || 0;
    min = Number(min);

    if (isNaN(min)) {
        min = 0;
    }

    max = Number(max);

    if (isNaN(max)) {
        max = 100;
    }

    if (value < min) {
        return min;
    }

    if (value > max) {
        return max;
    }

    return value;
}


// ==========================================
// UTILITIES
// ==========================================

var Utils = {

    log: function () {
        console.log.apply(console, arguments);
    },

    warn: function () {
        console.warn.apply(console, arguments);
    },

    error: function () {
        console.error.apply(console, arguments);
    },

    deepClone: function (obj) {

        try {

            return JSON.parse(JSON.stringify(obj));

        } catch (e) {

            return null;
        }
    },

    safeMerge: function (target, source) {

        target = target || {};
        source = source || {};

        var output = {};
        var key;

        for (key in target) {

            if (Object.prototype.hasOwnProperty.call(target, key)) {
                output[key] = target[key];
            }
        }

        for (key in source) {

            if (Object.prototype.hasOwnProperty.call(source, key)) {
                output[key] = source[key];
            }
        }

        return output;
    },

    clamp: function (value, min, max) {
        return clamp(value, min, max);
    },

    isNumber: function (val) {
        return typeof val === "number" && !isNaN(val);
    },

    isString: function (val) {
        return typeof val === "string";
    },

    generateId: function (prefix) {

        prefix = prefix || "id";

        return (
            prefix +
            "_" +
            Date.now() +
            "_" +
            Math.floor(Math.random() * 100000)
        );
    }
};

// ==========================================
// VALIDATION
// ==========================================

var Validator = {

    isValidUser: function(user) {

        return !!(
            user &&
            typeof user === "object" &&
            user.id
        );
    },

    isNumber: function(val) {

        return (
            typeof val === "number" &&
            !isNaN(val)
        );
    },

    isString: function(val) {

        return typeof val === "string";
    },

    isObject: function(val) {

        return (
            val !== null &&
            typeof val === "object" &&
            !Array.isArray(val)
        );
    }
};


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
window.resetState = resetState;

window.calculateCTR = calculateCTR;
window.calculateConversion = calculateConversion;
window.calculateRPM = calculateRPM;
window.clamp = clamp;

window.log = log;
window.warn = warn;
window.errorLog = errorLog;

window.Validator = Validator;
window.Utils = Utils;


// ==========================================
// DATA LAYER
// ==========================================

var Database = {

    isFirebase: function() {

        return typeof db !== "undefined";
    },


    get: async function(path) {

        try {

            if (!path) {
                return null;
            }

            if (this.isFirebase()) {

                var snap =
                    await db.ref(path).once("value");

                return snap.val();
            }

            return null;

        } catch (err) {

            Utils.error("DB GET ERROR:", err);

            return null;
        }
    },


    set: async function(path, data) {

        try {

            if (!path) {
                return false;
            }

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


    update: async function(path, data) {

        try {

            if (!path) {
                return false;
            }

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
// USER SERVICE
// ==========================================

var UserService = {

    getUser: async function(userId) {

        if (!userId) {
            return null;
        }

        return await Database.get(
            "users/" + userId
        );
    },


    createUser: async function(userId, data) {

        data = data || {};

        if (!userId) {
            return null;
        }

        var user = {

            id: userId,

            name: data.name || "Guest",

            balance: 0,
            clicks: 0,
            views: 0,
            earnings: 0,

            riskScore: 0,
            riskLevel: "SAFE",
            adScore: 0,

            createdAt: Date.now(),

            rewardMultiplier: 1
        };

        await Database.set(
            "users/" + userId,
            user
        );

        updateUser(user, true);

        Utils.log("User created");

        return user;
    },


    updateBalance: async function(userId, amount) {

        amount = Number(amount) || 0;

        if (!Validator.isNumber(amount)) {
            return false;
        }

        var user =
            await UserService.getUser(userId);

        if (!user) {
            return false;
        }

        var newBalance =
            Number(user.balance || 0) + amount;

        await Database.update(
            "users/" + userId,
            {
                balance: newBalance,
                lastBalanceUpdate: Date.now()
            }
        );

        updateUser(
            {
                balance: newBalance
            },
            true
        );

        return true;
    }
};


// ==========================================
// CAMPAIGN SERVICE
// ==========================================

var CampaignService = {

    createCampaign: async function(userId, data) {

        data = data || {};

        if (!userId) {

            return {
                success: false,
                error: "INVALID_USER"
            };
        }

        var id =
            Utils.generateId("cmp");

        var campaign = {

            id: id,

            userId: userId,

            title:
                data.title || "Untitled",

            budget: Math.max(
                0,
                Number(data.budget) || 0
            ),

            bid: Math.max(
                0.01,
                Number(data.bid) || 0.01
            ),

            status: "active",

            stats: {
                views: 0,
                clicks: 0
            },

            performanceScore: 0,

            createdAt: Date.now()
        };

        await Database.set(
            "campaigns/" + id,
            campaign
        );

        return {
            success: true,
            campaign: campaign
        };
    },


    pauseCampaign: async function(id) {

        if (!id) {
            return false;
        }

        return await Database.update(
            "campaigns/" + id,
            {
                status: "paused",
                updatedAt: Date.now()
            }
        );
    },


    activateCampaign: async function(id) {

        if (!id) {
            return false;
        }

        return await Database.update(
            "campaigns/" + id,
            {
                status: "active",
                updatedAt: Date.now()
            }
        );
    },


    getAllCampaigns: async function() {

        var data =
            await Database.get("campaigns");

        return data || {};
    }
};


// ==========================================
// GLOBAL HELPERS FOR EVENTS
// ==========================================

async function createCampaign(userId, data) {

    return await CampaignService.createCampaign(
        userId,
        data
    );
}

async function pauseCampaign(id) {

    return await CampaignService.pauseCampaign(id);
}

async function activateCampaign(id) {

    return await CampaignService.activateCampaign(id);
}


// ==========================================
// SMART GLOBAL LANGUAGE SYSTEM
// ==========================================

var AppI18n = {

    current: "en",

    rtlLanguages: [
        "ar",
        "fa",
        "ur",
        "he"
    ],

    translations: {

        // =====================================
        // العربية
        // =====================================

        ar: {

            nav_home: "الرئيسية",
            nav_advertiser: "المعلن",
            nav_publisher: "الناشر",
            nav_referral: "الإحالة",
            nav_admin: "الإدارة",
            nav_profile: "الملف",

            home: "الرئيسية",
            profile: "الملف",
            referrals: "الإحالة",
            publisher: "الناشر",
            advertiser: "المعلن",
            admin: "الإدارة",
            welcome: "مرحبًا",
            balance: "الرصيد",

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

            ph_amount: "أدخل المبلغ",
            ph_tx_hash: "أدخل TX Hash"
        },

        // =====================================
        // ENGLISH
        // =====================================

        en: {

            nav_home: "Home",
            nav_advertiser: "Advertiser",
            nav_publisher: "Publisher",
            nav_referral: "Referrals",
            nav_admin: "Admin",
            nav_profile: "Profile",

            home: "Home",
            profile: "Profile",
            referrals: "Referrals",
            publisher: "Publisher",
            advertiser: "Advertiser",
            admin: "Admin",
            welcome: "Welcome",
            balance: "Balance",

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

            ph_amount: "Enter amount",
            ph_tx_hash: "Enter TX Hash"
        }
    }
};


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.Database = Database;
window.UserService = UserService;
window.CampaignService = CampaignService;
window.AppI18n = AppI18n;

// =====================================
// LANGUAGE ENGINE
// =====================================

AppI18n.detect = function () {

    try {

        var lang = "en";

        // Telegram language
        if (
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initDataUnsafe &&
            window.Telegram.WebApp.initDataUnsafe.user &&
            window.Telegram.WebApp.initDataUnsafe.user.language_code
        ) {

            lang =
                window.Telegram
                    .WebApp
                    .initDataUnsafe
                    .user
                    .language_code;
        }

        // Browser language
        else if (
            navigator &&
            navigator.language
        ) {

            lang = navigator.language;
        }

        lang =
            String(lang)
                .toLowerCase()
                .split("-")[0];

        if (
            !AppI18n.translations[lang]
        ) {

            lang = "en";
        }

        AppI18n.current = lang;

        return lang;

    } catch (e) {

        console.error(
            "LANG DETECT ERROR:",
            e
        );

        AppI18n.current = "en";

        return "en";
    }
};


AppI18n.setLanguage = function (lang) {

    if (
        !lang ||
        !AppI18n.translations[lang]
    ) {

        return false;
    }

    AppI18n.current = lang;

    AppI18n.apply();

    return true;
};


AppI18n.applyDirection = function () {

    var isRTL =
        AppI18n.rtlLanguages.indexOf(
            AppI18n.current
        ) !== -1;

    document.documentElement.dir =
        isRTL ? "rtl" : "ltr";

    document.documentElement.lang =
        AppI18n.current;
};


AppI18n.t = function (key) {

    if (!key) {
        return "";
    }

    if (
        AppI18n.translations[
            AppI18n.current
        ] &&
        AppI18n.translations[
            AppI18n.current
        ][key]
    ) {

        return AppI18n
            .translations[
                AppI18n.current
            ][key];
    }

    if (
        AppI18n.translations.en &&
        AppI18n.translations.en[key]
    ) {

        return AppI18n
            .translations
            .en[key];
    }

    return key;
};


AppI18n.apply = function () {

    // Text translation
    var elements =
        document.querySelectorAll(
            "[data-i18n]"
        );

    for (
        var i = 0;
        i < elements.length;
        i++
    ) {

        var el = elements[i];

        var key =
            el.getAttribute(
                "data-i18n"
            );

        el.textContent =
            AppI18n.t(key);
    }

    // Placeholder translation
    var placeholders =
        document.querySelectorAll(
            "[data-i18n-placeholder]"
        );

    for (
        var j = 0;
        j < placeholders.length;
        j++
    ) {

        var p = placeholders[j];

        var pKey =
            p.getAttribute(
                "data-i18n-placeholder"
            );

        p.placeholder =
            AppI18n.t(pKey);
    }

    AppI18n.applyDirection();
};


AppI18n.init = function () {

    AppI18n.detect();

    AppI18n.apply();

    console.log(
        "🌍 Language Loaded:",
        AppI18n.current
    );
};


// ==========================================
// UI CORE
// ==========================================

var UI = {

    showAlert: function (
        message,
        type,
        duration
    ) {

        message = message || "";
        type = type || "info";
        duration = duration || 3000;

        var el =
            document.createElement("div");

        el.className =
            "app-alert " + type;

        el.textContent = message;

        document.body.appendChild(el);

        setTimeout(function () {

            el.classList.add("show");

        }, 50);

        setTimeout(function () {

            el.classList.remove("show");

            setTimeout(function () {

                if (
                    el &&
                    el.parentNode
                ) {

                    el.parentNode.removeChild(el);
                }

            }, 300);

        }, duration);

        log("Alert:", message);
    },


    showToast: function (
        message,
        duration
    ) {

        message = message || "";
        duration = duration || 2000;

        var el =
            document.createElement("div");

        el.className = "app-toast";

        el.textContent = message;

        document.body.appendChild(el);

        setTimeout(function () {

            el.classList.add("show");

        }, 50);

        setTimeout(function () {

            el.classList.remove("show");

            setTimeout(function () {

                if (
                    el &&
                    el.parentNode
                ) {

                    el.parentNode.removeChild(el);
                }

            }, 300);

        }, duration);
    },


    setLoading: function (show) {

        var loader =
            document.getElementById(
                "app-loader"
            );

        if (!loader) {

            loader =
                document.createElement(
                    "div"
                );

            loader.id = "app-loader";

            loader.innerHTML =
                "<div class='spinner'></div>";

            document.body.appendChild(
                loader
            );
        }

        loader.style.display =
            show ? "flex" : "none";
    }
};


// ==========================================
// DOM ENGINE
// ==========================================

var DOM = {

    get: function (selector) {

        return document.querySelector(
            selector
        );
    },


    getAll: function (selector) {

        return document.querySelectorAll(
            selector
        );
    },


    on: function (
        event,
        selector,
        handler
    ) {

        document.addEventListener(
            event,
            function (e) {

                var target = e.target;

                while (
                    target &&
                    target !== document
                ) {

                    if (
                        target.matches &&
                        target.matches(selector)
                    ) {

                        handler(target, e);

                        return;
                    }

                    target =
                        target.parentElement;
                }
            }
        );
    },


    setText: function (
        selector,
        text
    ) {

        var el = this.get(selector);

        if (el) {

            el.textContent = text;
        }
    }
};


// ==========================================
// UI BINDINGS
// ==========================================

var UIBindings = {

    updateUserUI: function (user) {

        if (!user) {
            return;
        }

        DOM.setText(
            "#user-name",
            user.name || "Guest"
        );

        DOM.setText(
            "#user-balance",
            user.balance || 0
        );
    },


    updateRouteUI: function (ui) {

        if (!ui) {
            return;
        }

        var sections =
            DOM.getAll(
                "[data-section]"
            );

        for (
            var i = 0;
            i < sections.length;
            i++
        ) {

            sections[i]
                .classList
                .remove("active");

            if (
                sections[i]
                    .dataset
                    .section ===
                ui.currentSection
            ) {

                sections[i]
                    .classList
                    .add("active");
            }
        }
    }
};


// ==========================================
// SAFE HOOK REGISTER
// ==========================================

function registerHook(name, fn) {

    if (
        !name ||
        typeof fn !== "function"
    ) {

        return;
    }

    if (!Hooks[name]) {

        Hooks[name] = [];
    }

    Hooks[name].push(fn);
}


// ==========================================
// HOOK INTEGRATION
// ==========================================

registerHook(
    "onUserUpdate",
    function (user) {

        UIBindings.updateUserUI(
            user
        );
    }
);

registerHook(
    "onUIUpdate",
    function (ui) {

        UIBindings.updateRouteUI(
            ui
        );
    }
);


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

window.showAlert = function (
    msg,
    type
) {

    UI.showAlert(msg, type);
};

window.showToast = function (
    msg
) {

    UI.showToast(msg);
};

// ==========================================
// APP ENGINE
// ==========================================

var AppEngine = {

    init: async function () {

        try {

            log("Initializing App...");

            setUI("loading", true);

            if (
                window.UI &&
                typeof UI.setLoading === "function"
            ) {

                UI.setLoading(true);
            }

            // ==========================================
            // TELEGRAM
            // ==========================================

            var tg = null;

            if (
                window.Telegram &&
                window.Telegram.WebApp
            ) {

                tg = window.Telegram.WebApp;
            }

            var userId =
                CONFIG.BOT_CONFIG.ADMIN_ID;

            var userName = "Guest";

            if (
                tg &&
                tg.initDataUnsafe &&
                tg.initDataUnsafe.user
            ) {

                userId =
                    tg.initDataUnsafe.user.id ||
                    userId;

                userName =
                    tg.initDataUnsafe.user.first_name ||
                    userName;
            }

            // ==========================================
            // USER INIT
            // ==========================================

            var user = null;

            try {

                if (
                    window.UserService &&
                    typeof UserService.getUser === "function"
                ) {

                    user =
                        await UserService.getUser(
                            userId
                        );
                }

            } catch (e) {

                warn(
                    "User load failed:",
                    e
                );

                user = null;
            }

            // Create user if not exists
            if (!user) {

                try {

                    user =
                        await UserService.createUser(
                            userId,
                            {
                                name: userName
                            }
                        );

                } catch (e) {

                    warn(
                        "Create user failed:",
                        e
                    );
                }
            }

            // Update local state
            if (user) {

                updateUser(user, true);
            }

            // ==========================================
            // TELEGRAM READY
            // ==========================================

            if (tg) {

                try {

                    if (
                        typeof tg.ready === "function"
                    ) {

                        tg.ready();
                    }

                    if (
                        typeof tg.expand === "function"
                    ) {

                        tg.expand();
                    }

                } catch (e) {

                    warn(
                        "Telegram init failed"
                    );
                }
            }

            // ==========================================
            // FINISH
            // ==========================================

            state.system.initialized = true;

            state.system.lastUpdate =
                Date.now();

            setUI("loading", false);

            if (
                window.UI &&
                typeof UI.setLoading === "function"
            ) {

                UI.setLoading(false);
            }

            // ==========================================
            // RUN INIT HOOKS
            // ==========================================

            if (
                Hooks &&
                Hooks.onSystemInit
            ) {

                runHooks(
                    Hooks.onSystemInit,
                    state
                );
            }

            log("App Ready");

            return true;

        } catch (err) {

            errorLog(
                "App Init Error:",
                err
            );

            setUI("loading", false);

            if (
                window.UI &&
                typeof UI.setLoading === "function"
            ) {

                UI.setLoading(false);
            }

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
        advertiser: true,
        publisher: true,
        referrals: true,
        profile: true,
        admin: true
    },


    navigateTo: function (routeName) {

        if (
            !routeName ||
            !this.routes[routeName]
        ) {

            warn(
                "Route not found:",
                routeName
            );

            return false;
        }

        var pages =
            document.querySelectorAll(
                ".page"
            );

        for (
            var i = 0;
            i < pages.length;
            i++
        ) {

            pages[i].style.display =
                "none";
        }

        var targetPage =
            document.getElementById(
                routeName + "-page"
            );

        if (targetPage) {

            targetPage.style.display =
                "block";
        }

        setUI(
            "currentSection",
            routeName
        );

        log(
            "Navigate:",
            routeName
        );

        return true;
    }
};


// ==========================================
// APP EVENTS
// ==========================================

var AppEvents = {

    handle: async function (
        action,
        payload
    ) {

        payload = payload || {};

        try {

            switch (action) {

                // =====================================
                // NAVIGATION
                // =====================================

                case "NAVIGATE":

                    AppRouter.navigateTo(
                        payload.route
                    );

                    break;


                // =====================================
                // CREATE CAMPAIGN BOX
                // =====================================

                case "SHOW_CREATE_CAMPAIGN":

                    var createBox =
                        document.getElementById(
                            "create-campaign-box"
                        );

                    var campaignsBox =
                        document.getElementById(
                            "my-campaigns-box"
                        );

                    if (createBox) {
                        createBox.style.display =
                            "block";
                    }

                    if (campaignsBox) {
                        campaignsBox.style.display =
                            "none";
                    }

                    break;


                // =====================================
                // MY CAMPAIGNS BOX
                // =====================================

                case "SHOW_MY_CAMPAIGNS":

                    var createCampaignBox =
                        document.getElementById(
                            "create-campaign-box"
                        );

                    var myCampaignsBox =
                        document.getElementById(
                            "my-campaigns-box"
                        );

                    if (createCampaignBox) {
                        createCampaignBox.style.display =
                            "none";
                    }

                    if (myCampaignsBox) {
                        myCampaignsBox.style.display =
                            "block";
                    }

                    break;


                // =====================================
                // ADD CHANNEL BOX
                // =====================================

                case "SHOW_ADD_CHANNEL":

                    var addChannelBox =
                        document.getElementById(
                            "add-channel-box"
                        );

                    var myChannelsBox =
                        document.getElementById(
                            "my-channels-box"
                        );

                    if (addChannelBox) {
                        addChannelBox.style.display =
                            "block";
                    }

                    if (myChannelsBox) {
                        myChannelsBox.style.display =
                            "none";
                    }

                    break;


                // =====================================
                // MY CHANNELS BOX
                // =====================================

                case "SHOW_MY_CHANNELS":

                    var addBox =
                        document.getElementById(
                            "add-channel-box"
                        );

                    var channelsBox =
                        document.getElementById(
                            "my-channels-box"
                        );

                    if (addBox) {
                        addBox.style.display =
                            "none";
                    }

                    if (channelsBox) {
                        channelsBox.style.display =
                            "block";
                    }

                    break;


                // =====================================
                // CREATE CAMPAIGN
                // =====================================

                case "CREATE_CAMPAIGN":

                    var result =
                        await createCampaign(
                            state.user.id,
                            payload.data
                        );

                    if (
                        result &&
                        result.success
                    ) {

                        showAlert(
                            "Campaign Created",
                            "success"
                        );

                    } else {

                        showAlert(
                            "Failed",
                            "error"
                        );
                    }

                    break;


                // =====================================
                // PAUSE CAMPAIGN
                // =====================================

                case "PAUSE_CAMPAIGN":

                    await pauseCampaign(
                        payload.id
                    );

                    showAlert(
                        "Campaign Paused",
                        "info"
                    );

                    break;


                // =====================================
                // ACTIVATE CAMPAIGN
                // =====================================

                case "ACTIVATE_CAMPAIGN":

                    await activateCampaign(
                        payload.id
                    );

                    showAlert(
                        "Campaign Activated",
                        "success"
                    );

                    break;


                // =====================================
                // ADD BALANCE
                // =====================================

                case "ADD_BALANCE":

                    await UserService.updateBalance(
                        state.user.id,
                        payload.amount || 0
                    );

                    showAlert(
                        "Balance Updated",
                        "success"
                    );

                    break;


                // =====================================
                // REFRESH UI
                // =====================================

                case "REFRESH_UI":

                    if (
                        typeof refreshUI === "function"
                    ) {

                        refreshUI();
                    }

                    break;


                // =====================================
                // DEFAULT
                // =====================================

                default:

                    warn(
                        "Unknown action:",
                        action
                    );
            }

        } catch (err) {

            errorLog(
                "Action Error:",
                err
            );

            showAlert(
                "System Error",
                "error"
            );
        }
    }
};


// ==========================================
// GLOBAL CLICK HANDLER
// ==========================================

document.addEventListener(
    "click",
    function (e) {

        var routeEl =
            e.target.closest(
                "[data-route]"
            );

        if (
            routeEl &&
            window.AppRouter
        ) {

            AppRouter.navigateTo(
                routeEl.dataset.route
            );

            return;
        }

        var actionEl =
            e.target.closest(
                "[data-action]"
            );

        if (
            actionEl &&
            window.AppEvents
        ) {

            var action =
                actionEl.dataset.action;

            var payload = {};

            try {

                payload = JSON.parse(
                    actionEl.dataset.payload ||
                    "{}"
                );

            } catch (err) {

                payload = {};
            }

            AppEvents.handle(
                action,
                payload
            );
        }
    }
);


// ==========================================
// SYSTEM INIT HOOK
// ==========================================

registerHook(
    "onSystemInit",
    function () {

        log(
            "System Initialized Hook Fired"
        );
    }
);


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.AppEngine = AppEngine;
window.AppRouter = AppRouter;
window.AppEvents = AppEvents;

// ==========================================
// SAFE HOOK HELPERS
// ==========================================

function safePushHook(name, fn) {

    if (
        !name ||
        typeof fn !== "function"
    ) {

        return false;
    }

    if (!window.Hooks) {

        window.Hooks = {};
    }

    if (!Hooks[name]) {

        Hooks[name] = [];
    }

    Hooks[name].push(fn);

    return true;
}


// ==========================================
// ANTI FRAUD ENGINE
// ==========================================

var AntiFraud = {

    calculateRiskScore: function (user) {

        user = user || {};

        var score = 0;

        var ctr = calculateCTR(
            user.clicks,
            user.views
        );

        if (ctr > 70) {
            score += 40;
        }

        if (ctr > 90) {
            score += 60;
        }

        if (
            user.lastActions &&
            user.lastActions.length > 20
        ) {

            score += 20;
        }

        if (
            (user.ipChanges || 0) > 3
        ) {

            score += 25;
        }

        if (
            (user.referrals || 0) > 50
        ) {

            score += 30;
        }

        if (
            user.createdAt &&
            (user.withdrawals || 0) > 0
        ) {

            var age =
                Date.now() -
                user.createdAt;

            if (
                age <
                24 * 60 * 60 * 1000
            ) {

                score += 50;
            }
        }

        return clamp(
            score,
            0,
            100
        );
    },


    classify: function (score) {

        if (
            score >=
            CONFIG.AI.HIGH_RISK_THRESHOLD
        ) {

            return "HIGH_RISK";
        }

        if (score >= 50) {

            return "MEDIUM_RISK";
        }

        return "SAFE";
    },


    shouldBlock: function (score) {

        return score >= 85;
    },


    analyze: function (user) {

        var score =
            this.calculateRiskScore(
                user
            );

        return {
            score: score,
            level: this.classify(score),
            blocked:
                this.shouldBlock(score),
            safeToServeAds:
                score < 60
        };
    }
};


// ==========================================
// DECISION ENGINE
// ==========================================

var DecisionEngine = {

    scoreUser: function (user) {

        user = user || {};

        var score = 0;

        var ctr = calculateCTR(
            user.clicks,
            user.views
        );

        if (ctr >= 10) {
            score += 30;
        }

        if (ctr >= 30) {
            score += 50;
        }

        if (user.riskScore) {

            score -=
                user.riskScore * 0.5;
        }

        if (
            (user.views || 0) > 100
        ) {

            score += 20;
        }

        if (
            (user.clicks || 0) > 50
        ) {

            score += 20;
        }

        if (
            (user.earnings || 0) > 50
        ) {

            score += 15;
        }

        return clamp(
            score,
            0,
            100
        );
    },


    shouldServeAd: function (
        user
    ) {

        return (
            this.scoreUser(user) >=
            CONFIG.AI.MIN_AD_SCORE
        );
    },


    systemDecision: function (
        data
    ) {

        data = data || {};

        var user =
            data.user || {};

        return {
            allowAd:
                this.shouldServeAd(
                    user
                ),
            risk:
                user.riskScore || 0
        };
    }
};


// ==========================================
// SAFE USER ANALYSIS HOOK
// ==========================================

safePushHook(
    "onUserUpdate",
    function (user) {

        if (
            !user ||
            user._riskProcessing
        ) {

            return;
        }

        user._riskProcessing = true;

        try {

            var analysis =
                AntiFraud.analyze(
                    user
                );

            updateUser({
                riskScore:
                    analysis.score,
                riskLevel:
                    analysis.level
            });

            updateUserField(
                "adScore",
                DecisionEngine.scoreUser(
                    user
                )
            );

        } catch (err) {

            errorLog(
                "Risk Hook Error:",
                err
            );

        } finally {

            user._riskProcessing =
                false;
        }
    }
);


// ==========================================
// AI OPTIMIZER
// ==========================================

var AIOptimizer = {

    analyzeCampaign: function (
        campaign
    ) {

        campaign = campaign || {};

        var stats =
            campaign.stats || {};

        var views =
            stats.views || 0;

        var clicks =
            stats.clicks || 0;

        var ctr =
            calculateCTR(
                clicks,
                views
            );

        var score = ctr;

        if (
            (campaign.budget || 0) > 100
        ) {

            score += 10;
        }

        if (
            (campaign.budget || 0) < 10
        ) {

            score -= 10;
        }

        if (ctr < 1) {
            score -= 20;
        }

        if (ctr > 20) {
            score += 30;
        }

        return {
            ctr: ctr,
            score: clamp(
                score,
                0,
                100
            )
        };
    },


    adjustRate: function (
        baseRate,
        performanceScore
    ) {

        baseRate =
            baseRate || 0.01;

        performanceScore =
            performanceScore || 0;

        var multiplier = 1;

        if (
            performanceScore > 70
        ) {

            multiplier = 1.5;

        } else if (
            performanceScore > 40
        ) {

            multiplier = 1.1;

        } else {

            multiplier = 0.7;
        }

        return Number(
            (
                baseRate *
                multiplier
            ).toFixed(4)
        );
    },


    optimizeCampaigns:
    async function () {

        try {

            var campaigns =
                await Database.get(
                    "campaigns"
                ) || {};

            var updates = [];

            for (
                var id in campaigns
            ) {

                if (
                    !campaigns.hasOwnProperty(
                        id
                    )
                ) {

                    continue;
                }

                var campaign =
                    campaigns[id];

                var analysis =
                    this.analyzeCampaign(
                        campaign
                    );

                var newBid =
                    this.adjustRate(
                        campaign.bid || 0.01,
                        analysis.score
                    );

                updates.push(
                    Database.update(
                        "campaigns/" + id,
                        {
                            bid: newBid,
                            performanceScore:
                                analysis.score,
                            lastOptimized:
                                Date.now()
                        }
                    )
                );
            }

            await Promise.all(
                updates
            );

            log(
                "Campaigns Optimized"
            );

            return true;

        } catch (err) {

            errorLog(
                "Optimization Error:",
                err
            );

            return false;
        }
    },


    optimizeUsers:
    async function () {

        try {

            var users =
                await Database.get(
                    "users"
                ) || {};

            var updates = [];

            for (
                var id in users
            ) {

                if (
                    !users.hasOwnProperty(id)
                ) {

                    continue;
                }

                var user =
                    users[id];

                var ctr =
                    calculateCTR(
                        user.clicks,
                        user.views
                    );

                var rewardMultiplier = 1;

                if (ctr > 10) {
                    rewardMultiplier = 1.2;
                }

                if (ctr < 1) {
                    rewardMultiplier = 0.8;
                }

                if (
                    (user.riskScore || 0) > 70
                ) {

                    rewardMultiplier = 0.5;
                }

                updates.push(
                    Database.update(
                        "users/" + id,
                        {
                            rewardMultiplier:
                                rewardMultiplier,
                            lastOptimized:
                                Date.now()
                        }
                    )
                );
            }

            await Promise.all(
                updates
            );

            log(
                "Users Optimized"
            );

            return true;

        } catch (err) {

            errorLog(
                "User Optimization Error:",
                err
            );

            return false;
        }
    },


    runFullOptimization:
    async function () {

        var campaignsResult =
            await this.optimizeCampaigns();

        var usersResult =
            await this.optimizeUsers();

        return {
            campaignsOptimized:
                campaignsResult,
            usersOptimized:
                usersResult,
            timestamp: Date.now()
        };
    }
};


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.safePushHook =
    safePushHook;

window.AntiFraud =
    AntiFraud;

window.DecisionEngine =
    DecisionEngine;

window.AIOptimizer =
    AIOptimizer;
    
    // ==========================================
// AI LEARNING SYSTEM
// ==========================================

var AILearning = {

    memory: {

        users: {},
        campaigns: {}
    },


    trackUser: function (user) {

        user = user || {};

        if (!user.id) {
            return;
        }

        this.memory.users[user.id] = {

            ctr: calculateCTR(
                user.clicks,
                user.views
            ),

            risk:
                user.riskScore || 0,

            adScore:
                user.adScore || 0,

            lastSeen:
                Date.now()
        };
    },


    trackCampaign: function (
        campaign
    ) {

        campaign = campaign || {};

        if (!campaign.id) {
            return;
        }

        var stats =
            campaign.stats || {};

        this.memory.campaigns[
            campaign.id
        ] = {

            ctr: calculateCTR(
                stats.clicks,
                stats.views
            ),

            lastSeen:
                Date.now()
        };
    },


    getInsights: function () {

        return {

            users:
                Object.keys(
                    this.memory.users
                ).length,

            campaigns:
                Object.keys(
                    this.memory.campaigns
                ).length
        };
    },


    cleanOldData: function (
        maxAge
    ) {

        maxAge =
            maxAge ||
            (
                24 *
                60 *
                60 *
                1000
            );

        var now = Date.now();

        // Clean users
        for (
            var userId
            in this.memory.users
        ) {

            if (
                !this.memory.users
                    .hasOwnProperty(
                        userId
                    )
            ) {

                continue;
            }

            if (
                now -
                this.memory.users[
                    userId
                ].lastSeen >
                maxAge
            ) {

                delete this.memory
                    .users[userId];
            }
        }

        // Clean campaigns
        for (
            var campaignId
            in this.memory.campaigns
        ) {

            if (
                !this.memory.campaigns
                    .hasOwnProperty(
                        campaignId
                    )
            ) {

                continue;
            }

            if (
                now -
                this.memory.campaigns[
                    campaignId
                ].lastSeen >
                maxAge
            ) {

                delete this.memory
                    .campaigns[
                        campaignId
                    ];
            }
        }

        log(
            "Learning memory cleaned"
        );
    }
};


// ==========================================
// AI LEARNING HOOKS
// ==========================================

safePushHook(
    "onUserUpdate",
    function (user) {

        try {

            AILearning.trackUser(
                user
            );

        } catch (err) {

            errorLog(
                "Track User Error:",
                err
            );
        }
    }
);


safePushHook(
    "onSystemInit",
    function () {

        try {

            AILearning.cleanOldData();

        } catch (err) {

            errorLog(
                "Clean Memory Error:",
                err
            );
        }
    }
);


// ==========================================
// SCHEDULER CONFIG
// ==========================================

var SCHEDULER_CONFIG =
    Object.freeze({

        optimizationInterval:
            5 * 60 * 1000,

        heartbeatInterval:
            60 * 1000,

        healthCheckInterval:
            2 * 60 * 1000
    });


// ==========================================
// SCHEDULER STATE
// ==========================================

var SchedulerState = {

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
// AI SCHEDULER
// ==========================================

var AIScheduler = {

    start: function () {

        if (
            SchedulerState.running
        ) {

            return;
        }

        SchedulerState.running =
            true;

        Utils.log(
            "Scheduler started"
        );

        this._startOptimizationLoop();

        this._startHeartbeat();

        this._startHealthCheck();
    },


    _startOptimizationLoop:
    function () {

        SchedulerState
            .timers
            .optimization =
            setInterval(
                async function () {

                    try {

                        var result =
                            await AIOptimizer
                                .runFullOptimization();

                        SchedulerState
                            .stats
                            .lastOptimization =
                            Date.now();

                        SchedulerState
                            .stats
                            .totalOptimizations++;

                        Utils.log(
                            "Optimization done",
                            result
                        );

                    } catch (err) {

                        Utils.error(
                            "Optimization error:",
                            err
                        );
                    }

                },
                SCHEDULER_CONFIG
                    .optimizationInterval
            );
    },


    _startHeartbeat:
    function () {

        SchedulerState
            .timers
            .heartbeat =
            setInterval(
                function () {

                    SchedulerState
                        .stats
                        .lastHeartbeat =
                        Date.now();

                    Utils.log(
                        "Heartbeat OK"
                    );

                },
                SCHEDULER_CONFIG
                    .heartbeatInterval
            );
    },


    _startHealthCheck:
    function () {

        SchedulerState
            .timers
            .health =
            setInterval(
                function () {

                    var now =
                        Date.now();

                    var last =
                        SchedulerState
                            .stats
                            .lastOptimization;

                    if (
                        last &&
                        now - last >
                        10 * 60 * 1000
                    ) {

                        Utils.error(
                            "Optimization delayed"
                        );
                    }

                    SchedulerState
                        .stats
                        .lastHealthCheck =
                        now;

                },
                SCHEDULER_CONFIG
                    .healthCheckInterval
            );
    },


    stop: function () {

        var timers =
            SchedulerState.timers;

        for (
            var key in timers
        ) {

            if (
                timers.hasOwnProperty(
                    key
                )
            ) {

                if (timers[key]) {

                    clearInterval(
                        timers[key]
                    );
                }
            }
        }

        SchedulerState.running =
            false;

        Utils.log(
            "Scheduler stopped"
        );
    },


    getStatus: function () {

        return {

            lastOptimization:
                SchedulerState
                    .stats
                    .lastOptimization,

            lastHeartbeat:
                SchedulerState
                    .stats
                    .lastHeartbeat,

            lastHealthCheck:
                SchedulerState
                    .stats
                    .lastHealthCheck,

            totalOptimizations:
                SchedulerState
                    .stats
                    .totalOptimizations,

            running:
                SchedulerState
                    .running
        };
    }
};


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.AILearning =
    AILearning;

window.AIScheduler =
    AIScheduler;

window.SchedulerState =
    SchedulerState;

window.SCHEDULER_CONFIG =
    SCHEDULER_CONFIG;
    
    // ==========================================
// BACKGROUND ENGINE
// ==========================================

var BackgroundEngine = {

    tasks: {},


    addTask: function (
        name,
        fn,
        interval
    ) {

        if (
            !name ||
            typeof fn !== "function" ||
            !interval
        ) {

            return false;
        }

        if (
            this.tasks[name]
        ) {

            return false;
        }

        var timer =
            setInterval(
                async function () {

                    try {

                        await fn();

                    } catch (err) {

                        Utils.error(
                            "Task error [" +
                            name +
                            "]",
                            err
                        );
                    }

                },
                interval
            );

        this.tasks[name] = timer;

        Utils.log(
            "Task added:",
            name
        );

        return true;
    },


    removeTask: function (
        name
    ) {

        if (
            !this.tasks[name]
        ) {

            return false;
        }

        clearInterval(
            this.tasks[name]
        );

        delete this.tasks[name];

        Utils.log(
            "Task removed:",
            name
        );

        return true;
    },


    clearAll: function () {

        for (
            var name
            in this.tasks
        ) {

            if (
                this.tasks
                    .hasOwnProperty(
                        name
                    )
            ) {

                clearInterval(
                    this.tasks[name]
                );
            }
        }

        this.tasks = {};

        Utils.log(
            "All tasks cleared"
        );
    }
};


// ==========================================
// PAGE VISIBILITY HANDLER
// ==========================================

document.addEventListener(
    "visibilitychange",
    function () {

        if (document.hidden) {

            Utils.log(
                "Tab hidden → pausing non-critical tasks"
            );

        } else {

            Utils.log(
                "Tab active → resuming tasks"
            );
        }
    }
);


// ==========================================
// SAFE GLOBAL HELPERS
// ==========================================

window.startScheduler =
    function () {

        if (
            window.AIScheduler
        ) {

            AIScheduler.start();
        }
    };


window.stopScheduler =
    function () {

        if (
            window.AIScheduler
        ) {

            AIScheduler.stop();
        }
    };


window.getSchedulerStatus =
    function () {

        if (
            window.AIScheduler
        ) {

            return AIScheduler
                .getStatus();
        }

        return null;
    };


// ==========================================
// MAIN SYSTEM CONTROLLER
// ==========================================

var AppSystem = {

    initialized: false,


    start: async function () {

        if (
            this.initialized
        ) {

            warn(
                "System already started"
            );

            return false;
        }

        try {

            log(
                "SYSTEM BOOTING..."
            );

            // ==========================================
            // APP INIT
            // ==========================================

            var appReady =
                await AppEngine.init();

            if (!appReady) {

                throw new Error(
                    "App initialization failed"
                );
            }

            // ==========================================
            // ROUTER INIT
            // ==========================================

            if (
                window.AppRouter &&
                typeof AppRouter
                    .navigateTo ===
                    "function"
            ) {

                AppRouter.navigateTo(
                    "home"
                );
            }

            // ==========================================
            // REFRESH UI
            // ==========================================

            if (
                typeof refreshUI ===
                "function"
            ) {

                refreshUI();
            }

            // ==========================================
            // START TASKS
            // ==========================================

            this.startBackgroundTasks();

            this.initialized =
                true;

            log(
                "SYSTEM READY"
            );

            return true;

        } catch (err) {

            errorLog(
                "SYSTEM FAILURE:",
                err
            );

            if (
                window.UI &&
                typeof UI.showAlert ===
                "function"
            ) {

                UI.showAlert(
                    "System failed to start",
                    "error"
                );
            }

            return false;
        }
    },


    startBackgroundTasks:
    function () {

        if (
            !window.BackgroundEngine
        ) {

            return;
        }

        // ==========================================
        // UI REFRESH
        // ==========================================

        BackgroundEngine.addTask(
            "ui_refresh",

            function () {

                if (
                    typeof refreshUI ===
                    "function"
                ) {

                    refreshUI();
                }
            },

            10000
        );

        // ==========================================
        // USER TRACKING
        // ==========================================

        BackgroundEngine.addTask(
            "user_tracking",

            function () {

                if (
                    state &&
                    state.user &&
                    state.user.id &&
                    window.AILearning
                ) {

                    AILearning.trackUser(
                        state.user
                    );
                }
            },

            15000
        );
    }
};


// ==========================================
// GLOBAL EXPORTS
// ==========================================

window.BackgroundEngine =
    BackgroundEngine;

window.AppSystem =
    AppSystem;
    
    // ==========================================
// GLOBAL ERROR HANDLING
// ==========================================

window.addEventListener(
    "error",
    function (e) {

        errorLog(
            "Global Error:",
            e.message
        );
    }
);


window.addEventListener(
    "unhandledrejection",
    function (e) {

        errorLog(
            "Promise Error:",
            e.reason
        );
    }
);


// ==========================================
// TELEGRAM SAFE INIT
// ==========================================

function initTelegramSafety() {

    var tg = null;

    if (
        window.Telegram &&
        window.Telegram.WebApp
    ) {

        tg = window.Telegram.WebApp;
    }

    if (!tg) {
        return;
    }

    try {

        if (
            typeof tg.ready ===
            "function"
        ) {

            tg.ready();
        }

        if (
            typeof tg.expand ===
            "function"
        ) {

            tg.expand();
        }

    } catch (err) {

        warn(
            "Telegram init failed"
        );
    }
}


// ==========================================
// APP ENTRY POINT
// ==========================================

function initApp() {

    try {

        console.log(
            "🚀 SYSTEM BOOTING..."
        );

        // ==========================================
        // TELEGRAM INIT
        // ==========================================

        if (
            window.Telegram &&
            window.Telegram.WebApp
        ) {

            try {

                if (
                    typeof Telegram
                        .WebApp
                        .ready ===
                    "function"
                ) {

                    Telegram
                        .WebApp
                        .ready();
                }

                if (
                    typeof Telegram
                        .WebApp
                        .expand ===
                    "function"
                ) {

                    Telegram
                        .WebApp
                        .expand();
                }

            } catch (e) {

                console.warn(
                    "Telegram init failed"
                );
            }
        }

        // ==========================================
        // LANGUAGE SYSTEM
        // ==========================================

        if (
            window.AppI18n &&
            typeof AppI18n.init ===
            "function"
        ) {

            try {

                AppI18n.init();

            } catch (e) {

                console.warn(
                    "Language init failed"
                );
            }
        }

        // ==========================================
        // APP SYSTEM
        // ==========================================

        if (
            window.AppSystem &&
            typeof AppSystem.start ===
            "function"
        ) {

            AppSystem.start();

        } else {

            console.warn(
                "AppSystem not found"
            );
        }

        // ==========================================
        // AI SCHEDULER
        // ==========================================

        if (
            window.startScheduler &&
            typeof startScheduler ===
            "function"
        ) {

            startScheduler();
        }

        console.log(
            "✅ SYSTEM READY"
        );

    } catch (e) {

        console.error(
            "❌ SYSTEM INIT ERROR:",
            e
        );
    }
}


// ==========================================
// AUTO START
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    function () {

        try {

            // ==========================================
            // LANGUAGE
            // ==========================================

            if (
                window.AppI18n
            ) {

                AppI18n.init();
            }

            // ==========================================
            // TELEGRAM
            // ==========================================

            if (
                typeof initTelegramSafety ===
                "function"
            ) {

                initTelegramSafety();
            }

            // ==========================================
            // APP START
            // ==========================================

            if (
                typeof initApp ===
                "function"
            ) {

                initApp();
            }

        } catch (e) {

            console.error(
                "DOM INIT ERROR:",
                e
            );
        }
    }
);


// ==========================================
// DEBUG TOOLS
// ==========================================

window.AppDebug = {

    restart: function () {

        location.reload();
    },


    state: function () {

        return state;
    },


    scheduler: function () {

        if (
            typeof getSchedulerStatus ===
            "function"
        ) {

            return getSchedulerStatus();
        }

        return null;
    },


    stopAI: function () {

        if (
            typeof stopScheduler ===
            "function"
        ) {

            stopScheduler();
        }
    },


    startAI: function () {

        if (
            typeof startScheduler ===
            "function"
        ) {

            startScheduler();
        }
    }
};


// ==========================================
// SYSTEM INIT HOOK
// ==========================================

safePushHook(
    "onSystemInit",
    function () {

        log(
            "System Init Hook Triggered"
        );
    }
);


// ==========================================
// FINAL GLOBAL EXPORTS
// ==========================================

window.initApp =
    initApp;

window.initTelegramSafety =
    initTelegramSafety;
