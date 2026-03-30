// storage.js

// Default structure
const DEFAULT_STATE = {
    isLoggedIn: false,
    books: [], // { id, isbn, title, author, pages, coverUrl, status: 'read' | 'want', dateAdded: string }
    lastActivityDate: null,
    streak: 0
};

// Initialize if empty
if (!localStorage.getItem('leitura_data')) {
    localStorage.setItem('leitura_data', JSON.stringify(DEFAULT_STATE));
}

export function getData() {
    return JSON.parse(localStorage.getItem('leitura_data'));
}

function saveData(data) {
    localStorage.setItem('leitura_data', JSON.stringify(data));
}

export function login() {
    const data = getData();
    data.isLoggedIn = true;
    saveData(data);
}

export function logout() {
    const data = getData();
    data.isLoggedIn = false;
    saveData(data);
}

export function isLoggedIn() {
    return getData().isLoggedIn;
}

// Streak logic (Ofensiva)
export function checkAndUpdateStreak() {
    const data = getData();
    const today = new Date().toISOString().split('T')[0];
    
    if (!data.lastActivityDate) {
        // First activity
        data.streak = 1;
        data.lastActivityDate = today;
    } else {
        const lastDate = new Date(data.lastActivityDate);
        const currentDate = new Date(today);
        const diffTime = Math.abs(currentDate - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        if (diffDays === 1) {
            // Consecutive day
            data.streak += 1;
            data.lastActivityDate = today;
        } else if (diffDays > 1) {
            // Streak broken
            data.streak = 1;
            data.lastActivityDate = today;
        }
        // if diffDays === 0, same day, do nothing to streak
    }
    saveData(data);
    return data.streak;
}

export function getStreak() {
    return getData().streak;
}

// Book logic
export function addBook(bookObj, status) {
    const data = getData();
    // check if exists
    if (data.books.find(b => b.isbn === bookObj.isbn)) {
        return false; // already exists
    }
    
    data.books.push({
        ...bookObj,
        id: Date.now().toString(),
        status: status,
        dateAdded: new Date().toISOString()
    });
    saveData(data);
    checkAndUpdateStreak(); // Adding a book counts as activity
    return true;
}

export function getBooks(status) {
    const data = getData();
    return data.books.filter(b => b.status === status);
}

export function deleteBook(id) {
    const data = getData();
    data.books = data.books.filter(b => b.id !== id);
    saveData(data);
}

export function moveBook(id, newStatus) {
    const data = getData();
    const book = data.books.find(b => b.id === id);
    if (book) {
        book.status = newStatus;
        if(newStatus === 'read') {
            book.dateAdded = new Date().toISOString(); // reset date to current for monthly stats
        }
        saveData(data);
        checkAndUpdateStreak(); // Moving/Completing a book counts as activity
    }
}

// Report Logic
export function getMonthlyReadStats(year) {
    const data = getData();
    const readBooks = data.books.filter(b => b.status === 'read');
    
    const monthlyCounts = new Array(12).fill(0);
    
    readBooks.forEach(book => {
        const date = new Date(book.dateAdded);
        if (date.getFullYear() === year) {
            monthlyCounts[date.getMonth()] += 1;
        }
    });
    
    return monthlyCounts;
}

export function getTopAuthors() {
    const data = getData();
    const authorCounts = {};
    
    data.books.filter(b=>b.status === 'read').forEach(book => {
        if (!book.author) return;
        authorCounts[book.author] = (authorCounts[book.author] || 0) + 1;
    });
    
    // Convert to sorted array
    return Object.entries(authorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
}
