import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'
import type { DiceSides } from './DiceRoller'
import type { ThrowResult } from './DiceThrow'
import { getV5Symbol } from './v5Dice'

interface Face {
	normal: THREE.Vector3
	center: THREE.Vector3
	indices: number[]
}

const geometryFor = (sides: number): THREE.BufferGeometry => {
	switch (sides) {
		case 2:
			return new THREE.CylinderGeometry(0.8, 0.8, 0.25, 24).rotateX(Math.PI / 2)
		case 4:
			return new THREE.TetrahedronGeometry(1)
		case 6:
			return new THREE.BoxGeometry(1.4, 1.4, 1.4)
		case 8:
			return new THREE.OctahedronGeometry(1)
		case 12:
			return new THREE.DodecahedronGeometry(1)
		case 20:
			return new THREE.IcosahedronGeometry(1)
		default: {
			// The dual of a pentagonal antiprism is a ten-sided trapezohedron.
			const points = Array.from({ length: 10 }, (_, i) => {
				const angle = (i * Math.PI) / 5
				return new THREE.Vector3(Math.cos(angle), Math.sin(angle), i % 2 ? 0.5 : -0.5)
			})
			const hull = new ConvexGeometry(points)
			const positions = hull.getAttribute('position')
			const normals = hull.getAttribute('normal')
			const dual: THREE.Vector3[] = []
			for (let i = 0; i < positions.count; i += 3) {
				const normal = new THREE.Vector3().fromBufferAttribute(normals, i)
				const point = new THREE.Vector3().fromBufferAttribute(positions, i)
				const vertex = normal.divideScalar(normal.dot(point))
				if (!dual.some((p) => p.distanceTo(vertex) < 0.001)) {
					dual.push(vertex)
				}
			}
			hull.dispose()
			const geometry = new ConvexGeometry(dual)
			geometry.computeBoundingSphere()
			geometry.scale(
				1 / geometry.boundingSphere!.radius,
				1 / geometry.boundingSphere!.radius,
				1 / geometry.boundingSphere!.radius
			)
			return geometry
		}
	}
}

const facesFor = (geometry: THREE.BufferGeometry) => {
	const source = geometry.index ? geometry.toNonIndexed() : geometry
	const positions = source.getAttribute('position')
	const vertices: THREE.Vector3[] = []
	const faces: Face[] = []
	for (let i = 0; i < positions.count; i += 3) {
		const triangle = [0, 1, 2].map((offset) =>
			new THREE.Vector3().fromBufferAttribute(positions, i + offset)
		)
		const normal = triangle[1]
			.clone()
			.sub(triangle[0])
			.cross(triangle[2].clone().sub(triangle[0]))
			.normalize()
		let face = faces.find((f) => f.normal.dot(normal) > 0.9999)
		if (!face) {
			face = { normal, center: new THREE.Vector3(), indices: [] }
			faces.push(face)
		}
		for (const point of triangle) {
			let index = vertices.findIndex((v) => v.distanceTo(point) < 0.0001)
			if (index < 0) {
				index = vertices.length
				vertices.push(point)
			}
			if (!face.indices.includes(index)) {
				face.indices.push(index)
			}
		}
	}
	for (const face of faces) {
		face.indices.forEach((i) => face.center.add(vertices[i]))
		face.center.divideScalar(face.indices.length)
		const axis = vertices[face.indices[0]].clone().sub(face.center).normalize()
		const tangent = face.normal.clone().cross(axis)
		face.indices.sort((a, b) => {
			const pa = vertices[a].clone().sub(face.center)
			const pb = vertices[b].clone().sub(face.center)
			return Math.atan2(pa.dot(tangent), pa.dot(axis)) - Math.atan2(pb.dot(tangent), pb.dot(axis))
		})
	}
	if (source !== geometry) {
		source.dispose()
	}
	return { vertices, faces }
}

