const fileInput = document.querySelector('#fileInput');
const dropZone = document.querySelector('#dropZone');
const selectedFile = document.querySelector('#selectedFile');
const filePreview = document.querySelector('#filePreview');
const fileName = document.querySelector('#fileName');
const fileSize = document.querySelector('#fileSize');
const removeFile = document.querySelector('#removeFile');
const analyzeButton = document.querySelector('#analyzeButton');
const emptyState = document.querySelector('#emptyState');
const loadingState = document.querySelector('#loadingState');
const resultState = document.querySelector('#resultState');
const newCheckButton = document.querySelector('#newCheckButton');
const workspaceSection = document.querySelector('#workspaceSection');
const newAttemptToggle = document.querySelector('#newAttemptToggle');
const assignmentTitle = document.querySelector('#assignmentTitle');
const attemptsGrid = document.querySelector('#attemptsGrid');
const attemptsCount = document.querySelector('#attemptsCount');
let currentFile = null;
let detectorPromise = null;
const API_BASE = 'https://checker-api-boj2.onrender.com';
const originalFetch = window.fetch.bind(window);

window.fetch = (url, options = {}) => {
  if (typeof url === 'string' && url.startsWith(API_BASE)) {
    options = { ...options, credentials: 'include' };
  }
  return originalFetch(url, options);
};
async function enforceStudentAccess() {
  try {
    const response = await fetch(`${API_BASE}/api/me`);
    const result = await response.json();
    if (!result.user) return window.location.replace('auth.html');
    if (result.user.role === 'teacher') return window.location.replace('teacher.html');
    document.querySelector('#roleLabel').textContent = 'Student';
    const initials = result.user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
    const avatar = document.querySelector('#avatarInitials');
    if (avatar) avatar.textContent = initials || 'S';
    loadAttempts();
  } catch (error) {
    window.location.replace('auth.html');
  }
}

enforceStudentAccess();
document.querySelector('#logoutButton')?.addEventListener('click', async () => {
  await fetch(`${API_BASE}/api/logout`, { method: 'POST' });
  window.location.replace('auth.html');
});

