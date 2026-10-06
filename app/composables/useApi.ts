export function useApi() {
  const config = useRuntimeConfig();
  const apiBase = String(config.public.apiBase).replace(/\/$/, "");

  async function inspectImage(file: File) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(apiBase + "/api/images/inspect", { method: "POST", body: form });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || "图片信息读取失败");
    }
    return response.json();
  }

  return { inspectImage };
}
