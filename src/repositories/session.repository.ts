import type { DatabaseType } from '../db'
import type { NewSession, SelectSession } from '../db/schema'
import { eq } from 'drizzle-orm'
import { sessions } from '../db/schema'

/**
 * Session Repository Interface
 * 负责会话数据的访问操作
 */
export interface ISessionRepository {
    findById: (id: string) => Promise<SelectSession | undefined>

    create: (data: NewSession) => Promise<SelectSession>

    updateLastMessageAt: (id: string) => Promise<void>

    findAll: () => Promise<Array<{ id: string, title: string | null }>>

    findByIdWithMessages: (id: string) => Promise<SelectSession | undefined>
}

/**
 * Session Repository Implementation
 */
export class SessionRepository implements ISessionRepository {
    constructor(private db: DatabaseType) {}

    async findById(id: string): Promise<SelectSession | undefined> {
        const [session] = await this.db
            .select()
            .from(sessions)
            .where(eq(sessions.id, id))
        return session ?? undefined
    }

    async create(data: NewSession): Promise<SelectSession> {
        const [newSession] = await this.db.insert(sessions).values(data).returning()
        return newSession
    }

    async updateLastMessageAt(id: string): Promise<void> {
        await this.db
            .update(sessions)
            .set({ lastMessageAt: new Date() })
            .where(eq(sessions.id, id))
    }

    async findAll() {
        return await this.db.select({ id: sessions.id, title: sessions.title }).from(sessions)
    }

    async findByIdWithMessages(id: string): Promise<SelectSession | undefined> {
        return await this.db.query.sessions.findFirst({
            where: (sessions, { eq }) => eq(sessions.id, id),
            with: {
                messages: {
                    with: {
                        rags: true,
                    },
                },
                files: true,
            },
        })
    }
}
