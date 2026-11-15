import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InputMediaAsset } from '@simple-agents/core';

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
 * ============================================================================
 * INTERFACCIA ASTRATTA DEL RISOLUTORE DEI FILE (MediaResolver)
 * ============================================================================
 * Disaccoppia la risoluzione dei file locali (kind: 'path') dal filesystem host.
 * Il 'path' passato dall'utente diventa una chiave semantica di lookup.
 */
export interface ResolvedMedia {
  base64: string;
  mimeType: string;
}

export type InMemoryFileContent = Buffer | Uint8Array | string;

export interface InMemoryFileEntry {
  data: InMemoryFileContent;
  mimeType?: string;
}

export interface MediaResolver {
  /**
   * Risolve una risorsa binaria/multimediale a partire dalla chiave semantica fornita.
   */
  resolveBinary(key: string, mimeTypeHint?: string): Promise<ResolvedMedia>;

  /**
   * Risolve una risorsa testuale UTF-8 a partire dalla chiave semantica fornita.
   */
  resolveText(key: string): Promise<string>;
}

/**
 * In-memory media resolver: resolves files from an internal map without accessing disk.
 * Ideal for unit testing, browser contexts, edge workers, and sandboxed test environments.
 *
 * @example
 * ```typescript
 * import { InMemoryMediaResolver } from '@simple-agents/adapters';
 *
 * const resolver = new InMemoryMediaResolver({
 *   'sample.png': {
 *     data: Buffer.from('mock-bytes'),
 *     mimeType: 'image/png',
 *   },
 * });
 * ```
 */
export class InMemoryMediaResolver implements MediaResolver {
  private readonly files = new Map<string, InMemoryFileEntry>();

  constructor(initialFiles?: Record<string, InMemoryFileEntry | InMemoryFileContent>) {
    if (initialFiles) {
      for (const [key, value] of Object.entries(initialFiles)) {
        if (typeof value === 'object' && value !== null && 'data' in value && !(value instanceof Uint8Array)) {
          this.set(key, value.data, value.mimeType);
        } else {
          this.set(key, value as InMemoryFileContent);
        }
      }
    }
  }

  set(key: string, data: InMemoryFileContent, mimeType?: string): this {
    this.files.set(key, { data, mimeType });
    return this;
  }

  get(key: string): InMemoryFileEntry | undefined {
    return this.files.get(key);
  }

  has(key: string): boolean {
    return this.files.has(key);
  }

  async resolveBinary(key: string, mimeTypeHint?: string): Promise<ResolvedMedia> {
    const entry = this.files.get(key);
    if (!entry) {
      const available = Array.from(this.files.keys()).join(', ');
      throw new Error(`InMemoryMediaResolver: File not found for key '${key}'. Available keys: [${available}]`);
    }

    const mimeType = mimeTypeHint ?? entry.mimeType ?? inferMimeType(key);
    let base64: string;

    if (typeof entry.data === 'string') {
      base64 = Buffer.from(entry.data).toString('base64');
    } else if (Buffer.isBuffer(entry.data)) {
      base64 = entry.data.toString('base64');
    } else {
      base64 = Buffer.from(entry.data).toString('base64');
    }

    return { base64, mimeType };
  }

  async resolveText(key: string): Promise<string> {
    const entry = this.files.get(key);
    if (!entry) {
      const available = Array.from(this.files.keys()).join(', ');
      throw new Error(`InMemoryMediaResolver: File not found for key '${key}'. Available keys: [${available}]`);
    }

    if (typeof entry.data === 'string') {
      return entry.data;
    }
    return Buffer.from(entry.data).toString('utf-8');
  }
}

/**
 * Node.js filesystem media resolver: resolves files asynchronously from the host filesystem.
 *
 * @example
 * ```typescript
 * import { NodeFileSystemMediaResolver } from '@simple-agents/adapters';
 *
 * const resolver = new NodeFileSystemMediaResolver();
 * ```
 */
export class NodeFileSystemMediaResolver implements MediaResolver {
  async resolveBinary(key: string, mimeTypeHint?: string): Promise<ResolvedMedia> {
    try {
      const buffer = await fs.promises.readFile(key);
      const mimeType = mimeTypeHint ?? inferMimeType(key);
      return {
        base64: buffer.toString('base64'),
        mimeType
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`NodeFileSystemMediaResolver: Failed to read media file at '${key}': ${msg}`);
    }
  }

  async resolveText(key: string): Promise<string> {
    try {
      return await fs.promises.readFile(key, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`NodeFileSystemMediaResolver: Failed to read text file at '${key}': ${msg}`);
    }
  }
}

/**
 * Risolve un InputMediaAsset in Base64 e MIME type in modo sincrono (compatibilità legacy).
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
 * Risolve un InputMediaAsset testuale (modality: 'text_file') nel suo contenuto UTF-8 in modo sincrono.
 */
export function resolveTextFileContent(asset: InputMediaAsset): string {
  const source = asset.source;
  switch (source.kind) {
    case 'inline': {
      if (source.data.includes('\n') || source.data.includes('\r')) {
        return source.data;
      }
      try {
        const decoded = Buffer.from(source.data, 'base64').toString('utf-8');
        if (Buffer.from(decoded, 'utf-8').toString('base64') === source.data.trim()) {
          return decoded;
        }
        return source.data;
      } catch {
        return source.data;
      }
    }

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

