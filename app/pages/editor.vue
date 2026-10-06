<script setup lang="ts">
import { PDFDocument } from "pdf-lib";
import { printTemplates } from "../composables/useTemplates";
import { useLocalStudio } from "../composables/useLocalStudio";
import { applyPhotoAdjustments } from "../utils/photo-adjustments";
import { computeCollageLayout, suggestCollageColumns } from "../utils/collage-layout";
import { segmentPerson } from "../utils/person-segmentation";
import type { CollageAdjustmentKey, CollagePhoto, CollagePhotoOptions, EditSettings, PhotoLayoutPreset, PhotoMetadata, PrintDesignOptions, StudioWork, SubjectMask } from "../types/studio";

const route = useRoute();
const studio = useLocalStudio();
const { inspectImage } = useApi();
const imageData = ref("");
const fileName = ref("");
const title = ref("未命名作品");
const templateId = ref("photo-4x6");
const defaultDesignOptions: PrintDesignOptions = {
  fitMode: "contain", zoomPercent: 100, offsetX: 0, offsetY: 0, rotation: 0,
  frameMm: 6, paperColor: "#ffffff", blurBackground: false, backgroundZoom: 125, backgroundBlur: 18,
  layoutPreset: "classic", layoutTitle: "", layoutSubtitle: "", layoutAuthor: "", layoutTitleSizeMm: 7, layoutSubtitleSizeMm: 3.5, layoutAccentColor: "#c39b69",
  lightFrameEnabled: false, lightFrameRadiusMm: 1.5, lightFrameLogoText: "", lightFrameLogoSizeMm: 3.5,
  lightFrameMetadataSizeMm: 2, lightFrameLogoColor: "#ffffff", lightFrameBorderMm: 3, lightFrameBottomMm: 12,
  lightFrameShadowSizeMm: 5, lightFrameShadowDepth: 42, lightFrameShadowColor: "#808080", lightFrameShowMetadata: true,
  watermarkEnabled: false, watermarkText: "", watermarkIncludeMetadata: false,
  watermarkFontSizeMm: 3, watermarkOpacity: 80, watermarkColor: "#ffffff", watermarkPosition: "bottom-right",
  collageLayout: "grid", collageColumns: 5, collageGapMm: 3, pageOrientation: "portrait"
};
const designOptions = reactive<PrintDesignOptions>({ ...defaultDesignOptions });
const busy = ref(false);
const notice = ref("");
const cameraInfo = ref("");
const photoMetadata = shallowRef<PhotoMetadata | null>(null);
const settings = reactive<EditSettings>({ exposure: 0, contrast: 0, highlights: 0, shadows: 0, temperature: 0, tint: 0, saturation: 0, vibrance: 0, warmth: 0, subjectExposure: 0, subjectContrast: 0, preset: "原片" });
const imageInput = ref<HTMLInputElement | null>(null);
const collageInput = ref<HTMLInputElement | null>(null);
const previewCanvas = ref<HTMLCanvasElement | null>(null);
const collagePhotos = shallowRef<CollagePhoto[]>([]);
const selectedCollagePhotoId = ref("");
const selectedCollagePhoto = computed(() => collagePhotos.value.find((photo) => photo.id === selectedCollagePhotoId.value) || null);
const loadingCollage = ref(false);
const collageColumnsCustomized = ref(false);
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
const collageAdjustmentControls = adjustmentControls as Array<AdjustmentControl & { key: CollageAdjustmentKey }>;
const subjectAdjustmentControls: AdjustmentControl[] = [
  { key: "subjectExposure", name: "选区曝光", min: -3, max: 3, step: 0.1 },
  { key: "subjectContrast", name: "选区对比度", min: -50, max: 50, step: 1 }
];

