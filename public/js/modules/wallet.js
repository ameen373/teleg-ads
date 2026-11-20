(function () {
  const WalletModule = {
    init() {
      const depositForm = document.getElementById('deposit-form');
      depositForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const amount = document.getElementById('deposit-amount').value;
          await window.Api.requestDeposit(amount);
          depositForm.reset();
          window.UI.haptic('medium');
          await window.App.refreshUserData();
        } catch (err) {
          window.UI.notify(err.message);
        }
      });

      const withdrawForm = document.getElementById('withdraw-form');
      withdrawForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const amount = document.getElementById('withdraw-amount').value;
          const address = document.getElementById('withdraw-address').value;
          await window.Api.requestWithdraw(amount, address);
          withdrawForm.reset();
          window.UI.haptic('medium');
          await window.App.refreshUserData();
        } catch (err) {
          window.UI.notify(err.message);
        }
      });

      const copyBtn = document.getElementById('copy-ref-btn');
      copyBtn.addEventListener('click', () => {
        const input = document.getElementById('referral-link-input');
        input.select();
        navigator.clipboard.writeText(input.value);
        window.UI.notify(window.I18n.t('copied_msg'));
      });
    },

    render(user) {
      document.getElementById('wallet-earnings-balance').textContent = `$${user.balance.toFixed(2)}`;
      document.getElementById('wallet-ad-balance').textContent = `$${user.adBalance.toFixed(2)}`;
      document.getElementById('ref-count').textContent = user.referralsCount;
      document.getElementById('ref-earnings').textContent = `$${user.referralEarnings.toFixed(2)}`;

      const botUsername = window.Telegram?.WebApp?.initDataUnsafe?.receiver?.username || 'YourBotUsername';
      document.getElementById('referral-link-input').value = `https://t.me/${botUsername}?startapp=ref_${user.telegramId}`;
    }
  };

  window.WalletModule = WalletModule;
})();