function attemptCardHtml(check) {
  const statusClass = check.status === 'Graded' ? 'status-graded' : 'status-checked';
  const gradeDisplay = check.teacher_grade === null || check.teacher_grade === undefined ? '—' : `${check.teacher_grade}/100`;
  const date = (check.created_at || '').slice(0, 10);
  return `<div class="dashboard-card attempt-card">
    <div class="attempt-card-top">
      <h3 class="attempt-title">${escapeHtml(check.title || check.file_name)}</h3>
      <span class="attempt-tag">Attempt ${check.attempt_number}</span>
    </div>
    <span class="attempt-meta">Submitted ${date}</span>
    <div class="attempt-scores">
      <div class="attempt-score-block"><span>Check result</span><strong>${check.score}%</strong></div>
      <div class="attempt-score-block"><span>Teacher grade</span><strong>${gradeDisplay}</strong></div>
    </div>
    <span class="status-pill ${statusClass}">${check.status}</span>
  </div>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function loadAttempts() {
  try {
    const response = await fetch(`${API_BASE}/api/checks`);
    const result = await response.json();
    if (!response.ok) return;
    const checks = result.checks || [];
    attemptsCount.textContent = `${checks.length} attempt${checks.length === 1 ? '' : 's'}`;
    const newCard = attemptsGrid.querySelector('.new-attempt-card');
    attemptsGrid.innerHTML = '';
    if (newCard) attemptsGrid.appendChild(newCard);
    if (!checks.length) {
      attemptsGrid.insertAdjacentHTML('beforeend', '<p class="empty-note">You have not submitted any attempts yet. Start your first one above.</p>');
      return;
    }
    checks.forEach((check) => attemptsGrid.insertAdjacentHTML('beforeend', attemptCardHtml(check)));
  } catch (error) { console.warn('Could not load your attempts.', error); }
}

newAttemptToggle?.addEventListener('click', () => {
  workspaceSection.hidden = !workspaceSection.hidden;
  if (!workspaceSection.hidden) workspaceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

const DETECTOR_MODEL = 'mujian2026/multilingual-ai-text-detector';
const TRANSFORMERS_MODULE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.0.1';

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  currentFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatSize(file.size);
  filePreview.style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
  selectedFile.hidden = false;
  analyzeButton.disabled = false;
  dropZone.classList.add('has-file');
}

function resetCheck() {
  currentFile = null;
  fileInput.value = '';
  assignmentTitle.value = '';
  selectedFile.hidden = true;
  analyzeButton.disabled = true;
  emptyState.hidden = false;
  loadingState.hidden = true;
  resultState.hidden = true;
  dropZone.classList.remove('has-file');
  document.querySelector('.loading-label').textContent = 'Reading your assignment...';
  document.querySelector('.loading-subtext').textContent = 'Looking for patterns and signals';
  emptyState.querySelector('h3').innerHTML = 'Your result<br><em>will land here.</em>';
  emptyState.querySelector('p').textContent = 'We’ll look at your submission for writing patterns, phrasing, and consistency before you submit it for grading.';
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function setLoading(label, detail) {
  document.querySelector('.loading-label').textContent = label;
  document.querySelector('.loading-subtext').textContent = detail;
}

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = import(TRANSFORMERS_MODULE).then(async ({ env, pipeline }) => {
      env.allowLocalModels = false;
      if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;
      return pipeline('text-classification', DETECTOR_MODEL, {
        dtype: 'q4',
        progress_callback: (progress) => {
          if (progress.status === 'progress' && Number.isFinite(progress.progress)) {
            setLoading('Preparing the free checker...', `${Math.round(progress.progress)}% downloaded — only needed the first time`);
          }
        },
      });
    }).catch((error) => {
      detectorPromise = null;
      throw error;
    });
  }
  return detectorPromise;
}

function splitText(text, maxLength = 1200) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let start = 0; start < normalized.length && chunks.length < 8; start += maxLength) {
    chunks.push(normalized.slice(start, start + maxLength));
  }
  return chunks;
}

function aiProbability(output) {
  const candidates = Array.isArray(output?.[0]) ? output[0] : output;
  if (!Array.isArray(candidates) || !candidates.length) throw new Error('The checker returned no result.');
  const aiResult = candidates.find((item) => /(^|[_-])ai($|[_-])|generated/i.test(item.label) || item.label === 'LABEL_1');
  if (aiResult) return Number(aiResult.score);
  const top = candidates[0];
  const isHuman = /human/i.test(top.label) || top.label === 'LABEL_0';
  return isHuman ? 1 - Number(top.score) : Number(top.score);
}

async function detectAI(text) {
  const chunks = splitText(text);
  if (!chunks.length) throw new Error('No text was available for the check.');
  const detector = await getDetector();
  let weightedScore = 0;
  let totalWeight = 0;
  const chunkResults = [];
  for (let index = 0; index < chunks.length; index += 1) {
    setLoading('Checking your assignment...', `Part ${index + 1} of ${chunks.length}`);
    const output = await detector(chunks[index], { top_k: null, truncation: true });
    const chunkScore = Math.max(0, Math.min(100, Math.round(aiProbability(output) * 100)));
    const weight = chunks[index].length;
    weightedScore += (chunkScore / 100) * weight;
    totalWeight += weight;
    chunkResults.push({ text: chunks[index], score: chunkScore });
  }
  const overall = Math.max(0, Math.min(100, Math.round((weightedScore / totalWeight) * 100)));
  return { score: overall, chunks: chunkResults };
}

function snippetOf(text, maxLength = 140) {
  const trimmed = text.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength).trim()}…` : trimmed;
}

