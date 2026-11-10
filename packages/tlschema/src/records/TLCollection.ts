import {
	BaseRecord,
	createRecordMigrationSequence,
	createRecordType,
	RecordId,
	SerializedSchema,
} from '@tldraw/store'
import { JsonObject } from '@tldraw/utils'
import { T } from '@tldraw/validate'
import { idValidator } from '../misc/id-validator'
import { TLAssetId } from './TLAsset'
import { TLBinding } from './TLBinding'
import { CustomRecordInfo } from './TLCustomRecord'
import { TLShape, TLShapeId } from './TLShape'
import { TLUser } from './TLUser'

/** @internal */
export type TLCollectionId = RecordId<TLCollection>

/**
 * A named list of items. Where it is stored is up to the source that provides it.
 *
 * Collections kept in a document are opt-in: register `collectionSchemaRecords` with
 * `createTLSchema({ records })` on the server and the matching `records` option on the client.
 *
 * @internal
 */
export interface TLCollection extends BaseRecord<'collection', TLCollectionId> {
	name: string
	/**
	 * Who the collection belongs to, such as a user or a workspace, as the source names them in
	 * `CollectionSource.getCollectionOwners`. What an owner is stays up to the source. Left out by
	 * sources that don't track owners.
	 */
	ownerId?: string
	meta: JsonObject
}

/**
 * An item's preview: one image for every colour mode, or a light and a dark one for apps that have
 * both. `Src` is what names each image: an asset id on a stored item, a URL on a listed one, a
 * `Blob` when adding one.
 *
 * @internal
 */
export type TLCollectionThumbnail<Src = string> = Src | { light: Src; dark: Src }

/** @internal */
export type TLCollectionItemId = RecordId<TLCollectionItemRecord>

/**
 * An item as a record in a document's store. Its thumbnail names image asset records in the same
 * store, so the images are uploaded, synced and copied like any other asset in the document. Its
 * content is a separate {@link TLCollectionItemContentRecord}, so listing a collection never reads
 * shapes.
 *
 * @internal
 */
export interface TLCollectionItemRecord extends BaseRecord<'collection-item', TLCollectionItemId> {
	collectionId: TLCollectionId
	/** Left out when nobody has named the item. When present it is never blank. */
	name?: string
	/** Left out when the item has no thumbnail. */
	thumbnail?: TLCollectionThumbnail<TLAssetId>
	/** When the item was saved, in milliseconds since the epoch. */
	createdAt?: number
	/** Always 1 for now: items aren't replaced. To change one, delete it and add it again. */
	version: number
	meta: JsonObject
}

/** @internal */
export type TLCollectionItemContentRecordId = RecordId<TLCollectionItemContentRecord>

/**
 * An item's content, as a record of its own, keyed by the item's id (see
 * {@link createCollectionItemContentId}) so finding it needs no index.
 *
 * Assets are not copied in: `assetIds` names asset records in the same store, so whatever the
 * document does with its assets happens to these too. The shapes stay at the schema they were
 * saved with, in `content.schema`, and are migrated when the content is loaded.
 *
 * @internal
 */
export interface TLCollectionItemContentRecord extends BaseRecord<
	'collection-item-content',
	TLCollectionItemContentRecordId
> {
	itemId: TLCollectionItemId
	content: {
		shapes: TLShape[]
		bindings?: TLBinding[]
		rootShapeIds: TLShapeId[]
		schema: SerializedSchema
		users?: TLUser[]
	}
	assetIds: TLAssetId[]
	meta: JsonObject
}

/** @internal */
export type TLCollectionRecord =
	| TLCollection
	| TLCollectionItemRecord
	| TLCollectionItemContentRecord

const nonEmptyString = T.string.check((value) => {
	if (value.trim().length === 0) throw new T.ValidationError('Expected a non-empty string')
})

const assetIdValidator = idValidator<TLAssetId>('asset')

/** @internal */
export const collectionValidator: T.Validator<TLCollection> = T.object({
	id: idValidator<TLCollectionId>('collection'),
	typeName: T.literal('collection'),
	name: nonEmptyString,
	ownerId: nonEmptyString.optional(),
	meta: T.jsonValue as T.ObjectValidator<JsonObject>,
})

