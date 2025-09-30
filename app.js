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
const trendPeriodSelect = document.getElementById('trend-period');
const trendChartCanvas = document.getElementById('trend-chart');
const lastRefreshTimeEl = document.getElementById('last-refresh-time');

// Worker Progress Elements
const workerStatusCard = document.getElementById('worker-status-card');
const workerStatusBadge = document.getElementById('worker-status-badge');
const workerProgressBar = document.getElementById('worker-progress-bar');
const workerProgressText = document.getElementById('worker-progress-text');
const workerCurrentKeyword = document.getElementById('worker-current-keyword');
const workerErrorCount = document.getElementById('worker-error-count');

// CSV Upload Elements
const uploadCsvBtn = document.getElementById('upload-csv-btn');
const csvUploadModal = document.getElementById('csv-upload-modal');
const closeCsvModal = document.getElementById('close-csv-modal');
const csvFileInput = document.getElementById('csv-file-input');
const csvPreview = document.getElementById('csv-preview');
const csvPreviewBody = document.getElementById('csv-preview-body');
const csvRowCount = document.getElementById('csv-row-count');
const uploadCsvConfirm = document.getElementById('upload-csv-confirm');
const cancelCsvUpload = document.getElementById('cancel-csv-upload');
const csvUploadProgress = document.getElementById('csv-upload-progress');
const csvProgressBar = document.getElementById('csv-progress-bar');
const csvProgressText = document.getElementById('csv-progress-text');

let historyChart;
let trendChart;
let visibilityCharts = {};
let allKeywords = [];
let filteredKeywords = [];
let currentSort = { column: 'keyword', direction: 'asc' };
let currentPage = 1;
const itemsPerPage = 50;
let parsedCsvData = null;
let workerProgressInterval = null;

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
        filteredKeywords = allKeywords;
        
        updateKpiCards(summary);
        populateFilters(allKeywords);
        applyFilters();
        fetchTrendData();
        fetchDomainVisibilityData();
        
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        alert('Could not load dashboard data. Please check the server connection.');
    }
}

// Worker Progress Monitoring
async function fetchWorkerProgress() {
    try {
        const res = await fetch('/api/worker/progress');
        if (!res.ok) return;
        
        const progress = await res.json();
        updateWorkerProgressUI(progress);
    } catch (error) {
        console.error('Error fetching worker progress:', error);
    }
}

function updateWorkerProgressUI(progress) {
    if (!progress) return;
    
    const { isRunning, totalKeywords, checkedKeywords, errors, currentKeyword, startTime, lastUpdate } = progress;
    
    if (isRunning) {
        workerStatusCard.classList.remove('hidden');
        workerStatusBadge.textContent = 'Running';
        workerStatusBadge.className = 'px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700';
        
        const percentage = totalKeywords > 0 ? (checkedKeywords / totalKeywords) * 100 : 0;
        workerProgressBar.style.width = `${percentage}%`;
        workerProgressText.textContent = `${checkedKeywords} / ${totalKeywords} keywords checked`;
        
        if (currentKeyword) {
            workerCurrentKeyword.textContent = `Currently checking: ${currentKeyword}`;
        } else {
            workerCurrentKeyword.textContent = 'Starting...';
        }
        
        if (errors > 0) {
            workerErrorCount.textContent = `${errors} error${errors > 1 ? 's' : ''}`;
            workerErrorCount.classList.remove('hidden');
        } else {
            workerErrorCount.classList.add('hidden');
        }
    } else if (lastUpdate && Date.now() - lastUpdate < 60000) {
        workerStatusCard.classList.remove('hidden');
        workerStatusBadge.textContent = 'Completed';
        workerStatusBadge.className = 'px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700';
        
        workerProgressBar.style.width = '100%';
        workerProgressText.textContent = `Completed: ${checkedKeywords} / ${totalKeywords} keywords`;
        workerCurrentKeyword.textContent = 'Check complete';
        
        if (errors > 0) {
            workerErrorCount.textContent = `${errors} error${errors > 1 ? 's' : ''}`;
            workerErrorCount.classList.remove('hidden');
        }
        
        setTimeout(() => {
            fetchDashboardData();
        }, 2000);
    } else {
        workerStatusCard.classList.add('hidden');
    }
}

function startWorkerProgressMonitoring() {
    if (workerProgressInterval) {
        clearInterval(workerProgressInterval);
    }
    
    fetchWorkerProgress();
    workerProgressInterval = setInterval(fetchWorkerProgress, 2000);
}

