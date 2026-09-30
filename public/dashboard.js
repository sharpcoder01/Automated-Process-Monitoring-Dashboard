const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const sentimentColors = { positive: '#23634e', neutral: '#d59f3c', negative: '#d96f59' };
const FEED_PAGE_SIZE = 10;
let recentTweets = [];
let feedPage = 1;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const setHealth = (name, isUp, detail) => {
  document.getElementById(`${name}-state`).textContent = detail;
  document.getElementById(`${name}-light`).className = `health-light ${isUp ? 'is-up' : 'is-down'}`;
};

function renderActivity(rows) {
  const chart = document.getElementById('activity-chart');
  const counts = new Map(rows.map((row) => [row.date, row.count]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      date,
      key,
      count: counts.get(key) || 0,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date),
    };
  });
  const left = 42;
  const right = 738;
  const top = 18;
  const bottom = 182;
  const maxCount = Math.max(4, ...days.map((day) => day.count));
  const points = days.map((day, index) => ({
    ...day,
    x: left + (right - left) * (index / (days.length - 1)),
    y: bottom - ((bottom - top) * day.count) / maxCount,
  }));
  const linePath = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  const areaPath = `${linePath} L ${right} ${bottom} L ${left} ${bottom} Z`;
  const grid = [0, 1, 2, 3].map((step) => {
    const y = top + ((bottom - top) * step) / 3;
    const label = Math.round(maxCount - (maxCount * step) / 3);
    return `<line class="chart-gridline" x1="${left}" y1="${y}" x2="${right}" y2="${y}"/><text class="chart-axis-label" x="2" y="${y + 3}">${label}</text>`;
  }).join('');
  const labels = points.map((point) => `<text class="chart-axis-label" text-anchor="middle" x="${point.x}" y="211">${point.label}</text>`).join('');
  const markers = points.map((point) => `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="3.5"><title>${point.count} posts</title></circle>`).join('');

  chart.innerHTML = `<defs><linearGradient id="activity-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#77ad8f" stop-opacity=".28"/><stop offset="100%" stop-color="#77ad8f" stop-opacity=".015"/></linearGradient></defs>${grid}<path class="chart-area" d="${areaPath}"/><path class="chart-line" d="${linePath}"/>${markers}${labels}`;
  document.getElementById('activity-total').textContent = `${numberFormat.format(days.reduce((sum, day) => sum + day.count, 0))} posts this week`;
}

function renderSentiment(rows, total) {
  const values = { positive: 0, neutral: 0, negative: 0 };
  rows.forEach(({ name, count }) => { if (name in values) values[name] = count; });
  const positiveEnd = total ? (values.positive / total) * 100 : 0;
  const neutralEnd = total ? positiveEnd + (values.neutral / total) * 100 : 0;
  const ring = document.getElementById('sentiment-ring');
  ring.style.background = total
    ? `conic-gradient(${sentimentColors.positive} 0 ${positiveEnd}%, ${sentimentColors.neutral} ${positiveEnd}% ${neutralEnd}%, ${sentimentColors.negative} ${neutralEnd}% 100%)`
    : 'conic-gradient(#dfe7e1 0 100%)';
  ring.setAttribute('aria-label', `Sentiment distribution: ${values.positive} positive, ${values.neutral} neutral, ${values.negative} negative`);
  document.getElementById('sentiment-total').textContent = numberFormat.format(total);
  document.getElementById('positive-rate').textContent = `${percentFormat.format(total ? (values.positive / total) * 100 : 0)}%`;
  document.getElementById('positive-detail').textContent = `${numberFormat.format(values.positive)} positive posts`;
  document.getElementById('sentiment-legend').innerHTML = Object.entries(values).map(([name, count]) => `
    <div class="sentiment-row"><i class="sentiment-swatch swatch-${name}"></i><span>${name}</span><strong>${numberFormat.format(count)}</strong></div>
  `).join('');
}

function renderPlatforms(rows, total) {
  const platforms = document.getElementById('platform-list');
  if (!rows.length) {
    platforms.innerHTML = '<p class="platform-row">No platform activity yet.</p>';
    return;
  }
  platforms.innerHTML = rows.map(({ name, count }) => `
    <div class="platform-row"><span>${escapeHtml(name)}</span><div class="bar-track"><span class="bar-fill" style="width:${total ? (count / total) * 100 : 0}%"></span></div><strong>${numberFormat.format(count)}</strong></div>
  `).join('');
}

function tweetEngagement(tweet) {
  return (tweet.metrics?.likes || 0) + (tweet.metrics?.retweets || 0) + (tweet.metrics?.comments || 0);
}

