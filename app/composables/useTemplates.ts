import type { PrintTemplate } from "../types/studio";

export const printTemplates: PrintTemplate[] = [
  { id: "photo-4x6", name: "4 × 6 英寸相纸", widthMm: 101.6, heightMm: 152.4, note: "常见照片冲印尺寸", category: "相纸" },
  { id: "photo-5x7", name: "5 × 7 英寸相纸", widthMm: 127, heightMm: 177.8, note: "适合相框与贺卡", category: "相纸" },
  { id: "a5", name: "A5 竖版", widthMm: 148, heightMm: 210, note: "可做小海报或内页", category: "纸张" },
  { id: "square-10", name: "10 × 10 cm 方形卡", widthMm: 100, heightMm: 100, note: "方形照片卡", category: "卡片" },
  { id: "postcard", name: "明信片 10 × 15 cm", widthMm: 100, heightMm: 150, note: "留白边框，不强制裁切", category: "卡片" }
];
