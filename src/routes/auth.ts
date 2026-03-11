import { Elysia, t } from 'elysia'
import { authPlugin } from '../plugins/auth'

export const authRoutes = new Elysia({ prefix: '/auth' })
    .use(authPlugin)
    .post('/login', async ({ jwt, body, cookie: { auth } }) => {
        // 1. 模拟数据库查询用户 (实际开发请查库)
        const user = { id: 101, username: body.username }

        // 2. 生成 value
        const value = await jwt.sign(user)

        // 3. 将 value 写入 Cookie
        auth.set({
            value,
            httpOnly: true, // JS 无法读取，防止 XSS
            maxAge: 7 * 86400, // 7天有效期
            path: '/', // 全局有效
            // secure: true,      // 如果是 HTTPS 则开启
            // sameSite: 'lax'    // 防止 CSRF
        })

        return { status: 'success', message: 'Logged in' }
    }, {
        body: t.Object({
            username: t.String(),
            password: t.String(),
        }),
        detail: {
            summary: '账号登陆',
        },
    })
    .post('/logout', ({ cookie: { auth } }) => {
        auth.remove() // 清除 Cookie
        return { message: 'Logged out' }
    }, {
        detail: {
            summary: '退出登录',
        },
    })
