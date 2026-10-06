<script setup lang="ts">
const route = useRoute();
const links = [
  { to: "/", label: "总览", icon: "⌂" },
  { to: "/editor", label: "开始制作", icon: "✳" },
  { to: "/works", label: "我的作品", icon: "▧" },
  { to: "/assets", label: "素材收纳", icon: "▤" },
  { to: "/roadmap", label: "想做清单", icon: "＋" }
];
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <NuxtLink class="brand" to="/">
        <span class="brand-mark">物</span>
        <span><strong>物料工坊</strong><small>本地设计工作台</small></span>
      </NuxtLink>
      <p class="nav-caption">工作空间</p>
      <nav class="main-nav">
        <NuxtLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="nav-link"
          :class="{ active: route.path === link.to }"
        >
          <span class="nav-icon">{{ link.icon }}</span>{{ link.label }}
        </NuxtLink>
      </nav>
      <div class="sidebar-bottom">
        <span class="local-dot"></span>
        <span>仅保存在这台设备</span>
      </div>
    </aside>
    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumbs">创作空间 <span>/</span> <b>{{ links.find((item) => item.to === route.path)?.label || "工作台" }}</b></div>
        <span class="topbar-tag">本地版 · 早期体验</span>
      </header>
      <div class="page-container"><slot /></div>
    </main>
  </div>
</template>
