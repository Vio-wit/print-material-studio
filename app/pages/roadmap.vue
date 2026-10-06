<script setup lang="ts">
interface WishlistItem { id: string; title: string; detail: string; status: string }
const starterItems: WishlistItem[] = [
  { id: "collage", title: "多照片拼贴排版", detail: "导入多张横竖照片，自动排成规整但有变化的网格；统一间距、白边和纸张背景。", status: "计划中 · 未开发" },
  { id: "crop", title: "基础裁切与旋转", detail: "自由裁切、常用比例、旋转和画布内位置微调；保留原图，随时能改回来。", status: "计划中 · 未开发" },
  { id: "frames", title: "相纸边框与纸张背景", detail: "自定义边框宽度、颜色、纸张底色和简单纹理；不加阴影也能做拍立得感。", status: "计划中 · 未开发" },
  { id: "blur-background", title: "照片放大虚化背景", detail: "用同一张照片铺满并虚化背景，主体照片保持清晰；可调整模糊和缩放。", status: "待探索 · 未开发" },
  { id: "watermark-exif", title: "作者水印与相机参数", detail: "自定义作者名字，或把拍摄时间、相机、镜头、光圈、快门等信息排成可选水印。", status: "计划中 · 未开发" },
  { id: "presets", title: "更多调色模板与自定义预设", detail: "增加可预览的色调方案，并允许保存自己常用的一组调整参数。", status: "计划中 · 未开发" },
  { id: "batch-sizes", title: "成套尺寸与批量导出", detail: "同一个设计快速生成多种相纸或宣传物尺寸，并检查留白和分辨率。", status: "待探索 · 未开发" },
  { id: "poster", title: "海报与宣传单", detail: "可调网格、文字层级、图片与印刷尺寸。", status: "计划中 · 未开发" },
  { id: "booklet", title: "小册子与自制出版物", detail: "页码、跨页、封面、装订与印刷导出。", status: "计划中 · 未开发" },
  { id: "newspaper", title: "报纸 / 杂志版式", detail: "多栏排版、标题、图片说明和可复用版面。", status: "待探索 · 未开发" },
  { id: "music", title: "CD、唱片与音乐周边", detail: "封套、盘面、歌词页和尺寸模板。", status: "待探索 · 未开发" },
  { id: "drawing", title: "轻量绘画与页面装饰", detail: "在照片或书页上画线、贴图、加简单图案。", status: "待探索 · 未开发" },
  { id: "showcase", title: "个人作品展示页", detail: "作品整理成可以分享的线上主页；需另做发布与隐私设置。", status: "待探索 · 未开发" },
  { id: "cutout", title: "本地 AI 抠图", detail: "在自己的电脑处理图片；需要先评估模型体积和运行速度。", status: "待评估 · 未开发" },
  { id: "raw", title: "相机 RAW 原片支持", detail: "先研究开源解码库和相机兼容范围，暂不承诺机型覆盖。", status: "待评估 · 未开发" },
  { id: "three-d", title: "3D / 立体物料预览", detail: "当前不急，先把平面与印刷物料做好。", status: "暂缓 · 未开发" }
];
const items = ref<WishlistItem[]>([]);
const newTitle = ref("");
const newDetail = ref("");
const statusOptions = ["计划中", "计划中 · 未开发", "待探索", "待探索 · 未开发", "待评估", "待评估 · 未开发", "暂缓 · 未开发"];

onMounted(() => {
  try {
    const saved = localStorage.getItem("studio-wishlist-v1");
    items.value = saved ? JSON.parse(saved) as WishlistItem[] : starterItems;
  } catch {
    items.value = starterItems;
  }
});

function persist() {
  localStorage.setItem("studio-wishlist-v1", JSON.stringify(items.value));
}

function addItem() {
  const title = newTitle.value.trim();
  if (!title) return;
  items.value.unshift({ id: globalThis.crypto?.randomUUID?.() || Date.now().toString(), title, detail: newDetail.value.trim() || "尚未补充说明。", status: "待探索" });
  newTitle.value = "";
  newDetail.value = "";
  persist();
}

function removeItem(id: string) {
  items.value = items.value.filter((item) => item.id !== id);
  persist();
}

function updateStatus() {
  persist();
}
</script>

