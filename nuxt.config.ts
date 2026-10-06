import { resolve } from "node:path";

export default defineNuxtConfig({
  srcDir: "app/",
  buildDir: ".nuxt",
  devtools: { enabled: true },
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || "http://127.0.0.1:8000"
    }
  },
  nitro: {
    externals: { inline: ["nuxt"] },
    alias: {
      "nuxt/internal/precomputed": resolve(process.cwd(), ".nuxt/dist/server/client.precomputed.mjs")
    }
  },
  app: {
    head: {
      title: "物料工坊",
      meta: [{ name: "description", content: "本地运行的照片与印刷物料设计工具" }]
    }
  }
});
