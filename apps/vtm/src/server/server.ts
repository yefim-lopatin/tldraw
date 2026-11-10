import { buildApp } from './app'

const app = await buildApp()
await app.listen({ port: Number(process.env.PORT || 5858), host: process.env.HOST || '127.0.0.1' })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(signal, async () => {
		await app.close()
		process.exit(0)
	})
}
