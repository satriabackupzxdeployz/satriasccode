// Konfigurasi
const API_BASE_URL = 'http://localhost:3000/api';
let authToken = null;
let currentUserIP = '';
let socket = null;
let currentPostId = null;

// Get user IP
async function getUserIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        // Fallback jika tidak bisa mendapatkan IP
        return 'user_' + Math.random().toString(36).substring(2, 9);
    }
}

// Initialize app
async function initApp() {
    try {
        currentUserIP = await getUserIP();
        console.log('User IP:', currentUserIP);
        
        // Connect to WebSocket
        connectWebSocket();
        
        // Load posts
        await loadPosts();
        
        // Initialize event listeners
        initializeEventListeners();
        
        // Check backend connection
        checkBackendConnection();
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showAlert('Gagal menghubungkan ke server', 'error');
    }
}

// Connect to WebSocket
function connectWebSocket() {
    try {
        socket = io('http://localhost:3000');
        
        socket.on('connect', () => {
            console.log('Connected to WebSocket');
            updateBackendStatus(true);
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from WebSocket');
            updateBackendStatus(false);
        });
        
        socket.on('newPost', (post) => {
            console.log('New post received:', post);
            addNewPost(post);
            showAlert('Postingan baru ditambahkan!', 'success');
        });
        
        socket.on('updatePost', (post) => {
            console.log('Post updated:', post);
            updatePostInUI(post);
            showAlert('Postingan diperbarui!', 'success');
        });
        
        socket.on('deletePost', (postId) => {
            console.log('Post deleted:', postId);
            removePostFromUI(postId);
            showAlert('Postingan dihapus!', 'error');
        });
        
        socket.on('newComment', (data) => {
            console.log('New comment received:', data);
            if (currentPostId === data.postId) {
                addNewComment(data.comment);
            }
        });
        
        socket.on('updateLikes', (data) => {
            console.log('Likes updated:', data);
            updateLikesInUI(data.postId, data.likes, data.liked);
        });
        
        socket.on('clearAllPosts', () => {
            console.log('All posts cleared');
            clearAllPostsUI();
            showAlert('Semua postingan dihapus!', 'error');
        });
        
        // Handle connection errors
        socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            updateBackendStatus(false);
        });
        
    } catch (error) {
        console.error('Error connecting to WebSocket:', error);
    }
}

// Update backend status
function updateBackendStatus(connected) {
    const statusElement = document.getElementById('backendStatus');
    if (statusElement) {
        if (connected) {
            statusElement.textContent = 'TERHUBUNG';
            statusElement.style.color = 'var(--success)';
        } else {
            statusElement.textContent = 'TERPUTUS';
            statusElement.style.color = 'var(--error)';
        }
    }
}

