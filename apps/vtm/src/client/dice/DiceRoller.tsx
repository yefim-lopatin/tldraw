import { Popover } from 'radix-ui'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import {
	TldrawUiToolbarButton,
	getFromLocalStorage,
	setInLocalStorage,
	deleteFromLocalStorage,
	type Editor,
} from 'tldraw'
import type { Roll } from '../../shared/dice'
import { DiceIcon } from './DiceIcons'
import { DICE_SIDES, type DiceSides } from './diceSvg'
import { addDiceText, loadDiceFont, getDieCharacter } from './diceText'
import { getHungerCount } from './v5Dice'
export type { DiceSides } from './diceSvg'

function VtmIcon() {
	return <span className="vtm-die-icon dice-font">{getDieCharacter(10, 6, true)}</span>
}

const MAX_DICE_COUNT = 20
const DRAG_THRESHOLD = 6

export function rollDie(sides: number): number {
	if (!Number.isInteger(sides) || sides < 2) {
		throw new Error('Количество граней должно быть целым числом не меньше 2')
	}
	const cryptoObject = globalThis.crypto
	if (cryptoObject?.getRandomValues) {
		const random = new Uint32Array(1)
		const range = 0x100000000
		const limit = range - (range % sides)
		do {
			cryptoObject.getRandomValues(random)
		} while (random[0] >= limit)
		return (random[0] % sides) + 1
	}
	return Math.floor(Math.random() * sides) + 1
}

interface DiceRollerProps {
	editor: Editor
	roomId: string
	username: string
	onRoll(): void
}

interface DragState {
	sides: DiceSides
	count: number
	pointerId: number
	startX: number
	startY: number
	clientX: number
	clientY: number
	hasMoved: boolean
}

interface RollAtPoint {
	id: string
	sides: DiceSides
	count: number
	hunger: number
	difficulty?: number
	results: number[]
	clientX: number
	clientY: number
}

const createInitialDiceCounts = (): Record<DiceSides, number> => ({
	2: 1,
	4: 1,
	6: 1,
	8: 1,
	10: 1,
	12: 1,
	20: 1,
	100: 1,
})

