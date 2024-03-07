import { ethers } from "ethers";
import config from './config.toml'

/**
 * 
 * @param address 钱包地址
 * @param inviteCode 邀请码
 * @param process token 或者 verify，以 token 的方式获取到的 data 会用于签名，verify 后才能获得 rpc id
 * @param token 签名后的信息
 * @returns 
 */
async function login(address: string, inviteCode: string, process: 'token'|'verify', token?: string): Promise<string> {
    return fetch('https://points-api.lavanet.xyz/accounts/metamask/login/', {
        method: 'POST',
        body: JSON.stringify({
            account: address.toLocaleLowerCase(),
            invite_code: inviteCode,
            process,
            login_token: token,
        })
    })
    .then(resp => resp.json())
    .then(res => {
        if (res.success) {
            return res.data
        }
        throw new Error('login failed')
    })
}

/**
 * 生成 lava id
 * @param wallet 钱包
 */
async function generateRPC(wallet: ethers.HDNodeWallet) {
    const inviteCode = config.lava.inviteCode;
    const loginResult = await login(wallet.address, inviteCode, 'token');
    const signed = await wallet.signMessage(Buffer.from(loginResult));
    const id = await login(wallet.address, inviteCode, 'verify', signed);
    return {
        id,
        address: wallet.address,
        path: wallet.path,
    }
}


/**
 * 调用 lava 接口生成 rpc 节点 id
 * 这一步建议在本地生成，助记词需要记录下来
 */
async function generateRPCs() {
    const mnemonic = ethers.Mnemonic.entropyToPhrase(ethers.randomBytes(32))
    const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
    console.log(`wallet mnemonic: ${wallet.mnemonic?.phrase}`)
    const res = []
    // 循环生成 rpc id，单个 HD 、单次循环不建议过多
    for (let i = 0; i < 10; i++) {
        const child = wallet.deriveChild(i);
        try {
            const item = await generateRPC(child);
            res.push(item);
        } catch(e) {
            console.error(e);
        }
    }
    console.table(res);
}

generateRPCs();