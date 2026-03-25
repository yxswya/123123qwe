import type { EventEmitter } from 'node:events'
import type { NewMessage, NewModel, NewRag, NewTrain, SelectMessage, SelectSession } from '../db/schema'
import type { IMessageRepository, ISessionRepository } from '../repositories'

import type { ApiResponse } from '../types/response'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db'
import { messages, models, rags, sessions, trains } from '../db/schema'
import { MessageRepository, SessionRepository } from '../repositories'
import eventBus from '../utils/event-bus'

/**
 * Session Service Configuration
 */
export interface SessionServiceConfig {
    sessionRepo: ISessionRepository
    messageRepo: IMessageRepository
    eventEmitter: EventEmitter
}

/**
 * Session Service
 */
export class SessionService {
    private readonly _sessionId: string
    private readonly _userId: string
    private readonly _config: SessionServiceConfig
    private _session: SelectSession | null = null

    constructor(
        userId: string,
        sessionId: string | undefined,
        config?: SessionServiceConfig,
    ) {
        this._userId = userId
        this._sessionId = sessionId ?? nanoid()
        this._config = config ?? this.getDefaultConfig()
    }

    /** 获取会话 ID */
    get sessionId(): string {
        return this._sessionId
    }

    /** 获取用户 ID */
    get userId(): string {
        return this._userId
    }

    /** 获取会话信息 */
    get session(): SelectSession | null {
        return this._session
    }

    /** 确保会话存在，如果不存在则创建 */
    async ensureSession(): Promise<SelectSession> {
        const existingSession = await this._config.sessionRepo.findById(this._sessionId)
        if (existingSession) {
            this._session = existingSession
            return existingSession
        }

        this._session = await this._config.sessionRepo.create({
            id: this._sessionId,
            userId: this._userId,
            title: `单聊-${Date.now()}`,
            lastMessageAt: new Date(),
            createdAt: new Date(),
        })

        return this._session
    }

    /** 发送聊天消息 */
    async chat(text: string): Promise<SelectMessage[]> {
        const result: SelectMessage[] = []

        result.push(await this.appendUserMessage(text))
        result.push(await this.appendAssistantMessage())

        return result
    }

