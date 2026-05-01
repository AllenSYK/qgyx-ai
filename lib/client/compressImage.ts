const ONE_MB = 1024 * 1024;
const COMPRESS_THRESHOLD = 700 * 1024;
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.8;

function isCompressibleImage(file: File) {
  return file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".pdf");
}

function replaceExtension(name: string) {
  return name.includes(".")
    ? `${name.replace(/\.[^.]+$/, "")}.jpg`
    : `${name}.jpg`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };

    image.src = url;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

export async function compressImageForUpload(file: File) {
  if (!isCompressibleImage(file) || file.size < COMPRESS_THRESHOLD) {
    return file;
  }

  try {
    const image = await loadImage(file);
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestEdge > MAX_EDGE ? MAX_EDGE / longestEdge : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      return file;
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);

    let blob = await canvasToJpegBlob(canvas, JPEG_QUALITY);

    if (!blob) {
      return file;
    }

    if (blob.size > ONE_MB) {
      const smallerBlob = await canvasToJpegBlob(canvas, 0.72);
      if (smallerBlob && smallerBlob.size < blob.size) {
        blob = smallerBlob;
      }
    }

    if (!blob || blob.size >= file.size) {
      return file;
    }

    return new File([blob], replaceExtension(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified
    });
  } catch {
    return file;
  }
}