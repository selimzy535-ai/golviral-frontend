
// Add To Home Screen (A2HS) PWA Installation Controller
(function() {
    let deferredPrompt = null;
    const VISIT_KEY = 'golviral_visit_count';

    // 1. Increment and verify the local persistent visit metrics
    function trackUserVisits() {
        try {
            let visits = parseInt(localStorage.getItem(VISIT_KEY) || '0', 10);
            visits += 1;
            localStorage.setItem(VISIT_KEY, visits.toString());
            return visits;
        } catch (e) {
            console.error("Storage boundaries locked down. Defaulting metrics.");
            return 1;
        }
    }

    const currentVisitCount = trackUserVisits();

    // 2. Capture and intercept native browser installation vectors
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent default mobile banner triggers instantly
        e.preventDefault();
        deferredPrompt = e;

        // Condition Check: Trigger UI prompts only on or after the 3rd deliberate application visit
        if (currentVisitCount >= 3) {
            renderInstallBanner();
        }
    });

    // 3. Render contextual UI banner into DOM tree safely
    function renderInstallBanner() {
        // Prevent duplicate banners if one is already rendered
        if (document.getElementById('pwaInstallBanner')) return;

        const banner = document.createElement('div');
        banner.id = 'pwaInstallBanner';
        banner.className = 'fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl z-[100] transition-all transform translate-y-0 flex flex-col gap-3 max-w-[500px] mx-auto';

        banner.innerHTML = `
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 bg-accent/20 text-accent rounded-lg flex items-center justify-center font-black flex-shrink-0">
                    GV
                </div>
                <div class="flex-1">
                    <h4 class="text-xs font-bold text-white">Install GolViral App</h4>
                    <p class="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">Save mobile data and get lightning-fast access to ad networks and local offline video playback streams instantly.</p>
                </div>
            </div>
            <div class="flex items-center justify-end gap-2 text-xs font-bold pt-1">
                <button id="pwaCloseBtn" class="px-3 py-1.5 text-zinc-400 hover:text-white transition-colors">Later</button>
                <button id="pwaInstallBtn" class="px-4 py-1.5 bg-white text-brand rounded hover:bg-zinc-200 transition-colors">Install App</button>
            </div>
        `;

        document.body.appendChild(banner);

        // Bind Action Handlers
        document.getElementById('pwaCloseBtn').addEventListener('click', () => {
            dismissBanner();
        });

        document.getElementById('pwaInstallBtn').addEventListener('click', async () => {
            if (!deferredPrompt) return;
            
            dismissBanner();
            deferredPrompt.prompt();

            const { outcome } = await deferredPrompt.userChoice;
            console.log(`PWA deployment installation selection choice: ${outcome}`);
            deferredPrompt = null;
        });
    }

    function dismissBanner() {
        const banner = document.getElementById('pwaInstallBanner');
        if (banner) {
            banner.remove();
        }
    }

    // 4. Reset display states gracefully if platform installation succeeds directly
    window.addEventListener('appinstalled', (evt) => {
        console.log('GolViral production platform installed to standalone device array context successfully.');
        dismissBanner();
        deferredPrompt = null;
    });
})();