function getFilteredTweets() {
  const query = document.getElementById('feed-search').value.trim().toLocaleLowerCase();
  const platform = document.getElementById('platform-filter').value;
  const sentiment = document.getElementById('sentiment-filter').value;
  const sort = document.getElementById('feed-sort').value;

  return recentTweets
    .filter((tweet) => {
      const matchesQuery = !query || `${tweet.user || ''} ${tweet.content || ''}`.toLocaleLowerCase().includes(query);
      return matchesQuery
        && (platform === 'all' || tweet.platform === platform)
        && (sentiment === 'all' || tweet.sentiment === sentiment);
    })
    .sort((left, right) => sort === 'engagement'
      ? tweetEngagement(right) - tweetEngagement(left)
      : (Date.parse(right.timestamp) || 0) - (Date.parse(left.timestamp) || 0));
}

function renderFilteredTweets() {
  const rows = document.getElementById('recent-rows');
  const filteredTweets = getFilteredTweets();
  const pageCount = Math.max(1, Math.ceil(filteredTweets.length / FEED_PAGE_SIZE));
  feedPage = Math.min(feedPage, pageCount);
  const firstIndex = (feedPage - 1) * FEED_PAGE_SIZE;
  const pageTweets = filteredTweets.slice(firstIndex, firstIndex + FEED_PAGE_SIZE);
  const endIndex = firstIndex + pageTweets.length;

  document.getElementById('feed-count').textContent = `LATEST ${recentTweets.length}`;
  document.getElementById('feed-results').textContent = filteredTweets.length
    ? `Showing ${numberFormat.format(firstIndex + 1)}-${numberFormat.format(endIndex)} of ${numberFormat.format(filteredTweets.length)} matching posts`
    : 'No posts match these filters';
  document.getElementById('feed-page-label').textContent = `Page ${feedPage} of ${pageCount}`;
  document.getElementById('feed-previous').disabled = feedPage <= 1;
  document.getElementById('feed-next').disabled = feedPage >= pageCount;
  document.getElementById('export-csv').disabled = filteredTweets.length === 0;

  if (!filteredTweets.length) {
    rows.innerHTML = `<tr><td class="empty-state" colspan="6">${recentTweets.length ? 'Try clearing or changing the feed filters.' : 'No posts have been ingested yet.'}</td></tr>`;
    return;
  }

  rows.innerHTML = pageTweets.map((tweet) => {
    const engagement = tweetEngagement(tweet);
    const sentiment = ['positive', 'neutral', 'negative'].includes(tweet.sentiment) ? tweet.sentiment : 'neutral';
    const received = tweet.timestamp ? new Date(tweet.timestamp) : null;
    const time = received && !Number.isNaN(received.valueOf())
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(received)
      : 'Unknown';
    return `<tr>
      <td class="post-cell"><span class="post-user">@${escapeHtml((tweet.user || 'unknown').replace(/^@+/, ''))}</span><span class="post-content">${escapeHtml(tweet.content || '')}</span></td>
      <td class="platform-cell">${escapeHtml(tweet.platform || 'unknown')}</td>
      <td><span class="sentiment-tag ${sentiment}">${sentiment}</span></td>
      <td class="engagement-cell">${numberFormat.format(engagement)}</td>
      <td class="time-cell">${time}</td>
      <td class="action-cell"><button class="remove-process-button" type="button" data-process-id="${escapeHtml(tweet._id)}" data-process-user="${escapeHtml(tweet.user || 'unknown')}" aria-label="Remove process for @${escapeHtml((tweet.user || 'unknown').replace(/^@+/, ''))}">Remove</button></td>
    </tr>`;
  }).join('');
}

function renderTweets(tweets) {
  recentTweets = tweets;
  renderFilteredTweets();
}