function stopWorkerProgressMonitoring() {
    if (workerProgressInterval) {
        clearInterval(workerProgressInterval);
        workerProgressInterval = null;
    }
}

function updateKpiCards(summary) {
    avgRankEl.textContent = summary.averageRank ? summary.averageRank.toFixed(1) : '-';
    top10El.textContent = summary.top10Count || '0';
    totalKeywordsEl.textContent = summary.totalKeywords || '0';
    
    if (summary.lastChecked) {
        const lastChecked = new Date(summary.lastChecked);
        const now = new Date();
        const diffMs = now - lastChecked;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        let timeAgo;
        if (diffMins < 1) {
            timeAgo = 'Just now';
        } else if (diffMins < 60) {
            timeAgo = `${diffMins}m ago`;
        } else if (diffHours < 24) {
            timeAgo = `${diffHours}h ago`;
        } else {
            timeAgo = `${diffDays}d ago`;
        }
        
        lastRefreshTimeEl.textContent = timeAgo;
        lastRefreshTimeEl.title = lastChecked.toLocaleString();
    } else {
        lastRefreshTimeEl.textContent = 'Never';
    }
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
    
    updateRankDistribution();
}

function updateRankDistribution() {
    const dist1_3 = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank >= 1 && kw.current_rank <= 3).length;
    const dist4_10 = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank >= 4 && kw.current_rank <= 10).length;
    const dist11_20 = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank >= 11 && kw.current_rank <= 20).length;
    const dist21_50 = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank >= 21 && kw.current_rank <= 50).length;
    const dist51_100 = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank >= 51 && kw.current_rank <= 100).length;
    const distUnranked = filteredKeywords.filter(kw => !kw.current_rank || kw.current_rank > 100).length;
    
    document.getElementById('dist-1-3').textContent = dist1_3;
    document.getElementById('dist-4-10').textContent = dist4_10;
    document.getElementById('dist-11-20').textContent = dist11_20;
    document.getElementById('dist-21-50').textContent = dist21_50;
    document.getElementById('dist-51-100').textContent = dist51_100;
    document.getElementById('dist-unranked').textContent = distUnranked;
}

async function fetchTrendData() {
    const days = parseInt(trendPeriodSelect.value);
    
    try {
        const keywordIds = filteredKeywords.map(kw => kw.id);
        
        if (keywordIds.length === 0) {
            renderEmptyTrend();
            return;
        }
        
        const historyPromises = keywordIds.map(id => 
            fetch(`/api/history/${id}`).then(r => r.json()).catch(() => [])
        );
        
        const allHistories = await Promise.all(historyPromises);
        
        const dateMap = new Map();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        allHistories.forEach(history => {
            history.forEach(entry => {
                const date = new Date(entry.checked_at);
                if (date >= cutoffDate) {
                    const dateKey = date.toISOString().split('T')[0];
                    if (!dateMap.has(dateKey)) {
                        dateMap.set(dateKey, []);
                    }
                    dateMap.get(dateKey).push(entry.rank);
                }
            });
        });
        
        const sortedDates = Array.from(dateMap.keys()).sort();
        const avgRanks = sortedDates.map(date => {
            const ranks = dateMap.get(date);
            return ranks.reduce((sum, r) => sum + r, 0) / ranks.length;
        });
        
        renderTrendChart(sortedDates, avgRanks);
        
    } catch (error) {
        console.error('Error fetching trend data:', error);
        renderEmptyTrend();
    }
}

function renderTrendChart(dates, avgRanks) {
    if (trendChart) {
        trendChart.destroy();
    }
    
    if (dates.length === 0) {
        renderEmptyTrend();
        return;
    }
    
    const labels = dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    
    trendChart = new Chart(trendChartCanvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Average Position',
                data: avgRanks,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: function(context) {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if (!chartArea) return null;
                    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                    gradient.addColorStop(0, 'rgba(59, 130, 246, 0)');
                    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.3)');
                    return gradient;
                },
                tension: 0.4,
                fill: true,
                pointRadius: 5,
                pointHoverRadius: 8,
                pointBackgroundColor: 'rgb(59, 130, 246)',
                pointBorderColor: '#fff',
                pointBorderWidth: 3,
                pointHoverBackgroundColor: 'rgb(99, 102, 241)',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 4,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    reverse: true,
                    beginAtZero: false,
                    title: { 
                        display: true, 
                        text: 'Average Rank', 
                        font: { size: 14, weight: 'bold' },
                        color: '#94a3b8'
                    },
                    grid: { 
                        color: 'rgba(148, 163, 184, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 12 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { 
                        maxRotation: 0, 
                        autoSkipPadding: 20,
                        color: '#94a3b8',
                        font: { size: 12 }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 2,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return 'Avg Position: ' + context.parsed.y.toFixed(1);
                        }
                    }
                }
            }
        }
    });
}