const selectedTemplate = computed(() => printTemplates.find((item) => item.id === templateId.value) || printTemplates[0]!);
const photoLayoutPresets: Array<{ id: PhotoLayoutPreset; name: string; description: string }> = [
  { id: "classic", name: "经典留白", description: "原比例居中，保留可调相纸边距。" },
  { id: "polaroid", name: "拍立得白边", description: "上、左右留白，底部加标题区。" },
  { id: "poster", name: "摄影海报", description: "主图配标题、副标题和作者信息。" },
  { id: "postcard", name: "明信片正面", description: "照片与卡片文字区分层排布。" },
  { id: "album-cover", name: "方形封面", description: "满版照片加封面标题层。" }
];
const templateRecommendedLayouts: Record<string, PhotoLayoutPreset> = {
  "photo-4x6": "polaroid",
  "photo-5x7": "polaroid",
  a5: "poster",
  "square-10": "album-cover",
  postcard: "postcard"
};
const recommendedPhotoLayout = computed(() => photoLayoutPresets.find((preset) => preset.id === templateRecommendedLayouts[templateId.value]) || photoLayoutPresets[0]!);
const pageWidthMm = computed(() => designOptions.pageOrientation === "landscape" ? Math.max(selectedTemplate.value.widthMm, selectedTemplate.value.heightMm) : Math.min(selectedTemplate.value.widthMm, selectedTemplate.value.heightMm));
const pageHeightMm = computed(() => designOptions.pageOrientation === "landscape" ? Math.min(selectedTemplate.value.widthMm, selectedTemplate.value.heightMm) : Math.max(selectedTemplate.value.widthMm, selectedTemplate.value.heightMm));
const aspectRatio = computed(() => pageWidthMm.value + " / " + pageHeightMm.value);
const isCollage = computed(() => collagePhotos.value.length > 1);
const paperColorLabel = computed(() => designOptions.paperColor.toLowerCase() === "#ffffff" ? "白色纸张" : "自定义底色");
const basicFilters = ["原片", "明亮", "通透", "鲜活", "暖调", "黑白"];
const moodFilters = ["暖胶片", "褪色复古", "冷调电影", "柔和人像", "日系清透"];
const outputDpi = 300;
const previewMaxEdge = 1400;
const adjustingPreviewMaxEdge = 720;
const isAdjustingPreview = ref(false);
const outputWidth = computed(() => Math.round(pageWidthMm.value / 25.4 * outputDpi));
const outputHeight = computed(() => Math.round(pageHeightMm.value / 25.4 * outputDpi));

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
const collagePreviewCache = new Map<string, HTMLCanvasElement>();
let collageHitRegions: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
let previewFrame = 0;
let previewRevision = 0;
let sliderHistoryPending = false;
let adjustmentEndTimer: ReturnType<typeof setTimeout> | undefined;
let collageAdjustmentEndTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(async () => {
  await studio.refresh();
  const queryWorkId = String(route.query.work || "");
  const work = studio.works.value.find((item) => item.id === queryWorkId);
  if (work) {
    workId.value = work.id;
    collageColumnsCustomized.value = Boolean(work.additionalPhotos?.length);
    const primaryPhoto: CollagePhoto = {
      id: "primary-" + work.id,
      fileName: work.title,
      imageData: work.imageData,
      ...(work.primaryPhotoOptions || {}),
      ...(work.photoMetadata ? { photoMetadata: work.photoMetadata } : {})
    };
    collagePhotos.value = [primaryPhoto, ...(work.additionalPhotos || [])];
    selectedCollagePhotoId.value = primaryPhoto.id;
    imageData.value = work.imageData;
    fileName.value = work.title;
    title.value = work.title;
    templateId.value = work.templateId;
    Object.assign(settings, migrateLegacySettings(work.settings));
    Object.assign(designOptions, defaultDesignOptions, work.designOptions || {});
    photoMetadata.value = work.photoMetadata || null;
    if (photoMetadata.value) cameraInfo.value = [photoMetadata.value.make, photoMetadata.value.camera, photoMetadata.value.lens].filter(Boolean).join(" · ");
    if (work.subjectSelection === "person" || work.subjectSelection === "inverse-person") {
      selectionInverted.value = work.subjectSelection === "inverse-person";
      void selectSubject();
    }
  }
  window.addEventListener("paste", handlePaste);
  window.addEventListener("resize", queuePreviewRender);
});
watch([imageData, templateId, settings, designOptions, photoMetadata, collagePhotos, selectedCollagePhotoId], queuePreviewRender, { deep: true, flush: "post" });
onBeforeUnmount(() => {
  window.removeEventListener("paste", handlePaste);
  window.removeEventListener("resize", queuePreviewRender);
  if (adjustmentEndTimer) clearTimeout(adjustmentEndTimer);
  if (collageAdjustmentEndTimer) clearTimeout(collageAdjustmentEndTimer);
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
    const maxEdge = isAdjustingPreview.value ? adjustingPreviewMaxEdge : previewMaxEdge;
    if (revision === previewRevision) {
      if (isCollage.value) await drawCollage(canvas, maxEdge, false, revision);
      else {
        const image = await loadPhotoImage(source);
        if (revision === previewRevision) drawPhoto(canvas, image, maxEdge, subjectMask.value, selectionInverted.value, true);
      }
    }
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

function traceRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function colorWithAlpha(color: string, alpha: number) {
  const match = /^#?([\da-f]{6})$/i.exec(color);
  if (!match) return `rgba(128,128,128,${Math.max(0, Math.min(1, alpha))})`;
  const value = Number.parseInt(match[1]!, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
}

function drawRoundedPhotoShadow(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, blur: number, offsetY: number, color: string) {
  const padding = Math.ceil(blur * 2 + Math.abs(offsetY));
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = Math.max(1, Math.ceil(width + padding * 2));
  shadowCanvas.height = Math.max(1, Math.ceil(height + padding * 2));
  const shadowContext = shadowCanvas.getContext("2d");
  if (!shadowContext) return;

  traceRoundedRect(shadowContext, padding, padding, width, height, radius);
  shadowContext.fillStyle = "#000000";
  shadowContext.shadowColor = color;
  shadowContext.shadowBlur = blur;
  shadowContext.shadowOffsetY = offsetY;
  shadowContext.fill();

  shadowContext.globalCompositeOperation = "destination-out";
  traceRoundedRect(shadowContext, padding, padding, width, height, radius);
  shadowContext.fillStyle = "#000000";
  shadowContext.fill();
  context.drawImage(shadowCanvas, x - padding, y - padding);
}

interface PhotoLayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getPhotoLayoutBox(canvasWidth: number, canvasHeight: number, dpi: number, lightFrameActive: boolean, photoAspect: number): PhotoLayoutBox {
  const mmToPx = (mm: number) => mm / 25.4 * dpi;
  const baseMargin = Math.max(0, designOptions.frameMm);
  if (designOptions.layoutPreset === "album-cover") return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };

  const marginMm = designOptions.layoutPreset === "classic"
    ? (lightFrameActive ? designOptions.lightFrameBorderMm : baseMargin)
    : Math.max(baseMargin, designOptions.layoutPreset === "poster" ? 7 : 4);
  const margin = Math.round(mmToPx(marginMm));
  const width = Math.max(1, canvasWidth - margin * 2);
  let box: PhotoLayoutBox;
  if (designOptions.layoutPreset === "polaroid") {
    const bottomCaption = mmToPx(18);
    box = { x: margin, y: margin, width, height: Math.max(1, canvasHeight - margin * 2 - bottomCaption) };
  } else if (designOptions.layoutPreset === "poster" || designOptions.layoutPreset === "postcard") {
    const captionHeight = mmToPx(designOptions.layoutPreset === "poster" ? 34 : 28);
    box = { x: margin, y: margin, width, height: Math.max(1, canvasHeight - margin * 2 - captionHeight) };
  } else {
    box = { x: margin, y: margin, width, height: Math.max(1, canvasHeight - margin * 2) };
  }
  if (designOptions.layoutPreset !== "classic" && designOptions.fitMode === "contain" && Number.isFinite(photoAspect) && photoAspect > 0) {
    const fittedWidth = Math.min(box.width, box.height * photoAspect);
    const fittedHeight = fittedWidth / photoAspect;
    return { ...box, x: box.x + (box.width - fittedWidth) / 2, width: fittedWidth, height: fittedHeight };
  }
  return box;
}

function drawPhoto(canvas: HTMLCanvasElement, image: HTMLImageElement, maxEdge: number, mask: SubjectMask | null, invertMask = false, showSelectionOverlay = false) {
  const scale = Math.min(1, maxEdge / Math.max(outputWidth.value, outputHeight.value));
  canvas.width = Math.max(1, Math.round(outputWidth.value * scale));
  canvas.height = Math.max(1, Math.round(outputHeight.value * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建照片预览画布");

  context.fillStyle = designOptions.paperColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const dpi = canvas.width / (pageWidthMm.value / 25.4);
  const lightFrameActive = designOptions.lightFrameEnabled && designOptions.layoutPreset === "classic";
  const rotated = designOptions.rotation % 180 !== 0;
  const fitWidth = rotated ? image.naturalHeight : image.naturalWidth;
  const fitHeight = rotated ? image.naturalWidth : image.naturalHeight;
  const photoBox = getPhotoLayoutBox(canvas.width, canvas.height, dpi, lightFrameActive, fitWidth / fitHeight);
  const { x: areaX, y: areaY, width: maxWidth, height: maxHeight } = photoBox;
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

  if (designOptions.blurBackground || lightFrameActive) {
    const backgroundScale = Math.max(canvas.width / photoWidth, canvas.height / photoHeight) * designOptions.backgroundZoom / 100;
    const backgroundWidth = photoWidth * backgroundScale;
    const backgroundHeight = photoHeight * backgroundScale;
    const previewScale = canvas.width / outputWidth.value;
    context.save();
    context.filter = `blur(${designOptions.backgroundBlur * previewScale}px)`;
    context.drawImage(photoLayer, (canvas.width - backgroundWidth) / 2, (canvas.height - backgroundHeight) / 2, backgroundWidth, backgroundHeight);
    context.restore();
  }

  const centerX = areaX + maxWidth / 2;
  const centerY = areaY + maxHeight / 2;
  const displayedWidth = rotated ? photoHeight : photoWidth;
  const displayedHeight = rotated ? photoWidth : photoHeight;
  const offsetX = Math.abs(displayedWidth - maxWidth) / 2 * designOptions.offsetX / 100;
  const offsetY = Math.abs(displayedHeight - maxHeight) / 2 * designOptions.offsetY / 100;
  const fullBleed = designOptions.fitMode === "cover" || designOptions.zoomPercent > 100;
  const frameX = fullBleed ? areaX : centerX + offsetX - displayedWidth / 2;
  const frameY = fullBleed ? areaY : centerY + offsetY - displayedHeight / 2;
  const frameWidth = fullBleed ? maxWidth : displayedWidth;
  const frameHeight = fullBleed ? maxHeight : displayedHeight;
  const cornerRadius = lightFrameActive
    ? Math.max(0, designOptions.lightFrameRadiusMm / 25.4 * dpi)
    : 0;
  if (lightFrameActive && designOptions.lightFrameShadowSizeMm > 0 && designOptions.lightFrameShadowDepth > 0) {
    const shadowBlur = designOptions.lightFrameShadowSizeMm / 25.4 * dpi;
    drawRoundedPhotoShadow(
      context,
      frameX,
      frameY,
      frameWidth,
      frameHeight,
      cornerRadius,
      shadowBlur,
      shadowBlur * 0.16,
      colorWithAlpha(designOptions.lightFrameShadowColor, designOptions.lightFrameShadowDepth / 100)
    );
  }
  context.save();
  context.beginPath();
  context.rect(areaX, areaY, maxWidth, maxHeight);
  context.clip();
  if (lightFrameActive) {
    traceRoundedRect(context, frameX, frameY, frameWidth, frameHeight, cornerRadius);
    context.clip();
  }
  context.translate(centerX + offsetX, centerY + offsetY);
  context.rotate(designOptions.rotation * Math.PI / 180);
  context.drawImage(photoLayer, -photoWidth / 2, -photoHeight / 2, photoWidth, photoHeight);
  if (mask && showSelectionOverlay) {
    const overlay = createSelectionOverlay(mask, invertMask);
    context.drawImage(overlay, -photoWidth / 2, -photoHeight / 2, photoWidth, photoHeight);
  }
  context.restore();
  if (lightFrameActive) drawLightFrameFooter(context, areaX, areaY, maxWidth, maxHeight, frameX, frameY, frameWidth, frameHeight, cornerRadius, dpi);
  else if (designOptions.layoutPreset !== "classic") drawPhotoLayoutDecorations(context, canvas, photoBox, dpi);
  if (designOptions.watermarkEnabled) drawWatermark(context, canvas);
}

function drawPhotoLayoutDecorations(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, photoBox: PhotoLayoutBox, dpi: number) {
  const mmToPx = (mm: number) => mm / 25.4 * dpi;
  const titleText = designOptions.layoutTitle.trim() || title.value.trim() || fileName.value.replace(/\.[^.]+$/, "");
  const subtitleText = designOptions.layoutSubtitle.trim();
  const authorText = designOptions.layoutAuthor.trim();
  const titleSize = Math.max(1, mmToPx(designOptions.layoutTitleSizeMm));
  const subtitleSize = Math.max(1, mmToPx(designOptions.layoutSubtitleSizeMm));
  const margin = mmToPx(Math.max(4, designOptions.frameMm));
  const captionTop = photoBox.y + photoBox.height;
  const captionHeight = Math.max(0, canvas.height - captionTop);
  const titleFont = `600 ${titleSize}px Arial, "Microsoft YaHei", sans-serif`;
  const subtitleFont = `400 ${subtitleSize}px Arial, "Microsoft YaHei", sans-serif`;

  context.save();
  context.textBaseline = "alphabetic";
  if (designOptions.layoutPreset === "polaroid") {
    context.fillStyle = designOptions.paperColor;
    context.fillRect(photoBox.x, captionTop, photoBox.width, captionHeight);
    context.textAlign = "center";
    context.fillStyle = "#30312c";
    context.font = titleFont;
    const titleBaseline = captionTop + captionHeight * (subtitleText ? 0.58 : 0.68);
    if (titleText) context.fillText(titleText, photoBox.x + photoBox.width / 2, titleBaseline, photoBox.width - margin);
    if (subtitleText) {
      context.fillStyle = "#777970";
      context.font = subtitleFont;
      context.fillText(subtitleText, photoBox.x + photoBox.width / 2, captionTop + captionHeight - mmToPx(3), photoBox.width - margin);
    }
  } else if (designOptions.layoutPreset === "poster") {
    context.fillStyle = designOptions.paperColor;
    context.fillRect(0, captionTop, canvas.width, captionHeight);
    context.fillStyle = designOptions.layoutAccentColor;
    context.fillRect(margin, captionTop + mmToPx(5), mmToPx(13), Math.max(2, mmToPx(1.2)));
    context.textAlign = "left";
    context.fillStyle = "#30312c";
    context.font = titleFont;
    if (titleText) context.fillText(titleText, margin, captionTop + mmToPx(17), canvas.width - margin * 2);
    context.fillStyle = "#777970";
    context.font = subtitleFont;
    if (subtitleText) context.fillText(subtitleText, margin, captionTop + mmToPx(24), canvas.width - margin * 2);
    if (authorText) context.fillText(authorText, margin, canvas.height - mmToPx(4), canvas.width - margin * 2);
  } else if (designOptions.layoutPreset === "postcard") {
    context.fillStyle = designOptions.paperColor;
    context.fillRect(0, captionTop, canvas.width, captionHeight);
    context.fillStyle = designOptions.layoutAccentColor;
    context.fillRect(margin, captionTop + mmToPx(4), canvas.width - margin * 2, Math.max(2, mmToPx(0.7)));
    context.textAlign = "left";
    context.fillStyle = "#30312c";
    context.font = titleFont;
    if (titleText) context.fillText(titleText, margin, captionTop + mmToPx(15), canvas.width * 0.62);
    context.fillStyle = "#777970";
    context.font = subtitleFont;
    if (subtitleText) context.fillText(subtitleText, margin, canvas.height - mmToPx(4), canvas.width * 0.62);
    if (authorText) {
      context.textAlign = "right";
      context.fillStyle = designOptions.layoutAccentColor;
      context.font = subtitleFont;
      context.fillText(authorText, canvas.width - margin, captionTop + captionHeight * 0.64, canvas.width * 0.28);
    }
  } else if (designOptions.layoutPreset === "album-cover") {
    const gradientTop = canvas.height * 0.64;
    const gradient = context.createLinearGradient(0, gradientTop, 0, canvas.height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.72)");
    context.fillStyle = gradient;
    context.fillRect(0, gradientTop, canvas.width, canvas.height - gradientTop);
    context.textAlign = "left";
    context.fillStyle = "#ffffff";
    context.font = titleFont;
    if (titleText) context.fillText(titleText, margin, canvas.height - margin - (subtitleText ? subtitleSize * 1.7 : 0), canvas.width - margin * 2);
    if (subtitleText || authorText) {
      context.fillStyle = designOptions.layoutAccentColor;
      context.font = subtitleFont;
      context.fillText([subtitleText, authorText].filter(Boolean).join("  /  "), margin, canvas.height - margin / 2, canvas.width - margin * 2);
    }
  }
  context.restore();
}

function drawLightFrameFooter(context: CanvasRenderingContext2D, clipX: number, clipY: number, clipWidth: number, clipHeight: number, x: number, y: number, width: number, height: number, radius: number, dpi: number) {
  const footerHeight = Math.min(height, Math.max(0, designOptions.lightFrameBottomMm) / 25.4 * dpi);
  if (footerHeight < 1) return;
  const footerTop = y + height - footerHeight;
  const depth = Math.max(0, Math.min(100, designOptions.lightFrameShadowDepth)) / 100;
  const gradient = context.createLinearGradient(0, footerTop, 0, footerTop + footerHeight);
  gradient.addColorStop(0, colorWithAlpha(designOptions.lightFrameShadowColor, 0));
  gradient.addColorStop(0.24, colorWithAlpha(designOptions.lightFrameShadowColor, depth * 0.58));
  gradient.addColorStop(1, colorWithAlpha(designOptions.lightFrameShadowColor, depth));
  context.save();
  context.beginPath();
  context.rect(clipX, clipY, clipWidth, clipHeight);
  context.clip();
  traceRoundedRect(context, x, y, width, height, radius);
  context.clip();
  context.fillStyle = gradient;
  context.fillRect(x, footerTop, width, footerHeight);

  const metadata = photoMetadata.value;
  const cameraName = (metadata?.camera || metadata?.make || "").trim();
  const lensName = (metadata?.lens || "").trim();
  const exposureDetails = metadata && designOptions.lightFrameShowMetadata
    ? [
        metadata.focalLength ? `${metadata.focalLength} mm` : "",
        metadata.aperture ? `f/${metadata.aperture}` : "",
        metadata.exposure,
        metadata.iso ? `ISO ${metadata.iso}` : ""
      ].filter(Boolean).join("  ")
    : "";
  const logoText = designOptions.lightFrameLogoText.trim()
    || metadata?.make?.replace(/\s+(corporation|inc\.?|co\.?\s*ltd\.?)$/i, "").trim()
    || "";
  const timeText = designOptions.lightFrameShowMetadata ? (metadata?.taken_at || "") : "";
  const fontSize = Math.max(1, designOptions.lightFrameMetadataSizeMm / 25.4 * dpi);
  const logoSize = Math.max(1, designOptions.lightFrameLogoSizeMm / 25.4 * dpi);
  const padding = Math.max(2, 3 / 25.4 * dpi);
  const lineHeight = fontSize * 1.35;
  const firstBaseline = footerTop + footerHeight - padding - lineHeight;
  const secondBaseline = firstBaseline - lineHeight;
  const leftWidth = width * 0.56;
  const separatorX = x + width * 0.77;
  const logoX = x + width * 0.67;
  const rightX = separatorX + padding;
  const rightWidth = Math.max(1, x + width - padding - rightX);
  context.fillStyle = designOptions.lightFrameLogoColor;
  context.textBaseline = "alphabetic";
  context.textAlign = "left";
  context.font = `600 ${fontSize}px Arial, sans-serif`;
  if (cameraName) context.fillText(cameraName, x + padding, firstBaseline, leftWidth);
  if (designOptions.lightFrameShowMetadata && lensName) context.fillText(lensName, x + padding, secondBaseline, leftWidth);
  context.textAlign = "right";
  if (exposureDetails) context.fillText(exposureDetails, x + width - padding, firstBaseline, rightWidth);
  if (timeText) context.fillText(timeText, x + width - padding, secondBaseline, rightWidth);
  if (logoText) {
    context.textAlign = "center";
    context.font = `italic 600 ${logoSize}px Arial, sans-serif`;
    context.fillText(logoText, logoX, firstBaseline, width * 0.18);
  }
  if (cameraName || lensName || exposureDetails || timeText || logoText) {
    context.beginPath();
    context.moveTo(separatorX, footerTop + padding * 0.6);
    context.lineTo(separatorX, footerTop + footerHeight - padding * 0.6);
    context.strokeStyle = colorWithAlpha(designOptions.lightFrameLogoColor, 0.72);
    context.lineWidth = Math.max(1, dpi / 180);
    context.stroke();
  }
  context.restore();
}

function drawWatermark(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  const metadata = photoMetadata.value;
  const metadataLine = metadata && !isCollage.value && designOptions.watermarkIncludeMetadata
    ? [
        [metadata.make, metadata.camera].filter(Boolean).join(" "), metadata.lens,
        metadata.focalLength ? metadata.focalLength + " mm" : "",
        metadata.aperture ? "f/" + metadata.aperture : "",
        metadata.exposure, metadata.iso ? "ISO " + metadata.iso : "", metadata.taken_at
      ].filter(Boolean).join(" · ")
    : "";
  const watermark = [designOptions.watermarkText.trim(), metadataLine].filter(Boolean).join(" · ");
  if (!watermark) return;

  const dpi = canvas.width / (pageWidthMm.value / 25.4);
  const fontSize = Math.max(1, Math.min(18, designOptions.watermarkFontSizeMm) / 25.4 * dpi);
  const margin = Math.max(1, 3 / 25.4 * dpi);
  const maxWidth = Math.max(1, canvas.width - margin * 2);
  const lineHeight = fontSize * 1.35;
  context.font = `${fontSize}px Arial, sans-serif`;
  const lines: string[] = [];
  let line = "";
  for (const character of Array.from(watermark.replace(/\s*·\s*/g, " · "))) {
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line.trimEnd());
  if (lines.length > 4) {
    lines.splice(3);
    lines[3] = "…";
  }

  const position = designOptions.watermarkPosition;
  const align: CanvasTextAlign = position.endsWith("left") ? "left" : position.endsWith("right") ? "right" : "center";
  const x = align === "left" ? margin : align === "right" ? canvas.width - margin : canvas.width / 2;
  const top = position.startsWith("top");
  const y = top ? margin : canvas.height - margin - lineHeight * lines.length;
  context.save();
  context.globalAlpha = Math.max(0, Math.min(100, designOptions.watermarkOpacity)) / 100;
  context.fillStyle = designOptions.watermarkColor;
  context.textAlign = align;
  context.textBaseline = "top";
  context.font = `${fontSize}px Arial, sans-serif`;
  lines.forEach((content, index) => context.fillText(content, x, y + index * lineHeight, maxWidth));
  context.restore();
}

async function getCollagePreview(photo: CollagePhoto) {
  const cached = collagePreviewCache.get(photo.id);
  if (cached) return cached;
  const image = await loadPhotoImage(photo.imageData);
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
  const thumbnail = document.createElement("canvas");
  thumbnail.width = Math.max(1, Math.round(image.naturalWidth * scale));
  thumbnail.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = thumbnail.getContext("2d");
  if (!context) throw new Error("无法创建拼贴预览缩略图");
  context.drawImage(image, 0, 0, thumbnail.width, thumbnail.height);
  collagePreviewCache.set(photo.id, thumbnail);
  releaseDecodedImage(image);
  return thumbnail;
}

async function drawCollage(canvas: HTMLCanvasElement, maxEdge: number, useOriginals: boolean, expectedRevision?: number) {
  const scale = Math.min(1, maxEdge / Math.max(outputWidth.value, outputHeight.value));
  canvas.width = Math.max(1, Math.round(outputWidth.value * scale));
  canvas.height = Math.max(1, Math.round(outputHeight.value * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建拼贴画布");
  context.fillStyle = designOptions.paperColor;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const dpi = canvas.width / (pageWidthMm.value / 25.4);
  const inset = Math.round(designOptions.frameMm / 25.4 * dpi);
  const areaWidth = Math.max(1, canvas.width - inset * 2);
  const areaHeight = Math.max(1, canvas.height - inset * 2);
  const gap = Math.max(0, designOptions.collageGapMm / 25.4 * dpi);
  const aspects: number[] = [];

  for (const photo of collagePhotos.value) {
    if (useOriginals && photo.photoMetadata?.width && photo.photoMetadata.height) {
      aspects.push(photo.photoMetadata.width / photo.photoMetadata.height);
    } else {
      const preview = await getCollagePreview(photo);
      if (expectedRevision !== undefined && expectedRevision !== previewRevision) return;
      aspects.push(preview.width / Math.max(1, preview.height));
    }
  }

  const layout = computeCollageLayout(aspects, {
    width: areaWidth,
    height: areaHeight,
    columns: designOptions.collageColumns,
    gap,
    mode: designOptions.collageLayout
  });
  const previewRegions: Array<{ id: string; x: number; y: number; width: number; height: number }> = [];
  for (const item of layout) {
    if (expectedRevision !== undefined && expectedRevision !== previewRevision) return;
    const photo = collagePhotos.value[item.index]!;
    const source = useOriginals ? await loadPhotoImage(photo.imageData) : await getCollagePreview(photo);
    if (expectedRevision !== undefined && expectedRevision !== previewRevision) return;
    const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    const fitMode = photo.fitMode || "contain";
    const fitScale = fitMode === "cover"
      ? Math.max(item.width / sourceWidth, item.height / sourceHeight)
      : Math.min(item.width / sourceWidth, item.height / sourceHeight);
    const photoScale = fitScale * (photo.zoomPercent || 100) / 100;
    const width = Math.max(1, sourceWidth * photoScale);
    const height = Math.max(1, sourceHeight * photoScale);
    const photoX = (item.width - width) / 2 + Math.max(0, width - item.width) / 2 * (photo.offsetX || 0) / 100;
    const photoY = (item.height - height) / 2 + Math.max(0, height - item.height) / 2 * (photo.offsetY || 0) / 100;
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, Math.round(item.width));
    layer.height = Math.max(1, Math.round(item.height));
    const layerContext = layer.getContext("2d", { willReadFrequently: true });
    if (!layerContext) throw new Error("无法创建拼贴图层");
    layerContext.drawImage(source, photoX, photoY, width, height);
    const pixels = layerContext.getImageData(0, 0, layer.width, layer.height);
    const photoSettings = { ...settings, preset: "自定义" };
    for (const control of collageAdjustmentControls) {
      const combined = settings[control.key] + (photo.adjustments?.[control.key] || 0);
      photoSettings[control.key] = Math.min(control.max, Math.max(control.min, combined));
    }
    applyPhotoAdjustments(pixels.data, layer.width, layer.height, photoSettings, null, false);
    layerContext.putImageData(pixels, 0, 0);
    context.drawImage(layer, inset + item.x, inset + item.y, item.width, item.height);
    if (!useOriginals) previewRegions.push({ id: photo.id, x: inset + item.x, y: inset + item.y, width: item.width, height: item.height });
    if (useOriginals) releaseDecodedImage(source as HTMLImageElement);
  }

  if (designOptions.watermarkEnabled) drawWatermark(context, canvas);
  if (!useOriginals) {
    collageHitRegions = previewRegions;
    const selectedRegion = previewRegions.find((region) => region.id === selectedCollagePhotoId.value);
    if (selectedRegion) {
      context.save();
      context.lineWidth = Math.max(7, canvas.width / 180);
      context.setLineDash([Math.max(4, canvas.width / 160), Math.max(3, canvas.width / 220)]);
      context.strokeStyle = "rgba(255,255,255,.98)";
      context.strokeRect(selectedRegion.x + 1, selectedRegion.y + 1, selectedRegion.width - 2, selectedRegion.height - 2);
      context.lineWidth = Math.max(3, canvas.width / 400);
      context.strokeStyle = "rgba(48,49,44,.9)";
      context.strokeRect(selectedRegion.x + 1, selectedRegion.y + 1, selectedRegion.width - 2, selectedRegion.height - 2);
      context.restore();
    }
  }
}

function selectCollagePhoto(event: MouseEvent) {
  const canvas = previewCanvas.value;
  if (!canvas || !isCollage.value || collageHitRegions.length === 0) return;
  const bounds = canvas.getBoundingClientRect();
  const scale = Math.min(bounds.width / canvas.width, bounds.height / canvas.height);
  const contentWidth = canvas.width * scale;
  const contentHeight = canvas.height * scale;
  const x = (event.clientX - bounds.left - (bounds.width - contentWidth) / 2) / scale;
  const y = (event.clientY - bounds.top - (bounds.height - contentHeight) / 2) / scale;
  if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;
  const hit = collageHitRegions.find((region) => x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height);
  if (hit) selectedCollagePhotoId.value = hit.id;
}

function updateSelectedCollagePhoto(patch: Partial<CollagePhotoOptions>) {
  if (!selectedCollagePhotoId.value) return;
  collagePhotos.value = collagePhotos.value.map((photo) => photo.id === selectedCollagePhotoId.value ? { ...photo, ...patch } : photo);
}

function updateSelectedCollageNumber(event: Event, key: "zoomPercent" | "offsetX" | "offsetY", min: number, max: number, step: number) {
  const input = event.currentTarget as HTMLInputElement;
  if (!input.value) return;
  const parsed = Number(input.value);
  if (!Number.isFinite(parsed)) return;
  const bounded = Math.min(max, Math.max(min, parsed));
  const snapped = min + Math.round((bounded - min) / step) * step;
  const precision = String(step).split(".")[1]?.length || 0;
  updateSelectedCollagePhoto({ [key]: Number(snapped.toFixed(precision)) });
}

function updateSelectedCollageAdjustment(event: Event, control: AdjustmentControl & { key: CollageAdjustmentKey }) {
  const input = event.currentTarget as HTMLInputElement;
  if (!input.value) return;
  const parsed = Number(input.value);
  if (!Number.isFinite(parsed)) return;
  const bounded = Math.min(control.max, Math.max(control.min, parsed));
  const snapped = control.min + Math.round((bounded - control.min) / control.step) * control.step;
  const precision = String(control.step).split(".")[1]?.length || 0;
  const photo = selectedCollagePhoto.value;
  if (!photo) return;
  updateSelectedCollagePhoto({ adjustments: { ...photo.adjustments, [control.key]: Number(snapped.toFixed(precision)) } });
}

function resetSelectedCollagePhoto() {
  updateSelectedCollagePhoto({ fitMode: "contain", zoomPercent: 100, offsetX: 0, offsetY: 0, adjustments: {} });
}

function beginSelectedPhotoInput(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  isAdjustingPreview.value = true;
  if (collageAdjustmentEndTimer) clearTimeout(collageAdjustmentEndTimer);
}

function endSelectedPhotoInput(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (collageAdjustmentEndTimer) clearTimeout(collageAdjustmentEndTimer);
  collageAdjustmentEndTimer = setTimeout(() => {
    isAdjustingPreview.value = false;
    collageAdjustmentEndTimer = undefined;
    queuePreviewRender();
  }, 160);
}

function selectCollagePhotoById(id: string) {
  selectedCollagePhotoId.value = id;
}

function releaseDecodedImage(image: HTMLImageElement) {
  if (decodedImage !== image) return;
  image.onload = null;
  image.onerror = null;
  image.src = "";
  decodedImage = null;
  decodedImageSource = "";
}

function clearCollagePreviewCache() {
  collagePreviewCache.clear();
}

function suggestColumnsForPhotos(photos = collagePhotos.value) {
  const aspects = photos.map((photo) => {
    const metadata = photo.photoMetadata;
    return metadata?.width && metadata.height ? metadata.width / metadata.height : 1.5;
  });
  designOptions.collageColumns = suggestCollageColumns(aspects, pageWidthMm.value, pageHeightMm.value);
}

function markCollageColumnsCustomized() {
  collageColumnsCustomized.value = true;
}

function onPageOrientationChange(event: Event) {
  designOptions.pageOrientation = (event.currentTarget as HTMLSelectElement).value as PrintDesignOptions["pageOrientation"];
  if (isCollage.value && !collageColumnsCustomized.value) suggestColumnsForPhotos();
}

function onPhotoLayoutChange() {
  if (designOptions.layoutPreset !== "classic") {
    designOptions.lightFrameEnabled = false;
    designOptions.blurBackground = false;
    designOptions.fitMode = designOptions.layoutPreset === "album-cover" ? "cover" : "contain";
  }
}

function applyRecommendedPhotoLayout() {
  const imageWidth = photoMetadata.value?.width || decodedImage?.naturalWidth || 0;
  const imageHeight = photoMetadata.value?.height || decodedImage?.naturalHeight || 0;
  if (imageWidth > 0 && imageHeight > 0 && selectedTemplate.value.widthMm !== selectedTemplate.value.heightMm) {
    designOptions.pageOrientation = imageWidth >= imageHeight ? "landscape" : "portrait";
  }
  designOptions.layoutPreset = recommendedPhotoLayout.value.id;
  onPhotoLayoutChange();
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
    const loadedData = String(reader.result || "");
    imageData.value = loadedData;
    const photoId = globalThis.crypto?.randomUUID?.() || Date.now().toString();
    collagePhotos.value = [{ id: photoId, fileName: file.name, imageData: loadedData, byteSize: file.size }];
    selectedCollagePhotoId.value = "";
    clearCollagePreviewCache();
    workId.value = "";
    subjectMask.value = null;
    selectionInverted.value = false;
    photoMetadata.value = null;
    settings.subjectExposure = 0;
    settings.subjectContrast = 0;
    fileName.value = file.name;
    title.value = file.name.replace(/\.[^.]+$/, "");
    notice.value = "照片已载入。原图不会被覆盖，调整可以随时修改。";
    cameraInfo.value = "";
    inspectImage(file).then((info) => {
      if (imageData.value !== loadedData) return;
      photoMetadata.value = info;
      collagePhotos.value = collagePhotos.value.map((photo) => photo.id === photoId ? { ...photo, photoMetadata: info } : photo);
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
  (event.target as HTMLInputElement).value = "";
}

function openCollageInput() {
  collageInput.value?.click();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("无法读取文件：" + file.name));
    reader.readAsDataURL(file);
  });
}

function estimatePhotoSize(photo: CollagePhoto) {
  if (photo.byteSize) return photo.byteSize;
  const encoded = photo.imageData.split(",", 2)[1] || "";
  return Math.floor(encoded.length * 3 / 4);
}

async function onCollageChoose(event: Event) {
  const input = event.target as HTMLInputElement;
  const selected = Array.from(input.files || []);
  input.value = "";
  if (selected.length === 0) return;
  const basePhotos = isCollage.value ? [...collagePhotos.value] : [];
  const allPhotosCount = basePhotos.length + selected.length;
  if (allPhotosCount < 2 || allPhotosCount > 15) {
    notice.value = "拼贴请保留 2–15 张照片；单张模式请用“选择照片”。";
    return;
  }
  const unsupported = selected.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type.toLowerCase()));
  if (unsupported) {
    notice.value = "“" + unsupported.name + "”不是支持的 JPEG、PNG 或 WebP 图片。";
    return;
  }
  const tooLarge = selected.find((file) => file.size > 30 * 1024 * 1024);
  if (tooLarge) {
    notice.value = "单张照片不能超过 30 MB：" + tooLarge.name;
    return;
  }
  const combinedSize = basePhotos.reduce((total, photo) => total + estimatePhotoSize(photo), 0) + selected.reduce((total, file) => total + file.size, 0);
  if (combinedSize > 120 * 1024 * 1024) {
    notice.value = "这批照片总量超过 120 MB；为避免本机浏览器内存或存储压力，请减少照片或先缩小文件。";
    return;
  }

  loadingCollage.value = true;
  notice.value = "正在本机读取照片并准备拼贴预览……";
  try {
    const addedPhotos: CollagePhoto[] = [];
    for (const file of selected) {
      const [data, metadata] = await Promise.all([readFileAsDataUrl(file), inspectImage(file)]);
      addedPhotos.push({
        id: globalThis.crypto?.randomUUID?.() || Date.now().toString() + "-" + addedPhotos.length,
        fileName: file.name,
        imageData: data,
        byteSize: file.size,
        photoMetadata: metadata
      });
    }
    const allPhotos = [...basePhotos, ...addedPhotos];
    if (basePhotos.length === 0) collageColumnsCustomized.value = false;
    collagePhotos.value = allPhotos;
    selectedCollagePhotoId.value = allPhotos[0]!.id;
    if (!collageColumnsCustomized.value) suggestColumnsForPhotos(allPhotos);
    clearCollagePreviewCache();
    imageData.value = allPhotos[0]!.imageData;
    photoMetadata.value = allPhotos[0]!.photoMetadata || null;
    fileName.value = allPhotos[0]!.fileName;
    title.value = basePhotos.length > 0 ? title.value : "多照片拼贴";
    if (basePhotos.length === 0) workId.value = "";
    subjectMask.value = null;
    selectionInverted.value = false;
    settings.subjectExposure = 0;
    settings.subjectContrast = 0;
    cameraInfo.value = [photoMetadata.value?.make, photoMetadata.value?.camera, photoMetadata.value?.lens].filter(Boolean).join(" · ");
    notice.value = "已载入 " + allPhotos.length + " 张照片；拼贴保持原图比例，可继续调整布局后导出。";
  } catch (error) {
    notice.value = "拼贴照片读取失败：" + (error instanceof Error ? error.message : "请检查文件后重试。");
  } finally {
    loadingCollage.value = false;
  }
}

function removeCollagePhoto(index: number) {
  if (collagePhotos.value.length <= 1) return;
  const remaining = collagePhotos.value.filter((_, photoIndex) => photoIndex !== index);
  if (remaining.length === 1) {
    const finalPhoto = remaining[0]!;
    for (const control of collageAdjustmentControls) {
      const combined = settings[control.key] + (finalPhoto.adjustments?.[control.key] || 0);
      settings[control.key] = Math.min(control.max, Math.max(control.min, combined));
    }
    if (Object.values(finalPhoto.adjustments || {}).some((value) => value !== 0)) settings.preset = "自定义";
    designOptions.fitMode = finalPhoto.fitMode || "contain";
    designOptions.zoomPercent = finalPhoto.zoomPercent || 100;
    designOptions.offsetX = finalPhoto.offsetX || 0;
    designOptions.offsetY = finalPhoto.offsetY || 0;
  }
  collagePhotos.value = remaining;
  if (!remaining.some((photo) => photo.id === selectedCollagePhotoId.value)) selectedCollagePhotoId.value = remaining[0]!.id;
  clearCollagePreviewCache();
  imageData.value = remaining[0]!.imageData;
  photoMetadata.value = remaining[0]!.photoMetadata || null;
  fileName.value = remaining[0]!.fileName;
  cameraInfo.value = [photoMetadata.value?.make, photoMetadata.value?.camera, photoMetadata.value?.lens].filter(Boolean).join(" · ");
  subjectMask.value = null;
  selectionInverted.value = false;
  notice.value = remaining.length > 1 ? "已移除照片；拼贴已重新排版。" : "拼贴已变为单张照片。";
}

function moveCollagePhoto(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= collagePhotos.value.length) return;
  const reordered = [...collagePhotos.value];
  [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
  collagePhotos.value = reordered;
  imageData.value = reordered[0]!.imageData;
  photoMetadata.value = reordered[0]!.photoMetadata || null;
  fileName.value = reordered[0]!.fileName;
  cameraInfo.value = [photoMetadata.value?.make, photoMetadata.value?.camera, photoMetadata.value?.lens].filter(Boolean).join(" · ");
  clearCollagePreviewCache();
  notice.value = "照片顺序已更新。";
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
  if (isCollage.value) {
    await drawCollage(canvas, Math.max(outputWidth.value, outputHeight.value), true);
    return canvas;
  }
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
    const pageWidth = pageWidthMm.value / 25.4 * 72;
    const pageHeight = pageHeightMm.value / 25.4 * 72;
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
      ...(photoMetadata.value ? { photoMetadata: { ...photoMetadata.value } } : {}),
      ...(isCollage.value ? {
        primaryPhotoOptions: {
          fitMode: collagePhotos.value[0]!.fitMode || "contain",
          zoomPercent: collagePhotos.value[0]!.zoomPercent || 100,
          offsetX: collagePhotos.value[0]!.offsetX || 0,
          offsetY: collagePhotos.value[0]!.offsetY || 0,
          ...(collagePhotos.value[0]!.adjustments ? { adjustments: { ...collagePhotos.value[0]!.adjustments } } : {})
        },
        additionalPhotos: collagePhotos.value.slice(1)
      } : {}),
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
  <input ref="collageInput" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden @change="onCollageChoose">
  <div class="editor-layout">
    <section class="preview-column">
      <div v-if="!imageData" class="upload-zone card" @click="imageInput?.click()" @dragover.prevent @drop.prevent="onDrop">
        <input ref="imageInput" type="file" accept="image/*" hidden @change="onChoose">
        <div class="upload-mark">↑</div><h2>把照片放进来</h2><p>点击选择，或把图片拖到这里</p>
        <button class="button primary" @click.stop="imageInput?.click()">选择照片</button>
        <button class="button collage-upload-button" :disabled="loadingCollage" @click.stop="openCollageInput">{{ loadingCollage ? "正在读取…" : "选择多张做拼贴" }}</button>
        <span class="paste-hint">也可以先复制图片，再在这里按 Ctrl + V 粘贴</span>
        <small>JPEG、PNG、WebP · 单张最大 30 MB；拼贴最多 15 张 / 合计 120 MB</small>
      </div>
      <div v-else class="preview-wrap">
        <div class="preview-toolbar">
          <span><b>画布预览</b><small>{{ selectedTemplate.name }} · {{ designOptions.pageOrientation === "landscape" ? "横版" : "竖版" }} · {{ paperColorLabel }}</small></span>
          <div class="preview-actions">
            <button v-if="!isCollage" class="button small" :disabled="selectingSubject" title="当前模型自动识别人物主体，不支持任意物体" @click="selectSubject">{{ selectingSubject ? "识别中…" : subjectMask ? "重新识别主体" : "选取主体" }}</button>
            <button v-if="subjectMask" class="text-button" :aria-pressed="selectionInverted" @click="invertSubjectSelection">{{ selectionInverted ? "恢复主体选区" : "反选区域" }}</button>
            <button v-if="subjectMask" class="text-button" @click="clearSubjectSelection">清除选区</button>
            <button class="button small" :disabled="loadingCollage" @click="openCollageInput">{{ loadingCollage ? "读取中…" : isCollage ? "添加照片" : "多照片拼贴" }}</button>
            <button class="button small" @click="imageInput?.click()">换一张</button>
            <input ref="imageInput" type="file" accept="image/*" hidden @change="onChoose">
          </div>
        </div>
        <div class="canvas-stage">
          <div class="print-canvas" :style="{ aspectRatio }">
            <canvas ref="previewCanvas" class="photo-preview-canvas" :class="{ 'collage-selectable': isCollage }" role="img" :aria-label="isCollage ? '照片拼贴预览，点击单张照片进行选择' : '照片预览'" @click="selectCollagePhoto"></canvas>
          </div>
        </div>
        <div class="preview-foot"><span>{{ isCollage ? `${collagePhotos.length} 张照片 · ${designOptions.collageLayout === 'grid' ? '规整网格' : '错落拼贴'} · 保留比例` : "原图完整保留比例，画布内自动留白" }}</span><span>{{ cameraInfo || fileName }}</span></div>
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
        <label class="field-label">纸张方向<select :value="designOptions.pageOrientation" @change="onPageOrientationChange"><option value="portrait">竖版</option><option value="landscape">横版</option></select></label>
        <div class="range-label"><div class="range-heading"><span>相纸边框</span><b>{{ designOptions.frameMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.frameMm" type="range" min="0" max="24" step="0.5" aria-label="相纸边框"><input v-model.number="designOptions.frameMm" class="value-input" type="number" min="0" max="24" step="0.5" aria-label="相纸边框毫米"></div></div>
        <label class="field-label color-field">纸张底色<input v-model="designOptions.paperColor" type="color" aria-label="选择纸张底色"></label>
        <template v-if="!isCollage">
          <label class="field-label">成品版式<select v-model="designOptions.layoutPreset" @change="onPhotoLayoutChange"><option v-for="preset in photoLayoutPresets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select></label>
          <div class="layout-recommendation"><span>{{ selectedTemplate.name }} 推荐：{{ recommendedPhotoLayout.name }}</span><button class="text-button" @click="applyRecommendedPhotoLayout">套用</button></div>
          <template v-if="designOptions.layoutPreset !== 'classic'">
            <label class="field-label">成品标题<input v-model="designOptions.layoutTitle" type="text" maxlength="48" placeholder="留空时使用作品名称"></label>
            <label class="field-label">副标题<input v-model="designOptions.layoutSubtitle" type="text" maxlength="72" placeholder="可不填写"></label>
            <label class="field-label">作者 / 落款<input v-model="designOptions.layoutAuthor" type="text" maxlength="40" placeholder="例如：摄影：小林"></label>
            <div class="range-label"><div class="range-heading"><span>标题字号</span><b>{{ designOptions.layoutTitleSizeMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.layoutTitleSizeMm" type="range" min="3" max="16" step="0.5" aria-label="版式标题字号"><input v-model.number="designOptions.layoutTitleSizeMm" class="value-input" type="number" min="3" max="16" step="0.5" aria-label="版式标题字号毫米"></div></div>
            <div class="range-label"><div class="range-heading"><span>副标题字号</span><b>{{ designOptions.layoutSubtitleSizeMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.layoutSubtitleSizeMm" type="range" min="1" max="8" step="0.5" aria-label="版式副标题字号"><input v-model.number="designOptions.layoutSubtitleSizeMm" class="value-input" type="number" min="1" max="8" step="0.5" aria-label="版式副标题字号毫米"></div></div>
            <label class="field-label color-field">强调色<input v-model="designOptions.layoutAccentColor" type="color" aria-label="选择版式强调色"></label>
            <p class="adjustment-note">版式会按 {{ selectedTemplate.name }} 的实际纸张比例重新排布。照片不拉伸；标题与底栏也会写入 PNG / PDF。</p>
          </template>
        </template>
        <p v-else class="adjustment-note">当前为多照片拼贴；请在下方选择规整网格或错落拼贴并设置列数、间距。</p>
      </div>
      <div v-if="isCollage" class="control-section">
        <div class="control-title"><h2>多照片拼贴</h2><span class="control-hint">{{ collagePhotos.length }} / 15 张</span></div>
        <label class="field-label">排版方式<select v-model="designOptions.collageLayout"><option value="grid">规整网格</option><option value="masonry">错落拼贴（列高自适应）</option></select></label>
        <label class="field-label">列数<select v-model.number="designOptions.collageColumns" @change="markCollageColumnsCustomized"><option v-for="columns in [1, 2, 3, 4, 5]" :key="columns" :value="columns">{{ columns }} 列</option></select></label>
        <div class="range-label"><div class="range-heading"><span>照片间距</span><b>{{ designOptions.collageGapMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.collageGapMm" type="range" min="0" max="12" step="0.5" aria-label="照片间距"><input v-model.number="designOptions.collageGapMm" class="value-input" type="number" min="0" max="12" step="0.5" aria-label="照片间距毫米"></div></div>
        <div class="collage-photo-list"><div v-for="(photo, index) in collagePhotos" :key="photo.id" class="collage-photo-row" :class="{ selected: selectedCollagePhotoId === photo.id }"><span class="collage-photo-index">{{ index + 1 }}</span><button class="collage-photo-name" :title="photo.fileName" :aria-pressed="selectedCollagePhotoId === photo.id" @click="selectCollagePhotoById(photo.id)">{{ photo.fileName }}</button><button class="text-button" :disabled="index === 0" :aria-label="`第 ${index + 1} 张上移`" @click="moveCollagePhoto(index, -1)">↑</button><button class="text-button" :disabled="index === collagePhotos.length - 1" :aria-label="`第 ${index + 1} 张下移`" @click="moveCollagePhoto(index, 1)">↓</button><button class="text-button remove-photo-button" :aria-label="`移除第 ${index + 1} 张`" @click="removeCollagePhoto(index)">移除</button></div></div>
        <p class="adjustment-note">点击预览中的照片或下方文件名即可选择单张，然后可独立裁切、缩放、移位和调色。拼贴保持规整行列，不拉伸、不旋转。</p>
        <div v-if="selectedCollagePhoto" class="collage-photo-editor" @pointerdown.capture="beginSelectedPhotoInput" @pointerup.capture="endSelectedPhotoInput" @pointercancel.capture="endSelectedPhotoInput" @keydown.capture="beginSelectedPhotoInput" @change.capture="endSelectedPhotoInput" @focusin.capture="beginSelectedPhotoInput" @focusout.capture="endSelectedPhotoInput">
          <div class="control-title"><h3>单张调整</h3><button class="text-button" @click="resetSelectedCollagePhoto">重置此图</button></div>
          <p class="selected-photo-label" :title="selectedCollagePhoto.fileName">当前：{{ selectedCollagePhoto.fileName }}</p>
          <div class="fit-options"><button class="preset-chip" :class="{ selected: (selectedCollagePhoto.fitMode || 'contain') === 'contain' }" :aria-pressed="(selectedCollagePhoto.fitMode || 'contain') === 'contain'" @click="updateSelectedCollagePhoto({ fitMode: 'contain' })">完整显示</button><button class="preset-chip" :class="{ selected: (selectedCollagePhoto.fitMode || 'contain') === 'cover' }" :aria-pressed="(selectedCollagePhoto.fitMode || 'contain') === 'cover'" @click="updateSelectedCollagePhoto({ fitMode: 'cover' })">填满裁切</button></div>
          <div class="range-label"><div class="range-heading"><span>照片放大</span><b>{{ selectedCollagePhoto.zoomPercent || 100 }}%</b></div><div class="range-inputs"><input type="range" min="100" max="300" step="1" aria-label="本张照片放大" :value="selectedCollagePhoto.zoomPercent || 100" @input="updateSelectedCollageNumber($event, 'zoomPercent', 100, 300, 1)"><input class="value-input" type="number" min="100" max="300" step="1" aria-label="本张照片放大百分比" :value="selectedCollagePhoto.zoomPercent || 100" @change="updateSelectedCollageNumber($event, 'zoomPercent', 100, 300, 1)"></div></div>
          <div class="range-label"><div class="range-heading"><span>左右位置</span><b>{{ selectedCollagePhoto.offsetX || 0 }}</b></div><div class="range-inputs"><input type="range" min="-100" max="100" step="1" aria-label="本张照片左右位置" :value="selectedCollagePhoto.offsetX || 0" @input="updateSelectedCollageNumber($event, 'offsetX', -100, 100, 1)"><input class="value-input" type="number" min="-100" max="100" step="1" aria-label="本张照片左右位置数值" :value="selectedCollagePhoto.offsetX || 0" @change="updateSelectedCollageNumber($event, 'offsetX', -100, 100, 1)"></div></div>
          <div class="range-label"><div class="range-heading"><span>上下位置</span><b>{{ selectedCollagePhoto.offsetY || 0 }}</b></div><div class="range-inputs"><input type="range" min="-100" max="100" step="1" aria-label="本张照片上下位置" :value="selectedCollagePhoto.offsetY || 0" @input="updateSelectedCollageNumber($event, 'offsetY', -100, 100, 1)"><input class="value-input" type="number" min="-100" max="100" step="1" aria-label="本张照片上下位置数值" :value="selectedCollagePhoto.offsetY || 0" @change="updateSelectedCollageNumber($event, 'offsetY', -100, 100, 1)"></div></div>
          <p class="adjustment-note">位置调整会随照片放大或填满裁切一起生效；超出单元格的部分会被裁去，不会盖到相邻照片。</p>
          <div class="photo-adjustment-list">
            <div v-for="item in collageAdjustmentControls" :key="item.key" class="range-label">
              <div class="range-heading"><label :for="`photo-adjustment-${item.key}`">{{ item.name }}（本张）</label><b>{{ selectedCollagePhoto.adjustments?.[item.key] || 0 }}</b></div>
              <div class="range-inputs"><input :id="`photo-adjustment-${item.key}`" type="range" :min="item.min" :max="item.max" :step="item.step" :value="selectedCollagePhoto.adjustments?.[item.key] || 0" @input="updateSelectedCollageAdjustment($event, item)"><input class="value-input" type="number" :min="item.min" :max="item.max" :step="item.step" :aria-label="item.name + '本张数值'" :value="selectedCollagePhoto.adjustments?.[item.key] || 0" @change="updateSelectedCollageAdjustment($event, item)"></div>
            </div>
          </div>
          <p class="adjustment-note">本张数值是在全局调色基础上的额外微调；设为 0 表示只使用全局值。调整在导出和保存作品时都会保留。</p>
        </div>
        <p class="adjustment-note">大尺寸打印清晰度取决于原图像素；放大裁切可能降低局部清晰度。</p>
      </div>
      <div v-if="!isCollage" class="control-section">
        <div class="control-title"><h2>裁切与放大</h2><button class="text-button" :disabled="!imageData" @click="resetPhotoLayout">重置位置</button></div>
        <div class="fit-options"><button class="preset-chip" :class="{ selected: designOptions.fitMode === 'contain' }" :aria-pressed="designOptions.fitMode === 'contain'" :disabled="!imageData" @click="designOptions.fitMode = 'contain'">完整显示</button><button class="preset-chip" :class="{ selected: designOptions.fitMode === 'cover' }" :aria-pressed="designOptions.fitMode === 'cover'" :disabled="!imageData" @click="designOptions.fitMode = 'cover'">填满裁切</button></div>
        <div class="range-label"><div class="range-heading"><span>照片放大</span><b>{{ designOptions.zoomPercent }}%</b></div><div class="range-inputs"><input v-model.number="designOptions.zoomPercent" type="range" min="100" max="300" step="1" aria-label="照片放大" :disabled="!imageData"><input v-model.number="designOptions.zoomPercent" class="value-input" type="number" min="100" max="300" step="1" aria-label="照片放大百分比" :disabled="!imageData"></div></div>
        <div class="range-label"><div class="range-heading"><span>左右位置</span><b>{{ designOptions.offsetX }}</b></div><div class="range-inputs"><input v-model.number="designOptions.offsetX" type="range" min="-100" max="100" step="1" aria-label="左右位置" :disabled="!imageData"><input v-model.number="designOptions.offsetX" class="value-input" type="number" min="-100" max="100" step="1" aria-label="左右位置数值" :disabled="!imageData"></div></div>
        <div class="range-label"><div class="range-heading"><span>上下位置</span><b>{{ designOptions.offsetY }}</b></div><div class="range-inputs"><input v-model.number="designOptions.offsetY" type="range" min="-100" max="100" step="1" aria-label="上下位置" :disabled="!imageData"><input v-model.number="designOptions.offsetY" class="value-input" type="number" min="-100" max="100" step="1" aria-label="上下位置数值" :disabled="!imageData"></div></div>
        <button class="button small rotate-button" :disabled="!imageData" @click="rotatePhoto">旋转 90°（当前 {{ designOptions.rotation }}°）</button>
        <p class="adjustment-note">“填满裁切”会让照片铺满纸张内框，超出部分不导出；可用位置滑杆调整保留区域。原图不改写。</p>
      </div>
      <div v-if="!isCollage" class="control-section">
        <div class="control-title"><h2>光影边框风格</h2><span class="control-hint">单张照片</span></div>
        <label class="toggle-field"><input v-model="designOptions.lightFrameEnabled" type="checkbox" :disabled="!imageData || designOptions.layoutPreset !== 'classic'"><span>启用清晰主体＋虚化背景＋参数底栏</span></label>
        <p v-if="designOptions.layoutPreset !== 'classic'" class="adjustment-note">光影边框与成品版式目前分开使用；切回“经典留白”后可启用。</p>
        <div v-if="designOptions.lightFrameEnabled" class="light-frame-options" @pointerdown.capture="beginSelectedPhotoInput" @pointerup.capture="endSelectedPhotoInput" @pointercancel.capture="endSelectedPhotoInput" @keydown.capture="beginSelectedPhotoInput" @change.capture="endSelectedPhotoInput" @focusin.capture="beginSelectedPhotoInput" @focusout.capture="endSelectedPhotoInput">
          <label class="field-label">Logo 文字<input v-model="designOptions.lightFrameLogoText" type="text" maxlength="32" placeholder="留空时自动使用相机品牌"></label>
          <label class="toggle-field"><input v-model="designOptions.lightFrameShowMetadata" type="checkbox"><span>显示镜头与拍摄参数</span></label>
          <div class="range-label"><div class="range-heading"><span>照片圆角</span><b>{{ designOptions.lightFrameRadiusMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.lightFrameRadiusMm" type="range" min="0" max="12" step="0.5" aria-label="照片圆角"><input v-model.number="designOptions.lightFrameRadiusMm" class="value-input" type="number" min="0" max="12" step="0.5" aria-label="照片圆角毫米"></div></div>
          <div class="range-label"><div class="range-heading"><span>Logo 大小</span><b>{{ designOptions.lightFrameLogoSizeMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.lightFrameLogoSizeMm" type="range" min="1" max="8" step="0.5" aria-label="Logo 大小"><input v-model.number="designOptions.lightFrameLogoSizeMm" class="value-input" type="number" min="1" max="8" step="0.5" aria-label="Logo 大小毫米"></div></div>
          <div class="range-label"><div class="range-heading"><span>参数字号</span><b>{{ designOptions.lightFrameMetadataSizeMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.lightFrameMetadataSizeMm" type="range" min="1" max="5" step="0.25" aria-label="参数字号"><input v-model.number="designOptions.lightFrameMetadataSizeMm" class="value-input" type="number" min="1" max="5" step="0.25" aria-label="参数字号毫米"></div></div>
          <label class="field-label color-field">Logo / 参数颜色<input v-model="designOptions.lightFrameLogoColor" type="color" aria-label="选择Logo和参数文字颜色"></label>
          <div class="range-label"><div class="range-heading"><span>背景模糊</span><b>{{ designOptions.backgroundBlur }} px</b></div><div class="range-inputs"><input v-model.number="designOptions.backgroundBlur" type="range" min="0" max="48" step="1" aria-label="光影边框背景模糊"><input v-model.number="designOptions.backgroundBlur" class="value-input" type="number" min="0" max="48" step="1" aria-label="光影边框背景模糊像素"></div></div>
          <div class="range-label"><div class="range-heading"><span>背景放大</span><b>{{ designOptions.backgroundZoom }}%</b></div><div class="range-inputs"><input v-model.number="designOptions.backgroundZoom" type="range" min="100" max="220" step="1" aria-label="光影边框背景放大"><input v-model.number="designOptions.backgroundZoom" class="value-input" type="number" min="100" max="220" step="1" aria-label="光影边框背景放大百分比"></div></div>
          <div class="range-label"><div class="range-heading"><span>照片边框</span><b>{{ designOptions.lightFrameBorderMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.lightFrameBorderMm" type="range" min="0" max="24" step="0.5" aria-label="光影边框照片边框"><input v-model.number="designOptions.lightFrameBorderMm" class="value-input" type="number" min="0" max="24" step="0.5" aria-label="光影边框照片边框毫米"></div></div>
          <div class="range-label"><div class="range-heading"><span>底栏高度</span><b>{{ designOptions.lightFrameBottomMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.lightFrameBottomMm" type="range" min="4" max="32" step="0.5" aria-label="参数底栏高度"><input v-model.number="designOptions.lightFrameBottomMm" class="value-input" type="number" min="4" max="32" step="0.5" aria-label="参数底栏高度毫米"></div></div>
          <div class="range-label"><div class="range-heading"><span>阴影柔化</span><b>{{ designOptions.lightFrameShadowSizeMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.lightFrameShadowSizeMm" type="range" min="0" max="20" step="0.5" aria-label="阴影柔化"><input v-model.number="designOptions.lightFrameShadowSizeMm" class="value-input" type="number" min="0" max="20" step="0.5" aria-label="阴影柔化毫米"></div></div>
          <div class="range-label"><div class="range-heading"><span>阴影 / 底栏深度</span><b>{{ designOptions.lightFrameShadowDepth }}%</b></div><div class="range-inputs"><input v-model.number="designOptions.lightFrameShadowDepth" type="range" min="0" max="100" step="1" aria-label="阴影和底栏深度"><input v-model.number="designOptions.lightFrameShadowDepth" class="value-input" type="number" min="0" max="100" step="1" aria-label="阴影和底栏深度百分比"></div></div>
          <label class="field-label color-field">阴影 / 底栏颜色<input v-model="designOptions.lightFrameShadowColor" type="color" aria-label="选择阴影和底栏颜色"></label>
          <p class="adjustment-note">前景照片保持清晰，放大模糊图填满底色；底栏自动读取原片里已有的相机、镜头、参数和时间。缺失的 EXIF 不会补造。效果会用于 PNG 和打印 PDF。</p>
        </div>
      </div>
      <div v-if="!isCollage && !designOptions.lightFrameEnabled" class="control-section">
        <div class="control-title"><h2>照片放大虚化背景</h2><span class="control-hint">单张照片</span></div>
        <label class="toggle-field"><input v-model="designOptions.blurBackground" type="checkbox" :disabled="!imageData"><span>使用照片放大模糊作为底图</span></label>
        <template v-if="designOptions.blurBackground">
          <div class="range-label"><div class="range-heading"><span>背景模糊</span><b>{{ designOptions.backgroundBlur }} px</b></div><div class="range-inputs"><input v-model.number="designOptions.backgroundBlur" type="range" min="0" max="48" step="1" aria-label="背景模糊"><input v-model.number="designOptions.backgroundBlur" class="value-input" type="number" min="0" max="48" step="1" aria-label="背景模糊像素"></div></div>
          <div class="range-label"><div class="range-heading"><span>背景放大</span><b>{{ designOptions.backgroundZoom }}%</b></div><div class="range-inputs"><input v-model.number="designOptions.backgroundZoom" type="range" min="100" max="220" step="1" aria-label="背景放大"><input v-model.number="designOptions.backgroundZoom" class="value-input" type="number" min="100" max="220" step="1" aria-label="背景放大百分比"></div></div>
        </template>
        <p class="adjustment-note">模糊背景只用于填满整张纸，前景照片仍保持清晰；浏览器和设备性能会影响大图处理速度。</p>
      </div>
      <div class="control-section">
        <div class="control-title"><h2>水印与拍摄信息</h2><span class="control-hint">本机读取 EXIF</span></div>
        <label class="toggle-field"><input v-model="designOptions.watermarkEnabled" type="checkbox" :disabled="!imageData"><span>在成品上添加水印</span></label>
        <template v-if="designOptions.watermarkEnabled">
          <label class="field-label">作者 / 自定义文字<input v-model="designOptions.watermarkText" type="text" maxlength="100" placeholder="例如：摄影：你的名字"></label>
          <label class="toggle-field"><input v-model="designOptions.watermarkIncludeMetadata" type="checkbox" :disabled="!imageData || isCollage"><span>附加照片可读取的 EXIF 参数</span></label>
          <label class="field-label">水印位置<select v-model="designOptions.watermarkPosition"><option value="top-left">左上</option><option value="top-center">上方居中</option><option value="top-right">右上</option><option value="bottom-left">左下</option><option value="bottom-center">下方居中</option><option value="bottom-right">右下</option></select></label>
          <div class="range-label"><div class="range-heading"><span>字号</span><b>{{ designOptions.watermarkFontSizeMm }} mm</b></div><div class="range-inputs"><input v-model.number="designOptions.watermarkFontSizeMm" type="range" min="2" max="18" step="0.5" aria-label="水印字号"><input v-model.number="designOptions.watermarkFontSizeMm" class="value-input" type="number" min="2" max="18" step="0.5" aria-label="水印字号毫米"></div></div>
          <div class="range-label"><div class="range-heading"><span>透明度</span><b>{{ designOptions.watermarkOpacity }}%</b></div><div class="range-inputs"><input v-model.number="designOptions.watermarkOpacity" type="range" min="10" max="100" step="1" aria-label="水印透明度"><input v-model.number="designOptions.watermarkOpacity" class="value-input" type="number" min="10" max="100" step="1" aria-label="水印透明度百分比"></div></div>
          <label class="field-label color-field">水印颜色<input v-model="designOptions.watermarkColor" type="color" aria-label="选择水印颜色"></label>
          <p class="adjustment-note">单张照片可选添加相机、镜头、焦距、光圈、快门、ISO 和拍摄时间；原图没有记录的参数不会补造。水印只绘入导出成品，不改写原图。</p>
        </template>
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
.editor-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;align-items:stretch;flex:1;min-height:0;overflow:hidden}.preview-column{min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain}.upload-zone{min-height:490px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-style:dashed;background:#fbfbf9;cursor:pointer}.upload-mark{display:grid;place-items:center;width:54px;height:54px;border-radius:18px;background:#efefe9;font-size:24px;color:#686a60}.upload-zone h2{font-size:17px;margin:18px 0 6px}.upload-zone p{font-size:11px;color:#92948b;margin:0 0 18px}.paste-hint{margin-top:14px;color:#7f8178;font-size:10px}.upload-zone small{margin-top:20px;color:#b0b1aa;font-size:9px}.collage-upload-button{margin-top:8px}
.preview-wrap{background:#f0f0eb;border:1px solid #e6e6df;border-radius:11px;overflow:hidden}.preview-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#fff}.preview-toolbar span{display:grid;gap:4px}.preview-toolbar b{font-size:11px}.preview-toolbar small{font-size:9px;color:#9a9b93}.preview-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.canvas-stage{min-height:430px;display:grid;place-items:center;padding:35px;background:#eeeee9}.print-canvas{width:min(74%,410px);max-height:500px;background:white;box-shadow:none;display:flex;align-items:center;justify-content:center;overflow:hidden}.photo-preview-canvas{display:block;width:100%;height:100%;object-fit:contain}.photo-preview-canvas.collage-selectable{cursor:crosshair}.preview-foot{background:#fff;padding:10px 13px;display:flex;justify-content:space-between;gap:8px;font-size:9px;color:#96978f}
.export-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.export-row>span{font-size:9px;color:#96978e;margin-left:auto}.export-spec{margin-top:7px;color:#72746c;font-size:9px}.notice{margin-top:10px;background:#edf1e9;border:1px solid #e1e8db;padding:10px 12px;border-radius:7px;color:#5f7059;font-size:10px}
.controls{position:static;align-self:stretch;height:100%;min-height:0;max-height:none;overflow-y:auto;overscroll-behavior:contain;padding:0 16px;scrollbar-width:thin;scrollbar-color:#d6d7cf transparent}.control-section{padding:17px 0;border-bottom:1px solid #efefeb}.control-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.control-title h2{font-size:12px;margin:0;font-weight:600}.text-button{border:0;background:none;color:#797b72;font-size:9px}.text-button:disabled{color:#c3c4be}.history-actions{display:flex;gap:8px}
.field-label{display:grid;gap:7px;font-size:9px;color:#777970;margin-top:12px}.field-label input,.field-label select{width:100%;height:35px;border:1px solid #e5e5df;border-radius:6px;padding:0 9px;color:#4a4b44;background:white;font-size:10px;outline:none}.field-label input:focus,.field-label select:focus{border-color:#a8aa9e}
.field-label.color-field input[type=color]{width:100%;height:32px;padding:3px;cursor:pointer}.fit-options{display:grid;grid-template-columns:1fr 1fr;gap:6px}.fit-options .preset-chip{height:34px}.rotate-button{margin-top:13px}.toggle-field{display:flex;align-items:center;gap:8px;color:#6f7168;font-size:10px}.toggle-field input{accent-color:#56594e}
.layout-recommendation{display:flex;justify-content:space-between;align-items:center;margin-top:9px;padding:9px 10px;border:1px solid #e8e8e2;border-radius:6px;background:#fafaf8;color:#777970;font-size:9px}.layout-recommendation .text-button{color:#56594e;font-weight:600}
.collage-photo-list{display:grid;gap:6px;margin-top:14px}.collage-photo-row{display:grid;grid-template-columns:18px minmax(0,1fr) 20px 20px 34px;align-items:center;gap:5px;border-bottom:1px solid #f0f0ec;padding:5px 0}.collage-photo-row.selected{background:#f1f2ed;border-radius:5px}.collage-photo-index{color:#9a9b93;font-size:9px;text-align:center}.collage-photo-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#65675e;font-size:9px;border:0;background:transparent;text-align:left;padding:3px 4px;cursor:pointer}.collage-photo-row.selected .collage-photo-name{color:#30312c;font-weight:600}.collage-photo-row .text-button{padding:3px 0}.collage-photo-row .text-button:disabled{opacity:.35}.remove-photo-button{color:#9a6a62!important}.collage-photo-editor{margin-top:16px;padding-top:13px;border-top:1px solid #e8e9e2}.collage-photo-editor h3{font-size:11px;margin:0;font-weight:600}.selected-photo-label{margin:0 0 11px;color:#777970;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.photo-adjustment-list{margin-top:11px;padding-top:10px;border-top:1px solid #efefeb}.light-frame-options{display:grid;gap:8px;margin-top:12px}
.range-label{display:grid;gap:8px;margin-top:14px}.range-heading{display:flex;justify-content:space-between;align-items:baseline;color:#76786f;font-size:9px}.range-heading label{cursor:pointer}.range-heading b{color:#565850;font-weight:500}.range-inputs{display:grid;grid-template-columns:minmax(0,1fr) 72px;gap:8px;align-items:center}.range-inputs input[type=range]{width:100%;accent-color:#56594e;height:13px}.range-inputs .value-input{width:72px;height:28px;border:1px solid #e5e5df;border-radius:5px;padding:0 5px;color:#4a4b44;background:white;font-size:10px;text-align:right}.range-inputs .value-input:focus{border-color:#a8aa9e;outline:none}
.preset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.preset-chip{height:31px;border:1px solid #e8e8e2;background:white;border-radius:6px;font-size:9px;color:#777970}.preset-chip.selected{border-color:#777a6e;background:#f2f2ee;color:#373930}
.preset-groups{display:grid;gap:12px}.preset-group{display:grid;gap:6px}.preset-group-title{font-size:9px;color:#96978e}
.adjustment-note{margin:10px 0 0;color:#96978e;font-size:9px;line-height:1.6}.preset-custom{margin-top:8px;color:#56594e;font-size:9px}
.privacy-note{display:flex;gap:9px;padding:14px 0;color:#7c7e75}.privacy-note>span{color:#87977f;font-size:14px}.privacy-note p{margin:0;font-size:9px;line-height:1.7}.privacy-note b{font-size:9px;color:#5b5d55}
@media(max-width:1000px){.editor-page{height:auto;min-height:0;overflow:visible}.editor-layout{grid-template-columns:1fr;display:grid;flex:none;min-height:0;overflow:visible;align-items:start}.preview-column{min-height:0;overflow:visible}.controls{position:static;height:auto;min-height:0;max-height:none;overflow:visible;display:grid;grid-template-columns:1fr 1fr;column-gap:20px}.privacy-note{grid-column:1/-1}}
@media(max-width:620px){.editor-heading{align-items:start;flex-direction:column}.workflow{gap:5px;overflow-x:auto}.workflow i{width:12px;flex-shrink:0}.workflow-skip{display:none}.canvas-stage{min-height:340px;padding:20px}.print-canvas{width:min(90%,400px)}.preview-foot{gap:8px;flex-direction:column}.export-row>span{width:100%;margin:0}.controls{display:block}}
@media(max-width:720px){.preview-toolbar{align-items:flex-start;flex-direction:column}.preview-actions{width:100%;flex-wrap:wrap}}
</style>
