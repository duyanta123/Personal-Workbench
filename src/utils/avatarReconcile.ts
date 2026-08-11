export interface AvatarStorageFile {
  name: string
  updated_at?: string | null
  created_at?: string | null
}

export interface AvatarReconcileSource {
  revision: () => Promise<string | number>
  records: () => Promise<{ storage_path: string }[]>
  files: () => Promise<AvatarStorageFile[]>
  remove: (paths: string[]) => Promise<unknown>
}

/** Fail-closed lazy cleanup used by app startup and successful uploads. */
export async function reconcileAvatarFiles(
  uid: string,
  source: AvatarReconcileSource,
  now = Date.now()
): Promise<string[]> {
  try {
    const revisionBefore = await source.revision()
    const [records, files] = await Promise.all([source.records(), source.files()])
    const revisionAfter = await source.revision()
    if (String(revisionBefore) !== String(revisionAfter)) return []

    const keep = new Set(records.map((row) => row.storage_path))
    const unreferenced = files.filter((file) => !keep.has(`${uid}/${file.name}`))
    if (unreferenced.some((file) => {
      const stamp = file.updated_at ?? file.created_at
      return !stamp || !Number.isFinite(Date.parse(stamp))
    })) return []

    const cutoff = now - 24 * 60 * 60 * 1000
    const stale = unreferenced
      .filter((file) => Date.parse((file.updated_at ?? file.created_at)!) < cutoff)
      .map((file) => `${uid}/${file.name}`)
    if (stale.length) await source.remove(stale)
    return stale
  } catch {
    return []
  }
}
