import { workspaceSchema, type Workspace } from './data.ts'
import { z } from 'zod'

export const storageKey = 'wattwise-workspace-v2'
export const profileStorageKey = 'wattwise-profiles-v3'

const localProfileSchema = z.object({
  id: z.string().min(1),
  workspace: workspaceSchema,
})
const profileStoreSchema = z.object({
  version: z.literal(3),
  activeProfileId: z.string().min(1).nullable(),
  profiles: z.array(localProfileSchema),
})
export type LocalProfile = z.infer<typeof localProfileSchema>
export type ProfileStore = z.infer<typeof profileStoreSchema>

export function emptyProfileStore(): ProfileStore {
  return { version: 3, activeProfileId: null, profiles: [] }
}

function parseProfileStore(value: unknown): ProfileStore {
  const store = profileStoreSchema.parse(value)
  const ids = new Set(store.profiles.map((profile) => profile.id))
  if (ids.size !== store.profiles.length) throw new Error('Saved profile identifiers must be unique.')
  if (store.activeProfileId !== null && !ids.has(store.activeProfileId)) throw new Error('The saved active profile was not found.')
  for (const { workspace } of store.profiles) {
    if (!workspace.homes.some((home) => home.id === workspace.activeHomeId)) throw new Error('The saved active home was not found.')
  }
  return store
}

export function loadProfileStore(storage: Pick<Storage, 'getItem'>): ProfileStore {
  const stored = storage.getItem(profileStorageKey)
  if (stored !== null) return parseProfileStore(JSON.parse(stored))
  const workspace = loadWorkspace(storage)
  if (!workspace) return emptyProfileStore()
  const id = crypto.randomUUID()
  return { version: 3, activeProfileId: id, profiles: [{ id, workspace }] }
}

export function saveProfileStore(storage: Pick<Storage, 'setItem'>, store: ProfileStore): void {
  storage.setItem(profileStorageKey, JSON.stringify(parseProfileStore(store)))
}

export function loadWorkspace(storage: Pick<Storage, 'getItem'>): Workspace | null {
  const stored = storage.getItem(storageKey)
  if (stored === null) return null
  const parsed = workspaceSchema.parse(JSON.parse(stored))
  if (!parsed.homes.some((home) => home.id === parsed.activeHomeId)) throw new Error('The saved active home was not found.')
  return parsed
}

export function saveWorkspace(storage: Pick<Storage, 'setItem'>, workspace: Workspace): void {
  storage.setItem(storageKey, JSON.stringify(workspaceSchema.parse(workspace)))
}
