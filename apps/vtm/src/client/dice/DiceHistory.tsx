import { useEffect, useState } from 'react'
import { getFromSessionStorage, setInSessionStorage } from 'tldraw'
import type { Roll } from '../../shared/dice'
import { getDieCharacter } from './diceText'
import { getV5Result } from './v5Dice'

export function DiceHistory({ roomId, revision }: { roomId: string; revision: number }) {
	const [rows, setRows] = useState<Roll[]>([])
	const [error, setError] = useState('')
	const [key, setKey] = useState(() => getFromSessionStorage('vtm-owner-key') || '')
	const [owner, setOwner] = useState(false)
	const [busy, setBusy] = useState(false)
	useEffect(() => {
		let active = true
		let timer: ReturnType<typeof setTimeout>
		const load = async () => {
			try {
				const response = await fetch(`/api/dice-history/${roomId}`)
				if (!response.ok) throw new Error()
				const data: Roll[] = await response.json()
				if (active) {
					setRows(data)
					setError('')
				}
			} catch {
				if (active) setError('История временно недоступна')
			}
			if (active) timer = setTimeout(load, 3000)
		}
		void load()
		return () => {
			active = false
			clearTimeout(timer)
		}
	}, [roomId, revision])
	useEffect(() => {
		const saved = getFromSessionStorage('vtm-owner-key')
		if (!saved) return
		let active = true
		void fetch('/api/dice-history/owner', { method: 'POST', headers: { 'X-Owner-Key': saved } })
			.then((response) => {
				if (active) setOwner(response.ok)
			})
			.catch(() => {})
		return () => {
			active = false
		}
	}, [])
	const authorize = async () => {
		setBusy(true)
		try {
			const response = await fetch('/api/dice-history/owner', {
				method: 'POST',
				headers: { 'X-Owner-Key': key },
			})
			if (!response.ok) throw new Error()
			setInSessionStorage('vtm-owner-key', key)
			setOwner(true)
			setError('')
		} catch {
			setOwner(false)
			setError('Ключ ведущего не принят')
		} finally {
			setBusy(false)
		}
	}
	const clear = async () => {
		if (!window.confirm('Очистить историю этой комнаты? Кубики на доске останутся.')) return
		setBusy(true)
		try {
			const response = await fetch(`/api/dice-history/${roomId}`, {
				method: 'DELETE',
				headers: { 'X-Owner-Key': key },
			})
			if (!response.ok) throw new Error()
			setRows([])
			setError('')
		} catch {
			setError('Не удалось очистить историю')
		} finally {
			setBusy(false)
		}
	}
	return (
		<section className="vtm-history" aria-label="История бросков">
			<h2>История бросков</h2>
			{owner ? (
				<button type="button" disabled={busy} onClick={clear}>
					Очистить историю
				</button>
			) : (
				<details>
					<summary>Доступ ведущего</summary>
					<input
						type="password"
						aria-label="Ключ ведущего"
						autoComplete="off"
						value={key}
						onChange={(e) => setKey(e.target.value)}
					/>
					<button type="button" disabled={busy || !key} onClick={authorize}>
						Войти
					</button>
				</details>
			)}
			{error && <p role="alert">{error}</p>}
			{rows.length === 0 && <p>Бросков пока нет. Нажмите на кубик или перетащите его на доску.</p>}
			<ol>
				{rows.toReversed().map((row) => (
					<li key={row.id}>
						<div className="vtm-history-heading">
							<strong>{row.username}</strong>
							<time>
								{new Date(row.time).toLocaleTimeString('ru-RU', {
									hour: '2-digit',
									minute: '2-digit',
								})}
							</time>
						</div>
						<div className="vtm-history-dice">
							{row.results.map((n, index) => (
								<span
									key={index}
									aria-label={`${index < row.hunger ? 'Кубик Голода' : 'Кубик'}: ${n}`}
									className="dice-font"
									style={{ color: index < row.hunger ? '#b52025' : '#363636' }}
								>
									{getDieCharacter(row.sides, n, row.difficulty >= 0, index < row.hunger)}
								</span>
							))}
						</div>
						<p>
							{row.difficulty >= 0
								? getV5Result(row.results, row.hunger, row.difficulty)
								: `${row.results.length}d${row.sides}: ${row.results.join(', ')}`}
						</p>
					</li>
				))}
			</ol>
		</section>
	)
}
