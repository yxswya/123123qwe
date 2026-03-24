import { relations } from 'drizzle-orm'
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { nanoid } from 'nanoid'

// 用户
export const users = sqliteTable('users', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    username: text('username').notNull().unique(),
    email: text('email').unique(),
    password: text('password').notNull(),
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

// RAG 构建产物
export const rags = sqliteTable('rags', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
    indexVersion: text('index_version').notNull(), // 索引版本
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export type NewRag = typeof rags.$inferInsert
export type SelectRag = typeof rags.$inferSelect

// TRAIN 模型训练产物
export const trains = sqliteTable('trains', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
    // 关联的 RAG 知识库（一对一关系）
    ragId: text('rag_id').references(() => rags.id, { onDelete: 'set null' }),
    ckptId: text('ckpt_id'),
    ckptUri: text('ckpt_uri'),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

// 注册模型 (与消息一对一关系)
export const models = sqliteTable('models', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    // messageId 唯一约束，确保与消息一对一关系
    messageId: text('message_id').references(() => messages.id, { onDelete: 'set null' }).notNull().unique(),
    trainId: text('train_id').references(() => trains.id, { onDelete: 'set null' }),
    // 关联的 RAG 知识库
    ragId: text('rag_id').references(() => rags.id, { onDelete: 'set null' }),
    // 外部模型ID（来自LLM服务）
    externalId: text('external_id').notNull(),
    modelUri: text('model_uri').notNull(),
    task: text('task').notNull(),
    modelType: text('model_type').notNull(),
    note: text('note'),
    existsLocal: integer('exists_local', { mode: 'boolean' }).default(true),
    fileSize: integer('file_size'),
    mtime: text('mtime'),
    externalCreatedAt: text('external_created_at'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export type NewModel = typeof models.$inferInsert
export type SelectModel = typeof models.$inferSelect

export type NewTrain = typeof trains.$inferInsert
export type SelectTrain = typeof trains.$inferSelect

// 文件上传记录
export const files = sqliteTable('files', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    messageId: text('message_id').references(() => messages.id, { onDelete: 'set null' }),
    fileName: text('file_name').notNull(),
    fileUrl: text('file_url').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export type NewFile = typeof files.$inferInsert
export type SelectFile = typeof files.$inferSelect

export const agents = sqliteTable('agents', {
    id: text('id').$defaultFn(() => nanoid()).primaryKey(),
    sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
    fileId: text('file_id').references(() => files.id, { onDelete: 'set null' }),
    agentName: text('agent_name').notNull(),
    agentType: text('agent_type'),
    dataType: text('data_type'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export type NewAgent = typeof agents.$inferInsert
export type SelectAgent = typeof agents.$inferSelect

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
    rags: many(rags),
    trains: many(trains),
    files: many(files),
    agents: many(agents),
    models: many(models),
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

export const messagesRelations = relations(messages, ({ one, many }) => ({
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
    rags: many(rags),
    trains: many(trains),
    // 注意：虽然 models.messageId 是 unique（一对一），但 Drizzle 反向关系需用 many
    models: many(models),
    files: many(files),
}))

export const ragsRelations = relations(rags, ({ one, many }) => ({
    session: one(sessions, {
        fields: [rags.sessionId],
        references: [sessions.id],
    }),
    message: one(messages, {
        fields: [rags.messageId],
        references: [messages.id],
    }),
    trains: many(trains),
    models: many(models),
}))

export const trainsRelations = relations(trains, ({ one, many }) => ({
    session: one(sessions, {
        fields: [trains.sessionId],
        references: [sessions.id],
    }),
    message: one(messages, {
        fields: [trains.messageId],
        references: [messages.id],
    }),
    rag: one(rags, {
        fields: [trains.ragId],
        references: [rags.id],
    }),
    models: many(models),
}))

export const modelsRelations = relations(models, ({ one }) => ({
    session: one(sessions, {
        fields: [models.sessionId],
        references: [sessions.id],
    }),
    message: one(messages, {
        fields: [models.messageId],
        references: [messages.id],
    }),
    train: one(trains, {
        fields: [models.trainId],
        references: [trains.id],
    }),
    rag: one(rags, {
        fields: [models.ragId],
        references: [rags.id],
    }),
}))

export const filesRelations = relations(files, ({ one, many }) => ({
    session: one(sessions, {
        fields: [files.sessionId],
        references: [sessions.id],
    }),
    message: one(messages, {
        fields: [files.messageId],
        references: [messages.id],
    }),
    agents: many(agents),
}))

export const agentsRelations = relations(agents, ({ one }) => ({
    session: one(sessions, {
        fields: [agents.sessionId],
        references: [sessions.id],
    }),
    file: one(files, {
        fields: [agents.fileId],
        references: [files.id],
    }),
}))
