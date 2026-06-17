// =====================================
// Chat Application JavaScript
// =====================================

class ChatApp {
    constructor() {
        this.chatContainer = document.getElementById('chatContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.inputSection = document.querySelector('.input-section');
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
        
        this.uploadDocModal = new bootstrap.Modal(document.getElementById('uploadDocModal'));
        this.generateDocModal = new bootstrap.Modal(document.getElementById('generateDocModal'));
        
        this.isLoading = false;
        this.currentConversationId = null;
        this.isLoggedIn = false;
        this.userProfile = null;
        this.freeChatLimit = 5; // Number of free chats for non-logged-in users

        this.initEventListeners();
        this.checkAuthStatus();
        this.updateChatLimitDisplay();
    }

    initEventListeners() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Register form
        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Profile dropdown toggle
        document.getElementById('profileBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleProfileDropdown();
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            this.profileDropdown.style.display = 'none';
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.profileDropdown.style.display = 'none';
            this.openSettingsModal();
        });

        // Dropdown logout button
        document.getElementById('dropdownLogoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        // Sidebar logout button
        document.getElementById('sidebarLogoutBtn').addEventListener('click', () => this.handleLogout());

        // Sidebar login button
        document.getElementById('sidebarLoginBtn').addEventListener('click', () => {
            this.authModal.show();
        });

        // Profile form
        document.getElementById('profileForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleProfileUpdate();
        });

