const en = {
  // Navigation
  nav_home: "Home",
  nav_wallet: "Wallet",
  nav_ads: "Ads",
  nav_referral: "Referrals",
  nav_settings: "Settings",
  nav_admin: "Admin",

  // Stats & Dashboard
  pending_bal: "Pending Balance",
  avail_bal: "Available Balance",
  stat_total_links: "Shortened Links",
  stat_total_clicks: "Total Clicks",
  stat_total_earnings: "Total Earnings",

  // Links & Shortener
  create_link_title: "Shorten New Link",
  ph_link_title: "Title (Optional)",
  ph_link_url: "Original URL (https://...)",
  btn_shorten: "Shorten Link Now",
  my_links_title: "Your Links",
  search_placeholder: "Search...",
  no_links: "No shortened links found.",
  enter_url: "Please enter original URL",
  shorten_failed: "Failed to create short link",
  delete_confirm: "Are you sure you want to delete this link?",
  delete_success: "Link deleted successfully",
  delete_failed: "Failed to delete link",
  link_success_msg: "Link shortened successfully!",

  // Wallet & Deposit
  tab_deposit: "📥 Deposit",
  tab_withdraw: "📤 Withdraw",
  deposit_funds_title: "Deposit Funds (USDT)",
  deposit_modal_desc: "Enter deposit details to transfer funds to your account:",
  btn_deposit_guide: "❓ Deposit Guide",
  select_network_label: "Select Network:",
  opt_select_network: "-- Select Payment Network --",
  lbl_trc20_addr: "USDT - TRC20 Address:",
  lbl_bep20_addr: "USDT - BEP20 (BSC) Address:",
  btn_copy: "Copy",
  submit_proof_label: "Submit Deposit Proof:",
  ph_deposit_amount: "Amount ($)",
  ph_deposit_txid: "Transaction TxID / Hash",
  btn_submit_deposit: "Submit Deposit Request",
  select_network: "Please select payment network",
  min_deposit: "Minimum deposit amount is $1",
  enter_txid: "Please enter transaction TxID / Hash",
  deposit_success: "Deposit request submitted successfully!",

  // Withdrawal
  withdraw_request_title: "Withdraw Earnings",
  withdraw_modal_desc: "Minimum withdrawal is $30 with a $3 transaction fee.",
  wallet_addr_label: "Withdrawal Wallet (USDT TRC20)",
  ph_wallet_addr: "Enter wallet address",
  ph_withdraw_amount: "Amount (Min. $30)",
  btn_edit: "Edit",
  btn_save_wallet: "Save New Address",
  btn_submit_withdraw: "Request Withdrawal",
  withdraw_history: "Withdrawal History",
  lbl_amount: "Amount",
  lbl_fee: "Fee ($3)",
  lbl_net: "Net",
  enter_wallet: "Please enter wallet address",
  wallet_saved: "Wallet address saved",
  min_withdraw: "Minimum withdrawal is $30",
  withdraw_success: "Withdrawal requested successfully",
  no_withdraws: "No withdrawal history found.",

  // Ads Campaign
  create_ad_title: "Create New Ad Campaign",
  ad_rate_desc: "Ad Rate: $1.50 per 1,000 real impressions (CPM)",
  ph_ad_title: "Ad Title",
  ph_ad_target_url: "Target URL (https://...)",
  ph_ad_budget: "Total Budget (Min. $5)",
  btn_launch_ad: "Launch Ad Campaign",
  my_ads_title: "Your Ad Campaigns",
  no_ads: "No active ad campaigns.",
  enter_ad_title: "Please enter ad title",
  enter_target_url: "Please enter target URL",
  min_ad_budget: "Minimum campaign budget is $5",
  ad_success: "Ad campaign launched successfully!",

  // Referrals
  ref_title: "Referral System (10%)",
  ref_desc: "Invite your friends and instantly earn 10% of their total revenues.",
  btn_share_ref: "Share Link via Telegram",
  total_ref_earnings: "Total Referral Earnings",
  total_ref_count: "Referrals Count",
  ref_list_title: "Invited Users History",
  no_referrals: "No referrals registered yet.",
  share_text: "Join me on the best url shortener platform & earn money! 🚀",

  // Settings, FAQ & Support
  lang_settings_title: "Language / تغيير اللغة",
  faq_title: "FAQ & Support",
  faq_q1: "How are earnings calculated?",
  faq_a1: "Earnings depend on ad revenue and are distributed proportionally based on verified visits.",
  faq_q2: "What is the 1-day pending period?",
  faq_a2: "It is a hold period to review traffic sources and prevent fraud before transferring earnings to available balance within 24 hours.",
  support_text: "Contact technical support on Telegram:",
  support_btn_bot: "🤖 Bot",
  support_btn_channel: "📢 Channel",
  support_btn_chat: "🎧 Support",
  about_title: "ℹ️ About & Terms of Use",
  about_desc: "This platform allows you to shorten links safely and manage promotion campaigns efficiently. By using our service, you agree to our traffic quality and safety guidelines.",
  official_channel: "📢 Official Channel",

  // Bridge Page
  bridge_title: "Preparing your link...",
  bridge_desc: "Please wait while we prepare your destination link",
  ad_loading: "Loading advertisement...",
  timer_text: "Button unlocks in:",
  seconds: "seconds",
  go_button: "Continue to Destination",
  rights_reserved: "All rights reserved for",

  // Deposit Guide Modal
  guide_modal_title: "Deposit & TxID Guide",
  guide_step1_b: "Select Network:",
  guide_step1_t: "Choose USDT (TRC20 or BEP20) to reveal your dedicated deposit address and copy it.",
  guide_step2_b: "Transfer Funds:",
  guide_step2_t: "Open your exchange or wallet app (Binance, Trust Wallet, OKX) and transfer USDT.",
  guide_step3_b: "Copy Transaction Hash (TxID):",
  guide_step3_t: "After confirmation, copy the transaction Hash/TxID.",
  example_txid: "Example TxID format:",
  guide_step4_b: "Submit Request:",
  guide_step4_t: "Return here, enter the exact deposited amount and TxID, then submit.",

  // Admin Panel
  admin_total_users: "Total Users",
  admin_total_pending: "Total Pending Balances",
  admin_pending_deposits: "Pending Deposit Requests",
  admin_pending_withdraws: "Pending Withdrawal Requests",
  admin_users_mgmt: "System Users Management",
  admin_links_mgmt: "Platform Links Management",
  admin_ads_mgmt: "Platform Ads Management",
  access_denied: "Access denied",

  // General & Status
  loading: "Loading...",
  copied: "Copied successfully!",
  cancel: "Cancel",
  close: "Close",
  network_error: "Network connection error. Please check your internet connection.",
  btn_delete: "Delete",
  approved: "Approved",
  rejected: "Rejected",
  pending: "Pending"
};

if (typeof window !== 'undefined') {
  window.en = en;
}

module.exports = en;