// Check backend connection
async function checkBackendConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/posts`);
        if (response.ok) {
            updateBackendStatus(true);
        } else {
            updateBackendStatus(false);
        }
    } catch (error) {
        updateBackendStatus(false);
    }
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };
    
    if (authToken) {
        defaultHeaders['Authorization'] = `Bearer ${authToken}`;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: {
                ...defaultHeaders,
                ...options.headers
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Terjadi kesalahan');
        }
        
        return data;
        
    } catch (error) {
        console.error('API request error:', error);
        throw error;
    }
}

// Load posts
async function loadPosts() {
    try {
        const posts = await apiRequest('/posts');
        renderPosts(posts);
        
        const emptyState = document.getElementById('emptyState');
        if (posts.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
        } else {
            if (emptyState) emptyState.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error loading posts:', error);
        showAlert('Gagal memuat postingan', 'error');
    }
}

// Render posts
function renderPosts(posts) {
    const postsTimeline = document.getElementById('postsTimeline');
    if (!postsTimeline) return;
    
    postsTimeline.innerHTML = '';
    
    posts.forEach(post => {
        const postCard = createPostCard(post);
        postsTimeline.appendChild(postCard);
    });
}

// Create post card
function createPostCard(post) {
    const postCard = document.createElement('div');
    postCard.className = 'post-card';
    postCard.dataset.id = post.id;
    
    const timeAgo = getTimeAgo(post.createdAt);
    const avatarLetter = post.author.charAt(0).toUpperCase();
    
    // Get code preview (first 10 lines)
    const codeLines = post.code.split('\n');
    const codePreview = codeLines.slice(0, 10).join('\n');
    
    postCard.innerHTML = `
        <div class="post-header">
            <div class="post-author">
                <div class="author-avatar">${escapeHtml(avatarLetter)}</div>
                <div class="author-info">
                    <h4>${escapeHtml(post.author)}</h4>
                    <div class="post-time" data-timestamp="${post.createdAt}">${timeAgo}</div>
                </div>
            </div>
            <span class="post-language">${post.language.toUpperCase()}</span>
        </div>
        
        <div class="post-content">
            <h3 class="post-title">${escapeHtml(post.title)}</h3>
            <p class="post-description">${escapeHtml(post.description)}</p>
            
            <div class="post-tags">
                ${post.tags.map(tag => `<span class="post-tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
            
            <div class="code-preview">
                <pre>${escapeHtml(codePreview)}${codeLines.length > 10 ? '\n...' : ''}</pre>
            </div>
        </div>
        
        <div class="post-footer">
            <div class="post-stats">
                <div class="stat-item">
                    <i class="fas fa-eye"></i> ${post.views} views
                </div>
                <div class="stat-item">
                    <i class="fas fa-heart"></i> ${post.likes} likes
                </div>
                <div class="stat-item">
                    <i class="fas fa-comment"></i> ${post.commentsCount} comments
                </div>
            </div>
            
            <div class="post-actions">
                <button class="btn btn-small btn-primary view-post-btn">
                    <i class="fas fa-expand"></i> SELENGKAPNYA
                </button>
                <button class="btn btn-small btn-like like-post-btn">
                    <i class="fas fa-heart"></i> LIKE
                </button>
            </div>
        </div>
    `;
    
    // Add event listeners
    postCard.querySelector('.view-post-btn').addEventListener('click', () => {
        openPostModal(post.id);
    });
    
    postCard.querySelector('.like-post-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLike(post.id);
    });
    
    return postCard;
}

// Add new post to UI (real-time)
function addNewPost(post) {
    const postsTimeline = document.getElementById('postsTimeline');
    const emptyState = document.getElementById('emptyState');
    
    if (emptyState) emptyState.style.display = 'none';
    
    const postCard = createPostCard({
        ...post,
        views: 0,
        likes: 0,
        commentsCount: 0
    });
    
    // Add to top of timeline
    if (postsTimeline.firstChild) {
        postsTimeline.insertBefore(postCard, postsTimeline.firstChild);
    } else {
        postsTimeline.appendChild(postCard);
    }
    
    // Add animation
    postCard.style.animation = 'slideUp 0.5s ease-out';
}

// Update post in UI (real-time)
function updatePostInUI(updatedPost) {
    const postCard = document.querySelector(`.post-card[data-id="${updatedPost.id}"]`);
    if (!postCard) return;
    
    // Update title
    const titleElement = postCard.querySelector('.post-title');
    if (titleElement) {
        titleElement.textContent = escapeHtml(updatedPost.title);
    }
    
    // Update description
    const descElement = postCard.querySelector('.post-description');
    if (descElement) {
        descElement.textContent = escapeHtml(updatedPost.description);
    }
    
    // Update language
    const langElement = postCard.querySelector('.post-language');
    if (langElement) {
        langElement.textContent = updatedPost.language.toUpperCase();
    }
    
    // Update code preview
    const codePreview = postCard.querySelector('.code-preview pre');
    if (codePreview) {
        const codeLines = updatedPost.code.split('\n');
        const codePreviewText = codeLines.slice(0, 10).join('\n');
        codePreview.textContent = escapeHtml(codePreviewText) + (codeLines.length > 10 ? '\n...' : '');
    }
    
    // Update tags
    const tagsContainer = postCard.querySelector('.post-tags');
    if (tagsContainer) {
        tagsContainer.innerHTML = updatedPost.tags.map(tag => 
            `<span class="post-tag">${escapeHtml(tag)}</span>`
        ).join('');
    }
    
    // Add update animation
    postCard.style.animation = 'pulse 1s ease-out';
    setTimeout(() => {
        postCard.style.animation = '';
    }, 1000);
}

