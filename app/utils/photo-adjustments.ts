import type { EditSettings, SubjectMask } from "../types/studio";

export type PhotoAdjustmentValues = Omit<EditSettings, "preset">;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function toLinear(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function toSrgb(value: number) {
  const channel = clamp(value);
  return 255 * (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055);
}

/** Apply editable, approximate sRGB adjustments to a fresh copy of the source pixels. */
export function applyPhotoAdjustments(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  settings: PhotoAdjustmentValues,
  subjectMask?: SubjectMask | null
) {
  const exposureGain = 2 ** settings.exposure;
  const contrast = 1 + settings.contrast / 100;
  const subjectExposureGain = 2 ** settings.subjectExposure;
  const subjectContrast = 1 + settings.subjectContrast / 100;
  const warmth = settings.warmth / 100;
  const vibrance = settings.vibrance / 100;
  const saturation = 1 + settings.saturation / 100;
  const temperatureGain = 2 ** (settings.temperature / 100 * 0.35);
  const greenGain = 2 ** (-settings.tint / 100 * 0.22);

  for (let index = 0; index < pixels.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    let red = toLinear(pixels[index]!) * temperatureGain * exposureGain;
    let green = toLinear(pixels[index + 1]!) * greenGain * exposureGain;
    let blue = toLinear(pixels[index + 2]!) / temperatureGain * exposureGain;

    red = (red - 0.18) * contrast + 0.18;
    green = (green - 0.18) * contrast + 0.18;
    blue = (blue - 0.18) * contrast + 0.18;

    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const highlightMask = smoothstep(0.35, 0.9, luminance);
    const shadowMask = 1 - smoothstep(0.04, 0.55, luminance);
    const toneChange = settings.highlights / 100 * 0.25 * highlightMask
      + settings.shadows / 100 * 0.2 * shadowMask;
    red += toneChange;
    green += toneChange;
    blue += toneChange;

    const adjustedLuminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const peak = Math.max(red, green, blue);
    const floor = Math.min(red, green, blue);
    const chroma = peak > 0.0001 ? (peak - floor) / peak : 0;
    const colorGain = saturation * Math.max(0, 1 + vibrance * (1 - chroma));
    red = adjustedLuminance + (red - adjustedLuminance) * colorGain;
    green = adjustedLuminance + (green - adjustedLuminance) * colorGain;
    blue = adjustedLuminance + (blue - adjustedLuminance) * colorGain;

    if (subjectMask && (settings.subjectExposure !== 0 || settings.subjectContrast !== 0)) {
      const maskX = Math.min(subjectMask.width - 1, Math.floor(x / width * subjectMask.width));
      const maskY = Math.min(subjectMask.height - 1, Math.floor(y / height * subjectMask.height));
      const maskAmount = clamp(subjectMask.data[maskY * subjectMask.width + maskX] || 0);
      if (maskAmount > 0) {
        const subjectRed = ((red - 0.18) * subjectContrast + 0.18) * subjectExposureGain;
        const subjectGreen = ((green - 0.18) * subjectContrast + 0.18) * subjectExposureGain;
        const subjectBlue = ((blue - 0.18) * subjectContrast + 0.18) * subjectExposureGain;
        red += (subjectRed - red) * maskAmount;
        green += (subjectGreen - green) * maskAmount;
        blue += (subjectBlue - blue) * maskAmount;
      }
    }

    let outputRed = toSrgb(red);
    let outputGreen = toSrgb(green);
    let outputBlue = toSrgb(blue);

    if (warmth > 0) {
      const sepiaRed = 0.393 * outputRed + 0.769 * outputGreen + 0.189 * outputBlue;
      const sepiaGreen = 0.349 * outputRed + 0.686 * outputGreen + 0.168 * outputBlue;
      const sepiaBlue = 0.272 * outputRed + 0.534 * outputGreen + 0.131 * outputBlue;
      outputRed += (sepiaRed - outputRed) * warmth;
      outputGreen += (sepiaGreen - outputGreen) * warmth;
      outputBlue += (sepiaBlue - outputBlue) * warmth;
    }

    pixels[index] = clamp(outputRed, 0, 255);
    pixels[index + 1] = clamp(outputGreen, 0, 255);
    pixels[index + 2] = clamp(outputBlue, 0, 255);
  }
}
