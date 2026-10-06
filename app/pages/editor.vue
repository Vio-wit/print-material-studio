<script setup lang="ts">
import { PDFDocument } from "pdf-lib";
import { printTemplates } from "../composables/useTemplates";
import { useLocalStudio } from "../composables/useLocalStudio";
import { applyPhotoAdjustments } from "../utils/photo-adjustments";
import { segmentPerson } from "../utils/person-segmentation";
import type { EditSettings, PrintDesignOptions, StudioWork, SubjectMask } from "../types/studio";

const route = useRoute();
const studio = useLocalStudio();
const { inspectImage } = useApi();
const imageData = ref("");
const fileName = ref("");
const title = ref("未命名作品");
const templateId = ref("photo-4x6");
const defaultDesignOptions: PrintDesignOptions = {
  fitMode: "contain", zoomPercent: 100, offsetX: 0, offsetY: 0, rotation: 0,
  frameMm: 6, paperColor: "#ffffff", blurBackground: false, backgroundZoom: 125, backgroundBlur: 18
};
const designOptions = reactive<PrintDesignOptions>({ ...defaultDesignOptions });
const busy = ref(false);
const notice = ref("");
const cameraInfo = ref("");
const settings = reactive<EditSettings>({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0, warmth: 0, subjectExposure: 0, subjectContrast: 0, preset: "原片" });
const imageInput = ref<HTMLInputElement | null>(null);
const previewCanvas = ref<HTMLCanvasElement | null>(null);
const subjectMask = shallowRef<SubjectMask | null>(null);
const selectionInverted = ref(false);
const selectingSubject = ref(false);
const undoStack = ref<EditSettings[]>([]);
const redoStack = ref<EditSettings[]>([]);
const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

type AdjustmentKey = "exposure" | "contrast" | "highlights" | "shadows" | "temperature" | "tint" | "saturation" | "vibrance" | "warmth" | "subjectExposure" | "subjectContrast";
interface AdjustmentControl {
  key: AdjustmentKey;
  name: string;
  min: number;
  max: number;
  step: number;
}

const adjustmentControls: AdjustmentControl[] = [
  { key: "exposure", name: "曝光", min: -3, max: 3, step: 0.1 },
  { key: "contrast", name: "对比度", min: -50, max: 50, step: 1 },
  { key: "highlights", name: "高光", min: -100, max: 100, step: 1 },
  { key: "shadows", name: "阴影", min: -100, max: 100, step: 1 },
  { key: "temperature", name: "冷暖", min: -100, max: 100, step: 1 },
  { key: "tint", name: "绿 ↔ 洋红", min: -100, max: 100, step: 1 },
  { key: "saturation", name: "鲜艳度", min: -100, max: 100, step: 1 },
  { key: "vibrance", name: "自然饱和度", min: -100, max: 100, step: 1 },
  { key: "warmth", name: "暖色叠加", min: 0, max: 50, step: 1 }
];
const subjectAdjustmentControls: AdjustmentControl[] = [
  { key: "subjectExposure", name: "选区曝光", min: -3, max: 3, step: 0.1 },
  { key: "subjectContrast", name: "选区对比度", min: -50, max: 50, step: 1 }
];

const selectedTemplate = computed(() => printTemplates.find((item) => item.id === templateId.value) || printTemplates[0]!);
const aspectRatio = computed(() => selectedTemplate.value.widthMm + " / " + selectedTemplate.value.heightMm);
const basicFilters = ["原片", "明亮", "通透", "鲜活", "暖调", "黑白"];
const moodFilters = ["暖胶片", "褪色复古", "冷调电影", "柔和人像", "日系清透"];
const outputDpi = 300;
const previewMaxEdge = 1400;
const adjustingPreviewMaxEdge = 720;
const isAdjustingPreview = ref(false);
const outputWidth = computed(() => Math.round(selectedTemplate.value.widthMm / 25.4 * outputDpi));
const outputHeight = computed(() => Math.round(selectedTemplate.value.heightMm / 25.4 * outputDpi));

const presetSettings: Record<string, Omit<EditSettings, "preset">> = {
  "原片": { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0, warmth: 0, subjectExposure: 0, subjectContrast: 0 },
  "明亮": { exposure: 0.12, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0, warmth: 0, subjectExposure: 0, subjectContrast: 0 },
  "通透": { exposure: 0, contrast: 10, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0, warmth: 0, subjectExposure: 0, subjectContrast: 0 },
  "鲜活": { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 18, warmth: 0, subjectExposure: 0, subjectContrast: 0 },
  "暖调": { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0, warmth: 15, subjectExposure: 0, subjectContrast: 0 },
  "黑白": { exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: -100, vibrance: 0, warmth: 0, subjectExposure: 0, subjectContrast: 0 },
  "暖胶片": { exposure: 0.1, contrast: -8, highlights: -15, shadows: 10, temperature: 14, tint: 3, saturation: -12, vibrance: 7, warmth: 10, subjectExposure: 0, subjectContrast: 0 },
  "褪色复古": { exposure: 0.05, contrast: -18, highlights: -5, shadows: 18, temperature: 8, tint: 2, saturation: -24, vibrance: -8, warmth: 12, subjectExposure: 0, subjectContrast: 0 },
  "冷调电影": { exposure: -0.1, contrast: 12, highlights: -18, shadows: 9, temperature: -12, tint: -2, saturation: -12, vibrance: 2, warmth: 0, subjectExposure: 0, subjectContrast: 0 },
  "柔和人像": { exposure: 0.15, contrast: -8, highlights: -20, shadows: 18, temperature: 3, tint: 2, saturation: -8, vibrance: 4, warmth: 2, subjectExposure: 0, subjectContrast: 0 },
  "日系清透": { exposure: 0.15, contrast: -6, highlights: -10, shadows: 14, temperature: 4, tint: 4, saturation: -6, vibrance: 12, warmth: 4, subjectExposure: 0, subjectContrast: 0 }
};

