import { Keypair } from '@solana/web3.js'
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import { HDWallet } from '../util/solana'
import config from './config.toml'
import { sleepRandom, nowDateTimeString } from '../util/time';
import * as bip39 from "bip39";
import data from './data.json'

const URL_PREFIX = "https://api.v-token.io/api/points";

/**
 * 判断当前地址是否已经注册
 * @param address 地址
 * @returns 
 */
async function superiors(address: string): Promise<boolean> {
    try {
        const resp = await fetch(`${URL_PREFIX}/superiors?address=${address}`);
        const json = await resp.json();
        return json.code == 200
    } catch (e) {
        console.error(`${nowDateTimeString()} ${address} 查询是否注册失败`, e)
        return false
    }
}

/**
 * 邀请
 * @param address 地址
 * @param inviteCode 邀请码
 * @returns 
 */
async function invite(address: string, inviteCode: string): Promise<boolean> {
    const body = JSON.stringify({
        address,
        invite_code: inviteCode
    })
    try {
        const resp = await fetch(`${URL_PREFIX}/invite`, {
            method: 'POST',
            body,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const json = await resp.json();
        const res = json.code == 200
        if (res) {
            console.log(`${nowDateTimeString()} ${inviteCode} ${address} 邀请成功`)
        } else {
            console.error(`${nowDateTimeString()} ${inviteCode} ${address} 邀请失败`)
        }
        return res
    } catch(e) {
        console.error(`${nowDateTimeString()} ${address} 邀请失败`, e)
        return false
    }
}

/**
 * 签到
 * 每天只能签一次，一次 1000 分，需要在 17 点前签到
 * @param address 地址
 * @param sign 签名
 * @param timestamp 时间戳(签名的内容)
 * @returns 
 */
async function checkIn(address: string, sign: string, timestamp: number): Promise<boolean> {
    const body = JSON.stringify({
        address,
        sign,
        timestamp
    })
    const resp = await fetch(`${URL_PREFIX}/sign`, {
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/json'
        }
    });
    const json = await resp.json();
    const res = json.code == 200
    if (res) {
        console.log(`${nowDateTimeString()} ${address} 签到成功`)
    } else {
        console.error(`${nowDateTimeString()} ${address} 签到失败`)
    }
    return res
}


/**
 * 从配置文件中随机获取邀请码
 * @returns 邀请码
 */
function getRandomInviteCode(): string {
    const codes = config.invite.codes;
    if (codes.length == 0) {
        throw new Error('inviteCodes is empty')
    }
    return codes[Math.floor(Math.random() * codes.length)]
}

/**
 * 邀请码邀请任务(貌似有上限，按需调整 invite.count 配置即可)
 * 每个邀请码邀请 10~20 个帐号，每个帐号签到一次
 */
async function inviteTask() {
    const inviteCodes = config.invite.codes;
    const count = config.invite.count;
    console.log(`${nowDateTimeString()} 开始刷邀请次数，共 [${inviteCodes.length}] 个邀请码，每个邀请码 [1~${count}] 次`)
    for (const code of inviteCodes) {
        // 至少邀请 10 个
        const randomCount = parseInt(`${Math.random() * count + 10}`)
        const wallet = HDWallet.generate()
        for (let i = 0; i < randomCount; i++) {
            const child = wallet.derive(i);
            const inviteAddress = child.address;
            try {
                const invited = await invite(inviteAddress, code)
                if (invited) {
                // 跳出，使用下一个邀请码，出现失败的情况可能是因为邀请码使用次数达到上限
                    break
                }
                // 适当的等待
                await sleepRandom()
                // 邀请的帐号签到
                await registerAndCheckIn(inviteAddress, child.key)
            } catch (e) {
                console.error(`${nowDateTimeString()} ${code} 邀请 ${inviteAddress} 失败`, e)
            }
        }
    }
    console.log(`${nowDateTimeString()} 邀请任务完成`)
}

/**
 * 注册并签到
 * @param address 地址
 * @param key 私钥(base58编码)
 */
async function registerAndCheckIn(address: string, key: string, inviteCode?: string): Promise<boolean> {
    const isRegister = await superiors(address)
    if (!isRegister) {
        const registered = await invite(address, inviteCode || getRandomInviteCode())
        if (!registered) {
            return false
        }
        await sleepRandom()
    }
    let secretKey = ethers.decodeBase58(key).toString(16)
    // base65 decode 得到的 bigint 转 byte array 长度可能小于 128
    if (secretKey.length != 128) {
        secretKey = Array.from({ length: 128 - secretKey.length }).map(() => '0').join('') + secretKey
    }
    const keypair = Keypair.fromSecretKey(Buffer.from(secretKey, 'hex'))
    const timestamp = Math.floor(Date.now() / 1000)
    // 签名的内容为 `sign in${timestamp}`
    const signed = nacl.sign.detached(Buffer.from(`sign in${timestamp}`), keypair.secretKey)
    try {
        const res = await checkIn(address, Buffer.from(signed).toString('hex'), timestamp)
        return res
    } catch (e) {
        console.error(`${nowDateTimeString()} ${address} 签到失败`, e)
        return false
    }
}

/**
 * 邀请码邀请的帐号签到任务
 * 会生成一个 json 文件，格式为 { ${inviteCode}: ${mnemonic} }，记录了邀请码和对应邀请的助记词
 * 后续每天都会通过邀请码来找到对应的助记词，进行签到。如果 config.toml 中没有配置邀请码则不会签到！
 */
async function inviteAccountCheckInTask() {
    const inviteCodes: string[] = config.invite.codes;
    const subAccounts = data as Record<string, string>
    let updated = false
    for (const code of inviteCodes) {
        let mnemonic = subAccounts[code]
        if (!mnemonic) {
            updated = true
            mnemonic = bip39.generateMnemonic()
            subAccounts[code] = mnemonic
        }
        const wallet = new HDWallet(mnemonic)
        let checkInFailedCount = 0
        // 邀请码对应的钱包每天有 500 个签到，如果签到失败 10 次则跳过当前邀请码
        for (let i = 0; i < 10 && checkInFailedCount < 10; i++) {
            const child = wallet.derive(i);
            const address = child.address;
            try {
                // 邀请的帐号签到
                const res = await registerAndCheckIn(address, child.key, code)
                if (!res) {
                    checkInFailedCount++
                }
            } catch (e) {
                console.error(`${nowDateTimeString()} ${code} 邀请的 ${address} 签到失败`, e)
            }
        }
    }
    if (updated) {
        try {
            await Bun.write('sollong/data.json', JSON.stringify(subAccounts))
            console.log(`${nowDateTimeString()} 保存邀请码对应助记词到 [sollong/data.json] 成功`)
        } catch (e) {
            console.error(`${nowDateTimeString()} 保存邀请码对应助记词到 [sollong/data.json] 失败，请从日志拷贝更新到文件中`, e)
            console.log(JSON.stringify(subAccounts))
        }
    }
    console.log(`${nowDateTimeString()} 邀请码邀请账号签到任务完成`)

}

/**
 * 签到任务
 */
async function checkInTask() {
    const wallet = new HDWallet(config.wallet.mnemonic);
    const count = config.wallet.count;
    console.log(`${nowDateTimeString()} 开始签到任务，共 ${count} 个地址`)
    let success = 0;
    for (let i = 0; i < count; i++) {
        const child = wallet.derive(i);
        const ok = await registerAndCheckIn(child.address, child.key)
        if (ok) {
            success++;
        }
        await sleepRandom()
    }
    console.log(`${nowDateTimeString()} 签到任务完成 ${success}/${count} 个地址`)
}


async function main() {
    while (true) {
        inviteTask()
        checkInTask()
        inviteAccountCheckInTask()
        let hour = new Date().getHours();
        // 17 点前签到
        const delay = (hour > 17 ? 12 : 24) * 3600 * 1000;
        console.log(`${nowDateTimeString()} next task will start after ${delay} ms`);
        await Bun.sleep(delay);
        hour = new Date().getHours();
    }
}

// 签到和刷邀请
main()
