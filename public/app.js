const $ = (id) => document.getElementById(id);

const fileInput = $('fileInput');
const dropZone = $('dropZone');
const chooseButton = $('chooseButton');
const uploadEmpty = $('uploadEmpty');
const previewWrap = $('previewWrap');
const preview = $('preview');
const removeButton = $('removeButton');
const analyzeButton = $('analyzeButton');
const analyzeLabel = $('analyzeLabel');
const spinner = $('spinner');
const emptyResults = $('emptyResults');
const results = $('results');
const toast = $('toast');
let selectedFile = null;

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 4500);
};

const resetImage = () => {
  selectedFile = null;
  fileInput.value = '';
  preview.src = '';
  previewWrap.classList.add('hidden');
  uploadEmpty.classList.remove('hidden');
  analyzeButton.disabled = true;
};

const loadFile = (file) => {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('Please choose a JPG, PNG, or WebP image.');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast('Please use an image smaller than 12 MB.');
    return;
  }
  selectedFile = file;
  const url = URL.createObjectURL(file);
  preview.src = url;
  previewWrap.classList.remove('hidden');
  uploadEmpty.classList.add('hidden');
  analyzeButton.disabled = false;
};

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const nutrients = [
  ['protein', 'Protein', 'g'],
  ['carbs', 'Carbs', 'g'],
  ['fat', 'Fat', 'g'],
  ['fiber', 'Fiber', 'g'],
  ['vitamins', 'Vitamins', ''],
  ['minerals', 'Minerals', '']
];

function render(data) {
  $('foodName').textContent = data.food_name;
  $('summary').textContent = data.summary;
  $('healthScore').textContent = data.health_score;
  $('grade').textContent = data.grade;
  $('calories').textContent = data.calories;
  $('serving').textContent = data.serving_estimate;
  $('confidence').textContent = data.confidence;

  const scoreBadge = $('scoreBadge');
  scoreBadge.className = `score-badge grade-${data.grade.toLowerCase()}`;

  $('nutrientGrid').innerHTML = nutrients.map(([key, label, unit]) => {
    const n = data.nutrients[key];
    const value = key === 'vitamins' || key === 'minerals' ? n.amount : `${Math.round(n.grams * 10) / 10}${unit}`;
    return `<div class="nutrient">
      <div class="nutrient-top"><span class="nutrient-name">${label}</span><span class="nutrient-value">${value}</span></div>
      <div class="bar" aria-label="${label} quality score ${n.score} out of 100"><div class="bar-fill" style="width:${n.score}%"></div></div>
    </div>`;
  }).join('');

  const fillList = (id, items, fallback) => {
    $(id).innerHTML = (items?.length ? items : [fallback]).map(item => `<li>${item}</li>`).join('');
  };
  fillList('positives', data.positives, 'Balanced elements were not confidently identified.');
  fillList('watchOuts', data.watch_outs, 'No major concerns confidently identified from the image.');

  emptyResults.classList.add('hidden');
  results.classList.remove('hidden');
}

async function analyze() {
  if (!selectedFile) return;
  try {
    analyzeButton.disabled = true;
    spinner.classList.remove('hidden');
    analyzeLabel.textContent = 'Gemma 3 is analyzing…';
    const imageBase64 = await toBase64(selectedFile);

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType: selectedFile.type })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || 'Analysis failed.');
    render(data);
  } catch (err) {
    console.error(err);
    showToast(err.message.includes('fetch')
      ? 'Could not reach the local app server.'
      : `Analysis failed: ${err.message}`);
  } finally {
    analyzeButton.disabled = !selectedFile;
    spinner.classList.add('hidden');
    analyzeLabel.textContent = 'Analyze my meal';
  }
}

chooseButton.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
dropZone.addEventListener('click', () => { if (!selectedFile) fileInput.click(); });
dropZone.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !selectedFile) fileInput.click(); });
fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
removeButton.addEventListener('click', (e) => { e.stopPropagation(); resetImage(); });
analyzeButton.addEventListener('click', analyze);

['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
}));
dropZone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
