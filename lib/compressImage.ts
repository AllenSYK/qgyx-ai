export async function compressImage(file: File): Promise<string> {
  const img = new Image();
  const reader = new FileReader();

  const base64 = await new Promise<string>((resolve) => {
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });

  img.src = base64;

  await new Promise((r) => (img.onload = r));

  const canvas = document.createElement("canvas");

  const MAX = 1280;
  let w = img.width;
  let h = img.height;

  if (w > MAX || h > MAX) {
    const scale = Math.min(MAX / w, MAX / h);
    w *= scale;
    h *= scale;
  }

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);

  return canvas.toDataURL("image/jpeg", 0.8);
}