    /** 添加 RAG 记录 */
    async appendRag(rag: NewRag): Promise<SelectMessage | null> {
        return await db.transaction(async (tx) => {
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this._sessionId))

            await tx.insert(rags).values(rag)

            const [message] = await tx.update(messages)
                .set({
                    content: JSON.stringify({
                        stage: 'rag-build-index',
                        status: 'success',
                        title: rag.title,
                    }),
                    type: 'json',
                })
                .where(eq(messages.id, rag.messageId))
                .returning()

            return message ?? null
        })
    }

    /** 仅插入 RAG 记录（不更新消息，用于训练流程中关联 RAG） */
    async insertRag(rag: NewRag): Promise<string | null> {
        const result = await db.transaction(async (tx) => {
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this._sessionId))

            const [ragRecord] = await tx.insert(rags).values(rag).returning()
            return ragRecord?.id ?? null
        })

        return result
    }

    /** 添加 Train 记录 */
    async appendTrain(train: NewTrain): Promise<{ message: SelectMessage | null, trainId: string | null }> {
        return await db.transaction(async (tx) => {
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this._sessionId))

            const [trainRecord] = await tx.insert(trains).values(train).returning()

            const [message] = await tx.update(messages)
                .set({
                    content: JSON.stringify({
                        stage: 'model-train',
                        status: 'success',
                        title: train.title,
                        trainId: trainRecord?.id,
                    }),
                    type: 'json',
                })
                .where(eq(messages.id, train.messageId))
                .returning()

            return { message: message ?? null, trainId: trainRecord?.id ?? null }
        })
    }

    /** 添加或更新 Model 记录（一对一关系，使用 upsert） */
    async appendModel(model: NewModel): Promise<SelectMessage | null> {
        return await db.transaction(async (tx) => {
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this._sessionId))

            // 使用 upsert：如果 messageId 已存在则更新，否则插入
            const [modelRecord] = await tx.insert(models)
                .values(model)
                .onConflictDoUpdate({
                    target: models.messageId,
                    set: {
                        externalId: model.externalId,
                        modelUri: model.modelUri,
                        task: model.task,
                        modelType: model.modelType,
                        note: model.note,
                        existsLocal: model.existsLocal,
                        fileSize: model.fileSize,
                        mtime: model.mtime,
                        externalCreatedAt: model.externalCreatedAt,
                    },
                })
                .returning()

            const [message] = await tx.update(messages)
                .set({
                    content: JSON.stringify({
                        stage: 'model-registered',
                        status: 'success',
                        modelId: modelRecord?.id,
                    }),
                    type: 'json',
                })
                .where(eq(messages.id, model.messageId))
                .returning()

            return message ?? null
        })
    }

    /** 更新训练阶段状态 */
    async updateTrainStage(
        messageId: string,
        stage: 1 | 2 | 3 | 4 | 5,
        title: string,
        extraData?: Record<string, any>,
    ): Promise<SelectMessage | null> {
        return await db.transaction(async (tx) => {
            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this._sessionId))

            const content: Record<string, any> = {
                stage: 'model-train',
                trainStage: stage,
                status: stage < 5 ? 'pending' : 'success',
                title,
                ...extraData,
            }

            const [message] = await tx.update(messages)
                .set({
                    content: JSON.stringify(content),
                    type: 'json',
                })
                .where(eq(messages.id, messageId))
                .returning()

            // 发送事件通知前端
            this._config.eventEmitter.emit(`chat-${this._sessionId}`, message)

            return message ?? null
        })
    }

    /** 添加助手消息 */
    async appendAssistantMessage(message?: NewMessage): Promise<SelectMessage> {
        const defaultMessage: NewMessage = message ?? {
            sessionId: this._sessionId,
            senderId: 'system-bot-id',
            content: '',
            status: 'sending',
            type: 'text',
        }

        return await db.transaction(async (tx) => {
            const [newMessage] = await tx.insert(messages).values(defaultMessage).returning()

            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this._sessionId))

            this._config.eventEmitter.emit(`chat-${this._sessionId}`, newMessage)

            return newMessage
        })
    }

    /** 更新助手消息 */
    async updateAssistantMessage(
        assistantMessage: SelectMessage,
        response: ApiResponse,
    ): Promise<SelectMessage> {
        const content = JSON.stringify(response)

        return await db.transaction(async (tx) => {
            const [updatedMessage] = await tx.update(messages)
                .set({
                    content,
                    type: 'json',
                    status: 'success',
                })
                .where(eq(messages.id, assistantMessage.id))
                .returning()

            if (!updatedMessage) {
                throw new Error(`Message with id ${assistantMessage.id} not found`)
            }

            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this._sessionId))

            return updatedMessage
        })
    }

    /** 接收并处理响应消息 */
    async receiveResponseMessage(
        assistantMessage: SelectMessage,
        response: ApiResponse,
    ): Promise<SelectMessage[]> {
        const updatedMessage = await this.updateAssistantMessage(assistantMessage, response)
        return [updatedMessage]
    }

    /** 添加用户消息 */
    async appendUserMessage(content: string): Promise<SelectMessage> {
        return await db.transaction(async (tx) => {
            const [newMessage] = await tx.insert(messages)
                .values({
                    sessionId: this._sessionId,
                    senderId: this._userId,
                    content,
                })
                .returning()

            await tx.update(sessions)
                .set({ lastMessageAt: new Date() })
                .where(eq(sessions.id, this._sessionId))

            this._config.eventEmitter.emit(`chat-${this._sessionId}`, newMessage)

            return newMessage
        })
    }

    private getDefaultConfig(): SessionServiceConfig {
        return {
            sessionRepo: new SessionRepository(db),
            messageRepo: new MessageRepository(db),
            eventEmitter: eventBus,
        }
    }
}
