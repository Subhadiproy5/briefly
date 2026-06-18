// =====================================================
// Briefly — Frontend
// =====================================================
let loginWidget = null, registerWidget = null;
let recaptchaSiteKey = null;

async function fetchConfigAndRenderRecaptcha() {
    try {
        const r = await fetch('/api/config');
        const cfg = await r.json();
        recaptchaSiteKey = cfg.recaptcha_site_key;
        document.getElementById('loginRecaptcha').setAttribute('data-sitekey', recaptchaSiteKey);
        document.getElementById('registerRecaptcha').setAttribute('data-sitekey', recaptchaSiteKey);
    } catch (e) { console.warn('No config endpoint, recaptcha may not load', e); }
}

window.onload = function () {
    // Wait briefly for site key to be injected then render
    const tryRender = () => {
        if (window.grecaptcha && document.getElementById('loginRecaptcha').dataset.sitekey) {
            try { loginWidget = grecaptcha.render('loginRecaptcha'); } catch (e) {}
            try { registerWidget = grecaptcha.render('registerRecaptcha'); } catch (e) {}
        } else {
            setTimeout(tryRender, 200);
        }
    };
    fetchConfigAndRenderRecaptcha().then(tryRender);
};

class ChatApp {
    constructor() {
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.composerWrap = document.querySelector('.composer-wrap');
        this.errorToast = new bootstrap.Toast(document.getElementById('errorToast'));
        this.errorToastMessage = document.getElementById('errorToastMessage');
        this.authModal = new bootstrap.Modal(document.getElementById('authModal'));
        this.settingsModal = new bootstrap.Modal(document.getElementById('settingsModal'));

        this.conversationsList = document.getElementById('conversationsList');
        this.usernameDisplay = document.getElementById('username');
        this.dropdownUsername = document.getElementById('dropdownUsername');
        this.profileDropdown = document.getElementById('profileDropdown');

        this.chatLimitSection = document.getElementById('chatLimitSection');
        this.chatLimitBar = document.getElementById('chatLimitBar');
        this.chatLimitText = document.getElementById('chatLimitText');

        // Views
        this.chatView = document.getElementById('chatView');
        this.analyzerView = document.getElementById('documentAnalyzerView');
        this.makerView = document.getElementById('documentMakerView');

        // Maker state
        this.makerState = { type: null, format: 'pdf', types: {}, formats: [] };

        this.isLoading = false;
        this.currentConversationId = null;
        this.isLoggedIn = false;
        this.userProfile = null;
        this.freeChatLimit = 5;
        this.currentDocument = null;

        this.initEventListeners();
        this.checkAuthStatus();
        this.updateChatLimitDisplay();
    }

    initEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', e => { e.preventDefault(); this.handleLogin(); });
        document.getElementById('registerForm').addEventListener('submit', e => { e.preventDefault(); this.handleRegister(); });

        document.getElementById('profileBtn').addEventListener('click', e => { e.stopPropagation(); this.toggleProfileDropdown(); });
        document.addEventListener('click', () => { this.profileDropdown.style.display = 'none'; });

        document.getElementById('settingsBtn').addEventListener('click', e => { e.preventDefault(); this.profileDropdown.style.display = 'none'; this.openSettingsModal(); });
        document.getElementById('dropdownLogoutBtn').addEventListener('click', e => { e.preventDefault(); this.handleLogout(); });
        document.getElementById('sidebarLogoutBtn').addEventListener('click', () => this.handleLogout());
        document.getElementById('sidebarLoginBtn').addEventListener('click', () => this.authModal.show());

        document.getElementById('profileForm').addEventListener('submit', e => { e.preventDefault(); this.handleProfileUpdate(); });
        document.getElementById('passwordForm').addEventListener('submit', e => { e.preventDefault(); this.handlePasswordChange(); });

        // Nav switching
        document.getElementById('navChat').addEventListener('click', () => this.showChatView());
        document.getElementById('navAnalyzer').addEventListener('click', () => {
            if (!this.isLoggedIn) { this.showError('Please login to use Document Analyzer'); this.authModal.show(); return; }
            this.showAnalyzerView();
        });
        document.getElementById('navMaker').addEventListener('click', () => {
            if (!this.isLoggedIn) { this.showError('Please login to use Document Maker'); this.authModal.show(); return; }
            this.showMakerView();
        });
        document.getElementById('navWriter').addEventListener('click', () => {
            if (!this.isLoggedIn) { this.showError('Please login to use Scribe'); this.authModal.show(); return; }
            this.showWriterView();
        });
        document.getElementById('navSheet').addEventListener('click', () => {
            if (!this.isLoggedIn) { this.showError('Please login to use Gridly'); this.authModal.show(); return; }
            this.showSheetView();
        });

