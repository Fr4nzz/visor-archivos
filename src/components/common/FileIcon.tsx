import {
  Folder,
  File,
  FileImage,
  FileAudio,
  FileVideo,
  FileText,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  Database,
} from 'lucide-react';
import { getCategory } from '../../utils/colorSchemes';

interface FileIconProps {
  type: 'file' | 'folder';
  extension?: string | null;
  className?: string;
}

export function FileIcon({ type, extension, className = 'w-5 h-5' }: FileIconProps) {
  if (type === 'folder') {
    return <Folder className={className} style={{ color: '#FFC107' }} />;
  }

  const category = getCategory(extension ?? null);

  switch (category) {
    case 'images':
      return <FileImage className={className} style={{ color: '#4CAF50' }} />;
    case 'audio':
      return <FileAudio className={className} style={{ color: '#2196F3' }} />;
    case 'video':
      return <FileVideo className={className} style={{ color: '#FF9800' }} />;
    case 'documents':
      return <FileText className={className} style={{ color: '#9C27B0' }} />;
    case 'data':
      if (extension?.toLowerCase() === '.csv' || extension?.toLowerCase() === '.xlsx') {
        return <FileSpreadsheet className={className} style={{ color: '#009688' }} />;
      }
      return <Database className={className} style={{ color: '#009688' }} />;
    case 'code':
      return <FileCode className={className} style={{ color: '#607D8B' }} />;
    case 'archives':
      return <FileArchive className={className} style={{ color: '#795548' }} />;
    default:
      return <File className={className} style={{ color: '#9E9E9E' }} />;
  }
}
