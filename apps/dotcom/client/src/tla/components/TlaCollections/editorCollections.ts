import {
	BoardCollectionSource,
	CompositeCollectionSource,
	type CollectionSource,
} from '@tldraw/collections'
import { defineMessages, type Editor } from 'tldraw'
import type { TldrawApp } from '../../app/TldrawApp'

const messages = defineMessages({
	thisBoard: { defaultMessage: 'This board' },
})

const sources = new WeakMap<Editor, { fileId: string; source: CollectionSource }>()

/**
 * The collections an open file's editor offers: the board's own, kept as records in the file's
 * document so they are saved, synced and duplicated with it, then the user's own collections under
 * the workspaces they belong to. New collections go to the user's home workspace.
 *
 * Made once per editor, so the panel and the context menu share it.
 */
export function getEditorCollections(
	app: Pick<TldrawApp, 'getHomeWorkspaceId' | 'msg'>,
	userCollections: CollectionSource,
	editor: Editor,
	fileId: string
): CollectionSource {
	const existing = sources.get(editor)
	if (existing && existing.fileId === fileId) return existing.source
	const source = new CompositeCollectionSource({
		// The user source's id, so choices the UI keeps per source carry over.
		id: userCollections.id,
		defaultOwnerId: app.getHomeWorkspaceId(),
		parts: [
			{
				owner: { id: fileId, name: app.msg(messages.thisBoard) },
				source: new BoardCollectionSource(editor, { id: `board:${fileId}` }),
			},
			{ source: userCollections },
		],
	})
	sources.set(editor, { fileId, source })
	return source
}
