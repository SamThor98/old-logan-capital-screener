// Auto-detect API URL based on environment
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : 'https://olc-watchlist-backend.onrender.com/api';

let currentUser = null;
let currentSubmissionId = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    // Submit form
    document.getElementById('submitForm').addEventListener('submit', handleSubmit);

    // File input display
    document.getElementById('attachments').addEventListener('change', displayFileList);
}

// ===== AUTHENTICATION =====

async function checkAuth() {
    try {
        const response = await fetch(`${API_URL}/me`, {
            credentials: 'include'
        });

        if (response.ok) {
            currentUser = await response.json();
            showApp();
        } else {
            // Redirect to employee portal for login
            window.location.href = 'employee.html';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = 'employee.html';
    }
}

async function logout() {
    try {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    currentUser = null;
    window.location.href = 'employee.html';
}

function showApp() {
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('currentUser').textContent = currentUser.fullName;

    // Load dashboard data
    loadSubmissions();
    loadPendingReviews();
    loadWatchlist();
}

// ===== TAB SWITCHING =====

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Load data if needed
    if (tabName === 'dashboard') loadSubmissions();
    if (tabName === 'reviews') loadPendingReviews();
    if (tabName === 'watchlist') loadWatchlist();
}

// ===== SUBMISSIONS =====

async function loadSubmissions() {
    try {
        const response = await fetch(`${API_URL}/submissions`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load submissions');

        let submissions = await response.json();

        // Sort based on selection
        const sortBy = document.getElementById('sortSelect').value;
        submissions = sortSubmissions(submissions, sortBy);

        const tbody = document.getElementById('submissionsTableBody');
        tbody.innerHTML = '';

        if (submissions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No submissions yet</td></tr>';
            return;
        }

        submissions.forEach(sub => {
            const row = document.createElement('tr');
            row.className = 'clickable-row';
            row.onclick = () => viewSubmission(sub.id);

            const avgConf = sub.avg_confidence ? parseFloat(sub.avg_confidence).toFixed(1) : '-';
            const stars = sub.avg_confidence ? '⭐'.repeat(Math.round(sub.avg_confidence)) : '-';

            row.innerHTML = `
                <td><strong>${sub.ticker}</strong></td>
                <td>${sub.company_name}</td>
                <td>${sub.submitter_name}</td>
                <td>${sub.review_count}/3</td>
                <td>${avgConf} ${sub.avg_confidence ? stars : ''}</td>
                <td><span class="status-badge status-${sub.status}">${sub.status.replace('_', ' ')}</span></td>
                <td>${new Date(sub.created_at).toLocaleDateString()}</td>
            `;

            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading submissions:', error);
    }
}

function sortSubmissions(submissions, sortBy) {
    switch (sortBy) {
        case 'confidence':
            return submissions.sort((a, b) => (b.avg_confidence || 0) - (a.avg_confidence || 0));
        case 'date':
            return submissions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        case 'status':
            return submissions.sort((a, b) => a.status.localeCompare(b.status));
        case 'ticker':
            return submissions.sort((a, b) => a.ticker.localeCompare(b.ticker));
        default:
            return submissions;
    }
}

async function viewSubmission(id) {
    try {
        const response = await fetch(`${API_URL}/submissions/${id}`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load submission details');

        const submission = await response.json();
        currentSubmissionId = id;

        let html = `
            <h2>${submission.ticker} - ${submission.company_name}</h2>

            <div class="detail-row">
                <span class="detail-label">Submitted by:</span>
                <span>${submission.submitter_name}</span>
            </div>

            <div class="detail-row">
                <span class="detail-label">Confidence Level:</span>
                <span>${submission.confidence_level}/5 ${'⭐'.repeat(submission.confidence_level)}</span>
            </div>

            <div class="detail-row">
                <span class="detail-label">Price Target:</span>
                <span>${submission.price_target || 'N/A'}</span>
            </div>

            <div class="detail-row">
                <span class="detail-label">Time Horizon:</span>
                <span>${submission.time_horizon}</span>
            </div>

            <div class="detail-row">
                <span class="detail-label">Sector:</span>
                <span>${submission.sector || 'N/A'}</span>
            </div>

            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span><span class="status-badge status-${submission.status}">${submission.status.replace('_', ' ')}</span></span>
            </div>

            <div style="margin-top: 2rem;">
                <h3 style="margin-bottom: 1rem;">Investment Thesis</h3>
                <p style="line-height: 1.8; white-space: pre-wrap;">${submission.reasoning}</p>
            </div>
        `;

        // Show attachments if any
        if (submission.attachments && submission.attachments.length > 0) {
            html += `
                <div style="margin-top: 2rem;">
                    <h3 style="margin-bottom: 1rem;">Attachments</h3>
                    <ul class="attachment-list">
                        ${submission.attachments.map(att => `
                            <li><a href="${API_URL}/files/${att.filepath}" target="_blank">📎 ${att.filename}</a></li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }

        // Show reviews if complete
        if (submission.reviewsComplete && submission.reviews.length > 0) {
            const allConfidences = [submission.confidence_level, ...submission.reviews.map(r => r.confidence_level)];
            const avgConf = allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length;

            html += `
                <div style="margin-top: 2rem;">
                    <h3 style="margin-bottom: 1rem;">Team Reviews (Average: ${avgConf.toFixed(2)}/5 ${'⭐'.repeat(Math.round(avgConf))})</h3>
                    <div class="review-grid">
            `;

            submission.reviews.forEach(review => {
                html += `
                    <div class="review-card">
                        <h4>${review.reviewer_name}</h4>
                        <div class="detail-row">
                            <span class="detail-label">Confidence:</span>
                            <span>${review.confidence_level}/5 ${'⭐'.repeat(review.confidence_level)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Price Target:</span>
                            <span>${review.price_target || 'N/A'}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Time Horizon:</span>
                            <span>${review.time_horizon}</span>
                        </div>
                        <div style="margin-top: 1rem;">
                            <strong>Analysis:</strong>
                            <p style="margin-top: 0.5rem; line-height: 1.6; white-space: pre-wrap;">${review.reasoning}</p>
                        </div>
                    </div>
                `;
            });

            html += `</div></div>`;

            // Add approve button if all reviews complete and not yet approved
            if (submission.status === 'under_review') {
                html += `
                    <div style="margin-top: 2rem;">
                        <button class="btn btn-success" onclick="approveForWatchlist(${id})">
                            ✓ Approve for Watchlist
                        </button>
                    </div>
                `;
            }
        } else {
            html += `
                <div style="margin-top: 2rem; padding: 1.5rem; background: rgba(201, 169, 98, 0.1); border: 1px solid var(--warning);">
                    <p style="color: var(--text-muted);">
                        <strong>Reviews in Progress:</strong> ${submission.review_count || 0}/3 reviews completed.
                        Results will be visible to everyone once all reviews are finished.
                    </p>
                </div>
            `;
        }

        document.getElementById('submissionDetail').innerHTML = html;
        document.getElementById('submissionModal').classList.add('active');
    } catch (error) {
        console.error('Error viewing submission:', error);
        alert('Failed to load submission details');
    }
}

function closeSubmissionModal() {
    document.getElementById('submissionModal').classList.remove('active');
}

async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData();
    formData.append('ticker', document.getElementById('ticker').value);
    formData.append('companyName', document.getElementById('companyName').value);
    formData.append('confidenceLevel', document.getElementById('confidenceLevel').value);
    formData.append('reasoning', document.getElementById('reasoning').value);
    formData.append('priceTarget', document.getElementById('priceTarget').value);
    formData.append('timeHorizon', document.getElementById('timeHorizon').value);
    formData.append('sector', document.getElementById('sector').value);

    // Add files
    const files = document.getElementById('attachments').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('attachments', files[i]);
    }

    try {
        const response = await fetch(`${API_URL}/submissions`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Submission failed');
        }

        document.getElementById('submitSuccess').textContent = 'Ticker submitted successfully! Notification sent to team.';
        document.getElementById('submitSuccess').classList.remove('hidden');
        document.getElementById('submitError').classList.add('hidden');
        document.getElementById('submitForm').reset();
        document.getElementById('fileList').innerHTML = '';

        // Refresh dashboard
        loadSubmissions();

        // Switch to dashboard after 2 seconds
        setTimeout(() => {
            switchTab('dashboard');
            document.getElementById('submitSuccess').classList.add('hidden');
        }, 2000);
    } catch (error) {
        document.getElementById('submitError').textContent = error.message;
        document.getElementById('submitError').classList.remove('hidden');
        document.getElementById('submitSuccess').classList.add('hidden');
    }
}

function displayFileList() {
    const files = document.getElementById('attachments').files;
    const fileList = document.getElementById('fileList');

    if (files.length === 0) {
        fileList.innerHTML = '';
        return;
    }

    const fileNames = Array.from(files).map(f => f.name).join(', ');
    fileList.innerHTML = `Selected: ${fileNames}`;
}

// ===== REVIEWS =====

async function loadPendingReviews() {
    try {
        const response = await fetch(`${API_URL}/pending-reviews`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load pending reviews');

        const pending = await response.json();
        const container = document.getElementById('pendingReviewsList');

        if (pending.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No pending reviews</p>';
            return;
        }

        container.innerHTML = pending.map(sub => `
            <div class="card" style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin-bottom: 0.5rem;">${sub.ticker} - ${sub.company_name}</h3>
                        <p style="color: var(--text-muted); font-size: 0.9rem;">Submitted by ${sub.submitter_name} on ${new Date(sub.created_at).toLocaleDateString()}</p>
                    </div>
                    <button class="btn" onclick="startReview(${sub.id})">Start Review</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading pending reviews:', error);
    }
}

async function startReview(submissionId) {
    try {
        const response = await fetch(`${API_URL}/submissions/${submissionId}`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load submission');

        const submission = await response.json();

        const html = `
            <h2>Review: ${submission.ticker} - ${submission.company_name}</h2>
            <p style="margin-bottom: 2rem; color: var(--text-muted);">
                Complete your independent review. Your analysis will remain hidden until all team members finish their reviews.
            </p>

            <div style="padding: 1.5rem; background: rgba(255, 255, 255, 0.8); border: 1px solid var(--border); margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1rem;">Original Submission (by ${submission.submitter_name})</h3>
                <div class="detail-row">
                    <span class="detail-label">Ticker:</span>
                    <span><strong>${submission.ticker}</strong></span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Company:</span>
                    <span>${submission.company_name}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Sector:</span>
                    <span>${submission.sector || 'N/A'}</span>
                </div>
                <p style="margin-top: 1rem;"><strong>Note:</strong> Original confidence level and full analysis are hidden to prevent bias.</p>
            </div>

            <form id="reviewForm" onsubmit="submitReview(event, ${submissionId})">
                <div class="form-group">
                    <label for="reviewConfidence">Your Confidence Level (1-5) *</label>
                    <select id="reviewConfidence" required>
                        <option value="">Select confidence level</option>
                        <option value="1">1 - Very Low</option>
                        <option value="2">2 - Low</option>
                        <option value="3">3 - Medium</option>
                        <option value="4">4 - High</option>
                        <option value="5">5 - Very High</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="reviewReasoning">Your Analysis / Reasoning *</label>
                    <textarea id="reviewReasoning" required placeholder="Provide your independent analysis of this investment opportunity..."></textarea>
                </div>

                <div class="form-group">
                    <label for="reviewPriceTarget">Your Price Target (Optional)</label>
                    <input type="text" id="reviewPriceTarget" placeholder="e.g., $150">
                </div>

                <div class="form-group">
                    <label for="reviewTimeHorizon">Your Time Horizon *</label>
                    <select id="reviewTimeHorizon" required>
                        <option value="">Select time horizon</option>
                        <option value="Short">Short Term (< 6 months)</option>
                        <option value="Medium">Medium Term (6-18 months)</option>
                        <option value="Long">Long Term (> 18 months)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="reviewSector">Sector Classification (Optional)</label>
                    <input type="text" id="reviewSector" placeholder="e.g., Technology, Healthcare, Finance">
                </div>

                <div class="form-group">
                    <label for="reviewAttachments">Supporting Documents (Optional)</label>
                    <div class="file-input-wrapper">
                        <input type="file" id="reviewAttachments" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx,.csv">
                        <label for="reviewAttachments" class="file-input-label">Choose files</label>
                    </div>
                    <div id="reviewFileList" class="file-list"></div>
                </div>

                <div style="display: flex; gap: 1rem;">
                    <button type="submit" class="btn">Submit Review</button>
                    <button type="button" class="btn btn-secondary" onclick="closeReviewModal()">Cancel</button>
                </div>
            </form>
        `;

        document.getElementById('reviewFormContainer').innerHTML = html;
        document.getElementById('reviewModal').classList.add('active');

        // Setup file list display for review attachments
        document.getElementById('reviewAttachments').addEventListener('change', () => {
            const files = document.getElementById('reviewAttachments').files;
            const fileList = document.getElementById('reviewFileList');
            if (files.length > 0) {
                const fileNames = Array.from(files).map(f => f.name).join(', ');
                fileList.innerHTML = `Selected: ${fileNames}`;
            } else {
                fileList.innerHTML = '';
            }
        });
    } catch (error) {
        console.error('Error starting review:', error);
        alert('Failed to load submission for review');
    }
}

async function submitReview(e, submissionId) {
    e.preventDefault();

    const formData = new FormData();
    formData.append('submissionId', submissionId);
    formData.append('confidenceLevel', document.getElementById('reviewConfidence').value);
    formData.append('reasoning', document.getElementById('reviewReasoning').value);
    formData.append('priceTarget', document.getElementById('reviewPriceTarget').value);
    formData.append('timeHorizon', document.getElementById('reviewTimeHorizon').value);
    formData.append('sector', document.getElementById('reviewSector').value);

    // Add files
    const files = document.getElementById('reviewAttachments').files;
    for (let i = 0; i < files.length; i++) {
        formData.append('attachments', files[i]);
    }

    try {
        const response = await fetch(`${API_URL}/reviews`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Review submission failed');
        }

        alert('Review submitted successfully! Notification sent to team.');
        closeReviewModal();
        loadPendingReviews();
        loadSubmissions();
    } catch (error) {
        alert(error.message);
    }
}

function closeReviewModal() {
    document.getElementById('reviewModal').classList.remove('active');
}

// ===== WATCHLIST =====

async function loadWatchlist() {
    try {
        const response = await fetch(`${API_URL}/watchlist`, {
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to load watchlist');

        const watchlist = await response.json();
        const tbody = document.getElementById('watchlistTableBody');
        tbody.innerHTML = '';

        if (watchlist.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No approved items yet</td></tr>';
            return;
        }

        watchlist.forEach(item => {
            const row = document.createElement('tr');
            row.className = 'clickable-row';
            row.onclick = () => viewSubmission(item.submission_id);

            const stars = '⭐'.repeat(Math.round(item.avg_confidence));

            row.innerHTML = `
                <td><strong>${item.ticker}</strong></td>
                <td>${item.company_name}</td>
                <td>${item.submitter_name}</td>
                <td>${item.avg_confidence.toFixed(2)}/5 ${stars}</td>
                <td>${item.sector || 'N/A'}</td>
                <td>${item.time_horizon}</td>
                <td>${new Date(item.added_at).toLocaleDateString()}</td>
            `;

            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading watchlist:', error);
    }
}

async function approveForWatchlist(submissionId) {
    if (!confirm('Are you sure you want to approve this ticker for the watchlist?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/watchlist/approve/${submissionId}`, {
            method: 'POST',
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Approval failed');

        alert('Ticker approved and added to watchlist!');
        closeSubmissionModal();
        loadSubmissions();
        loadWatchlist();
    } catch (error) {
        alert('Failed to approve ticker: ' + error.message);
    }
}
