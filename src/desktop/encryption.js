export async function createSystemEncryption(safeStorage) {
  const available = await safeStorage.isAsyncEncryptionAvailable().catch(() => false);
  return {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => safeStorage.getSelectedStorageBackend(),
    encryptString: (text) => safeStorage.encryptStringAsync(text),
    decryptString: async (bytes) => (await safeStorage.decryptStringAsync(bytes)).result
  };
}
