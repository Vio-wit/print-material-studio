<script setup lang="ts">
import { PDFDocument } from "pdf-lib";
import { printTemplates } from "../composables/useTemplates";
import { useLocalStudio } from "../composables/useLocalStudio";
import type { EditSettings, StudioWork } from "../types/studio";

const route = useRoute();
const studio = useLocalStudio();
const { inspectImage } = useApi();
const imageData = ref("");
const fileName = ref("");
const title = ref("未命名作品");
const templateId = ref("photo-4x6");
const marginMm = ref(6);
const busy = ref(false);
const notice = ref("");
const cameraInfo = ref("");
const settings = reactive<EditSettings>({ brightness: 0, contrast: 0, saturation: 0, warmth: 0, preset: "原片" });
const imageInput = ref<HTMLInputElement | null>(null);

const selectedTemplate = computed(() => printTemplates.find((item) => item.id === templateId.value) || printTemplates[0]!);
const aspectRatio = computed(() => selectedTemplate.value.widthMm + " / " + selectedTemplate.value.heightMm);
const imageFilter = computed(() => filterForSettings(settings));
const imageStyle = computed(() => ({ filter: imageFilter.value }));
const filters = ["原片", "明亮", "通透", "鲜活", "暖调", "黑白"];
const outputDpi = 300;
const outputWidth = computed(() => Math.round(selectedTemplate.value.widthMm / 25.4 * outputDpi));
const outputHeight = computed(() => Math.round(selectedTemplate.value.heightMm / 25.4 * outputDpi));

const presetSettings: Record<string, Omit<EditSettings, "preset">> = {
  "原片": { brightness: 0, contrast: 0, saturation: 0, warmth: 0 },
  "明亮": { brightness: 8, contrast: 0, saturation: 0, warmth: 0 },
  "通透": { brightness: 0, contrast: 10, saturation: 0, warmth: 0 },
  "鲜活": { brightness: 0, contrast: 0, saturation: 18, warmth: 0 },
  "暖调": { brightness: 0, contrast: 0, saturation: 0, warmth: 15 },
  "黑白": { brightness: 0, contrast: 0, saturation: -100, warmth: 0 }
};

