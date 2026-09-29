import { openDB } from 'idb'
import type { PlayerCard, PlayerId, SavedScenario } from '../domain/model'
import type { RallySession } from '../domain/rally'

export interface SavedPlayer {
  schemaVersion: 1
  id: string
  name: string
  card: PlayerCard
  updatedAt: string
}

const dbPromise = openDB('badminton-tactical-lab', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('players')) db.createObjectStore('players', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('scenarios')) db.createObjectStore('scenarios', { keyPath: 'id' })
    if (!db.objectStoreNames.contains('rallies')) db.createObjectStore('rallies', { keyPath: 'id' })
  },
})

export const localRepository = {
  async listRallies(): Promise<RallySession[]> {
    return ((await (await dbPromise).getAll('rallies')) as RallySession[])
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  async saveRally(session: RallySession): Promise<void> {
    await (await dbPromise).put('rallies', structuredClone(session))
  },
  async removeRally(id: string): Promise<void> {
    await (await dbPromise).delete('rallies', id)
  },
  async listPlayers(): Promise<SavedPlayer[]> {
    return ((await (await dbPromise).getAll('players')) as SavedPlayer[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  async savePlayer(card: PlayerCard): Promise<SavedPlayer> {
    const entry: SavedPlayer = { schemaVersion: 1, id: crypto.randomUUID(), name: card.name, card: structuredClone(card), updatedAt: new Date().toISOString() }
    await (await dbPromise).put('players', entry)
    return entry
  },
  async removePlayer(id: string): Promise<void> { await (await dbPromise).delete('players', id) },
  async listScenarios(): Promise<SavedScenario[]> {
    return ((await (await dbPromise).getAll('scenarios')) as SavedScenario[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  async saveScenario(name: string, cards: Record<PlayerId, PlayerCard>, court: SavedScenario['court'], context: SavedScenario['context'], chain: SavedScenario['chain'], previous?: SavedScenario): Promise<SavedScenario> {
    const now = new Date().toISOString()
    const entry: SavedScenario = { schemaVersion: 1, id: previous?.id ?? crypto.randomUUID(), name, createdAt: previous?.createdAt ?? now, updatedAt: now, cards: structuredClone(cards), court: structuredClone(court), context: structuredClone(context), chain: structuredClone(chain) }
    await (await dbPromise).put('scenarios', entry)
    return entry
  },
  async renameScenario(entry: SavedScenario, name: string): Promise<SavedScenario> {
    const renamed = { ...entry, name, updatedAt: new Date().toISOString() }
    await (await dbPromise).put('scenarios', renamed)
    return renamed
  },
  async duplicateScenario(entry: SavedScenario): Promise<SavedScenario> {
    const copy = { ...structuredClone(entry), id: crypto.randomUUID(), name: `${entry.name}（副本）`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    await (await dbPromise).put('scenarios', copy)
    return copy
  },
  async removeScenario(id: string): Promise<void> { await (await dbPromise).delete('scenarios', id) },
}
