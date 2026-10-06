export interface EditSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  preset: string;
}

export interface StudioWork {
  id: string;
  title: string;
  imageData: string;
  templateId: string;
  settings: EditSettings;
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
