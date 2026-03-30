// app.js - Application Logic (Monolithic to avoid file:// CORS issues)

// --- STORAGE SYSTEM ---
const Storage = {
    DEFAULT_STATE: {
        isLoggedIn: false,
        books: [], 
        lastActivityDate: null,
        streak: 0
    },
    init() {
        if (!localStorage.getItem('leitura_data')) {
            localStorage.setItem('leitura_data', JSON.stringify(this.DEFAULT_STATE));
        }
        // Daily streak check without adding interactions
        this.checkAndUpdateStreak(false);
    },
    getData() {
        return JSON.parse(localStorage.getItem('leitura_data'));
    },
    saveData(data) {
        localStorage.setItem('leitura_data', JSON.stringify(data));
    },
    login() {
        const data = this.getData();
        data.isLoggedIn = true;
        this.saveData(data);
    },
    logout() {
        const data = this.getData();
        data.isLoggedIn = false;
        this.saveData(data);
    },
    isLoggedIn() {
        return this.getData().isLoggedIn;
    },
    checkAndUpdateStreak(activityOccurred = true) {
        const data = this.getData();
        const today = new Date().toISOString().split('T')[0];
        
        if (!data.lastActivityDate && activityOccurred) {
            data.streak = 1;
            data.lastActivityDate = today;
        } else if (data.lastActivityDate && activityOccurred) {
            const lastDate = new Date(data.lastActivityDate);
            const currentDate = new Date(today);
            const diffTime = Math.abs(currentDate - lastDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            
            if (diffDays === 1) {
                data.streak += 1;
                data.lastActivityDate = today;
            } else if (diffDays > 1) {
                data.streak = 1; // reset broken streak
                data.lastActivityDate = today;
            }
        }
        this.saveData(data);
        return data.streak;
    },
    getStreak() {
        return this.getData().streak;
    },
    getBooks(status) {
        return this.getData().books.filter(b => b.status === status);
    },
    addBook(bookObj, status) {
        const data = this.getData();
        if (data.books.find(b => b.isbn === bookObj.isbn)) return false; 
        
        data.books.push({
            ...bookObj,
            id: Date.now().toString(),
            status: status,
            dateAdded: new Date().toISOString()
        });
        this.saveData(data);
        this.checkAndUpdateStreak(); 
        return true;
    },
    deleteBook(id) {
        const data = this.getData();
        data.books = data.books.filter(b => b.id !== id);
        this.saveData(data);
    },
    moveBook(id, newStatus) {
        const data = this.getData();
        const book = data.books.find(b => b.id === id);
        if (book) {
            book.status = newStatus;
            if (newStatus === 'read') {
                book.dateAdded = new Date().toISOString(); 
            }
            this.saveData(data);
            this.checkAndUpdateStreak(); 
        }
    },
    getMonthlyReadStats(year) {
        const data = this.getData();
        const readBooks = data.books.filter(b => b.status === 'read');
        const monthlyCounts = new Array(12).fill(0);
        readBooks.forEach(book => {
            const date = new Date(book.dateAdded);
            if (date.getFullYear() === year) {
                monthlyCounts[date.getMonth()] += 1;
            }
        });
        return monthlyCounts;
    },
    getTopAuthors() {
        const data = this.getData();
        const authorCounts = {};
        data.books.filter(b => b.status === 'read').forEach(book => {
            if (!book.author || book.author === 'Autor Desconhecido') return;
            authorCounts[book.author] = (authorCounts[book.author] || 0) + 1;
        });
        return Object.entries(authorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));
    }
};

