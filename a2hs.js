let deferredPrompt;
let visitCount = parseInt(localStorage.getItem('gv_visits') || '0', 10);

// Count visits safely
visitCount++;
localStorage.setItem('gv_visits', visitCount);

// Listen for install prompt
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Only show after 3 visits
  if (visitCount >= 3) {
    showA2HSButton();
  }
});

function showA2HSButton() {
  // Prevent adding duplicate banners if one is already on screen
  if (document.getElementById('a2hs-banner')) return;
  
  // Don't show if already installed or dismissed
  if (window.matchMedia('(display-mode: standalone)').matches) return;
  if (localStorage.getItem('gv_a2hs_dismissed') === 'true') return;

  // Create banner
  const banner = document.createElement('div');
  banner.id = 'a2hs-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 12px;
    right: 12px;
    background: #FFFFFF;
    border: 2px solid #FF0050;
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: #000000;
  `;
  
  banner.innerHTML = `
    <div style="flex:1">
      <div style="font-weight:700;margin-bottom:2px">Install GolViral</div>
      <div style="font-size:12px;color:#666">Add to Home Screen for faster access + offline mode</div>
    </div>
    <button id="a2hs-install" style="background:#FF0050;color:#FFF;border:none;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer">Install</button>
    <button id="a2hs-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">×</button>
  `;
  
  document.body.appendChild(banner);

  // Install click handler
  document.getElementById('a2hs-install').onclick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    
    try {
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('[PWA] User accepted A2HS');
      }
    } catch (err) {
      console.error('[PWA] Installation prompt error:', err);
    }
    
    deferredPrompt = null;
    banner.remove();
  };

  // Close click handler
  document.getElementById('a2hs-close').onclick = () => {
    localStorage.setItem('gv_a2hs_dismissed', 'true');
    banner.remove();
  };
}

// Hide banner immediately if user successfully installs app via browser natively
window.addEventListener('appinstalled', () => {
  console.log('[PWA] App installed');
  localStorage.setItem('gv_a2hs_dismissed', 'true');
  const banner = document.getElementById('a2hs-banner');
  if (banner) banner.remove();
});
