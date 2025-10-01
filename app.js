// --- DOM Elements ---
const addKeywordsForm = document.getElementById('add-keywords-form');
const addKeywordsToggle = document.getElementById('add-keywords-toggle');
const addKeywordsPanel = document.getElementById('add-keywords-panel');
const keywordsTableBody = document.getElementById('keywords-table-body');
const historyModal = document.getElementById('history-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalTitle = document.getElementById('modal-title');
const historyChartCanvas = document.getElementById('history-chart');
const historyChartEmpty = document.getElementById('history-chart-empty');
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
const trendChartEmpty = document.getElementById('trend-chart-empty');
const lastRefreshTimeEl = document.getElementById('last-refresh-time');
const workerStatusCard = document.getElementById('worker-status-card');
const workerStatusBadge = document.getElementById('worker-status-badge');
const workerProgressBar = document.getElementById('worker-progress-bar');
const workerProgressText = document.getElementById('worker-progress-text');
const workerCurrentKeyword = document.getElementById('worker-current-keyword');
const workerErrorCount = document.getElementById('worker-error-count');
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

// --- State and Configuration ---
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
let searchDebounceTimeout = null;

// --- Initial Checks ---
if (typeof Chart === 'undefined') {
    console.error('Chart.js is not loaded. Please include Chart.js library.');
}
if (typeof Papa === 'undefined') {
    console.error('PapaParse is not loaded. Please include PapaParse library.');
}

// --- Data Fetching and Rendering ---
async function fetchDashboardData() {
    try {
        const [summaryRes, keywordsRes] = await Promise.all([
            fetch('/api/summary'),
            fetch('/api/keywords')
        ]);
        if (!summaryRes.ok || !keywordsRes.ok) {
            throw new Error(`Failed to fetch data: ${summaryRes.status}, ${keywordsRes.status}`);
        }
        const summary = await summaryRes.json();
        allKeywords = await keywordsRes.json();
        updateKpiCards(summary);
        populateFilters(allKeywords);
        applyFilters();
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        alert('Could not load dashboard data. Please check the server connection.');
    }
}

// --- Worker Progress Monitoring ---
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
    const { isRunning, totalKeywords, checkedKeywords, errors, currentKeyword, lastUpdate } = progress;
    if (isRunning) {
        workerStatusCard.classList.remove('hidden');
        workerStatusBadge.textContent = 'Running';
        workerStatusBadge.className = 'px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700';
        const percentage = totalKeywords > 0 ? (checkedKeywords / totalKeywords) * 100 : 0;
        workerProgressBar.style.width = `${percentage}%`;
        workerProgressText.textContent = `${checkedKeywords} / ${totalKeywords} keywords checked`;
        workerCurrentKeyword.textContent = currentKeyword ? `Currently checking: ${currentKeyword}` : 'Starting...';
        if (errors > 0) {
            workerErrorCount.textContent = `${errors} error${errors > 1 ? 's' : ''}`;
            workerErrorCount.classList.remove('hidden');
        } else {
            workerErrorCount.classList.add('hidden');
        }
    } else if (lastUpdate && (Date.now() - new Date(lastUpdate).getTime()) < 60000) {
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
        setTimeout(fetchDashboardData, 2000);
    } else {
        workerStatusCard.classList.add('hidden');
    }
}

function startWorkerProgressMonitoring() {
    if (workerProgressInterval) clearInterval(workerProgressInterval);
    fetchWorkerProgress();
    workerProgressInterval = setInterval(fetchWorkerProgress, 2000);
}
function stopWorkerProgressMonitoring() {
    if (workerProgressInterval) {
        clearInterval(workerProgressInterval);
        workerProgressInterval = null;
    }
}