        // Analyzer
        document.getElementById('docAnalyzerUploadForm').addEventListener('submit', e => { e.preventDefault(); this.handleAnalyzerUpload(); });
        document.getElementById('backToUpload').addEventListener('click', () => this.showAnalyzerUpload());
        document.getElementById('docAnalyzerSearch').addEventListener('input', e => this.searchAnalyzerContent(e.target.value));
        document.getElementById('docAnalyzerChatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendAnalyzerChat(); } });
        document.getElementById('docAnalyzerSendBtn').addEventListener('click', () => this.sendAnalyzerChat());

        // Maker
        document.getElementById('generateDocBtn').addEventListener('click', () => this.generateDocument());

        // New chat — auto creates without naming, opens fresh blank state
        document.getElementById('newChatBtn').addEventListener('click', () => this.startNewChat());

        // Mobile sidebar
        document.getElementById('toggleSidebar')?.addEventListener('click', () => this.openSidebar());
        document.getElementById('closeSidebarBtn').addEventListener('click', () => this.closeSidebar());
        document.getElementById('sidebarBackdrop').addEventListener('click', () => this.closeSidebar());

        // Send
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); } });
        this.messageInput.addEventListener('input', () => this.autoResizeTextarea());

        // Welcome chips
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                this.messageInput.value = chip.dataset.prompt || chip.textContent;
                this.autoResizeTextarea();
                this.sendMessage();
            });
        });

        // Conversation search
        document.getElementById('searchInput')?.addEventListener('input', e => this.filterConversations(e.target.value));
    }

    // =================== Sidebar mobile ===================
    openSidebar() { document.getElementById('sidebar').classList.add('show'); document.getElementById('sidebarBackdrop').classList.add('show'); }
    closeSidebar() { document.getElementById('sidebar').classList.remove('show'); document.getElementById('sidebarBackdrop').classList.remove('show'); }

    // =================== Auth ===================
    async checkAuthStatus() {
        try {
            const r = await fetch('/api/user');
            const data = await r.json();
            if (data.success) {
                this.isLoggedIn = true;
                this.userProfile = data.profile;
                this.usernameDisplay.textContent = data.profile?.name || data.username;
                this.dropdownUsername.textContent = data.profile?.name || data.username;
                this.updateUIForLoggedIn();
                await this.loadConversations();
                this.loadDocuments();
                this.loadDrafts('text');
                this.loadDrafts('sheet');
                // Show empty welcome by default; user types to auto-create
                this.showChatView(true);
            } else {
                this.isLoggedIn = false;
                this.userProfile = null;
                this.updateUIForLoggedOut();
                // Don't auto-pop the auth modal — user can click Login when ready.
                // Free chat (5 messages) still works without logging in.
                this.showChatView(true);
            }
        } catch (e) {
            console.error('auth check', e);
            this.isLoggedIn = false;
            this.userProfile = null;
            this.updateUIForLoggedOut();
            this.showChatView(true);
        }
    }

    updateUIForLoggedIn() {
        document.getElementById('sidebarLoginBtn').style.display = 'none';
        document.getElementById('sidebarLogoutBtn').style.display = 'block';
        document.getElementById('profileBtn').style.display = 'inline-flex';
        this.chatLimitSection.style.display = 'none';
    }

    updateUIForLoggedOut() {
        document.getElementById('sidebarLoginBtn').style.display = 'block';
        document.getElementById('sidebarLogoutBtn').style.display = 'none';
        document.getElementById('profileBtn').style.display = 'none';
        this.chatLimitSection.style.display = 'block';
        this.updateChatLimitDisplay();
    }

    getFreeChatCount() { return parseInt(localStorage.getItem('freeChatCount') || '0', 10); }
    incrementFreeChatCount() { localStorage.setItem('freeChatCount', String(this.getFreeChatCount() + 1)); this.updateChatLimitDisplay(); }
    resetFreeChatCount() { localStorage.removeItem('freeChatCount'); this.updateChatLimitDisplay(); }
    isFreeChatLimitReached() { return this.getFreeChatCount() >= this.freeChatLimit; }

    updateChatLimitDisplay() {
        const c = this.getFreeChatCount();
        const pct = Math.min(100, (c / this.freeChatLimit) * 100);
        this.chatLimitText.textContent = `${c}/${this.freeChatLimit}`;
        this.chatLimitBar.style.width = `${pct}%`;
        this.chatLimitBar.classList.remove('warn', 'danger');
        if (pct >= 100) this.chatLimitBar.classList.add('danger');
        else if (pct >= 60) this.chatLimitBar.classList.add('warn');
    }

    toggleProfileDropdown() {
        this.profileDropdown.style.display = (this.profileDropdown.style.display === 'block') ? 'none' : 'block';
    }

    openSettingsModal() {
        if (this.userProfile) {
            document.getElementById('profileName').value = this.userProfile.name || '';
            document.getElementById('profileEmail').value = this.userProfile.email || this.userProfile.username || '';
            document.getElementById('profileMobile').value = this.userProfile.mobile || '';
            document.getElementById('profileDob').value = this.userProfile.dob || '';
        }
        this.settingsModal.show();
    }

    async handleLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const err = document.getElementById('loginError');
        const recaptchaResponse = (window.grecaptcha && loginWidget !== null) ? grecaptcha.getResponse(loginWidget) : '';
        if (!recaptchaResponse && recaptchaSiteKey) { err.textContent = 'Please complete the reCAPTCHA.'; err.style.display = 'block'; return; }
        try {
            const r = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ username, password, recaptcha_response: recaptchaResponse }) });
            const data = await r.json();
            if (data.success) {
                this.resetFreeChatCount();
                this.authModal.hide();
                document.getElementById('loginForm').reset();
                err.style.display = 'none';
                if (window.grecaptcha) grecaptcha.reset();
                this.checkAuthStatus();
            } else {
                err.textContent = data.error || 'Login failed'; err.style.display = 'block';
                if (window.grecaptcha) grecaptcha.reset();
            }
        } catch (e) {
            err.textContent = 'Login failed. Try again.'; err.style.display = 'block';
        }
    }

    async handleRegister() {
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        const err = document.getElementById('registerError');
        const ok = document.getElementById('registerSuccess');
        const recaptchaResponse = (window.grecaptcha && registerWidget !== null) ? grecaptcha.getResponse(registerWidget) : '';
        if (!recaptchaResponse && recaptchaSiteKey) { err.textContent = 'Please complete the reCAPTCHA.'; err.style.display = 'block'; return; }
        try {
            const r = await fetch('/api/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, email, password, recaptcha_response: recaptchaResponse }) });
            const data = await r.json();
            if (data.success) {
                err.style.display = 'none';
                ok.textContent = 'Registration successful! Please log in.';
                ok.style.display = 'block';
                document.getElementById('registerForm').reset();
                if (window.grecaptcha) grecaptcha.reset();
                setTimeout(() => { document.getElementById('login-tab').click(); ok.style.display = 'none'; }, 1800);
            } else {
                err.textContent = data.error || 'Registration failed'; err.style.display = 'block'; ok.style.display = 'none';
                if (window.grecaptcha) grecaptcha.reset();
            }
        } catch (e) { err.textContent = 'Failed. Try again.'; err.style.display = 'block'; }
    }

    async handleLogout() {
        await fetch('/api/logout', { method: 'POST' });
        this.isLoggedIn = false; this.userProfile = null; this.currentConversationId = null;
        this.updateUIForLoggedOut();
        this.conversationsList.innerHTML = '';
        // Also clear other histories
        const d = document.getElementById('documentsList'); if (d) d.innerHTML = '';
        const td = document.getElementById('textDraftsList'); if (td) td.innerHTML = '';
        const sd = document.getElementById('sheetDraftsList'); if (sd) sd.innerHTML = '';
        this.showWelcome();
    }

    async handleProfileUpdate() {
        const name = document.getElementById('profileName').value.trim();
        const mobile = document.getElementById('profileMobile').value.trim();
        const dob = document.getElementById('profileDob').value.trim();
        const err = document.getElementById('profileError');
        const ok = document.getElementById('profileSuccess');
        try {
            const r = await fetch('/api/profile/update', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, mobile, dob }) });
            const data = await r.json();
            if (data.success) { ok.textContent = 'Profile updated!'; ok.style.display = 'block'; err.style.display = 'none'; this.checkAuthStatus(); setTimeout(() => ok.style.display = 'none', 2500); }
            else { err.textContent = data.error || 'Failed'; err.style.display = 'block'; }
        } catch (e) { err.textContent = 'Failed. Try again.'; err.style.display = 'block'; }
    }

    async handlePasswordChange() {
        const cur = document.getElementById('currentPassword').value.trim();
        const np = document.getElementById('newPassword').value.trim();
        const cp = document.getElementById('confirmPassword').value.trim();
        const err = document.getElementById('passwordError'); const ok = document.getElementById('passwordSuccess');
        if (np !== cp) { err.textContent = 'Passwords do not match'; err.style.display = 'block'; ok.style.display = 'none'; return; }
        try {
            const r = await fetch('/api/profile/change-password', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ current_password: cur, new_password: np }) });
            const data = await r.json();
            if (data.success) { ok.textContent = 'Password updated!'; ok.style.display = 'block'; err.style.display = 'none'; document.getElementById('passwordForm').reset(); setTimeout(() => ok.style.display = 'none', 2500); }
            else { err.textContent = data.error || 'Failed'; err.style.display = 'block'; ok.style.display = 'none'; }
        } catch (e) { err.textContent = 'Failed. Try again.'; err.style.display = 'block'; ok.style.display = 'none'; }
    }

    // =================== Views ===================
    setActiveNav(id) {
        document.querySelectorAll('.nav-item-row').forEach(el => el.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
    }

    _hideAllViews() {
        ['chatView', 'documentAnalyzerView', 'documentMakerView', 'writerView', 'sheetView'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }

    showChatView(keepWelcome) {
        this._hideAllViews();
        this.chatView.style.display = 'flex';
        this.setActiveNav('navChat');
        document.getElementById('headerTitle').textContent = this.currentConversationId ? 'AI Chat' : 'Briefly';
        if (keepWelcome && !this.currentConversationId) this.showWelcome();
        this.closeSidebar();
    }

    showAnalyzerView() {
        this._hideAllViews();
        this.analyzerView.style.display = 'flex';
        this.setActiveNav('navAnalyzer');
        document.getElementById('headerTitle').textContent = 'Document Analyzer';
        this.showAnalyzerUpload();
        this.closeSidebar();
    }

    async showMakerView() {
        this._hideAllViews();
        this.makerView.style.display = 'flex';
        this.setActiveNav('navMaker');
        document.getElementById('headerTitle').textContent = 'Document Maker';
        this.closeSidebar();
        if (!this.makerState.types || Object.keys(this.makerState.types).length === 0) await this.loadMakerConfig();
        this.renderMakerTypes();
        this.renderFormatPills();
    }

    showWriterView() {
        this._hideAllViews();
        document.getElementById('writerView').style.display = 'flex';
        this.setActiveNav('navWriter');
        document.getElementById('headerTitle').textContent = 'Scribe — Text Editor';
        this.closeSidebar();
        if (!this.scribe) this.scribe = new ScribeEditor(this);
        this.scribe.init();
    }

    showSheetView() {
        this._hideAllViews();
        document.getElementById('sheetView').style.display = 'flex';
        this.setActiveNav('navSheet');
        document.getElementById('headerTitle').textContent = 'Gridly — Spreadsheet';
        this.closeSidebar();
        if (!this.gridly) this.gridly = new GridlyEditor(this);
        this.gridly.init();
    }

    showWelcome() {
        this._lastDividerKey = null;
        this.chatContainer.innerHTML = `
            <div class="welcome">
                <div class="welcome-glow"></div>
                <h2 class="welcome-title">Hello — what shall we tackle?</h2>
                <p class="welcome-sub">Ask anything. I'll keep it brief.</p>
                <div class="welcome-chips">
                    <button class="chip" data-prompt="Summarize quantum entanglement in 3 lines">Explain a concept</button>
                    <button class="chip" data-prompt="Write a polite email to reschedule a meeting">Draft an email</button>
                    <button class="chip" data-prompt="Give me 5 startup ideas in climate tech">Brainstorm ideas</button>
                </div>
            </div>`;
        // Re-bind chips
        this.chatContainer.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => { this.messageInput.value = chip.dataset.prompt; this.autoResizeTextarea(); this.sendMessage(); });
        });
    }

    hideWelcome() {
        const w = this.chatContainer.querySelector('.welcome');
        if (w) w.remove();
    }

    // =================== Conversations ===================
    async loadConversations() {
        if (!this.isLoggedIn) return;
        try {
            const r = await fetch('/api/conversations');
            const data = await r.json();
            if (data.success) this.displayConversations(data.conversations);
        } catch (e) { console.error('load conv', e); }
    }

    displayConversations(list) {
        this.conversationsList.innerHTML = '';
        if (!list.length) {
            this.conversationsList.innerHTML = '<div class="muted text-center p-3" style="font-size:13px;">No conversations yet</div>';
            return;
        }
        list.forEach(conv => {
            const el = document.createElement('div');
            el.className = 'conversation-item';
            if (conv.id === this.currentConversationId) el.classList.add('active');
            el.dataset.id = conv.id;
            el.innerHTML = `
                <div class="conversation-title">${this.escapeHtml(conv.title)}</div>
                <div class="conversation-date">${new Date(conv.created_at + 'Z').toLocaleString()}</div>
                <button class="conversation-delete" data-id="${conv.id}" aria-label="Delete"><i class="fas fa-trash"></i></button>
            `;
            el.addEventListener('click', e => { if (!e.target.closest('.conversation-delete')) this.loadConversation(conv.id); });
            el.querySelector('.conversation-delete').addEventListener('click', e => { e.stopPropagation(); this.deleteConversation(conv.id); });
            this.conversationsList.appendChild(el);
        });
    }

    filterConversations(term) {
        const t = (term || '').toLowerCase();
        this.conversationsList.querySelectorAll('.conversation-item').forEach(el => {
            const title = el.querySelector('.conversation-title').textContent.toLowerCase();
            el.style.display = title.includes(t) ? 'block' : 'none';
        });
    }

    startNewChat() {
        // Just reset state — backend will auto-create on first message
        this.currentConversationId = null;
        this.showChatView(true);
        document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
        this.messageInput.focus();
    }

    async loadConversation(id) {
        if (!this.isLoggedIn) return;
        this.currentConversationId = id;
        this.showChatView(false);
        document.querySelectorAll('.conversation-item').forEach(el => {
            el.classList.toggle('active', parseInt(el.dataset.id) === id);
        });
        try {
            const r = await fetch(`/api/conversations/${id}/messages`);
            const data = await r.json();
            if (data.success) this.displayMessages(data.messages);
        } catch (e) { console.error('load conv msgs', e); }
    }

    displayMessages(messages) {
        this.chatContainer.innerHTML = '';
        if (!messages.length) { this.showWelcome(); return; }
        this._lastDividerKey = null;
        messages.forEach(m => this.addMessage(m.content, m.role, false, false, m.created_at));
        this.scrollToBottom();
    }

    async deleteConversation(id) {
        if (!confirm('Delete this conversation?')) return;
        try {
            const r = await fetch(`/api/conversations/${id}/delete`, { method: 'POST' });
            const data = await r.json();
            if (data.success) {
                if (this.currentConversationId === id) { this.currentConversationId = null; this.showWelcome(); }
                this.loadConversations();
            }
        } catch (e) { this.showError('Failed to delete'); }
    }

    // =================== Date dividers ===================
    _dividerLabel(date) {
        const d = new Date(date);
        const now = new Date();
        const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate());
        const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        if (diff === 2) return 'Day before yesterday';
        if (diff > 0 && diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
        return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: now.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
    }

    _maybeAppendDivider(dateLike) {
        const d = new Date(dateLike);
        const key = d.toDateString();
        if (this._lastDividerKey === key) return;
        this._lastDividerKey = key;
        const div = document.createElement('div');
        div.className = 'date-divider';
        const span = document.createElement('span');
        span.textContent = this._dividerLabel(d);
        div.appendChild(span);
        this.chatContainer.appendChild(div);
    }

    _formatTime(dateLike) {
        const d = new Date(dateLike);
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    _userDisplayName() {
        return (this.userProfile?.name) || (this.userProfile?.username) || (this.userProfile?.email) || 'You';
    }

    _userInitial() {
        const n = this._userDisplayName();
        return (n || 'U').trim().charAt(0).toUpperCase();
    }

    // =================== Chat ===================
    autoResizeTextarea() {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 200) + 'px';
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isLoading) return;
        if (!this.isLoggedIn && this.isFreeChatLimitReached()) {
            this.showError('Free chat limit reached. Please log in.');
            this.authModal.show(); return;
        }
        this.hideWelcome();
        const now = new Date().toISOString();
        this.addMessage(message, 'user', true, false, now);
        this.messageInput.value = '';
        this.autoResizeTextarea();

        this.isLoading = true;
        this.sendBtn.disabled = true;
        // Insert AI bubble with placeholder
        const aiEl = this.addMessage('', 'assistant', true, true, now);

        try {
            await this._streamChat(message, aiEl);
        } catch (e) {
            console.error(e);
            aiEl.remove();
            this.showError('Network error');
        } finally {
            this.isLoading = false;
            this.sendBtn.disabled = false;
            this.messageInput.focus();
            if (!this.isLoggedIn) this.incrementFreeChatCount();
        }
    }

    async _streamChat(message, aiEl) {
        const resp = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, conversation_id: this.currentConversationId })
        });
        if (!resp.ok || !resp.body) throw new Error('Stream failed: ' + resp.status);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        const contentEl = aiEl.querySelector('.message-content');
        contentEl.innerHTML = '<span class="streaming-caret"></span>';
        let accumulated = '';
        let buffer = '';

        const parseEvents = (chunk) => {
            buffer += chunk;
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || '';
            const events = [];
            for (const block of parts) {
                let eventName = 'message';
                const dataLines = [];
                for (const line of block.split('\n')) {
                    if (line.startsWith('event:')) eventName = line.slice(6).trim();
                    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
                }
                if (dataLines.length) {
                    try { events.push({ event: eventName, data: JSON.parse(dataLines.join('\n')) }); } catch (e) {}
                }
            }
            return events;
        };

        let errored = false;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const events = parseEvents(chunk);
            for (const ev of events) {
                if (ev.event === 'meta') {
                    if (!this.currentConversationId && ev.data.conversation_id) {
                        this.currentConversationId = ev.data.conversation_id;
                        document.getElementById('headerTitle').textContent = 'AI Chat';
                        if (this.isLoggedIn) this.loadConversations();
                    }
                } else if (ev.event === 'error') {
                    errored = true;
                    aiEl.remove();
                    this.showError(ev.data.error || 'Generation failed');
                    return;
                } else if (ev.event === 'done') {
                    if (ev.data.full) accumulated = ev.data.full;
                    // Update timestamp on AI bubble if provided
                    if (ev.data.created_at) {
                        const t = aiEl.querySelector('.message-time');
                        if (t) t.textContent = this._formatTime(ev.data.created_at);
                    }
                } else {
                    // delta
                    if (ev.data.delta) {
                        accumulated += ev.data.delta;
                        contentEl.innerHTML = this.renderMarkdown(accumulated) + '<span class="streaming-caret"></span>';
                        this.scrollToBottom();
                    }
                }
            }
        }
        if (!errored) {
            contentEl.innerHTML = this.renderMarkdown(accumulated);
            // Hydrate copy buttons
            this._hydrateCodeBlocks(contentEl);
            this.scrollToBottom();
        }
    }

    addMessage(text, sender, scroll = true, isPlaceholder = false, createdAt = null) {
        const ts = createdAt ? new Date(createdAt + (createdAt.endsWith('Z') ? '' : (createdAt.includes('T') ? '' : 'Z'))) : new Date();
        this._maybeAppendDivider(ts);

        const wrap = document.createElement('div');
        wrap.className = `message ${sender}`;

        const side = document.createElement('div');
        side.className = 'message-side';
        const label = document.createElement('div');
        label.className = 'message-label';
        label.textContent = sender === 'user' ? this._userDisplayName() : 'AI';
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        if (sender === 'user') avatar.textContent = this._userInitial();
        else avatar.innerHTML = '<i class="fas fa-sparkles"></i>';
        side.append(label, avatar);

        const body = document.createElement('div');
        body.className = 'message-body';
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = this._formatTime(ts);
        const content = document.createElement('div');
        content.className = 'message-content';
        if (sender === 'user') {
            content.textContent = text;
        } else {
            content.innerHTML = isPlaceholder
                ? '<span class="muted"><i class="fas fa-spinner fa-spin me-2"></i>Thinking…</span>'
                : this.renderMarkdown(text);
            if (!isPlaceholder) this._hydrateCodeBlocks(content);
        }
        body.append(time, content);

        wrap.append(side, body);
        this.chatContainer.appendChild(wrap);
        if (scroll) this.scrollToBottom();
        return wrap;
    }

    // Full markdown renderer (marked + DOMPurify) — used only for AI messages
    renderMarkdown(text) {
        if (!text) return '';
        try {
            if (typeof marked === 'undefined') return this.escapeHtml(text).replace(/\n/g, '<br>');
            marked.setOptions({ breaks: true, gfm: true });
            const raw = marked.parse(text);
            const clean = (typeof DOMPurify !== 'undefined')
                ? DOMPurify.sanitize(raw, { ADD_ATTR: ['target', 'rel'] })
                : raw;
            return clean;
        } catch (e) {
            console.error('markdown error', e);
            return this.escapeHtml(text).replace(/\n/g, '<br>');
        }
    }

    // Add copy buttons to <pre><code> blocks inside a rendered element
    _hydrateCodeBlocks(root) {
        root.querySelectorAll('pre > code').forEach(code => {
            const pre = code.parentElement;
            if (pre.dataset.hydrated === '1') return;
            pre.dataset.hydrated = '1';
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            const header = document.createElement('div');
            header.className = 'code-block-header';
            // language detection
            const langMatch = (code.className || '').match(/language-(\w+)/);
            const language = langMatch ? langMatch[1] : 'text';
            header.innerHTML = `<span class="code-language">${language}</span>`;
            const btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            btn.addEventListener('click', () => {
                navigator.clipboard.writeText(code.textContent).then(() => {
                    const o = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => btn.innerHTML = o, 1500);
                });
            });
            header.appendChild(btn);
            // Replace <pre> with wrapper containing header + pre
            pre.classList.add('code-block');
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(header);
            wrapper.appendChild(pre);
        });
        // Inline <code>
        root.querySelectorAll('code').forEach(c => {
            if (c.parentElement.tagName !== 'PRE' && !c.classList.contains('inline-code')) {
                c.classList.add('inline-code');
            }
        });
    }

    formatMessage(text) {
        // Backwards-compat for the analyzer summary etc. (escaped + light markdown)
        let f = this.escapeHtml(text);
        f = f.replace(/```(\w+)?\n([\s\S]*?)```/g, (m, lang, code) => {
            const language = lang || 'text';
            return `<pre class="code-block"><code class="language-${language}">${code.trim()}</code></pre>`;
        });
        f = f.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        f = f.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        f = f.replace(/\n/g, '<br>');
        f = f.replace(/https?:\/\/[^\s<]+/g, m => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);
        return f;
    }

    escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return (text || '').toString().replace(/[&<>"']/g, m => map[m]);
    }

    showError(msg) { this.errorToastMessage.textContent = msg; this.errorToast.show(); }
    scrollToBottom() { this.chatContainer.scrollTop = this.chatContainer.scrollHeight; }

    // =================== Document Analyzer ===================
    showAnalyzerUpload() {
        document.getElementById('docUploadSection').style.display = 'block';
        document.getElementById('docAnalysisSection').style.display = 'none';
        document.getElementById('docAnalyzerLoading').style.display = 'none';
        document.getElementById('docAnalyzerError').style.display = 'none';
        this._bindDragAndDrop();
    }

    _bindDragAndDrop() {
        const dz = document.getElementById('docDropZone');
        if (!dz || dz.dataset.dnd === '1') return;
        dz.dataset.dnd = '1';
        const fileInput = document.getElementById('docAnalyzerFile');
        ['dragenter', 'dragover'].forEach(ev => {
            dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); });
        });
        ['dragleave', 'drop'].forEach(ev => {
            dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over'); });
        });
        dz.addEventListener('drop', e => {
            const f = e.dataTransfer?.files?.[0];
            if (!f) return;
            const allowed = ['pdf', 'docx', 'doc', 'txt'];
            const ext = f.name.split('.').pop().toLowerCase();
            if (!allowed.includes(ext)) { this.showError('Only PDF, DOCX or TXT files are supported'); return; }
            // Assign file to input via DataTransfer so existing form flow works
            const dt = new DataTransfer(); dt.items.add(f); fileInput.files = dt.files;
            // Auto-fill name if blank
            const nameInput = document.getElementById('docAnalyzerName');
            if (!nameInput.value.trim()) nameInput.value = f.name.replace(/\.[^.]+$/, '');
            // Trigger upload immediately
            this.handleAnalyzerUpload();
        });
    }

    async handleAnalyzerUpload() {
        const file = document.getElementById('docAnalyzerFile').files[0];
        const name = document.getElementById('docAnalyzerName').value.trim();
        const err = document.getElementById('docAnalyzerError'); const loading = document.getElementById('docAnalyzerLoading');
        const btn = document.getElementById('docAnalyzerUploadBtn');
        if (!file) { err.textContent = 'Please select a file'; err.style.display = 'block'; return; }
        const fd = new FormData(); fd.append('file', file); if (name) fd.append('name', name);
        loading.style.display = 'block'; err.style.display = 'none';
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Analyzing…';
        try {
            const r = await fetch('/api/upload-document', { method: 'POST', body: fd });
            const data = await r.json();
            if (data.success) {
                this.currentDocument = {
                    id: data.id,
                    filename: data.filename,
                    display_name: data.display_name || data.filename,
                    summary: data.summary,
                    topics: data.topics,
                    content: data.content,
                };
                this.renderAnalyzer();
                // Refresh document history in sidebar
                this.loadDocuments();
            } else { err.textContent = data.error || 'Failed'; err.style.display = 'block'; }
        } catch (e) { err.textContent = 'Upload failed'; err.style.display = 'block'; }
        finally { loading.style.display = 'none'; btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload me-2"></i>Upload & Analyze'; }
    }

    renderAnalyzer() {
        document.getElementById('docUploadSection').style.display = 'none';
        document.getElementById('docAnalysisSection').style.display = 'block';
        document.getElementById('docAnalyzerTitle').textContent = this.currentDocument.display_name || this.currentDocument.filename;
        document.getElementById('docSummaryContent').innerHTML = this.renderMarkdown(this.currentDocument.summary || '');
        const topics = (this.currentDocument.topics || '').split(',').map(t => t.trim()).filter(Boolean);
        document.getElementById('docTopicsContent').innerHTML = topics.map(t => `<span class="topic-pill">${this.escapeHtml(t)}</span>`).join('');
        document.getElementById('docAnalyzerChatMessages').innerHTML = '';
        document.getElementById('docAnalyzerSearch').value = '';
    }

    // =================== Document history (Analyzer) ===================
    async loadDocuments() {
        if (!this.isLoggedIn) return;
        try {
            const r = await fetch('/api/documents');
            const data = await r.json();
            if (data.success) this.displayDocuments(data.documents);
        } catch (e) { console.error('load docs', e); }
    }

    displayDocuments(list) {
        const wrap = document.getElementById('documentsList');
        wrap.innerHTML = '';
        if (!list.length) {
            wrap.innerHTML = '<div class="muted text-center p-2" style="font-size:12px;">No saved documents</div>';
            return;
        }
        list.forEach(d => {
            const el = document.createElement('div');
            el.className = 'conversation-item';
            if (this.currentDocument && this.currentDocument.id === d.id) el.classList.add('active');
            el.dataset.docid = d.id;
            const created = d.created_at ? new Date(d.created_at.replace(' ', 'T') + 'Z').toLocaleString() : '';
            el.innerHTML = `
                <div class="conversation-title"><i class="fas fa-file-lines me-1" style="color:var(--accent);"></i>${this.escapeHtml(d.display_name || d.filename)}</div>
                <div class="conversation-date">${created}</div>
                <button class="conversation-delete" data-id="${d.id}" aria-label="Delete"><i class="fas fa-trash"></i></button>
            `;
            el.addEventListener('click', e => { if (!e.target.closest('.conversation-delete')) this.openDocument(d.id); });
            el.querySelector('.conversation-delete').addEventListener('click', e => { e.stopPropagation(); this.removeDocument(d.id); });
            wrap.appendChild(el);
        });
    }

    async openDocument(id) {
        try {
            const r = await fetch('/api/documents/' + id);
            const data = await r.json();
            if (!data.success) { this.showError(data.error || 'Failed to open'); return; }
            const d = data.document;
            this.currentDocument = {
                id: d.id,
                filename: d.filename,
                display_name: d.display_name || d.filename,
                summary: d.summary || '',
                topics: d.topics || '',
                content: d.content || '',
            };
            this.showAnalyzerView();
            this.renderAnalyzer();
            // Mark active in sidebar
            document.querySelectorAll('#documentsList .conversation-item').forEach(el => {
                el.classList.toggle('active', parseInt(el.dataset.docid) === id);
            });
        } catch (e) { this.showError('Failed to load document'); }
    }

    async removeDocument(id) {
        if (!confirm('Delete this saved document?')) return;
        try {
            const r = await fetch('/api/documents/' + id + '/delete', { method: 'POST' });
            const data = await r.json();
            if (data.success) {
                if (this.currentDocument && this.currentDocument.id === id) {
                    this.currentDocument = null;
                    this.showAnalyzerUpload();
                }
                this.loadDocuments();
            }
        } catch (e) { this.showError('Failed to delete'); }
    }

    // FIX: search now renders real DOM nodes (no escaped spans) by inserting
    // the highlight markup AFTER the formatter has escaped HTML.
    searchAnalyzerContent(term) {
        const target = document.getElementById('docSummaryContent');
        const summary = this.currentDocument?.summary || '';
        if (!term) { target.innerHTML = this.renderMarkdown(summary); return; }
        const safeTerm = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        target.innerHTML = this.renderMarkdown(summary);
        const regex = new RegExp(safeTerm, 'gi');
        this._highlightTextNodes(target, regex);
    }

    _highlightTextNodes(root, regex) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        textNodes.forEach(node => {
            const value = node.nodeValue;
            if (!regex.test(value)) return;
            regex.lastIndex = 0;
            const frag = document.createDocumentFragment();
            let lastIndex = 0; let m;
            while ((m = regex.exec(value)) !== null) {
                if (m.index > lastIndex) frag.appendChild(document.createTextNode(value.slice(lastIndex, m.index)));
                const span = document.createElement('span');
                span.className = 'search-highlight';
                span.textContent = m[0];
                frag.appendChild(span);
                lastIndex = m.index + m[0].length;
                if (m[0].length === 0) regex.lastIndex++; // avoid infinite loop
            }
            if (lastIndex < value.length) frag.appendChild(document.createTextNode(value.slice(lastIndex)));
            node.parentNode.replaceChild(frag, node);
        });
    }

    async sendAnalyzerChat() {
        const input = document.getElementById('docAnalyzerChatInput');
        const msg = input.value.trim(); if (!msg || !this.currentDocument) return;
        const box = document.getElementById('docAnalyzerChatMessages');
        box.insertAdjacentHTML('beforeend', `<div class="doc-message user"><strong>You:</strong> ${this.escapeHtml(msg)}</div>`);
        input.value = '';
        const thinkingId = 'think-' + Date.now();
        box.insertAdjacentHTML('beforeend', `<div class="doc-message assistant" id="${thinkingId}"><i class="fas fa-spinner fa-spin me-2"></i>Thinking…</div>`);
        box.scrollTop = box.scrollHeight;
        try {
            const r = await fetch('/api/document-chat', { method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ message: msg, document_content: this.currentDocument.content, document_summary: this.currentDocument.summary }) });
            const data = await r.json();
            document.getElementById(thinkingId)?.remove();
            if (data.success) box.insertAdjacentHTML('beforeend', `<div class="doc-message assistant"><strong>AI:</strong> ${this.renderMarkdown(data.response || '')}</div>`);
            else box.insertAdjacentHTML('beforeend', `<div class="doc-message assistant"><strong>Error:</strong> ${this.escapeHtml(data.error||'Failed')}</div>`);
        } catch (e) {
            document.getElementById(thinkingId)?.remove();
            box.insertAdjacentHTML('beforeend', `<div class="doc-message assistant"><strong>Error:</strong> Network failure</div>`);
        }
        box.scrollTop = box.scrollHeight;
    }

    // =================== Document Maker ===================
    async loadMakerConfig() {
        try {
            const r = await fetch('/api/document-maker/types');
            const data = await r.json();
            if (data.success) { this.makerState.types = data.types; this.makerState.formats = data.formats; }
        } catch (e) { console.error('maker config', e); }
    }

    renderMakerTypes() {
        const grid = document.getElementById('docTypeGrid');
        grid.innerHTML = '';
        Object.entries(this.makerState.types).forEach(([key, t]) => {
            const card = document.createElement('div');
            card.className = 'type-card';
            card.dataset.type = key;
            card.dataset.testid = `maker-type-${key}`;
            card.setAttribute('data-testid', `maker-type-${key}`);
            card.innerHTML = `<i class="fas ${t.icon}"></i><span>${t.label}</span>`;
            card.addEventListener('click', () => { this.makerState.type = key; this.renderMakerTypes(); this.renderMakerFields(); });
            if (this.makerState.type === key) card.classList.add('active');
            grid.appendChild(card);
        });
        if (!this.makerState.type) document.getElementById('makerFields').innerHTML = '<p class="muted text-center my-3">Pick a document type to continue.</p>';
    }

    renderFormatPills() {
        const row = document.getElementById('formatRow');
        row.innerHTML = '';
        this.makerState.formats.forEach(f => {
            const pill = document.createElement('button');
            pill.type = 'button';
            pill.className = 'format-pill' + (f === this.makerState.format ? ' active' : '');
            pill.textContent = f.toUpperCase();
            pill.setAttribute('data-testid', `maker-format-${f}`);
            pill.addEventListener('click', () => { this.makerState.format = f; this.renderFormatPills(); });
            row.appendChild(pill);
        });
    }

    renderMakerFields() {
        const c = document.getElementById('makerFields');
        const t = this.makerState.type;
        if (!t) { c.innerHTML = '<p class="muted text-center my-3">Pick a document type to continue.</p>'; return; }

        if (t === 'bill') {
            c.innerHTML = `
                <div class="maker-field-grid">
                    <div class="maker-field"><label>Invoice #</label><input id="f-invoice-number" value="INV-001"></div>
                    <div class="maker-field"><label>Date</label><input type="date" id="f-date" value="${new Date().toISOString().slice(0,10)}"></div>
                    <div class="maker-field"><label>Currency</label><input id="f-currency" value="$" maxlength="3"></div>
                    <div class="maker-field"><label>Client name</label><input id="f-client-name" placeholder="Acme Inc."></div>
                    <div class="maker-field full"><label>Client address</label><textarea id="f-client-address" rows="2" placeholder="Street, City…"></textarea></div>
                </div>
                <div class="mt-3">
                    <label class="form-label" style="color:var(--text-dim);font-size:13px;">Line items</label>
                    <div id="billItems" class="bill-items"></div>
                    <button type="button" class="btn-add-row mt-2" id="addBillItem"><i class="fas fa-plus me-2"></i>Add item</button>
                </div>
                <div class="maker-field full mt-3"><label>Notes (optional)</label><textarea id="f-notes" rows="2"></textarea></div>
            `;
            this._addBillItemRow({ name: 'Service A', qty: 1, price: 100 });
            this._addBillItemRow({ name: 'Service B', qty: 2, price: 50 });
            document.getElementById('addBillItem').addEventListener('click', () => this._addBillItemRow());
        }
        else if (t === 'resume') {
            c.innerHTML = `
                <div class="maker-field-grid">
                    <div class="maker-field full"><label>Template</label><select id="f-template">
                        <option value="classic" selected>Classic — simple black text (default)</option>
                        <option value="modern">Modern — centered header with divider</option>
                        <option value="compact">Compact — uppercase headings, bullet body</option>
                    </select></div>
                    <div class="maker-field full"><label>Full name</label><input id="f-full-name" placeholder="Jane Doe"></div>
                    <div class="maker-field full"><label>Headline / Role</label><input id="f-headline" placeholder="Senior Engineer"></div>
                    <div class="maker-field"><label>Email</label><input id="f-email" placeholder="jane@example.com"></div>
                    <div class="maker-field"><label>Phone</label><input id="f-phone" placeholder="+1 555 0123"></div>
                    <div class="maker-field"><label>Location</label><input id="f-location" placeholder="San Francisco, CA"></div>
                    <div class="maker-field"><label>Website</label><input id="f-website" placeholder="https://jane.dev"></div>
                    <div class="maker-field full"><label>Profile (summary)</label><textarea id="f-summary" rows="3" placeholder="Senior engineer with 6+ years…"></textarea></div>
                    <div class="maker-field full"><label>Work Experience (one entry per line)</label><textarea id="f-experience" rows="5" placeholder="2022–Present · Senior Engineer @ Acme — led X, built Y\n2019–2022 · Engineer @ Beta — shipped Z"></textarea></div>
                    <div class="maker-field full"><label>Education (one entry per line)</label><textarea id="f-education" rows="3" placeholder="2015–2019 · B.Sc. Computer Science · MIT"></textarea></div>
                    <div class="maker-field full"><label>Technical Skills</label><textarea id="f-skills" rows="2" placeholder="Python, React, PostgreSQL, AWS"></textarea></div>
                    <div class="maker-field full"><label>Projects (one per line)</label><textarea id="f-projects" rows="3" placeholder="Briefly AI — AI workspace with chat, doc analyzer & maker"></textarea></div>
                    <div class="maker-field"><label>Hobbies</label><input id="f-hobbies" placeholder="Photography, hiking"></div>
                    <div class="maker-field"><label>Languages Known</label><input id="f-languages" placeholder="English, Spanish"></div>
                </div>
            `;
        }
        else {
            // Generic doc: project_architecture / school_project / college_project / thesis / report / letter / meeting_minutes / business_plan / custom
            c.innerHTML = `
                <div class="maker-field-grid">
                    <div class="maker-field full"><label>Title</label><input id="f-title" placeholder="${this.escapeHtml(this.makerState.types[t]?.label || 'Document')}"></div>
                    <div class="maker-field full"><label>Subtitle (optional)</label><input id="f-subtitle" placeholder=""></div>
                </div>
                <div class="mt-3">
                    <label class="form-label" style="color:var(--text-dim);font-size:13px;">Sections (heading + body)</label>
                    <div id="sectionsBuilder" class="sections-builder"></div>
                    <button type="button" class="btn-add-row mt-2" id="addSection"><i class="fas fa-plus me-2"></i>Add section</button>
                </div>
                <div class="maker-field full mt-3">
                    <label>OR write a short brief (we'll expand it for you)</label>
                    <textarea id="f-content" rows="3" placeholder="A one-line description of what this document should cover…"></textarea>
                </div>
            `;
            const defaultSections = this._defaultSectionsFor(t);
            defaultSections.forEach(s => this._addSectionBlock(s));
            document.getElementById('addSection').addEventListener('click', () => this._addSectionBlock());
        }
    }

    _defaultSectionsFor(type) {
        const sets = {
            project_architecture: [
                { heading: 'Overview', body: 'High-level summary of the project.' },
                { heading: 'Architecture Diagram (description)', body: 'Describe the components and their interactions.' },
                { heading: 'Tech Stack', body: 'List frameworks, services and databases used.' },
                { heading: 'Data Flow', body: 'How data moves through the system.' },
            ],
            school_project: [
                { heading: 'Title & Objective', body: '' },
                { heading: 'Introduction', body: '' },
                { heading: 'Materials Used', body: '' },
                { heading: 'Conclusion', body: '' },
            ],
            college_project: [
                { heading: 'Abstract', body: '' },
                { heading: 'Introduction', body: '' },
                { heading: 'Literature Review', body: '' },
                { heading: 'Methodology', body: '' },
                { heading: 'Results', body: '' },
                { heading: 'Conclusion', body: '' },
            ],
            thesis: [
                { heading: 'Abstract', body: '' },
                { heading: 'Chapter 1 — Introduction', body: '' },
                { heading: 'Chapter 2 — Literature Review', body: '' },
                { heading: 'Chapter 3 — Methodology', body: '' },
                { heading: 'Chapter 4 — Results & Discussion', body: '' },
                { heading: 'Chapter 5 — Conclusion', body: '' },
                { heading: 'References', body: '' },
            ],
            report: [
                { heading: 'Executive Summary', body: '' },
                { heading: 'Findings', body: '' },
                { heading: 'Recommendations', body: '' },
            ],
            letter: [
                { heading: 'Recipient', body: '' },
                { heading: 'Body', body: '' },
                { heading: 'Sign-off', body: '' },
            ],
            meeting_minutes: [
                { heading: 'Attendees', body: '' },
                { heading: 'Agenda', body: '' },
                { heading: 'Discussion', body: '' },
                { heading: 'Action Items', body: '' },
            ],
            business_plan: [
                { heading: 'Executive Summary', body: '' },
                { heading: 'Market Opportunity', body: '' },
                { heading: 'Product / Service', body: '' },
                { heading: 'Go-to-market', body: '' },
                { heading: 'Financials', body: '' },
            ],
            custom: [],
        };
        return sets[type] || [];
    }

    _addBillItemRow(prefill) {
        const wrap = document.getElementById('billItems');
        const row = document.createElement('div');
        row.className = 'bill-item-row';
        row.innerHTML = `
            <input class="bi-name" placeholder="Item / service" value="${this.escapeHtml(prefill?.name||'')}">
            <input class="bi-qty" type="number" min="0" step="1" placeholder="Qty" value="${prefill?.qty||1}">
            <input class="bi-price" type="number" min="0" step="0.01" placeholder="Price" value="${prefill?.price||0}">
            <button type="button" class="remove-row"><i class="fas fa-xmark"></i></button>
        `;
        row.querySelector('.remove-row').addEventListener('click', () => row.remove());
        wrap.appendChild(row);
    }

    _addSectionBlock(prefill) {
        const wrap = document.getElementById('sectionsBuilder');
        const block = document.createElement('div');
        block.className = 'section-block';
        block.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <input class="sec-heading form-control" style="background:transparent;border:none;color:var(--text);font-weight:600;padding:0;" placeholder="Section heading" value="${this.escapeHtml(prefill?.heading||'')}">
                <button type="button" class="remove-section"><i class="fas fa-trash"></i></button>
            </div>
            <textarea class="sec-body form-control" rows="3" placeholder="Section body…">${this.escapeHtml(prefill?.body||'')}</textarea>
        `;
        block.querySelector('.remove-section').addEventListener('click', () => block.remove());
        wrap.appendChild(block);
    }

    _collectMakerData() {
        const t = this.makerState.type;
        if (t === 'bill') {
            const items = Array.from(document.querySelectorAll('#billItems .bill-item-row')).map(r => ({
                name: r.querySelector('.bi-name').value.trim(),
                qty: parseFloat(r.querySelector('.bi-qty').value || 0),
                price: parseFloat(r.querySelector('.bi-price').value || 0),
            })).filter(i => i.name);
            return {
                invoice_number: document.getElementById('f-invoice-number')?.value || 'INV-001',
                date: document.getElementById('f-date')?.value || '',
                currency: document.getElementById('f-currency')?.value || '$',
                client_name: document.getElementById('f-client-name')?.value || '',
                client_address: document.getElementById('f-client-address')?.value || '',
                notes: document.getElementById('f-notes')?.value || '',
                items,
                title: 'Invoice'
            };
        }
        if (t === 'resume') {
            return {
                template: document.getElementById('f-template')?.value || 'classic',
                title: document.getElementById('f-full-name')?.value || 'Resume',
                full_name: document.getElementById('f-full-name')?.value || '',
                headline: document.getElementById('f-headline')?.value || '',
                email: document.getElementById('f-email')?.value || '',
                phone: document.getElementById('f-phone')?.value || '',
                location: document.getElementById('f-location')?.value || '',
                website: document.getElementById('f-website')?.value || '',
                summary: document.getElementById('f-summary')?.value || '',
                experience: document.getElementById('f-experience')?.value || '',
                education: document.getElementById('f-education')?.value || '',
                skills: document.getElementById('f-skills')?.value || '',
                projects: document.getElementById('f-projects')?.value || '',
                hobbies: document.getElementById('f-hobbies')?.value || '',
                languages: document.getElementById('f-languages')?.value || '',
            };
        }
        // Generic
        const sections = Array.from(document.querySelectorAll('#sectionsBuilder .section-block')).map(b => ({
            heading: b.querySelector('.sec-heading').value.trim(),
            body: b.querySelector('.sec-body').value.trim(),
        })).filter(s => s.heading || s.body);
        return {
            title: document.getElementById('f-title')?.value || this.makerState.types[t]?.label || 'Document',
            subtitle: document.getElementById('f-subtitle')?.value || '',
            sections,
            content: document.getElementById('f-content')?.value || '',
        };
    }

    async generateDocument() {
        if (!this.makerState.type) { this.showError('Pick a document type first'); return; }
        const data = this._collectMakerData();
        const fmt = this.makerState.format;
        const status = document.getElementById('makerStatus');
        const btn = document.getElementById('generateDocBtn');
        status.style.display = 'block';
        status.className = 'alert alert-info mt-3';
        status.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Building your ' + fmt.toUpperCase() + ' file…';
        btn.disabled = true;

        try {
            const r = await fetch('/api/document-maker/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doc_type: this.makerState.type, format: fmt, data })
            });
            if (!r.ok) {
                const errData = await r.json().catch(() => ({}));
                throw new Error(errData.error || ('HTTP ' + r.status));
            }
            const blob = await r.blob();
            const ext = fmt;
            const cd = r.headers.get('content-disposition') || '';
            const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
            const filename = m ? decodeURIComponent(m[1]) : `document.${ext}`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            status.className = 'alert alert-success mt-3';
            status.innerHTML = `<i class="fas fa-circle-check me-2"></i>Downloaded <b>${this.escapeHtml(filename)}</b>`;
        } catch (e) {
            status.className = 'alert alert-danger mt-3';
            status.innerHTML = `<i class="fas fa-circle-exclamation me-2"></i>${this.escapeHtml(e.message || 'Generation failed')}`;
        } finally {
            btn.disabled = false;
        }
    }
}

// Global helper
function copyCode(id) {
    const el = document.getElementById(id); if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        const btn = el.closest('.code-block-wrapper').querySelector('.copy-btn');
        const o = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => btn.innerHTML = o, 1800);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
    console.log('Briefly initialised');
});

// ============================================================
// Drafts list (Scribe + Gridly) — attached to ChatApp prototype
// ============================================================
ChatApp.prototype.loadDrafts = async function(kind) {
    if (!this.isLoggedIn) return;
    try {
        const r = await fetch(`/api/editor/drafts?kind=${kind}`);
        const data = await r.json();
        if (data.success) this.displayDrafts(kind, data.drafts);
    } catch (e) { console.error('load drafts', kind, e); }
};

ChatApp.prototype.displayDrafts = function(kind, list) {
    const wrapId = kind === 'text' ? 'textDraftsList' : 'sheetDraftsList';
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!list.length) {
        wrap.innerHTML = `<div class="muted text-center p-2" style="font-size:12px;">No ${kind === 'text' ? 'Scribe drafts' : 'sheets'} yet</div>`;
        return;
    }
    const icon = kind === 'text' ? 'fa-feather' : 'fa-table-cells';
    list.forEach(d => {
        const el = document.createElement('div');
        el.className = 'conversation-item';
        el.dataset.draftid = d.id;
        const upd = d.updated_at ? new Date(d.updated_at.replace(' ', 'T') + 'Z').toLocaleString() : '';
        el.innerHTML = `
            <div class="conversation-title"><i class="fas ${icon} me-1" style="color:var(--accent);"></i>${this.escapeHtml(d.title)}</div>
            <div class="conversation-date">${upd}</div>
            <button class="conversation-delete" aria-label="Delete"><i class="fas fa-trash"></i></button>
        `;
        el.addEventListener('click', e => {
            if (e.target.closest('.conversation-delete')) return;
            if (kind === 'text') {
                this.showWriterView();
                this.scribe.openDraft(d.id);
            } else {
                this.showSheetView();
                this.gridly.openDraft(d.id);
            }
        });
        el.querySelector('.conversation-delete').addEventListener('click', async e => {
            e.stopPropagation();
            if (!confirm('Delete this draft?')) return;
            const r = await fetch(`/api/editor/drafts/${d.id}/delete`, { method: 'POST' });
            const data = await r.json();
            if (data.success) this.loadDrafts(kind);
        });
        wrap.appendChild(el);
    });
};

// ============================================================
// ScribeEditor — rich text editor (contenteditable + execCommand)
// ============================================================
class ScribeEditor {
    constructor(app) {
        this.app = app;
        this.draftId = null;
        this.canvas = document.getElementById('writerCanvas');
        this.titleInput = document.getElementById('writerTitle');
        this.toolbar = document.getElementById('writerToolbar');
        this.tabs = document.querySelectorAll('#writerView .ed-tab');
        this.statusEl = document.getElementById('writerStatus');
        this.activeTab = 'style';
        this._bound = false;
    }

    init() {
        if (this._bound) return;
        this._bound = true;
        this.tabs.forEach(t => t.addEventListener('click', () => {
            this.tabs.forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            this.activeTab = t.dataset.tab;
            this.renderToolbar();
        }));
        document.getElementById('writerNew').addEventListener('click', () => this.newDoc());
        document.getElementById('writerSave').addEventListener('click', () => this.saveDraft());
        document.querySelectorAll('#writerView .editor-export-menu a').forEach(a => {
            a.addEventListener('click', e => { e.preventDefault(); this.exportAs(a.dataset.fmt); });
        });
        this.canvas.addEventListener('input', () => this.setStatus('Editing… (unsaved)'));
        this.renderToolbar();
        if (!this.canvas.innerHTML.trim()) {
            this.canvas.innerHTML = '<h1>Untitled</h1><p>Start writing here…</p>';
        }
    }

    newDoc() {
        this.draftId = null;
        this.titleInput.value = 'Untitled';
        this.canvas.innerHTML = '<h1>Untitled</h1><p>Start writing here…</p>';
        this.setStatus('New blank document');
    }

    setStatus(msg) {
        this.statusEl.textContent = msg;
        if (this._statusTimer) clearTimeout(this._statusTimer);
        this._statusTimer = setTimeout(() => { this.statusEl.textContent = ''; }, 3500);
    }

    cmd(name, value = null) {
        this.canvas.focus();
        try { document.execCommand(name, false, value); } catch (e) {}
    }

    renderToolbar() {
        const tb = this.toolbar;
        tb.innerHTML = '';
        const mkBtn = (icon, title, action, opts = {}) => {
            const b = document.createElement('button');
            b.className = 'tb-btn';
            b.title = title;
            b.innerHTML = `<i class="fas ${icon}"></i>`;
            b.addEventListener('mousedown', e => e.preventDefault());
            b.addEventListener('click', action);
            if (opts.testid) b.setAttribute('data-testid', opts.testid);
            return b;
        };
        const sep = () => { const s = document.createElement('div'); s.className = 'tb-sep'; return s; };

        if (this.activeTab === 'style') {
            tb.appendChild(mkBtn('fa-bold', 'Bold (Ctrl+B)', () => this.cmd('bold'), {testid:'scribe-bold'}));
            tb.appendChild(mkBtn('fa-italic', 'Italic', () => this.cmd('italic'), {testid:'scribe-italic'}));
            tb.appendChild(mkBtn('fa-underline', 'Underline', () => this.cmd('underline')));
            tb.appendChild(mkBtn('fa-strikethrough', 'Strikethrough', () => this.cmd('strikeThrough')));
            tb.appendChild(sep());
            const fontSel = document.createElement('select');
            fontSel.className = 'tb-select';
            ['Calibri','Arial','Georgia','Times New Roman','Courier New','Verdana'].forEach(f => {
                const o = document.createElement('option'); o.value = f; o.textContent = f; fontSel.appendChild(o);
            });
            fontSel.addEventListener('change', () => this.cmd('fontName', fontSel.value));
            tb.appendChild(fontSel);
            const sizeSel = document.createElement('select');
            sizeSel.className = 'tb-select';
            ['1','2','3','4','5','6','7'].forEach(s => {
                const o = document.createElement('option'); o.value = s; o.textContent = ['8','10','12','14','18','24','36'][s-1] + 'px'; sizeSel.appendChild(o);
            });
            sizeSel.value = '3';
            sizeSel.addEventListener('change', () => this.cmd('fontSize', sizeSel.value));
            tb.appendChild(sizeSel);
            tb.appendChild(sep());
            const color = document.createElement('input');
            color.type = 'color'; color.className = 'tb-btn tb-color'; color.title = 'Text color'; color.value = '#000000';
            color.addEventListener('input', () => this.cmd('foreColor', color.value));
            tb.appendChild(color);
            const bg = document.createElement('input');
            bg.type = 'color'; bg.className = 'tb-btn tb-color'; bg.title = 'Highlight color'; bg.value = '#FFFF00';
            bg.addEventListener('input', () => this.cmd('hiliteColor', bg.value));
            tb.appendChild(bg);
        } else if (this.activeTab === 'structure') {
            const h = (lvl, label) => {
                const b = mkBtn('fa-heading', label, () => this.cmd('formatBlock', '<h'+lvl+'>'));
                b.innerHTML = '<span style="font-weight:700;">H'+lvl+'</span>';
                return b;
            };
            tb.appendChild(h(1, 'Heading 1'));
            tb.appendChild(h(2, 'Heading 2'));
            tb.appendChild(h(3, 'Heading 3'));
            const pBtn = mkBtn('fa-paragraph', 'Paragraph', () => this.cmd('formatBlock', '<p>'));
            tb.appendChild(pBtn);
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-list-ul', 'Bullet list', () => this.cmd('insertUnorderedList')));
            tb.appendChild(mkBtn('fa-list-ol', 'Numbered list', () => this.cmd('insertOrderedList')));
            tb.appendChild(mkBtn('fa-indent', 'Indent', () => this.cmd('indent')));
            tb.appendChild(mkBtn('fa-outdent', 'Outdent', () => this.cmd('outdent')));
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-align-left', 'Align left', () => this.cmd('justifyLeft')));
            tb.appendChild(mkBtn('fa-align-center', 'Align center', () => this.cmd('justifyCenter')));
            tb.appendChild(mkBtn('fa-align-right', 'Align right', () => this.cmd('justifyRight')));
            tb.appendChild(mkBtn('fa-align-justify', 'Justify', () => this.cmd('justifyFull')));
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-quote-left', 'Blockquote', () => this.cmd('formatBlock', '<blockquote>')));
        } else if (this.activeTab === 'embed') {
            tb.appendChild(mkBtn('fa-link', 'Insert link', () => {
                const url = prompt('URL:', 'https://'); if (url) this.cmd('createLink', url);
            }, {testid:'scribe-link'}));
            tb.appendChild(mkBtn('fa-link-slash', 'Unlink', () => this.cmd('unlink')));
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-table', 'Insert 2x2 table', () => {
                const html = '<table border="1" style="border-collapse:collapse;width:100%;"><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><p></p>';
                this.cmd('insertHTML', html);
            }));
            tb.appendChild(mkBtn('fa-image', 'Upload image from device', () => {
                const fi = document.createElement('input');
                fi.type = 'file'; fi.accept = 'image/*';
                fi.addEventListener('change', () => {
                    const f = fi.files && fi.files[0]; if (!f) return;
                    if (f.size > 4 * 1024 * 1024) { this.app.showError('Image too large (max 4MB)'); return; }
                    const reader = new FileReader();
                    reader.onload = () => {
                        const html = `<img src="${reader.result}" style="max-width:100%;" alt="${this.app.escapeHtml(f.name)}">`;
                        this.cmd('insertHTML', html);
                    };
                    reader.readAsDataURL(f);
                });
                fi.click();
            }));
            tb.appendChild(mkBtn('fa-link-simple', 'Image by URL', () => {
                const url = prompt('Image URL:'); if (url) this.cmd('insertImage', url);
            }));
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-minus', 'Horizontal rule', () => this.cmd('insertHorizontalRule')));
        } else if (this.activeTab === 'compose') {
            tb.appendChild(mkBtn('fa-rotate-left', 'Undo (Ctrl+Z)', () => this.cmd('undo')));
            tb.appendChild(mkBtn('fa-rotate-right', 'Redo (Ctrl+Y)', () => this.cmd('redo')));
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-eraser', 'Remove formatting', () => this.cmd('removeFormat')));
            tb.appendChild(mkBtn('fa-broom', 'Clear all', () => {
                if (confirm('Clear all content?')) this.canvas.innerHTML = '';
            }));
        }
    }

    async saveDraft() {
        const title = this.titleInput.value.trim() || 'Untitled';
        const content = this.canvas.innerHTML;
        try {
            let r, data;
            if (this.draftId) {
                r = await fetch(`/api/editor/drafts/${this.draftId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, content }) });
                data = await r.json();
            } else {
                r = await fetch('/api/editor/drafts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ kind: 'text', title, content }) });
                data = await r.json();
                if (data.success) this.draftId = data.id;
            }
            if (data.success) {
                this.setStatus('Draft saved ✓');
                this.app.loadDrafts('text');
            } else this.app.showError(data.error || 'Save failed');
        } catch (e) { this.app.showError('Save failed'); }
    }

    async openDraft(id) {
        try {
            const r = await fetch('/api/editor/drafts/' + id);
            const data = await r.json();
            if (!data.success) return this.app.showError(data.error || 'Open failed');
            this.draftId = data.draft.id;
            this.titleInput.value = data.draft.title || 'Untitled';
            this.canvas.innerHTML = data.draft.content || '';
            this.setStatus('Loaded draft');
            document.querySelectorAll('#textDraftsList .conversation-item').forEach(el => el.classList.toggle('active', parseInt(el.dataset.draftid) === id));
        } catch (e) { this.app.showError('Open failed'); }
    }

    async exportAs(fmt) {
        const title = this.titleInput.value.trim() || 'document';
        const html = this.canvas.innerHTML;
        this.setStatus(`Building ${fmt.toUpperCase()}…`);
        try {
            const r = await fetch('/api/editor/export/text', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, format: fmt, html })
            });
            if (!r.ok) { const err = await r.json().catch(()=>({})); throw new Error(err.error || 'HTTP '+r.status); }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${title}.${fmt}`;
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            this.setStatus(`Downloaded ${title}.${fmt}`);
        } catch (e) { this.app.showError(e.message || 'Export failed'); }
    }
}

// ============================================================
// GridlyEditor — spreadsheet editor
// ============================================================
class GridlyEditor {
    constructor(app) {
        this.app = app;
        this.draftId = null;
        // Multi-sheet model
        this.sheets = [this._blankSheet('Sheet1')];
        this.activeSheetIdx = 0;
        this.active = { r: 0, c: 0 };
        // DOM refs
        this.canvas = document.getElementById('sheetCanvas');
        this.titleInput = document.getElementById('sheetTitle');
        this.toolbar = document.getElementById('sheetToolbar');
        this.tabs = document.querySelectorAll('#sheetView .ed-tab');
        this.statusEl = document.getElementById('sheetStatus');
        this.cellRef = document.getElementById('sheetCellRef');
        this.formulaInput = document.getElementById('sheetFormulaInput');
        this.activeTab = 'cells';
        this._bound = false;
    }

    _blankSheet(name) {
        return { name, rows: 30, cols: 12, cells: {} };
    }

    get sheet() { return this.sheets[this.activeSheetIdx]; }

    init() {
        if (!this._bound) {
            this._bound = true;
            this.tabs.forEach(t => t.addEventListener('click', () => {
                this.tabs.forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                this.activeTab = t.dataset.tab;
                this.renderToolbar();
            }));
            document.getElementById('sheetNew').addEventListener('click', () => this.newWorkbook());
            document.getElementById('sheetSave').addEventListener('click', () => this.saveDraft());
            document.querySelectorAll('#sheetView .editor-export-menu a').forEach(a => {
                a.addEventListener('click', e => { e.preventDefault(); this.exportAs(a.dataset.fmt); });
            });
            this.formulaInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); this._commitFormulaBar(); }
            });
            // Ensure tabs strip container exists
            if (!document.getElementById('sheetTabsStrip')) {
                const strip = document.createElement('div');
                strip.id = 'sheetTabsStrip';
                strip.className = 'sheet-tabs-strip';
                this.canvas.parentNode.appendChild(strip);
            }
        }
        // Seed if empty
        if (Object.keys(this.sheet.cells).length === 0 && this.sheets.length === 1) {
            this.setCell(0,0,'Item'); this.setCell(0,1,'Qty'); this.setCell(0,2,'Price'); this.setCell(0,3,'Total');
            ['Apple','Bread','Milk'].forEach((n,i)=>{
                this.setCell(i+1,0,n); this.setCell(i+1,1,(i+1)); this.setCell(i+1,2,(i+1)*3);
                this.setCell(i+1,3, '=B'+(i+2)+'*C'+(i+2));
            });
            this.setCell(4,0,'Total'); this.setCell(4,3,'=SUM(D2:D4)');
            this._setCellAttrs(0,0,{bold:true}); this._setCellAttrs(0,1,{bold:true,align:'center'});
            this._setCellAttrs(0,2,{bold:true,align:'right'}); this._setCellAttrs(0,3,{bold:true,align:'right'});
            this._setCellAttrs(4,0,{bold:true}); this._setCellAttrs(4,3,{bold:true});
        }
        this.renderToolbar();
        this.renderGrid();
        this.renderSheetTabs();
    }

    static colName(c) {
        let s = ''; c = c + 1;
        while (c > 0) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1)/26); }
        return s;
    }
    static parseRef(ref) {
        const m = /^([A-Z]+)(\d+)$/.exec(ref.trim().toUpperCase()); if (!m) return null;
        let col = 0; for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
        return { r: parseInt(m[2], 10) - 1, c: col - 1 };
    }

    key(r, c) { return r + ',' + c; }
    getCell(r, c) { return this.sheet.cells[this.key(r, c)] || {}; }
    setCell(r, c, raw) {
        const k = this.key(r, c);
        if (!this.sheet.cells[k]) this.sheet.cells[k] = {};
        const cell = this.sheet.cells[k];
        const s = (raw == null) ? '' : String(raw);
        if (s.startsWith('=')) {
            cell.formula = s;
            cell.value = this._evalFormula(s);
        } else {
            delete cell.formula;
            cell.value = raw;
        }
    }
    _setCellAttrs(r, c, attrs) {
        const k = this.key(r, c);
        if (!this.sheet.cells[k]) this.sheet.cells[k] = {};
        Object.assign(this.sheet.cells[k], attrs);
    }

    // ===== Formula engine =====
    _evalFormula(expr, visiting = new Set()) {
        try {
            let s = expr.startsWith('=') ? expr.slice(1) : expr;
            // Expand functions first (non-nested simple)
            const funcs = ['SUM','AVG','AVERAGE','MIN','MAX','COUNT','PRODUCT'];
            let safety = 20;
            while (safety-- > 0) {
                const m = new RegExp('(' + funcs.join('|') + ')\\(([^()]*)\\)', 'i').exec(s);
                if (!m) break;
                const fname = m[1].toUpperCase();
                const args = this._collectArgs(m[2], visiting);
                const v = this._applyFn(fname, args);
                s = s.slice(0, m.index) + String(v) + s.slice(m.index + m[0].length);
            }
            // Replace any remaining single refs (A1, B12, …) with their numeric values
            s = s.replace(/[A-Z]+\d+/g, (ref) => {
                const p = GridlyEditor.parseRef(ref); if (!p) return ref;
                const v = this._refToNumber(p.r, p.c, visiting);
                return String(v == null ? 0 : v);
            });
            // Whitelist arithmetic only (digits, ops, spaces, parens, dot, e/E, minus)
            if (!/^[\d+\-*/().,\sEe]*$/.test(s)) return '#ERR';
            const out = Function('"use strict"; return (' + s + ')')();
            if (typeof out === 'number' && isFinite(out)) {
                return Number.isInteger(out) ? out : +out.toFixed(6);
            }
            return out;
        } catch (e) { return '#ERR'; }
    }

    _collectArgs(inside, visiting) {
        // Split args by comma (top level — but we've already stripped inner parens)
        const out = [];
        inside.split(',').forEach(part => {
            part = part.trim(); if (!part) return;
            const mRange = /^([A-Z]+\d+):([A-Z]+\d+)$/.exec(part.toUpperCase());
            if (mRange) {
                const a = GridlyEditor.parseRef(mRange[1]);
                const b = GridlyEditor.parseRef(mRange[2]);
                if (a && b) {
                    const r1 = Math.min(a.r, b.r), r2 = Math.max(a.r, b.r);
                    const c1 = Math.min(a.c, b.c), c2 = Math.max(a.c, b.c);
                    for (let r = r1; r <= r2; r++)
                        for (let c = c1; c <= c2; c++)
                            out.push(this._refToNumber(r, c, visiting));
                }
                return;
            }
            const p = GridlyEditor.parseRef(part);
            if (p) { out.push(this._refToNumber(p.r, p.c, visiting)); return; }
            // Plain number
            const n = parseFloat(part);
            out.push(isNaN(n) ? null : n);
        });
        return out;
    }

    _refToNumber(r, c, visiting) {
        const k = this.key(r, c);
        if (visiting.has(k)) return 0;          // circular guard
        const cell = this.sheet.cells[k];
        if (!cell) return 0;
        if (cell.formula) {
            visiting.add(k);
            const v = this._evalFormula(cell.formula, visiting);
            visiting.delete(k);
            const n = parseFloat(v); return isNaN(n) ? 0 : n;
        }
        const n = parseFloat(cell.value); return isNaN(n) ? 0 : n;
    }

    _applyFn(name, args) {
        const nums = args.map(a => { const n = parseFloat(a); return isNaN(n) ? null : n; }).filter(v => v != null);
        switch (name) {
            case 'SUM': return nums.reduce((s, v) => s + v, 0);
            case 'AVG':
            case 'AVERAGE': return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : 0;
            case 'MIN': return nums.length ? Math.min(...nums) : 0;
            case 'MAX': return nums.length ? Math.max(...nums) : 0;
            case 'COUNT': return nums.length;
            case 'PRODUCT': return nums.reduce((s, v) => s * v, 1);
            default: return 0;
        }
    }

    _recomputeAllFormulas() {
        // Recompute every cell that has a formula (handles dependencies on edits)
        const ents = Object.entries(this.sheet.cells);
        for (const [k, cell] of ents) {
            if (cell.formula) cell.value = this._evalFormula(cell.formula);
        }
    }

    _commitFormulaBar() {
        const {r, c} = this.active;
        this.setCell(r, c, this.formulaInput.value);
        this._recomputeAllFormulas();
        this.renderGrid();
    }

    newWorkbook() {
        if (!confirm('Discard current workbook?')) return;
        this.draftId = null; this.titleInput.value = 'Untitled';
        this.sheets = [this._blankSheet('Sheet1')]; this.activeSheetIdx = 0;
        this.init();
        this.setStatus('New blank workbook');
    }

    addSheet() {
        let i = this.sheets.length + 1; let name = 'Sheet' + i;
        while (this.sheets.some(s => s.name === name)) { i++; name = 'Sheet' + i; }
        this.sheets.push(this._blankSheet(name));
        this.activeSheetIdx = this.sheets.length - 1;
        this.renderGrid(); this.renderSheetTabs();
    }
    deleteSheet(idx) {
        if (this.sheets.length === 1) { this.app.showError('Workbook must have at least one sheet'); return; }
        if (!confirm('Delete sheet "' + this.sheets[idx].name + '"?')) return;
        this.sheets.splice(idx, 1);
        this.activeSheetIdx = Math.max(0, this.activeSheetIdx >= this.sheets.length ? this.sheets.length - 1 : (idx <= this.activeSheetIdx ? Math.max(0, this.activeSheetIdx - 1) : this.activeSheetIdx));
        this.renderGrid(); this.renderSheetTabs();
    }
    renameSheet(idx) {
        const n = prompt('Rename sheet:', this.sheets[idx].name);
        if (!n || !n.trim()) return;
        if (this.sheets.some((s, i) => i !== idx && s.name === n.trim())) { this.app.showError('Sheet name must be unique'); return; }
        this.sheets[idx].name = n.trim();
        this.renderSheetTabs();
    }
    switchSheet(idx) {
        this.activeSheetIdx = idx;
        this.active = { r: 0, c: 0 };
        this.renderGrid(); this.renderSheetTabs();
        this.cellRef.textContent = 'A1';
        this.formulaInput.value = this.getCell(0,0).formula || this.getCell(0,0).value || '';
    }

    setStatus(msg) {
        this.statusEl.textContent = msg;
        if (this._statusTimer) clearTimeout(this._statusTimer);
        this._statusTimer = setTimeout(() => { this.statusEl.textContent = ''; }, 3500);
    }

    renderSheetTabs() {
        const strip = document.getElementById('sheetTabsStrip');
        strip.innerHTML = '';
        this.sheets.forEach((s, idx) => {
            const t = document.createElement('div');
            t.className = 'sheet-tab' + (idx === this.activeSheetIdx ? ' active' : '');
            t.setAttribute('data-testid', 'gridly-sheet-tab-' + idx);
            t.innerHTML = `<span>${this.app.escapeHtml(s.name)}</span>
                <button class="sheet-tab-x" title="Delete sheet" aria-label="delete"><i class="fas fa-xmark"></i></button>`;
            t.addEventListener('click', e => {
                if (e.target.closest('.sheet-tab-x')) { this.deleteSheet(idx); return; }
                this.switchSheet(idx);
            });
            t.addEventListener('dblclick', e => { if (!e.target.closest('.sheet-tab-x')) this.renameSheet(idx); });
            strip.appendChild(t);
        });
        const add = document.createElement('div');
        add.className = 'sheet-tab-add'; add.setAttribute('data-testid', 'gridly-add-sheet');
        add.innerHTML = '<i class="fas fa-plus"></i>';
        add.title = 'Add sheet';
        add.addEventListener('click', () => this.addSheet());
        strip.appendChild(add);
    }

    renderToolbar() {
        const tb = this.toolbar; tb.innerHTML = '';
        const mkBtn = (icon, title, action, opts = {}) => {
            const b = document.createElement('button');
            b.className = 'tb-btn'; b.title = title;
            b.innerHTML = `<i class="fas ${icon}"></i>`;
            b.addEventListener('mousedown', e => e.preventDefault());
            b.addEventListener('click', action);
            if (opts.testid) b.setAttribute('data-testid', opts.testid);
            return b;
        };
        const sep = () => { const s = document.createElement('div'); s.className = 'tb-sep'; return s; };

        if (this.activeTab === 'cells') {
            tb.appendChild(mkBtn('fa-bold', 'Bold', () => this._toggleActive('bold'), {testid:'gridly-bold'}));
            tb.appendChild(mkBtn('fa-italic', 'Italic', () => this._toggleActive('italic')));
            tb.appendChild(mkBtn('fa-underline', 'Underline', () => this._toggleActive('underline')));
            tb.appendChild(sep());
            // Font size
            const sizeSel = document.createElement('select'); sizeSel.className = 'tb-select'; sizeSel.title = 'Font size';
            [10,11,12,13,14,16,18,22,28].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n + 'px'; sizeSel.appendChild(o); });
            sizeSel.value = (this.getCell(this.active.r, this.active.c).fontSize) || 13;
            sizeSel.addEventListener('change', () => this._setActive('fontSize', parseInt(sizeSel.value, 10)));
            tb.appendChild(sizeSel);
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-align-left', 'Left', () => this._setActive('align', 'left')));
            tb.appendChild(mkBtn('fa-align-center', 'Center', () => this._setActive('align', 'center')));
            tb.appendChild(mkBtn('fa-align-right', 'Right', () => this._setActive('align', 'right')));
            tb.appendChild(sep());
            // Text color
            const fc = document.createElement('input');
            fc.type = 'color'; fc.className = 'tb-btn tb-color'; fc.title = 'Text color'; fc.value = '#000000';
            fc.addEventListener('input', () => this._setActive('color', fc.value));
            tb.appendChild(fc);
            // Background fill
            const bg = document.createElement('input');
            bg.type = 'color'; bg.className = 'tb-btn tb-color'; bg.title = 'Cell fill'; bg.value = '#ffffff';
            bg.addEventListener('input', () => this._setActive('fillColor', bg.value));
            tb.appendChild(bg);
            tb.appendChild(mkBtn('fa-fill-drip', 'Clear fill', () => this._setActive('fillColor', null)));
            tb.appendChild(sep());
            // Hyperlink
            tb.appendChild(mkBtn('fa-link', 'Make cell a hyperlink', () => {
                const url = prompt('Link URL:', 'https://');
                if (url) this._setActive('link', url);
            }, {testid:'gridly-link'}));
            tb.appendChild(mkBtn('fa-link-slash', 'Remove hyperlink', () => this._setActive('link', null)));
        } else if (this.activeTab === 'grid') {
            tb.appendChild(mkBtn('fa-plus', 'Add row', () => { this.sheet.rows++; this.renderGrid(); }, {testid:'gridly-add-row'}));
            tb.appendChild(mkBtn('fa-plus', 'Add column', () => { this.sheet.cols++; this.renderGrid(); }, {testid:'gridly-add-col'}));
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-minus', 'Remove last row', () => { if (this.sheet.rows > 1) { this.sheet.rows--; this.renderGrid(); } }));
            tb.appendChild(mkBtn('fa-minus', 'Remove last column', () => { if (this.sheet.cols > 1) { this.sheet.cols--; this.renderGrid(); } }));
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-trash', 'Clear all cells', () => { if (confirm('Clear all cells in this sheet?')) { this.sheet.cells = {}; this.renderGrid(); } }));
        } else if (this.activeTab === 'numbers') {
            tb.appendChild(mkBtn('fa-percent', 'Format as %', () => {
                const {r,c} = this.active; const v = parseFloat(this.getCell(r,c).value);
                if (!isNaN(v)) { this.setCell(r,c, (v*100).toFixed(0) + '%'); this.renderGrid(); }
            }));
            tb.appendChild(mkBtn('fa-dollar-sign', 'Format as currency', () => {
                const {r,c} = this.active; const v = parseFloat(this.getCell(r,c).value);
                if (!isNaN(v)) { this.setCell(r,c, '$' + v.toFixed(2)); this.renderGrid(); }
            }));
            tb.appendChild(sep());
            // Quick formula buttons that insert formulas
            const fns = [['SUM','fa-sigma'], ['AVG','fa-chart-line'], ['MIN','fa-down-long'], ['MAX','fa-up-long'], ['COUNT','fa-hashtag']];
            fns.forEach(([fn, icon]) => {
                const b = document.createElement('button'); b.className = 'tb-btn';
                b.innerHTML = `<i class="fas ${icon}"></i>`; b.title = `Insert =${fn}() of column above`;
                b.addEventListener('click', () => {
                    const {r,c} = this.active;
                    if (r === 0) { this.app.showError('Need cells above to aggregate'); return; }
                    const colL = GridlyEditor.colName(c);
                    const formula = `=${fn}(${colL}1:${colL}${r})`;
                    this.formulaInput.value = formula;
                    this.setCell(r, c, formula);
                    this._recomputeAllFormulas();
                    this.renderGrid();
                });
                tb.appendChild(b);
            });
            tb.appendChild(sep());
            tb.appendChild(mkBtn('fa-rotate', 'Recompute all formulas', () => { this._recomputeAllFormulas(); this.renderGrid(); this.setStatus('Recomputed ✓'); }));
        }
    }

    _toggleActive(key) {
        const {r, c} = this.active;
        const cell = this.sheet.cells[this.key(r,c)] || (this.sheet.cells[this.key(r,c)] = {});
        cell[key] = !cell[key];
        this.renderGrid();
    }
    _setActive(key, val) {
        const {r, c} = this.active;
        const cell = this.sheet.cells[this.key(r,c)] || (this.sheet.cells[this.key(r,c)] = {});
        if (val === null) delete cell[key]; else cell[key] = val;
        this.renderGrid();
    }

    renderGrid() {
        const tbl = document.createElement('table'); tbl.className = 'sheet-table';
        const thead = document.createElement('tr');
        const th0 = document.createElement('th'); th0.className = 'row-header'; thead.appendChild(th0);
        for (let c = 0; c < this.sheet.cols; c++) {
            const th = document.createElement('th'); th.textContent = GridlyEditor.colName(c); thead.appendChild(th);
        }
        tbl.appendChild(thead);
        for (let r = 0; r < this.sheet.rows; r++) {
            const tr = document.createElement('tr');
            const rh = document.createElement('td'); rh.className = 'row-header'; rh.textContent = (r + 1); tr.appendChild(rh);
            for (let c = 0; c < this.sheet.cols; c++) {
                const td = document.createElement('td');
                td.dataset.r = r; td.dataset.c = c;
                const cell = this.getCell(r, c);
                if (cell.bold) td.classList.add('cell-bold');
                if (cell.italic) td.classList.add('cell-italic');
                if (cell.underline) td.classList.add('cell-underline');
                if (cell.align === 'center') td.classList.add('cell-center');
                if (cell.align === 'right') td.classList.add('cell-right');
                if (cell.fillColor) td.style.background = cell.fillColor;
                if (cell.color) td.style.color = cell.color;
                if (cell.fontSize) td.style.fontSize = cell.fontSize + 'px';
                if (this.active.r === r && this.active.c === c) td.classList.add('active');
                const input = document.createElement('input');
                // Display computed value (not formula); show formula in the formula bar on focus
                const display = (cell.formula != null) ? (cell.value != null ? cell.value : '') : (cell.value != null ? cell.value : '');
                input.value = display;
                if (cell.link) td.classList.add('cell-link');
                input.addEventListener('focus', () => {
                    this._setActiveCell(r, c);
                    // Show formula (if any) in the input itself while editing
                    if (cell.formula) input.value = cell.formula;
                });
                input.addEventListener('blur', () => {
                    this.setCell(r, c, input.value);
                    this._recomputeAllFormulas();
                    // Show computed value on blur
                    const c2 = this.getCell(r, c);
                    input.value = c2.value != null ? c2.value : '';
                    // also refresh other cells that may depend on this one
                    this.renderGrid();
                });
                input.addEventListener('keydown', e => {
                    if (e.key === 'Enter') { e.preventDefault(); input.blur(); this._focusCell(r + 1, c); }
                    else if (e.key === 'Tab') { e.preventDefault(); input.blur(); this._focusCell(r, c + 1); }
                });
                td.appendChild(input);
                tr.appendChild(td);
            }
            tbl.appendChild(tr);
        }
        this.canvas.innerHTML = '';
        this.canvas.appendChild(tbl);
    }

    _focusCell(r, c) {
        if (r >= this.sheet.rows) return;
        if (c >= this.sheet.cols) return;
        const td = this.canvas.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (td) { const inp = td.querySelector('input'); inp && inp.focus(); }
    }

    _setActiveCell(r, c) {
        this.canvas.querySelectorAll('td.active').forEach(t => t.classList.remove('active'));
        const td = this.canvas.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (td) td.classList.add('active');
        this.active = { r, c };
        this.cellRef.textContent = GridlyEditor.colName(c) + (r + 1);
        const cell = this.getCell(r, c);
        this.formulaInput.value = cell.formula || (cell.value != null ? cell.value : '');
    }

    _collectExportRows() {
        // Trim trailing empty rows/cols, use computed values
        let maxR = -1, maxC = -1;
        Object.entries(this.sheet.cells).forEach(([k, v]) => {
            const val = v.value;
            if (val == null || val === '') return;
            const [r, c] = k.split(',').map(Number);
            if (r > maxR) maxR = r; if (c > maxC) maxC = c;
        });
        const out = [];
        for (let r = 0; r <= maxR; r++) {
            const row = [];
            for (let c = 0; c <= maxC; c++) row.push(this.getCell(r, c).value ?? '');
            out.push(row);
        }
        return out;
    }

    async saveDraft() {
        const title = this.titleInput.value.trim() || 'Untitled';
        // Recompute before saving so values are up-to-date
        this.sheets.forEach((s, i) => { this.activeSheetIdx = i; this._recomputeAllFormulas(); });
        const content = JSON.stringify({ sheets: this.sheets, activeSheetIdx: this.activeSheetIdx });
        try {
            let r, data;
            if (this.draftId) {
                r = await fetch(`/api/editor/drafts/${this.draftId}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, content }) });
                data = await r.json();
            } else {
                r = await fetch('/api/editor/drafts', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ kind: 'sheet', title, content }) });
                data = await r.json();
                if (data.success) this.draftId = data.id;
            }
            if (data.success) { this.setStatus('Draft saved ✓'); this.app.loadDrafts('sheet'); }
            else this.app.showError(data.error || 'Save failed');
        } catch (e) { this.app.showError('Save failed'); }
    }

    async openDraft(id) {
        try {
            const r = await fetch('/api/editor/drafts/' + id);
            const data = await r.json();
            if (!data.success) return this.app.showError(data.error || 'Open failed');
            this.draftId = data.draft.id;
            this.titleInput.value = data.draft.title || 'Untitled';
            try {
                const parsed = JSON.parse(data.draft.content || '{}');
                if (Array.isArray(parsed.sheets) && parsed.sheets.length) {
                    this.sheets = parsed.sheets;
                    this.activeSheetIdx = Math.min(parsed.activeSheetIdx || 0, this.sheets.length - 1);
                } else {
                    // Legacy single-sheet content
                    this.sheets = [{ name: 'Sheet1', rows: parsed.rows || 30, cols: parsed.cols || 12, cells: parsed.cells || {} }];
                    this.activeSheetIdx = 0;
                }
            } catch (e) { this.sheets = [this._blankSheet('Sheet1')]; }
            this.sheets.forEach((s, i) => { this.activeSheetIdx = i; this._recomputeAllFormulas(); });
            this.activeSheetIdx = 0;
            this.renderGrid(); this.renderSheetTabs();
            this.setStatus('Loaded draft');
            document.querySelectorAll('#sheetDraftsList .conversation-item').forEach(el => el.classList.toggle('active', parseInt(el.dataset.draftid) === id));
        } catch (e) { this.app.showError('Open failed'); }
    }

    async exportAs(fmt) {
        const title = this.titleInput.value.trim() || 'spreadsheet';
        // Always export the currently active sheet
        const rows = this._collectExportRows();
        this.setStatus(`Building ${fmt.toUpperCase()}…`);
        try {
            const r = await fetch('/api/editor/export/sheet', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: `${title}_${this.sheet.name}`, format: fmt, rows })
            });
            if (!r.ok) { const err = await r.json().catch(()=>({})); throw new Error(err.error || 'HTTP '+r.status); }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${title}_${this.sheet.name}.${fmt}`;
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            this.setStatus(`Downloaded ${a.download}`);
        } catch (e) { this.app.showError(e.message || 'Export failed'); }
    }
}
