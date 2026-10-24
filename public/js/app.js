document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Telegram WebApp SDK
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.ready();
        tg.expand();
        
        // Telegram Theme Synchronization
        document.body.setAttribute('data-theme', tg.colorScheme);
        if (tg.initDataUnsafe?.user) {
            const user = tg.initDataUnsafe.user;
            document.getElementById('user-name').textContent = user.first_name + (user.last_name ? ' ' + user.last_name : '');
            document.getElementById('user-avatar').textContent = user.first_name.charAt(0);
        }
    }

    // 2. Navigation Tabs Logic
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // 3. Render Initial Data
    ShortenerModule.render();
    AdsModule.render();
    WalletModule.render();
    AdminModule.render();
    UI.initAccordion();
    setLanguage('ar');

    // 4. Admin Toggle Logic
    const adminBtn = document.getElementById('admin-toggle-btn');
    adminBtn.addEventListener('click', () => {
        tabContents.forEach(c => c.classList.remove('active'));
        document.getElementById('sec-admin').classList.add('active');
    });

    // 5. Deposit / Withdraw Bottom Sheet Triggers
    document.getElementById('btn-deposit').addEventListener('click', () => {
        UI.openBottomSheet(`
            <h3>إيداع رصيد جديد</h3>
            <p style="font-size:12px; color:var(--tg-color-hint); margin-bottom:12px;">اختر طريقة الدفع المناسبة للشحن:</p>
            <button class="tg-button" style="width:100%; margin-bottom:8px;">Telegram Stars ⭐️</button>
            <button class="tg-button secondary" style="width:100%;">CryptoBot (USDT) 💎</button>
        `);
    });

    document.getElementById('btn-withdraw').addEventListener('click', () => {
        UI.openBottomSheet(`
            <h3>سحب الأرباح</h3>
            <input type="number" placeholder="المبلغ ($)" class="tg-input" style="width:100%; margin:12px 0;">
            <button class="tg-button" style="width:100%;">تأكيد طلب السحب</button>
        `);
    });

    // 6. Language Switcher Trigger
    document.getElementById('lang-select').addEventListener('change', (e) => {
        setLanguage(e.target.value);
    });
});