        // Password form
        document.getElementById('passwordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePasswordChange();
        });

        // Document Analyzer menu item
        document.getElementById('documentAnalyzerMenuItem').addEventListener('click', () => {
            if (!this.isLoggedIn) {
                this.showError('Please login to use Document Analyzer');
                this.authModal.show();
                return;
            }
            this.showDocumentAnalyzer();
        });

        // Document Analyzer upload form
        document.getElementById('docAnalyzerUploadForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDocumentAnalyzerUpload();
        });

        // Document Analyzer back to upload
        document.getElementById('backToUpload').addEventListener('click', () => {
            this.showDocumentAnalyzerUpload();
        });

        // Document Analyzer search
        document.getElementById('docAnalyzerSearch').addEventListener('input', (e) => {
            this.searchDocumentAnalyzerContent(e.target.value);
        });

        // Document Analyzer chat
        document.getElementById('docAnalyzerChatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendDocumentAnalyzerChat();
            }
        });
        document.getElementById('docAnalyzerSendBtn').addEventListener('click', () => this.sendDocumentAnalyzerChat());

        // New chat button
        document.getElementById('newChatBtn').addEventListener('click', () => this.createNewConversation());

        // Close sidebar button (mobile)
        document.getElementById('closeSidebarBtn').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('show');
        });

        // Send button click
        this.sendBtn.addEventListener('click', () => this.sendMessage());

        // Enter to send
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.autoResizeTextarea();
        });

        // Search conversations
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.filterConversations(e.target.value);
        });

        // Toggle sidebar on mobile
        document.getElementById('toggleSidebar')?.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('show');
        });
    }

    async checkAuthStatus() {
        try {
            const response = await fetch('/api/user');
            const data = await response.json();

            if (data.success) {
                this.isLoggedIn = true;
                this.userProfile = data.profile;
                this.usernameDisplay.textContent = data.profile?.name || data.username;
                this.dropdownUsername.textContent = data.profile?.name || data.username;
                this.showChatInterface();
                this.updateUIForLoggedIn();
                this.loadConversations();
                
                // Restore last selected tab
                this.restoreLastSelectedTab();
            } else {
                this.isLoggedIn = false;
                this.userProfile = null;
                this.hideChatInterface();
                this.updateUIForLoggedOut();
                this.authModal.show();
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.isLoggedIn = false;
            this.userProfile = null;
            this.hideChatInterface();
            this.updateUIForLoggedOut();
            this.authModal.show();
        }
    }

    async restoreLastSelectedTab() {
        const lastTab = this.getLastSelectedTab();
        
        if (lastTab.type === 'document' && lastTab.id) {
            // For now, just restore to chat since we don't persist document data
            // In the future, you'd fetch the document from the database
            await this.loadConversations();
        } else if (lastTab.type === 'conversation' && lastTab.id) {
            // Load the last conversation
            await this.loadConversations();
            setTimeout(() => {
                this.loadConversation(parseInt(lastTab.id));
            }, 500);
        }
    }

    updateUIForLoggedIn() {
        document.getElementById('sidebarLoginBtn').style.display = 'none';
        document.getElementById('sidebarLogoutBtn').style.display = 'block';
        document.getElementById('newChatBtn').style.display = 'block';
        document.getElementById('conversationsSection').style.display = 'block';
        document.getElementById('documentAnalyzerSection').style.display = 'block';
        document.getElementById('profileBtn').style.display = 'block';
        this.chatLimitSection.style.display = 'none';
        document.getElementById('documentAnalyzerMenuItem').style.display = 'block';
    }

    updateUIForLoggedOut() {
        document.getElementById('sidebarLoginBtn').style.display = 'block';
        document.getElementById('sidebarLogoutBtn').style.display = 'none';
        document.getElementById('newChatBtn').style.display = 'block';
        document.getElementById('conversationsSection').style.display = 'block';
        document.getElementById('documentAnalyzerSection').style.display = 'none';
        document.getElementById('profileBtn').style.display = 'none';
        this.chatLimitSection.style.display = 'block';
        this.updateChatLimitDisplay();
        document.getElementById('documentAnalyzerMenuItem').style.display = 'none';
    }

    getFreeChatCount() {
        const count = localStorage.getItem('freeChatCount');
        return count ? parseInt(count) : 0;
    }

    incrementFreeChatCount() {
        const currentCount = this.getFreeChatCount();
        localStorage.setItem('freeChatCount', (currentCount + 1).toString());
        this.updateChatLimitDisplay();
    }

    resetFreeChatCount() {
        localStorage.removeItem('freeChatCount');
        this.updateChatLimitDisplay();
    }

    updateChatLimitDisplay() {
        const count = this.getFreeChatCount();
        const percentage = (count / this.freeChatLimit) * 100;
        
        this.chatLimitText.textContent = `${count}/${this.freeChatLimit}`;
        this.chatLimitBar.style.width = `${percentage}%`;
        
        if (percentage >= 100) {
            this.chatLimitBar.classList.add('bg-danger');
            this.chatLimitBar.classList.remove('bg-primary', 'bg-warning');
        } else if (percentage >= 60) {
            this.chatLimitBar.classList.add('bg-warning');
            this.chatLimitBar.classList.remove('bg-primary', 'bg-danger');
        } else {
            this.chatLimitBar.classList.add('bg-primary');
            this.chatLimitBar.classList.remove('bg-warning', 'bg-danger');
        }
    }

    isFreeChatLimitReached() {
        return this.getFreeChatCount() >= this.freeChatLimit;
    }

    toggleProfileDropdown() {
        if (this.profileDropdown.style.display === 'none') {
            this.profileDropdown.style.display = 'block';
        } else {
            this.profileDropdown.style.display = 'none';
        }
    }

    openSettingsModal() {
        if (this.userProfile) {
            document.getElementById('profileName').value = this.userProfile.name || '';
            document.getElementById('profileEmail').value = this.userProfile.email || '';
            document.getElementById('profileMobile').value = this.userProfile.mobile || '';
            document.getElementById('profileDob').value = this.userProfile.dob || '';
        }
        this.settingsModal.show();
    }

    hideChatInterface() {
        document.querySelector('.chat-wrapper').style.display = 'none';
    }

    showChatInterface() {
        document.querySelector('.chat-wrapper').style.display = 'flex';
    }

    async handleLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        const errorDiv = document.getElementById('loginError');

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                this.isLoggedIn = true;
                this.resetFreeChatCount(); // Reset free chat counter on login
                this.authModal.hide();
                this.showChatInterface();
                this.checkAuthStatus();
                document.getElementById('loginForm').reset();
                errorDiv.style.display = 'none';
            } else {
                errorDiv.textContent = data.error;
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorDiv.textContent = 'Login failed. Please try again.';
            errorDiv.style.display = 'block';
        }
    }

    async handleRegister() {
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value.trim();
        const errorDiv = document.getElementById('registerError');

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });

            const data = await response.json();

            if (data.success) {
                this.isLoggedIn = true;
                this.authModal.hide();
                this.showChatInterface();
                this.checkAuthStatus();
                document.getElementById('registerForm').reset();
                errorDiv.style.display = 'none';
            } else {
                errorDiv.textContent = data.error;
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Register error:', error);
            errorDiv.textContent = 'Registration failed. Please try again.';
            errorDiv.style.display = 'block';
        }
    }

    async handleLogout() {
        try {
            await fetch('/api/logout', { method: 'POST' });
            this.isLoggedIn = false;
            this.userProfile = null;
            this.currentConversationId = null;
            
            // Hide document analyzer if visible
            this.hideDocumentAnalyzer();
            
            this.hideChatInterface();
            this.updateUIForLoggedOut();
            this.authModal.show();
            this.conversationsList.innerHTML = '';
            this.chatContainer.innerHTML = `
                <div class="welcome-section text-center text-muted mb-5">
                    <div class="welcome-icon mb-4">
                        <i class="fas fa-wand-magic-sparkles"></i>
                    </div>
                    <h2 class="fs-5 fw-600 mb-2 text-dark">Welcome to Briefly</h2>
                    <p class="mb-0">Ask me anything, and I'll do my best to help</p>
                </div>
            `;
        } catch (error) {
            console.error('Logout error:', error);
        }
    }

    async handleProfileUpdate() {
        const name = document.getElementById('profileName').value.trim();
        const mobile = document.getElementById('profileMobile').value.trim();
        const dob = document.getElementById('profileDob').value.trim();
        const errorDiv = document.getElementById('profileError');
        const successDiv = document.getElementById('profileSuccess');

        try {
            const response = await fetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, mobile, dob })
            });

            const data = await response.json();

            if (data.success) {
                successDiv.textContent = 'Profile updated successfully!';
                successDiv.style.display = 'block';
                errorDiv.style.display = 'none';
                this.checkAuthStatus();
                setTimeout(() => {
                    successDiv.style.display = 'none';
                }, 3000);
            } else {
                errorDiv.textContent = data.error || 'Failed to update profile';
                errorDiv.style.display = 'block';
                successDiv.style.display = 'none';
            }
        } catch (error) {
            console.error('Profile update error:', error);
            errorDiv.textContent = 'Failed to update profile. Please try again.';
            errorDiv.style.display = 'block';
            successDiv.style.display = 'none';
        }
    }

    async handlePasswordChange() {
        const currentPassword = document.getElementById('currentPassword').value.trim();
        const newPassword = document.getElementById('newPassword').value.trim();
        const confirmPassword = document.getElementById('confirmPassword').value.trim();
        const errorDiv = document.getElementById('passwordError');
        const successDiv = document.getElementById('passwordSuccess');

        if (newPassword !== confirmPassword) {
            errorDiv.textContent = 'New passwords do not match';
            errorDiv.style.display = 'block';
            successDiv.style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/api/profile/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
            });

            const data = await response.json();

            if (data.success) {
                successDiv.textContent = 'Password changed successfully!';
                successDiv.style.display = 'block';
                errorDiv.style.display = 'none';
                document.getElementById('passwordForm').reset();
                setTimeout(() => {
                    successDiv.style.display = 'none';
                }, 3000);
            } else {
                errorDiv.textContent = data.error || 'Failed to change password';
                errorDiv.style.display = 'block';
                successDiv.style.display = 'none';
            }
        } catch (error) {
            console.error('Password change error:', error);
            errorDiv.textContent = 'Failed to change password. Please try again.';
            errorDiv.style.display = 'block';
            successDiv.style.display = 'none';
        }
    }

    async handleDocumentUpload() {
        const fileInput = document.getElementById('docFile');
        const docName = document.getElementById('docName').value.trim();
        const errorDiv = document.getElementById('uploadDocError');
        const successDiv = document.getElementById('uploadDocSuccess');

        if (!fileInput.files[0]) {
            errorDiv.textContent = 'Please select a file';
            errorDiv.style.display = 'block';
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        if (docName) {
            formData.append('name', docName);
        }

        try {
            const response = await fetch('/api/upload-document', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                successDiv.textContent = `Document "${data.filename}" uploaded and summarized successfully!`;
                successDiv.style.display = 'block';
                errorDiv.style.display = 'none';
                
                // Save document data and open document view
                this.currentDocument = {
                    filename: data.filename,
                    summary: data.summary,
                    topics: data.topics,
                    content: data.content
                };
                
                this.saveLastSelectedTab('document', data.filename);
                this.showDocumentView();
                
                setTimeout(() => {
                    successDiv.style.display = 'none';
                    this.uploadDocModal.hide();
                    document.getElementById('uploadDocForm').reset();
                }, 3000);
            } else {
                errorDiv.textContent = data.error || 'Failed to upload document';
                errorDiv.style.display = 'block';
                successDiv.style.display = 'none';
            }
        } catch (error) {
            console.error('Document upload error:', error);
            errorDiv.textContent = 'Failed to upload document. Please try again.';
            errorDiv.style.display = 'block';
            successDiv.style.display = 'none';
        }
    }

    showDocumentView() {
        // Hide chat interface, show document view
        this.chatContainer.style.display = 'none';
        this.inputSection.style.display = 'none';
        
        // Create or show document view container
        let docView = document.getElementById('documentView');
        if (!docView) {
            docView = document.createElement('div');
            docView.id = 'documentView';
            docView.className = 'document-view';
            this.chatContainer.parentNode.insertBefore(docView, this.chatContainer);
        }
        
        docView.style.display = 'block';
        docView.innerHTML = this.renderDocumentView();
        
        // Add event listeners
        docView.querySelector('#docSearchInput').addEventListener('input', (e) => this.searchDocumentContent(e.target.value));
        docView.querySelector('#docChatInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendDocumentChat();
            }
        });
        docView.querySelector('#docSendBtn').addEventListener('click', () => this.sendDocumentChat());
        docView.querySelector('#backToChat').addEventListener('click', () => this.hideDocumentView());
    }

    hideDocumentView() {
        const docView = document.getElementById('documentView');
        if (docView) {
            docView.style.display = 'none';
        }
        this.chatContainer.style.display = 'block';
        this.inputSection.style.display = 'block';
        this.saveLastSelectedTab('conversation', this.currentConversationId);
    }

    renderDocumentView() {
        const doc = this.currentDocument;
        const topics = doc.topics ? doc.topics.split(',').map(t => t.trim()) : [];
        
        return `
            <div class="document-header">
                <button class="btn btn-sm btn-outline-secondary mb-3" id="backToChat">
                    <i class="fas fa-arrow-left me-2"></i>Back to Chat
                </button>
                <h3>${this.escapeHtml(doc.filename)}</h3>
                <div class="document-topics mt-2">
                    ${topics.map(topic => `<span class="badge bg-primary me-2">${this.escapeHtml(topic)}</span>`).join('')}
                </div>
            </div>
            
            <div class="document-search mb-3">
                <input type="text" id="docSearchInput" class="form-control" placeholder="Search in document...">
            </div>
            
            <div class="document-summary mb-4">
                <h5>Summary</h5>
                <div class="document-content">${this.formatMessage(doc.summary)}</div>
            </div>
            
            <div class="document-chat-section">
                <h5>Ask about this document</h5>
                <div id="docChatMessages" class="doc-chat-messages"></div>
                <div class="doc-chat-input mt-3">
                    <div class="input-group">
                        <input type="text" id="docChatInput" class="form-control" placeholder="Ask a question about this document...">
                        <button class="btn btn-primary" id="docSendBtn">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    searchDocumentContent(searchTerm) {
        if (!searchTerm) {
            document.querySelector('.document-content').innerHTML = this.formatMessage(this.currentDocument.summary);
            return;
        }
        
        const content = this.currentDocument.summary;
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const highlighted = content.replace(regex, '<mark>$1</mark>');
        document.querySelector('.document-content').innerHTML = this.formatMessage(highlighted);
    }

    async sendDocumentChat() {
        const input = document.getElementById('docChatInput');
        const message = input.value.trim();
        if (!message) return;
        
        const chatMessages = document.getElementById('docChatMessages');
        
        // Add user message
        chatMessages.innerHTML += `<div class="doc-message user"><strong>You:</strong> ${this.escapeHtml(message)}</div>`;
        input.value = '';
        
        try {
            const response = await fetch('/api/document-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    document_content: this.currentDocument.content,
                    document_summary: this.currentDocument.summary
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                chatMessages.innerHTML += `<div class="doc-message assistant"><strong>AI:</strong> ${this.formatMessage(data.response)}</div>`;
            } else {
                chatMessages.innerHTML += `<div class="doc-message assistant text-danger"><strong>Error:</strong> ${data.error}</div>`;
            }
        } catch (error) {
            console.error('Document chat error:', error);
            chatMessages.innerHTML += `<div class="doc-message assistant text-danger"><strong>Error:</strong> Failed to get response</div>`;
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async loadConversations() {
        if (!this.isLoggedIn) return;

        try {
            const response = await fetch('/api/conversations');
            const data = await response.json();

            if (data.success) {
                this.displayConversations(data.conversations);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    }

    displayConversations(conversations) {
        this.conversationsList.innerHTML = '';

        if (conversations.length === 0) {
            this.conversationsList.innerHTML = '<div class="text-muted text-center p-3"><small>No conversations yet</small></div>';
            return;
        }

        conversations.forEach(conv => {
            const convItem = document.createElement('div');
            convItem.className = 'conversation-item';
            convItem.dataset.id = conv.id;
            convItem.innerHTML = `
                <div class="conversation-title">${this.escapeHtml(conv.title)}</div>
                <div class="conversation-date">${new Date(conv.created_at).toLocaleDateString()}</div>
                <button class="conversation-delete" data-id="${conv.id}">
                    <i class="fas fa-trash"></i>
                </button>
            `;

            convItem.addEventListener('click', (e) => {
                if (!e.target.closest('.conversation-delete')) {
                    this.loadConversation(conv.id);
                }
            });

            convItem.querySelector('.conversation-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteConversation(conv.id);
            });

            this.conversationsList.appendChild(convItem);
        });
    }

    filterConversations(searchTerm) {
        const items = this.conversationsList.querySelectorAll('.conversation-item');
        items.forEach(item => {
            const title = item.querySelector('.conversation-title').textContent.toLowerCase();
            if (title.includes(searchTerm.toLowerCase())) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    }

    async createNewConversation() {
        try {
            const response = await fetch('/api/conversations/new', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const data = await response.json();

            if (data.success) {
                this.currentConversationId = data.conversation_id;
                this.clearChat();
                if (this.isLoggedIn) {
                    this.loadConversations();
                }
            } else {
                this.showError(data.error || 'Failed to create conversation');
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
            this.showError('Failed to create conversation');
        }
    }

    async loadConversation(conversationId) {
        if (!this.isLoggedIn) return;

        try {
            this.currentConversationId = conversationId;
            this.saveLastSelectedTab('conversation', conversationId);
            
            // Hide document analyzer if visible
            this.hideDocumentAnalyzer();
            
            // Show chat interface
            this.chatContainer.style.display = 'block';
            this.inputSection.style.display = 'block';
            
            // Highlight active conversation
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
                if (parseInt(item.dataset.id) === conversationId) {
                    item.classList.add('active');
                }
            });

            // Remove highlight from Document Analyzer menu item
            document.getElementById('documentAnalyzerMenuItem').classList.remove('active');

            const response = await fetch(`/api/conversations/${conversationId}/messages`);
            const data = await response.json();

            if (data.success) {
                this.displayMessages(data.messages);
            }
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    }

    saveLastSelectedTab(type, id) {
        localStorage.setItem('lastTabType', type);
        localStorage.setItem('lastTabId', id);
    }

    getLastSelectedTab() {
        return {
            type: localStorage.getItem('lastTabType') || 'conversation',
            id: localStorage.getItem('lastTabId')
        };
    }

    displayMessages(messages) {
        this.clearChat();
        
        if (messages.length === 0) {
            this.showWelcomeMessage();
            return;
        }

        messages.forEach(msg => {
            this.addMessage(msg.content, msg.role, false);
        });
        this.scrollToBottom();
    }

    clearChat() {
        this.chatContainer.innerHTML = '';
    }

    showWelcomeMessage() {
        this.chatContainer.innerHTML = `
            <div class="welcome-section text-center text-muted mb-5">
                <div class="welcome-icon mb-4">
                    <i class="fas fa-wand-magic-sparkles"></i>
                </div>
                <h2 class="fs-5 fw-600 mb-2 text-dark">Welcome to Gemini Chat</h2>
                <p class="mb-0">Ask me anything, and I'll do my best to help</p>
            </div>
        `;
    }

    async deleteConversation(conversationId) {
        if (!confirm('Are you sure you want to delete this conversation?')) return;

        try {
            const response = await fetch(`/api/conversations/${conversationId}/delete`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                if (this.currentConversationId === conversationId) {
                    this.currentConversationId = null;
                    this.showWelcomeMessage();
                }
                this.loadConversations();
            } else {
                this.showError(data.error || 'Failed to delete conversation');
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
            this.showError('Failed to delete conversation');
        }
    }

    autoResizeTextarea() {
        this.messageInput.style.height = 'auto';
        const newHeight = Math.min(this.messageInput.scrollHeight, 200);
        this.messageInput.style.height = newHeight + 'px';
    }

    clearWelcomeMessage() {
        if (this.chatContainer.querySelector('.welcome-section')) {
            const welcomeMsg = this.chatContainer.querySelector('.welcome-section');
            welcomeMsg.style.display = 'none';
        }
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();

        if (!message) return;
        if (this.isLoading) return;
        
        // Check if user is logged in
        if (!this.isLoggedIn) {
            // Check if free chat limit is reached
            if (this.isFreeChatLimitReached()) {
                this.showError('Free chat limit reached. Please login to continue chatting.');
                this.authModal.show();
                return;
            }
        }

        // Create conversation if none exists
        if (!this.currentConversationId) {
            await this.createNewConversation();
            if (!this.currentConversationId) {
                this.showError('Failed to create conversation');
                return;
            }
        }

        this.hideWelcomeMessage();
        this.addMessage(message, 'user');
        this.messageInput.value = '';
        this.autoResizeTextarea();

        await this.sendToAPI(message);
        
        // Increment free chat counter if not logged in
        if (!this.isLoggedIn) {
            this.incrementFreeChatCount();
        }
    }

    hideWelcomeMessage() {
        const welcomeMsg = this.chatContainer.querySelector('.welcome-section');
        if (welcomeMsg) {
            welcomeMsg.style.display = 'none';
        }
    }

    addMessage(text, sender, scroll = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender === 'user' ? 'text-end' : ''}`;

        const content = document.createElement('div');
        content.className = 'message-content';
        
        if (sender === 'user') {
            content.textContent = text;
        } else {
            content.innerHTML = this.formatMessage(text);
        }

        messageDiv.appendChild(content);
        this.chatContainer.appendChild(messageDiv);
        
        if (scroll) {
            this.scrollToBottom();
        }
        
        return messageDiv;
    }

    formatMessage(text) {
        let formatted = this.escapeHtml(text);
        
        // Format code blocks (```code```)
        formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'text';
            const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
            return `
                <div class="code-block-wrapper">
                    <div class="code-block-header">
                        <span class="code-language">${language}</span>
                        <button class="copy-btn" onclick="copyCode('${codeId}')">
                            <i class="fas fa-copy"></i> Copy
                        </button>
                    </div>
                    <pre class="code-block"><code id="${codeId}" class="language-${language}">${code.trim()}</code></pre>
                </div>
            `;
        });
        
        // Format inline code (`code`)
        formatted = formatted.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
        
        // Format line breaks
        formatted = formatted.replace(/\n/g, '<br>');
        
        // Format links
        formatted = formatted.replace(
            /https?:\/\/[^\s]+/g,
            '<a href="$&" target="_blank" rel="noopener noreferrer">$&</a>'
        );
        
        return formatted;
    }

    formatMessageContent(contentElement) {
        const text = contentElement.textContent;
        contentElement.innerHTML = this.formatMessage(text);
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    async sendToAPI(message) {
        this.isLoading = true;
        this.sendBtn.disabled = true;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    conversation_id: this.currentConversationId
                })
            });

            const data = await response.json();

            if (data.success) {
                // Add empty message first for streaming effect
                const messageElement = this.addMessage('', 'assistant', false);
                await this.typeMessage(messageElement, data.message);
            } else {
                this.showError(data.error || 'Failed to get response');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            this.showError('Network error. Please try again.');
        } finally {
            this.isLoading = false;
            this.sendBtn.disabled = false;
            this.messageInput.focus();
        }
    }

    async typeMessage(messageElement, text) {
        const contentElement = messageElement.querySelector('.message-content');
        let index = 0;
        const speed = 10; // Typing speed in ms

        return new Promise((resolve) => {
            const interval = setInterval(() => {
                if (index < text.length) {
                    const partialText = text.substring(0, index + 1);
                    contentElement.innerHTML = this.formatMessage(partialText);
                    index++;
                    this.scrollToBottom();
                } else {
                    clearInterval(interval);
                    contentElement.innerHTML = this.formatMessage(text);
                    resolve();
                }
            }, speed);
        });
    }

    showError(message) {
        this.errorToastMessage.textContent = message;
        this.errorToast.show();
    }

    scrollToBottom() {
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }

    // Document Analyzer Functions
    showDocumentAnalyzer() {
        // Hide chat interface, show document analyzer
        this.chatContainer.style.display = 'none';
        this.inputSection.style.display = 'none';
        
        const docAnalyzerView = document.getElementById('documentAnalyzerView');
        docAnalyzerView.style.display = 'block';
        
        // Show upload section by default
        this.showDocumentAnalyzerUpload();
        
        // Keep conversations section visible, just highlight Document Analyzer
        document.getElementById('conversationsSection').style.display = 'block';
        document.getElementById('documentAnalyzerSection').style.display = 'block';
        
        // Highlight Document Analyzer menu item
        document.getElementById('documentAnalyzerMenuItem').classList.add('active');
        
        // Remove active class from all conversation items
        document.querySelectorAll('#conversationsList .conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Keep default app name, don't show back button
        document.getElementById('headerTitle').textContent = 'Briefly AI';
    }

    showDocumentAnalyzerUpload() {
        document.getElementById('docUploadSection').style.display = 'block';
        document.getElementById('docAnalysisSection').style.display = 'none';
    }

    async handleDocumentAnalyzerUpload() {
        const fileInput = document.getElementById('docAnalyzerFile');
        const docName = document.getElementById('docAnalyzerName').value.trim();
        const errorDiv = document.getElementById('docAnalyzerError');
        const successDiv = document.getElementById('docAnalyzerSuccess');
        const loadingDiv = document.getElementById('docAnalyzerLoading');
        const uploadBtn = document.getElementById('docAnalyzerUploadBtn');

        if (!fileInput.files[0]) {
            errorDiv.textContent = 'Please select a file';
            errorDiv.style.display = 'block';
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        if (docName) {
            formData.append('name', docName);
        }

        // Show loading state
        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        successDiv.style.display = 'none';
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Uploading...';

        try {
            const response = await fetch('/api/upload-document', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                successDiv.textContent = `Document "${data.filename}" uploaded and analyzed successfully!`;
                successDiv.style.display = 'block';
                errorDiv.style.display = 'none';
                
                // Save document data and show analysis view
                this.currentDocument = {
                    filename: data.filename,
                    summary: data.summary,
                    topics: data.topics,
                    content: data.content
                };
                
                this.showDocumentAnalysis();
                
                setTimeout(() => {
                    successDiv.style.display = 'none';
                    document.getElementById('docAnalyzerUploadForm').reset();
                }, 3000);
            } else {
                errorDiv.textContent = data.error || 'Failed to upload document';
                errorDiv.style.display = 'block';
                successDiv.style.display = 'none';
            }
        } catch (error) {
            console.error('Document upload error:', error);
            errorDiv.textContent = 'Failed to upload document. Please try again.';
            errorDiv.style.display = 'block';
            successDiv.style.display = 'none';
        } finally {
            // Hide loading state
            loadingDiv.style.display = 'none';
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = '<i class="fas fa-upload me-2"></i>Upload & Analyze';
        }
    }

    showDocumentAnalysis() {
        document.getElementById('docUploadSection').style.display = 'none';
        document.getElementById('docAnalysisSection').style.display = 'block';
        
        const doc = this.currentDocument;
        const topics = doc.topics ? doc.topics.split(',').map(t => t.trim()) : [];
        
        document.getElementById('docAnalyzerTitle').textContent = doc.filename;
        document.getElementById('docSummaryContent').innerHTML = this.formatMessage(doc.summary);
        document.getElementById('docTopicsContent').innerHTML = topics.map(topic => 
            `<span class="badge bg-primary me-2">${this.escapeHtml(topic)}</span>`
        ).join('');
        
        // Clear chat messages
        document.getElementById('docAnalyzerChatMessages').innerHTML = '';
    }

    searchDocumentAnalyzerContent(searchTerm) {
        if (!searchTerm) {
            document.getElementById('docSummaryContent').innerHTML = this.formatMessage(this.currentDocument.summary);
            return;
        }
        
        const content = this.currentDocument.summary;
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const highlighted = content.replace(regex, '<span class="search-highlight">$1</span>');
        document.getElementById('docSummaryContent').innerHTML = this.formatMessage(highlighted);
    }

    async sendDocumentAnalyzerChat() {
        const input = document.getElementById('docAnalyzerChatInput');
        const message = input.value.trim();
        if (!message) return;
        
        const chatMessages = document.getElementById('docAnalyzerChatMessages');
        
        // Add user message
        chatMessages.innerHTML += `<div class="doc-message user"><strong>You:</strong> ${this.escapeHtml(message)}</div>`;
        input.value = '';
        
        try {
            const response = await fetch('/api/document-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    document_content: this.currentDocument.content,
                    document_summary: this.currentDocument.summary
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                chatMessages.innerHTML += `<div class="doc-message assistant"><strong>AI:</strong> ${this.formatMessage(data.response)}</div>`;
            } else {
                chatMessages.innerHTML += `<div class="doc-message assistant text-danger"><strong>Error:</strong> ${data.error}</div>`;
            }
        } catch (error) {
            console.error('Document chat error:', error);
            chatMessages.innerHTML += `<div class="doc-message assistant text-danger"><strong>Error:</strong> Failed to get response</div>`;
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    hideDocumentAnalyzer() {
        const docAnalyzerView = document.getElementById('documentAnalyzerView');
        if (docAnalyzerView) {
            docAnalyzerView.style.display = 'none';
        }
        this.chatContainer.style.display = 'block';
        this.inputSection.style.display = 'block';
        
        // Show conversations section in sidebar
        document.getElementById('conversationsSection').style.display = 'block';
        document.getElementById('documentAnalyzerSection').style.display = 'block';
        
        // Remove highlight from Document Analyzer menu item
        document.getElementById('documentAnalyzerMenuItem').classList.remove('active');
    }
}

// Global function for copying code
function copyCode(codeId) {
    const codeElement = document.getElementById(codeId);
    if (codeElement) {
        const text = codeElement.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const copyBtn = codeElement.closest('.code-block-wrapper').querySelector('.copy-btn');
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.chatApp = new ChatApp();
    console.log('Chat application initialized');
});
