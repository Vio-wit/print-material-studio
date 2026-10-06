<script setup lang="ts">
import { printTemplates } from "../composables/useTemplates";
import { useLocalStudio } from "../composables/useLocalStudio";

const studio = useLocalStudio();
const showGuide = ref(true);
onMounted(() => studio.refresh());
const recentWorks = computed(() => studio.works.value.slice(0, 3));
</script>

<template>
  <section class="welcome-row">
    <div>
      <div class="eyebrow">DESIGN MATERIALS, AT YOUR PACE</div>
      <h1 class="page-title">把想法，做成拿得出手的物料。</h1>
      <p class="page-subtitle">从一张照片开始。先做成品，再慢慢添上你想要的设计工具。</p>
    </div>
    <NuxtLink class="button primary" to="/editor">＋ 开始制作</NuxtLink>
  </section>

  <section class="hero card">
    <div class="hero-copy">
      <span class="hero-kicker">你的本地创作台</span>
      <h2>先做一张，<br>再做成一套。</h2>
      <p>照片调整、相纸版式与作品留存放在一起。文件默认留在你的浏览器，不会自动上传。</p>
      <NuxtLink class="button hero-button" to="/editor">导入照片 <span>→</span></NuxtLink>
    </div>
    <div class="hero-art" aria-hidden="true">
      <div class="paper paper-back"><span>PRINT<br>YOUR<br>IDEA</span></div>
      <div class="paper paper-front">
        <div class="paper-photo"><span class="sun"></span><span class="hill hill-a"></span><span class="hill hill-b"></span></div>
        <span class="paper-caption">A small moment<br>worth keeping.</span>
      </div>
      <div class="art-sticker">NO. 001<br><b>MADE BY YOU</b></div>
    </div>
  </section>

  <section v-if="showGuide" class="guide-banner">
    <div class="guide-icon">✓</div>
    <div class="guide-text"><strong>第一次来？照着做，也可以跳着做。</strong><span>导入 → 调整 → 选尺寸 → 导出或保存。每一步都能返回修改。</span></div>
    <NuxtLink to="/editor" class="guide-link">从第一步开始 →</NuxtLink>
    <button class="close-guide" aria-label="关闭新手提示" @click="showGuide = false">×</button>
  </section>

  <section class="quick-grid">
    <NuxtLink to="/editor" class="quick-card card">
      <span class="quick-index">01 / MAKE</span><span class="quick-icon">✳</span>
      <strong>照片与相纸</strong><span>调色、选纸张、导出高分辨率文件</span><i>→</i>
    </NuxtLink>
    <NuxtLink to="/works" class="quick-card card">
      <span class="quick-index">02 / KEEP</span><span class="quick-icon">▧</span>
      <strong>作品展示柜</strong><span>把做过的设计保存在本机，随时接着改</span><i>→</i>
    </NuxtLink>
    <NuxtLink to="/roadmap" class="quick-card card">
      <span class="quick-index">03 / DREAM</span><span class="quick-icon">＋</span>
      <strong>想做清单</strong><span>书刊、海报和更多物料，逐步加进来</span><i>→</i>
    </NuxtLink>
  </section>

  <section class="dashboard-bottom">
    <div class="recent-block">
      <div class="section-heading"><div><h2>最近的作品</h2><p>这些作品只保存在当前浏览器中</p></div><NuxtLink class="text-link" to="/works">查看全部 →</NuxtLink></div>
      <div v-if="recentWorks.length" class="recent-grid">
        <NuxtLink v-for="work in recentWorks" :key="work.id" :to="'/editor?work=' + work.id" class="recent-item card">
          <img :src="work.imageData" :alt="work.title">
          <div><strong>{{ work.title }}</strong><span>{{ printTemplates.find((item) => item.id === work.templateId)?.name || "自定义画布" }}</span></div>
        </NuxtLink>
      </div>
      <div v-else class="recent-empty card"><span class="empty-symbol">▧</span><span>还没有作品。导入一张照片，做出你的第一件物料吧。</span></div>
    </div>
    <aside class="counts-card card">
      <span class="eyebrow">YOUR STUDIO</span>
      <div class="count-line"><span>已保存作品</span><b>{{ studio.works.value.length }}</b></div>
      <div class="count-line"><span>收纳素材</span><b>{{ studio.assets.value.length }}</b></div>
      <p>模板从常用相纸尺寸开始，后续可以继续添加。</p>
    </aside>
  </section>
</template>