// Remove post from UI (real-time)
function removePostFromUI(postId) {
    const postCard = document.querySelector(`.post-card[data-id="${postId}"]`);
    if (!postCard) return;
    
    // Add fade out animation
    postCard.style.animation = 'fadeOut 0.5s ease-out';
    postCard.style.opacity = '0';
    
    setTimeout(() => {
        postCard.remove();
        
        // Check if no posts left
        const postsTimeline = document.getElementById('postsTimeline');
        const emptyState = document.getElementById('emptyState');
        
        if (postsTimeline.children.length === 0 && emptyState) {
            emptyState.style.display = 'block';
        }
    }, 500);
}

// Clear all posts UI
function clearAllPostsUI() {
    const postsTimeline = document.getElementById('postsTimeline');
    const emptyState = document.getElementById('emptyState');
    
    if (postsTimeline) {
        postsTimeline.innerHTML = '';
    }
    
    if (emptyState) {
        emptyState.style.display = 'block';
    }
}

// Update likes in UI (real-time)
function updateLikesInUI(postId, likes, liked) {
    // Update in timeline
    const postCard = document.querySelector(`.post-card[data-id="${postId}"]`);
    if (postCard) {
        const likesElement = postCard.querySelector('.stat-item:nth-child(2) span');
        if (likesElement) {
            likesElement.textContent = likes;
        }
        
        const likeBtn = postCard.querySelector('.like-post-btn');
        if (likeBtn) {
            if (liked) {
                likeBtn.classList.add('liked');
                likeBtn.innerHTML = '<i class="fas fa-heart"></i> UNLIKE';
            } else {
                likeBtn.classList.remove('liked');
                likeBtn.innerHTML = '<i class="fas fa-heart"></i> LIKE';
            }
        }
    }
    
    // Update in modal if open
    if (currentPostId === postId) {
        const modalLikes = document.getElementById('modalLikes');
        if (modalLikes) {
            modalLikes.textContent = likes;
        }
        
        const modalLikeBtn = document.getElementById('modalLikeBtn');
        if (modalLikeBtn) {
            if (liked) {
                modalLikeBtn.classList.add('liked');
                modalLikeBtn.innerHTML = '<i class="fas fa-heart"></i> UNLIKE';
                modalLikeBtn.style.animation = 'none';
            } else {
                modalLikeBtn.classList.remove('liked');
                modalLikeBtn.innerHTML = '<i class="fas fa-heart"></i> LIKE';
                modalLikeBtn.style.animation = 'pulseHeart 2s infinite';
            }
        }
    }
}

// Open post modal
async function openPostModal(postId) {
    try {
        currentPostId = postId;
        
        // Join WebSocket room for this post
        if (socket) {
            socket.emit('joinPost', postId);
        }
        
        const post = await apiRequest(`/posts/${postId}`);
        
        // Update modal content
        document.getElementById('modalPostTitle').textContent = escapeHtml(post.title);
        document.getElementById('modalPostLanguage').textContent = post.language.toUpperCase();
        document.getElementById('modalPostDescription').textContent = escapeHtml(post.description);
        document.getElementById('modalPostCode').textContent = escapeHtml(post.code);
        document.getElementById('modalPostAuthor').textContent = escapeHtml(post.author);
        document.getElementById('modalPostTime').textContent = getTimeAgo(post.createdAt);
        document.getElementById('modalPostTime').dataset.timestamp = post.createdAt;
        document.getElementById('modalViews').textContent = post.views;
        document.getElementById('modalLikes').textContent = post.likes;
        document.getElementById('modalCommentsCount').textContent = post.comments.length;
        document.getElementById('commentsCount').textContent = post.comments.length;
        
        // Update like button
        const likeBtn = document.getElementById('modalLikeBtn');
        if (post.userLiked) {
            likeBtn.classList.add('liked');
            likeBtn.innerHTML = '<i class="fas fa-heart"></i> UNLIKE';
            likeBtn.style.animation = 'none';
        } else {
            likeBtn.classList.remove('liked');
            likeBtn.innerHTML = '<i class="fas fa-heart"></i> LIKE';
            likeBtn.style.animation = 'pulseHeart 2s infinite';
        }
        
        // Update tags
        const tagsContainer = document.getElementById('modalPostTags');
        tagsContainer.innerHTML = '';
        post.tags.forEach(tag => {
            const tagElement = document.createElement('span');
            tagElement.style.cssText = `
                display: inline-block;
                padding: 4px 10px;
                background: var(--cyan);
                border: 2px solid var(--border-color);
                margin-right: 6px;
                margin-bottom: 6px;
                font-size: 0.75rem;
                font-weight: 600;
            `;
            tagElement.textContent = tag;
            tagsContainer.appendChild(tagElement);
        });
        
        // Load comments
        loadComments(post.comments);
        
        // Set button actions
        likeBtn.onclick = () => toggleLike(postId);
        document.getElementById('modalDownloadBtn').onclick = () => downloadPost(postId);
        document.getElementById('modalCopyBtn').onclick = () => copyToClipboard(post.code);
        document.getElementById('submitCommentBtn').onclick = () => submitComment(postId);
        
        // Enter key for comment
        document.getElementById('commentText').onkeypress = function(e) {
            if (e.key === 'Enter') {
                submitComment(postId);
            }
        };
        
        // Show modal
        document.getElementById('postModal').classList.add('active');
        
    } catch (error) {
        console.error('Error opening post modal:', error);
        showAlert('Gagal memuat detail postingan', 'error');
    }
}

