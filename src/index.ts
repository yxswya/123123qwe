import { cors } from '@elysiajs/cors'
import { openapi } from '@elysiajs/openapi'
import { Elysia } from 'elysia'

import { authRoutes } from './routes/auth'
import { governanceRoutes } from './routes/governance'
import { modelRoutes } from './routes/model'
import { ragRoutes } from './routes/rag'
import { sessionRoutes } from './routes/session'
import { trainRoutes } from './routes/train'
import { uploadRoutes } from './routes/upload'
import { userRoutes } from './routes/user'

const app = new Elysia()
    .use(cors())
    .use(openapi())
    // 全局 API 前缀
    .group('/api/v1', app =>
        app
            .use(authRoutes)
            .use(userRoutes)
            .use(sessionRoutes)
            .use(uploadRoutes)
            .use(modelRoutes)
            .use(trainRoutes)
            .use(governanceRoutes)
            .use(ragRoutes))
    .get('/', () => 'Hello World')
    .listen(3002)

export type App = typeof app

console.log(
    `🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}/openapi`,
)