// --- UI Updates ---
function updateKpiCards(summary) {
    avgRankEl.textContent = summary.averageRank ? summary.averageRank.toFixed(1) : '-';
    top3El.textContent = summary.top3Count || '0';
    top10El.textContent = summary.top10Count || '0';
    totalKeywordsEl.textContent = summary.totalKeywords || '0';
    if (summary.lastChecked) {
        const lastChecked = new Date(summary.lastChecked);
        const diffMs = new Date() - lastChecked;
        const diffMins = Math.floor(diffMs / 60000);
        let timeAgo;
        if (diffMins < 1) timeAgo = 'Just now';
        else if (diffMins < 60) timeAgo = `${diffMins}m ago`;
        else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`;
        else timeAgo = `${Math.floor(diffMins / 1440)}d ago`;
        lastRefreshTimeEl.textContent = timeAgo;
        lastRefreshTimeEl.title = lastChecked.toLocaleString();
    } else {
        lastRefreshTimeEl.textContent = 'Never';
    }
}

function populateFilters(keywords) {
    const countries = [...new Set(keywords.map(kw => kw.country))].sort();
    const domains = [...new Set(keywords.map(kw => kw.domain))].sort();
    const selectedCountry = filterCountry.value;
    const selectedDomain = filterDomain.value;
    filterCountry.innerHTML = '<option value="">All Countries</option>';
    filterDomain.innerHTML = '<option value="">All Domains</option>';
    countries.forEach(c => filterCountry.innerHTML += `<option value="${c}">${c}</option>`);
    domains.forEach(d => filterDomain.innerHTML += `<option value="${d}">${d}</option>`);
    filterCountry.value = selectedCountry;
    filterDomain.value = selectedDomain;
}

function applyFilters() {
    const country = filterCountry.value;
    const domain = filterDomain.value;
    const rankRange = filterRank.value;
    const searchTerm = searchInput.value.toLowerCase();
    filteredKeywords = allKeywords.filter(kw => {
        const countryMatch = !country || kw.country === country;
        const domainMatch = !domain || kw.domain === domain;
        const searchMatch = !searchTerm || kw.keyword.toLowerCase().includes(searchTerm);
        let rankMatch = true;
        if (rankRange && kw.current_rank) {
            const [min, max] = rankRange.split('-').map(Number);
            rankMatch = kw.current_rank >= min && kw.current_rank <= max;
        } else if (rankRange === 'unranked') {
            rankMatch = !kw.current_rank || kw.current_rank > 100;
        }
        return countryMatch && domainMatch && searchMatch && rankMatch;
    });
    sortKeywords();
    renderTable();
    updateResultsCount();
    updateFilteredKPIs();
    fetchTrendData();
    fetchDomainVisibilityData();
}

function updateFilteredKPIs() {
    const rankedKeywords = filteredKeywords.filter(kw => kw.current_rank);
    const avgRank = rankedKeywords.length > 0
        ? rankedKeywords.reduce((sum, kw) => sum + kw.current_rank, 0) / rankedKeywords.length
        : null;
    const top3Count = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank <= 3).length;
    const top10Count = filteredKeywords.filter(kw => kw.current_rank && kw.current_rank <= 10).length;
    avgRankEl.textContent = avgRank ? avgRank.toFixed(1) : '-';
    top3El.textContent = top3Count;
    top10El.textContent = top10Count;
    totalKeywordsEl.textContent = filteredKeywords.length;
    updateRankDistribution();
}

function updateRankDistribution() {
    const getCountInRange = (min, max) => filteredKeywords.filter(kw => kw.current_rank && kw.current_rank >= min && kw.current_rank <= max).length;
    document.getElementById('dist-1-3').textContent = getCountInRange(1, 3);
    document.getElementById('dist-4-10').textContent = getCountInRange(4, 10);
    document.getElementById('dist-11-20').textContent = getCountInRange(11, 20);
    document.getElementById('dist-21-50').textContent = getCountInRange(21, 50);
    document.getElementById('dist-51-100').textContent = getCountInRange(51, 100);
    document.getElementById('dist-unranked').textContent = filteredKeywords.filter(kw => !kw.current_rank || kw.current_rank > 100).length;
}

// --- Charting ---
async function fetchTrendData() {
    const days = parseInt(trendPeriodSelect.value);
    const keywordIds = filteredKeywords.map(kw => kw.id);
    if (keywordIds.length === 0) {
        renderTrendChart([], []);
        return;
    }
    try {
        const res = await fetch('/api/history/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: keywordIds, days })
        });
        if (!res.ok) throw new Error('Failed to fetch bulk history');
        const historiesById = await res.json();
        const allHistories = Object.values(historiesById);
        const dateMap = new Map();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        allHistories.flat().forEach(entry => {
            const date = new Date(entry.checked_at);
            if (date >= cutoffDate) {
                const dateKey = date.toISOString().split('T')[0];
                if (!dateMap.has(dateKey)) dateMap.set(dateKey, []);
                dateMap.get(dateKey).push(entry.rank);
            }
        });
        const sortedDates = Array.from(dateMap.keys()).sort((a, b) => new Date(a) - new Date(b));
        const avgRanks = sortedDates.map(date => {
            const ranks = dateMap.get(date).filter(r => r !== null);
            return ranks.length > 0 ? ranks.reduce((sum, r) => sum + r, 0) / ranks.length : null;
        });
        renderTrendChart(sortedDates, avgRanks);
    } catch (error) {
        console.error('Error fetching trend data:', error);
        renderTrendChart([], []);
    }
}

function renderTrendChart(dates, avgRanks) {
    if (trendChart) trendChart.destroy();
    if (dates.length === 0) {
        trendChartCanvas.classList.add('hidden');
        trendChartEmpty.classList.remove('hidden');
        return;
    }
    trendChartCanvas.classList.remove('hidden');
    trendChartEmpty.classList.add('hidden');
    const labels = dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    trendChart = new Chart(trendChartCanvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Average Position',
                data: avgRanks,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: context => {
                    const { ctx, chartArea } = context.chart;
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
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { reverse: true, title: { display: true, text: 'Average Rank', font: { weight: 'bold' } }, },
                x: { grid: { display: false }, }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: context => `Avg Position: ${context.parsed.y.toFixed(1)}` }
                }
            }
        }
    });
}

async function fetchDomainVisibilityData() {
    const container = document.getElementById('visibility-trends-container');
    if (!container) return;
    container.innerHTML = '<div class="text-center p-8 text-slate-400">Loading domain visibility...</div>';
    try {
        const domainCountryPairs = [...new Map(filteredKeywords.map(kw => [`${kw.domain}|${kw.country}`, { domain: kw.domain, country: kw.country }])).values()];
        if (domainCountryPairs.length === 0) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = '';
        const visibilityPromises = domainCountryPairs.map(async ({ domain, country }) => {
            try {
                const res = await fetch(`/api/sistrix/visibility/${encodeURIComponent(domain)}?country=${encodeURIComponent(country)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        renderDomainVisibilityChart(domain, country, data, container);
                    }
                }
            } catch (err) {
                console.error(`Failed to fetch Sistrix data for ${domain} (${country}):`, err);
            }
        });
        await Promise.all(visibilityPromises);
        if (container.children.length === 0) {
            container.innerHTML = `<div class="p-8 text-center text-slate-400">No Sistrix data available for the selected filters.</div>`;
        }
    } catch (error) {
        console.error('Error fetching visibility data:', error);
        container.innerHTML = `<div class="p-8 text-center text-red-400">Failed to load domain visibility data.</div>`;
    }
}