// Load comments
function loadComments(comments) {
    const commentsList = document.getElementById('commentsList');
    commentsList.innerHTML = '';
    
    if (comments.length === 0) {
        commentsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Belum ada komentar. Jadilah yang pertama!</p>';
        return;
    }
    
    // Sort comments by date (newest first)
    const sortedComments = [...comments].sort((a, b) => 
        new Date(b.createdAt) - new Date(a.createdAt)
    );
    
    sortedComments.forEach(comment => {
        const commentItem = document.createElement('div');
        commentItem.className = 'comment-item';
        
        commentItem.innerHTML = `
            <div class="comment-header">
                <div class="comment-author">${escapeHtml(comment.author)}</div>
                <div class="comment-time" data-timestamp="${comment.createdAt}">${getTimeAgo(comment.createdAt)}</div>
            </div>
            <div class="comment-text">${escapeHtml(comment.text)}</div>
        `;
        
        commentsList.appendChild(commentItem);
    });
    
    // Scroll to bottom
    commentsList.scrollTop = commentsList.scrollHeight;
}

// Add new comment (real-time)
function addNewComment(comment) {
    const commentsList = document.getElementById('commentsList');
    
    // Remove empty state if present
    const emptyState = commentsList.querySelector('p');
    if (emptyState) {
        emptyState.remove();
    }
    
    const commentItem = document.createElement('div');
    commentItem.className = 'comment-item';
    commentItem.style.animation = 'slideInRight 0.5s ease-out';
    
    commentItem.innerHTML = `
        <div class="comment-header">
            <div class="comment-author">${escapeHtml(comment.author)}</div>
            <div class="comment-time" data-timestamp="${comment.createdAt}">${getTimeAgo(comment.createdAt)}</div>
        </div>
        <div class="comment-text">${escapeHtml(comment.text)}</div>
    `;
    
    // Add to top of comments
    if (commentsList.firstChild) {
        commentsList.insertBefore(commentItem, commentsList.firstChild);
    } else {
        commentsList.appendChild(commentItem);
    }
    
    // Update comments count
    const commentsCount = commentsList.children.length;
    document.getElementById('modalCommentsCount').textContent = commentsCount;
    document.getElementById('commentsCount').textContent = commentsCount;
}

// Toggle like
async function toggleLike(postId) {
    try {
        const response = await apiRequest(`/posts/${postId}/like`, {
            method: 'POST'
        });
        
        // Show notification
        showLikeNotification(response.liked);
        
    } catch (error) {
        console.error('Error toggling like:', error);
        showAlert('Gagal mengupdate like', 'error');
    }
}