<style scoped>
.welcome-row { display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:22px }.welcome-row .button{flex-shrink:0}
.hero { min-height:286px;position:relative;overflow:hidden;background:#e9e9df;display:flex;align-items:center;padding:33px 44px;border:0 }
.hero-copy{position:relative;z-index:1;max-width:440px}.hero-kicker{font-size:10px;text-transform:uppercase;letter-spacing:.16em;color:#7b7d72}
.hero h2{font-size:32px;line-height:1.27;letter-spacing:-.045em;margin:13px 0 10px;font-weight:600}.hero p{font-size:12px;color:#77796f;line-height:1.8;max-width:340px;margin:0 0 19px}
.hero-button{background:#30312c;color:white;border-color:#30312c}.hero-button span{font-size:16px}.hero-art{position:absolute;right:7%;top:0;height:100%;width:45%;display:flex;justify-content:center;align-items:center}
.paper{position:absolute;width:171px;height:226px;padding:13px;background:#fff;box-shadow:0 12px 34px #77776b1a}.paper-back{transform:rotate(8deg) translate(36px,3px);background:#d5d4c6;color:#797a6b;font-size:19px;font-weight:700;letter-spacing:.1em;line-height:1.25;padding:21px}
.paper-front{transform:rotate(-6deg) translate(-32px,5px)}.paper-photo{height:147px;position:relative;overflow:hidden;background:linear-gradient(#d9e6df 0 56%,#f3e7ce 56% 100%)}
.sun{position:absolute;width:32px;height:32px;border-radius:50%;background:#f3c78b;top:26px;right:28px}.hill{position:absolute;left:-8%;width:120%;height:75px;border-radius:50% 50% 0 0}
.hill-a{top:92px;background:#829689;transform:rotate(-8deg)}.hill-b{top:113px;left:23%;background:#627767;transform:rotate(6deg)}
.paper-caption{font-family:Georgia,serif;font-size:11px;line-height:1.25;display:block;padding:10px 3px;color:#63635b}
.art-sticker{position:absolute;right:3%;bottom:27px;border:1px solid #a8a99d;border-radius:50%;width:69px;height:69px;display:grid;place-content:center;text-align:center;color:#77786e;font-size:8px;line-height:1.6;transform:rotate(8deg);background:#efeee7}
.guide-banner{display:flex;align-items:center;gap:13px;background:#fff;border:1px solid #e9e9e4;border-radius:10px;padding:14px 17px;margin-top:15px;position:relative}
.guide-icon{background:#e9efe6;color:#60785e;border-radius:50%;width:26px;height:26px;display:grid;place-items:center;font-size:12px;flex-shrink:0}.guide-text{display:grid;gap:4px;flex:1}.guide-text strong{font-size:11px}.guide-text span{font-size:10px;color:#85877e}.guide-link,.text-link{color:#53584d;font-size:10px;font-weight:600}.close-guide{border:0;background:transparent;color:#9a9b93;font-size:20px;padding:0 2px}
.quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:15px}.quick-card{position:relative;display:flex;flex-direction:column;min-height:150px;padding:15px 17px}.quick-index{font-size:9px;color:#a3a49c;letter-spacing:.1em}.quick-icon{position:absolute;right:17px;top:14px;color:#9b9d92;font-size:18px}.quick-card strong{font-size:13px;margin-top:20px}.quick-card>span:nth-of-type(2){font-size:10px;color:#92948b;margin-top:7px}.quick-card i{font-style:normal;position:absolute;right:17px;bottom:15px;font-size:14px;color:#888a81}
.dashboard-bottom{display:grid;grid-template-columns:1fr 220px;gap:20px;margin-top:3px}.recent-block .section-heading{margin-top:26px}.recent-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.recent-item{overflow:hidden}.recent-item img{width:100%;height:105px;object-fit:contain;background:#f1f1ed}.recent-item div{display:grid;gap:5px;padding:10px}.recent-item strong{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.recent-item span{font-size:9px;color:#999a92}.recent-empty{display:flex;align-items:center;gap:12px;padding:14px;font-size:10px;color:#8f9088}.recent-empty .empty-symbol{margin:0;width:34px;height:34px;font-size:15px}
.counts-card{padding:17px 16px;align-self:start;margin-top:26px}.counts-card .eyebrow{font-size:9px}.count-line{display:flex;justify-content:space-between;align-items:center;margin-top:17px;font-size:10px;color:#75776e}.count-line b{font-size:18px;font-weight:500;color:#353630}.counts-card p{font-size:9px;line-height:1.6;color:#a0a198;border-top:1px solid #eeeeea;padding-top:12px;margin:16px 0 0}
@media(max-width:950px){.hero-art{right:0;width:42%;transform:scale(.85)}.dashboard-bottom{grid-template-columns:1fr}.counts-card{display:none}}
@media(max-width:650px){.welcome-row{align-items:start;flex-direction:column}.hero{min-height:360px;align-items:start;padding:25px}.hero-art{top:135px;right:0;width:100%;height:220px;transform:scale(.8)}.quick-grid{grid-template-columns:1fr}.quick-card{min-height:120px}.guide-link{display:none}.recent-grid{grid-template-columns:repeat(2,1fr)}}
</style>