export async function animateDice(
	canvas: HTMLCanvasElement,
	options: {
		sides: DiceSides
		count: number
		hunger: number
		difficulty?: number
		clientX: number
		clientY: number
	},
	complete: (result: ThrowResult) => void,
	reportResult?: (result: ThrowResult) => void
) {
	const symbols = new Map<string, HTMLImageElement>()
	if (options.difficulty !== undefined || options.hunger > 0) {
		await Promise.all(
			[false, true].flatMap((hunger) =>
				Array.from({ length: 10 }, async (_, i) => {
					const svg = getV5Symbol(i + 1, hunger)
					if (symbols.has(svg)) {
						return
					}
					const image = new Image()
					symbols.set(svg, image)
					await new Promise<void>((resolve, reject) => {
						image.onload = () => resolve()
						image.onerror = () => reject(new Error('Не удалось загрузить символ кубика'))
						image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
					})
				})
			)
		)
	}
	const renderer = new THREE.WebGLRenderer({
		canvas,
		alpha: true,
		antialias: true,
	})
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
	const scene = new THREE.Scene()
	const camera = new THREE.OrthographicCamera()
	camera.position.set(0, 0, 50)
	camera.lookAt(0, 0, 0)
	scene.add(new THREE.HemisphereLight(0xffffff, 0x39416b, 3))
	const light = new THREE.DirectionalLight(0xffffff, 4)
	light.position.set(-10, 15, 25)
	scene.add(light)
	const world = new CANNON.World({
		gravity: new CANNON.Vec3(0, 0, -35),
		allowSleep: true,
	})
	world.defaultContactMaterial.friction = 0.45
	world.defaultContactMaterial.restitution = 0.48
	const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() })
	world.addBody(ground)
	const walls = Array.from({ length: 4 }, () => {
		const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() })
		world.addBody(wall)
		return wall
	})
	const scale = 34 * 1.4
	const resize = () => {
		const w = window.innerWidth / scale
		const h = window.innerHeight / scale
		renderer.setSize(window.innerWidth, window.innerHeight, false)
		Object.assign(camera, {
			left: -w / 2,
			right: w / 2,
			top: h / 2,
			bottom: -h / 2,
			near: 0.1,
			far: 100,
		})
		camera.updateProjectionMatrix()
		const positions = [
			[-w / 2, 0, 0],
			[w / 2, 0, 0],
			[0, -h / 2, 0],
			[0, h / 2, 0],
		]
		const normals = [
			[1, 0, 0],
			[-1, 0, 0],
			[0, 1, 0],
			[0, -1, 0],
		]
		walls.forEach((wall, i) => {
			wall.position.set(...(positions[i] as [number, number, number]))
			wall.quaternion.setFromVectors(
				new CANNON.Vec3(0, 0, 1),
				new CANNON.Vec3(...(normals[i] as [number, number, number]))
			)
		})
	}
	resize()
	window.addEventListener('resize', resize)
	const resources: {
		dispose(): void
	}[] = []
	const dice = Array.from(
		{ length: options.count * (options.sides === 100 ? 2 : 1) },
		(_, index) => {
			const sides = options.sides === 100 ? 10 : options.sides
			const geometry = geometryFor(sides)
			const { vertices, faces } = facesFor(geometry)
			const material = new THREE.MeshStandardMaterial({
				color:
					options.difficulty !== undefined || options.hunger > 0
						? 0xffffff
						: index % 2
							? 0x7149cc
							: 0x365edc,
				roughness: 0.32,
				metalness: 0.15,
				flatShading: true,
			})
			const mesh = new THREE.Mesh(geometry, material)
			resources.push(geometry, material)
			scene.add(mesh)
			if (options.difficulty !== undefined || options.hunger > 0) {
				const edges = new THREE.EdgesGeometry(geometry)
				const edgeMaterial = new THREE.LineBasicMaterial({
					color: index < options.hunger ? 0xb52025 : 0x333333,
				})
				mesh.add(new THREE.LineSegments(edges, edgeMaterial))
				resources.push(edges, edgeMaterial)
			}
			const numberedFaces = sides === 2 ? faces.filter((f) => Math.abs(f.normal.z) > 0.99) : faces
			numberedFaces.forEach((face, i) => {
				const label = document.createElement('canvas')
				label.width = label.height = 128
				const ctx = label.getContext('2d')!
				ctx.fillStyle = 'white'
				ctx.textAlign = 'center'
				ctx.textBaseline = 'middle'
				ctx.font = 'bold 78px Arial'
				const value =
					options.sides === 100
						? index % 2 === 0
							? String(i * 10).padStart(2, '0')
							: String(i)
						: String(i + 1)
				if (options.difficulty !== undefined || options.hunger > 0) {
					const image = symbols.get(getV5Symbol(i + 1, index < options.hunger))!
					const ratio = Math.min(100 / image.width, 100 / image.height)
					const width = image.width * ratio
					const height = image.height * ratio
					ctx.drawImage(image, (128 - width) / 2, (128 - height) / 2, width, height)
				} else {
					ctx.fillText(value, 64, 64)
				}
				const texture = new THREE.CanvasTexture(label)
				const labelMaterial = new THREE.MeshBasicMaterial({
					map: texture,
					transparent: true,
					depthWrite: false,
					polygonOffset: true,
					polygonOffsetFactor: -2,
				})
				const labelGeometry = new THREE.PlaneGeometry(
					sides === 20 ? 0.52 : 0.7,
					sides === 20 ? 0.52 : 0.7
				)
				const text = new THREE.Mesh(labelGeometry, labelMaterial)
				text.position.copy(face.center).addScaledVector(face.normal, 0.008)
				text.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), face.normal)
				mesh.add(text)
				resources.push(texture, labelMaterial, labelGeometry)
			})
			const shape = new CANNON.ConvexPolyhedron({
				vertices: vertices.map((v) => new CANNON.Vec3(v.x, v.y, v.z)),
				faces: faces.map((f) => f.indices),
			})
			const body = new CANNON.Body({
				mass: 1,
				shape,
				angularDamping: 0.35,
				linearDamping: 0.25,
				sleepSpeedLimit: 0.3,
				sleepTimeLimit: 0.4,
			})
			const x = (options.clientX - window.innerWidth / 2) / scale
			const y = (window.innerHeight / 2 - options.clientY) / scale
			body.position.set(
				Math.max(camera.left + 1.2, Math.min(camera.right - 1.2, x + ((index % 5) - 2) * 2)),
				Math.max(camera.bottom + 1.2, Math.min(camera.top - 1.2, y + Math.floor(index / 5) * 2)),
				4 + index * 0.3
			)
			body.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6)
			body.velocity.set(
				(Math.random() - 0.5) * 15,
				(Math.random() - 0.5) * 15,
				5 + Math.random() * 5
			)
			body.angularVelocity.set(Math.random() * 18, Math.random() * 18, Math.random() * 18)
			world.addBody(body)
			return { body, mesh, numberedFaces }
		}
	)
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
	// Calculate the physical outcome before playback so network delivery does
	// not wait for several seconds of animation. Replay these exact poses.
	const frames: Float32Array[] = []
	for (let step = 0; step < 420; step++) {
		world.step(1 / 60)
		const poses = new Float32Array(dice.length * 7)
		dice.forEach(({ body }, index) => {
			poses.set(
				[
					body.position.x,
					body.position.y,
					body.position.z,
					body.quaternion.x,
					body.quaternion.y,
					body.quaternion.z,
					body.quaternion.w,
				],
				index * 7
			)
		})
		frames.push(poses)
		if (step >= 60 && dice.every(({ body }) => body.sleepState === CANNON.Body.SLEEPING)) {
			break
		}
	}
	const values = dice.map(({ body, numberedFaces }) => {
		const quaternion = new THREE.Quaternion(
			body.quaternion.x,
			body.quaternion.y,
			body.quaternion.z,
			body.quaternion.w
		)
		let top = 0
		let best = -Infinity
		numberedFaces.forEach((face, index) => {
			const height = face.normal.clone().applyQuaternion(quaternion).z
			if (height > best) {
				best = height
				top = index
			}
		})
		return options.sides === 100 ? top : top + 1
	})
	const result = {
		results:
			options.sides === 100
				? Array.from(
						{ length: options.count },
						(_, index) => values[index * 2] * 10 + values[index * 2 + 1] || 100
					)
				: values,
	}
	reportResult?.(result)
	const start = performance.now()
	let frame = 0
	const tick = (now: number) => {
		const elapsed = Math.max(0, (now - start) / 1000)
		const poses = frames[Math.min(frames.length - 1, Math.floor(elapsed * 60))]
		dice.forEach(({ mesh }, index) => {
			const offset = index * 7
			mesh.position.set(poses[offset], poses[offset + 1], poses[offset + 2])
			mesh.quaternion.set(
				poses[offset + 3],
				poses[offset + 4],
				poses[offset + 5],
				poses[offset + 6]
			)
		})
		if (!reduced) {
			renderer.render(scene, camera)
		}
		if (reduced || elapsed >= frames.length / 60 + 0.9) {
			complete(result)
			return
		}
		frame = requestAnimationFrame(tick)
	}
	frame = requestAnimationFrame(tick)
	return () => {
		cancelAnimationFrame(frame)
		window.removeEventListener('resize', resize)
		resources.forEach((resource) => resource.dispose())
		renderer.dispose()
	}
}