// Submit comment
async function submitComment(postId) {
    const authorInput = document.getElementById('commentAuthor');
    const textInput = document.getElementById('commentText');
    
    const author = authorInput.value.trim();
    const text = textInput.value.trim();
    
    if (!author || !text) {
        showAlert('Nama dan komentar harus diisi!', 'error');
        return;
    }
    
    try {
        const response = await apiRequest(`/posts/${postId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ author, text })
        });
        
        // Clear input
        textInput.value = '';
        
        // Show success animation
        const btn = document.getElementById('submitCommentBtn');
        btn.innerHTML = '<i class="fas fa-check"></i> TERKIRIM!';
        btn.style.background = 'var(--success)';
        
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> KIRIM';
            btn.style.background = '';
        }, 1000);
        
    } catch (error) {
        console.error('Error submitting comment:', error);
        showAlert('Gagal mengirim komentar', 'error');
    }
}

// Download post
async function downloadPost(postId) {
    try {
        const response = await fetch(`${API_BASE_URL}/posts/${postId}/download`);
        
        if (!response.ok) {
            throw new Error('Download gagal');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Get filename from Content-Disposition header
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'code.txt';
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        // Show success animation
        const downloadBtn = document.getElementById('modalDownloadBtn');
        downloadBtn.innerHTML = '<i class="fas fa-check"></i> TERDOWNLOAD!';
        downloadBtn.style.background = 'var(--success)';
        
        setTimeout(() => {
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> DOWNLOAD';
            downloadBtn.style.background = '';
        }, 1000);
        
        showAlert('Kode berhasil didownload!', 'success');
        
    } catch (error) {
        console.error('Error downloading post:', error);
        showAlert('Gagal mendownload kode', 'error');
    }
}

// Admin Functions
async function adminLogin() {
    const passwordInput = document.getElementById('adminKeyInput');
    const password = passwordInput.value.trim();
    
    if (!password) {
        showAlert('Masukkan password admin', 'error');
        return;
    }
    
    try {
        const response = await apiRequest('/admin/login', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
        
        authToken = response.token;
        passwordInput.value = '';
        
        // Show admin panel
        document.getElementById('adminPanel').classList.add('active');
        showAlert('Login berhasil sebagai admin!', 'success');
        
        // Switch to admin section
        document.querySelector('[data-section="admin"]').click();
        
        // Load admin posts
        loadAdminPosts();
        
    } catch (error) {
        showAlert('Password salah!', 'error');
        
        // Shake animation
        passwordInput.style.animation = 'shake 0.5s ease-out';
        setTimeout(() => {
            passwordInput.style.animation = '';
        }, 500);
    }
}

async function publishPost() {
    if (!authToken) {
        showAlert('Anda harus login sebagai admin terlebih dahulu!', 'error');
        return;
    }
    
    const title = document.getElementById('postTitle').value.trim();
    const description = document.getElementById('postDescription').value.trim();
    const author = document.getElementById('postAuthor').value.trim();
    const language = document.getElementById('postLanguage').value;
    const tags = document.getElementById('postTags').value;
    const code = document.getElementById('postCode').value.trim();
    
    if (!title || !code || !author) {
        showAlert('Judul, kode, dan nama penulis harus diisi!', 'error');
        return;
    }
    
    try {
        const response = await apiRequest('/posts', {
            method: 'POST',
            body: JSON.stringify({
                title,
                description,
                author,
                language,
                tags,
                code
            })
        });
        
        // Clear form
        document.getElementById('postTitle').value = '';
        document.getElementById('postDescription').value = '';
        document.getElementById('postCode').value = '';
        document.getElementById('postTags').value = '';
        
        // Show success animation
        const btn = document.getElementById('publishPostBtn');
        btn.innerHTML = '<i class="fas fa-check"></i> BERHASIL!';
        btn.style.background = 'var(--success)';
        
        setTimeout(() => {
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> PUBLISH POSTINGAN';
            btn.style.background = '';
        }, 2000);
        
        showAlert('Postingan berhasil dipublish!', 'success');
        
        // Switch to browse section
        document.querySelector('[data-section="browse"]').click();
        
    } catch (error) {
        console.error('Error publishing post:', error);
        showAlert('Gagal mempublish postingan', 'error');
    }
}

async function loadAdminPosts() {
    if (!authToken) return;
    
    try {
        const posts = await apiRequest('/posts');
        renderAdminPosts(posts);
        
    } catch (error) {
        console.error('Error loading admin posts:', error);
        showAlert('Gagal memuat daftar postingan', 'error');
    }
}

function renderAdminPosts(posts) {
    const postsList = document.getElementById('adminPostsList');
    if (!postsList) return;
    
    postsList.innerHTML = '';
    
    if (posts.length === 0) {
        postsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Belum ada postingan.</p>';
        return;
    }
    
    posts.forEach(post => {
        const postItem = document.createElement('div');
        postItem.style.cssText = `
            padding: 12px;
            border: 2px solid var(--border-color);
            margin-bottom: 8px;
            background: var(--bg-primary);
            transition: all 0.3s;
        `;
        
        postItem.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div style="flex: 1;">
                    <h4 style="margin: 0; color: var(--accent); font-size: 1rem;">${escapeHtml(post.title)}</h4>
                    <p style="margin: 5px 0 0 0; font-size: 0.85rem; color: var(--text-muted);">
                        ${post.language.toUpperCase()} • ${escapeHtml(post.author)} • ${getTimeAgo(post.createdAt)}
                    </p>
                    <div style="margin-top: 5px; font-size: 0.8rem; display: flex; gap: 15px;">
                        <span><i class="fas fa-eye"></i> ${post.views} views</span>
                        <span><i class="fas fa-heart"></i> ${post.likes} likes</span>
                        <span><i class="fas fa-comment"></i> ${post.commentsCount} comments</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-small btn-primary edit-post-btn" data-id="${post.id}">
                        <i class="fas fa-edit"></i> EDIT
                    </button>
                    <button class="btn btn-small btn-danger delete-post-btn" data-id="${post.id}">
                        <i class="fas fa-trash"></i> HAPUS
                    </button>
                </div>
            </div>
        `;
        
        // Hover effects
        postItem.addEventListener('mouseenter', () => {
            postItem.style.transform = 'translateX(5px)';
            postItem.style.boxShadow = 'var(--shadow)';
        });
        
        postItem.addEventListener('mouseleave', () => {
            postItem.style.transform = '';
            postItem.style.boxShadow = '';
        });
        
        // Edit button
        postItem.querySelector('.edit-post-btn').addEventListener('click', function() {
            const postId = parseInt(this.dataset.id);
            editPost(postId);
        });
        
        // Delete button
        postItem.querySelector('.delete-post-btn').addEventListener('click', function() {
            const postId = parseInt(this.dataset.id);
            deletePost(postId);
        });
        
        postsList.appendChild(postItem);
    });
}

