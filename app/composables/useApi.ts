import type { PhotoMetadata } from "../types/studio";

type ImageInfo = PhotoMetadata;

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
      taken_at: formatExifDate(metadata?.DateTimeOriginal),
      aperture: metadata?.FNumber ? formatExifNumber(metadata.FNumber) : "",
      exposure: formatExposure(metadata?.ExposureTime),
      iso: metadata?.ISO ? String(metadata.ISO) : "",
      focalLength: metadata?.FocalLength ? formatExifNumber(metadata.FocalLength) : ""
    };
  }

  return { inspectImage };
}

async function readExif(file: File) {
  try {
    const exifr = await import("exifr");
    return await exifr.parse(file, ["Make", "Model", "LensModel", "DateTimeOriginal", "FNumber", "ExposureTime", "ISO", "FocalLength"]);
  } catch {
    // Metadata is optional; dimensions and photo editing should still work if EXIF is absent or unsupported.
    return null;
  }
}

function formatExifNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toPrecision(4))) : String(value);
}

function formatExposure(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 1) return "1/" + Math.round(1 / seconds) + " s";
  return String(Number(seconds.toPrecision(3))) + " s";
}

function formatExifDate(value: unknown) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (number: number) => String(number).padStart(2, "0");
    return value.getFullYear() + "-" + pad(value.getMonth() + 1) + "-" + pad(value.getDate()) + " " + pad(value.getHours()) + ":" + pad(value.getMinutes());
  }
  return String(value);
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