function filterForSettings(values: Pick<EditSettings, "brightness" | "contrast" | "saturation" | "warmth">) {
  return "brightness(" + (100 + values.brightness) + "%) contrast(" + (100 + values.contrast) + "%) saturate(" + (100 + values.saturation) + "%) sepia(" + values.warmth + "%)";
}

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
  }
  window.addEventListener("paste", handlePaste);
});
onBeforeUnmount(() => window.removeEventListener("paste", handlePaste));

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
    fileName.value = file.name;
    title.value = file.name.replace(/\.[^.]+$/, "");
    notice.value = "照片已载入。原图不会被覆盖，调整可以随时修改。";
    cameraInfo.value = "";
    inspectImage(file).then((info) => {
      const fields = [info.make, info.camera, info.lens].filter(Boolean);
      cameraInfo.value = fields.join(" · ") || (info.width + " × " + info.height + " px");
    }).catch((error) => {
      cameraInfo.value = error instanceof TypeError
        ? "图片信息服务未连接；照片编辑仍可用。"
        : "暂时无法读取相机信息；照片编辑仍可用。";
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

function migrateLegacySettings(saved: EditSettings): EditSettings {
  const restored = { ...saved };
  if (restored.preset === "明亮") restored.brightness += 8;
  if (restored.preset === "通透") restored.contrast += 10;
  if (restored.preset === "鲜活") restored.saturation += 18;
  if (restored.preset === "暖调") restored.warmth += 15;
  if (restored.preset === "黑白") restored.saturation = -100;
  return restored;
}

function applyPreset(preset: string) {
  const values = presetSettings[preset];
  if (!values) return;
  Object.assign(settings, values, { preset });
}

function resetSettings() {
  settings.brightness = 0;
  settings.contrast = 0;
  settings.saturation = 0;
  settings.warmth = 0;
  settings.preset = "原片";
}

async function createExportCanvas(): Promise<HTMLCanvasElement> {
  const dpi = outputDpi;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(selectedTemplate.value.widthMm / 25.4 * dpi);
  canvas.height = Math.round(selectedTemplate.value.heightMm / 25.4 * dpi);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建图片画布");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!imageData.value) return canvas;
  const image = new Image();
  image.src = imageData.value;
  await image.decode();
  const inset = Math.round(marginMm.value / 25.4 * dpi);
  const maxWidth = canvas.width - inset * 2;
  const maxHeight = canvas.height - inset * 2;
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.save();
  context.filter = imageFilter.value;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  context.restore();
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
    notice.value = "已导出 " + outputWidth.value + " × " + outputHeight.value + " px PNG，并写入 300 DPI 分辨率标记；照片按比例放入画布。";
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
  if (key === "warmth") return value + "% 棕褐叠加";
  const adjustment = (value > 0 ? "+" : "") + value + "%";
  return adjustment + " → " + (100 + value) + "%";
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
        <div class="preview-toolbar"><span><b>画布预览</b><small>{{ selectedTemplate.name }} · 白色纸张</small></span><button class="button small" @click="imageInput?.click()">换一张</button><input ref="imageInput" type="file" accept="image/*" hidden @change="onChoose"></div>
        <div class="canvas-stage">
          <div class="print-canvas" :style="{ aspectRatio, padding: marginMm / 2 + '%' }">
            <img :src="imageData" :style="imageStyle" alt="照片预览">
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
        <label class="range-label"><span>纸张留白 <b>{{ marginMm }} mm</b></span><input v-model.number="marginMm" type="range" min="0" max="20" step="1"></label>
      </div>
      <div class="control-section"><div class="control-title"><h2>快速色调</h2><span class="control-hint">可叠加微调</span></div>
        <div class="preset-grid"><button v-for="filter in filters" :key="filter" class="preset-chip" :class="{ selected: settings.preset === filter }" @click="applyPreset(filter)">{{ filter }}</button></div>
        <div v-if="settings.preset === '自定义'" class="preset-custom" role="status">自定义 · 参数已按下面滑杆显示</div>
        <p class="adjustment-note">预设是本应用的通用近似效果，不是尼康、佳能或索尼的官方滤镜。</p>
      </div>
      <div class="control-section"><div class="control-title"><h2>手动调整</h2><span class="control-hint">效果可撤回</span></div>
        <label v-for="item in [
          { key: 'brightness', name: '亮度' },
          { key: 'contrast', name: '对比度' },
          { key: 'saturation', name: '鲜艳度' },
          { key: 'warmth', name: '暖色叠加' }
        ]" :key="item.key" class="range-label"><span>{{ item.name }} <b>{{ formatSetting(item.key) }}</b></span><input v-model.number="settings[item.key as keyof EditSettings]" type="range" :min="item.key === 'saturation' ? -100 : item.key === 'warmth' ? 0 : -50" max="50" step="1" @input="settings.preset = '自定义'"></label>
        <p class="adjustment-note">数值显示“调整量 → 实际滤镜值”；暖色是棕褐叠加强度，不是曝光 EV 或相机色温。</p>
      </div>
      <div class="privacy-note"><span>◉</span><p><b>你的照片留在本机</b><br>作品保存到当前浏览器，不会自动上传。请定期导出备份。</p></div>
    </aside>
  </div>
</template>

<style scoped>
.editor-heading{display:flex;justify-content:space-between;align-items:end;gap:20px}.heading-actions{display:flex;gap:8px}
.workflow{display:flex;align-items:center;gap:9px;padding:17px 0 20px;color:#b0b1aa;font-size:10px}.workflow span{white-space:nowrap}.workflow b{display:inline-grid;place-items:center;width:20px;height:20px;border:1px solid #dedfd8;border-radius:50%;font-size:9px;margin-right:5px;font-weight:500}.workflow .current{color:#4e5148}.workflow .current b{background:#30312c;color:white;border-color:#30312c}.workflow i{height:1px;background:#e5e6df;width:34px}.workflow-skip{margin-left:auto;color:#9c9e95}
.editor-layout{display:grid;grid-template-columns:minmax(0,1fr) 310px;gap:16px;align-items:start}.preview-column{min-width:0}.upload-zone{min-height:490px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-style:dashed;background:#fbfbf9;cursor:pointer}.upload-mark{display:grid;place-items:center;width:54px;height:54px;border-radius:18px;background:#efefe9;font-size:24px;color:#686a60}.upload-zone h2{font-size:17px;margin:18px 0 6px}.upload-zone p{font-size:11px;color:#92948b;margin:0 0 18px}.paste-hint{margin-top:14px;color:#7f8178;font-size:10px}.upload-zone small{margin-top:20px;color:#b0b1aa;font-size:9px}
.preview-wrap{background:#f0f0eb;border:1px solid #e6e6df;border-radius:11px;overflow:hidden}.preview-toolbar{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#fff}.preview-toolbar span{display:grid;gap:4px}.preview-toolbar b{font-size:11px}.preview-toolbar small{font-size:9px;color:#9a9b93}.canvas-stage{min-height:430px;display:grid;place-items:center;padding:35px;background:#eeeee9}.print-canvas{width:min(74%,410px);max-height:500px;background:white;box-shadow:none;display:flex;align-items:center;justify-content:center;overflow:hidden}.print-canvas img{width:100%;height:100%;object-fit:contain}.preview-foot{background:#fff;padding:10px 13px;display:flex;justify-content:space-between;font-size:9px;color:#96978f}
.export-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}.export-row>span{font-size:9px;color:#96978e;margin-left:auto}.export-spec{margin-top:7px;color:#72746c;font-size:9px}.notice{margin-top:10px;background:#edf1e9;border:1px solid #e1e8db;padding:10px 12px;border-radius:7px;color:#5f7059;font-size:10px}
.controls{padding:0 16px}.control-section{padding:17px 0;border-bottom:1px solid #efefeb}.control-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.control-title h2{font-size:12px;margin:0;font-weight:600}.text-button{border:0;background:none;color:#797b72;font-size:9px}.control-hint{font-size:9px;color:#a1a29b}
.field-label{display:grid;gap:7px;font-size:9px;color:#777970;margin-top:12px}.field-label input,.field-label select{width:100%;height:35px;border:1px solid #e5e5df;border-radius:6px;padding:0 9px;color:#4a4b44;background:white;font-size:10px;outline:none}.field-label input:focus,.field-label select:focus{border-color:#a8aa9e}
.range-label{display:grid;gap:8px;margin-top:14px}.range-label span{display:flex;justify-content:space-between;color:#76786f;font-size:9px}.range-label b{color:#565850;font-weight:500}.range-label input{width:100%;accent-color:#56594e;height:13px}
.preset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.preset-chip{height:31px;border:1px solid #e8e8e2;background:white;border-radius:6px;font-size:9px;color:#777970}.preset-chip.selected{border-color:#777a6e;background:#f2f2ee;color:#373930}
.adjustment-note{margin:10px 0 0;color:#96978e;font-size:9px;line-height:1.6}.preset-custom{margin-top:8px;color:#56594e;font-size:9px}
.privacy-note{display:flex;gap:9px;padding:14px 0;color:#7c7e75}.privacy-note>span{color:#87977f;font-size:14px}.privacy-note p{margin:0;font-size:9px;line-height:1.7}.privacy-note b{font-size:9px;color:#5b5d55}
@media(max-width:1000px){.editor-layout{grid-template-columns:1fr}.controls{display:grid;grid-template-columns:1fr 1fr;column-gap:20px}.privacy-note{grid-column:1/-1}}
@media(max-width:620px){.editor-heading{align-items:start;flex-direction:column}.workflow{gap:5px;overflow-x:auto}.workflow i{width:12px;flex-shrink:0}.workflow-skip{display:none}.canvas-stage{min-height:340px;padding:20px}.print-canvas{width:min(90%,400px)}.preview-foot{gap:8px;flex-direction:column}.export-row>span{width:100%;margin:0}.controls{display:block}}
</style>
