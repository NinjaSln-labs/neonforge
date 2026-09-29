import type { ProviderDescriptor, ProviderId } from './types.js'
import { deepseekDescriptor } from './descriptors/deepseek.js'
import { commandcodeDescriptor } from './descriptors/commandcode.js'
import { opencodeZenDescriptor } from './descriptors/opencodeZen.js'
import { opencodeGoDescriptor } from './descriptors/opencodeGo.js'

/** 旧配置无 providerId 时的默认（与 ADR-007 生产通道一致） */
export const DEFAULT_PROVIDER_ID: ProviderId = 'commandcode'

const ALL: ProviderDescriptor[] = [
  deepseekDescriptor,
  commandcodeDescriptor,
  opencodeZenDescriptor,
  opencodeGoDescriptor,
]

const BY_ID = new Map(ALL.map((d) => [d.id, d]))

export function listProviders(): ProviderDescriptor[] {
  return ALL.slice()
}

export function getProvider(id: ProviderId): ProviderDescriptor {
  const d = BY_ID.get(id)
  if (!d) throw new Error(`providers: unknown id ${id}`)
  return d
}

export function isProviderId(id: unknown): id is ProviderId {
  return typeof id === 'string' && BY_ID.has(id as ProviderId)
}
