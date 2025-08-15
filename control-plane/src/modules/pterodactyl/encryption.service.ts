import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as sodium from 'sodium-native';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    const keyHex = this.configService.get('ENCRYPTION_KEY');
    if (!keyHex) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }
    
    this.key = Buffer.from(keyHex, 'hex');
    if (this.key.length !== sodium.crypto_secretbox_KEYBYTES) {
      throw new Error(`Encryption key must be ${sodium.crypto_secretbox_KEYBYTES} bytes (${sodium.crypto_secretbox_KEYBYTES * 2} hex characters)`);
    }
  }

  encrypt(plaintext: string): string {
    try {
      const message = Buffer.from(plaintext, 'utf8');
      const nonce = Buffer.allocUnsafe(sodium.crypto_secretbox_NONCEBYTES);
      const ciphertext = Buffer.allocUnsafe(message.length + sodium.crypto_secretbox_MACBYTES);

      sodium.randombytes_buf(nonce);
      sodium.crypto_secretbox_easy(ciphertext, message, nonce, this.key);

      const result = Buffer.concat([nonce, ciphertext]);
      return result.toString('base64');
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  decrypt(encryptedData: string): string {
    try {
      const data = Buffer.from(encryptedData, 'base64');
      
      if (data.length < sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES) {
        throw new Error('Invalid encrypted data length');
      }

      const nonce = data.subarray(0, sodium.crypto_secretbox_NONCEBYTES);
      const ciphertext = data.subarray(sodium.crypto_secretbox_NONCEBYTES);
      const message = Buffer.allocUnsafe(ciphertext.length - sodium.crypto_secretbox_MACBYTES);

      const success = sodium.crypto_secretbox_open_easy(message, ciphertext, nonce, this.key);
      if (!success) {
        throw new Error('Decryption failed - invalid data or key');
      }

      return message.toString('utf8');
    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  generateKey(): string {
    const key = Buffer.allocUnsafe(sodium.crypto_secretbox_KEYBYTES);
    sodium.randombytes_buf(key);
    return key.toString('hex');
  }
}