let decodedImage: HTMLImageElement | null = null;
let decodedImageSource = "";
let previewFrame = 0;
let previewRevision = 0;
let sliderHistoryPending = false;
let adjustmentEndTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(async () => {
  await studio.refresh();
  const queryWorkId = String(route.query.work || "");
  const work = studio.works.value.find((item) => item.id === queryWorkId);
  if (work) {
    workId.value = work.id;
    imageData.value = work.imageData;
    fileName.value = work.title;
    title.value = work.title;
    templateId.value = work.templateId;
    Object.assign(settings, migrateLegacySettings(work.settings));
    Object.assign(designOptions, defaultDesignOptions, work.designOptions || {});
    if (work.subjectSelection === "person" || work.subjectSelection === "inverse-person") {
      selectionInverted.value = work.subjectSelection === "inverse-person";
      void selectSubject();
    }
  }
  window.addEventListener("paste", handlePaste);
  window.addEventListener("resize", queuePreviewRender);
});
watch([imageData, templateId, settings, designOptions], queuePreviewRender, { deep: true, flush: "post" });
onBeforeUnmount(() => {
  window.removeEventListener("paste", handlePaste);
  window.removeEventListener("resize", queuePreviewRender);
  if (adjustmentEndTimer) clearTimeout(adjustmentEndTimer);
  if (previewFrame) cancelAnimationFrame(previewFrame);
  previewRevision++;
});

function queuePreviewRender() {
  if (!import.meta.client) return;
  if (previewFrame) cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => void renderPreview());
}

async function renderPreview() {
  const revision = ++previewRevision;
  await nextTick();
  const canvas = previewCanvas.value;
  const source = imageData.value;
  if (!canvas || !source) return;

  try {
    const image = await loadPhotoImage(source);
    const maxEdge = isAdjustingPreview.value ? adjustingPreviewMaxEdge : previewMaxEdge;
    if (revision === previewRevision) drawPhoto(canvas, image, maxEdge, subjectMask.value, selectionInverted.value);
  } catch {
    notice.value = "照片预览处理失败；可以重新导入这张照片再试。";
  }
}

async function loadPhotoImage(source: string) {
  if (decodedImage && decodedImageSource === source) return decodedImage;
  const image = new Image();
  image.src = source;
  await image.decode();
  decodedImage = image;
  decodedImageSource = source;
  return image;
}

