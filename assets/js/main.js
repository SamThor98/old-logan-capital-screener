// ===================================
// Old Logan Capital - Main JavaScript
// ===================================

// === Google Analytics Event Tracking ===
function trackEvent(eventName, eventParams = {}) {
    if (typeof gtag !== 'undefined') {
        gtag('event', eventName, eventParams);
    }
}

// === Modal Functions ===
function openModal(person) {
    const modal = document.getElementById('modal-' + person);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        trackEvent('view_team_member', {
            'member_name': person,
            'event_category': 'engagement',
            'event_label': person + ' bio'
        });
    }
}

function closeModal(person) {
    const modal = document.getElementById('modal-' + person);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

// Close modal when clicking outside content
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const activeModal = document.querySelector('.modal.active');
        if (activeModal) {
            activeModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    }
});

// === Animated Title ===
function animateTitle() {
    const title = 'OLD LOGAN CAPITAL';
    const titleContainer = document.getElementById('animated-title');

    titleContainer.innerHTML = '';

    for (let i = 0; i < title.length; i++) {
        const char = title[i];
        const span = document.createElement('span');

        if (char === ' ') {
            span.className = 'space';
        } else {
            span.className = 'letter';
            span.textContent = char;
        }

        titleContainer.appendChild(span);

        // Add mobile line break after "LOGAN"
        if (i === 9) {
            const breakSpan = document.createElement('span');
            breakSpan.className = 'mobile-break';
            titleContainer.appendChild(breakSpan);
        }
    }

    const letters = titleContainer.querySelectorAll('.letter');
    letters.forEach((letter, index) => {
        setTimeout(() => {
            letter.style.animation = 'letterFadeIn 1s ease forwards';
        }, index * 150);
    });
}

// === Animated Subtitle ===
function animateSubtitle() {
    const subtitle = 'transparent investing. honest outcomes. integrity always.';
    const subtitleContainer = document.getElementById('hero-subtitle');

    subtitleContainer.innerHTML = '';

    for (let i = 0; i < subtitle.length; i++) {
        const char = subtitle[i];
        const span = document.createElement('span');

        if (char === ' ') {
            span.className = 'space';
        } else {
            span.className = 'letter';
            span.textContent = char;
        }

        subtitleContainer.appendChild(span);
    }

    const letters = subtitleContainer.querySelectorAll('.letter');
    // Start subtitle animation after title finishes (title has ~17 letters * 150ms delay = ~2.5s)
    const titleDelay = 2500;
    letters.forEach((letter, index) => {
        setTimeout(() => {
            letter.style.animation = 'letterFadeIn 0.8s ease forwards';
        }, titleDelay + (index * 40));
    });
}

// === Navigation Scroll Handler ===
function handleScroll() {
    const nav = document.querySelector('nav');
    if (window.scrollY > 100) {
        nav.classList.add('visible');
    } else {
        nav.classList.remove('visible');
    }
}

