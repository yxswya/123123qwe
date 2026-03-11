import { relations } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { nanoid } from 'nanoid'

// 用户
export const users = sqliteTable('users', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    username: text('username').notNull().unique(),
    avatarUrl: text('avatar_url'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

// 会话
export const sessions = sqliteTable('sessions', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    // 会话标题（群聊通常有名字，单聊可为空）
    title: text('title'),
    isGroup: integer('is_group', { mode: 'boolean' }).notNull().default(false),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export type NewSession = typeof sessions.$inferInsert
export type SelectSession = typeof sessions.$inferSelect

// 参与者 (多对多关联 Users 和 Sessions)
export const participants = sqliteTable(
    'participants',
    {
        sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
        userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
        joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull(),
    },
    table => [
        primaryKey({ columns: [table.sessionId, table.userId] }),
    ],
)

// 消息
export const messages = sqliteTable('messages', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    // 发送者 User or Bot
    senderId: text('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    replyToId: text('reply_to_id'), // 指向另一条消息的 ID
    content: text('content').notNull(),
    type: text('type', { enum: ['text', 'image', 'json'] }).notNull().default('text'),
    status: text('status', { enum: ['sending', 'success', 'error'] }).notNull().default('success'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export type NewMessage = typeof messages.$inferInsert
export type SelectMessage = typeof messages.$inferSelect

// ==========================================
// 定义 Relations (方便进行关系查询 query API)
// ==========================================

export const usersRelations = relations(users, ({ many }) => ({
    participants: many(participants),
    messages: many(messages),
}))

export const sessionsRelations = relations(sessions, ({ many }) => ({
    participants: many(participants),
    messages: many(messages),
}))

export const participantsRelations = relations(participants, ({ one }) => ({
    session: one(sessions, {
        fields: [participants.sessionId],
        references: [sessions.id],
    }),
    user: one(users, {
        fields: [participants.userId],
        references: [users.id],
    }),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
    session: one(sessions, {
        fields: [messages.sessionId],
        references: [sessions.id],
    }),
    sender: one(users, {
        fields: [messages.senderId],
        references: [users.id],
    }),
    replyTo: one(messages, {
        fields: [messages.replyToId],
        references: [messages.id],
    }),
}))