function renderDomainVisibilityChart(domain, country, data, container) {
    const chartId = `visibility-chart-${domain.replace(/\./g, '-')}-${country}`;
    if (document.getElementById(chartId)) return;
    const chartDiv = document.createElement('div');
    chartDiv.className = 'bg-slate-800 border border-slate-700 rounded-xl p-6 mb-4';
    chartDiv.innerHTML = `
        <div class="flex justify-between items-center mb-4">
            <div>
                <h3 class="text-lg font-bold text-white">${domain} (${country})</h3>
                <p class="text-xs text-slate-400">Domain Visibility Index</p>
            </div>
            <div class="text-right">
                <p class="text-2xl font-bold text-purple-400">${data[data.length - 1].value.toFixed(2)}</p>
            </div>
        </div>
        <canvas id="${chartId}" height="80"></canvas>
    `;
    container.appendChild(chartDiv);
    const labels = data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    const values = data.map(d => parseFloat(d.value));
    const ctx = document.getElementById(chartId).getContext('2d');
    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Visibility Index',
                data: values,
                borderColor: 'rgb(168, 85, 247)',
                tension: 0.4,
                fill: true,
                backgroundColor: context => {
                    const { ctx, chartArea } = context.chart;
                    if (!chartArea) return null;
                    const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
                    gradient.addColorStop(0, 'rgba(168, 85, 247, 0)');
                    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.3)');
                    return gradient;
                },
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
            plugins: { legend: { display: false } }
        }
    });
    visibilityCharts[chartId] = chart;
}

