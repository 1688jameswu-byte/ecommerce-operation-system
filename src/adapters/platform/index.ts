export type {
  PlatformAdapter,
  PlatformAdapterInput,
  PlatformAdapterOutput,
  PlatformRawRecord,
  PlatformType,
} from './platformAdapterTypes';
export { TEMUAdapter } from './temuAdapter';

import type { PlatformAdapter, PlatformType } from './platformAdapterTypes';
import { TEMUAdapter } from './temuAdapter';

export function getPlatformAdapter(platform: PlatformType): PlatformAdapter | undefined {
  if (platform === 'temu') {
    return new TEMUAdapter();
  }

  // TODO: add Amazon / 1688 / TikTok / Shopify adapters after their real raw-field mappings are defined.
  return undefined;
}
