export const IMAGE_PRELOAD_TIMEOUT_MS = 1000;

export function preloadImage(url, {
  createImage = () => new Image(),
  timeoutMs = IMAGE_PRELOAD_TIMEOUT_MS
} = {}) {
  if (typeof url !== 'string' || url.trim() === '') {
    return Promise.resolve('error');
  }

  return new Promise((resolve) => {
    const image = createImage();
    let settled = false;

    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(status);
    };

    const timeoutId = setTimeout(() => finish('timeout'), timeoutMs);
    image.onload = () => finish('loaded');
    image.onerror = () => finish('error');
    image.src = url;
  });
}
