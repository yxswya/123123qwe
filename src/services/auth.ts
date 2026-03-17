import { bearer } from '@elysiajs/bearer'
import { jwt } from '@elysiajs/jwt'
import Elysia from 'elysia'

export const AuthService = new Elysia({ name: 'Auth.Service' })
    .use(
        jwt({
            name: 'jwt',
            secret: 'Fischl von Luftschloss Narfidort',
        }),
    )
    .use(bearer())
    .macro({
        auth: {
            async resolve({ bearer, status, set, jwt }) {
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

                return {
                    user: payload,
                }
            },
        },
    })
