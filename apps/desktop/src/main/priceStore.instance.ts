// PriceStore 单例（main userData/config/prices.json）。
import { app } from 'electron'
import path from 'node:path'
import { PriceStore } from './priceStore.js'

let store: PriceStore | null = null

export function getPriceStore(): PriceStore {
  if (!store) store = new PriceStore(path.join(app.getPath('userData'), 'config', 'prices.json'))
  return store
}
