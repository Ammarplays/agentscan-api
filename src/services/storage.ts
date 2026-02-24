import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export interface StorageProvider {
  save(filename: string, data: Buffer): Promise<string>;
  read(filePath: string): Promise<Buffer>;
  delete(filePath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
}

class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async save(filename: string, data: Buffer): Promise<string> {
    await fs.mkdir(this.basePath, { recursive: true });
    const filePath = path.join(this.basePath, filename);
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async read(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  async delete(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // File may already be deleted
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export const storage: StorageProvider = new LocalStorageProvider(config.storagePath);
