import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InputMediaAsset } from '@formal-agent/core';

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.ts': 'text/plain',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.csv': 'text/csv'
};

export function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * Risolve un InputMediaAsset in Base64 e MIME type.
 * Supporta 'inline' e 'path' (leggendo dal disco).
 */
export function resolveMediaBase64(asset: InputMediaAsset): { base64: string; mimeType: string } {
  const source = asset.source;
  switch (source.kind) {
    case 'inline':
      return {
        base64: source.data,
        mimeType: source.mimeType
      };

    case 'path': {
      if (!fs.existsSync(source.filePath)) {
        throw new Error(`File not found at path: ${source.filePath}`);
      }
      const buffer = fs.readFileSync(source.filePath);
      const mimeType = source.mimeType ?? inferMimeType(source.filePath);
      return {
        base64: buffer.toString('base64'),
        mimeType
      };
    }

    case 'url':
      throw new Error(`Cannot synchronously convert HTTP URL to Base64 for asset ${asset.filename ?? source.url}. Use direct URL mode.`);

    case 'reference':
      throw new Error(`Remote file reference (${source.fileId}) is not supported for local Base64 conversion.`);
  }
}

/**
 * Risolve un InputMediaAsset testuale (modality: 'text_file') nel suo contenuto UTF-8.
 */
export function resolveTextFileContent(asset: InputMediaAsset): string {
  const source = asset.source;
  switch (source.kind) {
    case 'inline':
      // Se inline base64, decodifica a utf8
      return Buffer.from(source.data, 'base64').toString('utf-8');

    case 'path': {
      if (!fs.existsSync(source.filePath)) {
        throw new Error(`Text file not found at path: ${source.filePath}`);
      }
      return fs.readFileSync(source.filePath, 'utf-8');
    }

    case 'url':
      return `[Content available at URL: ${source.url}]`;

    case 'reference':
      return `[Provider file reference: ${source.fileId}]`;
  }
}

