// DOM Elements
const addKeywordsForm = document.getElementById('add-keywords-form');
const addKeywordsToggle = document.getElementById('add-keywords-toggle');
const addKeywordsPanel = document.getElementById('add-keywords-panel');
const keywordsTableBody = document.getElementById('keywords-table-body');
const historyModal = document.getElementById('history-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalTitle = document.getElementById('modal-title');
const historyChartCanvas = document.getElementById('history-chart');

const filterCountry = document.getElementById('filter-country');
const filterDomain = document.getElementById('filter-domain');
const filterRank = document.getElementById('filter-rank');
const searchInput = document.getElementById('search-input');

const avgRankEl = document.getElementById('avg-rank');
const top3El = document.getElementById('top-3');
const top10El = document.getElementById('top-10');
const totalKeywordsEl = document.getElementById('total-keywords');
const resultsCountEl = document.getElementById('results-count');

const selectAllCheckbox = document.getElementById('select-all');
const exportBtn = document.getElementById('export-btn');

let historyChart;
let allKeywords = [];
let filteredKeywords = [];
let currentSort = { column: 'keyword', direction: 'asc' };
let currentPage = 1;
const itemsPerPage = 50;

// Fetch and Display Data
async function fetchDashboardData() {
    try {
        const [summaryRes, keywordsRes] = await Promise.all([
            fetch('/api/summary'),
            fetch('/api/keywords')
        ]);

        if (!summaryRes.ok || !keywordsRes.ok) {
            throw new Error('Failed to fetch data');
        }

        const summary = await summaryRes.json();
        allKeywords = await keywordsRes.json();
        filteredKeywords = allKeywords; // Initialize filtered with all
        
        updateKpiCards(summary);
        populateFilters(allKeywords);
        applyFilters();
        
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        alert('Could not load dashboard data. Please check the server connection.');
    }
}

function updateKpiCards(summary) {
    avgRankEl.textContent = summary.averageRank ? summary.averageRank.toFixed(1) : '-';
    top10El.textContent = summary.top10Count || '0';
    totalKeywordsEl.textContent = summary.totalKeywords || '0';
    lastUpdateEl.textContent = summary.lastChecked 
        ? new Date(summary.lastChecked).toLocaleString() 
        : 'Never';
}

function populateFilters(keywords) {
    const countries = [...new Set(keywords.map(kw => kw.country))];
    const domains = [...new Set(keywords.map(kw => kw.domain))];

    filterCountry.innerHTML = '<option value="">All Countries</option>';
    filterDomain.innerHTML = '<option value="">All Domains</option>';

    countries.forEach(c => {
        filterCountry.innerHTML += `<option value="${c}">${c}</option>`;
    });
    domains.forEach(d => {
        filterDomain.innerHTML += `<option value="${d}">${d}</option>`;
    });
}

// Filtering and Sorting
function applyFilters() {
    const country = filterCountry.value;
    const domain = filterDomain.value;
    const rankRange = filterRank.value;
    const searchTerm = searchInput.value.toLowerCase();

    filteredKeywords = allKeywords.filter(kw => {
        const countryMatch = country ? kw.country === country : true;
        const domainMatch = domain ? kw.domain === domain : true;
        const searchMatch = searchTerm ? kw.keyword.toLowerCase().includes(searchTerm) : true;
        
        let rankMatch = true;
        if (rankRange && kw.current_rank) {
            const rank = kw.current_rank;
            const [min, max] = rankRange.split('-').map(Number);
            rankMatch = rank >= min && rank <= max;
        }
        
        return countryMatch && domainMatch && searchMatch && rankMatch;
    });

    sortKeywords();
    renderTable();
    updateResultsCount();
    updateFilteredKPIs();
}

function updateFilteredKPIs() {
    const rankedKeywords = filteredKeywords.filter(kw => kw.current_rank !== null);
    
    const avgRank = rankedKeywords.length > 0
        ? rankedKeywords.reduce((sum, kw) => sum + kw.current_rank, 0) / rankedKeywords.length
        : null;
    
    const top3Count = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank <= 3).length;
    const top10Count = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank <= 10).length;
    
    avgRankEl.textContent = avgRank ? avgRank.toFixed(1) : '-';
    top3El.textContent = top3Count || '0';
    top10El.textContent = top10Count || '0';
    totalKeywordsEl.textContent = filteredKeywords.length || '0';
}

