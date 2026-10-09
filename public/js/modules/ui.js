const UI = {
  elements: {
    headerProfileTrigger: document.getElementById('headerProfileTrigger'),
    headerAvatar: document.getElementById('headerAvatar'),
    headerUserName: document.getElementById('headerUserName'),
    headerUserId: document.getElementById('headerUserId'),
    headerBalance: document.getElementById('headerBalance'),
    profileModal: document.getElementById('profileModal'),
    closeProfileModal: document.getElementById('closeProfileModal'),
    modalAvatar: document.getElementById('modalAvatar'),
    modalUserName: document.getElementById('modalUserName'),
    modalUserId: document.getElementById('modalUserId'),
    faqBtn: document.getElementById('faqBtn'),
    faqModal: document.getElementById('faqModal'),
    closeFaqModal: document.getElementById('closeFaqModal'),
    toggleLanguageBtn: document.getElementById('toggleLanguageBtn')
  },

  init() {
    this.elements.headerProfileTrigger.addEventListener('click', () => {
      this.elements.profileModal.classList.add('active');
    });

    this.elements.closeProfileModal.addEventListener('click', () => {
      this.elements.profileModal.classList.remove('active');
    });

    this.elements.faqBtn.addEventListener('click', () => {
      this.elements.faqModal.classList.add('active');
    });

    this.elements.closeFaqModal.addEventListener('click', () => {
      this.elements.faqModal.classList.remove('active');
    });

    this.elements.toggleLanguageBtn.addEventListener('click', () => {
      toggleLanguage();
    });
  },

  updateUserData(user) {
    const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
    const letter = name.charAt(0).toUpperCase();

    this.elements.headerAvatar.innerText = letter;
    this.elements.headerUserName.innerText = name;
    this.elements.headerUserId.innerText = user.username ? `@${user.username}` : `ID: ${user.telegramId}`;
    this.elements.headerBalance.innerText = `$${user.balance.toFixed(2)}`;

    this.elements.modalAvatar.innerText = letter;
    this.elements.modalUserName.innerText = name;
    this.elements.modalUserId.innerText = `ID: ${user.telegramId}`;
  }
};
