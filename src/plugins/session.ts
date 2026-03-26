import { bearer } from '@elysiajs/bearer'
import { jwt } from '@elysiajs/jwt'
import { eq } from 'drizzle-orm'
import Elysia, { t } from 'elysia'
import { db } from '../db'
import { sessions } from '../db/schema'

export const SessionPlugin = new Elysia({ name: 'Session.Plugin' })
    .use(
        jwt({
            name: 'jwt',
            secret: 'Fischl von Luftschloss Narfidort',
        }),
    )
    .use(bearer())
// .macro({
//     session: {
//         async resolve({ params: { sessionId }, status }) {
//             if (sessionId) {
//                 const [session] = await db
//                     .select()
//                     .from(sessions)
//                     .where(eq(sessions.id, sessionId))

//                 if (session) {
//                     return { session }
//                 }
//             }

//             return status(404, '会话不存在')
//         },
//     },
// })

    .derive({ as: 'scoped' }, async ({ params: { sessionId }, bearer, jwt, status, set }) => {
        if (!bearer) {
            set.headers[
                'WWW-Authenticate'
            ] = `Bearer realm='sign', error="invalid_request"`

            return status(401, 'Unauthorized')
        }

        const payload = await jwt.verify(bearer)

        if (!payload) {
            set.headers[
                'WWW-Authenticate'
            ] = `Bearer realm='sign', error="invalid_token"`

            return status(401, 'Unauthorized')
        }

        if (sessionId) {
            const [session] = await db
                .select()
                .from(sessions)
                .where(eq(sessions.id, sessionId))

            if (session) {
                return { session }
            }
        }

        const [session] = await db.insert(sessions).values({
            userId: payload.id as string,
            title: `会话-${Date.now()}`,
            lastMessageAt: new Date(),
        }).returning()

        return { session }
    })
    // .derive({ as: 'scoped' }, async ({ params: { sessionId }, set }) => {
    //     if (sessionId) {
    //         const [session] = await db
    //             .select()
    //             .from(sessions)
    //             .where(eq(sessions.id, sessionId))

//         if (session) {
//             return { session }
//         }
//     }
// })
