<script setup lang="ts">
import { printTemplates } from "../composables/useTemplates";
import { useLocalStudio } from "../composables/useLocalStudio";

const studio = useLocalStudio();
const search = ref("");
onMounted(() => studio.refresh());
const filteredWorks = computed(() => {
  const query = search.value.trim().toLowerCase();
  return query ? studio.works.value.filter((work) => work.title.toLowerCase().includes(query)) : studio.works.value;
});

async function removeWork(id: string, title: string) {
  if (!window.confirm("确定从本机作品柜移除“" + title + "”吗？此操作不能撤回。")) return;
  await studio.deleteWork(id);
}
</script>

<template>
  <div class="page-head-row"><div><div class="eyebrow">KEEP / YOUR WORKS</div><h1 class="page-title">我的作品</h1><p class="page-subtitle">作品存在当前浏览器的本地空间里；导出文件作为额外备份更稳妥。</p></div><NuxtLink class="button primary" to="/editor">＋ 新建作品</NuxtLink></div>
  <div class="library-toolbar"><div class="result-count">{{ filteredWorks.length }} 件作品 <span>· 仅此设备可见</span></div><input v-model="search" class="search-input" type="search" placeholder="按名称搜索"></div>
  <div v-if="filteredWorks.length" class="work-grid">
    <article v-for="work in filteredWorks" :key="work.id" class="work-card card">
      <NuxtLink :to="'/editor?work=' + work.id" class="work-image"><img :src="work.imageData" :alt="work.title"><span>继续编辑 →</span></NuxtLink>
      <div class="work-info"><div><h2>{{ work.title }}</h2><p>{{ printTemplates.find((item) => item.id === work.templateId)?.name || "自定义尺寸" }}</p></div><button class="icon-button" :aria-label="'删除 ' + work.title" title="从本机移除" @click="removeWork(work.id, work.title)">···</button></div>
      <time>{{ new Date(work.updatedAt).toLocaleDateString("zh-CN") }}</time>
    </article>
  </div>
  <div v-else class="empty-library card"><span class="empty-symbol">▧</span><h2>{{ search ? "没有找到这件作品" : "作品柜还是空的" }}</h2><p>{{ search ? "换个关键词试试。" : "完成一张照片或相纸设计后，点击“保存作品”，它就会出现在这里。" }}</p><NuxtLink v-if="!search" class="button" to="/editor">去做第一件作品</NuxtLink></div>
</template>

<style scoped>
.page-head-row{display:flex;justify-content:space-between;align-items:end;gap:20px}.library-toolbar{display:flex;justify-content:space-between;align-items:center;margin:27px 0 13px}.result-count{font-size:11px;font-weight:600}.result-count span{color:#9c9d95;font-weight:400}.search-input{width:210px;height:34px;padding:0 11px;border:1px solid #e5e5df;border-radius:7px;background:white;font-size:10px;outline:none}.search-input:focus{border-color:#afb0a6}
.work-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.work-card{overflow:hidden;padding:8px}.work-image{height:190px;display:grid;place-items:center;position:relative;overflow:hidden;background:#f0f0eb;border-radius:7px}.work-image img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}.work-image span{position:absolute;inset:auto 8px 8px auto;padding:7px 9px;border-radius:5px;background:#ffffffeb;color:#393a34;font-size:9px;opacity:0;transition:opacity .2s}.work-image:hover span{opacity:1}.work-info{display:flex;align-items:center;justify-content:space-between;padding:11px 3px 4px}.work-info h2{font-size:11px;margin:0;font-weight:600}.work-info p{font-size:9px;color:#94958d;margin:5px 0 0}.work-card time{display:block;padding:0 3px 7px;color:#a0a198;font-size:9px}.icon-button{width:29px;height:27px;border:0;border-radius:6px;background:transparent;color:#777970;font-size:17px}.icon-button:hover{background:#f1f1ed}.empty-library{padding:68px 20px;text-align:center}.empty-library .empty-symbol{margin-bottom:13px}.empty-library h2{font-size:15px;margin:0}.empty-library p{max-width:390px;margin:8px auto 18px;color:#94958d;font-size:10px;line-height:1.7}.empty-library .button{font-size:10px}
@media(max-width:900px){.work-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.page-head-row{align-items:start;flex-direction:column}.work-grid{grid-template-columns:1fr 1fr;gap:7px}.work-image{height:130px}.search-input{width:145px}}
</style>
