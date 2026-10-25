import { createToastStore } from './domain/toastStore.js';

export const toastStore = createToastStore();
export const notify = toastStore.notify;
export const dismissNotice = toastStore.dismiss;
export const dismissNoticeGroup = toastStore.dismissGroup;
