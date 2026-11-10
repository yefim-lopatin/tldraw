import { useSync } from '@tldraw/sync'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
	Tldraw,
	useEditor,
	defaultShapeUtils,
	getFromLocalStorage,
	setInLocalStorage,
	type TLAssetStore,
} from 'tldraw'
import { isRoomId } from '../shared/dice'
import { DiceHistory } from './dice/DiceHistory'
import { DiceRoller } from './dice/DiceRoller'
import { DiceRollShapeUtil } from './dice/DiceRollShape'

const shapeUtils = [...defaultShapeUtils, DiceRollShapeUtil]
const RoomContext = createContext('')
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
	const roomId = useContext(RoomContext)
	const [username, setUsername] = useState(() => getFromLocalStorage('vtm-player-name') || 'Игрок')
	const [historyOpen, setHistoryOpen] = useState(false)
	const [revision, setRevision] = useState(0)
	const [message, setMessage] = useState('')
	const onRoll = useCallback(() => setRevision((n) => n + 1), [])
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
			<div className="vtm-dice-tools">
				<DiceRoller editor={editor} roomId={roomId} username={username} onRoll={onRoll} />
				<button
					type="button"
					className="vtm-tool-button"
					aria-expanded={historyOpen}
					onClick={() => setHistoryOpen((v) => !v)}
				>
					История
				</button>
				{historyOpen && (
					<div className="vtm-history-panel">
						<button
							className="vtm-history-close"
							type="button"
							aria-label="Закрыть историю"
							onClick={() => setHistoryOpen(false)}
						>
							×
						</button>
						<DiceHistory roomId={roomId} revision={revision} />
					</div>
				)}
			</div>
		</div>
	)
}

const components = { InFrontOfTheCanvas: RoomTools }

function Room({ roomId }: { roomId: string }) {
	const store = useSync({
		uri: `${location.origin.replace(/^http/, 'ws')}/connect/${roomId}`,
		assets,
		shapeUtils,
	})
	return (
		<RoomContext.Provider value={roomId}>
			<Tldraw store={store} shapeUtils={shapeUtils} components={components} />
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
