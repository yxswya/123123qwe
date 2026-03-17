import type { ApiResponse, Success } from '../types/response'

const LLM_SERVER = process.env.LLM_SERVER
if (!LLM_SERVER) {
    throw new Error('LLM_SERVER environment variable is required')
}

const BASE_URL = `${LLM_SERVER}`

type RequestBody = Record<string, unknown> | FormData | string

async function request<T>(endpoint: string, body: RequestBody): Promise<T> {
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

// 意图识别接口
export async function parsePipeline(sessionId: string, text: string): Promise<Success<ApiResponse>> {
    return request('/parse/pipeline', {
        session_id: sessionId,
        text,
        content: text,
        run_quality_check: false,
    })
}