function drawPhoto(canvas: HTMLCanvasElement, image: HTMLImageElement, maxEdge: number, mask: SubjectMask | null, invertMask = false) {
  const scale = Math.min(1, maxEdge / Math.max(outputWidth.value, outputHeight.value));
  canvas.width = Math.max(1, Math.round(outputWidth.value * scale));
  canvas.height = Math.max(1, Math.round(outputHeight.value * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建照片预览画布");

  context.fillStyle = designOptions.paperColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const dpi = canvas.width / (selectedTemplate.value.widthMm / 25.4);
  const inset = Math.round(designOptions.frameMm / 25.4 * dpi);
  const maxWidth = Math.max(1, canvas.width - inset * 2);
  const maxHeight = Math.max(1, canvas.height - inset * 2);
  const rotated = designOptions.rotation % 180 !== 0;
  const fitWidth = rotated ? image.naturalHeight : image.naturalWidth;
  const fitHeight = rotated ? image.naturalWidth : image.naturalHeight;
  const fitScale = designOptions.fitMode === "cover"
    ? Math.max(maxWidth / fitWidth, maxHeight / fitHeight)
    : Math.min(maxWidth / fitWidth, maxHeight / fitHeight);
  const imageScale = fitScale * designOptions.zoomPercent / 100;
  const photoWidth = Math.max(1, Math.round(image.naturalWidth * imageScale));
  const photoHeight = Math.max(1, Math.round(image.naturalHeight * imageScale));

  const photoLayer = document.createElement("canvas");
  photoLayer.width = photoWidth;
  photoLayer.height = photoHeight;
  const photoContext = photoLayer.getContext("2d", { willReadFrequently: true });
  if (!photoContext) throw new Error("无法创建照片处理图层");
  photoContext.drawImage(image, 0, 0, photoWidth, photoHeight);
  const pixels = photoContext.getImageData(0, 0, photoWidth, photoHeight);
  applyPhotoAdjustments(pixels.data, photoWidth, photoHeight, settings, mask, invertMask);
  photoContext.putImageData(pixels, 0, 0);

  if (designOptions.blurBackground) {
    const backgroundScale = Math.max(canvas.width / photoWidth, canvas.height / photoHeight) * designOptions.backgroundZoom / 100;
    const backgroundWidth = photoWidth * backgroundScale;
    const backgroundHeight = photoHeight * backgroundScale;
    const previewScale = canvas.width / outputWidth.value;
    context.save();
    context.filter = `blur(${designOptions.backgroundBlur * previewScale}px)`;
    context.drawImage(photoLayer, (canvas.width - backgroundWidth) / 2, (canvas.height - backgroundHeight) / 2, backgroundWidth, backgroundHeight);
    context.restore();
  }

  const areaX = inset;
  const areaY = inset;
  const centerX = areaX + maxWidth / 2;
  const centerY = areaY + maxHeight / 2;
  const displayedWidth = rotated ? photoHeight : photoWidth;
  const displayedHeight = rotated ? photoWidth : photoHeight;
  const offsetX = Math.abs(displayedWidth - maxWidth) / 2 * designOptions.offsetX / 100;
  const offsetY = Math.abs(displayedHeight - maxHeight) / 2 * designOptions.offsetY / 100;
  context.save();
  context.beginPath();
  context.rect(areaX, areaY, maxWidth, maxHeight);
  context.clip();
  context.translate(centerX + offsetX, centerY + offsetY);
  context.rotate(designOptions.rotation * Math.PI / 180);
  context.drawImage(photoLayer, -photoWidth / 2, -photoHeight / 2, photoWidth, photoHeight);
  if (mask) {
    const overlay = createSelectionOverlay(mask, invertMask);
    context.drawImage(overlay, -photoWidth / 2, -photoHeight / 2, photoWidth, photoHeight);
  }
  context.restore();
}

function createSelectionOverlay(mask: SubjectMask, inverted: boolean) {
  const overlay = document.createElement("canvas");
  overlay.width = mask.width;
  overlay.height = mask.height;
  const overlayContext = overlay.getContext("2d");
  if (!overlayContext) return overlay;
  const pixels = overlayContext.createImageData(mask.width, mask.height);
  for (let index = 0; index < mask.data.length; index++) {
    const offset = index * 4;
    pixels.data[offset] = 55;
    pixels.data[offset + 1] = 126;
    pixels.data[offset + 2] = 245;
    const confidence = Math.min(1, Math.max(0, mask.data[index]!));
    pixels.data[offset + 3] = Math.round((inverted ? 1 - confidence : confidence) * 90);
  }
  overlayContext.putImageData(pixels, 0, 0);
  return overlay;
}

function setImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase())) {
    notice.value = "这不是常见图片文件，请选择 JPEG、PNG 或 WebP 图片。";
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    notice.value = "图片超过 30 MB。为保证浏览器运行稳定，请先缩小文件。";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    imageData.value = String(reader.result || "");
    subjectMask.value = null;
    selectionInverted.value = false;
    settings.subjectExposure = 0;
    settings.subjectContrast = 0;
    fileName.value = file.name;
    title.value = file.name.replace(/\.[^.]+$/, "");
    notice.value = "照片已载入。原图不会被覆盖，调整可以随时修改。";
    cameraInfo.value = "";
    inspectImage(file).then((info) => {
      const fields = [info.make, info.camera, info.lens].filter(Boolean);
      cameraInfo.value = fields.join(" · ") || (info.width + " × " + info.height + " px");
    }).catch(() => {
      cameraInfo.value = "暂时无法读取图片信息；照片编辑仍可用。";
    });
  };
  reader.readAsDataURL(file);
}

function onChoose(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) setImage(file);
}

function onDrop(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0];
  if (file) setImage(file);
}

function handlePaste(event: ClipboardEvent) {
  const image = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
  const file = image?.getAsFile();
  if (file) {
    event.preventDefault();
    setImage(new File([file], "剪贴板图片.png", { type: file.type }));
    notice.value = "已从剪贴板载入图片。";
  }
}

function migrateLegacySettings(saved: Partial<EditSettings> & { brightness?: number }): EditSettings {
  const preset = saved.preset || "原片";
  let brightness = saved.brightness || 0;
  let contrast = saved.contrast || 0;
  let saturation = saved.saturation || 0;
  let warmth = saved.warmth || 0;
  const isLegacyHiddenPreset = typeof saved.exposure !== "number"
    && preset !== "原片"
    && brightness === 0
    && contrast === 0
    && saturation === 0
    && warmth === 0;
  if (isLegacyHiddenPreset) {
    if (preset === "明亮") brightness = 8;
    if (preset === "通透") contrast = 10;
    if (preset === "鲜活") saturation = 18;
    if (preset === "暖调") warmth = 15;
    if (preset === "黑白") saturation = -100;
  }

  return {
    exposure: saved.exposure ?? Math.log2(Math.max(0.01, 1 + brightness / 100)),
    contrast,
    highlights: saved.highlights || 0,
    shadows: saved.shadows || 0,
    temperature: saved.temperature || 0,
    tint: saved.tint || 0,
    saturation,
    vibrance: saved.vibrance || 0,
    warmth,
    subjectExposure: saved.subjectExposure || 0,
    subjectContrast: saved.subjectContrast || 0,
    preset
  };
}

async function selectSubject() {
  if (!imageData.value || selectingSubject.value) return;
  const source = imageData.value;
  selectingSubject.value = true;
  notice.value = "正在本机识别人物主体；首次使用会加载模型，请稍候。";
  try {
    const image = await loadPhotoImage(source);
    const mask = await segmentPerson(image);
    if (imageData.value !== source) return;
    let foregroundPixels = 0;
    for (const confidence of mask.data) {
      if (confidence >= 0.5) foregroundPixels++;
    }
    if (foregroundPixels / mask.data.length < 0.003) {
      subjectMask.value = null;
      selectionInverted.value = false;
      settings.subjectExposure = 0;
      settings.subjectContrast = 0;
      notice.value = "没有检测到明显人物。当前主体识别仅针对人物，不支持任意物体；远处小人物也可能漏选。";
      queuePreviewRender();
      return;
    }
    subjectMask.value = mask;
    notice.value = "人物主体选区已生成；蓝色只用于预览，导出不会带上。边缘可能有误差，多人时可能一起选中。";
    queuePreviewRender();
  } catch (error) {
    notice.value = "人物识别失败：" + (error instanceof Error ? error.message : "请稍后重试。");
  } finally {
    selectingSubject.value = false;
  }
}

