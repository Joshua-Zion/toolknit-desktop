export const FILE_TYPES = [
  { key: 'documents', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'rtf', 'odt'] },
  { key: 'images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'heic'] },
  { key: 'audio', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'] },
  { key: 'video', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'm4v', 'wmv'] },
  { key: 'archives', extensions: ['zip', '7z', 'rar', 'tar', 'gz', 'bz2'] }
];
export const ALL_EXTENSIONS = FILE_TYPES.flatMap(type => type.extensions);
