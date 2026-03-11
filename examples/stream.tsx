import { fetchEventSource } from '@microsoft/fetch-event-source'
import { useState } from 'react'

function App() {
    const [statusText, setStatusText] = useState('')
    const [result, setResult] = useState('')

    const handleChat = async () => {
        setStatusText('准备连接...')
        setResult('')

        // 使用库发起 POST 请求的 SSE
        await fetchEventSource('http://localhost:3002/api/v1/session/chat', {
            // 关键配置：设置为 true 以携带 Cookie
            credentials: 'include',
            // 如果是跨域请求，建议明确指定 mode 为 'cors'
            mode: 'cors',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sessionId: '',
                messageId: '',
                text: '请帮我写一段 Python 代码',
                content: '请帮我写一段 Python 代码',
            }),

            // 当接收到后端 yield sse() 推送的消息时
            onmessage(ev) {
                // ev.event 对应你后端的 event 字段
                // ev.data  对应你后端的 data 字段（字符串形式）
                console.log(ev)

                // if (ev.event === 'status' || ev.event === 'heartbeat') {
                //   // 解析去掉双引号
                //   setStatusText(JSON.parse(ev.data))
                // }
                // else if (ev.event === 'result') {
                //   setStatusText('思考完毕！')
                //   setResult(JSON.parse(ev.data))
                // }
                // else if (ev.event === 'error') {
                //   setStatusText(`发生错误: ${ev.data}`)
                // }
            },

            onclose() {
                console.log('连接已正常关闭')
            },

            onerror(err) {
                console.error('流异常断开', err)
                setStatusText('连接断开重试中...')
                throw err // 抛出错误会自动触发重连
            },
        })
    }

    return (
        <div style={{ padding: '20px' }}>
            <button onClick={handleChat}>发送请求</button>
            <div style={{ marginTop: '20px', color: 'gray' }}>
                状态：
                {statusText}
            </div>
            <div style={{ marginTop: '20px' }}>{result}</div>
        </div>
    )
}

export default App
