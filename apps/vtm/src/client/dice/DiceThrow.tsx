import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { DiceSides } from './DiceRoller'

export interface ThrowResult {
	results: number[]
}

interface Props {
	sides: DiceSides
	count: number
	hunger: number
	difficulty?: number
	clientX: number
	clientY: number
	onComplete(result: ThrowResult): void
	onResult?(result: ThrowResult): void
}

// Load the renderer only when a throw is requested.
export function DiceThrow(props: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const completeRef = useRef(props.onComplete)
	completeRef.current = props.onComplete
	const resultRef = useRef(props.onResult)
	resultRef.current = props.onResult
	useEffect(() => {
		let disposed = false
		let reported = false
		const report = (result: ThrowResult) => {
			if (!disposed && !reported) {
				reported = true
				resultRef.current?.(result)
			}
		}
		let cleanup = () => {}
		Promise.all([import('./dicePhysics')])
			.then(async ([{ animateDice }]) => {
				if (!disposed && canvasRef.current) {
					const release = await animateDice(
						canvasRef.current,
						props,
						(result) => {
							if (!disposed) {
								report(result)
								completeRef.current(result)
							}
						},
						report
					)
					if (disposed) {
						release()
					} else {
						cleanup = release
					}
				}
			})
			.catch(() => {
				// Keep rolling usable on devices without WebGL.
				if (!disposed) {
					report({ results: [] })
					completeRef.current({ results: [] })
				}
			})
		return () => {
			disposed = true
			cleanup()
		}
		// A new mounted component represents exactly one throw.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
	return createPortal(
		<canvas
			ref={canvasRef}
			className="dice-roller__physics"
			aria-label="Объёмные кубики бросаются"
			role="img"
		/>,
		document.body
	)
}
