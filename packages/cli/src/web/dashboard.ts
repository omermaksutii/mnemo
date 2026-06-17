/* Single-page dashboard served by `mnemo serve`. Self-contained: no build
 * step, no external assets, no network. Talks to the local JSON API. */
export const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mnemo</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 ui-monospace, "SF Mono", Menlo, monospace; background: #0e1116; color: #d7dde5; }
  header { padding: 18px 24px; border-bottom: 1px solid #1d232c; display: flex; align-items: baseline; gap: 16px; }
  h1 { margin: 0; font-size: 18px; letter-spacing: 1px; color: #7aa2f7; }
  .stats { color: #5c6470; font-size: 12px; display: flex; gap: 14px; flex-wrap: wrap; }
  .stats b { color: #9aa5b1; font-weight: 600; }
  main { max-width: 920px; margin: 0 auto; padding: 24px; }
  .bar { display: flex; gap: 8px; margin-bottom: 8px; }
  input, select, textarea, button { font: inherit; background: #161b22; color: #d7dde5; border: 1px solid #29313c; border-radius: 6px; padding: 8px 10px; }
  input:focus, textarea:focus { outline: none; border-color: #7aa2f7; }
  #q { flex: 1; }
  button { cursor: pointer; background: #1f6feb; border-color: #1f6feb; color: #fff; }
  button.ghost { background: #161b22; border-color: #29313c; color: #9aa5b1; }
  .hit { border: 1px solid #1d232c; border-radius: 8px; padding: 12px 14px; margin: 10px 0; background: #11151b; }
  .hit .meta { display: flex; gap: 10px; align-items: center; font-size: 12px; color: #5c6470; margin-bottom: 6px; }
  .badge { padding: 1px 7px; border-radius: 99px; font-size: 11px; }
  .badge.project { background: #14301f; color: #56d364; }
  .badge.global { background: #2d2238; color: #bc8cff; }
  .badge.team { background: #14283a; color: #58a6ff; }
  .score { color: #7aa2f7; }
  .tag { color: #5c6470; }
  .content { white-space: pre-wrap; }
  .del { margin-left: auto; color: #f85149; background: none; border: none; cursor: pointer; font-size: 12px; }
  .add { margin-top: 24px; border-top: 1px solid #1d232c; padding-top: 16px; }
  .add textarea { width: 100%; min-height: 64px; resize: vertical; }
  .add .row { display: flex; gap: 8px; margin-top: 8px; }
  .empty { color: #5c6470; padding: 32px; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>mnemo</h1>
  <div class="stats" id="stats"></div>
</header>
<main>
  <div class="bar">
    <input id="q" placeholder="Semantic search…  (empty = recent)" autofocus />
    <select id="scope">
      <option value="all">all</option>
      <option value="project">project</option>
      <option value="global">global</option>
      <option value="team">team</option>
    </select>
    <button id="go">search</button>
  </div>
  <div id="results"></div>

  <div class="add">
    <textarea id="newContent" placeholder="Remember something new…"></textarea>
    <div class="row">
      <select id="newScope">
        <option value="project">project</option>
        <option value="global">global</option>
      </select>
      <input id="newTags" placeholder="tags, comma, separated" style="flex:1" />
      <button id="save">remember</button>
    </div>
  </div>
</main>
<script>
const $ = s => document.querySelector(s);
const esc = s => (s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

async function loadStats() {
  const s = await fetch('/api/stats').then(r => r.json());
  $('#stats').innerHTML =
    '<span><b>' + s.totalMemories + '</b> memories</span>' +
    '<span>project <b>' + s.byScope.project + '</b></span>' +
    '<span>global <b>' + s.byScope.global + '</b></span>' +
    '<span>team <b>' + s.byScope.team + '</b></span>' +
    '<span>dim <b>' + s.embeddingDimension + '</b></span>';
}

function hitCard(h, withScore) {
  const tags = (h.tags || []).map(t => '<span class="tag">#' + esc(t) + '</span>').join(' ');
  const scope = h.scope || 'project';
  return '<div class="hit">' +
    '<div class="meta">' +
      '<span class="badge ' + scope + '">' + scope + '</span>' +
      (withScore ? '<span class="score">' + h.score.toFixed(3) + '</span>' : '') +
      (h.channel ? '<span>' + esc(h.channel) + '</span>' : '') +
      tags +
      '<button class="del" data-id="' + h.id + '">forget</button>' +
    '</div>' +
    '<div class="content">' + esc(h.content) + '</div>' +
  '</div>';
}

async function search() {
  const q = $('#q').value.trim();
  const scope = $('#scope').value;
  let rows, withScore;
  if (q) {
    rows = await fetch('/api/recall?q=' + encodeURIComponent(q) + '&scope=' + scope).then(r => r.json());
    withScore = true;
  } else {
    rows = await fetch('/api/list?limit=50').then(r => r.json());
    withScore = false;
  }
  $('#results').innerHTML = rows.length
    ? rows.map(h => hitCard(h, withScore)).join('')
    : '<div class="empty">no memories</div>';
}

document.addEventListener('click', async e => {
  if (e.target.classList.contains('del')) {
    await fetch('/api/forget', { method: 'POST', body: JSON.stringify({ id: e.target.dataset.id }) });
    await search(); await loadStats();
  }
});
$('#go').onclick = search;
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
$('#save').onclick = async () => {
  const content = $('#newContent').value.trim();
  if (!content) return;
  const tags = $('#newTags').value.split(',').map(t => t.trim()).filter(Boolean);
  await fetch('/api/remember', { method: 'POST', body: JSON.stringify({ content, scope: $('#newScope').value, tags }) });
  $('#newContent').value = ''; $('#newTags').value = '';
  await search(); await loadStats();
};
loadStats(); search();
</script>
</body>
</html>`;
