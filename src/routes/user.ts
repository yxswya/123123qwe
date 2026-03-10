import Elysia from 'elysia'
import { authPlugin } from '../plugins/auth'

export const userRoutes = new Elysia({ prefix: '/user' })
    .use(authPlugin)
    .guard({
        beforeHandle: ({ user, set }) => {
            if (!user) {
                set.status = 401
                return { error: 'Unauthorized' }
            }
        },
    }, app => app
        // 以下所有路由受到 guard 保护
        .get('/profile', ({ user }) => {
            // 这里 user 自动推导为 { id: number, username: string }
            return {
                message: `Welcome back, ${user?.username}`,
                data: user,
            }
        }))
