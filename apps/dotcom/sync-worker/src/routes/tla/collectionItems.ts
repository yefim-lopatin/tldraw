import {
	can,
	isRole,
	MAX_COLLECTION_NAME_LENGTH,
	TlaCollectionItemThumbnail,
} from '@tldraw/dotcom-shared'
import { uniqueId } from '@tldraw/utils'
import { IRequest } from 'itty-router'
import {
	getCollectionAccess,
	getCollectionItemAccess,
	getCollectionItemContentKey,
	MAX_COLLECTION_ITEM_CONTENT_BYTES,
} from '../../collectionStorage'
import {
	COLLECTION_ITEM_THUMBNAIL_TYPES,
	MAX_COLLECTION_ITEM_THUMBNAIL_BYTES,
	putThumbnail,
	toThumbnailColumn,
} from '../../collectionThumbnails'
import { createPostgresConnectionPool } from '../../postgres'
import { Environment } from '../../types'
import { requireAuth } from '../../utils/tla/getAuth'

export interface AddCollectionItemResponseBody {
	id: string
	createdAt: number
	thumbnail: TlaCollectionItemThumbnail | null
}

// Callers who aren't members of the workspace get the same answer as for an id that doesn't
// exist, so ids can't be probed.
const notFound = () => Response.json({ error: 'Not found' }, { status: 404 })
const badRequest = (error: string) => Response.json({ error }, { status: 400 })

async function readText(value: FormDataEntryValue | null) {
	if (value === null) return null
	return typeof value === 'string' ? value : await value.text()
}

// A thumbnail field: null when it's left out, or the response refusing it.
function readThumbnail(value: FormDataEntryValue | null): File | null | Response {
	if (value === null || typeof value === 'string') return null
	if (!COLLECTION_ITEM_THUMBNAIL_TYPES.has(value.type)) {
		return badRequest('Thumbnail must be PNG, WebP or JPEG')
	}
	if (value.size > MAX_COLLECTION_ITEM_THUMBNAIL_BYTES) {
		return Response.json({ error: 'Thumbnail is too large' }, { status: 413 })
	}
	return value
}

function isItemContent(value: unknown) {
	if (!value || typeof value !== 'object') return false
	const { formatVersion, content } = value as { formatVersion?: unknown; content?: unknown }
	return formatVersion === 1 && !!content && typeof content === 'object'
}

/**
 * Adds an item to a collection: stores its content (a TLCollectionItemContent as JSON) privately
 * and its optional thumbnails as public uploads, then inserts its row, with the thumbnails' URLs,
 * which reaches clients through Zero. The worker picks the item's id, so a request can't name an
 * existing item and overwrite its content.
 *
 * Form fields: `content`, `thumbnail` (optional, PNG, WebP or JPEG), `darkThumbnail` (optional, and
 * only with `thumbnail`, which is then the light one of the pair) and `name` (optional).
 */
export async function addCollectionItem(request: IRequest, env: Environment) {
	const auth = await requireAuth(request, env)
	const collectionId = request.params.collectionId
	if (!collectionId) return badRequest('Collection id is required')

	const form = await request.formData().catch(() => null)
	if (!form) return badRequest('Expected form data')
	const contentText = await readText(form.get('content'))
	if (contentText === null) return badRequest('Content is required')
	if (new TextEncoder().encode(contentText).byteLength > MAX_COLLECTION_ITEM_CONTENT_BYTES) {
		return Response.json({ error: 'Content is too large' }, { status: 413 })
	}
	let content: unknown
	try {
		content = JSON.parse(contentText)
	} catch {
		return badRequest('Content must be JSON')
	}
	if (!isItemContent(content)) return badRequest('Content must be collection item content')

	const thumbnailFile = readThumbnail(form.get('thumbnail'))
	if (thumbnailFile instanceof Response) return thumbnailFile
	const darkThumbnailFile = readThumbnail(form.get('darkThumbnail'))
	if (darkThumbnailFile instanceof Response) return darkThumbnailFile
	if (darkThumbnailFile && !thumbnailFile) return badRequest('A dark thumbnail needs a light one')
	const name =
		(await readText(form.get('name')))?.trim().slice(0, MAX_COLLECTION_NAME_LENGTH) || null

	const db = createPostgresConnectionPool(env, 'addCollectionItem')
	try {
		const access = await getCollectionAccess(db, auth.userId, collectionId)
		if (!access || !isRole(access.role)) return notFound()
		if (!can(access.role, 'manageCollections')) {
			return Response.json({ error: 'Forbidden' }, { status: 403 })
		}

		const id = uniqueId()
		const contentKey = getCollectionItemContentKey(id)
		const uploads: string[] = []
		const now = Date.now()
		try {
			await env.ROOMS.put(contentKey, contentText, {
				httpMetadata: { contentType: 'application/json' },
			})
			const thumbnail =
				thumbnailFile && (await putThumbnail(env, thumbnailFile, darkThumbnailFile, uploads))
			await db
				.insertInto('collection_item')
				.values({
					id,
					collectionId,
					name,
					thumbnail: toThumbnailColumn(thumbnail),
					createdBy: auth.userId,
					createdAt: now,
					updatedAt: now,
				})
				.execute()
			return Response.json({
				id,
				createdAt: now,
				thumbnail,
			} satisfies AddCollectionItemResponseBody)
		} catch (error) {
			// e.g. the collection was deleted meanwhile; nothing refers to the objects yet
			await env.ROOMS.delete(contentKey)
			if (uploads.length > 0) await env.UPLOADS.delete(uploads)
			throw error
		}
	} finally {
		await db.destroy()
	}
}

/** An item's content, to members of its collection's workspace. */
export async function getCollectionItemContent(request: IRequest, env: Environment) {
	const auth = await requireAuth(request, env)
	const itemId = request.params.itemId
	if (!itemId) return badRequest('Item id is required')

	const db = createPostgresConnectionPool(env, 'getCollectionItem')
	try {
		const access = await getCollectionItemAccess(db, auth.userId, itemId)
		if (!access || !isRole(access.role)) return notFound()
	} finally {
		await db.destroy()
	}

	const object = await env.ROOMS.get(getCollectionItemContentKey(itemId))
	if (!object) return notFound()
	// Items are never edited, so what's stored under an id doesn't change.
	return new Response(object.body, {
		headers: {
			'content-type': 'application/json',
			'cache-control': 'private, max-age=31536000, immutable',
		},
	})
}
