import { TlaCollectionItem, TlaEffectOutbox } from '@tldraw/dotcom-shared'
import { getCollectionItemContentKey } from './collectionStorage'
import { getThumbnailObjectNames } from './collectionThumbnails'

export interface CollectionItemEffectDeps {
	deleteStoredObjects(keys: string[]): Promise<void>
	deleteUploads(objectNames: string[]): Promise<void>
}

/**
 * Removes a deleted item's stored content and its thumbnails' uploads, which the deleted row, the
 * effect's payload, names. Its row is gone whether the item was deleted on its own or with its
 * collection or workspace, so nothing can ask for them again.
 */
export async function processCollectionItemEffect(
	deps: CollectionItemEffectDeps,
	row: TlaEffectOutbox
) {
	// Invariant: caller must route only tableName === 'collection_item' rows here.
	if (row.command !== 'delete') return
	const { thumbnail } = row.payload as Pick<TlaCollectionItem, 'thumbnail'>
	const thumbnailUploads = getThumbnailObjectNames(thumbnail ?? null)
	if (thumbnailUploads.length > 0) await deps.deleteUploads(thumbnailUploads)
	await deps.deleteStoredObjects([getCollectionItemContentKey(row.entityId)])
}
