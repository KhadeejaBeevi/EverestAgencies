// Photos are resized in the browser and stored as a small JPEG data URL in
// Users/{uid}.photo, so no separate file storage is needed.
const PHOTO_SIZE = 300;
const PHOTO_QUALITY = 0.8;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const resizeImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      // Centre-crop to a square, then scale down
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const size = Math.min(PHOTO_SIZE, side);

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read the selected image"));
    };

    img.src = url;
  });
