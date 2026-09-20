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
let previewUrl = null;

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1280;
const TARGET_UPLOAD_BYTES = 2.5 * 1024 * 1024;

const escapeHtml = (value) => String(value).replace(/[&<>\"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
}[char]));

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

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  previewWrap.classList.add('hidden');
  uploadEmpty.classList.remove('hidden');
  analyzeButton.disabled = true;
};

const loadFile = (file) => {
  if (!file) return;

  if (!ACCEPTED_TYPES.includes(file.type)) {
    showToast('Please choose a JPG, PNG, or WebP image.');
    return;
  }

  if (file.size > MAX_SOURCE_BYTES) {
    showToast('Please use an image smaller than 12 MB.');
    return;
  }

  selectedFile = file;

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;

  previewWrap.classList.remove('hidden');
  uploadEmpty.classList.add('hidden');
  analyzeButton.disabled = false;
};

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Could not compress the image.'));
  }, type, quality);
});

async function compressImage(file) {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = sourceUrl;
    await image.decode();

    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Your browser could not process the image.');

    // JPEG has no transparency. A white background avoids dark transparent areas.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    let quality = 0.84;
    let blob = await canvasToBlob(canvas, 'image/jpeg', quality);

    while (blob.size > TARGET_UPLOAD_BYTES && quality > 0.52) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    }

    if (blob.size > TARGET_UPLOAD_BYTES) {
      throw new Error('The image is still too large after compression. Please choose a smaller photo.');
    }

    return {
      imageBase64: await blobToBase64(blob),
      mimeType: 'image/jpeg'
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

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
    const value = key === 'vitamins' || key === 'minerals'
      ? n.amount
      : `${Math.round(n.grams * 10) / 10}${unit}`;

    return `<div class="nutrient">
      <div class="nutrient-top"><span class="nutrient-name">${escapeHtml(label)}</span><span class="nutrient-value">${escapeHtml(value)}</span></div>
      <div class="bar" aria-label="${label} quality score ${n.score} out of 100"><div class="bar-fill" style="width:${n.score}%"></div></div>
    </div>`;
  }).join('');

  const fillList = (id, items, fallback) => {
    $(id).innerHTML = (items?.length ? items : [fallback])
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join('');
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
    analyzeLabel.textContent = 'Gemma is analyzing…';

    const payload = await compressImage(selectedFile);

    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(`Server returned ${response.status}. Please try again.`);
    }

    if (!response.ok) {
      throw new Error(data.detail || data.error || 'Analysis failed.');
    }

    render(data);
  } catch (err) {
    console.error(err);
    showToast(err.message.includes('fetch')
      ? 'Could not reach the app server.'
      : `Analysis failed: ${err.message}`);
  } finally {
    analyzeButton.disabled = !selectedFile;
    spinner.classList.add('hidden');
    analyzeLabel.textContent = 'Analyze my meal';
  }
}

chooseButton.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

dropZone.addEventListener('click', () => {
  if (!selectedFile) fileInput.click();
});

dropZone.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !selectedFile) fileInput.click();
});

fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
removeButton.addEventListener('click', (e) => {
  e.stopPropagation();
  resetImage();
});
analyzeButton.addEventListener('click', analyze);

['dragenter', 'dragover'].forEach((evt) => dropZone.addEventListener(evt, (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
}));

['dragleave', 'drop'].forEach((evt) => dropZone.addEventListener(evt, (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
}));

dropZone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