/** @internal */
export const collectionItemRecordValidator: T.Validator<TLCollectionItemRecord> = T.object({
	id: idValidator<TLCollectionItemId>('collection-item'),
	typeName: T.literal('collection-item'),
	collectionId: idValidator<TLCollectionId>('collection'),
	name: nonEmptyString.optional(),
	thumbnail: T.or(
		assetIdValidator,
		T.object({ light: assetIdValidator, dark: assetIdValidator })
	).optional(),
	createdAt: T.number.optional(),
	version: T.positiveInteger,
	meta: T.jsonValue as T.ObjectValidator<JsonObject>,
})

// Only the envelope is checked. The records inside are at the schema they were saved with, and
// are migrated and validated against the app's schema when the content is loaded.
const storedContentValidator = T.object({
	shapes: T.arrayOf(T.unknownObject),
	bindings: T.arrayOf(T.unknownObject).optional(),
	rootShapeIds: T.arrayOf(idValidator<TLShapeId>('shape')),
	schema: T.unknownObject,
	users: T.arrayOf(T.unknownObject).optional(),
}) as T.Validator<unknown> as T.Validator<TLCollectionItemContentRecord['content']>

/** @internal */
export const collectionItemContentValidator: T.Validator<TLCollectionItemContentRecord> = T.object({
	id: idValidator<TLCollectionItemContentRecordId>('collection-item-content'),
	typeName: T.literal('collection-item-content'),
	itemId: idValidator<TLCollectionItemId>('collection-item'),
	content: storedContentValidator,
	assetIds: T.arrayOf(assetIdValidator),
	meta: T.jsonValue as T.ObjectValidator<JsonObject>,
})

/**
 * Guard migrations, as for comments: each sequence starts with an identity migration that has no
 * `down`, so a session whose schema predates the collection types is rejected with CLIENT_TOO_OLD
 * instead of being sent records its store can't represent.
 */
function createCollectionGuardMigrations(typeName: TLCollectionRecord['typeName']) {
	return createRecordMigrationSequence({
		sequenceId: `com.tldraw.${typeName}`,
		recordType: typeName,
		retroactive: true,
		sequence: [{ id: `com.tldraw.${typeName}/1`, up: (record) => record }],
	})
}

/** @internal */
export const CollectionRecordType = createRecordType<TLCollection>('collection', {
	validator: collectionValidator,
	scope: 'document',
}).withDefaultProperties(() => ({ meta: {} }))

/** @internal */
export const CollectionItemContentRecordType = createRecordType<TLCollectionItemContentRecord>(
	'collection-item-content',
	{ validator: collectionItemContentValidator, scope: 'document' }
).withDefaultProperties(() => ({ meta: {} }))

/**
 * The `records` map to pass to `createTLSchema` / the client `records` option so a document can
 * hold collections. Register the types together, and identically on both sides of a connection.
 *
 * @internal
 */
export const collectionSchemaRecords = {
	collection: {
		scope: 'document',
		validator: collectionValidator,
		migrations: createCollectionGuardMigrations('collection'),
		createDefaultProperties: () => ({ meta: {} }),
	},
	'collection-item': {
		scope: 'document',
		validator: collectionItemRecordValidator,
		migrations: createCollectionGuardMigrations('collection-item'),
		createDefaultProperties: () => ({ version: 1, meta: {} }),
	},
	'collection-item-content': {
		scope: 'document',
		validator: collectionItemContentValidator,
		migrations: createCollectionGuardMigrations('collection-item-content'),
		createDefaultProperties: () => ({ meta: {} }),
	},
} satisfies Record<TLCollectionRecord['typeName'], CustomRecordInfo>

/**
 * The id of an item's content record: the item's own id, under the content type.
 *
 * @internal
 */
export function createCollectionItemContentId(
	itemId: TLCollectionItemId
): TLCollectionItemContentRecordId {
	return CollectionItemContentRecordType.createId(itemId.slice('collection-item:'.length))
}