function exportFilteredTweets() {
  const filteredTweets = getFilteredTweets();
  const columns = ['Account', 'Post', 'Platform', 'Sentiment', 'Likes', 'Reposts', 'Comments', 'Interactions', 'Received'];
  const csvCell = (value) => {
    let text = String(value ?? '');
    if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const lines = [columns, ...filteredTweets.map((tweet) => [
    tweet.user,
    tweet.content,
    tweet.platform,
    tweet.sentiment,
    tweet.metrics?.likes || 0,
    tweet.metrics?.retweets || 0,
    tweet.metrics?.comments || 0,
    tweetEngagement(tweet),
    tweet.timestamp ? new Date(tweet.timestamp).toISOString() : '',
  ])].map((row) => row.map(csvCell).join(','));
  const file = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pulseflow-posts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function resetFeedFilters() {
  document.getElementById('feed-search').value = '';
  document.getElementById('platform-filter').value = 'all';
  document.getElementById('sentiment-filter').value = 'all';
  document.getElementById('feed-sort').value = 'newest';
  feedPage = 1;
  renderFilteredTweets();
}

async function loadDashboard() {
  const button = document.getElementById('refresh-button');
  const errorBanner = document.getElementById('error-banner');
  button.disabled = true;
  errorBanner.hidden = true;

  try {
    const [dashboardResponse, healthResponse] = await Promise.all([
      fetch('/api/dashboard', { cache: 'no-store' }),
      fetch('/healthz', { cache: 'no-store' }),
    ]);
    if (!dashboardResponse.ok) throw new Error(`Dashboard request failed (${dashboardResponse.status})`);

    const [dashboard, health] = await Promise.all([
      dashboardResponse.json(),
      healthResponse.ok ? healthResponse.json() : Promise.resolve({ dbStatus: 'disconnected' }),
    ]);
    const summary = dashboard.summary;
    const total = summary.tweets || 0;

    document.getElementById('tweet-total').textContent = numberFormat.format(total);
    document.getElementById('engagement-total').textContent = numberFormat.format(summary.totalEngagement || 0);
    document.getElementById('average-rate').textContent = numberFormat.format(Math.round(summary.averageEngagementPerPost || 0));
    renderSentiment(dashboard.sentiment || [], total);
    renderActivity(dashboard.activity || []);
    renderPlatforms(dashboard.platforms || [], total);
    renderTweets(dashboard.recentTweets || []);
    setHealth('api', true, 'Online');
    setHealth('db', health.dbStatus === 'connected', health.dbStatus === 'connected' ? 'Connected' : 'Unavailable');
    document.getElementById('last-updated').textContent = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(dashboard.generatedAt));
  } catch (error) {
    setHealth('api', false, 'Unavailable');
    document.getElementById('error-banner').textContent = `${error.message}. Check that the API and MongoDB are running, then refresh.`;
    document.getElementById('error-banner').hidden = false;
  } finally {
    button.disabled = false;
  }
}

async function addProcess() {
  const button = document.getElementById('add-process-button');
  const status = document.getElementById('process-status');
  button.disabled = true;
  status.hidden = false;
  status.className = 'process-status';
  status.textContent = 'Adding process...';

  try {
    const response = await fetch('/api/processes', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    await loadDashboard();
    status.textContent = `Process added for @${(result.process.user || 'unknown').replace(/^@+/, '')}. Dashboard updated.`;
  } catch (error) {
    status.className = 'process-status is-error';
    status.textContent = `${error.message}. Try again after checking the API connection.`;
  } finally {
    button.disabled = false;
  }
}

async function removeProcess(button) {
  const processId = button.dataset.processId;
  const user = (button.dataset.processUser || 'unknown').replace(/^@+/, '');
  if (!processId || !window.confirm(`Remove the process for @${user}? This permanently deletes its post and engagement data.`)) {
    return;
  }

  const status = document.getElementById('process-status');
  button.disabled = true;
  status.hidden = false;
  status.className = 'process-status';
  status.textContent = `Removing process for @${user}...`;

  try {
    const response = await fetch(`/api/processes/${encodeURIComponent(processId)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    await loadDashboard();
    status.textContent = `Process for @${user} removed. Dashboard updated.`;
  } catch (error) {
    status.className = 'process-status is-error';
    status.textContent = `${error.message}. The process was not removed.`;
    button.disabled = false;
  }
}

document.getElementById('recent-rows').addEventListener('click', (event) => {
  const button = event.target.closest('.remove-process-button');
  if (button) removeProcess(button);
});
document.getElementById('add-process-button').addEventListener('click', addProcess);
document.getElementById('refresh-button').addEventListener('click', loadDashboard);
document.getElementById('feed-search').addEventListener('input', () => { feedPage = 1; renderFilteredTweets(); });
document.getElementById('platform-filter').addEventListener('change', () => { feedPage = 1; renderFilteredTweets(); });
document.getElementById('sentiment-filter').addEventListener('change', () => { feedPage = 1; renderFilteredTweets(); });
document.getElementById('feed-sort').addEventListener('change', () => { feedPage = 1; renderFilteredTweets(); });
document.getElementById('clear-filters').addEventListener('click', resetFeedFilters);
document.getElementById('export-csv').addEventListener('click', exportFilteredTweets);
document.getElementById('feed-previous').addEventListener('click', () => { feedPage = Math.max(1, feedPage - 1); renderFilteredTweets(); });
document.getElementById('feed-next').addEventListener('click', () => { feedPage += 1; renderFilteredTweets(); });
loadDashboard();
window.setInterval(loadDashboard, 15000);