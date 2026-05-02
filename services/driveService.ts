
import type { HistoryItem, UserData, UserSettings } from '../types';

const FILE_NAME = 'snaptrip_v2_data.json';

export const findHistoryFile = async (accessToken: string): Promise<string | null> => {
  const query = `name = '${FILE_NAME}' and 'appDataFolder' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=appDataFolder`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json();
    return data.files?.[0]?.id || null;
  } catch (error) {
    console.error('Error finding Drive file:', error);
    return null;
  }
};

export const readUserDataFromDrive = async (accessToken: string, fileId: string): Promise<UserData | null> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!response.ok) return null;

    const data = await response.json();
    return {
      history: Array.isArray(data.history) ? data.history : [],
      settings: data.settings || { language: 'en' }
    };
  } catch (error) {
    console.error('Error reading Drive file:', error);
    return null;
  }
};

export const createUserDataFile = async (accessToken: string, userData: UserData): Promise<string | null> => {
  const metadata = {
    name: FILE_NAME,
    parents: ['appDataFolder'],
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(userData)], { type: 'application/json' }));

  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const data = await response.json();
    return data.id;
  } catch (error) {
    console.error('Error creating Drive file:', error);
    return null;
  }
};

export const updateUserDataFile = async (accessToken: string, fileId: string, userData: UserData): Promise<void> => {
  const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;

  try {
    await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });
  } catch (error) {
    console.error('Error updating Drive file:', error);
  }
};

export const syncDrive = async (accessToken: string, localData: UserData): Promise<UserData> => {
    const fileId = await findHistoryFile(accessToken);

    if (fileId) {
        const driveData = await readUserDataFromDrive(accessToken, fileId);
        if (!driveData) return localData;

        // 히스토리 병합: 드라이브 데이터를 기본으로 하고, 게스트(로컬)에서 새로 만든 항목을 추가
        const driveIds = new Set(driveData.history.map(h => h.id));
        const mergedHistory = [...driveData.history];
        
        localData.history.forEach(item => {
            if (!driveIds.has(item.id)) {
                // 새로운 항목은 앞쪽에 추가
                mergedHistory.unshift(item);
            }
        });

        // 설정 병합: 드라이브에 저장된 사용자 설정을 우선시하되, 드라이브에 없으면 로컬 사용
        const finalSettings = (driveData.settings && driveData.settings.language) 
            ? driveData.settings 
            : localData.settings;
        
        const finalData = {
          history: mergedHistory,
          settings: finalSettings
        };
        
        await updateUserDataFile(accessToken, fileId, finalData);
        return finalData;
    } else {
        // 드라이브에 파일이 없으면 로컬 데이터를 업로드하여 새로 생성
        await createUserDataFile(accessToken, localData);
        return localData;
    }
};