<template>
  <div class="eyebrow">IDEAS / ROADMAP</div><h1 class="page-title">想做清单</h1><p class="page-subtitle">先记下来，不代表马上开发。当前优先把照片、纸张模板、导出和作品留存做好。</p>
  <section class="focus-card card"><div class="focus-number">NOW</div><div><strong>现在先做：照片与平面物料</strong><p>调整照片 → 放进相纸 / 卡片尺寸 → 导出打印文件 → 保存作品。3D 先放一边。</p></div><NuxtLink to="/editor" class="button small">开始制作 →</NuxtLink></section>
  <div class="section-heading"><div><h2>以后想做的物料与功能</h2><p>状态可以随时调整，也可以添加自己的想法。</p></div><span class="idea-count">{{ items.length }} 个想法</span></div>
  <div class="idea-list">
    <article v-for="(item, index) in items" :key="item.id" class="idea-card card"><div class="idea-number">{{ String(index + 1).padStart(2, "0") }}</div><div class="idea-copy"><h3>{{ item.title }}</h3><p>{{ item.detail }}</p></div><select v-model="item.status" class="status-select" :class="{ paused: item.status.includes('暂缓') }" aria-label="想法状态" @change="updateStatus"><option v-for="status in statusOptions" :key="status">{{ status }}</option></select><button class="remove-idea" aria-label="移除想法" title="移除想法" @click="removeItem(item.id)">×</button></article>
  </div>
  <section class="add-idea card"><div><h2>记一个新想法</h2><p>把突然想到的物料或工具先放进清单。</p></div><form @submit.prevent="addItem"><input v-model="newTitle" required maxlength="80" placeholder="例如：旅行手账页模板"><input v-model="newDetail" maxlength="180" placeholder="简单写一句你想要它做什么"><button class="button primary">添加</button></form></section>
  <p class="roadmap-foot">这里是个人开发清单，不是已经实现的功能说明。所有新增想法只存在本机浏览器。</p>
</template>

<style scoped>
.focus-card{display:flex;align-items:center;gap:14px;padding:16px;margin-top:23px;background:#f0f1eb}.focus-number{font-size:10px;font-weight:700;letter-spacing:.12em;color:#75846e;background:#e0e6da;border-radius:7px;padding:8px}.focus-card>div:nth-child(2){flex:1}.focus-card strong{font-size:11px}.focus-card p{margin:5px 0 0;color:#7f8177;font-size:10px}.section-heading{margin-top:27px}.idea-count{font-size:9px;color:#96978f}.idea-list{display:grid;gap:8px}.idea-card{display:flex;align-items:center;gap:13px;padding:13px 15px}.idea-number{font-size:10px;color:#adb0a5;width:23px}.idea-copy{flex:1}.idea-copy h3{font-size:11px;margin:0;font-weight:600}.idea-copy p{font-size:9px;line-height:1.6;color:#92948b;margin:5px 0 0}.status-select{min-width:108px;height:29px;border:1px solid #e5e6df;border-radius:6px;background:#f8f8f5;color:#73756c;font-size:9px;padding:0 7px}.status-select.paused{background:#f3eee9;color:#8f6c54}.remove-idea{border:0;background:none;color:#aaa;font-size:17px}.add-idea{margin-top:19px;padding:16px;display:grid;grid-template-columns:190px 1fr;gap:15px;align-items:center}.add-idea h2{font-size:11px;margin:0}.add-idea p{font-size:9px;color:#96978f;line-height:1.6;margin:5px 0 0}.add-idea form{display:flex;gap:7px}.add-idea input{min-width:0;flex:1;height:34px;border:1px solid #e7e7e1;border-radius:6px;padding:0 9px;font-size:9px}.add-idea form .button{min-height:34px;font-size:9px;padding:0 12px}.roadmap-foot{font-size:9px;color:#a3a49c;text-align:center;margin:20px 0}
@media(max-width:760px){.focus-card{align-items:start;flex-wrap:wrap}.focus-card>div:nth-child(2){min-width:70%}.add-idea{grid-template-columns:1fr}.add-idea form{flex-wrap:wrap}.add-idea input{flex-basis:42%}}
@media(max-width:530px){.idea-card{gap:8px;padding:11px 9px;flex-wrap:wrap}.idea-copy{min-width:60%}.status-select{margin-left:30px}.add-idea input{flex-basis:100%}}
</style>
