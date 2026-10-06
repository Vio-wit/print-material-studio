interface ImageInfo {
  width: number;
  height: number;
  camera: string;
  make: string;
  lens: string;
  taken_at: string;
}

interface ImageDimensions {
  width: number;
  height: number;
}

export function useApi() {
  async function inspectImage(file: File): Promise<ImageInfo> {
    const [metadata, dimensions] = await Promise.all([
      readExif(file),
      readImageDimensions(file)
    ]);

    return {
      width: dimensions.width,
      height: dimensions.height,
      make: metadata?.Make ? String(metadata.Make) : "",
      camera: metadata?.Model ? String(metadata.Model) : "",
      lens: metadata?.LensModel ? String(metadata.LensModel) : "",
      taken_at: metadata?.DateTimeOriginal ? String(metadata.DateTimeOriginal) : ""
    };
  }

  return { inspectImage };
}

async function readExif(file: File) {
  try {
    const exifr = await import("exifr");
    return await exifr.parse(file, ["Make", "Model", "LensModel", "DateTimeOriginal"]);
  } catch {
    // Metadata is optional; dimensions and photo editing should still work if EXIF is absent or unsupported.
    return null;
  }
}

function readImageDimensions(file: File): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法读取图片尺寸"));
    };
    image.src = objectUrl;
  });
}
