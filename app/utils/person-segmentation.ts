import type { ImageSegmenter } from "@mediapipe/tasks-vision";
import type { SubjectMask } from "../types/studio";

let segmenterPromise: Promise<ImageSegmenter> | null = null;

async function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "/models/selfie_segmenter.tflite",
          delegate: "CPU"
        },
        runningMode: "IMAGE",
        outputCategoryMask: false,
        outputConfidenceMasks: true
      });
    })().catch((error: unknown) => {
      segmenterPromise = null;
      throw error;
    });
  }
  return segmenterPromise;
}

/** Runs a one-shot, on-device person segmentation on a downscaled copy. */
export async function segmentPerson(image: HTMLImageElement): Promise<SubjectMask> {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const scale = Math.min(1, 512 / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法准备人物识别画布。");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const segmenter = await loadSegmenter();
  const result = segmenter.segment(canvas);
  try {
    const personMask = result.confidenceMasks?.[0];
    if (!personMask) throw new Error("人物识别没有返回选区。");
    return {
      data: new Float32Array(personMask.getAsFloat32Array()),
      width: personMask.width,
      height: personMask.height
    };
  } finally {
    result.close();
  }
}
