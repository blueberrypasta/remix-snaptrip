export const isValidGeminiApiKey = (key: string | null | undefined): boolean =>
  /^AIza[0-9A-Za-z_-]{35}$/.test(key?.trim() ?? '');
