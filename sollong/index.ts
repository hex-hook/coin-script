import { Keypair } from '@solana/web3.js'
import { ethers } from 'ethers';
import nacl from 'tweetnacl';
import { HDWallet } from '../util/solana'
import config from './config.toml'
import { sleepRandom } from '../util/time';

const URL_PREFIX = "https://api.v-token.io/api/points";

/**
 * 判断当前地址是否已经注册
 * @param address 地址
 * @returns 
 */
async function superiors(address: string): Promise<boolean> {
    const resp = await fetch(`${URL_PREFIX}/superiors?address=${address}`);
    const json = await resp.json();
    return json.code == 200
}

/**
 * 查询当前积分信息
 * @param address 地址
 * @returns 
 */
async function home(address: string) {
    const resp = await fetch(`${URL_PREFIX}/home?address=${address}`);
    const json = await resp.json();
    if (json.code != 200) {
        throw new Error(json.msg)
    }
    return {
        address,
        // 邀请码
        inviteCode: json.data.referrals_code,
        // 总积分
        totalPoints: json.data.earnings,
        // 签到积分
        checkInPoints: json.data.broadband_points,
        // 邀请积分
        invitePoints: json.data.invite_points
    }
}

/**
 * 邀请
 * 一个 200 分，一天最多 200 分?
 * @param address 地址
 * @param inviteCode 邀请码
 * @returns 
 */
async function invite(address: string, inviteCode: string): Promise<boolean> {
    const body = JSON.stringify({
        address,
        invite_code: inviteCode
    })
    const resp = await fetch(`${URL_PREFIX}/invite`, {
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/json'
        }
    });
    const json = await resp.json();
    return json.code == 200
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
    return json.code == 200
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

async function inviteTask() {
    const inviteCodes = config.invite.codes;
    const count = config.invite.count;
    console.log(`开始刷邀请次数，共 [${inviteCodes.length}] 个邀请码，每个邀请码 [1~${count}] 次`)
    for (const code of inviteCodes) {
        const randomCount = parseInt(`${Math.random() * count + 1}`)
        for (let i = 0; i < randomCount; i++) {
            const inviteAddress = Keypair.generate().publicKey.toBase58()
            try {
                const invited = await invite(inviteAddress, code)
                if (invited) {
                    console.log(`${code} 邀请 ${inviteAddress} 成功`)
                } else {
                    console.error(`${code} 邀请 ${inviteAddress} 失败`)
                }
                // 适当的等待
                await sleepRandom()
            } catch (e) {
                console.error(`${code} 邀请 ${inviteAddress} 失败`, e)
            }

        }
    }

}

/**
 * 注册并签到
 * @param address 地址
 * @param key 私钥(base58编码)
 */
async function registerAndCheckIn(address: string, key: string) {
    const isRegister = await superiors(address)
    if (!isRegister) {
        const registered = await invite(address, getRandomInviteCode())
        if (!registered) {
            console.error(`${address} 注册失败`)
            return
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
        if (res) {
            console.log(`${address} 签到成功`)
        } else {
            console.error(`${address} 签到失败`)
        }
    } catch (e) {
        console.error(`${address} 签到失败`, e)
    }
}

/**
 * 签到任务
 */
async function checkInTask() {
    const wallet = new HDWallet(config.wallet.mnemonic);
    const count = config.wallet.count;
    for (let i = 0; i < count; i++) {
        const child = wallet.derive(i);
        await registerAndCheckIn(child.address, child.key)
        await sleepRandom()
    }
}


/**
 * 批量查询积分 (通过配置文件中的助记词)
 */
async function queryPoints() {
    const wallet = new HDWallet(config.wallet.mnemonic);
    const count = config.wallet.count;
    let res = await Promise.all(Array.from({ length: count }).map((_, i) => {
        const child = wallet.derive(i);
        try {
            return home(child.address)
        } catch (e) {
            console.error(`查询 ${child.address} 积分失败`, e)
            return Promise.resolve(null)
        }
    }))
    res = res.filter(x => x != null)
    console.table(res)
    console.log(`添加助记词到配置文件中，可刷邀请积分，${res.map(item => "'"+item?.inviteCode+"'").join(',')}`)
}


async function main() {
    while (true) {
        inviteTask()
        checkInTask()
        let hour = new Date().getHours();
        // 17 点前签到
        const delay = (hour > 17 ? 12 : 24) * 3600 * 1000;
        console.log(`next task will start after ${delay} ms`);
        await Bun.sleep(delay);
        hour = new Date().getHours();
    }
}

// 签到和刷邀请
main()

// 批量查看积分
// queryPoints()