function clearSubjectSelection() {
  subjectMask.value = null;
  selectionInverted.value = false;
  settings.subjectExposure = 0;
  settings.subjectContrast = 0;
  queuePreviewRender();
  notice.value = "已清除主体选区；全局调整仍保留。";
}

function invertSubjectSelection() {
  if (!subjectMask.value) return;
  selectionInverted.value = !selectionInverted.value;
  queuePreviewRender();
  notice.value = selectionInverted.value
    ? "已反选区域：蓝色显示人物以外的背景，局部调整会作用于背景。"
    : "已恢复人物选区：蓝色显示人物，局部调整会作用于人物。";
}

function rotatePhoto() {
  designOptions.rotation = ((designOptions.rotation + 90) % 360) as PrintDesignOptions["rotation"];
}

function resetPhotoLayout() {
  designOptions.fitMode = "contain";
  designOptions.zoomPercent = 100;
  designOptions.offsetX = 0;
  designOptions.offsetY = 0;
  designOptions.rotation = 0;
}

function rememberSettings() {
  undoStack.value = [...undoStack.value.slice(-39), { ...settings }];
  redoStack.value = [];
}

function beginSliderHistory(event?: Event) {
  if (event?.type === "keydown" && !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes((event as KeyboardEvent).key)) return;
  isAdjustingPreview.value = true;
  if (adjustmentEndTimer) clearTimeout(adjustmentEndTimer);
  if (sliderHistoryPending) return;
  rememberSettings();
  sliderHistoryPending = true;
}

function endSliderHistory() {
  sliderHistoryPending = false;
  if (adjustmentEndTimer) clearTimeout(adjustmentEndTimer);
  adjustmentEndTimer = setTimeout(() => {
    isAdjustingPreview.value = false;
    adjustmentEndTimer = undefined;
    queuePreviewRender();
  }, 160);
}

function updateAdjustmentInput(event: Event, control: AdjustmentControl) {
  const input = event.currentTarget as HTMLInputElement;
  if (!input.value) return;
  const parsed = Number(input.value);
  if (!Number.isFinite(parsed)) return;
  const bounded = Math.min(control.max, Math.max(control.min, parsed));
  const snapped = control.min + Math.round((bounded - control.min) / control.step) * control.step;
  const precision = String(control.step).split(".")[1]?.length || 0;
  settings[control.key] = Number(snapped.toFixed(precision));
  settings.preset = "自定义";
}

function finishAdjustmentInput(event: Event, control: AdjustmentControl) {
  const input = event.currentTarget as HTMLInputElement;
  input.value = String(settings[control.key]);
  endSliderHistory();
}

function undoSettings() {
  const previous = undoStack.value.at(-1);
  if (!previous) return;
  undoStack.value = undoStack.value.slice(0, -1);
  redoStack.value = [...redoStack.value, { ...settings }];
  sliderHistoryPending = false;
  Object.assign(settings, previous);
}

function redoSettings() {
  const next = redoStack.value.at(-1);
  if (!next) return;
  redoStack.value = redoStack.value.slice(0, -1);
  undoStack.value = [...undoStack.value, { ...settings }];
  sliderHistoryPending = false;
  Object.assign(settings, next);
}

function applyPreset(preset: string) {
  const values = presetSettings[preset];
  if (!values) return;
  if (JSON.stringify(settings) === JSON.stringify({ ...values, preset })) return;
  rememberSettings();
  Object.assign(settings, values, { preset });
}

function resetSettings() {
  applyPreset("原片");
}

async function createExportCanvas(): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  if (!imageData.value) throw new Error("请先导入照片");
  const image = new Image();
  image.src = imageData.value;
  await image.decode();
  drawPhoto(canvas, image, Math.max(outputWidth.value, outputHeight.value), subjectMask.value, selectionInverted.value);
  return canvas;
}

function downloadBlob(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = (title.value.trim() || "print-material") + extension;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportPng() {
  if (!imageData.value) return;
  try {
    const canvas = await createExportCanvas();
    const rawBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 导出失败")), "image/png"));
    const blob = await addPngDpiMetadata(rawBlob, outputDpi);
    downloadBlob(blob, ".png");
    notice.value = "已导出 " + outputWidth.value + " × " + outputHeight.value + " px PNG，并写入 300 DPI 分辨率标记；结果按当前裁切、边框和底色设置生成。";
  } catch (error) {
    notice.value = error instanceof Error ? error.message : "导出失败";
  }
}

async function exportPdf() {
  if (!imageData.value) return;
  try {
    const canvas = await createExportCanvas();
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PDF 图片准备失败")), "image/png"));
    const bytes = await png.arrayBuffer();
    const document = await PDFDocument.create();
    const pageWidth = selectedTemplate.value.widthMm / 25.4 * 72;
    const pageHeight = selectedTemplate.value.heightMm / 25.4 * 72;
    const page = document.addPage([pageWidth, pageHeight]);
    const embedded = await document.embedPng(bytes);
    page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    const pdfBytes = await document.save();
    const safePdfBytes = new Uint8Array(pdfBytes.length);
    safePdfBytes.set(pdfBytes);
    downloadBlob(new Blob([safePdfBytes.buffer], { type: "application/pdf" }), ".pdf");
    notice.value = "已导出单页 PDF（" + outputWidth.value + " × " + outputHeight.value + " px 位图）。当前为 RGB，并非印厂专用 CMYK/PDF-X。";
  } catch (error) {
    notice.value = error instanceof Error ? error.message : "PDF 导出失败";
  }
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Uint8Array) {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index++) chunk[4 + index] = type.charCodeAt(index);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

async function addPngDpiMetadata(blob: Blob, dpi: number) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((value, index) => bytes[index] !== value)) throw new Error("导出的 PNG 格式无效");

  const pixelsPerMeter = Math.round(dpi / 0.0254);
  const physicalData = new Uint8Array(9);
  const physicalView = new DataView(physicalData.buffer);
  physicalView.setUint32(0, pixelsPerMeter);
  physicalView.setUint32(4, pixelsPerMeter);
  physicalData[8] = 1;
  const physicalChunk = makePngChunk("pHYs", physicalData);
  const chunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  let foundHeader = false;

  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("导出的 PNG 数据不完整");
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type !== "pHYs") chunks.push(bytes.subarray(offset, end));
    if (type === "IHDR") {
      chunks.push(physicalChunk);
      foundHeader = true;
    }
    offset = end;
    if (type === "IEND") break;
  }
  if (!foundHeader || offset !== bytes.length) throw new Error("无法写入 PNG 分辨率信息");

  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  const outputBuffer = new ArrayBuffer(output.length);
  new Uint8Array(outputBuffer).set(output);
  return new Blob([outputBuffer], { type: "image/png" });
}