// --- Table and Sorting ---
function sortKeywords() {
    const { column, direction } = currentSort;
    filteredKeywords.sort((a, b) => {
        let aVal = a[column];
        let bVal = b[column];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderTable() {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageKeywords = filteredKeywords.slice(start, end);
    keywordsTableBody.innerHTML = '';
    if (pageKeywords.length === 0) {
        keywordsTableBody.innerHTML = `<tr><td colspan="9" class="text-center p-12 text-slate-500">No keywords match your filters.</td></tr>`;
        updatePagination();
        return;
    }
    const fragment = document.createDocumentFragment();
    pageKeywords.forEach(kw => {
        const rankChange = kw.rank_change;
        let changeHtml = `<span class="text-slate-500">-</span>`;
        if (rankChange < 0) changeHtml = `<span class="text-green-500 font-semibold">▲ ${Math.abs(rankChange)}</span>`;
        else if (rankChange > 0) changeHtml = `<span class="text-red-500 font-semibold">▼ ${rankChange}</span>`;
        let rankClass = 'bg-slate-100 text-slate-700';
        if (kw.current_rank <= 3) rankClass = 'bg-green-100 text-green-700 font-bold';
        else if (kw.current_rank <= 10) rankClass = 'bg-blue-100 text-blue-700';
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-50';
        row.id = `kw-row-${kw.id}`;
        row.innerHTML = `
            <td class="p-3 text-center"><input type="checkbox" class="keyword-checkbox" data-id="${kw.id}"></td>
            <td class="p-3 font-medium">${kw.keyword}</td>
            <td class="p-3 text-center"><span class="px-2 py-1 text-xs rounded-full ${rankClass}">${kw.current_rank || '-'}</span></td>
            <td class="p-3 text-center text-sm">${changeHtml}</td>
            <td class="p-3 text-center text-sm text-slate-600">${kw.search_volume ? kw.search_volume.toLocaleString() : '-'}</td>
            <td class="p-3 text-sm text-slate-600">${kw.domain}</td>
            <td class="p-3 text-sm text-slate-600">${kw.country}</td>
            <td class="p-3 text-sm text-slate-500 truncate max-w-xs" title="${kw.target_url}">${kw.target_url}</td>
            <td class="p-3 text-center">
                <button class="view-btn text-blue-600 hover:underline text-sm" data-id="${kw.id}" data-keyword="${kw.keyword}">View</button>
                <button class="delete-btn text-red-600 hover:underline text-sm ml-2" data-id="${kw.id}">Delete</button>
            </td>
        `;
        fragment.appendChild(row);
    });
    keywordsTableBody.appendChild(fragment);
    updatePagination();
}

function updateResultsCount() {
    resultsCountEl.textContent = `${filteredKeywords.length} results`;
}

function updatePagination() {
    const total = filteredKeywords.length;
    const start = total > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const end = Math.min(currentPage * itemsPerPage, total);
    document.getElementById('showing-start').textContent = start;
    document.getElementById('showing-end').textContent = end;
    document.getElementById('showing-total').textContent = total;
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = end >= total;
}

// --- Modals and History Chart ---
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
    if (historyChart) historyChart.destroy();
    modalTitle.textContent = `Ranking History: "${keyword}"`;
    if (history.length === 0) {
        historyChartCanvas.classList.add('hidden');
        historyChartEmpty.classList.remove('hidden');
        return;
    }
    historyChartCanvas.classList.remove('hidden');
    historyChartEmpty.classList.add('hidden');
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
                tension: 0.3,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { reverse: true, min: 1, title: { display: true, text: 'SERP Position' } },
                x: { title: { display: true, text: 'Date' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function openHistoryModal(id, keyword) {
    historyModal.style.display = 'flex';
    historyModal.classList.add('is-open');
    renderHistoryChart([], keyword);
    fetchHistory(id).then(history => {
        renderHistoryChart(history, keyword);
    });
}

function closeHistoryModal() {
    historyModal.classList.remove('is-open');
    historyModal.style.display = 'none';
}

// --- CSV Export/Import ---
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
    let csvContent = "data:text/csv;charset=utf-8," +
        headers.join(",") + "\n" +
        rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `serp-rankings-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- CSV Modal handlers (FIX for missing closeCsvModalHandler) ---
function closeCsvModalHandler() {
    csvUploadModal.classList.add('hidden');
    // Optionally reset the modal state here if necessary
}
// CSV modal open/close listeners
if (closeCsvModal) closeCsvModal.addEventListener('click', closeCsvModalHandler);
if (cancelCsvUpload) cancelCsvUpload.addEventListener('click', closeCsvModalHandler);

// --- Event Listeners Setup ---
function setupEventListeners() {
    document.addEventListener('DOMContentLoaded', () => {
        fetchDashboardData();
        startWorkerProgressMonitoring();
    });
    document.addEventListener('visibilitychange', () => {
        document.hidden ? stopWorkerProgressMonitoring() : startWorkerProgressMonitoring();
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
            const lastCommaIndex = line.lastIndexOf(',');
            if (lastCommaIndex === -1) return null;
            const volumeStr = line.substring(lastCommaIndex + 1).trim();
            const search_volume = parseInt(volumeStr, 10);
            if (isNaN(search_volume)) return null;
            const rest = line.substring(0, lastCommaIndex).trim();
            const firstCommaIndex = rest.indexOf(',');
            if (firstCommaIndex === -1) return null;
            const keyword = rest.substring(0, firstCommaIndex).trim();
            let target_url = rest.substring(firstCommaIndex + 1).trim();
            if (!keyword || !target_url) return null;
            if (target_url.startsWith('"') && target_url.endsWith('"')) {
                target_url = target_url.slice(1, -1);
            }
            if (!target_url.startsWith('http')) {
                target_url = 'https://' + target_url;
            }
            return { keyword, target_url, search_volume };
        }).filter(Boolean);
        if (keywords.length === 0) {
            alert('Please enter keywords in the correct format: keyword, target_url, search_volume');
            return;
        }
        try {
            const res = await fetch('/api/keywords/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain, country, keywords })
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to add keywords');
            addKeywordsForm.reset();
            addKeywordsPanel.classList.add('hidden');
            fetchDashboardData();
            alert(`Successfully added ${keywords.length} keywords!`);
        } catch (error) {
            console.error('Error adding keywords:', error);
            alert(`Error: ${error.message}`);
        }
    });
    keywordsTableBody.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const id = button.dataset.id;
        if (button.classList.contains('view-btn')) {
            openHistoryModal(id, button.dataset.keyword);
        }
        if (button.classList.contains('delete-btn')) {
            if (!confirm('Are you sure you want to delete this keyword and all its history?')) return;
            try {
                const res = await fetch(`/api/keywords/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('Failed to delete keyword');
                document.getElementById(`kw-row-${id}`).remove();
                fetchDashboardData();
            } catch (error) {
                console.error('Error deleting keyword:', error);
                alert('Could not delete the keyword.');
            }
        }
    });
    [filterCountry, filterDomain, filterRank].forEach(el => {
        el.addEventListener('change', () => {
            currentPage = 1;
            applyFilters();
        });
    });
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            currentPage = 1;
            applyFilters();
        }, 300);
    });
    trendPeriodSelect.addEventListener('change', fetchTrendData);
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderTable();
        }
    });
    document.getElementById('next-page').addEventListener('click', () => {
        const total = filteredKeywords.length;
        if (currentPage * itemsPerPage < total) {
            currentPage++;
            renderTable();
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
            currentPage = 1;
            sortKeywords();
            renderTable();
        });
    });
    selectAllCheckbox.addEventListener('change', (e) => {
        keywordsTableBody.querySelectorAll('.keyword-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
    });
    exportBtn.addEventListener('click', exportToCSV);

    // CSV Modal open
    uploadCsvBtn.addEventListener('click', () => {
        csvUploadModal.classList.remove('hidden');
    });

    // Modal Closing Listeners
    closeModalBtn.addEventListener('click', closeHistoryModal);
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) closeHistoryModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (historyModal.classList.contains('is-open')) closeHistoryModal();
            if (!csvUploadModal.classList.contains('hidden')) closeCsvModalHandler();
        }
    });
}

setupEventListeners();