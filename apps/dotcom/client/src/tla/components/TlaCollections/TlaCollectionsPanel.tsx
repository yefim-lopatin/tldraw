import { AddToCollectionMenuItem, CollectionsPanel } from '@tldraw/collections'
import { useMemo } from 'react'
import { useEditor } from 'tldraw'
import { useMaybeApp } from '../../hooks/useAppState'
import { getEditorCollections } from './editorCollections'
import { TlaBrowseStarterPacksMenuItem } from './TlaStarterPacksDialog'

function useEditorCollections(fileId: string) {
	const app = useMaybeApp()
	const editor = useEditor()
	const userCollections = app?.collections
	return useMemo(
		() =>
			app && userCollections ? getEditorCollections(app, userCollections, editor, fileId) : null,
		[app, userCollections, editor, fileId]
	)
}

export function TlaCollectionsPanel({ fileId }: { fileId: string }) {
	const source = useEditorCollections(fileId)
	if (!source) return null
	return (
		<CollectionsPanel
			source={source}
			side="right"
			menuItems={<TlaBrowseStarterPacksMenuItem source={source} />}
		/>
	)
}

export function TlaAddToCollectionMenuItem({ fileId }: { fileId: string }) {
	const source = useEditorCollections(fileId)
	if (!source) return null
	return <AddToCollectionMenuItem source={source} />
}