async function saveToWorks() {
  if (!imageData.value) return;
  busy.value = true;
  try {
    const work: StudioWork = {
      id: workId.value || (globalThis.crypto?.randomUUID?.() || Date.now().toString()),
      title: title.value.trim() || "未命名作品",
      imageData: imageData.value,
      templateId: templateId.value,
      settings: { ...settings },
      designOptions: { ...designOptions },
      ...(subjectMask.value ? { subjectSelection: selectionInverted.value ? "inverse-person" as const : "person" as const } : {}),
      updatedAt: new Date().toISOString()
    };
    await studio.saveWork(work);
    workId.value = work.id;
    notice.value = "已保存到本机作品柜。";
  } catch {
    notice.value = "保存失败。可能是浏览器本地空间不足，请先导出备份。";
  } finally {
    busy.value = false;
  }
}

const workId = ref("");

function formatSetting(key: string) {
  const value = settings[key as keyof EditSettings];
  if (typeof value !== "number") return "";
  const sign = value > 0 ? "+" : "";
  if (key === "exposure" || key === "subjectExposure") return sign + value.toFixed(1) + " EV";
  if (key === "warmth") return value + "%";
  if (key === "temperature") return sign + value + " 冷暖";
  if (key === "tint") return sign + value + " 绿/洋红";
  return sign + value;
}

async function addToAssets() {
  if (!imageData.value) return;
  try {
    await studio.saveAsset({ id: globalThis.crypto?.randomUUID?.() || Date.now().toString(), name: fileName.value || title.value, imageData: imageData.value, addedAt: new Date().toISOString() });
    notice.value = "照片已加入素材收纳。";
  } catch {
    notice.value = "素材保存失败，本机浏览器存储空间可能不足。";
  }
}
</script>