async function editPost(postId) {
    try {
        const post = await apiRequest(`/posts/${postId}`);
        
        // Fill form with post data
        document.getElementById('postTitle').value = post.title;
        document.getElementById('postDescription').value = post.description;
        document.getElementById('postAuthor').value = post.author;
        document.getElementById('postLanguage').value = post.language;
        document.getElementById('postTags').value = post.tags.join(', ');
        document.getElementById('postCode').value = post.code;
        
        // Change publish button to update button
        const publishBtn = document.getElementById('publishPostBtn');
        publishBtn.innerHTML = '<i class="fas fa-save"></i> UPDATE POSTINGAN';
        
        // Store current post ID and change click handler
        publishBtn.dataset.editing = postId;
        
        showAlert('Postingan dimuat untuk diedit', 'success');
        
    } catch (error) {
        console.error('Error loading post for edit:', error);
        showAlert('Gagal memuat postingan untuk diedit', 'error');
    }
}

async function updatePost() {
    const publishBtn = document.getElementById('publishPostBtn');
    const postId = parseInt(publishBtn.dataset.editing);
    
    if (!postId || !authToken) {
        showAlert('Tidak ada postingan yang sedang diedit', 'error');
        return;
    }
    
    const title = document.getElementById('postTitle').value.trim();
    const description = document.getElementById('postDescription').value.trim();
    const author = document.getElementById('postAuthor').value.trim();
    const language = document.getElementById('postLanguage').value;
    const tags = document.getElementById('postTags').value;
    const code = document.getElementById('postCode').value.trim();
    
    if (!title || !code || !author) {
        showAlert('Judul, kode, dan nama penulis harus diisi!', 'error');
        return;
    }
    
    try {
        await apiRequest(`/posts/${postId}`, {
            method: 'PUT',
            body: JSON.stringify({
                title,
                description,
                author,
                language,
                tags,
                code
            })
        });
        
        // Clear form and reset button
        document.getElementById('postTitle').value = '';
        document.getElementById('postDescription').value = '';
        document.getElementById('postCode').value = '';
        document.getElementById('postTags').value = '';
        
        publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> PUBLISH POSTINGAN';
        delete publishBtn.dataset.editing;
        
        showAlert('Postingan berhasil diupdate!', 'success');
        
        // Reload admin posts
        loadAdminPosts();
        
    } catch (error) {
        console.error('Error updating post:', error);
        showAlert('Gagal mengupdate postingan', 'error');
    }
}