function sortKeywords() {
    filteredKeywords.sort((a, b) => {
        let aVal = a[currentSort.column];
        let bVal = b[currentSort.column];
        
        // Handle null values
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
        // String comparison
        if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
        }
        
        if (currentSort.direction === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
}

function renderTable() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageKeywords = filteredKeywords.slice(start, end);
    
    keywordsTableBody.innerHTML = '';
    
    if (pageKeywords.length === 0) {
        keywordsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-12 text-center text-sm text-gray-500">
                    No keywords match your filters.
                </td>
            </tr>
        `;
        return;
    }

    pageKeywords.forEach(kw => {
        const rankChange = kw.rank_change;
        let changeHtml = `<span class="rank-neutral">-</span>`;
        
        if (rankChange < 0) {
            changeHtml = `<span class="rank-up font-semibold">▲ ${Math.abs(rankChange)}</span>`;
        } else if (rankChange > 0) {
            changeHtml = `<span class="rank-down font-semibold">▼ ${rankChange}</span>`;
        }

        let rankClass = 'bg-gray-100 text-gray-700';
        if (kw.current_rank && kw.current_rank <= 3) {
            rankClass = 'bg-red-50 text-red-700 font-bold';
        } else if (kw.current_rank && kw.current_rank <= 10) {
            rankClass = 'bg-orange-50 text-orange-700';
        } else if (kw.current_rank && kw.current_rank <= 20) {
            rankClass = 'bg-yellow-50 text-yellow-700';
        }

        const row = `
            <tr class="table-row" id="kw-row-${kw.id}">
                <td class="px-6 py-3">
                    <input type="checkbox" class="keyword-checkbox rounded border-gray-300" data-id="${kw.id}">
                </td>
                <td class="px-6 py-3 text-sm font-medium text-gray-900">${kw.keyword}</td>
                <td class="px-6 py-3 text-center">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium ${rankClass}">
                        ${kw.current_rank || '-'}
                    </span>
                </td>
                <td class="px-6 py-3 text-center text-sm">${changeHtml}</td>
                <td class="px-6 py-3 text-center text-sm text-gray-600">${kw.search_volume ? kw.search_volume.toLocaleString() : '-'}</td>
                <td class="px-6 py-3 text-sm text-gray-500 truncate max-w-xs" title="${kw.target_url}">
                    ${kw.target_url}
                </td>
                <td class="px-6 py-3 text-center">
                    <button class="view-btn text-blue-600 hover:text-blue-700 text-sm font-medium mr-3" 
                        data-id="${kw.id}" data-keyword="${kw.keyword}">
                        View
                    </button>
                    <button class="delete-btn text-red-600 hover:text-red-700 text-sm font-medium" 
                        data-id="${kw.id}">
                        Delete
                    </button>
                </td>
            </tr>
        `;
        keywordsTableBody.innerHTML += row;
    });
    
    updatePagination();
}

function updateResultsCount() {
    resultsCountEl.textContent = `${filteredKeywords.length} keyword${filteredKeywords.length !== 1 ? 's' : ''}`;
}

function updatePagination() {
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, filteredKeywords.length);
    
    document.getElementById('showing-start').textContent = filteredKeywords.length > 0 ? start : 0;
    document.getElementById('showing-end').textContent = end;
    document.getElementById('showing-total').textContent = filteredKeywords.length;
    
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = end >= filteredKeywords.length;
}

// History Chart
async function fetchHistory(keywordId) {
    try {
        const res = await fetch(`/api/history/${keywordId}`);
        if (!res.ok) throw new Error('Failed to fetch history');
        return await res.json();
    } catch (error) {
        console.error('Error fetching history:', error);
        return [];
    }
}

function renderHistoryChart(history, keyword) {
    if (historyChart) {
        historyChart.destroy();
    }
    
    modalTitle.textContent = `Ranking History: "${keyword}"`;
    
    // Check if there's any history data
    if (history.length === 0) {
        historyChartCanvas.parentElement.innerHTML = `
            <div class="text-center py-12 text-gray-500">
                <p class="text-lg font-medium">No ranking history yet</p>
                <p class="text-sm mt-2">This keyword hasn't been checked by the worker yet.</p>
            </div>
        `;
        return;
    }
    
    const labels = history.map(h => new Date(h.checked_at).toLocaleDateString());
    const data = history.map(h => h.rank);
    
    historyChart = new Chart(historyChartCanvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Rank Position',
                data,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.3,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    reverse: true,
                    beginAtZero: false,
                    min: 1,
                    title: { display: true, text: 'SERP Position' }
                },
                x: {
                    title: { display: true, text: 'Date' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Position: ' + context.parsed.y;
                        }
                    }
                }
            }
        }
    });
}

// Export to CSV
function exportToCSV() {
    const headers = ['Keyword', 'Rank', 'Change', 'Search Volume', 'Domain', 'Country', 'Target URL'];
    const rows = filteredKeywords.map(kw => [
        kw.keyword,
        kw.current_rank || 'N/A',
        kw.rank_change || 0,
        kw.search_volume || 0,
        kw.domain,
        kw.country,
        kw.target_url
    ]);
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `serp-rankings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', fetchDashboardData);

// Toggle add keywords panel
addKeywordsToggle.addEventListener('click', () => {
    addKeywordsPanel.classList.toggle('hidden');
});

addKeywordsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = document.getElementById('domain').value;
    const country = document.getElementById('country').value;
    const keywordsInput = document.getElementById('keywords-input').value.trim();

    const keywords = keywordsInput.split('\n').map(line => {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
        return { 
            keyword: parts[0], 
            target_url: parts[1], 
            search_volume: parseInt(parts[2], 10) 
        };
    }).filter(Boolean);
    
    if (keywords.length === 0) {
        alert('Please enter keywords in the correct format: keyword, url, volume');
        return;
    }

    try {
        const res = await fetch('/api/keywords/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, country, keywords })
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Failed to add keywords');
        }
        
        addKeywordsForm.reset();
        fetchDashboardData();
        alert(`Successfully added ${keywords.length} keywords!`);

    } catch (error) {
        console.error('Error adding keywords:', error);
        alert(`Error: ${error.message}`);
    }
});

keywordsTableBody.addEventListener('click', async (e) => {
    const target = e.target;
    const id = target.dataset.id;
    
    if (target.classList.contains('view-btn')) {
        const keyword = target.dataset.keyword;
        const history = await fetchHistory(id);
        renderHistoryChart(history, keyword);
        historyModal.classList.add('is-open');
    }
    
    if (target.classList.contains('delete-btn')) {
        if (!confirm('Delete this keyword and all its history?')) return;
        
        try {
            const res = await fetch(`/api/keywords/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete keyword');
            fetchDashboardData();
        } catch (error) {
            console.error('Error deleting keyword:', error);
            alert('Could not delete keyword.');
        }
    }
});

// Sorting
document.querySelectorAll('.sortable').forEach(header => {
    header.addEventListener('click', () => {
        const column = header.dataset.sort;
        if (currentSort.column === column) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = column;
            currentSort.direction = 'asc';
        }
        applyFilters();
    });
});

// Filters
filterCountry.addEventListener('change', () => { currentPage = 1; applyFilters(); });
filterDomain.addEventListener('change', () => { currentPage = 1; applyFilters(); });
filterRank.addEventListener('change', () => { currentPage = 1; applyFilters(); });
searchInput.addEventListener('input', () => { currentPage = 1; applyFilters(); });

// Pagination
document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});

document.getElementById('next-page').addEventListener('click', () => {
    if (currentPage * itemsPerPage < filteredKeywords.length) {
        currentPage++;
        renderTable();
    }
});

// Bulk Selection
selectAllCheckbox.addEventListener('change', (e) => {
    document.querySelectorAll('.keyword-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
    });
});

keywordsTableBody.addEventListener('change', (e) => {
    if (e.target.classList.contains('keyword-checkbox')) {
        const anyChecked = document.querySelectorAll('.keyword-checkbox:checked').length > 0;
        // Update UI if needed
    }
});

// Export
exportBtn.addEventListener('click', exportToCSV);

// Modal
function closeModal() {
    historyModal.classList.remove('is-open');
    // Restore canvas if it was replaced
    const chartContainer = document.querySelector('#history-modal .p-6');
    if (!document.getElementById('history-chart')) {
        chartContainer.innerHTML = '<canvas id="history-chart"></canvas>';
    }
}

closeModalBtn.addEventListener('click', closeModal);
historyModal.addEventListener('click', (e) => {
    if (e.target === historyModal) {
        closeModal();
    }
});

// Also allow ESC key to close modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && historyModal.classList.contains('is-open')) {
        closeModal();
    }
});