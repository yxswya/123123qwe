const LLM_SERVER = process.env.LLM_SERVER
if (!LLM_SERVER) {
    throw new Error('LLM_SERVER environment variable is required')
}

export const BASE_URL = `${LLM_SERVER}`

export type RequestBody = Record<string, unknown> | FormData | string

export async function request<T>(endpoint: string, body: RequestBody): Promise<T> {
    const isFormData = body instanceof FormData

    const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: isFormData ? {} : { 'Content-Type': 'application/json' },
        body: isFormData ? body as FormData : JSON.stringify(body),
    })

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
    }

    return response.json() as T
}
