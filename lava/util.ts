import { ethers } from "ethers";
import config from './config.toml'

interface UserInfo {
    // rpc id
    id: string
    // 钱包地址
    address: string
    // 积分
    points?: number
    // 排名
    rank?: number
}

/**
 * 
 * @param address 钱包地址
 * @param inviteCode 邀请码
 * @param process token 或者 verify，以 token 的方式获取到的 data 会用于签名，verify 后才能获得 rpc id
 * @param token 签名后的信息
 * @param cookie cookie 用于登录后的接口调用
 * @returns 
 */
async function login(address: string, inviteCode: string, process: 'token' | 'verify', token?: string, cookie?: string): Promise<string[]> {
    const resp = await fetch('https://points-api.lavanet.xyz/accounts/metamask/login/', {
        method: 'POST',
        body: JSON.stringify({
            account: address.toLocaleLowerCase(),
            invite_code: inviteCode,
            process,
            login_token: token,
        }),
        headers: {
            Cookie: cookie,
        }
    })
    const res = await resp.json();
    const newCookie = resp.headers.getSetCookie() || [];
    if (res.success) {
        return [res.data, newCookie.join(';')]
    }
    throw new Error(`${address} login failed: ${res}`)
}

/**
 * 生成 lava id
 * @param wallet 钱包
 * @returns
 */
async function generateRPC(wallet: ethers.Wallet | ethers.HDNodeWallet): Promise<[UserInfo, string]> {
    const inviteCode = config.lava.inviteCode;
    const loginResult = await login(wallet.address, inviteCode, 'token');
    // 这里会进行一次签名，签名参数为 lava login 返回的 data，存在一定安全风险
    const signed = await wallet.signMessage(Buffer.from(loginResult[0]));
    const [id, cookie] = (await login(wallet.address, inviteCode, 'verify', signed));
    return [{
        id,
        address: wallet.address,
    }, cookie]
}


/**
 * 调用 lava 接口生成 rpc 节点 id
 * 这一步建议在本地生成，助记词需要记录下来
 * @param count 生成数量，默认 10 串行调用，耗时较长
 */
async function generateRPCs(count: number = 10) {
    const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(32))
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
    console.log(`wallet mnemonic: ${wallet.mnemonic?.phrase}`)
    const res = []
    // 循环生成 rpc id，单个 HD 、单次循环不建议过多
    for (let i = 0; i < count; i++) {
        const child = wallet.deriveChild(i);
        try {
            const item = await generateRPC(child);
            res.push(item[0]);
        } catch (e) {
            console.error(e);
        }
    }
    if (res.length > 0) {
        console.table(res);
    } else {
        console.error('generate rpc failed')
    }
}


/**
 * 查询积分信息
 * @param wallet 钱包
 * @returns 
 */
async function queryMe(wallet: ethers.Wallet | ethers.HDNodeWallet): Promise<UserInfo>{
    const [info, cookie] = await generateRPC(wallet);
    const resp = await fetch('https://points-api.lavanet.xyz/api/v1/users/me', {
        headers: {
            Cookie: cookie,
        }
    })
    const res = await resp.json();
    const stats = res.stats
    info.points = stats.points.total_points;
    info.rank = stats.rank;
    return info
}


/**
 * 通过助记词查询积分信息
 * @param mnemonic 助记词，格式 "word1 word2 word3 ..."
 * @param count 派生的钱包数量，派生方式见 generateRPCs
 */
async function queryMeByMnemonic(mnemonic: string, count: number) {
    const res = []
    const rootWallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
    for (let i = 0; i < count; i++) {
        try {
            const wallet = rootWallet.deriveChild(i);
            const item = await queryMe(wallet);
            res.push(item)
        } catch (e) {
            console.error(e);
        }
    }
    if (res.length > 0) {
        console.table(res);
    } else {
        console.error('query failed')
    }
}


/**
 * 通过私钥查询积分信息
 * @param keys 私钥数组 ["0x...", "0x..."]
 */
async function queryMeByKeys(keys: string[]) {
    const res = []
    for (const key of keys) {
        try {
            const wallet = new ethers.Wallet(key);
            const item = await queryMe(wallet);
            res.push(item)
        } catch (e) {
            console.error(e);
        }
    }
    if (res.length > 0) {
        console.table(res);
    } else {
        console.error('query failed')
    }
}

/**
 * 主函数，按需将下面执行的代码注释去掉(删除行首的 //)
 */
function main() {
    // 生成 rpc id，日志中的助记词需要记录下来，仅用于生成 rpc id
    // generateRPCs();


    // 通过助记词查询积分信息，比上面的方法多调一个接口
    // queryMeByMnemonic('word1 word2 word3 ...', 10);


    // 通过私钥查询积分信息，比上面的方法多调一个接口
    // queryMeByKeys(['0x...', '0x...']);
}

main()