import { listMailFolders } from '../services/graph.js';

export const gmailAllowedLabels = new Set([
  'INBOX',
  'STARRED',
  'IMPORTANT',
  'CATEGORY_PERSONAL',
  'CATEGORY_SOCIAL',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS',
  'CATEGORY_PROMOTIONS'
]);

export const gmailAllowedFolders = new Set(['inbox', 'archive']);

export const outlookAllowedCategories = new Set([
  'Important',
  'FollowUp',
  'Internship',
  'Interview',
  'Recruiter',
  'NeedsResponse'
]);

export const outlookAllowedFolders = new Set(['inbox', 'archive', 'deleteditems']);

export const normalizeFolderName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

export const normalizeLabelName = (value: string) => value.trim();

export const resolveOutlookFolderId = async (accessToken: string, folderName: string) => {
  const normalized = normalizeFolderName(folderName);
  if (!outlookAllowedFolders.has(normalized)) {
    throw new Error(`Folder ${folderName} is not allowed`);
  }

  const folders = await listMailFolders(accessToken);
  const match = (folders?.value ?? []).find((folder: any) => {
    const byKnownName = normalizeFolderName(folder.wellKnownName ?? '') === normalized;
    const byDisplayName = normalizeFolderName(folder.displayName ?? '') === normalized;
    return byKnownName || byDisplayName;
  });

  if (!match?.id) {
    throw new Error(`Folder ${folderName} was not found`);
  }

  return match.id as string;
};