function feedbackFor(score, chunks) {
  let verdict;
  let summary;
  if (score < 25) {
    verdict = 'Looks like your own work';
    summary = 'The check found mostly consistent, natural writing patterns across the text. Keep your drafts, notes, and sources as evidence of your process in case it is ever requested.';
  } else if (score < 50) {
    verdict = 'Mostly consistent, a few flags';
    summary = 'Most of the text reads as your own writing, but a few passages resemble common AI phrasing. Reread the flagged fragments below and rewrite them in your own words if they don\u2019t reflect how you actually wrote them.';
  } else if (score < 75) {
    verdict = 'Mixed signals';
    summary = 'A significant share of the text resembles common AI-generated patterns: generic transitions, overly uniform sentence structure, or a lack of concrete personal detail. Review the flagged fragments, add specific examples, and rewrite generic phrasing before you submit.';
  } else {
    verdict = 'Review recommended';
    summary = 'Most of the text closely resembles AI-generated patterns. This is only a screening signal, not proof — but it\u2019s worth rewriting the flagged sections in your own voice, with your own examples, before submitting.';
  }

  const flagged = chunks
    .map((chunk, index) => ({ ...chunk, index }))
    .filter((chunk) => chunk.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const items = [];
  items.push({
    icon: score < 25 ? 'mint' : score < 75 ? 'yellow' : 'coral',
    symbol: score < 25 ? '✓' : score < 75 ? '↗' : '✦',
    title: verdict,
    detail: summary,
  });

  if (flagged.length && chunks.length > 1) {
    flagged.forEach((chunk) => {
      items.push({
        icon: chunk.score >= 75 ? 'coral' : 'yellow',
        symbol: '✦',
        title: `Fragment ${chunk.index + 1} of ${chunks.length} — ${chunk.score}% resembles AI patterns`,
        detail: `“${snippetOf(chunk.text)}”`,
      });
    });
  } else if (!flagged.length && chunks.length > 1) {
    items.push({
      icon: 'mint',
      symbol: '✓',
      title: 'No single fragment stood out',
      detail: 'No individual part of the text scored high enough on its own to flag specifically.',
    });
  }

  items.push({
    icon: 'mint',
    symbol: '✓',
    title: 'This is a screening signal, not a verdict',
    detail: 'It is not a forensic test and must not be used alone as proof of authorship. Your teacher reviews the attempt and assigns the final grade.',
  });

  return { verdict, summary, items };
}

function renderFeedbackList(items) {
  const list = document.querySelector('#feedbackList');
  if (!list) return;
  list.innerHTML = items.map((item) => `
    <div class="feedback-item">
      <span class="feedback-icon ${item.icon}">${item.symbol}</span>
      <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div>
      <span class="feedback-chevron">›</span>
    </div>`).join('');
}

function showAnalysisError(message) {
  loadingState.hidden = true;
  resultState.hidden = true;
  emptyState.hidden = false;
  emptyState.querySelector('h3').innerHTML = 'We could not<br><em>finish this check.</em>';
  emptyState.querySelector('p').textContent = message;
  analyzeButton.disabled = false;
}

fileInput.addEventListener('change', (event) => setFile(event.target.files[0]));
['dragenter', 'dragover'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
}));
dropZone.addEventListener('drop', (event) => setFile(event.dataTransfer.files[0]));
removeFile.addEventListener('click', resetCheck);
newCheckButton.addEventListener('click', resetCheck);

analyzeButton.addEventListener('click', async () => {
  if (!currentFile) return;
  const title = assignmentTitle.value.trim();
  if (!title) {
    assignmentTitle.focus();
    return showAnalysisError('Enter the assignment or practical work title before checking.');
  }
  emptyState.hidden = true;
  resultState.hidden = true;
  loadingState.hidden = false;
  analyzeButton.disabled = true;
  try {
    setLoading('Reading your assignment...', 'Free OCR: English, Russian and Kazakh');
    const imageData = await readAsDataURL(currentFile);
    const ocrResponse = await fetch(`${API_BASE}/api/ocr`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image_data: imageData }),
    });
    const ocrResult = await ocrResponse.json();
    if (!ocrResponse.ok) throw new Error(ocrResult.error || 'This image could not be read.');

    const { score, chunks } = await detectAI(ocrResult.text);
    const feedback = feedbackFor(score, chunks);
    document.querySelector('#scoreValue').textContent = score;
    document.querySelector('#scoreBar').style.width = `${score}%`;
    document.querySelector('#verdictText').textContent = feedback.verdict;
    document.querySelector('#resultSummary').textContent = feedback.summary;
    renderFeedbackList(feedback.items);
    loadingState.hidden = true;
    resultState.hidden = false;
    analyzeButton.disabled = false;

    const saveResponse = await fetch(`${API_BASE}/api/checks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, file_name: currentFile.name, score, feedback: feedback.summary }),
    });
    if (!saveResponse.ok) {
      console.warn('The result was shown but could not be saved to your profile.');
    } else {
      loadAttempts();
    }
  } catch (error) {
    console.error('Check failed.', error);
    showAnalysisError(error.message || 'Check your connection and try again.');
  }
});