export function DiceRoller({ editor, roomId, username, onRoll }: DiceRollerProps) {
	const [error, setError] = useState('')
	const [isOpen, setIsOpen] = useState(false)
	const [section, setSection] = useState<'dice' | 'vtm' | null>(() => {
		try {
			const saved = getFromLocalStorage('dice-roller-section')
			return saved === 'dice' || saved === 'vtm' ? saved : null
		} catch {
			return null
		}
	})
	const selectSection = (next: 'dice' | 'vtm' | null) => {
		setSection(next)
		try {
			if (next) {
				setInLocalStorage('dice-roller-section', next)
			} else {
				deleteFromLocalStorage('dice-roller-section')
			}
		} catch {
			// Keep the choice for this session if browser storage is unavailable.
		}
	}
	const [hunger, setHunger] = useState(0)
	const [difficulty, setDifficulty] = useState(1)
	const [diceCounts, setDiceCounts] = useState(createInitialDiceCounts)
	const [dragPreview, setDragPreview] = useState<DragState | null>(null)
	const dragStateRef = useRef<DragState | null>(null)
	const triggerRef = useRef<HTMLButtonElement | null>(null)
	const addRollToCanvas = useCallback(
		async (roll: RollAtPoint) => {
			await loadDiceFont(editor)
			const point = editor.screenToPage({ x: roll.clientX, y: roll.clientY })
			const row: Roll = {
				id: roll.id,
				sides: roll.sides,
				results: roll.results,
				hunger: roll.hunger,
				difficulty: roll.difficulty ?? -1,
				username: username.trim().slice(0, 100) || 'Игрок',
				time: Date.now(),
			}
			editor.markHistoryStoppingPoint('dice-roll')
			addDiceText(editor, row, point)
			void fetch(`/api/dice-history/${roomId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(row),
			})
				.then((response) => {
					if (!response.ok) throw new Error()
					setError('')
					onRoll()
				})
				.catch(() => setError('Бросок сохранён на доске, но записать историю не удалось'))
		},
		[editor, roomId, username, onRoll]
	)
	const startRollAtPoint = useCallback(
		(sides: DiceSides, count: number, clientX: number, clientY: number) => {
			const results = Array.from({ length: count }, () => rollDie(sides))
			const roll = {
				id: crypto.randomUUID(),
				sides,
				count,
				results,
				hunger: getHungerCount(sides, count, section === 'vtm' ? hunger : 0),
				difficulty: section === 'vtm' && sides === 10 ? difficulty : undefined,
				clientX,
				clientY,
			}
			void addRollToCanvas(roll).catch(() =>
				setError('Не удалось отобразить бросок. Попробуйте ещё раз.')
			)
		},
		[hunger, difficulty, section, addRollToCanvas]
	)
	useEffect(() => {
		const handlePointerMove = (event: globalThis.PointerEvent) => {
			const dragState = dragStateRef.current
			if (!dragState || event.pointerId !== dragState.pointerId) {
				return
			}
			const hasMoved =
				dragState.hasMoved ||
				Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) >=
					DRAG_THRESHOLD
			const nextDragState = {
				...dragState,
				clientX: event.clientX,
				clientY: event.clientY,
				hasMoved,
			}
			dragStateRef.current = nextDragState
			setDragPreview(nextDragState)
		}
		const finishDrag = (event: globalThis.PointerEvent) => {
			const dragState = dragStateRef.current
			if (!dragState || event.pointerId !== dragState.pointerId) {
				return
			}
			dragStateRef.current = null
			setDragPreview(null)
			if (dragState.hasMoved) {
				startRollAtPoint(dragState.sides, dragState.count, event.clientX, event.clientY)
			} else {
				const center = editor.getViewportScreenBounds().center
				startRollAtPoint(dragState.sides, dragState.count, center.x, center.y)
			}
		}
		const cancelDrag = () => {
			dragStateRef.current = null
			setDragPreview(null)
		}
		window.addEventListener('pointermove', handlePointerMove, true)
		window.addEventListener('pointerup', finishDrag, true)
		window.addEventListener('pointercancel', cancelDrag, true)
		return () => {
			window.removeEventListener('pointermove', handlePointerMove, true)
			window.removeEventListener('pointerup', finishDrag, true)
			window.removeEventListener('pointercancel', cancelDrag, true)
		}
	}, [editor, startRollAtPoint])
	useEffect(() => {
		document.body.classList.toggle('dice-roller--dragging', dragPreview !== null)
		return () => document.body.classList.remove('dice-roller--dragging')
	}, [dragPreview])
	useEffect(() => {
		const toggleWithKeyboard = (event: KeyboardEvent) => {
			const isDiceShortcut = event.key.toLowerCase() === 'd' || event.code === 'KeyD'
			if (
				!isDiceShortcut ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				!event.shiftKey ||
				(event.target instanceof Element &&
					!!event.target.closest('input, textarea, select, [contenteditable="true"]'))
			) {
				return
			}
			event.preventDefault()
			event.stopPropagation()
			triggerRef.current?.click()
		}
		window.addEventListener('keydown', toggleWithKeyboard, true)
		return () => {
			window.removeEventListener('keydown', toggleWithKeyboard, true)
		}
	}, [editor])
	const handleDiePointerDown = (event: PointerEvent<HTMLButtonElement>, sides: DiceSides) => {
		if (event.button > 0) {
			return
		}
		const nextDragState = {
			sides,
			count: diceCounts[sides],
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			clientX: event.clientX,
			clientY: event.clientY,
			hasMoved: false,
		}
		dragStateRef.current = nextDragState
		setDragPreview(nextDragState)
	}
	const updateDiceCount = (sides: DiceSides, delta: number) => {
		setDiceCounts((current) => ({
			...current,
			[sides]: Math.min(MAX_DICE_COUNT, Math.max(1, current[sides] + delta)),
		}))
	}
	return (
		<Popover.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
			<div className="dice-roller">
				<Popover.Trigger asChild>
					<TldrawUiToolbarButton
						ref={triggerRef}
						type="icon"
						aria-label="Открыть кубики"
						title="Кубики (Shift+D)"
						isActive={isOpen}
					>
						<DiceIcon sides={20} />
					</TldrawUiToolbarButton>
				</Popover.Trigger>
				{error && (
					<p className="vtm-error" role="alert">
						{error}
					</p>
				)}

				{isOpen && (
					<Popover.Portal container={editor.getContainer()}>
						<Popover.Content
							className="tlui-popover__content"
							side="top"
							align="end"
							sideOffset={8}
							collisionPadding={12}
							aria-label="Кубики"
							onInteractOutside={(event) => event.preventDefault()}
							onOpenAutoFocus={(event) => event.preventDefault()}
							onCloseAutoFocus={(event) => event.preventDefault()}
						>
							<div
								className="dice-roller__menu"
								onPointerDown={(event) => event.stopPropagation()}
								onWheel={(event) => event.stopPropagation()}
							>
								<button
									className="dice-roller__close"
									type="button"
									aria-label="Закрыть кубики"
									onClick={() => triggerRef.current?.click()}
								>
									×
								</button>

								{section === null ? (
									<div className="dice-roller__sections">
										<button type="button" onClick={() => selectSection('dice')}>
											Dice
										</button>
										<button type="button" onClick={() => selectSection('vtm')}>
											VTM<small>Вампиры: Маскарад</small>
										</button>
									</div>
								) : (
									<>
										<button
											type="button"
											className="dice-roller__back"
											onClick={() => selectSection(null)}
											aria-label="Назад к выбору кубиков"
										>
											← Назад
										</button>
										<div
											className={`dice-roller__grid${section === 'vtm' ? ' dice-roller__grid--vtm' : ''}`}
										>
											{(section === 'vtm' ? [10 as const] : DICE_SIDES).map((sides) => {
												const count = diceCounts[sides]
												return (
													<div className="dice-roller__die-wrapper" key={sides}>
														<div className="dice-roller__quantity-controls">
															<button
																type="button"
																aria-label={`Уменьшить количество d${sides}`}
																disabled={count === 1}
																onClick={() => updateDiceCount(sides, -1)}
															>
																−
															</button>
															<output aria-label={`Количество d${sides}`}>{count}</output>
															<button
																type="button"
																aria-label={`Увеличить количество d${sides}`}
																disabled={count === MAX_DICE_COUNT}
																onClick={() => updateDiceCount(sides, 1)}
															>
																+
															</button>
														</div>
														<button
															className="dice-roller__die"
															type="button"
															aria-label={`Бросить ${count} кубик(а) d${sides}`}
															onPointerDown={(event) => handleDiePointerDown(event, sides)}
															onClick={(event) => {
																if (event.detail !== 0) return
																const bounds = editor.getViewportScreenBounds()
																startRollAtPoint(sides, count, bounds.center.x, bounds.center.y)
															}}
														>
															{section === 'vtm' ? <VtmIcon /> : <DiceIcon sides={sides} />}
														</button>
													</div>
												)
											})}
										</div>
										{section === 'vtm' && (
											<div className="dice-roller__hunger">
												<span>Кубики голода</span>
												<div className="dice-roller__quantity-controls">
													<button
														type="button"
														aria-label="Уменьшить кубики голода"
														disabled={hunger === 0}
														onClick={() => setHunger((n) => Math.max(0, n - 1))}
													>
														−
													</button>
													<output aria-label="Количество кубиков голода">{hunger}</output>
													<button
														type="button"
														aria-label="Увеличить кубики голода"
														disabled={hunger === 10}
														onClick={() => setHunger((n) => Math.min(10, n + 1))}
													>
														+
													</button>
												</div>
												<small>Заменяют обычные d10 в броске</small>
												<div className="dice-roller__difficulty">
													<span>Сложность</span>
													<div className="dice-roller__quantity-controls">
														<button
															type="button"
															aria-label="Уменьшить сложность"
															disabled={difficulty === 0}
															onClick={() => setDifficulty((n) => Math.max(0, n - 1))}
														>
															−
														</button>
														<output aria-label="Сложность проверки">{difficulty}</output>
														<button
															type="button"
															aria-label="Увеличить сложность"
															disabled={difficulty === 40}
															onClick={() => setDifficulty((n) => Math.min(40, n + 1))}
														>
															+
														</button>
													</div>
												</div>
												{difficulty === 0 && (
													<small>Состязание: сравните успехи с соперником</small>
												)}
											</div>
										)}
									</>
								)}
							</div>
						</Popover.Content>
					</Popover.Portal>
				)}

				{dragPreview && (
					<div
						className="dice-roller__drag-preview"
						style={{ left: dragPreview.clientX, top: dragPreview.clientY }}
						aria-hidden="true"
					>
						{section === 'vtm' ? <VtmIcon /> : <DiceIcon sides={dragPreview.sides} />}
						<span>
							d{dragPreview.sides} × {dragPreview.count}
						</span>
					</div>
				)}
			</div>
		</Popover.Root>
	)
}
