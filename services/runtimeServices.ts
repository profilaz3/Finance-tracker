type SyncManagerInstance = typeof import('./syncManager')['syncManager'];
type OfflineQueueInstance = typeof import('./offlineQueue')['offlineQueue'];
type SupabaseServiceInstance = typeof import('./supabaseService')['supabaseService'];

let syncManagerPromise: Promise<SyncManagerInstance> | null = null;
let offlineQueuePromise: Promise<OfflineQueueInstance> | null = null;
let supabaseServicePromise: Promise<SupabaseServiceInstance> | null = null;

export const getSyncManager = async (): Promise<SyncManagerInstance> => {
  if (!syncManagerPromise) {
    syncManagerPromise = import('./syncManager').then(module => module.syncManager);
  }

  return syncManagerPromise;
};

export const getOfflineQueue = async (): Promise<OfflineQueueInstance> => {
  if (!offlineQueuePromise) {
    offlineQueuePromise = import('./offlineQueue').then(module => module.offlineQueue);
  }

  return offlineQueuePromise;
};

export const getSupabaseService = async (): Promise<SupabaseServiceInstance> => {
  if (!supabaseServicePromise) {
    supabaseServicePromise = import('./supabaseService').then(module => module.supabaseService);
  }

  return supabaseServicePromise;
};