async function deletePost(postId) {
    if (!authToken) {
        showAlert('Anda harus login sebagai admin', 'error');
        return;
    }
    
    if (!confirm('Apakah Anda yakin ingin menghapus postingan ini?')) {
        return;
    }
    
    try {
        await apiRequest(`/posts/${postId}`, {
            method: 'DELETE'
        });
        
        showAlert('Postingan berhasil dihapus!', 'success');
        
        // Reload admin posts
        loadAdminPosts();
        
    } catch (error) {
        console.error('Error deleting post:', error);
        showAlert('Gagal menghapus postingan', 'error');
    }
}

async function clearAllPosts() {
    if (!authToken) {
        showAlert('Anda harus login sebagai admin', 'error');
        return;
    }
    
    if (!confirm('Apakah Anda yakin ingin menghapus SEMUA postingan? Tindakan ini tidak dapat dibatalkan!')) {
        return;
    }
    
    try {
        await apiRequest('/posts', {
            method: 'DELETE'
        });
        
        showAlert('Semua postingan berhasil dihapus!', 'success');
        
        // Reload admin posts
        loadAdminPosts();
        
    } catch (error) {
        console.error('Error clearing all posts:', error);
        showAlert('Gagal menghapus semua postingan', 'error');
    }
}

async function exportPosts() {
    if (!authToken) {
        showAlert('Anda harus login sebagai admin', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/export`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Export gagal');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'satriacodeshare-export.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showAlert('Data berhasil diexport!', 'success');
        
    } catch (error) {
        console.error('Error exporting posts:', error);
        showAlert('Gagal mengexport data', 'error');
    }
}

// Utility Functions
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'Baru saja';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} menit yang lalu`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam yang lalu`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)} hari yang lalu`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} bulan yang lalu`;
    return `${Math.floor(seconds / 31536000)} tahun yang lalu`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const copyBtn = document.getElementById('modalCopyBtn');
        copyBtn.innerHTML = '<i class="fas fa-check"></i> TERSALIN!';
        copyBtn.style.background = 'var(--success)';
        
        setTimeout(() => {
            copyBtn.innerHTML = '<i class="fas fa-copy"></i> SALIN KODE';
            copyBtn.style.background = '';
        }, 1000);
        
        showAlert('Kode berhasil disalin ke clipboard!', 'success');
    });
}

function showLikeNotification(liked) {
    const notification = document.getElementById('likeNotification');
    
    if (liked) {
        notification.innerHTML = '<i class="fas fa-heart"></i> Postingan disukai!';
        notification.classList.remove('unlike');
    } else {
        notification.innerHTML = '<i class="fas fa-heart-broken"></i> Like dibatalkan';
        notification.classList.add('unlike');
    }
    
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 2000);
}

function showAlert(message, type) {
    const alertElement = document.getElementById('alertMessage');
    if (!alertElement) return;
    
    alertElement.textContent = message;
    alertElement.className = 'alert show';
    
    if (type === 'success') {
        alertElement.classList.add('alert-success');
    } else if (type === 'error') {
        alertElement.classList.add('alert-error');
    }
    
    setTimeout(() => {
        alertElement.classList.remove('show');
    }, 3000);
}

// Initialize event listeners
function initializeEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            
            document.querySelectorAll('.nav-btn').forEach(b => {
                b.classList.remove('active');
                b.style.animation = '';
            });
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(section + 'Section').classList.add('active');
            
            // Animation
            this.style.animation = 'activePulse 0.3s ease-out';
            setTimeout(() => {
                this.style.animation = '';
            }, 300);
        });
    });

    // Admin login
    document.getElementById('adminAccessBtn').addEventListener('click', adminLogin);
    
    // Enter key for admin login
    document.getElementById('adminKeyInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            adminLogin();
        }
    });

    // Admin panel actions
    document.getElementById('publishPostBtn').addEventListener('click', function() {
        if (this.dataset.editing) {
            updatePost();
        } else {
            publishPost();
        }
    });
    
    document.getElementById('previewPostBtn').addEventListener('click', previewPost);
    document.getElementById('clearAllPostsBtn').addEventListener('click', clearAllPosts);
    document.getElementById('exportPostsBtn').addEventListener('click', exportPosts);
    document.getElementById('refreshAdminBtn').addEventListener('click', function() {
        loadAdminPosts();
        showAlert('Data diperbarui!', 'success');
        
        this.style.animation = 'spin 1s linear';
        setTimeout(() => {
            this.style.animation = '';
        }, 1000);
    });

    // Modal close
    document.getElementById('modalClose').addEventListener('click', () => {
        document.getElementById('postModal').classList.remove('active');
        
        // Leave WebSocket room
        if (socket && currentPostId) {
            socket.emit('leavePost', currentPostId);
            currentPostId = null;
        }
    });

    // Close modal on outside click
    document.getElementById('postModal').addEventListener('click', function(e) {
        if (e.target === this) {
            this.classList.remove('active');
            
            // Leave WebSocket room
            if (socket && currentPostId) {
                socket.emit('leavePost', currentPostId);
                currentPostId = null;
            }
        }
    });

    // Escape key to close modal
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.getElementById('postModal').classList.remove('active');
            
            if (socket && currentPostId) {
                socket.emit('leavePost', currentPostId);
                currentPostId = null;
            }
        }
    });
}

// Preview post
function previewPost() {
    const title = document.getElementById('postTitle').value.trim();
    const description = document.getElementById('postDescription').value.trim();
    const author = document.getElementById('postAuthor').value.trim();
    const language = document.getElementById('postLanguage').value;
    const tags = document.getElementById('postTags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
    const code = document.getElementById('postCode').value.trim();
    
    if (!title || !code) {
        showAlert('Judul dan kode harus diisi untuk preview!', 'error');
        return;
    }
    
    // Update modal content
    document.getElementById('modalPostTitle').textContent = escapeHtml(title);
    document.getElementById('modalPostLanguage').textContent = language.toUpperCase();
    document.getElementById('modalPostDescription').textContent = escapeHtml(description) || "Tidak ada deskripsi.";
    document.getElementById('modalPostAuthor').textContent = escapeHtml(author) || "Admin";
    document.getElementById('modalPostTime').textContent = "Preview";
    document.getElementById('modalPostCode').textContent = escapeHtml(code);
    document.getElementById('modalViews').textContent = "0";
    document.getElementById('modalLikes').textContent = "0";
    document.getElementById('modalCommentsCount').textContent = "0";
    document.getElementById('commentsCount').textContent = "0";
    document.getElementById('commentsList').innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 20px;">Ini hanya preview. Komentar tidak tersedia.</p>';
    
    // Update tags
    const tagsContainer = document.getElementById('modalPostTags');
    tagsContainer.innerHTML = '';
    const tagList = tags.length > 0 ? tags : ["code"];
    tagList.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.style.cssText = `
            display: inline-block;
            padding: 4px 10px;
            background: var(--cyan);
            border: 2px solid var(--border-color);
            margin-right: 6px;
            margin-bottom: 6px;
            font-size: 0.75rem;
            font-weight: 600;
        `;
        tagElement.textContent = tag;
        tagsContainer.appendChild(tagElement);
    });
    
    // Remove button actions for preview
    document.getElementById('modalLikeBtn').onclick = () => showAlert('Ini hanya preview!', 'warning');
    document.getElementById('modalDownloadBtn').onclick = () => showAlert('Ini hanya preview!', 'warning');
    document.getElementById('modalCopyBtn').onclick = () => copyToClipboard(code);
    
    // Hide comments section for preview
    document.getElementById('commentsSection').style.display = 'none';
    
    // Show modal
    document.getElementById('postModal').classList.add('active');
}

// Start the app
document.addEventListener('DOMContentLoaded', initApp);
