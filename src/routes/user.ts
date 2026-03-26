import Elysia from 'elysia'
import { AuthPlugin } from '../plugins/auth'

export const userRoutes = new Elysia({ prefix: '/user' })
    .use(AuthPlugin)
    .get('/profile', ({ user }) => {
        // 这里 user 自动推导为 { id: number, username: string }
        return {
            message: `Welcome back, ${user?.username}`,
            data: user,
        }
    }, {
        detail: {
            summary: '获取用户信息',
        },
        auth: true,
    })
