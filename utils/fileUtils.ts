
import { LocationData } from '../types';

export const extractExifLocation = (file: File): Promise<LocationData | null> => {
  return new Promise((resolve) => {
    if (typeof window.EXIF === 'undefined') {
      resolve(null);
      return;
    }

    window.EXIF.getData(file, function(this: any) {
      const lat = window.EXIF.getTag(this, "GPSLatitude");
      const latRef = window.EXIF.getTag(this, "GPSLatitudeRef");
      const lon = window.EXIF.getTag(this, "GPSLongitude");
      const lonRef = window.EXIF.getTag(this, "GPSLongitudeRef");

      if (lat && lon && latRef && lonRef) {
        const convertToDecimal = (gpsArr: number[], ref: string) => {
          const deg = gpsArr[0] + gpsArr[1] / 60 + gpsArr[2] / 3600;
          return (ref === 'S' || ref === 'W') ? deg * -1 : deg;
        };

        resolve({
          latitude: convertToDecimal(lat, latRef),
          longitude: convertToDecimal(lon, lonRef)
        });
      } else {
        resolve(null);
      }
    });
  });
};

export const fileToBase64 = async (file: File): Promise<{ base64: string; mimeType: string; location: LocationData | null }> => {
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
