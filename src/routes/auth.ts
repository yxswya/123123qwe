import { eq } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import { db } from '../db'
import { users } from '../db/schema'
import { AuthPlugin } from '../plugins/auth'

export const authRoutes = new Elysia({ prefix: '/auth' })
    .use(AuthPlugin)
    .post('/register', async ({ body, jwt, set }) => {
        const { username, email, password } = body

        // 检查用户名是否已存在
        const existingUser = await db.query.users.findFirst({
            where: eq(users.username, username),
        })

        if (existingUser) {
            set.status = 400
            return {
                code: 1,
                message: '用户名已存在',
                data: null,
            }
        }

        // 使用 bun 进行密码哈希
        const hashedPassword = await Bun.password.hash(password, {
            algorithm: 'bcrypt',
            cost: 4,
        })

        // 创建新用户
        const [newUser] = await db
            .insert(users)
            .values({
                username,
                email,
                password: hashedPassword,
                avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
                createdAt: new Date(),
            })
            .returning()

        // 生成 JWT token
        const token = await jwt.sign({
            id: newUser.id,
            username: newUser.username,
        })

        return {
            code: 0,
            message: '注册成功',
            data: {
                access_token: token,
                refresh_token: token,
                username: newUser.username,
                token_type: 'bearer',
            },
        }
    }, {
        body: t.Object({
            username: t.String({ minLength: 2, maxLength: 20 }),
            email: t.String({ format: 'email' }),
            password: t.String({ minLength: 8 }),
        }),
        detail: {
            summary: '用户注册',
        },
    })
    .post('/login', async ({ body, jwt, set }) => {
        const { username, password } = body

        // 查找用户
        const user = await db.query.users.findFirst({
            where: eq(users.username, username),
        })

        if (!user) {
            set.status = 401
            return {
                code: 1,
                message: '用户名或密码错误',
                data: null,
            }
        }

        // 使用 bun 验证密码
        const isValid = await Bun.password.verify(password, user.password)

        if (!isValid) {
            set.status = 401
            return {
                code: 1,
                message: '用户名或密码错误',
                data: null,
            }
        }

        // 生成 JWT token
        const token = await jwt.sign({
            id: user.id,
            username: user.username,
        })

        return {
            code: 0,
            message: '登录成功',
            data: {
                access_token: token,
                refresh_token: token,
                username: user.username,
                token_type: 'bearer',
            },
        }
    }, {
        body: t.Object({
            username: t.String(),
            password: t.String(),
        }),
        detail: {
            summary: '账号登录',
        },
    })
    .get('/me', async ({ user }) => {
        // 从数据库获取完整用户信息
        const fullUser = await db.query.users.findFirst({
            where: eq(users.id, user.id as string),
        })

        if (!fullUser) {
            return {
                code: 1,
                message: '用户不存在',
                data: null,
            }
        }

        // 返回用户信息（不包含密码）
        return {
            code: 0,
            message: 'success',
            data: {
                id: fullUser.id,
                username: fullUser.username,
                avatarUrl: fullUser.avatarUrl,
                createdAt: fullUser.createdAt,
            },
        }
    }, {
        auth: true,
        detail: {
            summary: '获取当前用户信息',
        },
    })
