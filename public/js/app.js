/* ==========================================================================
   1. TELEGRAM THEME VARIABLES & ROOT CONFIG
   ========================================================================== */
:root {
  /* Telegram Theme Bridge with Fallbacks */
  --bg-main: var(--tg-theme-bg-color, #0b0f19);
  --bg-secondary: var(--tg-theme-secondary-bg-color, #151d30);
  --card-bg: var(--tg-theme-secondary-bg-color, #151d30);
  --card-border: rgba(255, 255, 255, 0.08);
  
  --accent: var(--tg-theme-button-color, #3b82f6);
  --accent-hover: #2563eb;
  --accent-glow: rgba(59, 130, 246, 0.35);
  --accent-text: var(--tg-theme-button-text-color, #ffffff);
  
  --danger: var(--tg-theme-destructive-text-color, #ef4444);
  --danger-hover: #dc2626;
  --success: #10b981;
  --success-hover: #059669;
  --warning: #f59e0b;
  --warning-hover: #d97706;
  
  --text: var(--tg-theme-text-color, #f8fafc);
  --text-muted: var(--tg-theme-hint-color, #94a3b8);
  --text-link: var(--tg-theme-link-color, #3b82f6);
  
  --nav-bg: var(--tg-theme-secondary-bg-color, rgba(11, 15, 25, 0.88));
  --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
}

/* Light Theme Enhancements for Telegram Light Mode */
@media (prefers-color-scheme: light) {
  :root {
    --card-border: rgba(0, 0, 0, 0.08);
    --accent-glow: rgba(59, 130, 246, 0.15);
  }
}

/* ==========================================================================
   2. GLOBAL RESET & BASE STYLES
   ========================================================================== */
* { 
  box-sizing: border-box; 
  -webkit-tap-highlight-color: transparent; 
  outline: none; 
}

html, body {
  width: 100%;
  min-height: 100vh;
}

body { 
  font-family: var(--font-family); 
  background: var(--bg-main); 
  color: var(--text); 
  margin: 0; 
  padding: 12px; 
  padding-bottom: calc(90px + var(--safe-area-bottom));
  direction: rtl;
  user-select: none;
  -webkit-user-select: none;
  overflow-x: hidden;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.container { 
  max-width: 520px; 
  margin: 0 auto; 
  width: 100%;
}

/* ==========================================================================
   3. USER PROFILE HEADER
   ========================================================================== */
.user-profile-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: var(--bg-secondary);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--card-border);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.user-avatar-img {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
}

.user-avatar-placeholder {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), #1d4ed8);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 22px;
  box-shadow: 0 4px 16px var(--accent-glow);
  flex-shrink: 0;
}

.user-badge {
  display: inline-block;
  padding: 3px 10px;
  font-size: 10px;
  font-weight: 800;
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.15);
  color: var(--accent);
  border: 1px solid var(--accent);
  letter-spacing: 0.5px;
}

/* ==========================================================================
   4. CARDS & CONTAINERS
   ========================================================================== */
.card { 
  background: var(--card-bg); 
  border-radius: 20px; 
  padding: 20px; 
  margin-bottom: 16px; 
  border: 1px solid var(--card-border); 
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); 
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s ease;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  margin-top: 0;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ==========================================================================
   5. FORM CONTROLS (INPUTS, SELECTS, TEXTAREAS)
   ========================================================================== */
.form-group {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

input, select, textarea { 
  width: 100%; 
  padding: 13px 16px; 
  border-radius: 14px; 
  border: 1px solid var(--card-border); 
  background: var(--bg-main); 
  color: var(--text); 
  font-size: 14px; 
  font-family: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

textarea {
  resize: vertical;
  min-height: 90px;
}

input:focus, select:focus, textarea:focus { 
  border-color: var(--accent); 
  box-shadow: 0 0 0 3px var(--accent-glow); 
}

input::placeholder, textarea::placeholder {
  color: var(--text-muted);
  opacity: 0.6;
}

input:disabled, select:disabled, textarea:disabled, input:read-only { 
  background: rgba(0, 0, 0, 0.2); 
  color: var(--text-muted); 
  cursor: not-allowed; 
  opacity: 0.7;
}

/* ==========================================================================
   6. BUTTONS & ACTIONS
   ========================================================================== */
button, .btn { 
  width: 100%;
  padding: 13px 16px;
  margin-top: 10px;
  border-radius: 14px;
  background: var(--accent); 
  font-weight: 700; 
  font-size: 14px;
  font-family: inherit;
  cursor: pointer; 
  border: none; 
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease; 
  color: var(--accent-text); 
  display: inline-flex; 
  align-items: center; 
  justify-content: center; 
  gap: 8px; 
  box-shadow: 0 4px 14px var(--accent-glow);
  position: relative;
}

button:hover, .btn:hover { 
  background: var(--accent-hover); 
}

button:active, .btn:active { 
  transform: scale(0.97); 
}

button:disabled, .btn:disabled { 
  background: rgba(255, 255, 255, 0.08) !important; 
  color: var(--text-muted) !important;
  cursor: not-allowed; 
  opacity: 0.5; 
  box-shadow: none !important; 
  transform: none !important;
}

/* Button Variants */
.btn-danger { 
  background: var(--danger); 
  color: #fff;
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3); 
}
.btn-danger:hover { background: var(--danger-hover); }

.btn-warning { 
  background: var(--warning); 
  color: #000; 
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3); 
}
.btn-warning:hover { background: var(--warning-hover); }

.btn-success { 
  background: var(--success); 
  color: #fff; 
  box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3); 
}
.btn-success:hover { background: var(--success-hover); }

.btn-small { 
  padding: 8px 14px; 
  font-size: 12px; 
  width: auto; 
  margin: 0; 
  border-radius: 10px; 
  box-shadow: none; 
}

/* Button Loading State */
.btn-loading {
  color: transparent !important;
  pointer-events: none;
}
.btn-loading::after {
  content: "";
  position: absolute;
  width: 18px;
  height: 18px;
  top: calc(50% - 9px);
  left: calc(50% - 9px);
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: #fff;
  animation: spin 0.8s linear infinite;
}

/* ==========================================================================
   7. TABLES (RESPONSIVE & MOBILE-FRIENDLY)
   ========================================================================== */
.table-container {
  width: 100%;
  overflow-x: auto;
  border-radius: 14px;
  border: 1px solid var(--card-border);
  margin-top: 12px;
  background: var(--bg-main);
  -webkit-overflow-scrolling: touch;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: right;
  font-size: 13px;
}

th, td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--card-border);
  white-space: nowrap;
}

th {
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

tr:last-child td {
  border-bottom: none;
}

/* ==========================================================================
   8. STATS GRID & LIST ITEMS
   ========================================================================== */
.stats-grid { 
  display: grid; 
  grid-template-columns: repeat(2, 1fr); 
  gap: 12px; 
  margin-bottom: 16px; 
}

.stat-box { 
  background: var(--bg-main); 
  padding: 16px; 
  border-radius: 16px; 
  border: 1px solid var(--card-border); 
  text-align: center; 
}

.stat-box small { 
  color: var(--text-muted); 
  font-size: 11px; 
  display: block; 
  margin-bottom: 6px; 
  font-weight: 600; 
}

.stat-box h3 { 
  margin: 0; 
  font-size: 20px; 
  color: var(--text); 
  font-weight: 800; 
}

.link-item, .ad-item { 
  background: var(--bg-main); 
  padding: 14px 16px; 
  border-radius: 16px; 
  margin-bottom: 12px; 
  border: 1px solid var(--card-border); 
  font-size: 13px; 
  transition: transform 0.2s ease, border-color 0.2s ease;
}

.link-item:hover, .ad-item:hover { 
  transform: translateY(-2px); 
  border-color: var(--accent);
}

.link-header, .ad-header { 
  display: flex; 
  justify-content: space-between; 
  align-items: center; 
  margin-bottom: 8px; 
}

.link-actions, .ad-actions { 
  display: flex; 
  justify-content: flex-end; 
  margin-top: 12px; 
  gap: 8px; 
}

/* Wallet Specifics */
.wallet-actions-nav { 
  display: flex; 
  gap: 10px; 
  margin-bottom: 16px; 
}

.wallet-action-btn {
  flex: 1; 
  padding: 12px; 
  font-size: 13px; 
  background: var(--bg-main);
  color: var(--text-muted); 
  border: 1px solid var(--card-border);
  border-radius: 14px; 
  margin: 0; 
  box-shadow: none;
}

.wallet-action-btn.active { 
  background: var(--accent); 
  color: var(--accent-text); 
  border-color: var(--accent); 
  box-shadow: 0 4px 14px var(--accent-glow); 
}

.address-card { 
  background: var(--bg-main); 
  border: 1px dashed var(--card-border); 
  border-radius: 14px; 
  padding: 14px; 
  margin-top: 12px; 
}

.address-row { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  gap: 8px; 
  margin-top: 8px; 
}

.address-text {
  font-family: 'Courier New', Courier, monospace; 
  font-size: 11px; 
  color: var(--warning); 
  word-break: break-all;
  background: rgba(0, 0, 0, 0.3); 
  padding: 10px 12px; 
  border-radius: 10px; 
  flex: 1; 
  border: 1px solid var(--card-border);
}

.fee-breakdown {
  background: var(--bg-main); 
  border: 1px solid var(--card-border); 
  border-radius: 12px;
  padding: 12px 16px; 
  margin-top: 12px; 
  font-size: 12px; 
  display: flex; 
  justify-content: space-between;
}

/* ==========================================================================
   9. MODALS & OVERLAYS
   ========================================================================== */
.modal-overlay {
  position: fixed; 
  top: 0; 
  left: 0; 
  right: 0; 
  bottom: 0;
  background: rgba(0, 0, 0, 0.75); 
  backdrop-filter: blur(8px); 
  -webkit-backdrop-filter: blur(8px);
  z-index: 10000; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  padding: 18px;
  animation: fadeIn 0.25s ease;
}

.modal-content {
  background: var(--card-bg); 
  border: 1px solid var(--card-border);
  border-radius: 24px; 
  padding: 24px; 
  max-width: 460px; 
  width: 100%; 
  max-height: 85vh; 
  overflow-y: auto;
  box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  animation: modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes modalSlideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* ==========================================================================
   10. BOTTOM NAVIGATION DOCK (FIXED TELEGRAM DOCK)
   ========================================================================== */
.tg-nav-dock {
  position: fixed;
  bottom: calc(12px + var(--safe-area-bottom));
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 24px);
  max-width: 480px;
  height: 64px;
  background: var(--nav-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 32px;
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  z-index: 9999;
}

.nav-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 0;
  border-radius: 22px;
  transition: color 0.2s ease, background-color 0.2s ease;
  margin: 0;
  box-shadow: none;
}

#tab-btn-admin { 
  display: none; 
}

.nav-btn svg { 
  width: 22px; 
  height: 22px; 
  fill: currentColor; 
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); 
}

.nav-btn.active { 
  color: var(--accent); 
  background: rgba(59, 130, 246, 0.12); 
}

.nav-btn.active svg { 
  transform: scale(1.15); 
}

/* ==========================================================================
   11. UTILITIES & TOAST NOTIFICATIONS
   ========================================================================== */
.hidden { 
  display: none !important; 
}

.spinner {
  width: 20px; 
  height: 20px; 
  border: 3px solid rgba(255,255,255,0.3);
  border-radius: 50%; 
  border-top-color: var(--accent); 
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin { 
  to { transform: rotate(360deg); } 
}

#toast { 
  visibility: hidden; 
  min-width: 260px; 
  background-color: var(--card-bg); 
  color: var(--text); 
  text-align: center; 
  border-radius: 16px; 
  padding: 14px 20px; 
  position: fixed; 
  z-index: 10001; 
  left: 50%; 
  bottom: calc(85px + var(--safe-area-bottom)); 
  transform: translateX(-50%) translateY(20px); 
  border: 1px solid var(--accent); 
  font-size: 13px; 
  opacity: 0; 
  transition: opacity 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55), transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55); 
  box-shadow: 0 10px 30px rgba(0,0,0,0.4); 
  font-weight: 600;
}

#toast.show { 
  visibility: visible; 
  opacity: 1; 
  transform: translateX(-50%) translateY(0); 
}

details { 
  background: var(--bg-main); 
  padding: 14px; 
  border-radius: 14px; 
  border: 1px solid var(--card-border); 
  margin-bottom: 10px; 
}

summary { 
  font-weight: bold; 
  cursor: pointer; 
}

.tab-pane { 
  animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
}

@keyframes fadeIn { 
  from { opacity: 0; transform: translateY(8px); } 
  to { opacity: 1; transform: translateY(0); } 
}
