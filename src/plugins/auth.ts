import { jwt } from '@elysiajs/jwt'
import Elysia, { t } from 'elysia'

export const authPlugin = new Elysia({ name: 'auth-plugin' })
    .use(
        jwt({
            name: 'jwt',
            secret: 'Fischl von Luftschloss Narfidort',
        }),
    )
    .derive({ as: 'global' }, async ({ jwt, cookie: { auth } }) => {
        console.log('auth.value', auth.value)
        // 自动从名为 'auth' 的 cookie 中提取 token
        if (!auth.value) {
            return { user: null }
        }

        const payload = await jwt.verify(auth.value as string)

        if (!payload) {
            return { user: null }
        }

        return {
            user: payload, // 此时 user 的类型被推导为 { id: number, username: string }
        }
    })
