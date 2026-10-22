export const maximumAvatarBytes = 2 * 1024 * 1024;

export function validateAvatarFile(file: File): string | undefined {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Choose a JPEG, PNG, or WebP image.';
  }
  if (file.size === 0 || file.size > maximumAvatarBytes) {
    return 'Choose an image up to 2 MB.';
  }
  return undefined;
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
