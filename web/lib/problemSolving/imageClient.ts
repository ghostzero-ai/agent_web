const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 12_000_000;
const MAX_RESULT_BYTES = 4_000_000;
const MAX_DIMENSION = 1_600;

export class ProblemImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProblemImageError";
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ProblemImageError("无法读取这张图片。"));
    image.src = url;
  });
}

function approximateDataUrlBytes(dataUrl: string): number {
  const payload = dataUrl.split(",", 2)[1] ?? "";
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.floor((payload.length * 3) / 4) - padding;
}

export async function prepareProblemImage(file: File): Promise<{
  dataUrl: string;
  name: string;
  byteSize: number;
}> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ProblemImageError("只支持 JPEG、PNG 或 WebP 题目图片。");
  }
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) {
    throw new ProblemImageError("原始题目图片必须小于 12 MB。");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new ProblemImageError("当前设备无法处理题目图片。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    const byteSize = approximateDataUrlBytes(dataUrl);
    if (byteSize > MAX_RESULT_BYTES) {
      throw new ProblemImageError("压缩后的题目图片仍超过 4 MB，请裁剪后重试。");
    }
    return { dataUrl, name: file.name, byteSize };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
