
import { LocationData } from '../types';

export const extractExifLocation = async (file: File): Promise<LocationData | null> => {
  try {
    const exifModule = await import('exif-js');
    const EXIF = (exifModule as any).default || exifModule;

    if (!EXIF || typeof EXIF.getData !== 'function') {
      return null;
    }

    return await new Promise<LocationData | null>((resolve) => {
      // A malformed EXIF block must not leave a selected photo stuck forever.
      const timeout = setTimeout(() => finish(null), 3000);
      const finish = (location: LocationData | null) => {
        clearTimeout(timeout);
        resolve(location);
      };
      try {
        EXIF.getData(file, function(this: any) {
          try {
            const lat = EXIF.getTag(this, 'GPSLatitude');
            const latRef = EXIF.getTag(this, 'GPSLatitudeRef');
            const lon = EXIF.getTag(this, 'GPSLongitude');
            const lonRef = EXIF.getTag(this, 'GPSLongitudeRef');

            if (lat && lon && latRef && lonRef) {
              const convertToDecimal = (gpsArr: number[], ref: string) => {
                const deg = gpsArr[0] + gpsArr[1] / 60 + gpsArr[2] / 3600;
                return (ref === 'S' || ref === 'W') ? deg * -1 : deg;
              };

              const latitude = convertToDecimal(lat, latRef);
              const longitude = convertToDecimal(lon, lonRef);
              finish(Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
                Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : null);
            } else {
              finish(null);
            }
          } catch {
            finish(null);
          }
        });
      } catch {
        finish(null);
      }
    });
  } catch {
    return null;
  }
};
export const fileToBase64 = async (file: File): Promise<{ base64: string; mimeType: string; location: LocationData | null }> => {
  if (!file.type.startsWith('image/') || file.size === 0) throw new Error('invalid_image');
  if (file.size > 20 * 1024 * 1024) throw new Error('image_too_large');
  const location = await extractExifLocation(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        // 표지판/명판의 작은 글자도 읽을 수 있도록 분석 해상도를 보존한다.
        const MAX_SIZE = 960;
        
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg', location });
      };

      img.onerror = () => {
        reject(new Error("Failed to load image"));
      };
    };
    reader.onerror = (error) => {
      reject(error);
    };
  });
};
