import type { GovernanceResponse } from '../types/governance'
import type { ApiResponse, Success } from '../types/response'
import { fileToArray } from '../utils/common'
import { request } from '../utils/request'

// 意图识别接口
export async function parsePipeline(sessionId: string, text: string): Promise<Success<ApiResponse>> {
    return request('/parse/pipeline', {
        session_id: sessionId,
        text,
        content: text,
        run_quality_check: false,
    })
}

// 数据治理
// rag (pdf, docx, md, txt, json, jsonl)
// training (csv, jsonl, json, txt, xlsx, xls)
export async function governanceData(files: File[], taskType: 'rag' | 'training' = 'rag') {
    const formData = new FormData()

    for (const file of fileToArray(files)) {
        formData.append('files', file)
    }
    formData.append('task_type', taskType)

    return request<GovernanceResponse>('/governance/process/batch/enhanced', formData)
}
