/**
 * The freshly minted grant secret (#48's grant family, #98's wire): the
 * `souv-` grammar's generated half — `souv-` + 32 lowercase hex chars =
 * 128 bits of entropy, the cryptographic floor the grammar's smallest
 * form carries. The config's `SOUV_SECRET` accepts up to 64 hex chars;
 * the mint speaks the honest minimum — one template (`openssl rand
 * -hex 16`), one source.
 */
import { randomBytes } from 'node:crypto';

export function mintSecret(): string {
  return `souv-${randomBytes(16).toString('hex')}`;
}
