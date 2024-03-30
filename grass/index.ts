import config from './config.toml'
import type { MessageEvent } from 'ws'
import { nowDateTimeString } from '../util/time'
import { v4 } from 'uuid'

// 启动一次生成一次
const browserId = v4()

/**
 * 认证
 * @returns 
 */
function auth() {
    const userId = config.userId
    console.log(`${nowDateTimeString()} auth with user ${userId} browser ${browserId}`)
    return {
        browser_id: browserId,
        user_id: userId,
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
        timestamp: parseInt(`${Date.now()}/1000`),
        device_type: 'extension',
        version: '3.3.2'
    }
}

/**
 * 浏览器插件挖矿逻辑
 * 服务端会给一个 url 和 base64 字符串，将 base64 转为 blob 后请求 url
 * 插件限制了并发，同时只会处理一个请求，这里先不进行限制
 * @param params 服务端 socket 发送的参数
 * @returns 
 */
async function performHttpRequest(params: any) {
    console.log(`${nowDateTimeString()} performHttpRequest ${params.url}`)
    const request_options = {
        method: params.method,
        mode: "cors",
        cache: "no-cache",
        credentials: "omit",
        headers: params.headers,
        redirect: "manual",
    };

    // If there is a request body, we decode it
    // and set it for the request.
    if (params.body) {
        // This is a hack to convert base64 to a Blob
        // const fetchURL = `data:application/octet-stream;base64,${params.body}`;
        // const fetchResp = await fetch(fetchURL);
        // request_options.body = await fetchResp.blob();
        request_options.body = new Blob([Buffer.from(params.body, 'base64')], { type: 'application/octet-stream' });
    }

    const response = await fetch(params.url, request_options);

    if (!response) {
        console.error(`${nowDateTimeString()} fetch failed: ${params.url}, no response`);
        return {
            url: params.url,
            status: 400,
            status_text: 'Bad Request',
            headers: {},
            body: '',
        };
    }

    // process redirects manually
    if (response.type === "opaqueredirect") {
        const cookie = response.headers.getSetCookie().filter().filter((item: string) => item.startsWith('value=') || item.startsWith('binaryValue='));
        const value = response.headers.get("value");
        const binaryValue = response.headers.get("binaryValue");
        console.log(`${nowDateTimeString()} redirect to ${response.url}, status: ${response.status}`);
        return {
            'url': response.url,
            'status': response.status,
            'status_text': 'Redirect',
            'headers': {
                value,
                binaryValue,
                'Set-Cookie': cookie,
            },
            'body': '',
        }
    }

    const headers: Record<string, string> = {};
    // response.headers is an iterable object Headers (not a json)
    // so we must manually copy before returning
    response.headers.forEach((value: string, key: string) => {
        // remove Content-Encoding header
        if (key.toLowerCase() !== 'content-encoding') {
            headers[key] = value;
        }
    });
    const res = await response.arrayBuffer()
    console.log(`${nowDateTimeString()} fetch ${params.url}, status: ${response.status}`);
    return {
        url: response.url,
        status: response.status,
        status_text: response.statusText,
        headers: headers,
        body: Buffer.from(res).toString('base64'),
    };
}

/**
 * 处理消息
 * @param event 事件
 * @returns 
 */
async function handleMessage(event: MessageEvent) {
    let data;
    try {
        data = JSON.parse(event.data as string);
    } catch (e) {
        console.error(`${nowDateTimeString()} bad json:`, event.data);
        return;
    }
    const action = data.action;
    let result;
    if (action == 'AUTH') {
        result = auth();
    } else if (action == 'PONG') {
        result = {}
    } else if (action == 'HTTP_REQUEST') {
        result = await performHttpRequest(data.data);
        return
    } else {
        console.error(`${nowDateTimeString()} bad action:`, action);
        return
    }
    const responseData = {
        id: data.id,
        origin_action: action,
        result,
    }
    try {
        event.target.send(JSON.stringify(responseData));
    } catch (e) {
        console.error(`${nowDateTimeString()} send error:`, e);
    }
}

/**
 * 创建并初始化 socket
 * @returns 
 */
function createSocket(): WebSocket {
    const url = config.url
    console.log(`${nowDateTimeString()} open connection to ${url}, It may take 10 minutes to connect successfully.`)
    const socket = new WebSocket(url)
    // message is received
    socket.onmessage = handleMessage;
    // socket opened
    socket.addEventListener("open", event => {
        console.log(`${nowDateTimeString()} open connection to ${url} ok`)
    });

    // socket closed
    socket.addEventListener("close", event => {
        console.log(`${nowDateTimeString()} close connection to ${url}`)
    });

    // error handler
    socket.addEventListener("error", event => {
        console.error(`${nowDateTimeString()} error:`, event.error);
    });
    return socket
}



function main() {
    if (!config.userId) {
        console.error(`${nowDateTimeString()} user id not found, please check config.toml`)
        return
    }
    let socket = createSocket()

    // 定时发送心跳及失败重连(20s一次)
    setInterval(() => {
        if (!socket) {
            // 重连
            socket = createSocket()
            return
        }
        if (WebSocket.CONNECTING === socket.readyState || WebSocket.CLOSING === socket.readyState) {
            console.log(`${nowDateTimeString()} state: [${socket.readyState}] WebSocket not in appropriate state for liveness check...`);
            return
        }
        if (WebSocket.CLOSED === socket.readyState) {
            try {
                socket.close()
            } catch (e) {
                // ignore
            }
            console.log(`${nowDateTimeString()} reconnecting...`)
            socket = createSocket()
            return
        }
        try {
            socket.send(JSON.stringify({
                id: v4(),
                version: '1.0.0',
                action: 'PING',
                data: {}
            }))

        } catch (e) {
            console.error(`${nowDateTimeString()} send error:`, e);
        }
    }, 20 * 1000)
}

main()