// === Analytics Event Tracking Setup ===
function setupAnalyticsTracking() {
    // Track CTA button clicks
    document.querySelectorAll('.nav-cta').forEach(button => {
        button.addEventListener('click', function(e) {
            const buttonText = this.textContent.trim();
            trackEvent('cta_click', {
                'event_category': 'navigation',
                'event_label': buttonText,
                'button_location': 'navigation'
            });
        });
    });

    // Track email clicks
    document.querySelectorAll('.contact-email').forEach(link => {
        link.addEventListener('click', function() {
            trackEvent('contact_email_click', {
                'event_category': 'engagement',
                'event_label': 'email_contact',
                'contact_method': 'email'
            });
        });
    });

    // Track social media clicks
    document.querySelectorAll('.social-links a').forEach(link => {
        link.addEventListener('click', function() {
            const platform = this.textContent.trim();
            trackEvent('social_link_click', {
                'event_category': 'social',
                'event_label': platform,
                'link_url': this.href
            });
        });
    });

    // Track investor letter clicks
    document.querySelectorAll('.letter-item').forEach(letter => {
        letter.addEventListener('click', function() {
            const letterTitle = this.querySelector('h4').textContent.trim();
            trackEvent('investor_letter_view', {
                'event_category': 'content',
                'event_label': letterTitle,
                'letter_type': this.querySelector('span').textContent.trim()
            });
        });
    });

    // Track portfolio company clicks
    document.querySelectorAll('.holding-item a').forEach(link => {
        link.addEventListener('click', function() {
            const ticker = this.closest('.holding-item').dataset.ticker;
            trackEvent('portfolio_company_click', {
                'event_category': 'engagement',
                'event_label': ticker,
                'company_ticker': ticker
            });
        });
    });

    // Track scroll depth
    let maxScrollDepth = 0;
    let scrollTracked = {25: false, 50: false, 75: false, 90: false};

    window.addEventListener('scroll', function() {
        const scrollPercent = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight * 100;
        maxScrollDepth = Math.max(maxScrollDepth, scrollPercent);

        Object.keys(scrollTracked).forEach(depth => {
            if (maxScrollDepth >= depth && !scrollTracked[depth]) {
                scrollTracked[depth] = true;
                trackEvent('scroll_depth', {
                    'event_category': 'engagement',
                    'event_label': depth + '%',
                    'scroll_depth': depth
                });
            }
        });
    });
}

// === Stock Price Functions ===
async function fetchStockData(ticker) {
    try {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const apiBase = isLocal ? 'http://localhost:3000' : 'https://api.oldlogancapital.com';

        const url = `${apiBase}/api/stock/${ticker}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        return {
            price: data.price,
            change: data.change,
            changePercent: data.changePercent
        };
    } catch (error) {
        console.error(`Error fetching data for ${ticker}:`, error);
        return null;
    }
}

function updateStockDisplay(ticker, data) {
    const wrapper = document.querySelector(`[data-ticker="${ticker}"]`);
    if (!wrapper || !data) return;

    const priceEl = wrapper.querySelector('.stock-price');
    const changeEl = wrapper.querySelector('.stock-change');

    priceEl.textContent = `$${data.price.toFixed(2)}`;

    const changeSign = data.change >= 0 ? '+' : '';
    const changeClass = data.change > 0 ? 'positive' : data.change < 0 ? 'negative' : 'neutral';

    changeEl.textContent = `${changeSign}$${data.change.toFixed(2)} (${changeSign}${data.changePercent.toFixed(2)}%)`;
    changeEl.className = `stock-change ${changeClass}`;

    if (data.change !== 0) {
        const arrow = data.change > 0 ? '▲' : '▼';
        changeEl.textContent = `${arrow} ${changeSign}$${Math.abs(data.change).toFixed(2)} (${changeSign}${data.changePercent.toFixed(2)}%)`;
    }
}

async function loadAllStockPrices() {
    const tickers = ['OSCR', 'ATEX', 'DFTX', 'INTC', 'RSKD'];

    for (const ticker of tickers) {
        const data = await fetchStockData(ticker);
        if (data) {
            updateStockDisplay(ticker, data);
        }
    }
}

// === Page Initialization ===
window.addEventListener('load', function() {
    animateTitle();
    animateSubtitle();
    handleScroll();
    setupAnalyticsTracking();
    loadAllStockPrices();

    // Refresh stock prices every 5 minutes
    setInterval(loadAllStockPrices, 5 * 60 * 1000);

    // Scroll to top on page load
    setTimeout(function() {
        window.scrollTo(0, 0);
    }, 0);
});

// Listen for scroll events
window.addEventListener('scroll', handleScroll);

// Scroll to top on page refresh
if (history.scrollRestoration) {
    history.scrollRestoration = 'manual';
}

window.addEventListener('beforeunload', function() {
    window.scrollTo(0, 0);
});
