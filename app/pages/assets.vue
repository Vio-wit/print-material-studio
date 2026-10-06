<script setup lang="ts">
import { useLocalStudio } from "../composables/useLocalStudio";
const studio = useLocalStudio();
onMounted(() => studio.refresh());

async function removeAsset(id: string, name: string) {
  if (!window.confirm("确定从素材收纳中移除“" + name + "”吗？")) return;
  await studio.deleteAsset(id);
}

function downloadAsset(asset: { name: string; imageData: string }) {
  const anchor = document.createElement("a");
  anchor.href = asset.imageData;
  anchor.download = asset.name || "studio-asset";
  anchor.click();
}
</script>

<template>
  <div class="page-head-row"><div><div class="eyebrow">COLLECT / LOCAL ASSETS</div><h1 class="page-title">素材收纳</h1><p class="page-subtitle">先把常用照片收在一起，以后可以继续增加纸张、纹理、贴画和装饰素材。</p></div><NuxtLink class="button primary" to="/editor">＋ 加入照片</NuxtLink></div>
  <div class="storage-note"><span>i</span><p><b>素材库在本机浏览器里。</b>清理浏览器数据可能会删除它；需要长期保存的图片请另存到电脑。</p></div>
  <div v-if="studio.assets.value.length" class="asset-grid">
    <article v-for="asset in studio.assets.value" :key="asset.id" class="asset-card card"><img :src="asset.imageData" :alt="asset.name"><div class="asset-details"><strong :title="asset.name">{{ asset.name }}</strong><div><button class="button small" @click="downloadAsset(asset)">下载</button><button class="button small danger" @click="removeAsset(asset.id, asset.name)">移除</button></div></div></article>
  </div>
  <div v-else class="empty-library card"><span class="empty-symbol">▤</span><h2>还没有收纳素材</h2><p>在照片编辑页点击“收进素材”，可以把常用照片存到这个素材库。</p><NuxtLink class="button" to="/editor">去添加照片</NuxtLink></div>
</template>

<style scoped>
.page-head-row{display:flex;justify-content:space-between;align-items:end;gap:20px}.storage-note{display:flex;align-items:center;gap:10px;margin:23px 0 15px;padding:11px 13px;background:#f0f1eb;border-radius:8px;color:#777970}.storage-note>span{width:20px;height:20px;border:1px solid #bfc1b6;border-radius:50%;display:grid;place-items:center;font-size:10px}.storage-note p{font-size:10px;margin:0;line-height:1.6}.storage-note b{color:#56584f}.asset-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.asset-card{overflow:hidden;padding:7px}.asset-card img{width:100%;height:140px;object-fit:cover;background:#f0f0eb;border-radius:6px}.asset-details{display:grid;gap:9px;padding:9px 3px 2px}.asset-details strong{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.asset-details>div{display:flex;justify-content:space-between;gap:6px}.asset-details .button{min-height:28px;padding:0 9px;font-size:9px}.empty-library{padding:68px 20px;text-align:center}.empty-library .empty-symbol{margin-bottom:13px}.empty-library h2{font-size:15px;margin:0}.empty-library p{max-width:390px;margin:8px auto 18px;color:#94958d;font-size:10px;line-height:1.7}.empty-library .button{font-size:10px}
@media(max-width:950px){.asset-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:620px){.page-head-row{align-items:start;flex-direction:column}.asset-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.asset-card img{height:115px}}
</style>
