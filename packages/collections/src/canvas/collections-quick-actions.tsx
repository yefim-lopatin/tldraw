import {
	DefaultQuickActions,
	DefaultQuickActionsContent,
	defineMessages,
	TldrawUiButtonIcon,
	TldrawUiToolbarButton,
	useEditor,
	useTranslation,
	useValue,
	type TLUiQuickActionsProps,
} from 'tldraw'
import { useCollectionsEnabled } from './license'
import { collectionsPanelOpen, toggleCollectionsPanel } from './state'

const messages = defineMessages({
	title: { id: 'collections.title', defaultMessage: 'Collections' },
})

/**
 * A `QuickActions` override: tldraw's quick actions followed by a button that opens and closes the
 * {@link CollectionsPanel}, so the button sits before the actions menu: in the menu panel on wide
 * screens, and in the toolbar on narrow ones.
 *
 * @example
 * ```tsx
 * <Tldraw components={{ QuickActions: CollectionsQuickActions }} />
 * ```
 * @public @react
 */
export function CollectionsQuickActions({ children }: TLUiQuickActionsProps) {
	return (
		<DefaultQuickActions>
			{children ?? <DefaultQuickActionsContent />}
			<CollectionsToolbarButton />
		</DefaultQuickActions>
	)
}

function CollectionsToolbarButton() {
	const editor = useEditor()
	const msg = useTranslation()
	const collectionsEnabled = useCollectionsEnabled()
	const open = useValue('collections panel open', () => collectionsPanelOpen.get(editor), [editor])

	if (!collectionsEnabled) return null

	return (
		<TldrawUiToolbarButton
			type="icon"
			aria-pressed={open}
			isActive={open}
			title={msg(messages.title)}
			onClick={() => toggleCollectionsPanel(editor)}
		>
			<TldrawUiButtonIcon icon="bookmark" small />
		</TldrawUiToolbarButton>
	)
}
