import type { StudioAsset, StudioWork } from "../types/studio";

const DB_NAME = "print-material-studio";
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("works")) {
        database.createObjectStore("works", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("assets")) {
        database.createObjectStore("assets", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readStore<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => {
      resolve(request.result as T[]);
      database.close();
    };
    request.onerror = () => {
      reject(request.error);
      database.close();
    };
  });
}

async function writeRecord(storeName: string, record: StudioWork | StudioAsset): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

async function removeRecord(storeName: string, id: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export function useLocalStudio() {
  const works = useState<StudioWork[]>("local-works", () => []);
  const assets = useState<StudioAsset[]>("local-assets", () => []);
  const ready = useState<boolean>("local-studio-ready", () => false);

  async function refresh() {
    if (!import.meta.client) return;
    try {
      [works.value, assets.value] = await Promise.all([
        readStore<StudioWork>("works"),
        readStore<StudioAsset>("assets")
      ]);
      ready.value = true;
    } catch (error) {
      console.error("无法读取本地作品库", error);
      throw error;
    }
  }

  async function saveWork(work: StudioWork) {
    await writeRecord("works", work);
    works.value = [work, ...works.value.filter((item) => item.id !== work.id)];
  }

  async function deleteWork(id: string) {
    await removeRecord("works", id);
    works.value = works.value.filter((item) => item.id !== id);
  }

  async function saveAsset(asset: StudioAsset) {
    await writeRecord("assets", asset);
    assets.value = [asset, ...assets.value.filter((item) => item.id !== asset.id)];
  }

  async function deleteAsset(id: string) {
    await removeRecord("assets", id);
    assets.value = assets.value.filter((item) => item.id !== id);
  }

  return { works, assets, ready, refresh, saveWork, deleteWork, saveAsset, deleteAsset };
}
