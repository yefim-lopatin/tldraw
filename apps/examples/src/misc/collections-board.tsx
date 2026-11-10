import {
	AddToCollectionMenuItem,
	BoardCollectionSource,
	CollectionsPanel,
	collectionsPanelOpen,
	CollectionsQuickActions,
} from '@tldraw/collections'
import { useMemo, useState } from 'react'
import {
	collectionSchemaRecords,
	createTLSchema,
	DefaultContextMenu,
	DefaultContextMenuContent,
	Editor,
	TLComponents,
	Tldraw,
	useLocalStore,
} from 'tldraw'
import '@tldraw/collections/collections.css'
import 'tldraw/tldraw.css'

// Unlisted, like /collections: the collections live in this document's own store, next to its
// shapes. The collection records make this schema newer than the default one, so no other page may
// share its persistence key.
export default function CollectionsBoard() {
	const schema = useMemo(() => createTLSchema({ records: collectionSchemaRecords }), [])
	const store = useLocalStore({ persistenceKey: 'collections-board', schema })
	const [source, setSource] = useState<BoardCollectionSource>()

	const components = useMemo<TLComponents>(() => {
		if (!source) return {}
		return {
			InFrontOfTheCanvas: () => <CollectionsPanel source={source} />,
			ContextMenu: (props) => (
				<DefaultContextMenu {...props}>
					<AddToCollectionMenuItem source={source} />
					<DefaultContextMenuContent />
				</DefaultContextMenu>
			),
			QuickActions: CollectionsQuickActions,
		}
	}, [source])

	const handleMount = (editor: Editor) => {
		setSource(new BoardCollectionSource(editor))
		collectionsPanelOpen.set(editor, true)
	}

	return (
		<div className="tldraw__editor">
			<Tldraw store={store} components={components} onMount={handleMount} />
		</div>
	)
}