function renderEmptyTrend() {
    if (trendChart) {
        trendChart.destroy();
    }
    trendChartCanvas.parentElement.innerHTML = `
        <div class="text-center py-12 text-slate-400">
            <p class="text-sm">No historical data available yet</p>
            <p class="text-xs mt-1">Data will appear after the worker checks your keywords</p>
        </div>
        <canvas id="trend-chart" height="80" style="display:none;"></canvas>
    `;
}

async function fetchDomainVisibilityData() {
    const container = document.getElementById('visibility-trends-container');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-8 text-slate-400"><div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div><p class="mt-2 text-sm">Loading domain visibility trends...</p></div>';
    
    try {
        const domainCountryPairs = new Map();
        allKeywords.forEach(kw => {
            const key = `${kw.domain}|${kw.country}`;
            if (!domainCountryPairs.has(key)) {
                domainCountryPairs.set(key, { domain: kw.domain, country: kw.country });
            }
        });
        
        if (domainCountryPairs.size === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = '';
        
        for (const [key, { domain, country }] of domainCountryPairs) {
            try {
                const res = await fetch(`/api/sistrix/visibility/${encodeURIComponent(domain)}?country=${encodeURIComponent(country)}`);
                
                if (!res.ok) {
                    console.error(`Failed to fetch Sistrix data for ${domain}`);
                    continue;
                }
                
                const data = await res.json();
                
                if (data && data.length > 0) {
                    renderDomainVisibilityChart(domain, country, data, container);
                }
                
            } catch (error) {
                console.error(`Error fetching visibility for ${domain}:`, error);
            }
        }
        
        if (container.children.length === 0) {
            container.innerHTML = `
                <div class="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-8 text-center shadow-2xl">
                    <div class="text-slate-400">
                        <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                        </svg>
                        <p class="text-lg font-medium text-white mb-2">No Sistrix Data Available</p>
                        <p class="text-sm">Visibility trends will appear here when data is available</p>
                    </div>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Error fetching visibility data:', error);
        container.innerHTML = `
            <div class="bg-red-900/20 border border-red-700 rounded-2xl p-8 text-center">
                <p class="text-red-400">Failed to load domain visibility data</p>
            </div>
        `;
    }
}

function renderDomainVisibilityChart(domain, country, data, container) {
    const chartId = `visibility-chart-${domain.replace(/\./g, '-')}-${country}`;
    
    const chartDiv = document.createElement('div');
    chartDiv.className = 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-8 mb-6 shadow-2xl';
    chartDiv.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <div>
                <h3 class="text-xl font-bold text-white mb-1 flex items-center gap-3">
                    <div class="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                        </svg>
                    </div>
                    Domain Visibility Index - ${domain}
                </h3>
                <p class="text-sm text-slate-400 ml-13">${country} • Powered by Sistrix</p>
            </div>
            <div class="text-right">
                <p class="text-xs text-slate-500">Current Visibility</p>
                <p class="text-2xl font-bold text-purple-400">${data[data.length - 1].value.toFixed(2)}</p>
            </div>
        </div>
        <div class="bg-slate-800/50 rounded-xl p-6 backdrop-blur-sm border border-slate-700/50">
            <canvas id="${chartId}" height="70"></canvas>
        </div>
    `;
    
    container.appendChild(chartDiv);
    
    const labels = data.map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const values = data.map(d => parseFloat(d.value));
    
    const ctx = document.getElementById(chartId);
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Visibility Index',
                data: values,
                borderColor: 'rgb(168, 85, 247)',
                backgroundColor: function(context) {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    if (!chartArea) return null;
                    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                    gradient.addColorStop(0, 'rgba(168, 85, 247, 0)');
                    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.3)');
                    return gradient;
                },
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 7,
                pointBackgroundColor: 'rgb(168, 85, 247)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverBackgroundColor: 'rgb(192, 132, 252)',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { 
                        display: true, 
                        text: 'Visibility Index', 
                        font: { size: 14, weight: 'bold' },
                        color: '#94a3b8'
                    },
                    grid: { 
                        color: 'rgba(148, 163, 184, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: { size: 12 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { 
                        maxRotation: 45,
                        autoSkipPadding: 15,
                        color: '#94a3b8',
                        font: { size: 11 }
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#e2e8f0',
                    borderColor: 'rgb(168, 85, 247)',
                    borderWidth: 2,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return 'Visibility: ' + context.parsed.y.toFixed(2);
                        }
                    }
                }
            }
        }
    });
    
    visibilityCharts[chartId] = chart;
}