// --- ISBN FETCH SYSTEM ---
const ISBNFetcher = {
    async fetch(isbn) {
        const cleanIsbn = isbn.replace(/[- ]/g, '');
        if (!cleanIsbn || cleanIsbn.length < 10) throw new Error('ISBN inválido. Ex: 9788535914849');
        
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`);
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) throw new Error('Nenhum livro encontrado na nuvem para este ISBN.');
        
        const info = data.items[0].volumeInfo;
        let coverUrl = null;
        if (info.imageLinks) {
            coverUrl = info.imageLinks.thumbnail || info.imageLinks.smallThumbnail;
            if (coverUrl) coverUrl = coverUrl.replace('&zoom=1', '&zoom=1').replace('http:', 'https:');
        }

        return {
            isbn: cleanIsbn,
            title: info.title || 'Título Desconhecido',
            author: info.authors ? info.authors.join(', ') : 'Autor Desconhecido',
            pages: info.pageCount || 0,
            coverUrl: coverUrl
        };
    }
};

// --- DOM App Logic ---
const App = {
    // Elements
    screens: {
        login: document.getElementById('login-screen'),
        app: document.getElementById('app-screen')
    },
    tabs: {
        dashboard: document.getElementById('tab-dashboard'),
        reports: document.getElementById('tab-reports')
    },
    forms: {
        loginForm: document.getElementById('login-form'),
        usernameInput: document.getElementById('username'),
        passwordInput: document.getElementById('password'),
        loginError: document.getElementById('login-error')
    },
    buttons: {
        logout: document.getElementById('logout-btn'),
        navLinks: document.querySelectorAll('.nav-links li'),
        openModalBtn: document.getElementById('open-add-modal'),
        shelfTabs: document.querySelectorAll('.shelf-tab')
    },
    dashboard: {
        streakDays: document.getElementById('streak-days'),
        booksReadMonth: document.getElementById('books-read-month'),
        booksGrid: document.getElementById('books-grid')
    },
    modal: {
        overlay: document.getElementById('add-modal'),
        close: document.getElementById('close-modal'),
        isbnInput: document.getElementById('isbn-input'),
        searchBtn: document.getElementById('btn-search-isbn'),
        loading: document.getElementById('isbn-loading'),
        preview: document.getElementById('book-preview'),
        actions: document.getElementById('add-actions'),
        actionBtns: document.querySelectorAll('.shelf-select-btn'),
        cover: document.getElementById('preview-cover'),
        title: document.getElementById('preview-title'),
        author: document.getElementById('preview-author'),
        pages: document.getElementById('preview-pages')
    },
    toast: document.getElementById('toast'),
    
    // State
    currentShelfTab: 'read',
    currentFetchedBook: null, // holds book details after isbn search

    init() {
        Storage.init();
        this.bindEvents();
        this.checkAuth();
    },

    bindEvents() {
        // Login Submit
        this.forms.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const u = this.forms.usernameInput.value;
            const p = this.forms.passwordInput.value;
            if (u.trim().toLowerCase() === 'luis' && p === 'Ec0n0m1a') {
                Storage.login();
                this.forms.loginError.classList.add('hidden');
                this.checkAuth();
                this.showToast('Bem-vindo de volta, Luis!');
            } else {
                this.forms.loginError.classList.remove('hidden');
                // shake effect
                this.screens.login.querySelector('.login-card').animate([
                    { transform: 'translateX(0px)' },
                    { transform: 'translateX(-10px)' },
                    { transform: 'translateX(10px)' },
                    { transform: 'translateX(-10px)' },
                    { transform: 'translateX(0px)' }
                ], { duration: 300 });
            }
        });

        // Logout
        this.buttons.logout.addEventListener('click', () => {
            if(confirm("Deseja realmente sair?")) {
                Storage.logout();
                this.checkAuth();
            }
        });

        // Navigation Tabs
        this.buttons.navLinks.forEach(link => {
            link.addEventListener('click', () => {
                this.buttons.navLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');
                
                const targetTab = link.dataset.tab;
                
                this.tabs.dashboard.classList.add('hidden');
                this.tabs.reports.classList.add('hidden');
                
                this.tabs[targetTab].classList.remove('hidden');
                
                if (targetTab === 'reports') {
                    this.renderReports();
                } else {
                    this.renderDashboard();
                }
            });
        });

        // Shelf Switch
        this.buttons.shelfTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.buttons.shelfTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentShelfTab = tab.dataset.shelf;
                this.renderBooksGrid();
            });
        });

        // Modal triggers
        this.buttons.openModalBtn.addEventListener('click', () => this.openModal());
        this.modal.close.addEventListener('click', () => this.closeModal());
        
        // Modal ISBN Search
        this.modal.searchBtn.addEventListener('click', async () => {
            const val = this.modal.isbnInput.value.trim();
            if(!val) return;
            
            // disable button & show loading
            this.modal.searchBtn.disabled = true;
            this.modal.loading.classList.remove('hidden');
            this.modal.preview.classList.add('hidden');
            this.modal.actions.classList.add('hidden');
            
            try {
                const book = await ISBNFetcher.fetch(val);
                this.currentFetchedBook = book;
                
                // update ui
                this.modal.cover.src = book.coverUrl ? book.coverUrl : 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150" fill="%23eee"><rect width="100" height="150" fill="%232d3748"/><text x="50" y="75" font-family="sans-serif" font-size="12" fill="%23ccc" text-anchor="middle">Sem Capa</text></svg>';
                this.modal.title.textContent = book.title;
                this.modal.author.textContent = book.author;
                this.modal.pages.textContent = `${book.pages} páginas`;
                
                this.modal.preview.classList.remove('hidden');
                this.modal.actions.classList.remove('hidden');
                lucide.createIcons();
            } catch (err) {
                alert(err.message);
            } finally {
                this.modal.searchBtn.disabled = false;
                this.modal.loading.classList.add('hidden');
            }
        });

        // Modal Action Add Book
        this.modal.actionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetShelf = btn.dataset.target; // 'read' or 'want'
                if (this.currentFetchedBook) {
                    const success = Storage.addBook(this.currentFetchedBook, targetShelf);
                    if (success) {
                        this.showToast(`Adicionado em ${targetShelf === 'read' ? 'Já li' : 'Quero ler'}!`);
                        this.closeModal();
                        this.renderDashboard();
                        if (targetShelf === this.currentShelfTab) this.renderBooksGrid();
                    } else {
                        alert("Este livro já está na sua biblioteca!");
                    }
                }
            });
        });

        // Global Delete/Move Handler
        this.dashboard.booksGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if(!btn) return;
            const card = e.target.closest('.book-card');
            const id = card.dataset.id;

            if (btn.classList.contains('btn-delete-book')) {
                if(confirm("Remover este livro da sua biblioteca?")) {
                    Storage.deleteBook(id);
                    this.showToast("Livro removido.");
                    this.renderDashboard();
                    this.renderBooksGrid();
                }
            } else if (btn.classList.contains('btn-move-book')) {
                const isRead = this.currentShelfTab === 'read';
                const newTarget = isRead ? 'want' : 'read';
                Storage.moveBook(id, newTarget);
                this.showToast(isRead ? "Movido para Quero Ler." : "Ótimo! Movido para Já Li.");
                this.renderDashboard();
                this.renderBooksGrid();
            }
        });
    },

    checkAuth() {
        if (Storage.isLoggedIn()) {
            this.screens.login.classList.add('hidden');
            this.screens.app.classList.remove('hidden');
            this.renderDashboard();
        } else {
            this.screens.login.classList.remove('hidden');
            this.screens.app.classList.add('hidden');
        }
    },

    renderDashboard() {
        this.dashboard.streakDays.textContent = Storage.getStreak() || 0;
        
        // books read this month
        const now = new Date();
        const stats = Storage.getMonthlyReadStats(now.getFullYear());
        this.dashboard.booksReadMonth.textContent = stats[now.getMonth()] || 0;
        
        this.renderBooksGrid();
        lucide.createIcons(); // refresh icons
    },

    renderBooksGrid() {
        const books = Storage.getBooks(this.currentShelfTab);
        this.dashboard.booksGrid.innerHTML = '';
        
        if(books.length === 0) {
            this.dashboard.booksGrid.innerHTML = `<p style="color:var(--text-muted); grid-column: 1/-1;">Você ainda não tem livros nesta prateleira.</p>`;
            return;
        }

        books.forEach(b => {
             // ensure we have a fallback cover SVG
             const coverHTML = b.coverUrl 
                ? `<img src="${b.coverUrl}" alt="${b.title}" class="book-cover">`
                : `<div class="book-cover-placeholder"><i data-lucide="book" style="width:40px;height:40px; opacity:0.5;"></i></div>`;
                
             const card = document.createElement('div');
             card.className = 'book-card animate-scale-up';
             card.dataset.id = b.id;
             card.innerHTML = `
                ${coverHTML}
                <div class="book-info">
                    <h4 class="book-title" title="${b.title}">${b.title}</h4>
                    <p class="book-author">${b.author}</p>
                    <div class="book-meta">
                        ${this.currentShelfTab === 'want' 
                            ? `<button class="btn-move-book" title="Marcar como Lido"><i data-lucide="check-circle" style="width:16px; height:16px;"></i></button>`
                            : `<button class="btn-move-book" title="Mover para Quero Ler"><i data-lucide="bookmark" style="width:16px; height:16px;"></i></button>`
                         }
                        <span>${b.pages} págs</span>
                        <button class="btn-delete-book" title="Remover"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                    </div>
                </div>
             `;
             this.dashboard.booksGrid.appendChild(card);
        });
        
        // Must call lucide to render the dynamic icons attached
        lucide.createIcons();
    },

    renderReports() {
        const year = new Date().getFullYear();
        document.getElementById('current-year').textContent = year;
        
        const stats = Storage.getMonthlyReadStats(year);
        const maxLimit = Math.max(...stats, 5); // at least 5 to give chart space
        
        const chartContainer = document.getElementById('monthly-chart');
        chartContainer.innerHTML = '';
        
        const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
        
        stats.forEach((count, i) => {
            const h = (count / maxLimit) * 100; // relative height percentage
            
            const group = document.createElement('div');
            group.className = 'chart-bar-group';
            
            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            setTimeout(() => { bar.style.height = `${h === 0 ? 2 : h}px`; }, 100); // animate
            
            if(count > 0) {
                const val = document.createElement('div');
                val.className = 'chart-value';
                val.textContent = count;
                bar.appendChild(val);
            }
            
            const lbl = document.createElement('div');
            lbl.className = 'chart-label';
            lbl.textContent = months[i];
            
            group.appendChild(bar);
            group.appendChild(lbl);
            chartContainer.appendChild(group);
        });

        const authors = Storage.getTopAuthors();
        const ol = document.getElementById('top-authors-list');
        ol.innerHTML = '';
        if(authors.length === 0) {
            ol.innerHTML = '<li><span class="author-name" style="color:#94a3b8">Nenhum autor ainda. Leia mais livros!</span></li>';
        } else {
            authors.forEach(a => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="author-name">${a.name}</span> <span class="author-count">${a.count} livro(s)</span>`;
                ol.appendChild(li);
            });
        }
    },

    openModal() {
        this.currentFetchedBook = null;
        this.modal.isbnInput.value = '';
        this.modal.preview.classList.add('hidden');
        this.modal.actions.classList.add('hidden');
        this.modal.overlay.classList.remove('hidden');
        setTimeout(()=> this.modal.isbnInput.focus(), 100);
    },

    closeModal() {
        this.modal.overlay.classList.add('hidden');
    },

    showToast(msg) {
        this.toast.textContent = msg;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
