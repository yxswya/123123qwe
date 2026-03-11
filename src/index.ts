import { cors } from '@elysiajs/cors'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'
import { authRoutes } from './routes/auth'
import { sessionRoutes } from './routes/session'
import { userRoutes } from './routes/user'

const app = new Elysia()
    .use(cors())
    .use(openapi())
    // 全局 API 前缀
    .group('/api/v1', app =>
        app
            .use(authRoutes)
            .use(userRoutes)
            .use(sessionRoutes))
    .get('/', () => 'Hello World')
    .listen(3002)

export type App = typeof app

console.log(
    `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}/openapi`,
)
