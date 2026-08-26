
const video = document.querySelector('#video');
const canvas = document.querySelector('#canvas');
const context = canvas.getContext('2d');
const analysisCanvas = document.createElement('canvas');
const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
const sample = document.querySelector('#sample');
const status = document.querySelector('#status');
const metrics = document.querySelector('#metrics');
const startButton = document.querySelector('#start-camera');
const sampleButton = document.querySelector('#use-sample');
const resetButton = document.querySelector('#reset');
const saveButton = document.querySelector('#save');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointer = { x: 0.5, y: 0.5 };
let stream = null;
let cameraActive = false;
let lastSignal = { centerX: 0.5, centerY: 0.5, leftX: 0.28, rightX: 0.72, brightness: 0.5, contrast: 0.3 };

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function hsv(hue, saturation, value, alpha = 1) {
  const h = (((hue % 360) + 360) % 360) / 60;
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const match = value - chroma;
  const rgb = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0]
    : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma]
      : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  return `rgba(${Math.round((rgb[0] + match) * 255)}, ${Math.round((rgb[1] + match) * 255)}, ${Math.round((rgb[2] + match) * 255)}, ${alpha})`;
}

function wavelengthColor(wavelength, alpha = 1) {
  return hsv(275 - clamp((wavelength - 380) / 320) * 240, 0.88, 1, alpha);
}

function resize() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, canvas.clientWidth * ratio);
  canvas.height = Math.max(1, canvas.clientHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function analyzeFrame() {
  const width = 64;
  const height = 36;
  analysisCanvas.width = width;
  analysisCanvas.height = height;
  analysisContext.drawImage(video, 0, 0, width, height);
  const data = analysisContext.getImageData(0, 0, width, height).data;
  let total = 0;
  let weightedX = 0;
  let weightedY = 0;
  let leftWeight = 0;
  let rightWeight = 0;
  let leftX = 0;
  let rightX = 0;
  let contrast = 0;
  let previous = 0;
  for (let index = 0; index < data.length; index += 16) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const luminance = (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) / 255;
    const weight = 0.05 + luminance * luminance;
    total += weight;
    weightedX += x * weight;
    weightedY += y * weight;
    contrast += Math.abs(luminance - previous);
    previous = luminance;
    if (x < width / 2) {
      leftWeight += weight;
      leftX += x * weight;
    } else {
      rightWeight += weight;
      rightX += x * weight;
    }
  }
  return {
    centerX: clamp(weightedX / Math.max(total, 1) / width),
    centerY: clamp(weightedY / Math.max(total, 1) / height),
    leftX: clamp(leftX / Math.max(leftWeight, 1) / width),
    rightX: clamp(rightX / Math.max(rightWeight, 1) / width),
    brightness: clamp(total / 125),
    contrast: clamp(contrast / 90),
  };
}

function sampleSignal(time) {
  const speed = reducedMotion ? 0.00022 : 0.00065;
  return {
    centerX: pointer.x * 0.55 + (0.5 + Math.sin(time * speed) * 0.24) * 0.45,
    centerY: pointer.y * 0.55 + (0.5 + Math.cos(time * speed * 1.3) * 0.2) * 0.45,
    leftX: clamp(0.25 + Math.sin(time * speed) * 0.16 + pointer.x * 0.12),
    rightX: clamp(0.75 + Math.cos(time * speed * 1.1) * 0.16 - (pointer.x - 0.5) * 0.12),
    brightness: 0.45 + Math.sin(time * speed * 2) * 0.3,
    contrast: 0.3 + Math.cos(time * speed) * 0.25,
  };
}

function signalNow(time) {
  if (cameraActive && video.readyState >= 2) {
    try {
      return analyzeFrame();
    } catch {
      return lastSignal;
    }
  }
  return sampleSignal(time);
}

