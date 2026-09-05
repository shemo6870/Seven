
/**
 * Compresses an image data URL to a smaller size using canvas.
 * @param dataUrl The original base64 data URL
 * @param maxWidth Max width of the resulting image
 * @param quality Quality from 0 to 1 (0.1 = low, 0.9 = high)
 * @returns A promise that resolves to the compressed data URL
 */
export async function compressImage(dataUrl: string, maxWidth = 450, quality = 0.2): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    const timeout = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error('Image compression timed out'));
    }, 10000); // 10 second timeout

    img.onload = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert back to base64 with specified quality
      try {
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      } catch (e) {
        reject(e);
      }
    };
    
    img.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
    
    img.src = dataUrl;
  });
}