function sortKeywords() {
    filteredKeywords.sort((a, b) => {
        let aVal = a[currentSort.column];
        let bVal = b[currentSort.column];
        
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
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

// CSV Upload Functions
function openCsvModal() {
    csvUploadModal.classList.remove('hidden');
    parsedCsvData = null;
    csvPreview.classList.add('hidden');
    uploadCsvConfirm.disabled = true;
    csvFileInput.value = '';
}

function closeCsvModalHandler() {
    csvUploadModal.classList.add('hidden');
    parsedCsvData = null;
}

function handleCsvFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
        alert('Please select a CSV file');
        return;
    }
    
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            if (results.errors.length > 0) {
                console.error('CSV parsing errors:', results.errors);
                alert('Error parsing CSV file. Please check the format.');
                return;
            }
            
            processCSVData(results.data);
        },
        error: function(error) {
            console.error('CSV parsing error:', error);
            alert('Error reading CSV file.');
        }
    });
}

function processCSVData(data) {
    const requiredColumns = ['Keyword', 'Search Volume', 'Target URL', 'Domain', 'Country'];
    
    if (data.length === 0) {
        alert('CSV file is empty');
        return;
    }
    
    const headers = Object.keys(data[0]);
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
        alert(`Missing required columns: ${missingColumns.join(', ')}\n\nExpected columns: ${requiredColumns.join(', ')}\n\nFound columns: ${headers.join(', ')}`);
        return;
    }
    
    const grouped = {};
    let skippedRows = 0;
    
    data.forEach((row, index) => {
        const keyword = (row.Keyword || row.keyword || '').trim();
        const volume = parseInt(row['Search Volume'] || row['search volume'] || row.volume || 0);
        let url = (row['Target URL'] || row['target url'] || row.url || '').trim();
        const domain = (row.Domain || row.domain || '').trim();
        const country = (row.Country || row.country || '').trim();
        
        if (url && !url.startsWith('http')) {
            url = 'https://' + url;
        }
        
        if (!keyword || !url || !domain || !country) {
            skippedRows++;
            return;
        }
        
        try {
            new URL(url);
        } catch (e) {
            skippedRows++;
            return;
        }
        
        const key = `${domain}|${country}`;
        if (!grouped[key]) {
            grouped[key] = {
                domain,
                country,
                keywords: []
            };
        }
        
        grouped[key].keywords.push({
            keyword,
            target_url: url,
            search_volume: volume
        });
    });
    
    parsedCsvData = Object.values(grouped);
    
    if (parsedCsvData.length === 0) {
        alert('No valid data found in CSV. Please check the format.');
        return;
    }
    
    displayCsvPreview(parsedCsvData);
    uploadCsvConfirm.disabled = false;
}

function displayCsvPreview(groups) {
    csvPreviewBody.innerHTML = '';
    
    let totalKeywords = 0;
    groups.forEach(group => {
        totalKeywords += group.keywords.length;
        
        const preview = group.keywords.slice(0, 3);
        preview.forEach((kw) => {
            const row = document.createElement('tr');
            row.className = 'border-b border-gray-200';
            row.innerHTML = `
                <td class="p-1 truncate max-w-xs" title="${kw.keyword}">${kw.keyword}</td>
                <td class="p-1">${kw.search_volume}</td>
                <td class="p-1">${group.domain}</td>
                <td class="p-1">${group.country}</td>
            `;
            csvPreviewBody.appendChild(row);
        });
        
        if (group.keywords.length > 3) {
            const moreRow = document.createElement('tr');
            moreRow.innerHTML = `
                <td colspan="4" class="p-1 text-gray-500 italic text-xs">
                    ... and ${group.keywords.length - 3} more keywords for ${group.domain} (${group.country})
                </td>
            `;
            csvPreviewBody.appendChild(moreRow);
        }
    });
    
    csvRowCount.textContent = `Total: ${totalKeywords} keywords across ${groups.length} domain/country combination(s)`;
    csvPreview.classList.remove('hidden');
}

