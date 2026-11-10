import {
	copyPack,
	type CollectionPack,
	type CollectionSource,
	type TLCollection,
} from '@tldraw/collections'
import diagramming from './starterPackDiagramming.json'
import doodles from './starterPackDoodles.json'
import floorPlan from './starterPackFloorPlan.json'
import tldrawCharacters from './starterPackTldrawCharacters.json'
import wireframing from './starterPackWireframing.json'

export const STARTER_PACKS = [
	wireframing,
	diagramming,
	floorPlan,
	tldrawCharacters,
	doodles,
] as unknown as CollectionPack[]

function getDefaultOwnerId(source: CollectionSource) {
	return source.getDefaultOwnerId ? source.getDefaultOwnerId() : undefined
}

/** Whether the user may add a starter pack, i.e. create a collection for the default owner. */
export function canAddStarterPack(source: CollectionSource) {
	const ownerId = getDefaultOwnerId(source)
	return source.can('createCollection', ownerId === undefined ? undefined : { ownerId })
}

/** Copies a starter pack into the source's default owner, or wherever the source puts new collections. */
export function addStarterPack(source: CollectionSource, pack: CollectionPack) {
	const ownerId = getDefaultOwnerId(source)
	return copyPack(source, pack, ownerId === undefined ? {} : { ownerId })
}

/** The pack a collection was copied from, as recorded by `copyPack`, if any. */
export function getStarterPackId(collection: TLCollection): string | undefined {
	const { packId } = collection.meta
	return typeof packId === 'string' ? packId : undefined
}

/**
 * Whether the source holds a copy of the pack, in its default owner if it has one. Deleting the
 * copy makes the pack addable again.
 */
export function isStarterPackAdded(source: CollectionSource, packId: string) {
	const ownerId = getDefaultOwnerId(source)
	return source
		.getCollections()
		.some(
			(collection) =>
				(ownerId === undefined || collection.ownerId === ownerId) &&
				getStarterPackId(collection) === packId
		)
}