function drawBackground(width, height, signal, time) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#09172d');
  gradient.addColorStop(0.5, hsv(185 + signal.centerX * 100, 0.68, 0.34));
  gradient.addColorStop(1, '#180b32');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 18; index += 1) {
    context.fillStyle = hsv(160 + index * 11, 0.7, 1, 0.28);
    context.beginPath();
    context.arc((index / 18) * width + Math.sin(time / 900 + index) * 22,
      height * (0.2 + (index * 0.13) % 0.65), 2 + index % 4, 0, Math.PI * 2);
    context.fill();
  }
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = clamp((event.clientX - rect.left) / rect.width);
  pointer.y = clamp((event.clientY - rect.top) / rect.height);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Camera needs HTTPS or localhost. Fallback remains available.';
    return;
  }
  status.textContent = 'Requesting camera permission…';
  try {
    stream?.getTracks().forEach((track) => track.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play();
    cameraActive = true;
    sample.hidden = true;
    status.textContent = 'Camera active. Frames stay local and are not uploaded.';
  } catch (error) {
    cameraActive = false;
    status.textContent = error.name === 'NotAllowedError'
      ? 'Permission was not granted. Pointer fallback remains available.'
      : 'Camera unavailable. Pointer fallback remains available.';
  }
}

function stopStream() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  cameraActive = false;
}

function useSample() {
  stopStream();
  sample.hidden = false;
  resetMode();
  status.textContent = 'Sample mode is ready. No camera permission is required.';
}

function savePng() {
  const link = document.createElement('a');
  link.download = `${LAB_MODE}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  status.textContent = 'PNG prepared locally.';
}


const LAB_MODE = 'tripwire';
let wasInside = false;
let eventCount = 0;
function releaseModePointer() {}
function resetMode() {
  wasInside = false;
  eventCount = 0;
}
function drawScene(width, height, signal) {
  const left = width * 0.2;
  const top = height * 0.2;
  const zoneW = width * 0.6;
  const zoneH = height * 0.55;
  const inside = signal.centerX > 0.2 && signal.centerX < 0.8 && signal.centerY > 0.2 && signal.centerY < 0.75;
  if (inside && !wasInside) eventCount += 1;
  wasInside = inside;
  const color = inside ? '#fb7185' : '#67e8f9';
  context.fillStyle = 'rgba(2, 6, 23, 0.62)';
  context.fillRect(0, 0, width, height);
  context.fillStyle = inside ? 'rgba(251, 113, 133, 0.16)' : 'rgba(103, 232, 249, 0.08)';
  context.fillRect(left, top, zoneW, zoneH);
  context.strokeStyle = color;
  context.setLineDash([10, 8]);
  context.lineWidth = 3;
  context.strokeRect(left, top, zoneW, zoneH);
  context.setLineDash([]);
  context.fillStyle = color;
  context.font = '900 24px system-ui';
  context.fillText(inside ? 'ZONE TRIGGERED' : 'ZONE CLEAR', 18, 40);
  context.font = '700 13px ui-monospace';
  context.fillText(`deterministic entries ${eventCount}`, 18, height - 22);
  context.fillStyle = '#fef08a';
  context.beginPath();
  context.arc(signal.centerX * width, signal.centerY * height, 10, 0, Math.PI * 2);
  context.fill();
}

function draw(time) {
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 360;
  const signal = signalNow(time);
  lastSignal = signal;
  drawBackground(width, height, signal, time);
  drawScene(width, height, signal, time);
  metrics.textContent = `${cameraActive ? 'Camera signal' : 'Pointer/sample fallback'} · brightness ${signal.brightness.toFixed(2)} · contrast ${signal.contrast.toFixed(2)} · ${reducedMotion ? 'reduced motion' : 'full motion'}`;
  requestAnimationFrame(draw);
}

window.addEventListener('resize', resize);
canvas.addEventListener('pointermove', updatePointer);
canvas.addEventListener('pointerdown', updatePointer);
canvas.addEventListener('pointerup', releaseModePointer);
canvas.addEventListener('pointercancel', releaseModePointer);
startButton.addEventListener('click', startCamera);
sampleButton.addEventListener('click', useSample);
resetButton.addEventListener('click', () => {
  resetMode();
  status.textContent = 'Local visual state reset.';
});
saveButton.addEventListener('click', savePng);
window.addEventListener('pagehide', stopStream);
resize();
draw(performance.now());
