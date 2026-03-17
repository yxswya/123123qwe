import { eq } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import { db } from '../db'
import { users } from '../db/schema'
import { AuthService } from '../services/auth'

export const authRoutes = new Elysia({ prefix: '/auth' })
    .use(AuthService)
    .post('/register', async ({ body, jwt, set }) => {
        const { username, password } = body

        // 检查用户名是否已存在
        const existingUser = await db.query.users.findFirst({
            where: eq(users.username, username),
        })

        if (existingUser) {
            set.status = 400
            return {
                status: 'error',
                message: 'Username already exists',
            }
        }

        // 使用 bun 进行密码哈希
        const hashedPassword = await Bun.password.hash(password, {
            algorithm: 'bcrypt',
            cost: 4,
        })

        // 创建新用户
        const newUser = await db
            .insert(users)
            .values({
                username,
                password: hashedPassword,
                createdAt: new Date(),
            })
            .returning()

        // 生成 JWT token
        const token = await jwt.sign({
            id: newUser[0].id,
            username: newUser[0].username,
        })

        return {
            status: 'success',
            message: 'Registered successfully',
            token,
            user: {
                id: newUser[0].id,
                username: newUser[0].username,
            },
        }
    }, {
        body: t.Object({
            username: t.String(),
            password: t.String(),
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
                status: 'error',
                message: 'Invalid username or password',
            }
        }

        // 使用 bun 验证密码
        const isValid = await Bun.password.verify(password, user.password)

        if (!isValid) {
            set.status = 401
            return {
                status: 'error',
                message: 'Invalid username or password',
            }
        }

        // 生成 JWT token
        const token = await jwt.sign({
            id: user.id,
            username: user.username,
        })

        return {
            status: 'success',
            message: 'Logged in successfully',
            token,
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
                status: 'error',
                message: 'User not found',
            }
        }

        // 返回用户信息（不包含密码）
        return {
            status: 'success',
            data: {
                id: fullUser.id,
                username: fullUser.username,
                avatarUrl: fullUser.avatarUrl,
                createdAt: fullUser.createdAt,
            },
        }
    }, {
        auth: true, // 启用认证，需要 Bearer token
        detail: {
            summary: '获取当前用户信息',
        },
    })