<template>
  <div class="editor-page">
  <div class="editor-heading">
    <div><div class="eyebrow">MAKE / PHOTO PRINT</div><h1 class="page-title">照片与相纸</h1><p class="page-subtitle">导入、调整、选尺寸，再导出或保存为作品。原图保持不变。</p></div>
    <div class="heading-actions"><button class="button" :disabled="!imageData" @click="addToAssets">收进素材</button><button class="button primary" :disabled="!imageData || busy" @click="saveToWorks">{{ busy ? "保存中…" : "保存作品" }}</button></div>
  </div>
  <div class="workflow"><span class="current"><b>1</b> 导入</span><i></i><span :class="{ current: imageData }"><b>2</b> 调整</span><i></i><span :class="{ current: imageData }"><b>3</b> 选尺寸</span><i></i><span :class="{ current: imageData }"><b>4</b> 导出 / 保存</span><span class="workflow-skip">流程可跳过，随时返回</span></div>
  <div class="editor-layout">
    <section class="preview-column">
      <div v-if="!imageData" class="upload-zone card" @click="imageInput?.click()" @dragover.prevent @drop.prevent="onDrop">
        <input ref="imageInput" type="file" accept="image/*" hidden @change="onChoose">
        <div class="upload-mark">↑</div><h2>把照片放进来</h2><p>点击选择，或把图片拖到这里</p>
        <button class="button primary" @click.stop="imageInput?.click()">选择照片</button>
        <span class="paste-hint">也可以先复制图片，再在这里按 Ctrl + V 粘贴</span>
        <small>JPEG、PNG、WebP · 单张最大 30 MB</small>
      </div>
      <div v-else class="preview-wrap">
        <div class="preview-toolbar">
          <span><b>画布预览</b><small>{{ selectedTemplate.name }} · 白色纸张</small></span>
          <div class="preview-actions">
            <button class="button small" :disabled="selectingSubject" title="当前模型自动识别人物主体，不支持任意物体" @click="selectSubject">{{ selectingSubject ? "识别中…" : subjectMask ? "重新识别主体" : "选取主体" }}</button>
            <button v-if="subjectMask" class="text-button" :aria-pressed="selectionInverted" @click="invertSubjectSelection">{{ selectionInverted ? "恢复主体选区" : "反选区域" }}</button>
            <button v-if="subjectMask" class="text-button" @click="clearSubjectSelection">清除选区</button>
            <button class="button small" @click="imageInput?.click()">换一张</button>
            <input ref="imageInput" type="file" accept="image/*" hidden @change="onChoose">
          </div>
        </div>
        <div class="canvas-stage">
          <div class="print-canvas" :style="{ aspectRatio }">
            <canvas ref="previewCanvas" class="photo-preview-canvas" role="img" aria-label="照片预览"></canvas>
          </div>
        </div>
        <div class="preview-foot"><span>原图完整保留比例，画布内自动留白</span><span>{{ cameraInfo || fileName }}</span></div>
      </div>
      <div class="export-row">
        <button class="button primary" :disabled="!imageData" @click="exportPng">导出 PNG · 300 DPI</button>
        <button class="button" :disabled="!imageData" @click="exportPdf">导出打印 PDF</button>
        <span>PDF 暂为 RGB，普通打印可用；印厂 CMYK/PDF-X 未开发</span>
      </div>
      <div class="export-spec">当前纸张输出：{{ outputWidth }} × {{ outputHeight }} px · 300 px/in；PNG 会写入分辨率标记</div>
      <div v-if="notice" class="notice" role="status">{{ notice }}</div>
    </section>
    <aside class="controls card">
      <div class="control-section"><div class="control-title"><h2>画面设置</h2><button class="text-button" @click="resetSettings">重置</button></div>
        <label class="field-label">作品名称<input v-model="title" type="text" maxlength="80" placeholder="给这件作品起个名字"></label>
        <label class="field-label">纸张尺寸<select v-model="templateId"><option v-for="item in printTemplates" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <div class="range-label"><div class="range-heading"><span>相纸边框</span><b>{{ designOptions.frameMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.frameMm" type="range" min="0" max="24" step="0.5" aria-label="相纸边框"><input v-model.number="designOptions.frameMm" class="value-input" type="number" min="0" max="24" step="0.5" aria-label="相纸边框毫米"></div></div>
        <label class="field-label color-field">纸张底色<input v-model="designOptions.paperColor" type="color" aria-label="选择纸张底色"></label>
      </div>
      <div class="control-section">
        <div class="control-title"><h2>裁切与放大</h2><button class="text-button" :disabled="!imageData" @click="resetPhotoLayout">重置位置</button></div>
        <div class="fit-options"><button class="preset-chip" :class="{ selected: designOptions.fitMode === 'contain' }" :aria-pressed="designOptions.fitMode === 'contain'" :disabled="!imageData" @click="designOptions.fitMode = 'contain'">完整显示</button><button class="preset-chip" :class="{ selected: designOptions.fitMode === 'cover' }" :aria-pressed="designOptions.fitMode === 'cover'" :disabled="!imageData" @click="designOptions.fitMode = 'cover'">填满裁切</button></div>
        <div class="range-label"><div class="range-heading"><span>照片放大</span><b>{{ designOptions.zoomPercent }}%</b></div><div class="range-inputs"><input v-model.number="designOptions.zoomPercent" type="range" min="100" max="300" step="1" aria-label="照片放大" :disabled="!imageData"><input v-model.number="designOptions.zoomPercent" class="value-input" type="number" min="100" max="300" step="1" aria-label="照片放大百分比" :disabled="!imageData"></div></div>
        <div class="range-label"><div class="range-heading"><span>左右位置</span><b>{{ designOptions.offsetX }}</b></div><div class="range-inputs"><input v-model.number="designOptions.offsetX" type="range" min="-100" max="100" step="1" aria-label="左右位置" :disabled="!imageData"><input v-model.number="designOptions.offsetX" class="value-input" type="number" min="-100" max="100" step="1" aria-label="左右位置数值" :disabled="!imageData"></div></div>
        <div class="range-label"><div class="range-heading"><span>上下位置</span><b>{{ designOptions.offsetY }}</b></div><div class="range-inputs"><input v-model.number="designOptions.offsetY" type="range" min="-100" max="100" step="1" aria-label="上下位置" :disabled="!imageData"><input v-model.number="designOptions.offsetY" class="value-input" type="number" min="-100" max="100" step="1" aria-label="上下位置数值" :disabled="!imageData"></div></div>
        <button class="button small rotate-button" :disabled="!imageData" @click="rotatePhoto">旋转 90°（当前 {{ designOptions.rotation }}°）</button>
        <p class="adjustment-note">“填满裁切”会让照片铺满纸张内框，超出部分不导出；可用位置滑杆调整保留区域。原图不改写。</p>
      </div>
      <div class="control-section">
        <div class="control-title"><h2>照片放大虚化背景</h2><span class="control-hint">单张照片</span></div>
        <label class="toggle-field"><input v-model="designOptions.blurBackground" type="checkbox" :disabled="!imageData"><span>使用照片放大模糊作为底图</span></label>
        <template v-if="designOptions.blurBackground">
          <div class="range-label"><div class="range-heading"><span>背景模糊</span><b>{{ designOptions.backgroundBlur }} px</b></div><div class="range-inputs"><input v-model.number="designOptions.backgroundBlur" type="range" min="0" max="48" step="1" aria-label="背景模糊"><input v-model.number="designOptions.backgroundBlur" class="value-input" type="number" min="0" max="48" step="1" aria-label="背景模糊像素"></div></div>
          <div class="range-label"><div class="range-heading"><span>背景放大</span><b>{{ designOptions.backgroundZoom }}%</b></div><div class="range-inputs"><input v-model.number="designOptions.backgroundZoom" type="range" min="100" max="220" step="1" aria-label="背景放大"><input v-model.number="designOptions.backgroundZoom" class="value-input" type="number" min="100" max="220" step="1" aria-label="背景放大百分比"></div></div>
        </template>
        <p class="adjustment-note">模糊背景只用于填满整张纸，前景照片仍保持清晰；浏览器和设备性能会影响大图处理速度。</p>
      </div>
      <div class="control-section"><div class="control-title"><h2>快速色调</h2><span class="control-hint">应用后可继续微调</span></div>
        <div class="preset-groups">
          <div class="preset-group"><span class="preset-group-title">基础</span><div class="preset-grid"><button v-for="filter in basicFilters" :key="filter" class="preset-chip" :class="{ selected: settings.preset === filter }" @click="applyPreset(filter)">{{ filter }}</button></div></div>
          <div class="preset-group"><span class="preset-group-title">氛围配方</span><div class="preset-grid"><button v-for="filter in moodFilters" :key="filter" class="preset-chip" :class="{ selected: settings.preset === filter }" @click="applyPreset(filter)">{{ filter }}</button></div></div>
        </div>
        <div v-if="settings.preset === '自定义'" class="preset-custom" role="status">自定义 · 参数已按下面滑杆显示</div>
        <p class="adjustment-note">氛围配方由本工具的基础参数组合，不是相机厂商官方滤镜，也不含胶片颗粒、漏光或光晕纹理。</p>
      </div>
      <div class="control-section"><div class="control-title"><h2>手动调整</h2><div class="history-actions"><button class="text-button" :disabled="!canUndo" @click="undoSettings">↶ 撤销</button><button class="text-button" :disabled="!canRedo" @click="redoSettings">↷ 重做</button></div></div>
        <div v-for="item in adjustmentControls" :key="item.key" class="range-label">
          <div class="range-heading"><label :for="`adjustment-${item.key}`">{{ item.name }}</label><b>{{ formatSetting(item.key) }}</b></div>
          <div class="range-inputs">
            <input :id="`adjustment-${item.key}`" v-model.number="settings[item.key]" type="range" :min="item.min" :max="item.max" :step="item.step" @pointerdown="beginSliderHistory" @pointerup="endSliderHistory" @pointercancel="endSliderHistory" @keydown="beginSliderHistory" @change="endSliderHistory" @input="settings.preset = '自定义'">
            <input type="number" class="value-input" :aria-label="item.name + '数值'" :min="item.min" :max="item.max" :step="item.step" :value="settings[item.key]" @focus="beginSliderHistory" @keydown="beginSliderHistory" @input="updateAdjustmentInput($event, item)" @change="endSliderHistory" @blur="finishAdjustmentInput($event, item)">
          </div>
        </div>
        <p class="adjustment-note">曝光按 EV 调整；其他值是本工具的相对强度，不等同于 Lightroom 的标尺。冷暖与色调为视觉近似，并非 Kelvin 白平衡。</p>
      </div>
      <div v-if="subjectMask" class="control-section">
        <div class="control-title"><h2>选区局部调整</h2><span class="control-hint">蓝色区域会受影响</span></div>
        <div v-for="item in subjectAdjustmentControls" :key="item.key" class="range-label">
          <div class="range-heading"><label :for="`adjustment-${item.key}`">{{ item.name }}</label><b>{{ formatSetting(item.key) }}</b></div>
          <div class="range-inputs">
            <input :id="`adjustment-${item.key}`" v-model.number="settings[item.key]" type="range" :min="item.min" :max="item.max" :step="item.step" @pointerdown="beginSliderHistory" @pointerup="endSliderHistory" @pointercancel="endSliderHistory" @keydown="beginSliderHistory" @change="endSliderHistory" @input="settings.preset = '自定义'">
            <input type="number" class="value-input" :aria-label="item.name + '数值'" :min="item.min" :max="item.max" :step="item.step" :value="settings[item.key]" @focus="beginSliderHistory" @keydown="beginSliderHistory" @input="updateAdjustmentInput($event, item)" @change="endSliderHistory" @blur="finishAdjustmentInput($event, item)">
          </div>
        </div>
        <p class="adjustment-note">当前模型实际识别的是人物，蓝色是识别概率较高的区域；反选后将影响人物以外区域。蒙版只是近似结果，头发、手指等边缘可能不准，导出不会带上蓝色。</p>
      </div>
      <div class="privacy-note"><span>◉</span><p><b>你的照片留在本机</b><br>作品保存到当前浏览器，不会自动上传。请定期导出备份。</p></div>
    </aside>
  </div>
  </div>
</template>

<style scoped>
.editor-page{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden}.editor-heading{display:flex;justify-content:space-between;align-items:end;gap:20px;flex:0 0 auto}.heading-actions{display:flex;gap:8px}
.workflow{display:flex;align-items:center;gap:9px;padding:17px 0 20px;color:#b0b1aa;font-size:10px;flex:0 0 auto}.workflow span{white-space:nowrap}.workflow b{display:inline-grid;place-items:center;width:20px;height:20px;border:1px solid #dedfd8;border-radius:50%;font-size:9px;margin-right:5px;font-weight:500}.workflow .current{color:#4e5148}.workflow .current b{background:#30312c;color:white;border-color:#30312c}.workflow i{height:1px;background:#e5e6df;width:34px}.workflow-skip{margin-left:auto;color:#9c9e95}
.editor-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;align-items:stretch;flex:1;min-height:0;overflow:hidden}.preview-column{min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain}.upload-zone{min-height:490px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-style:dashed;background:#fbfbf9;cursor:pointer}.upload-mark{display:grid;place-items:center;width:54px;height:54px;border-radius:18px;background:#efefe9;font-size:24px;color:#686a60}.upload-zone h2{font-size:17px;margin:18px 0 6px}.upload-zone p{font-size:11px;color:#92948b;margin:0 0 18px}.paste-hint{margin-top:14px;color:#7f8178;font-size:10px}.upload-zone small{margin-top:20px;color:#b0b1aa;font-size:9px}
.preview-wrap{background:#f0f0eb;border:1px solid #e6e6df;border-radius:11px;overflow:hidden}.preview-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#fff}.preview-toolbar span{display:grid;gap:4px}.preview-toolbar b{font-size:11px}.preview-toolbar small{font-size:9px;color:#9a9b93}.preview-actions{display:flex;align-items:center;gap:7px}.canvas-stage{min-height:430px;display:grid;place-items:center;padding:35px;background:#eeeee9}.print-canvas{width:min(74%,410px);max-height:500px;background:white;box-shadow:none;display:flex;align-items:center;justify-content:center;overflow:hidden}.photo-preview-canvas{display:block;width:100%;height:100%;object-fit:contain}.preview-foot{background:#fff;padding:10px 13px;display:flex;justify-content:space-between;font-size:9px;color:#96978f}
.export-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.export-row>span{font-size:9px;color:#96978e;margin-left:auto}.export-spec{margin-top:7px;color:#72746c;font-size:9px}.notice{margin-top:10px;background:#edf1e9;border:1px solid #e1e8db;padding:10px 12px;border-radius:7px;color:#5f7059;font-size:10px}
.controls{position:static;align-self:stretch;height:100%;min-height:0;max-height:none;overflow-y:auto;overscroll-behavior:contain;padding:0 16px;scrollbar-width:thin;scrollbar-color:#d6d7cf transparent}.control-section{padding:17px 0;border-bottom:1px solid #efefeb}.control-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.control-title h2{font-size:12px;margin:0;font-weight:600}.text-button{border:0;background:none;color:#797b72;font-size:9px}.text-button:disabled{color:#c3c4be}.history-actions{display:flex;gap:8px}
.field-label{display:grid;gap:7px;font-size:9px;color:#777970;margin-top:12px}.field-label input,.field-label select{width:100%;height:35px;border:1px solid #e5e5df;border-radius:6px;padding:0 9px;color:#4a4b44;background:white;font-size:10px;outline:none}.field-label input:focus,.field-label select:focus{border-color:#a8aa9e}
.field-label.color-field input[type=color]{width:100%;height:32px;padding:3px;cursor:pointer}.fit-options{display:grid;grid-template-columns:1fr 1fr;gap:6px}.fit-options .preset-chip{height:34px}.rotate-button{margin-top:13px}.toggle-field{display:flex;align-items:center;gap:8px;color:#6f7168;font-size:10px}.toggle-field input{accent-color:#56594e}
.range-label{display:grid;gap:8px;margin-top:14px}.range-heading{display:flex;justify-content:space-between;align-items:baseline;color:#76786f;font-size:9px}.range-heading label{cursor:pointer}.range-heading b{color:#565850;font-weight:500}.range-inputs{display:grid;grid-template-columns:minmax(0,1fr) 72px;gap:8px;align-items:center}.range-inputs input[type=range]{width:100%;accent-color:#56594e;height:13px}.range-inputs .value-input{width:72px;height:28px;border:1px solid #e5e5df;border-radius:5px;padding:0 5px;color:#4a4b44;background:white;font-size:10px;text-align:right}.range-inputs .value-input:focus{border-color:#a8aa9e;outline:none}
.preset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.preset-chip{height:31px;border:1px solid #e8e8e2;background:white;border-radius:6px;font-size:9px;color:#777970}.preset-chip.selected{border-color:#777a6e;background:#f2f2ee;color:#373930}
.preset-groups{display:grid;gap:12px}.preset-group{display:grid;gap:6px}.preset-group-title{font-size:9px;color:#96978e}
.adjustment-note{margin:10px 0 0;color:#96978e;font-size:9px;line-height:1.6}.preset-custom{margin-top:8px;color:#56594e;font-size:9px}
.privacy-note{display:flex;gap:9px;padding:14px 0;color:#7c7e75}.privacy-note>span{color:#87977f;font-size:14px}.privacy-note p{margin:0;font-size:9px;line-height:1.7}.privacy-note b{font-size:9px;color:#5b5d55}
@media(max-width:1000px){.editor-page{height:auto;min-height:0;overflow:visible}.editor-layout{grid-template-columns:1fr;display:grid;flex:none;min-height:0;overflow:visible;align-items:start}.preview-column{min-height:0;overflow:visible}.controls{position:static;height:auto;min-height:0;max-height:none;overflow:visible;display:grid;grid-template-columns:1fr 1fr;column-gap:20px}.privacy-note{grid-column:1/-1}}
@media(max-width:620px){.editor-heading{align-items:start;flex-direction:column}.workflow{gap:5px;overflow-x:auto}.workflow i{width:12px;flex-shrink:0}.workflow-skip{display:none}.canvas-stage{min-height:340px;padding:20px}.print-canvas{width:min(90%,400px)}.preview-foot{gap:8px;flex-direction:column}.export-row>span{width:100%;margin:0}.controls{display:block}}
@media(max-width:720px){.preview-toolbar{align-items:flex-start;flex-direction:column}.preview-actions{width:100%;flex-wrap:wrap}}
</style>
