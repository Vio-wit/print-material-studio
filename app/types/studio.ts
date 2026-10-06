export interface EditSettings {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  warmth: number;
  subjectExposure: number;
  subjectContrast: number;
  preset: string;
}

export interface SubjectMask {
  data: Float32Array;
  width: number;
  height: number;
}

export interface PhotoMetadata {
  width: number;
  height: number;
  make: string;
  camera: string;
  lens: string;
  taken_at: string;
  aperture: string;
  exposure: string;
  iso: string;
  focalLength: string;
}

export interface PrintDesignOptions {
  fitMode: "contain" | "cover";
  zoomPercent: number;
  offsetX: number;
  offsetY: number;
  rotation: 0 | 90 | 180 | 270;
  frameMm: number;
  paperColor: string;
  blurBackground: boolean;
  backgroundZoom: number;
  backgroundBlur: number;
  watermarkEnabled: boolean;
  watermarkText: string;
  watermarkIncludeMetadata: boolean;
  watermarkFontSizeMm: number;
  watermarkOpacity: number;
  watermarkColor: string;
  watermarkPosition: "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";
}

export interface StudioWork {
  id: string;
  title: string;
  imageData: string;
  templateId: string;
  settings: EditSettings;
  designOptions?: Partial<PrintDesignOptions>;
  photoMetadata?: PhotoMetadata;
  subjectSelection?: "person" | "inverse-person";
  updatedAt: string;
}

export interface StudioAsset {
  id: string;
  name: string;
  imageData: string;
  addedAt: string;
}

export interface PrintTemplate {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  note: string;
  category: string;
}