async function uploadCsvData() {
    if (!parsedCsvData || parsedCsvData.length === 0) {
        alert('No data to upload');
        return;
    }
    
    uploadCsvConfirm.disabled = true;
    csvUploadProgress.classList.remove('hidden');
    
    let totalUploaded = 0;
    let totalKeywords = 0;
    
    parsedCsvData.forEach(group => {
        totalKeywords += group.keywords.length;
    });
    
    for (const group of parsedCsvData) {
        try {
            const validKeywords = group.keywords.filter(kw => {
                return kw.keyword && kw.target_url && kw.search_volume !== undefined;
            });
            
            if (validKeywords.length === 0) {
                throw new Error('No valid keywords found in this group');
            }
            
            const chunkSize = 100;
            const chunks = [];
            
            for (let i = 0; i < validKeywords.length; i += chunkSize) {
                chunks.push(validKeywords.slice(i, i + chunkSize));
            }
            
            for (let i = 0; i < chunks.length; i++) {
                csvProgressText.textContent = `Uploading ${group.domain} (${group.country})... Chunk ${i + 1}/${chunks.length}`;
                csvProgressBar.style.width = `${(totalUploaded / totalKeywords) * 100}%`;
                
                const res = await fetch('/api/keywords/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        domain: group.domain,
                        country: group.country,
                        keywords: chunks[i]
                    })
                });
                
                const responseText = await res.text();
                
                if (!res.ok) {
                    let errorMessage = 'Failed to upload';
                    try {
                        const errorData = JSON.parse(responseText);
                        errorMessage = errorData.error || errorMessage;
                    } catch (e) {
                        errorMessage = `Server error (${res.status}).`;
                    }
                    throw new Error(errorMessage);
                }
                
                totalUploaded += chunks[i].length;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
        } catch (error) {
            console.error(`Error uploading ${group.domain}:`, error);
            alert(`Error uploading keywords for ${group.domain}: ${error.message}\n\nUploaded ${totalUploaded}/${totalKeywords} keywords before error.`);
            break;
        }
    }
    
    csvProgressBar.style.width = '100%';
    csvProgressText.textContent = `Successfully uploaded ${totalUploaded} keywords!`;
    
    setTimeout(() => {
        closeCsvModalHandler();
        fetchDashboardData();
        csvUploadProgress.classList.add('hidden');
        csvProgressBar.style.width = '0%';
    }, 2000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
    startWorkerProgressMonitoring();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopWorkerProgressMonitoring();
    } else {
        startWorkerProgressMonitoring();
    }
});

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

uploadCsvBtn.addEventListener('click', openCsvModal);
closeCsvModal.addEventListener('click', closeCsvModalHandler);
cancelCsvUpload.addEventListener('click', closeCsvModalHandler);
csvFileInput.addEventListener('change', handleCsvFileSelect);
uploadCsvConfirm.addEventListener('click', uploadCsvData);

csvUploadModal.addEventListener('click', (e) => {
    if (e.target === csvUploadModal) {
        closeCsvModalHandler();
    }
});

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

filterCountry.addEventListener('change', () => { 
    currentPage = 1; 
    applyFilters(); 
    fetchTrendData(); 
    fetchDomainVisibilityData();
});
filterDomain.addEventListener('change', () => { currentPage = 1; applyFilters(); fetchTrendData(); });
filterRank.addEventListener('change', () => { currentPage = 1; applyFilters(); });
searchInput.addEventListener('input', () => { currentPage = 1; applyFilters(); });

trendPeriodSelect.addEventListener('change', fetchTrendData);

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

selectAllCheckbox.addEventListener('change', (e) => {
    document.querySelectorAll('.keyword-checkbox').forEach(cb => {
        cb.checked = e.target.checked;
    });
});

exportBtn.addEventListener('click', exportToCSV);

function closeModal() {
    historyModal.classList.remove('is-open');
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (historyModal.classList.contains('is-open')) {
            closeModal();
        }
        if (!csvUploadModal.classList.contains('hidden')) {
            closeCsvModalHandler();
        }
    }
});
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
                <td class="px-6 py-3