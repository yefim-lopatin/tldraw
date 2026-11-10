import { useSync } from '@tldraw/sync'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
	Tldraw,
	useEditor,
	defaultShapeUtils,
	getFromLocalStorage,
	setInLocalStorage,
	type TLAssetStore,
	DefaultToolbar,
	useBreakpoint,
	PORTRAIT_BREAKPOINT,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	TldrawUiButtonIcon,
	type DefaultToolbarProps,
} from 'tldraw'
import { isRoomId } from '../shared/dice'
import { DiceHistory } from './dice/DiceHistory'
import { DiceRoller } from './dice/DiceRoller'
import { DiceRollShapeUtil } from './dice/DiceRollShape'
import { loadDiceFont, migrateDiceCards } from './dice/diceText'
import { diceThemes } from './dice/diceTheme'

const shapeUtils = [...defaultShapeUtils, DiceRollShapeUtil]
interface RoomState {
	roomId: string
	username: string
	setUsername(value: string): void
	historyOpen: boolean
	toggleHistory(): void
	closeHistory(): void
	revision: number
	onRoll(): void
}
const RoomContext = createContext<RoomState | null>(null)
function useRoom() {
	const value = useContext(RoomContext)
	if (!value) throw new Error('Комната не открыта')
	return value
}
const assets: TLAssetStore = {
	async upload(_asset, file) {
		const extension =
			file.name
				.split('.')
				.pop()
				?.replace(/[^a-zA-Z0-9]/g, '')
				.slice(0, 12) || 'bin'
		const src = `/uploads/${crypto.randomUUID()}.${extension}`
		const response = await fetch(src, { method: 'PUT', body: file })
		if (!response.ok) throw new Error('Не удалось загрузить файл')
		return { src }
	},
	resolve(asset) {
		return asset.props.src
	},
}

function readRoom() {
	const value = new URLSearchParams(location.hash.slice(1)).get('room')
	if (isRoomId(value)) return value
	const room = crypto.randomUUID()
	history.replaceState(null, '', `#room=${room}`)
	return room
}

function RoomTools() {
	const editor = useEditor()
	const { roomId, username, setUsername, historyOpen, closeHistory, revision } = useRoom()
	const [message, setMessage] = useState('')
	useEffect(() => {
		editor.user.updateUserPreferences({ name: username, locale: 'ru' })
	}, [editor, username])
	const share = async () => {
		try {
			await navigator.clipboard.writeText(location.href)
			setMessage('Ссылка скопирована')
		} catch {
			setMessage('Скопируйте адрес страницы, чтобы пригласить игроков')
		}
	}
	return (
		<div
			className="vtm-tools"
			onPointerDown={(e) => e.stopPropagation()}
			onWheel={(e) => e.stopPropagation()}
		>
			<div className="vtm-room-bar">
				<label>
					Имя{' '}
					<input
						aria-label="Имя игрока"
						value={username}
						maxLength={100}
						onChange={(e) => {
							setUsername(e.target.value)
							setInLocalStorage('vtm-player-name', e.target.value)
						}}
					/>
				</label>
				<button type="button" onClick={share}>
					Пригласить
				</button>
				{message && <span role="status">{message}</span>}
			</div>
			{historyOpen && (
				<div className="vtm-history-panel">
					<button
						className="vtm-history-close"
						type="button"
						aria-label="Закрыть историю"
						onClick={closeHistory}
					>
						×
					</button>
					<DiceHistory roomId={roomId} revision={revision} />
				</div>
			)}
		</div>
	)
}

function DiceToolbar(props: DefaultToolbarProps) {
	const breakpoint = useBreakpoint()
	const editor = useEditor()
	const { roomId, username, onRoll, historyOpen, toggleHistory } = useRoom()
	return (
		<div className="vtm-main-toolbar">
			<DefaultToolbar {...props} minItems={breakpoint >= PORTRAIT_BREAKPOINT.TABLET ? 8 : 4} />
			<TldrawUiToolbar
				orientation="horizontal"
				label="Броски кубиков"
				className="vtm-toolbar-addon"
			>
				<DiceRoller editor={editor} roomId={roomId} username={username} onRoll={onRoll} />
				<TldrawUiToolbarButton
					type="icon"
					title="История бросков"
					isActive={historyOpen}
					onClick={toggleHistory}
				>
					<TldrawUiButtonIcon icon="list" />
				</TldrawUiToolbarButton>
			</TldrawUiToolbar>
		</div>
	)
}

const components = { InFrontOfTheCanvas: RoomTools, Toolbar: DiceToolbar }

function Room({ roomId }: { roomId: string }) {
	const [username, setUsername] = useState(() => getFromLocalStorage('vtm-player-name') || 'Игрок')
	const [historyOpen, setHistoryOpen] = useState(false)
	const [revision, setRevision] = useState(0)
	const onRoll = useCallback(() => setRevision((n) => n + 1), [])
	const store = useSync({
		uri: `${location.origin.replace(/^http/, 'ws')}/connect/${roomId}`,
		assets,
		shapeUtils,
		themes: diceThemes,
	})
	return (
		<RoomContext.Provider
			value={{
				roomId,
				username,
				setUsername,
				historyOpen,
				revision,
				onRoll,
				toggleHistory: () => setHistoryOpen((v) => !v),
				closeHistory: () => setHistoryOpen(false),
			}}
		>
			<Tldraw
				store={store}
				shapeUtils={shapeUtils}
				components={components}
				themes={diceThemes}
				overrides={{
					translations: { ru: { 'font-style.dice': 'Кубики' }, en: { 'font-style.dice': 'Dice' } },
				}}
				onMount={(editor) => {
					let active = true
					void loadDiceFont(editor).then(() => {
						if (active) migrateDiceCards(editor)
					})
					return () => {
						active = false
					}
				}}
			/>
		</RoomContext.Provider>
	)
}

export default function App() {
	const [roomId, setRoomId] = useState(readRoom)
	useEffect(() => {
		const change = () => setRoomId(readRoom())
		window.addEventListener('hashchange', change)
		return () => window.removeEventListener('hashchange', change)
	}, [])
	return (
		<div className="vtm-app">
			<Room key={roomId} roomId={roomId} />
		</div>
	)
}
